
import React, { useState, useMemo, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import Card from '../components/Card';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Marhalah, HalaqahType, Waktu, Peran } from '../types';
import type { Halaqah as HalaqahData, Person } from '../types';
// Removed globalJenisHalaqah import
import { format } from 'date-fns';
import { generateMessageText, sendMessageTelegram, sendMessageFonnte } from '../lib/notifications';
import { 
  Calendar, 
  ChevronDown, 
  Search,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock
} from "lucide-react";

const statusColorMap: Record<string, string> = {
    'Hadir': 'bg-emerald-500',
    'Izin': 'bg-blue-500',
    'Sakit': 'bg-amber-500',
    'Alpa': 'bg-rose-500',
    'Terlambat': 'bg-orange-500',
};

const AttendanceRow: React.FC<{
    person: Person;
    role: Peran; // Explicitly pass role to prevent ambiguity
    halaqahId: number;
    status: string;
    globalAttendanceStatus: string[];
    onStatusChange: (personId: number, role: Peran, halaqahId: number, status: string) => void;
}> = React.memo(({ person, role, halaqahId, status, globalAttendanceStatus, onStatusChange }) => {
    const color = role === Peran.Musammi ? "bg-indigo-100 text-indigo-700 border-indigo-200" : "bg-blue-100 text-blue-700 border-blue-200";
    
    return (
        <div className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-bold border shadow-sm flex-shrink-0 ${color}`}>
              {person.nama.charAt(0)}
            </div>
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-slate-900 truncate">
                  {person.nama} {person.kode && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-mono font-normal">{person.kode}</span>}
              </h4>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  <MarhalahLabel text={person.marhalah} id={person.marhalah_id} /> - <KelasLabel text={person.kelas} id={person.kelas_id} /> ({role})
              </p>
            </div>
          </div>
          
          <div className="flex-shrink-0 ml-4 relative">
            <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none z-10 ${statusColorMap[status] || 'bg-slate-500'}`} />
            <select 
              value={status}
              onChange={(e) => onStatusChange(person.id, role, halaqahId, e.target.value)}
              className="appearance-none h-9 w-[110px] rounded-lg border border-slate-200/80 bg-white pl-6 pr-8 text-[12px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)] outline-none cursor-pointer transition-all hover:border-slate-300 hover:shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {globalAttendanceStatus?.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
    );
});

const HalaqahCard: React.FC<{
    halaqah: HalaqahData;
    attendanceData: Record<string, { status: string; halaqahId: number }>;
    globalAttendanceStatus: string[];
    onStatusChange: (personId: number, role: Peran, halaqahId: number, status: string) => void;
}> = React.memo(({ halaqah, attendanceData, globalAttendanceStatus, onStatusChange }) => {
    
    // Helper to generate composite key
    const getKey = (id: number, role: Peran) => `${role}_${id}`;

    return (
        <div className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_4px_16px_0_rgba(0,0,0,0.02)] overflow-hidden flex flex-col h-full">
            {/* Card Header */}
            <div className="p-5 border-b border-slate-200/60 bg-slate-50/30 flex justify-between items-start">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900 tracking-tight">{halaqah.nama}</h2>
                <p className="text-[13px] text-slate-500 font-medium mt-0.5"><MarhalahLabel text={halaqah.marhalah} id={halaqah.marhalah_id} /> - {halaqah.jenis}</p>
              </div>
              <div className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200/60">
                {halaqah.santri.length + (halaqah.musammi && halaqah.musammi.id > 0 ? 1 : 0)} Anggota
              </div>
            </div>

            {/* Card Content Area */}
            <div className="p-2 flex-1 flex flex-col">
              
              {/* MUSAMMI Section */}
              <div className="mb-2">
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <span>Musammi</span>
                  <div className="h-px flex-1 bg-slate-100 mt-0.5"></div>
                </div>
                
                <div className="space-y-1">
                    {halaqah.musammi && halaqah.musammi.id > 0 ? (
                        <AttendanceRow
                            person={halaqah.musammi}
                            role={Peran.Musammi}
                            halaqahId={halaqah.id}
                            status={attendanceData[getKey(halaqah.musammi.id, Peran.Musammi)]?.status || (globalAttendanceStatus?.[0] || 'Hadir')}
                            globalAttendanceStatus={globalAttendanceStatus}
                            onStatusChange={onStatusChange}
                        />
                    ) : (
                        <div className="px-3 py-2 text-xs italic text-slate-400">Belum ada Musammi ditugaskan</div>
                    )}
                </div>
              </div>

              {/* SANTRI Section */}
              <div className="mt-2 mb-2">
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <span>Santri ({halaqah.santri.length})</span>
                  <div className="h-px flex-1 bg-slate-100 mt-0.5"></div>
                </div>
                
                <div className="space-y-1">
                    {halaqah.santri.map(s => (
                        <AttendanceRow
                            key={s.id}
                            person={s}
                            role={Peran.Santri}
                            halaqahId={halaqah.id}
                            status={attendanceData[getKey(s.id, Peran.Santri)]?.status || (globalAttendanceStatus?.[0] || 'Hadir')}
                            globalAttendanceStatus={globalAttendanceStatus}
                            onStatusChange={onStatusChange}
                        />
                    ))}
                </div>
              </div>

            </div>
        </div>
    );
});


interface AttendanceProps {
    onNavigate?: (page: any) => void;
}

const Attendance: React.FC<AttendanceProps> = ({ onNavigate }) => {
    const { halaqah, attendance, addAttendanceRecords, loading, error, appSettings, waliKelas, musyrifs, globalMarhalahs, globalWaktuHalaqah, globalJenisHalaqah, globalAttendanceStatus, userProfile , masterMarhalahs, masterKelasRelasi} = useSupabaseData();
    // FIX: Using string key (Composite key: "Role_ID") to prevent collision between Musammi ID 1 and Santri ID 1
    const [attendanceData, setAttendanceData] = useState<Record<string, {status: string, halaqahId: number}>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [draftRestoredInfo, setDraftRestoredInfo] = useState<{ count: number; time: string } | null>(null);
    
    // Filters
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedMarhalah, setSelectedMarhalah] = useState<Marhalah | 'all'>('all');
    const [selectedType, setSelectedType] = useState<HalaqahType | 'all'>('all');
    const [selectedWaktu, setSelectedWaktu] = useState<Waktu | 'all'>('all');
    const [selectedHalaqahId, setSelectedHalaqahId] = useState<string | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Kunci penyimpanan draf lokal per tanggal dan waktu
    const draftStorageKey = useMemo(() => {
        if (!selectedDate || selectedWaktu === 'all') return null;
        return `draft_attendance_${selectedDate.substring(0, 10)}_${selectedWaktu}`;
    }, [selectedDate, selectedWaktu]);

    // =========================================================================
    // LAPIS 1: Pencegahan Fisik Tarikan Layar / Pull-to-Refresh Gesture
    // =========================================================================
    useEffect(() => {
        let touchStartY = 0;

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                touchStartY = e.touches[0].clientY;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const currentY = e.touches[0].clientY;
            const mainContainer = document.querySelector('main');
            const isAtTop = mainContainer ? mainContainer.scrollTop <= 0 : window.scrollY <= 0;

            // Jika posisi scroll sudah berada di paling atas dan ditarik ke bawah (gesture pull-to-refresh)
            if (isAtTop && currentY > touchStartY + 8) {
                if (e.cancelable) {
                    e.preventDefault();
                }
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
        if (!hasUnsavedChanges) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'Data pengisian absensi belum disimpan.';
            return 'Data pengisian absensi belum disimpan.';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnsavedChanges]);

    // =========================================================================
    // LAPIS 3: Auto-Save Draf Lokal & Pemulihan Otomatis
    // =========================================================================
    useEffect(() => {
        if (!selectedDate || selectedWaktu === 'all') {
            setAttendanceData({});
            setHasUnsavedChanges(false);
            setDraftRestoredInfo(null);
            return;
        }

        const datePrefix = selectedDate.substring(0, 10);
        const matching = (attendance || []).filter(a => {
            const attDate = a.date ? a.date.substring(0, 10) : '';
            return attDate === datePrefix && a.waktu?.toLowerCase() === selectedWaktu.toLowerCase();
        });

        const prefilledFromDb: Record<string, { status: string; halaqahId: number }> = {};
        matching.forEach(record => {
            const key = `${record.peran}_${record.personId}`;
            prefilledFromDb[key] = {
                status: record.status,
                halaqahId: record.halaqahId
            };
        });

        // Periksa apakah terdapat draf tersimpan di memori perangkat
        let restoredFromDraft = false;
        if (draftStorageKey) {
            try {
                const stored = localStorage.getItem(draftStorageKey);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed && parsed.data && Object.keys(parsed.data).length > 0) {
                        const isDifferent = Object.entries(parsed.data).some(([k, v]: [string, any]) => {
                            return !prefilledFromDb[k] || prefilledFromDb[k].status !== v.status;
                        }) || (Object.keys(parsed.data).length !== Object.keys(prefilledFromDb).length && Object.keys(prefilledFromDb).length > 0);

                        if (isDifferent) {
                            setAttendanceData(parsed.data);
                            setHasUnsavedChanges(true);
                            setDraftRestoredInfo({
                                count: Object.keys(parsed.data).length,
                                time: parsed.lastModified || 'Tersimpan otomatis'
                            });
                            restoredFromDraft = true;
                        }
                    }
                }
            } catch (err) {
                console.error("Gagal memuat draf absensi:", err);
            }
        }

        if (!restoredFromDraft) {
            setAttendanceData(prefilledFromDb);
            setHasUnsavedChanges(false);
            setDraftRestoredInfo(null);
        }
    }, [selectedDate, selectedWaktu, attendance, draftStorageKey]);

    // Count of saved records for currently selected date and waktu
    const savedRecordCount = useMemo(() => {
        if (!selectedDate || selectedWaktu === 'all' || !attendance) return 0;
        const datePrefix = selectedDate.substring(0, 10);
        return attendance.filter(a => {
            const attDate = a.date ? a.date.substring(0, 10) : '';
            return attDate === datePrefix && a.waktu?.toLowerCase() === selectedWaktu.toLowerCase();
        }).length;
    }, [selectedDate, selectedWaktu, attendance]);

    const permittedHalaqah = useMemo(() => {
        if (!halaqah) return [];
        const activeHalaqah = halaqah.filter(h => h.is_active === true);
        if (userProfile?.role === 'musammi') {
            return activeHalaqah.filter(h => 
                (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                (h.musammi?.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim())
            );
        }
        return activeHalaqah;
    }, [halaqah, userProfile]);

    // Calculate dynamic available types based on data + defaults
    const availableTypes = useMemo(() => {
        const types = new Set<string>(globalJenisHalaqah);
        if (permittedHalaqah && permittedHalaqah.length > 0) {
            permittedHalaqah.forEach(h => {
                if (h.jenis) types.add(h.jenis);
            });
        }
        return Array.from(types).sort();
    }, [permittedHalaqah]);

    const filteredHalaqah = useMemo(() => {
        const getActiveSantriForDate = (h: any, dateStr: string) => {
            if (!h.history) return h.santri || [];
            return h.history.filter((hs: any) => {
                if (!hs.santri) return false;
                if (hs.start_date && new Date(hs.start_date.includes('/') ? hs.start_date.split('/').reverse().join('-') : hs.start_date).getTime() > new Date(dateStr.length > 10 ? dateStr.substring(0,10) : dateStr).getTime()) return false;
                if (hs.end_date && hs.end_date.trim() !== '' && new Date(hs.end_date.includes('/') ? hs.end_date.split('/').reverse().join('-') : hs.end_date).getTime() < new Date(dateStr.length > 10 ? dateStr.substring(0,10) : dateStr).getTime()) return false;
                return true;
            }).map((hs: any) => hs.santri);
        };

        return permittedHalaqah
            .map(h => ({
                ...h,
                santri: getActiveSantriForDate(h, selectedDate)
            }))
            .filter(h => {
                if (selectedMarhalah !== 'all') {
                    const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id;
                    const matchesMarhalah = h.marhalah === selectedMarhalah || (targetMarhalahId && h.marhalah_id === targetMarhalahId);
                    if (!matchesMarhalah) return false;
                }
                if (selectedType !== 'all' && h.jenis !== selectedType) return false;
                if (selectedWaktu !== 'all' && !h.waktu.includes(selectedWaktu)) return false;
                if (selectedHalaqahId !== 'all' && h.id.toString() !== selectedHalaqahId) return false;
                
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const matchMusammi = h.musammi?.nama?.toLowerCase().includes(q) || false;
                    const matchSantri = h.santri?.some((s: any) => s.nama?.toLowerCase().includes(q)) || false;
                    const matchHalaqah = h.nama?.toLowerCase().includes(q) || false;
                    if (!matchMusammi && !matchSantri && !matchHalaqah) return false;
                }

                return true;
            })
            .sort((a, b) => a.nama.localeCompare(b.nama));
    }, [permittedHalaqah, selectedMarhalah, selectedType, selectedWaktu, selectedHalaqahId, searchQuery, selectedDate]);
    

    const [visibleCount, setVisibleCount] = useState(30);

    useEffect(() => {
        setVisibleCount(30);
    }, [selectedMarhalah, selectedType, selectedWaktu, selectedHalaqahId, searchQuery, selectedDate]);

    const visibleHalaqah = useMemo(() => {
        return filteredHalaqah.slice(0, visibleCount);
    }, [filteredHalaqah, visibleCount]);

    const handleStatusChange = (personId: number, role: Peran, halaqahId: number, status: string) => {
        // Use composite key to ensure uniqueness
        const key = `${role}_${personId}`;
        setAttendanceData(prev => {
            const updated = { ...prev, [key]: { status, halaqahId } };
            // Lapisan 3: Simpan draf otomatis ke localStorage secara realtime
            if (draftStorageKey) {
                try {
                    localStorage.setItem(draftStorageKey, JSON.stringify({
                        date: selectedDate,
                        waktu: selectedWaktu,
                        data: updated,
                        lastModified: format(new Date(), 'HH:mm')
                    }));
                } catch (err) {
                    console.error("Gagal menyimpan draf absensi:", err);
                }
            }
            return updated;
        });
        setHasUnsavedChanges(true);
    };

    const handleDiscardDraft = () => {
        if (draftStorageKey) {
            localStorage.removeItem(draftStorageKey);
        }
        setDraftRestoredInfo(null);
        setHasUnsavedChanges(false);

        // Kembalikan ke data yang tersimpan dari database
        const datePrefix = selectedDate.substring(0, 10);
        const matching = (attendance || []).filter(a => {
            const attDate = a.date ? a.date.substring(0, 10) : '';
            return attDate === datePrefix && a.waktu?.toLowerCase() === selectedWaktu.toLowerCase();
        });
        const prefilledFromDb: Record<string, { status: string; halaqahId: number }> = {};
        matching.forEach(record => {
            const key = `${record.peran}_${record.personId}`;
            prefilledFromDb[key] = {
                status: record.status,
                halaqahId: record.halaqahId
            };
        });
        setAttendanceData(prefilledFromDb);
    };

    const handleSaveAll = async () => {
        setIsSaving(true);
        
        const allPeopleToRecord: { person: Person; role: Peran; halaqahId: number }[] = [];
        filteredHalaqah.forEach(h => {
            allPeopleToRecord.push({ person: h.musammi, role: Peran.Musammi, halaqahId: h.id });
            h.santri.forEach(s => {
                allPeopleToRecord.push({ person: s, role: Peran.Santri, halaqahId: h.id });
            });
        });

        const recordsToSave = allPeopleToRecord.map(({ person, role, halaqahId }) => {
            // Retrieve status using composite key
            const key = `${role}_${person.id}`;
            const status = attendanceData[key]?.status || (globalAttendanceStatus?.[0] || 'Hadir');

            return {
                date: selectedDate,
                waktu: selectedWaktu as Waktu,
                personId: person.id,
                peran: role,
                status: status,
                halaqahId: halaqahId
            }
        });

        if (recordsToSave.length === 0) {
            alert('Tidak ada data absensi untuk disimpan.');
            setIsSaving(false);
            return;
        }

        if (selectedWaktu === 'all') {
            alert('Silakan pilih waktu absensi yang spesifik.');
            setIsSaving(false);
            return;
        }

        try {
            await addAttendanceRecords(recordsToSave);
            
            // Fire-and-forget notification logic
            const sendNotificationsAsync = async () => {
                try {
                    const telegramBotToken = appSettings?.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value;
                    const telegramChatId = appSettings?.find(s => s.key === 'TELEGRAM_GLOBAL_CHAT_ID')?.value;
                    const fonnteApiToken = appSettings?.find(s => s.key === 'FONNTE_API_TOKEN')?.value;
                    const enableTelegram = appSettings?.find(s => s.key === 'ENABLE_TELEGRAM_NOTIFICATION')?.value === 'true';
                    const enableWa = appSettings?.find(s => s.key === 'ENABLE_WA_NOTIFICATION')?.value === 'true';
                    
                    const allRecords = recordsToSave;
                    if (allRecords.length === 0) return;

                    const stats = {
                        total: allRecords.length,
                        hadir: allRecords.filter(r => r.status?.toLowerCase() === 'hadir').length,
                        sakit: allRecords.filter(r => r.status?.toLowerCase() === 'sakit').length,
                        izin: allRecords.filter(r => r.status?.toLowerCase() === 'izin').length,
                        alpha: allRecords.filter(r => r.status?.toLowerCase() === 'alpa').length,
                        terlambat: allRecords.filter(r => r.status?.toLowerCase() === 'terlambat').length,
                        dateStr: format(new Date(selectedDate), 'dd MMMM yyyy'),
                        waktu: selectedWaktu as string,
                        marhalah: selectedMarhalah as string
                    };

                    const students = allRecords.map(r => {
                        let nama = 'Unknown';
                        let kelas = '';
                        for (const h of filteredHalaqah) {
                            if (r.peran === Peran.Musammi && h.musammi.id === r.personId) {
                                nama = `${h.musammi.nama} (Musammi)`;
                                break;
                            }
                            const s = h.santri.find(x => x.id === r.personId);
                            if (s && r.peran === Peran.Santri) {
                                nama = s.nama;
                                kelas = s.kelas || '';
                                break;
                            }
                        }
                        return { nama, kelas, status: r.status };
                    });

                    if (enableTelegram && telegramBotToken && telegramChatId) {
                        const msgTelegram = generateMessageText(stats, students, 'TELEGRAM');
                        sendMessageTelegram(telegramBotToken, telegramChatId, msgTelegram);
                    }

                    if (enableWa && fonnteApiToken) {
                        const affectedMarhalahs = new Set<string>();
                        
                        // Map class to students
                        const classToStudentsMap: Record<string, typeof allRecords> = {};
                        const marhalahToStudentsMap: Record<string, typeof allRecords> = {};

                        allRecords.forEach(r => {
                            for (const h of filteredHalaqah) {
                                if (r.peran === Peran.Musammi && h.musammi.id === r.personId) {
                                    affectedMarhalahs.add(h.marhalah);
                                    if (!marhalahToStudentsMap[h.marhalah]) marhalahToStudentsMap[h.marhalah] = [];
                                    marhalahToStudentsMap[h.marhalah].push(r);
                                    break;
                                }

                                const s = h.santri.find(x => x.id === r.personId);
                                if (s && r.peran === Peran.Santri) {
                                    affectedMarhalahs.add(h.marhalah);
                                    
                                    if (!marhalahToStudentsMap[h.marhalah]) marhalahToStudentsMap[h.marhalah] = [];
                                    marhalahToStudentsMap[h.marhalah].push(r);

                                    if (s.kelas) {
                                        const compKey = `${h.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === h.marhalah_id)?.nama || h.marhalah : h.marhalah}|${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`;
                                        if (!classToStudentsMap[compKey]) classToStudentsMap[compKey] = [];
                                        classToStudentsMap[compKey].push(r);
                                    }
                                    break;
                                }
                            }
                        });

                        // 1. Send to Musyrif (Per Marhalah)
                        affectedMarhalahs.forEach(m => {
                            const myMusyrif = musyrifs?.filter(mu => mu.marhalah === m && mu.no_hp);
                            if (!myMusyrif || myMusyrif.length === 0) return;
                            
                            const marhalahRecords = marhalahToStudentsMap[m] || [];
                            const marhalahStats = {
                                total: marhalahRecords.length,
                                hadir: marhalahRecords.filter(r => r.status?.toLowerCase() === 'hadir').length,
                                sakit: marhalahRecords.filter(r => r.status?.toLowerCase() === 'sakit').length,
                                izin: marhalahRecords.filter(r => r.status?.toLowerCase() === 'izin').length,
                                alpha: marhalahRecords.filter(r => r.status?.toLowerCase() === 'alpa').length,
                                terlambat: marhalahRecords.filter(r => r.status?.toLowerCase() === 'terlambat').length,
                                dateStr: format(new Date(selectedDate), 'dd MMMM yyyy'),
                                waktu: selectedWaktu as string,
                                marhalah: m
                            };
                            
                            const marhalahStudents = marhalahRecords.map(r => {
                                let nama = 'Unknown';
                                let kelas = '';
                                for (const h of filteredHalaqah) {
                                    if (r.peran === Peran.Musammi && h.musammi.id === r.personId) {
                                        nama = `${h.musammi.nama} (Musammi)`;
                                        break;
                                    }
                                    const s = h.santri.find(x => x.id === r.personId);
                                    if (s && r.peran === Peran.Santri) { nama = s.nama; kelas = s.kelas || ''; break; }
                                }
                                return { nama, kelas, status: r.status };
                            });

                            myMusyrif.forEach(mu => {
                                let msgWa = `Kepada Yth. Ustadz *${mu.nama}*\n(Musyrif Marhalah ${m})\n\n`;
                                msgWa += generateMessageText(marhalahStats, marhalahStudents, 'WA');
                                sendMessageFonnte(fonnteApiToken, mu.no_hp!, msgWa);
                            });
                        });
                        
                        // 2. Send to Wali Kelas (Per Kelas)
                        Object.keys(classToStudentsMap).forEach(compKey => {
                            const [m, c] = compKey.split('|');
                            const wali = waliKelas?.find(wk => wk.marhalah === m && wk.kelas === c && wk.no_hp);
                            if (!wali || !wali.no_hp) return;
                            
                            const classRecords = classToStudentsMap[compKey] || [];
                            const classStats = {
                                total: classRecords.length,
                                hadir: classRecords.filter(r => r.status?.toLowerCase() === 'hadir').length,
                                sakit: classRecords.filter(r => r.status?.toLowerCase() === 'sakit').length,
                                izin: classRecords.filter(r => r.status?.toLowerCase() === 'izin').length,
                                alpha: classRecords.filter(r => r.status?.toLowerCase() === 'alpa').length,
                                terlambat: classRecords.filter(r => r.status?.toLowerCase() === 'terlambat').length,
                                dateStr: format(new Date(selectedDate), 'dd MMMM yyyy'),
                                waktu: selectedWaktu as string,
                                marhalah: wali.marhalah,
                                kelas: c
                            };
                            
                            const classStudents = classRecords.map(r => {
                                let nama = 'Unknown';
                                for (const h of filteredHalaqah) {
                                    const s = h.santri.find(x => x.id === r.personId);
                                    if (s && r.peran === Peran.Santri) { nama = s.nama; break; }
                                }
                                return { nama, kelas: c, status: r.status };
                            });

                            let msgWa = `Kepada Yth. Ustadz/Ustadzah *${wali.nama}*\n(Wali Kelas ${c})\n\n`;
                            msgWa += generateMessageText(classStats, classStudents, 'WA');
                            sendMessageFonnte(fonnteApiToken, wali.no_hp, msgWa);
                        });
                    }
                } catch(e) { console.error('Notification logic error:', e); }
            };
            sendNotificationsAsync();

            // Bersihkan draf lokal dan status belum tersimpan setelah berhasil disimpan
            if (draftStorageKey) {
                localStorage.removeItem(draftStorageKey);
            }
            setHasUnsavedChanges(false);
            setDraftRestoredInfo(null);

            alert('Absensi berhasil disimpan!');
        } catch(e: any) {
            console.error("Failed to save attendance:", e);
            alert(`Gagal menyimpan absensi: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <p>Loading Halaqah data...</p>;
    if (error) return <p className="text-error">Error: {error}</p>;

    return (
        <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500 relative overscroll-y-contain">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Absensi Harian</h1>
                  {hasUnsavedChanges && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      Perubahan belum disimpan
                    </span>
                  )}
                  {selectedWaktu !== 'all' && (
                    savedRecordCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        Tersimpan ({savedRecordCount} orang)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-slate-100 text-slate-500 border border-slate-200/80">
                        Belum diisi
                      </span>
                    )
                  )}
                </div>
                <p className="text-[14px] text-slate-500 mt-1">Pencatatan kehadiran Musammi dan Santri per Halaqah.</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleSaveAll} 
                  disabled={isSaving}
                  className="inline-flex w-full sm:w-auto h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all hover:bg-blue-700 hover:-translate-y-0.5 disabled:bg-slate-400 disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Menyimpan...' : (savedRecordCount > 0 ? 'Perbarui Absensi' : 'Simpan Absensi')}
                </button>
              </div>
            </div>
          </div>

          {/* Lapisan 3: Notifikasi Pemulihan Draf Otomatis (Clean, Simple, Konsisten) */}
          {draftRestoredInfo && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-blue-200/90 bg-blue-50/70 text-slate-800 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700">
                  <Clock size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">Draf Absensi Dipulihkan Otomatis</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100/80 text-blue-800">
                      Pukul {draftRestoredInfo.time}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-600 mt-0.5">
                    Data pengisian absensi sebelumnya yang belum tersimpan berhasil diamankan otomatis ke formulir ini.
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

          {/* Filter Toolbar: Bagian Atas & Bagian Bawah */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_4px_16px_0_rgba(0,0,0,0.02)] space-y-3">
            
            {/* Bagian Atas: Tanggal (lebar normal) & Cari santri (lebar full ke kanan) */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Tanggal */}
              <div className="relative group w-full sm:w-56 md:w-64 shrink-0">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-10 pr-3 text-[13px] font-semibold text-slate-700 shadow-xs transition-all hover:border-slate-300 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                />
              </div>

              {/* Cari Santri (lebar full ke kanan) */}
              <div className="relative group w-full flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Cari santri..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-10 pr-4 text-[13px] font-medium text-slate-700 shadow-xs transition-all hover:border-slate-300 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Bagian Bawah: Marhalah, Jenis halaqah, Waktu halaqah, Pilih halaqah (lebar normal) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Marhalah */}
              <div className="relative w-full">
                <select 
                    value={selectedMarhalah} 
                    onChange={e => setSelectedMarhalah(e.target.value as Marhalah | 'all')}
                    className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
                >
                  <option value="all">Semua Marhalah</option>
                  {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Jenis Halaqah */}
              <div className="relative w-full">
                <select 
                    value={selectedType} 
                    onChange={e => setSelectedType(e.target.value as HalaqahType | 'all')}
                    className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
                >
                  <option value="all">Semua Halaqah</option>
                  {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Waktu Halaqah */}
              <div className="relative w-full">
                <select 
                    value={selectedWaktu} 
                    onChange={e => setSelectedWaktu(e.target.value as Waktu | 'all')}
                    className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
                >
                  <option value="all">Semua Waktu</option>
                  {globalWaktuHalaqah.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>

              {/* Pilih Halaqah */}
              <div className="relative w-full">
                <select 
                    value={selectedHalaqahId} 
                    onChange={e => setSelectedHalaqahId(e.target.value)}
                    className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
                >
                  <option value="all">Pilih Halaqah</option>
                  {permittedHalaqah
                    .filter(h => {
                      if (selectedMarhalah === 'all') return true;
                      const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === selectedMarhalah)?.id;
                      return h.marhalah === selectedMarhalah || (targetMarhalahId && h.marhalah_id === targetMarhalahId);
                    })
                    .sort((a, b) => a.nama.localeCompare(b.nama))
                    .map(h => <option key={h.id} value={h.id.toString()}>{h.nama}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Halaqah Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {visibleHalaqah.map(h => 
                <HalaqahCard 
                    key={h.id} 
                    halaqah={h} 
                    attendanceData={attendanceData} 
                    globalAttendanceStatus={globalAttendanceStatus}
                    onStatusChange={handleStatusChange} 
                />
            )}
            {filteredHalaqah.length === 0 && (
                <div className="text-center py-12 text-slate-500 xl:col-span-2 rounded-2xl border border-slate-200 border-dashed bg-slate-50/50 flex flex-col items-center justify-center">
                    <Search className="w-8 h-8 mb-3 text-slate-300" />
                    <p className="font-medium text-slate-600">Tidak ada data halaqah</p>
                    <p className="text-sm mt-1">Coba sesuaikan filter dengan data yang tersedia.</p>
                </div>
            )}
          </div>
          
          {visibleCount < filteredHalaqah.length && (
              <div className="flex justify-end mt-6">
                  <button 
                      onClick={() => setVisibleCount(prev => prev + 30)}
                      className="px-6 py-2.5 bg-blue-50 text-blue-600 font-bold text-sm rounded-xl hover:bg-blue-100 transition-colors border border-blue-100 shadow-sm flex items-center"
                  >
                      Load More (30) <ChevronDown size={16} className="ml-2"/>
                  </button>
              </div>
          )}
        </div>
    );
};

export default Attendance;
