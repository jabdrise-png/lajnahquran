import React, { useState, useEffect, useRef, useMemo } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import { createPortal } from 'react-dom';
import { Search, Save, Download, Upload, Plus, Trash2, Filter, AlertCircle, X, Settings2, Send, Copy, Info, Edit2, Check } from 'lucide-react';
import { sendCustomTelegramMessage } from '../../lib/telegram';
import { NotificationStore } from '../../lib/NotificationStore';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { exportToExcel, parseSpreadsheet, getActiveSemesterDateRange, generateMonthsFromDateRange, getPredikat } from '../../lib/utils';
import { useAcademicYear } from '../../lib/AcademicYearContext';

interface UjianBulananPeriode {
    id: string; // e.g., '1_Juli 2024'
    ke: number;
    bulan: string;
}

const DEFAULT_TELEGRAM_TEMPLATE = `📢 *LAPORAN HASIL UJIAN BULANAN* 📢

👤 *Nama Santri:* {{nama}}
🏢 *Marhalah / Kelas:* {{marhalah}} / {{kelas}}
📅 *Periode Ujian:* {{periode}}
📖 *Materi Ujian (Juz):* {{materi}}
⭐ *Nilai:* {{nilai}}
🏆 *Predikat:* {{predikat}}

Semoga pencapaian ananda terus meningkat dan membawa keberkahan. Amin.`;

const UjianBulananPage: React.FC = () => {
    const { santri, ujianBulanan, saveUjianBulanan, loading, appSettings, saveAppSetting, masterKelas, globalMarhalahs, userProfile, waliKelas, globalPredikatNilai , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    const { selectedAcademicYear } = useAcademicYear();

    const selectedSemester = selectedAcademicYear?.active_semester || 'Ganjil';
    const appSettingKey = `UB_PERIODS_${selectedAcademicYear?.id}_${selectedSemester}`;
    const ubPeriods: UjianBulananPeriode[] = useMemo(() => {
        const stored = appSettings.find(s => s.key === appSettingKey)?.value;
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { return []; }
        }
        if (selectedSemester === 'Ganjil') {
            const oldKey = `UB_PERIODS_${selectedAcademicYear?.id}`;
            let oldStored = appSettings.find(s => s.key === oldKey)?.value;
            if (!oldStored) {
                oldStored = appSettings.find(s => s.key === `UB_PERIODS_${selectedAcademicYear?.id}_Gasal`)?.value;
            }
            if (oldStored) {
                try { return JSON.parse(oldStored); } catch (e) { return []; }
            }
        }
        return [];
    }, [appSettings, appSettingKey, selectedAcademicYear, selectedSemester]);

    // Filters
    const [selectedPeriode, setSelectedPeriode] = useState<string>('');
    const [selectedMarhalah, setSelectedMarhalah] = useState('All');
    const [selectedKelas, setSelectedKelas] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSantriIds, setSelectedSantriIds] = useState<number[]>([]);
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
    const [isSendingTelegram, setIsSendingTelegram] = useState(false);
    const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
    const templateSettingKey = `UB_TELEGRAM_TEMPLATE_${selectedAcademicYear?.id}_${selectedSemester}`;
    const telegramTemplate = useMemo(() => {
        const stored = appSettings.find(s => s.key === templateSettingKey)?.value;
        return stored || DEFAULT_TELEGRAM_TEMPLATE;
    }, [appSettings, templateSettingKey]);
    
    const [isEditingTemplate, setIsEditingTemplate] = useState(false);
    const [tempTemplate, setTempTemplate] = useState(telegramTemplate);

    useEffect(() => {
        if (isTelegramModalOpen) {
            setTempTemplate(telegramTemplate);
            setIsEditingTemplate(false);
        }
    }, [isTelegramModalOpen, telegramTemplate]);

    
    
    // Auto-select first period if available
    useEffect(() => {
        if (ubPeriods.length > 0 && !selectedPeriode) {
            setSelectedPeriode(ubPeriods[0].id);
        }
    }, [ubPeriods, selectedPeriode]);

    // State
    const [localData, setLocalData] = useState<Record<number, { materi_juz: string, nilai: string }>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newUjianKe, setNewUjianKe] = useState<number>(ubPeriods.length + 1);
    const [newUjianBulan, setNewUjianBulan] = useState('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize local state when filters/data change
    useEffect(() => {
        const dataMap: Record<number, { materi_juz: string, nilai: string }> = {};
        santri.forEach(s => {
            const existingUjian = ujianBulanan.find((u: any) => u.santri_id === s.id && u.periode === selectedPeriode);
            if (existingUjian) {
                dataMap[s.id] = { 
                    materi_juz: existingUjian.materi_juz || '', 
                    nilai: existingUjian.nilai !== null ? String(existingUjian.nilai) : '' 
                };
            } else {
                // Auto-determine materi?
                dataMap[s.id] = { 
                    materi_juz: '', 
                    nilai: '' 
                };
            }
        });
        setLocalData(dataMap);
    }, [santri, ujianBulanan, selectedPeriode]);

    const handleCellChange = (santriId: number, field: 'materi_juz' | 'nilai', value: string) => {
        setLocalData(prev => ({
            ...prev,
            [santriId]: { ...prev[santriId], [field]: value }
        }));
    };

    const handleSave = async () => {
        if (!selectedPeriode) {
            alert('Pilih periode ujian terlebih dahulu.');
            return;
        }
        setIsSaving(true);
        try {
            const recordsToSave = [];
            for (const s of allFilteredSantri) {
                const data = localData[s.id];
                if (data && (data.materi_juz || data.nilai)) {
                    recordsToSave.push({
                        santri_id: s.id,
                        periode: selectedPeriode,
                        materi_juz: data.materi_juz,
                        nilai: data.nilai !== '' ? Number(data.nilai) : null
                    });
                }
            }
            if (recordsToSave.length > 0) {
                await saveUjianBulanan(recordsToSave);
                alert('Data berhasil disimpan!');
            } else {
                alert('Tidak ada data untuk disimpan.');
            }
        } catch (e: any) {
            alert('Gagal menyimpan: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddUjian = async () => {
        if (!newUjianBulan.trim()) return;
        const newPeriod: UjianBulananPeriode = {
            id: `ub_${Date.now()}`,
            ke: newUjianKe,
            bulan: newUjianBulan
        };
        const updated = [...ubPeriods, newPeriod];
        await saveAppSetting(appSettingKey, JSON.stringify(updated));
        setNewUjianKe(updated.length + 1);
        setNewUjianBulan('');
    };

    const handleDeleteUjian = async (id: string) => {
        if (window.confirm('Hapus ujian ini? Data nilai yang sudah tersimpan mungkin tidak akan terlihat.')) {
            const updated = ubPeriods.filter(p => p.id !== id);
            await saveAppSetting(appSettingKey, JSON.stringify(updated));
            if (selectedPeriode === id) {
                setSelectedPeriode('');
            }
        }
    };

    const handleDownloadTemplate = () => {
        const periodObj = ubPeriods.find(p => p.id === selectedPeriode);
        const periodName = periodObj ? `Ujian_Ke_${periodObj.ke}_${periodObj.bulan}` : selectedPeriode;
        
        const dataToExport = allFilteredSantri.map(s => {
            return {
                'id': s.id,
                'nama': s.nama,
                'periode': selectedPeriode,
                'materi juz': '',
                'nilai': ''
            };
        });
        exportToExcel(dataToExport, `Template_Ujian_Bulanan_${periodName}`);
    };
        const handleExport = () => {
        const periodObj = ubPeriods.find(p => p.id === selectedPeriode);
        const periodName = periodObj ? `Ujian_Ke_${periodObj.ke}_${periodObj.bulan}` : selectedPeriode;
        
        const dataToExport = allFilteredSantri.map(s => {
            const d = localData[s.id] || { materi_juz: '', nilai: '' };
            return {
                'ID': s.id,
                'Nama': s.nama,
                'Marhalah': s.marhalah,
                'Kelas': s.kelas,
                'Periode': selectedPeriode,
                'Materi Juz': d.materi_juz,
                'Nilai': d.nilai,
                'Predikat': getPredikat(d.nilai, globalPredikatNilai || [])
            };
        });
        exportToExcel(dataToExport, `Ujian_Bulanan_${periodName}`);
    };

    
    const generateMessage = (student: any, data: any, currentPeriode: any, template: string) => {
        const materi = data?.materi_juz || '-';
        const nilai = (data && data.nilai !== '' && data.nilai !== null && data.nilai !== undefined) ? data.nilai : '-';
        const predikat = (nilai !== '-') ? getPredikat(Number(nilai), globalPredikatNilai || []) : '-';
        
        return template
            .replace(/\{\{\s*nama\s*\}\}/gi, student.nama)
            .replace(/\{\{\s*marhalah\s*\}\}/gi, student.marhalah)
            .replace(/\{\{\s*kelas\s*\}\}/gi, student.kelas)
            .replace(/\{\{\s*periode\s*\}\}/gi, currentPeriode?.bulan || '-')
            .replace(/\{\{\s*materi\s*\}\}/gi, materi)
            .replace(/\{\{\s*nilai\s*\}\}/gi, String(nilai))
            .replace(/\{\{\s*predikat\s*\}\}/gi, predikat);
    };

    const sendTelegramMessageToStudent = async (student: any, data: any, currentPeriode: any) => {
        const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value || import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
        if (!botToken) throw new Error("Bot token belum diatur");
        if (!student.telegram_chat_id) throw new Error("Chat ID Kosong");
        if (!data || data.nilai === '' || data.nilai === null || data.nilai === undefined) throw new Error("Belum ada nilai");
        
        const message = generateMessage(student, data, currentPeriode, telegramTemplate);
                        
        const success = await sendCustomTelegramMessage(botToken, student.telegram_chat_id, message);
        if (!success) throw new Error("Gagal mengirim ke Telegram API");
        return true;
    };

    const handleSendSingleTelegram = async (santriId: number) => {
        try {
            const student = santri.find(s => s.id === santriId);
            const data = localData[santriId];
            const currentPeriode = ubPeriods.find(p => p.id === selectedPeriode);
            if (!student) return;
            
            await sendTelegramMessageToStudent(student, data, currentPeriode);
            NotificationStore.addNotification(`Berhasil mengirim laporan ke ${student.nama}`, 'success');
        } catch (error: any) {
            NotificationStore.addNotification(error.message || 'Gagal mengirim', 'error');
        }
    };
    
    const handleSendTelegram = async () => {
        try {
            if (selectedSantriIds.length === 0) return;
            setIsSendingTelegram(true);
            const currentPeriode = ubPeriods.find(p => p.id === selectedPeriode);
            let successCount = 0;
            let failCount = 0;
            let noTelegramCount = 0;

            for (const santriId of selectedSantriIds) {
                const student = santri.find(s => s.id === santriId);
                const data = localData[santriId];
                if (student) {
                    if (!student.telegram_chat_id) {
                        noTelegramCount++;
                    } else {
                        try {
                            await sendTelegramMessageToStudent(student, data, currentPeriode);
                            successCount++;
                        } catch (e) {
                            failCount++;
                        }
                    }
                }
            }
            NotificationStore.addNotification(`Berhasil: ${successCount}, Gagal: ${failCount}, Tanpa ID: ${noTelegramCount}`, successCount > 0 ? 'success' : 'error');
            if (successCount > 0) {
                setSelectedSantriIds([]);
                setIsTelegramModalOpen(false);
            }
        } catch (error) {
            console.error("Error in handleSendTelegram:", error);
            NotificationStore.addNotification("Terjadi kesalahan sistem saat mengirim laporan.", "error");
        } finally {
            setIsSendingTelegram(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await parseSpreadsheet(file);
            const recordsToSave = [];
            for (const row of data) {
                const sId = parseInt(row['id'] as string, 10);
                if (!isNaN(sId) && row['nama']) {
                    const student = santri.find(s => s.id === sId);
                    if (student) {
                        const existing = ujianBulanan.find(u => u.santri_id === student.id && u.periode === selectedPeriode);
                        recordsToSave.push({
                            santri_id: student.id,
                            periode: row['periode'] || selectedPeriode,
                            materi_juz: (row['materi juz'] !== undefined && row['materi juz'] !== '') ? row['materi juz'] : (existing?.materi_juz || ''),
                            nilai: (row['nilai'] !== undefined && row['nilai'] !== '') ? Number(row['nilai']) : existing?.nilai
                        });
                    }
                }
            }
            if (recordsToSave.length > 0) {
                await saveUjianBulanan(recordsToSave);
                alert(`${recordsToSave.length} data berhasil diimport.`);
            } else {
                alert('Tidak ada data valid yang ditemukan.');
            }
        } catch (error) {
            alert('Gagal membaca file: ' + error);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [currentPageNum, setCurrentPageNum] = useState(0);
    const rowsPerPage = 50;

    const allFilteredSantri = (() => {
                let baseSantri = santri;
                if (userProfile?.role === 'pengajar') {
                    const userWaliClasses = waliKelas.filter(w => w.user_id === userProfile.id).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
                    baseSantri = baseSantri.filter(s => userWaliClasses.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas));
                }
                return baseSantri;
            })().filter(s => {
        if (!s.kelas || s.kelas === 'Belum Ada Kelas' || s.kelas === '-') return false;
        if (selectedMarhalah !== 'All' && s.marhalah !== selectedMarhalah) return false;
        if (selectedKelas !== 'All' && s.kelas !== selectedKelas) return false;
        if (searchQuery && !s.nama.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    }).sort((a, b) => {
        const marhalahCompare = (a.marhalah || '').localeCompare(b.marhalah || '');
        if (marhalahCompare !== 0) return marhalahCompare;
        const kelasCompare = (a.kelas || '').localeCompare(b.kelas || '');
        if (kelasCompare !== 0) return kelasCompare;
        return (a.nama || '').localeCompare(b.nama || '');
    });

    const totalPages = Math.ceil(allFilteredSantri.length / rowsPerPage);
    const filteredSantri = allFilteredSantri.slice(currentPageNum * rowsPerPage, (currentPageNum + 1) * rowsPerPage);

    useEffect(() => {
        setCurrentPageNum(0);
    }, [selectedMarhalah, selectedKelas, searchQuery]);

    if (loading) {
        return <div className="p-6 text-slate-500">Memuat data...</div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">Capaian Ujian Bulanan</h1>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Evaluasi capaian hafalan periodik per bulan</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 border border-transparent text-white px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-blue-700 shadow-sm hover:shadow active:bg-blue-800 transition-all focus:ring-4 focus:ring-blue-500/20">
                        <Settings2 size={16} className="mr-2.5" strokeWidth={2.5}/> Kelola Ujian
                    </button>
                    {selectedSantriIds.length > 0 && (
                        <button onClick={() => { if (selectedSantriIds.length === 0) alert('Pilih minimal satu santri.'); else setIsTelegramModalOpen(true); }} disabled={isSendingTelegram} className="bg-[#229ED9] border border-transparent text-white px-3 py-2.5 rounded-xl flex items-center justify-center hover:bg-[#1C88BA] shadow-sm hover:shadow active:bg-[#1875A0] transition-all focus:ring-4 focus:ring-[#229ED9]/20 disabled:opacity-50 disabled:cursor-not-allowed" title="Kirim Laporan ke Telegram">
                            {isSendingTelegram ? <span className="animate-pulse">⏳</span> : <Send size={18} strokeWidth={2.5} />}
                        </button>
                    )}

                    <button onClick={handleExport} className="bg-white border border-slate-200/80 text-slate-700 px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all focus:ring-4 focus:ring-slate-100">
                        <Download size={16} className="mr-2 text-slate-500" strokeWidth={2.5}/> Export
                    </button>
                    <div className="relative group z-20">
                        <button onClick={() => setIsImportMenuOpen(prev => !prev)} className="bg-white border border-slate-200/80 text-slate-700 px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all focus:ring-4 focus:ring-slate-100">
                            <Upload size={16} className="mr-2 text-slate-500" strokeWidth={2.5}/> Import
                        </button>
                        <div className={`absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.15)] transition-all overflow-hidden z-50 ${isImportMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible focus-within:opacity-100 focus-within:visible'}`}>
                            <button onClick={() => { setIsImportMenuOpen(false); fileInputRef.current?.click(); }} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                                <Upload size={16} className="mr-3 text-blue-600" /> Upload File Excel
                            </button>
                            <button onClick={() => { setIsImportMenuOpen(false); handleDownloadTemplate(); }} className="w-full text-left px-5 py-3.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center border-t border-slate-100 transition-colors">
                                <Download size={16} className="mr-3 text-emerald-600" /> Download Template
                            </button>
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImport}/>
                </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-wrap gap-5 items-end z-10 relative">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Periode Bulan</label>
                    <select 
                        value={selectedPeriode} 
                        onChange={(e) => setSelectedPeriode(e.target.value)} 
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        {ubPeriods.length === 0 ? (
                            <option value="" disabled>Belum ada ujian ditambahkan</option>
                        ) : (
                            ubPeriods.map(p => (
                                <option key={p.id} value={p.id}>
                                    Ujian Ke-{p.ke} ({p.bulan})
                                </option>
                            ))
                        )}
                    </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Marhalah</label>
                    <select
                        value={selectedMarhalah}
                        onChange={(e) => {
                            setSelectedMarhalah(e.target.value);
                            setSelectedKelas('All');
                        }}
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                    >
                        <option value="All">Semua Marhalah</option>
                        {globalMarhalahs.map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Kelas</label>
                    <select
                        value={selectedKelas}
                        onChange={(e) => setSelectedKelas(e.target.value)}
                        disabled={selectedMarhalah === 'All'}
                        className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value="All">Semua Kelas</option>
                        {masterKelasRelasi?.filter((k: any) => selectedMarhalah === 'All' ? true : k.marhalah_id === masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id).map((k: any) => (
                            <option key={k.id} value={k.nama_kelas || k.id}>{k.nama_kelas}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Pencarian</label>
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Cari nama santri..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white"
                        />
                    </div>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-extrabold text-slate-800 flex items-center">
                        Input Nilai Ujian 
                        <span className="ml-3 bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-[11px] font-bold">
                            {allFilteredSantri.length} Santri
                        </span>
                    </h3>
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm active:bg-blue-800 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50"
                    >
                        <Save size={16} strokeWidth={2.5}/>
                        {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 h-full">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-bold">
                            <tr>
                                
                                <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                                        checked={filteredSantri.length > 0 && selectedSantriIds.length === filteredSantri.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedSantriIds(filteredSantri.map(s => s.id));
                                            } else {
                                                setSelectedSantriIds([]);
                                            }
                                        }}
                                    />
                                </th>
<th className="px-6 py-4 border-b border-slate-200/80 font-bold w-12 text-center">No</th>
                                <th className="px-6 py-4 border-b border-slate-200/80 font-bold whitespace-nowrap">Nama Santri</th>
                                <th className="px-6 py-4 border-b border-slate-200/80 font-bold whitespace-nowrap">Marhalah / Kelas</th>
                                <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-1/4">Materi Ujian (Juz)</th>
                                <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-32">Nilai</th>
                                <th className="px-6 py-4 border-b border-slate-200/80 font-bold w-32 text-center">Predikat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredSantri.length > 0 ? (
                                filteredSantri.map((s, idx) => {
                                    const data = localData[s.id] || { materi_juz: '', nilai: '' };
                                    return (
                                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                        
                                        <td className="px-6 py-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                                                checked={selectedSantriIds.includes(s.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedSantriIds([...selectedSantriIds, s.id]);
                                                    } else {
                                                        setSelectedSantriIds(selectedSantriIds.filter(id => id !== s.id));
                                                    }
                                                }}
                                            />
                                        </td>
<td className="px-6 py-4 text-center font-bold text-slate-400">{currentPageNum * rowsPerPage + idx + 1}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{s.nama}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-slate-100 text-slate-600 whitespace-nowrap">
                                                <KelasLabel text={s.kelas} id={s.kelas_id} />
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <input 
                                                type="text" 
                                                value={data.materi_juz}
                                                onChange={(e) => handleCellChange(s.id, 'materi_juz', e.target.value)}
                                                placeholder="Contoh: 1,2,3,4" 
                                                className="w-full border border-slate-200/80 rounded-xl px-4 py-2 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all focus:bg-white"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <input 
                                                type="number" 
                                                step="any"
                                                value={data.nilai}
                                                onChange={(e) => handleCellChange(s.id, 'nilai', e.target.value)}
                                                placeholder="1-100" 
                                                className="w-full border border-slate-200/80 rounded-xl px-4 py-2 text-[13px] font-bold text-center text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-mono focus:bg-white"
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-600 font-bold text-[11px] rounded-md">
                                                {getPredikat(data.nilai, globalPredikatNilai || [])}
                                            </span>
                                        </td>
                                    </tr>
                                )})
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mb-4">
                                                <Search size={24} />
                                            </div>
                                            <p className="font-semibold text-slate-600">Tidak ada santri ditemukan</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {allFilteredSantri.length > 0 && (
                    <div className="flex justify-between items-center p-5 border-t border-slate-100 bg-slate-50/50 text-[13px]">
                        <span className="text-slate-500 font-medium">
                            Menampilkan <span className="font-bold text-slate-700">{currentPageNum * rowsPerPage + 1}</span> - <span className="font-bold text-slate-700">{Math.min((currentPageNum + 1) * rowsPerPage, allFilteredSantri.length)}</span> dari <span className="font-bold text-slate-700">{allFilteredSantri.length}</span> santri
                        </span>
                        <div className="flex gap-2">
                            <button 
                                disabled={currentPageNum === 0} 
                                onClick={() => setCurrentPageNum(prev => prev - 1)}
                                className="px-4 py-2 border border-slate-200/80 rounded-lg font-bold disabled:opacity-50 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white text-slate-600 focus:ring-4 focus:ring-slate-100"
                            >Sebelumnya</button>
                            <button 
                                disabled={currentPageNum >= totalPages - 1} 
                                onClick={() => setCurrentPageNum(prev => prev + 1)}
                                className="px-4 py-2 border border-slate-200/80 rounded-lg font-bold disabled:opacity-50 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white text-slate-600 focus:ring-4 focus:ring-slate-100"
                            >Selanjutnya</button>
                        </div>
                    </div>
                )}
            </div>

            
            {/* Confirm Telegram Modal */}
            {isTelegramModalOpen && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-white shrink-0">
                            <h3 className="font-bold text-slate-800 text-lg">Preview & Kirim Pesan</h3>
                            <button onClick={() => setIsTelegramModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 hover:bg-slate-200 rounded-full p-1.5">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                            {/* Header Actions */}
                            <div className="mb-6 flex flex-col sm:flex-row justify-end gap-3">
                                <button 
                                    onClick={async () => {
                                        if (isEditingTemplate) {
                                            await saveAppSetting(templateSettingKey, tempTemplate);
                                            setIsEditingTemplate(false);
                                            NotificationStore.addNotification('Template berhasil disimpan', 'success');
                                        } else {
                                            setIsEditingTemplate(true);
                                        }
                                    }} 
                                    className={`flex items-center justify-center text-sm font-bold px-4 py-2.5 rounded-xl transition-colors border ${isEditingTemplate ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {isEditingTemplate ? <><Check size={16} className="mr-2" /> Simpan Template</> : <><Settings2 size={16} className="mr-2" /> Pengaturan Template</>}
                                </button>
                                <button onClick={handleSendTelegram} disabled={isSendingTelegram} className="bg-[#229ED9] text-white font-bold py-2.5 px-6 rounded-xl hover:bg-[#1C88BA] transition-colors shadow-sm focus:ring-4 focus:ring-[#229ED9]/20 outline-none flex items-center justify-center shrink-0 disabled:opacity-50">
                                    {isSendingTelegram ? <span className="animate-pulse mr-2">⏳</span> : <Send size={18} className="mr-2" />} 
                                    {isSendingTelegram ? 'Mengirim...' : 'Kirim Massal'}
                                </button>
                            </div>
                            
                            {isEditingTemplate && (
                                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
                                    <h4 className="font-bold text-slate-800 text-sm mb-3">Edit Template Pesan</h4>
                                    <div className="space-y-3">
                                        <textarea
                                            value={tempTemplate}
                                            onChange={e => setTempTemplate(e.target.value)}
                                            rows={8}
                                            className="w-full text-[13px] font-mono border border-slate-300 rounded-lg p-3 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-y"
                                        />
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                            <p className="text-xs font-bold text-slate-600 mb-2">Variabel yang tersedia:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {['{{nama}}', '{{marhalah}}', '{{kelas}}', '{{periode}}', '{{materi}}', '{{nilai}}', '{{predikat}}'].map(v => (
                                                    <span key={v} className="bg-white border border-slate-200 text-slate-700 text-[11px] px-2 py-1 rounded font-mono shadow-sm cursor-pointer hover:border-blue-400 hover:text-blue-600" onClick={() => {
                                                        setTempTemplate(prev => prev + ' ' + v);
                                                    }} title="Klik untuk menambahkan">
                                                        {v}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Preview List */}

                            <div className="space-y-4">
                                {selectedSantriIds.map(santriId => {
                                    const student = santri.find(s => s.id === santriId);
                                    if (!student) return null;
                                    const data = localData[santriId];
                                    const currentPeriode = ubPeriods.find(p => p.id === selectedPeriode);
                                    
                                    const materi = data?.materi_juz || '-';
                                    const nilai = (data && data.nilai !== '' && data.nilai !== null && data.nilai !== undefined) ? data.nilai : '-';
                                    const predikat = (nilai !== '-') ? getPredikat(Number(nilai), globalPredikatNilai || []) : '-';
                                    
                                    const msg = generateMessage(student, data, currentPeriode, tempTemplate);
                                    
                                    const hasChatId = !!student.telegram_chat_id;
                                    
                                    return (
                                        <div key={santriId} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-slate-100 bg-white gap-3">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-base">{student.nama}</h4>
                                                    <p className={`text-xs font-medium mt-0.5 ${hasChatId ? 'text-slate-500' : 'text-red-500'}`}>
                                                        {hasChatId ? 'Chat ID Tersedia' : 'Chat ID Kosong'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <button onClick={() => {
                                                        navigator.clipboard.writeText(msg);
                                                        NotificationStore.addNotification('Pesan disalin ke clipboard', 'success');
                                                    }} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors bg-white">
                                                        <Copy size={16} /> Salin
                                                    </button>
                                                    <button onClick={() => handleSendSingleTelegram(santriId)} disabled={!hasChatId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#bfe3f3] text-[#1a7cae] hover:bg-[#a9d8ed] rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                                        <Send size={16} /> Kirim
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-slate-50">
                                                <pre className="text-[13px] font-medium text-slate-700 whitespace-pre-wrap font-sans font-mono bg-white p-4 border border-slate-200 rounded-lg">
                                                    {msg}
                                                </pre>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}



            {/* Manage Ujian Modal */}
            {isAddModalOpen && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                            <h3 className="font-bold text-slate-800">Ujian Bulanan {selectedSemester}</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Ujian Ke-</label>
                                    <input type="number" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none bg-slate-50" value={newUjianKe} onChange={e => setNewUjianKe(parseInt(e.target.value) || 1)} />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Bulan</label>
                                    <input type="text" className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none" value={newUjianBulan} onChange={e => setNewUjianBulan(e.target.value)} placeholder="Agustus 2024" onKeyDown={e => e.key === 'Enter' && handleAddUjian()} />
                                </div>
                            </div>
                            <button onClick={handleAddUjian} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13px] py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center">
                                <Plus size={16} className="mr-2" strokeWidth={2.5}/> Tambah Ujian
                            </button>

                            <div className="space-y-2 mt-6">
                                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wider">Periode Ujian {selectedSemester}</h4>
                                {ubPeriods.length === 0 ? (
                                    <p className="text-sm text-slate-400">Belum ada ujian ditambahkan.</p>
                                ) : (
                                    ubPeriods.map(p => (
                                        <div key={p.id} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                            <span className="text-sm font-semibold text-slate-700">Ujian {p.ke} - {p.bulan}</span>
                                            <button onClick={() => handleDeleteUjian(p.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 p-4 border-t border-slate-100 shrink-0">
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent"
                                >
                                    Selesai
                                </button>
                            </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default UjianBulananPage;
