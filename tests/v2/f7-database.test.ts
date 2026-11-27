/**
 * Fase 7 · HP & performa — indeks dan rpc_setoran_terakhir (setoran diterima terakhir per santri per jenis),
 * dipakai saat aplikasi hanya memuat data 14 hari agar posisi hafalan santri tetap benar.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, ID } from './helpers/db';

let db: PGlite;
const setor = (date: string, kind: string, a1: number, a2: number, santri: number = ID.santri1) => as(db, ID.admin, () => db.query(
  `select public.rpc_submit_recitation_entry(p_santri_id => $1, p_halaqah_id => $2, p_recitation_date => $3::date, p_session_slot => 'Shubuh',
     p_kind => $4, p_surah_start_no => 78, p_ayah_start => $5, p_surah_end_no => 78, p_ayah_end => $6,
     p_calculated_pages => 0, p_minor_mistakes => 0, p_major_mistakes => 0, p_predicate => null)`,
  [santri, ID.halaqah, date, kind, a1, a2]));

before(async () => {
  db = await buildTestDb();
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
});

test('indeks Fase 7 ada', async () => {
  const r = await db.query<any>(`select indexname from pg_indexes where indexname in ('idx_recitation_entries_terakhir','idx_hsm_org_student_from')`);
  assert.equal(r.rows.length, 2);
});

test('rpc_setoran_terakhir: satu baris terbaru per santri per jenis, hanya status accepted', async () => {
  await setor('2026-01-05', 'ziyadah', 1, 5);
  await setor('2026-03-10', 'ziyadah', 6, 10);
  await setor('2026-02-01', 'ziyadah', 11, 15);
  await setor('2026-01-20', 'murojaah', 1, 20);
  await setor('2026-01-07', 'ziyadah', 1, 3, ID.santri2);
  // setoran terbaru yang dibatalkan tidak boleh terpilih
  await db.exec(`update public.recitation_entries set status = 'cancelled' where santri_id = ${ID.santri2}`).catch(() => undefined);
  const rows = (await as(db, ID.admin, () => db.query<any>(`select santri_id, kind, recitation_date::text d, ayah_end from public.rpc_setoran_terakhir($1) order by santri_id, kind`, [ID.org]))).rows;
  const s1 = rows.filter((r) => r.santri_id === ID.santri1);
  assert.deepEqual(s1.map((r) => [r.kind, r.d, r.ayah_end]), [['murojaah', '2026-01-20', 20], ['ziyadah', '2026-03-10', 10]]);
  const kunci = rows.map((r) => `${r.santri_id}:${r.kind}`);
  assert.equal(new Set(kunci).size, kunci.length, 'tidak ada duplikat santri+jenis');
});

test('rpc_setoran_terakhir mengikuti RLS (security invoker): pengguna tanpa akses tidak melihat apa pun', async () => {
  const lain = '11111111-2222-3333-4444-555555555555';
  const r = await as(db, ID.admin, () => db.query<any>(`select count(*)::int n from public.rpc_setoran_terakhir($1)`, [lain]));
  assert.equal(r.rows[0].n, 0);
  const sec = await db.query<any>(`select prosecdef from pg_proc where proname = 'rpc_setoran_terakhir'`);
  assert.equal(sec.rows[0].prosecdef, false);
});

test('handle_new_user: login Google tanpa undangan tidak membuat lembaga; daftar email dengan nama ma\'had tetap membuat', async () => {
  await db.exec(`alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb;
    drop trigger if exists uji_user_baru on auth.users;
    create trigger uji_user_baru after insert on auth.users for each row execute function public.handle_new_user();`);
  const jmlOrg = async () => (await db.query<any>(`select count(*)::int n from public.organizations`)).rows[0].n;
  const awal = await jmlOrg();
  const g = '00000000-0000-0000-0000-0000000000f1';
  await db.query(`insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values ($1, 'wali@gmail.com', '{"name":"Wali Google"}', '{"provider":"google"}')`, [g]);
  assert.equal(await jmlOrg(), awal, 'tidak ada lembaga baru');
  const p = (await db.query<any>(`select organization_id, role, full_name from public.profiles where id = $1`, [g])).rows[0];
  assert.deepEqual([p.organization_id, p.role, p.full_name], [null, 'pending', 'Wali Google']);
  const e = '00000000-0000-0000-0000-0000000000f2';
  await db.query(`insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values ($1, 'admin@mahad.id', '{"full_name":"Admin","mahad_name":"Ma''had Contoh"}', '{"provider":"email"}')`, [e]);
  assert.equal(await jmlOrg(), awal + 1);
  const t = '00000000-0000-0000-0000-0000000000f3';
  await db.query(`insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values ($1, 'ust@gmail.com', $2, '{"provider":"google"}')`, [t, JSON.stringify({ target_organization_id: ID.org })]);
  assert.equal((await db.query<any>(`select organization_id from public.profiles where id = $1`, [t])).rows[0].organization_id, ID.org);
});
