/**
 * Fase 4 · Rekap Periode — diuji di PostgreSQL memori (PGlite).
 * Butir rencana: periode tidak tumpang tindih, mode harian/rekap per halaqah, period_recaps,
 * period_forms, isian dinamis, hitung rekap harian, total hafalan dari posisi, form evaluasi
 * (draft/kirim), koreksi Admin beralasan, pemantauan, migrasi data evaluasi lama.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';
import { hitungTotalHafalan } from '../../lib/totalHafalan';
import { SURAHS_DATA } from '../../lib/quranPageMap';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
let db: PGlite;
const rows = async <T = any>(sql: string, params: any[] = []) => (await db.query<T>(sql, params)).rows;

const P1 = { start: '2026-09-01', end: '2026-09-30' };
const P2 = { start: '2026-10-01', end: '2026-10-31' };
let p1: string, p2: string;

const submit = (santri: number, date: string, kind: string, s1: number, a1: number, s2: number, a2: number, kabir = 0, shoghir = 0, halaqah: number = ID.halaqah) =>
  db.query<any>(
    `select public.rpc_submit_recitation_entry(p_santri_id => $1, p_halaqah_id => $9, p_recitation_date => $2::date,
       p_session_slot => 'Shubuh', p_kind => $3, p_surah_start_no => $4, p_ayah_start => $5, p_surah_end_no => $6, p_ayah_end => $7,
       p_calculated_pages => 0, p_minor_mistakes => $8, p_major_mistakes => $10, p_predicate => null) as r`,
    [santri, date, kind, s1, a1, s2, a2, shoghir, halaqah, kabir]
  ).then((r) => r.rows[0].r);

const record = (records: any[], reason?: string) =>
  db.query<any>(`select public.rpc_record_attendance($1::jsonb, $2) as r`, [JSON.stringify(records), reason ?? null]).then((r) => r.rows[0].r);

const buka = (period: string, halaqah: number = ID.halaqah) =>
  db.query<any>(`select public.rpc_buka_form_periode($1::uuid, $2) as r`, [period, halaqah]).then((r) => r.rows[0].r);

const simpan = (period: string, rowsIn: any[], opts: { activity?: any; kirim?: boolean; reason?: string; halaqah?: number } = {}) =>
  db.query<any>(`select public.rpc_simpan_form_periode($1::uuid, $2, $3::jsonb, $4::jsonb, $5, $6) as r`,
    [period, opts.halaqah ?? ID.halaqah, JSON.stringify(rowsIn), opts.activity ? JSON.stringify(opts.activity) : null, opts.kirim ?? false, opts.reason ?? null]
  ).then((r) => r.rows[0].r);

const rekap = async (period: string, santri: number) =>
  (await rows<any>(`select * from public.period_recaps where period_id = $1 and santri_id = $2`, [period, santri]))[0];

before(async () => {
  db = await buildTestDb();
  await as(db, ID.admin, async () => {
    p1 = await one(db, `insert into public.evaluation_periods(organization_id, academic_year_id, name, start_date, end_date)
                        values ($1, $2, 'September', $3, $4) returning id`, [ID.org, ID.academicYear, P1.start, P1.end]);
    p2 = await one(db, `insert into public.evaluation_periods(organization_id, academic_year_id, name, start_date, end_date)
                        values ($1, $2, 'Oktober', $3, $4) returning id`, [ID.org, ID.academicYear, P2.start, P2.end]);
  });
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
});

// ================================================================ butir 7: total hafalan dari posisi
test('fn_total_hafalan = hitungTotalHafalan (aplikasi) untuk posisi maju, mundur, dan gabungan', async () => {
  const cases: [number | null, number | null, number | null, number | null][] = [
    [114, 6, null, null], [null, null, 1, 1], [null, null, 78, 1], [null, null, 78, 40], [2, 141, 78, 1], [1, 7, null, null],
    [null, null, 67, 30], [18, 110, 67, 1], [2, 286, 2, 1], [null, null, 33, 4],
  ];
  for (let s = 1; s <= 114; s += 7) {
    const n = SURAHS_DATA[s - 1].totalAyah;
    cases.push([s, Math.ceil(n / 2), null, null], [null, null, s, Math.ceil(n / 3)], [s, n, 115 - s, 1]);
  }
  for (const [ms, ma, us, ua] of cases) {
    const server = (await rows<any>(`select halaman::float8 as h, juz::float8 as j from public.fn_total_hafalan($1, $2, $3, $4)`, [ms, ma, us, ua]))[0];
    const app = hitungTotalHafalan(ms ? { surah: ms, ayah: ma! } : null, us ? { surah: us, ayah: ua! } : null);
    assert.deepEqual([server.h, server.j], [app.halaman, app.juz], `maju ${ms}:${ma} mundur ${us}:${ua}`);
  }
});

// ================================================================ butir 1: periode
test('periode tumpang tindih ditolak; periode bersebelahan boleh; hanya Admin', async () => {
  await as(db, ID.admin, () => expectError(db.query(
    `insert into public.evaluation_periods(organization_id, name, start_date, end_date) values ($1, 'Bentrok', '2026-09-30', '2026-10-05')`, [ID.org]),
    /tumpang tindih dengan periode "September"/));
  await as(db, ID.admin, () => expectError(db.query(
    `update public.evaluation_periods set end_date = '2026-10-02' where id = $1`, [p1]), /tumpang tindih dengan periode "Oktober"/));
  await as(db, ID.admin, () => expectError(db.query(
    `insert into public.evaluation_periods(organization_id, name, start_date, end_date) values ($1, 'Terbalik', '2026-12-10', '2026-12-01')`, [ID.org]),
    /tidak boleh sebelum/));
  await as(db, ID.musammi, () => expectError(db.query(
    `insert into public.evaluation_periods(organization_id, name, start_date, end_date) values ($1, 'Musammi', '2027-01-01', '2027-01-31')`, [ID.org]),
    /row-level security/));
  const n = await as(db, ID.musammi, () => one(db, `select count(*)::int from public.evaluation_periods`));
  assert.equal(n, 2, 'musammi bisa melihat daftar periode');
});

test('isian sistem tidak bisa dihapus, hanya diganti nama', async () => {
  const id = await one(db, `select id from public.period_form_fields where organization_id = $1 and system_key = 'ziyadah'`, [ID.org]);
  await as(db, ID.admin, () => expectError(db.query(`delete from public.period_form_fields where id = $1`, [id]), /tidak bisa dihapus/));
  await as(db, ID.admin, () => db.query(`update public.period_form_fields set label = 'Hafalan Baru' where id = $1`, [id]));
  await as(db, ID.admin, () => expectError(db.query(`update public.period_form_fields set field_type = 'number' where id = $1`, [id]), /tidak bisa diubah/));
  assert.equal(await one(db, `select count(*)::int from public.period_form_fields where organization_id = $1 and system_key is not null`, [ID.org]), 5);
});

// ================================================================ butir 6 & 8: Mode Harian
test('Mode Harian: ziyadah = jumlah setoran harian, posisi & total dari ziyadah terakhir, kelancaran & kehadiran otomatis', async () => {
  await as(db, ID.admin, async () => {
    await submit(ID.santri1, '2026-09-02', 'ziyadah', 78, 1, 78, 40);               // 1.5 hal, Mumtaz
    await submit(ID.santri1, '2026-09-05', 'ziyadah', 79, 1, 79, 46, 1, 2);         // Jayyid Jiddan
    await submit(ID.santri1, '2026-09-07', 'ziyadah', 80, 1, 80, 42, 3, 0);         // Rasib: tidak dihitung, tidak menggeser posisi
    await submit(ID.santri1, '2026-09-08', 'murojaah', 112, 1, 114, 6);
    await submit(ID.santri1, '2026-08-30', 'ziyadah', 77, 1, 77, 50);               // di luar periode
    await record([
      { peran: 'Santri', person_id: ID.santri1, date: '2026-09-02', waktu: 'Shubuh', status: 'Hadir', halaqah_id: ID.halaqah },
      { peran: 'Santri', person_id: ID.santri1, date: '2026-09-03', waktu: 'Shubuh', status: 'Sakit', halaqah_id: ID.halaqah },
      { peran: 'Santri', person_id: ID.santri1, date: '2026-09-04', waktu: 'Shubuh', status: 'Terlambat', halaqah_id: ID.halaqah },
      { peran: 'Santri', person_id: ID.santri1, date: '2026-09-09', waktu: 'Shubuh', status: 'Hadir', halaqah_id: ID.halaqah },
    ], 'Input absensi bulan lalu');
  });

  const hasil = await as(db, ID.musammi, () => buka(p1));
  assert.equal(hasil.form.recording_mode, 'harian');
  assert.equal(hasil.form.status, 'belum_diisi');
  assert.deepEqual(hasil.recaps.map((r: any) => r.santri_id).sort(), [ID.santri1, ID.santri2]);

  const pages = Number(await one(db, `select sum(calculated_pages) from public.recitation_entries
     where santri_id = $1 and kind = 'ziyadah' and not is_repeat and recitation_date between $2 and $3`, [ID.santri1, P1.start, P1.end]));
  const murojaah = Number(await one(db, `select public.fn_hitung_halaman(112, 1, 114, 6)`));
  const r = await rekap(p1, ID.santri1);
  assert.equal(r.sumber, 'harian');
  assert.equal(Number(r.ziyadah_pages), pages, 'ziyadah rekap = jumlah setoran harian (tanpa Rasib)');
  assert.equal(Number(r.murojaah_pages), murojaah);
  assert.deepEqual([r.posisi_mundur_surah, r.posisi_mundur_ayah, r.posisi_maju_surah], [79, 46, null], 'posisi dari ziyadah terakhir yang tidak diulang');
  const t = hitungTotalHafalan(null, { surah: 79, ayah: 46 });
  assert.deepEqual([Number(r.total_pages), Number(r.total_juz)], [t.halaman, t.juz]);
  assert.equal(r.kelancaran, 'Jayyid Jiddan', 'rata-rata peringkat Mumtaz, Jayyid Jiddan, Rasib, Mumtaz');
  assert.deepEqual([r.hadir_count, r.kehadiran_total, Number(r.kehadiran_persen)], [3, 4, 75]);

  // Setoran baru (bertanggal mundur, periode belum dikirim) langsung masuk rekap
  await as(db, ID.musammi, () => submit(ID.santri1, '2026-09-10', 'ziyadah', 78, 1, 78, 10));
  const r2 = await rekap(p1, ID.santri1);
  assert.equal(Number(r2.ziyadah_pages), pages + Number(await one(db, `select public.fn_hitung_halaman(78, 1, 78, 10)`)));
  assert.deepEqual([r2.posisi_mundur_surah, r2.posisi_mundur_ayah], [78, 10]);
});

test('Mode Harian: isian sistem terkunci untuk musammi\', Admin mengoreksi dengan alasan', async () => {
  await as(db, ID.musammi, () => expectError(simpan(p1, [{ santri_id: ID.santri1, ziyadah_pages: 99 }]), /terisi otomatis/));
  await as(db, ID.admin, () => expectError(simpan(p1, [{ santri_id: ID.santri1, ziyadah_pages: 9 }]), /wajib menyertakan alasan/));
  await as(db, ID.admin, () => simpan(p1, [{ santri_id: ID.santri1, ziyadah_pages: 9 }], { reason: 'Setoran luar halaqah' }));
  let r = await rekap(p1, ID.santri1);
  assert.equal(Number(r.ziyadah_pages), 9);
  assert.deepEqual(r.overrides, { ziyadah: true });
  // Koreksi Admin tidak ditimpa hitung ulang
  await as(db, ID.admin, () => submit(ID.santri1, '2026-09-11', 'ziyadah', 78, 11, 78, 20));
  r = await rekap(p1, ID.santri1);
  assert.equal(Number(r.ziyadah_pages), 9);
  assert.deepEqual([r.posisi_mundur_surah, r.posisi_mundur_ayah], [78, 20], 'isian lain tetap otomatis');
  // Kembalikan ke otomatis
  await as(db, ID.admin, () => simpan(p1, [{ santri_id: ID.santri1, reset_overrides: true }], { reason: 'Kembali ke hitungan setoran' }));
  r = await rekap(p1, ID.santri1);
  assert.deepEqual(r.overrides, {});
  const sum = Number(await one(db, `select sum(calculated_pages) from public.recitation_entries
     where santri_id = $1 and kind = 'ziyadah' and not is_repeat and recitation_date between $2 and $3`, [ID.santri1, P1.start, P1.end]));
  assert.equal(Number(r.ziyadah_pages), sum, 'kembali sama dengan jumlah setoran');
  assert.ok(Number(await one(db, `select count(*) from public.audit_logs where action = 'correct_period_form'`)) >= 2);
});

test('form: isian bebas & evaluasi kegiatan divalidasi; Simpan Draft lalu Kirim; setelah dikirim terkunci', async () => {
  const fid = await as(db, ID.admin, () => one(db,
    `insert into public.period_form_fields(organization_id, scope, label, field_type, options) values ($1, 'santri', 'Adab', 'choice', '[{"label":"Baik"},{"label":"Cukup"}]') returning id`, [ID.org]));
  const nid = await as(db, ID.admin, () => one(db,
    `insert into public.period_form_fields(organization_id, scope, label, field_type) values ($1, 'santri', 'Nilai Tajwid', 'number') returning id`, [ID.org]));
  const qid = await as(db, ID.admin, () => one(db,
    `insert into public.period_form_fields(organization_id, scope, label, field_type) values ($1, 'kegiatan', 'Kendala bulan ini', 'text') returning id`, [ID.org]));

  await as(db, ID.musammi, () => expectError(simpan(p1, [{ santri_id: ID.santri1, free_answers: { [fid]: 'Sangat Baik' } }]), /tidak tersedia/));
  await as(db, ID.musammi, () => expectError(simpan(p1, [{ santri_id: ID.santri1, free_answers: { [nid]: 'delapan' } }]), /harus berupa angka/));
  await as(db, ID.musammi, () => expectError(simpan(p1, [{ santri_id: 999999 }]), /tidak termasuk rekap/));

  const d = await as(db, ID.musammi, () => simpan(p1,
    [{ santri_id: ID.santri1, free_answers: { [fid]: 'Baik', [nid]: '87,5' }, notes: 'Semangat' }], { activity: { [qid]: 'Banyak libur' } }));
  assert.equal(d.status, 'draft');
  const r = await rekap(p1, ID.santri1);
  assert.deepEqual(r.free_answers, { [fid]: 'Baik', [nid]: 87.5 });
  assert.equal(r.notes, 'Semangat');

  const k = await as(db, ID.musammi, () => simpan(p1, [], { kirim: true }));
  assert.equal(k.status, 'submitted');
  const form = (await rows<any>(`select * from public.period_forms where period_id = $1 and halaqah_id = $2`, [p1, ID.halaqah]))[0];
  assert.deepEqual(form.activity_answers, { [qid]: 'Banyak libur' });
  assert.ok(form.submitted_at);

  await as(db, ID.musammi, () => expectError(simpan(p1, [{ santri_id: ID.santri1, notes: 'ubah' }]), /sudah dikirim/));
  // Setoran bertanggal mundur ke periode yang sudah dikirim: musammi' ditolak, Admin boleh
  await as(db, ID.musammi, () => expectError(submit(ID.santri2, '2026-09-15', 'ziyadah', 114, 1, 114, 6), /sudah dikirim/));
  await as(db, ID.admin, () => submit(ID.santri2, '2026-09-15', 'ziyadah', 114, 1, 114, 6));
  assert.equal(Number((await rekap(p1, ID.santri2)).ziyadah_pages) > 0, true);
  // Koreksi Admin pada form terkirim wajib alasan
  await as(db, ID.admin, () => expectError(simpan(p1, [{ santri_id: ID.santri1, notes: 'Koreksi' }]), /wajib menyertakan alasan/));
  await as(db, ID.admin, () => simpan(p1, [{ santri_id: ID.santri1, notes: 'Koreksi' }], { reason: 'Catatan keliru ketik' }));
  // Buka kembali
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_buka_kembali_form_periode($1, 'Mohon dibuka')`, [form.id]), /hanya Admin/));
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_buka_kembali_form_periode($1, 'x')`, [form.id]), /alasan/));
  await as(db, ID.admin, () => db.query(`select public.rpc_buka_kembali_form_periode($1, 'Musammi lupa isi catatan')`, [form.id]));
  assert.equal(await one(db, `select status from public.period_forms where id = $1`, [form.id]), 'draft');
  await as(db, ID.musammi, () => simpan(p1, [], { kirim: true }));
});

// ================================================================ butir 2 & Mode Rekap
test('Mode Rekap: mode baru berlaku periode berikutnya; isian manual, total dari posisi, kirim wajib lengkap', async () => {
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const add = (d: string, n: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
  const pNow = await as(db, ID.admin, () => one(db, `insert into public.evaluation_periods(organization_id, name, start_date, end_date)
     values ($1, 'Berjalan', $2, $3) returning id`, [ID.org, add(today, -3), add(today, 3)]));
  const pNext = await as(db, ID.admin, () => one(db, `insert into public.evaluation_periods(organization_id, name, start_date, end_date)
     values ($1, 'Berikutnya', $2, $3) returning id`, [ID.org, add(today, 4), add(today, 30)]));

  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_set_mode_halaqah($1, 'rekap')`, [ID.halaqah]), /hanya Admin/));
  await as(db, ID.admin, () => db.query(`select public.rpc_set_mode_halaqah($1, 'rekap')`, [ID.halaqah]));
  assert.equal(await one(db, `select recording_mode from public.period_forms where period_id = $1 and halaqah_id = $2`, [pNow, ID.halaqah]), 'harian',
    'periode berjalan tetap mode lama');
  const f = await as(db, ID.musammi, () => buka(pNext));
  assert.equal(f.form.recording_mode, 'rekap');
  const awal = f.recaps.find((x: any) => x.santri_id === ID.santri1);
  assert.equal(awal.sumber, 'rekap');
  assert.ok(awal.sebelumnya, 'rekap periode sebelumnya ikut dikirim untuk acuan');

  await as(db, ID.musammi, () => expectError(simpan(pNext, [], { kirim: true }), /belum lengkap/));
  await as(db, ID.musammi, () => expectError(simpan(pNext, [{ santri_id: ID.santri1, posisi_mundur_surah: 67, posisi_mundur_ayah: 31 }]), /Ayat posisi hafalan harus 1–30/));
  await as(db, ID.musammi, () => expectError(simpan(pNext, [{ santri_id: ID.santri1, kelancaran: 'Luar Biasa' }]), /tidak ada di Tabel Kelancaran/));
  for (const sid of [ID.santri1, ID.santri2]) {
    await as(db, ID.musammi, () => simpan(pNext, [{
      santri_id: sid, ziyadah_pages: 10, murojaah_pages: 40, posisi_mundur_surah: 67, posisi_mundur_ayah: 30,
      posisi_maju_surah: null, posisi_maju_ayah: null, kelancaran: 'Jayyid',
    }]));
  }
  const r = await rekap(pNext, ID.santri1);
  const t = hitungTotalHafalan(null, { surah: 67, ayah: 30 });
  assert.deepEqual([Number(r.total_pages), Number(r.total_juz)], [t.halaman, t.juz], 'total hafalan juga terhitung di Mode Rekap');
  // Kehadiran manual
  await as(db, ID.musammi, () => simpan(pNext, [{ santri_id: ID.santri1, kehadiran_persen: 90 }]));
  assert.equal(Number((await rekap(pNext, ID.santri1)).kehadiran_persen), 90);
  assert.equal((await rekap(pNext, ID.santri1)).overrides.kehadiran, true);
  // Kehadiran dikosongkan = kembali otomatis dari absensi; nilai otomatis tidak terhapus
  await as(db, ID.admin, () => db.query(`select public.rpc_record_attendance($1::jsonb, null)`, [JSON.stringify([
    { peran: 'Santri', person_id: ID.santri2, halaqah_id: ID.halaqah, date: add(today, 5), waktu: 'Shubuh', status: 'hadir' },
    { peran: 'Santri', person_id: ID.santri1, halaqah_id: ID.halaqah, date: add(today, 5), waktu: 'Shubuh', status: 'alpa' }])]));
  assert.equal(Number((await rekap(pNext, ID.santri2)).kehadiran_persen), 100, 'kehadiran Mode Rekap otomatis dari absensi');
  await as(db, ID.musammi, () => simpan(pNext, [{ santri_id: ID.santri2, kehadiran_persen: null }]));
  assert.equal(Number((await rekap(pNext, ID.santri2)).kehadiran_persen), 100);
  await as(db, ID.musammi, () => simpan(pNext, [{ santri_id: ID.santri1, kehadiran_persen: null }]));
  const s1 = await rekap(pNext, ID.santri1);
  assert.deepEqual([Number(s1.kehadiran_persen), s1.overrides.kehadiran ?? null], [0, null], 'override kehadiran dicabut');
  const k = await as(db, ID.musammi, () => simpan(pNext, [], { kirim: true }));
  assert.equal(k.status, 'submitted');
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
});

test('Mode Harian periode berikutnya: posisi terbawa dari rekap sebelumnya bila tidak ada ziyadah baru', async () => {
  await as(db, ID.musammi, () => buka(p2));
  const sep = await rekap(p1, ID.santri1);
  const okt = await rekap(p2, ID.santri1);
  assert.deepEqual([okt.posisi_mundur_surah, okt.posisi_mundur_ayah], [sep.posisi_mundur_surah, sep.posisi_mundur_ayah]);
  assert.equal(Number(okt.ziyadah_pages), 0);
  assert.equal(Number(okt.total_pages), Number(sep.total_pages));
});

// ================================================================ santri pindah halaqah
test('santri pindah halaqah di tengah periode: rekap milik halaqah baru, setoran halaqah lama ikut dijumlah', async () => {
  await db.exec(`
    insert into public.halaqah(id, organization_id, nama, musammi_id, marhalah, jenis, waktu, academic_year_id, recording_mode)
      values (9210, '${ID.org}', 'Halaqah Baru', ${ID.musammiRow}, 'X', 'Reguler', array['Shubuh'], ${ID.academicYear}, 'harian');
    update public.halaqah_student_memberships set valid_to = '2026-10-15', status = 'transferred'
      where halaqah_id = ${ID.halaqah} and student_id = ${ID.santri2};
    insert into public.halaqah_student_memberships(organization_id, academic_year_id, halaqah_id, student_id, valid_from)
      values ('${ID.org}', ${ID.academicYear}, 9210, ${ID.santri2}, '2026-10-16');
  `);
  await as(db, ID.admin, async () => {
    await submit(ID.santri2, '2026-10-05', 'ziyadah', 113, 1, 113, 5);
    await submit(ID.santri2, '2026-10-20', 'ziyadah', 112, 1, 112, 4, 0, 0, 9210);
  });
  await as(db, ID.admin, () => db.query(`select public.rpc_hitung_rekap_harian($1, null)`, [p2]));
  const r = await rekap(p2, ID.santri2);
  assert.equal(Number(r.halaqah_id), 9210);
  const expect = Number(await one(db, `select sum(calculated_pages) from public.recitation_entries where santri_id = $1
       and recitation_date between $2 and $3`, [ID.santri2, P2.start, P2.end]));
  assert.equal(Number(r.ziyadah_pages), expect);
  const lama = await as(db, ID.admin, () => buka(p2));
  assert.ok(!lama.recaps.some((x: any) => x.santri_id === ID.santri2), 'tidak muncul lagi di halaqah lama');
});

// ================================================================ butir 10: Pemantauan
test('Pemantauan Periode: Admin melihat status pengisian semua halaqah; musammi\' hanya halaqahnya', async () => {
  const admin = await as(db, ID.admin, () => rows<any>(`select * from public.rpc_status_periode($1)`, [p1]));
  const h = admin.find((x) => Number(x.halaqah_id) === ID.halaqah);
  assert.equal(h.status, 'submitted');
  assert.equal(h.recording_mode, 'harian');
  assert.equal(h.jumlah_santri, 2);
  assert.equal(h.terisi, 2);
  assert.ok(admin.some((x) => Number(x.halaqah_id) === 9210 && x.status === 'belum_diisi'));
  await db.exec(`insert into public.halaqah(id, organization_id, nama, marhalah, jenis, waktu, academic_year_id)
                 values (9211, '${ID.org}', 'Halaqah Orang Lain', 'X', 'Reguler', array['Ashar'], ${ID.academicYear})`);
  const mus = await as(db, ID.musammi, () => rows<any>(`select * from public.rpc_status_periode($1)`, [p1]));
  assert.ok(!mus.some((x) => Number(x.halaqah_id) === 9211));
  await as(db, ID.musammi, () => expectError(buka(p1, 9211), /tidak memegang halaqah/));
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_hitung_rekap_harian($1, null)`, [p1]), /hanya Admin/));
  const lihat = await as(db, ID.musammi, () => one(db, `select count(*)::int from public.period_recaps where halaqah_id = 9211`));
  assert.equal(lihat, 0);
});

test('hapus periode berisi rekap wajib alasan', async () => {
  await as(db, ID.admin, () => expectError(db.query(`delete from public.evaluation_periods where id = $1`, [p2]), /sudah berisi rekap/));
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_hapus_periode($1, null)`, [p2]), /wajib menyertakan alasan/));
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_hapus_periode($1, 'Salah buat periode')`, [p2]), /hanya Admin/));
  await as(db, ID.admin, () => db.query(`select public.rpc_hapus_periode($1, 'Salah buat periode')`, [p2]));
  assert.equal(await one(db, `select count(*)::int from public.period_recaps where period_id = $1`, [p2]), 0);
  assert.equal(await one(db, `select count(*)::int from public.audit_logs where action = 'delete_evaluation_period'`), 1);
});

// ================================================================ migrasi data evaluasi lama
test('migrasi data evaluasi lama ke Rekap Periode (bisa diulang) dan akses tabel lama dicabut', async () => {
  const legacy = `
    insert into public.app_settings(organization_id, key, value) values ('${ID.org}', 'EVALUATION_PERIODS',
      '[{"id":"period_1","name":"Agustus","startDate":"2026-08-01","endDate":"2026-08-31","academic_year_id":${ID.academicYear}},
        {"id":"period_2","name":"Agustus Ganda","startDate":"2026-08-15","endDate":"2026-09-10"},
        {"id":"2026-07","name":"","startDate":"","endDate":""}]')
      on conflict (organization_id, key) do update set value = excluded.value;
    insert into public.evaluation_settings(organization_id, category, label, score) values
      ('${ID.org}', 'Tajwid', 'Baik', 90), ('${ID.org}', 'Tajwid', 'Cukup', 70);
    insert into public.halaqah_evaluation_questions(id, organization_id, question, type, options) values
      (501, '${ID.org}', 'Suasana halaqah', 'dropdown', '[{"label":"Kondusif","color":"green"},{"label":"Ramai","color":"red"}]');
    insert into public.student_progress(organization_id, santri_id, month_key, progress_type, value, academic_year_id) values
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Ziyadah', '12', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Murojaah', '1,5', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Hafalan Belakang', '2.3', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Surat Ayat Belakang', 'Al-Mulk 1 - An-Nas 6', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Total Hafalan', '2.3', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Tajwid', 'Baik', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Hafalan', 'Jayyid', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri2}, '2026-07', 'Ziyadah', '4', ${ID.academicYear}),
      ('${ID.org}', ${ID.santri1}, 'SEM-${ID.academicYear}-Ganjil', 'Silabus Hafalan', '87,5', ${ID.academicYear});
    insert into public.student_evaluation(organization_id, santri_id, month_key, catatan_musammi, academic_year_id) values
      ('${ID.org}', ${ID.santri1}, 'period_1', 'Rajin murojaah', ${ID.academicYear});
    insert into public.halaqah_evaluations(organization_id, halaqah_id, month_key, answers, academic_year_id) values
      ('${ID.org}', ${ID.halaqah}, 'period_1', '{"501":"Kondusif"}', ${ID.academicYear});
  `;
  const ldb = await buildTestDb({ beforeMigrations: legacy });
  const q = async (sql: string, p: any[] = []) => (await ldb.query<any>(sql, p)).rows;

  const per = await q(`select legacy_key, name, start_date::text, end_date::text, needs_review from public.evaluation_periods order by legacy_key`);
  assert.deepEqual(per.map((x) => [x.legacy_key, x.needs_review]), [['2026-07', false], ['period_1', false], ['period_2', true]],
    'periode tumpang tindih ditandai perlu dicek');
  assert.deepEqual([per[0].start_date, per[0].end_date], ['2026-07-01', '2026-07-31'], 'periode bulan tanpa tanggal diturunkan dari kuncinya');

  const p = (await q(`select r.* from public.period_recaps r join public.evaluation_periods e on e.id = r.period_id
                       where e.legacy_key = 'period_1' and r.santri_id = $1`, [ID.santri1]))[0];
  assert.equal(p.sumber, 'migrasi');
  assert.deepEqual([Number(p.ziyadah_pages), Number(p.murojaah_pages), Number(p.total_juz)], [12, 30, 2.3]);
  assert.deepEqual([p.posisi_mundur_surah, p.posisi_mundur_ayah], [67, 30]);
  assert.equal(p.kelancaran, 'Jayyid');
  const fields = await q(`select id, label, legacy_ref, scope, field_type, options from public.period_form_fields where legacy_ref is not null order by legacy_ref`);
  const taj = fields.find((f) => f.legacy_ref === 'evaluation_settings:Tajwid');
  const cat = fields.find((f) => f.legacy_ref === 'student_evaluation:catatan_musammi');
  assert.equal(taj.field_type, 'choice');
  assert.deepEqual(taj.options.map((o: any) => o.label), ['Baik', 'Cukup']);
  assert.equal(p.free_answers[taj.id], 'Baik');
  assert.equal(p.free_answers[cat.id], 'Rajin murojaah');
  const keg = fields.find((f) => f.scope === 'kegiatan');
  const form = (await q(`select f.* from public.period_forms f join public.evaluation_periods e on e.id = f.period_id where e.legacy_key = 'period_1'`))[0];
  assert.equal(form.status, 'submitted');
  assert.deepEqual(form.activity_answers, { [keg.id]: 'Kondusif' });
  assert.ok(p.legacy_payload.student_progress.Ziyadah === '12');

  // Silabus Hafalan (month_key SEM-*) bukan periode: pindah ke silabus_scores
  assert.equal((await q(`select count(*)::int as n from public.evaluation_periods where legacy_key like 'SEM-%'`))[0].n, 0);
  assert.deepEqual((await q(`select santri_id::int, semester, score::float from public.silabus_scores`)),
    [{ santri_id: ID.santri1, semester: 'Ganjil', score: 87.5 }]);
  assert.equal((await q(`select count(*)::int as n from public.period_form_fields where label = 'Silabus Hafalan'`))[0].n, 0);

  const rec = await q(`select * from public.f4_legacy_reconciliation()`);
  assert.ok(rec.every((x) => x.status === 'OK' || x.pemeriksaan.startsWith('Periode perlu')), JSON.stringify(rec));
  const before = await q(`select (select count(*) from public.period_recaps)::int as n, (select count(*) from public.silabus_scores)::int as s`);
  await ldb.exec(readFileSync(join(ROOT, 'database/migrations/2026_11_29_03_f4_migrasi_evaluasi_lama.sql'), 'utf8'));
  assert.equal((await q(`select count(*)::int as n from public.period_recaps`))[0].n, before[0].n, 'menjalankan ulang tidak menggandakan');
  assert.equal((await q(`select count(*)::int as n from public.silabus_scores`))[0].n, before[0].s);

  await ldb.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ID.admin]);
  await ldb.exec('set role authenticated');
  await expectError(ldb.query(`select * from public.student_progress`), /permission denied/);
  await expectError(ldb.query(`select * from public.halaqah_evaluations`), /permission denied/);
  // Periode perlu dicek: form tidak bisa dibuka sampai tanggal diperbaiki
  const p2id = (await ldb.query<any>(`select id from public.evaluation_periods where legacy_key = 'period_2'`)).rows[0].id;
  await expectError(ldb.query(`select public.rpc_buka_form_periode($1, $2)`, [p2id, ID.halaqah]), /perlu dicek Admin/);
  await expectError(ldb.query(`update public.evaluation_periods set start_date = '2026-08-20' where id = $1`, [p2id]), /tumpang tindih/);
  await ldb.query(`update public.evaluation_periods set start_date = '2026-09-01', end_date = '2026-09-10' where id = $1`, [p2id]);
  assert.equal((await ldb.query<any>(`select needs_review from public.evaluation_periods where id = $1`, [p2id])).rows[0].needs_review, false);
  await ldb.exec('reset role');
});
