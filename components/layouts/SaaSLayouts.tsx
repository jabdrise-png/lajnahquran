import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Header from '../Header';
import ChatWidget from '../ChatWidget';
import TopUpdateBar from '../TopUpdateBar';
import { GlobalPinnedBanner } from '../GlobalPinnedBanner';
import { TenantContextBar } from '../ui/SaaSPrimitives';
import { AcademicYearProvider } from '../../lib/AcademicYearContext';
import { SupabaseDataProvider } from '../../hooks/useSupabaseData';
import {
  CanonicalRole,
  ActiveSupportSession,
  resolveRouteByPath,
  isRouteAllowed,
} from '../../lib/permissions';
import type { Page } from '../../types';

export interface ShellCommonProps {
  session: any | null;
  canonicalRole: CanonicalRole | 'pending' | 'unknown';
  isSuperAdmin: boolean;
  userName?: string;
  userRole?: string;
  orgName?: string;
  orgLogo?: string;
  supportSession: ActiveSupportSession | null;
  onNavigatePage: (page: Page) => void;
  onLogout: () => void;
  onEndSupportSession: () => void;
}

/**
 * 1. PUBLIC LAYOUT (REACT ROUTER 7)
 * Digunakan untuk rute publik (/ , /login, /invite).
 * Jika pengguna sudah login, otomatis mengarahkan ke shell yang sesuai dengan role kanoniknya.
 */
export const PublicLayout: React.FC<{
  session: any | null;
  isSuperAdmin: boolean;
}> = ({ session, isSuperAdmin }) => {
  const location = useLocation();
  const isAccessibleWhileAuthenticated =
    location.pathname.startsWith('/invite') || location.pathname.startsWith('/verify');

  if (session && !isAccessibleWhileAuthenticated) {
    return <Navigate to={isSuperAdmin ? '/platform/dashboard' : '/app/dashboard'} replace />;
  }
  return <Outlet />;
};

/**
 * 2. PLATFORM LAYOUT (REACT ROUTER 7 — KHUSUS SUPERADMIN DI /platform/*)
 * Mengisolasi konsol manajemen lintas tenant dari ruang kerja operasional harian ma'had.
 */
export const PlatformLayout: React.FC<ShellCommonProps> = ({
  session,
  canonicalRole,
  isSuperAdmin,
  userName,
  userRole,
  orgName,
  orgLogo,
  supportSession,
  onNavigatePage,
  onLogout,
  onEndSupportSession,
}) => {
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Hanya Superadmin yang diizinkan mengakses /platform/*
  if (!isSuperAdmin && canonicalRole !== 'superadmin') {
    return <Navigate to="/app/dashboard" replace />;
  }

  const matchedRoute = resolveRouteByPath(location.pathname);
  const currentPage: Page = matchedRoute?.pageKey || 'PlatformDashboard';

  const handleSetPage = (page: Page) => {
    onNavigatePage(page);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <AcademicYearProvider>
      <SupabaseDataProvider>
        <div className="flex h-screen bg-neutral text-base-100 print:h-auto print:bg-white">
          <Sidebar
            currentPage={currentPage}
            setPage={handleSetPage}
            isOpen={isSidebarOpen}
            setOpen={setSidebarOpen}
            isCollapsed={isSidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            isSuperAdmin={true}
            userName={userName}
            userRole={userRole}
            orgName={supportSession?.organizationName || orgName}
            orgLogo={orgLogo}
            onLogout={onLogout}
            className="print:hidden"
          />
          <div className="flex-1 flex flex-col overflow-hidden relative print:overflow-visible print:bg-white">
            <TenantContextBar
              role="superadmin"
              isSuperAdmin={true}
              orgName={orgName}
              supportSession={supportSession}
              currentPath={location.pathname}
              onEndSupportSession={onEndSupportSession}
              onOpenPlatformConsole={() => handleSetPage('PlatformDashboard')}
            />
            <Header
              currentPage={currentPage}
              toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
              isSidebarCollapsed={isSidebarCollapsed}
              toggleSidebarCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
              onLogout={onLogout}
              orgName={supportSession?.organizationName || orgName || 'Konsol Platform Global'}
              orgLogo={orgLogo}
              userName={userName}
              userRole="superadmin"
              onNavigate={handleSetPage}
              className="print:hidden"
            />
            <main className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-neutral p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible print:bg-white print:w-full">
              <Outlet />
            </main>
          </div>
        </div>
      </SupabaseDataProvider>
    </AcademicYearProvider>
  );
};

/**
 * 3. TENANT LAYOUT (REACT ROUTER 7 — UNTUK ADMIN & MUSAMMI DI /app/*)
 * Menegakkan Route Permission Map terpusat (SAAS_ROUTE_MAP) untuk setiap path /app/*.
 */
export const TenantLayout: React.FC<ShellCommonProps> = ({
  session,
  canonicalRole,
  isSuperAdmin,
  userName,
  userRole,
  orgName,
  orgLogo,
  supportSession,
  onNavigatePage,
  onLogout,
  onEndSupportSession,
}) => {
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Superadmin wajib membuka Support Access Session (Break-Glass) sebelum masuk ke rute akademik tenant (/app/*)
  if ((isSuperAdmin || canonicalRole === 'superadmin') && !supportSession) {
    return <Navigate to="/platform/support-sessions" replace />;
  }

  const matchedRoute = resolveRouteByPath(location.pathname);
  const currentPage: Page = matchedRoute?.pageKey || 'Dashboard';

  // Evaluasi izin rute berdasarkan Route Permission Map terpusat
  const allowed = isRouteAllowed(
    location.pathname,
    isSuperAdmin ? 'superadmin' : userRole,
    Boolean(supportSession)
  );

  const handleSetPage = (page: Page) => {
    onNavigatePage(page);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <AcademicYearProvider>
      <SupabaseDataProvider>
        <div className="flex h-screen bg-neutral text-base-100 print:h-auto print:bg-white">
          <Sidebar
            currentPage={currentPage}
            setPage={handleSetPage}
            isOpen={isSidebarOpen}
            setOpen={setSidebarOpen}
            isCollapsed={isSidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            isSuperAdmin={isSuperAdmin}
            userName={userName}
            userRole={userRole}
            orgName={supportSession?.organizationName || orgName}
            orgLogo={orgLogo}
            onLogout={onLogout}
            className="print:hidden"
          />
          <div className="flex-1 flex flex-col overflow-hidden relative print:overflow-visible print:bg-white">
            <TenantContextBar
              role={canonicalRole}
              isSuperAdmin={isSuperAdmin}
              orgName={orgName}
              supportSession={supportSession}
              currentPath={location.pathname}
              onEndSupportSession={onEndSupportSession}
              onOpenPlatformConsole={() => handleSetPage('PlatformDashboard')}
            />
            <TopUpdateBar onNavigate={handleSetPage} />
            <GlobalPinnedBanner onNavigate={handleSetPage} />
            <Header
              currentPage={currentPage}
              toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
              isSidebarCollapsed={isSidebarCollapsed}
              toggleSidebarCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
              onLogout={onLogout}
              orgName={supportSession?.organizationName || orgName}
              orgLogo={orgLogo}
              userName={userName}
              userRole={isSuperAdmin ? 'superadmin' : userRole}
              onNavigate={handleSetPage}
              className="print:hidden"
            />
            <main className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-neutral p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible print:bg-white print:w-full">
              {allowed ? <Outlet /> : <Navigate to="/app/dashboard" replace />}
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
