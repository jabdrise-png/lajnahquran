// Dipecah otomatis dari BukuAbsensiPage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen BukuAbsensiPage.
// Ubah perilaku di sini; tampilan ada di BukuAbsensiPage.tsx.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSupabaseData, useRiwayat } from '../hooks/useSupabaseData';
import ActionDropdown from '../components/ActionDropdown';
import Modal from '../components/Modal';
import { supabase } from '../lib/supabaseClient';
import { NotificationStore } from '../lib/NotificationStore';
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
import type { Page, Peran, Waktu } from '../types';


export interface BukuAbsensiPageProps {
  onNavigate?: (page: Page) => void;
}

export interface StudentRow {
  id: number;
  nama: string;
  kelas: string;
  halaqahId: number;
  halaqahNama: string;
  halaqahJenis: string;
  marhalah: string;
  peran: string;
}

export function useBukuAbsensiPageLogika({ onNavigate }: BukuAbsensiPageProps) {
  const {
    halaqah,
    santri,
    attendance,
    addAttendanceRecords,
    userProfile,
    globalWaktuHalaqah,
    globalAttendanceStatus,
    masterMarhalahs,
    orgName,
    orgLogo,
    loading
  } = useSupabaseData();
  useRiwayat(); // Fase 7: riwayat absensi/setoran dimuat saat halaman ini dibuka

  const isAdminUser = userProfile?.role === 'admin' || userProfile?.role === 'superadmin';
  const [correctionTarget, setCorrectionTarget] = useState<{
    student: StudentRow;
    dateStr: string;
    session: string;
    currentStatus: string;
    newStatus: string;
    reason: string;
  } | null>(null);
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  const handleSaveCorrection = async () => {
    if (!correctionTarget || !correctionTarget.newStatus || !correctionTarget.reason.trim()) return;
    setIsSavingCorrection(true);
    try {
      await addAttendanceRecords([
        {
          date: correctionTarget.dateStr,
          waktu: correctionTarget.session as Waktu,
          personId: correctionTarget.student.id,
          peran: correctionTarget.student.peran as Peran,
          status: correctionTarget.newStatus as any,
          halaqahId: correctionTarget.student.halaqahId
        }
      ], correctionTarget.reason.trim());

      // Audit Log dicatat server (rpc_record_attendance → correct_attendance), tidak perlu insert dari browser.

      NotificationStore.addNotification(
        `Koreksi kehadiran ${correctionTarget.student.nama} (${correctionTarget.dateStr} - ${correctionTarget.session}) berhasil disimpan & dicatat di Audit Log.`,
        'success'
      );
      setCorrectionTarget(null);
    } catch (err: any) {
      NotificationStore.addNotification(err?.message || 'Gagal menyimpan koreksi absensi.', 'error');
    } finally {
      setIsSavingCorrection(false);
    }
  };

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

  // Batasi halaqah berdasarkan role user (wajib via user_id sesuai Blueprint Fase 2)
  const permittedHalaqah = useMemo(() => {
    if (!halaqah) return [];
    const active = halaqah.filter(h => h.is_active !== false);
    if (userProfile?.role === 'musammi') {
      return active.filter(h =>
        Boolean(h.musammi?.user_id && userProfile.id && h.musammi.user_id === userProfile.id)
      );
    }
    return active;
  }, [halaqah, userProfile]);

  // Daftar opsi Marhalah unik
  const availableMarhalahList = useMemo(() => {
    const setM = new Set<string>();
    if (masterMarhalahs && masterMarhalahs.length > 0) {
      masterMarhalahs.forEach((m) => {
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
        (h.santri || []).forEach((s) => {
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
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-2xs font-bold bg-emerald-100 text-emerald-800">
          H
        </span>
      );
    }
    if (sLower === 'izin') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-2xs font-bold bg-blue-100 text-blue-800">
          I
        </span>
      );
    }
    if (sLower === 'sakit') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-2xs font-bold bg-amber-100 text-amber-800">
          S
        </span>
      );
    }
    if (sLower === 'alpa' || sLower === 'alpha') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-2xs font-bold bg-red-100 text-red-800">
          A
        </span>
      );
    }
    if (sLower === 'terlambat') {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-2xs font-bold bg-yellow-100 text-yellow-800">
          T
        </span>
      );
    }

    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-2xs font-bold bg-slate-100 text-slate-800">
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
  return { onNavigate, halaqah, santri, attendance, addAttendanceRecords, userProfile, globalWaktuHalaqah, globalAttendanceStatus, masterMarhalahs, orgName, orgLogo, loading, isAdminUser, correctionTarget, setCorrectionTarget, isSavingCorrection, setIsSavingCorrection, handleSaveCorrection, startDate, setStartDate, endDate, setEndDate, daysInRange, availableWaktuList, selectedWaktuSessions, setSelectedWaktuSessions, isWaktuDropdownOpen, setIsWaktuDropdownOpen, waktuDropdownRef, toggleWaktuSession, handleSelectAllWaktu, activeWaktuSessions, filterMarhalah, setFilterMarhalah, filterKelas, setFilterKelas, filterJenisHalaqah, setFilterJenisHalaqah, filterPeran, setFilterPeran, searchQuery, setSearchQuery, permittedHalaqah, availableMarhalahList, availableJenisHalaqahList, availableKelasList, handleResetFilters, isAnyFilterActive, sortField, setSortField, sortDirection, setSortDirection, handleSort, attendanceLookup, studentRows, renderStatusCell, calculateStudentSummary, handlePrint };
}

export type BukuAbsensiPageLogika = ReturnType<typeof useBukuAbsensiPageLogika>;
