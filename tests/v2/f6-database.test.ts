/**
 * Fase 6 · Telegram & laporan otomatis — diuji di PostgreSQL memori (PGlite).
 * Butir rencana: kode unik santri + penautan otomatis (balasan berisi nama ananda), notifikasi setoran
 * lewat notification_queue, kehadiran mingguan terjadwal, progres per periode saat form terkirim,
 * template dengan variabel.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, one, expectError, ID } from './helpers/db';

let db: PGlite;
const rows = async <T = any>(sql: string, params: any[] = []) => (await db.query<T>(sql, params)).rows;
const kodeDari = (sid: number) => one<string>(db, `select kode_telegram from public.santri where id = $1`, [sid]);
const antrian = (jenis?: string) => rows<any>(
  `select * from public.notification_queue where organization_id = $1 ${jenis ? 'and jenis = $2' : ''} order by created_at`,
  jenis ? [ID.org, jenis] : [ID.org]);
const tautkan = (chat: string, kode: string) => one<any>(db, `select public.fn_tautkan_telegram($1, $2, $3)`, [ID.org, chat, kode]);
const setor = (date: string, s1 = 78, a1 = 1, s2 = 78, a2 = 10, santri: number = ID.santri1) => db.query(
  `select public.rpc_submit_recitation_entry(p_santri_id => $1, p_halaqah_id => $2, p_recitation_date => $3::date, p_session_slot => 'Shubuh',
     p_kind => 'ziyadah', p_surah_start_no => $4, p_ayah_start => $5, p_surah_end_no => $6, p_ayah_end => $7,
     p_calculated_pages => 0, p_minor_mistakes => 1, p_major_mistakes => 0, p_predicate => null)`,
  [santri, ID.halaqah, date, s1, a1, s2, a2]);
const absen = (date: string, status: string, santri: number = ID.santri1) => db.query(
  `select public.rpc_record_attendance($1::jsonb, null)`,
  [JSON.stringify([{ peran: 'Santri', person_id: santri, halaqah_id: ID.halaqah, date, waktu: 'Shubuh', status }])]);
const TOKEN = `insert into public.integration_secrets(organization_id, provider, secret_key_name, secret_value, masked_preview, status)
  values ('${ID.org}', 'telegram', 'TELEGRAM_BOT_TOKEN', '123456:ABCDEF', '123••', 'active')
  on conflict (organization_id, provider, secret_key_name) do update set status = 'active', secret_value = excluded.secret_value`;

before(async () => {
  db = await buildTestDb();
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
});

test('kode Telegram: acak 8 karakter tanpa huruf mirip, unik, otomatis untuk santri baru, tidak bisa diubah langsung', async () => {
  const kode = await rows<any>(`select kode_telegram from public.santri where organization_id = $1`, [ID.org]);
  assert.ok(kode.length >= 2);
  for (const k of kode) assert.match(k.kode_telegram, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(new Set(kode.map((k) => k.kode_telegram)).size, kode.length);
  const baru = await as(db, ID.admin, () => one<string>(db,
    `insert into public.santri(organization_id, nama, marhalah, kelas, kode, status, kode_telegram) values ($1, 'Santri Baru', 'MTW', '7A', 'S-099', 'active', 'AAAAAAAA') returning kode_telegram`, [ID.org]));
  assert.match(baru, /^[A-Z2-9]{8}$/);
  assert.notEqual(baru, 'AAAAAAAA', 'kode dari aplikasi diabaikan');
  const lama = await kodeDari(ID.santri1);
  await as(db, ID.admin, () => db.query(`update public.santri set kode_telegram = 'BBBBBBBB' where id = $1`, [ID.santri1]));
  assert.equal(await kodeDari(ID.santri1), lama, 'kode tidak bisa diganti langsung');
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_buat_ulang_kode_telegram($1)`, [ID.santri1]), /hanya Admin/));
  const r = await as(db, ID.admin, () => one<any>(db, `select public.rpc_buat_ulang_kode_telegram($1)`, [ID.santri1]));
  assert.notEqual(r.kode_telegram, lama);
  assert.equal(await kodeDari(ID.santri1), r.kode_telegram);
});

test('penautan: kode benar (huruf kecil/berspasi) menautkan & membalas nama ananda; satu wali beberapa anak; kode salah dibatasi', async () => {
  const k1 = await kodeDari(ID.santri1);
  const k2 = await kodeDari(ID.santri2);
  const salah = await tautkan('5551', 'ZZZZZZZZ');
  assert.deepEqual([salah.ok, salah.alasan], [false, 'kode_salah']);
  const ok = await tautkan('5551', `${k1.slice(0, 4).toLowerCase()} ${k1.slice(4)}`);
  assert.equal(ok.ok, true);
  assert.equal(ok.nama, 'Santri Satu');
  assert.equal(ok.halaqah, 'Halaqah Uji');
  assert.equal(await one(db, `select telegram_chat_id from public.santri where id = $1`, [ID.santri1]), '5551');
  assert.ok(await one(db, `select telegram_linked_at from public.santri where id = $1`, [ID.santri1]));
  const ok2 = await tautkan('5551', k2);
  assert.deepEqual(ok2.anak, ['Santri Dua', 'Santri Satu'], 'satu chat wali untuk dua anak');
  assert.equal((await tautkan('5551', k1)).sudah, true);
  // tebakan beruntun dari chat lain diblokir walaupun akhirnya benar
  for (let i = 0; i < 5; i++) await tautkan('7777', `QQQQQQQ${i + 2}`);
  assert.equal((await tautkan('7777', k1)).alasan, 'terlalu_banyak');
  assert.equal(await one(db, `select telegram_chat_id from public.santri where id = $1`, [ID.santri1]), '5551');
  assert.equal((await tautkan('abc', k1)).alasan, 'chat_tidak_valid');
  // Fungsi penautan hanya untuk server
  await as(db, ID.admin, () => expectError(tautkan('5552', k1), /permission denied/));
});

test('antrian setoran: hanya bila token aktif, santri tertaut, Mode Harian & pengaturan aktif; template terisi; satu pesan per setoran', async () => {
  await as(db, ID.admin, () => setor('2026-11-02'));
  assert.equal((await antrian('setoran')).length, 0, 'token bot belum ada');
  await db.exec(TOKEN);
  await as(db, ID.admin, () => setor('2026-11-03', 78, 11, 78, 20));
  let q = await antrian('setoran');
  assert.equal(q.length, 1);
  assert.equal(q[0].chat_id, '5551');
  assert.match(q[0].pesan, /ananda Santri Satu \(Halaqah Uji\)/);
  assert.match(q[0].pesan, /3 November 2026, Shubuh/);
  assert.match(q[0].pesan, /Surat: An-Naba' 11–20/);
  assert.match(q[0].pesan, /Khoto kabir\/shoghir: 0\/1/);
  assert.doesNotMatch(q[0].pesan, /\{[a-z_]+\}/, 'semua variabel terisi');
  // Template lama (nama variabel aplikasi sebelumnya) tetap didukung
  await as(db, ID.admin, () => db.query(`update public.telegram_settings set setoran_template = 'Ananda {nama_santri}: {skema} {jumlah_halaman} hal, {nilai}{ulang}' where organization_id = $1`, [ID.org]));
  await as(db, ID.admin, () => setor('2026-11-04', 78, 21, 78, 25));
  q = await antrian('setoran');
  assert.match(q[1].pesan, /^Ananda Santri Satu: Ziyadah [0-9,]+ hal, (Mumtaz|Jayyid Jiddan|Jayyid|Maqbul)$/);
  // Mode Rekap / pengaturan mati / santri belum tertaut → tidak ada pesan
  await db.exec(`update public.halaqah set recording_mode = 'rekap' where id = ${ID.halaqah}`);
  await as(db, ID.admin, () => setor('2026-11-05', 78, 26, 78, 30));
  await db.exec(`update public.halaqah set recording_mode = 'harian' where id = ${ID.halaqah}`);
  await as(db, ID.admin, () => db.query(`update public.telegram_settings set setoran_aktif = false where organization_id = $1`, [ID.org]));
  await as(db, ID.admin, () => setor('2026-11-06', 78, 31, 78, 35));
  await as(db, ID.admin, () => db.query(`update public.telegram_settings set setoran_aktif = true where organization_id = $1`, [ID.org]));
  await db.exec(`update public.santri set telegram_chat_id = null where id = ${ID.santri2}`);
  await as(db, ID.admin, () => setor('2026-11-06', 1, 1, 1, 7, ID.santri2));
  assert.equal((await antrian('setoran')).length, 2);
  await db.exec(`update public.santri set telegram_chat_id = '5551' where id = ${ID.santri2}`);
});

test('RLS: Admin membaca antrian & mengubah pengaturan; musammi\' tidak; tulis langsung ke antrian ditolak; template divalidasi', async () => {
  assert.ok((await as(db, ID.admin, () => rows(`select id from public.notification_queue`))).length >= 2);
  assert.equal((await as(db, ID.musammi, () => rows(`select id from public.notification_queue`))).length, 0);
  assert.equal((await as(db, ID.musammi, () => rows(`select * from public.telegram_settings`))).length, 0);
  await as(db, ID.admin, () => expectError(db.query(
    `insert into public.notification_queue(organization_id, chat_id, jenis, pesan, dedup_key) values ($1, '1', 'uji', 'x', 'x')`, [ID.org]), /permission denied/));
  await as(db, ID.admin, () => expectError(db.query(`update public.telegram_settings set mingguan_jam = 25 where organization_id = $1`, [ID.org]), /telegram_settings_jam/));
  await as(db, ID.admin, () => expectError(db.query(`update public.telegram_settings set periode_template = 'x' where organization_id = $1`, [ID.org]), /telegram_settings_template/));
  await as(db, ID.musammi, () => db.query(`update public.telegram_settings set setoran_aktif = false where organization_id = $1`, [ID.org]));
  assert.equal(await one(db, `select setoran_aktif from public.telegram_settings where organization_id = $1`, [ID.org]), true);
});

test('kehadiran mingguan: terjadwal pada hari & jam lembaga (WIB), sekali per hari; rincian status; Admin bisa kirim sekarang', async () => {
  // Jumat 27 Nov 2026 — minggu 21–27 Nov
  await as(db, ID.admin, async () => {
    await absen('2026-11-23', 'hadir'); await absen('2026-11-24', 'hadir'); await absen('2026-11-25', 'izin'); await absen('2026-11-27', 'hadir');
    await absen('2026-11-20', 'alpa'); // di luar minggu
  });
  const jalan = (iso: string) => one<any>(db, `select public.rpc_proses_jadwal_telegram($1::timestamptz)`, [iso]);
  await jalan('2026-11-26T13:30:00Z');   // Kamis 20.30 WIB → bukan harinya
  await jalan('2026-11-27T12:30:00Z');   // Jumat 19.30 WIB → belum jamnya
  assert.equal((await antrian('kehadiran_mingguan')).length, 0);
  await jalan('2026-11-27T13:05:00Z');   // Jumat 20.05 WIB
  const q = await antrian('kehadiran_mingguan');
  assert.equal(q.length, 1, 'hanya santri tertaut yang punya absensi');
  assert.match(q[0].pesan, /21 November 2026 s\.d\. 27 November 2026/);
  assert.match(q[0].pesan, /Hadir: 3 dari 4 sesi \(75%\)/);
  assert.match(q[0].pesan, /Rincian: .*Hadir 3.*Izin 1/);
  assert.equal(await one(db, `select mingguan_terakhir::text from public.telegram_settings where organization_id = $1`, [ID.org]), '2026-11-27');
  await jalan('2026-11-27T14:00:00Z');   // masih Jumat → tidak dobel
  assert.equal((await antrian('kehadiran_mingguan')).length, 1);
  // Admin: kirim sekarang (dedup per tanggal akhir)
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_kirim_kehadiran_mingguan('2026-11-27')`), /hanya Admin/));
  const r = await as(db, ID.admin, () => one<any>(db, `select public.rpc_kirim_kehadiran_mingguan('2026-11-27')`));
  assert.equal(r.antri, 0, 'minggu yang sama tidak dikirim dua kali');
});

test('progres periode: form berubah Terkirim → pesan per santri; Admin kirim ulang; tanpa kirim ulang tidak dobel', async () => {
  const per = await as(db, ID.admin, () => one<string>(db, `insert into public.evaluation_periods(organization_id, academic_year_id, name, start_date, end_date)
    values ($1, $2, 'November', '2026-11-01', '2026-11-30') returning id`, [ID.org, ID.academicYear]));
  await as(db, ID.musammi, async () => {
    await db.query(`select public.rpc_buka_form_periode($1::uuid, $2)`, [per, ID.halaqah]);
    await db.query(`select public.rpc_simpan_form_periode($1::uuid, $2, '[]'::jsonb, null, true, null)`, [per, ID.halaqah]);
  });
  let q = await antrian('progres_periode');
  assert.equal(q.length, 2, 'dua santri tertaut');
  const p1 = q.find((x) => x.santri_id === ID.santri1)!;
  assert.match(p1.pesan, /Capaian ananda Santri Satu \(Halaqah Uji\) — November/);
  assert.match(p1.pesan, /Ziyadah: [0-9,]+ halaman/);
  assert.match(p1.pesan, /Posisi hafalan: belakang sampai An-Naba' 35/);
  assert.match(p1.pesan, /Kehadiran: 60%/, '3 hadir dari 5 absensi dalam periode');
  const lagi = await as(db, ID.admin, () => one<any>(db, `select public.rpc_kirim_progres_periode($1::uuid)`, [per]));
  assert.deepEqual([lagi.antri, lagi.form_terkirim], [0, 1]);
  const ulang = await as(db, ID.admin, () => one<any>(db, `select public.rpc_kirim_progres_periode($1::uuid, null, true)`, [per]));
  assert.equal(ulang.antri, 2);
  q = await antrian('progres_periode');
  assert.equal(q.length, 4);
});

test('pemroses antrian: ambil mengunci baris; gagal → coba lagi bertahap, 5x → gagal; berhasil → terkirim; Admin ulangi/batal', async () => {
  const ambil = await rows<any>(`select * from public.fn_antrian_ambil(3)`);
  assert.equal(ambil.length, 3);
  assert.ok(ambil.every((r) => r.status === 'proses' && r.attempts === 1));
  assert.equal((await rows<any>(`select * from public.fn_antrian_ambil(100)`)).every((r) => !ambil.some((a) => a.id === r.id)), true, 'baris terkunci tidak diambil lagi');
  await db.query(`select public.fn_antrian_selesai($1, true)`, [ambil[0].id]);
  assert.equal(await one(db, `select status from public.notification_queue where id = $1`, [ambil[0].id]), 'terkirim');
  assert.equal(await one(db, `select public.fn_antrian_selesai($1, false, 'timeout')`, [ambil[1].id]), 'antri');
  assert.ok(await one(db, `select next_attempt_at > now() from public.notification_queue where id = $1`, [ambil[1].id]));
  await db.query(`update public.notification_queue set attempts = 5 where id = $1`, [ambil[1].id]);
  assert.equal(await one(db, `select public.fn_antrian_selesai($1, false, 'timeout')`, [ambil[1].id]), 'gagal');
  assert.equal(await one(db, `select public.fn_antrian_selesai($1, false, 'bot was blocked by the user', true)`, [ambil[2].id]), 'gagal');
  await as(db, ID.admin, () => db.query(`select public.rpc_antrian_ulangi($1)`, [ambil[1].id]));
  assert.deepEqual(await one(db, `select array[status, attempts::text] from public.notification_queue where id = $1`, [ambil[1].id]), ['antri', '0']);
  await as(db, ID.admin, () => db.query(`select public.rpc_antrian_batal($1)`, [ambil[1].id]));
  assert.equal(await one(db, `select status from public.notification_queue where id = $1`, [ambil[1].id]), 'batal');
  await as(db, ID.musammi, () => expectError(db.query(`select public.rpc_antrian_ulangi($1)`, [ambil[2].id]), /hanya Admin/));
  await as(db, ID.admin, () => expectError(db.query(`select * from public.fn_antrian_ambil(1)`), /permission denied/));
});

test('pesan uji & /berhenti: wali berhenti → semua anak terputus, pesan yang belum terkirim dibatalkan', async () => {
  const u = await as(db, ID.admin, () => one<any>(db, `select public.rpc_uji_telegram($1)`, [ID.santri1]));
  assert.equal(u.antri, true);
  const n = await one<number>(db, `select public.fn_telegram_berhenti($1, '5551')`, [ID.org]);
  assert.equal(n, 2);
  assert.equal(Number(await one(db, `select count(*) from public.santri where telegram_chat_id = '5551'`)), 0);
  assert.equal(Number(await one(db, `select count(*) from public.notification_queue where chat_id = '5551' and status = 'antri'`)), 0);
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_uji_telegram($1)`, [ID.santri1]), /belum menautkan/));
  // Admin bisa memutus tautan satu santri
  await tautkan('6001', await kodeDari(ID.santri2));
  await as(db, ID.admin, () => db.query(`select public.rpc_putus_telegram($1)`, [ID.santri2]));
  assert.equal(await one(db, `select telegram_chat_id from public.santri where id = $1`, [ID.santri2]), null);
});

test('render template: variabel diganti sekali lintas, tak dikenal dibiarkan, null jadi "-"', async () => {
  assert.equal(await one(db, `select public.fn_render_template('A {x}{y} {z} {w}', '{"x":"{y}","y":"","z":null}'::jsonb)`), 'A {y} - {w}');
});

test('status bot untuk layar: anggota lembaga saja; fungsi internal tidak bisa dipanggil aplikasi', async () => {
  const s = await as(db, ID.admin, () => one<any>(db, `select public.rpc_status_telegram()`));
  assert.equal(s.siap, true);
  assert.ok(Number(s.santri_aktif) >= 2);
  await as(db, ID.admin, () => expectError(db.query(`select public.fn_telegram_siap($1)`, [ID.org]), /permission denied/));
  await as(db, ID.admin, () => expectError(db.query(`select public.rpc_proses_jadwal_telegram()`), /permission denied/));
  await as(db, ID.admin, () => expectError(db.query(`select public.fn_antrikan($1, $2, 'uji', 'x', 'y')`, [ID.org, ID.santri1]), /permission denied/));
});
