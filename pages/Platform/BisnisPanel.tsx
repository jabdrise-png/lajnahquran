/**
 * Fase 8 · konsol Superadmin: antrean pendaftaran lembaga, langganan & pembayaran transfer manual, paket.
 * Semua perubahan lewat RPC (rpc_setujui_pendaftaran, rpc_tolak_pendaftaran, rpc_catat_pembayaran,
 * rpc_batalkan_pembayaran, rpc_simpan_paket) yang memeriksa Superadmin dan menulis audit log.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, Wallet, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { NotificationStore } from '../../lib/NotificationStore';
import { pesanErrorRamah } from '../../lib/ramahkanError';
import { ConfirmDialog, EmptyState, LoadingState, Modal, StatusBadge, type BadgeTone } from '../../components/ui/SaaSPrimitives';
import {
  type Paket, type RingkasanLangganan, type Pendaftaran, type Pembayaran,
  LABEL_STATUS_LANGGANAN, rupiah, tanggalId, tambahBulan, hariIniJakarta, keAngka,
} from '../../lib/bisnis';

type Sub = 'pendaftaran' | 'langganan' | 'paket';

const NADA: Record<string, BadgeTone> = { aktif: 'success', segera_habis: 'warning', lewat: 'danger', belum_bayar: 'neutral' };

const BisnisPanel: React.FC<{ awal?: Sub }> = ({ awal = 'pendaftaran' }) => {
  const [sub, setSub] = useState<Sub>(awal);
  const [memuat, setMemuat] = useState(true);
  const [paket, setPaket] = useState<Paket[]>([]);
  const [ringkasan, setRingkasan] = useState<RingkasanLangganan[]>([]);
  const [pendaftaran, setPendaftaran] = useState<Pendaftaran[]>([]);
  const [riwayat, setRiwayat] = useState<Record<string, Pembayaran[]>>({});
  const [bayarUntuk, setBayarUntuk] = useState<RingkasanLangganan | null>(null);
  const [formBayar, setFormBayar] = useState({ tanggal: '', jumlah: '', mulai: '', bulan: '12', plan: '', catatan: '' });
  const [batalId, setBatalId] = useState<string | null>(null);
  const [setujui, setSetujui] = useState<{ p: Pendaftaran; plan: string } | null>(null);
  const [tolakId, setTolakId] = useState<string | null>(null);
  const [editPaket, setEditPaket] = useState<Paket | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [filterPendaftaran, setFilterPendaftaran] = useState<'menunggu' | 'semua'>('menunggu');

  const muat = useCallback(async () => {
    setMemuat(true);
    const [p, r, d] = await Promise.all([
      (supabase as any).from('platform_plans').select('*').order('urutan').order('id'),
      (supabase as any).rpc('rpc_ringkasan_langganan'),
      (supabase as any).from('pendaftaran_lembaga').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    for (const x of [p, r, d]) if (x.error) NotificationStore.addNotification(pesanErrorRamah(x.error, 'Memuat data bisnis'), 'error');
    setPaket(p.data || []);
    setRingkasan(r.data || []);
    setPendaftaran(d.data || []);
    setMemuat(false);
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const muatRiwayat = async (org: string) => {
    const { data, error } = await (supabase as any).from('pembayaran_lembaga').select('*').eq('organization_id', org).order('tanggal_bayar', { ascending: false });
    if (error) return NotificationStore.addNotification(pesanErrorRamah(error), 'error');
    setRiwayat((x) => ({ ...x, [org]: data || [] }));
  };

  const jalankan = async (fn: () => Promise<{ error: any }>, berhasil: string) => {
    setSibuk(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      NotificationStore.addNotification(berhasil, 'success');
      await muat();
      return true;
    } catch (e) {
      NotificationStore.addNotification(pesanErrorRamah(e), 'error');
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = pendaftaran.filter((p) => p.status === 'menunggu');
  const tampilPendaftaran = filterPendaftaran === 'menunggu' ? menunggu : pendaftaran;
  const hitung = useMemo(() => {
    const c: Record<string, number> = { aktif: 0, segera_habis: 0, lewat: 0, belum_bayar: 0 };
    for (const r of ringkasan) if (r.status !== 'archived') c[r.status_langganan] = (c[r.status_langganan] || 0) + 1;
    return c;
  }, [ringkasan]);
  const namaPaket = (id?: string | null) => paket.find((p) => p.id === id)?.nama || id || '-';

  const bukaBayar = (r: RingkasanLangganan) => {
    const hari = hariIniJakarta();
    const mulai = r.langganan_sampai && r.langganan_sampai >= hari ? tambahBulan(r.langganan_sampai, 0, 1) : hari;
    setFormBayar({ tanggal: hari, jumlah: '', mulai, bulan: '12', plan: r.plan_id || 'standard', catatan: '' });
    setBayarUntuk(r);
  };
  const selesaiBayar = formBayar.mulai ? tambahBulan(formBayar.mulai, Number(formBayar.bulan) || 1, -1) : '';
  const hargaSaran = useMemo(() => {
    const p = paket.find((x) => x.id === formBayar.plan);
    if (!p) return null;
    const bln = Number(formBayar.bulan) || 0;
    if (bln === 12 && p.harga_tahunan > 0) return p.harga_tahunan;
    return p.harga_bulanan > 0 ? p.harga_bulanan * bln : null;
  }, [paket, formBayar.plan, formBayar.bulan]);

  if (memuat && !ringkasan.length && !paket.length) return <LoadingState label="Memuat data bisnis…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="tabs">
          <button type="button" className={`tab ${sub === 'pendaftaran' ? 'tab-aktif' : ''}`} onClick={() => setSub('pendaftaran')}>
            Pendaftaran {menunggu.length > 0 && <span className="badge badge-merah ml-1">{menunggu.length}</span>}
          </button>
          <button type="button" className={`tab ${sub === 'langganan' ? 'tab-aktif' : ''}`} onClick={() => setSub('langganan')}>Langganan & pembayaran</button>
          <button type="button" className={`tab ${sub === 'paket' ? 'tab-aktif' : ''}`} onClick={() => setSub('paket')}>Paket</button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={muat} disabled={memuat}><RefreshCw size={14} /> Muat ulang</button>
      </div>

      {/* ------------------------------ PENDAFTARAN ------------------------------ */}
      {sub === 'pendaftaran' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Lembaga yang mendaftar sendiri dari halaman masuk. Setujui untuk mengaktifkan lembaga dan menjadikan pendaftar Admin.</p>
            <select className="kontrol w-auto" value={filterPendaftaran} onChange={(e) => setFilterPendaftaran(e.target.value as any)}>
              <option value="menunggu">Menunggu ({menunggu.length})</option>
              <option value="semua">Semua ({pendaftaran.length})</option>
            </select>
          </div>
          {tampilPendaftaran.length === 0 ? (
            <EmptyState title="Tidak ada pendaftaran menunggu" description="Pendaftaran baru akan muncul di sini." />
          ) : (
            <div className="wadah-tabel overflow-x-auto">
              <table className="tabel tabel-kartu">
                <thead><tr><th>Lembaga</th><th>Pendaftar</th><th>Kontak</th><th>Perkiraan santri</th><th>Tanggal</th><th>Status</th><th className="text-right">Aksi</th></tr></thead>
                <tbody>
                  {tampilPendaftaran.map((p) => (
                    <tr key={p.id}>
                      <td><div className="font-semibold text-slate-900">{p.nama_lembaga}</div>{p.kota && <div className="text-xs text-slate-500">{p.kota}</div>}</td>
                      <td data-label="Pendaftar">{p.nama_pendaftar}</td>
                      <td data-label="Kontak"><div>{p.email}</div>{p.no_hp && <div className="text-xs text-slate-500">{p.no_hp}</div>}</td>
                      <td data-label="Perkiraan santri" className="tabular-nums">{p.perkiraan_santri ?? '-'}</td>
                      <td data-label="Tanggal" className="tabular-nums">{tanggalId(p.created_at)}</td>
                      <td data-label="Status">
                        <StatusBadge label={p.status === 'menunggu' ? 'Menunggu' : p.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}
                          tone={p.status === 'menunggu' ? 'warning' : p.status === 'disetujui' ? 'success' : 'danger'} />
                        {p.alasan && <div className="text-xs text-slate-500 mt-1">{p.alasan}</div>}
                      </td>
                      <td data-label="Aksi" className="text-right whitespace-nowrap">
                        {p.status === 'menunggu' && (
                          <span className="inline-flex gap-2">
                            <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => setTolakId(p.id)}><XCircle size={14} /> Tolak</button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSetujui({ p, plan: paket.find((x) => x.aktif)?.id || 'standard' })}><CheckCircle2 size={14} /> Setujui</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------ LANGGANAN ------------------------------ */}
      {sub === 'langganan' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(['aktif', 'segera_habis', 'lewat', 'belum_bayar'] as const).map((k) => (
              <div key={k} className="card p-4">
                <div className="text-xs font-semibold text-slate-500">{LABEL_STATUS_LANGGANAN[k]}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{hitung[k] || 0}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-600">Pembayaran transfer dicatat manual. Lembaga yang lewat masa langganan hanya ditandai — tidak ditangguhkan otomatis.</p>
          <div className="wadah-tabel overflow-x-auto">
            <table className="tabel tabel-kartu">
              <thead><tr><th>Lembaga</th><th>Paket</th><th>Santri aktif</th><th>Langganan sampai</th><th>Bayar terakhir</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>
                {ringkasan.filter((r) => r.status !== 'archived').map((r) => {
                  const lebih = r.batas_santri != null && r.santri_aktif > r.batas_santri;
                  return (
                    <React.Fragment key={r.organization_id}>
                      <tr>
                        <td><div className="font-semibold text-slate-900">{r.nama}</div><div className="text-xs text-slate-500">{[r.kota, r.no_hp, r.status === 'active' ? null : r.status].filter(Boolean).join(' · ')}</div></td>
                        <td data-label="Paket">{r.nama_paket || r.plan_id}</td>
                        <td data-label="Santri aktif" className="tabular-nums"><span className={lebih ? 'font-semibold text-red-700' : ''}>{r.santri_aktif}{r.batas_santri != null ? ` / ${r.batas_santri}` : ''}</span></td>
                        <td data-label="Langganan sampai" className="tabular-nums">
                          <span className="inline-flex items-center gap-2">{tanggalId(r.langganan_sampai)} <StatusBadge label={LABEL_STATUS_LANGGANAN[r.status_langganan]} tone={NADA[r.status_langganan]} /></span>
                        </td>
                        <td data-label="Bayar terakhir" className="tabular-nums">{r.bayar_terakhir ? `${tanggalId(r.bayar_terakhir)} · ${rupiah(r.jumlah_terakhir)}` : '-'}</td>
                        <td data-label="Aksi" className="text-right whitespace-nowrap">
                          <span className="inline-flex gap-2">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (riwayat[r.organization_id] ? setRiwayat((x) => { const y = { ...x }; delete y[r.organization_id]; return y; }) : muatRiwayat(r.organization_id))}>Riwayat</button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => bukaBayar(r)}><Wallet size={14} /> Catat bayar</button>
                          </span>
                        </td>
                      </tr>
                      {riwayat[r.organization_id] && (
                        <tr><td colSpan={6} className="bg-slate-50">
                          {riwayat[r.organization_id].length === 0 ? <p className="text-sm text-slate-500">Belum ada pembayaran.</p> : (
                            <ul className="space-y-1.5 text-sm">
                              {riwayat[r.organization_id].map((b) => (
                                <li key={b.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${b.status === 'batal' ? 'text-slate-400 line-through' : ''}`}>
                                  <span className="font-semibold">{tanggalId(b.tanggal_bayar)}</span>
                                  <span>{rupiah(b.jumlah)}</span>
                                  <span>{tanggalId(b.periode_mulai)} – {tanggalId(b.periode_selesai)}</span>
                                  <span>{namaPaket(b.plan_id)}</span>
                                  {b.catatan && <span className="text-slate-500">{b.catatan}</span>}
                                  {b.status === 'batal' ? <span className="no-underline text-red-700">dibatalkan: {b.alasan_batal}</span>
                                    : <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => setBatalId(b.id)}>Batalkan</button>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------ PAKET ------------------------------ */}
      {sub === 'paket' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Harga per paket berdasarkan batas santri. Tanpa masa uji coba. Paket nonaktif tidak ditawarkan ke lembaga baru.</p>
            <button type="button" className="btn btn-primary" onClick={() => setEditPaket({ id: '', nama: '', batas_santri: null, harga_bulanan: 0, harga_tahunan: 0, keterangan: '', aktif: true, urutan: paket.length + 1 })}><Plus size={16} /> Paket baru</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {paket.map((p) => {
              const dipakai = ringkasan.filter((r) => r.plan_id === p.id && r.status !== 'archived').length;
              return (
                <div key={p.id} className={`card p-4 ${p.aktif ? '' : 'opacity-70'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900">{p.nama}</div>
                      <div className="text-xs text-slate-500">Kode: {p.id} · dipakai {dipakai} lembaga</div>
                    </div>
                    <StatusBadge label={p.aktif ? 'Ditawarkan' : 'Nonaktif'} tone={p.aktif ? 'success' : 'neutral'} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-slate-500">Batas santri</dt><dd className="font-semibold">{p.batas_santri ?? 'Tanpa batas'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Per bulan</dt><dd className="font-semibold">{p.harga_bulanan ? rupiah(p.harga_bulanan) : 'Belum diatur'}</dd></div>
                    <div><dt className="text-xs text-slate-500">Per tahun</dt><dd className="font-semibold">{p.harga_tahunan ? rupiah(p.harga_tahunan) : 'Belum diatur'}</dd></div>
                  </dl>
                  {p.keterangan && <p className="mt-2 text-sm text-slate-600">{p.keterangan}</p>}
                  <div className="mt-3 flex justify-end"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditPaket(p)}>Ubah</button></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------ MODAL ------------------------------ */}
      <Modal isOpen={Boolean(bayarUntuk)} onClose={() => setBayarUntuk(null)} title={`Catat pembayaran · ${bayarUntuk?.nama || ''}`}
        description="Isi sesuai bukti transfer. Masa langganan lembaga mengikuti tanggal selesai terakhir."
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setBayarUntuk(null)}>Batal</button>
          <button type="button" className="btn btn-primary" disabled={sibuk || !formBayar.mulai || keAngka(formBayar.jumlah) === null}
            onClick={async () => {
              const ok = await jalankan(() => (supabase as any).rpc('rpc_catat_pembayaran', {
                p_org: bayarUntuk!.organization_id, p_tanggal: formBayar.tanggal, p_jumlah: keAngka(formBayar.jumlah),
                p_mulai: formBayar.mulai, p_selesai: selesaiBayar, p_plan: formBayar.plan || null, p_catatan: formBayar.catatan,
              }), 'Pembayaran tercatat.');
              if (ok) { setBayarUntuk(null); setRiwayat({}); }
            }}>{sibuk ? 'Menyimpan…' : 'Simpan pembayaran'}</button>
        </>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label><span className="field-label">Tanggal transfer</span><input type="date" className="field" value={formBayar.tanggal} onChange={(e) => setFormBayar({ ...formBayar, tanggal: e.target.value })} /></label>
          <label><span className="field-label">Paket</span>
            <select className="field" value={formBayar.plan} onChange={(e) => setFormBayar({ ...formBayar, plan: e.target.value })}>
              {paket.map((p) => <option key={p.id} value={p.id}>{p.nama}{p.aktif ? '' : ' (nonaktif)'}</option>)}
            </select></label>
          <label><span className="field-label">Mulai berlaku</span><input type="date" className="field" value={formBayar.mulai} onChange={(e) => setFormBayar({ ...formBayar, mulai: e.target.value })} /></label>
          <label><span className="field-label">Lama (bulan)</span><input type="number" min={1} max={60} className="field" value={formBayar.bulan} onChange={(e) => setFormBayar({ ...formBayar, bulan: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="field-label">Jumlah (Rp){hargaSaran ? ` · harga paket ${rupiah(hargaSaran)}` : ''}</span>
            <input inputMode="numeric" className="field" placeholder="mis. 1.500.000" value={formBayar.jumlah} onChange={(e) => setFormBayar({ ...formBayar, jumlah: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="field-label">Catatan (bank, nama pengirim, dll.)</span><input className="field" value={formBayar.catatan} onChange={(e) => setFormBayar({ ...formBayar, catatan: e.target.value })} /></label>
          {selesaiBayar && <p className="sm:col-span-2 text-sm text-slate-600">Langganan berlaku <b>{tanggalId(formBayar.mulai)}</b> s.d. <b>{tanggalId(selesaiBayar)}</b>.</p>}
        </div>
      </Modal>

      <Modal isOpen={Boolean(setujui)} onClose={() => setSetujui(null)} title={`Setujui ${setujui?.p.nama_lembaga || ''}`}
        description="Lembaga menjadi aktif dan pendaftar langsung menjadi Admin lembaga."
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setSetujui(null)}>Batal</button>
          <button type="button" className="btn btn-primary" disabled={sibuk} onClick={async () => {
            const ok = await jalankan(() => (supabase as any).rpc('rpc_setujui_pendaftaran', { p_id: setujui!.p.id, p_plan: setujui!.plan }), 'Pendaftaran disetujui. Lembaga aktif.');
            if (ok) setSetujui(null);
          }}>{sibuk ? 'Memproses…' : 'Setujui'}</button>
        </>}>
        {setujui && (
          <div className="space-y-3 text-sm">
            <p>Pendaftar: <b>{setujui.p.nama_pendaftar}</b> ({setujui.p.email}){setujui.p.perkiraan_santri ? ` · ±${setujui.p.perkiraan_santri} santri` : ''}</p>
            <label><span className="field-label">Paket</span>
              <select className="field" value={setujui.plan} onChange={(e) => setSetujui({ ...setujui, plan: e.target.value })}>
                {paket.filter((p) => p.aktif).map((p) => <option key={p.id} value={p.id}>{p.nama} ({p.batas_santri ?? 'tanpa batas'} santri)</option>)}
              </select></label>
            <p className="text-slate-500">Setelah disetujui, catat pembayaran di tab Langganan & pembayaran.</p>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(editPaket)} onClose={() => setEditPaket(null)} title={editPaket?.id && paket.some((p) => p.id === editPaket.id) ? `Ubah paket ${editPaket.nama}` : 'Paket baru'}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setEditPaket(null)}>Batal</button>
          <button type="button" className="btn btn-primary" disabled={sibuk || !editPaket?.id || !editPaket?.nama} onClick={async () => {
            const p = editPaket!;
            const ok = await jalankan(() => (supabase as any).rpc('rpc_simpan_paket', {
              p_id: p.id, p_nama: p.nama, p_batas_santri: p.batas_santri, p_harga_bulanan: p.harga_bulanan || 0,
              p_harga_tahunan: p.harga_tahunan || 0, p_keterangan: p.keterangan || '', p_aktif: p.aktif, p_urutan: p.urutan || 0,
            }), 'Paket tersimpan.');
            if (ok) setEditPaket(null);
          }}>{sibuk ? 'Menyimpan…' : 'Simpan'}</button>
        </>}>
        {editPaket && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="field-label">Kode (huruf kecil, tanpa spasi)</span>
              <input className="field" disabled={paket.some((p) => p.id === editPaket.id) && Boolean(editPaket.id)} value={editPaket.id}
                onChange={(e) => setEditPaket({ ...editPaket, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /></label>
            <label><span className="field-label">Nama paket</span><input className="field" value={editPaket.nama} onChange={(e) => setEditPaket({ ...editPaket, nama: e.target.value })} /></label>
            <label><span className="field-label">Batas santri (kosong = tanpa batas)</span>
              <input inputMode="numeric" className="field" value={editPaket.batas_santri ?? ''} onChange={(e) => setEditPaket({ ...editPaket, batas_santri: keAngka(e.target.value) })} /></label>
            <label><span className="field-label">Urutan tampil</span><input inputMode="numeric" className="field" value={editPaket.urutan} onChange={(e) => setEditPaket({ ...editPaket, urutan: keAngka(e.target.value) ?? 0 })} /></label>
            <label><span className="field-label">Harga per bulan (Rp)</span><input inputMode="numeric" className="field" value={editPaket.harga_bulanan || ''} onChange={(e) => setEditPaket({ ...editPaket, harga_bulanan: keAngka(e.target.value) ?? 0 })} /></label>
            <label><span className="field-label">Harga per tahun (Rp)</span><input inputMode="numeric" className="field" value={editPaket.harga_tahunan || ''} onChange={(e) => setEditPaket({ ...editPaket, harga_tahunan: keAngka(e.target.value) ?? 0 })} /></label>
            <label className="sm:col-span-2"><span className="field-label">Keterangan</span><input className="field" value={editPaket.keterangan} onChange={(e) => setEditPaket({ ...editPaket, keterangan: e.target.value })} /></label>
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={editPaket.aktif} onChange={(e) => setEditPaket({ ...editPaket, aktif: e.target.checked })} /> Ditawarkan ke lembaga baru</label>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={Boolean(tolakId)} title="Tolak pendaftaran" description="Lembaga pendaftar akan diarsipkan. Alasan disimpan di log audit."
        tone="danger" confirmLabel="Tolak" requireReason reasonLabel="Alasan penolakan" isSubmitting={sibuk}
        onCancel={() => setTolakId(null)}
        onConfirm={async (alasan) => { const ok = await jalankan(() => (supabase as any).rpc('rpc_tolak_pendaftaran', { p_id: tolakId, p_alasan: alasan || '' }), 'Pendaftaran ditolak.'); if (ok) setTolakId(null); }} />

      <ConfirmDialog isOpen={Boolean(batalId)} title="Batalkan pembayaran" description="Pembayaran ditandai batal (tidak dihapus) dan masa langganan dihitung ulang."
        tone="danger" confirmLabel="Batalkan pembayaran" requireReason reasonLabel="Alasan" isSubmitting={sibuk}
        onCancel={() => setBatalId(null)}
        onConfirm={async (alasan) => { const ok = await jalankan(() => (supabase as any).rpc('rpc_batalkan_pembayaran', { p_id: batalId, p_alasan: alasan || '' }), 'Pembayaran dibatalkan.'); if (ok) { setBatalId(null); setRiwayat({}); } }} />
    </div>
  );
};

export default BisnisPanel;
