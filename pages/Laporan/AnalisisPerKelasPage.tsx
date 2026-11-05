
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { StackedBarChart, StudentStackedBarChart } from '../../components/Chart';
import { exportToExcel } from '../../lib/utils';
import { sendFonnteMessage } from '../../lib/whatsapp';
import { NotificationStore } from '../../lib/NotificationStore';
import { ALL_ATTENDANCE_STATUS } from '../../constants';
import { Marhalah, AttendanceStatus } from '../../types';
import { Download, Send, CheckSquare, Square, BarChart2, AlertCircle, Copy, Filter, MoreVertical, ArrowUpDown, ArrowUp, ArrowDown, Check, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.889-9.888 9.889m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
);

interface AnalisisPerKelasPageProps {
    showAdvancedFilters?: boolean;
    setShowAdvancedFilters?: React.Dispatch<React.SetStateAction<boolean>>;
    exportTrigger?: number;
}

const AnalisisPerKelasPage: React.FC<AnalisisPerKelasPageProps> = ({
    showAdvancedFilters: externalShowFilters,
    setShowAdvancedFilters: externalSetShowFilters,
    exportTrigger
}) => {
    const { attendance, waliKelas, appSettings, loading, error, globalMarhalahs, masterKelas, globalAttendanceStatus, userProfile , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    
    // UI States
    const [localShowFilters, setLocalShowFilters] = useState(false);
    const showAdvancedFilters = externalShowFilters !== undefined ? externalShowFilters : localShowFilters;
    const setShowAdvancedFilters = externalSetShowFilters || setLocalShowFilters;
    
    // Filters
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedMarhalah, setSelectedMarhalah] = useState<Marhalah | 'all'>('all');
    
    // Sorting
    const [sortBy, setSortBy] = useState('Kelas');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Reporting States
    const [selectedClassKeys, setSelectedClassKeys] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReports, setGeneratedReports] = useState<Record<string, { image: string, caption: string, phone?: string }>>({});
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [isMassSending, setIsMassSending] = useState(false);
    const [massSendProgress, setMassSendProgress] = useState<{ current: number; total: number } | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    
    // Chart Menu
    const [isChartMenuOpen, setIsChartMenuOpen] = useState(false);
    const chartMenuRef = useRef<HTMLDivElement>(null);
    const mainChartRef = useRef<HTMLDivElement>(null);
    const hiddenChartRefs = useRef<Record<string, HTMLDivElement | null>>({});

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chartMenuRef.current && !chartMenuRef.current.contains(event.target as Node)) {
                setIsChartMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 1. Filter Data
    const filteredData = useMemo(() => {
        return attendance.filter(record => {
            if (dateRange.start && record.date < dateRange.start) return false;
            if (dateRange.end && record.date > dateRange.end) return false;
            if (selectedMarhalah !== 'all' && record.marhalah !== selectedMarhalah) return false;
            return true;
        });
    }, [attendance, dateRange, selectedMarhalah]);

    // 2. Aggregate Data per Class
    const classRecapData = useMemo(() => {
        const groups: Record<string, any> = {};
        filteredData.forEach(r => {
            const key = `${r.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === r.marhalah_id)?.nama || r.marhalah : r.marhalah}-${r.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === r.kelas_id)?.nama_kelas || r.kelas : r.kelas}`;
            if (!groups[key]) {
                groups[key] = {
                    key, Marhalah: r.marhalah, Kelas: r.kelas, Total: 0
                };
                globalAttendanceStatus?.forEach(s => groups[key][s] = 0);
            }
            if (r.status && groups[key][r.status] !== undefined) {
                groups[key][r.status]++;
            } else if (r.status) {
                groups[key][r.status] = 1;
            }
            groups[key].Total++;
        });

        Object.values(groups).forEach((g: any) => {
            const hadirKey = 'Hadir';
            g.PersenKehadiran = g.Total > 0 ? `${Math.round((((g['Hadir'] || 0) + (g['Terlambat'] || 0)) / g.Total) * 100)}%` : '0%';
        });

        // Sorting
        return Object.values(groups).sort((a: any, b: any) => {
            let detailCompare = 0;
            switch (sortBy) {
                case 'Kelas':
                    const mIdxA = globalMarhalahs.indexOf(a.Marhalah);
                    const mIdxB = globalMarhalahs.indexOf(b.Marhalah);
                    if (mIdxA !== mIdxB) {
                        detailCompare = mIdxA - mIdxB;
                    } else {
                        const kelasA = a.Kelas || '';
                        const kelasB = b.Kelas || '';
                        detailCompare = kelasA.localeCompare(kelasB, undefined, { numeric: true });
                    }
                    break;
                case 'PersenKehadiran':
                    detailCompare = parseFloat(a.PersenKehadiran) - parseFloat(b.PersenKehadiran);
                    break;
                default:
                    if (globalAttendanceStatus?.includes(sortBy as AttendanceStatus)) {
                        detailCompare = (a[sortBy] || 0) - (b[sortBy] || 0);
                    } else {
                        const valA = a[sortBy] || '';
                        const valB = b[sortBy] || '';
                        detailCompare = typeof valA === 'string' ? valA.localeCompare(valB, undefined, { numeric: true }) : valA - valB;
                    }
            }

            if (sortOrder === 'desc') {
                if (sortBy === 'Kelas') {
                    detailCompare = -detailCompare;
                }
            } else {
                if (sortBy !== 'Kelas') {
                    detailCompare = -detailCompare;
                }
            }
            return detailCompare;
        });
    }, [filteredData, sortBy, sortOrder, globalMarhalahs, globalAttendanceStatus]);

    const chartData = useMemo(() => classRecapData.map((item: any) => {
        const total = item.Total || 1;
        const res: any = { name: `${item.Kelas} (${item.Marhalah})`, rawTotal: item.Total };
        globalAttendanceStatus?.forEach(s => {
            res[s] = Number(((item[s] || 0) / total * 100).toFixed(1));
        });
        return res;
    }), [classRecapData, globalAttendanceStatus]);

    const prevExportTrigger = useRef(exportTrigger);
    useEffect(() => {
        if (exportTrigger && exportTrigger !== prevExportTrigger.current) {
            prevExportTrigger.current = exportTrigger;
            exportToExcel(classRecapData, 'Rekap_Kelas');
        }
    }, [exportTrigger, classRecapData]);

    // --- Actions ---
    const handleDownloadMainChart = async () => {
        if (mainChartRef.current) {
            try {
                const canvas = await html2canvas(mainChartRef.current, { scale: 2, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `Grafik_Kelas_${new Date().toISOString()}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
                setIsChartMenuOpen(false);
            } catch (e) { console.error(e); }
        }
    };

    // --- WA REPORTING LOGIC ---
    const handleGenerateWAReports = async (showModal = true) => {
        setIsGenerating(true);
        setGeneratedReports({});
        await new Promise(r => setTimeout(r, 800)); // Wait for DOM

        const formatDateIndo = (dateStr: string) => {
            if (!dateStr) return '...';
            const parts = dateStr.split('-');
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
        };

        const reports: Record<string, any> = {};
        for (const classKey of selectedClassKeys) {
            const classItem = classRecapData.find((c: any) => c.key === classKey);
            if (!classItem) continue;

            const chartEl = hiddenChartRefs.current[classKey];
            let imageUrl = '';
            if (chartEl) {
                try {
                    const canvas = await html2canvas(chartEl, { scale: 2, backgroundColor: '#ffffff', width: chartEl.scrollWidth, height: chartEl.scrollHeight });
                    imageUrl = canvas.toDataURL('image/png');
                } catch (e) { console.error(`Failed capture ${classKey}`, e); }
            }

            const wali = waliKelas.find(w => w.marhalah === classItem.Marhalah && w.kelas === classItem.Kelas);
            
            const periodLabel = dateRange.start === dateRange.end 
                ? formatDateIndo(dateRange.start)
                : `${formatDateIndo(dateRange.start)} s/d ${formatDateIndo(dateRange.end)}`;

            let caption = wali ? `Kepada Yth. Ustadz/Ustadzah *${wali.nama}*\n(Wali Kelas ${classItem.Kelas})\n\n` : '';
            caption += `*📊 LAPORAN REKAPITULASI PRESENSI*\n`;
            caption += `--------------------------------------------------\n`;
            caption += `*Kelas:* ${classItem.Kelas}\n`;
            caption += `*Marhalah:* ${classItem.Marhalah}\n`;
            caption += `*Periode:* ${periodLabel}\n\n`;
            
            caption += `*📈 RINGKASAN KEHADIRAN:*\n`;
            globalAttendanceStatus?.forEach(s => {
                const emj = s.toLowerCase() === 'hadir' ? '✅' : s.toLowerCase() === 'sakit' ? '🤒' : s.toLowerCase() === 'izin' ? '📝' : s.toLowerCase() === 'alpa' ? '❌' : '⏳';
                caption += `${emj} ${s}: *${classItem[s] || 0}*\n`;
            });
            caption += `--------------------------------------------------\n\n`;

            caption += `*⚠️ DAFTAR KETIDAKHADIRAN:*\n`;

            const problematicStudents = filteredData.filter(r => 
                r.marhalah === classItem.Marhalah && r.kelas === classItem.Kelas && r.status?.toLowerCase() !== 'hadir'
            ).reduce((acc: any, curr) => {
                if(!acc[curr.nama]) acc[curr.nama] = {};
                if(!acc[curr.nama][curr.status]) acc[curr.nama][curr.status] = 0;
                acc[curr.nama][curr.status]++;
                return acc;
            }, {});

            if (Object.keys(problematicStudents).length === 0) {
                caption += `✅ _Alhamdulillah, seluruh santri hadir._\n`;
            } else {
                Object.entries(problematicStudents).sort((a,b) => (a[0] || '').localeCompare(b[0] || '')).forEach(([name, counts]: [string, any], idx) => {
                    const details = Object.entries(counts)
                        .map(([status, count]) => `${status}: ${count}`)
                        .join(', ');
                    caption += `${idx + 1}. *${name}*\n   └─ (${details})\n`;
                });
            }
            
            caption += `\n--------------------------------------------------\n`;
            caption += `_Laporan dikirim otomatis melalui sistem._`;
            
            reports[classKey] = { image: imageUrl, caption, phone: wali?.no_hp };
        }
        setGeneratedReports(reports);
        setIsGenerating(false);
        if (showModal) setIsPreviewModalOpen(true);
        return reports;
    };

    const handleManualSendWA = (phone: string | undefined, caption: string) => {
        let cleanPhone = '';
        if (phone) {
            cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '62');
        }
        const targetUrl = cleanPhone 
            ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(caption)}`
            : `https://wa.me/?text=${encodeURIComponent(caption)}`;
        
        NotificationStore.addNotification(
            cleanPhone ? `Membuka WhatsApp untuk nomor ${cleanPhone}...` : 'Membuka WhatsApp...',
            'info'
        );
        window.open(targetUrl, '_blank');
    };

    const handleSendMassWA = async () => {
        const reports = Object.entries(generatedReports);
        if (reports.length === 0) {
            NotificationStore.addNotification("Belum ada laporan yang disiapkan di preview.", "error");
            return;
        }
        
        const token = appSettings.find(s => s.key === 'FONNTE_API_TOKEN')?.value;
        if (!token) {
            NotificationStore.addNotification("Token Fonnte belum disetting di menu Pengaturan.", "error");
            return;
        }

        setIsMassSending(true);
        setMassSendProgress({ current: 0, total: reports.length });

        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < reports.length; i++) {
            const [key, data] = reports[i];
            const report = data as { image: string, caption: string, phone?: string };
            setMassSendProgress({ current: i + 1, total: reports.length });

            if (!report.phone) {
                NotificationStore.addNotification(`Kelas ${key}: No HP wali kelas tidak ditemukan. Dilewati.`, 'error');
                failedCount++;
                continue;
            }

            try {
                const p = report.phone.replace(/\D/g, '').replace(/^0/, '62');
                await sendFonnteMessage(token, p, report.caption, report.image);
                successCount++;
            } catch (e: any) {
                console.error(`Gagal mengirim laporan ${key} via Fonnte:`, e);
                failedCount++;
            }

            if (i < reports.length - 1) {
                await new Promise(res => setTimeout(res, 2500));
            }
        }

        setIsMassSending(false);
        setMassSendProgress(null);

        if (successCount > 0) {
            NotificationStore.addNotification(`Selesai! ${successCount} laporan kelas berhasil dikirim via Fonnte.${failedCount > 0 ? ` (${failedCount} gagal/dilewati)` : ''}`, 'success');
        } else {
            NotificationStore.addNotification("Semua pengiriman via Fonnte gagal dilakukan.", "error");
        }
    };

    const handleCopyImage = async (url: string, key: string) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2500);
            NotificationStore.addNotification("Gambar grafik berhasil disalin ke clipboard! Siap di-paste (Ctrl+V) di WhatsApp.", "success");
        } catch(e) { 
            NotificationStore.addNotification("Gagal menyalin gambar grafik ke clipboard.", "error");
        }
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortBy !== field) return <ArrowUpDown size={12} className="ml-1.5 text-slate-300 transition-opacity" />;
        return sortOrder === 'asc' 
            ? <ArrowUp size={12} className="ml-1.5 text-blue-500" />
            : <ArrowDown size={12} className="ml-1.5 text-blue-500" />;
    };

    if (loading) return <p>Loading...</p>;
    if (error) return <p className="text-error">{error}</p>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-sans">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
                {/* Filters */}
                {showAdvancedFilters && (
                    <div className="bg-white p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-start md:items-end animate-in fade-in duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full md:w-auto flex-1">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Dari Tanggal</label>
                                <input 
                                    type="date" 
                                    value={dateRange.start} 
                                    onChange={e => setDateRange(p => ({...p, start: e.target.value}))} 
                                    className="w-full border border-slate-200 bg-white rounded-xl text-[13px] py-2 px-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-slate-700 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Sampai Tanggal</label>
                                <input 
                                    type="date" 
                                    value={dateRange.end} 
                                    onChange={e => setDateRange(p => ({...p, end: e.target.value}))} 
                                    className="w-full border border-slate-200 bg-white rounded-xl text-[13px] py-2 px-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-slate-700 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Filter Marhalah</label>
                                <select 
                                    value={selectedMarhalah} 
                                    onChange={e => setSelectedMarhalah(e.target.value as any)} 
                                    className="w-full border border-slate-200 bg-white rounded-xl text-[13px] py-2 px-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-slate-700 font-medium cursor-pointer"
                                >
                                    <option value="all">Semua Marhalah</option>
                                    {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="p-4 bg-white border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500">
                        {selectedClassKeys.length} kelas dipilih
                    </span>
                    <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
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
                            onClick={() => exportToExcel(classRecapData, 'Rekap_Kelas')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-[12px] font-semibold flex items-center transition-colors shadow-sm"
                        >
                            <Download size={15} className="mr-1.5" /> Export Data
                        </button>
                        {selectedClassKeys.length > 0 && (
                            <button 
                                onClick={() => handleGenerateWAReports(true)} 
                                disabled={isGenerating} 
                                className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.98] disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                title="Buka preview & kirim laporan WhatsApp"
                            >
                                {isGenerating ? (
                                    <Loader2 size={15} className="animate-spin mr-1" />
                                ) : (
                                    <WhatsAppIcon className="w-4 h-4 flex-shrink-0 fill-current" />
                                )}
                                <span>{isGenerating ? 'Memproses...' : `Kirim WA (${selectedClassKeys.length})`}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200/80">
                                <th className="px-5 py-3.5 sticky top-0 left-0 bg-slate-50/95 backdrop-blur-sm z-20 w-12 border-r border-slate-100/60">
                                    <button 
                                        className="h-full w-full flex items-center justify-center p-1 rounded-md hover:bg-slate-200/50 transition-colors"
                                        onClick={() => setSelectedClassKeys(selectedClassKeys.length === classRecapData.length ? [] : classRecapData.map((c: any) => c.key))}
                                    >
                                        {selectedClassKeys.length > 0 ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18} className="text-slate-400"/>}
                                    </button>
                                </th>
                                <th className="px-5 py-3.5 sticky top-0 left-[48px] bg-slate-50/95 backdrop-blur-sm z-20 min-w-[200px] border-r border-slate-200/60 text-[12px] font-bold text-slate-500 uppercase tracking-wider group cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('Kelas')}>
                                    <div className="flex items-center">Kelas <SortIcon field="Kelas"/></div>
                                </th>
                                {globalAttendanceStatus?.map(s => (
                                    <th key={s} className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-center group cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort(s)}>
                                        <div className="flex items-center justify-center">{s} <SortIcon field={s}/></div>
                                    </th>
                                ))}
                                <th className="px-5 py-3.5 sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-center group cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('PersenKehadiran')}>
                                    <div className="flex items-center justify-center">% Hadir <SortIcon field="PersenKehadiran"/></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {classRecapData.map((item: any) => (
                                <tr key={item.key} className="hover:bg-slate-50/40 transition-colors group cursor-pointer" onClick={() => setSelectedClassKeys(p => p.includes(item.key) ? p.filter(k => k !== item.key) : [...p, item.key])}>
                                    <td className="px-5 py-3 sticky left-0 bg-white group-hover:bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-100/60 transition-colors text-center w-12">
                                        <button className="p-1 rounded-md hover:bg-slate-100 transition-colors">
                                            {selectedClassKeys.includes(item.key) ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18} className="text-slate-300"/>}
                                        </button>
                                    </td>
                                    <td className="px-5 py-3 sticky left-[48px] bg-white group-hover:bg-slate-50/95 backdrop-blur-sm z-10 border-r border-slate-100/60 transition-colors min-w-[200px]">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-[13px] text-slate-800 group-hover:text-blue-600 transition-colors">{item.Kelas}</span>
                                            <span className="text-[11px] font-medium text-slate-500">{item.Marhalah}</span>
                                        </div>
                                    </td>
                                    {globalAttendanceStatus?.map(s => {
                                         const val = item[s] || 0;
                                         return (
                                            <td key={s} className="px-5 py-3 text-center text-[13px] font-bold text-slate-600">{val}</td>
                                         )
                                    })}
                                    <td className="px-5 py-3 text-center text-[13px] font-extrabold text-slate-700 bg-slate-50/50">{item.PersenKehadiran}</td>
                                </tr>
                            ))}
                            {classRecapData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-8 text-center text-[13px] font-medium text-slate-500">
                                        Belum ada data absensi untuk filter yang dipilih.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100/60 flex justify-between items-center relative" ref={chartMenuRef}>
                    <h3 className="text-[14px] font-bold text-slate-800 tracking-tight">Grafik Kehadiran Per Kelas</h3>
                    <div className="relative">
                        <button onClick={() => setIsChartMenuOpen(!isChartMenuOpen)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><MoreVertical size={16} strokeWidth={2.5}/></button>
                        {isChartMenuOpen && <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-100 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] p-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                            <button onClick={handleDownloadMainChart} className="w-full text-left px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 rounded-lg flex items-center transition-colors"><Download size={14} className="mr-2" strokeWidth={2.5}/> Download PNG</button>
                        </div>}
                    </div>
                </div>
                <div className="p-6 overflow-x-auto custom-scrollbar hide-scrollbar" ref={mainChartRef}>
                    <div style={{ minWidth: chartData.length > 8 ? chartData.length * 80 : '100%' }} className="bg-white">
                        <StackedBarChart 
                            data={chartData} 
                            rotateLabels={true}
                            bottomMargin={100}
                            height={450}
                            keys={globalAttendanceStatus}
                            unit="%"
                        />
                    </div>
                </div>
            </div>

            {/* Hidden Charts for Image Generation - MATCH REKAP STYLE */}
            <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none">
                {selectedClassKeys.map(classKey => {
                    const classItem = classRecapData.find((c: any) => c.key === classKey);
                    if (!classItem) return null;
                    const classSpecificData = filteredData
                        .filter(r => r.marhalah === classItem.Marhalah && r.kelas === classItem.Kelas)
                        .reduce((acc: any[], curr) => {
                            const exist = acc.find(a => a.id === curr.personId);
                            if(exist) { exist[curr.status]++; exist.Total++; } 
                            else {
                                const newObj: any = { id: curr.personId, name: curr.nama, Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Terlambat: 0, Total: 1 };
                                newObj[curr.status]++;
                                acc.push(newObj);
                            }
                            return acc;
                        }, [])
                        // Sort internal chart data by Name
                        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

                    // Dynamic Width Calculation based on Student Count (Same as Rekap)
                    const calculatedWidth = Math.max(1000, classSpecificData.length * 60);

                    return (
                        <div key={`chart-${classKey}`} ref={(el) => { hiddenChartRefs.current[classKey] = el; }} className="bg-white p-8 flex flex-col gap-8" style={{ width: calculatedWidth }}>
                            <div className="text-center border-b pb-4"><h3 className="text-2xl font-bold">LAPORAN KELAS {classItem.Kelas}</h3></div>
                            <div className="h-[750px] border rounded p-4">
                                <StudentStackedBarChart 
                                    data={classSpecificData} 
                                    height={650} 
                                    keys={globalAttendanceStatus}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal isOpen={isPreviewModalOpen} onClose={() => !isMassSending && setIsPreviewModalOpen(false)} title="Preview Laporan WA Per Kelas" maxWidth="3xl">
                <div className="space-y-6 max-h-[70vh] overflow-y-auto p-2 custom-scrollbar">
                    {Object.entries(generatedReports).map(([key, data]) => {
                         const report = data as { image: string, caption: string, phone?: string };
                         return (
                            <div key={key} className="flex flex-col md:flex-row gap-4 border-b border-slate-200 pb-6 mb-4 last:border-0">
                                <div className="w-full md:w-1/2">
                                    <img src={report.image} alt={`Grafik ${key}`} className="w-full border rounded-xl shadow-xs object-contain bg-slate-50" />
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-xs font-semibold text-slate-700">
                                            <span className="text-slate-500 font-normal">Wali Kelas:</span> {report.phone ? <span className="font-mono text-slate-800 font-bold ml-1">{report.phone}</span> : <span className="text-amber-600 italic ml-1">No HP belum ada</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => handleCopyImage(report.image, key)} 
                                                className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs"
                                                title="Salin gambar grafik ke clipboard"
                                            >
                                                {copiedKey === key ? (
                                                    <>
                                                        <Check size={14} className="text-emerald-600" />
                                                        <span className="text-emerald-700">Tersalin</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy size={14} className="text-slate-500" />
                                                        <span>Salin Gambar</span>
                                                    </>
                                                )}
                                            </button>
                                            <button 
                                                onClick={() => handleManualSendWA(report.phone, report.caption)} 
                                                className="bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                                                title="Kirim pesan langsung via WhatsApp (manual redirect)"
                                            >
                                                <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                                                <span>Kirim WA</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-56 overflow-y-auto border border-slate-200 text-slate-700 custom-scrollbar">{report.caption}</div>
                                </div>
                            </div>
                         );
                    })}
                </div>
                <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100">
                    <button 
                        onClick={() => setIsPreviewModalOpen(false)} 
                        disabled={isMassSending}
                        className="w-full sm:w-auto bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        Tutup
                    </button>
                    <button 
                        onClick={handleSendMassWA} 
                        disabled={isMassSending || Object.keys(generatedReports).length === 0}
                        className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.98] disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all"
                        title="Kirim seluruh laporan yang ada di preview ini via Fonnte"
                    >
                        {isMassSending ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Send size={15} />
                        )}
                        <span>
                            {isMassSending 
                                ? (massSendProgress ? `Mengirim ${massSendProgress.current}/${massSendProgress.total} via Fonnte...` : 'Mengirim via Fonnte...') 
                                : `Kirim Semua via Fonnte (${Object.keys(generatedReports).length} Kelas)`}
                        </span>
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default AnalisisPerKelasPage;
