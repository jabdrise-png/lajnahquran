import React, { useState, useEffect, useRef } from 'react';
import type { Page } from '../types';
import {
  Home, CheckSquare, BookOpen, X, Megaphone,
  Book, TrendingUp, ShieldCheck, ChevronDown, Database, LogOut, Check, Settings, Layout, Building2, FileCheck2
} from 'lucide-react';
import { useAcademicYear } from '../lib/AcademicYearContext';
import { hasUnreadUpdates } from '../lib/appUpdates';
import { normalizeRole, formatCanonicalRoleLabel, SupportSessionStore, ActiveSupportSession } from '../lib/permissions';

interface SidebarProps {
  currentPage: Page;
  setPage: (page: Page) => void;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  isCollapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  orgName?: string;
  orgLogo?: string;
  isSuperAdmin?: boolean;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
  className?: string;
}

interface NavItemConfig {
  id: string;
  label: string;
  icon?: React.ReactNode;
  page?: Page;
  children?: NavItemConfig[];
  isGroup?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentPage, setPage, isOpen, setOpen, isCollapsed, isSuperAdmin,
  userName, userRole, orgName, orgLogo, onLogout
}) => {
  const canonicalRole = normalizeRole(isSuperAdmin ? 'superadmin' : userRole);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([
    'operasional_group',
    'perkembangan_group'
  ]);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { academicYears, selectedAcademicYear, setSelectedAcademicYear } = useAcademicYear();
  const [hasUnread, setHasUnread] = useState(false);
  const [supportSession, setSupportSession] = useState<ActiveSupportSession | null>(() =>
    SupportSessionStore.getSession()
  );

  useEffect(() => {
    setHasUnread(hasUnreadUpdates());
    const handleUpdateChange = () => setHasUnread(hasUnreadUpdates());
    window.addEventListener('app_updates_changed', handleUpdateChange);
    const unsubSupport = SupportSessionStore.subscribe((sess) => setSupportSession(sess));
    return () => {
      window.removeEventListener('app_updates_changed', handleUpdateChange);
      unsubSupport();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (id: string) => {
    setExpandedMenus(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  let navStructure: NavItemConfig[] = [];

  if (canonicalRole === 'superadmin') {
    navStructure.push(
      { id: 'g_platform', label: 'KONSOL PLATFORM', isGroup: true },
      { id: 'platform_dashboard', label: 'Dashboard Platform', icon: <Building2 size={18} />, page: 'PlatformDashboard' },
      { id: 'platform_tenants', label: 'Organisasi & Tenant', icon: <Database size={18} />, page: 'PlatformTenants' },
      { id: 'platform_accounts', label: 'Akun Platform & Grants', icon: <ShieldCheck size={18} />, page: 'PlatformAccounts' },
      { id: 'platform_plans', label: 'Paket & Entitlements', icon: <Book size={18} />, page: 'PlatformPlans' },
      { id: 'platform_support', label: 'Support Access', icon: <CheckSquare size={18} />, page: 'PlatformSupport' },
      { id: 'platform_audit', label: 'Audit & Health Monitor', icon: <FileCheck2 size={18} />, page: 'PlatformAudit' },
      { id: 'platform_settings', label: 'Pengaturan Platform', icon: <Settings size={18} />, page: 'PlatformSettings' },
      { id: 'website_editor', label: 'Landing Page Platform', icon: <Layout size={18} />, page: 'WebsiteEditor' }
    );
  }

  const tenantNav: NavItemConfig[] = [
    {
      id: 'g_ikhtisar',
      label: supportSession
        ? `SUPPORT: ${supportSession.organizationName.slice(0, 18).toUpperCase()}`
        : 'IKHTISAR LEMBAGA',
      isGroup: true,
    },
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={18} />, page: 'Dashboard' },
    { id: 'informasi', label: 'Pusat Informasi', icon: <Megaphone size={18} />, page: 'Pusat Informasi' },

    { id: 'g_operasional', label: 'OPERASIONAL HARIAN', isGroup: true },
    { id: 'sesi_halaqah', label: 'Sesi & Ruang Halaqah', icon: <BookOpen size={18} />, page: 'SesiHalaqah' },
    {
      id: 'absensi_group',
      label: 'Absensi & Rekap',
      icon: <CheckSquare size={18} />,
      children: [
        { id: 'absensi', label: 'Input Absensi Harian', page: 'Absensi' },
        { id: 'buku_absensi', label: 'Buku Absensi', page: 'Buku Absensi' },
        { id: 'laporan_absensi', label: 'Analitik & Laporan', page: 'LaporanRekap' },
      ]
    },
    {
      id: 'perkembangan_group',
      label: 'Setoran & Evaluasi',
      icon: <TrendingUp size={18} />,
      children: [
        { id: 'setoran_harian', label: 'Setoran Harian', page: 'SetoranHarian' },
        { id: 'perkembangan_input', label: 'Input Evaluasi Periodik', page: 'Input Evaluasi' },
        { id: 'perkembangan_master_data', label: 'Progres & Evaluasi', page: 'Master Data Perkembangan' },
        ...(canonicalRole !== 'musammi'
          ? [{ id: 'pengaturan_evaluasi', label: 'Target & Periode Evaluasi', page: 'Pengaturan Evaluasi' as Page }]
          : []),
      ]
    },
  ];

  if (canonicalRole === 'admin' || canonicalRole === 'superadmin') {
    tenantNav.push(
      {
        id: 'ujian_raport_group',
        label: 'Ujian & Raport',
        icon: <Book size={18} />,
        children: [
          { id: 'ujian_bulanan', label: 'Ujian Bulanan', page: 'UjianBulanan' },
          { id: 'ujian_semester', label: 'Ujian Semester', page: 'UjianSemester' },
          { id: 'rekap_nilai', label: 'Buku Nilai & Raport', page: 'RekapNilai' },
          { id: 'pengaturan_nilai', label: 'Rubrik & Komponen Nilai', page: 'PengaturanNilai' },
        ]
      },
      { id: 'g_sistem', label: 'STRUKTUR & SISTEM', isGroup: true },
      {
        id: 'data',
        label: 'Master Data & Struktur',
        icon: <Database size={18} />,
        children: [
          {
            id: 'data_akademik',
            label: 'Struktur Akademik',
            children: [
              { id: 'tahun_ajaran', label: 'Tahun Ajaran & Semester', page: 'TahunAjaran' },
              { id: 'data_halaqah', label: 'Data Halaqah', page: 'DataHalaqah' },
              { id: 'kenaikan_kelas', label: 'Mutasi & Kenaikan Kelas', page: 'KenaikanKelas' },
            ]
          },
          { id: 'data_santri', label: 'Data Santri', page: 'DataSantri' },
          {
            id: 'data_sdm',
            label: 'Musammi & Atribut Staf',
            children: [
              { id: 'data_musammi', label: 'Data Musammi', page: 'DataMusammi' },
              { id: 'data_wali', label: 'Atribut Wali Kelas', page: 'DataWaliKelas' },
              { id: 'data_musyrif', label: 'Atribut Musyrif Asrama', page: 'DataMusyrif' },
            ]
          }
        ]
      },
      { id: 'users', label: 'Akses & Undangan', icon: <ShieldCheck size={18} />, page: 'Users' },
      { id: 'audit_lembaga', label: 'Audit & Snapshot Raport', icon: <FileCheck2 size={18} />, page: 'AuditLembaga' },
      { id: 'settings', label: 'Pengaturan Lembaga', icon: <Settings size={18} />, page: 'Settings' }
    );
  }

  // Pemisahan tegas Shell: Superadmin hanya melihat menu operasional Tenant apabila sedang membuka Support Access Session
  if (canonicalRole !== 'superadmin' || Boolean(supportSession)) {
    navStructure = [...navStructure, ...tenantNav];
  }

  const renderNavItem = (item: NavItemConfig, depth: number = 0) => {
    if (item.isGroup) {
      if (isCollapsed) return <div key={item.id} className="my-4 border-t border-slate-100 mx-4"></div>;
      return (
        <li key={item.id} className="px-4 mt-7 mb-2 first:mt-2">
          <span className="text-[11px] font-bold text-slate-400 tracking-widest uppercase px-2">{item.label}</span>
        </li>
      );
    }

    const isParent = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.id);

    const checkActive = (navItem: NavItemConfig): boolean => {
      if (navItem.page === currentPage) return true;
      if (navItem.children) return navItem.children.some(checkActive);
      return false;
    };
    const isActive = checkActive(item);

    const baseClasses = "flex items-center w-full px-3 py-2.5 mb-1 rounded-xl transition-all duration-150 group relative";
    const activeClasses = "bg-blue-50/90 text-blue-700 font-semibold";
    const inactiveClasses = "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium";

    const itemClass = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;

    if (depth > 0) {
      return (
        <li key={item.id} className="relative">
          {isActive && !isParent && (
            <div className="absolute -left-[9px] top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-600"></div>
          )}
          {isParent ? (
            <button
              onClick={(e) => { e.preventDefault(); toggleMenu(item.id); }}
              className={`flex items-center justify-between w-full py-1.5 px-3 rounded-md text-[13px] transition-colors ${
                isActive
                  ? 'text-blue-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 group'
              }`}
            >
              <span className="whitespace-nowrap">{item.label}</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); if (item.page) setPage(item.page); }}
              className={`flex items-center py-1.5 px-3 rounded-md text-[13px] transition-colors ${
                isActive
                  ? 'text-blue-700 font-semibold bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 group'
              }`}
            >
              <span className="whitespace-nowrap">{item.label}</span>
            </a>
          )}
          {isParent && isExpanded && !isCollapsed && (
            <ul className="mt-1 space-y-0.5 ml-4 border-l border-slate-100 pl-2 py-0.5 relative">
              {item.children?.map(child => renderNavItem(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }

    return (
      <li key={item.id} className="px-3">
        {isParent ? (
          <button
            onClick={() => toggleMenu(item.id)}
            className={`${itemClass} justify-between outline-none`}
          >
            <div className="flex items-center">
              <div className={`flex-shrink-0 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`}>
                {item.icon}
              </div>
              {!isCollapsed && <span className="ml-3 text-[13.5px] whitespace-nowrap leading-none pt-px">{item.label}</span>}
            </div>
            {!isCollapsed && (
              <div className={`transition-transform duration-200 flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-500'} ${isExpanded ? 'rotate-180' : ''}`}>
                <ChevronDown size={14} />
              </div>
            )}
          </button>
        ) : (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (item.page) setPage(item.page);
            }}
            className={itemClass}
          >
            <div className={`flex-shrink-0 transition-colors relative ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`}>
              {item.icon}
              {item.id === 'informasi' && hasUnread && isCollapsed && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500" title="Pembaruan Baru"></span>
              )}
            </div>
            {!isCollapsed && <span className="ml-3 text-[13.5px] whitespace-nowrap leading-none pt-px">{item.label}</span>}
            {!isCollapsed && item.id === 'informasi' && hasUnread && (
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Pembaruan Baru"></span>
            )}
          </a>
        )}

        {isParent && isExpanded && !isCollapsed && (
          <ul className="mt-1 space-y-0.5 ml-7 border-l border-slate-100 pl-2 py-0.5 relative">
            {item.children?.map(child => renderNavItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const displayLogo = orgLogo || "https://i.ibb.co.com/KcYyzZRz/Tanpa-judul-1080-x-1080-piksel-20260116-084021-0000.png";

  return (
    <>
      <div className={`fixed inset-0 bg-black/20 backdrop-blur-[2px] z-30 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setOpen(false)}></div>

      <aside
        className={`print:hidden flex flex-col h-full bg-white z-40 border-r border-slate-200
          fixed md:relative inset-y-0 left-0
          transform transition-all duration-300 ease-in-out
          overflow-hidden shadow-sm
          w-[270px]
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:transform-none
          ${isCollapsed ? 'md:w-20' : 'md:w-[270px]'}
        `}
      >
        <div className={`flex-grow flex flex-col min-h-0 ${isCollapsed ? 'w-20' : 'w-[270px]'}`}>
          {/* Header / Logo */}
          <div className={`flex items-center pt-7 pb-6 ${isCollapsed ? 'px-2 flex-col justify-center' : 'px-6'}`}>
            <button className="md:hidden absolute top-4 right-4 text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>

            <div className="w-10 h-10 flex-shrink-0 relative flex items-center justify-center rounded-xl overflow-hidden border border-slate-100">
              <img src="https://i.ibb.co.com/KcYyzZRz/Tanpa-judul-1080-x-1080-piksel-20260116-084021-0000.png" alt="Logo" className="w-full h-full object-cover" />
            </div>

            {!isCollapsed && (
              <div className="ml-3 mt-0.5 truncate">
                <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight truncate">Lajnah Quran</h1>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium truncate">
                  {canonicalRole === 'superadmin' ? 'Enterprise Multi-Tenant SaaS' : (orgName || 'Sistem Manajemen Tahfidz')}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-grow overflow-y-auto custom-scrollbar pt-1 pb-6">
            <ul className="space-y-0.5">
              {navStructure.map(item => renderNavItem(item))}
            </ul>
          </nav>

          {/* User Profile Footer */}
          <div className="p-3 relative border-t border-slate-100" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen(!isProfileMenuOpen)}
              className={`p-2 flex items-center justify-between rounded-lg hover:bg-slate-50 transition-all w-full focus:outline-none focus:bg-slate-50 cursor-pointer ${isProfileMenuOpen ? 'bg-slate-50' : ''}`}
            >
              <div className="flex items-center space-x-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-500 overflow-hidden border border-slate-200">
                  <img src={displayLogo} alt="User" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/100x100?text=U"; }} />
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col truncate text-left">
                    <span className="text-[13px] font-bold text-slate-700 truncate leading-tight">{userName || 'Administrator'}</span>
                    <span className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                      {formatCanonicalRoleLabel(canonicalRole)}
                    </span>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <div className="text-slate-400">
                  <ChevronDown size={14} />
                </div>
              )}
            </button>

            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-bold text-slate-800 truncate">{orgName || "Lajnah Quran"}</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{userName || 'Administrator'} · {formatCanonicalRoleLabel(canonicalRole)}</p>
                </div>
                <div className="p-2">
                  <div className="px-3 pb-1.5 pt-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tahun Ajaran Aktif</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar my-1 space-y-0.5">
                    {academicYears.length > 0 ? academicYears.map(ay => (
                      <button
                        key={ay.id}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors flex items-center justify-between group ${selectedAcademicYear?.id === ay.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}
                        onClick={() => {
                          setSelectedAcademicYear(ay);
                          setProfileMenuOpen(false);
                        }}
                      >
                        <div className="flex items-center">
                          <span className={`w-4 flex justify-center mr-2 ${selectedAcademicYear?.id === ay.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                            <Check size={14} />
                          </span>
                          <span>{ay.name} ({ay.active_semester})</span>
                        </div>
                      </button>
                    )) : (
                      <div className="px-3 py-2 text-[13px] text-slate-500 text-center italic">Tidak ada data</div>
                    )}
                  </div>
                </div>
                {onLogout && (
                  <div className="p-2 border-t border-slate-100">
                    <button
                      onClick={() => { onLogout(); setProfileMenuOpen(false); }}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-[13px] flex items-center text-red-600 hover:bg-red-50 font-medium transition-colors"
                    >
                      <LogOut size={16} className="mr-2" />
                      Keluar (Logout)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
