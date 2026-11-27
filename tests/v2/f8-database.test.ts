/**
 * Fase 8 · bisnis & siklus tahun ajaran — paket, pembayaran manual, status langganan,
 * antrean pendaftaran lembaga, dan kunci data tahun ajaran yang ditutup.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';

let db: PGlite;
const rows = async <T = any>(sql: string, params: any[] = []) => (await db.query<T>(sql, params)).rows;
const setor = (date: string) => db.query(
  `select public.rpc_submit_recitation_entry(p_santri_id => $1, p_halaqah_id => $2, p_recitation_date => $3::date, p_session_slot => 'Shubuh',
     p_kind => 'ziyadah', p_surah_start_no => 78, p_ayah_start => 1, p_surah_end_no => 78, p_ayah_end => 5,
     p_calculated_pages => 0, p_minor_mistakes => 0, p_major_mistakes => 0, p_predicate => null)`, [ID.santri1, ID.halaqah, date]);

before(async () => {
  db = await buildTestDb();
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
  await db.exec(`alter table auth.users add column if not exists raw_app_meta_data jsonb default '{}'::jsonb;
    drop trigger if exists uji_user_baru on auth.users;
    create trigger uji_user_baru after insert on auth.users for each row execute function public.handle_new_user();`);
});

test('paket: dibaca semua pengguna, hanya Superadmin yang mengatur; tanpa uji coba aktif', async () => {
  const paket = await as(db, ID.musammi, () => rows(`select id, aktif from public.platform_plans order by urutan`));
  assert.ok(paket.some((p) => p.id === 'standard' && p.aktif));
  assert.equal(paket.find((p) => p.id === 'trial')?.aktif, false);
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_simpan_paket('kecil', 'Kecil', 100, 50000, 500000)`), /Hanya Superadmin/));
  await as(db, ID.admin, () => expectError(db.query(`update public.platform_plans set harga_bulanan = 1 where id = 'standard' returning id`).then((r) => { if (!r.rows.length) throw new Error('RLS menolak'); }), /RLS menolak/));
  await as(db, ID.superadmin, () => db.query(`select public.rpc_simpan_paket('kecil', 'Kecil', 100, 50000, 500000, 'Sampai 100 santri', true, 0)`));
  const k = (await rows(`select * from public.platform_plans where id = 'kecil'`))[0];
  assert.deepEqual([k.nama, k.batas_santri, Number(k.harga_bulanan)], ['Kecil', 100, 50000]);
});

test('pembayaran: Superadmin mencatat → masa langganan & paket lembaga ikut; batal → dihitung ulang; Admin hanya melihat miliknya', async () => {
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_catat_pembayaran($1, '2026-12-01', 500000, '2026-12-01', '2027-11-30')`, [ID.org]), /Hanya Superadmin/));
  const a = await as(db, ID.superadmin, () => one<any>(db, `select public.rpc_catat_pembayaran($1, '2026-12-01', 500000, '2026-12-01', '2027-11-30', 'kecil', 'Transfer BSI')`, [ID.org]));
  assert.equal(a.langganan_sampai, '2027-11-30');
  assert.equal(a.status_langganan, 'aktif');
  const b = await as(db, ID.superadmin, () => one<any>(db, `select public.rpc_catat_pembayaran($1, '2027-11-20', 500000, '2027-12-01', '2028-11-30')`, [ID.org]));
  assert.equal(b.langganan_sampai, '2028-11-30');
  const org = (await rows(`select plan_id, langganan_sampai::text s from public.organizations where id = $1`, [ID.org]))[0];
  assert.deepEqual([org.plan_id, org.s], ['kecil', '2028-11-30']);
  await as(db, ID.superadmin, () => expectError(db.query(`select public.rpc_batalkan_pembayaran($1, '')`, [b.id]), /Alasan/));
  const c = await as(db, ID.superadmin, () => one<any>(db, `select public.rpc_batalkan_pembayaran($1, 'salah input')`, [b.id]));
  assert.equal(c.langganan_sampai, '2027-11-30');
  assert.equal((await as(db, ID.admin, () => rows(`select id from public.pembayaran_lembaga`))).length, 2);
  assert.equal((await as(db, ID.musammi, () => rows(`select id from public.pembayaran_lembaga`))).length, 0);
  const audit = await rows(`select action from public.audit_logs where action like 'pembayaran.%' order by created_at`);
  assert.deepEqual(audit.map((x) => x.action), ['pembayaran.catat', 'pembayaran.catat', 'pembayaran.batal']);
});

test('status langganan: belum_bayar / aktif / segera_habis (≤ 7 hari) / lewat', async () => {
  const s = (sampai: string | null) => one<string>(db, `select public.fn_status_langganan($1::date, '2027-01-10')`, [sampai]);
  assert.deepEqual([await s(null), await s('2027-03-01'), await s('2027-01-15'), await s('2027-01-09')], ['belum_bayar', 'aktif', 'segera_habis', 'lewat']);
});

test('kuota santri: rpc_langganan_saya menandai bila santri aktif melebihi batas paket', async () => {
  const r = await as(db, ID.admin, () => one<any>(db, `select public.rpc_langganan_saya($1)`, [ID.org]));
  assert.equal(r.nama_paket, 'Kecil');
  assert.equal(r.melebihi_kuota, false);
  await as(db, ID.superadmin, () => db.query(`select public.rpc_simpan_paket('kecil', 'Kecil', 1, 50000, 500000)`));
  const r2 = await as(db, ID.admin, () => one<any>(db, `select public.rpc_langganan_saya($1)`, [ID.org]));
  assert.equal(r2.melebihi_kuota, true);
  const ring = await as(db, ID.superadmin, () => rows(`select * from public.rpc_ringkasan_langganan() where organization_id = $1`, [ID.org]));
  assert.equal(ring[0].nama_paket, 'Kecil');
  await as(db, ID.admin, () => expectError(db.query(`select * from public.rpc_ringkasan_langganan()`), /Hanya Superadmin/));
});

test('pendaftaran mandiri: masuk antrean → disetujui (lembaga aktif, pendaftar jadi Admin) / ditolak (lembaga diarsipkan)', async () => {
  const u1 = '00000000-0000-0000-0000-0000000000e1';
  const u2 = '00000000-0000-0000-0000-0000000000e2';
  const meta = (nama: string) => JSON.stringify({ full_name: 'Ust. ' + nama, mahad_name: "Ma'had " + nama, no_hp: '0812', kota: 'Bogor', perkiraan_santri: '±120 santri' });
  await db.query(`insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values ($1, 'a@x.id', $2, '{"provider":"email"}')`, [u1, meta('Satu')]);
  await db.query(`insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values ($1, 'b@x.id', $2, '{"provider":"email"}')`, [u2, meta('Dua')]);
  const antre = await as(db, ID.superadmin, () => rows(`select * from public.pendaftaran_lembaga where status = 'menunggu' order by nama_lembaga desc`));
  assert.equal(antre.length, 2);
  assert.deepEqual([antre[0].nama_lembaga, antre[0].kota, antre[0].perkiraan_santri], ["Ma'had Satu", 'Bogor', 120]);
  // pendaftar hanya melihat pendaftarannya sendiri
  assert.equal((await as(db, u1, () => rows(`select id from public.pendaftaran_lembaga`))).length, 1);

  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_setujui_pendaftaran($1)`, [antre[0].id]), /Hanya Superadmin/));
  const ok = await as(db, ID.superadmin, () => one<any>(db, `select public.rpc_setujui_pendaftaran($1, 'standard')`, [antre[0].id]));
  const org = (await rows(`select status, plan_id from public.organizations where id = $1`, [ok.organization_id]))[0];
  assert.deepEqual([org.status, org.plan_id], ['active', 'standard']);
  assert.equal(await one<string>(db, `select role from public.profiles where id = $1`, [u1]), 'admin');
  await as(db, ID.superadmin, () => expectError(db.query(`select public.rpc_setujui_pendaftaran($1)`, [antre[0].id]), /sudah diputuskan/));

  await as(db, ID.superadmin, () => expectError(db.query(`select public.rpc_tolak_pendaftaran($1, ' ')`, [antre[1].id]), /Alasan/));
  await as(db, ID.superadmin, () => db.query(`select public.rpc_tolak_pendaftaran($1, 'Data tidak lengkap')`, [antre[1].id]));
  const o2 = (await rows(`select o.status from public.organizations o join public.pendaftaran_lembaga p on p.organization_id = o.id where p.id = $1`, [antre[1].id]))[0];
  assert.equal(o2.status, 'archived');
  assert.equal(await one<string>(db, `select role from public.profiles where id = $1`, [u2]), 'pending');
});

test('tahun ajaran Ditutup: setoran/sesi tidak bisa ditambah atau diubah; Admin bisa membuka kembali dengan alasan', async () => {
  await as(db, ID.admin, () => setor('2026-11-10'));
  await db.exec(`update public.academic_years set status = 'closed', lifecycle_status = 'closed' where id = ${ID.academicYear}`);
  await as(db, ID.admin, () => expectError(setor('2026-11-11'), /sudah ditutup/));
  await as(db, ID.admin, () => expectError(db.query(`update public.recitation_entries set notes = 'x' where academic_year_id = $1`, [ID.academicYear]), /sudah ditutup/));
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_buka_kembali_tahun_ajaran($1, 'koreksi')`, [ID.academicYear]), /Hanya Admin/));
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_buka_kembali_tahun_ajaran($1, '')`, [ID.academicYear]), /Alasan/));
  await as(db, ID.admin, () => db.query(`select public.rpc_buka_kembali_tahun_ajaran($1, 'koreksi setoran terlewat')`, [ID.academicYear]));
  await as(db, ID.admin, () => setor('2026-11-11'));
  // proses sistem (tanpa login) tidak dikunci
  await db.exec(`update public.academic_years set status = 'closed', lifecycle_status = 'closed' where id = ${ID.academicYear}`);
  await db.exec(`update public.recitation_entries set notes = 'migrasi' where academic_year_id = ${ID.academicYear}`);
});
