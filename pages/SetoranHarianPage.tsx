import React, { useState, useMemo, useEffect } from 'react';
import { FileText, Save, Search, Plus, Trash, Edit, Check, X, Filter, Loader2, Clock, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseData } from '../hooks/useSupabaseData';
import Modal from '../components/Modal';
import { SURAHS } from '../lib/surahs';
import { sendCustomTelegramMessage } from '../lib/telegram';
import { calculateHalamanSetoran, parseRentangHafalanString } from '../lib/quranPageMap';


function AddSetoranForm({ 
    initialData, 
    onSave, 
    onCancel, 
    santriInHalaqah, 
    tableData, 
    attendanceMap, 
    pendingAttendance,
    selectedDate, 
    selectedWaktu, 
    SCHEME_OPTIONS, 
    NILAI_OPTIONS, 
    AUTO_SETTINGS,
    isSaving
}: any) {
    const [addForm, setAddForm] = useState(initialData);

    // Auto fill surat/ayat mulai from previous setoran
    useEffect(() => {
        const fetchLastSetoran = async () => {
            if (!addForm.santri_id || !addForm.skema || addForm.id) return;
            const { data, error } = await (supabase as any)
                .from('setoran_harian')
                .select('surat_selesai, ayat_selesai')
                .eq('santri_id', addForm.santri_id)
                .eq('skema', addForm.skema)
                .order('tanggal', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
                
            if (data && !error) {
                setAddForm((prev: any) => ({
                    ...prev,
                    surat_mulai: data.surat_selesai || prev.surat_mulai,
                    ayat_mulai: data.ayat_selesai || prev.ayat_mulai,
                    surat: data.surat_selesai || prev.surat,
                    ayat: data.ayat_selesai || prev.ayat
                }));
            }
        };
        fetchLastSetoran();
    }, [addForm.santri_id, addForm.skema]);

    // Otomatis hitung jumlah halaman dari master indeks mushaf Al-Qur'an (604 halaman)
    useEffect(() => {
        const sMulai = addForm.surat_mulai || addForm.surat || '';
        const aMulai = parseInt(addForm.ayat_mulai || addForm.ayat || '1', 10) || 1;
        const sSelesai = addForm.surat_selesai || '';
        const aSelesai = parseInt(addForm.ayat_selesai || '1', 10) || 1;

        if (sMulai && sSelesai) {
            const res = calculateHalamanSetoran(sMulai, aMulai, sSelesai, aSelesai);
            if (res) {
                setAddForm((prev: any) => {
                    if (prev.jumlah_halaman !== res.halaman.toString()) {
                        return { ...prev, jumlah_halaman: res.halaman.toString() };
                    }
                    return prev;
                });
            }
        } else if (sMulai && !sSelesai && addForm.ayat_selesai) {
            // Dalam surat yang sama: misal An-Naba 1 s.d 40
            const res = calculateHalamanSetoran(sMulai, aMulai, sMulai, aSelesai);
            if (res) {
                setAddForm((prev: any) => {
                    if (prev.jumlah_halaman !== res.halaman.toString()) {
                        return { ...prev, jumlah_halaman: res.halaman.toString() };
                    }
                    return prev;
                });
            }
        }
    }, [addForm.surat_mulai, addForm.surat, addForm.ayat_mulai, addForm.ayat, addForm.surat_selesai, addForm.ayat_selesai]);

    // Handler cerdas saat guru mengetik/paste rentang langsung, misal "Annaba 1 - annas 6"
    const handleSuratMulaiChange = (val: string) => {
        const parsed = parseRentangHafalanString(val);
        if (parsed) {
            const calc = calculateHalamanSetoran(parsed.startSurah, parsed.startAyah, parsed.endSurah, parsed.endAyah);
            const startSurahName = calc ? calc.startSurah.name : parsed.startSurah;
            const endSurahName = calc ? calc.endSurah.name : parsed.endSurah;
            setAddForm((prev: any) => ({
                ...prev,
                surat_mulai: startSurahName,
                surat: startSurahName,
                ayat_mulai: parsed.startAyah.toString(),
                ayat: parsed.startAyah.toString(),
                surat_selesai: endSurahName,
                ayat_selesai: parsed.endAyah.toString(),
                jumlah_halaman: calc ? calc.halaman.toString() : prev.jumlah_halaman
            }));
            return;
        }

        setAddForm((prev: any) => ({
            ...prev,
            surat_mulai: val,
            surat: val
        }));
    };

    const handleSuratSelesaiChange = (val: string) => {
        const parsed = parseRentangHafalanString(val);
        if (parsed) {
            const calc = calculateHalamanSetoran(parsed.startSurah, parsed.startAyah, parsed.endSurah, parsed.endAyah);
            const startSurahName = calc ? calc.startSurah.name : parsed.startSurah;
            const endSurahName = calc ? calc.endSurah.name : parsed.endSurah;
            setAddForm((prev: any) => ({
                ...prev,
                surat_mulai: startSurahName,
                surat: startSurahName,
                ayat_mulai: parsed.startAyah.toString(),
                ayat: parsed.startAyah.toString(),
                surat_selesai: endSurahName,
                ayat_selesai: parsed.endAyah.toString(),
                jumlah_halaman: calc ? calc.halaman.toString() : prev.jumlah_halaman
            }));
            return;
        }

        setAddForm((prev: any) => ({
            ...prev,
            surat_selesai: val
        }));
    };


    // Auto calculation logic
    useEffect(() => {
        if (!AUTO_SETTINGS?.enable) return;
        const skema = addForm.skema?.toLowerCase() || '';
        if (skema.includes('ziyadah') || skema.includes('sabqi') || skema.includes('manzil')) {
            const base = AUTO_SETTINGS.base || 100;
            const hal = (parseFloat(addForm.jumlah_halaman) > 0) ? parseFloat(addForm.jumlah_halaman) : 1;
            const kabir = ((parseInt(addForm.kesalahan_kabir) || 0) / hal) * (AUTO_SETTINGS.kabir || 20);
            const shoghir = ((parseInt(addForm.kesalahan_shoghir) || 0) / hal) * (AUTO_SETTINGS.shoghir || 10);
            const score = Math.max(0, base - kabir - shoghir);
            
            let matchedNilai = '';
            const ranges = AUTO_SETTINGS.ranges || [];
            for (const r of [...ranges].sort((a: any, b: any) => b.min - a.min)) {
                if (score >= r.min) {
                    matchedNilai = r.label;
                    break;
                }
            }
            if (matchedNilai && matchedNilai !== addForm.nilai) {
                setAddForm((prev: any) => ({ ...prev, nilai: matchedNilai }));
            }
        }
    }, [addForm.kesalahan_kabir, addForm.kesalahan_shoghir, addForm.jumlah_halaman, addForm.skema, AUTO_SETTINGS]);

    const selectedSantriData = addForm.santri_id ? tableData.find((s: any) => s.id.toString() === addForm.santri_id.toString()) : null;

    const santriOptions = useMemo(() => {
        let filteredSantris = santriInHalaqah;
        if (selectedSantriData?.halaqah_info?.id) {
            filteredSantris = santriInHalaqah.filter((s: any) => s.halaqah_info?.id === selectedSantriData.halaqah_info.id);
        }
        return filteredSantris.map((s: any) => {
            const actualHalaqahId = s.halaqah_info?.id;
            const attKey = `${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`;
            const attRecord = attendanceMap?.get(attKey);
            const explicitStatus = attRecord?.status;
            const currentStatus = pendingAttendance?.[attKey] || explicitStatus || '';
            const statusLower = currentStatus ? currentStatus.trim().toLowerCase() : '';
            const isHadirOrTerlambat = !currentStatus || ['hadir', 'terlambat', 'hadir telat', 'telat'].includes(statusLower);
            return (
                <option key={`${s.id}-${actualHalaqahId}`} value={s.id} disabled={!isHadirOrTerlambat}>
                    {s.nama} {!isHadirOrTerlambat ? `(${currentStatus})` : ''}
                </option>
            );
        });
    }, [santriInHalaqah, attendanceMap, pendingAttendance, selectedSantriData]);

    return (
        <form className="flex flex-col h-full" onSubmit={e => { e.preventDefault(); onSave(addForm); }}>
        <div className="px-6 py-5 space-y-6 overflow-y-auto">
            {selectedSantriData?.halaqah_info && (
                <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase mb-1">
                            Halaqah
                        </p>
                        <p className="text-sm font-medium text-slate-900">{selectedSantriData.halaqah_info.nama}</p>
                    </div>
                    <div className="sm:text-right">
                        <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase mb-1">
                            Musammi'
                        </p>
                        <p className="text-sm font-medium text-slate-900">
                            {selectedSantriData.halaqah_info.musammi}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Santri</label>
                <select 
                    value={addForm.santri_id} 
                    onChange={e => setAddForm({...addForm, santri_id: e.target.value})}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm"
                >
                    <option value="">Pilih Santri...</option>
                    {santriOptions}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">Skema</label>
                <select 
                    value={addForm.skema} 
                    onChange={e => setAddForm({...addForm, skema: e.target.value})}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm"
                >
                    <option value="">Pilih Skema</option>
                    {SCHEME_OPTIONS.map((o: any) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <hr className="border-slate-100" />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Materi Hafalan</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Mulai</label>
                  <div className="flex gap-3">
                    <input 
                        type="text" 
                        list="surahs"
                        placeholder="Surat (mis: Annaba)"
                        value={addForm.surat_mulai || addForm.surat || ''}
                        onChange={e => handleSuratMulaiChange(e.target.value)}
                        className="w-2/3 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm"
                    />
                    <input 
                        type="text" 
                        list="ayats"
                        placeholder="Ayat"
                        value={addForm.ayat_mulai || addForm.ayat || ''}
                        onChange={e => setAddForm({...addForm, ayat_mulai: e.target.value, ayat: e.target.value})}
                        className="w-1/3 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm text-center"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Selesai</label>
                  <div className="flex gap-3">
                    <input 
                        type="text" 
                        list="surahs"
                        placeholder="Surat (mis: annas)"
                        value={addForm.surat_selesai || ''}
                        onChange={e => handleSuratSelesaiChange(e.target.value)}
                        className="w-2/3 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm"
                    />
                    <input 
                        type="text" 
                        list="ayats"
                        placeholder="Ayat"
                        value={addForm.ayat_selesai || ''}
                        onChange={e => setAddForm({...addForm, ayat_selesai: e.target.value})}
                        className="w-1/3 bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm text-center"
                    />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Tips: bisa ketik rentang (mis: Annaba 1 - annas 6)
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Khoto KB.</label>
                <input 
                    type="number"
                    min="0"
                    value={addForm.kesalahan_kabir}
                    onChange={e => setAddForm({...addForm, kesalahan_kabir: e.target.value})}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Khoto SH.</label>
                <input 
                    type="number"
                    min="0"
                    value={addForm.kesalahan_shoghir}
                    onChange={e => setAddForm({...addForm, kesalahan_shoghir: e.target.value})}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Jml Hal</label>
                <input 
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="0.5"
                    value={addForm.jumlah_halaman}
                    onChange={e => setAddForm({...addForm, jumlah_halaman: e.target.value})}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Nilai</label>
                <select 
                    value={addForm.nilai} 
                    onChange={e => setAddForm({...addForm, nilai: e.target.value})}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2.5 outline-none transition-all shadow-sm"
                >
                    <option value="">Pilih Nilai</option>
                    {NILAI_OPTIONS.map((o: any) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Keterangan / Catatan</label>
              <textarea 
                rows={2} 
                placeholder="Catatan tambahan (opsional)" 
                value={addForm.keterangan}
                onChange={e => setAddForm({...addForm, keterangan: e.target.value})}
                className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-3 outline-none transition-all shadow-sm placeholder:text-slate-400 resize-y"
              ></textarea>
            </div>
            
        </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-b-xl shrink-0">
                <button 
                    type="button"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                >
                    Batal
                </button>
                <button 
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Simpan Setoran
                </button>
            </div>

            <datalist id="surahs">
                {SURAHS.map(s => <option key={s} value={s} />)}
            </datalist>
            <datalist id="ayats">
                {Array.from({length: 286}, (_, i) => i + 1).map(n => <option key={n} value={n} />)}
            </datalist>
        </form>
    );
}
export default function SetoranHarianPage() {
    const { 
        halaqah, 
        santri, 
        setoranHarian, 
        addSetoranHarianRecord, 
        updateSetoranHarianRecord, 
        deleteSetoranHarianRecord,
        attendance,
        addAttendanceRecords,
        updateAttendanceRecord,
        globalWaktuHalaqah,
        globalAttendanceStatus,
        globalMarhalahs,
        globalJenisHalaqah,
        appSettings,
        userProfile, waliKelas, loading, masterKelas, masterMarhalahs
    } = useSupabaseData();

    // Configuration from appSettings
    const SCHEME_OPTIONS = useMemo(() => {
        const setting = appSettings.find(s => s.key === 'SETORAN_SKEMA_OPTIONS');
        return setting?.value ? setting.value.split(',') : ['Ziyadah', 'Murojaah', 'Sabqi', 'Manzil', 'Lainnya'];
    }, [appSettings]);

    const NILAI_OPTIONS = useMemo(() => {
        const setting = appSettings.find(s => s.key === 'SETORAN_NILAI_OPTIONS');
        return setting?.value ? setting.value.split(',') : ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Dhaif'];
    }, [appSettings]);

    const WAKTU_SKEMA_MAP = useMemo(() => {
        const setting = appSettings.find(s => s.key === 'SETORAN_WAKTU_SKEMA_MAP');
        try {
            return setting?.value ? JSON.parse(setting.value) : { "Shubuh": "Ziyadah", "Dhuha": "Murojaah", "Ashar": "Murojaah", "Maghrib": "Ziyadah", "Isya": "Murojaah" };
        } catch {
            return {};
        }
    }, [appSettings]);

    const AUTO_SETTINGS = useMemo(() => {
        const enable = appSettings.find(s => s.key === 'SETORAN_AUTO_ENABLE')?.value === 'true';
        const base = Number(appSettings.find(s => s.key === 'SETORAN_AUTO_BASE')?.value) || 100;
        const kabir = Number(appSettings.find(s => s.key === 'SETORAN_AUTO_KABIR')?.value) || 20;
        const shoghir = Number(appSettings.find(s => s.key === 'SETORAN_AUTO_SHOGHIR')?.value) || 10;
        let ranges: {label: string, min: number}[] = [];
        try {
            ranges = JSON.parse(appSettings.find(s => s.key === 'SETORAN_AUTO_RANGES')?.value || '[]');
        } catch {}
        if (ranges.length === 0) {
             const parts = (appSettings.find(s => s.key === 'SETORAN_NILAI_OPTIONS')?.value || 'Mumtaz,Jayyid Jiddan,Jayyid,Maqbul,Dhaif').split(',');
             ranges = parts.map((p, i) => ({ label: p.trim(), min: Math.max(0, 100 - (i*10)) }));
        }
        // sort ranges by min descending
        ranges.sort((a,b) => b.min - a.min);
        
        return { enable, base, kabir, shoghir, ranges };
    }, [appSettings]);

    const calculateAutoNilai = (shoghir: number, kabir: number, jumlahHalaman: number) => {
        if (!AUTO_SETTINGS.enable) return null;
        const hal = jumlahHalaman > 0 ? jumlahHalaman : 1;
        let score = AUTO_SETTINGS.base - ((kabir / hal) * AUTO_SETTINGS.kabir) - ((shoghir / hal) * AUTO_SETTINGS.shoghir);
        if (score < 0) score = 0;
        
        for (const range of AUTO_SETTINGS.ranges) {
            if (score >= range.min) return range.label;
        }
        return AUTO_SETTINGS.ranges[AUTO_SETTINGS.ranges.length - 1]?.label || '';
    };



        const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedWaktu, setSelectedWaktu] = useState<string>('');
    const [filterMarhalah, setFilterMarhalah] = useState<string | 'all'>('all');
    const [filterKelas, setFilterKelas] = useState<string | 'all'>('all');
    const [filterJenis, setFilterJenis] = useState<string | 'all'>('all');
    const [filterPeran, setFilterPeran] = useState<string | 'all'>('all');

    useEffect(() => {
        if (globalWaktuHalaqah && globalWaktuHalaqah.length > 0 && !selectedWaktu) {
            setSelectedWaktu(globalWaktuHalaqah[0]);
        }
    }, [globalWaktuHalaqah, selectedWaktu]);
        const [selectedHalaqahId, setSelectedHalaqahId] = useState<number | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSantriIds, setSelectedSantriIds] = useState<Set<string>>(new Set());
    const [pendingAttendance, setPendingAttendance] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [sortBy, setSortBy] = useState<'halaqah' | 'az' | 'kelas'>('halaqah');

    // Kunci penyimpanan draf lokal kehadiran setoran per tanggal dan sesi waktu
    const draftKey = useMemo(() => {
        if (!selectedDate || !selectedWaktu) return null;
        return `draft_setoran_att_${selectedDate}_${selectedWaktu}`;
    }, [selectedDate, selectedWaktu]);

    const [draftRestoredInfo, setDraftRestoredInfo] = useState<{ count: number; time: string } | null>(null);

    // =========================================================================
    // LAPIS 1: Pencegahan Fisik Tarikan Layar / Pull-to-Refresh Gesture
    // =========================================================================
    useEffect(() => {
        let touchStartY = 0;
        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
        };
        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const currentY = e.touches[0].clientY;
            const mainContainer = document.querySelector('main');
            const isAtTop = mainContainer ? mainContainer.scrollTop <= 0 : window.scrollY <= 0;
            if (isAtTop && currentY > touchStartY + 8) {
                if (e.cancelable) e.preventDefault();
            }
        };
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
        };
    }, []);

    // =========================================================================
    // LAPIS 2: Pelindung Reload & Navigasi Browser (beforeunload)
    // =========================================================================
    useEffect(() => {
        if (Object.keys(pendingAttendance).length === 0) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'Data pengisian kehadiran santri/musammi belum disimpan.';
            return 'Data pengisian kehadiran santri/musammi belum disimpan.';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [pendingAttendance]);

    // =========================================================================
    // LAPIS 3: Auto-Save Draf Lokal & Pemulihan Otomatis Kehadiran Setoran
    // =========================================================================
    useEffect(() => {
        if (!draftKey) {
            setPendingAttendance({});
            setDraftRestoredInfo(null);
            return;
        }

        let draftRestored = false;
        try {
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
                const parsed = JSON.parse(rawDraft);
                if (parsed && parsed.data && Object.keys(parsed.data).length > 0) {
                    setPendingAttendance(parsed.data);
                    setDraftRestoredInfo({
                        count: Object.keys(parsed.data).length,
                        time: parsed.lastModified || 'Tersimpan otomatis'
                    });
                    draftRestored = true;
                }
            }
        } catch (e) {
            console.error("Gagal membaca draf kehadiran setoran:", e);
        }

        if (!draftRestored) {
            setPendingAttendance({});
            setDraftRestoredInfo(null);
        }
    }, [draftKey, selectedHalaqahId]);

    const handleDiscardDraft = () => {
        if (draftKey) {
            localStorage.removeItem(draftKey);
        }
        setDraftRestoredInfo(null);
        setPendingAttendance({});
    };

    const updatePendingAttendanceWithDraft = (updater: (prev: Record<string, string>) => Record<string, string>) => {
        setPendingAttendance(prev => {
            const next = updater(prev);
            if (draftKey) {
                try {
                    if (Object.keys(next).length > 0) {
                        localStorage.setItem(draftKey, JSON.stringify({
                            date: selectedDate,
                            waktu: selectedWaktu,
                            data: next,
                            lastModified: format(new Date(), 'HH:mm')
                        }));
                    } else {
                        localStorage.removeItem(draftKey);
                    }
                } catch (e) {
                    console.error("Gagal menyimpan draf kehadiran:", e);
                }
            }
            return next;
        });
    };

    useEffect(() => { setCurrentPage(1); }, [selectedHalaqahId, searchTerm, filterMarhalah, filterKelas, filterJenis, sortBy, selectedWaktu, selectedDate]);

    const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
    const [editingState, setEditingState] = useState<Partial<any>>({});

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const defaultSkema = WAKTU_SKEMA_MAP[selectedWaktu] || SCHEME_OPTIONS[0] || 'Ziyadah';

    const [addForm, setAddForm] = useState({
        santri_id: '',
        waktu: '',
        surat_mulai: '',
        ayat_mulai: '',
        surat_selesai: '',
        ayat_selesai: '',
        skema: defaultSkema,
        nilai: NILAI_OPTIONS[0] || 'Mumtaz',
        keterangan: '',
        jumlah_halaman: '',
        kesalahan_kabir: '0',
        kesalahan_shoghir: '0'
    });

    useEffect(() => {
        setAddForm(prev => ({ ...prev, skema: WAKTU_SKEMA_MAP[selectedWaktu] || SCHEME_OPTIONS[0] || 'Ziyadah' }));
    }, [selectedWaktu, WAKTU_SKEMA_MAP, SCHEME_OPTIONS]);

    // Auto update addForm
    useEffect(() => {
        if (AUTO_SETTINGS.enable) {
            const shoghir = Number(addForm.kesalahan_shoghir) || 0;
            const kabir = Number(addForm.kesalahan_kabir) || 0;
            let halaman = Number(addForm.jumlah_halaman);
            if (isNaN(halaman) || halaman <= 0) halaman = 1;
            
            const autoLabel = calculateAutoNilai(shoghir, kabir, halaman);
            if (autoLabel && autoLabel !== addForm.nilai) {
                setAddForm(prev => ({ ...prev, nilai: autoLabel }));
            }
        }
    }, [addForm.kesalahan_shoghir, addForm.kesalahan_kabir, addForm.jumlah_halaman, AUTO_SETTINGS]);

    // Auto update editingState
    useEffect(() => {
        if (AUTO_SETTINGS.enable && editingRecordId) {
            const shoghir = Number(editingState.kesalahan_shoghir) || 0;
            const kabir = Number(editingState.kesalahan_kabir) || 0;
            let halaman = Number(editingState.jumlah_halaman);
            if (isNaN(halaman) || halaman <= 0) halaman = 1;
            
            const autoLabel = calculateAutoNilai(shoghir, kabir, halaman);
            if (autoLabel && autoLabel !== editingState.nilai) {
                setEditingState(prev => ({ ...prev, nilai: autoLabel }));
            }
        }
    }, [editingState.kesalahan_shoghir, editingState.kesalahan_kabir, editingState.jumlah_halaman, AUTO_SETTINGS, editingRecordId]);


    const filteredHalaqah = useMemo(() => {
        let base = halaqah.filter(h => h.is_active === true);
        if (userProfile?.role === 'musammi') {
            base = base.filter(h => 
                (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                (h.musammi?.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim())
            );
        }
        if (filterMarhalah !== 'all') {
            const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === filterMarhalah)?.id;
            base = base.filter(h => h.marhalah === filterMarhalah || (targetMarhalahId && h.marhalah_id === targetMarhalahId));
        }
        if (filterJenis !== 'all') base = base.filter(h => h.jenis === filterJenis);
        return base;
    }, [halaqah, userProfile, filterMarhalah, filterJenis, masterMarhalahs]);

    const targetHalaqah = selectedHalaqahId === 'all' ? undefined : filteredHalaqah.find(h => h.id === selectedHalaqahId);
    
    // Students in this halaqah
    const tableData = useMemo(() => {
        let list: any[] = [];
        
        const getActiveSantriForDate = (h: any, dateStr: string) => {
            if (!h.history) return h.santri || [];
            return h.history.filter((hs: any) => {
                if (!hs.santri) return false;
                if (hs.start_date && new Date(hs.start_date.includes('/') ? hs.start_date.split('/').reverse().join('-') : hs.start_date).getTime() > new Date(dateStr.length > 10 ? dateStr.substring(0,10) : dateStr).getTime()) return false;
                if (hs.end_date && hs.end_date.trim() !== '' && new Date(hs.end_date.includes('/') ? hs.end_date.split('/').reverse().join('-') : hs.end_date).getTime() < new Date(dateStr.length > 10 ? dateStr.substring(0,10) : dateStr).getTime()) return false;
                return true;
            }).map((hs: any) => hs.santri);
        };

        const processHalaqah = (h: any) => {
            let halaqahItems: any[] = [];
            if (h.musammi) {
                halaqahItems.push({
                    ...h.musammi,
                    id: h.musammi.id,
                    isMusammi: true,
                    halaqah_info: { id: h.id, nama: h.nama, musammi: h.musammi.nama }
                });
            }
            const santris = getActiveSantriForDate(h, selectedDate).map((s: any) => ({ 
                ...s, 
                id: s.id,
                isMusammi: false,
                halaqah_info: { id: h.id, nama: h.nama, musammi: h.musammi.nama } 
            }));
            halaqahItems.push(...santris);
            return halaqahItems;
        };

        if (selectedHalaqahId === 'all') {
            list = filteredHalaqah.flatMap(h => processHalaqah(h));
        } else if (targetHalaqah) {
            list = processHalaqah(targetHalaqah);
        }
        
        let result = list.filter(s => (s.nama || '').toLowerCase().includes(searchTerm.toLowerCase()));

        if (filterMarhalah !== 'all') {
            const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === filterMarhalah)?.id;
            result = result.filter(s => s.isMusammi || s.marhalah === filterMarhalah || (targetMarhalahId && s.marhalah_id === targetMarhalahId));
        }
        if (filterKelas !== 'all') {
            result = result.filter(s => s.isMusammi || s.kelas === filterKelas);
        }

        if (filterPeran === 'santri') {
            result = result.filter(s => !s.isMusammi);
        } else if (filterPeran === 'musammi') {
            result = result.filter(s => s.isMusammi);
        }

        if (userProfile?.role === 'pengajar') {
            const userWaliClasses = waliKelas.filter(w => w.user_id === userProfile.id).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
            const userMusammiHalaqahs = halaqah.filter(h => 
                (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                (h.musammi?.nama?.toLowerCase().trim() === userProfile?.name?.toLowerCase().trim())
            ).map(h => h.id);

            result = result.filter(s => 
                s.isMusammi || 
                userWaliClasses.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas) ||
                (s.halaqah_info && userMusammiHalaqahs.includes(s.halaqah_info.id))
            );
        }

        if (sortBy === 'az') {
            result.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
        } else if (sortBy === 'kelas') {
            result.sort((a, b) => {
                if (a.isMusammi && !b.isMusammi) return -1;
                if (!a.isMusammi && b.isMusammi) return 1;
                const kA = a.kelas || '';
                const kB = b.kelas || '';
                if (kA !== kB) return kA.localeCompare(kB);
                return (a.nama || '').localeCompare(b.nama || '');
            });
        } else {
            result.sort((a, b) => {
                const halA = a.halaqah_info?.nama || '';
                const halB = b.halaqah_info?.nama || '';
                if (halA !== halB) return halA.localeCompare(halB);
                if (a.isMusammi && !b.isMusammi) return -1;
                if (!a.isMusammi && b.isMusammi) return 1;
                return (a.nama || '').localeCompare(b.nama || '');
            });
        }
        
        return result;
    }, [filteredHalaqah, targetHalaqah, selectedHalaqahId, searchTerm, selectedDate, filterMarhalah, filterKelas, filterPeran, userProfile, waliKelas, sortBy]);

    // Keep santriInHalaqah for the dropdowns (only santri)
    const santriInHalaqah = useMemo(() => tableData.filter(d => !d.isMusammi), [tableData]);
    
    const totalPages = Math.ceil(tableData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const end = currentPage * ITEMS_PER_PAGE;
        return tableData.slice(0, end);
    }, [tableData, currentPage]);
    



    const activeSetoranRecords = useMemo(() => {
        if (selectedHalaqahId === 'all') {
            const allowedIds = filteredHalaqah.map(h => h.id);
            return setoranHarian.filter(r => r.tanggal === selectedDate && r.halaqah_id && allowedIds.includes(r.halaqah_id));
        }
        return setoranHarian.filter(r => r.tanggal === selectedDate && r.halaqah_id === selectedHalaqahId);
    }, [setoranHarian, selectedDate, selectedHalaqahId, filteredHalaqah]);

    // Optimizations for lookup
    const activeSetoranRecordsMap = useMemo(() => {
        const map = new Map<number, any[]>();
        for (const r of activeSetoranRecords) {
            if (r.waktu === selectedWaktu) {
                const arr = map.get(r.santri_id) || [];
                arr.push(r);
                map.set(r.santri_id, arr);
            }
        }
        return map;
    }, [activeSetoranRecords, selectedWaktu]);

    const attendanceMap = useMemo(() => {
        const map = new Map<string, any>();
        for (const a of attendance) {
            if (a.date === selectedDate && a.waktu === selectedWaktu) {
                map.set(`${a.peran}-${a.halaqahId}-${a.personId}`, a);
            }
        }
        return map;
    }, [attendance, selectedDate, selectedWaktu]);

    const handleSaveAdd = async (formData: any) => {
        if (!formData.santri_id) return alert('Pilih Santri');
        try {
            const santriId = parseInt(formData.santri_id);
            const santriData = tableData.find(s => s.id === santriId);
            const halaqahIdToUse = santriData?.halaqah_info?.id;
            
            if (!halaqahIdToUse) return alert('Halaqah tidak valid untuk santri ini');

            // Implicitly add attendance if not already present, respecting pending 'Terlambat' / 'Hadir' status
            const pendingKey = `${santriData.isMusammi ? 'Musammi' : 'Santri'}-${halaqahIdToUse}-${santriId}`;
            const pendingStatus = pendingAttendance[pendingKey];
            const existingAtt = attendance.find(a => a.personId === santriId && a.date === selectedDate && a.halaqahId === halaqahIdToUse && a.waktu === formData.waktu);
            if (!existingAtt) {
                const statusToUse = pendingStatus || globalAttendanceStatus[0] || 'Hadir';
                await addAttendanceRecords([{
                    date: selectedDate,
                    waktu: formData.waktu as any,
                    personId: santriId,
                    peran: santriData.isMusammi ? 'Musammi' as any : 'Santri' as any,
                    status: statusToUse as any,
                    halaqahId: halaqahIdToUse as number
                }]);
                if (pendingStatus) {
                    setPendingAttendance(prev => {
                        const next = { ...prev };
                        delete next[pendingKey];
                        return next;
                    });
                }
            } else if (pendingStatus && pendingStatus !== existingAtt.status) {
                await updateAttendanceRecord(existingAtt.id, { status: pendingStatus as any });
                setPendingAttendance(prev => {
                    const next = { ...prev };
                    delete next[pendingKey];
                    return next;
                });
            }

            if (formData.id) {
                await updateSetoranHarianRecord(formData.id, {
                    surat_mulai: formData.surat_mulai || formData.surat,
                    ayat_mulai: formData.ayat_mulai || formData.ayat,
                    surat_selesai: formData.surat_selesai,
                    ayat_selesai: formData.ayat_selesai,
                    surat: formData.surat_mulai || formData.surat,
                    ayat: formData.ayat_mulai || formData.ayat,
                    skema: formData.skema,
                    nilai: formData.nilai,
                    jumlah_halaman: formData.jumlah_halaman ? parseFloat(formData.jumlah_halaman) : null,
                    kesalahan_kabir: formData.kesalahan_kabir ? parseInt(formData.kesalahan_kabir) : 0,
                    kesalahan_shoghir: formData.kesalahan_shoghir ? parseInt(formData.kesalahan_shoghir) : 0,
                    keterangan: formData.keterangan,
                    waktu: formData.waktu
                });
            } else {
                await addSetoranHarianRecord({
                    santri_id: santriId,
                    halaqah_id: halaqahIdToUse,
                    tanggal: selectedDate,
                    waktu: formData.waktu,
                    surat_mulai: formData.surat_mulai || formData.surat,
                    ayat_mulai: formData.ayat_mulai || formData.ayat,
                    surat_selesai: formData.surat_selesai,
                    ayat_selesai: formData.ayat_selesai,
                    surat: formData.surat_mulai || formData.surat,
                    ayat: formData.ayat_mulai || formData.ayat,
                    skema: formData.skema,
                    nilai: formData.nilai,
                    jumlah_halaman: formData.jumlah_halaman ? parseFloat(formData.jumlah_halaman) : null,
                    kesalahan_kabir: formData.kesalahan_kabir ? parseInt(formData.kesalahan_kabir) : 0,
                    kesalahan_shoghir: formData.kesalahan_shoghir ? parseInt(formData.kesalahan_shoghir) : 0,
                    keterangan: formData.keterangan
                });
            }
            // Tele notification logic
            try {
                const telEnable = appSettings.find(s => s.key === 'SETORAN_TELEGRAM_NOTIF_ENABLE')?.value === 'true';
                if (telEnable) {
                    let template = appSettings.find(s => s.key === 'SETORAN_TELEGRAM_NOTIF_TEMPLATE')?.value || '';
                    const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value || import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
                    const chatId = santriData?.telegram_chat_id;
                    
                    if (template && botToken && chatId) {
                        const sMulai = formData.surat_mulai || formData.surat || '-';
                        const aMulai = formData.ayat_mulai || formData.ayat || '-';
                        const sSelesai = formData.surat_selesai ? ` - ${formData.surat_selesai}` : '';
                        const aSelesai = formData.ayat_selesai ? ` ayat ${formData.ayat_selesai}` : '';
                        
                        const msg = template
                            .replace(/{nama_santri}/g, santriData.nama || '')
                            .replace(/{halaqah}/g, santriData.halaqah_info?.nama || '')
                            .replace(/{tanggal}/g, selectedDate || '')
                            .replace(/{waktu}/g, formData.waktu || '')
                            .replace(/{surat}/g, sMulai + sSelesai)
                            .replace(/{ayat}/g, aMulai + aSelesai)
                            .replace(/{skema}/g, formData.skema || '')
                            .replace(/{nilai}/g, formData.nilai || '')
                            .replace(/{khoto_kabir}/g, formData.kesalahan_kabir || '0')
                            .replace(/{khoto_shoghir}/g, formData.kesalahan_shoghir || '0')
                            .replace(/{jumlah_halaman}/g, formData.jumlah_halaman || '0')
                            .replace(/{keterangan}/g, formData.keterangan || '-');
                            
                        await sendCustomTelegramMessage(botToken, chatId, msg);
                    }
                }
            } catch (err) {
                console.error("Failed sending telegram notif", err);
            }

            setIsAddModalOpen(false);
            setAddForm({ santri_id: '', waktu: '', surat: '', ayat: '', skema: defaultSkema, nilai: NILAI_OPTIONS[0] || 'Mumtaz', keterangan: '', jumlah_halaman: '', kesalahan_kabir: '0', kesalahan_shoghir: '0' });
        } catch (e) {
            console.error(e);
            alert("Gagal menyimpan");
        }
    };

    const handleEditClick = (r: any) => {
        setAddForm({
            id: r.id,
            santri_id: r.santri_id.toString(),
            waktu: r.waktu || selectedWaktu,
            surat_mulai: r.surat_mulai || r.surat || '',
            ayat_mulai: r.ayat_mulai || r.ayat || '',
            surat_selesai: r.surat_selesai || '',
            ayat_selesai: r.ayat_selesai || '',
            surat: r.surat_mulai || r.surat || '',
            ayat: r.ayat_mulai || r.ayat || '',
            skema: r.skema || defaultSkema,
            nilai: r.nilai || NILAI_OPTIONS[0] || 'Mumtaz',
            jumlah_halaman: r.jumlah_halaman || '',
            kesalahan_kabir: r.kesalahan_kabir || '0',
            kesalahan_shoghir: r.kesalahan_shoghir || '0',
            keterangan: r.keterangan || ''
        });
        setIsAddModalOpen(true);
    };

    const handleSaveEdit = async (id: number) => {
        try {
            await updateSetoranHarianRecord(id, editingState);
            setEditingRecordId(null);
        } catch (e) {
            console.error(e);
            alert("Gagal merubah data");
        }
    };

    const handleDelete = async (id: number) => {
        if(confirm("Hapus catatan setoran harian ini?")) {
            try {
                await deleteSetoranHarianRecord(id);
            } catch (e) {
                console.error(e);
                alert("Gagal menghapus data");
            }
        }
    };

    const handleMusammiAttendanceChange = (musammiId: number, halaqahId: number, status: string) => {
        const key = `Musammi-${halaqahId}-${musammiId}`;
        updatePendingAttendanceWithDraft(prev => ({ ...prev, [key]: status }));
    };

    const handleAttendanceChange = (santriId: number, halaqahId: number, isMusammi: boolean, status: string) => {
        const key = `${isMusammi ? 'Musammi' : 'Santri'}-${halaqahId}-${santriId}`;
        updatePendingAttendanceWithDraft(prev => ({ ...prev, [key]: status }));
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedSantriIds(new Set(tableData.map(s => `${s.isMusammi ? 'Musammi' : 'Santri'}-${s.halaqah_info?.id}-${s.id}`)));
        } else {
            setSelectedSantriIds(new Set());
        }
    };

    const handleSelectSantri = (idStr: string, checked: boolean) => {
        const newSet = new Set(selectedSantriIds);
        if (checked) newSet.add(idStr);
        else newSet.delete(idStr);
        setSelectedSantriIds(newSet);
    };

    const handleBulkAttendance = (status: string) => {
        const updates: Record<string, string> = {};
        selectedSantriIds.forEach(idStr => {
            const [peran, halaqahIdStr, personIdStr] = idStr.split('-');
            updates[`${peran}-${halaqahIdStr}-${personIdStr}`] = status;
        });
        updatePendingAttendanceWithDraft(prev => ({ ...prev, ...updates }));
    };

    const handleSaveAllAttendance = async () => {
        if (Object.keys(pendingAttendance).length === 0) return;
        setIsSaving(true);
        try {
            const updatesToSave: any[] = [];
            const newRecords: any[] = [];
            
            for (const [key, status] of Object.entries(pendingAttendance)) {
                const [peran, halaqahIdStr, personIdStr] = key.split('-');
                const halaqahId = parseInt(halaqahIdStr);
                const personId = parseInt(personIdStr);
                
                const existingAtt = attendance.find(a => a.personId === personId && a.peran === peran && a.date === selectedDate && a.halaqahId === halaqahId && a.waktu === selectedWaktu);
                if (existingAtt) {
                    if (existingAtt.status !== status) {
                        updatesToSave.push({ id: existingAtt.id, status });
                    }
                } else {
                    newRecords.push({
                        date: selectedDate,
                        waktu: selectedWaktu as any,
                        personId: personId,
                        peran: peran as any,
                        status: status as any,
                        halaqahId: halaqahId
                    });
                }
            }

            if (newRecords.length > 0) {
                await addAttendanceRecords(newRecords);
            }
            
            for (const update of updatesToSave) {
                await updateAttendanceRecord(update.id, { status: update.status as any });
            }

            if (draftKey) {
                localStorage.removeItem(draftKey);
            }
            setDraftRestoredInfo(null);
            setPendingAttendance({});
            alert("Data kehadiran berhasil disimpan");
        } catch (e) {
            console.error(e);
            alert("Gagal menyimpan data kehadiran");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Memuat data...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2 overscroll-y-contain">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2.5 mb-2">
                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">Input Setoran Harian</h2>
                        {Object.keys(pendingAttendance).length > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                Perubahan belum disimpan ({Object.keys(pendingAttendance).length})
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 font-medium">Catat hafalan dan murojaah harian santri.</p>
                </div>
                
                {selectedHalaqahId && (selectedHalaqahId === 'all' || targetHalaqah) && (
                    <div className="flex gap-2">
                        <button 
                            onClick={handleSaveAllAttendance}
                            disabled={isSaving || Object.keys(pendingAttendance).length === 0}
                            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save size={18} strokeWidth={2.5} /> {isSaving ? 'Menyimpan...' : 'Simpan Kehadiran'}
                        </button>
                    </div>
                )}
            </div>

            {/* Lapisan 3: Notifikasi Pemulihan Draf Otomatis Kehadiran Setoran (Clean, Simple, Konsisten) */}
            {draftRestoredInfo && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-blue-200/90 bg-blue-50/70 text-slate-800 shadow-2xs">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700">
                            <Clock size={16} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-slate-900">Draf Kehadiran Setoran Dipulihkan Otomatis</span>
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100/80 text-blue-800">
                                    Pukul {draftRestoredInfo.time}
                                </span>
                            </div>
                            <p className="text-[12px] text-slate-600 mt-0.5">
                                Terdapat {draftRestoredInfo.count} isian kehadiran santri yang belum tersimpan dan telah diamankan otomatis ke formulir ini.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                            type="button"
                            onClick={handleDiscardDraft}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                            Buang Draf
                        </button>
                        <button
                            type="button"
                            onClick={() => setDraftRestoredInfo(null)}
                            className="px-3.5 py-1.5 rounded-lg bg-white text-[12px] font-semibold text-slate-700 border border-slate-200/90 shadow-2xs hover:bg-slate-50 transition-colors"
                        >
                            Gunakan Draf
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col gap-5 z-10 relative">
                <div className="flex flex-col md:flex-row gap-5">
                    <div className="flex-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Pencarian Santri</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cari nama santri..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full border border-slate-200/80 rounded-xl pl-9 pr-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 focus:bg-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>
                    <div className="w-full md:w-[250px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Periode Evaluasi</label>
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-5">
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Marhalah</label>
                        <select
                            value={filterMarhalah}
                            onChange={(e) => {
                                setFilterMarhalah(e.target.value);
                                setFilterKelas('all'); // Reset kelas when marhalah changes
                                setSelectedHalaqahId('all');
                            }}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            <option value="all">Semua Marhalah</option>
                            {globalMarhalahs.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Kelas</label>
                        <select
                            value={filterKelas}
                            onChange={(e) => {
                                setFilterKelas(e.target.value);
                                setSelectedHalaqahId('all');
                            }}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            <option value="all">Semua Kelas</option>
                            {masterKelas
                                .filter(k => filterMarhalah === 'all' || k.marhalah === filterMarhalah)
                                .map(k => k.nama_kelas)
                                .filter((value, index, self) => self.indexOf(value) === index)
                                .sort()
                                .map(k => (
                                    <option key={k} value={k}>{k}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Jenis Halaqah</label>
                        <select
                            value={filterJenis}
                            onChange={(e) => {
                                setFilterJenis(e.target.value);
                                setSelectedHalaqahId('all');
                            }}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            <option value="all">Semua Jenis</option>
                            {globalJenisHalaqah.map(j => (
                                <option key={j} value={j}>{j}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Halaqah</label>
                        <select
                            value={selectedHalaqahId}
                            onChange={(e) => setSelectedHalaqahId(e.target.value === 'all' ? 'all' : (Number(e.target.value) || ''))}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            <option value="all">Semua Halaqah</option>
                            {filteredHalaqah.map(h => (
                                <option key={h.id} value={h.id}>{h.nama}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Peran</label>
                        <select
                            value={filterPeran}
                            onChange={(e) => {
                                setFilterPeran(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            <option value="all">Semua Peran</option>
                            <option value="santri">Santri</option>
                            <option value="musammi">Musammi</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Waktu</label>
                        <select
                            value={selectedWaktu}
                            onChange={(e) => setSelectedWaktu(e.target.value)}
                            className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            {globalWaktuHalaqah.map(w => (
                                <option key={w} value={w}>{w}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {targetHalaqah && (
                <div className="bg-white border text-sm border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                            {targetHalaqah.musammi?.nama?.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-[15px] font-bold text-slate-900 leading-tight">{targetHalaqah.musammi?.nama}</h2>
                            <span className="text-[13px] font-medium text-slate-500">Musammi' - Halaqah {targetHalaqah.nama}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-600">Kehadiran Musammi:</span>
                        <select
                            value={pendingAttendance[`Musammi-${targetHalaqah.id}-${targetHalaqah.musammi.id}`] || attendance.find(a => a.personId === targetHalaqah.musammi.id && a.peran === 'Musammi' && a.date === selectedDate && a.halaqahId === targetHalaqah.id && a.waktu === selectedWaktu)?.status || ''}
                            onChange={(e) => handleMusammiAttendanceChange(targetHalaqah.musammi.id, targetHalaqah.id, e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-medium min-w-[160px]"
                        >
                            <option value="" disabled>Belum absen</option>
                            {globalAttendanceStatus.map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {selectedHalaqahId ? (
                <div className="bg-white border text-sm border-slate-200 rounded-xl overflow-visible shadow-sm">
                    {selectedSantriIds.size > 0 && (
                        <div className="bg-white border-b border-slate-200 p-3 flex items-center justify-between">
                            <span className="text-sm text-slate-800 font-semibold">{selectedSantriIds.size} santri dipilih</span>
                            <div className="flex gap-2 items-center">
                                <span className="text-sm text-slate-600">Tandai sebagai:</span>
                                <select 
                                    className="text-sm py-1.5 px-3 border border-slate-200 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-blue-500 font-medium"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleBulkAttendance(e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                >
                                    <option value="" disabled>Pilih Kehadiran...</option>
                                    {globalAttendanceStatus.map(st => <option key={st} value={st}>{st}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 w-12 text-center border-r border-slate-100">
                                        <input 
                                            type="checkbox" 
                                            checked={tableData.length > 0 && selectedSantriIds.size === tableData.length}
                                            onChange={handleSelectAll}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="px-4 py-3 font-semibold text-slate-700 min-w-[220px]">
                                        <div className="flex justify-between items-center relative">
                                            Nama Santri
                                            <div className="relative group cursor-pointer p-1 hover:bg-slate-200 rounded">
                                                <Filter size={14} className="text-slate-500" />
                                                <select 
                                                    value={sortBy} 
                                                    onChange={e => setSortBy(e.target.value as any)}
                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                    title="Urutkan"
                                                >
                                                    <option value="halaqah">Urutkan: Halaqah</option>
                                                    <option value="az">Urutkan: A-Z</option>
                                                    <option value="kelas">Urutkan: Kelas</option>
                                                </select>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-2 py-3 font-semibold text-slate-700 w-24 whitespace-nowrap text-center">Kehadiran</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700 w-20 whitespace-nowrap">Skema</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700 w-[200px] leading-tight text-center">Surat ayat mulai - Surat ayat selesai</th>
                                    <th className="px-2 py-3 font-semibold text-slate-700 text-center w-16 leading-tight" title="Jumlah Halaman">Jml Hal</th>
                                    <th className="px-2 py-3 font-semibold text-slate-700 text-center w-16 leading-tight" title="Khoto Kabir / Khoto Shoghir">Kb/Sh</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700 w-16 text-center">Nilai</th>
                                    <th className="px-3 py-3 font-semibold text-slate-700 w-32">Keterangan</th>
                                    <th className="px-4 py-3 font-semibold text-slate-700 text-right w-16">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedData.map(s => {
                                    const actualHalaqahId = s.halaqah_info?.id;
                                    const records = activeSetoranRecordsMap.get(s.id) || [];
                                    const attRecord = attendanceMap.get(`${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`);
                                    const explicitStatus = attRecord?.status;
                                    const currentStatus = pendingAttendance[`${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`] || explicitStatus || '';
                                    const statusLower = currentStatus ? currentStatus.trim().toLowerCase() : '';
                                    const isHadir = statusLower === 'hadir';
                                    const isTerlambat = statusLower === 'terlambat' || statusLower === 'hadir telat' || statusLower === 'telat';
                                    const canInputSetoran = isHadir || isTerlambat || !currentStatus;
                                    
                                    if (records.length === 0) {
                                        return (
                                            <tr key={`${s.id}-${actualHalaqahId}`} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-3 text-center border-r border-slate-100">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedSantriIds.has(`${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`)}
                                                        onChange={(e) => handleSelectSantri(`${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`, e.target.checked)}
                                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100" rowSpan={1}>
                                                    {s.nama} {s.isMusammi && <span className="ml-2 inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded uppercase">Musammi</span>}
                                                    {selectedHalaqahId === 'all' && s.halaqah_info && (
                                                        <span className="block text-xs text-slate-500 font-normal mt-1">{s.halaqah_info.nama}</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-3 border-r border-slate-100 text-center">
                                                    <select
                                                        value={currentStatus}
                                                        onChange={(e) => handleAttendanceChange(s.id, actualHalaqahId, s.isMusammi, e.target.value)}
                                                        className={`text-[11px] p-1 border rounded w-[75px] text-center font-medium ${
                                                            !currentStatus 
                                                                ? 'bg-slate-100 text-slate-500 border-slate-200' 
                                                                : isHadir 
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                                : isTerlambat 
                                                                ? 'bg-amber-50 text-amber-700 border-amber-300' 
                                                                : 'bg-red-50 text-red-600 border-red-200'
                                                        }`}
                                                    >
                                                        <option value="" disabled>-</option>
                                                        {globalAttendanceStatus.map(st => <option key={st} value={st}>{st}</option>)}
                                                    </select>
                                                </td>
                                                <td colSpan={7} className="px-4 py-3 text-slate-400 italic text-center">
                                                    {!s.isMusammi ? ( canInputSetoran ? (
                                                        <button 
                                                            onClick={() => { setAddForm({...addForm, santri_id: s.id.toString(), waktu: selectedWaktu}); setIsAddModalOpen(true); }} 
                                                            className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium bg-blue-50 px-3 py-1.5 rounded-full text-xs shadow-2xs transition-all hover:bg-blue-100"
                                                        >
                                                            <Plus size={14}/> Input Setoran
                                                        </button>
                                                    ) : (
                                                        <span className="text-red-400">Tidak dapat input setoran karena {currentStatus}</span>
                                                    ) ) : null}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <React.Fragment key={`${s.id}-${actualHalaqahId}-fragment`}>
                                            {records.map((r, idx) => (
                                        <tr key={`${r.id}-${actualHalaqahId}`} className="hover:bg-slate-50/50">
                                            {idx === 0 && (
                                                <>
                                                    <td className="px-4 py-3 text-center border-r border-slate-100 align-middle" rowSpan={records.length}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedSantriIds.has(`${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`)}
                                                            onChange={(e) => handleSelectSantri(`${s.isMusammi ? 'Musammi' : 'Santri'}-${actualHalaqahId}-${s.id}`, e.target.checked)}
                                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100 align-middle" rowSpan={records.length}>
                                                        {s.nama} {s.isMusammi && <span className="ml-2 inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded uppercase">Musammi</span>}
                                                        {selectedHalaqahId === 'all' && s.halaqah_info && (
                                                            <span className="block text-xs text-slate-500 font-normal mt-1">{s.halaqah_info.nama}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-3 border-r border-slate-100 align-middle text-center" rowSpan={records.length}>
                                                        <select
                                                            value={currentStatus}
                                                            onChange={(e) => handleAttendanceChange(s.id, actualHalaqahId, s.isMusammi, e.target.value)}
                                                            className={`text-[11px] p-1 border rounded w-[75px] text-center font-medium ${
                                                                !currentStatus 
                                                                    ? 'bg-slate-100 text-slate-500 border-slate-200' 
                                                                    : isHadir 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                                    : isTerlambat 
                                                                    ? 'bg-amber-50 text-amber-700 border-amber-300' 
                                                                    : 'bg-red-50 text-red-600 border-red-200'
                                                            }`}
                                                        >
                                                            <option value="" disabled>-</option>
                                                            {globalAttendanceStatus.map(st => <option key={st} value={st}>{st}</option>)}
                                                        </select>
                                                    </td>
                                                </>
                                            )}
                                            
                                            
                                                <>
                                                    <td className="px-4 py-3 text-slate-700">
                                                        <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs truncate max-w-[100px]">{r.skema}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700">
                                                        <span className="font-bold text-slate-700">{r.surat_mulai || r.surat || '-'}</span> {r.ayat_mulai || r.ayat ? <span className="text-slate-500">: {r.ayat_mulai || r.ayat}</span> : ''}
                                                        {r.surat_selesai ? <span className="text-slate-300 mx-2">-</span> : ''}
                                                        {r.surat_selesai ? <><span className="font-bold text-slate-700">{r.surat_selesai}</span> {r.ayat_selesai ? <span className="text-slate-500">: {r.ayat_selesai}</span> : ''}</> : ''}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-medium text-slate-600">{r.jumlah_halaman || '-'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {(r.kesalahan_kabir !== undefined && r.kesalahan_kabir !== null) || (r.kesalahan_shoghir !== undefined && r.kesalahan_shoghir !== null) ? (
                                                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-xs font-semibold">
                                                                <span className="text-red-500">{r.kesalahan_kabir || '0'}</span>
                                                                <span className="text-slate-300">/</span>
                                                                <span className="text-amber-500">{r.kesalahan_shoghir || '0'}</span>
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700 font-medium">{r.nilai}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-xs">{r.keterangan || '-'}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex justify-end items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
                                                            {idx === 0 && canInputSetoran && !s.isMusammi && (
                                                                <button 
                                                                    onClick={() => { setAddForm({...addForm, santri_id: s.id.toString(), waktu: selectedWaktu}); setIsAddModalOpen(true); }} 
                                                                    title="Tambah Setoran Lainnya" 
                                                                    className="text-emerald-600 p-1 bg-emerald-50 hover:bg-emerald-100 rounded"
                                                                >
                                                                    <Plus size={14}/>
                                                                </button>
                                                            )}
                                                            <button onClick={() => handleEditClick(r)} title="Edit" className="text-blue-600 p-1 bg-blue-50 hover:bg-blue-100 rounded"><Edit size={14}/></button>
                                                            <button onClick={() => handleDelete(r.id)} title="Hapus" className="text-red-600 p-1 bg-red-50 hover:bg-red-100 rounded"><Trash size={14}/></button>
                                                        </div>
                                                    </td>
                                                </>
</tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            </table>
                            
                            {totalPages > 1 && (
                                <div className="p-4 border-t border-slate-200 flex flex-col items-center bg-slate-50 rounded-b-xl">
                                    <div className="text-sm text-slate-500 w-full px-4 pt-2">
                                        Menampilkan {Math.min(currentPage * ITEMS_PER_PAGE, tableData.length)} dari {tableData.length} data
                                    </div>
                                    <div className="flex justify-end w-full mt-2 mb-2 pr-4">
                                        {currentPage < totalPages && (
                                            <button 
                                                onClick={() => setCurrentPage(p => p + 1)}
                                                className="px-4 py-2 text-sm border rounded-lg bg-white text-blue-600 hover:bg-blue-50 font-medium shadow-sm transition-colors"
                                            >
                                                Load More (50)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                    </div>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
                    Silakan pilih Halaqah untuk melihat dan menginput santri.
                </div>
            )}

            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Tambah Catatan Setoran" noPadding>
                <AddSetoranForm 
                    initialData={addForm}
                    onSave={handleSaveAdd}
                    onCancel={() => setIsAddModalOpen(false)}
                    santriInHalaqah={santriInHalaqah}
                    tableData={tableData}
                    attendanceMap={attendanceMap}
                    pendingAttendance={pendingAttendance}
                    selectedDate={selectedDate}
                    selectedWaktu={selectedWaktu}
                    SCHEME_OPTIONS={SCHEME_OPTIONS}
                    NILAI_OPTIONS={NILAI_OPTIONS}
                    AUTO_SETTINGS={AUTO_SETTINGS}
                    isSaving={isSaving}
                />
            </Modal>
        </div>
    );
}
