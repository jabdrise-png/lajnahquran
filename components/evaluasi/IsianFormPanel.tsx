/**
 * Fase 4 · Isian Form Evaluasi Periode (spesifikasi 6.2).
 *  - Isian sistem (ziyadah, murojaah, posisi, kelancaran, kehadiran): dipakai perhitungan;
 *    nama boleh diganti, tidak bisa dihapus/dinonaktifkan.
 *  - Isian bebas santri buatan Admin: angka, pilihan, ya/tidak, teks — hanya ditampilkan.
 *  - Pertanyaan evaluasi kegiatan halaqah.
 */
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import type { FieldOption, FieldType, PeriodFormField } from '../../lib/rekapAdapter';

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const JENIS: Record<Exclude<FieldType, 'system'>, string> = { number: 'Angka', choice: 'Pilihan', boolean: 'Ya / Tidak', text: 'Teks' };

interface Draf { id?: string; scope: 'santri' | 'kegiatan'; label: string; field_type: Exclude<FieldType, 'system'>; optionsText: string; description: string; sort_order: number }

const keOpsi = (teks: string, lama: FieldOption[] = []): FieldOption[] =>
  teks.split('\n').map((b) => b.trim()).filter(Boolean).map((b) => {
    const m = b.match(/^(.*?)\s*=\s*(-?\d+(?:[.,]\d+)?)$/);
    const label = (m ? m[1] : b).trim();
    const prev = lama.find((o) => o.label === label);
    return { label, score: m ? Number(m[2].replace(',', '.')) : prev?.score ?? null, color: prev?.color ?? null };
  });
const dariOpsi = (o: FieldOption[]) => o.map((x) => (x.score !== null && x.score !== undefined ? `${x.label} = ${x.score}` : x.label)).join('\n');

const IsianFormPanel: React.FC = () => {
  const { periodFormFields, simpanIsianForm, hapusIsianForm, userProfile } = useSupabaseData();
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(String(userProfile?.role || '').toLowerCase());
  const [draf, setDraf] = useState<Draf | null>(null);
  const [busy, setBusy] = useState(false);

  const urut = (scope: 'santri' | 'kegiatan', sistem: boolean) => periodFormFields
    .filter((f) => f.scope === scope && Boolean(f.system_key) === sistem)
    .sort((a, b) => a.sort_order - b.sort_order);
  const sistem = urut('santri', true);
  const bebas = urut('santri', false);
  const kegiatan = urut('kegiatan', false);

  const jalankan = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); NotificationStore.addNotification(ok, 'success'); return true; }
    catch (e) { tampilkanError(e, 'Gagal menyimpan isian'); return false; }
    finally { setBusy(false); }
  };

  const simpan = async () => {
    if (!draf) return;
    const asal = periodFormFields.find((f) => f.id === draf.id);
    const options = draf.field_type === 'choice' ? keOpsi(draf.optionsText, asal?.options) : [];
    if (!draf.label.trim()) { NotificationStore.addNotification('Nama isian wajib diisi.', 'error'); return; }
    if (draf.field_type === 'choice' && options.length === 0) { NotificationStore.addNotification('Isian pilihan wajib punya minimal satu pilihan.', 'error'); return; }
    const ok = await jalankan(() => simpanIsianForm({
      id: draf.id, scope: draf.scope, label: draf.label, field_type: draf.field_type, options,
      description: draf.description.trim() || null, sort_order: draf.sort_order, is_active: asal?.is_active ?? true,
    }), `Isian "${draf.label.trim()}" disimpan.`);
    if (ok) setDraf(null);
  };

  const pindah = async (list: PeriodFormField[], i: number, arah: -1 | 1) => {
    const a = list[i], b = list[i + arah];
    if (!a || !b) return;
    await jalankan(async () => {
      await simpanIsianForm({ ...a, sort_order: b.sort_order === a.sort_order ? b.sort_order + arah : b.sort_order });
      await simpanIsianForm({ ...b, sort_order: a.sort_order });
    }, 'Urutan diperbarui.');
  };

  const baru = (scope: 'santri' | 'kegiatan', list: PeriodFormField[]) =>
    setDraf({ scope, label: '', field_type: scope === 'kegiatan' ? 'text' : 'choice', optionsText: '', description: '',
      sort_order: Math.max(scope === 'santri' ? 10 : 0, ...list.map((f) => f.sort_order)) + 1 });

  const editor = draf && (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{draf.scope === 'kegiatan' ? 'Pertanyaan' : 'Nama isian'}
        <input className={`${inputCls} mt-1`} value={draf.label} onChange={(e) => setDraf({ ...draf, label: e.target.value })} />
      </label>
      <label className="text-xs font-semibold text-slate-600">Jenis jawaban
        <select className={`${inputCls} mt-1`} value={draf.field_type} onChange={(e) => setDraf({ ...draf, field_type: e.target.value as Draf['field_type'] })}>
          {Object.entries(JENIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {draf.field_type === 'choice' && (
        <label className="text-xs font-semibold text-slate-600 sm:col-span-3">Pilihan (satu per baris; boleh beri skor: <code>Baik = 90</code>)
          <textarea rows={4} className={`${inputCls} mt-1 font-mono`} value={draf.optionsText} onChange={(e) => setDraf({ ...draf, optionsText: e.target.value })} />
        </label>
      )}
      <label className="text-xs font-semibold text-slate-600 sm:col-span-3">Keterangan (opsional)
        <input className={`${inputCls} mt-1`} value={draf.description} onChange={(e) => setDraf({ ...draf, description: e.target.value })} />
      </label>
      <div className="sm:col-span-3 flex justify-end gap-2">
        <button type="button" onClick={() => setDraf(null)} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700">Batal</button>
        <button type="button" disabled={busy} onClick={simpan} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Simpan</button>
      </div>
    </div>
  );

  const daftar = (list: PeriodFormField[]) => (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      {list.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">Belum ada.</p>}
      {list.map((f, i) => (
        <div key={f.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${f.is_active ? '' : 'opacity-50'}`}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800">{f.label}</div>
            <div className="text-[11px] text-slate-400">
              {JENIS[f.field_type as keyof typeof JENIS] || f.field_type}
              {f.field_type === 'choice' && `: ${f.options.map((o) => o.label).join(', ')}`}
              {f.legacy_ref && ' · dari aplikasi lama'}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 text-slate-500">
              <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={f.is_active} disabled={busy}
                onChange={(e) => jalankan(() => simpanIsianForm({ ...f, is_active: e.target.checked }), 'Isian diperbarui.')} /> Aktif</label>
              <button type="button" title="Naik" disabled={busy || i === 0} onClick={() => pindah(list, i, -1)} className="disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" title="Turun" disabled={busy || i === list.length - 1} onClick={() => pindah(list, i, 1)} className="disabled:opacity-30"><ArrowDown size={14} /></button>
              <button type="button" title="Ubah" onClick={() => setDraf({ id: f.id, scope: f.scope, label: f.label, field_type: f.field_type as Draf['field_type'], optionsText: dariOpsi(f.options), description: f.description || '', sort_order: f.sort_order })}><Pencil size={14} /></button>
              <button type="button" title="Hapus" className="hover:text-red-600" onClick={() => {
                if (window.confirm(`Hapus isian "${f.label}"? Jawaban yang sudah tersimpan tidak tampil lagi.`)) jalankan(() => hapusIsianForm(f.id), 'Isian dihapus.');
              }}><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Isian Form Evaluasi Periode</h2>
        <p className="text-xs sm:text-sm text-slate-500">Isian sistem dipakai perhitungan (nama boleh diganti). Isian bebas & pertanyaan kegiatan hanya ditampilkan di form dan laporan.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Lock size={13} /> Isian sistem</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {sistem.map((f) => (
            <label key={f.id} className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-500">
              {f.description || f.system_key}
              <input className={`${inputCls} mt-1`} defaultValue={f.label} disabled={!isAdmin || busy}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== f.label && jalankan(() => simpanIsianForm({ ...f, label: e.target.value }), 'Nama isian diganti.')} />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Isian bebas santri</h3>
          {isAdmin && <button type="button" onClick={() => baru('santri', bebas)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Plus size={14} /> Tambah isian</button>}
        </div>
        {draf?.scope === 'santri' && editor}
        {daftar(bebas)}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Evaluasi kegiatan halaqah</h3>
          {isAdmin && <button type="button" onClick={() => baru('kegiatan', kegiatan)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Plus size={14} /> Tambah pertanyaan</button>}
        </div>
        {draf?.scope === 'kegiatan' && editor}
        {daftar(kegiatan)}
      </div>
    </section>
  );
};

export default IsianFormPanel;
