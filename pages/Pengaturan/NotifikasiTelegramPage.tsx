/**
 * Fase 6 · Notifikasi Telegram (Admin).
 *  1. Bot & pengaturan: status bot, sambungkan webhook (penautan otomatis), pesan setoran / kehadiran
 *     mingguan (hari & jam) / progres periode — aktif-tidak & template dengan variabel + pratinjau.
 *  2. Kode wali: kode unik per santri, status tertaut, salin pesan undangan, buat ulang kode, putuskan,
 *     pesan uji, ekspor Excel.
 *  3. Antrian: pesan terakhir (status, galat), kirim sekarang, ulangi/batal, kirim kehadiran minggu ini,
 *     kirim progres periode.
 * Semua pesan dibuat & dikirim server (notification_queue); halaman ini tidak pernah memegang token bot.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Copy, Download, Link2, RefreshCw, RotateCcw, Save, Send, Unlink, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { supabase } from '../../lib/supabaseClient';
import { SupportSessionStore } from '../../lib/permissions';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { exportToExcel } from '../../lib/utils';
import { kirimAntrianSekarang } from '../../lib/antrianPesan';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import {
  TEMPLATE_BAWAAN, VARIABEL, contohVariabel, renderTemplate, variabelTakDikenal, tampilKode, tautanBot, pesanUndangan, terjemahGalat,
  type JenisPesan,
} from '../../lib/telegramPesan';

type Tab = 'pengaturan' | 'kode' | 'antrian';
interface Pengaturan {
  setoran_aktif: boolean; setoran_template: string;
  mingguan_aktif: boolean; mingguan_hari: number; mingguan_jam: number; mingguan_template: string; mingguan_terakhir: string | null;
  periode_aktif: boolean; periode_template: string;
}
const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  antri: { t: 'Menunggu', c: 'bg-amber-50 text-amber-700 border-amber-200' },
  proses: { t: 'Dikirim…', c: 'bg-blue-50 text-blue-700 border-blue-200' },
  terkirim: { t: 'Terkirim', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  gagal: { t: 'Gagal', c: 'bg-red-50 text-red-700 border-red-200' },
  batal: { t: 'Dibatalkan', c: 'bg-slate-100 text-slate-500 border-slate-200' },
};
const JENIS_LABEL: Record<string, string> = { setoran: 'Setoran', kehadiran_mingguan: 'Kehadiran mingguan', progres_periode: 'Progres periode', uji: 'Pesan uji' };
const inputCls = 'field';
const btn = 'btn btn-secondary';
const btnUtama = 'btn btn-primary';

const salin = async (teks: string, label = 'Disalin.') => {
  try { await navigator.clipboard.writeText(teks); NotificationStore.addNotification(label, 'success'); }
  catch { NotificationStore.addNotification('Tidak bisa menyalin otomatis. Salin manual dari kotak teks.', 'error'); }
};

const EditorTemplate: React.FC<{
  jenis: JenisPesan; judul: string; ket: string; aktif: boolean; template: string;
  onAktif: (v: boolean) => void; onTemplate: (v: string) => void; children?: React.ReactNode;
}> = ({ jenis, judul, ket, aktif, template, onAktif, onTemplate, children }) => {
  const asing = variabelTakDikenal(template, jenis);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const sisipkan = (v: string) => {
    const el = ref.current;
    const pos = el ? el.selectionStart : template.length;
    const baru = `${template.slice(0, pos)}{${v}}${template.slice(el ? el.selectionEnd : pos)}`;
    onTemplate(baru);
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = pos + v.length + 2; } }, 0);
  };
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div><h3 className="text-sm font-bold text-slate-900">{judul}</h3><p className="text-xs text-slate-500 mt-0.5">{ket}</p></div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={aktif} onChange={(e) => onAktif(e.target.checked)} /> Aktif
        </label>
      </div>
      <div className="p-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {children}
          <label className="block text-xs font-semibold text-slate-600">Template pesan
            <textarea ref={ref} rows={9} className="field !h-auto py-2 mt-1 font-mono text-xs" value={template} maxLength={2000}
              onChange={(e) => onTemplate(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1">
            {VARIABEL[jenis].map((v) => (
              <button key={v.nama} type="button" title={v.ket} onClick={() => sisipkan(v.nama)}
                className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-2xs font-mono text-slate-600 hover:bg-blue-50 hover:border-blue-200">{`{${v.nama}}`}</button>
            ))}
          </div>
          {asing.length > 0 && <p className="text-xs text-amber-700">Variabel tidak dikenal (akan tampil apa adanya): {asing.map((a) => `{${a}}`).join(', ')}</p>}
          <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1" onClick={() => onTemplate(TEMPLATE_BAWAAN[jenis])}>
            <RotateCcw size={12} /> Kembalikan template bawaan
          </button>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Pratinjau (contoh data)</div>
          <div className="rounded-xl bg-slate-200 p-3 min-h-[10rem]">
            <div className="max-w-sm rounded-lg bg-white px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap shadow-sm">
              {renderTemplate(template, contohVariabel(jenis))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const NotifikasiTelegramPage: React.FC = () => {
  const { allSantri, halaqah, appSettings, loading, evaluationPeriods, getOrgId, fetchData, orgName } = useSupabaseData();
  const [tab, setTab] = useState<Tab>('pengaturan');
  const username = (appSettings.find((s) => s.key === 'TELEGRAM_BOT_USERNAME')?.value || '').trim();

  // ---------- Status bot ----------
  const [siap, setSiap] = useState<boolean | null>(null);
  const [otomatis, setOtomatis] = useState<string | null>(null);
  const [menyambung, setMenyambung] = useState(false);
  const muatStatus = useCallback(async () => {
    try {
      const { data } = await (supabase as any).rpc('rpc_status_telegram');
      setSiap(Boolean(data?.siap));
    } catch { setSiap(null); }
    try {
      const r = await fetch('/api/health');
      const j = await r.json().catch(() => ({}));
      setOtomatis(j?.telegramOtomatis || null);
    } catch { setOtomatis(null); }
  }, [getOrgId]);
  useEffect(() => { muatStatus(); }, [muatStatus]);

  const sambungkan = async () => {
    setMenyambung(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/telegram-webhook/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
        body: JSON.stringify({ webhookUrl: `${window.location.origin}/api/telegram-webhook`, organizationId: SupportSessionStore.getSession()?.organizationId || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      NotificationStore.addNotification('Bot tersambung. Wali sekarang bisa menautkan dengan mengirim kode ke bot.', 'success');
    } catch (e) { tampilkanError(e, 'Gagal menyambungkan bot'); }
    finally { setMenyambung(false); }
  };

  // ---------- Pengaturan pesan ----------
  const [set, setSet] = useState<Pengaturan | null>(null);
  const [setAsli, setSetAsli] = useState<string>('');
  const [menyimpan, setMenyimpan] = useState(false);
  const muatPengaturan = useCallback(async () => {
    try {
      const orgId = await getOrgId();
      const { data, error } = await (supabase as any).from('telegram_settings').select('*').eq('organization_id', orgId).maybeSingle();
      if (error) throw error;
      if (data) { setSet(data); setSetAsli(JSON.stringify(data)); }
    } catch (e) { tampilkanError(e, 'Gagal memuat pengaturan Telegram'); }
  }, [getOrgId]);
  useEffect(() => { muatPengaturan(); }, [muatPengaturan]);
  const ubahSet = (p: Partial<Pengaturan>) => setSet((s) => (s ? { ...s, ...p } : s));
  const kotor = set ? JSON.stringify(set) !== setAsli : false;
  const simpanPengaturan = async () => {
    if (!set) return;
    for (const [k, v] of [['setoran', set.setoran_template], ['kehadiran mingguan', set.mingguan_template], ['progres periode', set.periode_template]] as const) {
      if (v.trim().length < 5) { NotificationStore.addNotification(`Template ${k} terlalu pendek.`, 'error'); return; }
    }
    setMenyimpan(true);
    try {
      const orgId = await getOrgId();
      const { error } = await (supabase as any).from('telegram_settings').update({
        setoran_aktif: set.setoran_aktif, setoran_template: set.setoran_template,
        mingguan_aktif: set.mingguan_aktif, mingguan_hari: set.mingguan_hari, mingguan_jam: set.mingguan_jam, mingguan_template: set.mingguan_template,
        periode_aktif: set.periode_aktif, periode_template: set.periode_template,
      }).eq('organization_id', orgId);
      if (error) throw error;
      await muatPengaturan();
      NotificationStore.addNotification('Pengaturan pesan Telegram disimpan.', 'success');
    } catch (e) { tampilkanError(e, 'Gagal menyimpan pengaturan'); }
    finally { setMenyimpan(false); }
  };

  // ---------- Kode wali ----------
  const [filterTaut, setFilterTaut] = useState<'semua' | 'tertaut' | 'belum'>('semua');
  const [cari, setCari] = useState('');
  const [undangan, setUndangan] = useState<{ nama: string; teks: string } | null>(null);
  const santriAktif = useMemo(() => (allSantri as any[])
    .filter((s) => (s.status || 'active') === 'active')
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama))), [allSantri]);
  const halaqahSantri = useMemo(() => {
    const m = new Map<number, string>();
    (halaqah as any[]).forEach((h) => (h.santri || []).forEach((s) => m.set(Number(s.id), h.nama)));
    return m;
  }, [halaqah]);
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return santriAktif.filter((s) => (filterTaut === 'semua' || (filterTaut === 'tertaut') === Boolean(s.telegram_chat_id))
      && (!q || String(s.nama).toLowerCase().includes(q) || String(s.kode || '').toLowerCase().includes(q)));
  }, [santriAktif, filterTaut, cari]);
  const jumlahTertaut = santriAktif.filter((s) => s.telegram_chat_id).length;
  useEffect(() => {
    if (!undangan) return;
    const tutup = (e: KeyboardEvent) => { if (e.key === 'Escape') setUndangan(null); };
    window.addEventListener('keydown', tutup);
    return () => window.removeEventListener('keydown', tutup);
  }, [undangan]);
  const bukaUndangan = (s: any) => setUndangan({ nama: s.nama, teks: pesanUndangan({ nama: s.nama, kode: s.kode_telegram, lembaga: orgName, username }) });
  const buatUlang = async (s: any) => {
    if (!window.confirm(`Buat ulang kode Telegram ${s.nama}? Kode lama tidak bisa dipakai lagi. Wali yang sudah tertaut tetap menerima pesan.`)) return;
    try {
      const { error } = await (supabase as any).rpc('rpc_buat_ulang_kode_telegram', { p_santri_id: s.id, p_putuskan: false });
      if (error) throw error;
      await fetchData();
      NotificationStore.addNotification(`Kode baru untuk ${s.nama} dibuat.`, 'success');
    } catch (e) { tampilkanError(e, 'Gagal membuat ulang kode'); }
  };
  const putuskan = async (s: any) => {
    if (!window.confirm(`Putuskan Telegram wali ${s.nama}? Wali tidak lagi menerima pesan sampai mengirim kode lagi.`)) return;
    try {
      const { error } = await (supabase as any).rpc('rpc_putus_telegram', { p_santri_id: s.id });
      if (error) throw error;
      await fetchData();
      NotificationStore.addNotification('Tautan Telegram diputus.', 'success');
    } catch (e) { tampilkanError(e, 'Gagal memutus tautan'); }
  };
  const uji = async (s: any) => {
    try {
      const { error } = await (supabase as any).rpc('rpc_uji_telegram', { p_santri_id: s.id });
      if (error) throw error;
      await kirimAntrianSekarang({ tunggu: true });
      NotificationStore.addNotification(`Pesan uji untuk wali ${s.nama} dikirim. Cek status di tab Antrian.`, 'success');
      muatAntrian();
    } catch (e) { tampilkanError(e, 'Gagal mengirim pesan uji'); }
  };
  const eksporKode = () => exportToExcel(santriAktif.map((s) => ({
    NIS: s.kode || '', Nama: s.nama, Kelas: s.kelas || '', Halaqah: halaqahSantri.get(Number(s.id)) || '',
    'Kode Telegram': tampilKode(s.kode_telegram), 'Tautan Bot': tautanBot(username, s.kode_telegram) || '',
    Status: s.telegram_chat_id ? 'Tertaut' : 'Belum',
  })), 'Kode_Telegram_Wali');

  // ---------- Antrian ----------
  const [antrian, setAntrian] = useState<any[]>([]);
  const [memuatAntrian, setMemuatAntrian] = useState(false);
  const [periodeKirim, setPeriodeKirim] = useState('');
  const muatAntrian = useCallback(async () => {
    setMemuatAntrian(true);
    try {
      const orgId = await getOrgId();
      const { data, error } = await (supabase as any).from('notification_queue')
        .select('id, santri_id, jenis, status, attempts, last_error, created_at, sent_at, next_attempt_at, pesan')
        .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(150);
      if (error) throw error;
      setAntrian(data || []);
    } catch (e) { tampilkanError(e, 'Gagal memuat antrian pesan'); }
    finally { setMemuatAntrian(false); }
  }, [getOrgId]);
  useEffect(() => { if (tab === 'antrian') muatAntrian(); }, [tab, muatAntrian]);
  const namaSantri = (id: number) => (allSantri as any[]).find((s) => Number(s.id) === Number(id))?.nama || '-';
  const ringkasAntrian = useMemo(() => antrian.reduce((m: Record<string, number>, q) => ({ ...m, [q.status]: (m[q.status] || 0) + 1 }), {}), [antrian]);

  const kirimSekarang = async () => {
    const r = await kirimAntrianSekarang({ tunggu: true });
    if (r.ok) NotificationStore.addNotification(`Antrian diproses: ${r.data?.terkirim ?? 0} terkirim${r.data?.dicobaLagi ? `, ${r.data.dicobaLagi} dicoba lagi` : ''}${r.data?.gagal ? `, ${r.data.gagal} gagal` : ''}.`, 'success');
    else NotificationStore.addNotification(r.error || 'Gagal memproses antrian.', 'error');
    muatAntrian();
  };
  const rpcAntrian = async (fn: string, args: any, pesanOk: string) => {
    try {
      const { data, error } = await (supabase as any).rpc(fn, args);
      if (error) throw error;
      NotificationStore.addNotification(typeof pesanOk === 'string' ? pesanOk.replace('{n}', String(data?.antri ?? '')) : 'OK', 'success');
      await kirimAntrianSekarang({ tunggu: true });
      muatAntrian();
    } catch (e) { tampilkanError(e, 'Gagal'); }
  };
  const kirimProgres = async () => {
    if (!periodeKirim) { NotificationStore.addNotification('Pilih periode dulu.', 'error'); return; }
    const ulang = window.confirm('Kirim ULANG ke wali yang sudah menerima pesan periode ini?\n\nOK = kirim ulang ke semua · Batal = hanya yang belum menerima');
    await rpcAntrian('rpc_kirim_progres_periode', { p_period: periodeKirim, p_halaqah: null, p_ulang: ulang }, '{n} pesan progres periode diantrikan.');
  };
  const batalPesan = async (q: any) => {
    if (!window.confirm(`Batalkan pesan ${JENIS_LABEL[q.jenis] || q.jenis} untuk wali ${namaSantri(q.santri_id)}? Pesan tidak akan dikirim.`)) return;
    await rpcAntrian('rpc_antrian_batal', { p_id: q.id }, 'Pesan dibatalkan.');
  };

  if (loading && !set) return <LoadingState label="Memuat Notifikasi Telegram…" />;

  const tabBtn = (t: Tab, teks: string) => (
    <button type="button" onClick={() => setTab(t)} className={`tab ${tab === t ? 'tab-aktif' : ''}`}>{teks}</button>
  );

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Notifikasi Telegram"
        description="Pesan otomatis ke wali: setoran (Mode Harian), rekap kehadiran mingguan, dan capaian per periode. Wali menautkan cukup dengan mengirim kode santri ke bot."
      />

      {/* Status */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className={`rounded-2xl border p-4 h-full flex flex-col justify-between ${siap ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Bot size={16} /> Bot Telegram</div>
            <p className="text-xs text-slate-600 mt-1">{siap ? `Token aktif${username ? ` · @${username.replace(/^@/, '')}` : ''}.` : 'Token bot belum diatur atau dinonaktifkan.'}</p>
          </div>
          <div>
            {!siap && <Link to="/app/settings/integrations" className="text-xs font-semibold text-blue-700 mt-2 inline-block">Atur token di Pengaturan › Integrasi →</Link>}
            {siap && !username && <p className="text-xs text-amber-700 mt-2">Isi username bot di Pengaturan › Integrasi agar tautan undangan bisa dibuat.</p>}
          </div>
        </div>
        <div className="card p-4 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Link2 size={16} /> Penautan otomatis</div>
            <p className="text-xs text-slate-600 mt-1">Sambungkan sekali setelah token disimpan atau diganti. Wali lalu bisa mengirim kode ke bot.</p>
          </div>
          <div className="mt-3">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!siap || menyambung} onClick={sambungkan}><Link2 size={14} /> {menyambung ? 'Menyambungkan…' : 'Sambungkan bot'}</button>
          </div>
        </div>
        <div className={`rounded-2xl border p-4 h-full flex flex-col justify-between ${otomatis === 'siap' ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Send size={16} /> Pengiriman server</div>
            <p className="text-xs text-slate-600 mt-1">
              {otomatis === 'siap' ? 'Siap: pesan dikirim otomatis tiap menit.' : otomatis === 'belum_diatur'
                ? 'Belum aktif: SUPABASE_SERVICE_ROLE_KEY belum diatur di Netlify (lihat panduan Fase 6).'
                : 'Status server tidak terbaca.'}
            </p>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabBtn('pengaturan', 'Pesan & jadwal')}
        {tabBtn('kode', `Kode wali (${jumlahTertaut}/${santriAktif.length} tertaut)`)}
        {tabBtn('antrian', 'Antrian & kirim')}
      </div>

      {tab === 'pengaturan' && (set ? (
        <div className="space-y-4">
          <EditorTemplate jenis="setoran" judul="Setoran harian" ket="Dikirim setiap setoran baru di halaqah Mode Harian (Mode Rekap tidak per setoran)."
            aktif={set.setoran_aktif} template={set.setoran_template} onAktif={(v) => ubahSet({ setoran_aktif: v })} onTemplate={(v) => ubahSet({ setoran_template: v })} />
          <EditorTemplate jenis="mingguan" judul="Rekap kehadiran mingguan" ket="Rekap 7 hari terakhir dari absensi, otomatis pada hari & jam di bawah (waktu lembaga)."
            aktif={set.mingguan_aktif} template={set.mingguan_template} onAktif={(v) => ubahSet({ mingguan_aktif: v })} onTemplate={(v) => ubahSet({ mingguan_template: v })}>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs font-semibold text-slate-600">Hari<br />
                <select className={inputCls} value={set.mingguan_hari} onChange={(e) => ubahSet({ mingguan_hari: Number(e.target.value) })}>
                  {HARI.map((h, i) => <option key={h} value={i}>{h}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Jam<br />
                <select className={inputCls} value={set.mingguan_jam} onChange={(e) => ubahSet({ mingguan_jam: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}.00</option>)}
                </select>
              </label>
              {set.mingguan_terakhir && <span className="text-xs text-slate-500 pb-2">Terakhir: {set.mingguan_terakhir}</span>}
            </div>
          </EditorTemplate>
          <EditorTemplate jenis="periode" judul="Capaian per periode" ket="Dikirim saat form evaluasi periode halaqah dikirim (Terkirim). Admin juga bisa mengirim dari tab Antrian."
            aktif={set.periode_aktif} template={set.periode_template} onAktif={(v) => ubahSet({ periode_aktif: v })} onTemplate={(v) => ubahSet({ periode_template: v })} />
          <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-white/90 backdrop-blur border-t border-slate-200 py-3">
            <span className="text-xs text-slate-500">{kotor ? 'Ada perubahan belum disimpan' : 'Tersimpan'}</span>
            <button type="button" className={btnUtama} disabled={!kotor || menyimpan} onClick={simpanPengaturan}><Save size={15} /> {menyimpan ? 'Menyimpan…' : 'Simpan pengaturan'}</button>
          </div>
        </div>
      ) : <LoadingState rows={3} label="Memuat pengaturan…" />)}

      {tab === 'kode' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-700">
            Bagikan <b>pesan undangan</b> ke wali (WhatsApp/kertas). Wali membuka bot lalu mengirim kode; balasan bot memuat nama ananda.
            Satu Telegram wali boleh untuk beberapa anak (kirim semua kodenya). Wali bisa berhenti dengan /berhenti.
          </div>
          <div className="panel-filter">
            <div className="grid-filter sm:grid-cols-3 lg:grid-cols-3 items-center">
              <label className="kontrol-label">
                <span>Status</span>
                <select className="kontrol-dalam" value={filterTaut} onChange={(e) => setFilterTaut(e.target.value as any)}>
                  <option value="semua">Semua</option><option value="tertaut">Tertaut</option><option value="belum">Belum tertaut</option>
                </select>
              </label>
              <input className="kontrol kontrol-cari" placeholder="Cari nama / NIS..." value={cari} onChange={(e) => setCari(e.target.value)} />
              <button type="button" className="btn btn-secondary h-[44px]" onClick={eksporKode}><Download size={15} /> Ekspor kode</button>
            </div>
          </div>
          {baris.length === 0 ? <EmptyState title="Tidak ada santri" description="Tidak ada santri aktif yang cocok dengan filter." /> : (
            <div className="wadah-tabel overflow-x-auto">
              <table className="tabel tabel-kartu">
                <thead><tr>
                  <th className="text-left">Santri</th><th className="text-left">Kode</th><th className="text-left">Telegram wali</th><th className="text-right">Aksi</th>
                </tr></thead>
                <tbody>
                  {baris.slice(0, 400).map((s) => (
                    <tr key={s.id}>
                      <td data-label="Santri"><div className="font-semibold text-slate-800">{s.nama}</div><div className="text-2xs text-slate-400">{s.kode || '-'} · {halaqahSantri.get(Number(s.id)) || s.kelas || '-'}</div></td>
                      <td data-label="Kode" className="font-mono tracking-wider text-slate-700">{tampilKode(s.kode_telegram)}</td>
                      <td data-label="Telegram wali">{s.telegram_chat_id
                        ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold"><CheckCircle2 size={14} /> Tertaut{s.telegram_linked_at ? ` · ${new Date(s.telegram_linked_at).toLocaleDateString('id-ID')}` : ''}</span>
                        : <span className="text-xs text-slate-400">Belum</span>}</td>
                      <td data-label="Aksi" className="text-right whitespace-nowrap">
                        <button type="button" className="text-xs font-semibold text-blue-700 mr-3 inline-flex items-center gap-1" disabled={!s.kode_telegram} onClick={() => bukaUndangan(s)}><Copy size={12} /> Undangan</button>
                        {s.telegram_chat_id && <button type="button" className="text-xs font-semibold text-slate-600 mr-3 inline-flex items-center gap-1" onClick={() => uji(s)}><Send size={12} /> Uji</button>}
                        <button type="button" className="text-xs font-semibold text-slate-600 mr-3 inline-flex items-center gap-1" onClick={() => buatUlang(s)}><RefreshCw size={12} /> Kode baru</button>
                        {s.telegram_chat_id && <button type="button" className="text-xs font-semibold text-red-600 inline-flex items-center gap-1" onClick={() => putuskan(s)}><Unlink size={12} /> Putuskan</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {baris.length > 400 && <div className="px-4 py-2 text-xs text-slate-500">Menampilkan 400 dari {baris.length}. Persempit dengan pencarian atau gunakan Ekspor.</div>}
            </div>
          )}
          {undangan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setUndangan(null)}>
              <div className="w-full max-w-lg rounded-2xl bg-white p-5 space-y-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Undangan wali · {undangan.nama}</h3>
                  <button type="button" onClick={() => setUndangan(null)} className="text-slate-400 hover:text-slate-700"><XCircle size={18} /></button></div>
                <textarea readOnly rows={9} className="field !h-auto py-2 text-sm" value={undangan.teks} onFocus={(e) => e.target.select()} />
                <div className="flex justify-end gap-2">
                  <a className={btn} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(undangan.teks)}`}>Bagikan via WhatsApp</a>
                  <button type="button" className={btnUtama} onClick={() => salin(undangan.teks, 'Pesan undangan disalin.')}><Copy size={14} /> Salin</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'antrian' && (
        <div className="space-y-4">
          <div className="panel-filter space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" className={btnUtama} onClick={kirimSekarang}><Send size={15} /> Kirim antrian sekarang</button>
              <button type="button" className={btn} onClick={() => rpcAntrian('rpc_kirim_kehadiran_mingguan', { p_selesai: null }, '{n} rekap kehadiran 7 hari terakhir diantrikan.')}>Kirim rekap kehadiran minggu ini</button>
              <button type="button" className={btn} onClick={muatAntrian} disabled={memuatAntrian}><RefreshCw size={14} /> Muat ulang</button>
            </div>
            <div className="grid-filter sm:grid-cols-2 lg:grid-cols-2 items-center pt-2 border-t border-slate-100">
              <label className="kontrol-label">
                <span>Periode</span>
                <select className="kontrol-dalam" value={periodeKirim} onChange={(e) => setPeriodeKirim(e.target.value)}>
                  <option value="">— pilih periode —</option>
                  {[...(evaluationPeriods as any[])].filter((p) => !p.needs_review).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
                    .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-secondary h-[44px]" onClick={kirimProgres}>Kirim capaian periode</button>
            </div>
          </div>
          {Object.keys(ringkasAntrian).length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(ringkasAntrian).map(([k, n]) => <span key={k} className={`badge border ${STATUS_LABEL[k]?.c || ''}`}>{STATUS_LABEL[k]?.t || k} {n}</span>)}
            </div>
          )}
          {memuatAntrian && !antrian.length ? <LoadingState rows={4} label="Memuat antrian…" /> : antrian.length === 0
            ? <EmptyState title="Belum ada pesan" description="Pesan muncul di sini setelah ada setoran, form periode terkirim, atau jadwal mingguan — untuk wali yang sudah menautkan Telegram." />
            : (
              <div className="wadah-tabel overflow-x-auto">
                <table className="tabel tabel-kartu">
                  <thead><tr>
                    <th className="text-left">Waktu</th><th className="text-left">Santri</th><th className="text-left">Jenis</th>
                    <th className="text-left">Status</th><th className="text-left">Keterangan</th><th className="text-right">Aksi</th>
                  </tr></thead>
                  <tbody>
                    {antrian.map((q) => (
                      <tr key={q.id} title={q.pesan}>
                        <td data-label="Waktu" className="text-xs text-slate-500 whitespace-nowrap tabular-nums">{new Date(q.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td data-label="Santri" className="font-semibold text-slate-800">{namaSantri(q.santri_id)}</td>
                        <td data-label="Jenis" className="text-xs">{JENIS_LABEL[q.jenis] || q.jenis}</td>
                        <td data-label="Status"><span className={`badge border ${STATUS_LABEL[q.status]?.c || ''}`}>{STATUS_LABEL[q.status]?.t || q.status}</span></td>
                        <td data-label="Keterangan" className="text-xs text-slate-500 max-w-xs truncate">
                          {q.status === 'terkirim' && q.sent_at ? `Terkirim ${new Date(q.sent_at).toLocaleTimeString('id-ID', { timeStyle: 'short' })}` : q.last_error ? `${terjemahGalat(q.last_error)}${q.attempts ? ` (percobaan ${q.attempts})` : ''}` : '-'}
                        </td>
                        <td data-label="Aksi" className="text-right whitespace-nowrap">
                          {['gagal', 'batal'].includes(q.status) && <button type="button" className="text-xs font-semibold text-blue-700 mr-3" onClick={() => rpcAntrian('rpc_antrian_ulangi', { p_id: q.id }, 'Pesan diantrikan ulang.')}>Ulangi</button>}
                          {['antri', 'proses', 'gagal'].includes(q.status) && <button type="button" className="text-xs font-semibold text-red-600" onClick={() => batalPesan(q)}>Batalkan</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default NotifikasiTelegramPage;
