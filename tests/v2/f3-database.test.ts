/**
 * Fase 3 · absensi & setoran sesuai spesifikasi — diuji di PostgreSQL memori (PGlite).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';
import { calculateHalamanSetoran } from '../../lib/quranPageMap';

let db: PGlite;
const rows = async <T = any>(sql: string, params: any[] = []) => (await db.query<T>(sql, params)).rows;

// Tanggal relatif terhadap "hari ini" di zona waktu lembaga (Asia/Jakarta)
const jakartaToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
const TODAY = jakartaToday();
const PAST = shift(TODAY, -3);

const MUSAMMI2 = '00000000-0000-0000-0000-00000000c002';
const MUSAMMI2_ROW = 9102;

const submit = (santri: number, date: string, slot: string, kind: string, s1: number, a1: number, s2: number, a2: number,
  kabir = 0, shoghir = 0, extra: { pages?: number; predicate?: string; existing?: string; reason?: string } = {}) =>
  db.query<any>(
    `select public.rpc_submit_recitation_entry(p_santri_id => $1, p_halaqah_id => ${ID.halaqah}, p_recitation_date => $2::date,
       p_session_slot => $3, p_kind => $4, p_surah_start_no => $5, p_ayah_start => $6, p_surah_end_no => $7, p_ayah_end => $8,
       p_calculated_pages => $9, p_minor_mistakes => $10, p_major_mistakes => $11, p_predicate => $12,
       p_existing_entry_id => $13::uuid, p_reason => $14) as r`,
    [santri, date, slot, kind, s1, a1, s2, a2, extra.pages ?? 99, shoghir, kabir, extra.predicate ?? 'Mumtaz', extra.existing ?? null, extra.reason ?? null]
  ).then((r) => r.rows[0].r);

const record = (records: any[], reason?: string) =>
  db.query<any>(`select public.rpc_record_attendance($1::jsonb, $2) as r`, [JSON.stringify(records), reason ?? null]).then((r) => r.rows[0].r);

before(async () => {
  db = await buildTestDb({ legacySeed: true });
  // Musammi' kedua (untuk uji badal), tidak ditugaskan di halaqah mana pun
  await db.exec(`
    insert into auth.users(id, email) values ('${MUSAMMI2}', 'musammi2@uji.test');
    insert into public.profiles(id, organization_id, full_name, role, email) values ('${MUSAMMI2}', '${ID.org}', 'Ustadz Dua', 'musammi', 'musammi2@uji.test');
    update public.access_grants set status = 'active' where user_id = '${MUSAMMI2}';
    insert into public.access_grants(user_id, organization_id, role, status) values ('${MUSAMMI2}', '${ID.org}', 'musammi', 'active') on conflict do nothing;
    insert into public.musammi(id, organization_id, nama, academic_year_id, user_id) values (${MUSAMMI2_ROW}, '${ID.org}', 'Ustadz Dua', ${ID.academicYear}, '${MUSAMMI2}');
  `);
});

// ================================================================ butir 10: halaman dari mushaf
test('fn_hitung_halaman sama persis dengan calculateHalamanSetoran di aplikasi', async () => {
  const cases: [number, number, number, number][] = [
    [78, 1, 114, 6], [1, 1, 1, 7], [2, 1, 2, 286], [2, 1, 2, 5], [67, 1, 67, 30], [114, 6, 78, 1],
    [36, 1, 36, 83], [18, 1, 18, 110], [2, 255, 2, 257], [3, 1, 4, 23], [112, 1, 112, 4], [9, 1, 9, 129],
  ];
  let seed = 7;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const counts = (await rows<any>(`select no, ayah_count from public.quran_surahs order by no`)).map((r) => r.ayah_count);
  for (let i = 0; i < 300; i++) {
    const s1 = 1 + rnd(114), s2 = Math.min(114, s1 + rnd(4));
    cases.push([s1, 1 + rnd(counts[s1 - 1]), s2, 1 + rnd(counts[s2 - 1])]);
  }
  for (const [s1, a1, s2, a2] of cases) {
    const server = Number(await one(db, `select public.fn_hitung_halaman($1, $2, $3, $4)`, [s1, a1, s2, a2]));
    const client = calculateHalamanSetoran(s1, a1, s2, a2)?.halaman;
    assert.equal(server, client, `${s1}:${a1}-${s2}:${a2}`);
  }
  assert.equal(await one(db, `select count(*)::int from public.quran_ayahs`), 6236);
});

// ================================================================ butir 6 & 7: Tabel Kelancaran
test('predikat otomatis dari Tabel Kelancaran bawaan', async () => {
  const cases: [number, number, string, boolean][] = [
    [0, 0, 'Mumtaz', false], [0, 1, 'Mumtaz', false], [0, 2, 'Jayyid Jiddan', false], [1, 0, 'Jayyid Jiddan', false],
    [1, 3, 'Jayyid Jiddan', false], [1, 4, 'Jayyid', false], [2, 0, 'Maqbul', false], [2, 5, 'Maqbul', false],
    [2, 6, 'Rasib', true], [3, 0, 'Rasib', true],
  ];
  for (const [kabir, shoghir, pred, ulang] of cases) {
    const r = (await rows<any>(`select * from public.fn_predikat_kelancaran($1, $2, $3)`, [ID.org, kabir, shoghir]))[0];
    assert.deepEqual([r.predicate, r.is_repeat], [pred, ulang], `kabir ${kabir}, shoghir ${shoghir}`);
  }
});

test('Admin mengubah Tabel Kelancaran; Musammi\' tidak bisa', async () => {
  await as(db, ID.admin, () => db.query(`update public.fluency_rules set max_minor = 2 where organization_id = $1 and predicate = 'Mumtaz'`, [ID.org]));
  const r = (await rows<any>(`select * from public.fn_predikat_kelancaran($1, 0, 2)`, [ID.org]))[0];
  assert.equal(r.predicate, 'Mumtaz');
  await as(db, ID.musammi, async () => {
    const res = await db.query(`update public.fluency_rules set max_minor = 9 where organization_id = $1`, [ID.org]);
    assert.equal(res.affectedRows ?? 0, 0);
  });
  await expectError(
    db.query(`insert into public.fluency_rules(organization_id, predicate, sort_order) values ($1, 'Tanpa Batas', 9)`, [ID.org]),
    /wajib punya batas/
  );
  await db.query(`update public.fluency_rules set max_minor = 1 where organization_id = $1 and predicate = 'Mumtaz'`, [ID.org]);
});

// ================================================================ butir 7, 8, 9: setoran langsung sah, Rasib ulang
test('setoran langsung sah; halaman & predikat dihitung server (angka dari layar diabaikan)', async () => {
  const r = await as(db, ID.musammi, () => submit(ID.santri1, TODAY, 'Shubuh', 'ziyadah', 78, 1, 78, 20, 0, 1, { pages: 99, predicate: 'Mumtaz' }));
  assert.equal(r.status, 'accepted');
  assert.equal(Number(r.calculated_pages), calculateHalamanSetoran(78, 1, 78, 20)!.halaman);
  assert.equal(r.predicate, 'Mumtaz');
  assert.equal(r.is_repeat, false);

  const r2 = await as(db, ID.musammi, () => submit(ID.santri1, TODAY, 'Shubuh', 'ziyadah', 78, 21, 78, 40, 1, 4, { predicate: 'Mumtaz' }));
  assert.equal(r2.predicate, 'Jayyid', 'BUG-13: predikat bukan dari isian layar');
});

test('Rasib = ulang: tidak menambah hafalan', async () => {
  const r = await as(db, ID.musammi, () => submit(ID.santri2, TODAY, 'Shubuh', 'ziyadah', 1, 1, 1, 7, 3, 0));
  assert.equal(r.predicate, 'Rasib');
  assert.equal(r.is_repeat, true);
  assert.equal(await one(db, `select is_repeat from public.recitation_entries where id = $1`, [r.id]), true);
});

test('arah mundur (An-Nas -> An-Naba\') disimpan sebagai rentang naik; ayat di luar surat ditolak', async () => {
  const r = await as(db, ID.musammi, () => submit(ID.santri2, TODAY, 'Ashar', 'murojaah', 114, 6, 78, 1));
  const e = (await rows<any>(`select surah_start_no, ayah_start, surah_end_no, ayah_end, calculated_pages::float as p from public.recitation_entries where id = $1`, [r.id]))[0];
  assert.deepEqual([e.surah_start_no, e.ayah_start, e.surah_end_no, e.ayah_end, e.p], [78, 1, 114, 6, 23]);
  await as(db, ID.musammi, () => expectError(submit(ID.santri2, TODAY, 'Ashar', 'murojaah', 1, 1, 1, 8), /melebihi jumlah ayat/));
});

test('koreksi: hanya Admin dengan alasan; Musammi\' tidak bisa; pembatalan final', async () => {
  const r = await as(db, ID.musammi, () => submit(ID.santri1, TODAY, 'Ashar', 'murojaah', 67, 1, 67, 10));
  await as(db, ID.musammi, () =>
    expectError(submit(ID.santri1, TODAY, 'Ashar', 'murojaah', 67, 1, 67, 15, 0, 0, { existing: r.id, reason: 'Salah ayat akhir' }), /oleh Admin/)
  );
  await as(db, ID.admin, async () => {
    await expectError(submit(ID.santri1, TODAY, 'Ashar', 'murojaah', 67, 1, 67, 15, 0, 0, { existing: r.id, reason: 'tes' }), /Alasan koreksi/);
    const c = await submit(ID.santri1, TODAY, 'Ashar', 'murojaah', 67, 1, 67, 15, 0, 0, { existing: r.id, reason: 'Salah ayat akhir' });
    assert.equal(c.revision_no, 2);
  });
  const rev = await one(db, `select string_agg(action, ',' order by revision_no) from public.recitation_revisions where entry_id = $1`, [r.id]);
  assert.equal(rev, 'create,correct');
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_review_recitation_entry($1::uuid, 'voided', 'Salah santri')`, [r.id]), /hanya Admin/));
  await as(db, ID.admin, () => db.query(`select public.rpc_review_recitation_entry($1::uuid, 'voided', 'Salah santri')`, [r.id]));
  await as(db, ID.admin, () =>
    expectError(submit(ID.santri1, TODAY, 'Ashar', 'murojaah', 67, 1, 67, 16, 0, 0, { existing: r.id, reason: 'Koreksi lagi' }), /dibatalkan/)
  );
});

test('tidak ada lagi status draft/submitted/returned; tulis langsung ditolak untuk Musammi\'', async () => {
  assert.equal(await one(db, `select count(*)::int from public.recitation_entries where status not in ('accepted', 'voided')`), 0);
  assert.equal(await one(db, `select status from public.recitation_entries where legacy_setoran_id = 80002`), 'accepted', 'data lama pending -> sah');
  await as(db, ID.musammi, async () => {
    await expectError(
      db.query(`insert into public.recitation_entries(organization_id, santri_id, halaqah_id, kind, status) values ($1, $2, $3, 'ziyadah', 'accepted')`, [ID.org, ID.santri1, ID.halaqah]),
      /row-level security/
    );
  });
});

// ================================================================ butir 12 (BUG-12): hanya Hadir/Terlambat bisa setor
test('santri Izin/Sakit/Alpa pada sesi tidak bisa setor; Hadir/Terlambat bisa', async () => {
  const date = shift(TODAY, 1);
  await as(db, ID.musammi, () => record([
    { peran: 'Santri', person_id: ID.santri1, date, waktu: 'Shubuh', status: 'Izin', halaqah_id: ID.halaqah },
    { peran: 'Santri', person_id: ID.santri2, date, waktu: 'Shubuh', status: 'Terlambat', halaqah_id: ID.halaqah },
  ]));
  await as(db, ID.musammi, async () => {
    await expectError(submit(ID.santri1, date, 'Shubuh', 'ziyadah', 78, 1, 78, 5), /tercatat "Izin"/);
    const ok = await submit(ID.santri2, date, 'Shubuh', 'ziyadah', 78, 1, 78, 5);
    assert.equal(ok.status, 'accepted');
    // Belum diabsen di waktu lain: boleh
    await submit(ID.santri1, date, 'Isya', 'murojaah', 78, 1, 78, 5);
  });
  // Status kustom "Dispensasi" (tidak boleh setor) lalu Admin mengizinkan
  await as(db, ID.musammi, () => record([{ peran: 'Santri', person_id: ID.santri1, date, waktu: 'Ashar', status: 'Dispensasi', halaqah_id: ID.halaqah }]));
  await as(db, ID.musammi, () => expectError(submit(ID.santri1, date, 'Ashar', 'murojaah', 78, 1, 78, 5), /Dispensasi/));
  await as(db, ID.admin, () => db.query(`update public.attendance_statuses set allows_recitation = true where organization_id = $1 and code = 'dispensasi'`, [ID.org]));
  await as(db, ID.musammi, () => submit(ID.santri1, date, 'Ashar', 'murojaah', 78, 1, 78, 5));
});

// ================================================================ butir 2 & 4: sesi, tanpa kunci, koreksi beralasan
test('membuka sesi tidak membuat sesi; sesi tercatat saat absensi pertama disimpan', async () => {
  const date = shift(TODAY, 2);
  const o = await as(db, ID.musammi, () => one<any>(db, `select public.rpc_open_halaqah_session(${ID.halaqah}, $1::date, 'Isya')`, [date]));
  assert.equal(o.session_id, null);
  assert.equal(o.status, 'belum_dibuka');
  assert.ok(o.roster.length >= 2);
  assert.equal(await one(db, `select count(*)::int from public.halaqah_sessions where session_date = $1`, [date]), 0);
  await as(db, ID.musammi, () => record([{ peran: 'Santri', person_id: ID.santri1, date, waktu: 'Isya', status: 'Hadir', halaqah_id: ID.halaqah }]));
  assert.equal(await one(db, `select count(*)::int from public.halaqah_sessions where session_date = $1`, [date]), 1);
});

test('tidak ada kunci sesi lagi', async () => {
  assert.equal(await one(db, `select count(*)::int from pg_proc where proname in ('rpc_lock_halaqah_session', 'rpc_save_attendance_batch')`), 0);
  await expectError(db.query(`update public.halaqah_sessions set status = 'locked' where organization_id = $1`, [ID.org]), /halaqah_sessions_status_check/);
});

test('hari yang sama: Admin & Musammi\' saling memperbarui, nama pengubah terakhir tercatat', async () => {
  await as(db, ID.admin, () => record([{ peran: 'Santri', person_id: ID.santri2, date: TODAY, waktu: 'Isya', status: 'Alpa', halaqah_id: ID.halaqah }]));
  assert.equal(await one(db, `select marked_by_name from public.attendance_records where santri_id = $1 and attendance_date = $2 and session_slot = 'Isya'`, [ID.santri2, TODAY]), 'Admin Uji');
  const r = await as(db, ID.musammi, () => record([{ peran: 'Santri', person_id: ID.santri2, date: TODAY, waktu: 'Isya', status: 'Hadir', halaqah_id: ID.halaqah }]));
  assert.equal(r.saved_count, 1);
  const row = (await rows<any>(`select status, marked_by_name from public.attendance_records where santri_id = $1 and attendance_date = $2 and session_slot = 'Isya'`, [ID.santri2, TODAY]))[0];
  assert.deepEqual([row.status, row.marked_by_name], ['hadir', 'Ustadz Uji']);
  // Status sama: tidak dihitung sebagai perubahan
  const same = await as(db, ID.musammi, () => record([{ peran: 'Santri', person_id: ID.santri2, date: TODAY, waktu: 'Isya', status: 'Hadir', halaqah_id: ID.halaqah }]));
  assert.equal(same.unchanged_count, 1);
});

test('tanggal lewat: Musammi\' boleh mengisi yang kosong, tetapi koreksi hanya Admin dengan alasan', async () => {
  const rec = { peran: 'Santri', person_id: ID.santri1, date: PAST, waktu: 'Shubuh', halaqah_id: ID.halaqah };
  await as(db, ID.musammi, () => record([{ ...rec, status: 'Hadir' }]));
  await as(db, ID.musammi, () => expectError(record([{ ...rec, status: 'Sakit' }], 'Salah input kemarin'), /Koreksi dilakukan oleh Admin/));
  await as(db, ID.admin, () => expectError(record([{ ...rec, status: 'Sakit' }]), /wajib menyertakan alasan/));
  await as(db, ID.admin, () => record([{ ...rec, status: 'Sakit' }], 'Ada surat dokter'));
  const row = (await rows<any>(`select id, status, correction_reason from public.attendance_records where santri_id = $1 and attendance_date = $2 and session_slot = 'Shubuh'`, [ID.santri1, PAST]))[0];
  assert.deepEqual([row.status, row.correction_reason], ['sakit', 'Ada surat dokter']);
  // Hapus catatan tanggal lewat: Admin + alasan
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_delete_attendance_entries($1::jsonb, 'Data ganda')`, [JSON.stringify([{ kind: 'santri', id: row.id }])]), /Admin/));
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_delete_attendance_entries($1::jsonb, null)`, [JSON.stringify([{ kind: 'santri', id: row.id }])]), /alasan/));
  await as(db, ID.admin, () => db.query(`select public.rpc_delete_attendance_entries($1::jsonb, 'Data ganda')`, [JSON.stringify([{ kind: 'santri', id: row.id }])]));
  assert.equal(await one(db, `select count(*)::int from public.audit_logs where action = 'correct_attendance'`) >= 1, true);
});

// ================================================================ butir 3: badal
test('badal: musammi\' pengganti tercatat dan boleh mencatat setoran halaqah itu pada tanggal itu saja', async () => {
  const date = shift(TODAY, 3);
  // Sebelum dicatat sebagai badal: ditolak
  await as(db, MUSAMMI2, () => expectError(submit(ID.santri1, date, 'Shubuh', 'ziyadah', 78, 1, 78, 3), /tidak memiliki penugasan/));
  await as(db, ID.admin, () => expectError(
    record([{ peran: 'Musammi', person_id: ID.musammiRow, date, waktu: 'Shubuh', status: 'Izin', halaqah_id: ID.halaqah, is_badal: true }]),
    /Pilih musammi' pengganti/
  ));
  await as(db, ID.admin, () => record([{ peran: 'Musammi', person_id: ID.musammiRow, date, waktu: 'Shubuh', status: 'Izin',
    halaqah_id: ID.halaqah, is_badal: true, badal_musammi_id: MUSAMMI2_ROW }]));
  const m = (await rows<any>(`select is_badal, badal_musammi_id::int as b from public.musammi_attendance_records where attendance_date = $1`, [date]))[0];
  assert.deepEqual([m.is_badal, m.b], [true, MUSAMMI2_ROW]);
  // Badal boleh mencatat absensi & setoran halaqah ini pada tanggal itu
  await as(db, MUSAMMI2, async () => {
    await record([{ peran: 'Santri', person_id: ID.santri1, date, waktu: 'Shubuh', status: 'Hadir', halaqah_id: ID.halaqah }]);
    const s = await submit(ID.santri1, date, 'Shubuh', 'ziyadah', 78, 1, 78, 3);
    assert.equal(s.status, 'accepted');
    // Tanggal lain: tidak
    await expectError(submit(ID.santri1, shift(date, 1), 'Shubuh', 'ziyadah', 78, 1, 78, 3), /tidak memiliki penugasan/);
  });
});

// ================================================================ jadwal bentrok & arah hafalan
test('jadwal bentrok: musammi\' atau santri di dua halaqah pada waktu yang sama', async () => {
  await db.query(`insert into public.halaqah(id, organization_id, nama, musammi_id, marhalah, jenis, waktu, academic_year_id)
                  values (9203, $1, 'Halaqah Bentrok', ${ID.musammiRow}, 'X', 'Reguler', array['Shubuh'], $2)`, [ID.org, ID.academicYear]);
  await db.query(`insert into public.halaqah_student_memberships(organization_id, academic_year_id, halaqah_id, student_id, valid_from)
                  values ($1, $2, 9203, ${ID.santri2}, current_date)`, [ID.org, ID.academicYear]);
  const r = await as(db, ID.admin, () => rows<any>(`select jenis, orang_id::int as id, waktu from public.rpc_jadwal_bentrok($1) order by jenis`, [ID.org]));
  assert.deepEqual(r.map((x) => `${x.jenis}:${x.id}:${x.waktu}`), [`musammi:${ID.musammiRow}:Shubuh`, `santri:${ID.santri2}:Shubuh`]);
  await as(db, ID.musammi, () => expectError(db.query(`select * from public.rpc_jadwal_bentrok($1)`, [ID.org]), /hanya Admin/));
});

test('arah hafalan per santri: bawaan mundur, hanya maju/mundur', async () => {
  assert.equal(await one(db, `select arah_hafalan from public.santri where id = $1`, [ID.santri1]), 'mundur');
  await db.query(`update public.santri set arah_hafalan = 'maju' where id = $1`, [ID.santri1]);
  await expectError(db.query(`update public.santri set arah_hafalan = 'acak' where id = $1`, [ID.santri1]), /santri_arah_hafalan_check/);
});
