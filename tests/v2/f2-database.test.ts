/**
 * Fase 2 · satu model data & peran fleksibel — diuji di PostgreSQL memori (PGlite)
 * dengan skema repo + data tabel lama (seed_legacy.sql) + semua migrasi.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';

let db: PGlite;
const rows = async <T = any>(sql: string, params: any[] = []) => (await db.query<T>(sql, params)).rows;

before(async () => {
  db = await buildTestDb({ legacySeed: true });
});

// ================================================================ butir 1 & 5: migrasi data lama
test('rekonsiliasi: semua baris lama sudah ada di V2, kecuali yang memang tidak valid', async () => {
  const r = await rows<any>(`select * from public.f2_legacy_reconciliation($1) order by tabel_lama`, [ID.org]);
  const by = Object.fromEntries(r.map((x) => [x.tabel_lama, x]));
  assert.equal(Number(by['setoran_harian'].belum_pindah), 0);
  assert.equal(Number(by['setoran_harian'].jumlah_lama), 4);
  assert.equal(Number(by['attendance (Musammi)'].belum_pindah), 0);
  assert.equal(Number(by['student_classes'].belum_pindah), 0);
  assert.equal(Number(by['halaqah_santri'].belum_pindah), 0);
  // 1 baris absensi bertanggal "01/10/2026" memang tidak bisa dipindah dan dilaporkan
  assert.equal(Number(by['attendance (Santri)'].belum_pindah), 1);
  assert.match(by['attendance (Santri)'].keterangan, /1 tanggal tidak valid/);
});

test('migrasi bisa diulang tanpa menggandakan data', async () => {
  const before = await one<number>(db, `select count(*)::int from public.recitation_entries`);
  const res = await one<any>(db, `select public.f2_migrate_legacy_data($1)`, [ID.org]);
  for (const k of ['recitation_entries', 'attendance_records', 'musammi_attendance_records', 'halaqah_sessions', 'student_enrollments', 'halaqah_student_memberships']) {
    assert.equal(res[k], 0, `${k} seharusnya 0 pada migrasi ulang`);
  }
  assert.equal(await one<number>(db, `select count(*)::int from public.recitation_entries`), before);
});

test('setoran lama: surat teks -> nomor, arah mundur dirapikan, jenis asli dipertahankan', async () => {
  const r = await rows<any>(
    `select legacy_setoran_id::int as id, kind, surah_start_no, ayah_start, surah_end_no, ayah_end,
            calculated_pages::float as pages, status, session_id is not null as ada_sesi, legacy_payload is not null as ada_payload
     from public.recitation_entries where legacy_setoran_id is not null order by legacy_setoran_id`
  );
  const by = Object.fromEntries(r.map((x) => [x.id, x]));
  assert.deepEqual([by[80001].kind, by[80001].surah_start_no, by[80001].ayah_start, by[80001].surah_end_no, by[80001].ayah_end], ['ziyadah', 78, 1, 78, 20]);
  assert.equal(by[80001].ada_sesi, true, 'setoran lama tertaut ke sesi absensi lama');
  assert.equal(by[80002].kind, 'murojaah', 'Murojaah tidak lagi diringkas menjadi manzil');
  assert.equal(by[80002].surah_start_no, 67);
  assert.equal(by[80003].kind, 'tasmi', 'jenis bebas dari pengaturan lembaga ikut dibuat');
  assert.deepEqual([by[80003].surah_start_no, by[80003].ayah_start, by[80003].surah_end_no, by[80003].ayah_end], [78, 1, 114, 6]);
  assert.equal(by[80004].surah_start_no, 2, 'format "Surat 2" dikenali');
  assert.equal(by[80004].status, 'voided', 'status "ditolak" -> voided');
  assert.equal(by[80001].status, 'accepted');
  assert.ok(r.every((x) => x.ada_payload), 'isi asli disimpan di legacy_payload');
});

test('absensi lama: santri tanpa halaqah_id ditempatkan lewat keanggotaan; musammi\' ikut pindah', async () => {
  const s = await rows<any>(`select santri_id::int, status, session_slot from public.attendance_records where legacy_attendance_id is not null order by legacy_attendance_id`);
  assert.deepEqual(s.map((x) => `${x.santri_id}:${x.status}:${x.session_slot}`), [
    '9301:hadir:Shubuh', '9302:izin:Shubuh', '9303:dispensasi:Shubuh', '9301:terlambat:Ashar',
  ]);
  const m = await rows<any>(`select musammi_id::int, status, halaqah_id::int from public.musammi_attendance_records`);
  assert.deepEqual(m, [{ musammi_id: ID.musammiRow, status: 'hadir', halaqah_id: ID.halaqah }]);
  // sesi lama berstatus completed dan rosternya memuat santri yang diabsen
  const roster = await one<any>(db, `select roster_snapshot from public.halaqah_sessions where session_date = '2026-10-01' and session_slot = 'Shubuh'`);
  assert.deepEqual(roster.map((r: any) => r.santri_id).sort(), [ID.santri1, ID.santri2, 9303]);
});

test('enrollment & keanggotaan lama pindah ke V2', async () => {
  assert.equal(await one(db, `select count(*)::int from public.student_enrollments where student_id = 9303 and academic_year_id = $1`, [ID.academicYear]), 1);
  assert.equal(await one(db, `select count(*)::int from public.halaqah_student_memberships where student_id = 9303 and status = 'active'`), 1);
});

// ================================================================ butir 2 & 3: tabel referensi
test('jenis setoran bawaan + dari pengaturan lembaga, dengan penanda menambah hafalan', async () => {
  const k = await rows<any>(`select code, adds_memorization, counts_as_murojaah from public.recitation_kinds where organization_id = $1 order by sort_order`, [ID.org]);
  const by = Object.fromEntries(k.map((x) => [x.code, x]));
  for (const c of ['ziyadah', 'talqin', 'murojaah', 'tamkin', 'sabqi', 'manzil', 'tasmi']) assert.ok(by[c], `jenis ${c} ada`);
  assert.deepEqual(k.filter((x) => x.adds_memorization).map((x) => x.code), ['ziyadah'], 'hanya Ziyadah yang menambah hafalan');
  assert.equal(by.talqin.counts_as_murojaah, false);
  assert.equal(by.murojaah.counts_as_murojaah, true);
});

test('status kehadiran & waktu halaqah dari pengaturan lama menjadi tabel', async () => {
  const st = await rows<any>(`select code from public.attendance_statuses where organization_id = $1 order by sort_order`, [ID.org]);
  assert.deepEqual(st.map((x) => x.code).slice(0, 5), ['hadir', 'terlambat', 'izin', 'sakit', 'alpa']);
  assert.ok(st.some((x) => x.code === 'dispensasi'));
  const slots = await rows<any>(`select code, default_kind_code from public.session_slots where organization_id = $1 order by sort_order`, [ID.org]);
  assert.deepEqual(slots.map((x) => `${x.code}=${x.default_kind_code}`), ['Shubuh=ziyadah', 'Ashar=murojaah', 'Isya=tasmi']);
  assert.ok(await one(db, `select count(*)::int from public.halaqah_types where organization_id = $1`, [ID.org]) >= 1);
});

test('lembaga baru otomatis mendapat referensi bawaan', async () => {
  await db.query(`insert into public.organizations(id, name) values ('22222222-2222-2222-2222-222222222222', 'Lembaga Dua')`);
  assert.equal(await one(db, `select count(*)::int from public.recitation_kinds where organization_id = '22222222-2222-2222-2222-222222222222'`), 6);
  assert.equal(await one(db, `select count(*)::int from public.attendance_statuses where organization_id = '22222222-2222-2222-2222-222222222222'`), 5);
  assert.equal(await one(db, `select count(*)::int from public.session_slots where organization_id = '22222222-2222-2222-2222-222222222222'`), 3);
});

test('Admin bisa menambah jenis setoran & menandai menambah hafalan; Musammi\' tidak bisa', async () => {
  await as(db, ID.admin, () =>
    db.query(`insert into public.recitation_kinds(organization_id, code, name, adds_memorization, counts_as_murojaah) values ($1, 'ziyadah_khusus', 'Ziyadah Khusus', true, false)`, [ID.org])
  );
  assert.equal(await one(db, `select adds_memorization from public.recitation_kinds where code = 'ziyadah_khusus'`), true);
  await as(db, ID.musammi, () =>
    expectError(db.query(`insert into public.recitation_kinds(organization_id, code, name) values ($1, 'x', 'X')`, [ID.org]), /row-level security/)
  );
  // Musammi' tetap bisa membaca daftar jenis
  assert.ok((await as(db, ID.musammi, () => one<number>(db, `select count(*)::int from public.recitation_kinds`))) >= 7);
});

test('jenis setoran yang sudah dipakai tidak bisa dihapus dan kodenya tidak bisa diganti', async () => {
  await as(db, ID.admin, async () => {
    await expectError(db.query(`delete from public.recitation_kinds where organization_id = $1 and code = 'ziyadah'`, [ID.org]), /sudah dipakai/);
    await expectError(db.query(`update public.recitation_kinds set code = 'ziyadah2' where organization_id = $1 and code = 'ziyadah'`, [ID.org]), /Kode referensi tidak bisa diubah/);
    await db.query(`update public.recitation_kinds set name = 'Hafalan Baru' where organization_id = $1 and code = 'ziyadah'`, [ID.org]);
  });
});

// ================================================================ setoran baru (RPC)
const SUBMIT = `select public.rpc_submit_recitation_entry($1::bigint, ${ID.halaqah}, date '2026-11-21', 'Ashar', $2,
  67, 1, 67, 10, 0.5, 0, 0, 'Mumtaz', null, 'submitted', $3, null, null)`;

test('setoran baru tersimpan di recitation_entries saja (tabel lama tidak disentuh) dan jenis apa adanya', async () => {
  const lama = await one<number>(db, `select count(*)::int from public.setoran_harian`);
  const r = await as(db, ID.musammi, () => one<any>(db, SUBMIT, [ID.santri1, 'Murojaah', 'f2-1']));
  assert.equal(r.kind, 'murojaah');
  assert.equal(await one(db, `select count(*)::int from public.setoran_harian`), lama);
  const tamkin = await as(db, ID.musammi, () => one<any>(db, SUBMIT, [ID.santri1, 'tamkin', 'f2-2']));
  assert.equal(tamkin.kind, 'tamkin');
});

test('jenis setoran tidak dikenal atau nonaktif ditolak', async () => {
  await as(db, ID.musammi, () => expectError(db.query(SUBMIT, [ID.santri1, 'Hafalan Asal', 'f2-3']), /tidak dikenal/));
  await db.query(`update public.recitation_kinds set is_active = false where organization_id = $1 and code = 'talqin'`, [ID.org]);
  await as(db, ID.musammi, () => expectError(db.query(SUBMIT, [ID.santri1, 'talqin', 'f2-4']), /tidak aktif/));
  await db.query(`update public.recitation_kinds set is_active = true where organization_id = $1 and code = 'talqin'`, [ID.org]);
});

test('PERBAIKAN keamanan: Musammi\' yang tidak ditugaskan tidak bisa mencatat setoran', async () => {
  const uid = '00000000-0000-0000-0000-00000000c002';
  await db.query(`insert into auth.users(id, email) values ($1, 'musammi2@uji.test')`, [uid]);
  await db.query(`insert into public.access_grants(user_id, organization_id, role, status) values ($1, $2, 'musammi', 'active')`, [uid, ID.org]);
  await as(db, uid, () => expectError(db.query(SUBMIT, [ID.santri1, 'ziyadah', 'f2-5']), /tidak memiliki penugasan/));
  // Musammi' lembaga lain
  const other = '00000000-0000-0000-0000-00000000c003';
  await db.query(`insert into auth.users(id, email) values ($1, 'luar@uji.test')`, [other]);
  await db.query(`insert into public.access_grants(user_id, organization_id, role, status) values ($1, '22222222-2222-2222-2222-222222222222', 'musammi', 'active')`, [other]);
  await as(db, other, () => expectError(db.query(SUBMIT, [ID.santri1, 'ziyadah', 'f2-6']), /tidak memiliki penugasan/));
});

test('riwayat sesi: setoran lama & baru tampil dari satu tabel', async () => {
  const n = await as(db, ID.admin, () =>
    one<number>(db, `select count(*)::int from public.recitation_entries where santri_id = $1`, [ID.santri1])
  );
  assert.ok(n >= 4, 'setoran lama (2) + baru (2) milik santri 1');
});

test('kolom kembar recitation_entries sudah dihapus', async () => {
  const cols = await rows<any>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'recitation_entries'`);
  const names = cols.map((c) => c.column_name);
  for (const c of ['student_id', 'entry_date', 'start_surah', 'end_surah', 'start_ayah', 'end_ayah', 'pages', 'mistakes_major', 'mistakes_minor']) {
    assert.ok(!names.includes(c), `${c} masih ada`);
  }
  for (const c of ['santri_id', 'recitation_date', 'surah_start_no', 'calculated_pages', 'major_mistakes', 'minor_mistakes', 'legacy_payload']) {
    assert.ok(names.includes(c), `${c} hilang`);
  }
});

// ================================================================ absensi (RPC baru)
test('rpc_record_attendance: santri & musammi\' tersimpan ke V2, status kustom diterima', async () => {
  const lama = await one<number>(db, `select count(*)::int from public.attendance`);
  const res = await as(db, ID.musammi, () =>
    one<any>(db, `select public.rpc_record_attendance($1::jsonb)`, [JSON.stringify([
      { peran: 'Santri', person_id: ID.santri1, date: '2026-11-22', waktu: 'Shubuh', status: 'Hadir', halaqah_id: ID.halaqah },
      { peran: 'Santri', person_id: ID.santri2, date: '2026-11-22', waktu: 'Shubuh', status: 'Dispensasi' },
      { peran: 'Musammi', person_id: ID.musammiRow, date: '2026-11-22', waktu: 'Shubuh', status: 'Hadir' },
    ])])
  );
  assert.equal(res.saved_count, 3);
  assert.equal(await one(db, `select count(*)::int from public.attendance`), lama, 'tabel lama tidak bertambah');
  assert.equal(await one(db, `select status from public.attendance_records where santri_id = $1 and attendance_date = '2026-11-22'`, [ID.santri2]), 'dispensasi');
  assert.equal(await one(db, `select status from public.halaqah_sessions where session_date = '2026-11-22'`), 'submitted');
});

test('rpc_record_attendance: Musammi\' tidak bisa mengabsen halaqah lain; status tak dikenal ditolak', async () => {
  await db.query(`insert into public.halaqah(id, organization_id, nama, marhalah, jenis, academic_year_id) values (9202, $1, 'Halaqah Lain', 'X', 'Reguler', $2)`, [ID.org, ID.academicYear]);
  await as(db, ID.musammi, async () => {
    await expectError(
      db.query(`select public.rpc_record_attendance($1::jsonb)`, [JSON.stringify([{ peran: 'Santri', person_id: ID.santri1, date: '2026-11-23', waktu: 'Shubuh', status: 'Hadir', halaqah_id: 9202 }])]),
      /tidak ditugaskan/
    );
    await expectError(
      db.query(`select public.rpc_record_attendance($1::jsonb)`, [JSON.stringify([{ peran: 'Santri', person_id: ID.santri1, date: '2026-11-23', waktu: 'Shubuh', status: 'Kabur', halaqah_id: ID.halaqah }])]),
      /tidak dikenal/
    );
  });
  // Admin boleh mengabsen halaqah mana pun; santri di luar roster ikut masuk roster
  await as(db, ID.admin, () =>
    db.query(`select public.rpc_record_attendance($1::jsonb)`, [JSON.stringify([{ peran: 'Santri', person_id: ID.santri1, date: '2026-11-23', waktu: 'Shubuh', status: 'Hadir', halaqah_id: 9202 }])])
  );
  assert.equal(await one(db, `select count(*)::int from public.attendance_records where halaqah_id = 9202`), 1);
});

test('ubah & hapus absensi lewat RPC', async () => {
  const id = await one<string>(db, `select id from public.attendance_records where santri_id = $1 and attendance_date = '2026-11-22'`, [ID.santri1]);
  await as(db, ID.admin, () => db.query(`select public.rpc_update_attendance_entry('santri', $1::uuid, 'Sakit', 'Salah pencet')`, [id]));
  assert.equal(await one(db, `select status from public.attendance_records where id = $1`, [id]), 'sakit');
  const mid = await one<string>(db, `select id from public.musammi_attendance_records where attendance_date = '2026-11-22'`);
  await as(db, ID.admin, () => db.query(`select public.rpc_delete_attendance_entries($1::jsonb, 'Data ganda')`, [JSON.stringify([{ kind: 'musammi', id: mid }])]));
  assert.equal(await one(db, `select count(*)::int from public.musammi_attendance_records where id = $1`, [mid]), 0);
});

test('statistik absensi membaca V2 (santri + musammi\', nama status dari tabel)', async () => {
  const stats = await as(db, ID.admin, () =>
    rows<any>(`select * from public.rpc_get_attendance_stats($1, '2026-10-01', '2026-10-31', 'all')`, [ID.org])
  );
  const statuses = stats.map((s) => s.status).sort();
  assert.ok(statuses.includes('Hadir'));
  assert.ok(statuses.includes('Dispensasi'));
  const total = stats.reduce((a, s) => a + Number(s.count), 0);
  assert.equal(total, 5, '4 santri + 1 musammi\' pada Oktober');
  const pct = await as(db, ID.admin, () =>
    rows<any>(`select person_id::int, round(pct_kehadiran)::int as pct from public.rpc_get_santri_attendance_percentages($1, '2026-10-01', '2026-10-31')`, [ID.org])
  );
  assert.equal(pct.find((p) => p.person_id === ID.santri1)?.pct, 100, 'hadir + terlambat = hadir');
  const waktu = await as(db, ID.admin, () => one<any>(db, `select row_to_json(w) from public.rpc_get_waktu_stats($1, '2026-10-01') w`, [ID.org]));
  assert.ok(Number(waktu.total) >= 2);
});

// ================================================================ butir 7: multi peran
const MANAGE = `select public.rpc_manage_access_grant(null, $1::uuid, $2::uuid, $3, 'active', 'uji F2')`;

test('satu akun bisa menjadi Admin dan Musammi\' sekaligus', async () => {
  await as(db, ID.superadmin, async () => {
    await db.query(MANAGE, [ID.admin2, ID.org, 'admin']);
    await db.query(MANAGE, [ID.admin2, ID.org, 'musammi']);
  });
  const g = await rows<any>(`select role from public.access_grants where user_id = $1 and status = 'active' order by role`, [ID.admin2]);
  assert.deepEqual(g.map((x) => x.role), ['admin', 'musammi'], 'peran kedua tidak menimpa peran pertama');
  assert.equal(await one(db, `select role from public.profiles where id = $1`, [ID.admin2]), 'admin', 'profil memakai peran tertinggi');
  const mine = await as(db, ID.admin2, () => rows<any>(`select role from public.rpc_my_roles()`));
  assert.deepEqual(mine.map((x) => x.role), ['admin', 'musammi']);
});

test('Admin boleh menambah peran Musammi\' untuk dirinya sendiri, tetapi tidak boleh mengubah perannya', async () => {
  await as(db, ID.admin, () => db.query(MANAGE, [ID.admin, ID.org, 'musammi']));
  assert.equal(await one(db, `select count(*)::int from public.access_grants where user_id = $1 and status = 'active'`, [ID.admin]), 2);
  await as(db, ID.admin, () =>
    expectError(db.query(`select public.rpc_manage_access_grant(null, $1::uuid, $2::uuid, 'musammi', 'suspended', 'x')`, [ID.admin, ID.org]), /Forbidden/)
  );
});

test('peran dari tabel roles: peran nonaktif atau asing ditolak', async () => {
  await as(db, ID.superadmin, async () => {
    await expectError(db.query(MANAGE, [ID.admin2, ID.org, 'wali_kelas']), /belum aktif/);
    await expectError(db.query(MANAGE, [ID.admin2, ID.org, 'kepala_sekolah']), /belum aktif|tidak valid/);
  });
  await expectError(
    db.query(`insert into public.access_grants(user_id, organization_id, role, status) values ($1, $2, 'kepala_sekolah', 'active')`, [ID.admin2, ID.org]),
    /foreign key|belum aktif/
  );
});

// ================================================================ butir 8: BUG-10
test('BUG-10: ganti nama marhalah di master -> semua tabel & roster sesi baru ikut', async () => {
  await as(db, ID.admin, () => db.query(`update public.master_marhalah set nama = 'Wustha' where id = $1`, [ID.marhalah]));
  assert.equal(await one(db, `select marhalah from public.santri where id = $1`, [ID.santri1]), 'Wustha');
  assert.equal(await one(db, `select marhalah from public.halaqah where id = $1`, [ID.halaqah]), 'Wustha');
  const s = await as(db, ID.musammi, () => one<any>(db, `select public.rpc_open_halaqah_session(${ID.halaqah}, date '2026-11-25', 'Ashar')`));
  const r1 = s.roster.find((r: any) => r.santri_id === ID.santri1);
  assert.equal(r1.marhalah, 'Wustha');
  // santri baru dengan marhalah_id -> teks marhalah otomatis dari master
  await db.query(`insert into public.santri(id, organization_id, nama, marhalah, kelas, kode, marhalah_id) values (9310, $1, 'Santri Baru', 'salah ketik', '7A', 'S-010', $2)`, [ID.org, ID.marhalah]);
  assert.equal(await one(db, `select marhalah from public.santri where id = 9310`), 'Wustha');
});

// ================================================================ butir 9: santri
test('santri: NIS wajib & unik, tanggal lahir dan asal tersedia', async () => {
  await expectError(db.query(`insert into public.santri(organization_id, nama, marhalah, kelas, kode) values ($1, 'Tanpa NIS', 'X', '1', '  ')`, [ID.org]), /NIS santri wajib/);
  await expectError(db.query(`insert into public.santri(organization_id, nama, marhalah, kelas, kode) values ($1, 'NIS Ganda', 'X', '1', 's-001')`, [ID.org]), /duplicate key|uq_santri_org_nis/);
  await expectError(db.query(`update public.santri set kode = '' where id = $1`, [ID.santri1]), /tidak boleh dikosongkan/);
  await expectError(db.query(`update public.santri set tanggal_lahir = current_date + 10 where id = $1`, [ID.santri1]), /tidak masuk akal/);
  await db.query(`update public.santri set tanggal_lahir = '2012-05-01', asal = 'Bogor' where id = $1`, [ID.santri1]);
  assert.equal(await one(db, `select asal from public.santri where id = $1`, [ID.santri1]), 'Bogor');
});

// ================================================================ butir 10: tabel lama tertutup
test('tabel lama tidak bisa dibaca/ditulis aplikasi lagi', async () => {
  for (const t of ['setoran_harian', 'attendance', 'halaqah_santri', 'student_classes']) {
    await as(db, ID.admin, () => expectError(db.query(`select count(*) from public.${t}`), /permission denied/));
  }
});

test('tidak ada fungsi database yang masih memakai tabel lama (kecuali migrasi f2_*)', async () => {
  const r = await rows<any>(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname not like 'f2\\_%'
      and p.prosrc ~ 'public\\.(setoran_harian|attendance|halaqah_santri|student_classes)\\M'`);
  assert.deepEqual(r.map((x) => x.proname), []);
});

test('migrasi Fase 2 tercatat dan file aman diulang', () => {
  const files = fs.readdirSync('database/migrations').filter((f) => f.includes('_f2_'));
  assert.ok(files.length >= 8);
});

// ================================================================ pemeriksaan awal
test('f2_preflight.sql: database setelah Fase 1 (sebelum Fase 2) lolos semua pemeriksaan', async () => {
  const pre = await buildTestDb({ legacySeed: true, migrationFilter: (f) => f < '2026_11_27_02' });
  const r = await pre.query<any>(fs.readFileSync('database/checks/f2_preflight.sql', 'utf8'));
  const periksa = r.rows.filter((x) => String(x.hasil).startsWith('PERIKSA'));
  assert.deepEqual(periksa, []);
  assert.ok(r.rows.length > 50);
  await pre.close();
});

test('database yang berbeda dari repo: nilai kind & peran asing tidak menggagalkan migrasi', async () => {
  const drift = await buildTestDb({
    beforeMigrations: `
      alter table public.recitation_entries drop constraint if exists recitation_entries_kind_check;
      insert into public.recitation_entries (organization_id, santri_id, student_id, halaqah_id, recitation_date, session_slot, kind,
        surah_start_no, ayah_start, surah_end_no, ayah_end, status)
      values ('${ID.org}', ${ID.santri1}, ${ID.santri1}, ${ID.halaqah}, '2026-09-01', 'Shubuh', 'tahsin', 1, 1, 1, 7, 'submitted');
    `,
  });
  const k = await drift.query<any>(`select code, is_active from public.recitation_kinds where organization_id = $1 and code = 'tahsin'`, [ID.org]);
  assert.equal(k.rows.length, 1, 'jenis "tahsin" dari data lama dibuat otomatis');
  await drift.close();
});
