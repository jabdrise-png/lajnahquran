/**
 * Fase 7b · rapikan UI/UX — menjaga aturan desain (docs/PANDUAN_UI.md) di semua layar aplikasi.
 * Halaman publik (Landing, Editor Website), konsol Superadmin dan dokumen cetak dikecualikan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const KECUALI = /LandingPage|WebsiteEditor|[\\/]Platform[\\/]|RaportDocument|AttendanceBook/;

function layar(dir: string, hasil: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = join(dir, n);
    if (statSync(join(ROOT, p)).isDirectory()) layar(p, hasil);
    else if (n.endsWith('.tsx') && !KECUALI.test(p)) hasil.push(p);
  }
  return hasil;
}
const FILES = [...layar('pages'), ...layar('components'), 'App.tsx'];
const langgar = (re: RegExp, izin: RegExp | null = null) =>
  FILES.flatMap((f) => (read(f).match(re) || []).filter((m) => !izin || !izin.test(m)).map((m) => `${relative(ROOT, join(ROOT, f))}: ${m}`));

test('warna merek: blue-600 = #1557D5 di tailwind.config.js', () => {
  assert.match(read('tailwind.config.js'), /600: '#1557D5'/);
});

test('tanpa warna hex lepas di kelas (kecuali tombol berbagi WhatsApp)', () => {
  assert.deepEqual(langgar(/-\[#[0-9A-Fa-f]{3,8}\]/g, /#(25D366|20bd5a|128C7E)/i), []);
});

test('hanya palet resmi: tanpa indigo/sky/green/rose/gray', () => {
  assert.deepEqual(langgar(/\b(?:bg|text|border|ring|from|to|fill|stroke|divide)-(?:indigo|sky|green|rose|gray)-\d{2,3}\b/g), []);
});

test('skala teks & sudut resmi: tanpa text-[Npx] dan rounded-[..]', () => {
  assert.deepEqual(langgar(/\btext-\[\d+(?:\.\d+)?px\]/g), []);
  assert.deepEqual(langgar(/\brounded(?:-[a-z]+)?-\[[^\]]+\]/g), []);
});

test('bayangan resmi: tanpa shadow-[...] buatan', () => {
  assert.deepEqual(langgar(/(?<![\w-])shadow-\[[^\]]+\]/g), []);
});

test('bahasa: tanpa "Loading..." & istilah teknis di layar', () => {
  assert.deepEqual(langgar(/>\s*Loading(?: data)?\.\.\.\s*</g), []);
  assert.deepEqual(langgar(/>[^<>{}]*\b(?:Enrollment|Snapshot|Immutable|TENANT|SERVER-SIDE|student_enrollments|target_plans|audit_logs)\b[^<>{}]*</g, /\/\/|export /), []);
  assert.deepEqual(langgar(/(?:label|title|placeholder)="[^"]*\b(?:Enrollment|Snapshot|Immutable|Export|Import)\b[^"]*"/g), []);
});

test('komponen dasar tersedia di index.css (btn, field, card, badge, tabs, tabel-kartu)', () => {
  const css = read('index.css');
  for (const k of ['.btn ', '.btn-primary', '.btn-secondary', '.field ', '.card ', '.badge ', '.tabs ', '.tab-aktif', '.tabel-kartu']) assert.ok(css.includes(k), k);
});

test('pola Buku Absensi: semua tabel memakai kelas tabel, filter memakai panel-filter/kontrol', () => {
  const tanpa = FILES.filter((f) => !/BukuAbsensiPage|SaaSPrimitives/.test(f))
    .flatMap((f) => (read(f).match(/<table\b[^>]*>/g) || []).filter((t) => !/className="tabel\b/.test(t)).map((t) => `${f}: ${t}`));
  assert.deepEqual(tanpa, []);
  const css = read('index.css');
  for (const k of ['.panel-filter', '.grid-filter', '.kontrol ', '.kontrol-cari', '.kontrol-label', '.wadah-tabel']) assert.ok(css.includes(k), k);
  for (const f of ['pages/DataMaster/SantriPage.tsx', 'pages/DataMaster/HalaqahPage.tsx', 'pages/DataMaster/MusammiPage.tsx', 'pages/SetoranHarianPage.tsx', 'pages/UjianRaport/UjianBulananPage.tsx', 'pages/Laporan/TrenHistorisPage.tsx'])
    assert.match(read(f), /panel-filter/, f);
  assert.match(read('components/Sidebar.tsx'), /w-\[288px\]/);
});
