/**
 * Fase 4 · Rekap Periode — tipe data & adaptor ke bentuk lama.
 *
 * Sumber resmi capaian santri per periode = tabel period_recaps (satu baris per santri
 * per periode). Halaman analitik lama (Pivot, Statistik, Detail Santri, Dashboard, Raport)
 * masih membaca bentuk lama (studentProgress / studentEvaluations / halaqahEvaluations);
 * adaptor ini menerjemahkan period_recaps ke bentuk itu, sehingga SEMUA halaman membaca
 * satu sumber yang sama. Tidak ada lagi tulis ke student_progress dkk.
 *
 * Satuan bentuk lama (dipertahankan):
 *   Ziyadah       = halaman
 *   Murojaah      = juz (halaman / 20)
 *   Total Hafalan = juz
 */
import { SURAHS_DATA } from './quranPageMap';
import { hitungTotalHafalan } from './totalHafalan';
import type { MasterEvaluationPeriod } from '../types';

export interface EvaluationPeriod {
  id: string;
  organization_id?: string;
  academic_year_id: number | null;
  name: string;
  start_date: string;
  end_date: string;
  legacy_key?: string | null;
  needs_review: boolean;
}

export type SystemKey = 'ziyadah' | 'murojaah' | 'posisi' | 'kelancaran' | 'kehadiran';
export type FieldType = 'system' | 'number' | 'choice' | 'boolean' | 'text';

export interface FieldOption {
  label: string;
  score?: number | null;
  color?: string | null;
}

export interface PeriodFormField {
  id: string;
  organization_id?: string;
  scope: 'santri' | 'kegiatan';
  system_key: SystemKey | null;
  label: string;
  field_type: FieldType;
  options: FieldOption[];
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  legacy_ref?: string | null;
}

export type FormStatus = 'belum_diisi' | 'draft' | 'submitted';
export type RecordingMode = 'harian' | 'rekap';

export interface PeriodForm {
  id: string;
  period_id: string;
  halaqah_id: number;
  recording_mode: RecordingMode;
  status: FormStatus;
  activity_answers: Record<string, any>;
  source?: 'aplikasi' | 'migrasi';
  submitted_at?: string | null;
  updated_at?: string | null;
}

export interface PeriodRecap {
  id: string;
  period_id: string;
  santri_id: number;
  halaqah_id: number | null;
  form_id: string | null;
  ziyadah_pages: number | null;
  murojaah_pages: number | null;
  posisi_maju_surah: number | null;
  posisi_maju_ayah: number | null;
  posisi_mundur_surah: number | null;
  posisi_mundur_ayah: number | null;
  total_pages: number | null;
  total_juz: number | null;
  kelancaran: string | null;
  hadir_count: number | null;
  kehadiran_total: number | null;
  kehadiran_persen: number | null;
  sumber: 'harian' | 'rekap' | 'migrasi';
  overrides: Record<string, boolean>;
  free_answers: Record<string, any>;
  notes: string | null;
  computed_at?: string | null;
  updated_at?: string | null;
}

export const STATUS_FORM_LABEL: Record<FormStatus, string> = {
  belum_diisi: 'Belum diisi',
  draft: 'Draft',
  submitted: 'Terkirim',
};

export const MODE_LABEL: Record<RecordingMode, string> = {
  harian: 'Mode Harian',
  rekap: 'Mode Rekap',
};

/** numeric dari Postgres datang sebagai string; null tetap null. */
export const angka = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const bulat = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function normalisasiRekap(r: any): PeriodRecap {
  return {
    ...r,
    santri_id: Number(r.santri_id),
    halaqah_id: r.halaqah_id === null || r.halaqah_id === undefined ? null : Number(r.halaqah_id),
    ziyadah_pages: angka(r.ziyadah_pages),
    murojaah_pages: angka(r.murojaah_pages),
    total_pages: angka(r.total_pages),
    total_juz: angka(r.total_juz),
    kehadiran_persen: angka(r.kehadiran_persen),
    hadir_count: angka(r.hadir_count),
    kehadiran_total: angka(r.kehadiran_total),
    posisi_maju_surah: angka(r.posisi_maju_surah),
    posisi_maju_ayah: angka(r.posisi_maju_ayah),
    posisi_mundur_surah: angka(r.posisi_mundur_surah),
    posisi_mundur_ayah: angka(r.posisi_mundur_ayah),
    overrides: r.overrides && typeof r.overrides === 'object' ? r.overrides : {},
    free_answers: r.free_answers && typeof r.free_answers === 'object' ? r.free_answers : {},
  };
}

export function normalisasiField(f: any): PeriodFormField {
  const opts = Array.isArray(f.options) ? f.options : [];
  return {
    ...f,
    options: opts.map((o: any) => (typeof o === 'string' ? { label: o } : { label: String(o?.label ?? ''), score: o?.score ?? null, color: o?.color ?? null })),
    sort_order: Number(f.sort_order) || 0,
  };
}

/** Periode ke bentuk lama (MasterEvaluationPeriod): id = UUID periode. */
export function periodeKeLegacy(p: EvaluationPeriod): MasterEvaluationPeriod & { needs_review?: boolean } {
  return {
    id: p.id,
    name: p.name,
    startDate: p.start_date,
    endDate: p.end_date,
    academic_year_id: p.academic_year_id,
    needs_review: p.needs_review,
  };
}

/** Periode yang dipakai tahun ajaran terpilih (periode tanpa tahun ajaran ikut tampil), urut tanggal. */
export function periodeTahunAjaran(list: EvaluationPeriod[], academicYearId?: number | null): EvaluationPeriod[] {
  return list
    .filter((p) => !academicYearId || p.academic_year_id === null || Number(p.academic_year_id) === Number(academicYearId))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** Periode yang memuat tanggal (periode perlu-dicek diabaikan). */
export function periodePada(list: EvaluationPeriod[], tanggal: string): EvaluationPeriod | undefined {
  return list.find((p) => !p.needs_review && p.start_date <= tanggal && tanggal <= p.end_date);
}

/** Cek tumpang tindih di layar (server tetap memeriksa). */
export function periodeBentrok(list: EvaluationPeriod[], calon: { id?: string; start_date: string; end_date: string }): EvaluationPeriod | undefined {
  return list.find((p) => p.id !== calon.id && !p.needs_review && p.start_date <= calon.end_date && calon.start_date <= p.end_date);
}

const namaSurat = (no: number | null | undefined) => (no ? SURAHS_DATA[no - 1]?.name ?? `Surat ${no}` : '');

/** Teks posisi hafalan untuk tampilan. */
export function teksPosisi(r: Pick<PeriodRecap, 'posisi_maju_surah' | 'posisi_maju_ayah' | 'posisi_mundur_surah' | 'posisi_mundur_ayah'>): string {
  const bagian: string[] = [];
  if (r.posisi_maju_surah) bagian.push(`Al-Fatihah 1 – ${namaSurat(r.posisi_maju_surah)} ${r.posisi_maju_ayah ?? 1}`);
  if (r.posisi_mundur_surah) {
    const s = r.posisi_mundur_surah;
    const a = r.posisi_mundur_ayah ?? 1;
    const penuh = a >= (SURAHS_DATA[s - 1]?.totalAyah ?? 0);
    bagian.push(penuh ? `${namaSurat(s)} – An-Nas` : `${namaSurat(s)} 1–${a} … An-Nas`);
  }
  return bagian.join(' + ');
}

const cacheJuz = new Map<string, number>();
function juzArah(arah: 'maju' | 'mundur', surah: number, ayah: number | null): number {
  const key = `${arah}:${surah}:${ayah ?? 1}`;
  if (!cacheJuz.has(key)) {
    const pos = { surah, ayah: ayah ?? 1 };
    cacheJuz.set(key, (arah === 'maju' ? hitungTotalHafalan(pos, null) : hitungTotalHafalan(null, pos)).juz);
  }
  return cacheJuz.get(key)!;
}

const labelSistem = (fields: PeriodFormField[], key: SystemKey, bawaan: string) =>
  fields.find((f) => f.system_key === key)?.label || bawaan;

/** Isian bebas santri yang dulu kolom student_evaluation (legacy_ref student_evaluation:kolom). */
const kolomEvaluasiLama = (f: PeriodFormField) =>
  f.legacy_ref && f.legacy_ref.startsWith('student_evaluation:') ? f.legacy_ref.slice('student_evaluation:'.length) : null;

/**
 * period_recaps → baris studentProgress lama (satu baris per jenis per santri per periode).
 * month_key = id periode.
 */
export function rekapKeStudentProgress(recaps: PeriodRecap[], fields: PeriodFormField[]) {
  const bebas = fields.filter((f) => f.scope === 'santri' && !f.system_key && !kolomEvaluasiLama(f));
  const out: { id: number; santri_id: number; month_key: string; progress_type: string; value: string }[] = [];
  let id = 1;
  const push = (r: PeriodRecap, type: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return;
    out.push({ id: id++, santri_id: r.santri_id, month_key: r.period_id, progress_type: type, value: String(v) });
  };
  for (const r of recaps) {
    push(r, 'Ziyadah', r.ziyadah_pages);
    push(r, 'Murojaah', r.murojaah_pages === null ? null : bulat(r.murojaah_pages / 20));
    push(r, 'Total Hafalan', r.total_juz);
    // Hafalan Depan (maju) / Belakang (mundur) dalam juz, dipakai Raport
    if (r.posisi_maju_surah && r.posisi_mundur_surah) {
      push(r, 'Hafalan Depan', juzArah('maju', r.posisi_maju_surah, r.posisi_maju_ayah));
      push(r, 'Hafalan Belakang', juzArah('mundur', r.posisi_mundur_surah, r.posisi_mundur_ayah));
    } else if (r.posisi_maju_surah) {
      push(r, 'Hafalan Depan', r.total_juz);
    } else if (r.posisi_mundur_surah) {
      push(r, 'Hafalan Belakang', r.total_juz);
    }
    if (r.posisi_maju_surah) push(r, 'Surat Ayat Depan', teksPosisi({ ...r, posisi_mundur_surah: null, posisi_mundur_ayah: null }));
    if (r.posisi_mundur_surah) push(r, 'Surat Ayat Belakang', teksPosisi({ ...r, posisi_maju_surah: null, posisi_maju_ayah: null }));
    push(r, 'Kelancaran', r.kelancaran);
    push(r, 'Kehadiran', r.kehadiran_persen);
    for (const f of bebas) {
      const v = r.free_answers?.[f.id];
      if (v === true || v === false) push(r, f.label, v ? 'Ya' : 'Tidak');
      else push(r, f.label, v);
    }
  }
  return out;
}

/** period_recaps → studentEvaluations lama (kolom kualitas & catatan). */
export function rekapKeStudentEvaluation(recaps: PeriodRecap[], fields: PeriodFormField[]) {
  const kolom = fields.map((f) => [f, kolomEvaluasiLama(f)] as const).filter(([, k]) => k);
  return recaps
    .map((r, i) => {
      const row: Record<string, any> = { id: i + 1, santri_id: r.santri_id, month_key: r.period_id };
      for (const [f, k] of kolom) {
        const v = r.free_answers?.[f.id];
        if (v !== undefined && v !== null && v !== '') row[k as string] = String(v);
      }
      if (r.notes && !row.catatan_musammi) row.catatan_musammi = r.notes;
      return row;
    })
    .filter((row) => Object.keys(row).length > 3);
}

/** Isian pilihan santri → evaluationSettings lama (kategori + opsi + skor + warna). */
export function fieldKeEvaluationSettings(fields: PeriodFormField[]) {
  let id = 1;
  return fields
    .filter((f) => f.scope === 'santri' && f.field_type === 'choice' && f.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((f) => f.options.map((o, i) => ({
      id: id++, category: f.label, label: o.label, score: o.score ?? null, color: o.color ?? undefined, order_index: i,
    })));
}

/** Pertanyaan evaluasi kegiatan → bentuk lama halaqahEvaluationQuestions. */
export function fieldKePertanyaanHalaqah(fields: PeriodFormField[]) {
  return fields
    .filter((f) => f.scope === 'kegiatan' && f.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f, i) => ({
      id: f.id, question: f.label, description: f.description ?? undefined,
      type: f.field_type === 'choice' ? 'dropdown' : 'text', order_index: i,
      options: f.options.map((o) => ({ label: o.label, color: o.color || '#64748b' })),
    }));
}

/** period_forms → halaqahEvaluations lama (jawaban evaluasi kegiatan per halaqah per periode). */
export function formKeHalaqahEvaluation(forms: PeriodForm[]) {
  return forms
    .filter((f) => f.activity_answers && Object.keys(f.activity_answers).length > 0)
    .map((f, i) => ({ id: i + 1, halaqah_id: Number(f.halaqah_id), month_key: f.period_id, answers: f.activity_answers }));
}

/** Label isian sistem lembaga (boleh diganti nama oleh Admin). */
export function labelIsianSistem(fields: PeriodFormField[]) {
  return {
    ziyadah: labelSistem(fields, 'ziyadah', 'Ziyadah (halaman)'),
    murojaah: labelSistem(fields, 'murojaah', 'Murojaah (halaman)'),
    posisi: labelSistem(fields, 'posisi', 'Posisi Hafalan'),
    kelancaran: labelSistem(fields, 'kelancaran', 'Kelancaran'),
    kehadiran: labelSistem(fields, 'kehadiran', 'Kehadiran'),
  };
}

/** Rekap belum lengkap untuk dikirim (Mode Rekap). Aturan sama dengan rpc_simpan_form_periode. */
export function rekapBelumLengkap(r: Pick<PeriodRecap, 'sumber' | 'ziyadah_pages' | 'murojaah_pages' | 'kelancaran' | 'posisi_maju_surah' | 'posisi_mundur_surah' | 'total_pages'>): boolean {
  if (r.sumber === 'harian') return false;
  return r.ziyadah_pages === null || r.murojaah_pages === null || !r.kelancaran
    || (r.posisi_maju_surah === null && r.posisi_mundur_surah === null && r.total_pages === null);
}

/** Periode bawaan untuk dipilih: yang memuat hari ini, selain itu periode terakhir yang sudah mulai, selain itu yang pertama. */
export function periodeBawaan<T extends { start_date?: string; end_date?: string; startDate?: string; endDate?: string; needs_review?: boolean }>(
  list: T[], hariIni: string
): T | undefined {
  const mulai = (p: T) => (p.start_date ?? p.startDate ?? '');
  const selesai = (p: T) => (p.end_date ?? p.endDate ?? '');
  const sah = list.filter((p) => !p.needs_review);
  return sah.find((p) => mulai(p) <= hariIni && hariIni <= selesai(p))
    || [...sah].filter((p) => mulai(p) <= hariIni).sort((a, b) => mulai(b).localeCompare(mulai(a)))[0]
    || sah[0] || list[0];
}
