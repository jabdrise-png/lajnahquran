/**
 * Fase 1 · migrasi database diuji di PostgreSQL memori (PGlite) dengan skema repo.
 * Checklist FASE_1_UJI no. 1, 2, 3, 5, 7, 8, 10, 11, 12, 13.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';

// Meniru constraint yang ada di database Supabase tetapi tidak ada di repo (penyebab BUG-01).
const DRIFT_CONSTRAINT = `
  alter table public.recitation_revisions drop constraint if exists recitation_revisions_action_check;
  alter table public.recitation_revisions add constraint recitation_revisions_action_check
    check (action in ('update', 'edit_content'));
`;

const SUBMIT = `select public.rpc_submit_recitation_entry(
  $1::bigint, ${ID.halaqah}, date '2026-11-20', 'Shubuh', 'ziyadah',
  78, 1, 78, 10, 0.5, 1, 0, 'Mumtaz', null, 'submitted', $2, null, null)`;

let db: PGlite;

before(async () => {
  db = await buildTestDb({ beforeMigrations: DRIFT_CONSTRAINT });
});

// ---------------------------------------------------------------- BUG-01 / 02
test('BUG-01 tereproduksi: tanpa migrasi 01, setoran Musammi\' gagal karena constraint', async () => {
  const lama = await buildTestDb({
    beforeMigrations: DRIFT_CONSTRAINT,
    migrationFilter: (f) => !f.includes('fix_recitation_revisions_action_check'),
  });
  await as(lama, ID.musammi, () =>
    expectError(lama.query(SUBMIT, [ID.santri1, 'lama-1']), /recitation_revisions_action_check/)
  );
  await lama.close();
});

test('no.1-2: Musammi\' bisa menyimpan setoran setelah migrasi', async () => {
  const res = await as(db, ID.musammi, () => one<any>(db, SUBMIT, [ID.santri1, 'uji-1']));
  assert.equal(res.success, true);
  assert.equal(res.status, 'submitted');
  const aksi = await one(db, `select string_agg(action, ',') from public.recitation_revisions where entry_id = $1`, [res.id]);
  assert.match(String(aksi), /create_submission/);
});

test('no.3: Admin bisa Accept, Return (alasan), dan Void (alasan)', async () => {
  const ids: string[] = [];
  for (const k of ['a', 'b', 'c']) {
    const r = await as(db, ID.musammi, () => one<any>(db, SUBMIT, [ID.santri2, `review-${k}`]));
    ids.push(r.id);
  }
  await as(db, ID.admin, async () => {
    await db.query(`select public.rpc_review_recitation_entry($1::uuid, 'accepted', null)`, [ids[0]]);
    await db.query(`select public.rpc_review_recitation_entry($1::uuid, 'returned', 'Ayat terakhir kurang lancar')`, [ids[1]]);
    await db.query(`select public.rpc_review_recitation_entry($1::uuid, 'voided', 'Salah pilih santri')`, [ids[2]]);
  });
  const statuses = await db.query<{ status: string }>(
    `select status from public.recitation_entries where id = any($1::uuid[]) order by array_position($1::uuid[], id)`,
    [ids]
  );
  assert.deepEqual(statuses.rows.map((r) => r.status), ['accepted', 'returned', 'voided']);
  const aksi = await one(db, `select string_agg(distinct action, ',' order by action) from public.recitation_revisions where entry_id = any($1::uuid[])`, [ids]);
  assert.match(String(aksi), /accept/);
  assert.match(String(aksi), /return/);
  assert.match(String(aksi), /void/);
});

test('constraint baru tetap menolak aksi asing', async () => {
  await expectError(
    db.query(`insert into public.recitation_revisions(organization_id, entry_id, revision_no, action) select organization_id, id, 99, 'hapus_semua' from public.recitation_entries limit 1`),
    /recitation_revisions_action_check/
  );
});

// ---------------------------------------------------------------- BUG-03
test('no.5: rpc_platform_tenant_stats memberi angka benar untuk Superadmin', async () => {
  const rows = await as(db, ID.superadmin, async () =>
    (await db.query<any>(`select * from public.rpc_platform_tenant_stats() where organization_id = $1`, [ID.org])).rows
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].santri_active, 2);
  assert.equal(rows[0].musammi_total, 1);
  assert.equal(rows[0].halaqah_active, 1);
  assert.equal(rows[0].active_academic_year_name, '2026/2027');
});

test('no.5: Superadmin tanpa Support Access memang tidak bisa membaca tabel santri (alasan RPC dibutuhkan)', async () => {
  const n = await as(db, ID.superadmin, () => one(db, `select count(*)::int from public.santri`));
  assert.equal(n, 0);
});

test('rpc_platform_tenant_stats ditolak untuk Admin dan Musammi\'', async () => {
  for (const u of [ID.admin, ID.musammi]) {
    await as(db, u, () => expectError(db.query(`select * from public.rpc_platform_tenant_stats()`), /Hanya Superadmin/));
  }
});

// ---------------------------------------------------------------- BUG-04 / 05
const MANAGE = `select public.rpc_manage_access_grant($1::uuid, $2::uuid, $3::uuid, $4, $5, 'uji otomatis')`;

test('no.7: Superadmin tidak bisa men-suspend / mencabut aksesnya sendiri', async () => {
  await as(db, ID.superadmin, async () => {
    await expectError(db.query(MANAGE, [ID.grantSuper, ID.superadmin, null, 'superadmin', 'suspended']), /akun sendiri|terakhir/);
    await expectError(db.query(`update public.access_grants set status = 'revoked' where id = $1`, [ID.grantSuper]), /akun sendiri/);
  });
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [ID.grantSuper]), 'active');
});

test('no.8: Admin tidak bisa mengubah grant Superadmin atau membuat Superadmin', async () => {
  await as(db, ID.admin, async () => {
    await expectError(db.query(MANAGE, [ID.grantSuper, null, null, 'superadmin', 'suspended']), /Forbidden/);
    // Update langsung: ditolak trigger, atau baris tidak terlihat oleh RLS (0 baris). Keduanya aman.
    try {
      const r = await db.query(`update public.access_grants set status = 'suspended' where id = $1`, [ID.grantSuper]);
      assert.equal(r.affectedRows ?? 0, 0);
    } catch (e: any) {
      assert.match(String(e.message), /Hanya Superadmin/);
    }
  });
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [ID.grantSuper]), 'active');
});

test('no.9: Admin tidak bisa mengubah grant miliknya sendiri, tetapi bisa mengganti namanya', async () => {
  await as(db, ID.admin, async () => {
    await expectError(db.query(MANAGE, [ID.grantAdmin, ID.admin, ID.org, 'admin', 'suspended']), /Forbidden/);
    // Update langsung: ditolak trigger, atau tidak mengenai baris karena RLS.
    try {
      const r = await db.query(`update public.access_grants set status = 'suspended' where id = $1`, [ID.grantAdmin]);
      assert.equal(r.affectedRows ?? 0, 0);
    } catch (e: any) {
      assert.match(String(e.message), /akun sendiri|Forbidden/);
    }
    await db.query(`update public.profiles set full_name = 'Admin Uji Baru' where id = $1`, [ID.admin]);
  });
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [ID.grantAdmin]), 'active');
  assert.equal(await one(db, `select full_name from public.profiles where id = $1`, [ID.admin]), 'Admin Uji Baru');
});

test('no.10: Admin tetap bisa men-suspend dan memulihkan Musammi\'', async () => {
  await as(db, ID.admin, async () => {
    await db.query(MANAGE, [null, ID.musammi, ID.org, 'musammi', 'suspended']);
  });
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [ID.grantMusammi]), 'suspended');
  await as(db, ID.admin, () => db.query(MANAGE, [null, ID.musammi, ID.org, 'musammi', 'active']));
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [ID.grantMusammi]), 'active');
});

test('Admin aktif terakhir di lembaga tidak bisa dinonaktifkan, Superadmin terakhir juga tidak', async () => {
  await as(db, ID.superadmin, () =>
    expectError(db.query(MANAGE, [ID.grantAdmin, null, null, 'admin', 'suspended']), /Admin aktif terakhir/)
  );
  // Setelah ada Admin kedua, Admin pertama boleh di-suspend
  await db.query(`insert into public.access_grants(user_id, organization_id, role, status) values ($1, $2, 'admin', 'active')`, [ID.admin2, ID.org]);
  await as(db, ID.superadmin, () => db.query(MANAGE, [ID.grantAdmin, null, null, 'admin', 'suspended']));
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [ID.grantAdmin]), 'suspended');
  await as(db, ID.superadmin, () => db.query(MANAGE, [ID.grantAdmin, null, null, 'admin', 'active']));
});

test('Trigger mengizinkan penerima undangan mengaktifkan grant miliknya (invited -> active)', async () => {
  const uid = '00000000-0000-0000-0000-00000000d001';
  await db.query(`insert into auth.users(id, email) values ($1, 'baru@uji.test')`, [uid]);
  const gid = await one<string>(
    db,
    `insert into public.access_grants(user_id, organization_id, role, status) values ($1, $2, 'musammi', 'invited') returning id`,
    [uid, ID.org]
  );
  // Seperti di dalam rpc_accept_invitation (SECURITY DEFINER): auth.uid() = penerima, RLS dilewati.
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  try {
    await db.query(`update public.access_grants set status = 'active' where id = $1`, [gid]);
    await expectError(db.query(`update public.access_grants set status = 'suspended' where id = $1`, [gid]), /akun sendiri/);
    await expectError(db.query(`update public.access_grants set role = 'admin' where id = $1`, [gid]), /peran akun sendiri/);
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
  assert.equal(await one(db, `select status from public.access_grants where id = $1`, [gid]), 'active');
});

// ---------------------------------------------------------------- BUG-07 / 08
const SUPPORT = `select public.rpc_start_support_session($1::uuid, $2, 30, 'read_only')`;

test('no.11: alasan Support Access asal-asalan ditolak server', async () => {
  await as(db, ID.superadmin, async () => {
    for (const alasan of ['tes', 'asdfasdfasdf', '..........', 'aaaaaaaaaaaa']) {
      await expectError(db.query(SUPPORT, [ID.org, alasan]), /minimal|wajib jelas/);
    }
  });
});

test('no.12: alasan Support Access yang jelas diterima', async () => {
  const res = await as(db, ID.superadmin, () => one<any>(db, SUPPORT, [ID.org, 'Bantu admin cek absensi']));
  assert.ok(res);
  assert.equal(await one(db, `select count(*)::int from public.support_access_sessions where reason = 'Bantu admin cek absensi'`), 1);
});

const PUBLISH = `select public.rpc_publish_report_card($1::uuid, ${ID.academicYear}, 'Ganjil', $2::bigint, $3::numeric, 'Mumtaz', $4::jsonb, $5)`;

test('no.13: amandemen raport dengan alasan "tes" ditolak, alasan jelas diterima', async () => {
  await as(db, ID.admin, async () => {
    await db.query(PUBLISH, [ID.org, ID.santri1, 90, JSON.stringify({ nilai: 90 }), null]);
    await expectError(db.query(PUBLISH, [ID.org, ID.santri1, 91, JSON.stringify({ nilai: 91 }), 'tes']), /alasan/i);
    await db.query(PUBLISH, [ID.org, ID.santri1, 92, JSON.stringify({ nilai: 92 }), 'Koreksi nilai tajwid']);
  });
  const n = await one(db, `select count(*)::int from public.report_cards where santri_id = $1`, [ID.santri1]);
  assert.equal(n, 2);
});

test('trigger alasan raport juga menjaga insert langsung (jalur cadangan di RekapNilaiPage)', async () => {
  const parent = await one<string>(db, `select id from public.report_cards where santri_id = $1 order by version_no desc limit 1`, [ID.santri1]);
  const insert = (alasan: string) =>
    db.query(
      `insert into public.report_cards(organization_id, academic_year_id, semester_name, santri_id, version_no, status,
         final_score, predikat, snapshot_json, snapshot_hash, parent_report_card_id, amendment_reason)
       values ($1, ${ID.academicYear}, 'Ganjil', $2, 50, 'published', 80, 'Jayyid', '{}', 'h', $3, $4)`,
      [ID.org, ID.santri1, parent, alasan]
    );
  await expectError(insert('tes'), /Alasan revisi raport/);
  await expectError(insert('.....'), /Alasan revisi raport/);
});
