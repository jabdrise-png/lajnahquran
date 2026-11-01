import React, { useState, useMemo, useEffect, useRef } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import { QuranHafalanInput } from '../components/QuranHafalanInput';
import Card from '../components/Card';
import Modal from '../components/Modal';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Marhalah, HalaqahType, HalaqahEvaluationQuestion } from '../types';
// Removed globalMarhalahs import
import { Settings, Plus, Trash2, Save, Edit2, X, Users, ChevronRight, ClipboardList, List, Clock, RefreshCw, Sparkles, Check, CheckSquare, Square, AlertCircle, Info, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { getEvaluationPeriods } from '../lib/utils';
import { AutoSyncSetoranConfig, DEFAULT_AUTO_SYNC_SETORAN_CONFIG } from '../types';
import { calculateSyncSetoranBatch, SyncEngineResultPerSantri } from '../lib/syncEngine';

const PerkembanganInputPage: React.FC = () => {
    const { 
        halaqah, 
        santri, 
        studentEvaluations, 
        updateEvaluationBatch, 
        halaqahEvalQuestions, 
        halaqahEvaluations, 
        saveHalaqahEvaluation,
        evaluationSettings,
        studentProgress,
        appSettings,
        setoranHarian,
        addStudentProgressBatch,
        userProfile,
        globalMarhalahs,
        globalJenisHalaqah,
        fetchData, waliKelas
    , masterMarhalahs, masterKelasRelasi} = useSupabaseData();

    // Evaluation Periods
    const masterPeriods = useMemo(() => getEvaluationPeriods(appSettings), [appSettings]);
    const sortedPeriods = useMemo(() => {
        return [...masterPeriods].sort((a, b) => {
            const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
            const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
            if (dateA !== dateB) return dateB - dateA;
            return b.id.localeCompare(a.id);
        });
    }, [masterPeriods]);

    // Form State
    const [filterMonth, setFilterMonth] = useState('');
    const [filterMarhalah, setFilterMarhalah] = useState<Marhalah | 'all'>('all');
    const [filterJenis, setFilterJenis] = useState<HalaqahType | 'all'>('all');
    const [evalColors, setEvalColors] = useState<Record<string, string>>({});
    useEffect(() => {
        const savedColors = appSettings.find(s => s.key === 'EVALUATION_COLORS')?.value;
        if (savedColors) {
            try { setEvalColors(JSON.parse(savedColors)); } catch (e) {}
        }
    }, [appSettings]);

    const [filterHalaqah, setFilterHalaqah] = useState<string | 'all'>('all');
    

    useEffect(() => {
        if (!filterMonth && sortedPeriods.length > 0) {
            setFilterMonth(sortedPeriods[0].id);
        }
    }, [sortedPeriods, filterMonth]);

    const [formAnswers, setFormAnswers] = useState<Record<number, Record<string, string>>>({});
    const [santriNotes, setSantriNotes] = useState<Record<number, string>>({});
    
    // New Form State for Student Evaluasi
    const [localEvaluations, setLocalEvaluations] = useState<Record<number, Record<string, string>>>({});
    const [localProgress, setLocalProgress] = useState<Record<number, Record<string, string>>>({});
    const [usePrevDepan, setUsePrevDepan] = useState<Record<number, boolean>>({});
    const [usePrevBelakang, setUsePrevBelakang] = useState<Record<number, boolean>>({});
    const [autoCalculateZiyadah, setAutoCalculateZiyadah] = useState<Record<number, boolean>>({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [draftRestoredInfo, setDraftRestoredInfo] = useState<{ time: string } | null>(null);

    // Sync Engine States (Tahap 4)
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncScope, setSyncScope] = useState<'all' | 'selected'>('all');
    const [selectedSantriForSync, setSelectedSantriForSync] = useState<number[]>([]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    // Kunci penyimpanan draf lokal evaluasi per periode & halaqah
    const draftKey = useMemo(() => {
        if (!filterMonth || filterHalaqah === 'all') return null;
        return `draft_evaluasi_${filterMonth}_${filterHalaqah}`;
    }, [filterMonth, filterHalaqah]);

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
        if (!hasUnsavedChanges) return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'Data pengisian evaluasi perkembangan santri belum disimpan.';
            return 'Data pengisian evaluasi perkembangan santri belum disimpan.';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // =========================================================================
    // LAPIS 3: Simpan Draf Otomatis ke LocalStorage
    // =========================================================================
    const saveDraftToStorage = (answers: any, notes: any, progress: any, ziyadah: any) => {
        if (!draftKey) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify({
                month: filterMonth,
                halaqahId: filterHalaqah,
                formAnswers: answers,
                santriNotes: notes,
                localProgress: progress,
                autoCalculateZiyadah: ziyadah,
                lastModified: format(new Date(), 'HH:mm')
            }));
        } catch (e) {
            console.error("Gagal menyimpan draf evaluasi:", e);
        }
    };

    const allCategories = useMemo(() => {
        return Array.from(new Set(evaluationSettings.map(s => s.category))) as string[];
    }, [evaluationSettings]);

    const getOptions = (category: string) => {
        const custom = evaluationSettings.filter(s => s.category === category).sort((a,b) => (b.score || 0) - (a.score || 0));
        if (custom.length > 0) return custom.map(c => ({ label: c.label, color: c.color }));
        return ['Mumtaz', 'Jayyid Jiddan', 'Jayyid', 'Maqbul', 'Rasib'].map(label => ({ label, color: undefined }));
    };

    const handleUsePrevDepan = (santriId: number, checked: boolean) => {
        setUsePrevDepan(prev => ({ ...prev, [santriId]: checked }));
        if (checked) {
            const currentIndex = filterMonth ? sortedPeriods.findIndex(p => p.id === filterMonth) : 0;
            const previousPeriodIds = sortedPeriods.slice(currentIndex >= 0 ? currentIndex + 1 : 0).map(p => p.id);

            const prevDepanRecs = studentProgress.filter(p => p.santri_id === santriId && previousPeriodIds.includes(p.month_key) && p.progress_type === 'Hafalan Depan');
            prevDepanRecs.sort((a, b) => previousPeriodIds.indexOf(a.month_key) - previousPeriodIds.indexOf(b.month_key));
            const lastDataDepan = prevDepanRecs[0];

            const prevSuratRecs = studentProgress.filter(p => p.santri_id === santriId && previousPeriodIds.includes(p.month_key) && p.progress_type === 'Surat Ayat Depan');
            prevSuratRecs.sort((a, b) => previousPeriodIds.indexOf(a.month_key) - previousPeriodIds.indexOf(b.month_key));
            const lastDataSurat = prevSuratRecs[0];

            setLocalProgress(prev => {
                const next = {
                    ...prev,
                    [santriId]: {
                        ...(prev[santriId] || {}),
                        ['Hafalan Depan']: lastDataDepan?.value ?? '',
                        ['Surat Ayat Depan']: lastDataSurat?.value ?? ''
                    }
                };
                saveDraftToStorage(formAnswers, santriNotes, next, autoCalculateZiyadah);
                return next;
            });
            setHasUnsavedChanges(true);
        }
    };

    const handleUsePrevBelakang = (santriId: number, checked: boolean) => {
        setUsePrevBelakang(prev => ({ ...prev, [santriId]: checked }));
        if (checked) {
            const currentIndex = filterMonth ? sortedPeriods.findIndex(p => p.id === filterMonth) : 0;
            const previousPeriodIds = sortedPeriods.slice(currentIndex >= 0 ? currentIndex + 1 : 0).map(p => p.id);

            const prevBelakangRecs = studentProgress.filter(p => p.santri_id === santriId && previousPeriodIds.includes(p.month_key) && p.progress_type === 'Hafalan Belakang');
            prevBelakangRecs.sort((a, b) => previousPeriodIds.indexOf(a.month_key) - previousPeriodIds.indexOf(b.month_key));
            const lastDataBelakang = prevBelakangRecs[0];

            const prevSuratRecs = studentProgress.filter(p => p.santri_id === santriId && previousPeriodIds.includes(p.month_key) && p.progress_type === 'Surat Ayat Belakang');
            prevSuratRecs.sort((a, b) => previousPeriodIds.indexOf(a.month_key) - previousPeriodIds.indexOf(b.month_key));
            const lastDataSurat = prevSuratRecs[0];

            setLocalProgress(prev => {
                const next = {
                    ...prev,
                    [santriId]: {
                        ...(prev[santriId] || {}),
                        ['Hafalan Belakang']: lastDataBelakang?.value ?? '',
                        ['Surat Ayat Belakang']: lastDataSurat?.value ?? ''
                    }
                };
                saveDraftToStorage(formAnswers, santriNotes, next, autoCalculateZiyadah);
                return next;
            });
            setHasUnsavedChanges(true);
        }
    };

    const handleDynamicValueChange = (santriId: number, category: string, value: string) => {
        setLocalProgress(prev => {
            const next = {
                ...prev,
                [santriId]: {
                    ...(prev[santriId] || {}),
                    [category]: value
                }
            };
            saveDraftToStorage(formAnswers, santriNotes, next, autoCalculateZiyadah);
            return next;
        });
        setHasUnsavedChanges(true);
    };

    const filteredHalaqah = useMemo(() => {
        const getActiveSantriForMonth = (h: any, monthKey: string) => {
            if (!h.history || h.history.length === 0) return h.santri || [];
            
            const activePeriod = masterPeriods.find(p => p.id === monthKey);
            
            // If it's a new format period ID but we can't find it, or it doesn't have dates, fallback to showing all active students
            if (!activePeriod?.startDate && !monthKey.match(/^\d{4}-\d{2}$/)) {
                return h.history.filter((hs: any) => hs.santri && (!hs.end_date || hs.end_date.trim() === '')).map((hs: any) => hs.santri);
            }

            const targetMonthStart = activePeriod?.startDate || monthKey + '-01';
            const targetMonthEnd = activePeriod?.endDate || monthKey + '-31';
            
            return h.history.filter((hs: any) => {
                if (!hs.santri) return false;
                if (hs.start_date && new Date(hs.start_date.includes('/') ? hs.start_date.split('/').reverse().join('-') : hs.start_date).getTime() > new Date(targetMonthEnd.length > 10 ? targetMonthEnd.substring(0,10) : targetMonthEnd).getTime()) return false;
                if (hs.end_date && hs.end_date.trim() !== '' && new Date(hs.end_date.includes('/') ? hs.end_date.split('/').reverse().join('-') : hs.end_date).getTime() < new Date(targetMonthStart.length > 10 ? targetMonthStart.substring(0,10) : targetMonthStart).getTime()) return false;
                return true;
            }).map((hs: any) => hs.santri);
        };

        return halaqah
            .filter(h => h.is_active !== false)
            .map(h => {
                let santriList = getActiveSantriForMonth(h, filterMonth);
                if (userProfile?.role === 'pengajar') {
                    const isMusammiOfThisHalaqah = (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                                                   (h.musammi?.nama?.toLowerCase().trim() === userProfile?.name?.toLowerCase().trim());
                    if (!isMusammiOfThisHalaqah) {
                        const userWaliClasses = waliKelas.filter(w => w.user_id === userProfile.id).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
                        santriList = santriList.filter(s => userWaliClasses.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas));
                    }
                }
                return {
                    ...h,
                    santri: santriList
                };
            })
            .filter(h => {
            if (userProfile?.role === 'musammi') {
                const isMatch = (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                                (h.musammi?.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim());
                if (!isMatch) return false;
            }
            if (filterMarhalah !== 'all') {
                const targetMarhalahId = masterMarhalahs?.find((m: any) => m.nama === filterMarhalah)?.id;
                const matchesMarhalah = h.marhalah === filterMarhalah || (targetMarhalahId && h.marhalah_id === targetMarhalahId);
                if (!matchesMarhalah) return false;
            }
            if (filterJenis !== 'all' && h.jenis !== filterJenis) return false;
            if (filterHalaqah !== 'all' && h.id.toString() !== filterHalaqah) return false;
            return true;
        });
    }, [halaqah, filterMarhalah, filterJenis, filterHalaqah, userProfile, filterMonth, masterPeriods]);

    // =========================================================================
    // TAHAP 4: KONFIGURASI & LOGIKA SINKRONISASI SETORAN HARIAN
    // =========================================================================
    const autoSyncConfig: AutoSyncSetoranConfig = useMemo(() => {
        const raw = appSettings.find(s => s.key === 'AUTO_SYNC_SETORAN_CONFIG')?.value;
        if (raw) {
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.error('Error parsing AUTO_SYNC_SETORAN_CONFIG in PerkembanganInputPage', e);
            }
        }
        return DEFAULT_AUTO_SYNC_SETORAN_CONFIG;
    }, [appSettings]);

    const activePeriod = useMemo(() => {
        return masterPeriods.find(p => p.id === filterMonth);
    }, [masterPeriods, filterMonth]);

    const currentHalaqahObj = useMemo(() => {
        if (filterHalaqah === 'all') return null;
        return filteredHalaqah.find(h => h.id.toString() === filterHalaqah) || null;
    }, [filteredHalaqah, filterHalaqah]);

    const currentHalaqahSantri = useMemo(() => {
        if (filterHalaqah === 'all') return [];
        return currentHalaqahObj?.santri || [];
    }, [currentHalaqahObj, filterHalaqah]);

    const syncPeriodRange = useMemo(() => {
        const sDate = activePeriod?.startDate || (filterMonth ? `${filterMonth}-01` : null);
        const eDate = activePeriod?.endDate || (filterMonth ? `${filterMonth}-31` : null);
        return { startDate: sDate, endDate: eDate };
    }, [activePeriod, filterMonth]);

    const syncResultsMap: Record<number, SyncEngineResultPerSantri> = useMemo(() => {
        if (!isSyncModalOpen || currentHalaqahSantri.length === 0) return {};
        const santriIds = currentHalaqahSantri.map((s: any) => s.id);
        return calculateSyncSetoranBatch(
            santriIds,
            setoranHarian || [],
            autoSyncConfig,
            {
                startDate: syncPeriodRange.startDate,
                endDate: syncPeriodRange.endDate,
                periodKey: filterMonth,
                previousProgress: studentProgress,
                evaluationSettings
            }
        );
    }, [isSyncModalOpen, currentHalaqahSantri, setoranHarian, autoSyncConfig, syncPeriodRange, filterMonth, studentProgress, evaluationSettings]);

    const handleOpenSyncModal = (singleSantriId?: number) => {
        if (singleSantriId) {
            setSyncScope('selected');
            setSelectedSantriForSync([singleSantriId]);
        } else {
            setSyncScope('all');
            setSelectedSantriForSync(currentHalaqahSantri.map((s: any) => s.id));
        }
        setIsSyncModalOpen(true);
    };

    const handleToggleSantriSelect = (santriId: number) => {
        setSelectedSantriForSync(prev => {
            if (prev.includes(santriId)) {
                return prev.filter(id => id !== santriId);
            } else {
                return [...prev, santriId];
            }
        });
    };

    const handleSelectAllSantri = () => {
        setSelectedSantriForSync(currentHalaqahSantri.map((s: any) => s.id));
    };

    const handleDeselectAllSantri = () => {
        setSelectedSantriForSync([]);
    };

    const santriIdsToApply = useMemo(() => {
        if (syncScope === 'all') {
            return currentHalaqahSantri.map((s: any) => s.id);
        }
        return selectedSantriForSync;
    }, [syncScope, currentHalaqahSantri, selectedSantriForSync]);

    const handleDirectPullAllSetoran = () => {
        setIsMenuOpen(false);
        if (currentHalaqahSantri.length === 0) {
            alert('Tidak ada data santri aktif dalam halaqah ini untuk ditarik.');
            return;
        }

        const santriIds = currentHalaqahSantri.map((s: any) => s.id);
        const results = calculateSyncSetoranBatch(
            santriIds,
            setoranHarian || [],
            autoSyncConfig,
            {
                startDate: syncPeriodRange.startDate,
                endDate: syncPeriodRange.endDate,
                periodKey: filterMonth,
                previousProgress: studentProgress,
                evaluationSettings
            }
        );

        setLocalProgress(prev => {
            const next = { ...prev };
            const nextAutoZiyadah = { ...autoCalculateZiyadah };

            santriIds.forEach((sId: number) => {
                const syncRes = results[sId];
                if (!syncRes) return;

                const santriProg = { ...(next[sId] || {}) };

                // 1. Ziyadah (jika diaktifkan)
                if (autoSyncConfig.ziyadah.enabled) {
                    santriProg['Ziyadah'] = syncRes.ziyadahHalamanStr || '0';
                    nextAutoZiyadah[sId] = false; // Matikan auto hitung agar nilai ditarik tampil & bisa diedit manual
                }

                // 2. Murojaah (jika diaktifkan)
                if (autoSyncConfig.murojaah.enabled) {
                    santriProg['Murojaah'] = syncRes.murojaahJuzStr || '0';
                }

                // 3. Capaian Hafalan Depan & Belakang (jika diaktifkan)
                if (autoSyncConfig.hafalan.enabled) {
                    if (syncRes.capaianHafalan.juzDepanStr) {
                        santriProg['Hafalan Depan'] = syncRes.capaianHafalan.juzDepanStr;
                    }
                    if (syncRes.capaianHafalan.suratAyatDepan) {
                        santriProg['Surat Ayat Depan'] = syncRes.capaianHafalan.suratAyatDepan;
                    }
                    if (syncRes.capaianHafalan.juzBelakangStr) {
                        santriProg['Hafalan Belakang'] = syncRes.capaianHafalan.juzBelakangStr;
                    }
                    if (syncRes.capaianHafalan.suratAyatBelakang) {
                        santriProg['Surat Ayat Belakang'] = syncRes.capaianHafalan.suratAyatBelakang;
                    }
                    if (syncRes.capaianHafalan.totalJuzStr) {
                        santriProg['Total Hafalan'] = syncRes.capaianHafalan.totalJuzStr;
                    }
                }

                // 4. Kelancaran Hafalan (jika diaktifkan)
                if (autoSyncConfig.kelancaran.enabled && syncRes.kelancaran.resolvedOptionLabel) {
                    const targetCat = autoSyncConfig.kelancaran.target_category_id || 'Hafalan';
                    santriProg[targetCat] = syncRes.kelancaran.resolvedOptionLabel;
                }

                next[sId] = santriProg;
            });

            setAutoCalculateZiyadah(nextAutoZiyadah);
            saveDraftToStorage(formAnswers, santriNotes, next, nextAutoZiyadah);
            return next;
        });

        setHasUnsavedChanges(true);
    };

    const handleApplySync = () => {
        if (santriIdsToApply.length === 0) {
            alert('Silakan pilih minimal 1 santri untuk disinkronkan.');
            return;
        }

        setLocalProgress(prev => {
            const next = { ...prev };
            const nextAutoZiyadah = { ...autoCalculateZiyadah };

            santriIdsToApply.forEach((sId: number) => {
                const syncRes = syncResultsMap[sId];
                if (!syncRes) return;

                const santriProg = { ...(next[sId] || {}) };

                // 1. Ziyadah (jika diaktifkan)
                if (autoSyncConfig.ziyadah.enabled) {
                    santriProg['Ziyadah'] = syncRes.ziyadahHalamanStr || '0';
                    nextAutoZiyadah[sId] = false; // Matikan auto hitung agar nilai ditarik tampil & bisa diedit manual
                }

                // 2. Murojaah (jika diaktifkan)
                if (autoSyncConfig.murojaah.enabled) {
                    santriProg['Murojaah'] = syncRes.murojaahJuzStr || '0';
                }

                // 3. Capaian Hafalan Depan & Belakang (jika diaktifkan)
                if (autoSyncConfig.hafalan.enabled) {
                    if (syncRes.capaianHafalan.juzDepanStr) {
                        santriProg['Hafalan Depan'] = syncRes.capaianHafalan.juzDepanStr;
                    }
                    if (syncRes.capaianHafalan.suratAyatDepan) {
                        santriProg['Surat Ayat Depan'] = syncRes.capaianHafalan.suratAyatDepan;
                    }
                    if (syncRes.capaianHafalan.juzBelakangStr) {
                        santriProg['Hafalan Belakang'] = syncRes.capaianHafalan.juzBelakangStr;
                    }
                    if (syncRes.capaianHafalan.suratAyatBelakang) {
                        santriProg['Surat Ayat Belakang'] = syncRes.capaianHafalan.suratAyatBelakang;
                    }
                    if (syncRes.capaianHafalan.totalJuzStr) {
                        santriProg['Total Hafalan'] = syncRes.capaianHafalan.totalJuzStr;
                    }
                }

                // 4. Kelancaran Hafalan (jika diaktifkan)
                if (autoSyncConfig.kelancaran.enabled && syncRes.kelancaran.resolvedOptionLabel) {
                    const targetCat = autoSyncConfig.kelancaran.target_category_id || 'Hafalan';
                    santriProg[targetCat] = syncRes.kelancaran.resolvedOptionLabel;
                }

                next[sId] = santriProg;
            });

            setAutoCalculateZiyadah(nextAutoZiyadah);
            saveDraftToStorage(formAnswers, santriNotes, next, nextAutoZiyadah);
            return next;
        });

        setHasUnsavedChanges(true);
        setIsSyncModalOpen(false);
    };

    const handleAnswerChange = (halaqahId: number, questionId: number, value: string) => {
        setFormAnswers(prev => {
            const next = {
                ...prev,
                [halaqahId]: {
                    ...(prev[halaqahId] || {}),
                    [questionId]: value
                }
            };
            saveDraftToStorage(next, santriNotes, localProgress, autoCalculateZiyadah);
            return next;
        });
        setHasUnsavedChanges(true);
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleSaveEvaluation = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const evalUpdates: any[] = [];
            const progressUpdates: any[] = [];
            const halaqahEvalPromises: Promise<void>[] = [];
            
            for (const h of filteredHalaqah) {
                const answers = formAnswers[h.id];
                if (answers) {
                    halaqahEvalPromises.push(saveHalaqahEvaluation({
                        halaqah_id: h.id,
                        month_key: filterMonth,
                        answers
                    }, true));
                }
                
                const hSantri = h.santri || [];
                hSantri.forEach(s => {
                    if (santriNotes[s.id] !== undefined) {
                        const existingEval = studentEvaluations.find(e => e.santri_id === s.id && e.month_key === filterMonth);
                        evalUpdates.push({
                            ...(existingEval || {}),
                            santri_id: s.id,
                            month_key: filterMonth,
                            catatan_musammi: santriNotes[s.id]
                        });
                    }
                    
                    const safeCategories = localProgress[s.id] || {};
                    
                    // Calculate total and penambahan before saving
                    const hafalanDepan = parseFloat(safeCategories['Hafalan Depan'] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === 'Hafalan Depan')?.value ?? '0') || 0;
                    const hafalanBelakang = parseFloat(safeCategories['Hafalan Belakang'] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === 'Hafalan Belakang')?.value ?? '0') || 0;
                    const totalHafalan = hafalanDepan + hafalanBelakang;

                    let prevMonthKey = '';
                    if (filterMonth && sortedPeriods.length > 0) {
                        const currentIndex = sortedPeriods.findIndex(p => p.id === filterMonth);
                        if (currentIndex !== -1 && currentIndex + 1 < sortedPeriods.length) {
                            prevMonthKey = sortedPeriods[currentIndex + 1].id;
                        }
                    }
                    
                    const prevHafalanDepan = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === prevMonthKey && p.progress_type === 'Hafalan Depan')?.value ?? '0') || 0;
                    const prevHafalanBelakang = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === prevMonthKey && p.progress_type === 'Hafalan Belakang')?.value ?? '0') || 0;
                    const prevTotalHafalan = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === prevMonthKey && p.progress_type === 'Total Hafalan')?.value ?? '0') || (prevHafalanDepan + prevHafalanBelakang);
                    
                    const penambahanHafalan = totalHafalan - prevTotalHafalan;
                    
                    const filteredKeys = Object.keys(safeCategories).filter(k => k !== 'Total Hafalan' && k !== 'Penambahan Hafalan');
                    
                    if (autoCalculateZiyadah[s.id]) {
                        const halaman = penambahanHafalan >= 0 ? penambahanHafalan * 20 : 0;
                        if (!filteredKeys.includes('Ziyadah')) {
                            filteredKeys.push('Ziyadah');
                        }
                        safeCategories['Ziyadah'] = halaman.toString();
                    }

                    filteredKeys.forEach(cat => {
                        progressUpdates.push({
                            santri_id: s.id,
                            month_key: filterMonth,
                            progress_type: cat,
                            value: safeCategories[cat]
                        });
                    });

                    if (safeCategories['Hafalan Depan'] !== undefined || safeCategories['Hafalan Belakang'] !== undefined) {
                         progressUpdates.push({ santri_id: s.id, month_key: filterMonth, progress_type: 'Total Hafalan', value: totalHafalan.toString() });
                         progressUpdates.push({ santri_id: s.id, month_key: filterMonth, progress_type: 'Penambahan Hafalan', value: penambahanHafalan.toString() });
                    }
                });
            }
            
            const promises: Promise<any>[] = [...halaqahEvalPromises];
            if (evalUpdates.length > 0) {
                // Deduplicate evalUpdates
                const uniqueEval = [];
                const seenEval = new Set();
                for (let i = evalUpdates.length - 1; i >= 0; i--) {
                    const item = evalUpdates[i];
                    const key = `${item.santri_id}_${item.month_key}`;
                    if (!seenEval.has(key)) {
                        seenEval.add(key);
                        uniqueEval.unshift(item);
                    }
                }
                promises.push(updateEvaluationBatch(uniqueEval, true));
            }
            if (false) {
                promises.push(updateEvaluationBatch(evalUpdates, true));
            }
            if (progressUpdates.length > 0) {
                // Deduplicate progressUpdates to prevent Supabase ON CONFLICT errors
                const uniqueProgress = [];
                const seen = new Set();
                for (let i = progressUpdates.length - 1; i >= 0; i--) {
                    const item = progressUpdates[i];
                    const key = `${item.santri_id}_${item.month_key}_${item.progress_type}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueProgress.unshift(item);
                    }
                }
                promises.push(addStudentProgressBatch(uniqueProgress, true));
            }
            if (false) {
                promises.push(addStudentProgressBatch(progressUpdates, true));
            }

            if (promises.length > 0) {
                await Promise.all(promises);
            }

            if (draftKey) {
                localStorage.removeItem(draftKey);
            }
            setHasUnsavedChanges(false);
            setDraftRestoredInfo(null);

            await fetchData();
            alert('Semua evaluasi berhasil disimpan!');
        } catch (error) {
            console.error('Error saving evaluation:', error);
            alert('Gagal menyimpan evaluasi.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscardDraft = () => {
        if (draftKey) {
            localStorage.removeItem(draftKey);
        }
        setDraftRestoredInfo(null);
        setHasUnsavedChanges(false);
        setLocalProgress({});
        setAutoCalculateZiyadah({});

        const newFormAnswers: Record<number, Record<string, string>> = {};
        const newSantriNotes: Record<number, string> = {};
        filteredHalaqah.forEach(h => {
            const existingEval = halaqahEvaluations.find(e => e.halaqah_id === h.id && e.month_key === filterMonth);
            if (existingEval) newFormAnswers[h.id] = existingEval.answers;
            (h.santri || []).forEach(s => {
                const sEval = studentEvaluations.find(e => e.santri_id === s.id && e.month_key === filterMonth);
                if (sEval?.catatan_musammi) newSantriNotes[s.id] = sEval.catatan_musammi;
            });
        });
        setFormAnswers(newFormAnswers);
        setSantriNotes(newSantriNotes);
    };

    const [lastDbState, setLastDbState] = useState('');

    // Load existing answers into form state when filters change, checking for drafts
    React.useEffect(() => {
        const newFormAnswers: Record<number, Record<string, string>> = {};
        const newSantriNotes: Record<number, string> = {};
        
        filteredHalaqah.forEach(h => {
            const existingEval = halaqahEvaluations.find(e => e.halaqah_id === h.id && e.month_key === filterMonth);
            if (existingEval) {
                newFormAnswers[h.id] = existingEval.answers;
            }

            const hSantri = h.santri || [];
            hSantri.forEach(s => {
                const sEval = studentEvaluations.find(e => e.santri_id === s.id && e.month_key === filterMonth);
                if (sEval && sEval.catatan_musammi) {
                    newSantriNotes[s.id] = sEval.catatan_musammi;
                }
            });
        });

        // Cek draf lokal jika ada
        let draftFound = false;
        if (draftKey) {
            try {
                const rawDraft = localStorage.getItem(draftKey);
                if (rawDraft) {
                    const parsed = JSON.parse(rawDraft);
                    if (parsed) {
                        if (parsed.formAnswers) setFormAnswers(parsed.formAnswers);
                        if (parsed.santriNotes) setSantriNotes(parsed.santriNotes);
                        if (parsed.localProgress) setLocalProgress(parsed.localProgress);
                        if (parsed.autoCalculateZiyadah) setAutoCalculateZiyadah(parsed.autoCalculateZiyadah);
                        setHasUnsavedChanges(true);
                        setDraftRestoredInfo({ time: parsed.lastModified || 'Tersimpan otomatis' });
                        draftFound = true;
                    }
                }
            } catch (err) {
                console.error("Gagal memuat draf evaluasi:", err);
            }
        }

        if (!draftFound) {
            const currentDbState = JSON.stringify({ newFormAnswers, newSantriNotes, filterMonth });
            if (currentDbState !== lastDbState) {
                setFormAnswers(newFormAnswers);
                setSantriNotes(newSantriNotes);
                setLocalProgress({});
                setUsePrevDepan({});
                setUsePrevBelakang({});
                setLastDbState(currentDbState);
            }
            setHasUnsavedChanges(false);
            setDraftRestoredInfo(null);
        }
    }, [filteredHalaqah, halaqahEvaluations, studentEvaluations, filterMonth, lastDbState, draftKey]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-sans min-h-screen max-w-[1400px] mx-auto pb-12 pt-2 overscroll-y-contain">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                <div>
                    <div className="flex flex-wrap items-center gap-2.5 mb-2">
                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">Input Evaluasi</h2>
                        {hasUnsavedChanges && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                Perubahan belum disimpan
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 font-medium">Nilai kualitas hafalan dan evaluasi halaqah.</p>
                </div>

                {filterHalaqah !== 'all' && (
                    <div className="flex items-center gap-2">
                        {/* Tombol Titik Tiga (Menu Aksi) di Sebelah Kiri Tombol Simpan */}
                        <div className="relative" ref={menuRef}>
                            <button
                                type="button"
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                    isMenuOpen
                                        ? 'bg-slate-100 text-slate-800 border-slate-300 shadow-2xs'
                                        : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200 shadow-2xs'
                                }`}
                                title="Menu opsi evaluasi"
                                aria-label="Menu opsi evaluasi"
                            >
                                <MoreVertical size={18} />
                            </button>

                            {isMenuOpen && (
                                <div className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                                    <button
                                        type="button"
                                        onClick={handleDirectPullAllSetoran}
                                        className="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                                    >
                                        <RefreshCw size={15} className="text-slate-500" />
                                        <span>Tarik Data</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleSaveEvaluation} 
                            disabled={isSaving} 
                            className={`${isSaving ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'} text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all flex items-center gap-2 cursor-pointer`}
                        >
                            {isSaving ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    Menyimpan...
                                </>
                            ) : (
                                <>
                                    <Save size={18} strokeWidth={2.5} /> Simpan Evaluasi
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>


            {/* Lapisan 3: Notifikasi Pemulihan Draf Otomatis Evaluasi (Clean, Simple, Konsisten) */}
            {draftRestoredInfo && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-blue-200/90 bg-blue-50/70 text-slate-800 shadow-2xs mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700">
                            <Clock size={16} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-slate-900">Draf Evaluasi Santri Dipulihkan Otomatis</span>
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-blue-100/80 text-blue-800">
                                    Pukul {draftRestoredInfo.time}
                                </span>
                            </div>
                            <p className="text-[12px] text-slate-600 mt-0.5">
                                Isian nilai perkembangan dan catatan santri yang belum tersimpan berhasil diamankan otomatis ke formulir ini.
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-wrap gap-5 items-end mb-6 z-10 relative">
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Periode Evaluasi</label>
                    <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                        {sortedPeriods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Marhalah</label>
                    <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterMarhalah} onChange={e => setFilterMarhalah(e.target.value as Marhalah | 'all')}>
                        <option value="all">Semua Marhalah</option>
                        {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Jenis</label>
                    <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterJenis} onChange={e => setFilterJenis(e.target.value as HalaqahType | 'all')}>
                        <option value="all">Semua Jenis</option>
                        {globalJenisHalaqah.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Halaqah</label>
                    <select className="w-full border border-slate-200/80 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/50 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all cursor-pointer" value={filterHalaqah} onChange={e => setFilterHalaqah(e.target.value)}>
                        <option value="all">Pilih Halaqah</option>
                        {halaqah.filter(h => h.is_active === true).filter(h => {
                            if (userProfile?.role === 'musammi') {
                                return (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                                       (h.musammi?.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim());
                            }
                            return true;
                        })
                                .filter(h => filterMarhalah === 'all' || h.marhalah === filterMarhalah)
                                .filter(h => filterJenis === 'all' || h.jenis === filterJenis)
                                .sort((a, b) => a.nama.localeCompare(b.nama))
                                .map(h => <option key={h.id} value={h.id.toString()}>{h.nama}</option>)}
                    </select>
                </div>
            </div>

            {filterHalaqah === 'all' ? (
                <div className="text-center py-24 bg-white rounded-3xl border border-slate-200/60 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-[2rem] rotate-3 flex items-center justify-center mb-6 shadow-sm border border-emerald-100/50 relative z-10">
                        <Users size={40} strokeWidth={2} className="-rotate-3"/>
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-900 mb-3 tracking-tight relative z-10">Pilih Halaqah</h3>
                    <p className="text-sm text-slate-500 max-w-sm leading-relaxed relative z-10">Silakan pilih spesifik halaqah pada menu filter di atas untuk mulai mengisi form evaluasi kedisiplinan dan monitoring halaqah.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {filteredHalaqah.map(h => (
                        <div key={h.id} className="space-y-6">
                            <div className="mb-4">
                                <h3 className="text-[16px] font-bold text-slate-800">
                                    {h.nama} <span className="text-slate-500 font-medium">({h.musammi?.nama || 'Tanpa Musammi'})</span>
                                </h3>
                            </div>
                            {h.santri && h.santri.length > 0 ? (
                                <div className="grid grid-cols-1 gap-6">
                                            {h.santri.map(s => {
                                                const evalData = studentEvaluations.find(e => e.santri_id === s.id && e.month_key === filterMonth);
                                                
                                                const hafalanDepanStr = localProgress[s.id]?.[`Hafalan Depan`] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === `Hafalan Depan`)?.value ?? '';
                                                const suratAyatDepan = localProgress[s.id]?.[`Surat Ayat Depan`] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === `Surat Ayat Depan`)?.value ?? '';
                                                
                                                const hafalanBelakangStr = localProgress[s.id]?.[`Hafalan Belakang`] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === `Hafalan Belakang`)?.value ?? '';
                                                const suratAyatBelakang = localProgress[s.id]?.[`Surat Ayat Belakang`] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === `Surat Ayat Belakang`)?.value ?? '';
                                                
                                                
                                                const ziyadahVal = localProgress[s.id]?.[`Ziyadah`] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === `Ziyadah`)?.value ?? '';
                                                const murojaahVal = localProgress[s.id]?.[`Murojaah`] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === `Murojaah`)?.value ?? '';

                                                return (
                                                    <div key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                                        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100 bg-white">
                                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center shrink-0">
                                                                    {s.nama.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div className="flex flex-col flex-1 min-w-0">
                                                                    <span className="font-bold text-[14px] text-slate-800 line-clamp-1" title={s.nama}>{s.nama.toUpperCase()}</span>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-widest">Aktif</span>
                                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 uppercase tracking-widest">Kelas <KelasLabel text={s.kelas} id={s.kelas_id} /></span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="p-5 flex-1 space-y-4 bg-white">
                                                            <QuranHafalanInput
                                                                title="Depan"
                                                                juzValue={hafalanDepanStr}
                                                                suratAyatValue={suratAyatDepan}
                                                                onJuzChange={(val) => handleDynamicValueChange(s.id, 'Hafalan Depan', val)}
                                                                onSuratAyatChange={(val) => handleDynamicValueChange(s.id, 'Surat Ayat Depan', val)}
                                                                usePrevChecked={!!usePrevDepan[s.id]}
                                                                onUsePrevChange={(checked) => handleUsePrevDepan(s.id, checked)}
                                                                defaultSurahStart={1}
                                                                defaultSurahEnd={2}
                                                            />
                                                            <hr className="border-slate-100" />
                                                            <QuranHafalanInput
                                                                title="Belakang"
                                                                juzValue={hafalanBelakangStr}
                                                                suratAyatValue={suratAyatBelakang}
                                                                onJuzChange={(val) => handleDynamicValueChange(s.id, 'Hafalan Belakang', val)}
                                                                onSuratAyatChange={(val) => handleDynamicValueChange(s.id, 'Surat Ayat Belakang', val)}
                                                                usePrevChecked={!!usePrevBelakang[s.id]}
                                                                onUsePrevChange={(checked) => handleUsePrevBelakang(s.id, checked)}
                                                                defaultSurahStart={114}
                                                                defaultSurahEnd={78}
                                                            />

                                                            <div>
                                                                <div className="mb-4">
                                                                    <div className="flex justify-between items-center mb-1.5">
                                                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ziyadah (Halaman)</label>
                                                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                checked={!!autoCalculateZiyadah[s.id]} 
                                                                                onChange={e => {
                                                                                    const checked = e.target.checked;
                                                                                    setAutoCalculateZiyadah(prev => {
                                                                                        const next = { ...prev, [s.id]: checked };
                                                                                        saveDraftToStorage(formAnswers, santriNotes, localProgress, next);
                                                                                        return next;
                                                                                    });
                                                                                    setHasUnsavedChanges(true);
                                                                                }} 
                                                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3 w-3" 
                                                                            />
                                                                            <span className="text-[10px] font-bold text-slate-500">Hitung Otomatis</span>
                                                                        </label>
                                                                    </div>
                                                                    <input 
                                                                        type="number" step="0.1" 
                                                                        className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-11 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" 
                                                                        value={
                                                                            autoCalculateZiyadah[s.id] ? (() => {
                                                                                const hafalanDepanStr = localProgress[s.id]?.['Hafalan Depan'] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === 'Hafalan Depan')?.value ?? '';
                                                                                const hafalanDepan = parseFloat(hafalanDepanStr) || 0;
                                                                                const hafalanBelakangStr = localProgress[s.id]?.['Hafalan Belakang'] ?? studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === 'Hafalan Belakang')?.value ?? '';
                                                                                const hafalanBelakang = parseFloat(hafalanBelakangStr) || 0;
                                                                                const explicitCurrentTotalHafalanStr = studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === 'Total Hafalan')?.value;
                                                                                const explicitCurrentTotalHafalan = parseFloat(explicitCurrentTotalHafalanStr ?? '0') || 0;
                                                                                const totalHafalan = (hafalanDepan === 0 && hafalanBelakang === 0 && explicitCurrentTotalHafalan > 0) ? explicitCurrentTotalHafalan : (hafalanDepan + hafalanBelakang);
                                                                                let prevMonthKey = '';
                                                                                if (filterMonth && sortedPeriods.length > 0) {
                                                                                    const currentIndex = sortedPeriods.findIndex(p => p.id === filterMonth);
                                                                                    if (currentIndex !== -1 && currentIndex + 1 < sortedPeriods.length) {
                                                                                        prevMonthKey = sortedPeriods[currentIndex + 1].id;
                                                                                    }
                                                                                }
                                                                                const explicitPrevTotalHafalanStr = studentProgress.find(p => p.santri_id === s.id && p.month_key === prevMonthKey && p.progress_type === 'Total Hafalan')?.value;
                                                                                const prevHafalanDepan = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === prevMonthKey && p.progress_type === 'Hafalan Depan')?.value ?? '0') || 0;
                                                                                const prevHafalanBelakang = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === prevMonthKey && p.progress_type === 'Hafalan Belakang')?.value ?? '0') || 0;
                                                                                const prevTotalHafalan = explicitPrevTotalHafalanStr ? parseFloat(explicitPrevTotalHafalanStr) || 0 : (prevHafalanDepan + prevHafalanBelakang);
                                                                                const penambahanHafalan = totalHafalan - prevTotalHafalan;
                                                                                const halaman = penambahanHafalan >= 0 ? penambahanHafalan * 20 : 0;
                                                                                return penambahanHafalan >= 0 ? halaman.toString() : '';
                                                                            })() : ziyadahVal
                                                                        } 
                                                                        onChange={e => {
                                                                            if (!autoCalculateZiyadah[s.id]) handleDynamicValueChange(s.id, 'Ziyadah', e.target.value);
                                                                        }}
                                                                        readOnly={!!autoCalculateZiyadah[s.id]}
                                                                        style={autoCalculateZiyadah[s.id] ? { backgroundColor: '#f8fafc', color: '#64748b' } : {}}
                                                                    />
                                                                </div>
                                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Murojaah (Juz)</label>
                                                                <input type="number" step="0.1" className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-11 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" value={murojaahVal} onChange={e => handleDynamicValueChange(s.id, 'Murojaah', e.target.value)} />
                                                            </div>

                                                            {allCategories.map(c => {
                                                                const dbProgressVal = studentProgress.find(p => p.santri_id === s.id && p.month_key === filterMonth && p.progress_type === c)?.value;
                                                                const dbEvalVal = c === 'Hafalan' ? evalData?.kualitas_hafalan : c === 'Bacaan' ? evalData?.kualitas_bacaan : c === 'Sikap' ? evalData?.sikap_prilaku : undefined;
                                                                const actualVal = localProgress[s.id]?.[c] ?? dbProgressVal ?? dbEvalVal ?? '';
                                                                const options = getOptions(c);
                                                                
                                                                return (
                                                                    <div key={c}>
                                                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{c}</label>
                                                                        <div className="relative">
                                                                            <select 
                                                                                className="w-full text-[13px] font-medium border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-11 px-4 appearance-none cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                                                                                style={{ 
                                                                                    backgroundColor: actualVal && evalColors[actualVal] ? evalColors[actualVal] + '1A' : '#ffffff', // 1A is ~10% opacity
                                                                                    color: actualVal && evalColors[actualVal] ? evalColors[actualVal] : '#334155'
                                                                                }}
                                                                                value={actualVal}
                                                                                onChange={(e) => handleDynamicValueChange(s.id, c, e.target.value)}
                                                                            >
                                                                                <option value="" style={{backgroundColor: '#fff', color: '#000'}}>-</option>
                                                                                {options.map(opt => (
                                                                                    <option key={opt.label} value={opt.label} style={{backgroundColor: '#fff', color: evalColors[opt.label] || '#334155'}}>{opt.label}</option>
                                                                                ))}
                                                                            </select>
                                                                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90 w-4 h-4" />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}

                                                            <div>
                                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Catatan Musammi</label>
                                                                <textarea 
                                                                    value={santriNotes[s.id] || ''}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        setSantriNotes(prev => {
                                                                            const next = { ...prev, [s.id]: val };
                                                                            saveDraftToStorage(formAnswers, next, localProgress, autoCalculateZiyadah);
                                                                            return next;
                                                                        });
                                                                        setHasUnsavedChanges(true);
                                                                    }}
                                                                    className="w-full text-[13px] font-medium text-slate-700 bg-white border border-slate-200/80 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all resize-y min-h-[80px]"
                                                                    placeholder="Tambahkan catatan khusus..."
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-slate-500 text-[13px] bg-white rounded-xl border border-slate-200 border-dashed">
                                            Tidak ada santri di halaqah ini.
                                        </div>
                                    )}
                            
                            {/* Card 2: Evaluasi Halaqah */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-5 border-b border-slate-100/80 bg-slate-50/30 flex items-center justify-between">
                                    <h3 className="text-[15px] font-bold text-slate-800 flex items-center">
                                        <ClipboardList size={18} className="mr-2 text-indigo-600" />
                                        Evaluasi Halaqah <span className="mx-2 text-slate-300">•</span> <span className="text-slate-500 font-medium">{h.nama}</span>
                                    </h3>
                                </div>
                                <div className="p-6">
                                    <div className="space-y-6 max-w-3xl">
                                        {halaqahEvalQuestions.map(q => (
                                            <div key={q.id} className="pb-6 border-b border-slate-100 last:border-0 last:pb-0">
                                                <label className="block text-[14px] font-bold text-slate-800 mb-1.5">{q.question}</label>
                                                {q.description && <p className="text-[12px] text-slate-500 mb-3">{q.description}</p>}
                                                
                                                {q.type === 'dropdown' ? (
                                                    <div className="relative max-w-md">
                                                        <select 
                                                            value={formAnswers[h.id]?.[q.id] || ''} 
                                                            onChange={e => handleAnswerChange(h.id, q.id, e.target.value)}
                                                            className="appearance-none w-full text-[13px] font-medium text-slate-700 bg-white border border-slate-200/80 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all cursor-pointer"
                                                        >
                                                            <option value="" className="text-slate-400">-- Pilih Jawaban --</option>
                                                            {q.options?.map((opt: any, idx: number) => (
                                                                <option key={idx} value={opt.label}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" size={16} />
                                                    </div>
                                                ) : (
                                                    <textarea 
                                                        value={formAnswers[h.id]?.[q.id] || ''} 
                                                        onChange={e => handleAnswerChange(h.id, q.id, e.target.value)}
                                                        className="w-full text-[13px] font-medium text-slate-700 bg-white border border-slate-200/80 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all resize-y min-h-[100px]"
                                                        rows={3}
                                                        placeholder="Tulis jawaban di sini..."
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Submit All Button */}
                    <div className="flex justify-end mt-8 border-t border-slate-200 pt-6">
                        <button onClick={handleSaveEvaluation} disabled={isSaving} className={`${isSaving ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'} text-white px-8 py-3 rounded-xl text-[14px] font-bold shadow-[0_2px_12px_rgba(37,99,235,0.25)] transition-all flex items-center gap-2`}>
                            {isSaving ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    Menyimpan...
                                </>
                            ) : (
                                <>
                                    <Save size={18} strokeWidth={2.5} /> Simpan Semua Evaluasi
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Modal Tarik Data dari Setoran Harian (Tahap 4) */}
            <Modal
                isOpen={isSyncModalOpen}
                onClose={() => setIsSyncModalOpen(false)}
                title="Tarik Data dari Setoran Harian ke Form Evaluasi"
                maxWidth="3xl"
            >
                <div className="space-y-5">
                    {/* Header Info Banner */}
                    <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-100 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                                    Halaqah: {currentHalaqahObj?.nama || 'Halaqah Terpilih'}
                                </span>
                                <span className="text-xs font-medium text-slate-500">
                                    {currentHalaqahSantri.length} Santri Terdaftar
                                </span>
                            </div>
                            <h4 className="text-[15px] font-bold text-slate-900">
                                Periode: {activePeriod?.nama || filterMonth}
                            </h4>
                            <p className="text-xs text-slate-500">
                                Rentang tanggal transaksi setoran: <span className="font-semibold text-slate-700">{syncPeriodRange.startDate || '-'} s.d {syncPeriodRange.endDate || '-'}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-emerald-700 border border-emerald-200 shadow-2xs">
                                <Sparkles size={14} className="text-emerald-500" />
                                <span>Auto-Sync Siap</span>
                            </span>
                        </div>
                    </div>

                    {/* Status Sub-Fitur Konfigurasi */}
                    <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                Sub-Fitur yang Disinkronkan (Sesuai Pengaturan Evaluasi)
                            </span>
                            {!autoSyncConfig.enabled && (
                                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    Master Toggle Nonaktif (Bisa Tetap Ditarik Manual)
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className={`p-2.5 rounded-lg border ${autoSyncConfig.ziyadah.enabled ? 'bg-white border-emerald-200 text-emerald-900' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                <div className="font-bold flex items-center justify-between">
                                    <span>Ziyadah</span>
                                    <span className="text-[10px] uppercase font-semibold">{autoSyncConfig.ziyadah.enabled ? 'Aktif' : 'Off'}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    Min: {autoSyncConfig.ziyadah.min_nilai || 'Jayyid'}
                                </div>
                            </div>

                            <div className={`p-2.5 rounded-lg border ${autoSyncConfig.murojaah.enabled ? 'bg-white border-emerald-200 text-emerald-900' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                <div className="font-bold flex items-center justify-between">
                                    <span>Murojaah</span>
                                    <span className="text-[10px] uppercase font-semibold">{autoSyncConfig.murojaah.enabled ? 'Aktif' : 'Off'}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    {autoSyncConfig.murojaah.selected_schemes.length} Skema
                                </div>
                            </div>

                            <div className={`p-2.5 rounded-lg border ${autoSyncConfig.hafalan.enabled ? 'bg-white border-emerald-200 text-emerald-900' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                <div className="font-bold flex items-center justify-between">
                                    <span>Capaian Hafalan</span>
                                    <span className="text-[10px] uppercase font-semibold">{autoSyncConfig.hafalan.enabled ? 'Aktif' : 'Off'}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                    Depan & Belakang
                                </div>
                            </div>

                            <div className={`p-2.5 rounded-lg border ${autoSyncConfig.kelancaran.enabled ? 'bg-white border-emerald-200 text-emerald-900' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                                <div className="font-bold flex items-center justify-between">
                                    <span>Kelancaran</span>
                                    <span className="text-[10px] uppercase font-semibold">{autoSyncConfig.kelancaran.enabled ? 'Aktif' : 'Off'}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    Kat: {autoSyncConfig.kelancaran.target_category_id || 'Hafalan'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pemilihan Cakupan (Semua vs Tertentu) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 self-start">
                            <button
                                type="button"
                                onClick={() => setSyncScope('all')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${syncScope === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                Semua Santri di Halaqah ({currentHalaqahSantri.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSyncScope('selected')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${syncScope === 'selected' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                Pilih Santri Tertentu ({selectedSantriForSync.length})
                            </button>
                        </div>

                        {syncScope === 'selected' && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSelectAllSantri}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 hover:bg-blue-50 rounded cursor-pointer"
                                >
                                    Pilih Semua
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                    type="button"
                                    onClick={handleDeselectAllSantri}
                                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 hover:bg-slate-100 rounded cursor-pointer"
                                >
                                    Kosongkan
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Preview List Santri & Hasil Kalkulasi Engine */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                        <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                            <span>Daftar Santri & Preview Hasil Sinkronisasi</span>
                            <span>{santriIdsToApply.length} santri akan ditarik</span>
                        </div>

                        <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                            {currentHalaqahSantri.length === 0 ? (
                                <div className="p-8 text-center text-sm text-slate-500">
                                    Tidak ada data santri aktif dalam halaqah ini untuk periode terpilih.
                                </div>
                            ) : (
                                currentHalaqahSantri.map((s: any) => {
                                    const isSelected = syncScope === 'all' || selectedSantriForSync.includes(s.id);
                                    const res = syncResultsMap[s.id];

                                    return (
                                        <div 
                                            key={s.id} 
                                            onClick={() => {
                                                if (syncScope === 'selected') handleToggleSantriSelect(s.id);
                                            }}
                                            className={`p-3.5 sm:p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isSelected ? 'bg-white' : 'bg-slate-50/50 opacity-60'} ${syncScope === 'selected' ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {syncScope === 'selected' && (
                                                    <input 
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleToggleSantriSelect(s.id)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                    />
                                                )}
                                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                                                    {s.nama.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-[13px] text-slate-900 truncate" title={s.nama}>
                                                        {s.nama.toUpperCase()}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        Kelas <KelasLabel text={s.kelas} id={s.kelas_id} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Preview Values Chips */}
                                            {res ? (
                                                <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-center shrink-0">
                                                    {autoSyncConfig.ziyadah.enabled && (
                                                        <span className="text-[11px] px-2.5 py-1 rounded-lg font-medium bg-emerald-50 text-emerald-800 border border-emerald-100" title={`${res.ziyadahRecordsCount} setoran valid (>= ${autoSyncConfig.ziyadah.min_nilai || 'Jayyid'})`}>
                                                            Ziyadah: <strong className="font-bold">{res.ziyadahHalaman > 0 ? `${res.ziyadahHalaman} Hal` : '0 Hal'}</strong>
                                                        </span>
                                                    )}

                                                    {autoSyncConfig.murojaah.enabled && (
                                                        <span className="text-[11px] px-2.5 py-1 rounded-lg font-medium bg-blue-50 text-blue-800 border border-blue-100" title={`${res.murojaahRecordsCount} setoran murojaah (${res.murojaahHalaman} Hal)`}>
                                                            Murojaah: <strong className="font-bold">{res.murojaahJuz > 0 ? `${res.murojaahJuz} Juz` : '0 Juz'}</strong>
                                                        </span>
                                                    )}

                                                    {autoSyncConfig.hafalan.enabled && (
                                                        <span className="text-[11px] px-2.5 py-1 rounded-lg font-medium bg-purple-50 text-purple-800 border border-purple-100" title={`Depan: ${res.capaianHafalan.suratAyatDepan || '-'} | Belakang: ${res.capaianHafalan.suratAyatBelakang || '-'}`}>
                                                            Hafalan: <strong className="font-bold">{res.capaianHafalan.totalJuzStr ? `${res.capaianHafalan.totalJuzStr} Juz` : '-'}</strong>
                                                        </span>
                                                    )}

                                                    {autoSyncConfig.kelancaran.enabled && res.kelancaran.status && (
                                                        <span className="text-[11px] px-2.5 py-1 rounded-lg font-medium bg-amber-50 text-amber-800 border border-amber-100" title={`Rata-rata Skor: ${res.kelancaran.rawAverage?.toFixed(1) || '-'}`}>
                                                            Kelancaran: <strong className="font-bold">{res.kelancaran.status}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Memuat preview...</span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Notice & Footer Actions */}
                    <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900">
                        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                        <div>
                            <strong>Catatan Keamanan & Fleksibilitas:</strong> Nilai yang ditarik akan langsung mengisi isian formulir evaluasi santri dan berstatus <em>editable</em> (bebas disesuaikan/dikoreksi oleh Anda). Data baru akan tersimpan permanen saat Anda menekan tombol <strong>Simpan Evaluasi</strong>.
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setIsSyncModalOpen(false)}
                            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                            Batal
                        </button>
                        <button
                            type="button"
                            onClick={handleApplySync}
                            disabled={santriIdsToApply.length === 0}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all flex items-center gap-2 shadow-sm cursor-pointer ${santriIdsToApply.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 active:scale-95'}`}
                        >
                            <Check size={18} strokeWidth={2.5} />
                            <span>Terapkan ke Formulir Evaluasi ({santriIdsToApply.length} Santri)</span>
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PerkembanganInputPage;
