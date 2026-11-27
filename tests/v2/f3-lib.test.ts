/**
 * Fase 3 · logika layar (predikat, arah hafalan, pesan wali, absensi per waktu) + pemeriksaan kode.
 * Predikat di layar dibandingkan langsung dengan fungsi database fn_predikat_kelancaran.
 */
import { bacaModul } from './helpers/baca';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, as, ID } from './helpers/db';
import { hitungPredikat, DEFAULT_FLUENCY_RULES, type FluencyRule } from '../../lib/kelancaran';
import { titikAwalPertama, titikAwalBerikutnya, saranAkhir } from '../../lib/arahHafalan';
import { renderTemplate } from '../../lib/telegramPesan';
import { opsiWaktu, halaqahSaya, halaqahPadaWaktu, rosterPadaTanggal, statusHadir, hitungPerubahan, hariIni } from '../../lib/sesiHalaqah';
import { DEFAULT_STATUSES } from '../../lib/v2Adapter';

let db: PGlite;
before(async () => {
  db = await buildTestDb();
});

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => bacaModul(ROOT, p);

// ---------------------------------------------------------------- predikat
test('predikat layar sama dengan fn_predikat_kelancaran (tabel bawaan, kabir 0–6 × shoghir 0–8)', async () => {
  const rules = await as(db, ID.admin, async () =>
    (await db.query<FluencyRule>(`select predicate, sort_order, max_major, max_minor, is_repeat, is_active
       from public.fluency_rules where organization_id = $1`, [ID.org])).rows);
  assert.ok(rules.length >= 5, 'tabel kelancaran bawaan terisi');
  for (let k = 0; k <= 6; k++) {
    for (let s = 0; s <= 8; s++) {
      const server = (await db.query<any>(`select * from public.fn_predikat_kelancaran($1, $2, $3)`, [ID.org, k, s])).rows[0];
      const layar = hitungPredikat(rules, k, s);
      assert.equal(layar.predicate, server.predicate, `kabir ${k} shoghir ${s}`);
      assert.equal(layar.isRepeat, server.is_repeat, `ulang kabir ${k} shoghir ${s}`);
    }
  }
});

test('predikat layar tetap sama setelah Admin mengubah tabel', async () => {
  await as(db, ID.admin, () => db.query(
    `update public.fluency_rules set max_major = 0, max_minor = 0 where organization_id = $1 and predicate = 'Mumtaz'`, [ID.org]));
  await as(db, ID.admin, () => db.query(
    `insert into public.fluency_rules(organization_id, predicate, sort_order, max_major, max_minor) values ($1, 'Hasan', 2, 0, 2)`, [ID.org]));
  const rules = (await db.query<FluencyRule>(`select predicate, sort_order, max_major, max_minor, is_repeat, is_active
     from public.fluency_rules where organization_id = $1`, [ID.org])).rows;
  for (const [k, s] of [[0, 0], [0, 1], [0, 2], [1, 1], [1, 3], [3, 0], [9, 9]]) {
    const server = (await db.query<any>(`select * from public.fn_predikat_kelancaran($1, $2, $3)`, [ID.org, k, s])).rows[0];
    assert.deepEqual(hitungPredikat(rules, k, s), { predicate: server.predicate, isRepeat: server.is_repeat }, `kabir ${k} shoghir ${s}`);
  }
});

test('predikat bawaan: Mumtaz, Jayyid Jiddan, Maqbul, Rasib', () => {
  assert.deepEqual(hitungPredikat(DEFAULT_FLUENCY_RULES, 0, 0), { predicate: 'Mumtaz', isRepeat: false });
  assert.deepEqual(hitungPredikat(DEFAULT_FLUENCY_RULES, 1, 2), { predicate: 'Jayyid Jiddan', isRepeat: false });
  assert.deepEqual(hitungPredikat(DEFAULT_FLUENCY_RULES, 2, 5), { predicate: 'Maqbul', isRepeat: false });
  assert.deepEqual(hitungPredikat(DEFAULT_FLUENCY_RULES, 3, 0), { predicate: 'Rasib', isRepeat: true });
  assert.deepEqual(hitungPredikat([], -1, Number.NaN), { predicate: 'Mumtaz', isRepeat: false }, 'kosong → tabel bawaan, angka tidak sah → 0');
  const nonaktif = DEFAULT_FLUENCY_RULES.map((r) => (r.predicate === 'Mumtaz' ? { ...r, is_active: false } : r));
  assert.equal(hitungPredikat(nonaktif, 0, 0).predicate, 'Jayyid Jiddan', 'predikat nonaktif dilewati');
});

// ---------------------------------------------------------------- arah hafalan
test('arah hafalan: titik awal pertama', () => {
  assert.deepEqual(titikAwalPertama('mundur'), { surah: 114, ayah: 1 });
  assert.deepEqual(titikAwalPertama('maju'), { surah: 1, ayah: 1 });
  assert.deepEqual(titikAwalBerikutnya(null, 'mundur'), { surah: 114, ayah: 1 });
});

test('arah mundur: lanjut ayat, lalu surat sebelumnya', () => {
  const r = (s1: number, a1: number, s2: number, a2: number) => ({ surah_start_no: s1, ayah_start: a1, surah_end_no: s2, ayah_end: a2 });
  assert.deepEqual(titikAwalBerikutnya(r(78, 1, 78, 10), 'mundur'), { surah: 78, ayah: 11 });
  assert.deepEqual(titikAwalBerikutnya(r(78, 31, 78, 40), 'mundur'), { surah: 77, ayah: 1 }, 'An-Naba selesai → Al-Mursalat');
  assert.deepEqual(titikAwalBerikutnya(r(112, 1, 114, 6), 'mundur'), { surah: 111, ayah: 1 }, 'lintas surat disimpan naik');
  assert.deepEqual(titikAwalBerikutnya(r(1, 1, 1, 7), 'mundur'), { surah: 1, ayah: 1 }, 'sudah khatam');
});

test('arah maju: lanjut ayat, lalu surat berikutnya', () => {
  const r = (s1: number, a1: number, s2: number, a2: number) => ({ surah_start_no: s1, ayah_start: a1, surah_end_no: s2, ayah_end: a2 });
  assert.deepEqual(titikAwalBerikutnya(r(2, 1, 2, 5), 'maju'), { surah: 2, ayah: 6 });
  assert.deepEqual(titikAwalBerikutnya(r(1, 1, 1, 7), 'maju'), { surah: 2, ayah: 1 });
  assert.deepEqual(titikAwalBerikutnya(r(113, 1, 114, 6), 'maju'), { surah: 114, ayah: 6 }, 'sudah khatam');
});

test('saran akhir rentang tidak melewati jumlah ayat surat', () => {
  assert.deepEqual(saranAkhir({ surah: 2, ayah: 1 }, 5), { surah: 2, ayah: 5 });
  assert.deepEqual(saranAkhir({ surah: 114, ayah: 4 }, 5), { surah: 114, ayah: 6 });
  assert.deepEqual(saranAkhir({ surah: 108, ayah: 1 }, 1), { surah: 108, ayah: 1 });
});

// ---------------------------------------------------------------- pesan wali
// Fase 6: pesan setoran dibuat SERVER (trigger → notification_queue, diuji di f6-database.test.ts);
// layar tidak lagi menyusun/mengirim pesan setoran sendiri.
test('pesan Telegram wali setoran: dibuat server lewat antrian, bukan dari layar', () => {
  const form = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'components/setoran/FormSetoranRingkas.tsx'), 'utf8');
  assert.doesNotMatch(form, /sendCustomTelegramMessage|buatPesanSetoran|SETORAN_TELEGRAM_NOTIF/);
  assert.match(form, /kirimAntrianSekarang\(\)/);
  // Template lama dengan {ulang} kosong tetap rapi
  assert.equal(renderTemplate('{nama_santri}{ulang} {tidak_dikenal}', { nama_santri: 'Ahmad', ulang: '' }), 'Ahmad {tidak_dikenal}');
});

// ---------------------------------------------------------------- absensi per waktu
const H = (id: number, waktu: string[], extra: any = {}) => ({
  id, nama: `H${id}`, waktu, musammi: { id: 100 + id, nama: `M${id}`, user_id: `u${id}` }, santri: [], is_active: true, ...extra,
}) as any;
const slots = [
  { code: 'Shubuh', name: 'Shubuh', is_active: true },
  { code: 'Dhuha', name: 'Dhuha', is_active: true },
  { code: 'Ashar', name: 'Ashar', is_active: true },
  { code: 'Isya', name: 'Isya', is_active: false },
];

test('BUG-11: pilihan waktu mengikuti jadwal halaqah, urut sesuai pengaturan', () => {
  assert.deepEqual(opsiWaktu([H(1, ['Ashar']), H(2, ['Shubuh', 'Ashar'])], slots), ['Shubuh', 'Ashar']);
  assert.deepEqual(opsiWaktu([H(1, ['Maghrib'])], slots), ['Maghrib'], 'waktu di luar pengaturan tetap muncul');
  assert.deepEqual(opsiWaktu([], slots), []);
  const list = [H(1, ['Ashar']), H(2, ['Shubuh']), H(3, [])];
  assert.deepEqual(halaqahPadaWaktu(list, 'Shubuh').map((h) => h.id), [2, 3]);
});

test('halaqah milik musammi: utama, penugasan, badal; admin melihat semua', () => {
  const list = [
    H(1, ['Shubuh']),
    H(2, ['Shubuh'], { musammi_assignments: [{ is_active: true, valid_to: null, musammi_user_id: 'uX', musammi_id: 999 }] }),
    H(3, ['Shubuh']),
    H(4, ['Shubuh'], { is_archived: true }),
  ];
  assert.deepEqual(halaqahSaya(list, { role: 'admin' }).map((h) => h.id), [1, 2, 3]);
  assert.deepEqual(halaqahSaya(list, { role: 'musammi', userId: 'u1' }).map((h) => h.id), [1]);
  assert.deepEqual(halaqahSaya(list, { role: 'musammi', userId: 'uX' }).map((h) => h.id), [2]);
  assert.deepEqual(halaqahSaya(list, { role: 'musammi', userId: 'uZ', badalHalaqahIds: [3] }).map((h) => h.id), [3]);
  assert.deepEqual(halaqahSaya(list, { role: 'musammi', userId: 'uZ' }), []);
});

test('roster mengikuti riwayat keanggotaan pada tanggal', () => {
  const s = (id: number, nama: string) => ({ id, nama }) as any;
  const h = H(1, ['Shubuh'], {
    santri: [s(1, 'Budi'), s(2, 'Ahmad')],
    history: [
      { santri_id: 1, start_date: '2026-01-01', end_date: null },
      { santri_id: 2, start_date: '2026-06-01', end_date: null },
      { santri_id: 3, start_date: '2026-01-01', end_date: '2026-03-01' },
    ],
  });
  const semua = [s(3, 'Zaid')];
  assert.deepEqual(rosterPadaTanggal(h, '2026-02-01', semua).map((x) => x.nama), ['Budi', 'Zaid']);
  assert.deepEqual(rosterPadaTanggal(h, '2026-07-01', semua).map((x) => x.nama), ['Ahmad', 'Budi']);
});

test('tandai semua hadir & hitung perubahan', () => {
  assert.equal(statusHadir(DEFAULT_STATUSES)?.code, 'hadir');
  assert.equal(statusHadir(DEFAULT_STATUSES.filter((x) => x.code !== 'hadir'))?.code, 'terlambat');
  const r = hitungPerubahan({ a: 'Hadir', b: 'Izin' }, { a: 'Hadir', b: 'Sakit', c: 'Hadir', d: undefined });
  assert.deepEqual(r.berubah.sort(), ['b', 'c']);
  assert.equal(r.mengubahTersimpan, true);
  assert.equal(hitungPerubahan({ a: 'Hadir' }, { a: 'Hadir', c: 'Hadir' }).mengubahTersimpan, false, 'mengisi yang kosong bukan koreksi');
  assert.equal(hariIni('Asia/Jakarta', new Date('2026-11-25T18:00:00Z')), '2026-11-26', 'tanggal lembaga, bukan UTC');
});

// ---------------------------------------------------------------- pemeriksaan kode
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'tests', 'scripts', 'database', 'docs'].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(f)) out.push(p);
  }
  return out;
}

test('kode aplikasi tidak lagi memakai kunci sesi / validasi setoran', () => {
  const files = walk(ROOT);
  assert.ok(files.length > 50);
  const terlarang = [/rpc_lock_halaqah_session/, /rpc_save_attendance_batch/, /['"]submitted['"]\s*\|\|/, /status=submitted/, /Kunci sesi &/];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const pola of terlarang) assert.ok(!pola.test(src), `${f.replace(ROOT, '')} masih memuat ${pola}`);
  }
  assert.ok(!existsSync(join(ROOT, 'pages/Attendance.tsx')), 'layar absensi lama dihapus');
});

test('layar baru terpasang: rute absensi, panel kelancaran, arah hafalan', () => {
  const app = read('App.tsx');
  assert.match(app, /AbsensiPage/);
  assert.doesNotMatch(app, /pages\/Attendance['"]/);
  assert.match(read('components/ReferensiLembagaPanel.tsx'), /fluency_rules/);
  assert.match(read('pages/DataMaster/SantriPage.tsx'), /arah_hafalan/);
  const form = read('components/setoran/FormSetoranRingkas.tsx');
  assert.match(form, /hitungPredikat/);
  assert.match(form, /titikAwalBerikutnya/);
  assert.match(read('hooks/useSupabaseData.tsx'), /rpc_record_attendance/);
});
