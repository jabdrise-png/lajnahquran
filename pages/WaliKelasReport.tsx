
import React, { useState, useMemo, useRef } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Marhalah, AttendanceStatus, Waktu, WaliKelas } from '../types';
import { ALL_ATTENDANCE_STATUS } from '../constants';
import { NotificationStore } from '../lib/NotificationStore';
import { format } from 'date-fns';
import { Send, Copy, CheckSquare, Square, BarChart2, AlertCircle, Clock } from 'lucide-react';
import html2canvas from 'html2canvas';

// Constants
const LOGO_URL = "https://i.ibb.co.com/KcYyzZRz/Tanpa-judul-1080-x-1080-piksel-20260116-084021-0000.png";

// --- Helper Functions ---
const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(date.setDate(diff));
};

const getEndOfWeek = (d: Date) => {
    const date = getStartOfWeek(d);
    date.setDate(date.getDate() + 6);
    return date;
};

const subMonthsManual = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - amount);
    return d;
};

const formatIndo = (date: Date, pattern: string) => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const days = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    if (pattern === 'eeee, d MMMM yyyy') {
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }
    if (pattern === 'd MMM') {
        return `${date.getDate()} ${months[date.getMonth()].substring(0, 3)}`;
    }
    if (pattern === 'd MMM yyyy') {
        return `${date.getDate()} ${months[date.getMonth()].substring(0, 3)} ${date.getFullYear()}`;
    }
    if (pattern === 'MMMM yyyy') {
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }
    if (pattern === 'MMM') {
        return months[date.getMonth()].substring(0, 3);
    }
    return format(date, pattern);
};

const WaliKelasReport: React.FC = () => {
    const { attendance, studentProgress, waliKelas, santri, loading, masterKelas , globalWaktuHalaqah , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    const [activeTab, setActiveTab] = useState<'harian' | 'mingguan' | 'bulanan'>('harian');
    
    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);

    // Filters
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedMarhalah, setSelectedMarhalah] = useState<string | 'all'>('all');
    
    // Selection State
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
    
    // Generating State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReports, setGeneratedReports] = useState<Record<string, { image: string, caption: string }>>({});
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    
    // Hidden refs for generation
    const hiddenReportRef = useRef<HTMLDivElement>(null);

    // --- Helper: Get List of Classes with Wali Kelas Info ---
    const classList = useMemo(() => {
        const list: { className: string, marhalah: string, wali: WaliKelas | undefined, totalStudents: number }[] = [];
        
        masterKelas.forEach(m => {
            const marhalahEnum = m.marhalah;
            if (selectedMarhalah !== 'all' && marhalahEnum !== selectedMarhalah) return;
            
            const c = m.nama_kelas;
            const wali = waliKelas.find(w => w.kelas === c && w.marhalah === marhalahEnum);
            const count = santri.filter(s => s.kelas === c && s.marhalah === marhalahEnum).length;
            list.push({ className: c, marhalah: marhalahEnum, wali, totalStudents: count });
            
        });
        
        return list;
    }, [selectedMarhalah, waliKelas, santri, masterKelas]);

    // --- Helper: Calculate Data per Class ---
    const reportData = useMemo(() => {
        return classList.map(cls => {
            // Filter Attendance based on Tab & Date
            let relevantAttendance = attendance.filter(a => 
                a.kelas === cls.className && 
                a.marhalah === cls.marhalah &&
                a.peran === 'Santri'
            );

            let periodLabel = "";
            let periodSubtitle = "";

            if (activeTab === 'harian') {
                relevantAttendance = relevantAttendance.filter(a => a.date === selectedDate);
                periodLabel = formatIndo(new Date(selectedDate), 'eeee, d MMMM yyyy');
                periodSubtitle = "LAPORAN HARIAN";
            } else if (activeTab === 'mingguan') {
                const start = getStartOfWeek(new Date(selectedDate));
                const end = getEndOfWeek(new Date(selectedDate));
                relevantAttendance = relevantAttendance.filter(a => a.date >= format(start, 'yyyy-MM-dd') && a.date <= format(end, 'yyyy-MM-dd'));
                periodLabel = `${formatIndo(start, 'd MMM')} - ${formatIndo(end, 'd MMM yyyy')}`;
                periodSubtitle = "LAPORAN MINGGUAN";
            } else {
                // Bulanan
                relevantAttendance = relevantAttendance.filter(a => a.date.startsWith(selectedMonth));
                const [y, m] = selectedMonth.split('-');
                periodLabel = formatIndo(new Date(parseInt(y), parseInt(m)-1), 'MMMM yyyy');
                periodSubtitle = "LAPORAN BULANAN";
            }

            // Calculate Stats Summary (Total H/I/S/A/T)
            const stats = {
                Hadir: relevantAttendance.filter(r => r.status?.toLowerCase() === 'hadir').length,
                Sakit: relevantAttendance.filter(r => r.status?.toLowerCase() === 'sakit').length,
                Izin: relevantAttendance.filter(r => r.status?.toLowerCase() === 'izin').length,
                Alpa: relevantAttendance.filter(r => r.status?.toLowerCase() === 'alpa').length,
                Terlambat: relevantAttendance.filter(r => r.status?.toLowerCase() === 'terlambat').length,
                TotalInput: relevantAttendance.length
            };

            // Calculate Breakdown per Session & Absent Details (For Daily)
            const sessionBreakdown: Record<string, typeof stats> = {};
            const sessionAbsenceDetails: Record<string, {name: string, status: string}[]> = {};
            
            globalWaktuHalaqah.forEach(sesi => {
                const sessionRecs = relevantAttendance.filter(a => a.waktu === sesi);
                
                sessionBreakdown[sesi] = {
                    Hadir: sessionRecs.filter(r => r.status?.toLowerCase() === 'hadir').length,
                    Sakit: sessionRecs.filter(r => r.status?.toLowerCase() === 'sakit').length,
                    Izin: sessionRecs.filter(r => r.status?.toLowerCase() === 'izin').length,
                    Alpa: sessionRecs.filter(r => r.status?.toLowerCase() === 'alpa').length,
                    Terlambat: sessionRecs.filter(r => r.status?.toLowerCase() === 'terlambat').length,
                    TotalInput: sessionRecs.length
                };

                // Get absent students for this session
                sessionAbsenceDetails[sesi] = sessionRecs
                    .filter(r => r.status?.toLowerCase() !== 'hadir')
                    .map(r => ({ name: r.nama, status: r.status }));
            });

            // --- MONTHLY SPECIFIC: Students Detail & Progress Trend ---
            let studentsDetail: any[] = [];
            let progressStats = { hafalan: 0, murojaah: 0, ziyadah: 0, count: 0 };
            let progressHistory: any[] = [];
            let maxAttendanceCount = 0; // Needed for chart scaling

            if (activeTab === 'bulanan') {
                // 1. Get List of Students in this Class
                const classStudents = santri.filter(s => s.kelas === cls.className && s.marhalah === cls.marhalah).sort((a,b) => a.nama.localeCompare(b.nama));
                
                // 2. Build Detail for each student
                studentsDetail = classStudents.map(s => {
                    const myAtt = relevantAttendance.filter(a => a.personId === s.id);
                    const myProg = studentProgress.filter(p => p.santri_id === s.id && p.month_key === selectedMonth);
                    
                    const getVal = (type: string) => myProg.find(p => p.progress_type === type)?.value || '-';
                    
                    if (myAtt.length > maxAttendanceCount) maxAttendanceCount = myAtt.length;

                    return {
                        name: s.nama,
                        stats: {
                            H: myAtt.filter(r => r.status?.toLowerCase() === 'hadir').length,
                            I: myAtt.filter(r => r.status?.toLowerCase() === 'izin').length,
                            S: myAtt.filter(r => r.status?.toLowerCase() === 'sakit').length,
                            A: myAtt.filter(r => r.status?.toLowerCase() === 'alpa').length,
                            T: myAtt.filter(r => r.status?.toLowerCase() === 'terlambat').length,
                            Total: myAtt.length
                        },
                        progress: {
                            hafalan: getVal('Hafalan'),
                            murojaah: getVal('Murojaah'),
                            ziyadah: getVal('Ziyadah')
                        }
                    };
                });
                
                // Ensure maxAttendanceCount has a minimum for chart scaling
                maxAttendanceCount = Math.max(maxAttendanceCount, 5);

                // 3. Progress Stats (Avg)
                const currentProgress = studentProgress.filter(p => 
                    p.month_key === selectedMonth &&
                    santri.some(s => s.id === p.santri_id && s.kelas === cls.className && s.marhalah === cls.marhalah)
                );
                
                const calculateAvg = (type: string) => {
                    const recs = currentProgress.filter(p => p.progress_type === type);
                    if (recs.length === 0) return 0;
                    const sum = recs.reduce((a, b) => a + parseFloat(b.value || '0'), 0);
                    return parseFloat((sum / recs.length).toFixed(1));
                };

                progressStats = {
                    hafalan: calculateAvg('Hafalan'),
                    murojaah: calculateAvg('Murojaah'),
                    ziyadah: calculateAvg('Ziyadah'),
                    count: currentProgress.length
                };

                // 4. Progress History (3 Months)
                const [currY, currM] = selectedMonth.split('-').map(Number);
                const dateObj = new Date(currY, currM - 1);
                
                // Urutan: 2 bulan lalu, 1 bulan lalu, bulan ini (Jan, Feb, Mar)
                for (let i = 2; i >= 0; i--) {
                    const d = subMonthsManual(dateObj, i);
                    const mKey = format(d, 'yyyy-MM');
                    const label = formatIndo(d, 'MMMM').toUpperCase(); // JANUARI
                    
                    const histProgress = studentProgress.filter(p => 
                        p.month_key === mKey &&
                        santri.some(s => s.id === p.santri_id && s.kelas === cls.className && s.marhalah === cls.marhalah)
                    );
                     const getAvg = (t: string) => {
                         const r = histProgress.filter(p => p.progress_type === t);
                         return r.length ? r.reduce((a, b) => a + parseFloat(b.value), 0) / r.length : 0;
                     };

                    progressHistory.push({
                        name: label,
                        Hafalan: parseFloat(getAvg('Hafalan').toFixed(1)),
                        Murojaah: parseFloat(getAvg('Murojaah').toFixed(1)),
                        Ziyadah: parseFloat(getAvg('Ziyadah').toFixed(1))
                    });
                }
            }


            // --- CAPTION GENERATION (CLEAN & READABLE) ---
            let caption = cls.wali ? `Kepada Yth. Ustadz/Ustadzah *${cls.wali.nama}*\n(Wali Kelas ${cls.className})\n\n` : '';
            caption += `*${activeTab === 'harian' ? 'LAPORAN HARIAN' : (activeTab === 'mingguan' ? 'LAPORAN MINGGUAN' : 'LAPORAN BULANAN')}*\n`;
            caption += `${periodLabel}\n`;
            caption += `--------------------------------\n`;
            caption += `Kelas : ${cls.className} (${cls.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === cls.marhalah_id)?.nama || cls.marhalah : cls.marhalah})\n`;
            if (cls.wali) caption += `Wali  : ${cls.wali.nama}\n`;
            caption += `--------------------------------\n\n`;
            
            if (activeTab === 'harian') {
                caption += `*STATISTIK KEHADIRAN*\n`;
                caption += `Hadir : ${stats.Hadir}\n`;
                caption += `Sakit : ${stats.Sakit}\n`;
                caption += `Izin  : ${stats.Izin}\n`;
                caption += `Alpa  : ${stats.Alpa}\n`;
                caption += `Telat : ${stats.Terlambat}\n\n`;
                
                caption += `*DETAIL KETIDAKHADIRAN PER SESI*\n`;
                
                let hasAbsence = false;
                globalWaktuHalaqah.forEach((sesi, idx) => {
                    const absents = sessionAbsenceDetails[sesi];
                    caption += `\n${idx + 1}. ${sesi.toUpperCase()}`;
                    if (absents && absents.length > 0) {
                        hasAbsence = true;
                        absents.forEach(s => {
                            caption += `\n   - ${s.name} (${s.status})`;
                        });
                    } else {
                        caption += `\n   (Semua Hadir)`;
                    }
                    caption += `\n`; // Add extra spacing between sessions
                });

            } else if (activeTab === 'bulanan') {
                caption += `*RATA-RATA KELAS*\n`;
                caption += `Hafalan  : ${progressStats.hafalan} Juz\n`;
                caption += `Murojaah : ${progressStats.murojaah} Juz\n`;
                caption += `Ziyadah  : ${progressStats.ziyadah} Halaman\n\n`;

                caption += `*RINCIAN PER SANTRI*\n`;
                caption += `Ket: H(Hadir), S(Sakit), I(Izin), A(Alpa), T(Terlambat)\n\n`;
                
                studentsDetail.forEach((s, idx) => {
                    caption += `${idx + 1}. *${s.name}*\n`;
                    caption += `   Absensi : H:${s.stats.H} | S:${s.stats.S} | I:${s.stats.I} | A:${s.stats.A} | T:${s.stats.T}\n`;
                    caption += `   Capaian : Ziyadah: ${s.progress.ziyadah} | Murojaah: ${s.progress.murojaah} | Hafalan: ${s.progress.hafalan}\n\n`;
                });
            }

            caption += `--------------------------------\n`;
            caption += `Digenerate oleh Sistem Informasi Tahfidz`;

            return {
                ...cls,
                key: `${cls.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === cls.marhalah_id)?.nama || cls.marhalah : cls.marhalah}-${cls.className}`,
                periodLabel,
                periodSubtitle,
                stats,
                sessionBreakdown,
                sessionAbsenceDetails,
                progressStats,
                progressHistory,
                studentsDetail,
                maxAttendanceCount, // Pass this for scaling
                caption
            };
        });
    }, [classList, attendance, activeTab, selectedDate, selectedMonth, studentProgress, santri]);

    // --- Actions ---

    const toggleClassSelection = (key: string) => {
        setSelectedClasses(prev => 
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const toggleAllClasses = () => {
        if (selectedClasses.length === reportData.length) {
            setSelectedClasses([]);
        } else {
            setSelectedClasses(reportData.map(r => r.key));
        }
    };

    const generateImages = async () => {
        setIsGenerating(true);
        setGeneratedReports({}); // Reset
        
        // Wait for DOM
        await new Promise(r => setTimeout(r, 200));

        const newReports: Record<string, { image: string, caption: string }> = {};

        for (const item of reportData) {
            if (!selectedClasses.includes(item.key)) continue;

            const element = document.getElementById(`report-card-${item.key}`);
            if (element) {
                try {
                    const canvas = await html2canvas(element, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        useCORS: true
                    });
                    newReports[item.key] = {
                        image: canvas.toDataURL('image/png'),
                        caption: item.caption
                    };
                } catch (e) {
                    console.error("Failed to generate", item.key, e);
                }
            }
        }

        setGeneratedReports(newReports);
        setIsGenerating(false);
        setIsPreviewModalOpen(true);
    };

    const handleCopyImage = async (dataUrl: string) => {
         try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            alert("Gambar disalin! Paste (Ctrl+V) di WhatsApp Web.");
        } catch (e) {
            alert("Gagal copy gambar. Browser tidak support.");
        }
    };

    const handleSendWA = (phone: string | undefined, caption: string) => {
        if (!phone) {
            alert("No HP Wali Kelas tidak tersedia.");
            return;
        }
        let formatted = phone.replace(/\D/g, '');
        if (formatted.startsWith('0')) formatted = '62' + formatted.substring(1);
        NotificationStore.addNotification(`Membuka WhatsApp untuk mengirim pesan ke ${formatted}...`, 'info');
        window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(caption)}`, '_blank');
    };

    if (loading) return <p>Loading...</p>;

    return (
        <div className="space-y-6">
            <Card title="Laporan Wali Kelas">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 mb-6">
                    {(['harian', 'mingguan', 'bulanan'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                                activeTab === tab ? 'border-secondary text-secondary' : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Laporan {tab}
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50 p-4 rounded-lg">
                    {activeTab === 'bulanan' ? (
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Bulan</label>
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm sm:text-sm" />
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Tanggal {activeTab === 'mingguan' ? '(Pilih tanggal dalam minggu)' : ''}</label>
                            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm sm:text-sm" />
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Filter Marhalah</label>
                        <select value={selectedMarhalah} onChange={e => setSelectedMarhalah(e.target.value)} className="mt-1 block w-full border-slate-300 rounded-md shadow-sm sm:text-sm">
                            <option value="all">Semua Marhalah</option>
                            {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button 
                            onClick={generateImages}
                            disabled={selectedClasses.length === 0 || isGenerating}
                            className="w-full bg-secondary text-white font-bold py-2 px-4 rounded-lg hover:bg-accent disabled:bg-slate-300 transition-colors flex items-center justify-center shadow-sm"
                        >
                            {isGenerating ? 'Generating...' : `Preview & Kirim (${selectedClasses.length})`}
                        </button>
                    </div>
                </div>

                {/* Class Selection Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                    <button onClick={toggleAllClasses}>
                                        {selectedClasses.length === reportData.length && reportData.length > 0 ? <CheckSquare size={18} className="text-secondary"/> : <Square size={18}/>}
                                    </button>
                                </th>
                                <th className="px-4 py-3">Kelas / Marhalah</th>
                                <th className="px-4 py-3">Wali Kelas</th>
                                <th className="px-4 py-3 text-center">Kehadiran (H/S/I/A)</th>
                                {activeTab === 'bulanan' && <th className="px-4 py-3 text-center">Avg Hafalan</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {reportData.map((item) => (
                                <tr key={item.key} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => toggleClassSelection(item.key)}>
                                    <td className="px-4 py-3">
                                        {selectedClasses.includes(item.key) ? <CheckSquare size={18} className="text-secondary"/> : <Square size={18} className="text-slate-300"/>}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        {item.className} <span className="text-xs font-normal text-slate-500 ml-1">(<MarhalahLabel text={item.marhalah} id={item.marhalah_id} />)</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.wali ? (
                                            <div>
                                                <div className="text-slate-800">{item.wali.nama}</div>
                                                <div className="text-xs text-slate-400">{item.wali.no_hp || '-'}</div>
                                            </div>
                                        ) : <span className="text-red-400 text-xs italic">Belum diatur</span>}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex justify-center gap-2 text-xs font-semibold">
                                            <span className="text-green-600 bg-green-50 px-1.5 rounded">{item.stats.Hadir}</span>
                                            <span className="text-yellow-600 bg-yellow-50 px-1.5 rounded">{item.stats.Sakit}</span>
                                            <span className="text-blue-600 bg-blue-50 px-1.5 rounded">{item.stats.Izin}</span>
                                            <span className="text-red-600 bg-red-50 px-1.5 rounded">{item.stats.Alpa}</span>
                                        </div>
                                    </td>
                                    {activeTab === 'bulanan' && (
                                        <td className="px-4 py-3 text-center font-mono text-xs">
                                            {item.progressStats.hafalan} Juz
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {reportData.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-400">Tidak ada data kelas.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Hidden Generation Area */}
            <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none" ref={hiddenReportRef}>
                {reportData.map(item => (
                    <div 
                        key={`report-card-${item.key}`} 
                        id={`report-card-${item.key}`}
                        className="bg-white p-6 w-[600px]" 
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        {/* Header Image */}
                        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-5">
                            <div className="flex items-center">
                                <img src={LOGO_URL} alt="Logo" className="w-14 h-14 object-contain mr-4" />
                                <div>
                                    <h1 className="text-2xl font-black text-slate-900 leading-none">MA'HAD AL FARUQ</h1>
                                    <p className="text-xs text-slate-500 font-bold tracking-[0.2em] mt-1">ASSALAFY KALIBAGOR</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{item.periodSubtitle}</div>
                                <div className="text-lg font-bold text-slate-800 whitespace-nowrap">{item.periodLabel}</div>
                            </div>
                        </div>

                        {/* Class Info Box */}
                        <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200 flex justify-between items-center shadow-sm">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Kelas</p>
                                <p className="text-xl font-bold text-slate-800">{item.className} <span className="text-sm font-normal text-slate-500">(<MarhalahLabel text={item.marhalah} id={item.marhalah_id} />)</span></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Wali Kelas</p>
                                <p className="text-base font-semibold text-slate-800">{item.wali?.nama || '-'}</p>
                            </div>
                        </div>

                        {/* --- DAILY REPORT CHART: GROUPED BARS (SYMMETRICAL) --- */}
                        {activeTab === 'harian' && (
                            <div className="mb-6">
                                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center uppercase tracking-wide">
                                    <BarChart2 size={16} className="mr-2 text-slate-600"/> Grafik Kehadiran Per Sesi
                                </h3>
                                
                                {/* Grid container for 4 sessions */}
                                <div className="grid grid-cols-4 gap-4 h-48 border-b border-slate-300 pb-0 bg-white">
                                    {globalWaktuHalaqah.map(waktu => {
                                        const s = item.sessionBreakdown[waktu];
                                        const maxVal = Math.max(s.Hadir, s.Sakit, s.Izin, s.Alpa, s.Terlambat, 1); // For scaling
                                        
                                        return (
                                            <div key={waktu} className="flex flex-col h-full border-r border-slate-100 last:border-r-0">
                                                {/* Chart Area */}
                                                <div className="flex-1 flex items-end justify-center gap-1 pb-2 px-1">
                                                    {/* H */}
                                                    <div className="flex flex-col items-center group">
                                                        <div style={{height: `${(s.Hadir/maxVal)*80}%`}} className="w-2.5 bg-green-500 rounded-t-sm"></div>
                                                    </div>
                                                    {/* S */}
                                                    <div className="flex flex-col items-center group">
                                                         <div style={{height: `${(s.Sakit/maxVal)*80}%`}} className="w-2.5 bg-yellow-400 rounded-t-sm"></div>
                                                    </div>
                                                    {/* I */}
                                                    <div className="flex flex-col items-center group">
                                                         <div style={{height: `${(s.Izin/maxVal)*80}%`}} className="w-2.5 bg-blue-500 rounded-t-sm"></div>
                                                    </div>
                                                    {/* A */}
                                                    <div className="flex flex-col items-center group">
                                                         <div style={{height: `${(s.Alpa/maxVal)*80}%`}} className="w-2.5 bg-red-500 rounded-t-sm"></div>
                                                    </div>
                                                    {/* T */}
                                                    <div className="flex flex-col items-center group">
                                                         <div style={{height: `${(s.Terlambat/maxVal)*80}%`}} className="w-2.5 bg-orange-400 rounded-t-sm"></div>
                                                    </div>
                                                </div>
                                                
                                                {/* Label */}
                                                <div className="text-center pt-2 border-t border-slate-200 bg-slate-50 py-2">
                                                    <div className="text-[10px] font-black text-slate-700 uppercase tracking-wide">{waktu}</div>
                                                    <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                                                        {s.TotalInput > 0 ? `${Math.round(((s.Hadir + s.Terlambat)/s.TotalInput)*100)}% H` : '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                {/* Legend */}
                                <div className="flex justify-center gap-4 mt-4 bg-slate-50 py-2 rounded-lg border border-slate-100">
                                    <div className="flex items-center"><div className="w-3 h-3 bg-green-500 mr-1.5 rounded-sm"></div><span className="text-[10px] font-bold text-slate-600">Hadir</span></div>
                                    <div className="flex items-center"><div className="w-3 h-3 bg-yellow-400 mr-1.5 rounded-sm"></div><span className="text-[10px] font-bold text-slate-600">Sakit</span></div>
                                    <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 mr-1.5 rounded-sm"></div><span className="text-[10px] font-bold text-slate-600">Izin</span></div>
                                    <div className="flex items-center"><div className="w-3 h-3 bg-red-500 mr-1.5 rounded-sm"></div><span className="text-[10px] font-bold text-slate-600">Alpa</span></div>
                                    <div className="flex items-center"><div className="w-3 h-3 bg-orange-400 mr-1.5 rounded-sm"></div><span className="text-[10px] font-bold text-slate-600">Telat</span></div>
                                </div>
                            </div>
                        )}

                        {/* --- MONTHLY REPORT CONTENT: STACKED COLUMN & GROUPED PROGRESS --- */}
                        {activeTab === 'bulanan' && (
                            <div className="space-y-10">
                                {/* 1. Grafik Kehadiran Per Anak (Vertical Stacked Bar) */}
                                <div>
                                    {/* Legend for Stacked Bar */}
                                    <div className="flex justify-center gap-3 mb-4">
                                         <div className="flex items-center"><div className="w-2.5 h-2.5 bg-red-500 mr-1 rounded-[1px]"></div><span className="text-[10px] text-slate-600">Alpa</span></div>
                                         <div className="flex items-center"><div className="w-2.5 h-2.5 bg-green-500 mr-1 rounded-[1px]"></div><span className="text-[10px] text-slate-600">Hadir</span></div>
                                         <div className="flex items-center"><div className="w-2.5 h-2.5 bg-blue-500 mr-1 rounded-[1px]"></div><span className="text-[10px] text-slate-600">Izin</span></div>
                                         <div className="flex items-center"><div className="w-2.5 h-2.5 bg-yellow-400 mr-1 rounded-[1px]"></div><span className="text-[10px] text-slate-600">Sakit</span></div>
                                         <div className="flex items-center"><div className="w-2.5 h-2.5 bg-orange-400 mr-1 rounded-[1px]"></div><span className="text-[10px] text-slate-600">Terlambat</span></div>
                                    </div>

                                    <div className="relative h-64 w-full bg-white border-b border-slate-300 flex items-end justify-between px-2 pt-4">
                                        {/* Y-Axis Grid Lines */}
                                        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between px-0 pb-0">
                                            {[...Array(6)].map((_, i) => (
                                                <div key={i} className="w-full border-t border-slate-100 h-0 relative">
                                                    {i % 2 === 0 && <span className="absolute -left-4 -top-2 text-[8px] text-slate-300">{item.maxAttendanceCount - Math.round((i/5)*item.maxAttendanceCount)}</span>}
                                                </div>
                                            ))}
                                        </div>

                                        {item.studentsDetail.map((s, idx) => {
                                            const t = Math.max(s.stats.Total, 1);
                                            // Scale heights based on max attendance count in the class to keep bars proportional
                                            const scaleFactor = item.maxAttendanceCount > 0 ? (t / item.maxAttendanceCount) : 0;
                                            
                                            // Calculate percentages within the bar
                                            const pH = (s.stats.H / t) * 100;
                                            const pI = (s.stats.I / t) * 100;
                                            const pS = (s.stats.S / t) * 100;
                                            const pA = (s.stats.A / t) * 100;
                                            const pT = (s.stats.T / t) * 100;

                                            return (
                                                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full z-10 group px-[1px]">
                                                    {/* Stacked Column */}
                                                    <div className="w-full flex flex-col w-full max-w-[14px]" style={{height: `${(t / item.maxAttendanceCount) * 100}%`}}>
                                                        {/* Alpa (Top) */}
                                                        {s.stats.A > 0 && <div style={{height: `${pA}%`}} className="w-full bg-red-500"></div>}
                                                        {/* Terlambat */}
                                                        {s.stats.T > 0 && <div style={{height: `${pT}%`}} className="w-full bg-orange-400"></div>}
                                                        {/* Sakit */}
                                                        {s.stats.S > 0 && <div style={{height: `${pS}%`}} className="w-full bg-yellow-400"></div>}
                                                        {/* Izin */}
                                                        {s.stats.I > 0 && <div style={{height: `${pI}%`}} className="w-full bg-blue-500"></div>}
                                                        {/* Hadir (Bottom) */}
                                                        {s.stats.H > 0 && <div style={{height: `${pH}%`}} className="w-full bg-green-500"></div>}
                                                    </div>
                                                    
                                                    {/* Rotated Name */}
                                                    <div className="absolute bottom-0 translate-y-full pt-2">
                                                         <div className="text-[7px] font-medium text-slate-600 whitespace-nowrap -rotate-45 origin-top-left w-0 overflow-visible">
                                                            {s.name.length > 12 ? s.name.substring(0, 12) + '...' : s.name}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Spacing for rotated text */}
                                    <div className="h-16"></div> 
                                </div>

                                {/* 2. Grafik Tren Perkembangan (Grouped Bars per Month) */}
                                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                                    <h3 className="text-center font-bold text-slate-600 text-xs mb-6 uppercase">RATA-RATA PERKEMBANGAN SANTRI 3 BULAN TERAKHIR</h3>
                                    
                                    <div className="flex justify-around items-end h-40 border-b border-slate-300 px-6 pb-0">
                                        {item.progressHistory.map((h, i) => (
                                            <div key={i} className="flex flex-col items-center justify-end h-full w-1/3 px-2 border-r border-dashed border-slate-200 last:border-0 relative">
                                                <div className="flex items-end justify-center w-full gap-2 h-full pb-0">
                                                     {/* Ziyadah (Blue) */}
                                                    <div className="w-5 bg-blue-500 rounded-t-sm relative group flex flex-col justify-end items-center" style={{height: `${Math.min(100, (h.Ziyadah/10)*100)}%`}}>
                                                        <span className="text-[9px] font-bold text-slate-700 -mt-4 mb-0.5">{h.Ziyadah}</span>
                                                    </div>
                                                    {/* Murojaah (Orange) */}
                                                    <div className="w-5 bg-orange-400 rounded-t-sm relative group flex flex-col justify-end items-center" style={{height: `${Math.min(100, (h.Murojaah/30)*100)}%`}}>
                                                         <span className="text-[9px] font-bold text-slate-700 -mt-4 mb-0.5">{h.Murojaah}</span>
                                                    </div>
                                                    {/* Hafalan (Green) */}
                                                    <div className="w-5 bg-green-500 rounded-t-sm relative group flex flex-col justify-end items-center" style={{height: `${Math.min(100, (h.Hafalan/30)*100)}%`}}>
                                                         <span className="text-[9px] font-bold text-slate-700 -mt-4 mb-0.5">{h.Hafalan}</span>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-wider">{h.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {/* Bottom Legend for Progress */}
                                    <div className="flex justify-center gap-6 mt-4">
                                        <div className="text-center">
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">JUMLAH</div>
                                            <div className="text-[10px] font-bold text-blue-600">ZIYADAH</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">JUMLAH</div>
                                            <div className="text-[10px] font-bold text-orange-500">MUROJAAH</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">JUMLAH</div>
                                            <div className="text-[10px] font-bold text-green-600">HAFALAN</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-8 pt-3 border-t border-slate-200 flex justify-between items-center">
                            <p className="text-[9px] text-slate-400 font-medium">Sistem Informasi Tahfidz</p>
                            <p className="text-[9px] text-slate-400 italic">{format(new Date(), 'dd MMM yyyy HH:mm')}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Preview & Send Modal */}
            <Modal isOpen={isPreviewModalOpen} onClose={() => setIsPreviewModalOpen(false)} title="Preview & Kirim Laporan" maxWidth="2xl">
                <div className="space-y-6 max-h-[70vh] overflow-y-auto p-2">
                    {Object.entries(generatedReports).map(([key, data]) => {
                         // Fix: Explicitly type data to resolve 'unknown' error
                         const reportDataTyped = data as { image: string, caption: string, phone?: string };
                         
                         const [marhalah, kelas] = key.split('-');
                         return (
                            <div key={key} className="border-b border-slate-200 pb-6 mb-6 last:border-0 last:mb-0">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-lg text-slate-800">{kelas} ({marhalah})</h3>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleCopyImage(reportDataTyped.image)} 
                                            className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-xs font-bold flex items-center hover:bg-slate-50"
                                        >
                                            <Copy size={14} className="mr-1"/> Gambar
                                        </button>
                                        <button 
                                            onClick={() => handleSendWA(reportDataTyped.phone, reportDataTyped.caption)} 
                                            className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center hover:bg-green-700"
                                        >
                                            <Send size={14} className="mr-1"/> Kirim WA
                                        </button>
                                    </div>
                                </div>
                                <div className="border rounded-lg overflow-hidden shadow-sm mb-3">
                                    <img src={reportDataTyped.image} alt="Report Preview" className="w-full h-auto" />
                                </div>
                                <div className="bg-slate-100 p-3 rounded text-xs font-mono text-slate-600 whitespace-pre-wrap max-h-24 overflow-y-auto">
                                    {reportDataTyped.caption}
                                </div>
                                {!reportDataTyped.phone && (
                                    <div className="flex items-center text-xs text-red-500 bg-red-50 p-2 rounded mt-2">
                                        <AlertCircle size={14} className="mr-1"/> Nomor HP Wali Kelas tidak tersedia.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="pt-4 flex justify-end">
                    <button onClick={() => setIsPreviewModalOpen(false)} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg hover:bg-slate-50">Tutup</button>
                </div>
            </Modal>
        </div>
    );
};

export default WaliKelasReport;
