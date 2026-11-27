
import React, { useState, useMemo, useRef, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { StackedBarChart } from '../../components/Chart';
import { exportToExcel } from '../../lib/utils';
import { ALL_ATTENDANCE_STATUS } from '../../constants';
import { Trash, Download, Filter, MoreVertical, Eye } from 'lucide-react';
import html2canvas from 'html2canvas';
import { NotificationStore } from '../../lib/NotificationStore';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { hariIni } from '../../lib/sesiHalaqah';
import { LoadingState } from '../../components/ui/SaaSPrimitives';

interface TrenHistorisPageProps {
    showAdvancedFilters?: boolean;
    setShowAdvancedFilters?: React.Dispatch<React.SetStateAction<boolean>>;
    exportTrigger?: number;
}

const TrenHistorisPage: React.FC<TrenHistorisPageProps> = ({
    showAdvancedFilters: externalShowFilters,
    setShowAdvancedFilters: externalSetShowFilters,
    exportTrigger
}) => {
    const { attendance, deleteAttendanceBatch, loading, error, globalMarhalahs, globalWaktuHalaqah, globalAttendanceStatus, userProfile, waliKelas , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    useRiwayat(); // Fase 7: riwayat absensi/setoran dimuat saat halaman ini dibuka
    const canDeleteSession = (userProfile?.role || '').toLowerCase() !== 'musammi';
    const [dialogAlasan, mintaAlasan] = useMintaAlasan();
    
    // UI States
    const [localShowFilters, setLocalShowFilters] = useState(false);
    const showAdvancedFilters = externalShowFilters !== undefined ? externalShowFilters : localShowFilters;
    const setShowAdvancedFilters = externalSetShowFilters || setLocalShowFilters;
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedMarhalah, setSelectedMarhalah] = useState<string>('all');
    const [selectedKelas, setSelectedKelas] = useState<string>('all');
    const [selectedPeran, setSelectedPeran] = useState<string>('all');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    
    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, selectedMarhalah, selectedKelas, selectedPeran]);

    // Dynamic Options
    const availableMarhalah = useMemo(() => {
        const m = new Set<string>();
        attendance.forEach(record => {
            if (record.marhalah) m.add(record.marhalah);
        });
        return Array.from(m).sort();
    }, [attendance]);

    const availableKelas = useMemo(() => {
        const k = new Set<string>();
        attendance.forEach(record => {
            if (selectedMarhalah !== 'all') {
                if (record.marhalah === selectedMarhalah && record.kelas) k.add(record.kelas);
            } else {
                if (record.kelas) k.add(record.kelas);
            }
        });
        return Array.from(k).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [attendance, selectedMarhalah]);
    
    // Detail Modal State
    const [selectedSession, setSelectedSession] = useState<{date: string, waktu: string} | null>(null);

    // Chart Menu
    const [isChartMenuOpen, setIsChartMenuOpen] = useState(false);
    const chartMenuRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chartMenuRef.current && !chartMenuRef.current.contains(event.target as Node)) {
                setIsChartMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredData = useMemo(() => {
        const base = attendance;
        return base.filter(record => {
            if (dateRange.start && record.date < dateRange.start) return false;
            if (dateRange.end && record.date > dateRange.end) return false;
            if (selectedMarhalah !== 'all' && record.marhalah !== selectedMarhalah) return false;
            if (selectedKelas !== 'all' && record.kelas !== selectedKelas) return false;
            if (selectedPeran !== 'all' && record.peran !== selectedPeran) return false;
            return true;
        });
    }, [attendance, dateRange, selectedMarhalah, selectedKelas, selectedPeran, userProfile, waliKelas]);

    const timeRecapData = useMemo(() => {
        const groups: Record<string, any> = {};
        filteredData.forEach(r => {
            const key = `${r.date}_${r.waktu}`;
            if (!groups[key]) {
                groups[key] = { date: r.date, waktu: r.waktu, Total: 0 };
                globalAttendanceStatus?.forEach(s => groups[key][s] = 0);
            }
            if (r.status && groups[key][r.status] !== undefined) {
                groups[key][r.status]++;
            } else if (r.status) {
                groups[key][r.status] = 1;
            }
            groups[key].Total++;
        });
        // Sort by Date Descending, then Waktu Descending
        return Object.values(groups).sort((a, b) => {
            const dateCmp = b.date.localeCompare(a.date);
            if (dateCmp !== 0) return dateCmp;
            return b.waktu.localeCompare(a.waktu);
        });
    }, [filteredData, globalAttendanceStatus]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return timeRecapData.slice(startIndex, startIndex + itemsPerPage);
    }, [timeRecapData, currentPage]);
    
    const totalPages = Math.ceil(timeRecapData.length / itemsPerPage);

    const prevExportTrigger = useRef(exportTrigger);
    useEffect(() => {
        if (exportTrigger && exportTrigger !== prevExportTrigger.current) {
            prevExportTrigger.current = exportTrigger;
            exportToExcel(timeRecapData, 'Rekap_Waktu');
        }
    }, [exportTrigger, timeRecapData]);

    // Data for Session Breakdown Modal
    const sessionDetailData = useMemo(() => {
        if (!selectedSession) return [];
        
        // Filter filteredData for the specific session selected (Date + Waktu)
        // This ensures the modal breakdown respects Peran, Marhalah, and Kelas filters
        const sessionAttendance = filteredData.filter(a => a.date === selectedSession.date && a.waktu === selectedSession.waktu);
        
        const classGroups: Record<string, any> = {};
        
        sessionAttendance.forEach(r => {
            const key = `${r.marhalah_id ? masterMarhalahs?.find((m) => m.id === r.marhalah_id)?.nama || r.marhalah : r.marhalah}-${r.kelas_id ? masterKelasRelasi?.find((k) => k.id === r.kelas_id)?.nama_kelas || r.kelas : r.kelas}`;
            if (!classGroups[key]) {
                classGroups[key] = {
                    kelas: r.kelas,
                    marhalah: r.marhalah,
                    Total: 0
                };
                globalAttendanceStatus?.forEach(s => classGroups[key][s] = 0);
            }
            if (r.status && classGroups[key][r.status] !== undefined) {
                classGroups[key][r.status]++;
            } else if (r.status) {
                classGroups[key][r.status] = 1;
            }
            classGroups[key].Total++;
        });

        return Object.values(classGroups).sort((a, b) => {
            const mIdxA = globalMarhalahs.indexOf(a.marhalah);
            const mIdxB = globalMarhalahs.indexOf(b.marhalah);
            if (mIdxA !== mIdxB) return mIdxA - mIdxB;
            return a.kelas.localeCompare(b.kelas, undefined, { numeric: true });
        });
    }, [filteredData, selectedSession, globalMarhalahs, globalAttendanceStatus]);

    const globalTimeData = useMemo(() => {
        const groups: Record<string, any> = {};
        globalWaktuHalaqah.forEach(w => { 
            groups[w] = { name: w };
            globalAttendanceStatus?.forEach(s => groups[w][s] = 0); 
        });
        filteredData.forEach(r => { 
            if (groups[r.waktu] && r.status && groups[r.waktu][r.status] !== undefined) {
                groups[r.waktu][r.status]++; 
            } else if (groups[r.waktu] && r.status) {
                groups[r.waktu][r.status] = 1;
            }
        });
        return Object.values(groups);
    }, [filteredData, globalWaktuHalaqah, globalAttendanceStatus]);

    const handleDeleteTimeRecap = async (e: React.MouseEvent, date: string, waktu: string) => {
        e.stopPropagation();
        const recordsInSession = filteredData.filter(r => r.date === date && r.waktu === waktu);
        if (recordsInSession.length === 0) return;

        const idsToDelete = recordsInSession.map(r => r.id);
        // Fase 3: menghapus absensi tanggal lampau = koreksi Admin beralasan
        let alasan: string | undefined;
        if (date < hariIni()) {
            const a = await mintaAlasan({ title: `Hapus absensi ${date} · ${waktu}`, description: `${idsToDelete.length} catatan akan dihapus. Absensi tanggal yang sudah lewat hanya bisa dikoreksi Admin dengan alasan.`, danger: true, confirmLabel: 'Hapus' });
            if (a === null) return;
            alasan = a;
        }
        try {
            await deleteAttendanceBatch(date, waktu, {
                peran: selectedPeran !== 'all' ? selectedPeran : undefined,
                ids: idsToDelete
            }, alasan);
            NotificationStore.addNotification('Absensi sesi dihapus.', 'success');
        } catch (err: any) {
            NotificationStore.addNotification(err?.message || 'Gagal menghapus absensi.', 'error');
        }
    };

    const handleDownloadChart = async () => {
        if (chartRef.current) {
            try {
                const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `Grafik_Sesi_Global.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
                setIsChartMenuOpen(false);
            } catch (e) { console.error(e); }
        }
    };

    if (loading) return <LoadingState label="Memuat data…" />;
    if (error) return <p className="text-error">{error}</p>;

    return (
        <div className="space-y-5 font-sans">
            {dialogAlasan}
            <div className="panel-filter">
              <div className="grid-filter lg:grid-cols-5">
                <label className="kontrol flex items-center gap-2"><span className="shrink-0 text-xs font-semibold text-slate-400">Dari:</span><input 
                                                    type="date" 
                                                    value={dateRange.start} 
                                                    onChange={e => setDateRange(p => ({...p, start: e.target.value}))} 
                                                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer"
                                                /></label>
                <label className="kontrol flex items-center gap-2"><span className="shrink-0 text-xs font-semibold text-slate-400">Sampai:</span><input 
                                                    type="date" 
                                                    value={dateRange.end} 
                                                    onChange={e => setDateRange(p => ({...p, end: e.target.value}))} 
                                                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer"
                                                /></label>
                <select 
                                                    value={selectedMarhalah} 
                                                    onChange={e => {setSelectedMarhalah(e.target.value); setSelectedKelas('all');}} 
                                                    className="kontrol"
                                                >
                                                    <option value="all">Semua Marhalah</option>
                                                    {availableMarhalah.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                <select 
                                                    value={selectedKelas} 
                                                    onChange={e => setSelectedKelas(e.target.value)} 
                                                    className="kontrol"
                                                >
                                                    <option value="all">Semua Kelas</option>
                                                    {availableKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                                </select>
                <select 
                                                    value={selectedPeran} 
                                                    onChange={e => setSelectedPeran(e.target.value)} 
                                                    className="kontrol sm:col-span-2 lg:col-span-1"
                                                >
                                                    <option value="all">Semua Peran</option>
                                                    <option value="Santri">Santri</option>
                                                    <option value="Musammi">Musammi</option>
                                                </select>
              </div>
            </div>
            <div className="wadah-tabel flex flex-col">
                

                {/* Toolbar */}
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                        {timeRecapData.length} Data Rekapitulasi
                    </span>
                    <div className="flex items-center gap-2">

                        <button 
                            onClick={() => exportToExcel(timeRecapData, 'Rekap_Waktu')}
                            className="btn btn-primary btn-sm"
                        >
                            <Download size={15} className="mr-1.5" /> Ekspor data
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 custom-scrollbar overflow-x-auto">
                    <table className="tabel tabel-kartu sm:min-w-[700px]">
                        <thead>
                            <tr>
                                <th className="sticky top-0 z-10">Tanggal</th>
                                <th className="sticky top-0 z-10">Waktu</th>
                                {globalAttendanceStatus?.map(s => (
                                    <th key={s} className="sticky top-0 z-10 text-center">{s}</th>
                                ))}
                                <th className="sticky top-0 z-10 text-center">Total</th>
                                {canDeleteSession && (
                                    <th className="sticky top-0 z-10 text-right w-16">Aksi</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((item, idx: number) => (
                                <tr 
                                    key={idx} 
                                    className="cursor-pointer"
                                    onClick={() => setSelectedSession({ date: item.date, waktu: item.waktu })}
                                    title="Klik untuk lihat detail per kelas"
                                >
                                    <td data-label="Tanggal" className="font-medium text-sm text-slate-800 tabular-nums">
                                        {item.date}
                                    </td>
                                    <td data-label="Waktu"><span className="badge badge-abu">{item.waktu}</span></td>
                                    {globalAttendanceStatus?.map(s => (
                                        <td key={s} data-label={s} className="text-center text-sm text-slate-600 font-bold tabular-nums">{item[s] || 0}</td>
                                    ))}
                                    <td data-label="Total" className="text-center text-sm font-extrabold text-slate-700 bg-slate-50/50 tabular-nums">{item.Total}</td>
                                    {canDeleteSession && (
                                        <td data-label="Aksi" className="text-right">
                                            <div className="flex justify-end">
                                                <button 
                                                    onClick={(e) => handleDeleteTimeRecap(e, item.date, item.waktu)} 
                                                    className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                                                    title={selectedPeran !== 'all' ? `Hapus Absensi ${selectedPeran} Sesi Ini` : "Hapus Sesi"}
                                                >
                                                    <Trash size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                                        Belum ada data absensi untuk filter yang dipilih.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="bg-white border-t border-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-slate-500 font-medium tabular-nums">Halaman {currentPage} dari {totalPages}</span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                disabled={currentPage === 1}
                                className="btn btn-secondary btn-sm"
                            >
                                Sebelumnya
                            </button>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="btn btn-secondary btn-sm"
                            >
                                Berikutnya
                            </button>
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>
                            <button 
                                onClick={() => {
                                    setItemsPerPage(prev => prev === 50 ? 999999 : 50);
                                    setCurrentPage(1);
                                }}
                                className="btn btn-soft btn-sm"
                            >
                                {itemsPerPage === 50 ? 'Tampilkan Semua' : 'Tampilkan Sedikit'}
                            </button>
                        </div>
                    </div>
                )}
                <div className="bg-slate-50/50 border-t border-slate-100 px-5 py-3">
                    <p className="text-xs text-slate-500 font-medium italic">*Klik baris untuk melihat detail absensi per kelas pada sesi tersebut.</p>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex justify-between items-center relative" ref={chartMenuRef}>
                    <h3 className="text-sm font-bold text-slate-800 tracking-tight">Grafik Total Absensi Per Sesi (Global)</h3>
                    <div className="relative">
                        <button onClick={() => setIsChartMenuOpen(!isChartMenuOpen)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><MoreVertical size={16} strokeWidth={2.5}/></button>
                        {isChartMenuOpen && <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-100 rounded-xl shadow-xs p-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                            <button onClick={handleDownloadChart} className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg flex items-center transition-colors"><Download size={14} className="mr-2" strokeWidth={2.5}/> Unduh PNG</button>
                        </div>}
                    </div>
                </div>
                <div className="p-6 overflow-x-auto custom-scrollbar hide-scrollbar" ref={chartRef}>
                    <div className="bg-white">
                        <StackedBarChart 
                            data={globalTimeData} 
                            height={350} 
                            bottomMargin={30} 
                            rotateLabels={false} 
                            barSize={100}
                        />
                    </div>
                </div>
            </div>

            {/* MODAL DETAIL PER KELAS */}
            <Modal isOpen={!!selectedSession} onClose={() => setSelectedSession(null)} title={`Detail Absensi: ${selectedSession?.date} (${selectedSession?.waktu})`} maxWidth="3xl">
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                    <div className="wadah-tabel overflow-x-auto">
                        <table className="tabel tabel-kartu sm:min-w-[500px]">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th>Kelas</th>
                                    {globalAttendanceStatus?.map(s => (
                                        <th key={s} className="text-center">{s}</th>
                                    ))}
                                    <th className="text-center">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionDetailData.map((cls, idx) => (
                                    <tr key={idx}>
                                        <td data-label="Kelas" className="font-bold text-sm text-slate-800"><KelasLabel text={cls.kelas} id={cls.kelas_id} /> <span className="text-2xs font-medium text-slate-500 block"><MarhalahLabel text={cls.marhalah} id={cls.marhalah_id} /></span></td>
                                        {globalAttendanceStatus?.map(s => (
                                            <td key={s} data-label={s} className="text-center text-sm font-bold text-slate-600 tabular-nums">{cls[s] || 0}</td>
                                        ))}
                                        <td data-label="Total" className="text-center text-sm font-extrabold text-slate-700 bg-slate-50/50 tabular-nums">{cls.Total}</td>
                                    </tr>
                                ))}
                                {sessionDetailData.length === 0 && (
                                    <tr><td colSpan={2 + (globalAttendanceStatus?.length || 0)} className="px-5 py-6 text-center text-sm font-medium text-slate-500">Tidak ada data untuk sesi ini.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-100/80 font-semibold text-slate-800 text-xs sticky bottom-0 shadow-xs border-t border-slate-200/80">
                                <tr>
                                    <td className="px-5 py-4 border-r border-slate-200/60">Total Global</td>
                                    {globalAttendanceStatus?.map(s => (
                                        <td key={s} className="px-5 py-4 text-center text-slate-700 tabular-nums">{sessionDetailData.reduce((a:number, b:any) => a + (b[s] || 0), 0)}</td>
                                    ))}
                                    <td className="px-5 py-4 text-center font-extrabold border-l border-slate-200/60 bg-slate-200/50 tabular-nums">{sessionDetailData.reduce((a:number, b:any) => a + (b.Total || 0), 0)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                <div className="mt-5 flex justify-end">
                    <button onClick={() => setSelectedSession(null)} className="btn btn-secondary">Tutup Detail</button>
                </div>
            </Modal>
        </div>
    );
};

export default TrenHistorisPage;
