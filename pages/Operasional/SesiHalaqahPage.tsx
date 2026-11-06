import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { useParams, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { PageShell, PageHeader, StatCard, StatusBadge, EmptyState } from '../../components/ui/SaaSPrimitives';
import { normalizeRole } from '../../lib/permissions';
import { Peran } from '../../types';
import { quranMetadata, calculateHalamanSetoran } from '../../lib/quranUtils';
import Modal from '../../components/Modal';
import { NotificationStore } from '../../lib/NotificationStore';
import { supabase } from '../../lib/supabaseClient';

type WorkTabId = 'absensi' | 'setoran' | 'roster' | 'schedule';

const SesiHalaqahPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    halaqah,
    attendance,
    setoranHarian,
    addAttendanceRecords,
    addSetoranHarianRecord,
    globalWaktuHalaqah,
    globalAttendanceStatus,
    userProfile,
    selectedAcademicYear,
    getOrgId,
    loading,
    fetchData,
  } = useSupabaseData();

  const canonicalRole = normalizeRole(userProfile?.role);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const initialTabFromRoute = (): WorkTabId => {
    const qTab = searchParams.get('tab') as WorkTabId | null;
    if (qTab && ['absensi', 'setoran', 'roster', 'schedule'].includes(qTab)) return qTab;
    if (location.pathname.endsWith('/recitations')) return 'setoran';
    if (location.pathname.endsWith('/attendance')) return 'absensi';
    if (location.pathname.includes('/my-halaqah')) return 'roster';
    if (location.pathname.includes('/my-schedule')) return 'schedule';
    return 'absensi';
  };

  const [selectedDate, setSelectedDate] = useState<string>(
    searchParams.get('date') || todayStr
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(
    searchParams.get('slot') || globalWaktuHalaqah?.[0] || 'Shubuh'
  );
  const [selectedHalaqahId, setSelectedHalaqahId] = useState<number | null>(() => {
    const fromParam = Number(sessionId || searchParams.get('halaqahId'));
    return Number.isFinite(fromParam) && fromParam > 0 ? fromParam : null;
  });
  const [activeWorkTab, setActiveWorkTab] = useState<WorkTabId>(initialTabFromRoute);

  useEffect(() => {
    const nextTab = initialTabFromRoute();
    setActiveWorkTab(nextTab);
    const rawSessionParam = sessionId || searchParams.get('halaqahId') || '';
    const paramId = Number(rawSessionParam);
    if (Number.isFinite(paramId) && paramId > 0) {
      setSelectedHalaqahId(paramId);
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSessionParam)) {
      // Jika parameter URL berupa UUID sesi dari halaqah_sessions, resolusi otomatis ke halaqah_id, tanggal, dan slot
      (supabase as any)
        .from('halaqah_sessions')
        .select('halaqah_id, session_date, session_slot')
        .eq('id', rawSessionParam)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data) {
            if (data.halaqah_id) setSelectedHalaqahId(Number(data.halaqah_id));
            if (data.session_date) setSelectedDate(data.session_date);
            if (data.session_slot) setSelectedSlot(data.session_slot);
          }
        })
        .catch(() => {});
    }
    const qDate = searchParams.get('date');
    if (qDate) setSelectedDate(qDate);
    const qSlot = searchParams.get('slot');
    if (qSlot) setSelectedSlot(qSlot);
  }, [location.pathname, sessionId, searchParams]);

  // State Absensi Sesi: Default wajib "Belum diisi" (string kosong), TIDAK otomatis Hadir
  const [draftAttendance, setDraftAttendance] = useState<Record<number, string>>({});
  const [draftMusammiStatus, setDraftMusammiStatus] = useState<string>('');
  const [isConfirmBulkHadirOpen, setConfirmBulkHadirOpen] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // State Siklus Hidup Sesi V2 (open -> submitted -> locked) & Koreksi Pasca-Kunci
  const [v2SessionRecord, setV2SessionRecord] = useState<any | null>(null);
  const [isLockingSession, setIsLockingSession] = useState(false);
  const [isLockConfirmModalOpen, setIsLockConfirmModalOpen] = useState(false);
  const [isPostLockModalOpen, setIsPostLockModalOpen] = useState(false);
  const [postLockReason, setPostLockReason] = useState('');

  // State Transaksi Setoran Terstruktur (Ziyadah / Sabqi / Manzil)
  const [recitationForm, setRecitationForm] = useState({
    santriId: 0,
    kind: 'Ziyadah' as 'Ziyadah' | 'Sabqi' | 'Manzil',
    surahStartNo: 1,
    ayahStart: 1,
    surahEndNo: 1,
    ayahEnd: 7,
    mistakesMinor: 0,
    mistakesMajor: 0,
    predicate: 'Mumtaz',
    notes: '',
    submissionMode: 'submitted' as 'draft' | 'submitted',
  });
  const [isSavingRecitation, setIsSavingRecitation] = useState(false);

  // State Ledger V2 (recitation_entries, recitation_revisions & review modal untuk Admin)
  const [v2RecitationLedger, setV2RecitationLedger] = useState<any[]>([]);
  const [reviewModalTarget, setReviewModalTarget] = useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'accepted' | 'returned' | 'voided'>('accepted');
  const [reviewReason, setReviewReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Modal Riwayat Revisi Setoran (recitation_revisions)
  const [revisionHistoryTarget, setRevisionHistoryTarget] = useState<any | null>(null);
  const [revisionHistoryRows, setRevisionHistoryRows] = useState<any[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);

  // Filter Halaqah sesuai Assignment Musammi (Default Deny untuk halaqah di luar penugasan)
  const assignedHalaqahList = useMemo(() => {
    const activeOnly = halaqah.filter((h) => h.is_active !== false);
    if (canonicalRole === 'musammi' && userProfile?.id) {
      return activeOnly.filter((h) =>
        Boolean(h.musammi?.user_id && h.musammi.user_id === userProfile.id)
      );
    }
    return activeOnly;
  }, [halaqah, canonicalRole, userProfile]);

  const activeHalaqah = useMemo(() => {
    if (selectedHalaqahId) {
      return assignedHalaqahList.find((h) => h.id === selectedHalaqahId) || assignedHalaqahList[0] || null;
    }
    return assignedHalaqahList[0] || null;
  }, [assignedHalaqahList, selectedHalaqahId]);

  // Snapshot Roster Aktif: Utamakan snapshot sesi jika sudah tersimpan di DB agar histori masa lampau tidak berubah
  const sessionRoster = useMemo(() => {
    if (
      v2SessionRecord?.roster_snapshot &&
      Array.isArray(v2SessionRecord.roster_snapshot) &&
      v2SessionRecord.roster_snapshot.length > 0
    ) {
      return v2SessionRecord.roster_snapshot.map((r: any) => ({
        id: Number(r.santri_id || r.id),
        nama: r.nama,
        kode: r.kode || '',
        marhalah: r.marhalah || '',
        kelas: r.kelas || '',
      }));
    }
    if (!activeHalaqah) return [];
    if (activeHalaqah.history && activeHalaqah.history.length > 0) {
      const activeIds = new Set(
        activeHalaqah.history
          .filter(
            (hs) =>
              (!hs.start_date || hs.start_date <= selectedDate) &&
              (!hs.end_date || hs.end_date >= selectedDate)
          )
          .map((hs) => hs.santri_id)
      );
      const fromSantriList = (activeHalaqah.santri || []).filter((s) => activeIds.has(s.id));
      if (fromSantriList.length > 0) return fromSantriList;
    }
    return activeHalaqah.santri || [];
  }, [v2SessionRecord?.roster_snapshot, activeHalaqah, selectedDate]);

  // Ambil data sesi V2 (halaqah_sessions) & ledger V2 (recitation_entries)
  const fetchV2SessionAndLedger = async () => {
    if (!activeHalaqah) return;
    try {
      const orgId = await getOrgId();
      if (!orgId) return;

      const [sessRes, recRes] = await Promise.all([
        (supabase as any)
          .from('halaqah_sessions')
          .select('*')
          .eq('organization_id', orgId)
          .eq('halaqah_id', activeHalaqah.id)
          .eq('session_date', selectedDate)
          .eq('session_slot', selectedSlot)
          .maybeSingle(),
        (supabase as any)
          .from('recitation_entries')
          .select('*')
          .eq('organization_id', orgId)
          .eq('halaqah_id', activeHalaqah.id)
          .eq('recitation_date', selectedDate)
          .eq('session_slot', selectedSlot)
          .order('created_at', { ascending: false }),
      ]);

      setV2SessionRecord(sessRes?.data || null);
      setV2RecitationLedger(recRes?.data || []);
    } catch {
      setV2SessionRecord(null);
      setV2RecitationLedger([]);
    }
  };

  useEffect(() => {
    fetchV2SessionAndLedger();
  }, [activeHalaqah?.id, selectedDate, selectedSlot]);

  // Auto-fill cerdas surat & ayat mulai berdasarkan setoran terakhir santri pada jenis setoran yang dipilih
  useEffect(() => {
    const targetSantriId = recitationForm.santriId || sessionRoster[0]?.id;
    if (!targetSantriId) return;

    const matchingHistory = (setoranHarian || [])
      .filter(
        (st: any) =>
          st.santri_id === targetSantriId &&
          String(st.jenis_setoran || st.skema || 'Ziyadah').toLowerCase() ===
            recitationForm.kind.toLowerCase()
      )
      .sort((a: any, b: any) => (b.tanggal || '').localeCompare(a.tanggal || ''));

    const lastEntry = matchingHistory[0];
    if (lastEntry) {
      const lastEndName = String(
        lastEntry.surah_akhir || lastEntry.surat_selesai || lastEntry.surah_mulai || lastEntry.surat || ''
      ).toLowerCase();
      const matchedSurah = quranMetadata.find(
        (sr) =>
          sr.id === Number(lastEntry.surah_end_no) ||
          sr.name.toLowerCase() === lastEndName
      );
      if (matchedSurah) {
        const lastEndAyah = Number(lastEntry.ayat_akhir || lastEntry.ayat_selesai || lastEntry.ayat || 1) || 1;
        const nextStartAyah = lastEndAyah < matchedSurah.ayat ? lastEndAyah + 1 : 1;
        const nextSurahId =
          lastEndAyah >= matchedSurah.ayat && matchedSurah.id < 114
            ? matchedSurah.id + 1
            : matchedSurah.id;
        const nextSurahMeta = quranMetadata.find((sr) => sr.id === nextSurahId) || matchedSurah;
        setRecitationForm((prev) => ({
          ...prev,
          surahStartNo: nextSurahMeta.id,
          ayahStart: nextStartAyah,
          surahEndNo: nextSurahMeta.id,
          ayahEnd: Math.min(nextSurahMeta.ayat, nextStartAyah + 6),
        }));
      }
    }
  }, [recitationForm.santriId, recitationForm.kind, sessionRoster]);

  // Baca data absensi santri yang sudah tersimpan untuk sesi (tanggal + waktu + halaqah) ini
  const existingSessionAttendance = useMemo(() => {
    const map: Record<number, string> = {};
    if (!activeHalaqah) return map;
    attendance.forEach((a) => {
      if (
        a.date === selectedDate &&
        a.waktu === selectedSlot &&
        a.peran === Peran.Santri &&
        (a.halaqahId === activeHalaqah.id ||
          sessionRoster.some((s) => s.id === a.personId))
      ) {
        map[a.personId] = a.status;
      }
    });
    return map;
  }, [attendance, activeHalaqah, selectedDate, selectedSlot, sessionRoster]);

  const existingMusammiAttendance = useMemo(() => {
    if (!activeHalaqah?.musammi?.id) return '';
    const found = attendance.find(
      (a) =>
        a.date === selectedDate &&
        a.waktu === selectedSlot &&
        a.peran === Peran.Musammi &&
        a.personId === activeHalaqah.musammi.id
    );
    return found?.status || '';
  }, [attendance, activeHalaqah, selectedDate, selectedSlot]);

  // Baca catatan setoran yang tercatat pada sesi ini (difilter per tanggal & slot waktu sesi)
  const sessionRecitations = useMemo(() => {
    if (!activeHalaqah) return [];
    const rosterIds = new Set(sessionRoster.map((s) => s.id));
    return setoranHarian
      .filter(
        (st: any) =>
          st.tanggal === selectedDate &&
          (!st.waktu || st.waktu === selectedSlot) &&
          (st.halaqah_id === activeHalaqah.id || rosterIds.has(st.santri_id))
      )
      .map((st: any) => {
        const matchedV2 = v2RecitationLedger.find(
          (v2) =>
            v2.legacy_setoran_id === st.id ||
            (v2.santri_id === st.santri_id &&
              v2.recitation_date === st.tanggal &&
              Number(v2.calculated_pages) === Number(st.jumlah_halaman))
        );
        return {
          ...st,
          v2_entry: matchedV2 || null,
        };
      });
  }, [setoranHarian, activeHalaqah, selectedDate, selectedSlot, sessionRoster, v2RecitationLedger]);

  const getEffectiveStatus = (santriId: number): string => {
    if (draftAttendance[santriId] !== undefined) return draftAttendance[santriId];
    return existingSessionAttendance[santriId] || '';
  };

  const effectiveMusammiStatus = draftMusammiStatus || existingMusammiAttendance || '';

  const unmarkedCount = useMemo(() => {
    return sessionRoster.filter((s) => !getEffectiveStatus(s.id)).length;
  }, [sessionRoster, draftAttendance, existingSessionAttendance]);

  const markedCount = sessionRoster.length - unmarkedCount;

  const isSessionLocked = v2SessionRecord?.status === 'locked';
  const sessionStatusLabel = useMemo(() => {
    if (v2SessionRecord?.status === 'locked') return 'TERKUNCI (LOCKED)';
    if (v2SessionRecord?.status === 'completed') return 'SELESAI (COMPLETED)';
    if (v2SessionRecord?.status === 'submitted') return 'TERCATAT (SUBMITTED)';
    if (v2SessionRecord?.status === 'open') return 'SESI TERBUKA (OPEN)';
    if (v2SessionRecord?.status === 'scheduled') return 'TERJADWAL (SCHEDULED)';
    if (v2SessionRecord?.status === 'cancelled') return 'DIBATALKAN (CANCELLED)';
    if (Object.keys(existingSessionAttendance).length > 0) {
      return 'TERCATAT (SUBMITTED)';
    }
    return 'BELUM DIBUKA';
  }, [v2SessionRecord, existingSessionAttendance]);

  const startSurahMeta = useMemo(
    () => quranMetadata.find((s) => s.id === recitationForm.surahStartNo) || quranMetadata[0],
    [recitationForm.surahStartNo]
  );
  const endSurahMeta = useMemo(
    () => quranMetadata.find((s) => s.id === recitationForm.surahEndNo) || quranMetadata[0],
    [recitationForm.surahEndNo]
  );

  // Hitung estimasi halaman otomatis dari rentang surat & ayat
  const estimatedPages = useMemo(() => {
    if (!startSurahMeta || !endSurahMeta) return 0;
    const est: any = calculateHalamanSetoran(
      startSurahMeta.id,
      recitationForm.ayahStart,
      endSurahMeta.id,
      recitationForm.ayahEnd
    );
    const numPages = typeof est === 'number' ? est : Number(est?.totalHalaman ?? est?.totalPages ?? 0);
    return Number.isFinite(numPages) && numPages > 0 ? Number(numPages.toFixed(2)) : 0.5;
  }, [
    startSurahMeta,
    recitationForm.ayahStart,
    endSurahMeta,
    recitationForm.ayahEnd,
  ]);

  // Statistik Progres Santri Binaan (Tab 3: /app/my-halaqah)
  const studentProgressMatrix = useMemo(() => {
    const allAssignedSantriMap = new Map<number, { santri: any; halaqahNama: string; halaqahId: number }>();
    assignedHalaqahList.forEach((h) => {
      const members = h.active_santri && h.active_santri.length > 0 ? h.active_santri : h.santri || [];
      members.forEach((st) => {
        if (!allAssignedSantriMap.has(st.id)) {
          allAssignedSantriMap.set(st.id, { santri: st, halaqahNama: h.nama, halaqahId: h.id });
        }
      });
    });

    return Array.from(allAssignedSantriMap.values()).map(({ santri: st, halaqahNama, halaqahId }) => {
      const attRows = (attendance || []).filter(
        (a) => a.peran === Peran.Santri && a.personId === st.id
      );
      const hadirCount = attRows.filter(
        (a) => a.status === 'Hadir' || a.status === 'Terlambat'
      ).length;
      const attRate = attRows.length > 0 ? Math.round((hadirCount / attRows.length) * 100) : 100;

      const recRows = (setoranHarian || [])
        .filter((r: any) => r.santri_id === st.id)
        .sort((a: any, b: any) => (b.tanggal || '').localeCompare(a.tanggal || ''));

      let ziyadahPages = 0;
      let murajaahPages = 0;
      recRows.forEach((r: any) => {
        const pages = Number(r.jumlah_halaman) || 0;
        const kindStr = String(r.jenis_setoran || r.skema || 'Ziyadah').toLowerCase();
        if (kindStr.includes('ziyadah')) ziyadahPages += pages;
        else murajaahPages += pages;
      });

      const latest = recRows[0] || null;
      const latestRange = latest
        ? `${latest.surat_mulai || latest.surat || '-'}:${latest.ayat_mulai || latest.ayat || 1}${
            latest.surat_selesai ? ` – ${latest.surat_selesai}:${latest.ayat_selesai || ''}` : ''
          }`
        : 'Belum ada setoran';

      return {
        id: st.id,
        nama: st.nama,
        kode: st.kode,
        marhalah: st.marhalah,
        kelas: st.kelas,
        halaqahId,
        halaqahNama,
        totalSessions: attRows.length,
        attRate,
        ziyadahPages: Number(ziyadahPages.toFixed(1)),
        murajaahPages: Number(murajaahPages.toFixed(1)),
        totalRecitations: recRows.length,
        latestRange,
        latestDate: latest?.tanggal || '-',
        latestPredicate: latest?.nilai || '-',
      };
    });
  }, [assignedHalaqahList, attendance, setoranHarian]);

  // Riwayat Sesi Lintas Tanggal untuk Musammi/Admin (Tab 4: /app/my-schedule)
  const mySessionHistory = useMemo(() => {
    const assignedIds = new Set(assignedHalaqahList.map((h) => h.id));
    const sessionGroups = new Map<
      string,
      {
        date: string;
        waktu: string;
        halaqahId: number;
        halaqahNama: string;
        musammiNama: string;
        hadirCount: number;
        alpaCount: number;
        totalCount: number;
        recitationCount: number;
      }
    >();

    (attendance || []).forEach((a) => {
      if (!a.halaqahId || !assignedIds.has(a.halaqahId) || a.peran !== Peran.Santri) return;
      const key = `${a.date}|${a.waktu}|${a.halaqahId}`;
      const hObj = assignedHalaqahList.find((h) => h.id === a.halaqahId);
      if (!sessionGroups.has(key)) {
        sessionGroups.set(key, {
          date: a.date,
          waktu: a.waktu,
          halaqahId: a.halaqahId,
          halaqahNama: hObj?.nama || `Halaqah #${a.halaqahId}`,
          musammiNama: hObj?.musammi?.nama || '-',
          hadirCount: 0,
          alpaCount: 0,
          totalCount: 0,
          recitationCount: 0,
        });
      }
      const grp = sessionGroups.get(key)!;
      grp.totalCount += 1;
      if (a.status === 'Hadir' || a.status === 'Terlambat') grp.hadirCount += 1;
      if (a.status === 'Alpa') grp.alpaCount += 1;
    });

    (setoranHarian || []).forEach((r: any) => {
      if (!r.halaqah_id || !assignedIds.has(r.halaqah_id)) return;
      const key = `${r.tanggal}|${r.waktu || 'Shubuh'}|${r.halaqah_id}`;
      const grp = sessionGroups.get(key);
      if (grp) grp.recitationCount += 1;
    });

    return Array.from(sessionGroups.values())
      .sort((a, b) => b.date.localeCompare(a.date) || a.waktu.localeCompare(b.waktu))
      .slice(0, 40);
  }, [attendance, setoranHarian, assignedHalaqahList]);

  const handleOpenAndFreezeSession = async () => {
    if (!activeHalaqah) return;
    try {
      const { error: rpcErr } = await (supabase as any).rpc('rpc_open_halaqah_session', {
        p_halaqah_id: activeHalaqah.id,
        p_session_date: selectedDate,
        p_session_slot: selectedSlot,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      await fetchV2SessionAndLedger();
      NotificationStore.addNotification(
        `Sesi ${activeHalaqah.nama} (${selectedDate} · ${selectedSlot}) dibuka dengan ${sessionRoster.length} santri aktif berstatus awal Belum Diisi.`,
        'success'
      );
    } catch (err: any) {
      NotificationStore.addNotification(err.message || 'Gagal membuka sesi halaqah.', 'error');
    }
  };

  const handleInitiateLockSession = () => {
    if (!activeHalaqah) return;
    if (sessionRoster.length === 0) {
      NotificationStore.addNotification(
        'Sesi tidak dapat dikunci: Tidak ada santri dalam roster halaqah.',
        'error'
      );
      return;
    }
    if (unmarkedCount > 0) {
      NotificationStore.addNotification(
        `Masih ada ${unmarkedCount} dari ${sessionRoster.length} santri berstatus Belum Diisi. Lengkapi dan simpan absensi sebelum mengunci sesi.`,
        'error'
      );
      return;
    }
    setIsLockConfirmModalOpen(true);
  };

  const handleLockSession = async () => {
    if (!activeHalaqah) return;
    if (unmarkedCount > 0) {
      NotificationStore.addNotification(
        `Masih ada ${unmarkedCount} santri berstatus Belum Diisi. Lengkapi dan simpan absensi sebelum mengunci sesi.`,
        'error'
      );
      return;
    }
    setIsLockingSession(true);
    try {
      const lockReason = `Kunci sesi operasional ${activeHalaqah.nama} (${selectedDate} ${selectedSlot})`;
      const { error: rpcErr } = await (supabase as any).rpc('rpc_lock_halaqah_session', {
        p_halaqah_id: activeHalaqah.id,
        p_session_date: selectedDate,
        p_session_slot: selectedSlot,
        p_reason: lockReason,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      await fetchV2SessionAndLedger();
      await fetchData();
      setIsLockConfirmModalOpen(false);
      NotificationStore.addNotification(
        `Sesi ${activeHalaqah.nama} (${selectedDate} · ${selectedSlot}) telah dikunci. Perubahan selanjutnya memerlukan alasan koreksi teraudit.`,
        'success'
      );
    } catch (err: any) {
      NotificationStore.addNotification(
        err?.message || 'Gagal mengunci sesi halaqah. Pastikan sesi sudah dibuka dan absensi telah disimpan.',
        'error'
      );
    } finally {
      setIsLockingSession(false);
    }
  };

  const handleConfirmBulkHadir = () => {
    const next: Record<number, string> = { ...draftAttendance };
    sessionRoster.forEach((s) => {
      if (!existingSessionAttendance[s.id] && !next[s.id]) {
        next[s.id] = 'Hadir';
      }
    });
    if (!effectiveMusammiStatus && activeHalaqah?.musammi?.id) {
      setDraftMusammiStatus('Hadir');
    }
    setDraftAttendance(next);
    setConfirmBulkHadirOpen(false);
    NotificationStore.addNotification(
      'Seluruh peserta yang belum diisi ditandai Hadir (klik Simpan Absensi Sesi untuk menyimpan ke server).',
      'info'
    );
  };

  const executeSaveSessionAttendance = async (correctionReason?: string) => {
    if (!activeHalaqah) return;
    const recordsToSave = sessionRoster
      .map((s) => {
        const st = getEffectiveStatus(s.id);
        if (!st) return null;
        return {
          date: selectedDate,
          waktu: selectedSlot,
          personId: s.id,
          peran: Peran.Santri,
          status: st,
          halaqahId: activeHalaqah.id,
        };
      })
      .filter(Boolean) as any[];

    if (effectiveMusammiStatus && activeHalaqah.musammi?.id) {
      recordsToSave.push({
        date: selectedDate,
        waktu: selectedSlot,
        personId: activeHalaqah.musammi.id,
        peran: Peran.Musammi,
        status: effectiveMusammiStatus,
        halaqahId: activeHalaqah.id,
      });
    }

    if (recordsToSave.length === 0) {
      NotificationStore.addNotification(
        'Pilih status kehadiran minimal untuk 1 peserta sebelum menyimpan.',
        'error'
      );
      return;
    }

    setIsSavingBatch(true);
    try {
      const orgId = await getOrgId();
      const idempotencyKey = `batch_${activeHalaqah.id}_${selectedDate}_${selectedSlot}`;

      // Panggil RPC pembukaan sesi & rpc_save_attendance_batch bila tersedia di DB
      const { data: openedSessionData, error: openErr } = await (supabase as any).rpc(
        'rpc_open_halaqah_session',
        {
          p_halaqah_id: activeHalaqah.id,
          p_session_date: selectedDate,
          p_session_slot: selectedSlot,
        }
      );

      if (openErr) {
        const isMissingOpenRpc =
          openErr.code === '42883' ||
          openErr.code === 'PGRST202' ||
          String(openErr.message || '').includes('Could not find the function');
        if (!isMissingOpenRpc) {
          throw new Error(openErr.message);
        }
      }

      const resolvedSessionUuid =
        typeof openedSessionData === 'string'
          ? openedSessionData
          : openedSessionData?.session_id || v2SessionRecord?.id || null;

      let rpcBatchSaved = false;
      if (resolvedSessionUuid) {
        const { error: batchErr } = await (supabase as any).rpc('rpc_save_attendance_batch', {
          p_session_id: resolvedSessionUuid,
          p_records: recordsToSave
            .filter((r) => r.peran === Peran.Santri)
            .map((r) => ({
              santri_id: r.personId,
              status: r.status.toLowerCase(),
            })),
          p_idempotency_key: idempotencyKey,
          p_reason: correctionReason || null,
        });

        if (batchErr) {
          const isMissingBatchRpc =
            batchErr.code === '42883' ||
            batchErr.code === 'PGRST202' ||
            String(batchErr.message || '').includes('Could not find the function');
          if (!isMissingBatchRpc) {
            throw new Error(batchErr.message);
          }
        } else {
          rpcBatchSaved = true;
          // Simpan Musammi secara spesifik jika ada
          const musammiRecord = recordsToSave.find((r) => r.peran === Peran.Musammi);
          if (musammiRecord) {
            await addAttendanceRecords([musammiRecord]);
          }
        }
      }

      if (!rpcBatchSaved) {
        await addAttendanceRecords(recordsToSave);
      }

      if (correctionReason && orgId) {
        try {
          await (supabase as any).from('audit_logs').insert({
            organization_id: orgId,
            actor_id: userProfile?.id || null,
            actor_role: canonicalRole,
            action: 'post_lock_attendance_correction',
            resource_type: 'attendance',
            resource_id: `${activeHalaqah.id}_${selectedDate}_${selectedSlot}`,
            reason: correctionReason,
          });
        } catch {
          // Fallback aman
        }
      }

      await fetchData();
      await fetchV2SessionAndLedger();
      setDraftAttendance({});
      setDraftMusammiStatus('');
      setIsPostLockModalOpen(false);
      setPostLockReason('');

      NotificationStore.addNotification(
        correctionReason
          ? `Koreksi absensi teraudit sesi ${selectedSlot} berhasil disimpan.`
          : `Absensi sesi ${selectedSlot} (${recordsToSave.length} peserta) berhasil disimpan secara idempoten.`,
        'success'
      );
    } catch (err: any) {
      NotificationStore.addNotification(err.message || 'Gagal menyimpan absensi sesi.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleSaveSessionAttendanceClick = () => {
    if (isSessionLocked) {
      setPostLockReason('');
      setIsPostLockModalOpen(true);
      return;
    }
    executeSaveSessionAttendance();
  };

  const handleSubmitStructuredRecitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHalaqah) return;
    const targetSantriId = recitationForm.santriId || sessionRoster[0]?.id;
    if (!targetSantriId) {
      NotificationStore.addNotification('Pilih santri binaan terlebih dahulu.', 'error');
      return;
    }

    if (
      recitationForm.surahEndNo < recitationForm.surahStartNo ||
      (recitationForm.surahEndNo === recitationForm.surahStartNo &&
        recitationForm.ayahEnd < recitationForm.ayahStart)
    ) {
      NotificationStore.addNotification(
        'Urutan surat/ayat selesai tidak boleh lebih kecil dari surat/ayat mulai.',
        'error'
      );
      return;
    }

    if (recitationForm.ayahStart > startSurahMeta.ayat) {
      NotificationStore.addNotification(
        `Surat ${startSurahMeta.name} hanya memiliki ${startSurahMeta.ayat} ayat (ayat mulai: ${recitationForm.ayahStart}).`,
        'error'
      );
      return;
    }

    if (recitationForm.ayahEnd > endSurahMeta.ayat) {
      NotificationStore.addNotification(
        `Surat ${endSurahMeta.name} hanya memiliki ${endSurahMeta.ayat} ayat (ayat selesai: ${recitationForm.ayahEnd}).`,
        'error'
      );
      return;
    }

    setIsSavingRecitation(true);
    try {
      const idempotencyKey = `session_rec_${activeHalaqah.id}_${targetSantriId}_${selectedDate}_${selectedSlot}_${Date.now()}`;
      
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
        'rpc_submit_recitation_entry',
        {
          p_santri_id: targetSantriId,
          p_halaqah_id: activeHalaqah.id,
          p_recitation_date: selectedDate,
          p_session_slot: selectedSlot,
          p_kind: recitationForm.kind,
          p_surah_start_no: recitationForm.surahStartNo,
          p_ayah_start: recitationForm.ayahStart,
          p_surah_end_no: recitationForm.surahEndNo,
          p_ayah_end: recitationForm.ayahEnd,
          p_calculated_pages: estimatedPages,
          p_minor_mistakes: recitationForm.mistakesMinor,
          p_major_mistakes: recitationForm.mistakesMajor,
          p_predicate: recitationForm.predicate || null,
          p_notes: recitationForm.notes.trim() || null,
          p_status: recitationForm.submissionMode,
          p_idempotency_key: idempotencyKey,
          p_existing_entry_id: null,
          p_session_id: v2SessionRecord?.id || null,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      await fetchV2SessionAndLedger();

      NotificationStore.addNotification(
        `Transaksi setoran ${recitationForm.kind} (${startSurahMeta.name}:${recitationForm.ayahStart} – ${endSurahMeta.name}:${recitationForm.ayahEnd}, ${estimatedPages} hal) berhasil dicatat sebagai ${recitationForm.submissionMode.toUpperCase()}.`,
        'success'
      );
      setRecitationForm((prev) => ({
        ...prev,
        mistakesMinor: 0,
        mistakesMajor: 0,
        notes: '',
      }));
    } catch (err: any) {
      NotificationStore.addNotification(err.message || 'Gagal menyimpan setoran.', 'error');
    } finally {
      setIsSavingRecitation(false);
    }
  };

  const handleOpenRevisionHistory = async (recitationRow: any) => {
    setRevisionHistoryTarget(recitationRow);
    setIsLoadingRevisions(true);
    try {
      const orgId = await getOrgId();
      const v2EntryId = recitationRow.v2_entry?.id;
      if (orgId && v2EntryId) {
        const { data } = await (supabase as any)
          .from('recitation_revisions')
          .select('*')
          .eq('organization_id', orgId)
          .eq('entry_id', v2EntryId)
          .order('created_at', { ascending: false });
        setRevisionHistoryRows(data || []);
      } else if (orgId) {
        const { data } = await (supabase as any)
          .from('audit_logs')
          .select('*')
          .eq('organization_id', orgId)
          .eq('resource_id', String(recitationRow.id))
          .order('created_at', { ascending: false });
        setRevisionHistoryRows(data || []);
      } else {
        setRevisionHistoryRows([]);
      }
    } catch {
      setRevisionHistoryRows([]);
    } finally {
      setIsLoadingRevisions(false);
    }
  };

  const handleAdminReviewRecitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalTarget) return;

    if (
      (reviewDecision === 'returned' || reviewDecision === 'voided') &&
      reviewReason.trim().length < 5
    ) {
      NotificationStore.addNotification(
        'Alasan review wajib diisi minimal 5 karakter untuk pengembalian atau pembatalan setoran.',
        'error'
      );
      return;
    }

    setIsSubmittingReview(true);
    try {
      const v2Id = reviewModalTarget.v2_entry?.id;
      if (v2Id) {
        const { error } = await (supabase as any).rpc('rpc_review_recitation_entry', {
          p_entry_id: v2Id,
          p_new_status: reviewDecision,
          p_reason: reviewReason.trim(),
        });
        if (error) throw new Error(error.message);
      } else if (reviewModalTarget.id) {
        const { error } = await (supabase as any).rpc('rpc_review_recitation_entry', {
          p_legacy_id: reviewModalTarget.id,
          p_new_status: reviewDecision,
          p_reason: reviewReason.trim(),
        });
        if (error) throw new Error(error.message);
      }

      await fetchV2SessionAndLedger();
      setReviewModalTarget(null);
      setReviewReason('');
      NotificationStore.addNotification(
        `Status transaksi setoran berhasil diperbarui menjadi ${reviewDecision.toUpperCase()}.`,
        'success'
      );
    } catch (err: any) {
      NotificationStore.addNotification(err.message || 'Gagal memproses review setoran.', 'error');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Memuat ruang sesi halaqah...</div>;
  }

  return (
    <PageShell>
      <PageHeader
        kicker={
          canonicalRole === 'musammi'
            ? 'RUANG KERJA OPERASIONAL MUSAMMI'
            : 'MANAJEMEN SESI, VALIDASI & MONITORING HALAQAH'
        }
        title="Sesi Halaqah, Absensi & Catatan Setoran"
        description="Buka sesi halaqah untuk memuat daftar santri aktif dengan status awal Belum Diisi, catat setoran Al-Qur'an tervalidasi (1–114), dan pantau progres santri binaan."
        actions={
          activeHalaqah ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAndFreezeSession}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              >
                Buka Sesi Halaqah
              </button>
              {!isSessionLocked && (
                <button
                  type="button"
                  disabled={isLockingSession}
                  onClick={handleInitiateLockSession}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isLockingSession ? 'Mengunci...' : 'Kunci Sesi'}
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      {assignedHalaqahList.length === 0 ? (
        <EmptyState
          title="Tidak Ada Halaqah yang Ditugaskan"
          description={
            canonicalRole === 'musammi'
              ? 'Akun Musammi Anda belum memiliki penugasan (assignment) halaqah aktif pada tahun ajaran ini. Silakan hubungi Admin Lembaga.'
              : 'Belum ada kelompok halaqah yang dibuat pada tahun ajaran aktif ini.'
          }
        />
      ) : (
        <>
          {/* Filter & Session Context Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Kelompok Halaqah ({assignedHalaqahList.length} tersedia)
              </label>
              <select
                value={activeHalaqah?.id || ''}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  setSelectedHalaqahId(nextId);
                  setDraftAttendance({});
                  setDraftMusammiStatus('');
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('halaqahId', String(nextId));
                    return p;
                  });
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-600"
              >
                {assignedHalaqahList.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nama} — {h.musammi?.nama || 'Tanpa Musammi'} ({h.marhalah})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Tanggal Sesi Kalender
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setSelectedDate(nextDate);
                  setDraftAttendance({});
                  setDraftMusammiStatus('');
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('date', nextDate);
                    return p;
                  });
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Slot Waktu Sesi
              </label>
              <select
                value={selectedSlot}
                onChange={(e) => {
                  const nextSlot = e.target.value;
                  setSelectedSlot(nextSlot);
                  setDraftAttendance({});
                  setDraftMusammiStatus('');
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('slot', nextSlot);
                    return p;
                  });
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-600"
              >
                {(globalWaktuHalaqah || ['Shubuh', 'Dhuha', 'Ashar', 'Maghrib', 'Isya']).map(
                  (w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Session KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Daftar Santri Sesi"
              value={sessionRoster.length}
              meta={`Musammi: ${activeHalaqah?.musammi?.nama || '-'}`}
              tone="neutral"
            />
            <StatCard
              label="Progres Absensi Sesi"
              value={`${markedCount} / ${sessionRoster.length}`}
              meta={
                unmarkedCount === 0 && sessionRoster.length > 0
                  ? 'Seluruh peserta telah tercatat'
                  : `${unmarkedCount} santri berstatus Belum Diisi`
              }
              tone={unmarkedCount === 0 && sessionRoster.length > 0 ? 'success' : 'warning'}
            />
            <StatCard
              label="Setoran Tercatat Sesi Ini"
              value={sessionRecitations.length}
              meta="Ziyadah, Sabqi & Manzil pada sesi terpilih"
              tone="primary"
            />
            <StatCard
              label="Status Sesi"
              value={sessionStatusLabel}
              meta={`${selectedDate} · ${selectedSlot}`}
              tone={
                isSessionLocked
                  ? 'primary'
                  : Object.keys(existingSessionAttendance).length > 0
                  ? 'success'
                  : 'neutral'
              }
            />
          </div>

          {/* Sub-Tab Workspace */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              {[
                { id: 'absensi', label: '1. Absensi Sesi' },
                { id: 'setoran', label: '2. Input & Catatan Setoran' },
                { id: 'roster', label: '3. Halaqah Saya & Progres Santri' },
                { id: 'schedule', label: '4. Jadwal Saya & Riwayat Sesi' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkTab(t.id as WorkTabId);
                    setSearchParams((prev) => {
                      const p = new URLSearchParams(prev);
                      p.set('tab', t.id);
                      return p;
                    });
                  }}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeWorkTab === t.id
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeWorkTab === 'absensi' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBulkHadirOpen(true)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap"
                >
                  Tandai Semua Hadir
                </button>
                <button
                  type="button"
                  disabled={isSavingBatch}
                  onClick={handleSaveSessionAttendanceClick}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {isSavingBatch
                    ? 'Menyimpan Batch...'
                    : isSessionLocked
                    ? 'Simpan Koreksi Teraudit'
                    : 'Simpan Absensi Sesi'}
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: ABSENSI SESI (DEFAULT "BELUM DIISI") */}
          {activeWorkTab === 'absensi' && (
            <div className="space-y-4">
              {isSessionLocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
                  <div>
                    <span className="font-bold">Sesi Terkunci (Locked):</span> Setiap perubahan
                    kehadiran pada sesi ini akan meminta alasan koreksi dan dicatat otomatis ke dalam
                    Audit Log.
                  </div>
                  <StatusBadge label="WAJIB ALASAN KOREKSI" tone="warning" />
                </div>
              )}

              {/* Baris Kehadiran Musammi Pengampu */}
              {activeHalaqah?.musammi && activeHalaqah.musammi.id > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kehadiran Musammi Pengampu Sesi
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {activeHalaqah.musammi.nama}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {effectiveMusammiStatus ? (
                      <StatusBadge
                        label={`MUSAMMI: ${effectiveMusammiStatus.toUpperCase()}`}
                        tone={effectiveMusammiStatus === 'Hadir' ? 'success' : 'warning'}
                      />
                    ) : (
                      <StatusBadge label="MUSAMMI: BELUM DIISI" tone="neutral" />
                    )}
                    <div className="inline-flex flex-wrap gap-1">
                      {(globalAttendanceStatus && globalAttendanceStatus.length > 0
                        ? globalAttendanceStatus
                        : ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa']
                      ).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setDraftMusammiStatus(st)}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                            effectiveMusammiStatus === st
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-6 py-3 w-12">No</th>
                        <th className="px-6 py-3">Nama Santri & Kode</th>
                        <th className="px-6 py-3">Marhalah / Kelas</th>
                        <th className="px-6 py-3">Status Saat Ini</th>
                        <th className="px-6 py-3 text-right">Pilih Status Kehadiran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sessionRoster.map((s, idx) => {
                        const currentStatus = getEffectiveStatus(s.id);
                        const statuses =
                          globalAttendanceStatus && globalAttendanceStatus.length > 0
                            ? globalAttendanceStatus
                            : ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa'];
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-6 py-3 font-mono text-xs text-slate-500 tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="px-6 py-3">
                              <div className="font-semibold text-slate-900">{s.nama}</div>
                              <div className="text-xs font-mono text-slate-500">
                                {s.kode || `ID-${s.id}`}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-xs text-slate-600">
                              {s.marhalah} · {s.kelas}
                            </td>
                            <td className="px-6 py-3">
                              {currentStatus ? (
                                <StatusBadge
                                  label={currentStatus.toUpperCase()}
                                  tone={
                                    currentStatus === 'Hadir'
                                      ? 'success'
                                      : currentStatus === 'Alpa'
                                      ? 'danger'
                                      : 'warning'
                                  }
                                />
                              ) : (
                                <StatusBadge label="BELUM DIISI" tone="neutral" />
                              )}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="inline-flex flex-wrap justify-end gap-1">
                                {statuses.map((st) => {
                                  const selected = currentStatus === st;
                                  return (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() =>
                                        setDraftAttendance((prev) => ({ ...prev, [s.id]: st }))
                                      }
                                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                                        selected
                                          ? 'bg-slate-900 text-white border-slate-900'
                                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                      }`}
                                    >
                                      {st}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INPUT SETORAN AL-QUR'AN TERSTRUKTUR & REVIEW ADMIN */}
          {activeWorkTab === 'setoran' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-base font-bold text-slate-900">
                  Catat Transaksi Setoran Al-Qur'an
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 mb-4">
                  Referensi surat dan ayat divalidasi terstruktur (1–114), otomatis melanjutkan dari
                  setoran terakhir santri, dan mencatat riwayat revisi.
                </p>

                <form onSubmit={handleSubmitStructuredRecitation} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Santri Binaan <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={recitationForm.santriId || sessionRoster[0]?.id || ''}
                      onChange={(e) =>
                        setRecitationForm({
                          ...recitationForm,
                          santriId: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600"
                    >
                      {sessionRoster.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama} ({s.kelas})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jenis Kegiatan (Semantic Kind)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'Ziyadah', desc: 'Sabaq / Baru' },
                        { id: 'Sabqi', desc: 'Murajaah Dekat' },
                        { id: 'Manzil', desc: 'Murajaah Lama' },
                      ].map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() =>
                            setRecitationForm({ ...recitationForm, kind: k.id as any })
                          }
                          className={`p-2 rounded-lg border text-left transition-colors ${
                            recitationForm.kind === k.id
                              ? 'border-blue-600 bg-blue-50/70 text-blue-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold">{k.id}</div>
                          <div className="text-[11px] text-slate-500">{k.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Surat Mulai (Maks {startSurahMeta.ayat} Ayat)
                      </label>
                      <select
                        value={recitationForm.surahStartNo}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const meta = quranMetadata.find((sr) => sr.id === val);
                          setRecitationForm((prev) => ({
                            ...prev,
                            surahStartNo: val,
                            ayahStart: Math.min(prev.ayahStart, meta?.ayat || 286),
                            surahEndNo: Math.max(val, prev.surahEndNo),
                          }));
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:border-blue-600"
                      >
                        {quranMetadata.map((sr) => (
                          <option key={sr.id} value={sr.id}>
                            {sr.id}. {sr.name} ({sr.ayat} ayat)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ayat Mulai (1–{startSurahMeta.ayat})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={startSurahMeta.ayat}
                        value={recitationForm.ayahStart}
                        onChange={(e) =>
                          setRecitationForm({
                            ...recitationForm,
                            ayahStart: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Surat Selesai (Maks {endSurahMeta.ayat} Ayat)
                      </label>
                      <select
                        value={recitationForm.surahEndNo}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const meta = quranMetadata.find((sr) => sr.id === val);
                          setRecitationForm((prev) => ({
                            ...prev,
                            surahEndNo: val,
                            ayahEnd: Math.min(prev.ayahEnd, meta?.ayat || 286),
                          }));
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:border-blue-600"
                      >
                        {quranMetadata.map((sr) => (
                          <option key={sr.id} value={sr.id}>
                            {sr.id}. {sr.name} ({sr.ayat} ayat)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ayat Selesai (1–{endSurahMeta.ayat})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={endSurahMeta.ayat}
                        value={recitationForm.ayahEnd}
                        onChange={(e) =>
                          setRecitationForm({
                            ...recitationForm,
                            ayahEnd: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Salah Kecil
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={recitationForm.mistakesMinor}
                        onChange={(e) =>
                          setRecitationForm({
                            ...recitationForm,
                            mistakesMinor: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Salah Besar
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={recitationForm.mistakesMajor}
                        onChange={(e) =>
                          setRecitationForm({
                            ...recitationForm,
                            mistakesMajor: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Predikat Rubrik
                      </label>
                      <select
                        value={recitationForm.predicate}
                        onChange={(e) =>
                          setRecitationForm({ ...recitationForm, predicate: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-2 py-2 text-xs bg-white"
                      >
                        <option value="Mumtaz">Mumtaz</option>
                        <option value="Jayyid Jiddan">Jayyid Jiddan</option>
                        <option value="Jayyid">Jayyid</option>
                        <option value="Maqbul">Maqbul</option>
                        <option value="Dhaif">Dhaif / Ulang</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">
                      Kalkulasi Otomatis Mushaf Standar (604 Hal):
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {estimatedPages} Halaman
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Status Pengiriman Setoran
                      </label>
                      <select
                        value={recitationForm.submissionMode}
                        onChange={(e) =>
                          setRecitationForm({
                            ...recitationForm,
                            submissionMode: e.target.value as 'draft' | 'submitted',
                          })
                        }
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white"
                      >
                        <option value="submitted">Submitted (Ajukan Setoran)</option>
                        <option value="draft">Draft (Simpan Sementara)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Catatan Pembinaan Tajwid
                      </label>
                      <input
                        type="text"
                        value={recitationForm.notes}
                        onChange={(e) =>
                          setRecitationForm({ ...recitationForm, notes: e.target.value })
                        }
                        placeholder="Catatan makhraj / mad..."
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingRecitation}
                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {isSavingRecitation
                      ? 'Menyimpan Setoran...'
                      : recitationForm.submissionMode === 'draft'
                      ? 'Simpan sebagai Draft'
                      : 'Simpan & Ajukan Setoran'}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Catatan Setoran Sesi Ini ({selectedDate} · {selectedSlot})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Status setoran: Draft → Submitted → Disetujui / Dikembalikan / Dibatalkan beserta riwayat revisi.
                    </p>
                  </div>
                  <StatusBadge
                    label={`${sessionRecitations.length} SETORAN`}
                    tone="neutral"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Santri</th>
                        <th className="px-5 py-3">Jenis</th>
                        <th className="px-5 py-3">Rentang Bacaan</th>
                        <th className="px-5 py-3 text-right">Halaman</th>
                        <th className="px-5 py-3">Status Setoran</th>
                        <th className="px-5 py-3 text-right">Tindakan & Histori</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sessionRecitations.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-8 text-center text-xs text-slate-500"
                          >
                            Belum ada transaksi setoran pada tanggal ini.
                          </td>
                        </tr>
                      ) : (
                        sessionRecitations.map((r: any) => {
                          const stObj = sessionRoster.find((s) => s.id === r.santri_id);
                          const ledgerStatus = (r.v2_entry?.status || 'submitted').toLowerCase();
                          const statusTone =
                            ledgerStatus === 'accepted'
                              ? 'success'
                              : ledgerStatus === 'voided'
                              ? 'danger'
                              : ledgerStatus === 'returned'
                              ? 'warning'
                              : ledgerStatus === 'draft'
                              ? 'neutral'
                              : 'primary';
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/70">
                              <td className="px-5 py-3 font-semibold text-slate-900">
                                <div>{stObj?.nama || `Santri #${r.santri_id}`}</div>
                                <div className="text-[11px] font-normal text-slate-500">
                                  Predikat: {r.nilai || '-'}
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <StatusBadge
                                  label={r.jenis_setoran || r.skema || 'Ziyadah'}
                                  tone="primary"
                                />
                              </td>
                              <td className="px-5 py-3 text-xs text-slate-700">
                                <div className="font-medium">
                                  {r.surat ||
                                    `${r.surah_mulai || r.surat_mulai} - ${
                                      r.surah_akhir || r.surat_selesai
                                    }`}{' '}
                                  ({r.ayat || `${r.ayat_mulai}-${r.ayat_akhir || r.ayat_selesai}`})
                                </div>
                                {(r.catatan || r.keterangan) && (
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Catatan: {r.catatan || r.keterangan}
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                                {r.jumlah_halaman || 0} hal
                              </td>
                              <td className="px-5 py-3">
                                <StatusBadge label={ledgerStatus.toUpperCase()} tone={statusTone} />
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRevisionHistory(r)}
                                    className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600"
                                  >
                                    Histori Revisi
                                  </button>
                                  {(canonicalRole === 'admin' || canonicalRole === 'superadmin') && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReviewModalTarget(r);
                                        setReviewDecision('accepted');
                                        setReviewReason('');
                                      }}
                                      className="px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-700"
                                    >
                                      Validasi Setoran
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HALAQAH SAYA & PROGRES SANTRI BINAAN (/app/my-halaqah) */}
          {activeWorkTab === 'roster' && (
            <div className="space-y-6">
              {/* Kartu Daftar Halaqah Binaan */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignedHalaqahList.map((h) => {
                  const members =
                    h.active_santri && h.active_santri.length > 0
                      ? h.active_santri
                      : h.santri || [];
                  const isSelected = activeHalaqah?.id === h.id;
                  return (
                    <div
                      key={h.id}
                      className={`rounded-xl border p-4 bg-white transition-colors ${
                        isSelected ? 'border-blue-600 ring-1 ring-blue-600/20' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{h.nama}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Musammi: {h.musammi?.nama || '-'} · {h.marhalah}
                          </div>
                        </div>
                        <StatusBadge label={`${members.length} SANTRI`} tone="primary" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(h.waktu || []).map((w) => (
                          <StatusBadge key={w} label={w.toUpperCase()} tone="neutral" />
                        ))}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">{h.jenis}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHalaqahId(h.id);
                            setActiveWorkTab('absensi');
                          }}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Buka Sesi Halaqah →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabel Progres Santri Binaan */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Progres & Capaian Santri Binaan ({studentProgressMatrix.length} Santri)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Rekapitulasi rasio kehadiran sesi, akumulasi halaman Ziyadah & Sabqi/Manzil, serta
                      setoran terakhir.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Nama Santri</th>
                        <th className="px-5 py-3">Halaqah & Kelas</th>
                        <th className="px-5 py-3 text-right">Rasio Hadir</th>
                        <th className="px-5 py-3 text-right">Total Ziyadah</th>
                        <th className="px-5 py-3 text-right">Total Sabqi/Manzil</th>
                        <th className="px-5 py-3">Setoran Terakhir</th>
                        <th className="px-5 py-3 text-right">Aksi Cepat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {studentProgressMatrix.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3">
                            <div className="font-semibold text-slate-900">{row.nama}</div>
                            <div className="text-xs font-mono text-slate-500">
                              {row.kode || `ID-${row.id}`}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-600">
                            <div className="font-semibold text-slate-800">{row.halaqahNama}</div>
                            <div>
                              {row.marhalah} · Kelas {row.kelas}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs tabular-nums">
                            <StatusBadge
                              label={`${row.attRate}% (${row.totalSessions} sesi)`}
                              tone={
                                row.attRate >= 85
                                  ? 'success'
                                  : row.attRate >= 70
                                  ? 'warning'
                                  : 'danger'
                              }
                            />
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                            {row.ziyadahPages} hal
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-slate-700 tabular-nums">
                            {row.murajaahPages} hal
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-700">
                            <div className="font-semibold text-slate-900">{row.latestRange}</div>
                            <div className="text-[11px] text-slate-500">
                              {row.latestDate} · Predikat: {row.latestPredicate}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedHalaqahId(row.halaqahId);
                                  setRecitationForm((prev) => ({ ...prev, santriId: row.id }));
                                  setActiveWorkTab('setoran');
                                }}
                                className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                              >
                                + Setoran
                              </button>
                              {canonicalRole !== 'musammi' && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/app/students/${row.id}`)}
                                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                                >
                                  Linimasa
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: JADWAL SAYA & RIWAYAT SESI SAYA (/app/my-schedule) */}
          {activeWorkTab === 'schedule' && (
            <div className="space-y-6">
              {/* Matriks Jadwal Harian per Slot Waktu */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Jadwal Sesi Halaqah Saya ({selectedDate})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Klik pada slot sesi untuk langsung membuka absensi atau pencatatan setoran.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {(globalWaktuHalaqah || ['Shubuh', 'Dhuha', 'Ashar', 'Maghrib', 'Isya']).map(
                    (slot) => {
                      const slotHalaqahs = assignedHalaqahList.filter((h) =>
                        (h.waktu || []).includes(slot as any)
                      );
                      return (
                        <div
                          key={slot}
                          className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 flex flex-col justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                {slot}
                              </span>
                              <StatusBadge
                                label={`${slotHalaqahs.length} HALAQAH`}
                                tone={slotHalaqahs.length > 0 ? 'primary' : 'neutral'}
                              />
                            </div>
                            <div className="space-y-2">
                              {slotHalaqahs.length === 0 ? (
                                <p className="text-xs text-slate-400 py-2">
                                  Tidak ada jadwal pada slot ini.
                                </p>
                              ) : (
                                slotHalaqahs.map((sh) => {
                                  const recordedCount = (attendance || []).filter(
                                    (a) =>
                                      a.date === selectedDate &&
                                      a.waktu === slot &&
                                      a.halaqahId === sh.id &&
                                      a.peran === Peran.Santri
                                  ).length;
                                  return (
                                    <div
                                      key={sh.id}
                                      className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2"
                                    >
                                      <div className="text-xs font-bold text-slate-900">
                                        {sh.nama}
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <StatusBadge
                                          label={
                                            recordedCount > 0
                                              ? `TERCATAT (${recordedCount})`
                                              : 'BELUM DIISI'
                                          }
                                          tone={recordedCount > 0 ? 'success' : 'warning'}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedHalaqahId(sh.id);
                                            setSelectedSlot(slot);
                                            setActiveWorkTab('absensi');
                                          }}
                                          className="text-[11px] font-semibold text-blue-600 hover:underline"
                                        >
                                          Masuk Sesi →
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Tabel Riwayat Sesi & Setoran Saya */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    Riwayat Pelaksanaan Sesi & Setoran Saya
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menampilkan rekam jejak pelaksanaan sesi halaqah lintas tanggal beserta jumlah
                    kehadiran dan transaksi setoran.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Tanggal</th>
                        <th className="px-5 py-3">Slot Waktu</th>
                        <th className="px-5 py-3">Kelompok Halaqah</th>
                        <th className="px-5 py-3 text-right">Kehadiran Santri</th>
                        <th className="px-5 py-3 text-right">Transaksi Setoran</th>
                        <th className="px-5 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {mySessionHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-500">
                            Belum ada riwayat pelaksanaan sesi yang tercatat.
                          </td>
                        </tr>
                      ) : (
                        mySessionHistory.map((item) => (
                          <tr
                            key={`${item.date}_${item.waktu}_${item.halaqahId}`}
                            className="hover:bg-slate-50/70"
                          >
                            <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {item.date}
                            </td>
                            <td className="px-5 py-3">
                              <StatusBadge label={item.waktu.toUpperCase()} tone="neutral" />
                            </td>
                            <td className="px-5 py-3">
                              <div className="font-semibold text-slate-900">{item.halaqahNama}</div>
                              <div className="text-xs text-slate-500">
                                Musammi: {item.musammiNama}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-xs tabular-nums">
                              <span className="font-semibold text-emerald-700">
                                {item.hadirCount} Hadir
                              </span>{' '}
                              / {item.totalCount} Santri
                              {item.alpaCount > 0 && (
                                <span className="ml-1 text-red-600">({item.alpaCount} Alpa)</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-blue-700 tabular-nums">
                              {item.recitationCount} setoran
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDate(item.date);
                                  setSelectedSlot(item.waktu);
                                  setSelectedHalaqahId(item.halaqahId);
                                  setActiveWorkTab('absensi');
                                }}
                                className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                              >
                                Buka Detail Sesi
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL KONFIRMASI EKSPLISIT AKSI MASSAL HADIR */}
      <Modal
        isOpen={isConfirmBulkHadirOpen}
        onClose={() => setConfirmBulkHadirOpen(false)}
        title="Konfirmasi Pengisian Massal Hadir"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            Apakah Anda yakin seluruh <span className="font-bold">{unmarkedCount} santri</span> yang
            masih berstatus <span className="font-semibold">Belum Diisi</span> pada sesi{' '}
            <span className="font-semibold">
              {selectedDate} ({selectedSlot})
            </span>{' '}
            benar-benar hadir di tempat halaqah?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmBulkHadirOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmBulkHadir}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              Ya, Tandai Hadir
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL KONFIRMASI PENGUNCIAN SESI HALAQAH */}
      <Modal
        isOpen={isLockConfirmModalOpen}
        onClose={() => setIsLockConfirmModalOpen(false)}
        title="Konfirmasi Penguncian Sesi Halaqah"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold block mb-1">Perhatian Penting:</span>
            Setelah sesi dikunci, status kehadiran pada sesi ini tidak dapat diedit secara bebas. Setiap koreksi lanjutan di masa depan wajib menyertakan alasan tertulis (minimal 5 karakter) yang akan dicatat permanen dalam audit trail lembaga.
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Halaqah:</span>
              <span className="font-semibold text-slate-800">{activeHalaqah?.nama}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tanggal & Slot:</span>
              <span className="font-mono font-semibold text-slate-800">{selectedDate} · {selectedSlot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total Santri Roster:</span>
              <span className="font-semibold text-emerald-700">{sessionRoster.length} Santri (Semua Terisi)</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsLockConfirmModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isLockingSession}
              onClick={handleLockSession}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isLockingSession ? 'Mengunci...' : 'Ya, Kunci Sesi Ini'}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL KOREKSI PASCA-KUNCI WAJIB ALASAN (POST-LOCK ATTENDANCE CORRECTION) */}
      <Modal
        isOpen={isPostLockModalOpen}
        onClose={() => setIsPostLockModalOpen(false)}
        title="Koreksi Absensi Pasca-Kunci (Wajib Alasan Audit)"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = postLockReason.trim();
            if (trimmed.length < 5) {
              NotificationStore.addNotification(
                'Alasan koreksi pasca-kunci wajib diisi minimal 5 karakter untuk audit trail.',
                'error'
              );
              return;
            }
            executeSaveSessionAttendance(trimmed);
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-600 leading-relaxed">
            Sesi <span className="font-bold">{activeHalaqah?.nama}</span> pada{' '}
            <span className="font-mono font-semibold">
              {selectedDate} ({selectedSlot})
            </span>{' '}
            telah dikunci. Sesuai standar auditabilitas, masukkan alasan koreksi kehadiran di bawah
            ini.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alasan Koreksi Kehadiran <span className="text-red-600">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={postLockReason}
              onChange={(e) => setPostLockReason(e.target.value)}
              placeholder="Contoh: Surat keterangan sakit dari klinik asrama baru diterima..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsPostLockModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingBatch || !postLockReason.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSavingBatch ? 'Menyimpan...' : 'Simpan Koreksi Teraudit'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL RIWAYAT REVISI SETORAN (RECITATION_REVISIONS) */}
      <Modal
        isOpen={Boolean(revisionHistoryTarget)}
        onClose={() => setRevisionHistoryTarget(null)}
        title="Riwayat Revisi & Validasi Setoran (Append-Only Ledger)"
      >
        <div className="space-y-4">
          {revisionHistoryTarget && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">
                {revisionHistoryTarget.jenis_setoran || revisionHistoryTarget.skema || 'Ziyadah'} —{' '}
                {revisionHistoryTarget.surat || revisionHistoryTarget.surat_mulai} (
                {revisionHistoryTarget.ayat || revisionHistoryTarget.ayat_mulai})
              </div>
              <div className="text-slate-500">
                Tanggal: {revisionHistoryTarget.tanggal} · Halaman:{' '}
                {revisionHistoryTarget.jumlah_halaman || 0} hal · Status Saat Ini:{' '}
                <span className="font-bold uppercase">
                  {revisionHistoryTarget.v2_entry?.status || 'submitted'}
                </span>
              </div>
            </div>
          )}

          {isLoadingRevisions ? (
            <p className="text-xs text-slate-500 py-4 text-center">Memuat jejak revisi...</p>
          ) : revisionHistoryRows.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Belum ada revisi atau perubahan status pada transaksi setoran ini (status awal tercatat).
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {revisionHistoryRows.map((rev: any, idx: number) => (
                <div
                  key={rev.id || idx}
                  className="p-3 rounded-lg border border-slate-200 bg-white text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      {rev.previous_status
                        ? `${String(rev.previous_status).toUpperCase()} → ${String(
                            rev.new_status
                          ).toUpperCase()}`
                        : rev.action || 'Revisi Tercatat'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {rev.created_at ? new Date(rev.created_at).toLocaleString('id-ID') : '-'}
                    </span>
                  </div>
                  <p className="text-slate-600">Alasan: {rev.reason || '-'}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setRevisionHistoryTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL VALIDASI SETORAN OLEH ADMIN (WAJIB ALASAN) */}
      <Modal
        isOpen={Boolean(reviewModalTarget)}
        onClose={() => setReviewModalTarget(null)}
        title="Validasi Setoran (Admin)"
      >
        <form onSubmit={handleAdminReviewRecitation} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Keputusan Validasi Setoran
            </label>
            <select
              value={reviewDecision}
              onChange={(e) => setReviewDecision(e.target.value as any)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="accepted">Accepted (Setujui & Kunci ke Buku Nilai)</option>
              <option value="returned">Returned (Kembalikan ke Musammi untuk Perbaikan)</option>
              <option value="voided">Voided (Batalkan Transaksi Tanpa Hapus Fisik)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alasan Review / Koreksi (Tercatat di Audit & Recitation Revisions){' '}
              <span className="text-red-600">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder="Tuliskan alasan persetujuan, pengembalian, atau pembatalan setoran..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setReviewModalTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingReview || !reviewReason.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmittingReview ? 'Menyimpan Review...' : 'Simpan Keputusan Review'}
            </button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
};

export default SesiHalaqahPage;
