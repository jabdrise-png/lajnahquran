/**
 * Fase 4 · Kelola Periode Evaluasi (tabel evaluation_periods, menggantikan JSON app_settings).
 * Periode tidak boleh tumpang tindih (dijaga database). Periode hasil pemindahan data lama yang
 * tanggalnya meragukan ditandai "perlu dicek" sampai Admin memperbaiki tanggalnya.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useMintaAlasan } from '../ui/AlasanDialog';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { periodeBentrok, type EvaluationPeriod } from '../../lib/rekapAdapter';

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

interface Draf { id?: string; name: string; start_date: string; end_date: string; academic_year_id: number | null }

const tambahHari = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const akhirBulan = (d: string) => {
  const t = new Date(d + 'T00:00:00Z');
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

const PeriodeEvaluasiPanel: React.FC = () => {
  const { evaluationPeriods, periodRecaps, selectedAcademicYear, simpanPeriode, hapusPeriode, userProfile } = useSupabaseData();
  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(String(userProfile?.role || '').toLowerCase());
  const [draf, setDraf] = useState<Draf | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogAlasan, mintaAlasan] = useMintaAlasan();

  const list: EvaluationPeriod[] = useMemo(
    () => [...evaluationPeriods].sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [evaluationPeriods]
  );
  const jumlahRekap = useMemo(() => {
    const m = new Map<string, number>();
    periodRecaps.forEach((r) => m.set(r.period_id, (m.get(r.period_id) || 0) + 1));
    return m;
  }, [periodRecaps]);
  const perluCek = list.filter((p) => p.needs_review);

  const baru = () => {
    const terakhir = [...evaluationPeriods].filter((p) => !p.needs_review).sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
    const mulai = terakhir ? tambahHari(terakhir.end_date, 1) : new Date().toISOString().slice(0, 8) + '01';
    setDraf({ name: '', start_date: mulai, end_date: akhirBulan(mulai), academic_year_id: selectedAcademicYear?.id ?? null });
  };

  const bentrok = draf && draf.start_date && draf.end_date ? periodeBentrok(evaluationPeriods, draf) : undefined;

  const simpan = async () => {
    if (!draf) return;
    if (!draf.name.trim()) { NotificationStore.addNotification('Nama periode wajib diisi.', 'error'); return; }
    if (draf.end_date < draf.start_date) { NotificationStore.addNotification('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'error'); return; }
    setBusy(true);
    try {
      await simpanPeriode(draf);
      NotificationStore.addNotification(`Periode "${draf.name.trim()}" disimpan.`, 'success');
      setDraf(null);
    } catch (e) { tampilkanError(e, 'Gagal menyimpan periode'); } finally { setBusy(false); }
  };

  const hapus = async (p: EvaluationPeriod) => {
    const n = jumlahRekap.get(p.id) || 0;
    let alasan: string | null = null;
    if (n > 0) {
      alasan = await mintaAlasan({ title: `Hapus periode "${p.name}"`, description: `Periode ini berisi ${n} rekap santri yang ikut terhapus permanen.`, danger: true, confirmLabel: 'Hapus' });
      if (alasan === null) return;
    } else if (!window.confirm(`Hapus periode "${p.name}"?`)) return;
    try {
      await hapusPeriode(p.id, alasan);
      NotificationStore.addNotification(`Periode "${p.name}" dihapus.`, 'success');
    } catch (e) { tampilkanError(e, 'Gagal menghapus periode'); }
  };

  return (
    <section className="space-y-3">
      {dialogAlasan}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Periode Evaluasi</h2>
          <p className="text-xs sm:text-sm text-slate-500">Satu daftar periode per lembaga, tidak boleh tumpang tindih. Dipakai Rekap Periode, target murojaah, dan pesan progres.</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={baru} className="btn btn-primary">
            <Plus size={15} /> Periode baru
          </button>
        )}
      </div>

      {perluCek.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{perluCek.length} periode hasil pemindahan data lama perlu dicek tanggalnya (tidak lengkap atau tumpang tindih). Form periode tersebut belum bisa dibuka sampai tanggalnya diperbaiki.</span>
        </div>
      )}

      {draf && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Nama periode
            <input className={`${inputCls} mt-1`} value={draf.name} placeholder="mis. Periode 1 (Juli)" onChange={(e) => setDraf({ ...draf, name: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Mulai
            <input type="date" className={`${inputCls} mt-1`} value={draf.start_date} onChange={(e) => setDraf({ ...draf, start_date: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Selesai
            <input type="date" className={`${inputCls} mt-1`} value={draf.end_date} min={draf.start_date} onChange={(e) => setDraf({ ...draf, end_date: e.target.value })} />
          </label>
          {bentrok && (
            <p className="sm:col-span-4 text-xs text-red-700">Tumpang tindih dengan "{bentrok.name}" ({bentrok.start_date} s.d. {bentrok.end_date}).</p>
          )}
          <div className="sm:col-span-4 flex justify-end gap-2">
            <button type="button" onClick={() => setDraf(null)} className="btn btn-secondary btn-sm">Batal</button>
            <button type="button" disabled={busy || Boolean(bentrok)} onClick={simpan} className="btn btn-primary btn-sm">
              {busy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Periode</th>
              <th className="px-3 py-2 text-left">Tanggal</th>
              <th className="px-3 py-2 text-right">Rekap santri</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Belum ada periode.</td></tr>}
            {list.map((p) => (
              <tr key={p.id} className={p.needs_review ? 'bg-amber-50/50' : ''}>
                <td className="px-3 py-2 font-semibold text-slate-800">
                  {p.name}
                  {p.needs_review && <span className="ml-2 text-2xs font-semibold text-amber-700">perlu dicek</span>}
                  {p.legacy_key && <div className="text-2xs font-normal text-slate-400">dari aplikasi lama ({p.legacy_key})</div>}
                </td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{p.start_date} s.d. {p.end_date}</td>
                <td className="px-3 py-2 text-right tabular-nums">{jumlahRekap.get(p.id) ?? '-'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {isAdmin && (
                    <>
                      <button type="button" title="Ubah" className="text-slate-500 hover:text-blue-600 mr-3"
                        onClick={() => setDraf({ id: p.id, name: p.name, start_date: p.start_date, end_date: p.end_date, academic_year_id: p.academic_year_id })}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" title="Hapus" className="text-slate-500 hover:text-red-600" onClick={() => hapus(p)}><Trash2 size={14} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-slate-400">Jumlah rekap dihitung untuk periode tahun ajaran terpilih.</p>
    </section>
  );
};

export default PeriodeEvaluasiPanel;
