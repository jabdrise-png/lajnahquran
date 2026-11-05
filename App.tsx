import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import AttendanceBook from './pages/AttendanceBook';
import BukuAbsensiPage from './pages/BukuAbsensiPage';
import Login from './pages/Login';
import Informasi from './pages/Informasi';
import Users from './pages/Users';

// DATA MASTER PAGES
import SantriPage from './pages/DataMaster/SantriPage';
import MusammiPage from './pages/DataMaster/MusammiPage';
import MusyrifDataPage from './pages/DataMaster/MusyrifDataPage';
import WaliKelasPage from './pages/DataMaster/WaliKelasPage';
import KenaikanKelasPage from './pages/DataMaster/KenaikanKelasPage';
import HalaqahPage from './pages/DataMaster/HalaqahPage';
import LandingPage from './pages/LandingPage';
import AdminGalleryPage from './pages/AdminGalleryPage';
import TahunAjaranPage from './pages/DataMaster/TahunAjaranPage';

// AKADEMIK & OPERASIONAL PAGES
import SetoranHarianPage from './pages/SetoranHarianPage';
import PerkembanganInputPage from './pages/PerkembanganInputPage';
import PerkembanganMasterDataPage from './pages/PerkembanganMasterDataPage';
import PengaturanEvaluasiPage from './pages/PengaturanEvaluasiPage';
import SesiHalaqahPage from './pages/Operasional/SesiHalaqahPage';
import AuditLembagaPage from './pages/Akademik/AuditLembagaPage';

// PLATFORM CONSOLE (SUPERADMIN)
import PlatformConsolePage from './pages/Platform/PlatformConsolePage';

// UJIAN & RAPORT
import UjianBulananPage from './pages/UjianRaport/UjianBulananPage';
import UjianSemesterPage from './pages/UjianRaport/UjianSemesterPage';
import RekapNilaiPage from './pages/UjianRaport/RekapNilaiPage';
import PengaturanNilaiPage from './pages/UjianRaport/PengaturanNilaiPage';

// LAPORAN & SISTEM PAGES
import LaporanRekapPage from './pages/Laporan/LaporanRekapPage';
import SettingsPage from './pages/SettingsPage';
import WebsiteEditorPage from './pages/WebsiteEditorPage';

import type { Page } from './types';
import { supabase } from './lib/supabaseClient';
import { Lock, LogOut } from 'lucide-react';
import {
  normalizeRole,
  resolveRouteByPageKey,
  SupportSessionStore,
  ActiveSupportSession,
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
  const [supportSession, setSupportSession] = useState<ActiveSupportSession | null>(() =>
    SupportSessionStore.getSession()
  );

  useEffect(() => {
    const unsubSupport = SupportSessionStore.subscribe((sess) => setSupportSession(sess));
    return () => unsubSupport();
  }, []);

  const fetchUserOrganization = useCallback(
    async (userId: string) => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select(`organization_id, role, full_name, organizations ( name, logo_url )`)
          .eq('id', userId)
          .single();

        if (profile) {
          setUserProfile({ name: profile.full_name || 'Admin', role: profile.role });
          if (profile.role === 'super_admin' || profile.role === 'superadmin') {
            setIsSuperAdmin(true);
            setIsPending(false);
          } else if (profile.role === 'pending') {
            setIsPending(true);
            setIsSuperAdmin(false);
          } else {
            setIsSuperAdmin(false);
            setIsPending(false);
          }

          if (profile.organizations) {
            setOrgDetails({
              // @ts-ignore
              name: profile.organizations.name,
              // @ts-ignore
              logo: profile.organizations.logo_url,
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch organization', e);
      }
    },
    []
  );

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
        navigate(targetPath);
      }
    },
    [location.pathname, navigate]
  );

  const handleLogout = async () => {
    SupportSessionStore.endSession();
    await supabase.auth.signOut();
    setIsSuperAdmin(false);
    setIsPending(false);
    navigate('/', { replace: true });
  };

  const handleEndSupportSession = async () => {
    if (supportSession?.id && !supportSession.id.startsWith('local-')) {
      try {
        await (supabase as any).rpc('rpc_end_support_session', {
          p_session_id: supportSession.id,
        });
      } catch {
        // Ignore if RPC not yet applied
      }
    }
    SupportSessionStore.endSession();
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

  if (session && isPending) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-neutral p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={32} className="text-yellow-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Akun Menunggu Persetujuan</h2>
          <p className="text-slate-600 mb-6 text-sm leading-relaxed">
            Pendaftaran Anda berhasil, namun akun ini belum diaktifkan oleh Admin Lembaga.
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg hover:bg-slate-50 transition-colors w-full"
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
  };

  return (
    <Routes>
      {/* =====================================================================
          1. PUBLIC SHELL ROUTES (/ , /login, /invite)
         ===================================================================== */}
      <Route element={<PublicLayout session={session} isSuperAdmin={isSuperAdmin} />}>
        <Route path="/" element={<LandingPage onLoginClick={() => navigate('/login')} />} />
        <Route path="/login" element={<Login onBack={() => navigate('/')} />} />
        <Route path="/invite" element={<Login onBack={() => navigate('/')} />} />
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
        <Route path="sessions/:sessionId/attendance" element={<SesiHalaqahPage />} />
        <Route path="sessions/:sessionId/recitations" element={<SesiHalaqahPage />} />
        <Route path="my-halaqah" element={<SesiHalaqahPage />} />
        <Route path="my-schedule" element={<SesiHalaqahPage />} />
        <Route
          path="attendance"
          element={<Attendance onNavigate={(page: any) => handleSetPage(page)} />}
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
        <Route path="evaluations" element={<PerkembanganInputPage />} />
        <Route path="evaluations-master" element={<PerkembanganMasterDataPage />} />
        <Route path="targets" element={<PengaturanEvaluasiPage />} />

        {/* Ujian, Buku Nilai, Raport & Laporan */}
        <Route path="exams" element={<UjianSemesterPage />} />
        <Route path="exams/:examId" element={<UjianSemesterPage />} />
        <Route path="exams-monthly" element={<UjianBulananPage />} />
        <Route path="exams-semester" element={<UjianSemesterPage />} />
        <Route path="gradebook" element={<RekapNilaiPage />} />
        <Route path="report-cards" element={<RekapNilaiPage />} />
        <Route path="settings/rubrics" element={<PengaturanNilaiPage />} />
        <Route
          path="reports"
          element={<LaporanRekapPage onNavigate={(page: string) => handleSetPage(page as Page)} />}
        />

        {/* Persiapan Akademik, Data Master & Sistem Lembaga */}
        <Route path="academic-years" element={<TahunAjaranPage />} />
        <Route path="students" element={<SantriPage />} />
        <Route path="students/:studentId" element={<SantriPage />} />
        <Route path="Enrollment-promotion" element={<KenaikanKelasPage />} />
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
  );
};

export default App;
