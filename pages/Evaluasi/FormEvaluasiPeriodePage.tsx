/**
 * Fase 4 · Form Evaluasi Periode (spesifikasi 6.2).
 * Diisi musammi' sekali per halaqah per periode: Simpan Draft / Kirim.
 *  - Mode Harian : isian sistem (ziyadah, murojaah, posisi, kelancaran, kehadiran) terisi otomatis
 *                  dari setoran & absensi harian dan terkunci; Admin boleh mengoreksi dengan alasan.
 *  - Mode Rekap  : isian sistem diisi manual; total hafalan dihitung dari posisi hafalan.
 * Isian bebas & evaluasi kegiatan (buatan Admin) diisi di kedua mode.
 * Semua simpan lewat rpc_simpan_form_periode (aturan dijaga server).
 */
import { kirimAntrianSekarang } from '../../lib/antrianPesan';
import { arahSantri } from '../../lib/arahHafalan';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Lock, RefreshCw, RotateCcw, Save, Send, Unlock } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { normalizeRole } from '../../lib/permissions';
import { PageHeader, LoadingState, EmptyState } from '../../components/ui/SaaSPrimitives';
import Modal from '../../components/Modal';
import { useMintaAlasan } from '../../components/ui/AlasanDialog';
import { NotificationStore } from '../../lib/NotificationStore';
import { tampilkanError } from '../../lib/pesanError';
import { hariIni, halaqahSaya } from '../../lib/sesiHalaqah';
import { SURAHS_DATA } from '../../lib/quranPageMap';
import { hitungTotalHafalan } from '../../lib/totalHafalan';
import {
  MODE_LABEL, STATUS_FORM_LABEL, labelIsianSistem, normalisasiRekap, periodeBawaan, periodeTahunAjaran,
  rekapBelumLengkap, teksPosisi, type EvaluationPeriod, type PeriodFormField, type PeriodRecap, type FormStatus, type RecordingMode,
} from '../../lib/rekapAdapter';

type RekapBaris = PeriodRecap & {
  nama: string;
  kode?: string | null;
  arah_hafalan: 'maju' | 'mundur' | 'dua_arah';
  sebelumnya?: { nama_periode: string; posisi_maju_surah: number | null; posisi_maju_ayah: number | null;
    posisi_mundur_surah: number | null; posisi_mundur_ayah: number | null; total_juz: number | null } | null;
};

interface Draf {
  ziyadah: string;
  murojaah: string;
  surah: string;
  ayah: string;
  /** Santri dua arah: posisi belakang (surah/ayah = posisi depan). */
  surah2: string;
  ayah2: string;
  totalJuz: string;
  kelancaran: string;
  bebas: Record<string, any>;
  catatan: string;
}

const teks = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const angkaAtauNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
type Pos = [number | null, number | null];
/** Posisi [depan, belakang] dari draf: sisi arah santri dari isian; dua arah: keduanya dari isian. */
function posisiDraf(r: RekapBaris, d: Draf): [Pos, Pos] {
  const isi: Pos = [angkaAtauNull(d.surah), angkaAtauNull(d.ayah)];
  if (r.arah_hafalan === 'dua_arah') return [isi, [angkaAtauNull(d.surah2), angkaAtauNull(d.ayah2)]];
  return r.arah_hafalan === 'maju'
    ? [isi, [r.posisi_mundur_surah, r.posisi_mundur_ayah]]
    : [[r.posisi_maju_surah, r.posisi_maju_ayah], isi];
}

function drafDari(r: RekapBaris): Draf {
  const maju = r.arah_hafalan !== 'mundur';
  const dua = r.arah_hafalan === 'dua_arah';
  return {
    ziyadah: teks(r.ziyadah_pages),
    murojaah: teks(r.murojaah_pages),
    surah: teks(maju ? r.posisi_maju_surah : r.posisi_mundur_surah),
    ayah: teks(maju ? r.posisi_maju_ayah : r.posisi_mundur_ayah),
    surah2: dua ? teks(r.posisi_mundur_surah) : '',
    ayah2: dua ? teks(r.posisi_mundur_ayah) : '',
    totalJuz: teks(r.total_juz),
    kelancaran: r.kelancaran || '',
    bebas: { ...(r.free_answers || {}) },
    catatan: r.notes || '',
  };
}

const cacheTotal = new Map<string, { halaman: number; juz: number }>();
function totalDari(maju: [number | null, number | null], mundur: [number | null, number | null]) {
  const key = `${maju.join(':')}|${mundur.join(':')}`;
  if (!cacheTotal.has(key)) {
    const t = hitungTotalHafalan(
      maju[0] ? { surah: maju[0], ayah: maju[1] || 1 } : null,
      mundur[0] ? { surah: mundur[0], ayah: mundur[1] || 1 } : null
    );
    cacheTotal.set(key, { halaman: t.halaman, juz: t.juz });
  }
  return cacheTotal.get(key)!;
}

const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500';

const badgeStatus: Record<FormStatus, string> = {
  belum_diisi: 'bg-slate-100 text-slate-600 border-slate-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const IsianBebas: React.FC<{ f: PeriodFormField; value: any; disabled?: boolean; onChange: (v: any) => void }> = ({ f, value, disabled, onChange }) => {
  if (f.field_type === 'choice') {
    return (
      <select className={inputCls} value={teks(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {f.options.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
        {value && !f.options.some((o) => o.label === value) && <option value={value}>{value} (lama)</option>}
      </select>
    );
  }
  if (f.field_type === 'boolean') {
    return (
      <select className={inputCls} value={value === true ? 'true' : value === false ? 'false' : ''} disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'true')}>
        <option value="">—</option><option value="true">Ya</option><option value="false">Tidak</option>
      </select>
    );
  }
  if (f.field_type === 'number') {
    return <input type="number" step="any" className={inputCls} value={teks(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  return <textarea rows={1} className={inputCls} value={teks(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
};

const FormEvaluasiPeriodePage: React.FC = () => {
  const {
    halaqah, musammi, userProfile, loading, evaluationPeriods, periodFormFields, fluencyRules, selectedAcademicYear,
    bukaFormPeriode, simpanFormPeriode, bukaKembaliFormPeriode, hitungRekapHarian,
  } = useSupabaseData();
  const [params, setParams] = useSearchParams();
  const role = normalizeRole(userProfile?.role);
  const isAdmin = role === 'admin' || role === 'superadmin';
  const today = hariIni();

  const periods = useMemo(() => periodeTahunAjaran(evaluationPeriods, selectedAcademicYear?.id), [evaluationPeriods, selectedAcademicYear]);
  const myMusammiIds = useMemo(
    () => musammi.filter((m: any) => userProfile?.id && m.user_id === userProfile.id).map((m: any) => Number(m.id)),
    [musammi, userProfile?.id]
  );
  const halaqahList = useMemo(
    () => halaqahSaya(halaqah, { role, userId: userProfile?.id, myMusammiIds })
      .sort((a, b) => (a.no_urut || 999) - (b.no_urut || 999) || a.nama.localeCompare(b.nama)),
    [halaqah, role, userProfile?.id, myMusammiIds]
  );

  const [periodId, setPeriodId] = useState(params.get('period') || '');
  const [halaqahId, setHalaqahId] = useState<number>(Number(params.get('halaqah')) || 0);
  // Tunggu daftar terisi dulu agar pilihan dari URL tidak hilang saat data masih dimuat
  useEffect(() => {
    if (periods.length === 0) return;
    if (!periodId || !periods.some((p) => p.id === periodId)) setPeriodId(periodeBawaan<EvaluationPeriod>(periods, today)?.id || '');
  }, [periods, periodId, today]);
  useEffect(() => {
    if (halaqahList.length === 0) return;
    if (!halaqahId || !halaqahList.some((h) => h.id === halaqahId)) setHalaqahId(halaqahList[0]?.id || 0);
  }, [halaqahList, halaqahId]);
  useEffect(() => {
    const p = new URLSearchParams(params);
    if (periodId) p.set('period', periodId); else p.delete('period');
    if (halaqahId) p.set('halaqah', String(halaqahId)); else p.delete('halaqah');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, halaqahId]);

  const [data, setData] = useState<{ form: any; rows: RekapBaris[] } | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [draf, setDraf] = useState<Record<number, Draf>>({});
  const [kotor, setKotor] = useState<Set<number>>(new Set());
  const [koreksi, setKoreksi] = useState<Set<number>>(new Set());
  const [reset, setReset] = useState<Set<number>>(new Set());
  const [kegiatan, setKegiatan] = useState<Record<string, any>>({});
  const [kegiatanKotor, setKegiatanKotor] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [konfirmKirim, setKonfirmKirim] = useState(false);
  const [dialogAlasan, mintaAlasan] = useMintaAlasan();

  const muat = useCallback(async () => {
    if (!periodId || !halaqahId) { setData(null); return; }
    setMemuat(true);
    setGalat(null);
    try {
      const res: any = await bukaFormPeriode(periodId, halaqahId);
      const rows: RekapBaris[] = (res?.recaps || []).map((r: any) => ({
        ...normalisasiRekap(r), nama: r.nama, kode: r.kode, arah_hafalan: arahSantri(r.arah_hafalan),
        sebelumnya: r.sebelumnya ? { ...r.sebelumnya, total_juz: r.sebelumnya.total_juz === null ? null : Number(r.sebelumnya.total_juz) } : null,
      }));
      setData({ form: res?.form, rows });
      setDraf(Object.fromEntries(rows.map((r) => [r.santri_id, drafDari(r)])));
      setKegiatan({ ...(res?.form?.activity_answers || {}) });
      setKotor(new Set()); setKoreksi(new Set()); setReset(new Set()); setKegiatanKotor(false);
    } catch (e) {
      setData(null);
      setGalat(tampilkanError(e, 'Gagal membuka form periode'));
    } finally {
      setMemuat(false);
    }
  }, [periodId, halaqahId, bukaFormPeriode]);
  useEffect(() => { muat(); }, [muat]);

  const periode = periods.find((p) => p.id === periodId);
  const form = data?.form;
  const mode: RecordingMode = form?.recording_mode === 'rekap' ? 'rekap' : 'harian';
  const status: FormStatus = form?.status || 'belum_diisi';
  const terkirim = status === 'submitted';
  const bolehUbah = !terkirim || isAdmin;
  const label = labelIsianSistem(periodFormFields);
  const isianBebas = periodFormFields.filter((f) => f.scope === 'santri' && !f.system_key && f.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const pertanyaan = periodFormFields.filter((f) => f.scope === 'kegiatan' && f.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const predikat = fluencyRules.filter((r) => r.is_active).sort((a, b) => Number(a.is_repeat) - Number(b.is_repeat) || a.sort_order - b.sort_order);

  const ubah = (sid: number, patch: Partial<Draf>) => {
    setDraf((d) => ({ ...d, [sid]: { ...d[sid], ...patch } }));
    setKotor((k) => new Set(k).add(sid));
  };

  const sistemBisaDiisi = (r: RekapBaris) => bolehUbah && (r.sumber !== 'harian' || koreksi.has(r.santri_id));

  const barisKirim = (r: RekapBaris) => {
    const d = draf[r.santri_id];
    const row: Record<string, any> = { santri_id: r.santri_id, free_answers: d.bebas, notes: d.catatan };
    if (reset.has(r.santri_id)) row.reset_overrides = true;
    if (sistemBisaDiisi(r) && r.sumber !== 'migrasi') {
      const [pm, pu] = posisiDraf(r, d);
      row.ziyadah_pages = angkaAtauNull(d.ziyadah);
      row.murojaah_pages = angkaAtauNull(d.murojaah);
      row.posisi_maju_surah = pm[0];
      row.posisi_maju_ayah = pm[1];
      row.posisi_mundur_surah = pu[0];
      row.posisi_mundur_ayah = pu[1];
      if (!row.posisi_maju_surah && !row.posisi_mundur_surah && d.totalJuz.trim() !== '' && angkaAtauNull(d.totalJuz) !== r.total_juz) {
        row.total_juz = angkaAtauNull(d.totalJuz);
      }
      row.kelancaran = d.kelancaran || null;
      // Kehadiran selalu dari absensi: tidak dikirim
    }
    return row;
  };

  const simpan = async (kirim: boolean) => {
    if (!data || !periodId) return;
    const rows = data.rows.filter((r) => kotor.has(r.santri_id) || reset.has(r.santri_id)).map(barisKirim);
    if (kirim) {
      const kurang = data.rows.filter((r) => {
        if (r.sumber !== 'rekap') return false;
        const d = draf[r.santri_id];
        return rekapBelumLengkap({
          sumber: r.sumber, ziyadah_pages: angkaAtauNull(d.ziyadah), murojaah_pages: angkaAtauNull(d.murojaah),
          kelancaran: d.kelancaran || null, posisi_maju_surah: posisiDraf(r, d)[0][0],
          posisi_mundur_surah: posisiDraf(r, d)[1][0],
          total_pages: angkaAtauNull(d.totalJuz),
        });
      });
      if (kurang.length > 0) {
        NotificationStore.addNotification(`Belum bisa dikirim: ${kurang.length} santri belum lengkap (${kurang.slice(0, 3).map((r) => r.nama).join(', ')}${kurang.length > 3 ? ', …' : ''}).`, 'error');
        setKonfirmKirim(false);
        return;
      }
    }
    let alasan: string | null = null;
    const perluAlasan = terkirim || reset.size > 0 || data.rows.some((r) => r.sumber === 'harian' && koreksi.has(r.santri_id) && kotor.has(r.santri_id));
    if (perluAlasan) {
      alasan = await mintaAlasan({ title: 'Alasan koreksi rekap', description: 'Koreksi Admin tercatat di Audit Log.' });
      if (alasan === null) { setKonfirmKirim(false); return; }
    }
    setMenyimpan(true);
    try {
      const res: any = await simpanFormPeriode({
        periodId, halaqahId, rows, activity: kegiatanKotor ? kegiatan : null, kirim, reason: alasan,
      });
      NotificationStore.addNotification(
        res?.status === 'submitted' && kirim ? 'Form periode terkirim.' : 'Perubahan tersimpan.', 'success'
      );
      setKonfirmKirim(false);
      // Fase 6: form terkirim → pesan capaian ke wali diantrikan database; picu kirim sekarang
      if (res?.status === 'submitted' && kirim) kirimAntrianSekarang();
      await muat();
    } catch (e) {
      tampilkanError(e, 'Gagal menyimpan form periode');
    } finally {
      setMenyimpan(false);
    }
  };

  const bukaKembali = async () => {
    if (!form?.id) return;
    const alasan = await mintaAlasan({ title: 'Buka kembali form', description: 'Form kembali menjadi Draft sehingga musammi\' bisa memperbaikinya.', confirmLabel: 'Buka kembali' });
    if (alasan === null) return;
    try {
      await bukaKembaliFormPeriode(form.id, alasan);
      NotificationStore.addNotification('Form dibuka kembali (Draft).', 'success');
      await muat();
    } catch (e) { tampilkanError(e, 'Gagal membuka kembali form'); }
  };

  const hitungUlang = async () => {
    try {
      await hitungRekapHarian(periodId, halaqahId);
      NotificationStore.addNotification('Rekap dihitung ulang dari setoran & absensi.', 'success');
      await muat();
    } catch (e) { tampilkanError(e, 'Gagal menghitung ulang'); }
  };

  const adaPerubahan = kotor.size > 0 || reset.size > 0 || kegiatanKotor;

  if (loading) return <LoadingState label="Memuat form evaluasi…" />;

  return (
    <div className="space-y-5 pb-28">
      {dialogAlasan}
      <PageHeader
        title="Form Evaluasi Periode"
        description="Rekap capaian santri per periode. Mode Harian terisi otomatis dari setoran harian; Mode Rekap diisi di akhir periode."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm sm:text-xs font-semibold text-slate-600">Periode
          <select className={`${inputCls} mt-1`} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.length === 0 && <option value="">Belum ada periode</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id} disabled={p.needs_review}>
                {p.name} ({p.start_date} s.d. {p.end_date}){p.needs_review ? ' — tanggal perlu dicek Admin' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:text-xs font-semibold text-slate-600">Halaqah
          <select className={`${inputCls} mt-1`} value={halaqahId || ''} onChange={(e) => setHalaqahId(Number(e.target.value))}>
            {halaqahList.length === 0 && <option value="">Tidak ada halaqah</option>}
            {halaqahList.map((h) => <option key={h.id} value={h.id}>{h.nama}{h.musammi?.nama ? ` · ${h.musammi.nama}` : ''}</option>)}
          </select>
        </label>
      </div>

      {periods.length === 0 && (
        <EmptyState title="Belum ada periode evaluasi" description={isAdmin ? 'Buat periode di Pengaturan Evaluasi.' : 'Minta Admin membuat periode evaluasi.'} />
      )}
      {galat && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{galat}</div>
      )}
      {memuat && <LoadingState label="Membuka form…" rows={3} />}

      {data && !memuat && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm sm:text-xs">
            <span className="px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-semibold">{MODE_LABEL[mode]}</span>
            <span className={`px-2.5 py-1 rounded-full border font-semibold ${badgeStatus[status]}`}>{STATUS_FORM_LABEL[status]}</span>
            {periode && <span className="text-slate-500">{periode.start_date} s.d. {periode.end_date}</span>}
            {form?.source === 'migrasi' && <span className="text-slate-500">· data pindahan aplikasi lama</span>}
            <div className="ml-auto flex gap-2">
              {mode === 'harian' && bolehUbah && (
                <button type="button" onClick={hitungUlang} className="btn btn-secondary btn-sm">
                  <RefreshCw size={13} /> Hitung ulang
                </button>
              )}
              {isAdmin && terkirim && (
                <button type="button" onClick={bukaKembali} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 font-semibold text-amber-800">
                  <Unlock size={13} /> Buka kembali
                </button>
              )}
            </div>
          </div>
          <p className="text-sm sm:text-xs text-slate-500">
            {mode === 'harian'
              ? `${label.ziyadah}, ${label.murojaah}, ${label.posisi}, ${label.kelancaran}, dan ${label.kehadiran} dihitung otomatis dari setoran & absensi harian. Bila keliru, perbaiki setorannya${isAdmin ? ' atau gunakan Koreksi (wajib alasan)' : ''}.`
              : `Isi ${label.ziyadah.toLowerCase()}, ${label.murojaah.toLowerCase()}, ${label.posisi.toLowerCase()} (sampai surat … ayat …), dan ${label.kelancaran.toLowerCase()}. ${label.kehadiran} selalu dihitung dari absensi.`}
          </p>
          {terkirim && !isAdmin && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2">
              <Lock size={16} className="mt-0.5 shrink-0" /> Form sudah dikirim. Perbaikan dilakukan oleh Admin.
            </div>
          )}

          {data.rows.length === 0 && <EmptyState title="Tidak ada santri" description="Halaqah ini tidak punya santri pada periode tersebut." />}

          <div className="space-y-3">
            {data.rows.map((r, idx) => {
              const d = draf[r.santri_id];
              if (!d) return null;
              const edit = sistemBisaDiisi(r) && r.sumber !== 'migrasi';
              const maju = r.arah_hafalan !== 'mundur';
              const dua = r.arah_hafalan === 'dua_arah';
              const sNo = angkaAtauNull(d.surah);
              const sNo2 = angkaAtauNull(d.surah2);
              const [posMaju, posMundur] = posisiDraf(r, d);
              const total = edit && (posMaju[0] || posMundur[0]) ? totalDari(posMaju, posMundur) : null;
              const dikoreksi = Object.keys(r.overrides || {}).filter((k) => r.overrides[k]);
              const sebelum = r.sebelumnya;
              return (
                <div key={r.santri_id} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm sm:text-xs text-slate-400 w-6">{idx + 1}.</span>
                    <span className="font-semibold text-slate-800">{r.nama}</span>
                    {r.kode && <span className="text-sm sm:text-xs text-slate-400">{r.kode}</span>}
                    <span className="text-sm sm:text-2xs text-slate-500 px-2 py-0.5 rounded-full bg-slate-100">{dua ? 'Dua arah' : maju ? 'Maju' : 'Mundur'}</span>
                    {r.sumber === 'migrasi' && <span className="text-sm sm:text-2xs text-slate-500 px-2 py-0.5 rounded-full bg-slate-100">data lama</span>}
                    {dikoreksi.length > 0 && <span className="text-sm sm:text-2xs text-amber-700 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">dikoreksi Admin: {dikoreksi.join(', ')}</span>}
                    {kotor.has(r.santri_id) && <span className="text-sm sm:text-2xs text-blue-700">• belum disimpan</span>}
                    {isAdmin && r.sumber === 'harian' && bolehUbah && (
                      <div className="ml-auto flex gap-2">
                        {!koreksi.has(r.santri_id) && (
                          <button type="button" className="text-sm sm:text-xs font-semibold text-blue-700" onClick={() => setKoreksi((k) => new Set(k).add(r.santri_id))}>Koreksi</button>
                        )}
                        {dikoreksi.length > 0 && (
                          <button type="button" className="text-sm sm:text-xs font-semibold text-slate-600 inline-flex items-center gap-1"
                            onClick={() => { setReset((s) => new Set(s).add(r.santri_id)); setKotor((k) => new Set(k).add(r.santri_id)); }}>
                            <RotateCcw size={12} /> Kembali ke otomatis{reset.has(r.santri_id) ? ' ✓' : ''}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Isian sistem */}
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                    <label className="text-sm sm:text-2xs font-semibold text-slate-500">{label.ziyadah}
                      {edit ? <input type="number" min={0} step="any" className={`${inputCls} mt-0.5`} value={d.ziyadah} onChange={(e) => ubah(r.santri_id, { ziyadah: e.target.value })} />
                        : <div className="mt-0.5 text-sm font-semibold text-slate-800">{r.ziyadah_pages ?? '-'} <span className="text-sm sm:text-xs font-normal text-slate-400">hal</span></div>}
                    </label>
                    <label className="text-sm sm:text-2xs font-semibold text-slate-500">{label.murojaah}
                      {edit ? <input type="number" min={0} step="any" className={`${inputCls} mt-0.5`} value={d.murojaah} onChange={(e) => ubah(r.santri_id, { murojaah: e.target.value })} />
                        : <div className="mt-0.5 text-sm font-semibold text-slate-800">{r.murojaah_pages ?? '-'} <span className="text-sm sm:text-xs font-normal text-slate-400">hal</span></div>}
                    </label>
                    <div className="col-span-2 text-sm sm:text-2xs font-semibold text-slate-500">{label.posisi} {edit && <span className="font-normal">({dua ? 'depan: Al-Fatihah →' : maju ? 'Al-Fatihah →' : 'An-Nas →'} sampai)</span>}
                      {edit ? (
                        <div className="mt-0.5 flex gap-1">
                          <select className={inputCls} value={d.surah} onChange={(e) => ubah(r.santri_id, { surah: e.target.value, ayah: e.target.value ? String(SURAHS_DATA[Number(e.target.value) - 1]?.totalAyah || 1) : '' })}>
                            <option value="">— surat —</option>
                            {(maju ? SURAHS_DATA : [...SURAHS_DATA].reverse()).map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                          </select>
                          <input type="number" min={1} max={sNo ? SURAHS_DATA[sNo - 1]?.totalAyah : undefined} className={`${inputCls} w-20`} placeholder="ayat"
                            value={d.ayah} disabled={!d.surah} onChange={(e) => ubah(r.santri_id, { ayah: e.target.value })} />
                        </div>
                      ) : null}
                      {edit && dua ? (
                        <div className="mt-1">
                          <span className="font-normal">(belakang: An-Nas → sampai)</span>
                          <div className="mt-0.5 flex gap-1">
                            <select className={inputCls} value={d.surah2} onChange={(e) => ubah(r.santri_id, { surah2: e.target.value, ayah2: e.target.value ? String(SURAHS_DATA[Number(e.target.value) - 1]?.totalAyah || 1) : '' })}>
                              <option value="">— surat —</option>
                              {[...SURAHS_DATA].reverse().map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                            </select>
                            <input type="number" min={1} max={sNo2 ? SURAHS_DATA[sNo2 - 1]?.totalAyah : undefined} className={`${inputCls} w-20`} placeholder="ayat"
                              value={d.ayah2} disabled={!d.surah2} onChange={(e) => ubah(r.santri_id, { ayah2: e.target.value })} />
                          </div>
                        </div>
                      ) : null}
                      {!edit && <div className="mt-0.5 text-sm text-slate-800">{teksPosisi(r) || '-'}</div>}
                      {edit && sebelum && (sebelum.posisi_maju_surah || sebelum.posisi_mundur_surah) && (
                        <div className="text-sm sm:text-2xs font-normal text-slate-400 mt-0.5">Sebelumnya ({sebelum.nama_periode}): {teksPosisi(sebelum as any)}</div>
                      )}
                    </div>
                    <div className="text-sm sm:text-2xs font-semibold text-slate-500">Total hafalan
                      {edit && !posMaju[0] && !posMundur[0] ? (
                        <input type="number" min={0} max={30} step="any" className={`${inputCls} mt-0.5`} placeholder="juz" value={d.totalJuz} onChange={(e) => ubah(r.santri_id, { totalJuz: e.target.value })} />
                      ) : (
                        <div className="mt-0.5 text-sm font-semibold text-slate-800">{(total?.juz ?? r.total_juz) ?? '-'} <span className="text-sm sm:text-xs font-normal text-slate-400">juz</span></div>
                      )}
                    </div>
                    <label className="text-sm sm:text-2xs font-semibold text-slate-500">{label.kelancaran}
                      {edit ? (
                        <select className={`${inputCls} mt-0.5`} value={d.kelancaran} onChange={(e) => ubah(r.santri_id, { kelancaran: e.target.value })}>
                          <option value="">—</option>
                          {predikat.map((p) => <option key={p.predicate} value={p.predicate}>{p.predicate}</option>)}
                        </select>
                      ) : <div className="mt-0.5 text-sm font-semibold text-slate-800">{r.kelancaran || '-'}</div>}
                    </label>
                    <div className="text-sm sm:text-2xs font-semibold text-slate-500" title="Dihitung otomatis dari absensi">{label.kehadiran}
                      <div className="mt-0.5 text-sm font-semibold text-slate-800">
                        {r.kehadiran_persen !== null ? `${r.kehadiran_persen}%` : '-'}
                        {r.kehadiran_total ? <span className="text-sm sm:text-xs font-normal text-slate-400"> ({r.hadir_count}/{r.kehadiran_total})</span> : null}
                      </div>
                      <div className="text-sm sm:text-2xs font-normal text-slate-400">dari absensi</div>
                    </div>
                  </div>

                  {/* Isian bebas */}
                  {(isianBebas.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {isianBebas.map((f) => (
                        <label key={f.id} className="text-sm sm:text-2xs font-semibold text-slate-500">{f.label}
                          <div className="mt-0.5"><IsianBebas f={f} value={d.bebas[f.id]} disabled={!bolehUbah}
                            onChange={(v) => ubah(r.santri_id, { bebas: { ...d.bebas, [f.id]: v } })} /></div>
                        </label>
                      ))}
                    </div>
                  )}
                  <label className="block text-sm sm:text-2xs font-semibold text-slate-500">Catatan
                    <textarea rows={1} className={`${inputCls} mt-0.5`} value={d.catatan} disabled={!bolehUbah} onChange={(e) => ubah(r.santri_id, { catatan: e.target.value })} />
                  </label>
                </div>
              );
            })}
          </div>

          {pertanyaan.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <h3 className="font-bold text-slate-800 text-sm">Evaluasi Kegiatan Halaqah</h3>
              {pertanyaan.map((f) => (
                <label key={f.id} className="block text-sm sm:text-xs font-semibold text-slate-600">{f.label}
                  {f.description && <span className="block font-normal text-slate-400">{f.description}</span>}
                  <div className="mt-1"><IsianBebas f={f} value={kegiatan[f.id]} disabled={!bolehUbah}
                    onChange={(v) => { setKegiatan((k) => ({ ...k, [f.id]: v })); setKegiatanKotor(true); }} /></div>
                </label>
              ))}
            </div>
          )}

          {bolehUbah && (
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pl-4 pr-20 py-3 flex items-center justify-end gap-2 lg:pl-72">
              <span className="mr-auto text-sm sm:text-xs text-slate-500 hidden sm:inline">{adaPerubahan ? `${kotor.size} santri diubah` : 'Tidak ada perubahan'}</span>
              <button type="button" disabled={menyimpan || !adaPerubahan} onClick={() => simpan(false)}
                className="btn btn-secondary whitespace-nowrap">
                <Save size={15} /> {terkirim ? 'Simpan koreksi' : 'Simpan Draft'}
              </button>
              {!terkirim && (
                <button type="button" disabled={menyimpan || data.rows.length === 0} onClick={() => setKonfirmKirim(true)}
                  className="btn btn-primary">
                  <Send size={15} /> Kirim
                </button>
              )}
            </div>
          )}
        </>
      )}

      <Modal isOpen={konfirmKirim} onClose={() => setKonfirmKirim(false)} title="Kirim form periode?" maxWidth="md">
        <div className="space-y-3 text-sm text-slate-600">
          <p>Setelah dikirim, form terkunci untuk musammi'. Perbaikan berikutnya hanya oleh Admin.</p>
          {mode === 'harian' && <p className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> Setoran bertanggal dalam periode ini setelahnya hanya bisa ditambah Admin.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setKonfirmKirim(false)} className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700">Batal</button>
            <button type="button" disabled={menyimpan} onClick={() => simpan(true)} className="btn btn-primary">
              {menyimpan ? 'Mengirim…' : 'Kirim'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FormEvaluasiPeriodePage;
