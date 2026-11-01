import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import ActionDropdown from '../components/ActionDropdown';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  Printer,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check
} from 'lucide-react';
import type { Page } from '../types';

interface BukuAbsensiPageProps {
  onNavigate?: (page: Page) => void;
}

interface StudentRow {
  id: number;
  nama: string;
  kelas: string;
  halaqahId: number;
  halaqahNama: string;
  halaqahJenis: string;
  marhalah: string;
  peran: string;
}

export const BukuAbsensiPage: React.FC<BukuAbsensiPageProps> = ({ onNavigate }) => {
  const {
    halaqah,
    santri,
    attendance,
    userProfile,
    globalWaktuHalaqah,
    masterMarhalahs,
    orgName,
    orgLogo,
    loading
  } = useSupabaseData();

  // ---------------------------------------------------------------------------
  // 1. RENTANG TANGGAL (Dari Tanggal s.d. Sampai Tanggal Saja)
  // ---------------------------------------------------------------------------
  const [startDate, setStartDate] = useState<string>(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  });

  const [endDate, setEndDate] = useState<string>(() => {
    const sunday = endOfWeek(new Date(), { weekStartsOn: 1 });
    return format(sunday, 'yyyy-MM-dd');
  });

  const daysInRange: Date[] = useMemo(() => {
    if (!startDate || !endDate) return [new Date()];
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return [new Date()];
    if (s > e) return [s];
    return eachDayOfInterval({ start: s, end: e });
  }, [startDate, endDate]);

  // ---------------------------------------------------------------------------
  // 2. SESI WAKTU (Dropdown Multiselect, Default Terpilih Semua)
  // ---------------------------------------------------------------------------
  const availableWaktuList: string[] = useMemo(() => {
    if (globalWaktuHalaqah && globalWaktuHalaqah.length > 0) {
      return globalWaktuHalaqah;
    }
    return ['Shubuh', 'Ashar', 'Isya'];
  }, [globalWaktuHalaqah]);

  const [selectedWaktuSessions, setSelectedWaktuSessions] = useState<string[]>(() => {
    return globalWaktuHalaqah && globalWaktuHalaqah.length > 0
      ? globalWaktuHalaqah
      : ['Shubuh', 'Ashar', 'Isya'];
  });

  // Sinkronkan jika master globalWaktuHalaqah termuat setelah initial render
  useEffect(() => {
    if (globalWaktuHalaqah && globalWaktuHalaqah.length > 0) {
      setSelectedWaktuSessions(prev => {
        if (prev.length === 0) return globalWaktuHalaqah;
        return prev;
      });
    }
  }, [globalWaktuHalaqah]);

  const [isWaktuDropdownOpen, setIsWaktuDropdownOpen] = useState(false);
  const waktuDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        waktuDropdownRef.current &&
        !waktuDropdownRef.current.contains(event.target as Node)
      ) {
        setIsWaktuDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleWaktuSession = (waktu: string) => {
    setSelectedWaktuSessions(prev => {
      if (prev.includes(waktu)) {
        return prev.filter(w => w !== waktu);
      } else {
        return [...prev, waktu];
      }
    });
  };

  const handleSelectAllWaktu = () => {
    if (selectedWaktuSessions.length === availableWaktuList.length) {
      setSelectedWaktuSessions([]);
    } else {
      setSelectedWaktuSessions([...availableWaktuList]);
    }
  };

  const activeWaktuSessions = useMemo(() => {
    return availableWaktuList.filter(w => selectedWaktuSessions.includes(w));
  }, [availableWaktuList, selectedWaktuSessions]);

  // ---------------------------------------------------------------------------
  // 3. FILTER-FILTER: Marhalah, Kelas, Jenis Halaqah, Pencarian
  // ---------------------------------------------------------------------------
  const [filterMarhalah, setFilterMarhalah] = useState<string>('all');
  const [filterKelas, setFilterKelas] = useState<string>('all');
  const [filterJenisHalaqah, setFilterJenisHalaqah] = useState<string>('all');
  const [filterPeran, setFilterPeran] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Batasi halaqah berdasarkan role user
  const permittedHalaqah = useMemo(() => {
    if (!halaqah) return [];
    const active = halaqah.filter(h => h.is_active !== false);
    if (userProfile?.role === 'musammi') {
      return active.filter(h =>
        (h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id) ||
        (h.musammi?.nama?.toLowerCase().trim() === userProfile.name?.toLowerCase().trim())
      );
    }
    return active;
  }, [halaqah, userProfile]);

  // Daftar opsi Marhalah unik
  const availableMarhalahList = useMemo(() => {
    const setM = new Set<string>();
    if (masterMarhalahs && masterMarhalahs.length > 0) {
      masterMarhalahs.forEach((m: any) => {
        if (m.nama) setM.add(m.nama);
      });
    }
    (permittedHalaqah || []).forEach(h => {
      if (h.marhalah) setM.add(h.marhalah);
    });
    (santri || []).forEach(s => {
      if (s.marhalah) setM.add(s.marhalah);
    });
    return Array.from(setM).filter(Boolean).sort();
  }, [masterMarhalahs, permittedHalaqah, santri]);

  // Daftar opsi Jenis Halaqah unik
  const availableJenisHalaqahList = useMemo(() => {
    const setJ = new Set<string>();
    (permittedHalaqah || []).forEach(h => {
      if (h.jenis) setJ.add(h.jenis);
    });
    if (setJ.size === 0) {
      setJ.add('Halaqah Utama');
      setJ.add('Halaqah Pagi');
    }
    return Array.from(setJ).filter(Boolean).sort();
  }, [permittedHalaqah]);

  // Daftar opsi Kelas unik
  const availableKelasList = useMemo(() => {
    const setKelas = new Set<string>();
    (santri || []).forEach(s => {
      if (s.kelas && s.kelas !== '-') {
        setKelas.add(s.kelas);
      }
    });
    return Array.from(setKelas).sort();
  }, [santri]);

  // Reset all filters to default
  const handleResetFilters = () => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const sunday = endOfWeek(new Date(), { weekStartsOn: 1 });
    setStartDate(format(monday, 'yyyy-MM-dd'));
    setEndDate(format(sunday, 'yyyy-MM-dd'));
    setSelectedWaktuSessions([...availableWaktuList]);
    setFilterMarhalah('all');
    setFilterKelas('all');
    setFilterJenisHalaqah('all');
    setFilterPeran('all');
    setSearchQuery('');
  };

  const isAnyFilterActive = useMemo(() => {
    return (
      filterKelas !== 'all' ||
      filterMarhalah !== 'all' ||
      filterJenisHalaqah !== 'all' ||
      filterPeran !== 'all' ||
      searchQuery.trim() !== '' ||
      selectedWaktuSessions.length !== availableWaktuList.length
    );
  }, [
    filterKelas,
    filterMarhalah,
    filterJenisHalaqah,
    filterPeran,
    searchQuery,
    selectedWaktuSessions,
    availableWaktuList
  ]);

  // ---------------------------------------------------------------------------
  // 4. SORTING: Default urut per halaqah
  // ---------------------------------------------------------------------------
  const [sortField, setSortField] = useState<'nama' | 'kelas' | 'halaqah' | 'peran'>('halaqah');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'nama' | 'kelas' | 'halaqah' | 'peran') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // ---------------------------------------------------------------------------
  // 5. PEMETAAN DATA ABSENSI (Lookup Map O(1))
  // ---------------------------------------------------------------------------
  const attendanceLookup = useMemo(() => {
    const map = new Map<string, string>();
    (attendance || []).forEach(rec => {
      if (rec.date && rec.personId && rec.waktu) {
        const dateKey = rec.date.length >= 10 ? rec.date.substring(0, 10) : rec.date;
        const peranKey = rec.peran || 'Santri';
        const keyWithRole = `${rec.personId}_${peranKey}_${dateKey}_${rec.waktu.toLowerCase().trim()}`;
        const keySimple = `${rec.personId}_${dateKey}_${rec.waktu.toLowerCase().trim()}`;
        map.set(keyWithRole, rec.status || 'Hadir');
        if (!map.has(keySimple)) {
          map.set(keySimple, rec.status || 'Hadir');
        }
      }
    });
    return map;
  }, [attendance]);

  // ---------------------------------------------------------------------------
  // 6. DAFTAR SANTRI & MUSAMMI SATU TABEL TUNGGAL (DENGAN FILTER & SORTIR)
  // ---------------------------------------------------------------------------
  const studentRows: StudentRow[] = useMemo(() => {
    const list: StudentRow[] = [];
    const seenKey = new Set<string>();
    const q = searchQuery.toLowerCase().trim();

    permittedHalaqah.forEach(h => {
      // Filter Jenis Halaqah
      const hJenis = h.jenis || 'Halaqah Utama';
      if (filterJenisHalaqah !== 'all' && hJenis !== filterJenisHalaqah) {
        return;
      }

      // 1. Musammi (jika ada dan sesuai filter peran)
      if (h.musammi && (filterPeran === 'all' || filterPeran === 'Musammi')) {
        const mMarhalah = h.marhalah || '-';
        const matchesMarhalah =
          filterMarhalah === 'all' ||
          mMarhalah === filterMarhalah ||
          h.marhalah === filterMarhalah;
        const matchesKelas = filterKelas === 'all';
        const matchesQuery = !q || h.musammi.nama.toLowerCase().includes(q);

        if (matchesMarhalah && matchesKelas && matchesQuery) {
          const uniqueKey = `Musammi_${h.musammi.id}_${h.id}`;
          if (!seenKey.has(uniqueKey)) {
            seenKey.add(uniqueKey);
            list.push({
              id: h.musammi.id,
              nama: h.musammi.nama,
              kelas: '-',
              halaqahId: h.id,
              halaqahNama: h.nama,
              halaqahJenis: hJenis,
              marhalah: mMarhalah,
              peran: 'Musammi'
            });
          }
        }
      }

      // 2. Santri
      if (filterPeran === 'all' || filterPeran === 'Santri') {
        (h.santri || []).forEach((s: any) => {
          // Filter Marhalah (cocokkan santri marhalah atau halaqah marhalah)
          const sMarhalah = s.marhalah || h.marhalah || '-';
          if (
            filterMarhalah !== 'all' &&
            sMarhalah !== filterMarhalah &&
            h.marhalah !== filterMarhalah
          ) {
            return;
          }

          // Filter Kelas
          const sKelas = s.kelas || '-';
          if (filterKelas !== 'all' && sKelas !== filterKelas) {
            return;
          }

          // Pencarian Nama Santri
          if (q && !s.nama.toLowerCase().includes(q)) {
            return;
          }

          const uniqueKey = `Santri_${s.id}_${h.id}`;
          if (!seenKey.has(uniqueKey)) {
            seenKey.add(uniqueKey);
            list.push({
              id: s.id,
              nama: s.nama,
              kelas: sKelas,
              halaqahId: h.id,
              halaqahNama: h.nama,
              halaqahJenis: hJenis,
              marhalah: sMarhalah,
              peran: 'Santri'
            });
          }
        });
      }
    });

    // Urutkan data berdasarkan sortField dan sortDirection (Default urut per halaqah)
    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'halaqah') {
        comparison = a.halaqahNama.localeCompare(b.halaqahNama, 'id');
        if (comparison === 0) {
          if (a.peran !== b.peran) {
            comparison = a.peran === 'Musammi' ? -1 : 1;
          } else {
            comparison = a.nama.localeCompare(b.nama, 'id');
          }
        }
      } else if (sortField === 'nama') {
        comparison = a.nama.localeCompare(b.nama, 'id');
      } else if (sortField === 'kelas') {
        comparison = a.kelas.localeCompare(b.kelas, 'id', { numeric: true });
      } else if (sortField === 'peran') {
        comparison = a.peran.localeCompare(b.peran, 'id');
        if (comparison === 0) {
          comparison = a.nama.localeCompare(b.nama, 'id');
        }
      }

      // Jika sama, urutkan sekunder berdasarkan nama santri
      if (comparison === 0 && sortField !== 'nama') {
        comparison = a.nama.localeCompare(b.nama, 'id');
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [
    permittedHalaqah,
    filterJenisHalaqah,
    filterMarhalah,
    filterKelas,
    filterPeran,
    searchQuery,
    sortField,
    sortDirection
  ]);

  // Render badge status cell
  const renderStatusCell = (personId: number, peran: string, date: Date, session: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const keyWithRole = `${personId}_${peran}_${dateStr}_${session.toLowerCase().trim()}`;
    const keySimple = `${personId}_${dateStr}_${session.toLowerCase().trim()}`;
    const status = attendanceLookup.get(keyWithRole) || attendanceLookup.get(keySimple);

    if (!status) {
      return <span className="text-slate-300 font-normal">-</span>;
    }

    const sLower = status.toLowerCase();
    if (sLower === 'hadir') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
          H
        </span>
      );
    }
    if (sLower === 'izin') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800">
          I
        </span>
      );
    }
    if (sLower === 'sakit') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800">
          S
        </span>
      );
    }
    if (sLower === 'alpa' || sLower === 'alpha') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800">
          A
        </span>
      );
    }
    if (sLower === 'terlambat') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-yellow-100 text-yellow-800">
          T
        </span>
      );
    }

    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-slate-100 text-slate-800">
        {status.charAt(0).toUpperCase()}
      </span>
    );
  };

  // Ringkasan per santri / musammi
  const calculateStudentSummary = (personId: number, peran: string) => {
    let h = 0,
      i = 0,
      s = 0,
      a = 0,
      t = 0;

    daysInRange.forEach(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      activeWaktuSessions.forEach(sess => {
        const keyWithRole = `${personId}_${peran}_${dateStr}_${sess.toLowerCase().trim()}`;
        const keySimple = `${personId}_${dateStr}_${sess.toLowerCase().trim()}`;
        const st = attendanceLookup.get(keyWithRole) || attendanceLookup.get(keySimple);
        if (st) {
          const stL = st.toLowerCase();
          if (stL === 'hadir') h++;
          else if (stL === 'izin') i++;
          else if (stL === 'sakit') s++;
          else if (stL === 'alpa' || stL === 'alpha') a++;
          else if (stL === 'terlambat') t++;
        }
      });
    });

    const totalRecorded = h + i + s + a + t;
    const percentage = totalRecorded > 0 ? Math.round((h / totalRecorded) * 100) : 0;

    return { h, i, s, a, t, totalRecorded, percentage };
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* =====================================================================
          HEADER HALAMAN
      ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Buku Absensi</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Rekapitulasi kehadiran santri dalam format matriks tanggal dan sesi halaqah.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <ActionDropdown
            label="Cetak"
            icon={<Printer size={15} />}
            variant="blue"
          >
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center w-full px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 text-left transition-colors"
            >
              Cetak Data
            </button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('CetakBukuFisik')}
                className="flex items-center w-full px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100 transition-colors"
              >
                Cetak Buku Fisik
              </button>
            )}
          </ActionDropdown>
        </div>
      </div>

      {/* =====================================================================
          KOP LEMBAGA (Hanya Tampil Saat Dicetak / window.print)
      ===================================================================== */}
      <div className="hidden print:block mb-4 pb-3 border-b-2 border-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {orgLogo && <img src={orgLogo} alt="Logo" className="h-12 w-12 object-contain" />}
            <div>
              <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide">
                {orgName || "LEMBAGA TAHFIZ AL-QUR'AN"}
              </h2>
              <p className="text-xs text-slate-700 font-medium">
                REKAPITULASI BUKU ABSENSI HALAQAH SANTRI
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-600">
            <p>
              Periode:{' '}
              <span className="font-semibold text-slate-900">
                {format(daysInRange[0], 'dd MMM yyyy', { locale: localeId })} -{' '}
                {format(daysInRange[daysInRange.length - 1], 'dd MMM yyyy', { locale: localeId })}
              </span>
            </p>
            <p>Dicetak pada: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          FILTER BAR (Seragam dengan Input Absensi: Tanpa Judul Kolom, Tinggi h-11)
          Urutan: 1. Rentang Tanggal, 2. Marhalah, 3. Kelas, 4. Jenis Halaqah, 5. Waktu, 6. Cari Nama Santri
      ===================================================================== */}
      <div className="relative z-40 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_4px_16px_0_rgba(0,0,0,0.02)] print:hidden space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          {/* 1. Tanggal Mulai */}
          <div className="col-span-1">
            <div className="relative flex items-center h-11 w-full rounded-xl border border-slate-200/90 bg-white px-3 shadow-xs hover:border-slate-300 hover:bg-slate-50 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <span className="text-[11px] font-semibold text-slate-400 mr-2 shrink-0">Dari:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full flex-1 min-w-0 bg-transparent text-[12px] font-semibold text-slate-700 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                title="Tanggal Mulai"
              />
            </div>
          </div>

          {/* 2. Tanggal Selesai */}
          <div className="col-span-1">
            <div className="relative flex items-center h-11 w-full rounded-xl border border-slate-200/90 bg-white px-3 shadow-xs hover:border-slate-300 hover:bg-slate-50 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <span className="text-[11px] font-semibold text-slate-400 mr-2 shrink-0">Sampai:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full flex-1 min-w-0 bg-transparent text-[12px] font-semibold text-slate-700 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                title="Tanggal Selesai"
              />
            </div>
          </div>

          {/* 3. Peran */}
          <div className="relative w-full col-span-1">
            <select
              value={filterPeran}
              onChange={e => setFilterPeran(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Peran</option>
              <option value="Santri">Santri</option>
              <option value="Musammi">Musammi</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 4. Marhalah */}
          <div className="relative w-full col-span-1">
            <select
              value={filterMarhalah}
              onChange={e => setFilterMarhalah(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Marhalah</option>
              {availableMarhalahList.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 5. Kelas */}
          <div className="relative w-full col-span-1">
            <select
              value={filterKelas}
              onChange={e => setFilterKelas(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Kelas</option>
              {availableKelasList.map(k => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 6. Jenis Halaqah */}
          <div className="relative w-full col-span-1">
            <select
              value={filterJenisHalaqah}
              onChange={e => setFilterJenisHalaqah(e.target.value)}
              className="appearance-none h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs outline-none cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 truncate"
            >
              <option value="all">Semua Jenis Halaqah</option>
              {availableJenisHalaqahList.map(j => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 7. Waktu (Dropdown Multiselect) */}
          <div className="col-span-1 relative z-50" ref={waktuDropdownRef}>
            <button
              type="button"
              onClick={() => setIsWaktuDropdownOpen(prev => !prev)}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-9 text-[13px] font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-left cursor-pointer truncate"
            >
              <span className="truncate">
                {selectedWaktuSessions.length === availableWaktuList.length
                  ? `Semua Waktu (${availableWaktuList.length})`
                  : selectedWaktuSessions.length === 0
                  ? 'Pilih Waktu...'
                  : selectedWaktuSessions.join(', ')}
              </span>
              <ChevronDown
                size={16}
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform duration-200 ${
                  isWaktuDropdownOpen ? 'rotate-180 text-blue-600' : ''
                }`}
              />
            </button>

            {/* Menu Popover Multiselect */}
            {isWaktuDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200/90 rounded-xl shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-100 px-1">
                  <span className="text-[11px] font-semibold text-slate-500">Pilih Sesi Waktu</span>
                  <button
                    type="button"
                    onClick={handleSelectAllWaktu}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    {selectedWaktuSessions.length === availableWaktuList.length
                      ? 'Kosongkan'
                      : 'Pilih Semua'}
                  </button>
                </div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {availableWaktuList.map(session => {
                    const isChecked = selectedWaktuSessions.includes(session);
                    return (
                      <label
                        key={session}
                        onClick={e => {
                          e.preventDefault();
                          toggleWaktuSession(session);
                        }}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-50 cursor-pointer select-none transition-colors"
                      >
                        <span className="text-slate-800 font-medium">{session}</span>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 8. Cari Nama (Santri / Musammi) */}
          <div className="relative group w-full col-span-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors pointer-events-none"
            />
            <input
              type="text"
              placeholder="Cari nama..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-slate-200/90 bg-white pl-10 pr-4 text-[13px] font-medium text-slate-700 shadow-xs transition-all hover:border-slate-300 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          TABEL MATRIKS BUKU ABSENSI TUNGGAL (TIDAK DIPISAH PER HALAQAH)
      ===================================================================== */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-slate-500">Memuat data buku absensi...</p>
        </div>
      ) : activeWaktuSessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-500 text-xs">
          Silakan pilih minimal 1 sesi waktu pada filter Sesi Waktu di atas untuk menampilkan data absensi.
        </div>
      ) : studentRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-500 text-xs">
          Tidak ada data santri yang sesuai dengan filter yang dipilih.
        </div>
      ) : (
        <div className="relative z-10 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden print:border print:border-slate-300 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {/* Header Baris 1: No, Nama Santri, Peran, Kelas, Halaqah, Header Tanggal, Header Rekapitulasi */}
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th
                    rowSpan={2}
                    className="sticky left-0 print:static print:left-auto z-20 bg-slate-100 py-3.5 px-3 text-center font-bold text-slate-700 border-r border-slate-200 w-12 min-w-[48px] max-w-[48px] text-[12px] select-none"
                  >
                    No
                  </th>

                  {/* Kolom Nama Santri (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('nama')}
                    className="sticky left-12 print:static print:left-auto z-20 bg-slate-100 py-3.5 px-3.5 font-bold text-slate-800 border-r border-slate-200 min-w-[180px] text-[13px] select-none cursor-pointer hover:bg-slate-200/70 transition-colors group shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] print:shadow-none"
                    title="Klik untuk menyortir nama"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Nama</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'nama'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'nama' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Kolom Peran (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('peran')}
                    className="py-3.5 px-3 font-bold text-slate-800 border-r border-slate-200 w-24 text-center text-[12px] select-none cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk menyortir peran"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Peran</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'peran'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'peran' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Kolom Kelas (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('kelas')}
                    className="py-3.5 px-3 font-bold text-slate-800 border-r border-slate-200 w-24 text-center text-[12px] select-none cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk menyortir kelas"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Kelas</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'kelas'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'kelas' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Kolom Halaqah (Sortable) */}
                  <th
                    rowSpan={2}
                    onClick={() => handleSort('halaqah')}
                    className="py-3.5 px-3.5 font-bold text-slate-800 border-r border-slate-200 min-w-[150px] text-[12px] select-none cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk menyortir halaqah"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span>Halaqah</span>
                      <span
                        className={`p-0.5 rounded transition-colors ${
                          sortField === 'halaqah'
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {sortField === 'halaqah' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={13} strokeWidth={2.5} />
                          ) : (
                            <ArrowDown size={13} strokeWidth={2.5} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </span>
                    </div>
                  </th>

                  {/* Header Tanggal */}
                  {daysInRange.map((day, idx) => (
                    <th
                      key={idx}
                      colSpan={activeWaktuSessions.length}
                      className="py-2.5 px-2 text-center font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap bg-slate-100"
                    >
                      <div className="text-[12px] font-bold text-slate-800">
                        {format(day, 'EEE', { locale: localeId })}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500">
                        {format(day, 'dd/MM')}
                      </div>
                    </th>
                  ))}

                  {/* Header Ringkasan */}
                  <th
                    colSpan={6}
                    className="py-3.5 px-3 text-center font-bold text-slate-800 bg-slate-100 text-[12px]"
                  >
                    Rekapitulasi
                  </th>
                </tr>

                {/* Header Baris 2: Sub-kolom Sesi Waktu & Sub-kolom Ringkasan */}
                <tr className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                  {daysInRange.map((_, dayIdx) =>
                    activeWaktuSessions.map((session, sIdx) => (
                      <th
                        key={`${dayIdx}_${sIdx}`}
                        className="py-2 px-1 text-center border-r border-slate-200 min-w-[32px]"
                        title={session}
                      >
                        {session.substring(0, 3)}
                      </th>
                    ))
                  )}

                  {/* Sub-kolom Ringkasan */}
                  <th className="py-2 px-1.5 text-center font-bold text-emerald-800 border-r border-slate-200 w-8 text-[11px]">
                    H
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-blue-800 border-r border-slate-200 w-8 text-[11px]">
                    I
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-amber-800 border-r border-slate-200 w-8 text-[11px]">
                    S
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-rose-800 border-r border-slate-200 w-8 text-[11px]">
                    A
                  </th>
                  <th className="py-2 px-1.5 text-center font-bold text-yellow-800 border-r border-slate-200 w-8 text-[11px]">
                    T
                  </th>
                  <th className="py-2 px-2 text-center font-bold text-slate-800 w-12 text-[11px]">%</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {studentRows.map((student, sIdx) => {
                  const summary = calculateStudentSummary(student.id, student.peran);

                  return (
                    <tr
                      key={`${student.peran}_${student.id}_${student.halaqahId}`}
                      className="group hover:bg-slate-50/70 transition-colors text-slate-800"
                    >
                      {/* Nomor Urut */}
                      <td className="sticky left-0 print:static print:left-auto z-20 bg-white group-hover:bg-slate-50 py-3 px-2.5 text-center text-slate-500 border-r border-slate-100 text-[13px] w-12 min-w-[48px] max-w-[48px] transition-colors">
                        {sIdx + 1}
                      </td>

                      {/* Nama */}
                      <td className="sticky left-12 print:static print:left-auto z-20 bg-white group-hover:bg-slate-50 py-3 px-3.5 font-semibold text-slate-900 border-r border-slate-100 whitespace-nowrap text-[13px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] print:shadow-none transition-colors">
                        {student.nama}
                      </td>

                      {/* Peran */}
                      <td className="py-3 px-2.5 text-center border-r border-slate-100 text-[12px] whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            student.peran === 'Musammi'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {student.peran}
                        </span>
                      </td>

                      {/* Kelas */}
                      <td className="py-3 px-2.5 text-center text-slate-600 border-r border-slate-100 text-[12px] font-medium whitespace-nowrap">
                        {student.kelas}
                      </td>

                      {/* Halaqah */}
                      <td className="py-3 px-3.5 text-slate-600 border-r border-slate-100 text-[12px] font-medium whitespace-nowrap">
                        {student.halaqahNama}
                      </td>

                      {/* Sel Kehadiran Tiap Hari & Sesi */}
                      {daysInRange.map((day, dayIdx) =>
                        activeWaktuSessions.map((session, sessIdx) => (
                          <td
                            key={`${dayIdx}_${sessIdx}`}
                            className="py-2.5 px-1 text-center border-r border-slate-100 min-w-[32px]"
                          >
                            {renderStatusCell(student.id, student.peran, day, session)}
                          </td>
                        ))
                      )}

                      {/* Rekapitulasi: Hadir, Izin, Sakit, Alpa, Terlambat, Persentase */}
                      <td className="py-3 px-1.5 text-center font-bold text-emerald-700 bg-emerald-50/30 border-r border-slate-100 text-[12px]">
                        {summary.h}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-blue-700 bg-blue-50/30 border-r border-slate-100 text-[12px]">
                        {summary.i}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-amber-700 bg-amber-50/30 border-r border-slate-100 text-[12px]">
                        {summary.s}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-rose-700 bg-rose-50/30 border-r border-slate-100 text-[12px]">
                        {summary.a}
                      </td>
                      <td className="py-3 px-1.5 text-center font-bold text-yellow-700 bg-yellow-50/30 border-r border-slate-100 text-[12px]">
                        {summary.t}
                      </td>
                      <td className="py-3 px-2 text-center font-extrabold text-slate-900 bg-slate-50/50 text-[12px]">
                        {summary.percentage}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kolom Tanda Tangan Cetak Fisik */}
      <div className="hidden print:grid grid-cols-2 gap-8 pt-8 mt-6 text-center text-xs text-slate-800">
        <div>
          <p className="text-slate-600 mb-16">Pengampu / Musammi Halaqah</p>
          <p className="font-bold border-b border-slate-800 inline-block min-w-[180px] pb-1">
            ( .................................................. )
          </p>
        </div>
        <div>
          <p className="text-slate-600 mb-16">
            Mengetahui,
            <br />
            Koordinator Kepengasuhan & Tahfiz
          </p>
          <p className="font-bold border-b border-slate-800 inline-block min-w-[180px] pb-1">
            ( .................................................. )
          </p>
        </div>
      </div>
    </div>
  );
};

export default BukuAbsensiPage;
