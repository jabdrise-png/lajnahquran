/**
 * Fase 5 · Ujian & Raport — diuji di PostgreSQL memori (PGlite).
 * Butir rencana: penguji (musammi' sendiri / halaqah ujian), ujian bulanan (nilai + materi),
 * ujian semester (khoto per juz → nilai otomatis, remedial = percobaan baru), raport 3 komponen
 * dengan bobot 100%, penjaga terbit (tolak bila komponen kurang), amandemen beralasan di server.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';

let db: PGlite;
const rows = async <T = any>(sql: string, params: any[] = []) => (await db.query<T>(sql, params)).rows;
const MUSAMMI2 = '00000000-0000-0000-0000-00000000c002';
const MUSAMMI2_ROW = 9102;
let p1: string; let p2: string;

const ujian = (args: Record<string, any>) => db.query<any>(
  `select public.rpc_simpan_ujian(p_santri_id => $1, p_exam_type => $2, p_academic_year_id => ${ID.academicYear},
     p_semester => $3, p_period_id => $4::uuid, p_materi_juz => $5, p_juz => $6::jsonb, p_nilai => $7, p_mode => $8, p_reason => $9) as r`,
  [args.santri ?? ID.santri1, args.type, args.sem ?? 'Ganjil', args.period ?? null, args.materi ?? null,
   args.juz ? JSON.stringify(args.juz) : null, args.nilai ?? null, args.mode ?? 'baru', args.reason ?? null]
).then((r) => r.rows[0].r);
const komponen = (santri: number = ID.santri1) =>
  one<any>(db, `select public.fn_komponen_raport($1, ${ID.academicYear}, 'Ganjil', $2)`, [ID.org, santri]);
const terbit = (santri: number, reason: string | null = null) => db.query<any>(
  `select public.rpc_publish_report_card(${ID.academicYear}, 'Ganjil', $1, '{"total_hafalan":"3 juz","asing":"x"}'::jsonb, $2) as r`,
  [santri, reason]).then((r) => r.rows[0].r);

before(async () => {
  db = await buildTestDb();
  await db.exec(`
    insert into auth.users(id, email) values ('${MUSAMMI2}', 'musammi2@uji.test');
    insert into public.profiles(id, organization_id, full_name, role, email) values ('${MUSAMMI2}', '${ID.org}', 'Ustadz Dua', 'musammi', 'musammi2@uji.test');
    insert into public.musammi(id, organization_id, nama, academic_year_id, user_id) values (${MUSAMMI2_ROW}, '${ID.org}', 'Ustadz Dua', ${ID.academicYear}, '${MUSAMMI2}');
  `);
  await as(db, ID.admin, async () => {
    p1 = await one(db, `insert into public.monthly_exam_periods(organization_id, academic_year_id, semester, ke, label)
                        values ($1, ${ID.academicYear}, 'Ganjil', 1, 'Agustus') returning id`, [ID.org]);
    p2 = await one(db, `insert into public.monthly_exam_periods(organization_id, academic_year_id, semester, ke, label)
                        values ($1, ${ID.academicYear}, 'Ganjil', 2, '') returning id`, [ID.org]);
  });
});

test('pengaturan awal: raport_settings (total 100%) & rubrik aktif tersedia', async () => {
  const s = (await rows<any>(`select * from public.raport_settings where organization_id = $1`, [ID.org]))[0];
  assert.equal(Number(s.bobot_semester) + Number(s.bobot_bulanan) + Number(s.bobot_kehadiran), 100);
  await as(db, ID.admin, () => expectError(db.query(
    `update public.raport_settings set bobot_bulanan = 50 where organization_id = $1`, [ID.org]), /raport_settings_bobot_total/));
  await as(db, ID.admin, () => expectError(db.query(
    `update public.raport_settings set bobot_semester = 0, bobot_bulanan = 100, bobot_kehadiran = 0 where organization_id = $1`, [ID.org]), /bobot_rentang/));
  await as(db, ID.musammi, () => db.query(`update public.raport_settings set ketua_lajnah_nama = 'X' where organization_id = $1`, [ID.org]));
  assert.equal(await one(db, `select ketua_lajnah_nama from public.raport_settings where organization_id = $1`, [ID.org]), null, 'musammi tidak bisa mengubah');
  assert.ok(await one(db, `select (public.fn_rubrik_aktif($1)).id`, [ID.org]));
  assert.equal(await one(db, `select label from public.monthly_exam_periods where id = $1`, [p2]), 'Ujian Bulanan ke-2', 'label kosong diisi otomatis');
});

test('penguji: musammi halaqah sendiri boleh; musammi lain ditolak sampai ditugaskan (halaqah ujian)', async () => {
  const r = await as(db, ID.musammi, () => ujian({ type: 'bulanan', period: p1, nilai: 88, materi: '30' }));
  assert.equal(Number(r.final_score), 88);
  assert.equal(r.predikat, 'Jayyid Jiddan');
  await as(db, MUSAMMI2, () => expectError(ujian({ santri: ID.santri2, type: 'bulanan', period: p1, nilai: 80 }), /bukan penguji/));
  await as(db, ID.musammi, () => expectError(db.query(
    `insert into public.exam_assignments(organization_id, academic_year_id, semester, halaqah_id, musammi_id, exam_type)
     values ($1, ${ID.academicYear}, 'Ganjil', ${ID.halaqah}, ${MUSAMMI2_ROW}, 'semester')`, [ID.org]), /row-level security/));
  await as(db, ID.admin, () => db.query(
    `insert into public.exam_assignments(organization_id, academic_year_id, semester, halaqah_id, musammi_id, exam_type)
     values ($1, ${ID.academicYear}, 'Ganjil', ${ID.halaqah}, ${MUSAMMI2_ROW}, 'semester')`, [ID.org]));
  await as(db, MUSAMMI2, () => expectError(ujian({ santri: ID.santri2, type: 'bulanan', period: p1, nilai: 80 }), /bukan penguji/),
    );
  const s = await as(db, MUSAMMI2, () => ujian({ santri: ID.santri2, type: 'semester', juz: [{ juz: 30, kabir: 0, shoghir: 0 }] }));
  assert.equal(Number(s.final_score), 100, 'penguji semester boleh mengisi ujian semester');
  await as(db, ID.admin, () => db.query(`select public.rpc_batal_ujian($1, 'Data percobaan uji')`, [s.id]));
});

test('ujian bulanan: nilai 0–100, satu nilai per ujian; remedial = percobaan baru; koreksi Admin beralasan', async () => {
  await as(db, ID.musammi, () => expectError(ujian({ type: 'bulanan', period: p2, nilai: 101 }), /0–100/));
  await as(db, ID.musammi, () => expectError(ujian({ type: 'bulanan', nilai: 80 }), /Pilih ujian bulanan/));
  await as(db, ID.musammi, () => expectError(ujian({ type: 'bulanan', period: p1, nilai: 70 }), /sudah punya nilai/));
  const rem = await as(db, ID.musammi, () => ujian({ type: 'bulanan', period: p1, nilai: 92, mode: 'remedial' }));
  assert.equal(rem.attempt_no, 2);
  assert.equal(rem.is_remedial, true);
  const semua = await rows<any>(`select attempt_no, final_score::float, status from public.exam_attempts where period_id = $1 and santri_id = $2 order by attempt_no`, [p1, ID.santri1]);
  assert.deepEqual(semua.map((x) => [x.attempt_no, x.final_score, x.status]), [[1, 88, 'valid'], [2, 92, 'valid']], 'nilai lama tidak ditimpa');

  await as(db, ID.musammi, () => expectError(ujian({ type: 'bulanan', period: p1, nilai: 95, mode: 'koreksi', reason: 'Salah ketik' }), /hanya oleh Admin/));
  await as(db, ID.admin, () => expectError(ujian({ type: 'bulanan', period: p1, nilai: 95, mode: 'koreksi', reason: 'x' }), /alasan/));
  const k = await as(db, ID.admin, () => ujian({ type: 'bulanan', period: p1, nilai: 95, mode: 'koreksi', reason: 'Salah ketik nilai' }));
  assert.equal(k.attempt_no, 3);
  assert.equal(k.is_remedial, true, 'koreksi mewarisi status remedial');
  assert.equal(await one(db, `select status from public.exam_attempts where period_id = $1 and santri_id = $2 and attempt_no = 2`, [p1, ID.santri1]), 'voided');
  assert.ok(Number(await one(db, `select count(*) from public.audit_logs where action = 'correct_exam_attempt'`)) >= 1);
  // Tulis langsung ke tabel ditolak
  await as(db, ID.admin, () => expectError(db.query(`update public.exam_attempts set final_score = 10`), /permission denied/));
});

test('ujian semester: khoto per juz → nilai otomatis dari rubrik (nilai awal − khoto, batas minimum), predikat & KKM', async () => {
  await db.exec(`update public.rubric_versions set initial_score = 100, deduction_major = 5, deduction_minor = 1.25, min_score = 50, passing_score = 70
                 where organization_id = '${ID.org}' and is_active`);
  await as(db, ID.musammi, () => expectError(ujian({ type: 'semester', juz: [] }), /minimal untuk satu juz/));
  await as(db, ID.musammi, () => expectError(ujian({ type: 'semester', juz: [{ juz: 31, kabir: 0, shoghir: 0 }] }), /1–30/));
  await as(db, ID.musammi, () => expectError(ujian({ type: 'semester', juz: [{ juz: 30, kabir: 1 }, { juz: 30, kabir: 2 }] }), /lebih dari sekali/));
  await as(db, ID.musammi, () => expectError(ujian({ type: 'semester', juz: [{ juz: 30, kabir: 1.5 }] }), /bilangan bulat/));
  const r = await as(db, ID.musammi, () => ujian({ type: 'semester', juz: [
    { juz: 30, kabir: 2, shoghir: 4 },   // 100 − 10 − 5 = 85
    { juz: 29, kabir: 20, shoghir: 0 },  // 0 → minimum 50
  ] }));
  assert.deepEqual(r.juz_scores.map((j: any) => [j.juz, Number(j.nilai)]), [[29, 50], [30, 85]]);
  assert.equal(Number(r.final_score), 67.5);
  assert.equal(r.predikat, 'Maqbul');
  assert.equal(r.passed, false, 'di bawah KKM 70');
  assert.equal(await one(db, `select materi_juz from public.exam_attempts where id = $1`, [r.id]), '29,30', 'materi otomatis dari daftar juz');
  const rem = await as(db, ID.musammi, () => ujian({ type: 'semester', mode: 'remedial', juz: [{ juz: 29, kabir: 1, shoghir: 0 }, { juz: 30, kabir: 0, shoghir: 2 }] }));
  assert.equal(Number(rem.final_score), 96.25);
  assert.equal(rem.attempt_no, 2);
});

test('raport: 3 komponen, kekurangan ditampilkan, tidak bisa terbit tanpa nilai semester', async () => {
  // Santri 2 belum punya nilai semester (percobaan tadi dibatalkan)
  const k2 = await komponen(ID.santri2);
  assert.equal(k2.lengkap, false);
  assert.ok(k2.kekurangan.includes('Nilai ujian semester belum ada'));
  await as(db, ID.admin, () => expectError(terbit(ID.santri2), /Raport belum bisa terbit: .*Nilai ujian semester belum ada/));

  // Bobot kehadiran > 0 tanpa tanggal semester → kekurangan
  await as(db, ID.admin, () => db.query(`update public.raport_settings set bobot_semester = 50, bobot_bulanan = 40, bobot_kehadiran = 10 where organization_id = $1`, [ID.org]));
  let k = await komponen();
  assert.deepEqual(k.kekurangan, ['Tanggal semester belum diatur (dibutuhkan untuk kehadiran)']);
  assert.deepEqual(k.peringatan, ['Ujian bulanan ke-2 belum ada nilai']);
  await db.exec(`insert into public.semesters(organization_id, academic_year_id, name, start_date, end_date)
                 values ('${ID.org}', ${ID.academicYear}, 'Ganjil', '2026-07-01', '2026-12-31')
                 on conflict (organization_id, academic_year_id, name) do update set start_date = excluded.start_date, end_date = excluded.end_date`);
  k = await komponen();
  assert.deepEqual(k.kekurangan, ['Belum ada absensi pada semester ini']);
  await as(db, ID.admin, () => db.query(`select public.rpc_record_attendance($1::jsonb, 'Input absensi ujian')`, [JSON.stringify([
    { peran: 'Santri', person_id: ID.santri1, halaqah_id: ID.halaqah, date: '2026-08-01', waktu: 'Shubuh', status: 'hadir' },
    { peran: 'Santri', person_id: ID.santri1, halaqah_id: ID.halaqah, date: '2026-08-02', waktu: 'Shubuh', status: 'hadir' },
    { peran: 'Santri', person_id: ID.santri1, halaqah_id: ID.halaqah, date: '2026-08-03', waktu: 'Shubuh', status: 'hadir' },
    { peran: 'Santri', person_id: ID.santri1, halaqah_id: ID.halaqah, date: '2026-08-04', waktu: 'Shubuh', status: 'alpa' },
  ])]));
  k = await komponen();
  assert.equal(k.lengkap, true);
  // semester 96.25 (remedial terakhir) · bulanan rata-rata 95 (koreksi; ke-2 kosong) · hadir 75%
  assert.equal(Number(k.semester.nilai), 96.25);
  assert.equal(Number(k.bulanan.rata_rata), 95);
  assert.equal(Number(k.kehadiran.persen), 75);
  assert.equal(Number(k.nilai_akhir), Math.round((50 * 96.25 + 40 * 95 + 10 * 75) / 100 * 100) / 100);
  assert.equal(k.predikat, 'Mumtaz');
});

test('terbit raport: hanya Admin; nilai dari server; idempoten; amandemen wajib alasan; nilai terkunci untuk musammi\'', async () => {
  await as(db, ID.musammi, () => expectError(terbit(ID.santri1), /Hanya Admin/));
  const v1 = await as(db, ID.admin, () => terbit(ID.santri1));
  assert.equal(v1.version_no, 1);
  const rc = (await rows<any>(`select * from public.report_cards where id = $1`, [v1.id]))[0];
  assert.equal(Number(rc.final_score), Number((await komponen()).nilai_akhir));
  assert.deepEqual(rc.snapshot_json.info, { total_hafalan: '3 juz' }, 'hanya kunci info yang dikenal');
  assert.equal(rc.snapshot_json.santri_nama, 'Santri Satu');
  assert.ok(rc.verification_code);
  const lagi = await as(db, ID.admin, () => terbit(ID.santri1));
  assert.equal(lagi.is_duplicate_prevented, true);

  // Setelah terbit: musammi' tidak bisa mengubah nilai/catatan; Admin bisa, lalu amandemen
  await as(db, ID.musammi, () => expectError(ujian({ type: 'bulanan', period: p2, nilai: 90 }), /sudah terbit/));
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_simpan_catatan_raport(${ID.santri1}, ${ID.academicYear}, 'Ganjil', 'Rajin')`), /sudah terbit/));
  await as(db, ID.admin, () => ujian({ type: 'bulanan', period: p2, nilai: 85 }));
  await as(db, ID.admin, () => db.query(`select public.rpc_simpan_catatan_raport(${ID.santri1}, ${ID.academicYear}, 'Ganjil', 'Pertahankan murojaah')`));
  await as(db, ID.admin, () => expectError(terbit(ID.santri1), /Alasan amandemen/));
  await as(db, ID.admin, () => expectError(terbit(ID.santri1, 'ok'), /Alasan amandemen/));
  const v2 = await as(db, ID.admin, () => terbit(ID.santri1, 'Ujian bulanan ke-2 susulan'));
  assert.equal(v2.version_no, 2);
  assert.deepEqual((await rows<any>(`select version_no, status from public.report_cards where santri_id = $1 order by version_no`, [ID.santri1]))
    .map((x) => [x.version_no, x.status]), [[1, 'amended'], [2, 'published']]);
  const snap = await one<any>(db, `select snapshot_json from public.report_cards where id = $1`, [v2.id]);
  assert.equal(snap.komponen.catatan, 'Pertahankan murojaah');
  assert.equal(Number(snap.komponen.bulanan.rata_rata), 90);
  // Tulis langsung ke report_cards ditolak
  await as(db, ID.admin, () => expectError(db.query(`update public.report_cards set final_score = 100 where id = $1`, [v2.id]), /permission denied/));
  await as(db, ID.admin, () => expectError(db.query(
    `insert into public.report_cards(organization_id, academic_year_id, semester_name, santri_id, version_no, status, snapshot_json)
     values ($1, ${ID.academicYear}, 'Ganjil', ${ID.santri2}, 9, 'published', '{}')`, [ID.org]), /permission denied/));
});

test('rpc_komponen_raport: Admin melihat semua santri, musammi\' hanya santri yang ia uji', async () => {
  const a = await as(db, ID.admin, () => rows<any>(`select * from public.rpc_komponen_raport(${ID.academicYear}, 'Ganjil', null)`));
  assert.deepEqual(a.map((x) => Number(x.santri_id)).sort(), [ID.santri1, ID.santri2]);
  const m = await as(db, MUSAMMI2, () => rows<any>(`select * from public.rpc_komponen_raport(${ID.academicYear}, 'Ganjil', null)`));
  assert.deepEqual(m.map((x) => Number(x.santri_id)).sort(), [ID.santri1, ID.santri2], 'penguji semester halaqah itu');
  await as(db, ID.admin, () => db.query(`delete from public.exam_assignments where musammi_id = ${MUSAMMI2_ROW}`));
  const m2 = await as(db, MUSAMMI2, () => rows<any>(`select * from public.rpc_komponen_raport(${ID.academicYear}, 'Ganjil', null)`));
  assert.equal(m2.length, 0);
});

test('periode bulanan berisi nilai tidak bisa dihapus', async () => {
  await as(db, ID.admin, () => expectError(db.query(`delete from public.monthly_exam_periods where id = $1`, [p1]), /sudah berisi nilai/));
});

// ================================================================ migrasi data lama
test('migrasi ujian lama ke exam_attempts (bisa diulang), bobot awal 50/30/20, akses tabel lama dicabut', async () => {
  const legacy = `
    insert into public.app_settings(organization_id, key, value) values
      ('${ID.org}', 'PCT_UJIAN_BULANAN', '40'), ('${ID.org}', 'PCT_UJIAN_SEMESTER', '50'), ('${ID.org}', 'PCT_SILABUS', '10'), ('${ID.org}', 'PCT_KEHADIRAN', '0'),
      ('${ID.org}', 'NILAI_AWAL_JUZ', '100'), ('${ID.org}', 'PENGURANG_KHOTO_KABIR', '4'), ('${ID.org}', 'PENGURANG_KHOTO_SHOGIR', '1'), ('${ID.org}', 'MIN_NILAI_JUZ', '60'),
      ('${ID.org}', 'UB_PERIODS_${ID.academicYear}_Ganjil', '[{"id":"ub_1","ke":1,"bulan":"Juli 2026"},{"id":"ub_2","ke":2,"bulan":"Agustus 2026"}]')
      on conflict (organization_id, key) do update set value = excluded.value;
    insert into public.ujian_bulanan(organization_id, santri_id, periode, materi_juz, nilai, academic_year_id, semester) values
      ('${ID.org}', ${ID.santri1}, 'ub_1', '30', 90, ${ID.academicYear}, 'Ganjil'),
      ('${ID.org}', ${ID.santri1}, 'ub_9', '29', 75, ${ID.academicYear}, 'Gasal');
    insert into public.ujian_semester(organization_id, santri_id, academic_year_id, semester, materi_juz, khoto_kabir, khoto_shogir, is_custom_nilai, custom_nilai, nilai_akhir, catatan) values
      ('${ID.org}', ${ID.santri1}, ${ID.academicYear}, 'Ganjil', '29-30', '{"29":1,"30":0}', '{"29":2,"30":1}', '{"30":true}', '{"30":97}', 95.5, 'Lancar');
  `;
  const ldb = await buildTestDb({ beforeMigrations: legacy });
  const q = async (sql: string, p: any[] = []) => (await ldb.query<any>(sql, p)).rows;
  const set = (await q(`select bobot_semester::float s, bobot_bulanan::float b, bobot_kehadiran::float k from public.raport_settings where organization_id = $1`, [ID.org]))[0];
  assert.deepEqual([set.s, set.b, set.k], [50, 30, 20], 'bobot awal 50/30/20 untuk semua lembaga (PCT_* lama & Silabus tidak dipakai)');
  const rub = (await q(`select r.* from public.fn_rubrik_aktif($1) r`, [ID.org]))[0];
  assert.deepEqual([Number(rub.deduction_major), Number(rub.deduction_minor), Number(rub.min_score)], [4, 1, 60]);
  const per = await q(`select ke, label, legacy_key from public.monthly_exam_periods order by ke`);
  assert.deepEqual(per.map((p) => [p.ke, p.legacy_key]), [[1, 'ub_1'], [2, 'ub_2'], [3, 'ub_9']], 'periode lama + periode dari data');
  const sem = (await q(`select * from public.exam_attempts where exam_type = 'semester'`))[0];
  assert.equal(Number(sem.final_score), 95.5, 'nilai akhir lama dipertahankan');
  assert.deepEqual(sem.juz_scores.map((j: any) => [j.juz, Number(j.nilai)]), [[29, 94], [30, 97]]);
  assert.equal(sem.source, 'migrasi');
  assert.equal((await q(`select catatan from public.raport_catatan`))[0].catatan, 'Lancar');
  assert.equal((await q(`select count(*)::int n from public.exam_attempts where exam_type = 'monthly'`))[0].n, 2);
  const rec = await q(`select * from public.f5_legacy_reconciliation()`);
  assert.ok(rec.every((x) => x.status === 'OK'), JSON.stringify(rec));
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  await ldb.exec(readFileSync(join(ROOT, 'database/migrations/2026_11_30_03_f5_migrasi_ujian_lama.sql'), 'utf8'));
  assert.equal((await q(`select count(*)::int n from public.exam_attempts`))[0].n, 3, 'menjalankan ulang tidak menggandakan');
  await ldb.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ID.admin]);
  await ldb.exec('set role authenticated');
  await expectError(ldb.query(`select * from public.ujian_bulanan`), /permission denied/);
  await expectError(ldb.query(`select * from public.ujian_semester`), /permission denied/);
  await ldb.exec('reset role');
});

test('rubrik: hanya Admin; isi divalidasi server; rubrik yang sudah dipakai tidak diubah di tempat (versi baru)', async () => {
  const simpan = (o: Record<string, any> = {}) => db.query<any>(
    `select public.rpc_save_rubric_version($1, ${ID.academicYear}, 'Ganjil', 'Rubrik uji', $2, $3, $4, $5, $6, $7::jsonb, 'uji') as r`,
    [ID.org, o.awal ?? 100, o.shoghir ?? 2, o.kabir ?? 6, o.min ?? 40, o.kkm ?? 75,
     JSON.stringify(o.pred ?? [{ label: 'Lulus', minScore: 75 }, { label: 'Belum', minScore: 0 }])]).then((r) => r.rows[0].r);
  await as(db, ID.musammi, () => expectError(simpan(), /Hanya Admin/));
  await as(db, ID.admin, async () => {
    await expectError(simpan({ min: 120 }), /Nilai minimum harus 0 sampai nilai awal/);
    await expectError(simpan({ kabir: -1 }), /tidak boleh negatif/);
    await expectError(simpan({ kkm: 101 }), /KKM harus 0–100/);
    await expectError(simpan({ pred: [] }), /minimal satu/);
    await expectError(simpan({ pred: [{ label: '', minScore: 50 }] }), /wajib punya nama/);
    await expectError(simpan({ pred: [{ label: 'A', minScore: 50 }, { label: 'a', minScore: 10 }] }), /tidak boleh sama/);
  });
  const lama = await one<string>(db, `select (public.fn_rubrik_aktif($1)).id::text`, [ID.org]);
  const dipakai = Number(await one(db, `select count(*) from public.exam_attempts where organization_id = $1 and rubric_version_id = $2`, [ID.org, lama]));
  const r = await as(db, ID.admin, () => simpan({ pred: [{ label: 'Belum', minScore: 0 }, { label: 'Lulus', minScore: 75 }] }));
  assert.equal(r.is_new_version, true, 'rubrik sudah dipakai -> versi baru');
  const baru = await one<any>(db, `select row_to_json(x) from (select (public.fn_rubrik_aktif($1)).*) x`, [ID.org]);
  assert.notEqual(baru.id, lama);
  assert.equal(Number(baru.deduction_major), 6);
  assert.deepEqual(baru.predicates.map((p: any) => p.label), ['Lulus', 'Belum'], 'predikat diurutkan dari nilai tertinggi');
  assert.equal(await one(db, `select is_active from public.rubric_versions where id = $1`, [lama]), false);
  assert.equal(Number(await one(db, `select count(*) from public.exam_attempts where organization_id = $1 and rubric_version_id = $2`, [ID.org, lama])), dipakai,
    'percobaan lama tetap menunjuk rubrik saat itu');
  assert.equal(Number(await one(db, `select public.fn_nilai_juz(public.fn_rubrik_aktif($1), 1, 2)`, [ID.org])), 90);
});

test('raport memakai nilai TERTINGGI: remedial yang lebih rendah tidak menurunkan nilai (semester & tiap ujian bulanan)', async () => {
  await as(db, ID.admin, async () => {
    await ujian({ santri: ID.santri2, type: 'semester', juz: [{ juz: 30, kabir: 0, shoghir: 0 }] });
    await ujian({ santri: ID.santri2, type: 'semester', mode: 'remedial', juz: [{ juz: 30, kabir: 2, shoghir: 0 }] });
    await ujian({ santri: ID.santri2, type: 'bulanan', period: p2, nilai: 90, materi: '30' });
    await ujian({ santri: ID.santri2, type: 'bulanan', period: p2, nilai: 70, materi: '30', mode: 'remedial' });
  });
  const k = await komponen(ID.santri2);
  const sem = await rows<any>(`select attempt_no, final_score::float from public.exam_attempts
    where santri_id = $1 and exam_type = 'semester' and status = 'valid' order by attempt_no`, [ID.santri2]);
  const tertinggi = Math.max(...sem.map((x) => x.final_score));
  assert.ok(sem.length >= 2 && sem[sem.length - 1].final_score < tertinggi, 'percobaan terakhir lebih rendah');
  assert.equal(Number(k.semester.nilai), tertinggi);
  assert.notEqual(k.semester.attempt_no, sem[sem.length - 1].attempt_no);
  const ke2 = k.bulanan.daftar.find((d: any) => d.ke === 2);
  assert.equal(Number(ke2.nilai), 90);
  assert.equal(ke2.attempt_no, 1);
});

test('nilai custom per juz (fitur lama dipertahankan): divalidasi server, ditandai custom, rata-rata memakai nilai custom', async () => {
  const sid = ID.santri2;
  await as(db, ID.admin, async () => {
    await expectError(ujian({ santri: sid, type: 'semester', mode: 'remedial', juz: [{ juz: 30, kabir: 0, shoghir: 0, nilai_custom: 101 }] }), /custom juz 30 harus 0–100/);
    await expectError(ujian({ santri: sid, type: 'semester', mode: 'remedial', juz: [{ juz: 30, kabir: 0, shoghir: 0, nilai_custom: 'abc' }] }), /harus angka/);
  });
  const r = await as(db, ID.musammi, () => ujian({ santri: sid, type: 'semester', mode: 'remedial',
    juz: [{ juz: 29, kabir: 50, shoghir: 0 }, { juz: 30, kabir: 50, shoghir: 0, nilai_custom: 99.5 }] }));
  const j30 = r.juz_scores.find((j: any) => j.juz === 30);
  const j29 = r.juz_scores.find((j: any) => j.juz === 29);
  assert.equal(j30.custom, true);
  assert.equal(Number(j30.nilai), 99.5);
  assert.equal(j29.custom, false);
  const minimum = Number(await one(db, `select (public.fn_rubrik_aktif($1)).min_score`, [ID.org]));
  assert.equal(Number(j29.nilai), minimum, 'juz tanpa custom tetap dari rubrik (batas minimum)');
  assert.equal(Number(r.final_score), Math.round(((99.5 + minimum) / 2) * 100) / 100);
});
