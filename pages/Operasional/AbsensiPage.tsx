/**
 * Fase 3 · satu layar Absensi.
 *  - Admin (termasuk petugas keliling di tablet): semua halaqah yang terjadwal pada waktu terpilih.
 *  - Musammi': hanya halaqah yang ia pegang (termasuk saat menjadi badal).
 * Waktu yang bisa dipilih mengikuti jadwal halaqah (BUG-11). Sesi tercatat saat absensi pertama disimpan.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import AbsensiHalaqahCard from '../../components/absensi/AbsensiHalaqahCard';
import { hariIni, halaqahSaya, halaqahPadaWaktu, opsiWaktu } from '../../lib/sesiHalaqah';

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
  const [bentrok, setBentrok] = useState<Bentrok[]>([]);

  const myMusammiIds = useMemo(
    () => musammi.filter((m: any) => userProfile?.id && m.user_id === userProfile.id).map((m) => Number(m.id)),
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
    const q = search.trim().toLowerCase();
    return halaqahPadaWaktu(mine, slot)
      .filter((h) => !q || h.nama.toLowerCase().includes(q) || (h.musammi?.nama || '').toLowerCase().includes(q))
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama));
  }, [mine, slot, search]);

  const ringkasan = useMemo(() => {
    const rec = attendance.filter((a) => a.date === date && a.waktu === slot && a.peran === 'Santri' && visible.some((h) => h.id === a.halaqahId));
    const total = visible.reduce((n, h) => n + (h.santri?.length || 0), 0);
    return { terisi: rec.length, total };
  }, [attendance, date, slot, visible]);

  if (loading) return <LoadingState label="Memuat absensi…" />;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Absensi"
        description={isAdmin
          ? 'Semua halaqah pada waktu terpilih. Status yang diisi Musammi\' juga terlihat di sini dan sebaliknya.'
          : 'Absensi halaqah yang Anda pegang.'}
      />

      <div className="panel-filter flex flex-col lg:flex-row lg:items-center gap-3">
        <label className="kontrol-label lg:w-56"><span>Tanggal</span><input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className="kontrol-dalam" /></label>
        <div className="flex flex-wrap gap-1.5">
          {waktuList.length === 0 && <span className="text-sm text-slate-500 py-2">Belum ada jadwal halaqah.</span>}
          {waktuList.map((w) => (
            <button key={w} type="button" onClick={() => setSlot(w)}
              className={`h-11 px-4 rounded-xl border text-sm font-semibold transition-colors ${slot === w ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {sessionSlots.find((s) => s.code === w)?.name || w}
            </button>
          ))}
        </div>
        {(isAdmin || visible.length > 3) && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari halaqah / musammi'…" className="kontrol kontrol-cari lg:flex-1" />
        )}
        <div className="text-sm sm:text-xs text-slate-600 ml-auto">
          {visible.length} halaqah · {ringkasan.terisi}/{ringkasan.total} santri terisi
        </div>
      </div>

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
              defaultOpen={visible.length <= 6}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AbsensiPage;
