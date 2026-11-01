import React, { useState, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { 
    Settings, Bell, User, Key, Save, Trash2, Plus, Library, Edit, 
    MessageCircle, MessageSquare, ShieldCheck, GraduationCap, Clock, Hash, Activity, Database
} from 'lucide-react';

const SettingsPage: React.FC = () => {
    const { 
        appSettings, saveAppSetting, loading, 
        masterKelas, addMasterKelas, deleteMasterKelas,
        globalMarhalahs, globalWaktuHalaqah, globalJenisHalaqah, globalAttendanceStatus, globalPredikatNilai,
        orgName: initialOrgName, orgLogo: initialOrgLogo, updateOrganization
    , masterMarhalahs, masterKelasRelasi, addMasterMarhalah, updateMasterMarhalah, deleteMasterMarhalah, addMasterKelasRelasi, updateMasterKelasRelasi, deleteMasterKelasRelasi } = useSupabaseData();
    
    // Notifikasi states
    
    const [orgName, setOrgName] = useState('');
    const [isAddingMarhalah, setIsAddingMarhalah] = useState(false);
    const [newMarhalahName, setNewMarhalahName] = useState('');
    const [editingMarhalahId, setEditingMarhalahId] = useState<string | null>(null);
    const [editMarhalahName, setEditMarhalahName] = useState('');

    const [isAddingKelas, setIsAddingKelas] = useState(false);
    const [newKelasName, setNewKelasName] = useState('');
    const [newKelasMarhalahId, setNewKelasMarhalahId] = useState<string | null>(null);
    const [editingKelasId, setEditingKelasId] = useState<string | null>(null);
    const [editKelasName, setEditKelasName] = useState('');
    const [editKelasMarhalahId, setEditKelasMarhalahId] = useState<string | null>(null);

    const handleAddMarhalah = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newMarhalahName.trim()) return;
        setIsSaving(true);
        try {
            await addMasterMarhalah(newMarhalahName);
            setNewMarhalahName('');
            setIsAddingMarhalah(false);
        } catch (error) {
            alert('Gagal menambah marhalah');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateMarhalah = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!editingMarhalahId || !editMarhalahName.trim()) return;
        setIsSaving(true);
        try {
            await updateMasterMarhalah(editingMarhalahId, editMarhalahName);
            setEditingMarhalahId(null);
            setEditMarhalahName('');
        } catch (error) {
            alert('Gagal mengupdate marhalah: ' + (error?.message || error));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMarhalah = async (id: string) => {
        if(!confirm('Yakin ingin menghapus marhalah ini? Semua kelas di bawahnya mungkin terdampak.')) return;
        setIsSaving(true);
        try {
            await deleteMasterMarhalah(id);
        } catch (error) {
            alert('Gagal menghapus marhalah. Pastikan tidak ada data yang terikat.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddKelas = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newKelasName.trim() || !newKelasMarhalahId) return;
        setIsSaving(true);
        try {
            await addMasterKelasRelasi(newKelasMarhalahId, newKelasName);
            setNewKelasName('');
            setIsAddingKelas(false);
        } catch (error) {
            alert('Gagal menambah kelas');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateKelas = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!editingKelasId || !editKelasName.trim() || !editKelasMarhalahId) return;
        setIsSaving(true);
        try {
            await updateMasterKelasRelasi(editingKelasId, editKelasMarhalahId, editKelasName);
            setEditingKelasId(null);
            setEditKelasName('');
        } catch (error) {
            alert('Gagal mengupdate kelas: ' + (error?.message || error));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteKelas = async (id: string) => {
        if(!confirm('Yakin ingin menghapus kelas ini?')) return;
        setIsSaving(true);
        try {
            await deleteMasterKelasRelasi(id);
        } catch (error) {
            alert('Gagal menghapus kelas.');
        } finally {
            setIsSaving(false);
        }
    };

    const [orgLogo, setOrgLogo] = useState('');

    const [telegramBotToken, setTelegramBotToken] = useState('');
    const [telegramBotUsername, setTelegramBotUsername] = useState('');
    const [telegramGlobalChatId, setTelegramGlobalChatId] = useState('');
    const [fonnteApiToken, setFonnteApiToken] = useState('');
    const [enableTelegram, setEnableTelegram] = useState(false);
    const [enableWa, setEnableWa] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Master Kelas states
    const [newMarhalah, setNewMarhalah] = useState('');
    const [newKelas, setNewKelas] = useState('');
    

    // Data Referensi states
    const [newRefMarhalah, setNewRefMarhalah] = useState('');
    const [newRefWaktu, setNewRefWaktu] = useState('');
    const [newRefJenis, setNewRefJenis] = useState('');
    const [newRefStatus, setNewRefStatus] = useState('');
    const [newPredikatLabel, setNewPredikatLabel] = useState('');
    const [newPredikatMinScore, setNewPredikatMinScore] = useState('');

    useEffect(() => {
        if (!loading) {
            
            setOrgName(initialOrgName || '');
            setOrgLogo(initialOrgLogo || '');

            const token = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value || '';
            const botUsername = appSettings.find(s => s.key === 'TELEGRAM_BOT_USERNAME')?.value || '';
            const chatId = appSettings.find(s => s.key === 'TELEGRAM_GLOBAL_CHAT_ID')?.value || '';
            const fToken = appSettings.find(s => s.key === 'FONNTE_API_TOKEN')?.value || '';
            const eTelegram = appSettings.find(s => s.key === 'ENABLE_TELEGRAM_NOTIFICATION')?.value === 'true';
            const eWa = appSettings.find(s => s.key === 'ENABLE_WA_NOTIFICATION')?.value === 'true';
            
            setTelegramBotToken(token);
            setTelegramBotUsername(botUsername);
            setTelegramGlobalChatId(chatId);
            setFonnteApiToken(fToken);
            setEnableTelegram(eTelegram);
            setEnableWa(eWa);
        }
    }, [appSettings, loading, initialOrgName, initialOrgLogo]);

    
    const handleSaveLembaga = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await updateOrganization(orgName, orgLogo);
            alert('Data Lembaga berhasil disimpan.');
            // Dispatch a custom event to update Sidebar
            window.dispatchEvent(new CustomEvent('organization_updated', {
                detail: { name: orgName, logo: orgLogo }
            }));
        } catch (e: any) {
            console.error(e);
            alert('Gagal menyimpan: ' + (e.message || JSON.stringify(e)));
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveNotifikasi = async () => {
        setIsSaving(true);
        try {
            await saveAppSetting('TELEGRAM_BOT_TOKEN', telegramBotToken);
            await saveAppSetting('TELEGRAM_BOT_USERNAME', telegramBotUsername);
            await saveAppSetting('TELEGRAM_GLOBAL_CHAT_ID', telegramGlobalChatId);
            await saveAppSetting('FONNTE_API_TOKEN', fonnteApiToken);
            await saveAppSetting('ENABLE_TELEGRAM_NOTIFICATION', enableTelegram.toString());
            await saveAppSetting('ENABLE_WA_NOTIFICATION', enableWa.toString());
            alert('Pengaturan Notifikasi berhasil disimpan.');
        } catch (e: any) {
            alert('Gagal menyimpan: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddMasterKelas = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMarhalah || !newKelas) {
            alert('Harap isi Marhalah dan Nama Kelas');
            return;
        }
        setIsSaving(true);
        try {
            await addMasterKelas(newMarhalah, newKelas);
            setNewMarhalah('');
            setNewKelas('');
            setIsAddingKelas(false);
        } catch (e: any) {
            alert('Gagal menambah kelas: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMasterKelas = async (id: number, namaKelas: string) => {
        if (confirm(`Hapus kelas ${namaKelas}? (Ini tidak akan menghapus data santri, tapi kelas mungkin tidak muncul di dropdown).`)) {
            try {
                await deleteMasterKelas(id);
            } catch (e: any) {
                alert('Gagal menghapus: ' + e.message);
            }
        }
    };

    const handleSaveReference = async (key: string, arr: string[], newValue: string, setter: (val: string) => void) => {
        if (!newValue.trim()) return;
        if (arr.includes(newValue.trim())) {
            alert('Data sudah ada.');
            return;
        }
        setIsSaving(true);
        try {
            const updated = [...arr, newValue.trim()];
            await saveAppSetting(key, JSON.stringify(updated));
            setter('');
        } catch (e: any) {
            alert('Gagal menyimpan: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReference = async (key: string, arr: string[], valueToDelete: string) => {
        if (confirm(`Hapus data referensi "${valueToDelete}"?`)) {
            try {
                const updated = arr.filter(v => v !== valueToDelete);
                await saveAppSetting(key, JSON.stringify(updated));
            } catch (e: any) {
                alert('Gagal menghapus: ' + e.message);
            }
        }
    };

    const handleSavePredikat = async () => {
        if (!newPredikatLabel.trim() || !newPredikatMinScore) return;
        if (globalPredikatNilai.some(p => p.label === newPredikatLabel.trim())) {
            alert('Predikat sudah ada.');
            return;
        }
        setIsSaving(true);
        try {
            const updated = [...globalPredikatNilai, { label: newPredikatLabel.trim(), minScore: Number(newPredikatMinScore) }];
            updated.sort((a, b) => b.minScore - a.minScore);
            await saveAppSetting('GLOBAL_PREDIKAT_NILAI', JSON.stringify(updated));
            setNewPredikatLabel('');
            setNewPredikatMinScore('');
        } catch (e: any) {
            alert('Gagal menyimpan: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePredikat = async (labelToDelete: string) => {
        if (confirm(`Hapus predikat "${labelToDelete}"?`)) {
            try {
                const updated = globalPredikatNilai.filter(v => v.label !== labelToDelete);
                await saveAppSetting('GLOBAL_PREDIKAT_NILAI', JSON.stringify(updated));
            } catch (e: any) {
                alert('Gagal menghapus: ' + e.message);
            }
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center p-12 text-slate-500">
            <div className="animate-spin mr-3 h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            Memuat pengaturan...
        </div>
    );

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="border-b border-slate-200 pb-5">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
                    Konfigurasi Sistem
                </h1>
                <p className="text-sm text-slate-500">
                    Kelola profil institusi, data master, dan pengaturan notifikasi aplikasi.
                </p>
            </div>

            {/* Data Lembaga Section */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-base font-bold text-slate-800">Data Lembaga (Pesantren / Ma'had)</h2>
                    <p className="text-xs text-slate-500 mt-1">Konfigurasi identitas lembaga yang akan muncul pada dokumen cetak.</p>
                </div>
                <div className="p-6">
                    <form onSubmit={handleSaveLembaga} className="max-w-2xl">
                        <div className="flex items-start gap-6 mb-5">
                            <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 mt-7 relative group">
                                {orgLogo ? (
                                    <img 
                                        src={orgLogo} 
                                        alt="Logo" 
                                        className="w-full h-full object-contain p-2" 
                                        onError={(e) => { 
                                            e.currentTarget.style.display = 'none'; 
                                            if (e.currentTarget.nextElementSibling) {
                                                e.currentTarget.nextElementSibling.classList.remove('hidden');
                                            }
                                        }} 
                                    />
                                ) : null}
                                <span className={`text-slate-400 text-xs text-center px-2 ${orgLogo ? 'hidden' : ''}`}>No Logo</span>
                            </div>
                            <div className="flex-1 space-y-5">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Nama Lembaga (Ma'had)</label>
                            <input 
                                type="text" 
                                value={orgName} 
                                onChange={e => setOrgName(e.target.value)}
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-800 shadow-sm"
                                placeholder="Contoh: Ma'had Al Faruq Assalafy litahfidzil quran Purwakerta"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">Logo URL</label>
                            <input 
                                type="text" 
                                value={orgLogo} 
                                onChange={e => setOrgLogo(e.target.value)}
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-800 shadow-sm"
                                placeholder="https://example.com/logo.png"
                            />
                        </div>
                            </div>
                        </div>
                        <div className="pt-2">
                            <button 
                                type="submit" 
                                disabled={isSaving}
                                className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-sm transition-all focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 flex items-center gap-2 text-sm"
                            >
                                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </button>
                        </div>
                    </form>
                </div>
            </section>

            {/* Master Marhalah & Kelas Section */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Master Marhalah */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-base font-bold text-slate-800">Master Marhalah</h2>
                            <p className="text-xs text-slate-500 mt-1">Kelola data marhalah utama</p>
                        </div>
                        {!isAddingMarhalah && (
                            <button 
                                onClick={() => setIsAddingMarhalah(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0"
                            >
                                <Plus size={14}/> Tambah Marhalah
                            </button>
                        )}
                    </div>
                    
                    {isAddingMarhalah && (
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <form onSubmit={handleAddMarhalah} className="flex gap-2">
                                <input type="text" value={newMarhalahName} onChange={e => setNewMarhalahName(e.target.value)} placeholder="Nama Marhalah" className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" required/>
                                <button type="submit" disabled={isSaving} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">Simpan</button>
                                <button type="button" onClick={() => setIsAddingMarhalah(false)} className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50">Batal</button>
                            </form>
                        </div>
                    )}

                    <div className="overflow-y-auto flex-1 max-h-[400px]">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-white border-b border-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="px-5 py-3">ID</th>
                                    <th className="px-5 py-3">Nama Marhalah</th>
                                    <th className="px-5 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {masterMarhalahs?.map((m: any) => (
                                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3 font-mono text-xs text-slate-400">#{m.id}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800">
                                            {editingMarhalahId === m.id ? (
                                                <form onSubmit={handleUpdateMarhalah} className="flex gap-2">
                                                    <input type="text" value={editMarhalahName} onChange={e => setEditMarhalahName(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 w-full" autoFocus required/>
                                                    <button type="submit" className="text-blue-600 hover:text-blue-800 p-1"><Save size={14}/></button>
                                                    <button type="button" onClick={() => setEditingMarhalahId(null)} className="text-slate-400 hover:text-slate-600 p-1"><Trash2 size={14} className="opacity-0"/> Batal</button>
                                                </form>
                                            ) : m.nama}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {editingMarhalahId !== m.id && (
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => {setEditingMarhalahId(m.id); setEditMarhalahName(m.nama);}} className="text-slate-400 hover:text-blue-600 p-1.5 rounded transition-colors"><Edit size={14} /></button>
                                                    <button onClick={() => handleDeleteMarhalah(m.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"><Trash2 size={14} /></button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {(!masterMarhalahs || masterMarhalahs.length === 0) && (
                                    <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-500 text-sm">Belum ada data.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Master Kelas */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-base font-bold text-slate-800">Master Kelas</h2>
                            <p className="text-xs text-slate-500 mt-1">Kelola kelas per marhalah</p>
                        </div>
                        {!isAddingKelas && (
                            <button 
                                onClick={() => {
                                    setIsAddingKelas(true);
                                    if(masterMarhalahs && masterMarhalahs.length > 0) setNewKelasMarhalahId(masterMarhalahs[0].id);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0"
                            >
                                <Plus size={14}/> Tambah Kelas
                            </button>
                        )}
                    </div>
                    
                    {isAddingKelas && (
                        <div className="p-4 border-b border-slate-100 bg-slate-50">
                            <form onSubmit={handleAddKelas} className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <select value={newKelasMarhalahId || ''} onChange={e => setNewKelasMarhalahId(e.target.value)} className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" required>
                                        <option value="">Pilih Marhalah</option>
                                        {masterMarhalahs?.map((m: any) => <option key={m.id} value={m.id}>{m.nama}</option>)}
                                    </select>
                                    <input type="text" value={newKelasName} onChange={e => setNewKelasName(e.target.value)} placeholder="Nama Kelas (cth: 1A)" className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" required/>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button type="submit" disabled={isSaving} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">Simpan</button>
                                    <button type="button" onClick={() => setIsAddingKelas(false)} className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50">Batal</button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="overflow-y-auto flex-1 max-h-[400px]">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-white border-b border-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0">
                                <tr>
                                    <th className="px-5 py-3">ID</th>
                                    <th className="px-5 py-3">Marhalah</th>
                                    <th className="px-5 py-3">Nama Kelas</th>
                                    <th className="px-5 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {masterKelasRelasi?.map((mk: any) => (
                                    <tr key={mk.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3 font-mono text-xs text-slate-400">#{mk.id}</td>
                                        <td className="px-5 py-3 font-medium text-slate-600">
                                            {editingKelasId === mk.id ? (
                                                <select value={editKelasMarhalahId || ''} onChange={e => setEditKelasMarhalahId(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 w-full" required>
                                                    {masterMarhalahs?.map((m: any) => <option key={m.id} value={m.id}>{m.nama}</option>)}
                                                </select>
                                            ) : (
                                                masterMarhalahs?.find((m: any) => m.id === mk.marhalah_id)?.nama || 'Unknown'
                                            )}
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-slate-800">
                                            {editingKelasId === mk.id ? (
                                                <form onSubmit={handleUpdateKelas} id={`form-kelas-${mk.id}`} className="flex gap-2">
                                                    <input type="text" value={editKelasName} onChange={e => setEditKelasName(e.target.value)} className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 w-full" autoFocus required/>
                                                </form>
                                            ) : mk.nama_kelas}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {editingKelasId === mk.id ? (
                                                <div className="flex justify-end gap-1">
                                                    <button key="save-kelas" type="submit" form={`form-kelas-${mk.id}`} className="text-blue-600 hover:text-blue-800 p-1"><Save size={14}/></button>
                                                    <button key="cancel-kelas" type="button" onClick={() => setEditingKelasId(null)} className="text-slate-400 hover:text-slate-600 p-1">Batal</button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-1">
                                                    <button key="edit-kelas" type="button" onClick={() => {
                                                        setEditingKelasId(mk.id); 
                                                        setEditKelasName(mk.nama_kelas);
                                                        setEditKelasMarhalahId(mk.marhalah_id);
                                                    }} className="text-slate-400 hover:text-blue-600 p-1.5 rounded transition-colors"><Edit size={14} /></button>
                                                    <button onClick={() => handleDeleteKelas(mk.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"><Trash2 size={14} /></button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {(!masterKelasRelasi || masterKelasRelasi.length === 0) && (
                                    <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500 text-sm">Belum ada data.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

                <section className="mt-6 space-y-6">
<div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <h2 className="text-base font-bold text-slate-800">Data Predikat Nilai Global</h2>
                        <p className="text-xs text-slate-500 mt-1">Atur predikat (MUMTAZ, JAYYID, dll) beserta batas nilai minimumnya.</p>
                    </div>
                    <div className="p-6">
                        <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <input type="text" value={newPredikatLabel} onChange={e => setNewPredikatLabel(e.target.value)} placeholder="Label Predikat (ex: MUMTAZ JIDDAN)" className="flex-1 px-4 py-2 text-sm border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm bg-white" />
                            <input type="number" value={newPredikatMinScore} onChange={e => setNewPredikatMinScore(e.target.value)} placeholder="Skor Minimum (ex: 95)" className="w-full sm:w-48 px-4 py-2 text-sm border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm bg-white" />
                            <button onClick={handleSavePredikat} disabled={!newPredikatLabel || !newPredikatMinScore || isSaving} className="bg-slate-800 text-white w-10 h-10 flex items-center justify-center rounded-lg shadow-sm hover:bg-slate-900 transition-all disabled:opacity-50 shrink-0">
                                <Plus size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {globalPredikatNilai.map((p, index) => (
                                <div key={index} className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:border-slate-300 transition-colors">
                                    <div>
                                        <div className="font-bold text-slate-800 text-sm">{p.label}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">Min: {p.minScore}</div>
                                    </div>
                                    <button onClick={() => handleDeletePredikat(p.label)} className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Referensi Data Dasar Section */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-base font-bold text-slate-800">Referensi Data Dasar</h2>
                    <p className="text-xs text-slate-500 mt-1">Kelola opsi data yang akan muncul pada dropdown di seluruh sistem.</p>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Marhalah */}
                    

                    {/* Waktu Halaqah */}
                    <div className="border border-slate-200 rounded-lg flex flex-col h-[280px]">
                        <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                            <h3 className="font-bold text-slate-800 text-sm">Waktu Halaqah</h3>
                        </div>
                        <div className="p-3 flex gap-2 border-b border-slate-100">
                            <input type="text" value={newRefWaktu} onChange={e => setNewRefWaktu(e.target.value)} placeholder="Tambah baru..." className="flex-1 text-sm border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 px-3 py-1.5 shadow-sm" />
                            <button onClick={() => handleSaveReference('GLOBAL_WAKTU_HALAQAH', globalWaktuHalaqah, newRefWaktu, setNewRefWaktu)} disabled={!newRefWaktu || isSaving} className="bg-slate-800 hover:bg-slate-900 text-white w-9 flex items-center justify-center rounded-md disabled:opacity-50 transition-colors shrink-0"><Plus size={18} strokeWidth={2.5} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <ul className="divide-y divide-slate-100">
                                {globalWaktuHalaqah.map(m => (
                                    <li key={m} className="px-2 py-2 text-sm flex justify-between items-center group rounded hover:bg-slate-50">
                                        <span className="font-medium text-slate-700">{m}</span>
                                        <button onClick={() => handleDeleteReference('GLOBAL_WAKTU_HALAQAH', globalWaktuHalaqah, m)} className="text-slate-400 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-all"><Trash2 size={14}/></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Jenis Halaqah */}
                    <div className="border border-slate-200 rounded-lg flex flex-col h-[280px]">
                        <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                            <h3 className="font-bold text-slate-800 text-sm">Jenis Halaqah</h3>
                        </div>
                        <div className="p-3 flex gap-2 border-b border-slate-100">
                            <input type="text" value={newRefJenis} onChange={e => setNewRefJenis(e.target.value)} placeholder="Tambah baru..." className="flex-1 text-sm border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 px-3 py-1.5 shadow-sm" />
                            <button onClick={() => handleSaveReference('GLOBAL_JENIS_HALAQAH', globalJenisHalaqah, newRefJenis, setNewRefJenis)} disabled={!newRefJenis || isSaving} className="bg-slate-800 hover:bg-slate-900 text-white w-9 flex items-center justify-center rounded-md disabled:opacity-50 transition-colors shrink-0"><Plus size={18} strokeWidth={2.5} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <ul className="divide-y divide-slate-100">
                                {globalJenisHalaqah.map(m => (
                                    <li key={m} className="px-2 py-2 text-sm flex justify-between items-center group rounded hover:bg-slate-50">
                                        <span className="font-medium text-slate-700">{m}</span>
                                        <button onClick={() => handleDeleteReference('GLOBAL_JENIS_HALAQAH', globalJenisHalaqah, m)} className="text-slate-400 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-all"><Trash2 size={14}/></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Status Kehadiran */}
                    <div className="border border-slate-200 rounded-lg flex flex-col h-[280px]">
                        <div className="p-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                            <h3 className="font-bold text-slate-800 text-sm">Status Kehadiran</h3>
                        </div>
                        <div className="p-3 flex gap-2 border-b border-slate-100">
                            <input type="text" value={newRefStatus} onChange={e => setNewRefStatus(e.target.value)} placeholder="Tambah baru..." className="flex-1 text-sm border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 px-3 py-1.5 shadow-sm" />
                            <button onClick={() => handleSaveReference('GLOBAL_ATTENDANCE_STATUS', globalAttendanceStatus, newRefStatus, setNewRefStatus)} disabled={!newRefStatus || isSaving} className="bg-slate-800 hover:bg-slate-900 text-white w-9 flex items-center justify-center rounded-md disabled:opacity-50 transition-colors shrink-0"><Plus size={18} strokeWidth={2.5} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <ul className="divide-y divide-slate-100">
                                {globalAttendanceStatus?.map(m => (
                                    <li key={m} className="px-2 py-2 text-sm flex justify-between items-center group rounded hover:bg-slate-50">
                                        <span className="font-medium text-slate-700">{m}</span>
                                        <button onClick={() => handleDeleteReference('GLOBAL_ATTENDANCE_STATUS', globalAttendanceStatus, m)} className="text-slate-400 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-all"><Trash2 size={14}/></button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* API & Notifikasi Section */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                        <h2 className="text-base font-bold text-slate-800">API & Notifikasi</h2>
                        <p className="text-xs text-slate-500 mt-1">Konfigurasi token API pihak ketiga untuk layanan pengiriman pesan.</p>
                    </div>
                    <button 
                        onClick={handleSaveNotifikasi}
                        disabled={isSaving}
                        className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-sm transition-all focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 flex items-center gap-2 text-sm shrink-0"
                    >
                        {isSaving ? 'Menyimpan...' : 'Simpan Notifikasi'}
                    </button>
                </div>
                <div className="p-6">
                    <div className="space-y-8 max-w-2xl">
                        {/* Telegram Settings */}
                        <div className="space-y-4">
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">Telegram Bot</h3>
                                <p className="text-xs text-slate-500">Pengaturan untuk mengirim notifikasi ke Telegram.</p>
                            </div>
                            <div className="grid gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Bot Token</label>
                                    <input type="text" value={telegramBotToken} onChange={e => setTelegramBotToken(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium" placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..." />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Bot Username</label>
                                        <input type="text" value={telegramBotUsername} onChange={e => setTelegramBotUsername(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium" placeholder="Contoh: @MahadBot" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Global Group Chat ID</label>
                                        <input type="text" value={telegramGlobalChatId} onChange={e => setTelegramGlobalChatId(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium" placeholder="Contoh: -100123456789" />
                                    </div>
                                </div>
                                <label className="flex items-center gap-3 cursor-pointer mt-1">
                                    <input type="checkbox" checked={enableTelegram} onChange={e => setEnableTelegram(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer" />
                                    <div>
                                        <span className="text-sm font-bold text-slate-800">Aktifkan Notifikasi Telegram</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <hr className="border-slate-100" />

                        {/* WhatsApp Settings */}
                        <div className="space-y-4">
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">WhatsApp (Fonnte)</h3>
                                <p className="text-xs text-slate-500">Pengaturan API Fonnte untuk WhatsApp.</p>
                            </div>
                            <div className="grid gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">API Token</label>
                                    <input type="text" value={fonnteApiToken} onChange={e => setFonnteApiToken(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium" placeholder="Token API Fonnte..." />
                                </div>
                                <label className="flex items-center gap-3 cursor-pointer mt-1">
                                    <input type="checkbox" checked={enableWa} onChange={e => setEnableWa(e.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer" />
                                    <div>
                                        <span className="text-sm font-bold text-slate-800">Aktifkan Notifikasi WhatsApp</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
export default SettingsPage;
