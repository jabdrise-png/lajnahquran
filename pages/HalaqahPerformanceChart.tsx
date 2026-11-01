import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';
import { MoreVertical, Download, Eye, ChevronDown, CheckSquare, Square } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getEvaluationPeriods } from '../lib/utils';
import { useAcademicYear } from '../lib/AcademicYearContext';



const PortalTooltip = ({ active, payload, label }: any) => {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setPos({ x: e.clientX, y: e.clientY });
        };
        if (active) {
            window.addEventListener('mousemove', handleMouseMove);
        }
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [active]);

    if (!active || !payload || !payload.length) return null;

    const content = (
        <div 
            style={{ 
                position: 'fixed', 
                left: pos.x + 15, 
                top: pos.y + 15, 
                zIndex: 999999, 
                pointerEvents: 'none'
            }}
            className="bg-white/95 backdrop-blur-md border border-slate-100 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] rounded-xl p-3 min-w-[150px]"
        >
            <p className="font-semibold text-slate-800 mb-2 border-b border-slate-100 pb-2 text-[13px]">{label}</p>
            <div className="flex flex-col gap-1.5">
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4 text-[12px]">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-slate-600">{entry.name === 'Performa' ? 'Performa Umum' : entry.name}</span>
                        </div>
                        <span className="font-medium text-slate-800">{entry.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

export const HalaqahPerformanceChart = ({ studentProgress, halaqah, halaqahEvaluations = [], filteredSantri, availableMonths, classTargets, evaluationSettings, appSettings, filterMonth, attendance, filterHalaqah = 'all', filterMarhalah = 'all' }: any) => {
    const { selectedAcademicYear } = useAcademicYear();
    const activeSem = selectedAcademicYear?.active_semester || 'Ganjil';
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['global']);
    const [isMetricMenuOpen, setIsMetricMenuOpen] = useState(false);
    const metricMenuRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
            if (metricMenuRef.current && !metricMenuRef.current.contains(event.target as Node)) {
                setIsMetricMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDownload = async () => {
        if (chartRef.current) {
            try {
                const originalStyle = chartRef.current.style.cssText;
                const scrollContainer = chartRef.current.querySelector('#chart-container-portal');
                const scrollOriginalStyle = scrollContainer ? (scrollContainer as HTMLElement).style.cssText : '';
                
                const currentChartWidth = Math.max(1000, chartData.length * 80);
                
                // Temporarily expand to full width to capture the entire chart
                chartRef.current.style.width = `${currentChartWidth + 60}px`;
                chartRef.current.style.maxWidth = 'none';
                if (scrollContainer) {
                    (scrollContainer as HTMLElement).style.overflowX = 'visible';
                }
                
                // Wait a tick for styles to apply
                await new Promise(r => setTimeout(r, 100));

                const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2, windowWidth: currentChartWidth + 60 });
                const url = canvas.toDataURL("image/png");
                
                // Restore styles
                chartRef.current.style.cssText = originalStyle;
                if (scrollContainer) {
                    (scrollContainer as HTMLElement).style.cssText = scrollOriginalStyle;
                }

                const link = document.createElement('a');
                link.download = `Performa_Halaqah.png`;
                link.href = url;
                link.click();
            } catch (err) {
                console.error("Error downloading chart", err);
                
                // Ensure styles are restored on error
                if (chartRef.current) {
                    chartRef.current.style.width = '';
                    chartRef.current.style.maxWidth = '';
                    const scrollContainer = chartRef.current.querySelector('#chart-container-portal');
                    if (scrollContainer) (scrollContainer as HTMLElement).style.overflowX = 'auto';
                }
            }
        }
        setIsMenuOpen(false);
    };

    const chartData = useMemo(() => {
        const evalPeriods = getEvaluationPeriods(appSettings);
        // Build Murojaah Rules
        let murojaahRules: any = {};
        try {
            const setting = appSettings.find((s: any) => s.key === 'TARGET_MUROJAAH_GLOBAL');
            if (setting && setting.value) {
                const parsed = JSON.parse(setting.value);
                if (parsed.threshold_juz !== undefined) {
                    murojaahRules = {
                        "Mutawasithoh": [{ min_capaian: parsed.threshold_juz, target: parsed.target_above_juz }, { min_capaian: 0, target: parsed.target_below_juz }],
                        "Ulya": [{ min_capaian: parsed.threshold_juz, target: parsed.target_above_juz }, { min_capaian: 0, target: parsed.target_below_juz }]
                    };
                } else {
                    murojaahRules = parsed;
                }
            }
        } catch (e) { }

        // Find evaluation categories
        const evaluationCategories = Array.from(new Set(evaluationSettings.map((s: any) => s.category))) as string[];

        const normalizeDateStr = (d?: string | null): string | undefined => {
            if (!d || typeof d !== 'string' || d.trim() === '') return undefined;
            const trimmed = d.trim();
            if (trimmed.includes('/')) {
                const parts = trimmed.substring(0, 10).split('/');
                if (parts.length === 3 && parts[2].length === 4) {
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            return trimmed.substring(0, 10);
        };

        const getHalaqahStartDate = (hx: any): string | undefined => {
            const createdDate = normalizeDateStr(hx.created_at);
            const historyStarts = (hx.history || [])
                .map((hs: any) => normalizeDateStr(hs.start_date))
                .filter(Boolean) as string[];
            historyStarts.sort();
            const earliestHistoryStart = historyStarts.length > 0 ? historyStarts[0] : undefined;
            if (createdDate && earliestHistoryStart) {
                return earliestHistoryStart < createdDate ? earliestHistoryStart : createdDate;
            }
            return createdDate || earliestHistoryStart;
        };

        const getActiveHalaqahsForMonth = (monthKey: string) => {
            const periodObj = evalPeriods.find((p: any) => p.id === monthKey);
            const periodStart = normalizeDateStr(periodObj?.startDate) || (monthKey.match(/^\d{4}-\d{2}$/) ? `${monthKey}-01` : undefined);
            const periodEnd = normalizeDateStr(periodObj?.endDate) || (monthKey.match(/^\d{4}-\d{2}$/) ? `${monthKey}-31` : undefined);

            const evalHalaqahIdsInMonth = new Set<number>(
                (halaqahEvaluations || [])
                    .filter((e: any) => e.month_key === monthKey && e.halaqah_id)
                    .map((e: any) => Number(e.halaqah_id))
            );

            const baseFiltered = (halaqah || []).filter((hx: any) => {
                if (filterHalaqah && filterHalaqah !== 'all' && String(hx.id) !== String(filterHalaqah)) return false;
                if (filterMarhalah && filterMarhalah !== 'all' && hx.marhalah !== filterMarhalah) return false;
                return true;
            });

            // Currently active halaqahs that existed by the end of the selected period (or have explicit eval in this period)
            const currentlyActiveInPeriod = baseFiltered.filter((hx: any) => {
                if (hx.is_active === false) return false;
                if (evalHalaqahIdsInMonth.has(Number(hx.id))) return true;
                if (periodEnd) {
                    const hStart = getHalaqahStartDate(hx);
                    if (hStart && hStart > periodEnd) return false;
                }
                return true;
            });

            // Archived halaqahs that were active in this specific historical period:
            // Included if they have an explicit halaqah evaluation in this period (and weren't archived before the period started),
            // OR if no currently-active halaqahs existed yet in this past period and the archived halaqah was active during [periodStart, periodEnd].
            const archivedActiveInPeriod = baseFiltered.filter((hx: any) => {
                if (hx.is_active !== false) return false;
                const archivedDate = normalizeDateStr(hx.updated_at);
                const hStart = getHalaqahStartDate(hx);

                if (evalHalaqahIdsInMonth.has(Number(hx.id))) {
                    if (periodStart && archivedDate && archivedDate < periodStart) return false;
                    return true;
                }

                if (currentlyActiveInPeriod.length === 0 && periodEnd && archivedDate) {
                    if (hStart && hStart > periodEnd) return false;
                    if (periodEnd < archivedDate) return true;
                }

                return false;
            });

            const combined = [...currentlyActiveInPeriod, ...archivedActiveInPeriod];
            if (combined.length > 0) {
                return { list: combined, periodStart, periodEnd, evalHalaqahIdsInMonth };
            }

            // Fallback: if all currently active halaqahs have created_at after periodEnd (e.g. newly setup app with backdated period)
            return {
                list: baseFiltered.filter((hx: any) => hx.is_active !== false),
                periodStart,
                periodEnd,
                evalHalaqahIdsInMonth
            };
        };

        const getSantriActiveHalaqahInMonth = (
            santriId: number,
            activeHalaqahs: any[],
            periodStart?: string,
            periodEnd?: string,
            evalHalaqahIdsInMonth?: Set<number>
        ) => {
            if (!activeHalaqahs || activeHalaqahs.length === 0) return null;

            // 1. Check history records that overlap with [periodStart, periodEnd]
            const historyCandidates: { h: any; hs: any; isOngoingAtPeriodEnd: boolean; startDateStr: string }[] = [];

            for (const hx of activeHalaqahs) {
                if (hx.history && hx.history.length > 0) {
                    for (const hs of hx.history) {
                        if (hs.santri_id !== santriId) continue;
                        const sDate = normalizeDateStr(hs.start_date);
                        const eDate = normalizeDateStr(hs.end_date);

                        if (periodEnd && sDate && sDate > periodEnd) continue;
                        if (periodStart && eDate && eDate < periodStart) continue;

                        const isOngoingAtPeriodEnd = !eDate || (periodEnd ? eDate > periodEnd : false);
                        historyCandidates.push({
                            h: hx,
                            hs,
                            isOngoingAtPeriodEnd,
                            startDateStr: sDate || ''
                        });
                    }
                }
            }

            if (historyCandidates.length > 0) {
                historyCandidates.sort((a, b) => {
                    // Prefer active halaqah unless archived one has explicit eval in this month and active doesn't
                    const aActive = a.h.is_active !== false ? 1 : 0;
                    const bActive = b.h.is_active !== false ? 1 : 0;
                    const aHasEval = evalHalaqahIdsInMonth?.has(Number(a.h.id)) ? 1 : 0;
                    const bHasEval = evalHalaqahIdsInMonth?.has(Number(b.h.id)) ? 1 : 0;

                    if (aActive !== bActive) {
                        if (aHasEval !== bHasEval) return bHasEval - aHasEval;
                        return bActive - aActive;
                    }
                    // Prefer membership that is still ongoing at the end of the period (not mutated out mid-period)
                    if (a.isOngoingAtPeriodEnd !== b.isOngoingAtPeriodEnd) {
                        return a.isOngoingAtPeriodEnd ? -1 : 1;
                    }
                    // Prefer latest start_date
                    if (a.startDateStr !== b.startDateStr) {
                        return b.startDateStr.localeCompare(a.startDateStr);
                    }
                    // Prefer newest halaqah ID
                    return (Number(b.h.id) || 0) - (Number(a.h.id) || 0);
                });
                return historyCandidates[0].h;
            }

            // 2. Fallback to current active santri list among active halaqahs in this period (prioritize is_active !== false & newest ID)
            const fallbackCandidates = activeHalaqahs
                .filter((hx: any) => (hx.active_santri || hx.santri || []).some((hs: any) => hs.id === santriId))
                .sort((a: any, b: any) => {
                    const aActive = a.is_active !== false ? 1 : 0;
                    const bActive = b.is_active !== false ? 1 : 0;
                    if (aActive !== bActive) return bActive - aActive;
                    return (Number(b.id) || 0) - (Number(a.id) || 0);
                });

            return fallbackCandidates[0] || null;
        };

        // Group by Halaqah
        const halaqahMap: any = {};

        const effectiveMonths = filterMonth === 'all'
            ? availableMonths
            : (availableMonths.includes(filterMonth) ? [filterMonth] : (filterMonth ? [filterMonth] : availableMonths));

        effectiveMonths.forEach((month: string) => {
            const { list: activeHalaqahsInMonth, periodStart, periodEnd, evalHalaqahIdsInMonth } = getActiveHalaqahsForMonth(month);

            filteredSantri.forEach((s: any) => {
                const h = getSantriActiveHalaqahInMonth(s.id, activeHalaqahsInMonth, periodStart, periodEnd, evalHalaqahIdsInMonth);
                if (!h) return;

                if (!halaqahMap[h.id]) {
                    halaqahMap[h.id] = {
                        name: h.nama,
                        santriMonthCount: 0,
                        hafalanPctSum: 0,
                        murojaahPctSum: 0,
                        ziyadahPctSum: 0,
                        kehadiranPctSum: 0,
                        kehadiranCount: 0,
                        evalSum: {},
                        evalCount: {}
                    };
                    evaluationCategories.forEach(cat => {
                        halaqahMap[h.id].evalSum[cat] = 0;
                        halaqahMap[h.id].evalCount[cat] = 0;
                    });
                }

                const hData = halaqahMap[h.id];
                hData.santriMonthCount++;

                // Hafalan
                let currentHafalan = 0;
                const explicitHafalan = studentProgress.find((p: any) => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Total Hafalan');
                if (explicitHafalan && explicitHafalan.value) {
                    currentHafalan = parseFloat(explicitHafalan.value) || 0;
                } else {
                    const dEntry = studentProgress.find((p: any) => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Hafalan Depan');
                    const bEntry = studentProgress.find((p: any) => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Hafalan Belakang');
                    currentHafalan = (dEntry?.value ? parseFloat(dEntry.value) : 0) + (bEntry?.value ? parseFloat(bEntry.value) : 0);
                }
                const ct = (classTargets || []).find((t: any) => (t.semester === activeSem || !t.semester) && t.marhalah === s.marhalah && (t.kelas === s.kelas ));
                const targetHafalan = ct?.target_hafalan || 30;
                if (currentHafalan > 0 || targetHafalan > 0) {
                    const pct = targetHafalan > 0 ? (currentHafalan / targetHafalan) * 100 : (currentHafalan > 0 ? 100 : 0);
                    hData.hafalanPctSum += Math.min(pct, 100);
                }

                // Murojaah
                let currentMurojaah = 0;
                const explicitMurojaah = studentProgress.find((p: any) => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Murojaah');
                if (explicitMurojaah && explicitMurojaah.value) {
                    currentMurojaah = parseFloat(explicitMurojaah.value) || 0;
                }
                let targetMurojaah = 0;
                const rules = murojaahRules[s.marhalah] || [];
                for (const rule of rules) {
                    if (currentHafalan >= rule.min_capaian) {
                        targetMurojaah = rule.target;
                        break;
                    }
                }
                if (rules.length === 0) {
                    targetMurojaah = currentHafalan >= 20 ? 15 : 7.5;
                }
                if (currentMurojaah > 0 || targetMurojaah > 0) {
                    const pct = targetMurojaah > 0 ? (currentMurojaah / targetMurojaah) * 100 : (currentMurojaah > 0 ? 100 : 0);
                    hData.murojaahPctSum += Math.min(pct, 100);
                }

                // Ziyadah
                let currentZiyadah = 0;
                const explicitZiyadah = studentProgress.find((p: any) => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Ziyadah');
                if (explicitZiyadah && explicitZiyadah.value) {
                    currentZiyadah = parseFloat(explicitZiyadah.value) || 0;
                }
                const targetZiyadah = ct?.target_ziyadah || 0;
                if (currentZiyadah > 0 || targetZiyadah > 0) {
                    const pct = targetZiyadah > 0 ? (currentZiyadah / targetZiyadah) * 100 : (currentZiyadah > 0 ? 100 : 0);
                    hData.ziyadahPctSum += Math.min(pct, 100);
                }

                // Kehadiran
                let monthAttendanceTotal = 0;
                let monthAttendanceHadir = 0;
                if (attendance && attendance.length > 0) {
                    const period = evalPeriods.find((p: any) => p.id === month);
                    let studentMonthAttendance = [];
                    if (period && period.startDate && period.endDate) {
                        studentMonthAttendance = attendance.filter((a: any) => a.personId === s.id && a.peran === 'Santri' && a.date && a.date >= period.startDate && a.date <= period.endDate);
                    } else {
                        studentMonthAttendance = attendance.filter((a: any) => a.personId === s.id && a.peran === 'Santri' && a.date && a.date.startsWith(month));
                    }
                    monthAttendanceTotal = studentMonthAttendance.length;
                    monthAttendanceHadir = studentMonthAttendance.filter((a: any) => a.status === 'Hadir' || a.status === 'Terlambat').length;
                }
                if (monthAttendanceTotal > 0) {
                    const currentKehadiranPct = (monthAttendanceHadir / monthAttendanceTotal) * 100;
                    hData.kehadiranPctSum += currentKehadiranPct;
                    hData.kehadiranCount++;
                }

                // Evaluasi
                evaluationCategories.forEach(cat => {
                    const evalEntry = studentProgress.find((p: any) => p.santri_id === s.id && p.month_key === month && p.progress_type === cat);
                    if (evalEntry && evalEntry.value) {
                        const setting = evaluationSettings.find((es: any) => es.category === cat && es.label === evalEntry.value);
                        if (setting && setting.score !== undefined) {
                            hData.evalSum[cat] += setting.score;
                            hData.evalCount[cat]++;
                        }
                    }
                });
            });
        });

        const result = Object.values(halaqahMap).map((hData: any) => {
            const divisor = hData.santriMonthCount || 1;
            const hafalanPct = hData.hafalanPctSum / divisor;
            const murojaahPct = hData.murojaahPctSum / divisor;
            const ziyadahPct = hData.ziyadahPctSum / divisor;
            const kehadiranPct = hData.kehadiranCount > 0 ? (hData.kehadiranPctSum / hData.kehadiranCount) : 0;
            
            let totalPctSum = hafalanPct + murojaahPct + ziyadahPct + (hData.kehadiranCount > 0 ? kehadiranPct : 0);
            let metricCount = hData.kehadiranCount > 0 ? 4 : 3;

            const evalScores: any = {};
            evaluationCategories.forEach(cat => {
                const count = hData.evalCount[cat];
                if (count > 0) {
                    const avg = hData.evalSum[cat] / count;
                    // Clamp to 100% just in case
                    const pct = Math.min(avg, 100);
                    evalScores[cat] = pct;
                    totalPctSum += pct;
                    metricCount++;
                } else {
                    evalScores[cat] = 0; // Or omit
                }
            });

            const performa = metricCount > 0 ? totalPctSum / metricCount : 0;

            return {
                name: hData.name,
                Performa: parseFloat(performa.toFixed(1)),
                'Hafalan (%)': parseFloat(hafalanPct.toFixed(1)),
                'Murojaah (%)': parseFloat(murojaahPct.toFixed(1)),
                'Ziyadah (%)': parseFloat(ziyadahPct.toFixed(1)),
                'Kehadiran (%)': parseFloat(kehadiranPct.toFixed(1)),
                ...Object.fromEntries(Object.entries(evalScores).map(([k, v]) => [`${k} (%)`, parseFloat((v as number).toFixed(1))]))
            };
        });
        

        return result.sort((a, b) => {
            let sumA = 0;
            let sumB = 0;
            if (selectedMetrics.includes('global')) { sumA += a['Performa'] || 0; sumB += b['Performa'] || 0; }
            if (selectedMetrics.includes('hafalan')) { sumA += a['Hafalan (%)'] || 0; sumB += b['Hafalan (%)'] || 0; }
            if (selectedMetrics.includes('murojaah')) { sumA += a['Murojaah (%)'] || 0; sumB += b['Murojaah (%)'] || 0; }
            if (selectedMetrics.includes('ziyadah')) { sumA += a['Ziyadah (%)'] || 0; sumB += b['Ziyadah (%)'] || 0; }
            if (selectedMetrics.includes('kehadiran')) { sumA += a['Kehadiran (%)'] || 0; sumB += b['Kehadiran (%)'] || 0; }
            
            selectedMetrics.forEach(m => {
                if (m.startsWith('eval_')) {
                    const k = `${m.replace('eval_', '')} (%)`;
                    sumA += a[k] || 0;
                    sumB += b[k] || 0;
                }
            });
            
            return sumB - sumA;
        });
    }, [filteredSantri, halaqah, halaqahEvaluations, availableMonths, studentProgress, classTargets, evaluationSettings, appSettings, filterMonth, selectedMetrics, attendance, filterHalaqah, filterMarhalah, activeSem]);

    const chartWidth = Math.max(1000, chartData.length * 80);
    const evalKeys = Array.from(new Set(evaluationSettings.map((s: any) => s.category))) as string[];

    return (
        <div ref={chartRef} className="rounded-[1.25rem] border border-slate-200/70 bg-white p-7 shadow-sm flex-1 relative w-full flex flex-col mb-2 mt-8">
            <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                    <h4 className="text-[15px] font-semibold text-slate-800 tracking-tight mb-1">
                        Performa Keseluruhan Halaqah
                    </h4>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Agregasi pencapaian target dan evaluasi periode terpilih
                    </p>
                </div>
                <div className="flex items-center gap-3 relative z-[100]" data-html2canvas-ignore="true">
                    <div className="relative" ref={metricMenuRef}>
                        <button 
                            onClick={() => setIsMetricMenuOpen(!isMetricMenuOpen)}
                            className="flex items-center gap-2 text-[13px] font-medium bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 focus:outline-none hover:bg-slate-50 transition-colors shadow-sm relative z-[101]"
                        >
                            <span>Pilih Metrik ({selectedMetrics.length})</span>
                            <ChevronDown size={14} className="text-slate-400" />
                        </button>
                        {isMetricMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-slate-100 py-2 z-[9999] flex flex-col max-h-64 overflow-y-auto">
                                {[
                                    { id: 'global', label: 'Mode Umum (Performa)' },
                                    { id: 'hafalan', label: 'Hafalan' },
                                    { id: 'murojaah', label: 'Murojaah' },
                                    { id: 'ziyadah', label: 'Ziyadah' },
                                    { id: 'kehadiran', label: 'Kehadiran' },
                                    ...evalKeys.map(k => ({ id: `eval_${k}`, label: k }))
                                ].map(option => (
                                    <button
                                        key={option.id}
                                        onClick={() => {
                                            if (selectedMetrics.includes(option.id)) {
                                                if (selectedMetrics.length > 1) {
                                                    setSelectedMetrics(selectedMetrics.filter(m => m !== option.id));
                                                }
                                            } else {
                                                setSelectedMetrics([...selectedMetrics, option.id]);
                                            }
                                        }}
                                        className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
                                    >
                                        <span>{option.label}</span>
                                        {selectedMetrics.includes(option.id) ? (
                                            <CheckSquare size={16} className="text-blue-600" />
                                        ) : (
                                            <Square size={16} className="text-slate-300" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative" ref={menuRef}>
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                            <MoreVertical size={18} />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-slate-100 py-1.5 z-50">
                                <button 
                                    onClick={handleDownload}
                                    className="w-full text-left px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center transition-colors"
                                >
                                    <Download size={14} className="mr-2 text-slate-400"/> Download Chart
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div id="chart-container-portal" className="h-[320px] w-full overflow-x-auto overflow-y-visible no-scrollbar relative z-30">
                <div style={{ minWidth: `${chartWidth}px` }} className="h-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dx={-10} domain={[0, 100]} />
                                <Tooltip wrapperStyle={{ zIndex: 1000 }} cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }}
                                    formatter={(value: number, name: string) => [`${value}%`, name === 'Performa' ? 'Performa Umum' : name]}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                                
                                {selectedMetrics.includes('global') && <Bar dataKey="Performa" name="Performa Umum" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={30} />}
                                {selectedMetrics.includes('hafalan') && <Bar dataKey="Hafalan (%)" name="Hafalan" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={30} />}
                                {selectedMetrics.includes('murojaah') && <Bar dataKey="Murojaah (%)" name="Murojaah" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={30} />}
                                {selectedMetrics.includes('ziyadah') && <Bar dataKey="Ziyadah (%)" name="Ziyadah" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={30} />}
                                {selectedMetrics.includes('kehadiran') && <Bar dataKey="Kehadiran (%)" name="Kehadiran" fill="#14B8A6" radius={[4, 4, 0, 0]} maxBarSize={30} />}
                                
                                {evalKeys.map((key, idx) => {
                                    if (!selectedMetrics.includes(`eval_${key}`)) return null;
                                    return (
                                        <Line 
                                            key={key} 
                                            type="monotone" 
                                            dataKey={`${key} (%)`} 
                                            name={key}
                                            stroke={`hsl(${(idx * 137.5) % 360}, 70%, 50%)`} 
                                            strokeWidth={2} 
                                            dot={{ r: 3, strokeWidth: 2 }} 
                                            activeDot={{ r: 5 }} 
                                        />
                                    );
                                })}
                            </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
