import React, { useState, useRef, useEffect } from 'react';
import type { Page } from '../types';
import { Menu, Search, Bell, CheckCircle, XCircle, Info, Trash2 } from 'lucide-react';
import { NotificationStore, AppNotification } from '../lib/NotificationStore';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { SAAS_ROUTE_MAP, resolveRouteByPageKey, normalizeRole } from '../lib/permissions';

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
}

const Header: React.FC<HeaderProps> = ({
  currentPage,
  toggleSidebar,
  toggleSidebarCollapse,
  onNavigate,
  userRole
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
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
    setIsSearchOpen(e.target.value.length > 0);
  };

  const executeSearchNav = (page: Page) => {
    if (onNavigate) {
      onNavigate(page);
      setSearchQuery('');
      setIsSearchOpen(false);
    }
  };

  const searchResults = searchablePages.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.group.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <header className="print:hidden bg-white/80 backdrop-blur-sm border-b border-slate-200 z-10 transition-all duration-300 relative">
      <div className="flex items-center justify-between h-16 px-3 sm:px-6 lg:px-6 gap-2 sm:gap-4">
        {/* Left: Hamburger menu + Breadcrumbs */}
        <div className="flex items-center min-w-0 flex-1 sm:flex-initial mr-2 sm:mr-0">
          <button
            onClick={handleMenuClick}
            className="text-slate-500 mr-2 p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-700 focus:outline-none transition-colors md:hidden flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center text-[13px] sm:text-[14px] min-w-0">
            {breadcrumbs[0] && (
              <>
                <span className="text-blue-600 font-medium hidden md:inline truncate max-w-[140px] lg:max-w-none">{breadcrumbs[0]}</span>
                <span className="mx-2 text-slate-300 hidden md:inline">/</span>
              </>
            )}
            <span className="text-slate-800 font-bold truncate max-w-[160px] sm:max-w-[220px] md:max-w-none">{breadcrumbs[1] || currentPage}</span>
          </div>
        </div>

        {/* Right: Search + Notification */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {/* Search Bar */}
          <div className="relative w-36 sm:w-48 md:w-56 lg:w-72 xl:w-80 group hidden sm:block transition-all" ref={searchRef}>
            <Search size={15} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => setIsSearchOpen(searchQuery.length > 0)}
              placeholder="Cari fitur atau rute..."
              className="w-full bg-white border border-slate-200 text-slate-700 text-[12px] sm:text-[13px] rounded-xl pl-9 pr-4 md:pr-14 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium shadow-xs"
            />
            <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 hidden md:flex items-center gap-1 opacity-60 pointer-events-none">
              <kbd className="border border-slate-300 bg-slate-50 rounded-[4px] px-1.5 py-0.5 text-[10px] font-mono text-slate-500 shadow-xs leading-none">⌘</kbd>
              <kbd className="border border-slate-300 bg-slate-50 rounded-[4px] px-1.5 py-0.5 text-[10px] font-mono text-slate-500 shadow-xs leading-none">K</kbd>
            </div>

            {isSearchOpen && (
              <div className="absolute top-full right-0 w-72 sm:w-80 md:w-96 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 max-h-80 overflow-y-auto z-50">
                {searchResults.length > 0 ? (
                  <ul className="py-1.5 divide-y divide-slate-50">
                    {searchResults.map((result, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => executeSearchNav(result.page)}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-slate-800 text-[13px] font-semibold">{result.title}</div>
                            <div className="text-[11px] text-slate-400">{result.group}</div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
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

          <div className="relative" ref={notifRef}>
            <button
              onClick={handleNotifClick}
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 sm:hover:bg-white rounded-xl transition-colors flex items-center justify-center border border-transparent hover:border-slate-200"
              aria-label="Notifikasi"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-semibold text-slate-700 text-sm">Notifikasi</h3>
                  <button
                    onClick={() => NotificationStore.clearAll()}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    title="Bersihkan Semua"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length > 0 ? (
                    <ul className="divide-y divide-slate-50">
                      {notifications.map((n) => (
                        <li key={n.id} className={`p-3 hover:bg-slate-50 transition-colors flex gap-3 ${!n.read ? 'bg-blue-50/50' : ''}`}>
                          <div className="flex-shrink-0 mt-0.5">
                            {n.type === 'success' && <CheckCircle size={16} className="text-green-500" />}
                            {n.type === 'error' && <XCircle size={16} className="text-red-500" />}
                            {n.type === 'info' && <Info size={16} className="text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-slate-700 leading-snug">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {formatDistanceToNow(n.timestamp, { addSuffix: true, locale: id })}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-6 text-center text-slate-400 flex flex-col items-center">
                      <Bell size={24} className="mb-2 opacity-20" />
                      <p className="text-sm">Tidak ada notifikasi</p>
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
