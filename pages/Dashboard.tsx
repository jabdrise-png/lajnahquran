import React, { useMemo, useState, useRef, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import Card, { WidgetCard } from '../components/Card';
import { AttendanceColumnChart, MultiLineChart } from '../components/Chart';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useAcademicYear } from '../lib/AcademicYearContext';
import { formatPeriodName } from '../lib/utils';
import { AttendanceStatus, Marhalah, Waktu, MasterEvaluationPeriod } from '../types';
import { Users, BookOpen, MoreVertical, Download, Clock, UserCheck, TrendingUp, ArrowUpRight, Filter, X } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, Area } from 'recharts';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { ALL_ATTENDANCE_STATUS } from '../constants';
import html2canvas from 'html2canvas';

interface DashboardProps {
    onNavigate?: (page: string) => void;
    userRole?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, userRole }) => {
    const { santri, musammi, halaqah, attendance, studentProgress, appSettings, loading, error, masterKelas , globalWaktuHalaqah, globalAttendanceStatus, classTargets , masterMarhalahs, masterKelasRelasi, getOrgId} = useSupabaseData();
    const { selectedAcademicYear } = useAcademicYear();

    const globalMarhalahs = useMemo(() => masterMarhalahs.map((m: any) => m.nama), [masterMarhalahs]);
    
    // Attendance Chart Menu & Timeframe State
    const [attendanceRange, setAttendanceRange] = useState<'7' | '30'>('7');
    const [isAttendanceMenuOpen, setIsAttendanceMenuOpen] = useState(false);
    const attendanceChartRef = useRef<HTMLDivElement>(null);
    const attendanceMenuRef = useRef<HTMLDivElement>(null);

    const [waktuStats, setWaktuStats] = useState({ total: 0, today: 0, Shubuh: 0, Dhuha: 0, Ashar: 0, Maghrib: 0, Isya: 0 });
    const [statsData, setStatsData] = useState<any[]>([]);
    const [weeklyAttendanceData, setWeeklyAttendanceData] = useState<any[]>([]);
    const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
    
    // Percentage Chart Menu & Timeframe State
    const [percentageRange, setPercentageRange] = useState<'30d' | '6m' | '1y'>('30d');
    const [isPercentageMenuOpen, setIsPercentageMenuOpen] = useState(false);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [isTrendLoading, setIsTrendLoading] = useState(false);
    const percentageChartRef = useRef<HTMLDivElement>(null);
    const percentageMenuRef = useRef<HTMLDivElement>(null);

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (attendanceMenuRef.current && !attendanceMenuRef.current.contains(event.target as Node)) {
                setIsAttendanceMenuOpen(false);
            }
            if (percentageMenuRef.current && !percentageMenuRef.current.contains(event.target as Node)) {
                setIsPercentageMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- Data Calculations ---
    
    // Role filtering for display
    const { userProfile, waliKelas } = useSupabaseData();
    const myHalaqahs = useMemo(() => {
        if (userRole === 'musammi' && userProfile) {
            return halaqah.filter(h => 
                (h.musammi?.user_id && h.musammi.user_id === userProfile.id) || 
                (h.musammi?.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim())
            );
        }
        return halaqah;
    }, [halaqah, userRole, userProfile]);

    const displaySantri = useMemo(() => {
        if (userRole === 'musammi' && myHalaqahs) {
            const activeSantriIds = myHalaqahs.flatMap(h => h.active_santri.map(s => s.id));
            return santri.filter(s => activeSantriIds.includes(s.id));
        }
        if (userRole === 'pengajar' && userProfile) {
            const myKelasNames = waliKelas.filter(w => (w.user_id && w.user_id === userProfile.id) || (w.nama && w.nama.toLowerCase().trim() === userProfile.name.toLowerCase().trim())).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
            return santri.filter(s => s.kelas && myKelasNames.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas));
        }
        return santri;
    }, [santri, myHalaqahs, userRole, userProfile, waliKelas]);

    const displayHalaqahCount = userRole === 'musammi' ? myHalaqahs.length : (userRole === 'pengajar' ? waliKelas.filter(w => userProfile && ((w.user_id && w.user_id === userProfile.id) || (w.nama && w.nama.toLowerCase().trim() === userProfile.name.toLowerCase().trim()))).length : halaqah.length);

    // 1. Dynamic Master Marhalah Distribution
    const marhalahColorPalette = [
        { bg: 'bg-slate-800', dot: 'bg-slate-800', text: 'text-slate-800' },
        { bg: 'bg-blue-600', dot: 'bg-blue-600', text: 'text-blue-600' },
        { bg: 'bg-emerald-600', dot: 'bg-emerald-600', text: 'text-emerald-600' },
        { bg: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-500' },
        { bg: 'bg-purple-600', dot: 'bg-purple-600', text: 'text-purple-600' },
        { bg: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-500' },
        { bg: 'bg-cyan-600', dot: 'bg-cyan-600', text: 'text-cyan-600' },
        { bg: 'bg-indigo-600', dot: 'bg-indigo-600', text: 'text-indigo-600' },
    ];

    const marhalahDistribution = useMemo(() => {
        const total = displaySantri.length || 1;
        const marhalahList: { id?: string; nama: string }[] = [];

        if (masterMarhalahs && masterMarhalahs.length > 0) {
            masterMarhalahs.forEach((m: any) => {
                marhalahList.push({ id: m.id, nama: m.nama });
            });
        }

        // Also check if any santri has a marhalah name not yet in list
        displaySantri.forEach(s => {
            if (s.marhalah && !marhalahList.some(m => m.nama === s.marhalah || (s.marhalah_id && m.id === s.marhalah_id))) {
                marhalahList.push({ id: s.marhalah_id, nama: s.marhalah });
            }
        });

        if (marhalahList.length === 0) {
            marhalahList.push({ nama: 'Semua' });
        }

        const calculated = marhalahList.map((m, index) => {
            const count = displaySantri.filter(s => 
                (m.id && s.marhalah_id === m.id) || 
                (s.marhalah && s.marhalah.toLowerCase().trim() === m.nama.toLowerCase().trim())
            ).length;
            const percentage = Math.round((count / total) * 100);
            const color = marhalahColorPalette[index % marhalahColorPalette.length];
            return {
                id: m.id,
                nama: m.nama,
                count,
                percentage,
                color
            };
        });

        const activeItems = calculated.filter(item => item.count > 0);
        return activeItems.length > 0 ? activeItems : calculated.slice(0, 4);
    }, [displaySantri, masterMarhalahs]);

    // New: Calculate Actual Executed Sessions based on Attendance Data
    
    const myAttendanceStats = useMemo(() => {
        if (userRole !== 'musammi' || !userProfile) return null;
        const myMusammi = musammi.find(m => (m.user_id && m.user_id === userProfile.id) || (m.nama?.toLowerCase().trim() === userProfile.name.toLowerCase().trim()));
        if (!myMusammi) return null;

        const myRecords = attendance.filter(a => a.peran === 'Musammi' && a.personId === myMusammi.id);
        const total = myRecords.length;
        if (total === 0) return { total: 0, Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Terlambat: 0, percentage: 0 };
        
        const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Terlambat: 0 };
        myRecords.forEach(r => {
            if (counts[r.status as keyof typeof counts] !== undefined) counts[r.status as keyof typeof counts]++;
        });

        const percentage = Math.round(((counts['Hadir'] + counts['Terlambat']) / total) * 100);

        return {
            total,
            ...counts,
            percentage
        };
    }, [attendance, musammi, userRole, userProfile]);

    useEffect(() => {
        let isMounted = true;
        const fetchWaktuStats = async () => {
            try {
                const orgId = await getOrgId();
                if (!orgId) return;
                const today = format(new Date(), 'yyyy-MM-dd');
                const { data, error } = await (supabase as any).rpc('rpc_get_waktu_stats', {
                    p_org_id: orgId,
                    p_today: today,
                    p_academic_year_id: selectedAcademicYear?.id || null
                });
                
                if (error) throw error;
                if (data && data.length > 0 && isMounted) {
                    setWaktuStats({
                        total: data[0].total,
                        today: data[0].today,
                        Shubuh: data[0].shubuh,
                        Dhuha: data[0].dhuha,
                        Ashar: data[0].ashar,
                        Maghrib: data[0].maghrib || 0,
                        Isya: data[0].isya
                    });
                }
            } catch (err: any) {
                if (err?.message?.includes('not authenticated') || err?.message?.includes('Sesi telah habis') || !err) {
                    return;
                }
                console.warn("Could not fetch waktuStats:", err);
            }
        };
        fetchWaktuStats();
        return () => { isMounted = false; };
    }, [getOrgId, selectedAcademicYear]);

    // 2. Statistics Logic (With Filters)
    const todayString = format(new Date(), 'yyyy-MM-dd');
    const [statsFilter, setStatsFilter] = useState({
        startDate: todayString,
        endDate: todayString,
        waktu: 'all',
    });

    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
    const [globalFilter, setGlobalFilter] = useState({
        marhalah: 'all',
        kelas: 'all',
        halaqah: 'all'
    });
    const [progressChartScheme, setProgressChartScheme] = useState('Total Hafalan');

    const applyGlobalFilterToAttendance = (a: any) => {
        if (globalFilter.marhalah !== 'all' && a.marhalah !== globalFilter.marhalah) return false;
        if (globalFilter.kelas !== 'all' && a.kelas !== globalFilter.kelas) return false;
        if (globalFilter.halaqah !== 'all' && a.halaqah_id?.toString() !== globalFilter.halaqah) return false;
        return true;
    };
    
    useEffect(() => {
        let isMounted = true;
        const fetchStatsData = async () => {
            try {
                const orgId = await getOrgId();
                if (!orgId) return;

                const { data, error } = await (supabase as any).rpc('rpc_get_attendance_stats', {
                    p_org_id: orgId,
                    p_start_date: statsFilter.startDate || format(new Date(), 'yyyy-MM-dd'),
                    p_end_date: statsFilter.endDate || format(new Date(), 'yyyy-MM-dd'),
                    p_waktu: statsFilter.waktu,
                    p_marhalah: globalFilter.marhalah,
                    p_kelas: globalFilter.kelas,
                    p_halaqah: globalFilter.halaqah
                });

                if (error) throw error;
                
                if (data) {
                    const groups: Record<string, any> = {};
                    globalMarhalahs.forEach(m => {
                        groups[m] = { marhalah: m, stats: {} };
                        globalAttendanceStatus?.forEach(s => groups[m].stats[s] = 0);
                    });

                    data.forEach((row: any) => {
                        const m = row.marhalah;
                        if (groups[m]) {
                            const statusMapped = globalAttendanceStatus?.find(s => s.toLowerCase() === row.status.toLowerCase()) || row.status;
                            groups[m].stats[statusMapped] = (groups[m].stats[statusMapped] || 0) + Number(row.count);
                        }
                    });

                    const finalData = Object.values(groups).sort((a, b) => globalMarhalahs.indexOf(a.marhalah) - globalMarhalahs.indexOf(b.marhalah));
                    if (isMounted) setStatsData(finalData);
                }
            } catch (err: any) {
                if (err?.message?.includes('not authenticated') || err?.message?.includes('Sesi telah habis') || !err) {
                    return;
                }
                console.warn("Could not fetch stats data:", err);
            }
        };
        fetchStatsData();
        return () => { isMounted = false; };
    }, [statsFilter, globalFilter, globalMarhalahs, globalAttendanceStatus, getOrgId]);

    // 3. Attendance Stacked Bar Chart Data (7 or 30 days)
    useEffect(() => {
        let isMounted = true;
        const fetchWeeklyData = async () => {
            setIsAttendanceLoading(true);
            try {
                const orgId = await getOrgId();
                if (!orgId) return;

                const daysCount = attendanceRange === '30' ? 30 : 7;
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - (daysCount - 1));

                const { data, error } = await (supabase as any).rpc('rpc_get_attendance_trend', {
                    p_org_id: orgId,
                    p_start_date: format(startDate, 'yyyy-MM-dd'),
                    p_end_date: format(endDate, 'yyyy-MM-dd'),
                    p_group_by: 'day',
                    p_marhalah: globalFilter.marhalah,
                    p_kelas: globalFilter.kelas,
                    p_halaqah: globalFilter.halaqah
                });

                if (error) throw error;

                const days: Record<string, any> = {};
                for (let i = daysCount - 1; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const strDate = format(d, 'yyyy-MM-dd');
                    const dayName = daysCount === 7 ? format(d, 'eee') : format(d, 'd/M');
                    days[strDate] = { name: dayName };
                    globalAttendanceStatus?.forEach(s => days[strDate][s] = 0);
                }

                if (data) {
                    data.forEach((row: any) => {
                        const period = row.period;
                        if (days[period] && row.status) {
                            const statusMapped = globalAttendanceStatus?.find(s => s.toLowerCase() === row.status.toLowerCase()) || row.status;
                            days[period][statusMapped] = (days[period][statusMapped] || 0) + Number(row.count);
                        }
                    });
                }

                if (isMounted) setWeeklyAttendanceData(Object.values(days));
            } catch (err: any) {
                if (err?.message?.includes('not authenticated') || err?.message?.includes('Sesi telah habis') || !err) {
                    return;
                }
                console.warn("Could not fetch weekly data:", err);
            } finally {
                if (isMounted) setIsAttendanceLoading(false);
            }
        };
        fetchWeeklyData();
        return () => { isMounted = false; };
    }, [attendanceRange, globalFilter, globalAttendanceStatus, getOrgId]);

    // 4. Trend Data (30 Days / 6 Months / 1 Year) - Percentage Calculation
    useEffect(() => {
        let isMounted = true;
        const fetchTrendData = async () => {
            setIsTrendLoading(true);
            try {
                const orgId = await getOrgId();
                if (!orgId) return;

                const endDate = new Date();
                let startDate = new Date();
                let groupBy = 'day';

                if (percentageRange === '30d') {
                    startDate.setDate(endDate.getDate() - 30);
                    groupBy = 'day';
                } else if (percentageRange === '6m') {
                    startDate.setMonth(endDate.getMonth() - 5);
                    startDate.setDate(1);
                    groupBy = 'month';
                } else if (percentageRange === '1y') {
                    startDate.setFullYear(endDate.getFullYear() - 1);
                    startDate.setDate(1);
                    groupBy = 'month';
                }

                const days: Record<string, any> = {};
                
                // Prepare skeletons
                if (percentageRange === '30d') {
                    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                        if (d.getDay() === 5) continue;
                        const strDate = format(d, 'yyyy-MM-dd');
                        days[strDate] = { date: format(d, 'MMM d'), fullDate: strDate };
                        globalAttendanceStatus?.forEach(s => days[strDate][s] = 0);
                    }
                } else {
                    const startM = new Date(startDate);
                    while(startM <= endDate) {
                        const monthKey = format(startM, 'yyyy-MM');
                        days[monthKey] = { date: format(startM, 'MMM yyyy'), fullDate: monthKey };
                        globalAttendanceStatus?.forEach(s => days[monthKey][s] = 0);
                        startM.setMonth(startM.getMonth() + 1);
                    }
                }

                const { data, error } = await (supabase as any).rpc('rpc_get_attendance_trend', {
                    p_org_id: orgId,
                    p_start_date: format(startDate, 'yyyy-MM-dd'),
                    p_end_date: format(endDate, 'yyyy-MM-dd'),
                    p_group_by: groupBy,
                    p_marhalah: globalFilter.marhalah,
                    p_kelas: globalFilter.kelas,
                    p_halaqah: globalFilter.halaqah
                });

                if (error) {
                    // Fallback using loaded data if RPC fails or doesn't exist
                    console.warn("RPC failed or not found, falling back to local data:", error);
                    attendance.filter(applyGlobalFilterToAttendance).forEach(r => {
                        if (!r.date || !r.status) return;
                        const key = percentageRange === '30d' ? r.date : r.date.slice(0, 7);
                        if (days[key]) {
                            days[key][r.status] = (days[key][r.status] || 0) + 1;
                        }
                    });
                } else if (data) {
                    data.forEach((row: any) => {
                        const period = row.period;
                        if (days[period] && row.status) {
                            // Map 'Alpa' to 'Alpha' if needed based on constant
                            const statusMapped = globalAttendanceStatus?.find(s => s.toLowerCase() === row.status.toLowerCase()) || row.status;
                            days[period][statusMapped] = (days[period][statusMapped] || 0) + Number(row.count);
                        }
                    });
                }

                const sortedDays = Object.values(days).sort((a: any, b: any) => a.fullDate.localeCompare(b.fullDate));
                const finalData = sortedDays.map((day: any) => {
                    let total = 0;
                    globalAttendanceStatus?.forEach(s => total += (day[s] || 0));
                    const result = { ...day };
                    if (total > 0) {
                        globalAttendanceStatus?.forEach(s => {
                            if (day[s] !== undefined) result[s] = parseFloat(((day[s] / total) * 100).toFixed(1));
                        });
                    }
                    return result;
                });

                if (isMounted) setTrendData(finalData);
            } catch (err: any) {
                if (err?.message?.includes('not authenticated') || err?.message?.includes('Sesi telah habis') || !err) {
                    return;
                }
                console.warn("Could not build trend data:", err);
            } finally {
                if (isMounted) setIsTrendLoading(false);
            }
        };

        fetchTrendData();
        return () => { isMounted = false; };
    }, [percentageRange, globalFilter, globalAttendanceStatus]); // removed getOrgId and attendance to prevent infinite loops

    const getStatusColor = (status: string) => {
        const lower = status?.toLowerCase();
        if (lower === 'hadir') return 'bg-emerald-500';
        if (lower === 'izin') return 'bg-blue-500';
        if (lower === 'sakit') return 'bg-amber-500';
        if (lower === 'terlambat') return 'bg-orange-500';
        if (lower === 'alpa') return 'bg-red-500';
        return 'bg-slate-200';
    };

    const _santriConfig = useMemo(() => {
        return santri.filter(s => {
            if (s.kelas === '-') return false;
            if (globalFilter.marhalah !== 'all' && s.marhalah !== globalFilter.marhalah) return false;
            if (globalFilter.kelas !== 'all' && s.kelas !== globalFilter.kelas) return false;
            if (globalFilter.halaqah !== 'all') {
                const h = halaqah.find(hh => hh.id.toString() === globalFilter.halaqah);
                if (!h) return false;
                if (h.history) {
                    if (!h.history.find((hs: any) => hs.santri_id === s.id)) return false;
                } else {
                    if (!h.santri.find(hs => hs.id === s.id)) return false;
                }
            }
            return true;
        });
    }, [santri, globalFilter, halaqah]);

    const { dashboardProgressData, averageTarget } = useMemo(() => {
        let masterPeriods: MasterEvaluationPeriod[] = [];
        const periodSettings = appSettings?.find(s => s.key === 'EVALUATION_PERIODS')?.value;
        let availableMonths: string[] = [];
        if (periodSettings) {
            try {
                if (periodSettings.startsWith('[')) {
                    masterPeriods = JSON.parse(periodSettings);
                    availableMonths = masterPeriods.map((p: any) => p.id);
                } else {
                    availableMonths = periodSettings.split(',').filter((p: string) => p.trim() !== '');
                }
            } catch(e) {}
        } else {
             const months = new Set<string>();
             studentProgress?.forEach(p => months.add(p.month_key));
             if (months.size === 0) months.add(format(new Date(), 'yyyy-MM'));
             availableMonths = Array.from(months);
        }

        // Chronological sort: oldest / earliest month first -> newest / latest month last (e.g., month 5 -> 7)
        availableMonths.sort((aId, bId) => {
            const pA = masterPeriods.find(p => p.id === aId);
            const pB = masterPeriods.find(p => p.id === bId);

            const dateA = pA?.startDate ? new Date(pA.startDate).getTime() : NaN;
            const dateB = pB?.startDate ? new Date(pB.startDate).getTime() : NaN;

            if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) {
                return dateA - dateB;
            }

            // Check if string contains standard YYYY-MM
            const regDate = /(\d{4})[/-](\d{1,2})/;
            const matchA = aId.match(regDate) || (pA?.name || '').match(regDate);
            const matchB = bId.match(regDate) || (pB?.name || '').match(regDate);
            if (matchA && matchB) {
                const valA = parseInt(matchA[1], 10) * 100 + parseInt(matchA[2], 10);
                const valB = parseInt(matchB[1], 10) * 100 + parseInt(matchB[2], 10);
                if (valA !== valB) return valA - valB;
            }

            // Check if name or id has any month/period number (e.g. "Bulan 5" vs "Bulan 7", "Periode 5" vs "Periode 7")
            const numA = (pA?.name || aId).match(/\d+/);
            const numB = (pB?.name || bId).match(/\d+/);
            if (numA && numB && numA[0] !== numB[0]) {
                return parseInt(numA[0], 10) - parseInt(numB[0], 10);
            }

            return aId.localeCompare(bId);
        });

        let totalTarget = 0;
        let targetCount = 0;

        const activeSem = selectedAcademicYear?.active_semester || 'Ganjil';
        _santriConfig.forEach(s => {
            let targetVal = 0;
            const targetConfig = classTargets?.find(t => (t.semester === activeSem || !t.semester) && t.marhalah === s.marhalah && (t.kelas === s.kelas ));
            
            if (targetConfig) {
                if (progressChartScheme === 'Total Hafalan' || progressChartScheme === 'Hafalan Depan' || progressChartScheme === 'Hafalan Belakang') {
                     targetVal = targetConfig.target_hafalan || 0;
                } else if (progressChartScheme === 'Ziyadah') {
                     targetVal = targetConfig.target_ziyadah || 0;
                } else if (progressChartScheme === 'Murojaah') {
                     targetVal = targetConfig.target_murojaah || 0;
                }
            }
            
            if (targetConfig && targetVal >= 0) {
                totalTarget += targetVal;
                targetCount++;
            }
        });
        const averageTarget = targetCount > 0 ? parseFloat((totalTarget / targetCount).toFixed(2)) : null;

        const data = availableMonths.map(month => {
            let total = 0; let count = 0;
            _santriConfig.forEach(s => {
                   let valStr: string | undefined;
                   if (progressChartScheme === 'Total Hafalan' || progressChartScheme === 'Ziyadah') {
                       const HD = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Hafalan Depan')?.value ?? '0') || 0;
                       const HB = parseFloat(studentProgress.find(p => p.santri_id === s.id && p.month_key === month && p.progress_type === 'Hafalan Belakang')?.value ?? '0') || 0;
                       
                       if (progressChartScheme === 'Total Hafalan') {
                             if (HD > 0 || HB > 0 || studentProgress.some(p => p.santri_id === s.id && p.month_key === month)) valStr = (HD + HB).toString();
                       } else if (progressChartScheme === 'Ziyadah') {
                            const currIdx = availableMonths.indexOf(month);
                            const prevMonthKey = currIdx > 0 ? availableMonths[currIdx - 1] : null;
                            const prevHD = prevMonthKey ? parseFloat(studentProgress.find(x => x.santri_id === s.id && x.month_key === prevMonthKey && x.progress_type === 'Hafalan Depan')?.value ?? '0') || 0 : 0;
                            const prevHB = prevMonthKey ? parseFloat(studentProgress.find(x => x.santri_id === s.id && x.month_key === prevMonthKey && x.progress_type === 'Hafalan Belakang')?.value ?? '0') || 0 : 0;
                            if (HD > 0 || HB > 0 || studentProgress.some(p => p.santri_id === s.id && p.month_key === month)) {
                                valStr = (((HD + HB) - (prevHD + prevHB)) * 20).toString();
                            }
                       }
                   }
                   if (valStr === undefined) {
                        const entry = studentProgress.find(p => p.santri_id === s.id && p.month_key === month && p.progress_type === progressChartScheme);
                        if (entry) valStr = entry.value;
                   }

                   if (valStr) {
                       const val = parseFloat(valStr);
                       if (!isNaN(val)) { total += val; count++; }
                   }
            });
            const avg = count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
            return { name: formatPeriodName(month, appSettings), value: avg, target: averageTarget };
        });
        return { dashboardProgressData: data, averageTarget };
    }, [progressChartScheme, _santriConfig, studentProgress, appSettings, classTargets]);

    const handleDownloadAttendanceChart = async () => {
        if (attendanceChartRef.current) {
            try {
                const canvas = await html2canvas(attendanceChartRef.current, { scale: 2, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `Tren_Kehadiran_${attendanceRange === '7' ? 'Seminggu' : '30Hari'}_${format(new Date(), 'yyyy-MM-dd')}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            } catch (err) {
                console.error("Failed to download attendance chart", err);
            }
        }
    };

    const handleDownloadPercentageChart = async () => {
        if (percentageChartRef.current) {
            try {
                const canvas = await html2canvas(percentageChartRef.current, { scale: 2, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `Tren_Persentase_${percentageRange}_${format(new Date(), 'yyyy-MM-dd')}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            } catch (err) {
                console.error("Failed to download percentage chart", err);
            }
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                 <div className="text-center p-8">Memuat data dashboard...</div>
            </div>
        );
    }
    
    if (error) {
        return <div className="text-center p-8 text-error">Error: {error}</div>;
    }

    if (!selectedAcademicYear) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center p-8 bg-amber-50 rounded-xl border border-amber-200 max-w-md">
                    <h3 className="text-lg font-bold text-amber-800 mb-2">Tahun Ajaran Belum Diatur</h3>
                    <p className="text-amber-700 mb-4">Silakan buat Tahun Ajaran baru di menu Manajemen Data untuk mulai menggunakan aplikasi.</p>
                </div>
            </div>
        );
    }

  return (
    <>
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 max-w-[1400px] font-sans">
      
      {/* Filter Lanjutan Inline */}
      {showAdvancedFilter && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5 animate-in slide-in-from-top-2 duration-300">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
                <h3 className="font-semibold text-slate-800 text-xs sm:text-sm flex items-center">
                    <Filter size={16} className="mr-2 text-blue-500" />
                    Filter Lanjutan
                </h3>
                <button onClick={() => setShowAdvancedFilter(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1 transition-colors">
                    <X size={16} />
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                 <div>
                     <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Marhalah</label>
                     <select 
                         value={globalFilter.marhalah}
                         onChange={(e) => setGlobalFilter({...globalFilter, marhalah: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2 sm:p-2.5 transition-colors outline-none cursor-pointer"
                     >
                         <option value="all">Semua Marhalah</option>
                         {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                     </select>
                 </div>
                 <div>
                     <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Kelas</label>
                     <select 
                         value={globalFilter.kelas}
                         onChange={(e) => setGlobalFilter({...globalFilter, kelas: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2 sm:p-2.5 transition-colors outline-none cursor-pointer"
                     >
                         <option value="all">Semua Kelas</option>
                         {(globalFilter.marhalah !== 'all' ? masterKelas.filter(m => m.marhalah === globalFilter.marhalah).map(m => m.nama_kelas) : []).map(k => <option key={k} value={k}>{k}</option>)}
                     </select>
                 </div>
                 <div>
                     <label className="block text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Halaqah</label>
                     <select 
                         value={globalFilter.halaqah}
                         onChange={(e) => setGlobalFilter({...globalFilter, halaqah: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2 sm:p-2.5 transition-colors outline-none cursor-pointer"
                     >
                         <option value="all">Semua Halaqah</option>
                         {[...halaqah].sort((a,b)=>a.nama.localeCompare(b.nama)).map(h => <option key={h.id} value={h.id.toString()}>{h.nama}</option>)}
                     </select>
                 </div>
            </div>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 xl:gap-6">
        
        {/* Card 1: Total Santri */}
        <WidgetCard className="flex flex-col justify-between !rounded-2xl !p-4 sm:!p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-600">
                    <Users size={18} strokeWidth={2}/>
                    <p className="text-sm sm:text-[15px] font-medium">{userRole === 'musammi' ? 'Santri Halaqah Saya' : userRole === 'pengajar' ? 'Santri Kelas Saya' : 'Total Santri'}</p>
                </div>
            </div>
            
            <div className="mt-3 sm:mt-4">
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{displaySantri.length}</p>
            </div>
            
            {!['musammi', 'pengajar'].includes(userRole || '') && (
              <div className="mt-4 sm:mt-6 flex-1 flex flex-col justify-end">
                  <div className="h-1.5 w-full flex rounded-full overflow-hidden bg-slate-100">
                      {marhalahDistribution.map(item => (
                          <div 
                              key={item.nama} 
                              className={item.color.bg} 
                              style={{ width: `${item.percentage}%` }}
                              title={`${item.nama}: ${item.count} santri (${item.percentage}%)`}
                          />
                      ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 mt-3 text-[11px] font-medium text-slate-500">
                      {marhalahDistribution.map(item => (
                          <div key={item.nama} className="flex items-center">
                              <div className={`w-2 h-2 rounded-full ${item.color.dot} mr-1.5 flex-shrink-0`}></div>
                              <span className="truncate max-w-[120px] sm:max-w-[85px]" title={item.nama}>
                                  {item.nama}
                              </span>
                              <span className="ml-1 text-slate-400">({item.percentage}%)</span>
                          </div>
                      ))}
                  </div>
              </div>
            )}
        </WidgetCard>

        {!['musammi', 'pengajar'].includes(userRole || '') && (
          <WidgetCard className="flex flex-col justify-between !rounded-2xl !p-4 sm:!p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
              <div className="flex items-center space-x-2 text-slate-600">
                  <UserCheck size={18} strokeWidth={2}/>
                  <p className="text-sm sm:text-[15px] font-medium">Total Musammi'</p>
              </div>
              
              <div className="mt-3 sm:mt-4">
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{musammi.length}</p>
              </div>
              
              <div className="mt-4 sm:mt-6 flex-1 flex flex-col justify-end">
                  <button onClick={() => onNavigate && onNavigate('DataMusammi')} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center transition-colors text-left focus:outline-none">
                      Lihat daftar pengajar <ArrowUpRight size={14} className="ml-1" />
                  </button>
              </div>
          </WidgetCard>
        )}

        {/* Card 3: Total Halaqah */}
        <WidgetCard className="flex flex-col justify-between !rounded-2xl !p-4 sm:!p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-600">
                    <BookOpen size={18} strokeWidth={2}/>
                    <p className="text-sm sm:text-[15px] font-medium">{userRole === 'musammi' ? 'Halaqah Saya' : userRole === 'pengajar' ? 'Kelas Saya' : 'Total Halaqah'}</p>
                </div>
                <div className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    Aktif
                </div>
            </div>
            
            <div className="mt-3 sm:mt-4">
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{displayHalaqahCount}</p>
            </div>
            
            {!['musammi', 'pengajar'].includes(userRole || '') && (
              <div className="mt-4 sm:mt-6 flex-1 flex flex-col justify-end">
                  <button onClick={() => onNavigate && onNavigate('DataHalaqah')} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center transition-colors text-left focus:outline-none">
                      Kelola kelompok belajar <ArrowUpRight size={14} className="ml-1" />
                  </button>
              </div>
            )}
        </WidgetCard>

        
        {/* Card 4: Sesi Berjalan */}
        <WidgetCard className="flex flex-col justify-between !rounded-2xl !p-4 sm:!p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
            <div className="flex items-center space-x-2 text-slate-600">
                <Clock size={18} strokeWidth={2}/>
                <p className="text-sm sm:text-[15px] font-medium">Sesi Berjalan</p>
            </div>
            
            <div className="mt-3 sm:mt-4 flex items-baseline">
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{waktuStats.total}</p>
                <p className="ml-2 text-slate-500 text-xs sm:text-sm font-medium">/ hari ini</p>
            </div>
            
            <div className="mt-4 sm:mt-6 flex-1 flex flex-col justify-end">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                        <span className="text-slate-500 font-medium">Shubuh</span>
                        <span className="font-semibold text-slate-800">{waktuStats[Waktu.Shubuh]}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                        <span className="text-slate-500 font-medium">Dhuha</span>
                        <span className="font-semibold text-slate-800">{waktuStats[Waktu.Dhuha]}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                        <span className="text-slate-500 font-medium">Ashar</span>
                        <span className="font-semibold text-slate-800">{waktuStats[Waktu.Ashar]}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                        <span className="text-slate-500 font-medium">Isya</span>
                        <span className="font-semibold text-slate-800">{waktuStats[Waktu.Isya]}</span>
                    </div>
                </div>
            </div>
        </WidgetCard>

        {userRole === 'musammi' && myAttendanceStats && (
            <WidgetCard className="flex flex-col justify-between !rounded-2xl !p-4 sm:!p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
                <div className="flex items-center space-x-2 text-slate-600">
                    <UserCheck size={18} strokeWidth={2}/>
                    <p className="text-sm sm:text-[15px] font-medium">Kehadiran Saya</p>
                </div>
                
                <div className="mt-3 sm:mt-4 flex items-baseline">
                    <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{myAttendanceStats.percentage}%</p>
                    <p className="ml-2 text-slate-500 text-xs sm:text-sm font-medium">hadir</p>
                </div>
                
                <div className="mt-4 sm:mt-6 flex-1 flex flex-col justify-end">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                            <span className="text-slate-500 font-medium">Izin</span>
                            <span className="font-semibold text-slate-800">{myAttendanceStats.Izin}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                            <span className="text-slate-500 font-medium">Sakit</span>
                            <span className="font-semibold text-slate-800">{myAttendanceStats.Sakit}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                            <span className="text-slate-500 font-medium">Alpa</span>
                            <span className="font-semibold text-slate-800">{myAttendanceStats.Alpa}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 px-2 sm:px-2.5 py-1.5 rounded-md">
                            <span className="text-slate-500 font-medium">Terlambat</span>
                            <span className="font-semibold text-slate-800">{myAttendanceStats.Terlambat}</span>
                        </div>
                    </div>
                </div>
            </WidgetCard>
        )}

      </div>
      
      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6">
          {/* Bar Chart - Tren Kehadiran */}
          <Card className="!rounded-2xl !p-4 sm:!p-6 border-slate-200 w-full overflow-hidden bg-white shadow-sm">
            <div className="flex items-start justify-between mb-4 sm:mb-6 gap-2">
                <div>
                    <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                        Tren Kehadiran ({attendanceRange === '7' ? 'Seminggu Terakhir' : '30 Hari Terakhir'})
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Distribusi absensi harian dalam {attendanceRange === '7' ? '7' : '30'} hari terakhir.
                    </p>
                </div>
                <div className="relative shrink-0" ref={attendanceMenuRef}>
                    <button
                        onClick={() => setIsAttendanceMenuOpen(!isAttendanceMenuOpen)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none"
                        title="Opsi Chart"
                        aria-label="Opsi Chart Kehadiran"
                    >
                        <MoreVertical size={18} />
                    </button>
                    {isAttendanceMenuOpen && (
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Rentang Waktu
                            </div>
                            <button
                                onClick={() => {
                                    setAttendanceRange('7');
                                    setIsAttendanceMenuOpen(false);
                                }}
                                className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                                    attendanceRange === '7' ? 'text-blue-600 font-semibold bg-blue-50/60' : 'text-slate-700 hover:bg-slate-50'
                                }}`}
                            >
                                <span>Seminggu Terakhir</span>
                                {attendanceRange === '7' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                            </button>
                            <button
                                onClick={() => {
                                    setAttendanceRange('30');
                                    setIsAttendanceMenuOpen(false);
                                }}
                                className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                                    attendanceRange === '30' ? 'text-blue-600 font-semibold bg-blue-50/60' : 'text-slate-700 hover:bg-slate-50'
                                }}`}
                            >
                                <span>30 Hari Terakhir</span>
                                {attendanceRange === '30' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                            </button>
                            <div className="my-1 border-t border-slate-100"></div>
                            <button
                                onClick={() => {
                                    setIsAttendanceMenuOpen(false);
                                    handleDownloadAttendanceChart();
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center transition-colors"
                            >
                                <Download size={14} className="mr-2 text-slate-400" />
                                <span>Download</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="overflow-x-auto hide-scrollbar -mx-1 sm:mx-0">
                <div className="h-[260px] sm:h-[300px] w-full min-w-[340px] sm:min-w-[500px]" ref={attendanceChartRef}>
                    <AttendanceColumnChart data={weeklyAttendanceData} keys={globalAttendanceStatus} />
                </div>
            </div>
          </Card>

          {/* Area/Line Chart - Tren Persentase */}
          <Card className="!rounded-2xl !p-4 sm:!p-6 border-slate-200 w-full overflow-hidden bg-white shadow-sm">
             <div className="flex items-start justify-between mb-4 sm:mb-6 gap-2">
                <div>
                    <h2 className="text-sm sm:text-base font-semibold text-slate-800">
                        Tren Persentase ({percentageRange === '30d' ? '30 Hari Terakhir' : percentageRange === '6m' ? '6 Bulan Terakhir' : '1 Tahun Terakhir'})
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        {percentageRange === '30d' && 'Pergerakan persentase kehadiran harian secara proporsional.'}
                        {percentageRange === '6m' && 'Pergerakan persentase kehadiran dalam 6 bulan terakhir.'}
                        {percentageRange === '1y' && 'Pergerakan persentase kehadiran dalam 1 tahun terakhir.'}
                    </p>
                </div>
                <div className="relative shrink-0" ref={percentageMenuRef}>
                    <button
                        onClick={() => setIsPercentageMenuOpen(!isPercentageMenuOpen)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none"
                        title="Opsi Chart"
                        aria-label="Opsi Chart Persentase"
                    >
                        <MoreVertical size={18} />
                    </button>
                    {isPercentageMenuOpen && (
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Rentang Waktu
                            </div>
                            <button
                                onClick={() => {
                                    setPercentageRange('30d');
                                    setIsPercentageMenuOpen(false);
                                }}
                                className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                                    percentageRange === '30d' ? 'text-blue-600 font-semibold bg-blue-50/60' : 'text-slate-700 hover:bg-slate-50'
                                }}`}
                            >
                                <span>30 Hari Terakhir</span>
                                {percentageRange === '30d' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                            </button>
                            <button
                                onClick={() => {
                                    setPercentageRange('6m');
                                    setIsPercentageMenuOpen(false);
                                }}
                                className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                                    percentageRange === '6m' ? 'text-blue-600 font-semibold bg-blue-50/60' : 'text-slate-700 hover:bg-slate-50'
                                }}`}
                            >
                                <span>6 Bulan Terakhir</span>
                                {percentageRange === '6m' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                            </button>
                            <button
                                onClick={() => {
                                    setPercentageRange('1y');
                                    setIsPercentageMenuOpen(false);
                                }}
                                className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                                    percentageRange === '1y' ? 'text-blue-600 font-semibold bg-blue-50/60' : 'text-slate-700 hover:bg-slate-50'
                                }}`}
                            >
                                <span>1 Tahun Terakhir</span>
                                {percentageRange === '1y' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                            </button>
                            <div className="my-1 border-t border-slate-100"></div>
                            <button
                                onClick={() => {
                                    setIsPercentageMenuOpen(false);
                                    handleDownloadPercentageChart();
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center transition-colors"
                            >
                                <Download size={14} className="mr-2 text-slate-400" />
                                <span>Download</span>
                            </button>
                        </div>
                    )}
                </div>
             </div>
             
             <div className="overflow-x-auto hide-scrollbar -mx-1 sm:mx-0">
                 <div className="h-[260px] sm:h-[300px] w-full min-w-[360px] sm:min-w-[600px]" ref={percentageChartRef}>
                    <MultiLineChart data={trendData} isPercentage={true} keys={globalAttendanceStatus} />
                 </div>
             </div>
          </Card>
          {/* Line Chart Progress */}
          <Card className="!rounded-2xl !p-4 sm:!p-6 border-slate-200 w-full overflow-hidden bg-white shadow-sm">
             <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <div>
                    <h2 className="text-sm sm:text-base font-semibold text-slate-800">Tren Perkembangan Hafalan / Materi</h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Grafik rata-rata dari skema perkembangan santri.</p>
                </div>
                <select 
                    className="border border-slate-200 text-slate-600 font-medium rounded-xl text-xs sm:text-sm py-2 px-3 bg-white shadow-sm focus:ring-2 focus:ring-blue-100 focus:outline-none focus:border-blue-500 transition-all cursor-pointer w-full sm:w-auto"
                    value={progressChartScheme}
                    onChange={(e) => setProgressChartScheme(e.target.value)}
                >
                    <option value="Total Hafalan">Total Hafalan</option>
                    <option value="Hafalan Depan">Hafalan Depan</option>
                    <option value="Hafalan Belakang">Hafalan Belakang</option>
                    <option value="Ziyadah">Ziyadah</option>
                    <option value="Murojaah">Murojaah</option>
                </select>
             </div>
             
             <div className="overflow-x-auto hide-scrollbar -mx-1 sm:mx-0">
                 <div className="h-[260px] sm:h-[300px] w-full min-w-[360px] sm:min-w-[600px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dashboardProgressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorValue-dashboard" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} dx={-10} />
                            <Tooltip wrapperStyle={{ zIndex: 1000 }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f8fafc' }} />
                            <Area 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#3b82f6" 
                                strokeWidth={2.5} 
                                fillOpacity={1}
                                fill="url(#colorValue-dashboard)"
                                activeDot={{ r: 6, fill: "#3b82f6", stroke: "#ffffff", strokeWidth: 2 }} 
                                name="Rata-rata" 
                            />
                            {averageTarget !== null && (
                                <Line 
                                    type="step" 
                                    dataKey="target" 
                                    stroke="#f59e0b" 
                                    strokeWidth={2} 
                                    strokeDasharray="4 4"
                                    dot={false}
                                    activeDot={false}
                                    name="Target Rata-rata" 
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                 </div>
             </div>
          </Card>
      </div>

      {/* Table Section */}
      <div className="pt-2">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-800">Statistik Kehadiran</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Berdasarkan filter tanggal dan waktu per marhalah.</p>
              </div>
          </div>

          <Card className="!rounded-2xl !p-0 border-slate-200 overflow-hidden bg-white shadow-sm">
            <div className="bg-slate-50 border-b border-slate-100 p-3 sm:p-4 lg:px-6 lg:py-4 flex flex-col md:flex-row gap-3 sm:gap-4 justify-between items-start md:items-center">
                <div className="flex items-center text-xs sm:text-sm font-semibold text-slate-700">
                    Filter Statistik
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full md:w-auto">
                    <input 
                        type="date"
                        className="border-slate-200 text-slate-600 font-medium rounded-xl text-xs sm:text-sm h-10 px-3 bg-white w-full sm:w-auto border shadow-sm focus:ring-2 focus:ring-blue-100 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                        value={statsFilter.startDate}
                        onChange={(e) => setStatsFilter({...statsFilter, startDate: e.target.value})}
                    />
                    <span className="text-slate-400 self-center hidden sm:block">-</span>
                    <input 
                        type="date"
                        className="border-slate-200 text-slate-600 font-medium rounded-xl text-xs sm:text-sm h-10 px-3 bg-white w-full sm:w-auto border shadow-sm focus:ring-2 focus:ring-blue-100 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                        value={statsFilter.endDate}
                        onChange={(e) => setStatsFilter({...statsFilter, endDate: e.target.value})}
                    />
                    <select
                        className="border-slate-200 text-slate-600 font-medium rounded-xl text-xs sm:text-sm h-10 px-3 bg-white w-full sm:w-auto border shadow-sm focus:ring-2 focus:ring-blue-100 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                        value={statsFilter.waktu}
                        onChange={(e) => setStatsFilter({...statsFilter, waktu: e.target.value})}
                    >
                        <option value="all">Semua Waktu</option>
                        {globalWaktuHalaqah.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto hide-scrollbar">
                <table className="w-full text-xs sm:text-sm text-center whitespace-nowrap">
                    <thead>
                        <tr className="border-b border-slate-100 bg-white">
                            <th className="p-3 sm:p-4 text-left font-semibold text-slate-500 text-[11px] sm:text-xs tracking-wider uppercase">Marhalah</th>
                            {globalAttendanceStatus?.map(status => (
                                <th key={status} className="p-3 sm:p-4 font-semibold text-slate-500 text-[11px] sm:text-xs tracking-wider uppercase">
                                    {status}
                                </th>
                            ))}
                            <th className="p-3 sm:p-4 font-semibold text-slate-800 text-[11px] sm:text-xs tracking-wider uppercase">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {statsData.map((row, idx) => {
                            const totalRow = globalAttendanceStatus?.reduce((s, status) => s + (row.stats[status] || 0), 0) || 0;
                            
                            return (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors bg-white">
                                    <td className="p-3 sm:p-4 text-left font-semibold text-slate-700"><MarhalahLabel text={row.marhalah} id={row.marhalah_id} /></td>
                                    {globalAttendanceStatus?.map(status => {
                                        const val = row.stats[status] || 0;
                                        return (
                                            <td key={status} className="p-3 sm:p-4">
                                                {val > 0 ? (
                                                    <div className="flex items-center justify-center">
                                                        {status?.toLowerCase() === 'hadir' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></div>}
                                                        <span className="font-semibold text-slate-700">{val}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 sm:p-4 font-bold text-slate-800">{totalRow}</td>
                                </tr>
                            );
                        })}
                        {/* Summary Row */}
                        <tr className="bg-slate-50/50 font-bold border-t border-slate-200">
                            <td className="p-3 sm:p-4 text-left text-slate-500 text-[11px] sm:text-xs tracking-widest uppercase">Grand Total</td>
                            {globalAttendanceStatus?.map(status => {
                                const totalCol = statsData.reduce((sum: number, row) => sum + (row.stats[status] || 0), 0);
                                return (
                                    <td key={status} className="p-3 sm:p-4 text-slate-700">
                                        {totalCol > 0 ? (
                                            <div className="flex items-center justify-center">
                                                {status?.toLowerCase() === 'hadir' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></div>}
                                                {totalCol}
                                            </div>
                                        ) : "-"}
                                    </td>
                                );
                            })}
                            <td className="p-3 sm:p-4 text-slate-900 font-black">
                                {statsData.reduce((sum: number, row) => {
                                    const rowTotal = globalAttendanceStatus?.reduce((s, status) => s + (row.stats[status] || 0), 0) || 0;
                                    return sum + rowTotal;
                                }, 0)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {statsData.length === 0 && <div className="p-6 sm:p-8 text-center text-slate-400 italic text-xs sm:text-sm">Tidak ada data untuk hari ini.</div>}
          </Card>
      </div>
    </div>
    </>
  );
};

export default Dashboard;
