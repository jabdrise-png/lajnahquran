
import React, { useState, useEffect, useRef, useMemo } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { Marhalah, WaliKelas } from '../../types';
import { Plus, Trash, Download, Edit, Upload, FileSpreadsheet, FileText, Search, ChevronRight } from 'lucide-react';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabaseClient';

const WaliKelasPage: React.FC = () => {
    const { getOrgId, selectedAcademicYear, masterKelas , globalMarhalahs, fetchData , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    const [waliList, setWaliList] = useState<WaliKelas[]>([]);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;

    const [authProfiles, setAuthProfiles] = useState<any[]>([]);

    useEffect(() => {
        const fetchAuthProfiles = async () => {
            const orgId = await getOrgId();
            if (!orgId) return;
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('organization_id', orgId)
                .eq('role', 'pengajar');
            if (data) setAuthProfiles(data);
        };
        fetchAuthProfiles();
    }, [getOrgId]);

    // Account Creation Modal State
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [accountData, setAccountData] = useState({
        email: '',
        password: '',
        full_name: '',
        wali_id: ''
    });
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);

    const openAccountModal = (w: any | null = null) => {
        setAccountData({
            email: '',
            password: '',
            full_name: w ? w.nama : '',
            wali_id: w ? w.id.toString() : ''
        });
        setIsAccountModalOpen(true);
    };

    const handleCreateAccount = async () => {
        if (!accountData.email || !accountData.password || !accountData.full_name) {
            alert('Semua field akun wajb diisi.');
            return;
        }

        const orgId = await getOrgId();
        if(!orgId) return;

        setIsCreatingAccount(true);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            
            
            const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
                auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'temp-auth-key-' + Math.random().toString(36).substring(7) }
            });

            const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                email: accountData.email,
                password: accountData.password,
                options: {
                    data: {
                        full_name: accountData.full_name,
                        target_organization_id: orgId,
                        role: 'pengajar'
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Gagal membuat user auth.");

            // Tunggu sebentar untuk trigger Supabase
            await new Promise(res => setTimeout(res, 1500));

            const { error: profileError } = await supabase
                .from('profiles')
                .update({ role: 'pengajar' })
                .eq('id', authData.user.id)
                .eq('organization_id', orgId);
            
            if (profileError) {
                console.error("Gagal update role profil", profileError);
            }

            if (accountData.wali_id) {
                const { error: waliError } = await (supabase as any)
                    .from('wali_kelas')
                    .update({ user_id: authData.user.id })
                    .eq('id', parseInt(accountData.wali_id))
                    .eq('organization_id', orgId);
                if (waliError) throw waliError;
            }

            alert("Akun Pengajar berhasil dibuat!");
            setIsAccountModalOpen(false);
            
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('organization_id', orgId)
                .eq('role', 'pengajar');
            if (data) setAuthProfiles(data);
            await fetchWali();
            
        } catch (e: any) {
            console.error(e);
            alert("Gagal membuat akun: " + e.message);
        } finally {
            setIsCreatingAccount(false);
        }
    };

    
    // Filters
    const [filterMarhalah, setFilterMarhalah] = useState<string | 'all'>('all');
    const [filterKelas, setFilterKelas] = useState<string | 'all'>('all');
    const [search, setSearch] = useState('');

    // Form
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWali, setEditingWali] = useState<WaliKelas | null>(null);
    const [formData, setFormData] = useState({
        nama: '', marhalah: '' as string, kelas: '', no_hp: '', user_id: '' as string | null
    });

    // Custom Kelas State
    const [isCustomKelas, setIsCustomKelas] = useState(false);
    const [customKelas, setCustomKelas] = useState('');

    const fetchWali = async () => {
        if (!selectedAcademicYear) return;
        setLoading(true);
        const orgId = await getOrgId();
        if (!orgId) {
            setLoading(false);
            return;
        }
        const { data } = await (supabase.from('wali_kelas') as any).select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id);
        if (data) setWaliList(data as unknown as WaliKelas[]);
        setLoading(false);
    };

    useEffect(() => { fetchWali(); }, [selectedAcademicYear]);

    // Derived Data
    const availableFilterKelas = useMemo(() => {
        if (filterMarhalah === 'all') return [];
        return masterKelas.filter(m => m.marhalah === filterMarhalah).map(m => m.nama_kelas);
    }, [filterMarhalah, masterKelas]);

    const availableFormKelas = useMemo(() => {
        if (!formData.marhalah) return [];
        return masterKelas.filter(m => m.marhalah === formData.marhalah).map(m => m.nama_kelas);
    }, [formData.marhalah, masterKelas]);

    const filteredData = useMemo(() => {
        return waliList.filter(w => {
            if (filterMarhalah !== 'all' && w.marhalah !== filterMarhalah) return false;
            if (filterKelas !== 'all' && w.kelas !== filterKelas) return false;
            if (search && !w.nama.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }).sort((a, b) => {
            const marhalahOrder = globalMarhalahs;
            const mIdxA = marhalahOrder.indexOf(a.marhalah);
            const mIdxB = marhalahOrder.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;
            if (a.kelas !== b.kelas) return (a.kelas || '').localeCompare(b.kelas || '', undefined, { numeric: true });
            return (a.nama || '').localeCompare(b.nama || '');
        });
    }, [waliList, filterMarhalah, filterKelas, search, globalMarhalahs]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    const openModal = (wali: WaliKelas | null) => {
        setEditingWali(wali);
        setIsCustomKelas(false);
        setCustomKelas('');
        
        if (wali) {
            const predefinedClasses = masterKelas.filter(m => m.marhalah === wali.marhalah).map(m => m.nama_kelas);
            if (!predefinedClasses.includes(wali.kelas)) {
                setIsCustomKelas(true);
                setCustomKelas(wali.kelas);
            }
            setFormData({ nama: wali.nama, marhalah: wali.marhalah, kelas: wali.kelas, no_hp: wali.no_hp || '', user_id: wali.user_id || '' });
        } else {
            const initialMarhalah = masterMarhalahs.length > 0 ? masterMarhalahs[0].nama : 'Mutawassithah';
            const initialClasses = masterKelasRelasi.filter((k: any) => k.marhalah_id === masterMarhalahs.find((m: any) => m.nama === initialMarhalah)?.id).map((k: any) => k.nama_kelas);
            setFormData({ nama: '', marhalah: initialMarhalah, kelas: initialClasses[0] || '', no_hp: '', user_id: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const orgId = await getOrgId();
            if (!selectedAcademicYear) return alert("Tahun ajaran belum dipilih");
            if (!formData.nama) return alert("Nama wajib diisi");
            
            const finalKelas = isCustomKelas ? customKelas : formData.kelas;
            if (!finalKelas) return alert("Kelas wajib diisi");
            
            
            const m_id = masterMarhalahs.find((m: any) => m.nama === formData.marhalah)?.id || null;
            const k_id = masterKelasRelasi.find((k: any) => k.nama_kelas === finalKelas && k.marhalah_id === m_id)?.id || null;

            const legacyEnumList = ['Mutawassithah', 'Aliyah', 'Jamiah'];
            const safeLegacyMarhalah = legacyEnumList.includes(formData.marhalah) ? formData.marhalah : 'Mutawassithah';

            const payload: any = {
                marhalah_id: m_id,
                kelas_id: k_id, 
                organization_id: orgId, 
                academic_year_id: selectedAcademicYear.id,
                nama: formData.nama,
                marhalah: formData.marhalah,
                kelas: finalKelas, 
                no_hp: formData.no_hp || null,
                user_id: formData.user_id || null 
            };
            
            if (editingWali) {
                // @ts-ignore
                delete payload.organization_id;
                let { error } = await supabase.from('wali_kelas').update(payload).eq('id', editingWali.id).eq('organization_id', orgId);
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('wali_kelas').update(payload).eq('id', editingWali.id).eq('organization_id', orgId);
                    error = res.error;
                }
                if (error) throw error;
            } else {
                let { error } = await supabase.from('wali_kelas').insert(payload);
                if (error && (error.message?.toLowerCase().includes('enum') || error.code === '22P02')) {
                    payload.marhalah = safeLegacyMarhalah;
                    const res = await supabase.from('wali_kelas').insert(payload);
                    error = res.error;
                }
                if (error) throw error;
            }
            await fetchWali();
            setIsModalOpen(false);
            alert("Data berhasil disimpan!");
        } catch (error: any) {
            console.error(error);
            alert("Gagal menyimpan data: " + error.message);
        }
    };

    const handleDelete = async (id: number) => {
        if(confirm("Hapus Wali Kelas?")) {
            const orgId = await getOrgId();
            if (!orgId) return;
            await supabase.from('wali_kelas').delete().eq('id', id).eq('organization_id', orgId);
            fetchWali();
        }
    };

    // Import/Export
    const handleDownloadTemplate = () => {
        const headers = ['nama', 'marhalah', 'kelas', 'no_hp'];
        const dummy = [{ nama: 'Ustadz Abu Fulan', marhalah: 'Mutawassithah', kelas: '1A', no_hp: '08123456789' }];
        exportToExcel(dummy, 'template_wali_kelas');
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if(!file) return;
        try {
            const orgId = await getOrgId();
            if(!selectedAcademicYear) {
                alert("Pilih tahun ajaran terlebih dahulu");
                return;
            }
            const excelData = await parseSpreadsheet(file);
            let success = 0; let fail = 0;
            for(const row of excelData) {
                if(!row.nama) continue;
                const payload = { 
                    organization_id: orgId, 
                    academic_year_id: selectedAcademicYear.id,
                    nama: row.nama, marhalah: row.marhalah || 'Mutawassithah',
                    kelas: row.kelas?.toString() || '1A', no_hp: row.no_hp?.toString() || ''
                };
                const { error } = await supabase.from('wali_kelas').insert(payload);
                if(error) {
                    console.error('Import error for row', row, error);
                    fail++; 
                } else {
                    success++;
                }
            }
            await fetchWali();
            alert(`Import selesai. Sukses: ${success}, Gagal: ${fail}`);
        } catch(e: any) { alert(`Import gagal: ${e.message}`); }
        finally { if(fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleExportPDF = () => {
        const columns = ['Nama', 'Marhalah', 'Kelas', 'No HP'];
        const rows = waliList.map(w => [w.nama, w.marhalah, w.kelas, w.no_hp || '-']);
        exportToPDF("Data Wali Kelas", columns, rows, "Data_Wali_Kelas");
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls,.csv" className="hidden" />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
                <div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Data Wali Kelas
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Kelola data wali kelas, kelas yang diampu, dan nomor kontak.
                    </p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-2 md:-mt-20 z-10 relative pointer-events-none">
                <div className="pointer-events-auto flex flex-col sm:flex-row gap-3">
                    <ActionDropdown label="Import Excel" icon={<Upload size={16}/>}>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                            <FileSpreadsheet size={14} className="mr-2 text-green-600"/> Upload File Excel
                        </button>
                        <button onClick={handleDownloadTemplate} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                            <Download size={14} className="mr-2 text-blue-600"/> Download Template
                        </button>
                    </ActionDropdown>

                    <ActionDropdown label="Export Data" icon={<Download size={16}/>}>
                        <button onClick={() => exportToExcel(waliList, 'Data_Wali_Kelas')} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                            <FileSpreadsheet size={14} className="mr-2 text-green-600"/> Export Excel
                        </button>
                        <button onClick={handleExportPDF} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                            <FileText size={14} className="mr-2 text-red-600"/> Export PDF
                        </button>
                    </ActionDropdown>

                    <button 
                        onClick={() => openAccountModal(null)} 
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 sm:px-5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-700 hover:-translate-y-0.5 active:translate-y-0"
                    >
                        Akun Wali Kelas
                    </button>
                    
                    <button 
                        onClick={() => openModal(null)} 
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-[13px] font-bold text-white shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 gap-2"
                    >
                        <Plus size={16} strokeWidth={2.5}/> Tambah Baru
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-auto min-h-[500px]">
                {/* Filters */}
                <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row gap-4">
                    <div className="w-full md:w-1/3">
                        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Cari Nama</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" 
                                placeholder="Ketik nama walikelas..." 
                                value={search} 
                                onChange={e => setSearch(e.target.value)} 
                                className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-slate-400" 
                            />
                        </div>
                    </div>
                    <div className="w-full md:w-1/3">
                        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Filter Marhalah</label>
                        <select 
                            value={filterMarhalah} 
                            onChange={e => {setFilterMarhalah(e.target.value as any); setFilterKelas('all')}} 
                            className="w-full h-10 px-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
                        >
                            <option value="all">Semua Marhalah</option>
                            {masterMarhalahs.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
                        </select>
                    </div>
                    <div className="w-full md:w-1/3">
                        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Filter Kelas</label>
                        <select 
                            value={filterKelas} 
                            onChange={e => setFilterKelas(e.target.value)} 
                            disabled={filterMarhalah === 'all'} 
                            className="w-full h-10 px-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] disabled:bg-slate-50 cursor-pointer"
                        >
                            <option value="all">Semua Kelas</option>
                            {filterMarhalah !== 'all' && availableFilterKelas.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-0 min-h-[300px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0 z-10">
                            <tr className="border-b border-slate-200/60 bg-slate-50/50">
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400">Nama Wali Kelas</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Marhalah</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">Kelas</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80">No HP</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100/80 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80">
                            {paginatedData.map(w => (
                                <tr key={w.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{w.nama}</td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-semibold text-slate-600 uppercase tracking-widest"><MarhalahLabel text={w.marhalah} id={w.marhalah_id} /></td>
                                    <td className="px-6 py-4 border-l border-slate-100/80">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 uppercase tracking-widest border border-blue-200">
                                            <KelasLabel text={w.kelas} id={w.kelas_id} />
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-medium text-slate-600">{w.no_hp || '-'}</td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            <button onClick={() => openModal(w)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm">
                                                <Edit size={14} strokeWidth={2.5}/>
                                            </button>
                                            <button onClick={() => handleDelete(w.id)} className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                                                <Trash size={14} strokeWidth={2.5}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-16 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <Search size={48} className="mb-4 opacity-20" />
                                            <p className="text-[13px] font-medium">Tidak ada data wali kelas ditemukan.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <span className="text-[12px] font-medium text-slate-500">
                            Menampilkan <span className="font-bold text-slate-700">{((currentPage - 1) * itemsPerPage) + 1}</span> - <span className="font-bold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> dari <span className="font-bold text-slate-700">{filteredData.length}</span> data
                        </span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Sebelumnya
                            </button>
                            <span className="text-[12px] font-semibold text-slate-600 min-w-[80px] text-center">
                                {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingWali ? "Edit Wali Kelas" : "Tambah Wali Kelas"}>
                <div className="space-y-5 mt-2">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nama <span className="text-red-500">*</span></label>
                        <input type="text" placeholder="Masukkan nama wali kelas..." className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">No HP</label>
                        <input type="text" placeholder="Contoh: 08123456789" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.no_hp} onChange={e => setFormData({...formData, no_hp: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Marhalah <span className="text-red-500">*</span></label>
                            <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer" value={formData.marhalah} onChange={e => {
                                const newMarhalah = e.target.value;
                                const availableForNew = masterKelasRelasi.filter((k: any) => k.marhalah_id === masterMarhalahs.find((m: any) => m.nama === newMarhalah)?.id).map((k: any) => k.nama_kelas);
                                setFormData({...formData, marhalah: newMarhalah, kelas: availableForNew[0] || ''});
                                setIsCustomKelas(false);
                            }}>
                                {masterMarhalahs.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                             <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Kelas <span className="text-red-500">*</span></label>
                            <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer" value={isCustomKelas ? 'NEW_CLASS' : formData.kelas} onChange={e => {
                                if (e.target.value === 'NEW_CLASS') {
                                    setIsCustomKelas(true);
                                    setFormData({...formData, kelas: ''});
                                } else {
                                    setIsCustomKelas(false);
                                    setFormData({...formData, kelas: e.target.value});
                                }
                            }}>
                                {availableFormKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                <option value="NEW_CLASS" className="font-extrabold text-blue-600">+ Buat Kelas Baru</option>
                            </select>
                            {isCustomKelas && (
                                <input 
                                    type="text" 
                                    placeholder="Ketik nama kelas baru..." 
                                    className="w-full border border-blue-300 rounded-xl px-4 py-2 bg-blue-50/50 outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[13px] font-semibold text-blue-900 placeholder:text-blue-400" 
                                    value={customKelas} 
                                    onChange={e => setCustomKelas(e.target.value)} 
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>
                     
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Akun Login Terkait (Opsional)</label>
                        <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer" value={formData.user_id || ''} onChange={e => setFormData({...formData, user_id: e.target.value || null})}>
                            <option value="">-- Tidak dikaitkan --</option>
                            {authProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>)}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">Mengaitkan profil wali kelas dengan akun pengguna akan membatasi akses tampilan mereka sesuai dengan kelas yang mereka pandu.</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/80">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleSubmit} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 active:bg-blue-800 transition-all shadow-[0_2px_12px_rgba(37,99,235,0.25)] focus:ring-4 focus:ring-blue-500/20 flex items-center justify-center min-w-[120px]">Simpan Data</button>
                    </div>
                </div>
            </Modal>
        
            <Modal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} title="Buat Akun Akses Pengajar">
                <div className="space-y-4">
                    <p className="text-[13px] text-slate-500 mb-2">
                        Akun ini digunakan oleh pengajar / wali kelas untuk masuk ke aplikasi, melihat daftar kelas mereka, dan mengelola halaqah.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email <span className="text-red-500">*</span></label>
                        <input
                            type="email"
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.email}
                            onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                            placeholder="nama@email.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Password <span className="text-red-500">*</span></label>
                        <input
                            type="password"
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.password}
                            onChange={(e) => setAccountData({ ...accountData, password: e.target.value })}
                            placeholder="Minimal 6 karakter"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.full_name}
                            onChange={(e) => setAccountData({ ...accountData, full_name: e.target.value })}
                            placeholder="Nama Lengkap Pengajar"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Kaitkan ke Profil Wali Kelas (Opsional)</label>
                        <select
                            className="w-full border-slate-300 rounded-md shadow-sm"
                            value={accountData.wali_id}
                            onChange={(e) => setAccountData({ ...accountData, wali_id: e.target.value })}
                        >
                            <option value="">-- Buat akun saja (bisa dikaitkan nanti) --</option>
                            {waliList.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.nama} - {m.kelas}
                                </option>
                            ))}
                        </select>
                        {accountData.wali_id && (
                            <p className="text-[12px] text-emerald-600 mt-2 flex items-center">
                                Profil {waliList.find(m => m.id.toString() === accountData.wali_id)?.nama} akan langsung dikaitkan.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end pt-5 gap-3 border-t">
                        <button onClick={() => setIsAccountModalOpen(false)} className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleCreateAccount} disabled={isCreatingAccount} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold hover:bg-emerald-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 transition-all shadow-[0_2px_12px_rgba(16,185,129,0.25)]">{isCreatingAccount ? 'Membuat Akun...' : 'Buat Akun'}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );

};

export default WaliKelasPage;
