// Dipecah otomatis dari Dashboard.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen Dashboard.
// Ubah perilaku di sini; tampilan ada di Dashboard.tsx.
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


export interface DashboardProps {
  onNavigate?: (page: string) => void;
  userRole?: string;
}

export function useDashboardLogika({ onNavigate, userRole }: DashboardProps) {
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

    (setoranHarian || []).forEach((r) => {
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
    const ulangPekanIni = (setoranHarian || []).filter((s) => s.is_repeat && s.tanggal >= sepekanLalu);
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
    const periodeSelesai = (periodeEvaluasi || []).filter((p) => !p.needs_review && p.endDate < todayStr).slice(-1)[0];
    if (periodeSelesai) {
      const aktif = (halaqah || []).filter((h) => h.is_active !== false && !h.is_archived && (h.santri?.length || 0) > 0);
      const terkirim = new Set((periodForms || []).filter((f) => f.period_id === periodeSelesai.id && f.status === 'submitted').map((f) => Number(f.halaqah_id)));
      const belum = aktif.filter((h) => !terkirim.has(Number(h.id)));
      if (belum.length > 0) {
        list.push({
          id: 'period_forms_pending',
          level: 'hari_ini',
          levelLabel: 'Periode',
          title: `${belum.length} halaqah belum mengirim rekap ${periodeSelesai.name}`,
          subtitle: belum.slice(0, 3).map((h) => h.nama).join(', ') + (belum.length > 3 ? ', …' : ''),
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
      .filter((p) => !p.needs_review && p.startDate <= hariIniStr)
      .slice(-6)
      .map((p) => ({ id: p.id, name: p.name }));

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
        ? masterMarhalahs.map((m) => m.nama)
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
  return { onNavigate, userRole, navigate, santri, musammi, halaqah, attendance, setoranHarian, studentProgress, studentEvaluations, appSettings, periodeEvaluasi, periodForms, loading, error, masterMarhalahs, dataAcademicYear, userProfile, ctxAcademicYear, currentAcademicYear, peranDasbor, dasborAdmin, trendRange, setTrendRange, riwayatTermuat, progressScheme, setProgressScheme, todayStr, marhalahDateRange, setMarhalahDateRange, totalSantriAktif, totalMusammi, totalHalaqahAktif, attendanceKpi, sessionKpi, recitationsVolumeKpi, lineTrendData, santriPerluPerhatian, actionItems, stackedWeeklyData, hafalanTrendData, marhalahStats, overallAttendanceStats };
}

export type DashboardLogika = ReturnType<typeof useDashboardLogika>;
