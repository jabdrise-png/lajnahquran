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
    label: 'Sesi Halaqah',
    group: 'operasional',
    parentGroupLabel: 'Sesi & Absensi',
    roles: ['admin', 'musammi', 'superadmin'],
    breadcrumb: ['Operasional', 'Sesi Halaqah'],
    description: 'Buka sesi halaqah, kelola daftar santri sesi, isi absensi, dan catat setoran Al-Qur\'an.',
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
  '/app/enrollment-promotion': '/app/Enrollment-promotion',
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
    return false;
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

// ============================================================================
// AUTHORITATIVE TENANT & ACCESS GRANT RESOLVER (FASE 1 HARDENING)
// ============================================================================
export interface AccessGrantRecord {
  id?: string;
  user_id: string;
  organization_id: string | null;
  role: string;
  status: string;
  expires_at?: string | null;
}

export interface ResolvedTenantContext {
  userId: string | null;
  email: string | null;
  organizationId: string | null;
  organizationName: string;
  organizationLogo: string;
  fullName: string;
  effectiveRole: CanonicalRole | 'pending' | 'unknown';
  membershipStatus: MembershipStatus | 'expired' | 'none';
  supportSession: ActiveSupportSession | null;
  isSuperAdmin: boolean;
  isAuthorized: boolean;
}

export function isGrantExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return !Number.isNaN(ts) && ts <= Date.now();
}

export function getEffectiveGrantStatus(
  grant: Pick<AccessGrantRecord, 'status' | 'expires_at'>
): MembershipStatus | 'expired' {
  if (isGrantExpired(grant.expires_at)) {
    return 'expired';
  }
  const s = (grant.status || '').trim().toLowerCase();
  if (s === 'active' || s === 'invited' || s === 'suspended' || s === 'revoked') {
    return s;
  }
  return 'revoked';
}

/**
 * Resolves the caller's authoritative role, membership status, organization context,
 * and database-verified support session.
 *
 * Rules enforced (Fase 1):
 * 1. `access_grants` is the authoritative source of role and membership status.
 * 2. If a user has ANY row in `access_grants`, `profiles` is NEVER used as a fallback
 *    for privilege or active status.
 * 3. Grants with status `invited`, `suspended`, `revoked`, or `expired` (`expires_at <= now()`)
 *    are strictly rejected (`isAuthorized: false`, `effectiveRole: 'pending'`).
 * 4. Tenant grants are matched explicitly against `preferredOrgId` or `profile.organization_id`
 *    (never selected randomly via `.find(status === 'active')`).
 * 5. Support Access Sessions are verified against `public.support_access_sessions` in the DB.
 */
export async function resolveTenantContext(
  supabaseClient: any,
  preferredOrgId?: string | null
): Promise<ResolvedTenantContext> {
  const emptyCtx: ResolvedTenantContext = {
    userId: null,
    email: null,
    organizationId: null,
    organizationName: '',
    organizationLogo: '',
    fullName: '',
    effectiveRole: 'unknown',
    membershipStatus: 'none',
    supportSession: null,
    isSuperAdmin: false,
    isAuthorized: false,
  };

  try {
    let user: any = null;
    if (typeof supabaseClient?.auth?.getSession === 'function') {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData?.session?.user) {
        user = sessionData.session.user;
      }
    }
    if (!user && typeof supabaseClient?.auth?.getUser === 'function') {
      const { data: userData } = await supabaseClient.auth.getUser();
      user = userData?.user || null;
    }

    if (!user?.id) {
      return emptyCtx;
    }

    const userId: string = user.id;
    const userEmail: string | null = user.email || null;

    // 1. Load identity & preferred organization pointer from profiles
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('id, organization_id, full_name, role, organizations(name, logo_url)')
      .eq('id', userId)
      .maybeSingle();

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'Pengguna';
    const rawOrgRel = profile?.organizations;
    const orgObj = Array.isArray(rawOrgRel) ? rawOrgRel[0] : rawOrgRel;
    let orgName = orgObj?.name || '';
    const orgLogo = orgObj?.logo_url || '';
    const profileOrgId: string | null = profile?.organization_id || null;

    // 2. Load authoritative access_grants for this user
    let grants: AccessGrantRecord[] = [];
    let grantsTableAvailable = true;
    try {
      const { data: grantRows, error: grantErr } = await supabaseClient
        .from('access_grants')
        .select('id, user_id, organization_id, role, status, expires_at')
        .eq('user_id', userId);

      if (grantErr && grantErr.code === '42P01') {
        grantsTableAvailable = false;
      } else if (Array.isArray(grantRows)) {
        grants = grantRows;
      }
    } catch {
      grantsTableAvailable = false;
    }

    // 3. Determine if user is an authoritative Superadmin
    let isSuperadmin = false;
    let superadminBlocked = false;

    if (grantsTableAvailable && grants.length > 0) {
      const superGrant = grants.find((g) => normalizeRole(g.role) === 'superadmin');
      if (superGrant) {
        const superStatus = getEffectiveGrantStatus(superGrant);
        if (superStatus === 'active') {
          isSuperadmin = true;
        } else {
          superadminBlocked = true;
        }
      }
    } else if (!grantsTableAvailable || grants.length === 0) {
      // Legacy fallback ONLY when user has 0 rows in access_grants
      if (normalizeRole(profile?.role) === 'superadmin') {
        isSuperadmin = true;
      }
    }

    // 4. Verify Support Access Session against database (never trust sessionStorage alone)
    const localSupport = SupportSessionStore.getSession();
    let verifiedSupportSession: ActiveSupportSession | null = null;

    if (localSupport) {
      if (!isSuperadmin || localSupport.id.startsWith('local-')) {
        SupportSessionStore.endSession();
      } else {
        try {
          const { data: dbSupport } = await supabaseClient
            .from('support_access_sessions')
            .select('id, organization_id, superadmin_user_id, reason, mode, started_at, expires_at, ended_at')
            .eq('id', localSupport.id)
            .eq('superadmin_user_id', userId)
            .maybeSingle();

          if (
            !dbSupport ||
            dbSupport.ended_at ||
            isGrantExpired(dbSupport.expires_at)
          ) {
            SupportSessionStore.endSession();
          } else {
            verifiedSupportSession = {
              id: dbSupport.id,
              organizationId: dbSupport.organization_id,
              organizationName: localSupport.organizationName || orgName,
              reason: dbSupport.reason,
              mode: dbSupport.mode === 'read_write' ? 'read_write' : 'read_only',
              startedAt: dbSupport.started_at,
              expiresAt: dbSupport.expires_at,
            };
          }
        } catch {
          SupportSessionStore.endSession();
        }
      }
    }

    if (isSuperadmin) {
      const activeOrgId = verifiedSupportSession?.organizationId || preferredOrgId || null;
      if (verifiedSupportSession?.organizationName) {
        orgName = verifiedSupportSession.organizationName;
      }
      return {
        userId,
        email: userEmail,
        organizationId: activeOrgId,
        organizationName: orgName,
        organizationLogo: orgLogo,
        fullName,
        effectiveRole: 'superadmin',
        membershipStatus: 'active',
        supportSession: verifiedSupportSession,
        isSuperAdmin: true,
        isAuthorized: true,
      };
    }

    if (superadminBlocked && grants.length === 1) {
      const superStatus = getEffectiveGrantStatus(grants[0]);
      return {
        userId,
        email: userEmail,
        organizationId: null,
        organizationName: orgName,
        organizationLogo: orgLogo,
        fullName,
        effectiveRole: 'pending',
        membershipStatus: superStatus,
        supportSession: null,
        isSuperAdmin: false,
        isAuthorized: false,
      };
    }

    // 5. Resolve explicit tenant grant for Admin / Musammi
    const tenantGrants = grants.filter((g) => g.organization_id !== null);

    if (grantsTableAvailable && grants.length > 0) {
      // Explicit target organization resolution:
      // 1) preferredOrgId passed by caller
      // 2) profile.organization_id
      // 3) if and only if the user has exactly 1 tenant grant, that single grant's organization_id
      const explicitTargetOrgId =
        preferredOrgId ||
        profileOrgId ||
        (tenantGrants.length === 1 ? tenantGrants[0].organization_id : null);

      if (!explicitTargetOrgId) {
        return {
          userId,
          email: userEmail,
          organizationId: null,
          organizationName: orgName,
          organizationLogo: orgLogo,
          fullName,
          effectiveRole: 'pending',
          membershipStatus: 'none',
          supportSession: null,
          isSuperAdmin: false,
          isAuthorized: false,
        };
      }

      const matchingOrgGrants = tenantGrants.filter(
        (g) => g.organization_id === explicitTargetOrgId
      );

      if (matchingOrgGrants.length === 0) {
        // User has grants in access_grants, but none for explicitTargetOrgId -> DO NOT fallback to profiles!
        return {
          userId,
          email: userEmail,
          organizationId: null,
          organizationName: orgName,
          organizationLogo: orgLogo,
          fullName,
          effectiveRole: 'pending',
          membershipStatus: 'none',
          supportSession: null,
          isSuperAdmin: false,
          isAuthorized: false,
        };
      }

      // Deterministic sort if multiple role rows exist in the same org: admin before musammi
      const targetGrant = [...matchingOrgGrants].sort((a, b) => {
        const rA = normalizeRole(a.role) === 'admin' ? 0 : 1;
        const rB = normalizeRole(b.role) === 'admin' ? 0 : 1;
        return rA - rB;
      })[0];

      const effectiveStatus = getEffectiveGrantStatus(targetGrant);
      if (effectiveStatus !== 'active') {
        // Invited, suspended, revoked, or expired grant -> strictly blocked, no fallback to profiles
        return {
          userId,
          email: userEmail,
          organizationId: null,
          organizationName: orgName,
          organizationLogo: orgLogo,
          fullName,
          effectiveRole: 'pending',
          membershipStatus: effectiveStatus,
          supportSession: null,
          isSuperAdmin: false,
          isAuthorized: false,
        };
      }

      const canonical = normalizeRole(targetGrant.role);
      const isValidTenantRole = canonical === 'admin' || canonical === 'musammi';

      return {
        userId,
        email: userEmail,
        organizationId: isValidTenantRole ? targetGrant.organization_id : null,
        organizationName: orgName,
        organizationLogo: orgLogo,
        fullName,
        effectiveRole: isValidTenantRole ? canonical : 'pending',
        membershipStatus: isValidTenantRole ? 'active' : 'revoked',
        supportSession: null,
        isSuperAdmin: false,
        isAuthorized: isValidTenantRole && Boolean(targetGrant.organization_id),
      };
    }

    // 6. Legacy fallback ONLY when user has 0 rows in access_grants
    const legacyRole = normalizeRole(profile?.role);
    const isLegacyAuthorized =
      (legacyRole === 'admin' || legacyRole === 'musammi') && Boolean(profileOrgId);

    return {
      userId,
      email: userEmail,
      organizationId: isLegacyAuthorized ? profileOrgId : null,
      organizationName: orgName,
      organizationLogo: orgLogo,
      fullName,
      effectiveRole: isLegacyAuthorized ? legacyRole : 'pending',
      membershipStatus: isLegacyAuthorized ? 'active' : 'invited',
      supportSession: null,
      isSuperAdmin: false,
      isAuthorized: isLegacyAuthorized,
    };
  } catch {
    return emptyCtx;
  }
}

