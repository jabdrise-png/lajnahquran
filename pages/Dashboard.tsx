import React, { useEffect, useMemo, useState } from 'react';
import { normalizeRole } from '../lib/permissions';
import { useNavigate } from 'react-router-dom';
import { useSupabaseData, useRiwayat } from '../hooks/useSupabaseData';
import { useAcademicYear } from '../lib/AcademicYearContext';
import { formatPeriodName } from '../lib/utils';
import {
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ChevronRight,
  UserX,
  Phone,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { format, startOfWeek, subDays } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useDashboardLogika, type DashboardLogika, type DashboardProps } from './Dashboard.logika';

export * from './Dashboard.logika';

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const s = useDashboardLogika(props);
  const { onNavigate, userRole, navigate, santri, musammi, halaqah, attendance, setoranHarian, studentProgress, studentEvaluations, appSettings, periodeEvaluasi, periodForms, loading, error, masterMarhalahs, dataAcademicYear, userProfile, ctxAcademicYear, currentAcademicYear, peranDasbor, dasborAdmin, trendRange, setTrendRange, riwayatTermuat, progressScheme, setProgressScheme, todayStr, marhalahDateRange, setMarhalahDateRange, totalSantriAktif, totalMusammi, totalHalaqahAktif, attendanceKpi, sessionKpi, recitationsVolumeKpi, lineTrendData, santriPerluPerhatian, actionItems, stackedWeeklyData, hafalanTrendData, marhalahStats, overallAttendanceStats } = s;


  // Loading & Error States
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-700">Memuat dashboard operasional...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-200 text-red-700 text-xs font-semibold">
        Terjadi kendala saat memuat data: {error}
      </div>
    );
  }
  return (
    <div className="space-y-6 pb-12 font-sans max-w-[1400px] mx-auto">
      {/* =====================================================================
          HEADER ATAS (Greeting + Tanggal + Action Buttons)
      ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Assalamualaikum, {userProfile?.name || 'Ustadz'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 capitalize">
            {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: localeId })}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/app/attendance-book')}
            className="btn btn-secondary btn-sm"
          >
            <BookOpen size={14} className="text-slate-500" />
            Buku Absensi
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/sessions')}
            className="btn btn-primary btn-sm"
          >
            Buka Ruang Sesi →
          </button>
        </div>
      </div>

      {/* =====================================================================
          ROW 1: 4 KARTU KPI RINGKAS & TINGGI DIPERPENDEK
      ===================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Total Santri */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Total Santri
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {totalSantriAktif}
          </div>
          <div className="mt-1 text-2xs text-slate-500">
            santri aktif terdaftar
          </div>
        </div>

        {/* KPI 2: Total Musammi' */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Total Musammi'
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {totalMusammi}
          </div>
          <div className="mt-1 text-2xs text-slate-500">
            pengampu halaqah aktif
          </div>
        </div>

        {/* KPI 3: Total Halaqah */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Total Halaqah
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {totalHalaqahAktif}
          </div>
          <div className="mt-1 text-2xs text-slate-500">
            kelompok halaqah berjalan
          </div>
        </div>

        {/* KPI 4: Sesi Berjalan (Murni Angka & per hari ini, tanpa jadwal sholat) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500">
            Sesi Berjalan
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {sessionKpi.completed} / {sessionKpi.total}
          </div>
          <div className="mt-1 text-2xs text-slate-500">
            per hari ini
          </div>
        </div>
      </div>

      {/* =====================================================================
          GRID BARIS 1: TREN PERSENTASE 30 HARI (65%) & HAL MENDESAK (35%)
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Kiri (65% / 8 Kolom): Tren Persentase 30 Hari Terakhir */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Tren Persentase (30 Hari Terakhir)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Persentase kehadiran harian santri</p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              {(['7', '30', '90'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTrendRange(r)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    trendRange === r
                      ? 'bg-white text-blue-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {r} hari
                </button>
              ))}
            </div>
          </div>

          <div className="h-[220px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ComposedChart
                data={lineTrendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1557D5" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#1557D5" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 50, 75, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 1000 }}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E1E7EF',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                  }}
                  formatter={(val: any) => [`${val}%`, 'Persentase']}
                />
                <Area
                  type="monotone"
                  dataKey="percentage"
                  stroke="#1557D5"
                  strokeWidth={2.5}
                  fill="url(#attendanceGradient)"
                />
                <Line
                  type="monotone"
                  dataKey="percentage"
                  stroke="#1557D5"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#1557D5' }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Kanan (35% / 4 Kolom): Card Hal-Hal Mendesak Perlu Tindakan */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Hal-Hal Mendesak Perlu Tindakan
              </h2>
              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-2xs font-bold flex items-center justify-center">
                {actionItems.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 mb-3">
              Diurutkan dari prioritas operasional lembaga
            </p>

            <div className="space-y-3">
              {actionItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-2xs font-bold uppercase ${
                          item.level === 'mendesak'
                            ? 'bg-red-100 text-red-800'
                            : item.level === 'hari_ini'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.levelLabel}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">{item.title}</div>
                    <div className="text-2xs text-slate-500 truncate">{item.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={item.onAction}
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          GRID BARIS 2: TREN KEHADIRAN 7 HARI (50%) & HAFALAN & MATERI (50%)
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Kiri (50%): Stacked Bar Kehadiran Minggu Ini */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div className="pb-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Tren Kehadiran Seminggu Terakhir
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Distribusi status per hari (Senin – Ahad)</p>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={stackedWeeklyData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E1E7EF',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar
                  dataKey="Hadir"
                  stackId="a"
                  fill="#1557D5"
                  name="Hadir"
                  radius={[0, 0, 0, 0]}
                />
                <Bar dataKey="Izin" stackId="a" fill="#60A5FA" name="Izin" />
                <Bar dataKey="Sakit" stackId="a" fill="#F59E0B" name="Sakit" />
                <Bar dataKey="Terlambat" stackId="a" fill="#F97316" name="Terlambat" />
                <Bar
                  dataKey="Alpa"
                  stackId="a"
                  fill="#EF4444"
                  name="Alpa"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Kanan (50%): Tren Perkembangan Hafalan dan Materi */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Tren Perkembangan Hafalan dan Materi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rata-rata halaman/juz per santri per periode evaluasi
              </p>
            </div>
            <select
              value={progressScheme}
              onChange={(e) => setProgressScheme(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-blue-600"
            >
              <option value="Total Hafalan">Total hafalan</option>
              <option value="Ziyadah">Ziyadah</option>
              <option value="Murojaah">Muroja'ah</option>
            </select>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ComposedChart
                data={hafalanTrendData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="hafalanGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 1000 }}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E1E7EF',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                  }}
                  formatter={(val: any) => [`${val}`, progressScheme]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fill="url(#hafalanGradient)"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10B981' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* =====================================================================
          GRID BARIS 3: SANTRI PERLU PERHATIAN (65%) & STATISTIK KEHADIRAN (35%)
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Kiri (65% / 8 Kolom): SECTION SANTRI-SANTRI PERLU PERHATIAN */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Santri-Santri Perlu Perhatian
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                      santriPerluPerhatian.totalNeedingAttention > 0
                        ? 'bg-red-100 text-red-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {santriPerluPerhatian.totalNeedingAttention} Santri
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menampilkan santri-santri yang banyak alfa dan terlambatnya
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app/attendance-book')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Buku Absensi Lengkap
                <ChevronRight size={14} />
              </button>
            </div>

            {/* List / Tabel Santri Perlu Perhatian */}
            {santriPerluPerhatian.items.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tidak ada santri dengan catatan alpa atau terlambat
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Alhamdulillah, seluruh santri aktif memiliki catatan kehadiran tertib dan tidak memiliki catatan alpa atau keterlambatan berulang.
                </p>
              </div>
            ) : (
              <div className="wadah-tabel mt-3 overflow-x-auto">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Santri</th>
                      <th>Halaqah & Pengampu</th>
                      <th className="text-center">Akumulasi Alpa</th>
                      <th className="text-center">Terlambat</th>
                      <th className="text-center">Izin / Sakit</th>
                      <th className="text-center">Kehadiran</th>
                      <th>Status & Rekomendasi</th>
                      <th className="text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {santriPerluPerhatian.items.map((s) => (
                      <tr
                        key={s.id}
                      >
                        <td>
                          <div className="font-semibold text-slate-900">{s.nama}</div>
                          <div className="text-2xs text-slate-500">
                            NIS: {s.nis} · Kelas {s.kelas}
                          </div>
                        </td>
                        <td>
                          <div className="font-medium text-slate-700">{s.halaqahNama}</div>
                          <div className="text-2xs text-slate-500">{s.musammiNama}</div>
                        </td>
                        <td className="text-center">
                          {s.alpa > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                              {s.alpa} Alpa
                            </span>
                          ) : (
                            <span className="text-slate-500 font-normal">0</span>
                          )}
                        </td>
                        <td className="text-center">
                          {s.terlambat > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                              {s.terlambat}x
                            </span>
                          ) : (
                            <span className="text-slate-500 font-normal">0</span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className="text-2xs text-slate-600 font-medium">
                            {s.izin} Izin · {s.sakit} Sakit
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="font-semibold text-slate-900">{s.attRate}%</div>
                          <div className="w-16 bg-slate-200 rounded-full h-1.5 mx-auto mt-1 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${
                                s.attRate < 75
                                  ? 'bg-red-500'
                                  : s.attRate < 90
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${s.attRate}%` }}
                            />
                          </div>
                        </td>
                        <td>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-2xs font-semibold ${
                              s.urgency === 'kritis'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : s.urgency === 'waspada'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-50 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {s.statusKeterangan}
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/app/attendance-book?search=${encodeURIComponent(s.nama)}`)
                            }
                            className="btn btn-secondary btn-sm whitespace-nowrap"
                          >
                            Riwayat
                            <ExternalLink size={12} className="text-slate-500" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Catatan Kaki */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-200 text-2xs text-slate-500">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Kritis: ≥ 3 Alpa (Peringatan Wali)
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Waspada: 1–2 Alpa / Terlambat
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Pantau: Izin/Sakit intensif
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app/rekap-absensi')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                ➔ Buka Rekap Absensi Global
              </button>
            </div>
          </div>
        </div>

        {/* Kanan (35% / 4 Kolom): Statistik Kehadiran */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Statistik Kehadiran</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ketercapaian presensi lembaga dan per marhalah
              </p>
            </div>

            {/* Ringkasan Keseluruhan Lembaga */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mt-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Tingkat Kehadiran Global{!riwayatTermuat && ' (14 hari terakhir)'}</span>
                <span className="text-base font-extrabold text-blue-600 tabular-nums">
                  {overallAttendanceStats.rate}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallAttendanceStats.rate}%` }}
                />
              </div>
              <div className="grid grid-cols-5 gap-1 text-center mt-3 pt-2.5 border-t border-slate-200 text-2xs">
                <div>
                  <div className="font-bold text-slate-900">{overallAttendanceStats.hadir}</div>
                  <div className="text-slate-500">Hadir</div>
                </div>
                <div>
                  <div className="font-bold text-amber-600">{overallAttendanceStats.terlambat}</div>
                  <div className="text-slate-500">Terlambat</div>
                </div>
                <div>
                  <div className="font-bold text-blue-600">{overallAttendanceStats.izin}</div>
                  <div className="text-slate-500">Izin</div>
                </div>
                <div>
                  <div className="font-bold text-orange-600">{overallAttendanceStats.sakit}</div>
                  <div className="text-slate-500">Sakit</div>
                </div>
                <div>
                  <div className="font-bold text-red-600">{overallAttendanceStats.alpa}</div>
                  <div className="text-slate-500">Alpa</div>
                </div>
              </div>
            </div>

            {/* Filter Tanggal & Waktu Mini */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                type="date"
                value={marhalahDateRange.startDate}
                onChange={(e) =>
                  setMarhalahDateRange({ ...marhalahDateRange, startDate: e.target.value })
                }
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
              />
              <select
                value={marhalahDateRange.waktu}
                onChange={(e) =>
                  setMarhalahDateRange({ ...marhalahDateRange, waktu: e.target.value })
                }
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="all">Semua Waktu</option>
                <option value="Shubuh">Shubuh</option>
                <option value="Ashar">Ashar</option>
                <option value="Maghrib">Maghrib</option>
                <option value="Isya">Isya</option>
              </select>
            </div>

            {/* List Progress Bar per Marhalah */}
            <div className="space-y-3">
              {marhalahStats.map((item) => (
                <div
                  key={item.marhalah}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{item.marhalah}</span>
                    <span className="font-bold text-blue-600">
                      {item.percentage}%
                    </span>
                  </div>

                  {/* Horizontal Bar */}
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>

                  {/* Breakdown Singkat */}
                  <div className="flex items-center justify-between text-2xs text-slate-500">
                    <span>
                      Hadir: <b>{item.hadir}</b>
                    </span>
                    <span>
                      Izin: <b>{item.izin}</b>
                    </span>
                    <span>
                      Sakit: <b>{item.sakit}</b>
                    </span>
                    <span>
                      Alpa: <b>{item.alpa}</b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
