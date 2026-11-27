import React, { useState, useRef, useEffect } from 'react';
import type { Page } from '../types';
import { Menu, Search, Bell, CheckCircle, XCircle, Info, Trash2, ShieldCheck } from 'lucide-react';
import { NotificationStore, AppNotification } from '../lib/NotificationStore';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { SAAS_ROUTE_MAP, resolveRouteByPageKey, normalizeRole } from '../lib/permissions';
import { labelPeran } from '../lib/activeRole';

interface HeaderProps {
  currentPage: Page;
  toggleSidebar: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapse: () => void;
  onLogout?: () => void;
  orgName?: string;
  orgLogo?: string;
  userName?: string;
  userRole?: string;
  onNavigate?: (page: Page) => void;
  className?: string;
  /** Fase 2: peran aktif lain yang bisa dipilih (akun multi-peran) */
  availableRoles?: string[];
  onSwitchRole?: (role: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  currentPage,
  toggleSidebar,
  toggleSidebarCollapse,
  onNavigate,
  userName,
  userRole,
  availableRoles,
  onSwitchRole
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = NotificationStore.subscribe((notifs) => {
      setNotifications(notifs);
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };

    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      } else if (event.key === 'Escape') {
        setIsSearchOpen(false);
        setIsNotifOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleGlobalShortcut);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotifClick = () => {
    setIsNotifOpen(!isNotifOpen);
    if (!isNotifOpen) {
      NotificationStore.markAllAsRead();
    }
  };

  const handleMenuClick = () => {
    if (window.innerWidth >= 768) {
      toggleSidebarCollapse();
    } else {
      toggleSidebar();
    }
  };

  const routeDef = resolveRouteByPageKey(currentPage);
  const breadcrumbs = routeDef ? routeDef.breadcrumb : ['Ikhtisar', String(currentPage)];
  const canonicalRole = normalizeRole(userRole);
  const isPlatformSuperadmin = canonicalRole === 'superadmin';

  const searchablePages = SAAS_ROUTE_MAP
    .filter(r => canonicalRole === 'superadmin' || canonicalRole === 'admin' || canonicalRole === 'musammi' ? r.roles.includes(canonicalRole) : r.pageKey === 'Dashboard')
    .map(r => ({
      title: r.label,
      group: r.group,
      path: r.path,
      page: r.pageKey,
      keywords: r.keywords
    }));

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsSearchOpen(true);
  };

  const executeSearchNav = (page: Page) => {
    if (onNavigate) {
      onNavigate(page);
      setSearchQuery('');
      setIsSearchOpen(false);
    }
  };

  const searchResults = searchQuery.trim()
    ? searchablePages.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.group.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : searchablePages.slice(0, 8);

  return (
    <header className="print:hidden bg-white/95 backdrop-blur-xs border-b border-slate-200 z-30 transition-all duration-200 relative">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8 gap-3 sm:gap-4">
        {/* Left: Hamburger menu + Contextual Breadcrumbs */}
        <div className="flex items-center min-w-0 flex-1 sm:flex-initial">
          <button
            type="button"
            onClick={handleMenuClick}
            className="text-slate-500 mr-2.5 p-2 rounded-lg hover:bg-slate-100 hover:text-slate-900 focus:outline-none transition-colors md:hidden flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center text-sm sm:text-sm min-w-0">
            {breadcrumbs[0] && (
              <>
                <span className="text-blue-600 font-semibold hidden md:inline truncate max-w-[160px] lg:max-w-none">
                  {breadcrumbs[0]}
                </span>
                <span className="mx-2 text-slate-300 hidden md:inline">/</span>
              </>
            )}
            <span className="text-slate-900 font-bold truncate max-w-[180px] sm:max-w-[260px] md:max-w-none">
              {breadcrumbs[1] || currentPage}
            </span>
          </div>
        </div>

        {/* Right: Quick Search + Notification + Superadmin Role Badge */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 flex-shrink-0">
          {/* Fase 2: ganti peran untuk akun dengan lebih dari satu peran */}
          {availableRoles && availableRoles.length > 1 && onSwitchRole && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600" title="Ganti peran">
              <span className="hidden md:inline">Masuk sebagai</span>
              <select
                aria-label="Ganti peran"
                className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold bg-white"
                value={normalizeRole(userRole)}
                onChange={(e) => onSwitchRole(e.target.value)}
              >
                {availableRoles.map((r) => (
                  <option key={r} value={r}>{labelPeran(r)}</option>
                ))}
              </select>
            </label>
          )}
          {/* Search Bar */}
          <div className="relative w-40 sm:w-52 md:w-64 lg:w-72 xl:w-80 group hidden sm:block transition-all" ref={searchRef}>
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-600 transition-colors pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => setIsSearchOpen(true)}
              placeholder={isPlatformSuperadmin ? 'Cari modul platform (⌘K)...' : 'Cari fitur atau rute...'}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 text-slate-900 placeholder:text-slate-500 text-xs sm:text-sm rounded-lg pl-9 pr-4 md:pr-14 py-2 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 transition-all font-medium"
            />
            <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 hidden md:flex items-center gap-1 opacity-75 pointer-events-none">
              <kbd className="border border-slate-200 bg-white rounded px-1.5 py-0.5 text-2xs font-mono text-slate-500 shadow-2xs leading-none">
                ⌘K
              </kbd>
            </div>

            {isSearchOpen && (
              <div className="absolute top-full right-0 w-72 sm:w-80 md:w-96 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-80 overflow-y-auto z-50">
                <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Navigasi Cepat
                  </span>
                  <span className="text-2xs text-slate-500">ESC untuk tutup</span>
                </div>
                {searchResults.length > 0 ? (
                  <ul className="py-1 divide-y divide-slate-100">
                    {searchResults.map((result, idx) => (
                      <li key={idx}>
                        <button
                          type="button"
                          onClick={() => executeSearchNav(result.page)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50/60 transition-colors flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-slate-900 text-sm font-semibold">{result.title}</div>
                            <div className="text-2xs text-slate-500">{result.group}</div>
                          </div>
                          <span className="text-2xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                            {result.path}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center text-slate-500 text-sm">Halaman tidak ditemukan</div>
                )}
              </div>
            )}
          </div>

          {/* Notification Trigger */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={handleNotifClick}
              className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center border border-slate-200 bg-white"
              aria-label="Notifikasi"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-white"></span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="p-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Notifikasi Sistem</h3>
                  <button
                    type="button"
                    onClick={() => NotificationStore.clearAll()}
                    className="text-slate-500 hover:text-red-600 transition-colors"
                    title="Bersihkan Semua"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length > 0 ? (
                    <ul className="divide-y divide-slate-200">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          className={`p-3.5 hover:bg-slate-50 transition-colors flex gap-3 ${
                            !n.read ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {n.type === 'success' && <CheckCircle size={16} className="text-emerald-600" />}
                            {n.type === 'error' && <XCircle size={16} className="text-red-600" />}
                            {n.type === 'info' && <Info size={16} className="text-blue-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-900 leading-snug">{n.message}</p>
                            <p className="text-2xs text-slate-500 mt-1">
                              {formatDistanceToNow(n.timestamp, { addSuffix: true, locale: id })}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-slate-500 flex flex-col items-center">
                      <Bell size={24} className="mb-2 opacity-20" />
                      <p className="text-xs sm:text-sm">Belum ada notifikasi baru</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

