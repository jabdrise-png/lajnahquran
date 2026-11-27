// Dipecah otomatis dari SantriDetailProgressView.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen SantriDetailProgressView.
// Ubah perilaku di sini; tampilan ada di SantriDetailProgressView.tsx.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRiwayat } from '../hooks/useSupabaseData';
import { 
    ArrowLeft, Calendar, BookOpen, Award, CheckCircle2, 
    ChevronRight, ChevronDown, User, FileText,
    MoreVertical, Download, CheckSquare, Square
} from 'lucide-react';
import { 
    ResponsiveContainer, ComposedChart, CartesianGrid, 
    XAxis, YAxis, Tooltip as RechartsTooltip, Line, Area 
} from 'recharts';
import html2canvas from 'html2canvas';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { MarhalahLabel, KelasLabel } from './Labels';
import { Santri, Halaqah, StudentProgress, StudentEvaluation, AttendanceRecord, SetoranHarian, MasterEvaluationPeriod, ClassTarget } from '../types';


export interface SantriDetailProgressViewProps {
    santri: Santri;
    selectedPeriod: string;
    onPeriodChange?: (periodId: string) => void;
    periods: MasterEvaluationPeriod[];
    appSettings: any[];
    halaqahList: Halaqah[];
    studentProgress: StudentProgress[];
    localProgress: Record<number, Record<string, string>>;
    studentEvaluations: StudentEvaluation[];
    attendance: AttendanceRecord[];
    setoranHarian: SetoranHarian[];
    allCategories: string[];
    getOptions: (category: string) => { label: string; color?: string; score?: number }[];
    evalColors: Record<string, string>;
    classTargets: ClassTarget[];
    onBack: () => void;
}

export function useSantriDetailProgressViewLogika({
    santri,
    selectedPeriod,
    onPeriodChange,
    periods,
    appSettings,
    halaqahList,
    studentProgress,
    localProgress,
    studentEvaluations,
    attendance,
    setoranHarian,
    allCategories,
    getOptions,
    evalColors,
    classTargets,
    onBack
}: SantriDetailProgressViewProps) {
    useRiwayat(); // Fase 7: detail santri butuh riwayat lengkap
    // Helper to normalize dates (handles slash, ISO timestamps, etc.)
    const normDate = (d: any) => {
        if (!d) return '';
        const s = String(d).trim();
        if (s.includes('/')) return s.split('/').reverse().join('-');
        return s.substring(0, 10);
    };

    const formatDateDisplay = (dateStr: string | null | undefined) => {
        if (!dateStr) return '-';
        try {
            const cleanDate = normDate(dateStr);
            return format(parseISO(cleanDate), 'dd MMM yyyy', { locale: localeId });
        } catch (e) {
            return dateStr;
        }
    };

    // Robust matching for santri across attendance and setoran records
    const isMatchSantri = useMemo(() => {
        return (itemPersonId: any, itemNama?: string) => {
            if (itemPersonId !== undefined && itemPersonId !== null && itemPersonId !== '') {
                if (String(itemPersonId).trim() === String(santri.id).trim()) return true;
                if (Number(itemPersonId) === Number(santri.id)) return true;
            }
            if (itemNama && santri.nama) {
                if (itemNama.toLowerCase().trim() === santri.nama.toLowerCase().trim()) return true;
            }
            return false;
        };
    }, [santri.id, santri.nama]);

    // 1. Current Period Object & Resolved Start/End Dates
    const { pStart, pEnd } = useMemo(() => {
        const periodObj = periods.find(p => p.id === selectedPeriod || p.name === selectedPeriod);
        let start = periodObj?.startDate || (periodObj as any)?.start_date || '';
        let end = periodObj?.endDate || (periodObj as any)?.end_date || '';
        let name = periodObj?.name || selectedPeriod;

        if (!start || !end) {
            if (selectedPeriod.match(/^\d{4}-\d{2}$/)) {
                start = `${selectedPeriod}-01`;
                end = `${selectedPeriod}-31`;
            } else if (selectedPeriod.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [d, m, y] = selectedPeriod.split('-');
                start = `${y}-${m}-01`;
                end = `${y}-${m}-31`;
            } else if (selectedPeriod.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const y = selectedPeriod.substring(0, 4);
                const m = selectedPeriod.substring(5, 7);
                start = `${y}-${m}-01`;
                end = `${y}-${m}-31`;
            }
        }

        return { pStart: start, pEnd: end, periodName: name };
    }, [periods, selectedPeriod]);

    // Helper to format date range label for any period in dropdown
    const getPeriodDateLabel = (p: MasterEvaluationPeriod) => {
        let start = p.startDate || (p as any).start_date || '';
        let end = p.endDate || (p as any).end_date || '';
        if (!start || !end) {
            if (p.id.match(/^\d{4}-\d{2}$/)) {
                start = `${p.id}-01`;
                end = `${p.id}-31`;
            } else if (p.id.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [d, m, y] = p.id.split('-');
                start = `${y}-${m}-01`;
                end = `${y}-${m}-31`;
            } else if (p.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const y = p.id.substring(0, 4);
                const m = p.id.substring(5, 7);
                start = `${y}-${m}-01`;
                end = `${y}-${m}-31`;
            }
        }
        if (start && end) {
            return `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
        }
        return p.name || p.id;
    };

    // 2. Halaqah History & Mentors
    const halaqahHistory = useMemo(() => {
        const list: {
            halaqahId: number;
            halaqahNama: string;
            musammiNama: string;
            marhalah: string;
            jenis: string;
            startDate: string;
            endDate: string | null;
            status: string;
            isCurrent: boolean;
        }[] = [];

        (halaqahList || []).forEach(h => {
            if (h.history && h.history.length > 0) {
                h.history.forEach(hs => {
                    if (isMatchSantri(hs.santri_id)) {
                        list.push({
                            halaqahId: h.id,
                            halaqahNama: h.nama,
                            musammiNama: h.musammi?.nama || 'Belum Ditentukan',
                            marhalah: h.marhalah,
                            jenis: h.jenis,
                            startDate: hs.start_date || '',
                            endDate: hs.end_date || null,
                            status: hs.status || (hs.end_date ? 'Selesai' : 'Aktif'),
                            isCurrent: !hs.end_date || hs.status === 'Aktif'
                        });
                    }
                });
            }

            const isInCurrent = (h.santri || []).some(s => isMatchSantri(s.id, s.nama)) || (h.active_santri || []).some(s => isMatchSantri(s.id, s.nama));
            if (isInCurrent && !list.some(item => item.halaqahId === h.id && item.isCurrent)) {
                list.unshift({
                    halaqahId: h.id,
                    halaqahNama: h.nama,
                    musammiNama: h.musammi?.nama || 'Belum Ditentukan',
                    marhalah: h.marhalah,
                    jenis: h.jenis,
                    startDate: h.created_at || '',
                    endDate: null,
                    status: 'Aktif',
                    isCurrent: true
                });
            }
        });

        if (list.length === 0) {
            const currentMatch = (halaqahList || []).find(h => (h.santri || []).some(s => isMatchSantri(s.id, s.nama)));
            if (currentMatch) {
                list.push({
                    halaqahId: currentMatch.id,
                    halaqahNama: currentMatch.nama,
                    musammiNama: currentMatch.musammi?.nama || 'Belum Ditentukan',
                    marhalah: currentMatch.marhalah,
                    jenis: currentMatch.jenis,
                    startDate: currentMatch.created_at || '',
                    endDate: null,
                    status: 'Aktif',
                    isCurrent: true
                });
            }
        }

        return list.sort((a, b) => {
            if (a.isCurrent && !b.isCurrent) return -1;
            if (!a.isCurrent && b.isCurrent) return 1;
            return (b.startDate || '').localeCompare(a.startDate || '');
        });
    }, [halaqahList, isMatchSantri]);

    const activeHalaqahInfo = halaqahHistory.find(h => h.isCurrent) || halaqahHistory[0];

    // 3. Evaluation Metrics for Selected Period
    const progressMap = useMemo(() => {
        const map = new Map<string, string>();
        (studentProgress || []).forEach(p => {
            if (isMatchSantri(p.santri_id) && p.month_key === selectedPeriod) {
                map.set(p.progress_type, p.value);
            }
        });
        return map;
    }, [studentProgress, isMatchSantri, selectedPeriod]);

    const currentEval = useMemo(() => {
        return (studentEvaluations || []).find(e => isMatchSantri(e.santri_id) && e.month_key === selectedPeriod);
    }, [studentEvaluations, isMatchSantri, selectedPeriod]);

    const hafalanDepanStr = localProgress[santri.id]?.['Hafalan Depan'] ?? progressMap.get('Hafalan Depan') ?? '0';
    const hafalanDepan = parseFloat(hafalanDepanStr) || 0;
    const suratAyatDepan = localProgress[santri.id]?.['Surat Ayat Depan'] ?? progressMap.get('Surat Ayat Depan') ?? '-';

    const hafalanBelakangStr = localProgress[santri.id]?.['Hafalan Belakang'] ?? progressMap.get('Hafalan Belakang') ?? '0';
    const hafalanBelakang = parseFloat(hafalanBelakangStr) || 0;
    const suratAyatBelakang = localProgress[santri.id]?.['Surat Ayat Belakang'] ?? progressMap.get('Surat Ayat Belakang') ?? '-';

    const totalHafalanCalc = hafalanDepan + hafalanBelakang;
    const explicitTotalHafalanStr = progressMap.get('Total Hafalan');
    const totalHafalan = (hafalanDepan === 0 && hafalanBelakang === 0 && explicitTotalHafalanStr) 
        ? (parseFloat(explicitTotalHafalanStr) || 0) 
        : totalHafalanCalc;

    const ziyadahStr = localProgress[santri.id]?.['Ziyadah'] ?? progressMap.get('Ziyadah') ?? '0';
    const ziyadah = parseFloat(ziyadahStr) || 0;

    const murojaahStr = localProgress[santri.id]?.['Murojaah'] ?? progressMap.get('Murojaah') ?? '0';
    const murojaah = parseFloat(murojaahStr) || 0;

    // Targets for this student
    const studentTarget = useMemo(() => {
        return (classTargets || []).find(t => 
            (String(t.kelas).toLowerCase() === String(santri.kelas).toLowerCase() || String(t.kelas_id) === String(santri.kelas_id)) && 
            (String(t.marhalah).toLowerCase() === String(santri.marhalah).toLowerCase() || String(t.marhalah_id) === String(santri.marhalah_id))
        );
    }, [classTargets, santri]);

    const targetHafalan = studentTarget?.target_hafalan || 0;
    const pctHafalan = targetHafalan > 0 ? (totalHafalan / targetHafalan) * 100 : 0;

    // Target Murojaah calculation from TARGET_MUROJAAH_GLOBAL and fallback to classTargets
    const targetMurojaah = useMemo(() => {
        let tm = 0;
        const murojaahSetting = appSettings.find((s) => s.key === 'TARGET_MUROJAAH_GLOBAL');
        if (murojaahSetting && murojaahSetting.value) {
            try {
                const parsed = JSON.parse(murojaahSetting.value);
                const marhalahKey = Object.keys(parsed).find(k => k.toLowerCase().trim() === (santri.marhalah || '').toLowerCase().trim());
                const rules = parsed[santri.marhalah] || (marhalahKey ? parsed[marhalahKey] : []) || [];
                if (Array.isArray(rules)) {
                    const sortedRules = [...rules].sort((a, b) => (b.min_capaian || 0) - (a.min_capaian || 0));
                    const matchedRule = sortedRules.find((r) => totalHafalan >= (r.min_capaian || 0));
                    if (matchedRule) {
                        tm = matchedRule.target || 0;
                    }
                }
            } catch (e) {}
        }
        if (tm === 0 && studentTarget?.target_murojaah) {
            tm = studentTarget.target_murojaah;
        }
        return tm;
    }, [appSettings, santri.marhalah, totalHafalan, studentTarget]);

    const pctMurojaah = targetMurojaah > 0 ? (murojaah / targetMurojaah) * 100 : 0;

    // Nilai Ranges
    const nilaiRanges = useMemo(() => {
        const val = appSettings.find((s) => s.key === 'SETORAN_AUTO_RANGES')?.value;
        if (val) {
            try { return JSON.parse(val); } catch (e) {}
        }
        return [
            { label: 'Mumtaz', min: 90 },
            { label: 'Jayyid Jiddan', min: 80 },
            { label: 'Jayyid', min: 70 },
            { label: 'Maqbul', min: 60 },
            { label: 'Dhaif', min: 0 }
        ];
    }, [appSettings]);

    // Available dynamic skemas
    const availableSkemas = useMemo(() => {
        // Fase 2: nama jenis setoran diambil dari data setoran (recitation_kinds); daftar bawaan sebagai cadangan
        const fromSettings = ['Ziyadah', 'Murojaah', 'Sabqi', 'Manzil'];
        const fromSantri = Array.from(new Set((setoranHarian || [])
            .filter(sh => isMatchSantri(sh.santri_id))
            .map(sh => sh.skema?.trim())
            .filter(Boolean)));
        return Array.from(new Set([...fromSettings, ...fromSantri]));
    }, [appSettings, setoranHarian, isMatchSantri]);

    // 4. Aggregated Setoran & Attendance Stats in Selected Period
    const skemaPeriodStats = useMemo(() => {
        let periodSetoran = (setoranHarian || []).filter(sh => {
            return isMatchSantri(sh.santri_id);
        });

        if (pStart) {
            periodSetoran = periodSetoran.filter(sh => normDate(sh.tanggal) >= normDate(pStart));
        }
        if (pEnd) {
            periodSetoran = periodSetoran.filter(sh => normDate(sh.tanggal) <= normDate(pEnd));
        }

        return availableSkemas.map(skema => {
            const matches = periodSetoran.filter(sh => (sh.skema || '').toLowerCase().trim() === skema.toLowerCase().trim());
            const frekuensi = matches.length;
            // Fase 3: setoran Rasib (diulang) tidak dihitung sebagai halaman yang dicapai
            const totalHalaman = matches.reduce((sum, item) => sum + ((item as any).is_repeat ? 0 : (Number(item.jumlah_halaman) || 0)), 0);
            const totalNilaiNumber = matches.reduce((sum, item) => {
                let n = Number(item.nilai);
                if (isNaN(n) && item.nilai) {
                    const found = nilaiRanges.find(r => r.label.toLowerCase() === item.nilai.toLowerCase());
                    if (found) n = found.min;
                }
                return sum + (isNaN(n) ? 0 : n);
            }, 0);

            const avgScore = frekuensi > 0 ? (totalNilaiNumber / frekuensi) : 0;
            const predikat = nilaiRanges.find(r => avgScore >= r.min) || nilaiRanges[nilaiRanges.length - 1];
            const finalNilaiLabel = frekuensi > 0 ? (predikat ? predikat.label : '-') : '-';

            const amountStr = (skema.toLowerCase() === 'ziyadah' || skema.toLowerCase() === 'murojaah')
                ? `${totalHalaman} Halaman`
                : `${totalHalaman} Hal`;

            return {
                skema,
                frekuensi,
                totalHalaman,
                amountStr,
                avgScore,
                finalNilaiLabel
            };
        });
    }, [setoranHarian, isMatchSantri, pStart, pEnd, availableSkemas, nilaiRanges]);

    const kedisiplinanStats = useMemo(() => {
        let periodAtt = (attendance || []).filter(a => {
            const pId = a.personId ?? (a as any).person_id;
            const roleVal = a.peran ?? (a as any).role;
            const isSantri = !roleVal || roleVal === 'Santri' || roleVal === 'santri';
            return isSantri && isMatchSantri(pId, a.nama);
        });
        if (pStart) periodAtt = periodAtt.filter(a => normDate(a.date) >= normDate(pStart));
        if (pEnd) periodAtt = periodAtt.filter(a => normDate(a.date) <= normDate(pEnd));

        const hadirAtt = periodAtt.filter(a => a.status === 'Hadir' || a.status === 'Terlambat').length;
        
        const targetHalaqahId = activeHalaqahInfo?.halaqahId || (santri as any).halaqah_id;
        let totalSesi = periodAtt.length;
        
        if (targetHalaqahId) {
            const halaqahAtt = (attendance || []).filter(a => {
                const hId = a.halaqahId ?? (a as any).halaqah_id;
                const roleVal = a.peran ?? (a as any).role;
                const notMusammi = roleVal !== 'Musammi' && roleVal !== 'musammi';
                const dateMatch = (!pStart || normDate(a.date) >= normDate(pStart)) && (!pEnd || normDate(a.date) <= normDate(pEnd));
                return Number(hId) === Number(targetHalaqahId) && notMusammi && dateMatch;
            });
            const uniqueDates = new Set(halaqahAtt.map(a => `${normDate(a.date)}_${a.waktu || ''}`));
            if (uniqueDates.size > 0) {
                totalSesi = uniqueDates.size;
            }
        }

        let periodSetoran = (setoranHarian || []).filter(sh => isMatchSantri(sh.santri_id));
        if (pStart) periodSetoran = periodSetoran.filter(sh => normDate(sh.tanggal) >= normDate(pStart));
        if (pEnd) periodSetoran = periodSetoran.filter(sh => normDate(sh.tanggal) <= normDate(pEnd));

        const totalSetoran = periodSetoran.length;
        const persentaseKehadiran = totalSesi > 0 ? (hadirAtt / totalSesi) * 100 : 0;
        const rasioSetoranSesi = totalSesi > 0 ? (totalSetoran / totalSesi).toFixed(2) : (totalSetoran > 0 ? `${totalSetoran}` : '0');

        return {
            totalSesi,
            totalSetoran,
            hadirAtt,
            persentaseKehadiran,
            rasioSetoranSesi
        };
    }, [attendance, setoranHarian, isMatchSantri, pStart, pEnd, activeHalaqahInfo?.halaqahId, (santri as any).halaqah_id]);

    // Responsive grid column class for "Poin Penilaian & Evaluasi"
    const categoryGridColsClass = useMemo(() => {
        const len = allCategories.length;
        if (len <= 1) return 'grid-cols-1';
        if (len === 2) return 'grid-cols-1 sm:grid-cols-2';
        if (len === 3) return 'grid-cols-1 sm:grid-cols-3';
        if (len === 4) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4';
        if (len === 5) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-5';
        if (len === 6) return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    }, [allCategories.length]);

    // --- CHART SECTION: Grafik Indeks Perkembangan & Capaian Terpadu ---
    const chronologicalPeriods = useMemo(() => {
        return [...periods].sort((a, b) => {
            const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
            const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
            if (dateA !== dateB) return dateA - dateB;
            return a.id.localeCompare(b.id);
        });
    }, [periods]);

    const chartMetrics = useMemo(() => {
        const list: {
            id: string;
            label: string;
            color: string;
            unit: string;
            type: 'hafalan' | 'murojaah' | 'eval';
        }[] = [
            { id: 'hafalan', label: 'Total Hafalan', color: '#10B981', unit: 'Juz', type: 'hafalan' },
            { id: 'murojaah', label: 'Murojaah', color: '#F59E0B', unit: 'Juz', type: 'murojaah' },
        ];

        const palette = ['#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6', '#F43F5E'];
        allCategories.forEach((cat, idx) => {
            const cleanTitle = cat.replace(/^Persentase\s+/i, '');
            const color = evalColors[cleanTitle] || evalColors[cat] || palette[idx % palette.length];
            list.push({
                id: `eval_${cat}`,
                label: cleanTitle,
                color: color,
                unit: '%',
                type: 'eval'
            });
        });

        return list;
    }, [allCategories, evalColors]);

    const [activeChartMetrics, setActiveChartMetrics] = useState<Record<string, boolean>>({});
    const [isChartMenuOpen, setIsChartMenuOpen] = useState(false);
    const [isChartMetricMenuOpen, setIsChartMetricMenuOpen] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const chartMenuRef = useRef<HTMLDivElement>(null);
    const chartMetricMenuRef = useRef<HTMLDivElement>(null);

    const effectiveActiveMetrics = useMemo(() => {
        const res: Record<string, boolean> = {};
        chartMetrics.forEach(m => {
            res[m.id] = activeChartMetrics[m.id] !== undefined ? activeChartMetrics[m.id] : true;
        });
        return res;
    }, [chartMetrics, activeChartMetrics]);

    const activeChartCount = useMemo(() => {
        return chartMetrics.filter(m => effectiveActiveMetrics[m.id]).length;
    }, [chartMetrics, effectiveActiveMetrics]);

    const allChartActive = useMemo(() => {
        return chartMetrics.every(m => effectiveActiveMetrics[m.id]);
    }, [chartMetrics, effectiveActiveMetrics]);

    const toggleChartMetric = (id: string) => {
        setActiveChartMetrics(prev => ({
            ...prev,
            [id]: prev[id] !== undefined ? !prev[id] : false
        }));
    };

    const toggleAllChartMetrics = () => {
        const nextState = !allChartActive;
        const newMap: Record<string, boolean> = {};
        chartMetrics.forEach(m => {
            newMap[m.id] = nextState;
        });
        setActiveChartMetrics(newMap);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chartMenuRef.current && !chartMenuRef.current.contains(event.target as Node)) {
                setIsChartMenuOpen(false);
            }
            if (chartMetricMenuRef.current && !chartMetricMenuRef.current.contains(event.target as Node)) {
                setIsChartMetricMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDownloadChart = async () => {
        if (chartRef.current) {
            try {
                const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
                const url = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.download = `Grafik_Perkembangan_${santri.nama.replace(/\s+/g, '_')}.png`;
                link.href = url;
                link.click();
            } catch (err) {
                console.error("Error downloading chart", err);
            }
        }
        setIsChartMenuOpen(false);
    };

    const santriChartData = useMemo(() => {
        return chronologicalPeriods.map(p => {
            const periodKey = p.id;

            // 1. Total Hafalan
            let hDepan = 0;
            let hBelakang = 0;
            let hExplicit = 0;

            if (periodKey === selectedPeriod && localProgress[santri.id]) {
                hDepan = parseFloat(localProgress[santri.id]['Hafalan Depan'] ?? '0') || 0;
                hBelakang = parseFloat(localProgress[santri.id]['Hafalan Belakang'] ?? '0') || 0;
                hExplicit = parseFloat(localProgress[santri.id]['Total Hafalan'] ?? '0') || 0;
            } else {
                const pDepan = studentProgress.find(sp => isMatchSantri(sp.santri_id) && sp.month_key === periodKey && sp.progress_type === 'Hafalan Depan');
                const pBelakang = studentProgress.find(sp => isMatchSantri(sp.santri_id) && sp.month_key === periodKey && sp.progress_type === 'Hafalan Belakang');
                const pExplicit = studentProgress.find(sp => isMatchSantri(sp.santri_id) && sp.month_key === periodKey && sp.progress_type === 'Total Hafalan');
                hDepan = parseFloat(pDepan?.value ?? '0') || 0;
                hBelakang = parseFloat(pBelakang?.value ?? '0') || 0;
                hExplicit = parseFloat(pExplicit?.value ?? '0') || 0;
            }

            const finalHafalan = (hDepan === 0 && hBelakang === 0 && hExplicit > 0) ? hExplicit : (hDepan + hBelakang);
            const tHafalan = studentTarget?.target_hafalan || 0;
            const pctHafalan = tHafalan > 0 
                ? Math.min(100, Math.max(0, (finalHafalan / tHafalan) * 100))
                : (finalHafalan > 0 ? 100 : 0);

            // 2. Murojaah
            let mVal = 0;
            if (periodKey === selectedPeriod && localProgress[santri.id]?.['Murojaah'] !== undefined) {
                mVal = parseFloat(localProgress[santri.id]['Murojaah']) || 0;
            } else {
                const pMurojaah = studentProgress.find(sp => isMatchSantri(sp.santri_id) && sp.month_key === periodKey && sp.progress_type === 'Murojaah');
                mVal = parseFloat(pMurojaah?.value ?? '0') || 0;
            }

            let tMurojaah = 0;
            const murojaahSetting = appSettings.find((s) => s.key === 'TARGET_MUROJAAH_GLOBAL');
            if (murojaahSetting && murojaahSetting.value) {
                try {
                    const parsed = JSON.parse(murojaahSetting.value);
                    const marhalahKey = Object.keys(parsed).find(k => k.toLowerCase().trim() === (santri.marhalah || '').toLowerCase().trim());
                    const rules = parsed[santri.marhalah] || (marhalahKey ? parsed[marhalahKey] : []) || [];
                    if (Array.isArray(rules)) {
                        const sortedRules = [...rules].sort((a, b) => (b.min_capaian || 0) - (a.min_capaian || 0));
                        const matchedRule = sortedRules.find((r) => finalHafalan >= (r.min_capaian || 0));
                        if (matchedRule) {
                            tMurojaah = matchedRule.target || 0;
                        }
                    }
                } catch (e) {}
            }
            if (tMurojaah === 0 && studentTarget?.target_murojaah) {
                tMurojaah = studentTarget.target_murojaah;
            }

            const pctMurojaah = tMurojaah > 0 
                ? Math.min(100, Math.max(0, (mVal / tMurojaah) * 100)) 
                : (mVal > 0 ? 100 : 0);

            const row: any = {
                name: p.name || p.id,
                periodId: periodKey,
                hafalan: parseFloat(pctHafalan.toFixed(1)),
                hafalan_raw: parseFloat(finalHafalan.toFixed(2)),
                hafalan_target: parseFloat(tHafalan.toFixed(2)),
                murojaah: parseFloat(pctMurojaah.toFixed(1)),
                murojaah_raw: parseFloat(mVal.toFixed(2)),
                murojaah_target: parseFloat(tMurojaah.toFixed(2)),
            };

            // 3. Dynamic Evaluation Categories
            allCategories.forEach(cat => {
                let val: string | undefined = undefined;
                if (periodKey === selectedPeriod && localProgress[santri.id]?.[cat]) {
                    val = localProgress[santri.id][cat];
                } else {
                    const prog = studentProgress.find(sp => isMatchSantri(sp.santri_id) && sp.month_key === periodKey && sp.progress_type === cat);
                    if (prog?.value) {
                        val = prog.value;
                    } else {
                        const ev = studentEvaluations.find(se => isMatchSantri(se.santri_id) && se.month_key === periodKey);
                        if (ev) {
                            if (cat === 'Hafalan') val = ev.kualitas_hafalan;
                            else if (cat === 'Bacaan') val = ev.kualitas_bacaan;
                            else if (cat === 'Sikap') val = ev.sikap_prilaku;
                        }
                    }
                }

                if (val && val !== '-' && val !== '') {
                    const options = getOptions(cat);
                    const opt = options.find(o => o.label.toLowerCase().trim() === val!.toLowerCase().trim());
                    let score: number | undefined = opt?.score;
                    if (score === undefined || score === 0) {
                        const lower = val.toLowerCase();
                        if (lower.includes('mumtaz')) score = 95;
                        else if (lower.includes('jayyid jiddan')) score = 85;
                        else if (lower.includes('jayyid')) score = 75;
                        else if (lower.includes('maqbul')) score = 65;
                        else if (lower.includes('dhaif')) score = 50;
                        else {
                            const optIdx = options.findIndex(o => o.label.toLowerCase().trim() === val!.toLowerCase().trim());
                            if (optIdx !== -1 && options.length > 1) {
                                score = 100 - (optIdx / (options.length - 1)) * 50;
                            } else {
                                score = 80;
                            }
                        }
                    }
                    row[`eval_${cat}`] = parseFloat(score.toFixed(1));
                    row[`eval_${cat}_label`] = val;
                } else {
                    row[`eval_${cat}`] = null;
                    row[`eval_${cat}_label`] = null;
                }
            });

            return row;
        });
    }, [chronologicalPeriods, selectedPeriod, localProgress, santri.id, santri.marhalah, studentProgress, isMatchSantri, studentTarget, appSettings, allCategories, getOptions, studentEvaluations]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const dataPoint = payload[0]?.payload;

        return (
            <div className="bg-white rounded-2xl p-4 shadow-xl border border-slate-200/80 text-xs min-w-[260px] z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="font-extrabold text-slate-900 border-b border-slate-100 pb-2 mb-2.5 text-sm flex items-center justify-between">
                    <span>{label}</span>
                    <span className="text-2xs font-semibold text-slate-400">Indeks Capaian</span>
                </div>
                <div className="space-y-2">
                    {payload
                        .filter((p) => p.dataKey !== 'target_line')
                        .map((p) => {
                            const m = chartMetrics.find(x => x.id === p.dataKey);
                            if (!m) return null;

                            let realValueStr = '';
                            if (m.type === 'hafalan') {
                                const raw = dataPoint?.hafalan_raw;
                                const tgt = dataPoint?.hafalan_target;
                                realValueStr = tgt > 0 ? `(${raw} / ${tgt} Juz)` : `(${raw} Juz)`;
                            } else if (m.type === 'murojaah') {
                                const raw = dataPoint?.murojaah_raw;
                                const tgt = dataPoint?.murojaah_target;
                                realValueStr = tgt > 0 ? `(${raw} / ${tgt} Juz)` : `(${raw} Juz)`;
                            } else if (m.type === 'eval') {
                                const lbl = dataPoint?.[`${m.id}_label`];
                                realValueStr = lbl ? `(${lbl})` : '';
                            }

                            return (
                                <div key={m.id} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: m.color }} />
                                        <span>{m.label}:</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-extrabold text-slate-900">
                                            {p.value !== null && p.value !== undefined ? `${p.value}%` : '-'}
                                        </span>
                                        {realValueStr && (
                                            <span className="text-2xs text-slate-500 font-medium ml-1.5">
                                                {realValueStr}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>
        );
    };

    // 5. Table State & Filtered Setoran List
    const [tablePeriodFilter, setTablePeriodFilter] = useState('all');
    const [tableSkemaFilter, setTableSkemaFilter] = useState('all');

    const tableSetoranList = useMemo(() => {
        let list = (setoranHarian || []).filter(sh => isMatchSantri(sh.santri_id));

        // Filter by Period
        if (tablePeriodFilter !== 'all') {
            const pObj = periods.find(p => p.id === tablePeriodFilter);
            let start = pObj?.startDate || (pObj as any)?.start_date || '';
            let end = pObj?.endDate || (pObj as any)?.end_date || '';

            if (!start || !end) {
                if (tablePeriodFilter.match(/^\d{4}-\d{2}$/)) {
                    start = `${tablePeriodFilter}-01`;
                    end = `${tablePeriodFilter}-31`;
                } else if (tablePeriodFilter.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    const [d, m, y] = tablePeriodFilter.split('-');
                    start = `${y}-${m}-01`;
                    end = `${y}-${m}-31`;
                }
            }

            if (start) list = list.filter(sh => normDate(sh.tanggal) >= normDate(start));
            if (end) list = list.filter(sh => normDate(sh.tanggal) <= normDate(end));
        }

        // Filter by Skema
        if (tableSkemaFilter !== 'all') {
            const lowerFilter = tableSkemaFilter.toLowerCase().trim();
            list = list.filter(sh => {
                const s = (sh.skema || '').toLowerCase().trim();
                return s === lowerFilter || s.includes(lowerFilter);
            });
        }

        return [...list].sort((a, b) => {
            const dateCmp = (b.tanggal || '').localeCompare(a.tanggal || '');
            if (dateCmp !== 0) return dateCmp;
            return (b.id || 0) - (a.id || 0);
        });
    }, [setoranHarian, isMatchSantri, tablePeriodFilter, tableSkemaFilter, periods]);
  return { santri, selectedPeriod, onPeriodChange, periods, appSettings, halaqahList, studentProgress, localProgress, studentEvaluations, attendance, setoranHarian, allCategories, getOptions, evalColors, classTargets, onBack, normDate, formatDateDisplay, isMatchSantri, pStart, pEnd, getPeriodDateLabel, halaqahHistory, activeHalaqahInfo, progressMap, currentEval, hafalanDepanStr, hafalanDepan, suratAyatDepan, hafalanBelakangStr, hafalanBelakang, suratAyatBelakang, totalHafalanCalc, explicitTotalHafalanStr, totalHafalan, ziyadahStr, ziyadah, murojaahStr, murojaah, studentTarget, targetHafalan, pctHafalan, targetMurojaah, pctMurojaah, nilaiRanges, availableSkemas, skemaPeriodStats, kedisiplinanStats, categoryGridColsClass, chronologicalPeriods, chartMetrics, activeChartMetrics, setActiveChartMetrics, isChartMenuOpen, setIsChartMenuOpen, isChartMetricMenuOpen, setIsChartMetricMenuOpen, chartRef, chartMenuRef, chartMetricMenuRef, effectiveActiveMetrics, activeChartCount, allChartActive, toggleChartMetric, toggleAllChartMetrics, handleDownloadChart, santriChartData, CustomTooltip, tablePeriodFilter, setTablePeriodFilter, tableSkemaFilter, setTableSkemaFilter, tableSetoranList };
}

export type SantriDetailProgressViewLogika = ReturnType<typeof useSantriDetailProgressViewLogika>;
