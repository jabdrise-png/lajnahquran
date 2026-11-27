/**
 * Fase 3 · Sesi Halaqah (ringkas, ramah HP).
 * Satu halaqah + tanggal + waktu, dengan tab:
 *   Absensi  — kartu absensi yang sama dengan layar Absensi (badal, tanpa kunci)
 *   Setoran  — input setoran ringkas + daftar setoran sesi ini
 *   Santri   — posisi hafalan terakhir, total ziyadah (tanpa Rasib), kehadiran
 *   Riwayat  — sesi yang sudah tercatat
 * Tidak ada lagi Kunci Sesi maupun Validasi Setoran.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState, StatCard } from '../../components/ui/SaaSPrimitives';
import AbsensiHalaqahCard from '../../components/absensi/AbsensiHalaqahCard';
import FormSetoranRingkas from '../../components/setoran/FormSetoranRingkas';
import DaftarSetoran from '../../components/setoran/DaftarSetoran';
import { hariIni, halaqahSaya, rosterPadaTanggal } from '../../lib/sesiHalaqah';
import { findStatus } from '../../lib/v2Adapter';
import { labelArah } from '../../lib/arahHafalan';

type Tab = 'absensi' | 'setoran' | 'santri' | 'riwayat';

const SesiHalaqahPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [params, setParams] = useSearchParams();
  const {
    halaqah, attendance, setoranHarian, attendanceStatuses, sessionSlots, musammi, allSantri, userProfile, loading,
    addAttendanceRecords,
  } = useSupabaseData();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const today = hariIni();

  const myMusammiIds = useMemo(
    () => musammi.filter((m: any) => userProfile?.id && m.user_id === userProfile.id).map((m) => Number(m.id)),
    [musammi, userProfile?.id]
  );
  const [date, setDate] = useState(params.get('date') || today);
  const badalIds = useMemo(
    () => attendance.filter((a) => a.date === date && a.isBadal && myMusammiIds.includes(Number(a.badalMusammiId))).map((a) => Number(a.halaqahId)),
    [attendance, date, myMusammiIds]
  );
  const mine = useMemo(
    () => halaqahSaya(halaqah, { role, userId: userProfile?.id, myMusammiIds, badalHalaqahIds: badalIds }),
    [halaqah, role, userProfile?.id, myMusammiIds, badalIds]
  );

  const [halaqahId, setHalaqahId] = useState<number | null>(Number(params.get('halaqahId')) || null);
  const active = mine.find((h) => h.id === halaqahId) || mine[0] || null;
  const slotOptions = useMemo(() => {
    const w = (active?.waktu || []).map(String);
    return w.length ? w : sessionSlots.filter((s) => s.is_active).map((s) => s.code);
  }, [active, sessionSlots]);
  const [slot, setSlot] = useState(params.get('slot') || '');
  useEffect(() => { if (!slot || !slotOptions.includes(slot)) setSlot(slotOptions[0] || ''); }, [slotOptions]); // eslint-disable-line
  const [tab, setTab] = useState<Tab>(((params.get('tab') as Tab) || (/recitations/.test(window.location.pathname) ? 'setoran' : 'absensi')));
  // Fase 7: tab Riwayat butuh data lama; tanggal lampau juga memicu muat riwayat.
  const { pastikanTanggal } = useSupabaseData();
  useRiwayat({ aktif: tab === 'riwayat' });
  useEffect(() => { pastikanTanggal(date); }, [date, pastikanTanggal]);

  // Tautan lama /app/sessions/:sessionId -> isi pilihan dari sesi
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data } = await (supabase as any).from('halaqah_sessions').select('halaqah_id, session_date, session_slot').eq('id', sessionId).maybeSingle();
      if (data) {
        setHalaqahId(Number(data.halaqah_id));
        setDate(String(data.session_date));
        setSlot(data.session_slot);
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    const p = new URLSearchParams(params);
    if (active) p.set('halaqahId', String(active.id));
    p.set('date', date);
    if (slot) p.set('slot', slot);
    p.set('tab', tab);
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, date, slot, tab]);

  const roster = useMemo(() => (active ? rosterPadaTanggal(active, date, allSantri) : []), [active, date, allSantri]);
  const sesiSetoran = useMemo(
    () => setoranHarian.filter((r) => r.halaqah_id === active?.id && r.tanggal === date && r.waktu === slot)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [setoranHarian, active?.id, date, slot]
  );
  const sesiAbsen = useMemo(
    () => attendance.filter((a) => a.halaqahId === active?.id && a.date === date && a.waktu === slot && a.peran === 'Santri'),
    [attendance, active?.id, date, slot]
  );

  const progresSantri = useMemo(() => roster.map((s) => {
    const rows = setoranHarian.filter((r) => r.santri_id === Number(s.id));
    const ziyadah = rows.filter((r) => r.adds_memorization).reduce((n, r) => n + (Number(r.jumlah_halaman) || 0), 0);
    const murojaah = rows.filter((r) => r.counts_as_murojaah).reduce((n, r) => n + (Number(r.jumlah_halaman) || 0), 0);
    const last = rows.filter((r) => r.adds_memorization).sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at))[0];
    const att = attendance.filter((a) => a.peran === 'Santri' && Number(a.personId) === Number(s.id));
    const hadir = att.filter((a) => findStatus(attendanceStatuses, a.status as string)?.counts_as_present).length;
    return {
      santri: s, ziyadah, murojaah,
      posisi: last ? `${last.surat_selesai} ${last.ayat_selesai}` : '-',
      kehadiran: att.length ? Math.round((hadir / att.length) * 100) : null,
      ulang: rows.filter((r) => r.is_repeat).length,
    };
  }), [roster, setoranHarian, attendance, attendanceStatuses]);

  const riwayatSesi = useMemo(() => {
    const map = new Map<string, { date: string; slot: string; hadir: number; total: number; setoran: number }>();
    attendance.filter((a) => a.halaqahId === active?.id && a.peran === 'Santri').forEach((a) => {
      const k = `${a.date}|${a.waktu}`;
      const v = map.get(k) || { date: a.date, slot: a.waktu, hadir: 0, total: 0, setoran: 0 };
      v.total++;
      if (findStatus(attendanceStatuses, a.status as string)?.counts_as_present) v.hadir++;
      map.set(k, v);
    });
    setoranHarian.filter((r) => r.halaqah_id === active?.id).forEach((r) => {
      const k = `${r.tanggal}|${r.waktu}`;
      const v = map.get(k) || { date: r.tanggal, slot: r.waktu, hadir: 0, total: 0, setoran: 0 };
      v.setoran++;
      map.set(k, v);
    });
    return Array.from(map.values()).sort((a, b) => (b.date + b.slot).localeCompare(a.date + a.slot)).slice(0, 60);
  }, [attendance, setoranHarian, active?.id, attendanceStatuses]);

  if (loading) return <LoadingState label="Memuat sesi halaqah…" />;
  if (!active) {
    return (
      <div className="space-y-4">
        <PageHeader title="Sesi Halaqah" />
        <EmptyState title="Belum ada halaqah" description={isAdmin ? 'Buat halaqah di Data Master > Halaqah.' : 'Anda belum ditugaskan sebagai musammi\' di halaqah mana pun.'} />
      </div>
    );
  }

  const hadirSesi = sesiAbsen.filter((a) => findStatus(attendanceStatuses, a.status as string)?.counts_as_present).length;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader title="Sesi Halaqah" description="Absensi dan setoran satu halaqah. Sesi tercatat saat absensi pertama disimpan." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={active.id} onChange={(e) => setHalaqahId(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold bg-white">
          {mine.map((h) => <option key={h.id} value={h.id}>{h.nama} — {h.musammi?.nama || 'tanpa musammi\''}</option>)}
        </select>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
        <div className="flex flex-wrap gap-1.5">
          {slotOptions.map((w) => (
            <button key={w} type="button" onClick={() => setSlot(w)}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${slot === w ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
              {sessionSlots.find((s) => s.code === w)?.name || w}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Santri" value={roster.length} />
        <StatCard label="Hadir" value={`${hadirSesi}/${sesiAbsen.length || 0}`} tone={sesiAbsen.length ? 'success' : 'neutral'} />
        <StatCard label="Setoran" value={sesiSetoran.length} tone="primary" />
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 overflow-x-auto">
        {([['absensi', 'Absensi'], ['setoran', 'Setoran'], ['santri', 'Santri'], ['riwayat', 'Riwayat']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-semibold whitespace-nowrap ${tab === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'absensi' && (
        <AbsensiHalaqahCard
          key={`${active.id}-${date}-${slot}`}
          halaqah={active}
          date={date}
          slot={slot}
          today={today}
          isAdmin={isAdmin}
          statuses={attendanceStatuses}
          attendance={attendance}
          allSantri={allSantri}
          musammiList={musammi}
          onSave={(records, reason) => addAttendanceRecords(records as any, reason)}
        />
      )}

      {tab === 'setoran' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <FormSetoranRingkas halaqahOptions={mine} initialHalaqahId={active.id} date={date} slot={slot} lockContext />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-2">Setoran sesi ini</h3>
            <DaftarSetoran rows={sesiSetoran} isAdmin={isAdmin} halaqahOptions={mine} santriList={allSantri} emptyText="Belum ada setoran pada sesi ini." />
          </div>
        </div>
      )}

      {tab === 'santri' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {progresSantri.map((p) => (
            <div key={p.santri.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800">{p.santri.nama}</div>
                <div className="text-sm sm:text-[11px] text-slate-500">{labelArah((p.santri as any).arah_hafalan)} · posisi terakhir: {p.posisi}</div>
              </div>
              <div className="text-sm sm:text-xs text-slate-700">Ziyadah <b>{p.ziyadah}</b> hal</div>
              <div className="text-sm sm:text-xs text-slate-700">Murojaah <b>{p.murojaah}</b> hal</div>
              {p.ulang > 0 && <div className="text-sm sm:text-xs text-red-700">{p.ulang}× ulang</div>}
              <div className="text-sm sm:text-xs text-slate-700">Hadir <b>{p.kehadiran === null ? '-' : `${p.kehadiran}%`}</b></div>
            </div>
          ))}
          {progresSantri.length === 0 && <p className="px-4 py-3 text-sm sm:text-xs text-slate-500">Belum ada santri.</p>}
        </div>
      )}

      {tab === 'riwayat' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {riwayatSesi.length === 0 && <p className="px-4 py-3 text-sm sm:text-xs text-slate-500">Belum ada sesi tercatat pada tahun ajaran ini.</p>}
          {riwayatSesi.map((r) => (
            <button key={`${r.date}-${r.slot}`} type="button" onClick={() => { setDate(r.date); setSlot(r.slot); setTab('absensi'); }}
              className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-slate-50">
              <span className="text-sm font-medium text-slate-800">{r.date} · {r.slot}</span>
              <span className="text-sm sm:text-xs text-slate-600">Hadir {r.hadir}/{r.total} · {r.setoran} setoran</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SesiHalaqahPage;
