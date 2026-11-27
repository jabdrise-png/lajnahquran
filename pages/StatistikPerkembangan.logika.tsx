// Dipecah otomatis dari StatistikPerkembangan.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen StatistikPerkembangan.
// Ubah perilaku di sini; tampilan ada di StatistikPerkembangan.tsx.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HalaqahPerformanceChart } from './HalaqahPerformanceChart';
import Card from '../components/Card';
import { useSupabaseData, useRiwayat } from '../hooks/useSupabaseData';
import { Marhalah, ProgressType, StudentEvaluation } from '../types';
import { formatPeriodName } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, ComposedChart, CartesianGrid, XAxis, YAxis, Line, Bar, AreaChart, Area } from 'recharts';
import { ArrowLeft, TrendingUp, MoreVertical, Download, EyeOff, Eye, BarChart2, PieChart as PieChartIcon, Filter, Check, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { ChartWithDownload, ComposedProgressChart, UnifiedProgressIndexChart, type UnifiedMetricDef, type UnifiedProgressIndexChartProps } from './StatistikPerkembangan.grafik';
export * from './StatistikPerkembangan.grafik';


export interface StatistikPerkembanganProps {
    globalFilterMonth: string;
    globalFilterMarhalah: string | 'all';
    globalFilterKelas: string | 'all';
    globalFilterHalaqah: string | 'all';
    globalSearchName: string;
    setPage: (page: string) => void;
}

export function useStatistikPerkembanganLogika({
    globalFilterMonth,
    globalFilterMarhalah,
    globalFilterKelas,
    globalFilterHalaqah,
    globalSearchName,
    setPage
}: StatistikPerkembanganProps) {
    const { santri, studentProgress, studentEvaluations, classTargets, evaluationSettings, halaqah, halaqahEvalQuestions, halaqahEvaluations, appSettings, periodeEvaluasi, userProfile, masterKelas, waliKelas, attendance , masterMarhalahs, masterKelasRelasi, selectedAcademicYear } = useSupabaseData();
    useRiwayat(); // Fase 7: riwayat absensi/setoran dimuat saat halaman ini dibuka
    
    // Mapping Global Props
    const filterMarhalah = globalFilterMarhalah as Marhalah | 'all';
    const filterKelas = globalFilterKelas;
    const filterHalaqah = globalFilterHalaqah;
    const searchName = globalSearchName;
    const filterMonth = globalFilterMonth;

    // Available Months for Chart Comparisons (we keep all months available in data)
    const progressMap = useMemo(() => {
        const map = new Map();
        for (const p of studentProgress) {
            map.set(`${p.santri_id}_${p.month_key}_${p.progress_type}`, p);
        }
        return map;
    }, [studentProgress]);

    const santriMap = useMemo(() => {
        const map = new Map();
        for (const s of santri) { map.set(s.id, s); }
        return map;
    }, [santri]);
    
    const classTargetsMap = useMemo(() => {
        const map = new Map();
        const activeSem = selectedAcademicYear?.active_semester || 'Ganjil';
        // Sort so targets matching active semester take priority
        const sortedTargets = [...(classTargets || [])].sort((a, b) => {
            const aMatch = (a.semester === activeSem) ? 1 : 0;
            const bMatch = (b.semester === activeSem) ? 1 : 0;
            return aMatch - bMatch;
        });
        for (const ct of sortedTargets) {
            const mName = ct.marhalah_id ? (masterMarhalahs?.find((m) => m.id === ct.marhalah_id)?.nama || ct.marhalah) : ct.marhalah;
            const kName = ct.kelas_id ? (masterKelasRelasi?.find((k) => k.id === ct.kelas_id)?.nama_kelas || ct.kelas) : ct.kelas;
            map.set(`${mName}_${kName}`, ct);
        }
        return map;
    }, [classTargets, masterMarhalahs, masterKelasRelasi, selectedAcademicYear]);
    
    const evalMap = useMemo(() => {
        const map = new Map();
        for (const e of studentEvaluations) {
            map.set(`${e.santri_id}_${e.month_key}`, e);
        }
        return map;
    }, [studentEvaluations]);

    const availableMonths = useMemo(() => {
        const masterPeriods = periodeEvaluasi;
        if (masterPeriods.length > 0) {
            // Sort ascending for chart chronological order by startDate if possible, else fallback to id
            return masterPeriods
                .sort((a,b) => {
                    const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
                    const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
                    if (dateA !== dateB) return dateA - dateB;
                    return a.id.localeCompare(b.id);
                })
                .map(p => p.id);
        }

        const months = new Set<string>();
        let filteredProgress = studentProgress;
        let filteredEvaluations = studentEvaluations;
        
        if (filterMarhalah && filterMarhalah !== 'all') {
            filteredProgress = studentProgress.filter(p => { const s = santriMap.get(p.santri_id); return s?.marhalah === filterMarhalah; });
            filteredEvaluations = studentEvaluations.filter(e => { const s = santriMap.get(e.santri_id); return s?.marhalah === filterMarhalah; });
        }
        
        filteredProgress.forEach(p => months.add(p.month_key));
        filteredEvaluations.forEach(e => months.add(e.month_key));
        if (months.size === 0) months.add(format(new Date(), 'yyyy-MM'));
        return Array.from(months).sort((a, b) => {
            const periodA = masterPeriods.find(mp => mp.id === a);
            const periodB = masterPeriods.find(mp => mp.id === b);
            const dateA = periodA?.startDate ? new Date(periodA.startDate).getTime() : 0;
            const dateB = periodB?.startDate ? new Date(periodB.startDate).getTime() : 0;
            if (dateA !== dateB) return dateA - dateB;
            return a.localeCompare(b);
        });
    }, [studentProgress, studentEvaluations, appSettings, filterMarhalah, santri]);

    // Filtered Santri
    const filteredSantri = useMemo(() => {
        let allowedSantriIds: Set<number> | null = null;

        if (userProfile?.role === 'musammi') {
            allowedSantriIds = new Set();
            const musammiHalaqahs = halaqah.filter(h => h.is_active === true).filter(h => 
                Boolean(h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id)
            );
            musammiHalaqahs.forEach(h => {
                if (h.history) {
                    h.history.forEach((hs) => { if (hs.santri) allowedSantriIds!.add(hs.santri_id); });
                } else if (h.santri) {
                    h.santri.forEach(s => allowedSantriIds!.add(s.id));
                }
            });
        }

        return santri.filter(s => {
            if (s.kelas === '-') return false;
            // Musammi can only see santris from their assigned halaqah
            if (allowedSantriIds && !allowedSantriIds.has(s.id)) return false;
            if (filterMarhalah !== 'all' && s.marhalah !== filterMarhalah) return false;
            if (filterKelas !== 'all' && s.kelas !== filterKelas) return false;
            if (searchName && !s.nama.toLowerCase().includes(searchName.toLowerCase())) return false;
            if (filterHalaqah !== 'all') {
                const h = halaqah.find(h => h.id.toString() === filterHalaqah);
                if (!h) return false;
                if (h.history) {
                    if (!h.history.find((hs) => hs.santri_id === s.id)) return false;
                } else {
                    if (!h.santri.find(hs => hs.id === s.id)) return false;
                }
            }
            return true;
        });
    }, [santri, filterMarhalah, filterKelas, searchName, filterHalaqah, halaqah, userProfile]);

    // Active Target for Line Charts
    const activeChartTargets = useMemo(() => {
        let baseTarget = classTargetsMap.get(`${filterMarhalah}_${filterKelas}`) ;
        let finalTarget = { ...baseTarget } as any;

        if (filterHalaqah && filterHalaqah !== 'all') {
            const settingKey = 'target_halaqah_' + filterHalaqah;
            const setting = appSettings.find(s => s.key === settingKey);
            if (setting && setting.value) {
                try {
                    const parsed = JSON.parse(setting.value);
                    
                    finalTarget.target_murojaah = parsed.target_murojaah !== undefined ? parsed.target_murojaah : finalTarget.target_murojaah;
                    
                    finalTarget.target_ziyadah = parsed.target_ziyadah !== undefined ? parsed.target_ziyadah : finalTarget.target_ziyadah;
                } catch(e) {}
            }
        }
        
        return finalTarget;
    }, [filterMarhalah, filterKelas, filterHalaqah, classTargetsMap, appSettings]);

    // Helper for Line Charts
    const getPeriodDays = (monthId: string) => {
        const masterPeriods = periodeEvaluasi;
        const period = masterPeriods.find(p => p.id === monthId);
        if (period && period.startDate && period.endDate) {
            const start = new Date(period.startDate);
            const end = new Date(period.endDate);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffInTime = end.getTime() - start.getTime();
                const diffInDays = Math.round(diffInTime / (1000 * 3600 * 24)) + 1;
                return Math.max(1, diffInDays);
            }
        }
        return 30; // Default to 30 days if no explicit dates
    };

    const generateLineChartData = (type: ProgressType) => {
        let murojaahRules = {};
        try {
            const setting = appSettings.find((s) => s.key === 'TARGET_MUROJAAH_GLOBAL');
            if (setting && setting.value) {
                const parsed = JSON.parse(setting.value);
                if (parsed.threshold_juz !== undefined) {
                    // Legacy fallback
                    murojaahRules = {
                        "Mutawasithoh": [{ min_capaian: parsed.threshold_juz, target: parsed.target_above_juz }, { min_capaian: 0, target: parsed.target_below_juz }],
                        "Ulya": [{ min_capaian: parsed.threshold_juz, target: parsed.target_above_juz }, { min_capaian: 0, target: parsed.target_below_juz }]
                    };
                } else {
                    murojaahRules = parsed;
                }
            }
        } catch (e) { console.error('Error parsing TARGET_MUROJAAH_RULES', e); }

        let calculatedAvgTarget = 0;
        if (filteredSantri.length > 0) {
            let totalTarget = 0;
            filteredSantri.forEach(s => {
                let studentTarget = 0;
                
                if (type === 'Murojaah') {
                    let maxHafalan = 0;
                    availableMonths.forEach(month => {
                         const explicitHafalan = progressMap.get(`${s.id}_${month}_Total Hafalan`);
                         if (explicitHafalan && explicitHafalan.value) {
                             maxHafalan = Math.max(maxHafalan, parseFloat(explicitHafalan.value) || 0);
                         } else {
                             const dEntry = progressMap.get(`${s.id}_${month}_Hafalan Depan`);
                             const bEntry = progressMap.get(`${s.id}_${month}_Hafalan Belakang`);
                             const calc = (dEntry?.value ? parseFloat(dEntry.value) : 0) + (bEntry?.value ? parseFloat(bEntry.value) : 0);
                             maxHafalan = Math.max(maxHafalan, calc);
                         }
                    });
                    const rules = murojaahRules[s.marhalah] || [];
                    for (const rule of rules) {
                        if (maxHafalan >= rule.min_capaian) {
                            studentTarget = rule.target;
                            break;
                        }
                    }
                    if (rules.length === 0) {
                        studentTarget = maxHafalan >= 20 ? 15 : 7.5;
                    }
                } else if (type === 'Total Hafalan') {
                    const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
                    studentTarget = ct?.target_hafalan || 30; // 30 Juz default
                } else if (type === 'Ziyadah') {
                    const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
                    studentTarget = ct?.target_ziyadah || 0;
                }
                
                totalTarget += studentTarget;
            });
            calculatedAvgTarget = totalTarget / filteredSantri.length;
        }

        return availableMonths.map(month => {
            let total = 0;
            let count = 0;
            const periodDays = getPeriodDays(month);
            let sumPercentage = 0;
            let percentageCount = 0;

            filteredSantri.forEach(s => {
                let currentVal = 0;
                let studentTarget = 0;

                if (type === 'Total Hafalan') {
                    const explicitHafalan = progressMap.get(`${s.id}_${month}_Total Hafalan`);
                    if (explicitHafalan && explicitHafalan.value) {
                        currentVal = parseFloat(explicitHafalan.value) || 0;
                    } else {
                        const dEntry = progressMap.get(`${s.id}_${month}_Hafalan Depan`);
                        const bEntry = progressMap.get(`${s.id}_${month}_Hafalan Belakang`);
                        currentVal = (dEntry?.value ? parseFloat(dEntry.value) : 0) + (bEntry?.value ? parseFloat(bEntry.value) : 0);
                    }
                    const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
                    studentTarget = ct?.target_hafalan || 30;
                } else if (type === 'Murojaah') {
                    const explicit = progressMap.get(`${s.id}_${month}_Murojaah`);
                    if (explicit && explicit.value) {
                        currentVal = parseFloat(explicit.value) || 0;
                    }
                    
                    let studentTotalHafalan = 0;
                    const explicitHafalan = progressMap.get(`${s.id}_${month}_Total Hafalan`);
                    if (explicitHafalan && explicitHafalan.value) {
                        studentTotalHafalan = parseFloat(explicitHafalan.value) || 0;
                    } else {
                        const dEntry = progressMap.get(`${s.id}_${month}_Hafalan Depan`);
                        const bEntry = progressMap.get(`${s.id}_${month}_Hafalan Belakang`);
                        studentTotalHafalan = (dEntry?.value ? parseFloat(dEntry.value) : 0) + (bEntry?.value ? parseFloat(bEntry.value) : 0);
                    }
                    const rules = murojaahRules[s.marhalah] || [];
                    for (const rule of rules) {
                        if (studentTotalHafalan >= rule.min_capaian) {
                            studentTarget = rule.target;
                            break;
                        }
                    }
                    if (rules.length === 0) {
                        studentTarget = studentTotalHafalan >= 20 ? 15 : 7.5;
                    }
                } else {
                    const entry = progressMap.get(`${s.id}_${month}_${type}`);
                    if (entry && entry.value) {
                        currentVal = parseFloat(entry.value) || 0;
                    }
                    if (type === 'Ziyadah') {
                        const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
                        studentTarget = ct?.target_ziyadah || 0;
                    }
                }

                if (currentVal > 0) {
                    total += currentVal;
                    count++;
                }

                if (currentVal > 0 || studentTarget > 0) {
                    const pct = studentTarget > 0 ? (currentVal / studentTarget) * 100 : (currentVal > 0 ? 100 : 0);
                    sumPercentage += Math.min(pct, 100);
                    percentageCount++;
                }
            });

            const rawAvg = count > 0 ? (total / count) : 0;
            
            let precalculatedPercentage = undefined;
            if (filteredSantri.length > 0 && percentageCount > 0) {
                precalculatedPercentage = sumPercentage / percentageCount;
            }

            return { 
                name: formatPeriodName(month, periodeEvaluasi), 
                monthId: month,
                value: parseFloat(rawAvg.toFixed(2)),
                rawAvg: parseFloat(rawAvg.toFixed(2)),
                periodDays: periodDays,
                dynamicTarget: calculatedAvgTarget > 0 ? parseFloat(calculatedAvgTarget.toFixed(2)) : undefined,
                precalculatedPercentage: precalculatedPercentage !== undefined ? parseFloat(precalculatedPercentage.toFixed(2)) : undefined
            };
        });
    };

    const dynamicCategories = Array.from(new Set(evaluationSettings.map(s => s.category))) as string[];

    const unifiedMetrics = useMemo(() => {
        const list: UnifiedMetricDef[] = [
            { id: 'hafalan', label: 'Total Hafalan', color: '#10B981', unit: 'Juz', type: 'hafalan' },
            { id: 'murojaah', label: 'Murojaah', color: '#F59E0B', unit: 'Juz', type: 'murojaah' },
        ];

        const palette = ['#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6', '#F43F5E'];
        dynamicCategories.forEach((cat, idx) => {
            const cleanTitle = cat.replace(/^Persentase\s+/i, '');
            list.push({
                id: `eval_${cat}`,
                label: cleanTitle,
                color: palette[idx % palette.length],
                unit: '%',
                type: 'eval'
            });
        });

        return list;
    }, [dynamicCategories]);

    const unifiedChartData = useMemo(() => {
        const hafalanData = generateLineChartData('Total Hafalan');
        const murojaahData = generateLineChartData('Murojaah');

        return availableMonths.map((month, idx) => {
            const hData = hafalanData[idx];
            const mData = murojaahData[idx];

            // 1. Total Hafalan
            const hTarget = hData?.dynamicTarget || activeChartTargets?.target_hafalan || 0;
            const hAvg = hData?.rawAvg || 0;
            const hPct = hData?.precalculatedPercentage !== undefined 
                ? hData.precalculatedPercentage 
                : (hTarget > 0 ? Math.min(100, Math.max(0, (hAvg / hTarget) * 100)) : (hAvg > 0 ? 100 : 0));

            // 2. Murojaah
            const mTarget = mData?.dynamicTarget || 0;
            const mAvg = mData?.rawAvg || 0;
            const mPct = mData?.precalculatedPercentage !== undefined 
                ? mData.precalculatedPercentage 
                : (mTarget > 0 ? Math.min(100, Math.max(0, (mAvg / mTarget) * 100)) : (mAvg > 0 ? 100 : 0));

            const row: any = {
                name: hData?.name || formatPeriodName(month, periodeEvaluasi),
                monthId: month,
                hafalan: parseFloat(hPct.toFixed(1)),
                hafalan_raw: hAvg,
                hafalan_target: hTarget,
                murojaah: parseFloat(mPct.toFixed(1)),
                murojaah_raw: mAvg,
                murojaah_target: mTarget,
            };

            // 3. Dynamic Evaluation Categories
            dynamicCategories.forEach(cat => {
                const catSettings = evaluationSettings.filter(s => s.category === cat);
                let totalScore = 0;
                let count = 0;

                filteredSantri.forEach(s => {
                    const prog = progressMap.get(`${s.id}_${month}_${cat}`);
                    const evalItem = evalMap.get(`${s.id}_${month}`);
                    const val = prog?.value || (cat === 'Hafalan' ? evalItem?.kualitas_hafalan 
                        : cat === 'Bacaan' ? evalItem?.kualitas_bacaan 
                        : cat === 'Sikap' ? evalItem?.sikap_prilaku 
                        : undefined);

                    if (val && val !== '-' && val !== '') {
                        const setting = catSettings.find(cs => cs.label === val);
                        let score = setting?.score;
                        if (score === undefined || score === 0) {
                            const lower = val.toLowerCase();
                            if (lower.includes('mumtaz')) score = 95;
                            else if (lower.includes('jayyid jiddan')) score = 85;
                            else if (lower.includes('jayyid')) score = 75;
                            else if (lower.includes('maqbul')) score = 65;
                            else if (lower.includes('dhaif')) score = 50;
                            else {
                                const optIdx = catSettings.findIndex(cs => cs.label === val);
                                if (optIdx !== -1 && catSettings.length > 1) {
                                    score = 100 - (optIdx / (catSettings.length - 1)) * 50;
                                } else {
                                    score = 80;
                                }
                            }
                        }
                        totalScore += score;
                        count++;
                    }
                });

                const avgCatScore = count > 0 ? parseFloat((totalScore / count).toFixed(1)) : null;
                row[`eval_${cat}`] = avgCatScore;
                row[`eval_${cat}_count`] = count;
            });

            return row;
        });
    }, [availableMonths, generateLineChartData, activeChartTargets, dynamicCategories, evaluationSettings, filteredSantri, progressMap, evalMap, appSettings, filterMarhalah]);

    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    const getOptionColor = (categoryKey: string, optionName: string, fallbackOptions: any[], optionColorMap?: Record<string, string>) => {
        if (optionColorMap && optionColorMap[optionName]) {
            return optionColorMap[optionName];
        }
        const setting = evaluationSettings.find(s => s.category === categoryKey && s.label === optionName);
        if (setting && setting.color) {
            return setting.color;
        }

        const idx = fallbackOptions.findIndex((opt) => (typeof opt === 'object' ? opt.label : opt) === optionName);
        if (idx !== -1) {
            const matched = fallbackOptions[idx];
            if (typeof matched === 'object' && matched?.color) return matched.color;
            return COLORS[idx % COLORS.length];
        }
        // Fallback for options not in the predefined list
        let hash = 0;
        for (let i = 0; i < optionName.length; i++) hash = optionName.charCodeAt(i) + ((hash << 5) - hash);
        return COLORS[Math.abs(hash) % COLORS.length];
    };

    // Helper for Pie Charts
    const calculatePieChartData = (categoryKey: string) => {
        const counts: Record<string, number> = {};
        let total = 0;

        filteredSantri.forEach(s => {
            const prog = filterMonth === 'all' 
        ? studentProgress.find(p => p.santri_id === s.id && p.progress_type === categoryKey)
        : progressMap.get(`${s.id}_${filterMonth}_${categoryKey}`);
            
            if (prog && prog.value && prog.value !== '-') {
                counts[prog.value] = (counts[prog.value] || 0) + 1;
                total++;
            }
        });

        return Object.entries(counts).map(([name, count]) => ({
            name,
            value: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0
        }));
    };

    // Helper for Bar Charts (Comparison across months)
    const calculateBarChartData = (categoryKey: string) => {
        const dataByMonth: Record<string, Record<string, number>> = {};
        const allOptions = new Set<string>();

        availableMonths.forEach(month => {
            dataByMonth[month] = {};
            let total = 0;
            
            filteredSantri.forEach(s => {
                const prog = progressMap.get(`${s.id}_${month}_${categoryKey}`);
                
                if (prog && prog.value && prog.value !== '-') {
                    const val = prog.value;
                    dataByMonth[month][val] = (dataByMonth[month][val] || 0) + 1;
                    allOptions.add(val);
                    total++;
                }
            });

            // Convert to percentages
            if (total > 0) {
                Object.keys(dataByMonth[month]).forEach(key => {
                    dataByMonth[month][key] = parseFloat(((dataByMonth[month][key] / total) * 100).toFixed(1));
                });
            }
        });

        return availableMonths.map(month => ({
            month: formatPeriodName(month, periodeEvaluasi),
            ...dataByMonth[month]
        }));
    };

    const dynamicChartsData = dynamicCategories.map(c => {
        const settings = evaluationSettings.filter(s => s.category === c).sort((a,b) => (b.score || 0) - (a.score || 0));
        const options = Array.from(new Set(settings.map(s => s.label)));
        const cleanTitle = c.replace(/^Persentase\s+/i, '');
        return {
            categoryKey: c,
            title: cleanTitle,
            pieData: calculatePieChartData(c),
            barData: calculateBarChartData(c),
            options: options
        };
    });

    // Helper for Halaqah Evaluation Pie Charts
    const calculateHalaqahPieChartData = (questionId: number) => {
        const counts: Record<string, number> = {};
        let total = 0;
        const masterPeriods = periodeEvaluasi;

        halaqah.forEach(h => {
            if (filterMarhalah !== 'all' && h.marhalah !== filterMarhalah) return;
            if (filterHalaqah !== 'all' && h.id.toString() !== filterHalaqah) return;

            // Only consider the selected month for pie chart, or the latest if 'all'
            let targetMonth = filterMonth;
            if (targetMonth === 'all') {
                const evals = halaqahEvaluations.filter(e => e.halaqah_id === h.id).sort((a, b) => {
                    const periodA = masterPeriods.find(mp => mp.id === a.month_key);
                    const periodB = masterPeriods.find(mp => mp.id === b.month_key);
                    const dateA = periodA?.startDate ? new Date(periodA.startDate).getTime() : 0;
                    const dateB = periodB?.startDate ? new Date(periodB.startDate).getTime() : 0;
                    if (dateA !== dateB) return dateB - dateA;
                    return b.month_key.localeCompare(a.month_key);
                });
                if (evals.length > 0) targetMonth = evals[0].month_key;
            }

            const evalData = halaqahEvaluations.find(e => e.halaqah_id === h.id && e.month_key === targetMonth);
            if (evalData && evalData.answers && evalData.answers[questionId]) {
                const val = evalData.answers[questionId];
                if (val) {
                    counts[val] = (counts[val] || 0) + 1;
                    total++;
                }
            }
        });

        return Object.entries(counts).map(([name, count]) => ({
            name,
            value: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0
        }));
    };

    const halaqahChartsData = (halaqahEvalQuestions || []).filter(q => q.type === 'dropdown').map(q => {
        const options = q.options?.map((o) => typeof o === 'object' ? o.label : o) || [];
        const optionColors: Record<string, string> = {};
        (q.options || []).forEach((o) => {
            if (typeof o === 'object' && o.label && o.color) {
                optionColors[o.label] = o.color;
            }
        });
        return {
            categoryKey: q.question,
            title: `Persentase ${q.question} (Halaqah)`,
            pieData: calculateHalaqahPieChartData(q.id),
            options: options,
            optionColors
        };
    });

    // End of halaqahChartsData

    const activeSubtitlePrefix = useMemo(() => {
        let text = `Marhalah ${filterMarhalah !== 'all' ? filterMarhalah : 'Semua'}`;
        if (filterKelas && filterKelas !== 'all') {
            text += `, Kelas ${filterKelas}`;
        }
        if (filterHalaqah && filterHalaqah !== 'all') {
            const h = halaqah.find(hx => hx.id.toString() === filterHalaqah);
            if (h && h.nama) {
                text += `, Halaqah ${h.nama}`;
            }
        }
        return text;
    }, [filterMarhalah, filterKelas, filterHalaqah, halaqah]);
  return { globalFilterMonth, globalFilterMarhalah, globalFilterKelas, globalFilterHalaqah, globalSearchName, setPage, santri, studentProgress, studentEvaluations, classTargets, evaluationSettings, halaqah, halaqahEvalQuestions, halaqahEvaluations, appSettings, periodeEvaluasi, userProfile, masterKelas, waliKelas, attendance, masterMarhalahs, masterKelasRelasi, selectedAcademicYear, filterMarhalah, filterKelas, filterHalaqah, searchName, filterMonth, progressMap, santriMap, classTargetsMap, evalMap, availableMonths, filteredSantri, activeChartTargets, getPeriodDays, generateLineChartData, dynamicCategories, unifiedMetrics, unifiedChartData, COLORS, getOptionColor, calculatePieChartData, calculateBarChartData, dynamicChartsData, calculateHalaqahPieChartData, halaqahChartsData, activeSubtitlePrefix };
}

export type StatistikPerkembanganLogika = ReturnType<typeof useStatistikPerkembanganLogika>;
