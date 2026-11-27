import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { lazyHalaman, MemuatHalaman } from './lib/muatHalaman';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import PwaKontrol from './components/PwaKontrol';
// Fase 7: semua halaman dimuat saat dibuka (code-splitting per rute)
const Dashboard = lazyHalaman(() => import('./pages/Dashboard'));
const AbsensiPage = lazyHalaman(() => import('./pages/Operasional/AbsensiPage'));
const AttendanceBook = lazyHalaman(() => import('./pages/AttendanceBook'));
const BukuAbsensiPage = lazyHalaman(() => import('./pages/BukuAbsensiPage'));
const Login = lazyHalaman(() => import('./pages/Login'));
const ResetSandiPage = lazyHalaman(() => import('./pages/ResetSandiPage'));
const Informasi = lazyHalaman(() => import('./pages/Informasi'));
const Users = lazyHalaman(() => import('./pages/Users'));

// DATA MASTER PAGES
const SantriPage = lazyHalaman(() => import('./pages/DataMaster/SantriPage'));
const MusammiPage = lazyHalaman(() => import('./pages/DataMaster/MusammiPage'));
const MusyrifDataPage = lazyHalaman(() => import('./pages/DataMaster/MusyrifDataPage'));
const WaliKelasPage = lazyHalaman(() => import('./pages/DataMaster/WaliKelasPage'));
const KenaikanKelasPage = lazyHalaman(() => import('./pages/DataMaster/KenaikanKelasPage'));
const HalaqahPage = lazyHalaman(() => import('./pages/DataMaster/HalaqahPage'));
const LandingPage = lazyHalaman(() => import('./pages/LandingPage'));
const AdminGalleryPage = lazyHalaman(() => import('./pages/AdminGalleryPage'));
const TahunAjaranPage = lazyHalaman(() => import('./pages/DataMaster/TahunAjaranPage'));

// AKADEMIK & OPERASIONAL PAGES
const SetoranHarianPage = lazyHalaman(() => import('./pages/SetoranHarianPage'));
const FormEvaluasiPeriodePage = lazyHalaman(() => import('./pages/Evaluasi/FormEvaluasiPeriodePage'));
const ProgresEvaluasiPage = lazyHalaman(() => import('./pages/Evaluasi/ProgresEvaluasiPage'));
const PengaturanEvaluasiPage = lazyHalaman(() => import('./pages/PengaturanEvaluasiPage'));
const SesiHalaqahPage = lazyHalaman(() => import('./pages/Operasional/SesiHalaqahPage'));
const AuditLembagaPage = lazyHalaman(() => import('./pages/Akademik/AuditLembagaPage'));

// PLATFORM CONSOLE (SUPERADMIN)
const PlatformConsolePage = lazyHalaman(() => import('./pages/Platform/PlatformConsolePage'));

// UJIAN & RAPORT
const UjianBulananPage = lazyHalaman(() => import('./pages/UjianRaport/UjianBulananPage'));
const UjianSemesterPage = lazyHalaman(() => import('./pages/UjianRaport/UjianSemesterPage'));
const RekapNilaiPage = lazyHalaman(() => import('./pages/UjianRaport/RekapNilaiPage'));
const PengaturanNilaiPage = lazyHalaman(() => import('./pages/UjianRaport/PengaturanNilaiPage'));
const NotifikasiTelegramPage = lazyHalaman(() => import('./pages/Pengaturan/NotifikasiTelegramPage'));
const LaporanMudirPage = lazyHalaman(() => import('./pages/Laporan/LaporanMudirPage'));

// LAPORAN & SISTEM PAGES
const LaporanRekapPage = lazyHalaman(() => import('./pages/Laporan/LaporanRekapPage'));
const SettingsPage = lazyHalaman(() => import('./pages/SettingsPage'));
const WebsiteEditorPage = lazyHalaman(() => import('./pages/WebsiteEditorPage'));
const AcceptInvitePage = lazyHalaman(() => import('./pages/AcceptInvitePage'));
const VerifyReportPage = lazyHalaman(() => import('./pages/VerifyReportPage'));

import type { Page } from './types';
import { supabase } from './lib/supabaseClient';
import { Lock, LogOut } from 'lucide-react';
import { ActiveRoleStore, labelPeran } from './lib/activeRole';
import {
  normalizeRole,
  resolveRouteByPageKey,
  resolveTenantContext,
  SupportSessionStore,
  ActiveSupportSession,
  bersihkanCacheKonteks,
} from './lib/permissions';
import {
  PublicLayout,
  PlatformLayout,
  TenantLayout,
} from './components/layouts/SaaSLayouts';

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Organization & Role State
  const [orgDetails, setOrgDetails] = useState<{ name: string; logo: string } | null>(null);
  const [userProfile, setUserProfile] = useState<{ name: string; role: string } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // Fase 2: akun multi-peran
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [needsRolePick, setNeedsRolePick] = useState(false);
  const [supportSession, setSupportSession] = useState<ActiveSupportSession | null>(() =>
    SupportSessionStore.getSession()
  );

  useEffect(() => {
    const unsubSupport = SupportSessionStore.subscribe((sess) => setSupportSession(sess));
    return () => unsubSupport();
  }, []);

  const fetchUserOrganization = useCallback(async (_userId: string) => {
    try {
      const ctx = await resolveTenantContext(supabase);
      setSupportSession(ctx.supportSession);

      if (!ctx.userId) {
        setUserProfile(null);
        setIsSuperAdmin(false);
        setIsPending(false);
        return;
      }

      const displayRole = ctx.isAuthorized ? ctx.effectiveRole : 'pending';
      const roles = ctx.isAuthorized && !ctx.isSuperAdmin ? ctx.availableRoles || [] : [];
      setAvailableRoles(roles);
      setNeedsRolePick(roles.length > 1 && !ActiveRoleStore.get());
      setUserProfile({
        name: ctx.fullName || 'Pengguna',
        role: displayRole,
      });

      if (ctx.isAuthorized && ctx.isSuperAdmin) {
        setIsSuperAdmin(true);
        setIsPending(false);
      } else if (!ctx.isAuthorized) {
        setIsPending(true);
        setIsSuperAdmin(false);
      } else {
        setIsSuperAdmin(false);
        setIsPending(false);
      }

      if (ctx.organizationName) {
        setOrgDetails({
          name: ctx.organizationName,
          logo: ctx.organizationLogo || '',
        });
      }
    } catch (e) {
      console.error('Failed to fetch organization', e);
    }
  }, []);

  useEffect(() => {
    const handleOrgUpdate = (e: any) => {
      setOrgDetails({
        name: e.detail.name,
        logo: e.detail.logo,
      });
    };
    window.addEventListener('organization_updated', handleOrgUpdate);
    return () => window.removeEventListener('organization_updated', handleOrgUpdate);
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (error) {
          if (
            error.message.includes('Refresh Token') ||
            error.message.includes('refresh token')
          ) {
            supabase.auth.signOut().catch(() => {});
          }
        }
        setSession(session);
        if (session?.user) {
          await fetchUserOrganization(session.user.id);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Token diperbarui tidak mengubah peran; masuk/keluar/ubah akun mengosongkan cache konteks
      if (event !== 'TOKEN_REFRESHED') bersihkanCacheKonteks();
      setSession(nextSession);
      if (nextSession?.user) {
        fetchUserOrganization(nextSession.user.id);
      } else {
        setOrgDetails(null);
        setUserProfile(null);
        setIsSuperAdmin(false);
        setIsPending(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchUserOrganization]);

  const handleSetPage = useCallback(
    (page: Page) => {
      const route = resolveRouteByPageKey(page);
      const targetPath = route?.path || '/app/dashboard';
      if (location.pathname !== targetPath) {
        const navGuard = (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
        if (typeof navGuard === 'function') {
          const handled = navGuard(targetPath, () => navigate(targetPath));
          if (handled === true) return;
        }
        navigate(targetPath);
      }
    },
    [location.pathname, navigate]
  );

  const handleSwitchRole = (role: string) => {
    ActiveRoleStore.set(role);
    setNeedsRolePick(false);
    // Muat ulang agar menu, data, dan hak tampilan mengikuti peran baru
    window.location.assign('/app/dashboard');
  };

  const handleLogout = async () => {
    ActiveRoleStore.set(null);
    SupportSessionStore.endSession();
    await supabase.auth.signOut();
    setIsSuperAdmin(false);
    setIsPending(false);
    navigate('/', { replace: true });
  };

  const handleEndSupportSession = async () => {
    if (!supportSession?.id) return;

    if (!supportSession.id.startsWith('local-')) {
      const { data: endedOk, error: endErr } = await (supabase as any).rpc(
        'rpc_end_support_session',
        {
          p_session_id: supportSession.id,
        }
      );

      if (endErr || endedOk === false) {
        console.error('Gagal mengakhiri Support Access Session:', endErr);
        return;
      }
    }

    SupportSessionStore.endSession();
    setSupportSession(null);
    navigate('/platform/support-sessions');
  };

  const canonicalRole = normalizeRole(isSuperAdmin ? 'superadmin' : userProfile?.role);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-neutral text-slate-600 flex-col gap-4">
        <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium animate-pulse">Memuat Aplikasi...</p>
      </div>
    );
  }

  if (session && isPending && !location.pathname.startsWith('/invite') && !location.pathname.startsWith('/reset-password')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-neutral p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-yellow-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Akun Menunggu Aktivasi / Ditangguhkan</h2>
          <p className="text-slate-600 mb-6 text-sm leading-relaxed">
            Akun ini belum diaktifkan atau akses keanggotaan Anda sedang ditangguhkan oleh Admin Lembaga.
          </p>
          <button
            onClick={handleLogout}
            className="btn btn-secondary justify-center w-full"
          >
            <LogOut size={16} className="mr-2" /> Keluar
          </button>
        </div>
      </div>
    );
  }

  const shellProps = {
    session,
    canonicalRole,
    isSuperAdmin,
    userName: userProfile?.name,
    userRole: userProfile?.role,
    orgName: orgDetails?.name,
    orgLogo: orgDetails?.logo,
    supportSession,
    onNavigatePage: handleSetPage,
    onLogout: handleLogout,
    onEndSupportSession: handleEndSupportSession,
    availableRoles,
    onSwitchRole: handleSwitchRole,
  };

  if (session && needsRolePick && !location.pathname.startsWith('/invite') && !location.pathname.startsWith('/reset-password')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-neutral p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Masuk sebagai</h2>
          <p className="text-slate-600 mb-6 text-sm">
            Akun Anda memiliki lebih dari satu peran. Pilih peran untuk sesi ini; Anda bisa menggantinya kapan saja dari bagian atas layar.
          </p>
          <div className="space-y-3">
            {availableRoles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleSwitchRole(r)}
                className="w-full py-3 rounded-lg border border-slate-300 hover:border-secondary hover:bg-slate-50 font-semibold text-slate-800"
              >
                {labelPeran(r)}
              </button>
            ))}
          </div>
          <button onClick={handleLogout} className="mt-6 text-sm text-slate-500 hover:text-slate-700">
            Keluar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <PwaKontrol />
    <Suspense fallback={<MemuatHalaman />}>
    <Routes>
      {/* =====================================================================
          1. PUBLIC SHELL ROUTES (/ , /login, /invite, /verify)
         ===================================================================== */}
      <Route element={<PublicLayout session={session} isSuperAdmin={isSuperAdmin} />}>
        <Route path="/" element={<LandingPage onLoginClick={() => navigate('/login')} />} />
        <Route path="/login" element={<Login onBack={() => navigate('/')} />} />
        <Route path="/invite" element={<AcceptInvitePage />} />
        <Route path="/reset-password" element={<ResetSandiPage />} />
        <Route path="/verify" element={<VerifyReportPage />} />
        <Route path="/verify/:code" element={<VerifyReportPage />} />
      </Route>

      {/* =====================================================================
          2. PLATFORM SHELL ROUTES (/platform/* — KHUSUS SUPERADMIN)
         ===================================================================== */}
      <Route path="/platform" element={<PlatformLayout {...shellProps} />}>
        <Route index element={<Navigate to="/platform/dashboard" replace />} />
        <Route
          path="dashboard"
          element={<PlatformConsolePage activeTab="dashboard" onNavigate={handleSetPage} />}
        />
        <Route
          path="tenants"
          element={<PlatformConsolePage activeTab="tenants" onNavigate={handleSetPage} />}
        />
        <Route
          path="tenants/:tenantId"
          element={<PlatformConsolePage activeTab="tenants" onNavigate={handleSetPage} />}
        />
        <Route
          path="accounts"
          element={<PlatformConsolePage activeTab="accounts" onNavigate={handleSetPage} />}
        />
        <Route
          path="plans"
          element={<PlatformConsolePage activeTab="plans" onNavigate={handleSetPage} />}
        />
        <Route
          path="support-sessions"
          element={<PlatformConsolePage activeTab="support" onNavigate={handleSetPage} />}
        />
        <Route
          path="audit"
          element={<PlatformConsolePage activeTab="audit" onNavigate={handleSetPage} />}
        />
        <Route
          path="settings"
          element={<PlatformConsolePage activeTab="settings" onNavigate={handleSetPage} />}
        />
        <Route path="cms" element={<WebsiteEditorPage />} />
      </Route>

      {/* =====================================================================
          3. TENANT SHELL ROUTES (/app/* — ADMIN & MUSAMMI)
         ===================================================================== */}
      <Route path="/app" element={<TenantLayout {...shellProps} />}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />

        {/* Rute Bersama Tenant */}
        <Route
          path="dashboard"
          element={
            <Dashboard
              onNavigate={(page: string) => handleSetPage(page as Page)}
              userRole={userProfile?.role}
            />
          }
        />
        <Route path="announcements" element={<Informasi userRole={userProfile?.role} />} />

        {/* Operasional Harian (Sesi, Absensi, Setoran & Evaluasi) */}
        <Route path="sessions" element={<SesiHalaqahPage />} />
        <Route path="sessions/:sessionId" element={<SesiHalaqahPage />} />
        <Route path="sessions/:sessionId/attendance" element={<SesiHalaqahPage />} />
        <Route path="sessions/:sessionId/recitations" element={<SesiHalaqahPage />} />
        <Route path="my-halaqah" element={<SesiHalaqahPage />} />
        <Route path="my-schedule" element={<SesiHalaqahPage />} />
        <Route
          path="attendance"
          element={<AbsensiPage />}
        />
        <Route
          path="attendance-book"
          element={<BukuAbsensiPage onNavigate={(page: any) => handleSetPage(page)} />}
        />
        <Route
          path="attendance-print"
          element={<AttendanceBook onNavigate={(page: any) => handleSetPage(page)} />}
        />
        <Route path="recitations" element={<SetoranHarianPage />} />
        <Route path="evaluations" element={<FormEvaluasiPeriodePage />} />
        <Route path="evaluations-master" element={<ProgresEvaluasiPage />} />
        <Route path="targets" element={<PengaturanEvaluasiPage />} />

        {/* Ujian, Buku Nilai, Raport & Laporan */}
        <Route path="exams" element={<UjianSemesterPage />} />
        <Route path="exams/:examId" element={<UjianSemesterPage />} />
        <Route path="exams-monthly" element={<UjianBulananPage />} />
        <Route path="exams-semester" element={<UjianSemesterPage />} />
        <Route path="gradebook" element={<RekapNilaiPage />} />
        <Route path="report-cards" element={<RekapNilaiPage />} />
        <Route path="settings/rubrics" element={<PengaturanNilaiPage />} />
        <Route path="telegram" element={<NotifikasiTelegramPage />} />
        <Route path="reports/mudir" element={<LaporanMudirPage />} />
        <Route
          path="reports"
          element={<LaporanRekapPage onNavigate={(page: string) => handleSetPage(page as Page)} />}
        />

        {/* Persiapan Akademik, Data Master & Sistem Lembaga */}
        <Route path="academic-years" element={<TahunAjaranPage />} />
        <Route path="students" element={<SantriPage />} />
        <Route path="students/:studentId" element={<SantriPage />} />
        <Route path="Enrollment-promotion" element={<KenaikanKelasPage />} />
        <Route path="enrollment-promotion" element={<KenaikanKelasPage />} />
        <Route path="musammi" element={<MusammiPage />} />
        <Route path="halaqah" element={<HalaqahPage />} />
        <Route path="halaqah/:halaqahId" element={<HalaqahPage />} />
        <Route path="schedule" element={<HalaqahPage />} />
        <Route path="structure/marhalah" element={<TahunAjaranPage />} />
        <Route path="structure/classes" element={<TahunAjaranPage />} />
        <Route path="structure/homeroom" element={<WaliKelasPage />} />
        <Route path="structure/musyrif" element={<MusyrifDataPage />} />
        <Route path="users" element={<Users />} />
        <Route path="settings/audit" element={<AuditLembagaPage />} />
        <Route path="settings/organization" element={<SettingsPage />} />
        <Route path="settings/methodology" element={<SettingsPage />} />
        <Route path="settings/integrations" element={<SettingsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* =====================================================================
          4. SUPERADMIN GALLERY EDITOR & LEGACY ROUTE ALIASES
         ===================================================================== */}
      <Route
        path="/admin"
        element={
          session && isSuperAdmin ? (
            <AdminGalleryPage />
          ) : (
            <Navigate to={session ? '/app/dashboard' : '/login'} replace />
          )
        }
      />
      <Route
        path="/admin-landing"
        element={
          session && isSuperAdmin ? (
            <AdminGalleryPage />
          ) : (
            <Navigate to={session ? '/app/dashboard' : '/login'} replace />
          )
        }
      />

      {/* Redirect otomatis dari seluruh URL lama (/absensi, /buku-absensi, /input-evaluasi, /raport, dll.) */}
      <Route path="/absensi" element={<Navigate to="/app/attendance" replace />} />
      <Route path="/buku-absensi" element={<Navigate to="/app/attendance-book" replace />} />
      <Route path="/input-evaluasi" element={<Navigate to="/app/evaluations" replace />} />
      <Route path="/raport" element={<Navigate to="/app/report-cards" replace />} />

      {/* Fallback rute tidak dikenal */}
      <Route
        path="*"
        element={
          <Navigate
            to={!session ? '/' : isSuperAdmin ? '/platform/dashboard' : '/app/dashboard'}
            replace
          />
        }
      />
    </Routes>
    </Suspense>
    </>
  );
};

export default App;
