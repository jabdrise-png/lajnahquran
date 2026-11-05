import React, { useState, useMemo, useEffect } from 'react'; 
import { MarhalahLabel, KelasLabel } from '../components/Labels';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { ViewMode, SchemeOption, Marhalah, ProgressType, MasterEvaluationPeriod } from '../types';
import { format } from 'date-fns';
import { getEvaluationPeriods, formatPeriodName } from '../lib/utils';
import { TrendingUp, Save, Upload, Download, Eye, EyeOff, MoreVertical, Edit2, Filter } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

// Helper
const ALL_SCHEMES: ProgressType[] = ['Ziyadah', 'Murojaah', 'Hafalan Depan', 'Hafalan Belakang', 'Total Hafalan'];
const SCHEME_COLORS: Record<string, string> = {
    'Hafalan Depan': '#3B82F6',
    'Hafalan Belakang': '#F59E0B',
    'Total Hafalan': '#10B981',
    'Murojaah': '#8B5CF6',
    'Ziyadah': '#EF4444',
    'Kefasihan Tajwid': '#14B8A6',
    'Kelancaran': '#F97316'
};

interface StudentProgressProps {
    globalFilterMonth: string;
    globalFilterMarhalah: Marhalah | 'all';
    globalFilterKelas: string | 'all';
    globalSearchName: string;
    globalViewMode: ViewMode;
    globalSelectedScheme: SchemeOption; // ignored
}

const StudentProgress: React.FC<StudentProgressProps> = ({ 
    globalFilterMonth,
    globalFilterMarhalah, 
    globalFilterKelas, 
    globalSearchName, 
    globalViewMode, 
}) => {
    const { santri, studentProgress, classTargets, addStudentProgressBatch, loading, appSettings, masterKelas, userProfile, halaqah, waliKelas , masterMarhalahs, masterKelasRelasi} = useSupabaseData();

    const viewMode = globalViewMode;

    const availableMonths = useMemo(() => {
        const masterPeriods = getEvaluationPeriods(appSettings);
        const settingMonths = masterPeriods.map(p => p.id);
        
        let filteredProgress = studentProgress;
        if (globalFilterMarhalah !== 'all') {
            filteredProgress = studentProgress.filter(p => {
                const s = santri.find(san => san.id === p.santri_id);
                return s?.marhalah === globalFilterMarhalah;
            });
        }
        const dataMonths = Array.from(new Set(filteredProgress.map(p => p.month_key))).filter(Boolean) as string[];
        
        const allSet = new Set<string>([...settingMonths, ...dataMonths]);
        const allMonths = Array.from(allSet).sort((a, b) => {
            const periodA = masterPeriods.find(mp => mp.id === a);
            const periodB = masterPeriods.find(mp => mp.id === b);
            
            const dateA = periodA?.startDate ? new Date(periodA.startDate).getTime() : 0;
            const dateB = periodB?.startDate ? new Date(periodB.startDate).getTime() : 0;
            
            if (dateA !== dateB) return dateA - dateB; // Sort ascending (oldest left, newest right)
            return a.localeCompare(b);
        });
        
        if (allMonths.length > 0) return allMonths;
        return [format(new Date(), 'yyyy-MM-dd')];
    }, [appSettings, studentProgress, santri, globalFilterMarhalah]);

    // Format localMatrix[santriId][`${month}|${scheme}`] = value
    const [localMatrix, setLocalMatrix] = useState<Record<number, Record<string, string>>>({});
    const [originalMatrix, setOriginalMatrix] = useState<Record<number, Record<string, string>>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const matrix: Record<number, Record<string, string>> = {};
        studentProgress.forEach(p => {
            if (!matrix[p.santri_id]) matrix[p.santri_id] = {};
            matrix[p.santri_id][`${p.month_key}|${p.progress_type}`] = p.value;
        });

        // Dynamic fallback computing
        Object.keys(matrix).forEach(sIdStr => {
            const sIdStrNum = parseInt(sIdStr);
            availableMonths.forEach((month: string, idx: number) => {
                const HD = parseFloat(matrix[sIdStrNum][`${month}|Hafalan Depan`] ?? '0') || 0;
                const HB = parseFloat(matrix[sIdStrNum][`${month}|Hafalan Belakang`] ?? '0') || 0;
                
                if (HD > 0 || HB > 0) {
                    if (!matrix[sIdStrNum][`${month}|Total Hafalan`]) {
                        matrix[sIdStrNum][`${month}|Total Hafalan`] = (HD + HB).toString();
                    }
                }
            });
        });

        setLocalMatrix(JSON.parse(JSON.stringify(matrix)));
        setOriginalMatrix(JSON.parse(JSON.stringify(matrix)));
    }, [studentProgress, availableMonths]);

    const sortedSantri = useMemo(() => {
        let allowedSantriIds: Set<number> | null = null;

        if (userProfile?.role === 'musammi') {
            allowedSantriIds = new Set();
            const musammiHalaqahs = halaqah.filter(h => h.is_active === true).filter(h => 
                Boolean(h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id)
            );
            musammiHalaqahs.forEach(h => {
                if (h.history) {
                    h.history.forEach((hs: any) => { if (hs.santri) allowedSantriIds!.add(hs.santri_id); });
                } else if (h.santri) {
                    h.santri.forEach(s => allowedSantriIds!.add(s.id));
                }
            });
        }

        let filtered = santri.filter(s => {
            if (s.kelas === '-') return false;
            if (allowedSantriIds && !allowedSantriIds.has(s.id)) return false;
            if (globalFilterMarhalah !== 'all' && s.marhalah !== globalFilterMarhalah) return false;
            if (globalFilterKelas !== 'all' && s.kelas !== globalFilterKelas) return false;
            if (globalSearchName && !s.nama.toLowerCase().includes(globalSearchName.toLowerCase())) return false;
            return true;
        });

        const globalMarhalahs = masterMarhalahs.map((m: any) => m.nama);
        return filtered.sort((a, b) => {
            const rankMarhalahA = globalMarhalahs.indexOf(a.marhalah);
            const rankMarhalahB = globalMarhalahs.indexOf(b.marhalah);
            if (rankMarhalahA !== rankMarhalahB) return rankMarhalahA - rankMarhalahB;
            
            if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);

            return a.nama.localeCompare(b.nama);
        });
    }, [santri, globalFilterMarhalah, globalFilterKelas, globalSearchName, userProfile, halaqah]);

    const handleInputChange = (santriId: number, month: string, scheme: string, value: string) => {
        setLocalMatrix(prev => {
            const next = { ...prev };
            if (!next[santriId]) next[santriId] = {};
            next[santriId] = { ...next[santriId], [`${month}|${scheme}`]: value };

            // Auto calculations
            const getVal = (vMonth: string, vScheme: string) => parseFloat(next[santriId]?.[`${vMonth}|${vScheme}`] ?? '0') || 0;
            
            if (scheme === 'Hafalan Depan' || scheme === 'Hafalan Belakang') {
                const HD = getVal(month, 'Hafalan Depan');
                const HB = getVal(month, 'Hafalan Belakang');
                next[santriId][`${month}|Total Hafalan`] = (HD + HB).toString();
            }

            return next;
        });
    };

    const handleBatchSave = async () => {
        setIsSaving(true);
        try {
            const recordsToSave: any[] = [];
            Object.keys(localMatrix).forEach(sIdStr => {
                const sId = parseInt(sIdStr);
                const monthsData = localMatrix[sId];
                Object.keys(monthsData).forEach(key => {
                    const val = monthsData[key];
                    const originalVal = originalMatrix[sId]?.[key];
                    if (val !== originalVal) {
                        const [month, scheme] = key.split('|');
                        recordsToSave.push({
                            santri_id: sId,
                            month_key: month,
                            progress_type: scheme,
                            value: val
                        });
                    }
                });
            });

            if (recordsToSave.length > 0) {
                await addStudentProgressBatch(recordsToSave);
                alert("Data berhasil disimpan!");
            } else {
                alert("Tidak ada perubahan data.");
            }
        } catch (e) {
            console.error("Failed to save progress", e);
            alert("Gagal menyimpan data.");
        } finally {
            setIsSaving(false);
        }
    };

        const [isChartMenuOpen, setIsChartMenuOpen] = useState(false);
        const [hiddenSchemes, setHiddenSchemes] = useState<string[]>(['Hafalan Depan', 'Hafalan Belakang']);

        const chartData = useMemo(() => {
            return availableMonths.map(month => {
                const entry: any = { name: formatPeriodName(month, appSettings, globalFilterMarhalah) };
                ALL_SCHEMES.forEach(scheme => {
                    let total = 0;
                    let count = 0;
                    sortedSantri.forEach(s => {
                        const valStr = localMatrix[s.id]?.[`${month}|${scheme}`];
                        if (valStr) {
                            const val = parseFloat(valStr);
                            if (!isNaN(val)) {
                                total += (scheme === 'Ziyadah' ? val / 20 : val);
                                count++;
                            }
                        }
                    });
                    entry[scheme] = count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
                });
                return entry;
            });
        }, [availableMonths, sortedSantri, localMatrix]);

        const toggleSchemeVisibility = (scheme: string) => {
            setHiddenSchemes(prev => 
                prev.includes(scheme) ? prev.filter(s => s !== scheme) : [...prev, scheme]
            );
        };

        if (loading) return <div className="p-8 text-center text-slate-500">Memuat data...</div>;



        return (
            <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto w-full max-h-[600px] relative hide-scrollbar">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50 sticky top-0 z-40 shadow-[0_2px_5px_rgba(0,0,0,0.05)]">
                            <tr>
                                <th rowSpan={2} className="px-3 py-4 text-center text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 border-r border-slate-200 w-[50px] min-w-[50px] max-w-[50px] sticky left-0 z-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">No</th>
                                <th rowSpan={2} className="px-4 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 border-r border-slate-200 w-[200px] min-w-[200px] max-w-[200px] sticky left-[50px] z-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Nama Santri</th>
                                <th rowSpan={2} className="px-4 py-4 text-center text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 border-r border-slate-200 w-[100px] min-w-[100px] max-w-[100px] sticky left-[250px] z-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">Kelas</th>
                                {ALL_SCHEMES.map(scheme => (
                                    <th key={scheme} colSpan={availableMonths.length} className="px-4 py-3 text-center text-[11px] font-bold text-white uppercase tracking-widest border-b border-r border-blue-700 bg-blue-600">
                                        {scheme}
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                {ALL_SCHEMES.map(scheme => 
                                    availableMonths.map(month => (
                                        <th key={`${scheme}-${month}`} className="px-3 py-2 text-center text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-blue-50 border-b border-r border-slate-200 whitespace-nowrap min-w-[100px]">
                                            {formatPeriodName(month, appSettings, globalFilterMarhalah)}
                                        </th>
                                    ))
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                            {sortedSantri.length === 0 ? (
                                <tr>
                                    <td colSpan={3 + (ALL_SCHEMES.length * availableMonths.length)} className="px-6 py-12 text-center">
                                        <div className="text-slate-400 mb-2">Tidak ada data santri yang sesuai kriteria.</div>
                                    </td>
                                </tr>
                            ) : (
                                sortedSantri.map((s, index) => (
                                    <tr key={s.id} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="px-3 py-3 text-center text-sm font-medium text-slate-400 bg-white group-hover:bg-blue-50 border-r border-slate-100 w-[50px] min-w-[50px] max-w-[50px] sticky left-0 z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">{index + 1}</td>
                                        <td className="px-4 py-3 bg-white border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] w-[200px] min-w-[200px] max-w-[200px] sticky left-[50px] z-30 group-hover:bg-blue-50 transition-colors">
                                            <div className="font-bold text-slate-800 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{s.nama}</div>
                                            <div className="text-[11px] text-slate-500 overflow-hidden text-ellipsis">{s.nis || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center border-r border-slate-100 w-[100px] min-w-[100px] max-w-[100px] sticky left-[250px] z-30 bg-white group-hover:bg-blue-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                                            <span className="inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-bold tracking-wide bg-slate-100 text-slate-600 whitespace-nowrap">
                                                <KelasLabel text={s.kelas} id={s.kelas_id} />
                                            </span>
                                        </td>
                                        {ALL_SCHEMES.map(scheme => 
                                            availableMonths.map(month => {
                                                const key = `${month}|${scheme}`;
                                                const isAuto = scheme === 'Total Hafalan';
                                                const originalVal = originalMatrix[s.id]?.[key];
                                                const currentVal = localMatrix[s.id]?.[key] ?? '';
                                                const isChanged = originalVal !== currentVal && !isAuto;

                                                return (
                                                    <td key={`${s.id}-${key}`} className={`p-1.5 border-r border-slate-100 min-w-[70px] ${isAuto ? 'bg-slate-50' : ''}`}>
                                                        <div 
                                                            className={`w-full text-center text-sm font-medium px-2 py-1.5 rounded transition-all ${
                                                                isAuto 
                                                                    ? 'text-slate-500' 
                                                                    : 'text-slate-700 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {currentVal || '-'}
                                                        </div>
                                                    </td>
                                                );
                                            })
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StudentProgress;
