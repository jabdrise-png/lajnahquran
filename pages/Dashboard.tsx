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

interface DashboardProps {
  onNavigate?: (page: string) => void;
  userRole?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, userRole }) => {
  const navigate = useNavigate();
  const {
    santri,
    musammi,
    halaqah,
    attendance,
    setoranHarian,
    studentProgress,
    studentEvaluations,
    appSettings,
    periodeEvaluasi,
    periodForms,
    loading,
    error,
    masterMarhalahs,
    selectedAcademicYear: dataAcademicYear,
    userProfile
  } = useSupabaseData();
  const { selectedAcademicYear: ctxAcademicYear } = useAcademicYear();
  const currentAcademicYear = ctxAcademicYear || dataAcademicYear;

  // State Tabs & Filters
  // Fase 7: admin memuat riwayat penuh sesudah dasbor tampil; peran lain (musammi' di HP) tetap
  // memakai data 14 hari & tren 7 hari, riwayat baru dimuat bila memilih 30/90 hari.
  const peranDasbor = normalizeRole(userProfile?.role);
  const dasborAdmin = peranDasbor === 'admin' || peranDasbor === 'superadmin';
  const [trendRange, setTrendRange] = useState<'7' | '30' | '90'>(dasborAdmin ? '30' : '7');
  const { riwayatTermuat } = useRiwayat({ aktif: dasborAdmin || trendRange !== '7', tunda: dasborAdmin ? 1500 : 0 });
  useEffect(() => { if (dasborAdmin) setTrendRange((t) => (t === '7' ? '30' : t)); }, [dasborAdmin]);
  const [progressScheme, setProgressScheme] = useState<string>('Total Hafalan');

  // Filter Statistik Kehadiran per Marhalah (Row 4 Kanan)
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [marhalahDateRange, setMarhalahDateRange] = useState({
    startDate: todayStr,
    endDate: todayStr,
    waktu: 'all'
  });

  // --------------------------------------------------------------------------
  // PERHITUNGAN KPI UTAMA — 100% DATA ASLI DARI DATABASE
  // --------------------------------------------------------------------------

  // 1. Total Santri Aktif
  const totalSantriAktif = useMemo(() => {
    return (santri || []).filter((s) => s.status !== 'Keluar' && s.status !== 'Lulus').length;
  }, [santri]);

  // 2. Total Musammi'
  const totalMusammi = useMemo(() => {
    return (musammi || []).length;
  }, [musammi]);

  // 3. Total Halaqah Aktif
  const totalHalaqahAktif = useMemo(() => {
    return (halaqah || []).filter((h) => h.is_active !== false).length;
  }, [halaqah]);

  // 4. Kehadiran 7 Hari Terakhir & Perbandingan dengan 7 Hari Sebelumnya
  const attendanceKpi = useMemo(() => {
    const now = new Date();
    const last7DaysStart = subDays(now, 6);
    const prev7DaysStart = subDays(now, 13);
    const prev7DaysEnd = subDays(now, 7);

    const l7Str = format(last7DaysStart, 'yyyy-MM-dd');
    const p7StartStr = format(prev7DaysStart, 'yyyy-MM-dd');
    const p7EndStr = format(prev7DaysEnd, 'yyyy-MM-dd');

    let l7Total = 0;
    let l7Hadir = 0;
    let p7Total = 0;
    let p7Hadir = 0;

    (attendance || []).forEach((a) => {
      const d = a.date;
      const sLower = (a.status || '').toLowerCase();
      const isPresent = sLower === 'hadir' || sLower === 'terlambat';

      if (d >= l7Str && d <= todayStr) {
        l7Total++;
        if (isPresent) l7Hadir++;
      } else if (d >= p7StartStr && d <= p7EndStr) {
        p7Total++;
        if (isPresent) p7Hadir++;
      }
    });

    const currentPct = l7Total > 0 ? Math.round((l7Hadir / l7Total) * 100) : 0;
    const prevPct = p7Total > 0 ? Math.round((p7Hadir / p7Total) * 100) : 0;
    const diff = p7Total > 0 ? currentPct - prevPct : 0;

    return {
      currentPct,
      diff,
      hasData: l7Total > 0,
      hasPrevData: p7Total > 0,
      l7Total,
      l7Hadir
    };
  }, [attendance, todayStr]);

  // 2. Sesi Selesai Hari Ini
  const sessionKpi = useMemo(() => {
    const activeHalaqahs = (halaqah || []).filter((h) => h.is_active !== false);
    const totalExpectedSessions = activeHalaqahs.length;

    // Sesi dianggap selesai jika ada record absensi untuk tanggal hari ini
    const recordedHalaqahIds = new Set(
      (attendance || [])
        .filter((a) => a.date === todayStr)
        .map((a) => a.halaqahId)
    );

    const completed = activeHalaqahs.filter((h) => recordedHalaqahIds.has(h.id)).length;
    const unrecordedCount = Math.max(0, totalExpectedSessions - completed);

    return {
      completed,
      total: totalExpectedSessions,
      unrecordedCount,
      note:
        totalExpectedSessions === 0
          ? 'Belum ada halaqah aktif'
          : unrecordedCount > 0
          ? `${unrecordedCount} halaqah belum tercatat`
          : 'Semua halaqah telah tercatat'
    };
  }, [halaqah, attendance, todayStr]);

  // 4. Halaman Disetor Pekan Ini
  const recitationsVolumeKpi = useMemo(() => {
    const now = new Date();
    const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    let totalPages = 0;
    const activeSantriSet = new Set<number>();

    (setoranHarian || []).forEach((r: any) => {
      const rDate = r.tanggal || r.created_at?.slice(0, 10);
      if (rDate && rDate >= weekStartStr && rDate <= todayStr) {
        const start = Number(r.halaman_mulai || 0);
        const end = Number(r.halaman_selesai || r.halaman || start);
        const pages = Math.max(1, end >= start ? end - start + 1 : 1);
        totalPages += pages;
        if (r.santri_id) activeSantriSet.add(r.santri_id);
      }
    });

    return {
      totalPages,
      activeSantriCount: activeSantriSet.size
    };
  }, [setoranHarian, todayStr]);

  // --------------------------------------------------------------------------
  // ROW 2: TREN KEHADIRAN (KIRI 65%) & PERLU TINDAKAN (KANAN 35%)
  // --------------------------------------------------------------------------

  // Data Tren Kehadiran Garis (Persentase Per Hari) — 100% Data Aktual
  const lineTrendData = useMemo(() => {
    const daysCount = trendRange === '90' ? 90 : trendRange === '30' ? 30 : 7;
    const result: Array<{
      date: string;
      name: string;
      percentage: number | null;
      total: number;
      hadir: number;
    }> = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const str = format(d, 'yyyy-MM-dd');
      const label = daysCount <= 7 ? format(d, 'eee', { locale: localeId }) : format(d, 'd/M');

      const dayRecords = (attendance || []).filter((a) => a.date === str);
      // Fase 7b: hari tanpa absensi = kosong (bukan 0%), agar grafik tidak menukik palsu
      let pct: number | null = null;
      let hadirCount = 0;

      if (dayRecords.length > 0) {
        hadirCount = dayRecords.filter((a) => {
          const sLower = (a.status || '').toLowerCase();
          return sLower === 'hadir' || sLower === 'terlambat';
        }).length;
        pct = Math.round((hadirCount / dayRecords.length) * 100);
      }

      result.push({
        date: str,
        name: label,
        percentage: pct,
        total: dayRecords.length,
        hadir: hadirCount
      });
    }

    return result;
  }, [attendance, trendRange]);

  // --------------------------------------------------------------------------
  // PERHITUNGAN SANTRI PERLU PERHATIAN (MENGGANTIKAN MATRIKS DETAIL KEHADIRAN)
  // Berdasarkan akumulasi Alpha, izin/sakit beruntun, atau catatan evaluasi
  // --------------------------------------------------------------------------
  const santriPerluPerhatian = useMemo(() => {
    // Map halaqah
    const halaqahMap = new Map<number, { nama: string; musammiNama: string }>();
    (halaqah || []).forEach((h) => {
      halaqahMap.set(h.id, {
        nama: h.nama,
        musammiNama: h.musammi?.nama || 'Musammi'
      });
    });

    // Akumulasi absensi per santri
    const studentStats = new Map<
      number,
      {
        hadir: number;
        izin: number;
        sakit: number;
        terlambat: number;
        alpa: number;
        total: number;
        lastAlpaDate?: string;
      }
    >();

    (attendance || []).forEach((a) => {
      if (a.peran === 'Santri' && a.personId) {
        const existing = studentStats.get(a.personId) || {
          hadir: 0,
          izin: 0,
          sakit: 0,
          terlambat: 0,
          alpa: 0,
          total: 0
        };

        const sLower = (a.status || '').toLowerCase();
        if (sLower === 'hadir') existing.hadir++;
        else if (sLower === 'terlambat') existing.terlambat++;
        else if (sLower === 'izin') existing.izin++;
        else if (sLower === 'sakit') existing.sakit++;
        else if (sLower === 'alpa' || sLower === 'alpha') {
          existing.alpa++;
          if (!existing.lastAlpaDate || a.date > existing.lastAlpaDate) {
            existing.lastAlpaDate = a.date;
          }
        }
        existing.total++;
        studentStats.set(a.personId, existing);
      }
    });

    // Gabungkan dengan data santri aktif
    const candidates = (santri || [])
      .filter((s) => s.status !== 'Keluar' && s.status !== 'Lulus')
      .map((s) => {
        const stats = studentStats.get(s.id) || {
          hadir: 0,
          izin: 0,
          sakit: 0,
          terlambat: 0,
          alpa: 0,
          total: 0
        };

        const hInfo = s.halaqah_id ? halaqahMap.get(s.halaqah_id) : null;
        const attRate =
          stats.total > 0
            ? Math.round(((stats.hadir + stats.terlambat) / stats.total) * 100)
            : 100;

        // Ambil catatan evaluasi musammi bila ada
        const evals = (studentEvaluations || []).filter((e) => e.santri_id === s.id);
        const latestEval = evals.length > 0 ? evals[evals.length - 1] : null;

        // Tentukan urgensi status
        let urgency: 'kritis' | 'waspada' | 'pantau' | 'aman' = 'aman';
        let statusKeterangan = 'Kehadiran tertib';

        if (stats.alpa >= 3) {
          urgency = 'kritis';
          statusKeterangan = `${stats.alpa} Alpa terakumulasi · Peringatan wali`;
        } else if (stats.alpa >= 1) {
          urgency = 'waspada';
          statusKeterangan = `${stats.alpa} Alpa tanpa keterangan`;
        } else if (stats.sakit + stats.izin >= 4) {
          urgency = 'pantau';
          statusKeterangan = `${stats.sakit + stats.izin} hari izin/sakit`;
        } else if (stats.total > 5 && attRate < 75) {
          urgency = 'pantau';
          statusKeterangan = `Kehadiran rendah (${attRate}%)`;
        }

        return {
          id: s.id,
          nama: s.nama,
          nis: s.nis || '-',
          kelas: s.kelas || '-',
          marhalah: s.marhalah || '-',
          halaqahNama: hInfo?.nama || 'Tanpa halaqah',
          musammiNama: hInfo?.musammiNama || '-',
          waliNama: s.nama_wali || 'Wali Santri',
          waliPhone: s.no_hp_wali || s.no_telepon_wali || '',
          alpa: stats.alpa,
          sakit: stats.sakit,
          izin: stats.izin,
          terlambat: stats.terlambat,
          hadir: stats.hadir,
          total: stats.total,
          attRate,
          urgency,
          statusKeterangan,
          lastAlpaDate: stats.lastAlpaDate,
          catatanMusammi: latestEval?.catatan_musammi || null
        };
      });

    // Filter santri yang memiliki catatan alpa atau terlambat atau kehadiran bermasalah
    const attentionList = candidates.filter(
      (c) => c.alpa > 0 || c.terlambat > 0 || c.sakit + c.izin >= 2 || (c.total > 0 && c.attRate < 80)
    );

    // Urutkan: Terbanyak Alpa DESC -> Terbanyak Terlambat DESC -> Sakit/Izin DESC -> Rasio Kehadiran ASC
    attentionList.sort((a, b) => {
      if (b.alpa !== a.alpa) return b.alpa - a.alpa;
      if (b.terlambat !== a.terlambat) return b.terlambat - a.terlambat;
      const bAbsen = b.sakit + b.izin;
      const aAbsen = a.sakit + a.izin;
      if (bAbsen !== aAbsen) return bAbsen - aAbsen;
      return a.attRate - b.attRate;
    });

    return {
      items: attentionList.slice(0, 8),
      totalNeedingAttention: attentionList.length,
      criticalCount: attentionList.filter((c) => c.urgency === 'kritis').length,
      totalAlpaCount: attentionList.reduce((acc, c) => acc + c.alpa, 0),
      totalTerlambatCount: attentionList.reduce((acc, c) => acc + c.terlambat, 0)
    };
  }, [santri, halaqah, attendance, studentEvaluations]);

  // Card Perlu Tindakan (Action Items) — 100% Data Aktual
  const actionItems = useMemo(() => {
    const list: Array<{
      id: string;
      level: 'mendesak' | 'hari_ini' | 'rutin';
      levelLabel: string;
      title: string;
      subtitle: string;
      actionLabel: string;
      onAction: () => void;
    }> = [];

    // 1. Santri dengan Alpa Kritis (>= 2 alpa)
    if (santriPerluPerhatian.items.some((c) => c.alpa >= 2)) {
      const topAlpa = santriPerluPerhatian.items[0];
      list.push({
        id: 'critical_alpa_santri',
        level: 'mendesak',
        levelLabel: 'Mendesak',
        title: `${santriPerluPerhatian.totalNeedingAttention} santri terakumulasi alpa`,
        subtitle: `Tertinggi: ${topAlpa.nama} (${topAlpa.alpa} Alpa) · ${topAlpa.kelas}`,
        actionLabel: 'Tindak lanjuti',
        onAction: () => navigate('/app/attendance-book')
      });
    }

    // 2. Sesi halaqah aktif yang belum diisi absensi hari ini
    const activeHalaqahs = (halaqah || []).filter((h) => h.is_active !== false);
    const unrecordedHalaqah = activeHalaqahs.find((h) =>
      !(attendance || []).some((a) => a.date === todayStr && a.halaqahId === h.id)
    );

    if (unrecordedHalaqah) {
      list.push({
        id: 'unrecorded_session',
        level: 'mendesak',
        levelLabel: 'Mendesak',
        title: `${sessionKpi.unrecordedCount} halaqah belum isi absensi`,
        subtitle: `${unrecordedHalaqah.nama} · ${unrecordedHalaqah.musammi?.nama || 'Musammi'}`,
        actionLabel: 'Buka sesi',
        onAction: () =>
          navigate(
            `/app/sessions?halaqahId=${unrecordedHalaqah.id}&date=${todayStr}&slot=${
              unrecordedHalaqah.waktu?.[0] || 'Shubuh'
            }`
          )
      });
    }

    // 3. Fase 3: setoran Rasib (diulang) 7 hari terakhir — validasi setoran sudah dihapus
    const sepekanLalu = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const ulangPekanIni = (setoranHarian || []).filter((s: any) => s.is_repeat && s.tanggal >= sepekanLalu);
    if (ulangPekanIni.length > 0) {
      list.push({
        id: 'repeat_recitations',
        level: 'hari_ini',
        levelLabel: 'Pekan ini',
        title: `${ulangPekanIni.length} setoran perlu diulang (Rasib)`,
        subtitle: 'Setoran Rasib tidak menambah hafalan; jadwalkan ulang',
        actionLabel: 'Lihat',
        onAction: () => navigate('/app/recitations')
      });
    }

    // 4. Fase 4: form evaluasi periode terakhir yang sudah berakhir tetapi belum dikirim
    const periodeSelesai = (periodeEvaluasi || []).filter((p: any) => !p.needs_review && p.endDate < todayStr).slice(-1)[0];
    if (periodeSelesai) {
      const aktif = (halaqah || []).filter((h: any) => h.is_active !== false && !h.is_archived && (h.santri?.length || 0) > 0);
      const terkirim = new Set((periodForms || []).filter((f: any) => f.period_id === periodeSelesai.id && f.status === 'submitted').map((f: any) => Number(f.halaqah_id)));
      const belum = aktif.filter((h: any) => !terkirim.has(Number(h.id)));
      if (belum.length > 0) {
        list.push({
          id: 'period_forms_pending',
          level: 'hari_ini',
          levelLabel: 'Periode',
          title: `${belum.length} halaqah belum mengirim rekap ${periodeSelesai.name}`,
          subtitle: belum.slice(0, 3).map((h: any) => h.nama).join(', ') + (belum.length > 3 ? ', …' : ''),
          actionLabel: 'Pantau',
          onAction: () => navigate(`/app/evaluations-master?period=${periodeSelesai.id}`)
        });
      }
    }

    return list;
  }, [halaqah, attendance, setoranHarian, todayStr, navigate, sessionKpi, santriPerluPerhatian, periodeEvaluasi, periodForms]);

  // --------------------------------------------------------------------------
  // ROW 3: ANALITIK & PROGRES (KIRI 50% & KANAN 50%) — 100% DATA ASLI
  // --------------------------------------------------------------------------

  // Distribusi Status Kehadiran Minggu Ini (Stacked Bar Chart) — Data Aktual
  const stackedWeeklyData = useMemo(() => {
    const days: Array<{
      name: string;
      Hadir: number;
      Izin: number;
      Sakit: number;
      Terlambat: number;
      Alpa: number;
    }> = [];
    const now = new Date();
    const monday = startOfWeek(now, { weekStartsOn: 1 });

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const strDate = format(d, 'yyyy-MM-dd');
      const dayLabel = format(d, 'eee', { locale: localeId });

      const dayRecords = (attendance || []).filter((a) => a.date === strDate);
      const counts = { Hadir: 0, Izin: 0, Sakit: 0, Terlambat: 0, Alpa: 0 };

      dayRecords.forEach((r) => {
        const sLower = (r.status || '').toLowerCase();
        if (sLower === 'hadir') counts.Hadir++;
        else if (sLower === 'izin') counts.Izin++;
        else if (sLower === 'sakit') counts.Sakit++;
        else if (sLower === 'terlambat') counts.Terlambat++;
        else if (sLower === 'alpa' || sLower === 'alpha') counts.Alpa++;
      });

      days.push({
        name: dayLabel,
        ...counts
      });
    }

    return days;
  }, [attendance]);

  // Tren Perkembangan Hafalan Santri dari Evaluasi & Progres Produksi
  const hafalanTrendData = useMemo(() => {
    // Fase 4: periode dari evaluation_periods; nilai dari Rekap Periode (period_recaps)
    const hariIniStr = new Date().toISOString().slice(0, 10);
    const periods: Array<{ id: string; name: string }> = (periodeEvaluasi || [])
      .filter((p: any) => !p.needs_review && p.startDate <= hariIniStr)
      .slice(-6)
      .map((p: any) => ({ id: p.id, name: p.name }));

    const displayPeriods = periods;

    // Hitung rata-rata capaian hafalan/ziyadah/murojaah per santri dari data nyata
    return displayPeriods.map((period) => {
      let avg = 0;
      let total = 0;
      let count = 0;

      if (studentProgress && studentProgress.length > 0) {
        const matches = studentProgress.filter((sp) => {
          const matchPeriod = sp.month_key === period.id || sp.month_key === period.name;
          const matchType =
            progressScheme === 'Total Hafalan'
              ? sp.progress_type === 'Total Hafalan' || sp.progress_type === 'Hafalan'
              : sp.progress_type?.toLowerCase() === progressScheme.toLowerCase();
          return matchPeriod && matchType;
        });

        if (matches.length > 0) {
          matches.forEach((m) => {
            const val = parseFloat(m.value) || 0;
            if (!isNaN(val)) {
              total += val;
              count++;
            }
          });
          avg = count > 0 ? parseFloat((total / count).toFixed(1)) : 0;
        }
      }

      return {
        name: period.name,
        value: avg
      };
    });
  }, [periodeEvaluasi, studentProgress, progressScheme]);

  // --------------------------------------------------------------------------
  // ROW 4 KANAN: STATISTIK KEHADIRAN PER MARHALAH — 100% DATA ASLI
  // --------------------------------------------------------------------------
  const marhalahStats = useMemo(() => {
    const list =
      masterMarhalahs && masterMarhalahs.length > 0
        ? masterMarhalahs.map((m: any) => m.nama)
        : ['Marhalah Ula', 'Marhalah Wustha', 'Marhalah Ulya'];

    return list.map((mName: string) => {
      const filteredAtt = (attendance || []).filter((a) => {
        const matchesDate =
          (!marhalahDateRange.startDate || a.date >= marhalahDateRange.startDate) &&
          (!marhalahDateRange.endDate || a.date <= marhalahDateRange.endDate);
        const matchesWaktu =
          marhalahDateRange.waktu === 'all' ||
          a.waktu?.toLowerCase() === marhalahDateRange.waktu.toLowerCase();
        const matchesMarhalah = a.marhalah?.toLowerCase() === mName.toLowerCase();
        return matchesDate && matchesWaktu && matchesMarhalah;
      });

      let hadir = 0;
      let izin = 0;
      let sakit = 0;
      let alpa = 0;

      filteredAtt.forEach((item) => {
        const sLower = (item.status || '').toLowerCase();
        if (sLower === 'hadir' || sLower === 'terlambat') hadir++;
        else if (sLower === 'izin') izin++;
        else if (sLower === 'sakit') sakit++;
        else if (sLower === 'alpa' || sLower === 'alpha') alpa++;
      });

      const total = hadir + izin + sakit + alpa;
      const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;

      return {
        marhalah: mName,
        percentage: pct,
        hadir,
        izin,
        sakit,
        alpa,
        total
      };
    });
  }, [masterMarhalahs, attendance, marhalahDateRange]);

  // Statistik Kehadiran Kumulatif Santri
  const overallAttendanceStats = useMemo(() => {
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let terlambat = 0;
    let alpa = 0;

    (attendance || []).forEach((a) => {
      const sLower = (a.status || '').toLowerCase();
      if (sLower === 'hadir') hadir++;
      else if (sLower === 'terlambat') terlambat++;
      else if (sLower === 'izin') izin++;
      else if (sLower === 'sakit') sakit++;
      else if (sLower === 'alpa' || sLower === 'alpha') alpa++;
    });

    const total = hadir + izin + sakit + terlambat + alpa;
    const rate = total > 0 ? Math.round(((hadir + terlambat) / total) * 100) : 0;

    return { hadir, izin, sakit, terlambat, alpa, total, rate };
  }, [attendance]);

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
