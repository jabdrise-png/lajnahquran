/**
 * Fase 5 · Ujian & Raport — tipe data & hitungan layar.
 * Aturan sama dengan fungsi database (fn_nilai_juz, fn_predikat_nilai); server tetap menghitung
 * ulang saat menyimpan. Fungsi di sini untuk pratinjau dan tampilan.
 */

export interface Rubrik {
  id?: string;
  version_no?: number;
  name?: string;
  initial_score: number;
  deduction_minor: number;
  deduction_major: number;
  min_score: number;
  passing_score: number;
  predicates: { label: string; minScore: number }[];
}

export const RUBRIK_BAWAAN: Rubrik = {
  initial_score: 100,
  deduction_minor: 1.25,
  deduction_major: 5,
  min_score: 50,
  passing_score: 70,
  predicates: [
    { label: 'Mumtaz', minScore: 90 },
    { label: 'Jayyid Jiddan', minScore: 80 },
    { label: 'Jayyid', minScore: 70 },
    { label: 'Maqbul', minScore: 60 },
    { label: 'Rasib', minScore: 0 },
  ],
};

export interface JuzKhoto {
  juz: number;
  kabir: number;
  shoghir: number;
  nilai?: number;
}

export interface PeriodeUjianBulanan {
  id: string;
  academic_year_id: number;
  semester: 'Ganjil' | 'Genap';
  ke: number;
  label: string;
  legacy_key?: string | null;
}

export interface PercobaanUjian {
  id: string;
  santri_id: number;
  exam_type: 'monthly' | 'semester';
  academic_year_id: number;
  semester_name: string;
  period_id: string | null;
  attempt_no: number;
  is_remedial: boolean;
  materi_juz: string | null;
  juz_scores: JuzKhoto[];
  final_score: number | null;
  predikat: string | null;
  passed: boolean | null;
  notes: string | null;
  status: 'valid' | 'voided';
  void_reason?: string | null;
  source?: string;
  created_at?: string;
  examiner_id?: string | null;
}

export interface PengaturanRaport {
  organization_id?: string;
  bobot_semester: number;
  bobot_bulanan: number;
  bobot_kehadiran: number;
  ketua_lajnah_nama: string | null;
  ketua_lajnah_jabatan: string;
  ttd_image: string | null;
  kota_terbit: string | null;
}

export const PENGATURAN_RAPORT_BAWAAN: PengaturanRaport = {
  bobot_semester: 60, bobot_bulanan: 40, bobot_kehadiran: 0,
  ketua_lajnah_nama: null, ketua_lajnah_jabatan: 'Ketua Lajnah', ttd_image: null, kota_terbit: null,
};

/** Komponen raport dari server (fn_komponen_raport). */
export interface KomponenRaport {
  santri_id: number;
  bobot: { semester: number; bulanan: number; kehadiran: number };
  semester: null | { attempt_id: string; attempt_no: number; is_remedial: boolean; nilai: number; predikat: string;
    materi_juz: string | null; juz: JuzKhoto[] };
  bulanan: { rata_rata: number | null; jumlah_ujian: number; jumlah_nilai: number;
    daftar: { period_id: string; ke: number; label: string; nilai: number | null; attempt_no: number | null; is_remedial: boolean | null }[] };
  kehadiran: { persen: number | null; hadir: number | null; total: number | null; mulai: string | null; selesai: string | null };
  catatan: string | null;
  nilai_akhir: number | null;
  predikat: string | null;
  kekurangan: string[];
  peringatan: string[];
  lengkap: boolean;
}

const n = (v: unknown, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const bulat2 = (x: number) => Math.round(x * 100) / 100;

export function normalisasiRubrik(r: any): Rubrik {
  if (!r) return RUBRIK_BAWAAN;
  const preds = Array.isArray(r.predicates) && r.predicates.length
    ? r.predicates.map((p: any) => ({ label: String(p.label), minScore: n(p.minScore, 0) }))
    : RUBRIK_BAWAAN.predicates;
  return {
    id: r.id, version_no: r.version_no, name: r.name,
    initial_score: n(r.initial_score, 100), deduction_minor: n(r.deduction_minor, 1.25), deduction_major: n(r.deduction_major, 5),
    min_score: n(r.min_score, 50), passing_score: n(r.passing_score, 70),
    predicates: [...preds].sort((a, b) => b.minScore - a.minScore),
  };
}

/** Nilai satu juz = nilai awal − kabir×pengurang kabir − shoghir×pengurang shoghir, tidak di bawah minimum. */
export function nilaiJuz(rubrik: Rubrik, kabir: number, shoghir: number): number {
  const v = rubrik.initial_score - Math.max(0, n(kabir, 0)) * rubrik.deduction_major - Math.max(0, n(shoghir, 0)) * rubrik.deduction_minor;
  return bulat2(Math.max(rubrik.min_score, v));
}

/** Nilai ujian semester = rata-rata nilai per juz. */
export function nilaiSemester(rubrik: Rubrik, juz: JuzKhoto[]): number | null {
  if (!juz.length) return null;
  const total = juz.reduce((s, j) => s + nilaiJuz(rubrik, j.kabir, j.shoghir), 0);
  return bulat2(total / juz.length);
}

export function predikatNilai(rubrik: Rubrik, nilai: number | null | undefined): string | null {
  if (nilai === null || nilai === undefined || !Number.isFinite(Number(nilai))) return null;
  const p = [...rubrik.predicates].sort((a, b) => b.minScore - a.minScore).find((x) => Number(nilai) >= x.minScore);
  return p?.label ?? rubrik.predicates[rubrik.predicates.length - 1]?.label ?? null;
}

/** "1-5, 30" → [1,2,3,4,5,30] (juz 1–30). */
export function parseDaftarJuz(materi: string | null | undefined): number[] {
  const hasil = new Set<number>();
  for (const bagian of String(materi || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = bagian.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Math.min(Number(m[1]), Number(m[2])), b = Math.max(Number(m[1]), Number(m[2]));
      for (let i = Math.max(1, a); i <= Math.min(30, b); i++) hasil.add(i);
    } else if (/^\d+$/.test(bagian)) {
      const v = Number(bagian);
      if (v >= 1 && v <= 30) hasil.add(v);
    }
  }
  return Array.from(hasil).sort((a, b) => a - b);
}

/** [1,2,3,5,30] → "1-3,5,30" */
export function ringkasDaftarJuz(juz: number[]): string {
  const s = [...new Set(juz)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(',');
}

/** Percobaan terakhir yang sah untuk satu santri & ujian (periode bulanan tertentu atau semester). */
export function percobaanTerakhir(list: PercobaanUjian[], santriId: number, examType: 'monthly' | 'semester', periodId: string | null = null) {
  return list
    .filter((a) => a.status === 'valid' && a.santri_id === santriId && a.exam_type === examType && (a.period_id ?? null) === periodId)
    .sort((a, b) => b.attempt_no - a.attempt_no)[0];
}

export function riwayatPercobaan(list: PercobaanUjian[], santriId: number, examType: 'monthly' | 'semester', periodId: string | null = null) {
  return list
    .filter((a) => a.santri_id === santriId && a.exam_type === examType && (a.period_id ?? null) === periodId)
    .sort((a, b) => a.attempt_no - b.attempt_no);
}

export function normalisasiPercobaan(a: any): PercobaanUjian {
  const angka = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    ...a,
    santri_id: Number(a.santri_id),
    academic_year_id: Number(a.academic_year_id),
    attempt_no: Number(a.attempt_no) || 1,
    final_score: angka(a.final_score),
    juz_scores: Array.isArray(a.juz_scores) ? a.juz_scores.map((j: any) => ({ juz: Number(j.juz), kabir: Number(j.kabir) || 0, shoghir: Number(j.shoghir) || 0, nilai: angka(j.nilai) ?? undefined })) : [],
    status: a.status === 'voided' ? 'voided' : 'valid',
  };
}

/** Bobot raport valid bila total 100 dan ujian semester > 0 (aturan sama dengan constraint database). */
export function cekBobot(b: { bobot_semester: number; bobot_bulanan: number; bobot_kehadiran: number }): string | null {
  const s = Number(b.bobot_semester), bl = Number(b.bobot_bulanan), k = Number(b.bobot_kehadiran);
  if ([s, bl, k].some((x) => !Number.isFinite(x) || x < 0 || x > 100)) return 'Bobot harus 0–100.';
  if (s <= 0) return 'Bobot ujian semester harus lebih dari 0.';
  if (Math.round((s + bl + k) * 100) !== 10000) return `Total bobot harus 100% (sekarang ${bulat2(s + bl + k)}%).`;
  return null;
}

/** Nilai untuk tampilan: 87 / 87.5 / 87.25 */
export const tampilNilai = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? '-' : String(bulat2(Number(v)));

/**
 * Halaqah yang santrinya boleh diuji pengguna (cermin fn_bisa_menguji di server):
 * Admin semua; musammi' = halaqah yang ia pegang + halaqah yang ditugaskan sebagai penguji.
 */
export function halaqahPenguji(
  halaqahList: { id: number; musammi?: { id?: number; user_id?: string | null } | null; musammi_assignments?: any[] }[],
  opts: { isAdmin: boolean; userId?: string | null; myMusammiIds: number[]; penguji: { halaqah_id: number; musammi_id: number; exam_type: string; semester: string }[];
    semester: string; jenis: 'bulanan' | 'semester' }
): Set<number> {
  if (opts.isAdmin) return new Set(halaqahList.map((h) => Number(h.id)));
  const mine = new Set(opts.myMusammiIds.map(Number));
  const hasil = new Set<number>();
  for (const h of halaqahList) {
    const pegang = (opts.userId && h.musammi?.user_id === opts.userId) || mine.has(Number(h.musammi?.id))
      || (h.musammi_assignments || []).some((a: any) => a.is_active && !a.valid_to && ((opts.userId && a.musammi_user_id === opts.userId) || mine.has(Number(a.musammi_id))));
    if (pegang) hasil.add(Number(h.id));
  }
  for (const p of opts.penguji) {
    if (p.semester === opts.semester && mine.has(Number(p.musammi_id)) && (p.exam_type === 'semua' || p.exam_type === opts.jenis)) {
      hasil.add(Number(p.halaqah_id));
    }
  }
  return hasil;
}
