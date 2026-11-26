/**
 * Fase 5 · lapisan aplikasi Ujian & Raport:
 *  - hitungan layar (nilai juz, nilai semester, predikat, bobot) = fungsi database;
 *  - daftar juz, penguji, percobaan terakhir;
 *  - pemeriksaan kode: tidak ada lagi tabel ujian lama, RPC lama, tanda tangan di localStorage,
 *    tulis langsung ke report_cards, atau Silabus di raport.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, ID } from './helpers/db';
import {
  RUBRIK_BAWAAN, nilaiJuz, nilaiSemester, predikatNilai, parseDaftarJuz, ringkasDaftarJuz, cekBobot,
  halaqahPenguji, percobaanTerakhir, percobaanRaport, nilaiJuzInput, normalisasiPercobaan, normalisasiRubrik, type Rubrik,
} from '../../lib/ujian';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
let db: PGlite;
before(async () => { db = await buildTestDb(); });

test('nilai juz & predikat layar = fn_nilai_juz / fn_predikat_nilai (dua rubrik, kabir 0–12 × shoghir 0–12)', async () => {
  const rubrik2: Rubrik = { ...RUBRIK_BAWAAN, initial_score: 95, deduction_major: 3.5, deduction_minor: 0.75, min_score: 40, passing_score: 75,
    predicates: [{ label: 'A', minScore: 85 }, { label: 'B', minScore: 70 }, { label: 'C', minScore: 0 }] };
  for (const r of [RUBRIK_BAWAAN, rubrik2]) {
    await db.query(`update public.rubric_versions set initial_score = $2, deduction_major = $3, deduction_minor = $4, min_score = $5,
      passing_score = $6, predicates = $7::jsonb where organization_id = $1 and is_active`,
      [ID.org, r.initial_score, r.deduction_major, r.deduction_minor, r.min_score, r.passing_score, JSON.stringify(r.predicates)]);
    const dbRubrik = normalisasiRubrik((await db.query<any>(`select * from public.fn_rubrik_aktif($1)`, [ID.org])).rows[0]);
    for (let k = 0; k <= 12; k++) for (let s = 0; s <= 12; s += 3) {
      const srv = (await db.query<any>(`select public.fn_nilai_juz(r, $2, $3)::float as n, public.fn_predikat_nilai(r, public.fn_nilai_juz(r, $2, $3)) as p
        from public.fn_rubrik_aktif($1) r`, [ID.org, k, s])).rows[0];
      assert.equal(nilaiJuz(dbRubrik, k, s), srv.n, `kabir ${k} shoghir ${s}`);
      assert.equal(predikatNilai(dbRubrik, nilaiJuz(dbRubrik, k, s)), srv.p);
    }
  }
});

test('nilai semester = rata-rata juz (sama dengan server); daftar juz', () => {
  const r = RUBRIK_BAWAAN;
  assert.equal(nilaiSemester(r, [{ juz: 30, kabir: 2, shoghir: 4 }, { juz: 29, kabir: 20, shoghir: 0 }]), 67.5);
  assert.equal(nilaiSemester(r, []), null);
  assert.deepEqual(parseDaftarJuz('5-1, 30, 30, 31, x, 28-29'), [1, 2, 3, 4, 5, 28, 29, 30]);
  assert.equal(ringkasDaftarJuz([30, 1, 2, 3, 5, 29]), '1-3,5,29-30');
  assert.equal(predikatNilai(r, null), null);
});

test('bobot raport: aturan layar = constraint database', async () => {
  const kasus: [number, number, number][] = [[60, 40, 0], [50, 40, 10], [0, 100, 0], [50, 40, 9], [101, 0, -1], [33.34, 33.33, 33.33]];
  for (const [s, b, k] of kasus) {
    const layar = cekBobot({ bobot_semester: s, bobot_bulanan: b, bobot_kehadiran: k }) === null;
    let server = true;
    try {
      await db.query(`update public.raport_settings set bobot_semester = $2, bobot_bulanan = $3, bobot_kehadiran = $4 where organization_id = $1`, [ID.org, s, b, k]);
    } catch { server = false; }
    assert.equal(layar, server, `${s}/${b}/${k}`);
  }
});

test('penguji: admin semua; musammi halaqah sendiri + penugasan sesuai jenis ujian & semester', () => {
  const H = [
    { id: 1, musammi: { id: 11, user_id: 'u1' } },
    { id: 2, musammi: { id: 12, user_id: 'u2' } },
    { id: 3, musammi: { id: 13, user_id: 'u3' }, musammi_assignments: [{ is_active: true, valid_to: null, musammi_user_id: 'u1' }] },
  ];
  const penguji = [{ halaqah_id: 2, musammi_id: 11, exam_type: 'semester', semester: 'Ganjil' }, { halaqah_id: 2, musammi_id: 11, exam_type: 'semua', semester: 'Genap' }];
  const base = { userId: 'u1', myMusammiIds: [11], penguji, semester: 'Ganjil' };
  assert.deepEqual([...halaqahPenguji(H, { ...base, isAdmin: true, jenis: 'bulanan' })].sort(), [1, 2, 3]);
  assert.deepEqual([...halaqahPenguji(H, { ...base, isAdmin: false, jenis: 'bulanan' })].sort(), [1, 3]);
  assert.deepEqual([...halaqahPenguji(H, { ...base, isAdmin: false, jenis: 'semester' })].sort(), [1, 2, 3]);
  assert.deepEqual([...halaqahPenguji(H, { ...base, isAdmin: false, jenis: 'bulanan', semester: 'Genap' })].sort(), [1, 2, 3]);
});

test('percobaan terakhir yang sah dipakai (remedial menggantikan, yang dibatalkan diabaikan)', () => {
  const a = (no: number, status: string, nilai: number, period: string | null = null) =>
    normalisasiPercobaan({ id: `a${no}`, santri_id: '7', exam_type: period ? 'monthly' : 'semester', academic_year_id: '1', semester_name: 'Ganjil',
      period_id: period, attempt_no: no, final_score: String(nilai), status, juz_scores: [{ juz: '30', kabir: '1', shoghir: '0', nilai: '95' }] });
  const list = [a(1, 'valid', 60), a(2, 'valid', 80), a(3, 'voided', 99), a(1, 'valid', 70, 'p1')];
  assert.equal(percobaanTerakhir(list, 7, 'semester')?.final_score, 80);
  assert.equal(percobaanTerakhir(list, 7, 'monthly', 'p1')?.final_score, 70);
  assert.equal(percobaanTerakhir(list, 7, 'monthly', 'p2'), undefined);
  assert.deepEqual(list[0].juz_scores[0], { juz: 30, kabir: 1, shoghir: 0, nilai: 95, custom: false });
});

// ---------------------------------------------------------------- pemeriksaan kode
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'tests', 'scripts', 'database', 'docs', 'types'].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(f)) out.push(p);
  }
  return out;
}

test('kode aplikasi: tidak ada tabel ujian lama, RPC lama, tanda tangan di localStorage, tulis langsung raport, silabus', () => {
  const pola = [
    /from\(\s*['"`](ujian_bulanan|ujian_semester|silabus_scores)['"`]/,
    /rpc_record_exam_attempt/, /e_signature_image/, /UB_PERIODS_/, /PCT_UJIAN|PCT_SILABUS|PCT_KEHADIRAN/,
    /NILAI_AWAL_JUZ|PENGURANG_KHOTO/, /GLOBAL_PREDIKAT_NILAI['"`]/, /saveUjianBulanan|saveUjianSemester/,
    /from\(\s*['"`]report_cards['"`]\)\s*\.(insert|update|upsert|delete)/,
    /from\(\s*['"`]exam_attempts['"`]\)\s*\.(insert|update|upsert|delete)/,
  ];
  for (const f of walk(ROOT)) {
    const src = readFileSync(f, 'utf8');
    for (const p of pola) assert.ok(!p.test(src), `${f.replace(ROOT, '')} masih memuat ${p}`);
  }
});

test('layar Fase 5 terpasang', () => {
  const hook = read('hooks/useSupabaseData.tsx');
  for (const k of ['rpc_simpan_ujian', 'rpc_komponen_raport', 'rpc_publish_report_card', "from('exam_attempts')", "from('raport_settings')", "from('monthly_exam_periods')", "from('exam_assignments')"]) {
    assert.ok(hook.includes(k), k);
  }
  const rekap = read('pages/UjianRaport/RekapNilaiPage.tsx');
  assert.match(rekap, /kekurangan/);
  assert.match(rekap, /terbitkanRaport/);
  const doc = read('components/RaportDocument.tsx');
  assert.match(doc, /Wali Santri/);
  assert.match(doc, /ttd\.gambar/);
  assert.match(doc, /Kode verifikasi/);
  assert.doesNotMatch(doc, /Silabus|Pencapaian Hafalan/);
  assert.match(read('pages/UjianRaport/PengaturanNilaiPage.tsx'), /simpanPengaturanRaport/);
  const perm = read('lib/permissions.ts');
  assert.match(perm, /path: '\/app\/exams-monthly',[\s\S]*?roles: \['admin', 'musammi', 'superadmin'\]/, 'musammi penguji bisa membuka ujian bulanan');
  assert.match(read('components/Sidebar.tsx'), /canonicalRole === 'musammi'[\s\S]*?Ujian Bulanan/);
});

test('percobaanRaport = nilai tertinggi yang sah (sama dengan server); bila sama, yang terbaru', () => {
  const a = (no: number, status: string, nilai: number | null) =>
    normalisasiPercobaan({ id: `b${no}`, santri_id: 8, exam_type: 'semester', academic_year_id: 1, semester_name: 'Ganjil',
      period_id: null, attempt_no: no, final_score: nilai, status, juz_scores: [] });
  assert.equal(percobaanRaport([a(1, 'valid', 85), a(2, 'valid', 70), a(3, 'voided', 99)], 8, 'semester')?.attempt_no, 1);
  assert.equal(percobaanRaport([a(1, 'valid', 80), a(2, 'valid', 80)], 8, 'semester')?.attempt_no, 2);
  assert.equal(percobaanRaport([a(1, 'valid', null), a(2, 'valid', 60)], 8, 'semester')?.attempt_no, 2);
  assert.equal(percobaanRaport([], 8, 'semester'), undefined);
});

test('nilai custom per juz: layar = server (custom dipakai apa adanya, kosong = hitungan rubrik)', () => {
  const r = normalisasiRubrik({ initial_score: 100, deduction_major: 5, deduction_minor: 1.25, min_score: 50, passing_score: 70, predicates: [] });
  assert.equal(nilaiSemester(r, [{ juz: 29, kabir: 2, shoghir: 0 }, { juz: 30, kabir: 9, shoghir: 9, nilai_custom: 97 }]), 93.5);
  assert.equal(nilaiSemester(r, [{ juz: 30, kabir: 1, shoghir: 0, nilai_custom: null }]), 95);
  assert.equal(nilaiJuzInput(r, { juz: 1, kabir: 0, shoghir: 0, nilai_custom: 0 }), 0, 'custom 0 tetap dipakai');
});
