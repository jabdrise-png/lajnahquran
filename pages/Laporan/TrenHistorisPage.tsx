
import React, { useState, useMemo, useRef, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { StackedBarChart } from '../../components/Chart';
import { exportToExcel } from '../../lib/utils';
import { ALL_ATTENDANCE_STATUS } from '../../constants';
import { Trash, Download, Filter, MoreVertical, Eye } from 'lucide-react';
import html2canvas from 'html2canvas';

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
    const canDeleteSession = (userProfile?.role || '').toLowerCase() !== 'musammi';
    
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
        return Object.values(groups).sort((a: any, b: any) => {
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
            const key = `${r.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === r.marhalah_id)?.nama || r.marhalah : r.marhalah}-${r.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === r.kelas_id)?.nama_kelas || r.kelas : r.kelas}`;
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

        return Object.values(classGroups).sort((a: any, b: any) => {
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
        await deleteAttendanceBatch(date, waktu, {
            peran: selectedPeran !== 'all' ? selectedPeran : undefined,
            ids: idsToDelete
        });
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

    if (loading) return <p>Loading...</p>;
    if (error) return <p className="text-error">{error}</p>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-sans">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
                {/* Filters */}
                {showAdvancedFilters && (
                    <div className="bg-white p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-start md:items-end animate-in fade-in duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full flex-1">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Dari Tanggal</label>
                                <input 
                                    type="date" 
                                    value={dateRange.start} 
                                    onChange={e => setDateRange(p => ({...p, start: e.target.value}))} 
                                    className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Sampai Tanggal</label>
                                <input 
                                    type="date" 
                                    value={dateRange.end} 
                                    onChange={e => setDateRange(p => ({...p, end: e.target.value}))} 
                                    className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Marhalah</label>
                                <select 
                                    value={selectedMarhalah} 
                                    onChange={e => {setSelectedMarhalah(e.target.value); setSelectedKelas('all');}} 
                                    className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-colors"
                                >
                                    <option value="all">Semua Marhalah</option>
                                    {availableMarhalah.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Kelas</label>
                                <select 
                                    value={selectedKelas} 
                                    onChange={e => setSelectedKelas(e.target.value)} 
                                    className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-colors"
                                >
                                    <option value="all">Semua Kelas</option>
                                    {availableKelas.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Peran</label>
                                <select 
                                    value={selectedPeran} 
                                    onChange={e => setSelectedPeran(e.target.value)} 
                                    className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-colors"
                                >
                                    <option value="all">Semua Peran</option>
                                    <option value="Santri">Santri</option>
                                    <option value="Musammi">Musammi</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                        {timeRecapData.length} Data Rekapitutulasi
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowAdvancedFilters(prev => !prev)}
                            title="Filter Lanjutan"
                            className={`p-2 rounded-xl border flex items-center justify-center transition-all shadow-sm ${
                                showAdvancedFilters 
                                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm3 6a1 1 0 011-1h10a1 1 0 110 2H7a1 1 0 01-1-1zm3 6a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z" />
                            </svg>
                        </button>
                        <button 
                            onClick={() => exportToExcel(timeRecapData, 'Rekap_Waktu')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-[12px] font-semibold flex items-center transition-colors shadow-sm"
                        >
                            <Download size={15} className="mr-1.5" /> Export Data
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200/80">
                                <th className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-200/60 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                                <th className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-200/60 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
                                {globalAttendanceStatus?.map(s => (
                                    <th key={s} className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-center">{s}</th>
                                ))}
                                <th className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 text-[12px] font-bold text-slate-700 uppercase tracking-wider text-center border-l border-slate-200/60">Total</th>
                                {canDeleteSession && (
                                    <th className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-right border-l border-slate-200/60 w-16">Aksi</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {paginatedData.map((item: any, idx: number) => (
                                <tr 
                                    key={idx} 
                                    className="hover:bg-slate-50/40 transition-colors group cursor-pointer"
                                    onClick={() => setSelectedSession({ date: item.date, waktu: item.waktu })}
                                    title="Klik untuk lihat detail per kelas"
                                >
                                    <td className="px-5 py-3 font-medium text-[13px] text-slate-800 border-r border-slate-100/60">
                                        {item.date}
                                    </td>
                                    <td className="px-5 py-3 border-r border-slate-100/60"><span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider">{item.waktu}</span></td>
                                    {globalAttendanceStatus?.map(s => (
                                        <td key={s} className="px-5 py-3 text-center text-[13px] text-slate-600 font-bold">{item[s] || 0}</td>
                                    ))}
                                    <td className="px-5 py-3 text-center text-[13px] font-extrabold text-slate-700 bg-slate-50/50 border-l border-slate-100/60">{item.Total}</td>
                                    {canDeleteSession && (
                                        <td className="px-5 py-3 text-right border-l border-slate-100/60">
                                            <div className="flex justify-end">
                                                <button 
                                                    onClick={(e) => handleDeleteTimeRecap(e, item.date, item.waktu)} 
                                                    className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                                    title={selectedPeran !== 'all' ? `Hapus Absensi ${selectedPeran} Sesi Ini` : "Hapus Sesi"}
                                                >
                                                    <Trash size={16} strokeWidth={2.5}/>
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-5 py-8 text-center text-[13px] font-medium text-slate-500">
                                        Belum ada data absensi untuk filter yang dipilih.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="bg-white border-t border-slate-100 p-4 flex items-center justify-between">
                        <span className="text-[13px] text-slate-500 font-medium">Halaman {currentPage} dari {totalPages}</span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                disabled={currentPage === 1}
                                className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Prev
                            </button>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                Next
                            </button>
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>
                            <button 
                                onClick={() => {
                                    setItemsPerPage(prev => prev === 50 ? 999999 : 50);
                                    setCurrentPage(1);
                                }}
                                className="px-3.5 py-1.5 border border-blue-200 bg-blue-50/50 rounded-lg text-[13px] font-bold text-blue-600 hover:bg-blue-100 transition-colors ml-1"
                            >
                                {itemsPerPage === 50 ? 'Tampilkan Semua' : 'Tampilkan Sedikit'}
                            </button>
                        </div>
                    </div>
                )}
                <div className="bg-slate-50/50 border-t border-slate-100 px-5 py-3">
                    <p className="text-[12px] text-slate-500 font-medium italic">*Klik baris untuk melihat detail absensi per kelas pada sesi tersebut.</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100/60 flex justify-between items-center relative" ref={chartMenuRef}>
                    <h3 className="text-[14px] font-bold text-slate-800 tracking-tight">Grafik Total Absensi Per Sesi (Global)</h3>
                    <div className="relative">
                        <button onClick={() => setIsChartMenuOpen(!isChartMenuOpen)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><MoreVertical size={16} strokeWidth={2.5}/></button>
                        {isChartMenuOpen && <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-100 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] p-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                            <button onClick={handleDownloadChart} className="w-full text-left px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 rounded-lg flex items-center transition-colors"><Download size={14} className="mr-2" strokeWidth={2.5}/> Download PNG</button>
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
                    <div className="overflow-x-auto border border-slate-200/60 rounded-xl">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead className="bg-slate-50 uppercase text-xs sticky top-0 z-10 shadow-sm border-b border-slate-200/80">
                                <tr>
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-100/60">Kelas</th>
                                    {globalAttendanceStatus?.map(s => (
                                        <th key={s} className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-center">{s}</th>
                                    ))}
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-700 uppercase tracking-widest text-center border-l border-slate-100/60">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {sessionDetailData.map((cls, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                                        <td className="px-5 py-3 font-bold text-[13px] text-slate-800 border-r border-slate-100/60"><KelasLabel text={cls.kelas} id={cls.kelas_id} /> <span className="text-[11px] font-medium text-slate-500 block"><MarhalahLabel text={cls.marhalah} id={cls.marhalah_id} /></span></td>
                                        {globalAttendanceStatus?.map(s => (
                                            <td key={s} className="px-5 py-3 text-center text-[13px] font-bold text-slate-600">{cls[s] || 0}</td>
                                        ))}
                                        <td className="px-5 py-3 text-center text-[13px] font-extrabold text-slate-700 bg-slate-50/50 border-l border-slate-100/60">{cls.Total}</td>
                                    </tr>
                                ))}
                                {sessionDetailData.length === 0 && (
                                    <tr><td colSpan={2 + (globalAttendanceStatus?.length || 0)} className="px-5 py-6 text-center text-[13px] font-medium text-slate-500">Tidak ada data untuk sesi ini.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-100/80 font-bold text-slate-800 text-[12px] uppercase tracking-wider sticky bottom-0 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] border-t border-slate-200/80">
                                <tr>
                                    <td className="px-5 py-4 border-r border-slate-200/60">Total Global</td>
                                    {globalAttendanceStatus?.map(s => (
                                        <td key={s} className="px-5 py-4 text-center text-slate-700">{sessionDetailData.reduce((a:number, b:any) => a + (b[s] || 0), 0)}</td>
                                    ))}
                                    <td className="px-5 py-4 text-center font-extrabold border-l border-slate-200/60 bg-slate-200/50">{sessionDetailData.reduce((a:number, b:any) => a + (b.Total || 0), 0)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={() => setSelectedSession(null)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[13px] font-bold transition-all hover:-translate-y-0.5 shadow-sm">Tutup Detail</button>
                </div>
            </Modal>
        </div>
    );
};

export default TrenHistorisPage;
