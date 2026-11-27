/**
 * Fase 4 · Progres & Evaluasi (menggantikan PerkembanganMasterDataPage).
 *  - Pemantauan Periode : status pengisian form semua halaqah (Admin) / halaqahnya (Musammi').
 *  - Rekap Santri       : satu angka resmi per santri per periode (period_recaps) + ekspor Excel.
 *  - Pivot & Statistik  : analitik lama, kini membaca Rekap Periode lewat lib/rekapAdapter.
 * Tidak ada lagi input/ubah capaian di halaman ini: isi lewat Form Evaluasi Periode.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calculator, Download, ExternalLink, RefreshCw, Search, Unlock } from 'lucide-react';
import { useSupabaseData, useRiwayat } from '../../hooks/useSupabaseData';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { exportToExcel } from '../../lib/utils';
import { hariIni } from '../../lib/sesiHalaqah';
import { SantriDetailProgressView } from '../../components/SantriDetailProgressView';
import StudentProgressComponent from '../StudentProgress';
import StatistikPerkembangan from '../StatistikPerkembangan';
import {
  MODE_LABEL, STATUS_FORM_LABEL, labelIsianSistem, periodeBawaan, periodeTahunAjaran, teksPosisi,
  type EvaluationPeriod, type FormStatus, type RecordingMode,
} from '../../lib/rekapAdapter';

type Tab = 'pemantauan' | 'rekap' | 'pivot' | 'statistik';

interface StatusHalaqah {
  halaqah_id: number;
  halaqah_nama: string;
  marhalah: string | null;
  musammi_nama: string | null;
  recording_mode: RecordingMode;
  status: FormStatus;
  form_id: string | null;
  jumlah_santri: number;
  terisi: number;
  submitted_at: string | null;
  updated_at: string | null;
}

const selectCls = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const badge: Record<FormStatus, string> = {
  belum_diisi: 'bg-slate-100 text-slate-600 border-slate-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const ProgresEvaluasiPage: React.FC = () => {
  const {
    santri, allSantri, halaqah, attendance, setoranHarian, studentProgress, studentEvaluations, classTargets, appSettings,
    evaluationSettings, userProfile, loading, evaluationPeriods, periodeEvaluasi, periodRecaps, periodFormFields,
    masterMarhalahs, selectedAcademicYear, statusPeriode, hitungRekapHarian, bukaKembaliFormPeriode,
  } = useSupabaseData();
  useRiwayat(); // Fase 7: riwayat absensi/setoran dimuat saat halaman ini dibuka
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const today = hariIni();

  const periods = useMemo(() => periodeTahunAjaran(evaluationPeriods, selectedAcademicYear?.id), [evaluationPeriods, selectedAcademicYear]);
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'pemantauan');
  const [periodId, setPeriodId] = useState(params.get('period') || '');
  const [filterMarhalah, setFilterMarhalah] = useState('all');
  const [filterKelas, setFilterKelas] = useState('all');
  const [filterHalaqah, setFilterHalaqah] = useState('all');
  const [cari, setCari] = useState('');
  const [status, setStatus] = useState<StatusHalaqah[]>([]);
  const [memuatStatus, setMemuatStatus] = useState(false);
  const [menghitung, setMenghitung] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [dialogAlasan, mintaAlasan] = useMintaAlasan();

  useEffect(() => {
    if (periods.length === 0) return;
    if (!periodId || !periods.some((p) => p.id === periodId)) setPeriodId(periodeBawaan<EvaluationPeriod>(periods, today)?.id || '');
  }, [periods, periodId, today]);
  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set('tab', tab);
    if (periodId) p.set('period', periodId);
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, periodId]);

  const periode = periods.find((p) => p.id === periodId);

  const muatStatus = useCallback(async () => {
    if (!periodId || periode?.needs_review) { setStatus([]); return; }
    setMemuatStatus(true);
    try {
      const rows = await statusPeriode(periodId);
      setStatus(rows.map((r: any) => ({ ...r, halaqah_id: Number(r.halaqah_id), jumlah_santri: Number(r.jumlah_santri) || 0, terisi: Number(r.terisi) || 0 })));
    } catch (e) {
      tampilkanError(e, 'Gagal memuat status periode');
    } finally {
      setMemuatStatus(false);
    }
  }, [periodId, periode?.needs_review, statusPeriode]);
  useEffect(() => { if (tab === 'pemantauan') muatStatus(); }, [tab, muatStatus]);

  const ringkas = useMemo(() => ({
    total: status.length,
    terkirim: status.filter((s) => s.status === 'submitted').length,
    draft: status.filter((s) => s.status === 'draft').length,
    belum: status.filter((s) => s.status === 'belum_diisi').length,
  }), [status]);

  const hitungSemua = async () => {
    if (!periodId) return;
    setMenghitung(true);
    try {
      const r: any = await hitungRekapHarian(periodId, null);
      NotificationStore.addNotification(`Rekap dihitung untuk ${r?.halaqah_count ?? 0} halaqah (${r?.recap_count ?? 0} santri).`, 'success');
      await muatStatus();
    } catch (e) { tampilkanError(e, 'Gagal menghitung rekap'); } finally { setMenghitung(false); }
  };

  const bukaKembali = async (s: StatusHalaqah) => {
    if (!s.form_id) return;
    const alasan = await mintaAlasan({ title: `Buka kembali form ${s.halaqah_nama}`, description: 'Form kembali menjadi Draft.', confirmLabel: 'Buka kembali' });
    if (alasan === null) return;
    try {
      await bukaKembaliFormPeriode(s.form_id, alasan);
      NotificationStore.addNotification('Form dibuka kembali.', 'success');
      await muatStatus();
    } catch (e) { tampilkanError(e, 'Gagal membuka kembali form'); }
  };

  // ---------- Rekap santri ----------
  const label = labelIsianSistem(periodFormFields);
  const isianBebas = periodFormFields.filter((f) => f.scope === 'santri' && !f.system_key && f.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const santriById = useMemo(() => new Map((allSantri || santri).map((s: any) => [Number(s.id), s])), [allSantri, santri]);
  const halaqahById = useMemo(() => new Map(halaqah.map((h) => [Number(h.id), h])), [halaqah]);
  const kelasList = useMemo(() => Array.from(new Set(santri.filter((s) => filterMarhalah === 'all' || s.marhalah === filterMarhalah).map((s) => s.kelas).filter(Boolean))).sort(), [santri, filterMarhalah]);

  const rekapRows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return periodRecaps
      .filter((r) => r.period_id === periodId)
      .map((r) => ({ r, s: santriById.get(r.santri_id), h: r.halaqah_id ? halaqahById.get(r.halaqah_id) : undefined }))
      .filter(({ s, h }) => s
        && (filterMarhalah === 'all' || s.marhalah === filterMarhalah)
        && (filterKelas === 'all' || s.kelas === filterKelas)
        && (filterHalaqah === 'all' || String(h?.id) === filterHalaqah)
        && (!q || s.nama.toLowerCase().includes(q)))
      .sort((a, b) => (a.h?.nama || '').localeCompare(b.h?.nama || '') || a.s.nama.localeCompare(b.s.nama));
  }, [periodRecaps, periodId, santriById, halaqahById, filterMarhalah, filterKelas, filterHalaqah, cari]);

  const nilaiBebas = (v: any) => (v === true ? 'Ya' : v === false ? 'Tidak' : v ?? '');

  const ekspor = () => {
    exportToExcel(rekapRows.map(({ r, s, h }, i) => {
      const row: Record<string, any> = {
        No: i + 1, NIS: s.kode || '', Nama: s.nama, Marhalah: s.marhalah, Kelas: s.kelas, Halaqah: h?.nama || '',
        Sumber: r.sumber === 'harian' ? 'Harian' : r.sumber === 'rekap' ? 'Rekap' : 'Data lama',
        [`${label.ziyadah}`]: r.ziyadah_pages ?? '', [`${label.murojaah}`]: r.murojaah_pages ?? '',
        [label.posisi]: teksPosisi(r), 'Total Hafalan (juz)': r.total_juz ?? '', 'Total Hafalan (halaman)': r.total_pages ?? '',
        [label.kelancaran]: r.kelancaran || '', [`${label.kehadiran} (%)`]: r.kehadiran_persen ?? '',
      };
      isianBebas.forEach((f) => { row[f.label] = nilaiBebas(r.free_answers?.[f.id]); });
      row.Catatan = r.notes || '';
      return row;
    }), `Rekap_Periode_${(periode?.name || 'periode').replace(/\s+/g, '_')}`);
  };

  // ---------- Detail santri (komponen lama) ----------
  const evalColors = useMemo(() => {
    const out: Record<string, string> = {};
    try { Object.assign(out, JSON.parse(appSettings.find((s: any) => s.key === 'EVALUATION_COLORS')?.value || '{}')); } catch { /* abaikan */ }
    (evaluationSettings || []).forEach((e: any) => { if (e.color) out[e.label] = e.color; });
    return out;
  }, [appSettings, evaluationSettings]);
  const allCategories = useMemo(() => Array.from(new Set((evaluationSettings || []).map((e: any) => e.category))) as string[], [evaluationSettings]);
  const getOptions = (category: string) => (evaluationSettings || [])
    .filter((e: any) => e.category === category)
    .map((e: any) => ({ label: e.label, color: evalColors[e.label], score: e.score ?? undefined }));

  if (loading) return <LoadingState label="Memuat progres & evaluasi…" />;

  if (detail) {
    return (
      <div className="pb-12">
        <SantriDetailProgressView
          santri={detail} selectedPeriod={periodId} onPeriodChange={setPeriodId} periods={[...periodeEvaluasi].reverse()}
          appSettings={appSettings} halaqahList={halaqah} studentProgress={studentProgress} localProgress={{}}
          studentEvaluations={studentEvaluations} attendance={attendance} setoranHarian={setoranHarian as any}
          allCategories={allCategories} getOptions={getOptions} evalColors={evalColors} classTargets={classTargets}
          onBack={() => setDetail(null)}
        />
      </div>
    );
  }

  const tabBtn = (t: Tab, teks: string) => (
    <button key={t} type="button" onClick={() => setTab(t)}
      className={`pb-2.5 text-sm font-bold border-b-2 ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{teks}</button>
  );

  return (
    <div className="space-y-5 pb-12">
      {dialogAlasan}
      <PageHeader
        title="Progres & Evaluasi"
        description="Rekap Periode: satu angka resmi per santri per periode. Laporan, target, dan raport membaca rekap ini."
        actions={
          <button type="button" onClick={() => navigate(`/app/evaluations?period=${periodId}`)}
            className="btn btn-primary">
            <ExternalLink size={15} /> Buka Form Periode
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs font-semibold text-slate-600">Periode<br />
          <select className={selectCls} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.length === 0 && <option value="">Belum ada periode</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.needs_review ? ' (tanggal perlu dicek)' : ''}</option>)}
          </select>
        </label>
        {tab !== 'pemantauan' && (
          <>
            <label className="text-xs font-semibold text-slate-600">Marhalah<br />
              <select className={selectCls} value={filterMarhalah} onChange={(e) => { setFilterMarhalah(e.target.value); setFilterKelas('all'); }}>
                <option value="all">Semua</option>
                {(masterMarhalahs || []).map((m: any) => <option key={m.id} value={m.nama}>{m.nama}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Kelas<br />
              <select className={selectCls} value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)}>
                <option value="all">Semua</option>
                {kelasList.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Halaqah<br />
              <select className={selectCls} value={filterHalaqah} onChange={(e) => setFilterHalaqah(e.target.value)}>
                <option value="all">Semua</option>
                {halaqah.filter((h) => !h.is_archived).map((h) => <option key={h.id} value={String(h.id)}>{h.nama}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Cari santri<br />
              <span className="relative inline-block">
                <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
                <input className={`${selectCls} pl-7`} value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama…" />
              </span>
            </label>
          </>
        )}
      </div>
      {periode && <p className="text-xs text-slate-500">{periode.start_date} s.d. {periode.end_date}{periode.needs_review ? ' · tanggal periode hasil pemindahan data lama perlu dicek di Pengaturan Evaluasi' : ''}</p>}

      <div className="flex gap-6 border-b border-slate-200">
        {tabBtn('pemantauan', 'Pemantauan Periode')}
        {tabBtn('rekap', 'Rekap Santri')}
        {tabBtn('pivot', 'Pivot')}
        {tabBtn('statistik', 'Statistik')}
      </div>

      {periods.length === 0 && <EmptyState title="Belum ada periode evaluasi" description="Buat periode di Pengaturan Evaluasi." />}

      {tab === 'pemantauan' && periodId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">Terkirim {ringkas.terkirim}</span>
            <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Draft {ringkas.draft}</span>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">Belum diisi {ringkas.belum}</span>
            <span className="text-slate-500">dari {ringkas.total} halaqah</span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={muatStatus} className="btn btn-secondary btn-sm">
                <RefreshCw size={13} /> Muat ulang
              </button>
              {isAdmin && (
                <button type="button" disabled={menghitung || periode?.needs_review} onClick={hitungSemua}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-xs font-semibold text-blue-700 disabled:opacity-50">
                  <Calculator size={13} /> {menghitung ? 'Menghitung…' : 'Hitung rekap semua halaqah'}
                </button>
              )}
            </div>
          </div>
          {memuatStatus ? <LoadingState rows={4} /> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Halaqah</th>
                    <th className="px-3 py-2 text-left">Musammi'</th>
                    <th className="px-3 py-2 text-left">Mode</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Terisi</th>
                    <th className="px-3 py-2 text-left">Dikirim</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {status.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Tidak ada halaqah.</td></tr>}
                  {status.map((s) => (
                    <tr key={s.halaqah_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-800">{s.halaqah_nama}<div className="text-2xs font-normal text-slate-400">{s.marhalah || ''}</div></td>
                      <td className="px-3 py-2 text-slate-600">{s.musammi_nama || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{MODE_LABEL[s.recording_mode] || s.recording_mode}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${badge[s.status]}`}>{STATUS_FORM_LABEL[s.status]}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.terisi}/{s.jumlah_santri}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.submitted_at ? new Date(s.submitted_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" className="text-xs font-semibold text-blue-700 mr-3" onClick={() => navigate(`/app/evaluations?period=${periodId}&halaqah=${s.halaqah_id}`)}>Buka form</button>
                        {isAdmin && s.status === 'submitted' && (
                          <button type="button" className="text-xs font-semibold text-amber-700 inline-flex items-center gap-1" onClick={() => bukaKembali(s)}><Unlock size={12} /> Buka kembali</button>
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

      {tab === 'rekap' && periodId && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{rekapRows.length} santri</span>
            <button type="button" onClick={ekspor} disabled={rekapRows.length === 0}
              className="btn btn-secondary btn-sm ml-auto">
              <Download size={13} /> Ekspor Excel
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Santri</th>
                  <th className="px-3 py-2 text-left">Halaqah</th>
                  <th className="px-3 py-2 text-right">{label.ziyadah}</th>
                  <th className="px-3 py-2 text-right">{label.murojaah}</th>
                  <th className="px-3 py-2 text-left">{label.posisi}</th>
                  <th className="px-3 py-2 text-right">Total (juz)</th>
                  <th className="px-3 py-2 text-left">{label.kelancaran}</th>
                  <th className="px-3 py-2 text-right">{label.kehadiran}</th>
                  {isianBebas.map((f) => <th key={f.id} className="px-3 py-2 text-left">{f.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rekapRows.length === 0 && (
                  <tr><td colSpan={8 + isianBebas.length} className="px-3 py-6 text-center text-slate-400">
                    Belum ada rekap untuk periode ini. {isAdmin ? 'Gunakan "Hitung rekap semua halaqah" di tab Pemantauan, atau minta musammi\' membuka form periode.' : 'Buka Form Periode untuk mengisi.'}
                  </td></tr>
                )}
                {rekapRows.map(({ r, s, h }) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button type="button" className="font-semibold text-blue-700 hover:underline text-left" onClick={() => setDetail(s)}>{s.nama}</button>
                      <div className="text-2xs text-slate-400">{s.kelas} · {r.sumber === 'harian' ? 'harian' : r.sumber === 'rekap' ? 'rekap' : 'data lama'}{Object.keys(r.overrides || {}).length ? ' · dikoreksi' : ''}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{h?.nama || '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ziyadah_pages ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.murojaah_pages ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{teksPosisi(r) || '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total_juz ?? '-'}</td>
                    <td className="px-3 py-2">{r.kelancaran || '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.kehadiran_persen !== null ? `${r.kehadiran_persen}%` : '-'}</td>
                    {isianBebas.map((f) => <td key={f.id} className="px-3 py-2 text-slate-600">{String(nilaiBebas(r.free_answers?.[f.id]) || '-')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-slate-400">{label.ziyadah} & {label.murojaah} dalam halaman. Total hafalan dihitung dari posisi hafalan (Mushaf Madinah 15 baris).</p>
        </div>
      )}

      {tab === 'pivot' && (
        <StudentProgressComponent
          globalFilterMonth={periodId}
          globalFilterMarhalah={filterMarhalah as any}
          globalFilterKelas={filterKelas}
          globalSearchName={cari}
          globalViewMode={'Data' as any}
          globalSelectedScheme={'All' as any}
        />
      )}

      {tab === 'statistik' && (
        <StatistikPerkembangan
          globalFilterMonth={periodId}
          globalFilterMarhalah={filterMarhalah}
          globalFilterKelas={filterKelas}
          globalFilterHalaqah={filterHalaqah}
          globalSearchName={cari}
          setPage={() => {}}
        />
      )}
    </div>
  );
};

export default ProgresEvaluasiPage;
