
import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import AttendanceBook from './pages/AttendanceBook';
import BukuAbsensiPage from './pages/BukuAbsensiPage';
import Login from './pages/Login';
import Informasi from './pages/Informasi';
import Users from './pages/Users';
import ChatWidget from './components/ChatWidget';
import TopUpdateBar from './components/TopUpdateBar';

// DATA MASTER PAGES
import SantriPage from './pages/DataMaster/SantriPage';
import MusammiPage from './pages/DataMaster/MusammiPage';
import MusyrifDataPage from './pages/DataMaster/MusyrifDataPage';
import WaliKelasPage from './pages/DataMaster/WaliKelasPage';
import KenaikanKelasPage from './pages/DataMaster/KenaikanKelasPage';
import HalaqahPage from './pages/DataMaster/HalaqahPage';
import LandingPage from './pages/LandingPage';
import AdminGalleryPage from './pages/AdminGalleryPage';

// AKADEMIK PAGES
import SetoranHarianPage from './pages/SetoranHarianPage';
import PerkembanganInputPage from './pages/PerkembanganInputPage';
import PerkembanganMasterDataPage from './pages/PerkembanganMasterDataPage';
import PengaturanEvaluasiPage from './pages/PengaturanEvaluasiPage';

// UJIAN & RAPORT
import UjianBulananPage from './pages/UjianRaport/UjianBulananPage';
import UjianSemesterPage from './pages/UjianRaport/UjianSemesterPage';
import RekapNilaiPage from './pages/UjianRaport/RekapNilaiPage';
import PengaturanNilaiPage from './pages/UjianRaport/PengaturanNilaiPage';

// LAPORAN PAGES
import LaporanRekapPage from './pages/Laporan/LaporanRekapPage';
import SettingsPage from './pages/SettingsPage';
import WebsiteEditorPage from './pages/WebsiteEditorPage';

import type { Page } from './types';
import { supabase } from './lib/supabaseClient';
import { Lock, LogOut } from 'lucide-react';

import { AcademicYearProvider } from './lib/AcademicYearContext';
import { SupabaseDataProvider } from './hooks/useSupabaseData';

import TahunAjaranPage from './pages/DataMaster/TahunAjaranPage';
import { GlobalPinnedBanner } from './components/GlobalPinnedBanner';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Organization State
  const [orgDetails, setOrgDetails] = useState<{name: string, logo: string} | null>(null);
  const [userProfile, setUserProfile] = useState<{name: string, role: string} | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const fetchUserOrganization = async (userId: string) => {
      try {
          const { data: profile } = await supabase
              .from('profiles')
              .select(`organization_id, role, full_name, organizations ( name, logo_url )`)
              .eq('id', userId)
              .single();
          
          if (profile) {
              setUserProfile({ name: profile.full_name || 'Admin', role: profile.role });
              if (profile.role === 'super_admin') { setIsSuperAdmin(true); setIsPending(false); } 
              else if (profile.role === 'pending') { setIsPending(true); setIsSuperAdmin(false); } 
              else { setIsSuperAdmin(false); setIsPending(false); }

              if (profile.organizations) {
                  setOrgDetails({
                      // @ts-ignore
                      name: profile.organizations.name,
                      // @ts-ignore
                      logo: profile.organizations.logo_url
                  });
              }
          }
      } catch (e) { console.error("Failed to fetch organization", e); }
  };

  useEffect(() => {
    const handleOrgUpdate = (e: any) => {
        setOrgDetails({
            name: e.detail.name,
            logo: e.detail.logo
        });
    };
    window.addEventListener('organization_updated', handleOrgUpdate);
    return () => window.removeEventListener('organization_updated', handleOrgUpdate);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        if (error.message.includes('Refresh Token') || error.message.includes('refresh token')) {
             supabase.auth.signOut().catch(() => {});
        }
      }
      setSession(session);
      if (session?.user) fetchUserOrganization(session.user.id);
      setLoading(false);
    }).catch(() => {
       setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) fetchUserOrganization(session.user.id);
      else { setOrgDetails(null); setUserProfile(null); setIsSuperAdmin(false); setIsPending(false); }
      
      if (event === 'SIGNED_OUT') {
         // handle sign out
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSetPage = useCallback((page: Page) => {
    setCurrentPage(page);
    if(window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentPage('Dashboard');
    setIsSuperAdmin(false);
    setIsPending(false);
  };

  const renderPageWithFallback = () => <Dashboard onNavigate={(page: string) => setCurrentPage(page as any)} userRole={userProfile?.role} />;

  const isPageAllowed = (page: string, role?: string) => {
      if (!role) return page === 'Dashboard';
      const lowerRole = role.toLowerCase();
      
      if (lowerRole === 'super_admin') return true;

      if (lowerRole === 'admin' || lowerRole === 'admin_mahad') {
          return page !== 'WebsiteEditor';
      }

      if (lowerRole === 'musammi') {
          const allowed = [
              'Dashboard', 'Pusat Informasi', 'Absensi', 'Buku Absensi', 'CetakBukuFisik',
              'LaporanRekap', 'SetoranHarian', 'Input Evaluasi', 'Master Data Perkembangan', 'Pengaturan Evaluasi'
          ];
          return allowed.includes(page);
      }

      if (lowerRole === 'pengajar') {
          const allowed = [
              'Dashboard', 'Pusat Informasi', 'LaporanRekap',
              'Master Data Perkembangan', 'RekapNilai', 'DataSantri'
          ];
          return allowed.includes(page);
      }

      return false; // Default deny for unknown roles to be safe
  };

  const renderPage = () => {
    if (!isPageAllowed(currentPage, userProfile?.role)) {
        return renderPageWithFallback();
    }

    switch (currentPage) {
       case 'Dashboard': return <Dashboard onNavigate={(page: string) => setCurrentPage(page as any)} userRole={userProfile?.role} />;
       case 'Pusat Informasi': return <Informasi userRole={userProfile?.role} />;
      
      // DATA MASTER
      case 'Manajemen Data': 
      case 'TahunAjaran': return <TahunAjaranPage />;
      case 'DataSantri': return <SantriPage />;
      case 'DataMusammi': return <MusammiPage />;
      case 'DataMusyrif': return <MusyrifDataPage />;
      case 'DataHalaqah': return <HalaqahPage />;
      case 'DataWaliKelas': return <WaliKelasPage />;
      case 'KenaikanKelas': return <KenaikanKelasPage />;

      // AKADEMIK
      case 'Akademik':
      case 'SetoranHarian': return <SetoranHarianPage />;
      case 'Input Evaluasi': return <PerkembanganInputPage />;
      case 'Master Data Perkembangan': return <PerkembanganMasterDataPage />;
      case 'Pengaturan Evaluasi': return <PengaturanEvaluasiPage />;
      case 'Buku Absensi': return <BukuAbsensiPage onNavigate={(page: any) => setCurrentPage(page)} />;
      case 'CetakBukuFisik': return <AttendanceBook onNavigate={(page: any) => setCurrentPage(page)} />;
      case 'Absensi': return <Attendance onNavigate={(page: any) => setCurrentPage(page)} />;

      // UJIAN & RAPORT
      case 'Ujian & Raport':
      case 'UjianBulanan': return <UjianBulananPage />;
      case 'UjianSemester': return <UjianSemesterPage />;
      case 'RekapNilai': return <RekapNilaiPage />;
      case 'PengaturanNilai': return <PengaturanNilaiPage />;
      
      // LAPORAN
      case 'Laporan':
      case 'LaporanRekap': return <LaporanRekapPage onNavigate={(page: string) => setCurrentPage(page as any)} />;
            
      case 'WebsiteEditor': return isSuperAdmin ? <WebsiteEditorPage /> : renderPageWithFallback();
      case 'Settings': return <SettingsPage />;

      case 'Users': return (isSuperAdmin || userProfile?.role === 'admin' || userProfile?.role === 'admin_mahad') ? <Users /> : <Dashboard onNavigate={(page: string) => setCurrentPage(page as any)} userRole={userProfile?.role} />;
      default: return <Dashboard onNavigate={(page: string) => setCurrentPage(page as any)} userRole={userProfile?.role} />;
    }
  };
  
  if (loading) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-neutral text-slate-600 flex-col gap-4">
             <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
             <p className="text-sm font-medium animate-pulse">Memuat Aplikasi...</p>
        </div>
    );
  }

  if (!session) {
      if (showLogin) {
          return <Login onBack={() => setShowLogin(false)} />;
      }
      return <LandingPage onLoginClick={() => setShowLogin(true)} />;
  }

  if (isPending) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-neutral p-4">
              <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-md text-center">
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4"><Lock size={32} className="text-yellow-600" /></div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">Akun Menunggu Persetujuan</h2>
                  <p className="text-slate-600 mb-6 text-sm leading-relaxed">Pendaftaran Anda berhasil, namun akun ini belum diaktifkan oleh Admin.</p>
                  <button onClick={handleLogout} className="inline-flex items-center justify-center bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-6 rounded-lg hover:bg-slate-50 transition-colors w-full"><LogOut size={16} className="mr-2" /> Keluar</button>
              </div>
          </div>
      );
  }

  // Protected /admin and /admin-landing routes (only accessible to authenticated Super Admin)
  if (window.location.pathname === '/admin' || window.location.pathname === '/admin-landing') {
      return isSuperAdmin ? <AdminGalleryPage /> : renderPageWithFallback();
  }

  return (
    <AcademicYearProvider>
      <SupabaseDataProvider>
        <div className="flex h-screen bg-neutral text-base-100 print:h-auto print:bg-white">
          <Sidebar 
            currentPage={currentPage} setPage={handleSetPage} 
            isOpen={isSidebarOpen} setOpen={setSidebarOpen}
            isCollapsed={isSidebarCollapsed} setCollapsed={setSidebarCollapsed}
            isSuperAdmin={isSuperAdmin}
            userName={userProfile?.name}
            userRole={userProfile?.role}
            orgName={orgDetails?.name}
            orgLogo={orgDetails?.logo}
            onLogout={handleLogout}
            className="print:hidden"
          />
          <div className="flex-1 flex flex-col overflow-hidden relative print:overflow-visible print:bg-white">
            <TopUpdateBar onNavigate={setCurrentPage} />
            <GlobalPinnedBanner onNavigate={setCurrentPage} />
            <Header 
              currentPage={currentPage} toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
              isSidebarCollapsed={isSidebarCollapsed} toggleSidebarCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
              onLogout={handleLogout} orgName={orgDetails?.name} orgLogo={orgDetails?.logo} userName={userProfile?.name} userRole={userProfile?.role}
              onNavigate={setCurrentPage}
              className="print:hidden"
            />
            <main className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-neutral p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible print:bg-white print:w-full">
              {renderPage()}
            </main>
            <div className="print:hidden">
              <ChatWidget />
            </div>
          </div>
        </div>
      </SupabaseDataProvider>
    </AcademicYearProvider>
  );
};

export default App;
