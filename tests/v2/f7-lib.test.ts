/**
 * Fase 7 · HP, performa & PWA — pemeriksaan kode dan pustaka Excel pengganti xlsx.
 */
import { bacaModul } from './helpers/baca';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bacaCsv, barisKeObjek, buatWorkbook, bacaBaris } from '../../lib/excel';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => bacaModul(ROOT, p);

function semuaSumber(dir = ROOT, hasil: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'tests', 'scripts', 'database', 'docs', 'netlify'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) semuaSumber(p, hasil);
    else if (/\.(tsx?|html)$/.test(n)) hasil.push(p);
  }
  return hasil;
}

test('Tailwind lewat build: tanpa CDN, tanpa importmap aistudiocdn', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /importmap|aistudiocdn/);
  assert.match(read('index.css'), /@tailwind base/);
  assert.ok(existsSync(join(ROOT, 'tailwind.config.js')) && existsSync(join(ROOT, 'postcss.config.js')));
});

test('xlsx 0.18.5 sudah diganti (tidak ada di package.json maupun impor kode)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal({ ...pkg.dependencies, ...pkg.devDependencies }.xlsx, undefined);
  for (const f of semuaSumber()) assert.doesNotMatch(readFileSync(f, 'utf8'), /from ['"]xlsx['"]|import\(['"]xlsx['"]\)/, f);
});

test('code-splitting: semua halaman di App.tsx dimuat malas', () => {
  const app = read('App.tsx');
  assert.doesNotMatch(app, /^import \w+ from '\.\/pages\//m, 'tidak ada impor halaman statis');
  assert.ok((app.match(/lazyHalaman\(/g) || []).length >= 30);
  assert.match(app, /<Suspense/);
});

test('data per halaman: absensi & setoran memakai jendela 14 hari, berhalaman 1000 baris, segarkan sebagian (BUG-18)', () => {
  const h = read('hooks/useSupabaseData.tsx');
  assert.match(h, /JENDELA_OPERASIONAL_HARI = 14/);
  assert.match(h, /ambilBertahap/);
  assert.doesNotMatch(h, /\.limit\(50000\)/);
  assert.match(h, /rpc_setoran_terakhir/);
  for (const fn of ['addAttendanceRecords', 'simpanSetoran', 'deleteSetoranHarianRecord', 'updateAttendanceRecord']) {
    const i = h.indexOf(`const ${fn} =`);
    assert.ok(i > 0, fn);
    const badan = h.slice(i, h.indexOf('\n    const ', i + 20));
    assert.match(badan, /segarkanAbsensiSetoran\(\)/, `${fn} tidak memuat ulang seluruh data`);
    assert.doesNotMatch(badan, /await fetchData\(\)/, fn);
  }
  for (const p of ['pages/BukuAbsensiPage.tsx', 'pages/Laporan/TrenHistorisPage.tsx', 'pages/StatistikPerkembangan.tsx', 'pages/Dashboard.tsx'])
    assert.match(read(p), /useRiwayat\(/, p);
  for (const p of ['pages/Operasional/AbsensiPage.tsx', 'pages/Operasional/SesiHalaqahPage.tsx', 'pages/SetoranHarianPage.tsx'])
    assert.match(read(p), /pastikanTanggal\(/, p);
});

test('BUG-19: tanpa websocket realtime berulang; konteks tenant di-cache', () => {
  assert.doesNotMatch(read('components/GlobalPinnedBanner.tsx'), /supabase\.channel|\.subscribe\(/);
  const perm = read('lib/permissions.ts');
  assert.match(perm, /export function bersihkanCacheKonteks|export const bersihkanCacheKonteks/);
  assert.match(perm, /resolveTenantContextLangsung/);
});

test('excel: CSV koma/titik koma & kutip; header jadi huruf kecil', () => {
  assert.deepEqual(bacaCsv('Nama;NIS\n"Ali; bin Umar";12\n'), [['Nama', 'NIS'], ['Ali; bin Umar', 12]]);
  assert.deepEqual(bacaCsv('a,b\n"x ""y""",2'), [['a', 'b'], ['x "y"', 2]]);
  assert.deepEqual(barisKeObjek([[' Nama ', 'NIS'], ['Ali', 12], [null, null]]), [{ nama: 'Ali', nis: 12 }]);
});

test('excel: tulis lalu baca .xlsx (exceljs) bolak-balik', async () => {
  const wb = await buatWorkbook([{ nama: 'Data', data: [{ Nama: 'Ali', Juz: 3 }, { Nama: 'Umar', Juz: 30 }] }]);
  const buf: ArrayBuffer = await wb.xlsx.writeBuffer();
  const file = Object.assign(new Blob([buf]), { name: 'uji.xlsx' });
  const rows = await bacaBaris(file as any);
  assert.deepEqual(rows.slice(0, 3), [['Nama', 'Juz'], ['Ali', 3], ['Umar', 30]]);
});

test('lupa sandi & Google: tautan reset ke /reset-password, aturan sandi baru, tombol Google', async () => {
  const { cekSandiBaru } = await import('../../lib/sandi');
  assert.match(cekSandiBaru('pendek1', 'pendek1')!, /minimal 8/);
  assert.match(cekSandiBaru('Mahad123!', 'Mahad123!')!, /bawaan/);
  assert.match(cekSandiBaru('rahasia-baru-1', 'rahasia-baru-2')!, /tidak sama/);
  assert.equal(cekSandiBaru('rahasia-baru-1', 'rahasia-baru-1'), null);
  const login = read('pages/Login.tsx');
  assert.match(login, /resetPasswordForEmail\(.*\/reset-password/s);
  assert.match(login, /signInWithOAuth\(\{ provider: 'google'/);
  assert.match(read('App.tsx'), /path="\/reset-password"/);
  assert.match(read('pages/ResetSandiPage.tsx'), /auth\.updateUser\(\{ password/);
});

test('PWA: manifest, ikon, service worker tanpa cache data Supabase/API', () => {
  const v = read('vite.config.ts');
  assert.match(v, /VitePWA\(/);
  assert.match(v, /name: 'Lajnah Quran'/);
  assert.match(v, /registerType: 'prompt'/);
  assert.doesNotMatch(v, /supabase\.co/);
  assert.match(v, /navigateFallbackDenylist: \[\/\^\\\/api/);
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) assert.ok(existsSync(join(ROOT, 'public/icons', f)), f);
  assert.match(read('components/PwaKontrol.tsx'), /beforeinstallprompt/);
  assert.match(read('netlify.toml'), /for = "\/sw.js"/);
});
