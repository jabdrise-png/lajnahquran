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
  const [params, setParams] = useSearchParams();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const today = hariIni();

  const [date, setDate] = useState(params.get('date') || today);
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

      <div className="sticky top-0 z-10 bg-neutral/95 backdrop-blur py-2 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Tanggal
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)}
            className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
        </label>
        <div className="text-xs font-semibold text-slate-600">
          Waktu
          <div className="mt-1 flex flex-wrap gap-1.5">
            {waktuList.length === 0 && <span className="text-xs text-slate-500 py-2">Belum ada jadwal halaqah.</span>}
            {waktuList.map((w) => (
              <button key={w} type="button" onClick={() => setSlot(w)}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${slot === w ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                {sessionSlots.find((s) => s.code === w)?.name || w}
              </button>
            ))}
          </div>
        </div>
        {(isAdmin || visible.length > 3) && (
          <label className="text-xs font-semibold text-slate-600 flex-1 min-w-[180px]">
            Cari halaqah / musammi'
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ketik nama…"
                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm bg-white" />
            </div>
          </label>
        )}
        <div className="text-xs text-slate-600 ml-auto">
          {visible.length} halaqah · {ringkasan.terisi}/{ringkasan.total} santri terisi
        </div>
      </div>

      {isAdmin && bentrok.length > 0 && (
        <details className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <summary className="cursor-pointer font-semibold flex items-center gap-2">
            <AlertTriangle size={16} /> {bentrok.length} jadwal bentrok (orang yang sama di dua halaqah pada waktu yang sama)
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
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
