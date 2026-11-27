// Dipisah dari StatistikPerkembangan.logika.tsx (Fase 8 bagian 2).
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



export const ChartWithDownload: React.FC<{
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
        <div ref={chartRef} className="rounded-2xl border border-slate-200/60 bg-white shadow-xs overflow-hidden flex flex-col relative w-full mb-2">
            <div className="p-5 border-b border-slate-200/60 bg-slate-50/30 flex justify-between items-start">
                <div className="flex flex-col">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
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
                        <div className="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-xs border border-slate-200/80 z-50 py-1.5 text-sm font-medium animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
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
export const ComposedProgressChart: React.FC<{
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
    const { periodeEvaluasi } = useSupabaseData();
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
            const periods = periodeEvaluasi;
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
        <div ref={chartRef} className="rounded-2xl border border-slate-200/70 bg-white p-7 shadow-sm flex-1 relative w-full flex flex-col mb-2">
            <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                    <h4 className="text-base font-semibold text-slate-800 tracking-tight mb-1">
                        {displayMode === 'persentase' 
                            ? `Persentase Pencapaian Target ${title.replace('Rata-Rata ', '')}` 
                            : (showDailyAverage ? `Rata-Rata ${title.replace('Rata-Rata ', '')} (Per Hari)` : `Jumlah Rata-Rata ${title.replace('Rata-Rata ', '')}`)}
                    </h4>
                    <p className="mt-1 text-sm text-slate-500">
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
                            <div className="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-xs border border-slate-200/80 z-50 py-1.5 text-sm font-medium animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
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
export interface UnifiedMetricDef {
    id: string;
    label: string;
    color: string;
    unit: string;
    type: 'hafalan' | 'murojaah' | 'eval';
}

export interface UnifiedProgressIndexChartProps {
    data: any[];
    metrics: UnifiedMetricDef[];
    subtitlePrefix?: string;
    height?: number;
}

export const UnifiedProgressIndexChart: React.FC<UnifiedProgressIndexChartProps> = ({
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
                    <span className="text-2xs font-semibold text-slate-400">Indeks Capaian</span>
                </div>
                <div className="space-y-2">
                    {payload
                        .filter((p) => p.dataKey !== 'target_line')
                        .map((p) => {
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

    return (
        <div ref={chartRef} className="rounded-2xl border border-slate-200/70 bg-white p-6 sm:p-7 shadow-sm flex-1 relative w-full flex flex-col mb-2">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                    <h4 className="text-base font-semibold text-slate-800 tracking-tight mb-1">
                        Grafik Indeks Perkembangan & Capaian Terpadu
                    </h4>
                    {subtitlePrefix && (
                        <p className="mt-1 text-sm text-slate-500">
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
                            className="btn btn-secondary btn-sm relative"
                        >
                            <span>Pilih Metrik ({activeCount})</span>
                            <ChevronDown size={14} className="text-slate-400" />
                        </button>
                        {isMetricMenuOpen && (
                            <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xs border border-slate-100 py-2 z-[9999] flex flex-col max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                <div className="flex items-center justify-between px-3.5 py-1.5 mb-1 border-b border-slate-100 text-xs">
                                    <span className="font-semibold text-slate-400 text-xs">Pilih metrik</span>
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
                                            className="w-full text-left px-3.5 py-2 text-sm font-semibold hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                                            style={{ color: isChecked ? m.color : '#94a3b8' }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-sm flex-shrink-0 shadow-2xs" style={{ backgroundColor: isChecked ? m.color : '#cbd5e1' }} />
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
                            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xs border border-slate-100 py-1.5 z-50">
                                <button 
                                    type="button"
                                    onClick={handleDownload}
                                    className="w-full text-left px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center transition-colors cursor-pointer"
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
                            className={`inline-flex items-center gap-1.5 text-2xs font-semibold transition-all cursor-pointer select-none ${
                                isActive ? 'hover:opacity-80' : 'line-through opacity-40 hover:opacity-60'
                            }`}
                            style={{ color: isActive ? m.color : '#94a3b8' }}
                            title={`Klik untuk ${isActive ? 'sembunyikan' : 'tampilkan'} ${m.label}`}
                        >
                            <span 
                                className="w-2.5 h-2.5 rounded-sm transition-transform flex-shrink-0 shadow-2xs" 
                                style={{ backgroundColor: isActive ? m.color : '#cbd5e1' }}
                            />
                            <span>{m.label}</span>
                        </button>
                    );
                })}
                {/* Target line indicator */}
                <div className="inline-flex items-center gap-1.5 text-2xs text-slate-400 font-medium select-none ml-1">
                    <span className="w-3.5 h-0.5 border-b-[1.5px] border-dashed border-slate-300" />
                    <span>Target (100%)</span>
                </div>
            </div>
        </div>
    );
};
