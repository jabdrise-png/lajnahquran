import React, { useState, useEffect, useRef, useMemo } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import ActionDropdown from '../../components/ActionDropdown';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { Marhalah } from '../../types';
import { Plus, Trash, Download, Edit, Upload, FileSpreadsheet, FileText, Search, ChevronRight } from 'lucide-react';
import { parseSpreadsheet, exportToExcel, exportToPDF } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { StatusBadge } from '../../components/ui/SaaSPrimitives';
import { NotificationStore } from '../../lib/NotificationStore';

export interface Musyrif {
    id: number;
    academic_year_id?: number;
    nama: string;
    marhalah: string;
    no_hp?: string;
}

const MusyrifDataPage: React.FC = () => {
    const { getOrgId, selectedAcademicYear, masterKelas, globalMarhalahs, masterMarhalahs, masterKelasRelasi, fetchData } = useSupabaseData();
    const [musyrifList, setMusyrifList] = useState<Musyrif[]>([]);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;
    
    // Filters
    const [filterMarhalah, setFilterMarhalah] = useState<string | 'all'>('all');
    const [search, setSearch] = useState('');

    // Form
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMusyrif, setEditingMusyrif] = useState<Musyrif | null>(null);
    const [formData, setFormData] = useState({
        nama: '', marhalah: '' as string, no_hp: ''
    });

    const fetchMusyrif = async () => {
        if (!selectedAcademicYear) return;
        setLoading(true);
        const orgId = await getOrgId();
        if (!orgId) {
            setLoading(false);
            return;
        }
        // Fallback or handle if table doesn't exist yet gracefully
        const { data, error } = await (supabase as any).from('musyrifs').select('*').eq('organization_id', orgId).eq('academic_year_id', selectedAcademicYear.id);
        if (error) {
            console.warn('Table musyrifs might not exist yet:', error.message);
        }
        if (data) setMusyrifList(data as unknown as Musyrif[]);
        setLoading(false);
    };

    useEffect(() => { fetchMusyrif(); }, [selectedAcademicYear]);

    // Derived Data
    const filteredData = useMemo(() => {
        return musyrifList.filter(w => {
            if (filterMarhalah !== 'all' && w.marhalah !== filterMarhalah) return false;
            if (search && !w.nama.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        }).sort((a, b) => {
            const marhalahOrder = globalMarhalahs;
            const mIdxA = marhalahOrder.indexOf(a.marhalah);
            const mIdxB = marhalahOrder.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;
            return (a.nama || '').localeCompare(b.nama || '');
        });
    }, [musyrifList, filterMarhalah, search]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    const openModal = (musyrif: Musyrif | null) => {
        setEditingMusyrif(musyrif);
        if (musyrif) {
            setFormData({ nama: musyrif.nama, marhalah: musyrif.marhalah, no_hp: musyrif.no_hp || '' });
        } else {
            setFormData({ nama: '', marhalah: masterMarhalahs?.length > 0 ? masterMarhalahs[0].nama : 'Mutawassithah', no_hp: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        const orgId = await getOrgId();
        if (!selectedAcademicYear) return NotificationStore.addNotification("Tahun ajaran belum dipilih", "error");
        if (!formData.nama.trim()) return NotificationStore.addNotification("Nama Musyrif wajib diisi", "error");
        
        const mObj = (masterMarhalahs || []).find((m: any) => m.nama === formData.marhalah);
        const payload: any = { 
            organization_id: orgId, 
            academic_year_id: selectedAcademicYear.id,
            marhalah_id: mObj?.id || null,
            ...formData, 
            no_hp: formData.no_hp || null 
        };
        
        if (editingMusyrif) {
            delete payload.organization_id;
            const { error } = await (supabase as any).from('musyrifs').update(payload).eq('id', editingMusyrif.id).eq('organization_id', orgId);
            if(error) return NotificationStore.addNotification(error.message, "error");
        } else {
            const { error } = await (supabase as any).from('musyrifs').insert(payload);
            if(error) return NotificationStore.addNotification(error.message, "error");
        }

        // Sinkronisasi atribut administratif musyrif_name ke master_kelas_relasi & santri pada marhalah terkait
        try {
            if (mObj?.id) {
                await (supabase as any)
                    .from('master_kelas_relasi')
                    .update({ musyrif_name: formData.nama.trim() })
                    .eq('organization_id', orgId)
                    .eq('marhalah_id', mObj.id);
            }
            await (supabase as any)
                .from('santri')
                .update({ musyrif_nama: formData.nama.trim() })
                .eq('organization_id', orgId)
                .eq('marhalah', formData.marhalah);
        } catch {}

        await fetchMusyrif();
        if (fetchData) await fetchData();
        setIsModalOpen(false);
        NotificationStore.addNotification("Atribut Musyrif berhasil disimpan dan disinkronkan ke struktur marhalah/kelas.", "success");
    };

    const handleDelete = async (id: number) => {
        const orgId = await getOrgId();
        if (!orgId) return;
        await (supabase as any).from('musyrifs').delete().eq('id', id).eq('organization_id', orgId);
        fetchMusyrif();
        NotificationStore.addNotification("Atribut Musyrif berhasil dihapus.", "info");
    };

    // Import/Export
    const handleDownloadTemplate = () => {
        const headers = ['nama', 'marhalah', 'no_hp'];
        const dummy = ['Musyrif Fulan', 'Mutawassithah', '08123456789'];
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), dummy.join(',')].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "template_musyrif.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if(!file) return;
        try {
            const orgId = await getOrgId();
            if(!selectedAcademicYear) {
                NotificationStore.addNotification("Pilih tahun ajaran terlebih dahulu", "error");
                return;
            }
            const csvData = await parseSpreadsheet(file);
            let success = 0; let fail = 0;
            for(const row of csvData) {
                if(!row.nama) continue;
                const payload = { 
                    organization_id: orgId,
                    academic_year_id: selectedAcademicYear.id,
                    nama: row.nama, marhalah: row.marhalah || 'Mutawassithah',
                    no_hp: row.no_hp?.toString()
                };
                const { error } = await (supabase as any).from('musyrifs').insert(payload);
                if(error) {
                    console.error('Import error row', row, error);
                    fail++;
                } else success++;
            }
            await fetchMusyrif();
            NotificationStore.addNotification(`Import selesai. Sukses: ${success}, Gagal: ${fail}`, fail > 0 ? 'info' : 'success');
        } catch(e: any) { NotificationStore.addNotification(`Import gagal: ${e.message}`, 'error'); }
        finally { if(fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleExportPDF = () => {
        const columns = ['Nama', 'Marhalah', 'No HP'];
        const rows = musyrifList.map(w => [w.nama, w.marhalah, w.no_hp || '-']);
        exportToPDF("Data Musyrif", columns, rows, "Data_Musyrif");
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
            <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv,.xlsx,.xls" className="hidden" />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge label="ATRIBUT ADMINISTRATIF ASRAMA/MARHALAH (NON-LOGIN)" tone="primary" />
                    </div>
                    <h1 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
                        Atribut Musyrif Pembina
                    </h1>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Sesuai Arsitektur 3-Role (Superadmin, Admin, Musammi), Musyrif dikelola sebagai atribut teks administratif pendamping marhalah/santri.
                    </p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-2 md:-mt-20 z-10 relative pointer-events-none">
                <div className="pointer-events-auto flex flex-col sm:flex-row gap-3">
                    <ActionDropdown label="Import Data" icon={<Upload size={16}/>}>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                            <FileSpreadsheet size={14} className="mr-2 text-green-600"/> Upload File Excel/CSV
                        </button>
                        <button onClick={handleDownloadTemplate} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                            <Download size={14} className="mr-2 text-blue-600"/> Download Template
                        </button>
                    </ActionDropdown>

                    <ActionDropdown label="Export Data" icon={<Download size={16}/>}>
                        <button onClick={() => exportToExcel(musyrifList, 'Data_Musyrif')} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                            <FileSpreadsheet size={14} className="mr-2 text-green-600"/> Export Excel
                        </button>
                        <button onClick={handleExportPDF} className="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                            <FileText size={14} className="mr-2 text-red-600"/> Export PDF
                        </button>
                    </ActionDropdown>
                    
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
                    <div className="w-full md:w-1/2">
                        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Cari Nama</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" 
                                placeholder="Ketik nama musyrif..." 
                                value={search} 
                                onChange={e => setSearch(e.target.value)} 
                                className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-slate-400" 
                            />
                        </div>
                    </div>
                    <div className="w-full md:w-1/2">
                        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Filter Marhalah</label>
                        <select 
                            value={filterMarhalah} 
                            onChange={e => setFilterMarhalah(e.target.value)} 
                            className="w-full h-10 px-4 bg-white border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none text-[13px] font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer"
                        >
                            <option value="all">Semua Marhalah</option>
                            {masterMarhalahs?.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map((m: any) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-0 min-h-[300px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0 z-10">
                            <tr className="border-b border-slate-200/60 bg-slate-50/50">
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400">Nama Musyrif</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100">Marhalah (Yang Diampu)</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100">No HP</th>
                                <th className="px-6 py-4 text-[11px] font-bold tracking-widest uppercase text-slate-400 border-l border-slate-100 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80">
                            {paginatedData.map(w => (
                                <tr key={w.id} className="hover:bg-blue-50/30 transition-colors group">
                                    <td className="px-6 py-4 text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{w.nama}</td>
                                    <td className="px-6 py-4 border-l border-slate-100/80 text-[13px] font-bold text-slate-600 uppercase tracking-widest">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                            <MarhalahLabel text={w.marhalah} id={(w as any).marhalah_id} />
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
                                            <p className="text-[13px] font-medium">Tidak ada data musyrif ditemukan.</p>
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

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingMusyrif ? "Edit Musyrif" : "Tambah Musyrif"}>
                <div className="space-y-5 mt-2">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nama <span className="text-red-500">*</span></label>
                        <input type="text" placeholder="Masukkan nama musyrif..." className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">No HP</label>
                        <input type="text" placeholder="Contoh: 08123456789" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400" value={formData.no_hp} onChange={e => setFormData({...formData, no_hp: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Marhalah yang Diampu <span className="text-red-500">*</span></label>
                        <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white text-[13px] font-semibold text-slate-800 cursor-pointer" value={formData.marhalah} onChange={e => setFormData({...formData, marhalah: e.target.value})}>
                            {masterMarhalahs?.map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>) || globalMarhalahs.map((m: any) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-200/80">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-colors">Batal</button>
                        <button onClick={handleSubmit} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 active:bg-blue-800 transition-all shadow-[0_2px_12px_rgba(37,99,235,0.25)] focus:ring-4 focus:ring-blue-500/20 flex items-center justify-center min-w-[120px]">Simpan Data</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MusyrifDataPage;
