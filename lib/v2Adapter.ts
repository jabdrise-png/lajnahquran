/**
 * Fase 2 — adaptor data V2 ke bentuk yang dipakai halaman lama.
 *
 * Sejak Fase 2 aplikasi hanya membaca tabel V2:
 *   recitation_entries, attendance_records, musammi_attendance_records,
 *   halaqah_student_memberships, student_enrollments, dan tabel referensi.
 * Banyak halaman masih memakai bentuk baris lama (setoran_harian / attendance).
 * Fungsi-fungsi murni di sini menerjemahkan bolak-balik agar halaman tidak perlu
 * ditulis ulang sekaligus. Semua fungsi diuji di tests/v2/f2-adapter.test.ts.
 */
import { SURAHS } from './surahs';

// ------------------------------------------------------------------ referensi
export interface RecitationKind {
  id?: string;
  organization_id?: string;
  code: string;
  name: string;
  adds_memorization: boolean;
  counts_as_murojaah: boolean;
  sort_order?: number;
  is_active: boolean;
  is_system?: boolean;
}

export interface AttendanceStatusRef {
  id?: string;
  organization_id?: string;
  code: string;
  name: string;
  counts_as_present: boolean;
  allows_recitation: boolean;
  sort_order?: number;
  is_active: boolean;
  is_system?: boolean;
}

export interface SessionSlotRef {
  id?: string;
  organization_id?: string;
  code: string;
  name: string;
  start_time?: string | null;
  default_kind_code?: string | null;
  sort_order?: number;
  is_active: boolean;
}

export interface HalaqahTypeRef {
  id?: string;
  organization_id?: string;
  name: string;
  sort_order?: number;
  is_active: boolean;
}

export const DEFAULT_KINDS: RecitationKind[] = [
  { code: 'ziyadah', name: 'Ziyadah', adds_memorization: true, counts_as_murojaah: false, is_active: true },
  { code: 'talqin', name: 'Talqin', adds_memorization: false, counts_as_murojaah: false, is_active: true },
  { code: 'murojaah', name: 'Murojaah', adds_memorization: false, counts_as_murojaah: true, is_active: true },
  { code: 'tamkin', name: 'Tamkin', adds_memorization: false, counts_as_murojaah: true, is_active: true },
  { code: 'sabqi', name: 'Sabqi', adds_memorization: false, counts_as_murojaah: true, is_active: true },
  { code: 'manzil', name: 'Manzil', adds_memorization: false, counts_as_murojaah: true, is_active: true },
];

export const DEFAULT_STATUSES: AttendanceStatusRef[] = [
  { code: 'hadir', name: 'Hadir', counts_as_present: true, allows_recitation: true, is_active: true },
  { code: 'terlambat', name: 'Terlambat', counts_as_present: true, allows_recitation: true, is_active: true },
  { code: 'izin', name: 'Izin', counts_as_present: false, allows_recitation: false, is_active: true },
  { code: 'sakit', name: 'Sakit', counts_as_present: false, allows_recitation: false, is_active: true },
  { code: 'alpa', name: 'Alpa', counts_as_present: false, allows_recitation: false, is_active: true },
];

/** Sama dengan public.fn_slug di database. */
export const slug = (text?: string | null): string =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Cari jenis setoran dari kode atau nama (sama dengan fn_recitation_kind_code). */
export function findKind(kinds: RecitationKind[], value?: string | null): RecitationKind | undefined {
  const s = slug(value);
  if (!s) return undefined;
  const lower = String(value).trim().toLowerCase();
  return (
    kinds.find((k) => k.code === s) ||
    kinds.find((k) => k.name.toLowerCase() === lower) ||
    (s === 'murajaah' ? kinds.find((k) => k.code === 'murojaah') : undefined)
  );
}

/** Cari status kehadiran dari kode atau nama (sama dengan fn_attendance_status_code). */
export function findStatus(statuses: AttendanceStatusRef[], value?: string | null): AttendanceStatusRef | undefined {
  const s = slug(value);
  if (!s) return undefined;
  const lower = String(value).trim().toLowerCase();
  return statuses.find((x) => x.code === s) || statuses.find((x) => x.name.toLowerCase() === lower);
}

// ------------------------------------------------------------------ surat
const surahKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const SURAH_KEYS = SURAHS.map(surahKey);

/** Sama dengan public.fn_surah_no: "Al-Baqarah", "al baqarah", "2", "Surat 2", "2. Al-Baqarah". */
export function surahNo(text?: string | number | null): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return text >= 1 && text <= 114 ? text : null;
  const t = text.trim().toLowerCase();
  const m = t.match(/^(?:surat|surah|qs\.?)?\s*(\d{1,3})\b/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 114 ? n : null;
  }
  const key = surahKey(t.replace(/^\s*\d+\s*[.)-]?\s*/, ''));
  if (!key) return null;
  const idx = SURAH_KEYS.indexOf(key);
  return idx >= 0 ? idx + 1 : null;
}

export const surahName = (no?: number | null): string => (no && no >= 1 && no <= 114 ? SURAHS[no - 1] : '');

const firstInt = (v: unknown, index = 0): number | null => {
  const all = String(v ?? '').match(/\d+/g);
  return all && all[index] !== undefined ? Number(all[index]) : null;
};

// ------------------------------------------------------------------ setoran
/** Baris setoran dalam bentuk lama (setoran_harian) yang dibaca halaman-halaman lama. */
export interface SetoranRow {
  id: string;
  v2_id: string;
  legacy_setoran_id: number | null;
  organization_id: string;
  santri_id: number;
  halaqah_id: number | null;
  session_id: string | null;
  academic_year_id: number | null;
  tanggal: string;
  waktu: string;
  kind: string;
  skema: string;
  adds_memorization: boolean;
  counts_as_murojaah: boolean;
  surah_start_no: number | null;
  surah_end_no: number | null;
  surat_mulai: string;
  ayat_mulai: string;
  surat_selesai: string;
  ayat_selesai: string;
  surat: string;
  ayat: string;
  jumlah_halaman: number;
  kesalahan_kabir: number;
  kesalahan_shoghir: number;
  nilai: string | null;
  keterangan: string | null;
  status_verifikasi: string;
  created_by: string | null;
  reviewed_by: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function recitationToSetoranRow(e: any, kinds: RecitationKind[]): SetoranRow {
  const kind = kinds.find((k) => k.code === e.kind);
  const s1 = e.surah_start_no ?? null;
  const s2 = e.surah_end_no ?? s1;
  const a1 = e.ayah_start ?? null;
  const a2 = e.ayah_end ?? a1;
  const n1 = surahName(s1);
  const n2 = surahName(s2);
  const sameSurah = s1 === s2;
  return {
    id: e.id,
    v2_id: e.id,
    legacy_setoran_id: e.legacy_setoran_id ?? null,
    organization_id: e.organization_id,
    santri_id: Number(e.santri_id),
    halaqah_id: e.halaqah_id === null || e.halaqah_id === undefined ? null : Number(e.halaqah_id),
    session_id: e.session_id ?? null,
    academic_year_id: e.academic_year_id ?? null,
    tanggal: String(e.recitation_date ?? '').slice(0, 10),
    waktu: e.session_slot,
    kind: e.kind,
    skema: kind?.name ?? e.kind,
    adds_memorization: kind ? kind.adds_memorization : e.kind === 'ziyadah',
    counts_as_murojaah: kind ? kind.counts_as_murojaah : e.kind !== 'ziyadah',
    surah_start_no: s1,
    surah_end_no: s2,
    surat_mulai: n1,
    ayat_mulai: a1 === null ? '' : String(a1),
    surat_selesai: n2,
    ayat_selesai: a2 === null ? '' : String(a2),
    surat: sameSurah ? n1 : [n1, n2].filter(Boolean).join(' - '),
    ayat: a1 === null ? '' : sameSurah ? `${a1}-${a2}` : `${a1} - ${a2}`,
    jumlah_halaman: Number(e.calculated_pages ?? 0),
    kesalahan_kabir: Number(e.major_mistakes ?? 0),
    kesalahan_shoghir: Number(e.minor_mistakes ?? 0),
    nilai: e.predicate ?? null,
    keterangan: e.notes ?? null,
    status_verifikasi: e.status,
    created_by: e.created_by ?? null,
    reviewed_by: e.reviewed_by ?? null,
    review_reason: e.review_reason ?? null,
    created_at: e.created_at,
    updated_at: e.updated_at,
  };
}

/** Argumen rpc_submit_recitation_entry dari isian form bentuk lama. */
export function setoranInputToRpcArgs(
  input: any,
  opts: { existingEntryId?: string | null; idempotencyKey?: string | null; sessionId?: string | null } = {}
) {
  const s1 = surahNo(input.surah_start_no ?? input.surat_mulai ?? firstSurahOf(input.surat));
  const s2 = surahNo(input.surah_end_no ?? (input.surat_selesai || null) ?? secondSurahOf(input.surat)) ?? s1;
  const a1 = firstInt(input.ayat_mulai) ?? firstInt(input.ayat, 0) ?? 1;
  const a2 = firstInt(input.ayat_selesai ?? input.ayat_akhir) ?? firstInt(input.ayat, 1) ?? a1;
  if (!s1) throw new Error('Surat mulai belum dipilih atau tidak dikenal.');
  // Arah hafalan mundur (mis. An-Nas -> An-Naba) disimpan sebagai rentang naik
  const forward = (s2 as number) > s1 || ((s2 as number) === s1 && a2 >= a1);
  return {
    p_santri_id: Number(input.santri_id),
    p_halaqah_id: input.halaqah_id === null || input.halaqah_id === undefined || input.halaqah_id === '' ? null : Number(input.halaqah_id),
    p_recitation_date: String(input.tanggal ?? input.recitation_date).slice(0, 10),
    p_session_slot: input.waktu || input.session_slot || 'Shubuh',
    p_kind: input.kind || input.jenis_setoran || input.skema || 'ziyadah',
    p_surah_start_no: forward ? s1 : (s2 as number),
    p_ayah_start: forward ? a1 : a2,
    p_surah_end_no: forward ? (s2 as number) : s1,
    p_ayah_end: forward ? a2 : a1,
    p_calculated_pages: Number(input.jumlah_halaman ?? input.calculated_pages ?? 0) || 0,
    p_minor_mistakes: Number(input.kesalahan_shoghir ?? input.minor_mistakes ?? 0) || 0,
    p_major_mistakes: Number(input.kesalahan_kabir ?? input.major_mistakes ?? 0) || 0,
    p_predicate: input.nilai || input.predicate || null,
    p_notes: input.keterangan || input.catatan || input.notes || null,
    p_status: input.status === 'draft' ? 'draft' : 'submitted',
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_existing_entry_id: opts.existingEntryId ?? null,
    p_session_id: opts.sessionId ?? null,
  };
}

function firstSurahOf(surat?: string | null) {
  return surat ? String(surat).split(' - ')[0] : null;
}
function secondSurahOf(surat?: string | null) {
  const parts = surat ? String(surat).split(' - ') : [];
  return parts.length > 1 ? parts[1] : null;
}

/** UUID v4 (id baris V2) vs id angka (baris lama). */
export const isUuid = (v: unknown) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ------------------------------------------------------------------ absensi
export type AttendanceKind = 'santri' | 'musammi';

/** Baris absensi bentuk lama (AttendanceRecord) dari attendance_records / musammi_attendance_records. */
export function attendanceToLegacy(r: any, kind: AttendanceKind, statuses: AttendanceStatusRef[]) {
  const st = statuses.find((s) => s.code === r.status);
  return {
    id: r.id as string,
    kind,
    sessionId: r.session_id as string,
    date: String(r.attendance_date ?? '').slice(0, 10),
    waktu: r.session_slot,
    personId: Number(kind === 'santri' ? r.santri_id : r.musammi_id),
    peran: kind === 'santri' ? 'Santri' : 'Musammi',
    status: st?.name ?? (r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : r.status),
    statusCode: r.status as string,
    halaqahId: r.halaqah_id === null || r.halaqah_id === undefined ? null : Number(r.halaqah_id),
    isBadal: Boolean(r.is_badal),
    badalMusammiId: r.badal_musammi_id ?? null,
  };
}

/** Isi p_records untuk rpc_record_attendance dari AttendanceRecord bentuk lama. */
export function attendanceInputToRpcRecords(records: any[]) {
  return records.map((r) => ({
    peran: r.peran === 'Musammi' ? 'Musammi' : 'Santri',
    person_id: Number(r.personId ?? r.person_id),
    date: String(r.date).slice(0, 10),
    waktu: r.waktu,
    status: r.status,
    halaqah_id: r.halaqahId ?? r.halaqah_id ?? null,
    is_badal: r.isBadal ?? r.is_badal ?? false,
    badal_musammi_id: r.badalMusammiId ?? r.badal_musammi_id ?? null,
  }));
}

/** Pilih santri yang boleh setor pada sesi: hanya status yang allows_recitation (Hadir/Terlambat). */
export function bolehSetor(statusNameOrCode: string | null | undefined, statuses: AttendanceStatusRef[]) {
  if (!statusNameOrCode) return true; // belum diabsen: tidak dibatasi (spesifikasi: "jika absensi sudah ada")
  const st = findStatus(statuses, statusNameOrCode);
  return st ? st.allows_recitation : true;
}
