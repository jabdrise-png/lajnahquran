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
import { useSantriDetailProgressViewLogika, type SantriDetailProgressViewLogika, type SantriDetailProgressViewProps } from './SantriDetailProgressView.logika';

export * from './SantriDetailProgressView.logika';

export const SantriDetailProgressView: React.FC<SantriDetailProgressViewProps> = (props) => {
  const s = useSantriDetailProgressViewLogika(props);
  const { santri, selectedPeriod, onPeriodChange, periods, appSettings, halaqahList, studentProgress, localProgress, studentEvaluations, attendance, setoranHarian, allCategories, getOptions, evalColors, classTargets, onBack, normDate, formatDateDisplay, isMatchSantri, pStart, pEnd, getPeriodDateLabel, halaqahHistory, activeHalaqahInfo, progressMap, currentEval, hafalanDepanStr, hafalanDepan, suratAyatDepan, hafalanBelakangStr, hafalanBelakang, suratAyatBelakang, totalHafalanCalc, explicitTotalHafalanStr, totalHafalan, ziyadahStr, ziyadah, murojaahStr, murojaah, studentTarget, targetHafalan, pctHafalan, targetMurojaah, pctMurojaah, nilaiRanges, availableSkemas, skemaPeriodStats, kedisiplinanStats, categoryGridColsClass, chronologicalPeriods, chartMetrics, activeChartMetrics, setActiveChartMetrics, isChartMenuOpen, setIsChartMenuOpen, isChartMetricMenuOpen, setIsChartMetricMenuOpen, chartRef, chartMenuRef, chartMetricMenuRef, effectiveActiveMetrics, activeChartCount, allChartActive, toggleChartMetric, toggleAllChartMetrics, handleDownloadChart, santriChartData, CustomTooltip, tablePeriodFilter, setTablePeriodFilter, tableSkemaFilter, setTableSkemaFilter, tableSetoranList } = s;

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
                        <h4 className="text-base font-semibold text-slate-800 tracking-tight mb-1">
                            Grafik Indeks Perkembangan & Capaian Terpadu
                        </h4>
                    </div>
                    <div className="flex items-center gap-3 relative z-[100]" data-html2canvas-ignore="true">
                        {/* Dropdown Metric Filter with Checkboxes */}
                        <div className="relative" ref={chartMetricMenuRef}>
                            <button 
                                type="button"
                                onClick={() => setIsChartMetricMenuOpen(!isChartMetricMenuOpen)}
                                className="btn btn-secondary btn-sm relative"
                            >
                                <span>Pilih Metrik ({activeChartCount})</span>
                                <ChevronDown size={14} className="text-slate-400" />
                            </button>
                            {isChartMetricMenuOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xs border border-slate-100 py-2 z-[9999] flex flex-col max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                    <div className="flex items-center justify-between px-3.5 py-1.5 mb-1 border-b border-slate-100 text-xs">
                                        <span className="font-semibold text-slate-400 text-xs">Pilih metrik</span>
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
                                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xs border border-slate-100 py-1.5 z-50">
                                    <button 
                                        type="button"
                                        onClick={handleDownloadChart}
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
                            <span className="text-xs font-semibold text-slate-500 block mb-1">
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
                            <span className="text-xs font-semibold text-slate-500 block mb-1">
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
                            <span className="text-xs font-semibold text-slate-500 block mb-1">
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
                        <h3 className="text-sm font-semibold text-slate-800 mb-4">
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
                                        <div className="text-xs font-semibold text-slate-600 mb-3 leading-snug break-words">
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
                        <h3 className="text-xs font-semibold text-slate-700 mb-3">
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
                                <span className="text-xs font-semibold text-slate-500">
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
                        <div className="mt-4 pt-3 border-t border-slate-200/60 text-2xs text-slate-400 font-medium">
                            Total Seluruh: {skemaPeriodStats.reduce((acc, s) => acc + s.frekuensi, 0)} kali setoran
                        </div>
                    </div>

                    {/* Card 2: Persentase Kelancaran & Nilai Rata-rata */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
                                <span className="text-xs font-semibold text-slate-500">
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
                        <div className="mt-4 pt-3 border-t border-slate-200/60 text-2xs text-slate-400 font-medium">
                            Rata-rata kelancaran & predikat nilai per skema
                        </div>
                    </div>

                    {/* Card 3: Kedisiplinan */}
                    <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
                                <span className="text-xs font-semibold text-slate-500">
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
                                        <span className="text-2xs text-slate-400 font-normal">
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
                        <div className="mt-4 pt-3 border-t border-slate-200/60 text-2xs text-slate-400 font-medium">
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
                    <div className="wadah-tabel overflow-x-auto">
                        <table className="tabel">
                            <thead>
                                <tr>
                                    <th className="w-12 text-center">No</th>
                                    <th>Tanggal</th>
                                    <th>Waktu</th>
                                    <th>Skema</th>
                                    <th className="min-w-[180px]">Surat & Ayat</th>
                                    <th className="text-center">Jml Hal</th>
                                    <th className="text-center">Nilai</th>
                                    <th className="text-center">Kesalahan</th>
                                    <th className="min-w-[160px]">Keterangan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableSetoranList.map((sh, idx) => (
                                    <tr key={sh.id}>
                                        <td className="text-center text-slate-400 font-medium">
                                            {idx + 1}
                                        </td>
                                        <td className="font-bold text-slate-900 whitespace-nowrap">
                                            {formatDateDisplay(sh.tanggal)}
                                        </td>
                                        <td className="text-slate-500 whitespace-nowrap font-medium">
                                            {sh.waktu || '-'}
                                        </td>
                                        <td className="whitespace-nowrap">
                                            <span className="font-bold text-blue-600">
                                                {sh.skema || '-'}
                                            </span>
                                        </td>
                                        <td className="text-slate-900 font-semibold">
                                            {sh.surat || '-'}
                                            {sh.ayat && (
                                                <span className="text-slate-500 font-normal ml-1">
                                                    (Ayat {sh.ayat})
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-center font-bold text-slate-800">
                                            {sh.jumlah_halaman ?? '-'}
                                        </td>
                                        <td className="text-center font-bold text-slate-700">
                                            {sh.nilai || '-'}
                                        </td>
                                        <td className="text-center text-slate-600 font-semibold">
                                            <span className="text-red-600">K:{sh.kesalahan_kabir || 0}</span>
                                            <span className="text-slate-300 mx-1.5">•</span>
                                            <span className="text-amber-600">S:{sh.kesalahan_shoghir || 0}</span>
                                        </td>
                                        <td className="text-slate-500 text-2xs truncate max-w-[220px]" title={sh.keterangan || ''}>
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
                    <div className="wadah-tabel overflow-y-auto max-h-[185px] relative overflow-x-auto">
                        <table className="tabel">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th>Nama Halaqah</th>
                                    <th>Jenis Halaqah</th>
                                    <th>Pengampu / Musammi</th>
                                    <th>Periode Keanggotaan</th>
                                    <th className="text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {halaqahHistory.map((h, i) => (
                                    <tr key={i}>
                                        <td className="font-bold text-slate-800">
                                            {h.halaqahNama}
                                        </td>
                                        <td className="text-slate-600 font-medium">
                                            {h.jenis || '-'}
                                        </td>
                                        <td className="text-slate-700 font-medium">
                                            {h.musammiNama}
                                        </td>
                                        <td className="text-slate-600 font-medium">
                                            {formatDateDisplay(h.startDate)}
                                            <span className="text-slate-300 mx-1.5">–</span>
                                            {h.endDate ? formatDateDisplay(h.endDate) : (
                                                <span className="text-emerald-600 font-semibold">Sekarang</span>
                                            )}
                                        </td>
                                        <td className="text-right font-medium">
                                            {h.isCurrent ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Aktif
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold text-slate-500 bg-slate-100">
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
                    className="btn btn-secondary btn-sm"
                >
                    <ArrowLeft size={16} />
                    <span>Kembali ke Evaluasi</span>
                </button>
            </div>
        </div>
    );
};

export default SantriDetailProgressView;
