import React, { useState, useMemo, useRef, useEffect } from 'react';
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

interface SantriDetailProgressViewProps {
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

export const SantriDetailProgressView: React.FC<SantriDetailProgressViewProps> = ({
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
}) => {
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
        const murojaahSetting = appSettings.find((s: any) => s.key === 'TARGET_MUROJAAH_GLOBAL');
        if (murojaahSetting && murojaahSetting.value) {
            try {
                const parsed = JSON.parse(murojaahSetting.value);
                const marhalahKey = Object.keys(parsed).find(k => k.toLowerCase().trim() === (santri.marhalah || '').toLowerCase().trim());
                const rules = parsed[santri.marhalah] || (marhalahKey ? parsed[marhalahKey] : []) || [];
                if (Array.isArray(rules)) {
                    const sortedRules = [...rules].sort((a: any, b: any) => (b.min_capaian || 0) - (a.min_capaian || 0));
                    const matchedRule = sortedRules.find((r: any) => totalHafalan >= (r.min_capaian || 0));
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
        const val = appSettings.find((s: any) => s.key === 'SETORAN_AUTO_RANGES')?.value;
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
        const fromSettings = (appSettings.find((s: any) => s.key === 'SETORAN_SKEMA_OPTIONS')?.value?.split(',') || ['Ziyadah', 'Murojaah', 'Sabqi', 'Manzil'])
            .map((s: string) => s.trim()).filter(Boolean);
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
            const totalHalaman = matches.reduce((sum, item) => sum + (Number(item.jumlah_halaman) || 0), 0);
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
            const murojaahSetting = appSettings.find((s: any) => s.key === 'TARGET_MUROJAAH_GLOBAL');
            if (murojaahSetting && murojaahSetting.value) {
                try {
                    const parsed = JSON.parse(murojaahSetting.value);
                    const marhalahKey = Object.keys(parsed).find(k => k.toLowerCase().trim() === (santri.marhalah || '').toLowerCase().trim());
                    const rules = parsed[santri.marhalah] || (marhalahKey ? parsed[marhalahKey] : []) || [];
                    if (Array.isArray(rules)) {
                        const sortedRules = [...rules].sort((a: any, b: any) => (b.min_capaian || 0) - (a.min_capaian || 0));
                        const matchedRule = sortedRules.find((r: any) => finalHafalan >= (r.min_capaian || 0));
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
                    <span className="text-[11px] font-semibold text-slate-400">Indeks Capaian</span>
                </div>
                <div className="space-y-2">
                    {payload
                        .filter((p: any) => p.dataKey !== 'target_line')
                        .map((p: any) => {
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
                                        <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: m.color }} />
                                        <span>{m.label}:</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-extrabold text-slate-900">
                                            {p.value !== null && p.value !== undefined ? `${p.value}%` : '-'}
                                        </span>
                                        {realValueStr && (
                                            <span className="text-[11px] text-slate-500 font-medium ml-1.5">
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

    return (
        <div className="w-full space-y-6 font-sans text-slate-800 antialiased">
            {/* Section 1: Biodata Santri (Paling Atas) */}
            <div className="w-full bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                    {santri.nama}
                </h1>
                <div className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                    <span>ID Santri: <strong className="font-bold text-slate-900">{santri.id}</strong></span>
                    <span className="text-slate-300 mx-2">•</span>
                    <span>NIS: <strong className="font-bold text-slate-900">{(santri as any).nis || (santri as any).nisn || santri.kode || '-'}</strong></span>
                    <span className="text-slate-300 mx-2">•</span>
                    <span>Marhalah: <strong className="font-bold text-slate-900"><MarhalahLabel text={santri.marhalah} id={santri.marhalah_id} /></strong></span>
                    <span className="text-slate-300 mx-2">•</span>
                    <span>Kelas: <strong className="font-bold text-slate-900"><KelasLabel text={santri.kelas} id={santri.kelas_id} /></strong></span>
                    <br />
                    <div className="mt-2 flex flex-wrap items-center">
                        <span>Halaqah Saat Ini: <strong className="font-bold text-blue-600">{activeHalaqahInfo?.halaqahNama || '-'}</strong></span>
                        <span className="text-slate-300 mx-2">•</span>
                        <span>Pengampu: <strong className="font-bold text-slate-900">{activeHalaqahInfo?.musammiNama || '-'}</strong></span>
                    </div>
                </div>
            </div>

            {/* Section 2: Grafik Indeks Perkembangan & Capaian Terpadu (Diatas Metrik Evaluasi Periode Ini) */}
            <div ref={chartRef} className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 relative flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex flex-col">
                        <h4 className="text-[15px] font-semibold text-slate-800 tracking-tight mb-1">
                            Grafik Indeks Perkembangan & Capaian Terpadu
                        </h4>
                    </div>
                    <div className="flex items-center gap-3 relative z-[100]" data-html2canvas-ignore="true">
                        {/* Dropdown Metric Filter with Checkboxes */}
                        <div className="relative" ref={chartMetricMenuRef}>
                            <button 
                                type="button"
                                onClick={() => setIsChartMetricMenuOpen(!isChartMetricMenuOpen)}
                                className="flex items-center gap-2 text-[13px] font-medium bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 focus:outline-none hover:bg-slate-50 transition-colors shadow-xs relative cursor-pointer"
                            >
                                <span>Pilih Metrik ({activeChartCount})</span>
                                <ChevronDown size={14} className="text-slate-400" />
                            </button>
                            {isChartMetricMenuOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12)] border border-slate-100 py-2 z-[9999] flex flex-col max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                    <div className="flex items-center justify-between px-3.5 py-1.5 mb-1 border-b border-slate-100 text-xs">
                                        <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Filter Metrik</span>
                                        <button
                                            type="button"
                                            onClick={toggleAllChartMetrics}
                                            className="font-bold text-blue-600 hover:text-blue-700 text-xs transition-colors cursor-pointer"
                                        >
                                            {allChartActive ? 'Kosongkan' : 'Pilih Semua'}
                                        </button>
                                    </div>
                                    {chartMetrics.map(m => {
                                        const isChecked = effectiveActiveMetrics[m.id];
                                        return (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => toggleChartMetric(m.id)}
                                                className="w-full text-left px-3.5 py-2 text-[13px] font-semibold hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                                                style={{ color: isChecked ? m.color : '#94a3b8' }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-3 h-3 rounded-[3px] flex-shrink-0 shadow-2xs" style={{ backgroundColor: isChecked ? m.color : '#cbd5e1' }} />
                                                    <span>{m.label}</span>
                                                </div>
                                                {isChecked ? (
                                                    <CheckSquare size={16} className="text-blue-600 flex-shrink-0" />
                                                ) : (
                                                    <Square size={16} className="text-slate-300 flex-shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Chart Download Menu */}
                        <div className="relative" ref={chartMenuRef}>
                            <button 
                                type="button"
                                onClick={() => setIsChartMenuOpen(!isChartMenuOpen)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors focus:outline-none cursor-pointer"
                                title="Opsi Grafik"
                            >
                                <MoreVertical size={18} />
                            </button>
                            {isChartMenuOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-slate-100 py-1.5 z-50">
                                    <button 
                                        type="button"
                                        onClick={handleDownloadChart}
                                        className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center transition-colors cursor-pointer"
                                    >
                                        <Download size={14} className="mr-2 text-slate-400"/> Download Chart
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Chart Area */}
                <div style={{ height: 340, minHeight: 340, width: '100%' }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={santriChartData} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                            <defs>
                                {chartMetrics.map(m => {
                                    const gradId = `santriGrad-${m.id.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '')}`;
                                    return (
                                        <linearGradient key={`gradient-${m.id}`} id={gradId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={m.color} stopOpacity={0.15}/>
                                            <stop offset="95%" stopColor={m.color} stopOpacity={0}/>
                                        </linearGradient>
                                    );
                                })}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} 
                                dy={10}
                            />
                            <YAxis 
                                domain={[0, 100]}
                                ticks={[0, 25, 50, 75, 100]}
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} 
                                dx={-5}
                                tickFormatter={(val) => `${val}%`}
                            />
                            <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} />
                            {/* Target 100% Reference Line */}
                            <Line 
                                type="linear"
                                dataKey={() => 100}
                                stroke="#e2e8f0"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                dot={false}
                                activeDot={false}
                                name="target_line"
                            />
                            {chartMetrics.map(m => {
                                if (!effectiveActiveMetrics[m.id]) return null;
                                const gradId = `santriGrad-${m.id.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '')}`;
                                return (
                                    <Area 
                                        key={m.id}
                                        type="monotone" 
                                        dataKey={m.id} 
                                        name={m.label}
                                        stroke={m.color} 
                                        strokeWidth={2.5}
                                        fillOpacity={1}
                                        fill={`url(#${gradId})`}
                                        dot={false}
                                        activeDot={{ r: 5, fill: m.color, stroke: "#ffffff", strokeWidth: 2 }} 
                                        connectNulls={true}
                                    />
                                );
                            })}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* Bottom Legend / Informasi Warna */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-3.5 pt-3 border-t border-slate-100/90 text-xs" data-html2canvas-ignore="false">
                    {chartMetrics.map(m => {
                        const isActive = effectiveActiveMetrics[m.id];
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => toggleChartMetric(m.id)}
                                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                                    isActive ? 'hover:opacity-80' : 'line-through opacity-40 hover:opacity-60'
                                }`}
                                style={{ color: isActive ? m.color : '#94a3b8' }}
                                title={`Klik untuk ${isActive ? 'sembunyikan' : 'tampilkan'} ${m.label}`}
                            >
                                <span 
                                    className="w-2.5 h-2.5 rounded-[2px] transition-transform flex-shrink-0 shadow-2xs" 
                                    style={{ backgroundColor: isActive ? m.color : '#cbd5e1' }}
                                />
                                <span>{m.label}</span>
                            </button>
                        );
                    })}
                    {/* Target line indicator */}
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-medium select-none ml-1">
                        <span className="w-3.5 h-0.5 border-b-[1.5px] border-dashed border-slate-300" />
                        <span>Target (100%)</span>
                    </div>
                </div>
            </div>

            {/* Section 3: Metrik Evaluasi Periode Ini */}
            <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900">
                        Metrik Evaluasi Periode Ini
                    </h2>
                    {/* Clickable Date Range Dropdown for Evaluation Period */}
                    {periods.length > 0 && onPeriodChange ? (
                        <div className="relative inline-flex items-center">
                            <select
                                value={selectedPeriod}
                                onChange={e => onPeriodChange(e.target.value)}
                                className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 text-slate-700 font-semibold text-xs rounded-xl pl-3 pr-8 py-1.5 cursor-pointer shadow-2xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                title="Pilih Periode Evaluasi"
                            >
                                {periods.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {getPeriodDateLabel(p)}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute right-2.5 text-slate-400">
                                <ChevronDown size={14} />
                            </div>
                        </div>
                    ) : (
                        pStart && pEnd && (
                            <div className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-lg">
                                {formatDateDisplay(pStart)} – {formatDateDisplay(pEnd)}
                            </div>
                        )
                    )}
                </div>

                {/* 3 Main Cards: Total Hafalan, Murojaah, Ziyadah */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                    {/* Card 1: Total Hafalan */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                Total Hafalan
                            </span>
                            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {totalHafalan} <span className="text-sm font-semibold text-slate-500">Juz</span>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-200/60 text-xs text-slate-600 space-y-1.5 font-medium">
                                <div className="flex justify-between">
                                    <span>Hafalan Depan:</span>
                                    <strong className="text-slate-900">{hafalanDepan} Juz {suratAyatDepan !== '-' ? `(${suratAyatDepan})` : ''}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span>Hafalan Belakang:</span>
                                    <strong className="text-slate-900">{hafalanBelakang} Juz {suratAyatBelakang !== '-' ? `(${suratAyatBelakang})` : ''}</strong>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                    <span>Target Marhalah:</span>
                                    <span>{targetHafalan} Juz</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-slate-200/60">
                            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-blue-600 rounded-full transition-all" 
                                    style={{ width: `${Math.min(100, Math.max(0, pctHafalan))}%` }}
                                />
                            </div>
                            <div className="text-right text-xs font-bold text-slate-700 mt-1.5">
                                {pctHafalan.toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Murojaah */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                Murojaah
                            </span>
                            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {murojaah} <span className="text-sm font-semibold text-slate-500">Juz</span>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-200/60 text-xs text-slate-500 leading-relaxed font-medium">
                                <div className="flex justify-between mb-1.5 text-slate-600">
                                    <span>Target Murojaah:</span>
                                    <strong className="text-slate-900">{targetMurojaah > 0 ? `${targetMurojaah} Juz` : '-'}</strong>
                                </div>
                                <p>Capaian pengulangan hafalan santri terhadap target murojaah pada periode berjalan.</p>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-slate-200/60">
                            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-emerald-600 rounded-full transition-all" 
                                    style={{ width: `${Math.min(100, Math.max(0, pctMurojaah))}%` }}
                                />
                            </div>
                            <div className="text-right text-xs font-bold text-slate-700 mt-1.5">
                                {pctMurojaah.toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Ziyadah */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                Ziyadah (Penambahan Hafalan)
                            </span>
                            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                {ziyadah} <span className="text-sm font-semibold text-slate-500">Halaman</span>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-200/60 text-xs text-slate-500 leading-relaxed font-medium">
                                <p>Jumlah penambahan hafalan ayat baru yang berhasil disetorkan dan dievaluasi pada periode ini.</p>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-slate-200/60">
                            <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
                                <span>Status Capaian</span>
                                <span className="text-blue-600 font-bold">{ziyadah > 0 ? 'Tercatat' : '-'}</span>
                            </div>
                            <div className="text-right text-xs font-bold text-slate-400 mt-1.5 invisible select-none">
                                0%
                            </div>
                        </div>
                    </div>
                </div>

                {/* Poin Penilaian & Evaluasi (Kuesioner Dinamis) */}
                {allCategories.length > 0 && (
                    <div className="pt-2">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
                            Poin Penilaian & Evaluasi
                        </h3>
                        <div className={`grid ${categoryGridColsClass} gap-4 w-full`}>
                            {allCategories.map(c => {
                                const dbProgressVal = progressMap.get(c);
                                const dbEvalVal = c === 'Hafalan' ? currentEval?.kualitas_hafalan 
                                    : c === 'Bacaan' ? currentEval?.kualitas_bacaan 
                                    : c === 'Sikap' ? currentEval?.sikap_prilaku 
                                    : undefined;
                                const val = localProgress[santri.id]?.[c] ?? dbProgressVal ?? dbEvalVal ?? '-';
                                const colorHex = evalColors[val] || getOptions(c).find(o => o.label === val)?.color;

                                return (
                                    <div key={c} className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition-all flex flex-col justify-between shadow-2xs h-full min-h-[120px] w-full">
                                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 leading-snug break-words">
                                            {c}
                                        </div>
                                        <div className="flex items-center justify-between mt-auto pt-2">
                                            {val !== '-' && colorHex ? (
                                                <span 
                                                    className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-extrabold border transition-colors shadow-2xs"
                                                    style={{ 
                                                        backgroundColor: colorHex + '18', 
                                                        color: colorHex,
                                                        borderColor: colorHex + '40'
                                                    }}
                                                >
                                                    {val}
                                                </span>
                                            ) : (
                                                <span className="text-base font-extrabold text-slate-900">
                                                    {val !== '-' ? val : '-'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Catatan Evaluasi (Musammi, Muroqib, Lajnah) */}
                {(currentEval?.catatan_musammi || currentEval?.catatan_muroqib || currentEval?.catatan_lajnah) && (
                    <div className="border-t border-slate-100 pt-5">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                            Catatan & Masukan Evaluator
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {currentEval?.catatan_musammi && (
                                <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 text-xs">
                                    <span className="font-bold text-blue-700 block mb-1.5">Catatan Musammi:</span>
                                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{currentEval.catatan_musammi}</p>
                                </div>
                            )}
                            {currentEval?.catatan_muroqib && (
                                <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 text-xs">
                                    <span className="font-bold text-emerald-700 block mb-1.5">Catatan Muroqib:</span>
                                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{currentEval.catatan_muroqib}</p>
                                </div>
                            )}
                            {currentEval?.catatan_lajnah && (
                                <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 text-xs">
                                    <span className="font-bold text-purple-700 block mb-1.5">Catatan Lajnah:</span>
                                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{currentEval.catatan_lajnah}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Section 4: Ringkasan Capaian, Kelancaran & Kedisiplinan */}
            <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
                <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-base font-bold text-slate-900">
                        Statistik Setoran & Kedisiplinan Periode Ini
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Agregat aktivitas setoran dan kedisiplinan santri pada rentang tanggal evaluasi terpilih.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Card 1: Frekuensi & Volume Setoran */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Frekuensi & Volume Setoran
                                </span>
                            </div>
                            <div className="space-y-3">
                                {skemaPeriodStats.map(s => (
                                    <div key={s.skema} className="flex items-center justify-between py-1.5 border-b border-slate-200/40 last:border-0 text-xs">
                                        <span className="font-bold text-slate-700">{s.skema}:</span>
                                        <span className="font-semibold text-slate-900">
                                            {s.amountStr}, <span className="text-blue-600 font-bold">{s.frekuensi} kali</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400 font-medium">
                            Total Seluruh: {skemaPeriodStats.reduce((acc, s) => acc + s.frekuensi, 0)} kali setoran
                        </div>
                    </div>

                    {/* Card 2: Persentase Kelancaran & Nilai Rata-rata */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Persentase Kelancaran & Nilai Rata-rata
                                </span>
                            </div>
                            <div className="space-y-3">
                                {skemaPeriodStats.map(s => (
                                    <div key={s.skema} className="flex items-center justify-between py-1.5 border-b border-slate-200/40 last:border-0 text-xs">
                                        <span className="font-bold text-slate-700">{s.skema}:</span>
                                        <span className="font-semibold text-slate-900">
                                            {s.avgScore > 0 ? `${s.avgScore.toFixed(1)}%` : '-'},{' '}
                                            <span className="font-bold text-emerald-700">{s.finalNilaiLabel}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400 font-medium">
                            Rata-rata kelancaran & predikat nilai per skema
                        </div>
                    </div>

                    {/* Card 3: Kedisiplinan */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Kedisiplinan
                                </span>
                            </div>
                            <div className="space-y-3 text-xs">
                                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/40">
                                    <span className="font-medium text-slate-600">Total Sesi Berjalan:</span>
                                    <span className="font-bold text-slate-900">{kedisiplinanStats.totalSesi} sesi</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/40">
                                    <span className="font-medium text-slate-600">Total Setoran:</span>
                                    <span className="font-bold text-blue-600">{kedisiplinanStats.totalSetoran} setoran</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/40">
                                    <span className="font-medium text-slate-600">Persentase Kehadiran:</span>
                                    <span className="font-bold text-slate-900">
                                        {kedisiplinanStats.persentaseKehadiran.toFixed(1)}%{' '}
                                        <span className="text-[11px] text-slate-400 font-normal">
                                            ({kedisiplinanStats.hadirAtt} hadir/terlambat{kedisiplinanStats.totalSesi > 0 ? ` dari ${kedisiplinanStats.totalSesi} sesi` : ''})
                                        </span>
                                    </span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                    <span className="font-medium text-slate-600">Rasio Setoran : Sesi:</span>
                                    <span className="font-bold text-slate-900">{kedisiplinanStats.rasioSetoranSesi}x</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-400 font-medium">
                            Tingkat komitmen dan keaktifan hadir serta menyetor
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 5: Tabel Riwayat Setoran Harian */}
            <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900">
                        Riwayat Setoran Harian
                    </h2>

                    {/* Filter Controls: Periode & Skema */}
                    <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                        {/* Filter Periode */}
                        <select
                            value={tablePeriodFilter}
                            onChange={e => setTablePeriodFilter(e.target.value)}
                            className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-2xs"
                            title="Filter Periode"
                        >
                            <option value="all">Semua Periode</option>
                            {periods.map(p => (
                                <option key={p.id} value={p.id}>{p.name || p.id}</option>
                            ))}
                        </select>

                        {/* Filter Skema */}
                        <select
                            value={tableSkemaFilter}
                            onChange={e => setTableSkemaFilter(e.target.value)}
                            className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer shadow-2xs"
                            title="Filter Skema"
                        >
                            <option value="all">Semua Skema</option>
                            {availableSkemas.map(sk => (
                                <option key={sk} value={sk}>{sk}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Table with Clean Empty State */}
                {tableSetoranList.length === 0 ? (
                    <div className="py-10 text-center border border-slate-100 border-dashed rounded-xl">
                        <p className="text-xs font-semibold text-slate-500">Belum ada riwayat setoran</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                                <tr>
                                    <th className="px-4 py-3.5 w-12 text-center">No</th>
                                    <th className="px-4 py-3.5">Tanggal</th>
                                    <th className="px-4 py-3.5">Waktu</th>
                                    <th className="px-4 py-3.5">Skema</th>
                                    <th className="px-4 py-3.5 min-w-[180px]">Surat & Ayat</th>
                                    <th className="px-4 py-3.5 text-center">Jml Hal</th>
                                    <th className="px-4 py-3.5 text-center">Nilai</th>
                                    <th className="px-4 py-3.5 text-center">Kesalahan</th>
                                    <th className="px-4 py-3.5 min-w-[160px]">Keterangan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {tableSetoranList.map((sh, idx) => (
                                    <tr key={sh.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-4 py-3.5 text-center text-slate-400 font-medium">
                                            {idx + 1}
                                        </td>
                                        <td className="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                                            {formatDateDisplay(sh.tanggal)}
                                        </td>
                                        <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap font-medium">
                                            {sh.waktu || '-'}
                                        </td>
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            <span className="font-bold text-blue-600">
                                                {sh.skema || '-'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-slate-900 font-semibold">
                                            {sh.surat || '-'}
                                            {sh.ayat && (
                                                <span className="text-slate-500 font-normal ml-1">
                                                    (Ayat {sh.ayat})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                                            {sh.jumlah_halaman ?? '-'}
                                        </td>
                                        <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                                            {sh.nilai || '-'}
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-slate-600 font-semibold">
                                            <span className="text-rose-600">K:{sh.kesalahan_kabir || 0}</span>
                                            <span className="text-slate-300 mx-1.5">•</span>
                                            <span className="text-amber-600">S:{sh.kesalahan_shoghir || 0}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-slate-500 text-[11px] truncate max-w-[220px]" title={sh.keterangan || ''}>
                                            {sh.keterangan || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Table Footer */}
                <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 font-medium">
                    <span>
                        Menampilkan {tableSetoranList.length} catatan setoran
                    </span>
                </div>
            </div>

            {/* Section 6: Riwayat Penempatan Halaqah & Pengampu (Paling Bawah) */}
            <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                    Riwayat Penempatan Halaqah & Pengampu
                </h2>

                {halaqahHistory.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                        Belum ada riwayat halaqah yang tercatat untuk santri ini.
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[185px] border border-slate-200/80 rounded-xl relative shadow-2xs">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px] shadow-xs">
                                <tr>
                                    <th className="px-5 py-3">Nama Halaqah</th>
                                    <th className="px-5 py-3">Jenis Halaqah</th>
                                    <th className="px-5 py-3">Pengampu / Musammi</th>
                                    <th className="px-5 py-3">Periode Keanggotaan</th>
                                    <th className="px-5 py-3 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {halaqahHistory.map((h, i) => (
                                    <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5 font-bold text-slate-800">
                                            {h.halaqahNama}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600 font-medium">
                                            {h.jenis || '-'}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-700 font-medium">
                                            {h.musammiNama}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600 font-medium">
                                            {formatDateDisplay(h.startDate)}
                                            <span className="text-slate-300 mx-1.5">–</span>
                                            {h.endDate ? formatDateDisplay(h.endDate) : (
                                                <span className="text-emerald-600 font-semibold">Sekarang</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-medium">
                                            {h.isCurrent ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Aktif
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-slate-500 bg-slate-100">
                                                    Selesai
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bottom Actions: Tombol Kembali ke Evaluasi di Pojok Kiri Bawah */}
            <div className="pt-2 flex items-center justify-start">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-bold text-xs shadow-sm transition-all cursor-pointer"
                >
                    <ArrowLeft size={16} />
                    <span>Kembali ke Evaluasi</span>
                </button>
            </div>
        </div>
    );
};

export default SantriDetailProgressView;
