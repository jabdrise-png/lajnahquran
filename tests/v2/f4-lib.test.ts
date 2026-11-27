/**
 * Fase 4 · lapisan aplikasi Rekap Periode:
 *  - adaptor period_recaps → bentuk lama (Pivot, Statistik, Detail Santri, Dashboard, Raport),
 *    diuji dengan data hasil hitung database sungguhan (Mode Harian & Mode Rekap);
 *  - aturan layar = aturan server (periode tumpang tindih, kelengkapan sebelum Kirim);
 *  - pemeriksaan kode: tabel evaluasi lama & JSON EVALUATION_PERIODS tidak dipakai lagi.
 */
import { bacaModul } from './helpers/baca';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';
import {
  normalisasiRekap, normalisasiField, rekapKeStudentProgress, rekapKeStudentEvaluation, fieldKeEvaluationSettings,
  fieldKePertanyaanHalaqah, formKeHalaqahEvaluation, periodeKeLegacy, periodeTahunAjaran, periodeBawaan, periodeBentrok,
  periodePada, rekapBelumLengkap, teksPosisi, labelIsianSistem, type EvaluationPeriod,
} from '../../lib/rekapAdapter';
import { formatPeriodName } from '../../lib/utils';
import { hitungTotalHafalan } from '../../lib/totalHafalan';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => bacaModul(ROOT, p);
let db: PGlite;
let pH: string; // Mode Harian
let pR: string; // Mode Rekap

const submit = (santri: number, date: string, kind: string, s1: number, a1: number, s2: number, a2: number, kabir = 0) =>
  db.query(`select public.rpc_submit_recitation_entry(p_santri_id => $1, p_halaqah_id => ${ID.halaqah}, p_recitation_date => $2::date,
     p_session_slot => 'Shubuh', p_kind => $3, p_surah_start_no => $4, p_ayah_start => $5, p_surah_end_no => $6, p_ayah_end => $7,
     p_calculated_pages => 0, p_minor_mistakes => 0, p_major_mistakes => $8, p_predicate => null)`, [santri, date, kind, s1, a1, s2, a2, kabir]);
const simpan = (period: string, rows: any[], kirim = false) =>
  db.query<any>(`select public.rpc_simpan_form_periode($1::uuid, ${ID.halaqah}, $2::jsonb, null, $3, null) as r`, [period, JSON.stringify(rows), kirim])
    .then((r) => r.rows[0].r);

before(async () => {
  db = await buildTestDb();
  await as(db, ID.admin, async () => {
    pH = await one(db, `insert into public.evaluation_periods(organization_id, academic_year_id, name, start_date, end_date)
      values ($1, $2, 'Januari', '2027-01-01', '2027-01-31') returning id`, [ID.org, ID.academicYear]);
    pR = await one(db, `insert into public.evaluation_periods(organization_id, academic_year_id, name, start_date, end_date)
      values ($1, $2, 'Februari', '2027-02-01', '2027-02-28') returning id`, [ID.org, ID.academicYear]);
  });
});

const ambil = async () => {
  const recaps = (await db.query<any>(`select * from public.period_recaps order by santri_id, period_id`)).rows.map(normalisasiRekap);
  const fields = (await db.query<any>(`select * from public.period_form_fields where organization_id = $1`, [ID.org])).rows.map(normalisasiField);
  const forms = (await db.query<any>(`select * from public.period_forms`)).rows;
  return { recaps, fields, forms };
};

test('Mode Harian & Mode Rekap sama-sama menghasilkan rekap; adaptor = angka rekap (satuan lama)', async () => {
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
  await as(db, ID.admin, async () => {
    await submit(ID.santri1, '2027-01-04', 'ziyadah', 78, 1, 78, 40);
    await submit(ID.santri1, '2027-01-06', 'ziyadah', 79, 1, 79, 46);
    await submit(ID.santri1, '2027-01-07', 'murojaah', 112, 1, 114, 6);
  });
  await as(db, ID.musammi, () => db.query(`select public.rpc_buka_form_periode($1, ${ID.halaqah})`, [pH]));

  // Halaqah beralih ke Mode Rekap untuk periode berikutnya
  await as(db, ID.admin, () => db.query(`select public.rpc_set_mode_halaqah(${ID.halaqah}, 'rekap')`));
  await as(db, ID.musammi, () => db.query(`select public.rpc_buka_form_periode($1, ${ID.halaqah})`, [pR]));
  await as(db, ID.musammi, () => simpan(pR, [{
    santri_id: ID.santri1, ziyadah_pages: 12, murojaah_pages: 40, posisi_mundur_surah: 67, posisi_mundur_ayah: 30,
    posisi_maju_surah: null, posisi_maju_ayah: null, kelancaran: 'Jayyid',
  }]));

  const { recaps, fields } = await ambil();
  const h = recaps.find((r) => r.period_id === pH && r.santri_id === ID.santri1)!;
  const r = recaps.find((x) => x.period_id === pR && x.santri_id === ID.santri1)!;
  assert.equal(h.sumber, 'harian');
  assert.equal(r.sumber, 'rekap');

  const jumlahSetoran = Number(await one(db, `select sum(calculated_pages) from public.recitation_entries
    where santri_id = $1 and kind = 'ziyadah' and recitation_date between '2027-01-01' and '2027-01-31'`, [ID.santri1]));
  assert.equal(h.ziyadah_pages, jumlahSetoran, 'Ziyadah rekap Mode Harian = jumlah setoran harian');
  assert.ok(h.total_juz! > 0 && r.total_juz! > 0, 'total hafalan terhitung di kedua mode');
  assert.equal(r.total_juz, hitungTotalHafalan(null, { surah: 67, ayah: 30 }).juz);

  const sp = rekapKeStudentProgress(recaps, fields);
  const nilai = (period: string, type: string) => sp.find((x) => x.month_key === period && x.santri_id === ID.santri1 && x.progress_type === type)?.value;
  assert.equal(Number(nilai(pH, 'Ziyadah')), jumlahSetoran, 'Ziyadah dalam halaman');
  assert.equal(Number(nilai(pR, 'Murojaah')), 2, 'Murojaah dalam juz (40 halaman = 2 juz)');
  assert.equal(Number(nilai(pR, 'Total Hafalan')), r.total_juz);
  assert.equal(Number(nilai(pR, 'Hafalan Belakang')), r.total_juz, 'santri arah mundur: hafalan belakang = total');
  assert.equal(nilai(pR, 'Kelancaran'), 'Jayyid');
  assert.match(String(nilai(pR, 'Surat Ayat Belakang')), /Al-Mulk/);
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
});

test('adaptor: isian bebas, evaluasi lama, pertanyaan kegiatan', async () => {
  const fid = await as(db, ID.admin, () => one(db, `insert into public.period_form_fields(organization_id, scope, label, field_type, options)
    values ($1, 'santri', 'Tajwid', 'choice', '[{"label":"Baik","score":90},{"label":"Cukup","score":70}]') returning id`, [ID.org]));
  const yid = await as(db, ID.admin, () => one(db, `insert into public.period_form_fields(organization_id, scope, label, field_type)
    values ($1, 'santri', 'Ikut lomba', 'boolean') returning id`, [ID.org]));
  const cid = await as(db, ID.admin, () => one(db, `insert into public.period_form_fields(organization_id, scope, label, field_type, legacy_ref)
    values ($1, 'santri', 'Catatan Muroqib', 'text', 'student_evaluation:catatan_muroqib') returning id`, [ID.org]));
  const qid = await as(db, ID.admin, () => one(db, `insert into public.period_form_fields(organization_id, scope, label, field_type, options)
    values ($1, 'kegiatan', 'Suasana', 'choice', '[{"label":"Kondusif","color":"#16a34a"}]') returning id`, [ID.org]));
  await as(db, ID.musammi, () => db.query(`select public.rpc_simpan_form_periode($1::uuid, ${ID.halaqah}, $2::jsonb, $3::jsonb, false, null)`,
    [pR, JSON.stringify([{ santri_id: ID.santri1, free_answers: { [fid]: 'Baik', [yid]: 'ya', [cid]: 'Perlu murojaah' }, notes: 'Rajin' }]),
     JSON.stringify({ [qid]: 'Kondusif' })]));

  const { recaps, fields, forms } = await ambil();
  const sp = rekapKeStudentProgress(recaps, fields);
  const v = (type: string) => sp.find((x) => x.month_key === pR && x.santri_id === ID.santri1 && x.progress_type === type)?.value;
  assert.equal(v('Tajwid'), 'Baik');
  assert.equal(v('Ikut lomba'), 'Ya');
  assert.equal(v('Catatan Muroqib'), undefined, 'kolom evaluasi lama tidak masuk progres');
  const ev = rekapKeStudentEvaluation(recaps, fields).find((x) => x.month_key === pR && x.santri_id === ID.santri1)!;
  assert.equal(ev.catatan_muroqib, 'Perlu murojaah');
  assert.equal(ev.catatan_musammi, 'Rajin', 'catatan form = catatan musammi');
  const es = fieldKeEvaluationSettings(fields).filter((x) => x.category === 'Tajwid');
  assert.deepEqual(es.map((x) => [x.label, x.score]), [['Baik', 90], ['Cukup', 70]]);
  const q = fieldKePertanyaanHalaqah(fields).find((x) => x.id === qid)!;
  assert.equal(q.type, 'dropdown');
  assert.equal(q.options[0].color, '#16a34a');
  const he = formKeHalaqahEvaluation(forms.map((f) => ({ ...f, halaqah_id: Number(f.halaqah_id) })));
  assert.deepEqual(he.find((x) => x.month_key === pR)!.answers, { [qid]: 'Kondusif' });
  assert.equal(labelIsianSistem(fields).ziyadah, 'Ziyadah (halaman)');
});

test('aturan layar sama dengan server: kelengkapan sebelum Kirim', async () => {
  const { recaps } = await ambil();
  const s1 = recaps.find((r) => r.period_id === pR && r.santri_id === ID.santri1)!;
  const s2 = recaps.find((r) => r.period_id === pR && r.santri_id === ID.santri2)!;
  assert.equal(rekapBelumLengkap(s1), false);
  assert.equal(rekapBelumLengkap(s2), true);
  await as(db, ID.musammi, () => expectError(simpan(pR, [], true), /1 santri belum lengkap/));
  assert.equal(rekapBelumLengkap({ ...s2, sumber: 'harian' }), false, 'Mode Harian tidak perlu diisi manual');
  await as(db, ID.musammi, () => simpan(pR, [{ santri_id: ID.santri2, ziyadah_pages: 0, murojaah_pages: 20, total_juz: 1.5, kelancaran: 'Maqbul' }], true));
  const s2b = normalisasiRekap((await db.query<any>(`select * from public.period_recaps where period_id = $1 and santri_id = $2`, [pR, ID.santri2])).rows[0]);
  assert.equal(rekapBelumLengkap(s2b), false, 'total juz manual (tanpa posisi) dianggap lengkap');
  assert.equal(s2b.total_pages, 30);
});

test('periode: tumpang tindih, bawaan, tahun ajaran, nama', async () => {
  const list: EvaluationPeriod[] = [
    { id: 'a', academic_year_id: 1, name: 'Jan', start_date: '2027-01-01', end_date: '2027-01-31', needs_review: false },
    { id: 'b', academic_year_id: 1, name: 'Feb', start_date: '2027-02-01', end_date: '2027-02-28', needs_review: false },
    { id: 'c', academic_year_id: 2, name: 'Lain', start_date: '2026-01-01', end_date: '2026-01-31', needs_review: false },
    { id: 'd', academic_year_id: null, name: 'Lama', start_date: '2026-12-01', end_date: '2026-12-31', needs_review: true },
  ];
  assert.equal(periodeBentrok(list, { start_date: '2027-01-31', end_date: '2027-02-02' })?.id, 'a');
  assert.equal(periodeBentrok(list, { id: 'a', start_date: '2027-01-01', end_date: '2027-01-30' }), undefined, 'periode itu sendiri diabaikan');
  assert.equal(periodeBentrok(list, { start_date: '2026-12-05', end_date: '2026-12-06' }), undefined, 'periode perlu-dicek diabaikan');
  assert.equal(periodeBentrok(list, { start_date: '2027-03-01', end_date: '2027-03-31' }), undefined, 'bersebelahan boleh');
  assert.deepEqual(periodeTahunAjaran(list, 1).map((p) => p.id), ['d', 'a', 'b'], 'tanpa tahun ajaran ikut tampil, urut tanggal');
  assert.equal(periodeBawaan(periodeTahunAjaran(list, 1), '2027-02-10')?.id, 'b');
  assert.equal(periodeBawaan(periodeTahunAjaran(list, 1), '2027-05-10')?.id, 'b', 'sesudah periode terakhir → periode terakhir');
  assert.equal(periodeBawaan(periodeTahunAjaran(list, 1), '2026-06-01')?.id, 'a', 'sebelum semua periode → periode pertama yang sah');
  assert.equal(periodePada(list, '2026-12-15'), undefined);
  const legacy = list.map(periodeKeLegacy);
  assert.equal(formatPeriodName('b', legacy), 'Feb');
  assert.equal(formatPeriodName('x', legacy), 'x');
  assert.match(teksPosisi({ posisi_maju_surah: 2, posisi_maju_ayah: 5, posisi_mundur_surah: 78, posisi_mundur_ayah: 40 }), /^Al-Fatihah 1 – Al-Baqarah 5 \+ An-Naba'? – An-Nas$/);
  assert.match(teksPosisi({ posisi_maju_surah: null, posisi_maju_ayah: null, posisi_mundur_surah: 67, posisi_mundur_ayah: 10 }), /^Al-Mulk 1–10 … An-Nas$/);
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

test('kode aplikasi tidak memakai tabel evaluasi lama maupun JSON EVALUATION_PERIODS', () => {
  const pola = [
    /from\(\s*['"`](student_progress|student_evaluation|halaqah_evaluations|halaqah_evaluation_questions|evaluation_settings)['"`]/,
    /['"`]EVALUATION_PERIODS['"`]/, /getEvaluationPeriods/, /AUTO_SYNC_SETORAN_CONFIG/, /addStudentProgressBatch/, /saveHalaqahEvaluation/,
  ];
  for (const f of walk(ROOT)) {
    const src = readFileSync(f, 'utf8');
    for (const p of pola) assert.ok(!p.test(src), `${f.replace(ROOT, '')} masih memuat ${p}`);
  }
  for (const lama of ['pages/PerkembanganInputPage.tsx', 'pages/PerkembanganMasterDataPage.tsx', 'lib/syncEngine.ts', 'pages/Chat.tsx', 'pages/WaliSantriReport.tsx', 'pages/WaliKelasReport.tsx']) {
    assert.ok(!existsSync(join(ROOT, lama)), `${lama} sudah dihapus`);
  }
});

test('layar Fase 4 terpasang', () => {
  const app = read('App.tsx');
  assert.match(app, /path="evaluations" element={<FormEvaluasiPeriodePage \/>}/);
  assert.match(app, /path="evaluations-master" element={<ProgresEvaluasiPage \/>}/);
  const form = read('pages/Evaluasi/FormEvaluasiPeriodePage.tsx');
  for (const k of ['bukaFormPeriode', 'simpanFormPeriode', 'bukaKembaliFormPeriode', 'Simpan Draft', 'Kirim']) assert.ok(form.includes(k), k);
  assert.match(read('pages/Evaluasi/ProgresEvaluasiPage.tsx'), /statusPeriode/);
  const pengaturan = read('pages/PengaturanEvaluasiPage.tsx');
  for (const k of ['PeriodeEvaluasiPanel', 'ModePencatatanPanel', 'IsianFormPanel']) assert.ok(pengaturan.includes(k), k);
  const hook = read('hooks/useSupabaseData.tsx');
  for (const k of ["from('period_recaps')", 'rpc_simpan_form_periode', 'rpc_status_periode', 'rpc_set_mode_halaqah']) assert.ok(hook.includes(k), k);
  // Fase 5: Silabus Hafalan bukan lagi komponen raport (data lama tetap di tabel silabus_scores)
  assert.ok(!read('pages/UjianRaport/RekapNilaiPage.tsx').includes('simpanNilaiSilabus'));
});
