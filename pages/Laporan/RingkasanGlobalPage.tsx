import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MarhalahLabel, KelasLabel } from '../../components/Labels';
import Card from '../../components/Card';
import Modal from '../../components/Modal';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { exportToExcel } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';
import { ALL_PERAN, ALL_ATTENDANCE_STATUS } from '../../constants';
import { Marhalah, Peran, AttendanceStatus, Waktu, AttendanceRecord } from '../../types';
import { Download, Edit, Trash, MoreVertical, Search, Filter, Plus, Clock, Calendar, CheckCircle, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Square, CheckSquare, MessageCircle, Send, Copy, AlertCircle } from 'lucide-react';
import { sendCustomTelegramMessage } from '../../lib/telegram';
import { NotificationStore } from '../../lib/NotificationStore';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, BarChart, Bar, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { LoadingState } from '../../components/ui/SaaSPrimitives';
import { motion } from 'motion/react';
import { getStatusColor } from '../../components/Chart';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { hariIni } from '../../lib/sesiHalaqah';
import { useRingkasanGlobalPageLogika, type RingkasanGlobalPageLogika, type RingkasanGlobalPageProps } from './RingkasanGlobalPage.logika';

export * from './RingkasanGlobalPage.logika';

const RingkasanGlobalPage: React.FC<RingkasanGlobalPageProps> = (props) => {
  const s = useRingkasanGlobalPageLogika(props);
  const { externalShowFilters, externalSetShowFilters, exportTrigger, attendance, halaqah, santri, appSettings, updateAttendanceRecord, deleteAttendanceRecord, addAttendanceRecords, loading, error, globalMarhalahs, globalWaktuHalaqah, globalAttendanceStatus, userProfile, waliKelas, masterMarhalahs, masterKelasRelasi, getOrgId, displayLimit, setDisplayLimit, localShowFilters, setLocalShowFilters, showAdvancedFilters, setShowAdvancedFilters, permittedHalaqahIds, dateRange, setDateRange, selectedMarhalah, setSelectedMarhalah, selectedKelas, setSelectedKelas, selectedPeran, setSelectedPeran, selectedStatus, setSelectedStatus, searchName, setSearchName, sortBy, setSortBy, sortOrder, setSortOrder, showTrendMenu, setShowTrendMenu, showAllTrendLines, setShowAllTrendLines, showPieMenu, setShowPieMenu, showBarMenu, setShowBarMenu, showStatsMenu, setShowStatsMenu, showStatsKelas, setShowStatsKelas, showStatsWaktu, setShowStatsWaktu, selectedStudentDetail, setSelectedStudentDetail, isEditModalOpen, setIsEditModalOpen, isAddModalOpen, setIsAddModalOpen, selectedSantriIds, setSelectedSantriIds, generatedMessages, setGeneratedMessages, messageTarget, setMessageTarget, isPreviewModalOpen, setIsPreviewModalOpen, editingRecord, setEditingRecord, isSubmitting, setIsSubmitting, newManualRecord, setNewManualRecord, permittedAttendance, availableKelas, filteredData, recapData, prevExportTrigger, summaryOptions, visibleData, pieStats, trendData, studentDetailData, handleEdit, dialogAlasan, mintaAlasan, alasanJikaLewat, handleDelete, sendWA, handleSendTelegram, handleSendMassTelegram, handleGeneratePreview, handleSelectAll, handleUpdate, handleAddManualSubmit, getInitials, handleDownloadImage, handleOpenInNewTab, handleSort, SortIcon } = s;


    if (loading) return <LoadingState label="Memuat data…" />;
    if (error) return <p className="text-red-500">{error}</p>;
  return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
            {dialogAlasan}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card id="chart-trend" className="lg:col-span-2 !rounded-2xl !p-6 border-slate-200 bg-white relative">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-base font-semibold text-slate-800">Tren Persentase Kehadiran</h2>
                            <p className="text-sm text-slate-500 mt-0.5">Pergerakan data absensi selama 30 hari terakhir.</p>
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowTrendMenu(!showTrendMenu)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                                <MoreVertical size={18}/>
                            </button>
                            {showTrendMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-10 text-sm">
                                    <button onClick={() => { handleDownloadImage('chart-trend', 'Tren_Kehadiran'); setShowTrendMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">Unduh gambar</button>
                                    <button onClick={() => { handleOpenInNewTab('chart-trend'); setShowTrendMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">Buka di Tab Baru</button>
                                    <div className="h-px bg-slate-100 my-1"></div>
                                    <button onClick={() => { setShowAllTrendLines(!showAllTrendLines); setShowTrendMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">
                                        {showAllTrendLines ? "Sembunyikan Line Lain" : "Tampilkan Semua Line"}
                                    </button>
                                </div>
                            )}
                        </div>
                     </div>
                     <div className="h-[240px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    {globalAttendanceStatus.map(s => (
                                        <linearGradient key={`color${s}`} id={`color${s}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={getStatusColor(s)} stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor={getStatusColor(s)} stopOpacity={0}/>
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} dy={10} minTickGap={30} />
                                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} tick={{fontSize: 11, fill: '#8492a6'}} domain={[0, 100]} />
                                <RechartsTooltip 
                                    formatter={(value: number) => [`${value}%`]}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                {globalAttendanceStatus.map((s, idx) => (
                                    <Area 
                                        key={s} 
                                        type="monotone" 
                                        dataKey={s} 
                                        stroke={getStatusColor(s)} 
                                        strokeWidth={2} 
                                        fillOpacity={idx === 0 || showAllTrendLines ? 1 : 0} 
                                        fill={idx === 0 || showAllTrendLines ? `url(#color${s})` : "transparent"} 
                                        dot={idx === 0 || showAllTrendLines ? { stroke: getStatusColor(s), strokeWidth: 2, r: 2, fillOpacity: 1, fill: "#fff" } : false} 
                                        hide={idx !== 0 && idx !== 3 && !showAllTrendLines} 
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                     </div>
                     <div className="flex flex-wrap items-center justify-center mt-6 gap-6 text-sm font-medium text-slate-500">
                        {globalAttendanceStatus.map((s, idx) => (idx === 0 || idx === 3 || showAllTrendLines) && (
                            <div key={s} className="flex items-center"><div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: getStatusColor(s)}}></div>{s}</div>
                        ))}
                    </div>
                </Card>

                <Card id="chart-pie" className="!rounded-2xl !p-6 border-slate-200 bg-white relative">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-base font-semibold text-slate-800">Distribusi Status</h2>
                            <p className="text-sm text-slate-500 mt-0.5">Proporsi akumulasi absensi.</p>
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowPieMenu(!showPieMenu)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                                <MoreVertical size={18}/>
                            </button>
                            {showPieMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-10 text-sm">
                                    <button onClick={() => { handleDownloadImage('chart-pie', 'Distribusi_Status'); setShowPieMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">Unduh gambar</button>
                                    <button onClick={() => { handleOpenInNewTab('chart-pie'); setShowPieMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">Buka di Tab Baru</button>
                                </div>
                            )}
                        </div>
                     </div>
                     
                     <div className="flex justify-center items-center h-[200px] mb-2">
                         {pieStats.total > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieStats.chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={65}
                                        outerRadius={95}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {pieStats.chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getStatusColor(entry.name as string)} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>
                         ) : (
                             <div className="text-slate-400 text-sm">Tidak ada data.</div>
                         )}
                     </div>

                     <div className="grid grid-cols-2 gap-y-4 gap-x-6 mt-4 px-2">
                         <div className="flex justify-between items-center text-sm">
                             <div className="flex items-center text-slate-500"><div className="w-2 h-2 rounded-full mr-2 bg-emerald-500"></div>Hadir</div>
                             <div className="font-semibold text-slate-800">{pieStats.hadirVal || 0}%</div>
                         </div>
                         <div className="flex justify-between items-center text-sm">
                             <div className="flex items-center text-slate-500"><div className="w-2 h-2 rounded-full mr-2 bg-blue-500"></div>Izin</div>
                             <div className="font-semibold text-slate-800">{pieStats.izinVal || 0}%</div>
                         </div>
                         <div className="flex justify-between items-center text-sm">
                             <div className="flex items-center text-slate-500"><div className="w-2 h-2 rounded-full mr-2 bg-amber-500"></div>Sakit</div>
                             <div className="font-semibold text-slate-800">{pieStats.sakitVal || 0}%</div>
                         </div>
                         <div className="flex justify-between items-center text-sm">
                             <div className="flex items-center text-slate-500"><div className="w-2 h-2 rounded-full mr-2 bg-red-500"></div>Alpa</div>
                             <div className="font-semibold text-slate-800">{pieStats.alpaVal || 0}%</div>
                         </div>
                     </div>
                </Card>
            </div>

            {/* Akumulasi Kehadiran Per Individu Chart */}
            <Card id="chart-bar" className="!rounded-2xl !p-6 border-slate-200 mt-6 bg-white relative">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">Akumulasi Kehadiran Per Individu</h2>
                        <p className="text-sm text-slate-500 mt-0.5">Menampilkan seluruh data santri hasil filter (scroll untuk melihat semua).</p>
                    </div>
                    <div className="relative">
                        <button onClick={() => setShowBarMenu(!showBarMenu)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                            <MoreVertical size={18}/>
                        </button>
                        {showBarMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-10 text-sm">
                                <button onClick={() => { handleDownloadImage('chart-bar', 'Akumulasi_Per_Individu'); setShowBarMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">Unduh gambar</button>
                                <button onClick={() => { handleOpenInNewTab('chart-bar'); setShowBarMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700">Buka di Tab Baru</button>
                            </div>
                        )}
                    </div>
                 </div>
                <div className="h-[430px] w-full overflow-x-auto overflow-y-hidden hide-scrollbar">
                    <div style={{ width: `${Math.max(100, recapData.length * 4)}%`, height: '100%', minWidth: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={recapData} margin={{ top: 10, right: 20, left: -20, bottom: 130 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis 
                                    dataKey="Nama" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fill: '#64748b', textAnchor:"end"}} 
                                    interval={0}
                                    angle={-45} 
                                    textAnchor="end" 
                                    height={120}
                                    dx={-5}
                                />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#8492a6'}} />
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{fill: '#f8fafc'}} />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} verticalAlign="top" />
                                {globalAttendanceStatus.map((s, idx) => (
                                    <Bar key={s} dataKey={s} stackId="a" fill={getStatusColor(s)} radius={idx === 0 ? [0, 0, 4, 4] : idx === globalAttendanceStatus.length - 1 ? [4, 4, 0, 0] : [0,0,0,0]} maxBarSize={40} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </Card>

            {/* Statistik Absensi Berdasarkan Marhalah */}
            <Card className="!rounded-2xl !p-0 border-slate-200 overflow-hidden mt-6 mb-6">
                <div className="p-4 lg:px-6 lg:py-5 border-b border-slate-100 bg-white flex justify-between items-start">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">Statistik Absensi (Berdasarkan Filter)</h2>
                        <p className="text-sm text-slate-500 mt-0.5">Rekapitulasi data kehadiran untuk periode terpilih.</p>
                    </div>
                    <div className="relative">
                        <button onClick={() => setShowStatsMenu(!showStatsMenu)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                            <MoreVertical size={18}/>
                        </button>
                        {showStatsMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-10 text-sm">
                                <button onClick={() => { setShowStatsKelas(!showStatsKelas); setShowStatsMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium">
                                    {showStatsKelas ? "Sembunyikan Kelas" : "Tampilkan Kelas"}
                                </button>
                                <button onClick={() => { setShowStatsWaktu(!showStatsWaktu); setShowStatsMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 font-medium">
                                    {showStatsWaktu ? "Sembunyikan Waktu" : "Tampilkan Waktu"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="wadah-tabel overflow-x-auto">
                    <table className="tabel">
                        <thead>
                            <tr>
                                <th className="text-left">Marhalah</th>
                                {showStatsKelas && <th className="text-left">Kelas</th>}
                                {showStatsWaktu && <th className="text-left">Waktu</th>}
                                {globalAttendanceStatus?.map(status => (
                                    <th key={status}>
                                        {status}
                                    </th>
                                ))}
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryOptions.map((row, idx) => (
                                <tr key={idx} className="bg-white">
                                    <td className="text-left font-semibold text-slate-700"><MarhalahLabel text={row.marhalah} id={row.marhalah_id} /></td>
                                    {showStatsKelas && <td className="text-left text-slate-600"><KelasLabel text={row.kelas} id={row.kelas_id} /></td>}
                                    {showStatsWaktu && <td className="text-left text-slate-600">{row.waktu}</td>}
                                    {globalAttendanceStatus?.map((status: string) => {
                                        const val = row[status as keyof typeof row] as number;
                                        return (
                                            <td key={status} className="text-slate-700 font-medium">
                                                {val > 0 ? (
                                                    <div className="flex items-center justify-center">
                                                        {status?.toLowerCase() === 'hadir' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></div>}
                                                        <span className={status?.toLowerCase() === 'hadir' ? "font-semibold" : ""}>{val}</span>
                                                    </div>
                                                ) : "-"}
                                            </td>
                                        )
                                    })}
                                    <td className="font-bold text-slate-800">{row.Total}</td>
                                </tr>
                            ))}
                            {summaryOptions.length === 0 && (
                                <tr>
                                    <td colSpan={7 + (showStatsKelas ? 1 : 0) + (showStatsWaktu ? 1 : 0)} className="p-8 text-center text-slate-400 italic">Tidak ada data untuk filter saat ini.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card className="!rounded-2xl !p-0 border-slate-200 overflow-hidden mt-6 mb-12">
                <div className="p-4 lg:px-5 lg:py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="relative flex-1 w-full max-w-sm">
                        <input 
                            type="text" 
                            className="kontrol kontrol-cari" 
                            placeholder="Cari nama santri..."
                            value={searchName}
                            onChange={e => setSearchName(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto mt-4 md:mt-0 flex-wrap">
                        {selectedSantriIds.length > 0 && (
                            <>
                                <button type="button" onClick={() => handleGeneratePreview('wa')} className="bg-[#25D366] text-white px-3 py-2 rounded-full text-sm hover:bg-[#128C7E] flex items-center font-bold shadow-sm transition-all" title="Kirim WhatsApp">
                                    <MessageCircle size={16} />
                                </button>
                                <button type="button" onClick={() => handleGeneratePreview('telegram')} className="bg-blue-500 text-white px-3 py-2 rounded-full text-sm hover:bg-blue-600 flex items-center font-bold shadow-sm transition-all" title="Kirim Telegram">
                                    <Send size={16} />
                                </button>
                                <span className="text-xs font-bold text-slate-500 mr-2">{selectedSantriIds.length} Terpilih</span>
                            </>
                        )}
                        <div className="relative">
                            <select 
                                className="kontrol md:w-auto"
                                value={selectedMarhalah} 
                                onChange={e => {setSelectedMarhalah(e.target.value as any); setSelectedKelas('all');}}
                            >
                                <option value="all">Semua Marhalah</option>
                                {globalMarhalahs.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="relative">
                            <select 
                                className="kontrol md:w-auto"
                                value={selectedKelas} 
                                onChange={e => setSelectedKelas(e.target.value)}
                            >
                                <option value="all">Semua Kelas</option>
                                {availableKelas.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={() => setShowAdvancedFilters(prev => !prev)}
                            title="Filter Lanjutan"
                            className={`p-2.5 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                                showAdvancedFilters 
                                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm3 6a1 1 0 011-1h10a1 1 0 110 2H7a1 1 0 01-1-1zm3 6a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => exportToExcel(recapData, 'Rekap_Global')}
                            className="btn btn-primary"
                        >
                            <Download size={15} />
                            <span>Ekspor data</span>
                        </button>
                    </div>
                </div>

                {showAdvancedFilters && (
                    <div className="bg-white p-5 sm:p-6 border-b border-slate-100 flex flex-col gap-4 animate-in fade-in duration-200">
                        <div className="flex justify-end pb-2 border-b border-slate-100/80">
                            <button 
                                onClick={() => {
                                    setDateRange({start: '', end: ''});
                                    setSelectedPeran('all');
                                    setSelectedStatus('all');
                                    setSortBy('Nama');
                                    setSortOrder('asc');
                                }}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors flex items-center gap-1"
                            >
                                Reset Filter
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Dari Tanggal</label>
                                <input 
                                    type="date" 
                                    value={dateRange.start} 
                                    onChange={e => setDateRange(p => ({...p, start: e.target.value}))} 
                                    className="w-full border border-slate-200 bg-white rounded-xl text-xs py-2 px-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-slate-700 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Sampai Tanggal</label>
                                <input 
                                    type="date" 
                                    value={dateRange.end} 
                                    onChange={e => setDateRange(p => ({...p, end: e.target.value}))} 
                                    className="w-full border border-slate-200 bg-white rounded-xl text-xs py-2 px-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-slate-700 font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Peran Santri</label>
                                <select 
                                    value={selectedPeran} 
                                    onChange={e => setSelectedPeran(e.target.value as any)} 
                                    className="kontrol"
                                >
                                    <option value="all">Semua Peran</option>
                                    {ALL_PERAN.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status Kehadiran</label>
                                <select 
                                    value={selectedStatus} 
                                    onChange={e => setSelectedStatus(e.target.value as any)} 
                                    className="kontrol"
                                >
                                    <option value="all">Semua Status</option>
                                    {globalAttendanceStatus?.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                <div className="wadah-tabel overflow-x-auto">
                    <table className="tabel">
                        <thead>
                            <tr>
                                <th className="w-12">
                                    <button onClick={handleSelectAll} className="w-full h-full flex items-center justify-center text-slate-400 hover:text-slate-600">
                                        {selectedSantriIds.length > 0 && selectedSantriIds.length === visibleData.filter(d => d.Peran === 'Santri').length ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                                    </button>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Nama')}>
                                    <div className="flex items-center">Nama Santri <SortIcon field="Nama"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Marhalah')}>
                                    <div className="flex items-center">Informasi <SortIcon field="Marhalah"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Hadir')}>
                                    <div className="flex items-center justify-center">Hadir <SortIcon field="Hadir"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Izin')}>
                                    <div className="flex items-center justify-center">Izin <SortIcon field="Izin"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Sakit')}>
                                    <div className="flex items-center justify-center">Sakit <SortIcon field="Sakit"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Alpa')}>
                                    <div className="flex items-center justify-center">Alpa <SortIcon field="Alpa"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Terlambat')}>
                                    <div className="flex items-center justify-center">Telat <SortIcon field="Terlambat"/></div>
                                </th>
                                <th className="group cursor-pointer" onClick={() => handleSort('Total')}>
                                    <div className="flex items-center justify-center">Total <SortIcon field="Total"/></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleData.map((item, idx) => (
                                <tr key={idx} className="bg-white cursor-pointer" onClick={() => setSelectedStudentDetail({id: item.id, nama: item.Nama, peran: item.Peran as Peran})}>
                                    <td onClick={(e) => { e.stopPropagation(); if (item.Peran === 'Santri') { setSelectedSantriIds(p => p.includes(item.id) ? p.filter(id => id !== item.id) : [...p, item.id]); } }}>
                                        <div className="flex items-center justify-center">
                                            {item.Peran === 'Santri' ? (
                                                <button className="text-slate-400 hover:text-slate-600">
                                                    {selectedSantriIds.includes(item.id) ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                                                </button>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 font-bold text-sm border border-slate-200/80 mr-4">
                                                {getInitials(item.Nama)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm whitespace-nowrap">{item.Nama}</div>
                                                <div className="text-2xs text-slate-400 font-medium mt-0.5">{item.Peran}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-slate-500 text-sm">
                                        <div className="flex items-center">
                                            {item.Kelas && <span className="bg-slate-100 text-slate-600 text-2xs px-2 py-0.5 rounded font-bold mr-2 uppercase">{item.Kelas}</span>}
                                            <span className="font-medium text-sm">{item.Marhalah}</span>
                                        </div>
                                    </td>
                                    <td className="text-center font-bold text-emerald-600">
                                        {item.Hadir > 0 ? item.Hadir : '-'}
                                    </td>
                                    <td className="text-center text-slate-400 font-medium">
                                        {item.Izin > 0 ? item.Izin : '-'}
                                    </td>
                                    <td className="text-center text-slate-400 font-medium">
                                        {item.Sakit > 0 ? item.Sakit : '-'}
                                    </td>
                                    <td className="text-center text-slate-400 font-medium">
                                        {item.Alpa > 0 ? item.Alpa : '-'}
                                    </td>
                                    <td className="text-center text-slate-400 font-medium">
                                        {item.Terlambat > 0 ? item.Terlambat : '-'}
                                    </td>
                                    <td className="text-center font-bold text-slate-800">
                                        {item.Total}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 lg:px-6 lg:py-4 bg-white flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
                     <p className="text-slate-400 font-medium">
                         Menampilkan <span className="font-bold text-slate-700">1-{visibleData.length}</span> dari <span className="font-bold text-slate-700">{recapData.length}</span> data
                     </p>
                     
                     {visibleData.length < recapData.length && (
                         <div className="flex space-x-2 items-center">
                             <button 
                                 onClick={() => setDisplayLimit(prev => prev + 50)}
                                 className="btn btn-secondary btn-sm"
                             >Load More (50)</button>
                             <button 
                                 onClick={() => setDisplayLimit(999999)}
                                 className="px-3.5 py-1.5 border border-blue-200 bg-blue-50/50 rounded-lg text-sm font-bold text-blue-600 hover:bg-blue-100 transition-colors"
                             >Tampilkan Semua</button>
                         </div>
                     )}
                </div>
            </Card>

            {/* Modal Detail Absensi */}
            <Modal isOpen={!!selectedStudentDetail} onClose={() => setSelectedStudentDetail(null)} title={`Detail Absensi: ${selectedStudentDetail?.nama}`}>
                <div className="flex justify-between items-center mb-4">
                    <p className="text-xs text-slate-500 italic">Riwayat kehadiran per sesi.</p>
                    {(userProfile?.role?.toLowerCase() || '') !== 'musammi' && (
                        <button 
                            onClick={() => setIsAddModalOpen(true)}
                            className="btn btn-primary btn-sm"
                        >
                            <Plus size={14} className="mr-1"/> Tambah Absensi Manual
                        </button>
                    )}
                </div>
                <div className="wadah-tabel max-h-[60vh] overflow-y-auto">
                    <table className="tabel">
                        <thead className="sticky top-0"><tr><th>Tanggal</th><th>Waktu</th><th>Status</th>{(userProfile?.role?.toLowerCase() || '') !== 'musammi' && <th className="text-right">Aksi</th>}</tr></thead>
                        <tbody>
                            {studentDetailData.map(r => (
                                <tr key={r.id}>
                                    <td className="text-slate-800">{r.date}</td>
                                    <td>{r.waktu}</td>
                                    <td>
                                        <span className={`inline-flex min-w-[50px] justify-center items-center px-2.5 py-1 rounded-md text-2xs font-bold border tabular-nums shadow-xs ${
                                            r.status === 'Hadir' ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50' : 
                                            r.status === 'Sakit' ? 'bg-amber-50 text-amber-700 border-amber-100/50' : 
                                            r.status === 'Izin' ? 'bg-blue-50 text-blue-700 border-blue-100/50' : 
                                            r.status === 'Terlambat' ? 'bg-orange-50 text-orange-700 border-orange-100/50' : 
                                            'bg-red-50 text-red-700 border-red-100/50'
                                        }`}>{r.status}</span>
                                    </td>
                                    {(userProfile?.role?.toLowerCase() || '') !== 'musammi' && (
                                        <td className="text-right flex justify-end gap-2">
                                            <button onClick={() => handleEdit(r)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit size={14}/></button>
                                            <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash size={14}/></button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {studentDetailData.length === 0 && <tr><td colSpan={(userProfile?.role?.toLowerCase() || '') !== 'musammi' ? 4 : 3} className="text-center py-8 text-slate-400">Belum ada data.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Modal>

            {/* Modal Tambah Absensi Manual */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={`Tambah Absensi: ${selectedStudentDetail?.nama}`}>
                <div className="space-y-5 flex flex-col">
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start">
                        <Clock size={16} className="text-blue-600 mt-0.5 mr-2 shrink-0" />
                        <p className="text-xs text-blue-700 leading-relaxed">Pilih tanggal, sesi waktu, dan status kehadiran untuk ditambahkan ke riwayat santri.</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tanggal</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                                <input 
                                    type="date" 
                                    className="w-full border-slate-200 rounded-lg text-sm pl-10 pr-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
                                    value={newManualRecord.date}
                                    onChange={e => setNewManualRecord({...newManualRecord, date: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Waktu / Sesi</label>
                                <select 
                                    className="w-full border-slate-200 rounded-lg text-sm px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
                                    value={newManualRecord.waktu}
                                    onChange={e => setNewManualRecord({...newManualRecord, waktu: e.target.value as Waktu})}
                                >
                                    {globalWaktuHalaqah.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Status</label>
                                <select 
                                    className="w-full border-slate-200 rounded-lg text-sm px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all outline-none"
                                    value={newManualRecord.status}
                                    onChange={e => setNewManualRecord({...newManualRecord, status: e.target.value as AttendanceStatus})}
                                >
                                    {globalAttendanceStatus?.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                        <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50">Batal</button>
                        <button 
                            onClick={handleAddManualSubmit} 
                            disabled={isSubmitting}
                            className="btn btn-primary"
                        >
                            {isSubmitting ? 'Menyimpan...' : <><CheckCircle size={16} className="mr-2"/> Tambah Data</>}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal Edit Absensi */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Absensi Manual">
                {editingRecord && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tanggal</label>
                            <input type="date" className="w-full border-slate-200 rounded-lg text-sm p-2 bg-slate-50 focus:bg-white" value={editingRecord.date} onChange={e => setEditingRecord({...editingRecord, date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Waktu</label>
                            <select className="w-full border-slate-200 rounded-lg text-sm p-2 bg-slate-50 focus:bg-white" value={editingRecord.waktu} onChange={e => setEditingRecord({...editingRecord, waktu: e.target.value as Waktu})}>{globalWaktuHalaqah.map(w => <option key={w} value={w}>{w}</option>)}</select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Status</label>
                            <select className="w-full border-slate-200 rounded-lg text-sm p-2 bg-slate-50 focus:bg-white" value={editingRecord.status} onChange={e => setEditingRecord({...editingRecord, status: e.target.value as AttendanceStatus})}>{globalAttendanceStatus?.map(s => <option key={s} value={s}>{s}</option>)}</select>
                        </div>
                        <div className="flex justify-end pt-4 gap-3 border-t border-slate-100 mt-4">
                            <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-slate-50 border-slate-200">Batal</button>
                            <button onClick={handleUpdate} disabled={isSubmitting} className="btn btn-primary">{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Preview Pesan Modal */}
            <Modal isOpen={isPreviewModalOpen} onClose={() => setIsPreviewModalOpen(false)} title="Preview & Kirim Pesan" maxWidth="3xl">
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={18} className="text-blue-600 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-blue-900 text-sm mb-1">
                                    {messageTarget === 'wa' ? 'Kirim via WhatsApp' : 'Kirim via Telegram'}
                                </h4>
                                <p className="text-xs text-blue-700/80 leading-relaxed max-w-lg">
                                    {messageTarget === 'wa' 
                                        ? `WhatsApp akan terbuka satu per satu. Klik tombol kirim untuk masing-masing wali santri.`
                                        : `Pastikan Token Bot Telegram telah diatur di Pengaturan Aplikasi sebelum mengirim secara massal.`
                                    }
                                </p>
                            </div>
                        </div>
                        {messageTarget === 'telegram' && (
                            <button 
                                onClick={handleSendMassTelegram}
                                className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all hover:bg-blue-600 flex items-center shrink-0"
                            >
                                <Send size={16} className="mr-2"/> Kirim Massal
                            </button>
                        )}
                    </div>
                    
                    <div className="max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar pr-2">
                        {generatedMessages.map((msg, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                                <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-100">
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">{msg.name}</p>
                                        <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-2">
                                            {messageTarget === 'wa' ? (msg.phone || 'No HP Kosong') : (msg.telegramChatId || 'Chat ID Kosong')}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => navigator.clipboard.writeText(msg.text).then(() => NotificationStore.addNotification('Disalin', 'success'))}
                                            className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-1.5 h-8 w-8 rounded-lg transition-colors flex items-center justify-center"
                                            title="Salin Pesan"
                                        >
                                            <Copy size={14} strokeWidth={2.5}/>
                                        </button>
                                        
                                        {messageTarget === 'wa' ? (
                                            <button 
                                                onClick={() => sendWA(msg.phone, msg.text)}
                                                className="bg-[#25D366] text-white px-3 py-1.5 h-8 rounded-lg text-xs font-bold flex items-center hover:bg-[#128C7E] transition-all"
                                            >
                                                <MessageCircle size={14} className="mr-1.5"/> Kirim WA
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleSendTelegram(msg.telegramChatId || '', msg.text)}
                                                disabled={!msg.telegramChatId}
                                                className="bg-blue-500 text-white px-3 py-1.5 h-8 rounded-lg text-xs font-bold flex items-center hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Send size={14} className="mr-1.5"/> Kirim
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-slate-50/50 p-4 rounded-lg text-sm text-slate-700 whitespace-pre-wrap border border-slate-100/50">
                                    {msg.text}
                                </div>
                                {messageTarget === 'telegram' && !msg.telegramChatId && (
                                    <p className="text-red-500 text-2xs font-bold mt-2">⚠️ Santri ini belum memiliki Chat ID Telegram (atur di profil santri).</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RingkasanGlobalPage;
