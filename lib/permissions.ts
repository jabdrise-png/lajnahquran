import type { Page } from '../types';

export type CanonicalRole = 'superadmin' | 'admin' | 'musammi';
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';

export interface SaaSRouteConfig {
  id: string;
  path: string;
  pageKey: Page;
  label: string;
  group: 'platform' | 'utama' | 'operasional' | 'akademik' | 'sistem';
  parentGroupLabel?: string;
  roles: CanonicalRole[];
  breadcrumb: [string, string];
  description: string;
  keywords: string[];
  showInSidebar?: boolean;
}

export function normalizeRole(raw?: string | null): CanonicalRole | 'pending' | 'unknown' {
  if (!raw) return 'unknown';
  const r = raw.trim().toLowerCase();
  if (r === 'super_admin' || r === 'superadmin') return 'superadmin';
  if (r === 'admin' || r === 'admin_mahad') return 'admin';
  if (r === 'musammi' || r === 'pengajar') return 'musammi';
  if (r === 'pending' || r === 'invited') return 'pending';
  return 'unknown';
}

export function formatCanonicalRoleLabel(raw?: string | null): string {
  const role = normalizeRole(raw);
  if (role === 'superadmin') return 'Superadmin Platform';
  if (role === 'admin') return 'Admin Lembaga';
  if (role === 'musammi') return 'Musammi';
  if (role === 'pending') return 'Menunggu Aktivasi';
  return 'Pengguna';
}

export const SAAS_ROUTE_MAP: SaaSRouteConfig[] = [
  // =========================================================================
  // 1. PLATFORM SHELL ROUTES (SUPERADMIN)
  // =========================================================================
  {
    id: 'platform_dashboard',
    path: '/platform/dashboard',
    pageKey: 'PlatformDashboard',
    label: 'Dashboard Platform',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Dashboard Platform'],
    description: 'Ringkasan kesehatan tenant, kesiapan setup, dan aktivitas platform.',
    keywords: ['platform', 'global', 'superadmin', 'overview', 'kpi'],
    showInSidebar: true,
  },
  {
    id: 'platform_tenants',
    path: '/platform/tenants',
    pageKey: 'PlatformTenants',
    label: 'Organisasi & Tenant',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Organisasi & Tenant'],
    description: 'Kelola daftar lembaga/ma\'had, detail tenant, provisioning tenant baru, dan undangan Admin.',
    keywords: ['tenant', 'organisasi', 'mahad', 'lembaga', 'provisioning'],
    showInSidebar: true,
  },
  {
    id: 'platform_accounts',
    path: '/platform/accounts',
    pageKey: 'PlatformAccounts',
    label: 'Akun Platform & Grants',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Akun Platform & Grants'],
    description: 'Manajemen akun Superadmin dan seluruh access_grants lintas organisasi.',
    keywords: ['akun platform', 'superadmin', 'access grants', 'role', 'users'],
    showInSidebar: true,
  },
  {
    id: 'platform_plans',
    path: '/platform/plans',
    pageKey: 'PlatformPlans',
    label: 'Paket & Entitlements',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Paket & Entitlements'],
    description: 'Konfigurasi paket layanan SaaS, kuota santri/musammi, dan fitur integrasi per tenant.',
    keywords: ['paket', 'plan', 'entitlements', 'kuota', 'langganan'],
    showInSidebar: true,
  },
  {
    id: 'platform_support',
    path: '/platform/support-sessions',
    pageKey: 'PlatformSupport',
    label: 'Support Access',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Support Access'],
    description: 'Akses bantuan lintas tenant berbatas waktu, wajib alasan, dan tercatat di audit log.',
    keywords: ['support', 'akses', 'break-glass', 'bantuan', 'sesi'],
    showInSidebar: true,
  },
  {
    id: 'platform_audit',
    path: '/platform/audit',
    pageKey: 'PlatformAudit',
    label: 'Audit & Health Monitor',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Audit & Health Monitor'],
    description: 'Jejak audit perubahan platform, grant role, sesi support, dan monitor kesehatan sistem.',
    keywords: ['audit', 'log', 'health', 'keamanan', 'histori'],
    showInSidebar: true,
  },
  {
    id: 'platform_settings',
    path: '/platform/settings',
    pageKey: 'PlatformSettings',
    label: 'Pengaturan Platform',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Pengaturan Platform'],
    description: 'Kebijakan global keamanan sesi support, parameter provisioning default, dan pengumuman sistem.',
    keywords: ['pengaturan platform', 'kebijakan', 'security policy', 'maintenance'],
    showInSidebar: true,
  },
  {
    id: 'platform_cms',
    path: '/platform/cms',
    pageKey: 'WebsiteEditor',
    label: 'Landing Page Platform',
    group: 'platform',
    roles: ['superadmin'],
    breadcrumb: ['Platform Global', 'Landing Page Platform'],
    description: 'Pengaturan konten publik dan halaman depan aplikasi.',
    keywords: ['website', 'cms', 'landing', 'publik'],
    showInSidebar: true,
  },

  // =========================================================================
  // 2. TENANT COMMON ROUTES (ADMIN & MUSAMMI)
  // =========================================================================
  {
    id: 'tenant_dashboard',
    path: '/app/dashboard',
    pageKey: 'Dashboard',
    label: 'Beranda',
    group: 'utama',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Ikhtisar', 'Beranda'],
    description: 'Ringkasan aktivitas harian, sesi halaqah, absensi, dan capaian setoran.',
    keywords: ['dashboard', 'beranda', 'home', 'statistik'],
    showInSidebar: true,
  },
  {
    id: 'tenant_announcements',
    path: '/app/announcements',
    pageKey: 'Pusat Informasi',
    label: 'Pengumuman',
    group: 'utama',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Ikhtisar', 'Pengumuman'],
    description: 'Papan maklumat, agenda akademik, dan informasi resmi lembaga.',
    keywords: ['pengumuman', 'informasi', 'agenda', 'berita'],
    showInSidebar: true,
  },

  // =========================================================================
  // 3. OPERASIONAL HARIAN (SESI, ABSENSI & SETORAN)
  // =========================================================================
  {
    id: 'tenant_sessions',
    path: '/app/sessions',
    pageKey: 'SesiHalaqah',
    label: 'Sesi & Ruang Halaqah',
    group: 'operasional',
    parentGroupLabel: 'Sesi & Absensi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Sesi & Ruang Halaqah'],
    description: 'Buka sesi halaqah, bekukan roster aktif, isi absensi dan transaksi setoran Al-Qur\'an.',
    keywords: ['sesi', 'halaqah', 'jadwal', 'musammi', 'mulai sesi'],
    showInSidebar: true,
  },
  {
    id: 'tenant_attendance_input',
    path: '/app/attendance',
    pageKey: 'Absensi',
    label: 'Input Absensi',
    group: 'operasional',
    parentGroupLabel: 'Sesi & Absensi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Input Absensi'],
    description: 'Pencatatan kehadiran santri dan musammi per waktu sesi halaqah.',
    keywords: ['absensi', 'kehadiran', 'presensi', 'input'],
    showInSidebar: true,
  },
  {
    id: 'tenant_attendance_book',
    path: '/app/attendance-book',
    pageKey: 'Buku Absensi',
    label: 'Buku & Rekap Absensi',
    group: 'operasional',
    parentGroupLabel: 'Sesi & Absensi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Buku & Rekap Absensi'],
    description: 'Arsip buku absensi harian, cetak fisik, dan koreksi kehadiran teraudit.',
    keywords: ['buku absensi', 'rekap absen', 'cetak'],
    showInSidebar: true,
  },
  {
    id: 'tenant_attendance_print',
    path: '/app/attendance-print',
    pageKey: 'CetakBukuFisik',
    label: 'Cetak Buku Fisik',
    group: 'operasional',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Cetak Buku Fisik'],
    description: 'Cetak dokumen buku absensi fisik per halaqah.',
    keywords: ['cetak', 'buku fisik', 'print'],
    showInSidebar: false,
  },
  {
    id: 'tenant_recitations',
    path: '/app/recitations',
    pageKey: 'SetoranHarian',
    label: 'Setoran & Murajaah',
    group: 'operasional',
    parentGroupLabel: 'Setoran & Evaluasi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Setoran & Murajaah'],
    description: 'Daftar transaksi setoran ziyadah/sabaq, sabqi, dan manzil beserta status validasi.',
    keywords: ['setoran', 'ziyadah', 'murojaah', 'sabqi', 'manzil', 'hafalan'],
    showInSidebar: true,
  },
  {
    id: 'tenant_evaluations_input',
    path: '/app/evaluations',
    pageKey: 'Input Evaluasi',
    label: 'Input Evaluasi Berkala',
    group: 'operasional',
    parentGroupLabel: 'Setoran & Evaluasi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Input Evaluasi Berkala'],
    description: 'Pencatatan capaian hafalan periodik dan evaluasi adab/kualitas bacaan.',
    keywords: ['input evaluasi', 'perkembangan', 'bulanan'],
    showInSidebar: true,
  },
  {
    id: 'tenant_evaluations_master',
    path: '/app/evaluations-master',
    pageKey: 'Master Data Perkembangan',
    label: 'Progres & Evaluasi Santri',
    group: 'operasional',
    parentGroupLabel: 'Setoran & Evaluasi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Progres & Evaluasi Santri'],
    description: 'Analitik perkembangan hafalan, rasio kehadiran, dan linimasa capaian santri.',
    keywords: ['progres', 'statistik perkembangan', 'master perkembangan'],
    showInSidebar: true,
  },
  {
    id: 'tenant_targets',
    path: '/app/targets',
    pageKey: 'Pengaturan Evaluasi',
    label: 'Target & Periode Evaluasi',
    group: 'operasional',
    parentGroupLabel: 'Setoran & Evaluasi',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Akademik', 'Target & Periode Evaluasi'],
    description: 'Konfigurasi target hafalan per tahun ajaran/semester/marhalah dan periode evaluasi.',
    keywords: ['target', 'periode evaluasi', 'pengaturan evaluasi'],
    showInSidebar: true,
  },

  // =========================================================================
  // 4. UJIAN, BUKU NILAI, RAPORT & LAPORAN
  // =========================================================================
  {
    id: 'tenant_exams_monthly',
    path: '/app/exams-monthly',
    pageKey: 'UjianBulanan',
    label: 'Ujian Bulanan',
    group: 'akademik',
    parentGroupLabel: 'Ujian & Raport',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Akademik', 'Ujian Bulanan'],
    description: 'Pelaksanaan dan penilaian ujian hafalan bulanan.',
    keywords: ['ujian bulanan', 'nilai bulanan'],
    showInSidebar: true,
  },
  {
    id: 'tenant_exams_semester',
    path: '/app/exams-semester',
    pageKey: 'UjianSemester',
    label: 'Ujian Semester & Remedial',
    group: 'akademik',
    parentGroupLabel: 'Ujian & Raport',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Akademik', 'Ujian Semester & Remedial'],
    description: 'Penilaian ujian akhir semester per juz, kesalahan shogir/kabir, dan attempt remedial.',
    keywords: ['ujian semester', 'remedial', 'ikhtibar'],
    showInSidebar: true,
  },
  {
    id: 'tenant_gradebook',
    path: '/app/report-cards',
    pageKey: 'RekapNilai',
    label: 'Buku Nilai & Raport',
    group: 'akademik',
    parentGroupLabel: 'Ujian & Raport',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Akademik', 'Buku Nilai & Raport'],
    description: 'Rekapitulasi nilai komprehensif, penerbitan snapshot raport resmi, dan cetak dokumen.',
    keywords: ['rekap nilai', 'raport', 'gradebook', 'cetak raport'],
    showInSidebar: true,
  },
  {
    id: 'tenant_rubrics',
    path: '/app/settings/rubrics',
    pageKey: 'PengaturanNilai',
    label: 'Rubrik & Skema Nilai',
    group: 'akademik',
    parentGroupLabel: 'Ujian & Raport',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Akademik', 'Rubrik & Skema Nilai'],
    description: 'Konfigurasi bobot penilaian, pengurang kesalahan, dan skala predikat berversi.',
    keywords: ['pengaturan nilai', 'rubrik', 'predikat', 'bobot'],
    showInSidebar: true,
  },
  {
    id: 'tenant_reports',
    path: '/app/reports',
    pageKey: 'LaporanRekap',
    label: 'Laporan & Analitik',
    group: 'akademik',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Akademik', 'Laporan & Analitik'],
    description: 'Laporan kehadiran global, rekap per kelas, tren historis sesi, dan ekspor data.',
    keywords: ['laporan', 'analitik', 'rekap global', 'tren historis', 'export'],
    showInSidebar: true,
  },

  // =========================================================================
  // 5. PERSIAPAN AKADEMIK, DATA MASTER & SISTEM LEMBAGA (ADMIN)
  // =========================================================================
  {
    id: 'tenant_academic_years',
    path: '/app/academic-years',
    pageKey: 'TahunAjaran',
    label: 'Tahun Ajaran & Kelas',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Tahun Ajaran & Kelas'],
    description: 'Konfigurasi tahun ajaran, semester, marhalah, kelas, dan penanggung jawab administratif.',
    keywords: ['tahun ajaran', 'semester', 'marhalah', 'kelas', 'struktur'],
    showInSidebar: true,
  },
  {
    id: 'tenant_students',
    path: '/app/students',
    pageKey: 'DataSantri',
    label: 'Data Santri & Enrollment',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Data Santri & Enrollment'],
    description: 'Identitas master santri, penempatan kelas per tahun ajaran, dan riwayat akademik.',
    keywords: ['santri', 'murid', 'enrollment', 'siswa'],
    showInSidebar: true,
  },
  {
    id: 'tenant_promotion',
    path: '/app/Enrollment-promotion',
    pageKey: 'KenaikanKelas',
    label: 'Mutasi & Kenaikan Kelas',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Mutasi & Kenaikan Kelas'],
    description: 'Rekonsiliasi penempatan kelas santri antar tahun ajaran tanpa menimpa histori.',
    keywords: ['kenaikan kelas', 'mutasi', 'lulus', 'penutupan tahun'],
    showInSidebar: true,
  },
  {
    id: 'tenant_musammi',
    path: '/app/musammi',
    pageKey: 'DataMusammi',
    label: 'Data Musammi',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Data Musammi'],
    description: 'Profil staf Musammi, undangan akun server-side, dan penugasan halaqah.',
    keywords: ['musammi', 'ustadz', 'pengampu', 'staf'],
    showInSidebar: true,
  },
  {
    id: 'tenant_halaqah',
    path: '/app/halaqah',
    pageKey: 'DataHalaqah',
    label: 'Kelompok Halaqah',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Kelompok Halaqah'],
    description: 'Manajemen kelompok halaqah, penugasan Musammi utama, dan keanggotaan santri.',
    keywords: ['halaqah', 'kelompok', 'anggota'],
    showInSidebar: true,
  },
  {
    id: 'tenant_wali_kelas_attr',
    path: '/app/structure/homeroom',
    pageKey: 'DataWaliKelas',
    label: 'Atribut Wali Kelas',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Atribut Wali Kelas'],
    description: 'Daftar penanggung jawab administratif Wali Kelas per rombongan belajar.',
    keywords: ['wali kelas', 'penanggung jawab kelas'],
    showInSidebar: true,
  },
  {
    id: 'tenant_musyrif_attr',
    path: '/app/structure/musyrif',
    pageKey: 'DataMusyrif',
    label: 'Atribut Musyrif',
    group: 'sistem',
    parentGroupLabel: 'Struktur & Master Data',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Struktur Akademik', 'Atribut Musyrif'],
    description: 'Daftar pembina/musyrif administratif pendamping santri.',
    keywords: ['musyrif', 'pembina asrama'],
    showInSidebar: true,
  },
  {
    id: 'tenant_users',
    path: '/app/users',
    pageKey: 'Users',
    label: 'Akses Pengguna',
    group: 'sistem',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Sistem Lembaga', 'Akses Pengguna'],
    description: 'Manajemen grant akses Admin dan Musammi serta status aktivasi akun.',
    keywords: ['users', 'pengguna', 'akun', 'role', 'undangan'],
    showInSidebar: true,
  },
  {
    id: 'tenant_audit',
    path: '/app/settings/audit',
    pageKey: 'AuditLembaga',
    label: 'Audit & Snapshot Raport',
    group: 'sistem',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Sistem Lembaga', 'Audit & Snapshot Raport'],
    description: 'Riwayat tindakan Admin/Musammi, revisi nilai, dan arsip raport published.',
    keywords: ['audit', 'log', 'riwayat', 'snapshot raport', 'amendment'],
    showInSidebar: true,
  },
  {
    id: 'tenant_settings',
    path: '/app/settings',
    pageKey: 'Settings',
    label: 'Pengaturan Lembaga',
    group: 'sistem',
    roles: ['admin', 'superadmin'],
    breadcrumb: ['Sistem Lembaga', 'Pengaturan Lembaga'],
    description: 'Identitas lembaga, metode perhitungan Tahfidz, dan integrasi server-side.',
    keywords: ['pengaturan', 'settings', 'integrasi', 'telegram', 'whatsapp'],
    showInSidebar: true,
  },
];

export const PATH_ALIAS_MAP: Record<string, string> = {
  '/absensi': '/app/attendance',
  '/buku-absensi': '/app/attendance-book',
  '/input-evaluasi': '/app/evaluations',
  '/raport': '/app/report-cards',
  '/app/gradebook': '/app/report-cards',
  '/app/my-halaqah': '/app/sessions',
  '/app/my-schedule': '/app/sessions',
  '/app/schedule': '/app/halaqah',
  '/app/structure/marhalah': '/app/academic-years',
  '/app/structure/classes': '/app/structure/homeroom',
  '/app/exams': '/app/exams-semester',
  '/app/settings/organization': '/app/settings',
  '/app/settings/methodology': '/app/settings',
  '/app/settings/integrations': '/app/settings',
};

export function resolveRouteByPath(pathname: string): SaaSRouteConfig | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const canonicalPath = PATH_ALIAS_MAP[clean] || clean;
  if (canonicalPath.startsWith('/platform/tenants/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/platform/tenants');
  }
  if (canonicalPath.startsWith('/app/students/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/app/students');
  }
  if (canonicalPath.startsWith('/app/halaqah/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/app/halaqah');
  }
  if (canonicalPath.startsWith('/app/sessions/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/app/sessions');
  }
  return SAAS_ROUTE_MAP.find((r) => r.path === canonicalPath);
}

export function resolveRouteByPageKey(pageKey: string): SaaSRouteConfig | undefined {
  return SAAS_ROUTE_MAP.find((r) => r.pageKey === pageKey);
}

export function isRouteAllowed(
  pageOrPath: string,
  rawRole?: string | null,
  hasActiveSupportSession: boolean = false
): boolean {
  const role = normalizeRole(rawRole);
  if (role === 'pending' || role === 'unknown') return false;

  const route =
    resolveRouteByPath(pageOrPath) ||
    resolveRouteByPageKey(pageOrPath);

  if (!route) {
    return role === 'superadmin' || role === 'admin';
  }

  // Superadmin secara default berada di Platform Shell (/platform/*).
  // Akses ke rute akademik tenant (/app/*) wajib melalui Support Access Session aktif (Break-Glass).
  if (role === 'superadmin') {
    if (route.group === 'platform') return true;
    return Boolean(hasActiveSupportSession);
  }

  return route.roles.includes(role);
}

// ============================================================================
// SUPPORT ACCESS SESSION STORE (UNTUK SUPERADMIN BREAK-GLASS KE TENANT)
// ============================================================================
export interface ActiveSupportSession {
  id: string;
  organizationId: string;
  organizationName: string;
  reason: string;
  mode: 'read_only' | 'read_write';
  startedAt: string;
  expiresAt: string;
}

const SUPPORT_SESSION_STORAGE_KEY = 'lajnah_active_support_session_v2';
type Listener = (session: ActiveSupportSession | null) => void;
const listeners = new Set<Listener>();

export const SupportSessionStore = {
  getSession(): ActiveSupportSession | null {
    try {
      const raw = sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed: ActiveSupportSession = JSON.parse(raw);
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  startSession(session: ActiveSupportSession) {
    try {
      sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage quota errors
    }
    window.dispatchEvent(new CustomEvent('support_session_changed', { detail: session }));
    listeners.forEach((l) => l(session));
  },

  endSession() {
    try {
      sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('support_session_changed', { detail: null }));
    listeners.forEach((l) => l(null));
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
