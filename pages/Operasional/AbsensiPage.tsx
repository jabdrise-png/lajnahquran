/**
 * Fase 3 · satu layar Absensi.
 *  - Admin (termasuk petugas keliling di tablet): semua halaqah yang terjadwal pada waktu terpilih.
 *  - Musammi': hanya halaqah yang ia pegang (termasuk saat menjadi badal).
 * Waktu yang bisa dipilih mengikuti jadwal halaqah (BUG-11). Sesi tercatat saat absensi pertama disimpan.
 * Fase 8c: tata letak sama dengan Sesi Halaqah (KPI -> filter penuh -> kartu dengan dropdown status).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState, StatCard } from '../../components/ui/SaaSPrimitives';
import AbsensiHalaqahCard from '../../components/absensi/AbsensiHalaqahCard';
import { hariIni, halaqahSaya, halaqahPadaWaktu, opsiWaktu, statusHadir } from '../../lib/sesiHalaqah';
import FilterSesi, { saringHalaqah, unik } from '../../components/absensi/FilterSesi';
import { findStatus } from '../../lib/v2Adapter';

interface Bentrok { jenis: string; nama: string; waktu: string; halaqah_nama: string[] }

const AbsensiPage: React.FC = () => {
  const {
    halaqah, attendance, attendanceStatuses, sessionSlots, musammi, allSantri, userProfile, loading,
    addAttendanceRecords, getOrgId,
  } = useSupabaseData();
  const { pastikanTanggal } = useSupabaseData();
  const [params, setParams] = useSearchParams();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const today = hariIni();

  const [date, setDate] = useState(params.get('date') || today);
  useEffect(() => { pastikanTanggal(date); }, [date, pastikanTanggal]); // Fase 7
  const [search, setSearch] = useState('');
  const [marhalah, setMarhalah] = useState('');
  const [jenis, setJenis] = useState('');
  const [halaqahId, setHalaqahId] = useState<number | null>(null);
  const [sinyalTandai, setSinyalTandai] = useState(0);
  const [bentrok, setBentrok] = useState<Bentrok[]>([]);

  const myMusammiIds = useMemo(
    () => musammi.filter((m) => userProfile?.id && m.user_id === userProfile.id).map((m) => Number(m.id)),
    [musammi, userProfile?.id]
  );
  const badalHalaqahIds = useMemo(
    () => attendance.filter((a) => a.date === date && a.isBadal && myMusammiIds.includes(Number(a.badalMusammiId)))
      .map((a) => Number(a.halaqahId)),
    [attendance, date, myMusammiIds]
  );
  const mine = useMemo(
    () => halaqahSaya(halaqah, { role, userId: userProfile?.id, myMusammiIds, badalHalaqahIds }),
    [halaqah, role, userProfile?.id, myMusammiIds, badalHalaqahIds]
  );
  const waktuList = useMemo(() => opsiWaktu(mine, sessionSlots), [mine, sessionSlots]);
  const [slot, setSlot] = useState(params.get('slot') || '');
  useEffect(() => {
    if (!slot || !waktuList.includes(slot)) setSlot(waktuList[0] || '');
  }, [waktuList, slot]);

  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set('date', date);
    if (slot) p.set('slot', slot);
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, slot]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const orgId = await getOrgId();
      if (!orgId) return;
      const { data } = await (supabase as any).rpc('rpc_jadwal_bentrok', { p_org: orgId });
      setBentrok(Array.isArray(data) ? data : []);
    })();
  }, [isAdmin, halaqah, getOrgId]);

  const visible = useMemo(() => {
    return saringHalaqah(halaqahPadaWaktu(mine, slot), { marhalah, jenis, cari: search })
      .filter((h) => !halaqahId || h.id === halaqahId)
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama));
  }, [mine, slot, search, marhalah, jenis, halaqahId]);
  const halaqahOpsi = useMemo(
    () => saringHalaqah(halaqahPadaWaktu(mine, slot), { marhalah, jenis })
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama)),
    [mine, slot, marhalah, jenis]
  );
  useEffect(() => { if (halaqahId && !halaqahOpsi.some((h) => h.id === halaqahId)) setHalaqahId(null); }, [halaqahOpsi, halaqahId]);
  // nama santri yang dicari: baris santri di kartu ikut tersaring, kecuali yang dicari nama halaqah/musammi'
  const cariSantri = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return '';
    return visible.some((h) => (h.santri || []).some((s) => (s.nama || '').toLowerCase().includes(q))) ? search : '';
  }, [visible, search]);

  const ringkasan = useMemo(() => {
    const rec = attendance.filter((a) => a.date === date && a.waktu === slot && a.peran === 'Santri' && visible.some((h) => h.id === a.halaqahId));
    const total = visible.reduce((n, h) => n + (h.santri?.length || 0), 0);
    const hadir = rec.filter((a) => findStatus(attendanceStatuses, a.status as string)?.counts_as_present).length;
    return { terisi: rec.length, total, hadir };
  }, [attendance, date, slot, visible, attendanceStatuses]);

  if (loading) return <LoadingState label="Memuat absensi…" />;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Absensi"
        description={isAdmin
          ? 'Semua halaqah pada waktu terpilih. Status yang diisi Musammi\' juga terlihat di sini dan sebaliknya.'
          : 'Absensi halaqah yang Anda pegang.'}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Halaqah" value={visible.length} />
        <StatCard label="Terisi" value={`${ringkasan.terisi}/${ringkasan.total}`} tone={ringkasan.total && ringkasan.terisi >= ringkasan.total ? 'success' : 'neutral'} />
        <StatCard label="Hadir" value={`${ringkasan.hadir}/${ringkasan.terisi}`} tone={ringkasan.terisi ? 'success' : 'neutral'} />
      </div>

      <FilterSesi
        cari={search} setCari={setSearch}
        cariPlaceholder="Cari santri / halaqah / musammi'…"
        marhalahOpsi={unik(mine.map((h) => h.marhalah as string))} marhalah={marhalah} setMarhalah={setMarhalah}
        jenisOpsi={unik(mine.map((h) => h.jenis as string))} jenis={jenis} setJenis={setJenis}
        halaqahOpsi={halaqahOpsi} halaqahId={halaqahId} setHalaqahId={setHalaqahId} semuaHalaqah
        date={date} setDate={setDate} today={today}
        slot={slot} setSlot={setSlot}
        slotOpsi={waktuList.map((w) => ({ value: w, label: sessionSlots.find((s) => s.code === w)?.name || w }))}
        onTandai={visible.length ? () => setSinyalTandai((n) => n + 1) : undefined}
        labelTandai={`Tandai semua ${statusHadir(attendanceStatuses)?.name?.toLowerCase() || 'hadir'}`}
      />

      {isAdmin && bentrok.length > 0 && (
        <details className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <summary className="cursor-pointer font-semibold flex items-center gap-2">
            <AlertTriangle size={16} /> {bentrok.length} jadwal bentrok (orang yang sama di dua halaqah pada waktu yang sama)
          </summary>
          <ul className="mt-2 space-y-1 text-sm sm:text-xs">
            {bentrok.map((b, i) => (
              <li key={i}>
                {b.jenis === 'musammi' ? "Musammi'" : 'Santri'} <b>{b.nama}</b> — {b.waktu}: {b.halaqah_nama.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Tidak ada halaqah pada waktu ini"
          description={isAdmin ? 'Atur waktu halaqah di Data Master > Halaqah.' : 'Anda belum ditugaskan di halaqah yang terjadwal pada waktu ini.'}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visible.map((h) => (
            <AbsensiHalaqahCard
              key={`${h.id}-${date}-${slot}`}
              halaqah={h}
              date={date}
              slot={slot}
              today={today}
              isAdmin={isAdmin}
              statuses={attendanceStatuses}
              attendance={attendance}
              allSantri={allSantri}
              musammiList={musammi}
              onSave={(records, reason) => addAttendanceRecords(records as any, reason)}
              defaultOpen={visible.length <= 6 || Boolean(cariSantri)}
              sinyalTandai={sinyalTandai}
              cari={cariSantri}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AbsensiPage;
