import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
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

    // Form state
    const [imageUrl, setImageUrl] = useState('');
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
        if (!imageUrl) return alert("URL Gambar wajib diisi");

        setIsSubmitting(true);
        try {
            const { error } = await (supabase.from('landing_images' as any) as any)
                .insert([{ image_url: imageUrl, title, description }]);
            
            if (error) {
                if (error.code === '42P01') {
                    alert("Tabel 'landing_images' belum dibuat di Supabase. Silakan jalankan SQL yang diberikan.");
                } else {
                    throw error;
                }
            } else {
                alert("Gambar berhasil ditambahkan!");
                setImageUrl('');
                setTitle('');
                setDescription('');
                fetchImages();
            }
        } catch (e: any) {
            console.error("Error adding image:", e);
            alert("Gagal menambahkan gambar: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Yakin ingin menghapus gambar ini?")) return;
        
        try {
            const { error } = await (supabase.from('landing_images' as any) as any)
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            fetchImages();
        } catch (e: any) {
            console.error("Error deleting image:", e);
            alert("Gagal menghapus gambar: " + e.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-12">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <button 
                        onClick={() => window.location.href = '/'}
                        className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100 transition-colors"
                    >
                        <ArrowLeft size={20} className="text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Admin Landing Page</h1>
                        <p className="text-slate-500">Kelola gambar galeri untuk Landing Page</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Form Section */}
                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-6">
                            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Plus size={20} className="text-blue-600" /> Tambah Gambar
                            </h2>
                            <form onSubmit={handleAddImage} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">URL Gambar *</label>
                                    <input 
                                        type="url" 
                                        required
                                        placeholder="https://contoh.com/gambar.jpg"
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={imageUrl}
                                        onChange={(e) => setImageUrl(e.target.value)}
                                    />
                                    {imageUrl && (
                                        <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 h-32 bg-slate-100">
                                            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400x200?text=Invalid+Image+URL')} />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Judul (Opsional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="Kegiatan Santri"
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi Singkat (Opsional)</label>
                                    <textarea 
                                        placeholder="Deskripsi kegiatan..."
                                        rows={3}
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    ></textarea>
                                </div>
                                <button 
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Menyimpan...' : 'Simpan Gambar'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Gallery List */}
                    <div className="lg:col-span-2">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[500px]">
                            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <ImageIcon size={20} className="text-blue-600" /> Daftar Gambar Galeri
                            </h2>

                            {loading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                            ) : images.length === 0 ? (
                                <div className="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>Belum ada gambar yang ditambahkan.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {images.map((img) => (
                                        <div key={img.id} className="group relative rounded-xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all">
                                            <div className="aspect-video bg-slate-100">
                                                <img src={img.image_url} alt={img.title || 'Gallery Image'} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="p-4">
                                                <h3 className="font-bold text-slate-800 truncate">{img.title || 'Tanpa Judul'}</h3>
                                                <p className="text-sm text-slate-500 line-clamp-2 mt-1">{img.description || 'Tidak ada deskripsi'}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleDelete(img.id)}
                                                className="absolute top-2 right-2 p-2 bg-white/90 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                                title="Hapus Gambar"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminGalleryPage;
