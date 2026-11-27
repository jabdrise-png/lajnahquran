import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { NotificationStore } from '../lib/NotificationStore';
import { ConfirmDialog, LoadingState, PageHeader } from '../components/ui/SaaSPrimitives';
import { Trash2, Plus, Image as ImageIcon, ArrowLeft } from 'lucide-react';

interface GalleryImage {
    id: number;
    image_url: string;
    title: string;
    description: string;
}

const AdminGalleryPage: React.FC = () => {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

    // Form state
    const [imageUrl, setImageUrl] = useState('');
    const [previewError, setPreviewError] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        fetchImages();
    }, []);

    const fetchImages = async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase.from('landing_images' as any) as any)
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                // If table doesn't exist yet, just ignore and show empty
                if (error.code !== '42P01') {
                    console.error("Error fetching images:", error);
                }
                setImages([]);
            } else {
                setImages(data || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddImage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!imageUrl) {
            NotificationStore.addNotification("URL Gambar wajib diisi", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await (supabase.from('landing_images' as any) as any)
                .insert([{ image_url: imageUrl, title, description }]);
            
            if (error) {
                if (error.code === '42P01') {
                    NotificationStore.addNotification("Tabel 'landing_images' belum dibuat di Supabase. Silakan jalankan SQL yang diberikan.", "error");
                } else {
                    throw error;
                }
            } else {
                NotificationStore.addNotification("Gambar berhasil ditambahkan!", "success");
                setImageUrl('');
                setTitle('');
                setDescription('');
                fetchImages();
            }
        } catch (e: any) {
            console.error("Error adding image:", e);
            NotificationStore.addNotification("Gagal menambahkan gambar: " + e.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (id: number) => {
        setDeleteTargetId(id);
    };

    const executeDelete = async () => {
        if (deleteTargetId === null) return;
        const id = deleteTargetId;
        setDeleteTargetId(null);
        try {
            const { error } = await (supabase.from('landing_images' as any) as any)
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            NotificationStore.addNotification("Gambar berhasil dihapus.", "success");
            fetchImages();
        } catch (e: any) {
            console.error("Error deleting image:", e);
            NotificationStore.addNotification("Gagal menghapus gambar: " + e.message, "error");
        }
    };

    return (
        <div className="space-y-5 pb-12">
            <PageHeader
                title="Galeri Landing Page"
                description="Kelola gambar galeri yang tampil di halaman depan."
                actions={
                    <button
                        type="button"
                        onClick={() => window.location.href = '/'}
                        className="btn btn-secondary btn-sm"
                    >
                        <ArrowLeft size={15} /> Kembali
                    </button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Form Section */}
                <div className="lg:col-span-1">
                    <div className="card p-5 sticky top-6">
                        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Plus size={18} className="text-blue-600" /> Tambah Gambar
                        </h2>
                        <form onSubmit={handleAddImage} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">URL Gambar *</label>
                                <input 
                                    type="url" 
                                    required
                                    placeholder="https://contoh.com/gambar.jpg"
                                    className="field"
                                    value={imageUrl}
                                    onChange={(e) => { setImageUrl(e.target.value); setPreviewError(false); }}
                                />
                                {imageUrl && (
                                    <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 h-32 bg-slate-100 flex items-center justify-center">
                                        {previewError ? (
                                            <span className="text-xs text-slate-500 px-3 text-center">URL gambar tidak dapat dimuat</span>
                                        ) : (
                                            <img src={imageUrl} alt="Pratinjau" className="w-full h-full object-cover" onError={() => setPreviewError(true)} />
                                        )}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Judul (Opsional)</label>
                                <input 
                                    type="text" 
                                    placeholder="Kegiatan Santri"
                                    className="field"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Deskripsi Singkat (Opsional)</label>
                                <textarea 
                                    placeholder="Deskripsi kegiatan..."
                                    rows={3}
                                    className="field !h-auto py-2 resize-none"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                ></textarea>
                            </div>
                            <button 
                                type="submit"
                                disabled={isSubmitting}
                                className="btn btn-primary w-full"
                            >
                                {isSubmitting ? 'Menyimpan...' : 'Simpan Gambar'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Gallery List */}
                <div className="lg:col-span-2">
                    <div className="card p-5 min-h-[420px]">
                        <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                            <ImageIcon size={18} className="text-blue-600" /> Daftar Gambar Galeri
                        </h2>

                        {loading ? (
                            <LoadingState label="Memuat gambar galeri…" />
                        ) : images.length === 0 ? (
                            <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                <ImageIcon size={40} className="mx-auto mb-3 opacity-30" />
                                <p className="text-sm">Belum ada gambar yang ditambahkan.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {images.map((img) => (
                                    <div key={img.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-white transition-all">
                                        <div className="aspect-video bg-slate-100">
                                            <img src={img.image_url} alt={img.title || 'Gambar Galeri'} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="p-4">
                                            <h3 className="font-bold text-sm text-slate-800 truncate">{img.title || 'Tanpa Judul'}</h3>
                                            <p className="text-xs text-slate-500 line-clamp-2 mt-1">{img.description || 'Tidak ada deskripsi'}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(img.id)}
                                            className="absolute top-2 right-2 p-2 bg-white/90 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 border border-slate-200/80"
                                            title="Hapus Gambar"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <ConfirmDialog
                isOpen={deleteTargetId !== null}
                title="Hapus Gambar Galeri"
                description="Apakah Anda yakin ingin menghapus gambar ini dari galeri Landing Page?"
                confirmLabel="Hapus Gambar"
                tone="danger"
                onConfirm={executeDelete}
                onCancel={() => setDeleteTargetId(null)}
            />
        </div>
    );
};

export default AdminGalleryPage;
