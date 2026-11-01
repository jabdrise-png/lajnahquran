
import React, { useState, useMemo } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { NotificationStore } from '../lib/NotificationStore';
import { Marhalah, AttendanceStatus } from '../types';
import { format } from 'date-fns';
import { Send, Search, CheckSquare, Square, MessageCircleHeart, AlertCircle, Copy, Edit3 } from 'lucide-react';
import { getEvaluationPeriods } from '../lib/utils';

interface ReportMessage {
    studentName: string;
    parentName: string;
    phone: string;
    message: string;
}

const formatDateIndo = (dateInput: Date | string) => {
    const date = new Date(dateInput);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const day = date.getDate().toString().padStart(2, '0');
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const DEFAULT_NOTE = "Kami memohon doa dari Bapak agar ananda senantiasa diberikan *kemudahan, keistiqamahan, serta keberkahan dalam menuntut ilmu dan menjaga hafalan Al-Qur’an*.";

const WaliSantriReport: React.FC = () => {
    const { santri, attendance, studentProgress, loading, error, masterKelas , masterMarhalahs, masterKelasRelasi, appSettings, orgName} = useSupabaseData();

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);

    // Filters
    const [dateRange, setDateRange] = useState({ 
        start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'), // Start of month
        end: format(new Date(), 'yyyy-MM-dd') // Today
    });
    const [selectedMarhalah, setSelectedMarhalah] = useState<string | 'all'>('all');
    const [selectedKelas, setSelectedKelas] = useState<string | 'all'>('all');
    const [searchName, setSearchName] = useState('');
    
    // Notes per Student (Dictionary: ID -> Note)
    const [studentNotes, setStudentNotes] = useState<Record<number, string>>({});

    // Selection
    const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

    // Modal State
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [generatedMessages, setGeneratedMessages] = useState<ReportMessage[]>([]);

    // --- Derived Data ---

    const filteredSantri = useMemo(() => {
        return santri.filter(s => {
            if (s.kelas === '-') return false;
            if (selectedMarhalah !== 'all' && s.marhalah !== selectedMarhalah) return false;
            if (selectedKelas !== 'all' && s.kelas !== selectedKelas) return false;
            if (searchName && !s.nama.toLowerCase().includes(searchName.toLowerCase())) return false;
            return true;
        }).sort((a, b) => a.nama.localeCompare(b.nama));
    }, [santri, selectedMarhalah, selectedKelas, searchName]);

    // --- Actions ---

    const toggleStudentSelection = (id: number) => {
        setSelectedStudentIds(prev => 
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedStudentIds.length === filteredSantri.length) {
            setSelectedStudentIds([]);
        } else {
            setSelectedStudentIds(filteredSantri.map(s => s.id));
        }
    };

    const handleNoteChange = (id: number, text: string) => {
        setStudentNotes(prev => ({
            ...prev,
            [id]: text
        }));
    };

    const generateReports = () => {
        const messages: ReportMessage[] = [];
        const masterPeriods = getEvaluationPeriods(appSettings);

        selectedStudentIds.forEach(studentId => {
            const student = santri.find(s => s.id === studentId);
            if (!student) return;

            // 1. Calculate Attendance
            const studentAttendance = attendance.filter(a => 
                a.personId === student.id &&
                a.peran === 'Santri' &&
                a.date >= dateRange.start &&
                a.date <= dateRange.end
            );

            const stats: Record<string, number> = {
                'Hadir': 0,
                'Izin': 0,
                'Sakit': 0,
                'Alpa': 0,
                'Terlambat': 0
            };

            studentAttendance.forEach(a => {
                if (a.status !== undefined) stats[a.status] = (stats[a.status] || 0) + 1;
            });

            // 2. Calculate Progress (Average/Latest in Period)
            const relevantProgress = studentProgress.filter(p => 
                p.santri_id === student.id &&
                p.month_key >= dateRange.start.slice(0, 7) && 
                p.month_key <= dateRange.end.slice(0, 7)
            );

            const getVal = (type: string, isAvg: boolean = false) => {
                const recs = relevantProgress.filter(p => p.progress_type === type);
                if (recs.length === 0) return '–'; // Dash en-dash for empty
                
                if (isAvg) {
                    const sum = recs.reduce((a, b) => a + parseFloat(b.value || '0'), 0);
                    return (sum / recs.length).toFixed(1);
                } else {
                    recs.sort((a, b) => {
                        const periodA = masterPeriods.find(mp => mp.id === a.month_key);
                        const periodB = masterPeriods.find(mp => mp.id === b.month_key);
                        const dateA = periodA?.startDate ? new Date(periodA.startDate).getTime() : 0;
                        const dateB = periodB?.startDate ? new Date(periodB.startDate).getTime() : 0;
                        if (dateA !== dateB) return dateB - dateA;
                        return b.month_key.localeCompare(a.month_key);
                    });
                    return recs[0].value;
                }
            };

            const hafalanVal = getVal('Total Hafalan') !== '–' ? getVal('Total Hafalan') : getVal('Hafalan Depan');
            const murojaahVal = getVal('Murojaah', true);
            const ziyadahVal = getVal('Ziyadah', true);

            // 3. Construct Message
            const parentName = student.nama_wali || 'Bapak/Ibu';
            const startDateFormatted = formatDateIndo(dateRange.start);
            const endDateFormatted = formatDateIndo(dateRange.end);
            
            // Get custom note or default
            const note = studentNotes[student.id] !== undefined ? studentNotes[student.id] : DEFAULT_NOTE;

            // Template Persis
            let msg = `Assalamu’alaikum warahmatullahi wabarakatuh.\n\n`;
            msg += `Kepada Ykh.\n${parentName}\nWali santri dari *Ananda ${student.nama}*\n\n`;
            msg += `Bismillah, semoga Allah senantiasa melimpahkan rahmat dan keberkahan kepada kita semua.\n\n`;
            msg += `Kami dari *Tim Lajnah Al-Qur’an ${orgName || "Ma'had"}* bermaksud menyampaikan laporan singkat terkait *perkembangan ananda ${student.nama} di bidang tahfidz Al-Qur’an* selama periode *${startDateFormatted} s.d. ${endDateFormatted}*, dengan rincian sebagai berikut:\n\n`;
            
            msg += `*1. Statistik Absensi Halaqah Tahfidz*\n\n`;
            msg += `* Hadir: ${stats.Hadir} kali\n`;
            msg += `* Izin: ${stats.Izin} kali\n`;
            msg += `* Sakit: ${stats.Sakit} kali\n`;
            msg += `* Alpa: ${stats.Alpa} kali\n`;
            msg += `* Terlambat: ${stats.Terlambat} kali\n\n`;
            
            msg += `*2. Perkembangan Hafalan*\n\n`;
            msg += `* Total hafalan: *${hafalanVal} juz*\n`;
            msg += `* Rata-rata muroja’ah: ${murojaahVal !== '–' ? murojaahVal + ' juz' : '–'}\n`;
            msg += `* Rata-rata ziyādah: ${ziyadahVal !== '–' ? ziyadahVal + ' hal' : '–'}\n\n`;
            
            msg += `*3. Catatan dari Kami*\n`;
            msg += `${note}\n\n`;
            
            msg += `Demikian laporan ini kami sampaikan. Atas perhatian dan kerja sama Bapak, kami ucapkan *jazākumullāhu khairan*.\n\n`;
            msg += `Wassalamu’alaikum warahmatullahi wabarakatuh.`;

            messages.push({
                studentName: student.nama,
                parentName: parentName,
                phone: student.no_hp_wali || '',
                message: msg
            });
        });

        setGeneratedMessages(messages);
        setIsPreviewOpen(true);
    };

    const handleSendWA = (phone: string, message: string) => {
        if (!phone) {
            alert("Nomor HP Wali Santri tidak tersedia.");
            return;
        }
        let formatted = phone.replace(/\D/g, '');
        if (formatted.startsWith('0')) formatted = '62' + formatted.substring(1);
        NotificationStore.addNotification(`Membuka WhatsApp untuk mengirim pesan ke ${formatted}...`, 'info');
        window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleCopyMessage = async (msg: string) => {
        try {
            await navigator.clipboard.writeText(msg);
            alert("Pesan disalin ke clipboard!");
        } catch (e) {
            alert("Gagal menyalin pesan.");
        }
    };

    if (loading) return <p>Loading...</p>;
    if (error) return <p className="text-error">Error: {error}</p>;

    return (
        <div className="space-y-6">
            <Card title="Laporan Wali Santri (WhatsApp)">
                
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="md:col-span-2 lg:col-span-1">
                        <label className="block text-sm font-medium text-slate-700">Periode Laporan</label>
                        <div className="flex items-center space-x-2 mt-1">
                            <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({...p, start: e.target.value}))} className="w-full border-slate-300 rounded-md shadow-sm text-sm"/>
                            <span className="text-slate-500">-</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({...p, end: e.target.value}))} className="w-full border-slate-300 rounded-md shadow-sm text-sm"/>
                        </div>
                    </div>
                    <div>
                         <label htmlFor="marhalah" className="block text-sm font-medium text-slate-700">Marhalah</label>
                        <select id="marhalah" value={selectedMarhalah} onChange={e => { setSelectedMarhalah(e.target.value); setSelectedKelas('all');}} className="mt-1 block w-full pl-3 pr-10 py-2 text-sm border-slate-300 focus:outline-none focus:ring-secondary focus:border-secondary rounded-md shadow-sm">
                            <option value="all">Semua Marhalah</option>
                            {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                         <label htmlFor="kelas" className="block text-sm font-medium text-slate-700">Kelas</label>
                        <select id="kelas" disabled={selectedMarhalah === 'all'} value={selectedKelas} onChange={e => setSelectedKelas(e.target.value as string | 'all')} className="mt-1 block w-full pl-3 pr-10 py-2 text-sm border-slate-300 focus:outline-none focus:ring-secondary focus:border-secondary rounded-md shadow-sm disabled:bg-slate-100">
                            <option value="all">Semua Kelas</option>
                            {selectedMarhalah !== 'all' && masterKelas.filter(m => m.marhalah === selectedMarhalah).map(m => m.nama_kelas).map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="nama" className="block text-sm font-medium text-slate-700">Cari Nama Santri</label>
                        <div className="relative mt-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={16} className="text-slate-400" />
                            </div>
                            <input type="text" id="nama" placeholder="Ketik nama..." value={searchName} onChange={e => setSearchName(e.target.value)} className="block w-full pl-10 border border-slate-300 rounded-md shadow-sm py-2 px-3 text-sm"/>
                        </div>
                    </div>
                </div>

                {/* Selection Table */}
                <div className="flex justify-between items-center mb-4">
                    <div className="text-sm text-slate-600">
                        Dipilih: <span className="font-bold text-secondary">{selectedStudentIds.length}</span> santri
                    </div>
                    <button 
                        onClick={generateReports} 
                        disabled={selectedStudentIds.length === 0}
                        className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-700 transition-colors flex items-center shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                        <MessageCircleHeart size={18} className="mr-2" />
                        Generate Laporan
                    </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                    <button onClick={toggleSelectAll}>
                                        {selectedStudentIds.length === filteredSantri.length && filteredSantri.length > 0 ? <CheckSquare size={18} className="text-secondary"/> : <Square size={18}/>}
                                    </button>
                                </th>
                                <th className="px-6 py-3 w-1/4">Nama Santri</th>
                                <th className="px-6 py-3">Wali / No HP</th>
                                <th className="px-6 py-3 w-1/2">Catatan Khusus (Edit per Santri)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredSantri.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors" onClick={() => toggleStudentSelection(s.id)}>
                                    <td className="px-4 py-3 cursor-pointer">
                                        {selectedStudentIds.includes(s.id) ? <CheckSquare size={18} className="text-secondary"/> : <Square size={18} className="text-slate-300"/>}
                                    </td>
                                    <td className="px-6 py-3 font-medium text-slate-900 cursor-pointer">
                                        {s.nama}
                                        <div className="text-xs text-slate-400 mt-0.5"><KelasLabel text={s.kelas} id={s.kelas_id} /> - <MarhalahLabel text={s.marhalah} id={s.marhalah_id} /></div>
                                    </td>
                                    <td className="px-6 py-3 cursor-pointer">
                                        <div className="text-slate-800">{s.nama_wali || '-'}</div>
                                        <div className="text-xs text-green-600 font-mono">{s.no_hp_wali || 'No HP Kosong'}</div>
                                    </td>
                                    <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                                        <div className="relative">
                                            <textarea 
                                                className="w-full text-xs border-slate-200 rounded-md focus:ring-secondary focus:border-secondary bg-slate-50 focus:bg-white transition-colors p-2 h-20 resize-y"
                                                placeholder="Tulis catatan khusus..."
                                                value={studentNotes[s.id] !== undefined ? studentNotes[s.id] : DEFAULT_NOTE}
                                                onChange={(e) => handleNoteChange(s.id, e.target.value)}
                                            />
                                            <div className="absolute right-2 bottom-2 text-slate-300 pointer-events-none">
                                                <Edit3 size={12} />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredSantri.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">Tidak ada santri yang sesuai filter.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Preview Modal */}
            <Modal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title={`Preview Pesan (${generatedMessages.length})`} maxWidth="2xl">
                <div className="space-y-6 max-h-[70vh] overflow-y-auto p-1">
                    {generatedMessages.map((msg, idx) => (
                        <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-bold text-slate-800">{msg.studentName}</h4>
                                    <p className="text-xs text-slate-500">Wali: {msg.parentName} ({msg.phone || 'No HP Kosong'})</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleCopyMessage(msg.message)}
                                        className="p-1.5 text-slate-500 hover:text-secondary hover:bg-white rounded border border-slate-200"
                                        title="Copy Teks"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleSendWA(msg.phone, msg.message)}
                                        className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center hover:bg-green-700 shadow-sm"
                                    >
                                        <Send size={14} className="mr-1.5" /> Kirim WA
                                    </button>
                                </div>
                            </div>
                            <div className="bg-white p-3 rounded border border-slate-200 text-xs font-mono text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {msg.message}
                            </div>
                            {!msg.phone && (
                                <div className="mt-2 text-xs text-red-500 flex items-center">
                                    <AlertCircle size={14} className="mr-1"/> Tidak dapat mengirim WA otomatis (No HP kosong). Silakan copy manual.
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="pt-4 flex justify-end">
                    <button onClick={() => setIsPreviewOpen(false)} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg hover:bg-slate-50 transition-colors">Tutup</button>
                </div>
            </Modal>
        </div>
    );
};

export default WaliSantriReport;
