import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { Plus, Edit, Trash, Pin, MessageSquare, X } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { id } from 'date-fns/locale';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { 
    AppUpdateRelease, 
    AppUpdateItem,
    getStoredUpdates, 
    saveStoredUpdates, 
    syncUpdatesFromCloud, 
    markUpdatesAsRead, 
    hasUnreadUpdates 
} from '../lib/appUpdates';
import { sanitizeHtml } from '../lib/utils';

// Define Interface locally to avoid complex generic issues in some environments
interface Informasi {
    id: number;
    organization_id: string;
    created_at: string;
    title: string;
    content: string;
    author_email: string | null;
    author_name?: string;
    is_pinned: boolean;
}

interface InformasiProps {
    userRole?: string;
}

const defaultReleaseItem = (): AppUpdateItem => ({
    category: 'Fitur Baru',
    title: '',
    description: ''
});

const Informasi: React.FC<InformasiProps> = ({ userRole }) => {
    const isSuperAdmin = userRole === 'super_admin';
    const canManagePengumuman = userRole === 'super_admin' || userRole === 'admin' || userRole === 'admin_mahad';
    const [activeTab, setActiveTab] = useState<'pengumuman' | 'pembaruan'>('pengumuman');
    const [informasiList, setInformasiList] = useState<Informasi[]>([]);
    const [releases, setReleases] = useState<AppUpdateRelease[]>(getStoredUpdates());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasUnread, setHasUnread] = useState(false);
    
    // Modal state for Pengumuman
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingInformasi, setEditingInformasi] = useState<Informasi | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        is_pinned: false,
    });

    // Modal state for Pembaruan Aplikasi (Changelog Editor)
    const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
    const [isSavingRelease, setIsSavingRelease] = useState(false);
    const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
    const [releaseFormData, setReleaseFormData] = useState<{
        version: string;
        releaseDate: string;
        title: string;
        summary: string;
        isLatest: boolean;
        items: AppUpdateItem[];
    }>({
        version: '',
        releaseDate: '',
        title: '',
        summary: '',
        isLatest: true,
        items: [defaultReleaseItem()]
    });

    useEffect(() => {
        // Check if navigated specifically to view updates
        try {
            const requestedTab = localStorage.getItem('informasi_active_tab');
            if (requestedTab === 'pembaruan') {
                setActiveTab('pembaruan');
                localStorage.removeItem('informasi_active_tab');
                markUpdatesAsRead();
            }
        } catch {}

        setHasUnread(hasUnreadUpdates());
        setReleases(getStoredUpdates());

        syncUpdatesFromCloud().then(cloudReleases => {
            if (cloudReleases && cloudReleases.length > 0) {
                setReleases(cloudReleases);
            }
        });

        const handleUpdateChange = () => {
            setHasUnread(hasUnreadUpdates());
            setReleases(getStoredUpdates());
        };
        window.addEventListener('app_updates_changed', handleUpdateChange);
        return () => window.removeEventListener('app_updates_changed', handleUpdateChange);
    }, []);

    const fetchInformasi = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            let orgId: string | null = null;
            if (user) {
                const { data: myProfile } = await supabase
                    .from('profiles')
                    .select('organization_id')
                    .eq('id', user.id)
                    .maybeSingle();
                orgId = myProfile?.organization_id || null;
            }

            let infoQuery = supabase
                .from('informasi')
                .select('*')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (orgId) {
                infoQuery = infoQuery.eq('organization_id', orgId);
            }

            const { data, error } = await infoQuery;
            
            if (error) throw error;
            let profilesQuery = supabase.from('profiles').select('email, full_name');
            if (orgId) {
                profilesQuery = profilesQuery.eq('organization_id', orgId);
            }
            const { data: profiles } = await profilesQuery;
            const enrichedData = (data as Informasi[] || []).map((info: any) => {
                const profile = profiles?.find((p: any) => p.email === info.author_email);
                return {
                    ...info,
                    author_name: profile?.full_name || info.author_email
                };
            });
            setInformasiList(enrichedData);
        } catch (err: any) {
            setError(err.message);
            console.error("Error fetching information:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInformasi();
    }, [fetchInformasi]);
    
    // --- PENGUMUMAN ACTIONS ---
    const openModal = (informasi: Informasi | null) => {
        if (!canManagePengumuman) return;
        setEditingInformasi(informasi);
        if (informasi) {
            setFormData({
                title: informasi.title,
                content: informasi.content,
                is_pinned: informasi.is_pinned,
            });
        } else {
            setFormData({ title: '', content: '', is_pinned: false });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingInformasi(null);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async () => {
        if (!canManagePengumuman) {
            alert("Akses ditolak: Hanya Admin yang dapat membuat atau mengedit pengumuman.");
            return;
        }
        const sanitizedContent = sanitizeHtml(formData.content);
        if (!formData.title.trim() || !sanitizedContent.trim()) {
            alert("Judul dan Konten tidak boleh kosong.");
            return;
        }
        setIsSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated.");

            // Fetch Organization ID for current user
            const { data: profile } = await supabase
                .from('profiles')
                .select('organization_id')
                .eq('id', user.id)
                .single();
            
            if (!profile || !profile.organization_id) throw new Error("Organization ID not found for user.");

            if (editingInformasi) {
                // Update
                const { error } = await supabase
                    .from('informasi')
                    .update({ ...formData, content: sanitizedContent })
                    .eq('organization_id', profile.organization_id)
                    .eq('id', editingInformasi.id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('informasi')
                    .insert({ 
                        ...formData, 
                        content: sanitizedContent,
                        author_email: user.email,
                        organization_id: profile.organization_id
                    });
                if (error) throw error;
            }
            await fetchInformasi();
            closeModal();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async (id: number) => {
        if (!canManagePengumuman) {
            alert("Akses ditolak: Hanya Admin yang dapat menghapus informasi.");
            return;
        }
        if (window.confirm("Apakah Anda yakin ingin menghapus informasi ini?")) {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const { data: profile } = user
                    ? await supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle()
                    : { data: null };
                let delQuery = supabase.from('informasi').delete().eq('id', id);
                if (profile?.organization_id) {
                    delQuery = delQuery.eq('organization_id', profile.organization_id);
                }
                const { error } = await delQuery;
                if (error) throw error;
                await fetchInformasi();
            } catch (err: any) {
                alert(`Error: ${err.message}`);
            }
        }
    };

    // --- PEMBARUAN SISTEM ACTIONS ---
    const openReleaseModal = (release: AppUpdateRelease | null) => {
        if (!isSuperAdmin) return;
        if (release) {
            setEditingReleaseId(release.id);
            setReleaseFormData({
                version: release.version,
                releaseDate: release.releaseDate,
                title: release.title,
                summary: release.summary,
                isLatest: !!release.isLatest,
                items: release.items && release.items.length > 0 
                    ? release.items.map(it => ({ ...it })) 
                    : [defaultReleaseItem()]
            });
        } else {
            setEditingReleaseId(null);
            const todayFormatted = format(new Date(), 'd MMMM yyyy', { locale: id });
            setReleaseFormData({
                version: '',
                releaseDate: todayFormatted,
                title: '',
                summary: '',
                isLatest: true,
                items: [defaultReleaseItem()]
            });
        }
        setIsReleaseModalOpen(true);
    };

    const closeReleaseModal = () => {
        setIsReleaseModalOpen(false);
        setEditingReleaseId(null);
    };

    const handleReleaseItemChange = (index: number, field: keyof AppUpdateItem, value: string) => {
        setReleaseFormData(prev => {
            const nextItems = [...prev.items];
            nextItems[index] = { ...nextItems[index], [field]: value };
            return { ...prev, items: nextItems };
        });
    };

    const handleAddReleaseItem = () => {
        setReleaseFormData(prev => ({
            ...prev,
            items: [...prev.items, defaultReleaseItem()]
        }));
    };

    const handleRemoveReleaseItem = (index: number) => {
        setReleaseFormData(prev => {
            if (prev.items.length <= 1) return prev;
            return {
                ...prev,
                items: prev.items.filter((_, i) => i !== index)
            };
        });
    };

    const handleSaveRelease = async () => {
        if (!isSuperAdmin) {
            alert("Akses ditolak: Hanya Super Admin yang dapat mengelola catatan pembaruan.");
            return;
        }

        if (!releaseFormData.version.trim()) {
            alert("Nomor versi tidak boleh kosong (contoh: v2.5.0).");
            return;
        }
        if (!releaseFormData.title.trim()) {
            alert("Judul pembaruan tidak boleh kosong.");
            return;
        }
        if (!releaseFormData.summary.trim()) {
            alert("Ringkasan pembaruan tidak boleh kosong.");
            return;
        }

        const validItems = releaseFormData.items
            .map(it => ({
                category: it.category || 'Fitur Baru',
                title: it.title.trim(),
                description: it.description.trim()
            }))
            .filter(it => it.title.length > 0);

        if (validItems.length === 0) {
            alert("Harap masukkan setidaknya satu poin perubahan.");
            return;
        }

        setIsSavingRelease(true);
        try {
            let currentList = [...releases];

            if (editingReleaseId) {
                // Update existing
                currentList = currentList.map(r => {
                    if (r.id === editingReleaseId) {
                        return {
                            ...r,
                            version: releaseFormData.version.trim(),
                            releaseDate: releaseFormData.releaseDate.trim() || r.releaseDate,
                            title: releaseFormData.title.trim(),
                            summary: releaseFormData.summary.trim(),
                            isLatest: releaseFormData.isLatest,
                            items: validItems
                        };
                    }
                    if (releaseFormData.isLatest) {
                        return { ...r, isLatest: false };
                    }
                    return r;
                });
            } else {
                // Create new release
                const newId = `update-${Date.now()}`;
                const newRelease: AppUpdateRelease = {
                    id: newId,
                    version: releaseFormData.version.trim(),
                    releaseDate: releaseFormData.releaseDate.trim() || format(new Date(), 'd MMMM yyyy', { locale: id }),
                    title: releaseFormData.title.trim(),
                    summary: releaseFormData.summary.trim(),
                    isLatest: releaseFormData.isLatest,
                    items: validItems
                };

                if (releaseFormData.isLatest) {
                    currentList = currentList.map(r => ({ ...r, isLatest: false }));
                }
                currentList = [newRelease, ...currentList];
            }

            await saveStoredUpdates(currentList);
            setReleases(currentList);
            closeReleaseModal();
        } catch (err: any) {
            alert(`Gagal menyimpan catatan pembaruan: ${err.message}`);
        } finally {
            setIsSavingRelease(false);
        }
    };

    const handleDeleteRelease = async (releaseId: string) => {
        if (!isSuperAdmin) {
            alert("Akses ditolak: Hanya Super Admin yang dapat menghapus catatan pembaruan.");
            return;
        }

        if (window.confirm("Apakah Anda yakin ingin menghapus catatan rilis ini?")) {
            try {
                const nextList = releases.filter(r => r.id !== releaseId);
                // Ensure at least one latest if list is not empty
                if (nextList.length > 0 && !nextList.some(r => r.isLatest)) {
                    nextList[0].isLatest = true;
                }
                await saveStoredUpdates(nextList);
                setReleases(nextList);
            } catch (err: any) {
                alert(`Gagal menghapus: ${err.message}`);
            }
        }
    };

    const handleSelectTab = (tab: 'pengumuman' | 'pembaruan') => {
        setActiveTab(tab);
        if (tab === 'pembaruan') {
            markUpdatesAsRead();
            setHasUnread(false);
        }
    };

    const renderPengumumanContent = () => {
        if (loading) {
            return <div className="text-center p-8 text-slate-500 text-sm">Memuat informasi...</div>;
        }
        if (error) {
            return <div className="text-center p-8 text-red-600 text-sm">Error: {error}</div>;
        }
        if (informasiList.length === 0) {
            return (
                <div className="text-center py-16 px-6 border-2 border-dashed border-slate-300 rounded-xl bg-white">
                    <MessageSquare className="mx-auto h-12 w-12 text-slate-400" />
                    <h3 className="mt-2 text-lg font-medium text-slate-800">Belum Ada Informasi</h3>
                        <p className="mt-1 text-sm text-slate-500">
                        {canManagePengumuman 
                            ? "Klik tombol di atas untuk membuat informasi pengumuman baru." 
                            : "Saat ini belum ada pengumuman yang dipublikasikan."}
                    </p>
                </div>
            );
        }
        return (
            <div className="space-y-6">
                {informasiList.map(info => (
                    <Card key={info.id} className={`transition-all duration-300 ${info.is_pinned ? 'border-blue-500 shadow-md' : ''}`}>
                         <div className="flex justify-between items-start -mt-6 -mx-6 mb-4 px-6 py-4 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                                    {info.is_pinned && <Pin size={16} className="mr-2 text-blue-600" />}
                                    {info.title}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Diposting oleh {info.author_name} • {formatDistanceToNow(new Date(info.created_at), { addSuffix: true })}
                                </p>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                {canManagePengumuman && (
                                  <>
                                    <button 
                                        type="button"
                                        onClick={() => openModal(info)} 
                                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-full transition-colors" 
                                        title="Edit Informasi"
                                    >
                                        <Edit size={16}/>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => handleDelete(info.id)} 
                                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" 
                                        title="Hapus Informasi"
                                    >
                                        <Trash size={16}/>
                                    </button>
                                  </>
                                )}
                            </div>
                        </div>
                        <div className="text-slate-600 prose prose-slate max-w-none prose-sm sm:prose-base prose-img:rounded-xl prose-img:shadow-md mt-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(info.content) }} />
                    </Card>
                ))}
            </div>
        );
    };

    const renderPembaruanContent = () => {
        return (
            <div className="space-y-6">
                {releases.map((release: AppUpdateRelease) => {
                    const groupedCategories = Array.from(new Set((release.items || []).map(item => item.category)));

                    return (
                        <div 
                            key={release.id} 
                            className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-7 shadow-sm transition-shadow hover:shadow-md relative"
                        >
                            {/* Header Rilis (Zero-Pill Typography) */}
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-slate-100 pb-4">
                                <div>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 tracking-wide">
                                        <span className="text-slate-900 font-bold text-sm sm:text-base">{release.version}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{release.releaseDate}</span>
                                        {release.isLatest && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <span className="text-emerald-700 flex items-center gap-1.5 font-medium">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Rilis Terkini
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-2">
                                        {release.title}
                                    </h2>
                                </div>

                                {/* Action Buttons for Super Admin Only */}
                                {isSuperAdmin && (
                                    <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => openReleaseModal(release)}
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit Catatan Rilis"
                                            aria-label="Edit Catatan Rilis"
                                        >
                                            <Edit size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRelease(release.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Hapus Catatan Rilis"
                                            aria-label="Hapus Catatan Rilis"
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Ringkasan Rilis */}
                            <p className="text-sm text-slate-600 mt-3.5 leading-relaxed">
                                {release.summary}
                            </p>

                            {/* Daftar Perubahan Terstruktur */}
                            {release.items && release.items.length > 0 && (
                                <div className="mt-6 pt-5 border-t border-slate-100 space-y-6">
                                    {groupedCategories.map(cat => {
                                        const itemsInCat = release.items.filter(i => i.category === cat);
                                        return (
                                            <div key={cat} className="space-y-3">
                                                <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">
                                                    {cat}
                                                </h3>
                                                <ul className="space-y-2.5">
                                                    {itemsInCat.map((item, idx) => (
                                                        <li key={idx} className="flex items-start text-sm">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 mr-3 shrink-0"></span>
                                                            <div>
                                                                <strong className="font-semibold text-slate-800">
                                                                    {item.title}:
                                                                </strong>{' '}
                                                                <span className="text-slate-600 leading-relaxed">
                                                                    {item.description}
                                                                </span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header Halaman & Segmented Tabs */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Pusat Informasi</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Informasi pengumuman kegiatan ma'had serta riwayat pembaruan sistem aplikasi.
                    </p>
                </div>

                {/* Admin can add announcements; Super Admin can add releases */}
                {(activeTab === 'pengumuman' ? canManagePengumuman : isSuperAdmin) && (
                    <div>
                        {activeTab === 'pengumuman' ? (
                            <button 
                                type="button"
                                onClick={() => openModal(null)} 
                                className="bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center justify-center text-sm shadow-sm"
                            >
                                <Plus size={16} className="mr-2" /> Buat Informasi Baru
                            </button>
                        ) : (
                            <button 
                                type="button"
                                onClick={() => openReleaseModal(null)} 
                                className="bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center justify-center text-sm shadow-sm"
                            >
                                <Plus size={16} className="mr-2" /> Tambah Catatan Rilis
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Segmented Control Tabs (Clean & Anti-slop) */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit border border-slate-200/60">
                <button
                    type="button"
                    onClick={() => handleSelectTab('pengumuman')}
                    className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                        activeTab === 'pengumuman'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    Pengumuman Ma'had
                </button>
                <button
                    type="button"
                    onClick={() => handleSelectTab('pembaruan')}
                    className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                        activeTab === 'pembaruan'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <span>Pembaruan Aplikasi</span>
                    {hasUnread && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Pembaruan Baru"></span>
                    )}
                </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'pengumuman' ? renderPengumumanContent() : renderPembaruanContent()}

            {/* MODAL 1: Buat/Edit Pengumuman (Super Admin Only) */}
            {isSuperAdmin && (
                <Modal isOpen={isModalOpen} onClose={closeModal} title={editingInformasi ? 'Edit Informasi' : 'Buat Informasi Baru'}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="title" className="block text-sm font-medium text-slate-700">Judul</label>
                            <input 
                                type="text" 
                                name="title" 
                                id="title" 
                                value={formData.title} 
                                onChange={handleFormChange} 
                                placeholder="Masukkan judul pengumuman..."
                                className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                            />
                        </div>
                        <div>
                            <label htmlFor="content" className="block text-sm font-medium text-slate-700">Konten</label>
                            
                            <ReactQuill 
                                theme="snow" 
                                value={formData.content} 
                                onChange={(content) => setFormData(prev => ({ ...prev, content }))} 
                                className="mt-1 bg-white"
                                modules={{
                                    toolbar: [
                                        [{ 'header': [1, 2, 3, false] }],
                                        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                                        [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
                                        ['link', 'image', 'video'],
                                        ['clean']
                                    ]
                                }}
                            />
                        </div>
                        <div className="flex items-center">
                            <input 
                                type="checkbox" 
                                name="is_pinned" 
                                id="is_pinned" 
                                checked={formData.is_pinned} 
                                onChange={handleFormChange} 
                                className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" 
                            />
                            <label htmlFor="is_pinned" className="ml-2 block text-sm text-slate-900">
                                Sematkan informasi ini (selalu di atas)
                            </label>
                        </div>
                        <div className="pt-4 flex justify-end space-x-2">
                            <button 
                                type="button" 
                                onClick={closeModal} 
                                className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Batal
                            </button>
                            <button 
                                type="button" 
                                onClick={handleSubmit} 
                                disabled={isSubmitting} 
                                className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400"
                            >
                                {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* MODAL 2: Buat/Edit Catatan Pembaruan Rilis (Super Admin Only) */}
            {isSuperAdmin && (
                <Modal 
                    isOpen={isReleaseModalOpen} 
                    onClose={closeReleaseModal} 
                    title={editingReleaseId ? 'Edit Catatan Pembaruan' : 'Tambah Catatan Pembaruan Baru'}
                >
                    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Nomor Versi <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    value={releaseFormData.version} 
                                    onChange={(e) => setReleaseFormData(prev => ({ ...prev, version: e.target.value }))}
                                    placeholder="Contoh: v2.5.0"
                                    className="block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Tanggal Rilis <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    value={releaseFormData.releaseDate} 
                                    onChange={(e) => setReleaseFormData(prev => ({ ...prev, releaseDate: e.target.value }))}
                                    placeholder="Contoh: 10 Oktober 2026"
                                    className="block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Judul Pembaruan <span className="text-red-500">*</span>
                            </label>
                            <input 
                                type="text" 
                                value={releaseFormData.title} 
                                onChange={(e) => setReleaseFormData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Contoh: Otomatisasi Absensi & Penyempurnaan Cetak"
                                className="block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Ringkasan Singkat (Muncul di bar sematan atas & kartu) <span className="text-red-500">*</span>
                            </label>
                            <textarea 
                                rows={2}
                                value={releaseFormData.summary} 
                                onChange={(e) => setReleaseFormData(prev => ({ ...prev, summary: e.target.value }))}
                                placeholder="Jelaskan secara ringkas perubahan utama pada versi ini..."
                                className="block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-center gap-2 pt-1 pb-2">
                            <input 
                                type="checkbox" 
                                id="is_latest_release" 
                                checked={releaseFormData.isLatest} 
                                onChange={(e) => setReleaseFormData(prev => ({ ...prev, isLatest: e.target.checked }))}
                                className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="is_latest_release" className="text-xs sm:text-sm text-slate-800 font-medium">
                                Jadikan rilis terkini (tampil di bar notifikasi sematan di bagian atas aplikasi)
                            </label>
                        </div>

                        {/* POIN-POIN PERUBAHAN */}
                        <div className="pt-3 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold tracking-wider uppercase text-slate-600">
                                    Poin-Poin Perubahan ({releaseFormData.items.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={handleAddReleaseItem}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center"
                                >
                                    <Plus size={14} className="mr-1" /> Tambah Poin
                                </button>
                            </div>

                            <div className="space-y-3">
                                {releaseFormData.items.map((item, idx) => (
                                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 relative">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex-1 sm:max-w-xs">
                                                <select
                                                    value={item.category}
                                                    onChange={(e) => handleReleaseItemChange(idx, 'category', e.target.value as any)}
                                                    className="w-full text-xs font-medium border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-700 focus:ring-blue-500 focus:border-blue-500"
                                                >
                                                    <option value="Fitur Baru">Fitur Baru</option>
                                                    <option value="Peningkatan">Peningkatan</option>
                                                    <option value="Perbaikan">Perbaikan</option>
                                                </select>
                                            </div>
                                            {releaseFormData.items.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveReleaseItem(idx)}
                                                    className="text-slate-400 hover:text-red-500 p-1 rounded"
                                                    title="Hapus poin ini"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>

                                        <input
                                            type="text"
                                            value={item.title}
                                            onChange={(e) => handleReleaseItemChange(idx, 'title', e.target.value)}
                                            placeholder="Judul poin (contoh: Auto-Load Absensi Harian)"
                                            className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-800 font-medium focus:ring-blue-500 focus:border-blue-500"
                                        />

                                        <textarea
                                            rows={2}
                                            value={item.description}
                                            onChange={(e) => handleReleaseItemChange(idx, 'description', e.target.value)}
                                            placeholder="Deskripsi penjelasan perubahan..."
                                            className="w-full text-xs border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-600 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                            <button 
                                type="button" 
                                onClick={closeReleaseModal} 
                                className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                            >
                                Batal
                            </button>
                            <button 
                                type="button" 
                                onClick={handleSaveRelease} 
                                disabled={isSavingRelease} 
                                className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:bg-slate-400"
                            >
                                {isSavingRelease ? 'Menyimpan...' : 'Simpan Catatan Rilis'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Informasi;
