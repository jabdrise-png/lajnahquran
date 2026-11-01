import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HalaqahPerformanceChart } from './HalaqahPerformanceChart';
import Card from '../components/Card';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Marhalah, ProgressType, StudentEvaluation } from '../types';
import { getEvaluationPeriods, formatPeriodName } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, ComposedChart, CartesianGrid, XAxis, YAxis, Line, Bar, AreaChart, Area } from 'recharts';
import { ArrowLeft, TrendingUp, MoreVertical, Download, EyeOff, Eye, BarChart2, PieChart as PieChartIcon, Filter, Check, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';

const ChartWithDownload: React.FC<{
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    height?: string;
}> = ({ title, subtitle, children, height = '320px' }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDownload = async () => {
        if (chartRef.current) {
            try {
                const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
                const url = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.download = `${title.replace(/\s+/g, '_')}_Chart.png`;
                link.href = url;
                link.click();
            } catch (err) {
                console.error("Error downloading chart", err);
            }
        }
        setIsMenuOpen(false);
    };

    return (
        <div ref={chartRef} className="rounded-2xl border border-slate-200/60 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_4px_16px_0_rgba(0,0,0,0.02)] overflow-hidden flex flex-col relative w-full mb-2">
            <div className="p-5 border-b border-slate-200/60 bg-slate-50/30 flex justify-between items-start">
                <div className="flex flex-col">
                    <h3 className="text-[15px] font-bold text-slate-900 tracking-tight">
                        {title}
                        {subtitle && <span className="text-slate-400 font-medium ml-1">({subtitle})</span>}
                    </h3>
                </div>
                <div className="relative" ref={menuRef} data-html2canvas-ignore="true">
                    <button 
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <MoreVertical size={18} />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/80 z-50 py-1.5 text-[13px] font-medium animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                            <button onClick={handleDownload} className="flex items-center w-full px-4 py-2 text-left hover:bg-slate-50 text-slate-700 transition-colors">
                                <Download size={14} className="mr-2.5 text-blue-500"/> Download Chart
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className={`p-6 flex flex-col`} style={{ height: height }}>
                {children}
            </div>
        </div>
    );
};

// --- Internal Chart Component with Menu ---
const ComposedProgressChart: React.FC<{
    data: any[];
    dataKey: string;
    title: string;
    subtitlePrefix?: string;
    color: string;
    baseUnit: string;
    targetStart?: number;
    targetEnd?: number;
    height?: number;
    appSettings?: any[];
}> = ({ data, dataKey, title, subtitlePrefix, color, baseUnit, targetStart, targetEnd, height = 250, appSettings = [] }) => {
    const [showDailyAverage, setShowDailyAverage] = useState(false);
    const [showLine, setShowLine] = useState(true);
    const [displayMode, setDisplayMode] = useState<'rata_rata' | 'persentase'>('persentase');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDownload = async () => {
        if (chartRef.current) {
            try {
                const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
                const url = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.download = `${title.replace(/\s/g, '_')}_Chart.png`;
                link.href = url;
                link.click();
            } catch (err) {
                console.error("Error downloading chart", err);
            }
        }
        setIsMenuOpen(false);
    };

    const chartDataWithTarget = useMemo(() => {
        if (data.length === 0) return data;
        
        let masterPeriodsList: string[] = [];
        try {
            const periods = getEvaluationPeriods(appSettings);
            masterPeriodsList = periods.sort((a, b) => {
                const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
                const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
                if (dateA !== dateB) return dateA - dateB;
                return a.id.localeCompare(b.id);
            }).map(p => p.id);
        } catch (e) {}

        const tEnd = Number(targetEnd) || 0;

        return data.map(item => {
            let currentVal = item.rawAvg !== undefined ? item.rawAvg : item[dataKey];
            let currentTarget = item.dynamicTarget !== undefined ? item.dynamicTarget : (tEnd || 0);

            if (showDailyAverage && item.periodDays) {
                currentVal = currentVal / item.periodDays;
                if (currentTarget) currentTarget = currentTarget / item.periodDays;
            }

            return { 
                ...item, 
                [dataKey]: parseFloat(currentVal.toFixed(2)), 
                target: currentTarget ? parseFloat(currentTarget.toFixed(2)) : undefined 
            };
        });
    }, [data, targetStart, targetEnd, showDailyAverage, appSettings, dataKey]);

    const finalChartData = useMemo(() => {
        if (displayMode === 'rata_rata') return chartDataWithTarget;
        return chartDataWithTarget.map(item => {
            const targetVal = item.target;
            let percentage = 0;
            
            if (item.precalculatedPercentage !== undefined) {
                percentage = item.precalculatedPercentage;
            } else if (targetVal && targetVal > 0) {
                percentage = (item[dataKey] / targetVal) * 100;
            } else if (item[dataKey] > 0) {
                 percentage = 100;
            }
            
            return {
                ...item,
                [dataKey]: parseFloat(percentage.toFixed(1)),
                target: 100,
                originalValue: item[dataKey]
            };
        });
    }, [chartDataWithTarget, displayMode, dataKey]);

    const displayUnit = displayMode === 'persentase' ? '%' : (showDailyAverage ? baseUnit + '/hari' : baseUnit);

    return (
        <div ref={chartRef} className="rounded-[1.25rem] border border-slate-200/70 bg-white p-7 shadow-sm flex-1 relative w-full flex flex-col mb-2">
            <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                    <h4 className="text-[15px] font-semibold text-slate-800 tracking-tight mb-1">
                        {displayMode === 'persentase' 
                            ? `Persentase Pencapaian Target ${title.replace('Rata-Rata ', '')}` 
                            : (showDailyAverage ? `Rata-Rata ${title.replace('Rata-Rata ', '')} (Per Hari)` : `Jumlah Rata-Rata ${title.replace('Rata-Rata ', '')}`)}
                    </h4>
                    <p className="text-[13px] text-slate-500 font-medium">
                        {subtitlePrefix ? `${subtitlePrefix} (${displayMode === 'persentase' ? '%' : (showDailyAverage ? baseUnit + '/hari' : baseUnit)})` : `Semua marhalah (${displayMode === 'persentase' ? '%' : (showDailyAverage ? baseUnit + '/hari' : baseUnit)})`}
                    </p>
                </div>
                <div className="flex items-center gap-2">

                    <div className="relative" ref={menuRef} data-html2canvas-ignore="true">
                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <MoreVertical size={18} />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/80 z-50 py-1.5 text-[13px] font-medium animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                <button onClick={handleDownload} className="flex items-center w-full px-4 py-2 text-left hover:bg-slate-50 text-slate-700 transition-colors">
                                    <Download size={14} className="mr-2.5 text-blue-500"/> Download Chart
                                </button>
                                <button onClick={() => { setShowLine(!showLine); setIsMenuOpen(false); }} className="flex items-center w-full px-4 py-2 text-left hover:bg-slate-50 text-slate-700 transition-colors">
                                    {showLine ? <EyeOff size={14} className="mr-2.5 text-slate-400"/> : <Eye size={14} className="mr-2.5 text-emerald-500"/>}
                                    {showLine ? 'Sembunyikan Garis' : 'Tampilkan Garis'}
                                </button>
                                <div className="border-t border-slate-100 my-1"></div>
                                <label className="flex items-center w-full px-4 py-2 text-left hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer">
                                    <input type="checkbox" checked={showDailyAverage} onChange={(e) => setShowDailyAverage(e.target.checked)} className="mr-2.5 rounded text-blue-500 focus:ring-blue-500" />
                                    Rata-rata per Hari
                                </label>
                                <label className="flex items-center w-full px-4 py-2 text-left hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer">
                                    <input type="checkbox" checked={displayMode === 'persentase'} onChange={(e) => setDisplayMode(e.target.checked ? 'persentase' : 'rata_rata')} className="mr-2.5 rounded text-blue-500 focus:ring-blue-500" />
                                    Persentase Pencapaian
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div style={{ height: height, minHeight: height, width: '100%' }} className="mt-2 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={finalChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`colorValue-${title.replace(/\s+/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.15}/>
                          <stop offset="95%" stopColor={color} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                        {/* Removed CartesianGrid to match reference design */}
                        
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} 
                            dy={15}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} 
                            dx={-10}
                            tickFormatter={(val) => displayMode === 'persentase' ? `${val}%` : val}
                        />
                        <RechartsTooltip 
                            contentStyle={{ 
                                backgroundColor: '#ffffff', 
                                borderRadius: '12px', 
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#0f172a'
                            }}
                            formatter={(value: any, name: any) => [
                                `${value} ${displayUnit}`, 
                                name === 'target' ? 'Target' : 'Capaian'
                            ]}
                            cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                        />
                        {chartDataWithTarget.some(item => item.target !== undefined) && (
                             <Line 
                                type="linear"
                                dataKey="target"
                                stroke="#f43f5e"
                                strokeDasharray="5 5"
                                strokeWidth={2}
                                dot={false}
                                activeDot={false}
                                name="target"
                             />
                        )}
                        {showLine && (
                            <Area 
                                type="monotone" 
                                dataKey="value" 
                                stroke={color} 
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill={`url(#colorValue-${title.replace(/\s+/g, '-')})`}
                                activeDot={{ r: 6, fill: color, stroke: "#ffffff", strokeWidth: 2 }} 
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// --- Unified Multi-Metric Index Chart Component ---
interface UnifiedMetricDef {
    id: string;
    label: string;
    color: string;
    unit: string;
    type: 'hafalan' | 'murojaah' | 'eval';
}

interface UnifiedProgressIndexChartProps {
    data: any[];
    metrics: UnifiedMetricDef[];
    subtitlePrefix?: string;
    height?: number;
}

const UnifiedProgressIndexChart: React.FC<UnifiedProgressIndexChartProps> = ({
    data,
    metrics,
    subtitlePrefix,
    height = 360
}) => {
    const [activeMetrics, setActiveMetrics] = useState<Record<string, boolean>>({});
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMetricMenuOpen, setIsMetricMenuOpen] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const metricMenuRef = useRef<HTMLDivElement>(null);

    const effectiveActiveMetrics = useMemo(() => {
        const res: Record<string, boolean> = {};
        metrics.forEach(m => {
            res[m.id] = activeMetrics[m.id] !== undefined ? activeMetrics[m.id] : true;
        });
        return res;
    }, [metrics, activeMetrics]);

    const activeCount = useMemo(() => {
        return metrics.filter(m => effectiveActiveMetrics[m.id]).length;
    }, [metrics, effectiveActiveMetrics]);

    const allActive = useMemo(() => {
        return metrics.every(m => effectiveActiveMetrics[m.id]);
    }, [metrics, effectiveActiveMetrics]);

    const toggleMetric = (id: string) => {
        setActiveMetrics(prev => ({
            ...prev,
            [id]: prev[id] !== undefined ? !prev[id] : false
        }));
    };

    const toggleAll = () => {
        const nextState = !allActive;
        const newMap: Record<string, boolean> = {};
        metrics.forEach(m => {
            newMap[m.id] = nextState;
        });
        setActiveMetrics(newMap);
    };

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
                const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 });
                const url = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.download = `Grafik_Indeks_Perkembangan_Terpadu.png`;
                link.href = url;
                link.click();
            } catch (err) {
                console.error("Error downloading chart", err);
            }
        }
        setIsMenuOpen(false);
    };

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
                            const m = metrics.find(x => x.id === p.dataKey);
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
                                const count = dataPoint?.[`${m.id}_count`];
                                realValueStr = count ? `(${count} santri)` : '';
                            }

                            return (
                                <div key={m.id} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
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

    return (
        <div ref={chartRef} className="rounded-[1.25rem] border border-slate-200/70 bg-white p-6 sm:p-7 shadow-sm flex-1 relative w-full flex flex-col mb-2">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                    <h4 className="text-[15px] font-semibold text-slate-800 tracking-tight mb-1">
                        Grafik Indeks Perkembangan & Capaian Terpadu
                    </h4>
                    {subtitlePrefix && (
                        <p className="text-[13px] text-slate-500 font-medium">
                            {subtitlePrefix}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3 relative z-[100]" data-html2canvas-ignore="true">
                    {/* Metric Selection Dropdown with Checkboxes */}
                    <div className="relative" ref={metricMenuRef}>
                        <button 
                            type="button"
                            onClick={() => setIsMetricMenuOpen(!isMetricMenuOpen)}
                            className="flex items-center gap-2 text-[13px] font-medium bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 focus:outline-none hover:bg-slate-50 transition-colors shadow-xs relative cursor-pointer"
                        >
                            <span>Pilih Metrik ({activeCount})</span>
                            <ChevronDown size={14} className="text-slate-400" />
                        </button>
                        {isMetricMenuOpen && (
                            <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12)] border border-slate-100 py-2 z-[9999] flex flex-col max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                <div className="flex items-center justify-between px-3.5 py-1.5 mb-1 border-b border-slate-100 text-xs">
                                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Filter Metrik</span>
                                    <button
                                        type="button"
                                        onClick={toggleAll}
                                        className="font-bold text-blue-600 hover:text-blue-700 text-xs transition-colors cursor-pointer"
                                    >
                                        {allActive ? 'Kosongkan' : 'Pilih Semua'}
                                    </button>
                                </div>
                                {metrics.map(m => {
                                    const isChecked = effectiveActiveMetrics[m.id];
                                    return (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => toggleMetric(m.id)}
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
                    <div className="relative" ref={menuRef}>
                        <button 
                            type="button"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors focus:outline-none cursor-pointer"
                            title="Opsi Grafik"
                        >
                            <MoreVertical size={18} />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] border border-slate-100 py-1.5 z-50">
                                <button 
                                    type="button"
                                    onClick={handleDownload}
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
            <div style={{ height: height, minHeight: height, width: '100%' }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 5 }}>
                        <defs>
                            {metrics.map(m => {
                                const gradId = `colorValue-${m.id.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
                        {metrics.map(m => {
                            if (!effectiveActiveMetrics[m.id]) return null;
                            const gradId = `colorValue-${m.id.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
                {metrics.map(m => {
                    const isActive = effectiveActiveMetrics[m.id];
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMetric(m.id)}
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
    );
};


interface StatistikPerkembanganProps {
    globalFilterMonth: string;
    globalFilterMarhalah: string | 'all';
    globalFilterKelas: string | 'all';
    globalFilterHalaqah: string | 'all';
    globalSearchName: string;
    setPage: (page: string) => void;
}

const StatistikPerkembangan: React.FC<StatistikPerkembanganProps> = ({
    globalFilterMonth,
    globalFilterMarhalah,
    globalFilterKelas,
    globalFilterHalaqah,
    globalSearchName,
    setPage
}) => {
    const { santri, studentProgress, studentEvaluations, classTargets, evaluationSettings, halaqah, halaqahEvalQuestions, halaqahEvaluations, appSettings, userProfile, masterKelas, waliKelas, attendance , masterMarhalahs, masterKelasRelasi, selectedAcademicYear } = useSupabaseData();
    
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
            const mName = ct.marhalah_id ? (masterMarhalahs?.find((m: any) => m.id === ct.marhalah_id)?.nama || ct.marhalah) : ct.marhalah;
            const kName = ct.kelas_id ? (masterKelasRelasi?.find((k: any) => k.id === ct.kelas_id)?.nama_kelas || ct.kelas) : ct.kelas;
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
        const masterPeriods = getEvaluationPeriods(appSettings);
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

        if (userProfile?.role === 'pengajar' || userProfile?.role === 'musammi') {
            allowedSantriIds = new Set();
            if (userProfile?.role === 'pengajar') {
                const myKelasNames = waliKelas.filter(w => w.user_id === userProfile.id).map(w => ({ marhalah: w.marhalah, kelas: w.kelas }));
                santri.filter(s => myKelasNames.some(wc => wc.marhalah === s.marhalah && wc.kelas === s.kelas)).forEach(s => allowedSantriIds.add(s.id));
            }
            
            const musammiHalaqahs = halaqah.filter(h => h.is_active === true).filter(h => 
                (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) || 
                (h.musammi?.nama?.toLowerCase().trim() === userProfile?.name?.toLowerCase().trim())
            );
            musammiHalaqahs.forEach(h => {
                if (h.history) {
                    h.history.forEach((hs: any) => { if (hs.santri) allowedSantriIds.add(hs.santri_id); });
                } else if (h.santri) {
                    h.santri.forEach(s => allowedSantriIds.add(s.id));
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
                    if (!h.history.find((hs: any) => hs.santri_id === s.id)) return false;
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
        const masterPeriods = getEvaluationPeriods(appSettings);
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
            const setting = appSettings.find((s: any) => s.key === 'TARGET_MUROJAAH_GLOBAL');
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
                    const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
                    studentTarget = ct?.target_hafalan || 30; // 30 Juz default
                } else if (type === 'Ziyadah') {
                    const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
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
                    const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
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
                        const ct = (classTargetsMap.get(`${s.marhalah_id ? masterMarhalahs?.find((m: any) => m.id === s.marhalah_id)?.nama || s.marhalah : s.marhalah}_${s.kelas_id ? masterKelasRelasi?.find((k: any) => k.id === s.kelas_id)?.nama_kelas || s.kelas : s.kelas}`) );
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
                name: formatPeriodName(month, appSettings, filterMarhalah), 
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
                name: hData?.name || formatPeriodName(month, appSettings, filterMarhalah),
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

        const idx = fallbackOptions.findIndex((opt: any) => (typeof opt === 'object' ? opt.label : opt) === optionName);
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
            month: formatPeriodName(month, appSettings, filterMarhalah),
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
        const masterPeriods = getEvaluationPeriods(appSettings);

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
        const options = q.options?.map((o: any) => typeof o === 'object' ? o.label : o) || [];
        const optionColors: Record<string, string> = {};
        (q.options || []).forEach((o: any) => {
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

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
            {/* UNIFIED COMPOSITE INDEX CHART (PALING ATAS) */}
            <UnifiedProgressIndexChart
                data={unifiedChartData}
                metrics={unifiedMetrics}
                subtitlePrefix={activeSubtitlePrefix}
                height={350}
            />

            {/* LINE CHARTS */}
            <div className="grid grid-cols-1 gap-6">
                <ComposedProgressChart 
                    data={generateLineChartData('Total Hafalan')} 
                    dataKey="value" title="Rata-Rata Hafalan" subtitlePrefix={activeSubtitlePrefix} color="#10B981" baseUnit="Juz"
                    
                    height={320}
                    appSettings={appSettings}
                />
                <ComposedProgressChart 
                    data={generateLineChartData('Murojaah')} 
                    dataKey="value" title="Rata-Rata Murojaah" subtitlePrefix={activeSubtitlePrefix} color="#F59E0B" baseUnit="Juz"
                    height={320}
                    appSettings={appSettings}
                />
                <ComposedProgressChart 
                    data={generateLineChartData('Ziyadah')} 
                    dataKey="value" title="Rata-Rata Ziyadah" subtitlePrefix={activeSubtitlePrefix} color="#3B82F6" baseUnit="Halaman"
                    height={320}
                    appSettings={appSettings}
                />
            </div>

            <HalaqahPerformanceChart filterMonth={filterMonth} 
                studentProgress={studentProgress}
                halaqah={halaqah}
                halaqahEvaluations={halaqahEvaluations}
                filteredSantri={filteredSantri}
                availableMonths={availableMonths}
                classTargets={classTargets}
                evaluationSettings={evaluationSettings}
                appSettings={appSettings}
                attendance={attendance}
                filterHalaqah={filterHalaqah}
                filterMarhalah={filterMarhalah}
            />

            {/* EVALUATION CHARTS */}
            <div className="space-y-6 mt-8">
                {dynamicChartsData.map((chart: any, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ChartWithDownload title={`Persentase ${chart.title}`} subtitle="Bulan Ini">
                            {chart.pieData.length > 0 ? (
                                <>
                                    <div className="flex-1 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={chart.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false} stroke="none">
                                                    {chart.pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={getOptionColor(chart.categoryKey, entry.name, chart.options as string[])} stroke="#ffffff" strokeWidth={2} />)}
                                                </Pie>
                                                <RechartsTooltip formatter={(value: number) => `${value}%`} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-3 mt-4 flex-shrink-0">
                                        {(chart.options as string[]).map((opt: string) => (
                                            <div key={opt} className="flex items-center text-[12px] font-semibold text-slate-600">
                                                <span className="w-2.5 h-2.5 rounded hover:scale-110 transition-transform mr-2 shadow-sm" style={{ backgroundColor: getOptionColor(chart.categoryKey, opt, chart.options as string[]) }}></span>
                                                {opt}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                    <PieChartIcon size={32} className="text-slate-200" strokeWidth={1.5} />
                                    <p className="text-[13px] font-medium">Tidak ada data evaluasi</p>
                                </div>
                            )}
                        </ChartWithDownload>
                        <ChartWithDownload title={`Perbandingan Persentase ${chart.title}`} subtitle="Semua Bulan">
                            {chart.barData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chart.barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} />
                                        <RechartsTooltip formatter={(value: number) => `${value}%`} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: '500', color: '#64748b', paddingTop: '10px' }} iconType="circle" />
                                        {(chart.options as string[]).map((opt: string, oIdx: number) => (
                                            <Bar key={opt} dataKey={opt} stackId="a" fill={getOptionColor(chart.categoryKey, opt, chart.options as string[])} radius={oIdx === chart.options.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                                        ))}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                    <BarChart2 size={32} className="text-slate-200" strokeWidth={1.5} />
                                    <p className="text-[13px] font-medium">Tidak ada data evaluasi</p>
                                </div>
                            )}
                        </ChartWithDownload>
                    </div>
                ))}

                {/* HALAQAH EVALUATION CHARTS */}
                {halaqahChartsData.length > 0 && (
                    <div className="pt-8 mt-8 border-t border-slate-200/60">
                        <h3 className="text-[18px] font-extrabold text-slate-800 mb-6 flex items-center"><PieChartIcon size={20} className="mr-2 text-indigo-500" strokeWidth={2.5}/> Statistik Evaluasi Halaqah</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {halaqahChartsData.map((chart, idx) => (
                                <ChartWithDownload key={`halaqah-${idx}`} title={chart.title} height="300px">
                                    {chart.pieData.length > 0 ? (
                                        <>
                                            <div className="flex-1 min-h-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={chart.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false} stroke="none">
                                                            {chart.pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={getOptionColor(chart.categoryKey, entry.name, chart.options as string[], chart.optionColors)} stroke="#ffffff" strokeWidth={2} />)}
                                                        </Pie>
                                                        <RechartsTooltip formatter={(value: number) => `${value}%`} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="flex flex-wrap justify-center gap-2.5 mt-4 flex-shrink-0">
                                                {(chart.options as string[]).map((opt: string) => (
                                                    <div key={opt} className="flex items-center text-[11px] font-semibold text-slate-600">
                                                        <span className="w-2 h-2 rounded hover:scale-110 transition-transform mr-1.5 shadow-sm" style={{ backgroundColor: getOptionColor(chart.categoryKey, opt, chart.options as string[], chart.optionColors) }}></span>
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                            <PieChartIcon size={28} className="text-slate-200" strokeWidth={1.5} />
                                            <p className="text-[12px] font-medium">Tidak ada data</p>
                                        </div>
                                    )}
                                </ChartWithDownload>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatistikPerkembangan;
