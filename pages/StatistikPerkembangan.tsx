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
import { useStatistikPerkembanganLogika, type StatistikPerkembanganLogika, ChartWithDownload, ComposedProgressChart, UnifiedProgressIndexChart, type UnifiedMetricDef, type UnifiedProgressIndexChartProps, type StatistikPerkembanganProps } from './StatistikPerkembangan.logika';

export * from './StatistikPerkembangan.logika';

const StatistikPerkembangan: React.FC<StatistikPerkembanganProps> = (props) => {
  const s = useStatistikPerkembanganLogika(props);
  const { globalFilterMonth, globalFilterMarhalah, globalFilterKelas, globalFilterHalaqah, globalSearchName, setPage, santri, studentProgress, studentEvaluations, classTargets, evaluationSettings, halaqah, halaqahEvalQuestions, halaqahEvaluations, appSettings, periodeEvaluasi, userProfile, masterKelas, waliKelas, attendance, masterMarhalahs, masterKelasRelasi, selectedAcademicYear, filterMarhalah, filterKelas, filterHalaqah, searchName, filterMonth, progressMap, santriMap, classTargetsMap, evalMap, availableMonths, filteredSantri, activeChartTargets, getPeriodDays, generateLineChartData, dynamicCategories, unifiedMetrics, unifiedChartData, COLORS, getOptionColor, calculatePieChartData, calculateBarChartData, dynamicChartsData, calculateHalaqahPieChartData, halaqahChartsData, activeSubtitlePrefix } = s;

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
                {dynamicChartsData.map((chart, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ChartWithDownload title={`Persentase ${chart.title}`} subtitle="Bulan Ini">
                            {chart.pieData.length > 0 ? (
                                <>
                                    <div className="flex-1 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={chart.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false} stroke="none">
                                                    {chart.pieData.map((entry, index: number) => <Cell key={`cell-${index}`} fill={getOptionColor(chart.categoryKey, entry.name, chart.options as string[])} stroke="#ffffff" strokeWidth={2} />)}
                                                </Pie>
                                                <RechartsTooltip formatter={(value: number) => `${value}%`} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-3 mt-4 flex-shrink-0">
                                        {(chart.options as string[]).map((opt: string) => (
                                            <div key={opt} className="flex items-center text-xs font-semibold text-slate-600">
                                                <span className="w-2.5 h-2.5 rounded hover:scale-110 transition-transform mr-2 shadow-sm" style={{ backgroundColor: getOptionColor(chart.categoryKey, opt, chart.options as string[]) }}></span>
                                                {opt}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                    <PieChartIcon size={32} className="text-slate-200" strokeWidth={1.5} />
                                    <p className="text-sm font-medium">Tidak ada data evaluasi</p>
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
                                    <p className="text-sm font-medium">Tidak ada data evaluasi</p>
                                </div>
                            )}
                        </ChartWithDownload>
                    </div>
                ))}

                {/* HALAQAH EVALUATION CHARTS */}
                {halaqahChartsData.length > 0 && (
                    <div className="pt-8 mt-8 border-t border-slate-200/60">
                        <h3 className="text-lg font-extrabold text-slate-800 mb-6 flex items-center"><PieChartIcon size={20} className="mr-2 text-blue-500" strokeWidth={2.5}/> Statistik Evaluasi Halaqah</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {halaqahChartsData.map((chart, idx) => (
                                <ChartWithDownload key={`halaqah-${idx}`} title={chart.title} height="300px">
                                    {chart.pieData.length > 0 ? (
                                        <>
                                            <div className="flex-1 min-h-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={chart.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false} stroke="none">
                                                            {chart.pieData.map((entry, index: number) => <Cell key={`cell-${index}`} fill={getOptionColor(chart.categoryKey, entry.name, chart.options as string[], chart.optionColors)} stroke="#ffffff" strokeWidth={2} />)}
                                                        </Pie>
                                                        <RechartsTooltip formatter={(value: number) => `${value}%`} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', fontSize: '13px', fontWeight: 600, color: '#0f172a' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="flex flex-wrap justify-center gap-2.5 mt-4 flex-shrink-0">
                                                {(chart.options as string[]).map((opt: string) => (
                                                    <div key={opt} className="flex items-center text-2xs font-semibold text-slate-600">
                                                        <span className="w-2 h-2 rounded hover:scale-110 transition-transform mr-1.5 shadow-sm" style={{ backgroundColor: getOptionColor(chart.categoryKey, opt, chart.options as string[], chart.optionColors) }}></span>
                                                        {opt}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                                            <PieChartIcon size={28} className="text-slate-200" strokeWidth={1.5} />
                                            <p className="text-xs font-medium">Tidak ada data</p>
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
