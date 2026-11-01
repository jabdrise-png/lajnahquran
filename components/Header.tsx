
import React, { useState, useRef, useEffect } from 'react';
import type { Page } from '../types';
import { Menu, Search, Bell, CheckCircle, XCircle, Info, Trash2 } from 'lucide-react';
import { NotificationStore, AppNotification } from '../lib/NotificationStore';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

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
}

const Header: React.FC<HeaderProps> = ({ 
    currentPage, 
    toggleSidebar, 
    isSidebarCollapsed, 
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
        }
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNotifClick = () => {
        setIsNotifOpen(!isNotifOpen);
        if(!isNotifOpen) {
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

  const getBreadcrumb = (page: Page) => {
      switch(page) {
          case 'Dashboard': return ['Overview', 'Dashboard'];
          case 'Pusat Informasi': return ['Overview', 'Pusat Informasi'];
          case 'Absensi': return ['Akademik', 'Absensi'];
          case 'Buku Absensi': return ['Akademik', 'Buku Absensi'];
          case 'Perkembangan Santri': return ['Akademik', 'Evaluasi & Perkembangan'];
          case 'DataSantri': return ['Manajemen Data', 'Data Santri'];
          case 'DataMusammi': return ['Manajemen Data', 'Data Musammi'];
          case 'DataHalaqah': return ['Manajemen Data', 'Data Halaqah'];
          case 'DataWaliKelas': return ['Manajemen Data', 'Data Wali Kelas'];
          case 'DataWaliSantri': return ['Manajemen Data', 'Data Wali Santri'];
          case 'KenaikanKelas': return ['Manajemen Data', 'Kenaikan Kelas'];
          case 'TahunAjaran': return ['Manajemen Data', 'Tahun Ajaran'];
          case 'EvaluasiSantri': return ['Akademik', 'Evaluasi Santri'];
          case 'LaporanRekap': return ['Laporan Utama', 'Rekapitulasi Utama'];
          case 'LaporanKelas': return ['Laporan Utama', 'Laporan Per Kelas'];
          case 'LaporanWaktu': return ['Laporan Utama', 'Laporan Per Waktu'];
          case 'Users': return ['Sistem', 'Users Admin'];
          case 'Pengaturan Evaluasi': return ['Perkembangan', 'Pengaturan Evaluasi'];
          case 'Master Data Perkembangan': return ['Perkembangan', 'Progres & Evaluasi'];
          default: return ['Perkembangan', page];
      }
  };

  const breadcrumbs = getBreadcrumb(currentPage);

  const getSearchablePages = () => {
        let pages: { title: string; page: Page; keywords: string[] }[] = [
            { title: 'Dashboard', page: 'Dashboard', keywords: ['beranda', 'home', 'statistik'] },
            { title: 'Pusat Informasi', page: 'Pusat Informasi', keywords: ['pengumuman', 'info', 'berita'] },
            
            // Akademik & Perkembangan
            { title: 'Absensi Halaqah', page: 'Absensi', keywords: ['kehadiran', 'presensi'] },
            { title: 'Buku Absen', page: 'Buku Absensi', keywords: ['rekap absen'] },
            { title: 'Setoran Harian', page: 'SetoranHarian', keywords: ['ziyadah', 'murojaah', 'hafalan'] },
            { title: 'Input Evaluasi', page: 'Input Evaluasi', keywords: ['nilai', 'input'] },
            { title: 'Progres & Evaluasi', page: 'Master Data Perkembangan', keywords: ['progres', 'evaluasi', 'master', 'data', 'statistik'] },
            { title: 'Pengaturan Evaluasi', page: 'Pengaturan Evaluasi', keywords: ['pengaturan', 'evaluasi', 'target', 'periode'] },

            // Ujian & Raport
            { title: 'Ujian Bulanan', page: 'UjianBulanan', keywords: ['ujian', 'bulanan'] },
            { title: 'Ujian Semester', page: 'UjianSemester', keywords: ['ujian', 'semester'] },
            { title: 'Rekap Nilai', page: 'RekapNilai', keywords: ['rekap', 'nilai', 'raport'] },
            { title: 'Pengaturan Nilai', page: 'PengaturanNilai', keywords: ['pengaturan', 'nilai'] },

            // Data Master
            { title: 'Data Santri', page: 'DataSantri', keywords: ['murid', 'siswa'] },
            { title: 'Data Musammi', page: 'DataMusammi', keywords: ['pengajar', 'ustadz', 'guru'] },
            { title: 'Data Halaqah', page: 'DataHalaqah', keywords: ['kelompok', 'kelas'] },
            { title: 'Data Wali Kelas', page: 'DataWaliKelas', keywords: ['walikelas', 'pembimbing'] },
            { title: 'Data Musyrif', page: 'DataMusyrif', keywords: ['pengasuh', 'asrama'] },
            { title: 'Kenaikan Kelas', page: 'KenaikanKelas', keywords: ['naik', 'lulus', 'mutasi'] },
            { title: 'Tahun Ajaran', page: 'TahunAjaran', keywords: ['periode', 'semester'] },

            // Laporan & Admin
            { title: 'Laporan Absensi', page: 'LaporanRekap', keywords: ['laporan', 'semua', 'rekap', 'kelas', 'waktu'] },
            { title: 'Users Admin', page: 'Users', keywords: ['pengguna', 'admin', 'operator'] },
            { title: 'Pengaturan', page: 'Settings', keywords: ['setting', 'konfigurasi'] }
        ];

        const lowerRole = userRole?.toLowerCase();
        if (lowerRole === 'musammi') {
            const allowedPages = [
                'Dashboard', 'Pusat Informasi', 'Absensi', 'Buku Absensi',
                'SetoranHarian', 'Input Evaluasi', 'Master Data Perkembangan', 'Pengaturan Evaluasi',
                'LaporanRekap'
            ];
            pages = pages.filter(p => allowedPages.includes(p.page as any));
        } else if (lowerRole === 'pengajar') {
            const allowedPages = [
                'Dashboard', 'Pusat Informasi', 'Master Data Perkembangan',
                'RekapNilai', 'LaporanRekap', 'DataSantri'
            ];
            pages = pages.filter(p => allowedPages.includes(p.page as any));
        } else if (lowerRole !== 'admin' && lowerRole !== 'admin_mahad' && lowerRole !== 'super_admin') {
            pages = pages.filter(p => ['Dashboard', 'Pusat Informasi'].includes(p.page as any));
        }
        return pages;
    };

    const searchablePages = getSearchablePages();

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
      p.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <header className="print:hidden bg-transparent border-b border-slate-200 z-10 transition-all duration-300 relative">
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
                {breadcrumbs[0] && breadcrumbs[0] !== 'Pages' && (
                    <>
                        <span className="text-blue-600 font-medium hidden md:inline truncate max-w-[120px] lg:max-w-none">{breadcrumbs[0]}</span>
                        <span className="mx-2 text-slate-300 hidden md:inline">/</span>
                    </>
                )}
                <span className="text-slate-800 font-bold truncate max-w-[150px] sm:max-w-[200px] md:max-w-none">{breadcrumbs[1] || currentPage}</span>
            </div>
        </div>
        
        {/* Right: Search + Notification */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            
            {/* Search Bar - highly responsive width */}
            <div className="relative w-36 sm:w-48 md:w-56 lg:w-72 xl:w-80 group hidden sm:block transition-all" ref={searchRef}>
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={handleSearch}
                    onFocus={() => setIsSearchOpen(searchQuery.length > 0)}
                    placeholder="Cari fitur/halaman..." 
                    className="w-full bg-white border border-slate-200 text-slate-700 text-[12px] sm:text-[13px] rounded-full pl-9 pr-4 md:pr-14 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium shadow-sm"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 hidden md:flex items-center gap-1 opacity-60 pointer-events-none">
                    <kbd className="border border-slate-300 bg-slate-50 rounded-[4px] px-1.5 py-0.5 text-[10px] font-mono text-slate-500 shadow-sm leading-none">⌘</kbd>
                    <kbd className="border border-slate-300 bg-slate-50 rounded-[4px] px-1.5 py-0.5 text-[10px] font-mono text-slate-500 shadow-sm leading-none">K</kbd>
                </div>
                
                {/* Search Results Dropdown */}
                {isSearchOpen && (
                    <div className="absolute top-full right-0 w-64 sm:w-72 md:w-80 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 max-h-80 overflow-y-auto z-50">
                        {searchResults.length > 0 ? (
                            <ul className="py-2">
                                {searchResults.map((result, idx) => (
                                    <li key={idx}>
                                        <button 
                                            onClick={() => executeSearchNav(result.page)}
                                            className="w-full text-left px-4 py-2 hover:bg-blue-50 text-slate-700 text-[13px] font-medium transition-colors"
                                        >
                                            {result.title}
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
                    className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 sm:hover:bg-white rounded-full transition-colors flex items-center justify-center border border-transparent hover:border-slate-200 hover:shadow-sm"
                    aria-label="Notifikasi"
                >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white sm:border-slate-50 animate-pulse"></span>
                    )}
                </button>

                {/* Notifications Dropdown */}
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
