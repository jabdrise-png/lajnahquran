/**
 * Fase 3 · Setoran & Murojaah.
 *  - Daftar setoran (langsung sah) dengan filter; Admin bisa koreksi / batalkan dengan alasan.
 *  - "Catat setoran" membuka input ringkas yang sama dengan Sesi Halaqah.
 *  - Tab Rekap: ringkasan per santri.
 * Tidak ada lagi alur validasi (accepted/returned).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Download } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { normalizeRole } from '../lib/permissions';
import { PageHeader, LoadingState } from '../components/ui/SaaSPrimitives';
import Modal from '../components/Modal';
import FormSetoranRingkas from '../components/setoran/FormSetoranRingkas';
import DaftarSetoran from '../components/setoran/DaftarSetoran';
import SetoranHarianRekap, { SetoranHarianRekapRef } from '../components/SetoranHarianRekap';
import { hariIni, halaqahSaya } from '../lib/sesiHalaqah';

const shiftHari = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

export default function SetoranHarianPage() {
  const { halaqah, setoranHarian, recitationKinds, musammi, allSantri, userProfile, loading } = useSupabaseData();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const today = hariIni();

  const myMusammiIds = useMemo(
    () => musammi.filter((m: any) => userProfile?.id && m.user_id === userProfile.id).map((m) => Number(m.id)),
    [musammi, userProfile?.id]
  );
  const mine = useMemo(() => halaqahSaya(halaqah, { role, userId: userProfile?.id, myMusammiIds }), [halaqah, role, userProfile?.id, myMusammiIds]);

  const [tab, setTab] = useState<'daftar' | 'rekap'>('daftar');
  const [dari, setDari] = useState(shiftHari(today, -6));
  const [sampai, setSampai] = useState(today);
  const { pastikanTanggal } = useSupabaseData();
  useEffect(() => { pastikanTanggal(dari); }, [dari, pastikanTanggal]); // Fase 7: rentang lama → muat riwayat
  const [halaqahId, setHalaqahId] = useState<string>('all');
  const [jenis, setJenis] = useState<string>('all');
  const [hanyaUlang, setHanyaUlang] = useState(false);
  const [cari, setCari] = useState('');
  const [catat, setCatat] = useState(false);
  const rekapRef = useRef<SetoranHarianRekapRef>(null);

  const mineIds = useMemo(() => new Set(mine.map((h) => h.id)), [mine]);
  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return setoranHarian
      .filter((r) => r.tanggal >= dari && r.tanggal <= sampai)
      .filter((r) => isAdmin || (r.halaqah_id !== null && mineIds.has(r.halaqah_id)))
      .filter((r) => halaqahId === 'all' || String(r.halaqah_id) === halaqahId)
      .filter((r) => jenis === 'all' || r.kind === jenis)
      .filter((r) => !hanyaUlang || r.is_repeat)
      .filter((r) => !q || (allSantri.find((s) => Number(s.id) === r.santri_id)?.nama || '').toLowerCase().includes(q))
      .sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));
  }, [setoranHarian, dari, sampai, isAdmin, mineIds, halaqahId, jenis, hanyaUlang, cari, allSantri]);

  const totalHal = rows.reduce((n, r) => n + (Number(r.jumlah_halaman) || 0), 0);
  const totalZiyadah = rows.filter((r) => r.adds_memorization).reduce((n, r) => n + (Number(r.jumlah_halaman) || 0), 0);

  if (loading) return <LoadingState label="Memuat setoran…" />;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="Setoran & Murojaah"
        description="Setoran langsung sah saat dicatat. Koreksi dan pembatalan oleh Admin dengan alasan."
        actions={mine.length > 0 && (
          <button type="button" onClick={() => setCatat(true)} className="btn btn-primary">
            <Plus size={16} /> Catat setoran
          </button>
        )}
      />

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 w-fit">
        {([['daftar', 'Daftar setoran'], ['rekap', 'Rekap per santri']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`px-4 py-2 rounded-md text-sm font-semibold ${tab === id ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600'}`}>{label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-white border border-slate-200 rounded-xl p-3">
        <label className="text-sm sm:text-xs font-semibold text-slate-600">Dari
          <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm sm:text-xs font-semibold text-slate-600">Sampai
          <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm sm:text-xs font-semibold text-slate-600">Halaqah
          <select value={halaqahId} onChange={(e) => setHalaqahId(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="all">Semua</option>
            {mine.map((h) => <option key={h.id} value={h.id}>{h.nama}</option>)}
          </select>
        </label>
        <label className="text-sm sm:text-xs font-semibold text-slate-600">Jenis
          <select value={jenis} onChange={(e) => setJenis(e.target.value)} className="block mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="all">Semua</option>
            {recitationKinds.map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}
          </select>
        </label>
        <label className="text-sm sm:text-xs font-semibold text-slate-600 flex-1 min-w-[160px]">Cari santri
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama…" className="block w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        {tab === 'daftar' && (
          <label className="inline-flex items-center gap-1.5 text-sm sm:text-xs text-slate-700 pb-2">
            <input type="checkbox" checked={hanyaUlang} onChange={(e) => setHanyaUlang(e.target.checked)} className="rounded border-slate-300" /> Hanya yang diulang (Rasib)
          </label>
        )}
        {tab === 'rekap' && (
          <button type="button" onClick={() => rekapRef.current?.exportData()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">
            <Download size={14} /> Excel
          </button>
        )}
      </div>

      {tab === 'daftar' ? (
        <>
          <p className="text-sm sm:text-xs text-slate-600">{rows.length} setoran · {totalHal} halaman (ziyadah yang menambah hafalan: {totalZiyadah} hal)</p>
          <DaftarSetoran rows={rows.slice(0, 500)} isAdmin={isAdmin} halaqahOptions={halaqah} santriList={allSantri} showDate emptyText="Tidak ada setoran pada filter ini." />
          {rows.length > 500 && <p className="text-sm sm:text-xs text-slate-500">Menampilkan 500 terbaru. Persempit rentang tanggal untuk melihat lainnya.</p>}
        </>
      ) : (
        <SetoranHarianRekap
          ref={rekapRef}
          startDate={dari}
          endDate={sampai}
          filterMarhalah="all"
          filterKelas="all"
          filterJenisHalaqah="all"
          filterHalaqah={halaqahId}
          filterSkema={jenis === 'all' ? 'all' : (recitationKinds.find((k) => k.code === jenis)?.name || jenis)}
          searchQuery={cari}
        />
      )}

      <Modal isOpen={catat} onClose={() => setCatat(false)} title="Catat setoran" maxWidth="lg">
        <FormSetoranRingkas halaqahOptions={mine} initialHalaqahId={halaqahId === 'all' ? mine[0]?.id : Number(halaqahId)} />
      </Modal>
    </div>
  );
}
