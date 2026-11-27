/**
 * Fase 8c · catatan UI/UX: Dasbor tanpa tombol pintas & legenda teknis, Sesi Halaqah/Absensi berpola
 * KPI -> filter penuh -> konten, status kehadiran berupa dropdown, tab Setoran berupa daftar santri.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saringHalaqah, unik } from '../../components/absensi/FilterSesi';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('Dasbor: tanpa tombol Buku Absensi/Buka Ruang Sesi dan tanpa legenda Kritis/Waspada/Pantau', () => {
  const s = read('pages/Dashboard.tsx');
  for (const teks of ['Buka Ruang Sesi', 'Buku Absensi Lengkap', 'Kritis: ', 'Waspada: ', 'Pantau: ', 'Rekap Absensi Global']) {
    assert.ok(!s.includes(teks), `masih ada "${teks}"`);
  }
  assert.ok(!read('pages/Dashboard.logika.tsx').includes('Peringatan wali'));
});

test('Buku Absensi: tanpa petunjuk "Klik sel status"', () => {
  assert.ok(!/Klik sel status/i.test(read('pages/BukuAbsensiPage.tsx')));
});

test('Sesi Halaqah: KPI di atas filter, filter di atas tab; Setoran memakai daftar santri', () => {
  const s = read('pages/Operasional/SesiHalaqahPage.tsx');
  const kpi = s.indexOf('<StatCard'), filter = s.indexOf('<FilterSesi'), tab = s.indexOf("['absensi', 'Absensi']");
  assert.ok(kpi > 0 && kpi < filter && filter < tab, 'urutan KPI -> filter -> tab');
  assert.ok(s.includes('<DaftarSantriSetoran'));
  assert.ok(!s.includes('<FormSetoranRingkas'), 'form setoran dibuka per santri, bukan panel tetap');
});

test('Absensi Admin memakai filter yang sama dan KPI di atas', () => {
  const s = read('pages/Operasional/AbsensiPage.tsx');
  assert.ok(s.indexOf('<StatCard') < s.indexOf('<FilterSesi'));
  assert.ok(s.includes('semuaHalaqah'));
});

test('Kartu absensi: status berupa dropdown, Tandai semua dari filter, bilah simpan menempel', () => {
  const s = read('components/absensi/AbsensiHalaqahCard.tsx');
  assert.ok(s.includes('pilih-status'));
  assert.ok(!s.includes('StatusChips'));
  assert.ok(!/Tandai semua/.test(s.split('return (')[1] || ''), 'tombol Tandai tidak lagi di kartu');
  assert.ok(s.includes('sinyalTandai'));
  assert.ok(s.includes('bilah-simpan'));
  const css = read('index.css');
  assert.ok(/\.bilah-simpan \{[^}]*-bottom-4[^}]*-bottom-6[^}]*-bottom-8/.test(css), 'mengimbangi padding <main> (p-4/6/8)');
});

test('Filter sesi: baris selalu penuh (2 kolom HP, 4 kolom lebar)', () => {
  const s = read('components/absensi/FilterSesi.tsx');
  assert.ok(s.includes('grid-cols-2 lg:grid-cols-4'));
  // cari (2) + marhalah + jenis + halaqah + tanggal + waktu + tandai = 8 sel; tanpa tandai waktu melebar
  assert.ok(s.includes("p.onTandai ? '' : 'lg:col-span-2'"));
});

test('saringHalaqah & unik', () => {
  const h = (id: number, nama: string, marhalah: string, jenis: string, santri: string[]) =>
    ({ id, nama, marhalah, jenis, musammi: { nama: 'Ust ' + id }, santri: santri.map((n, i) => ({ id: i, nama: n })) } as any);
  const list = [h(1, 'H1', 'Ula', 'Tahfidz', ['Ahmad']), h(2, 'H2', 'Wustha', 'Ujian Semester', ['Budi']), h(3, 'H3', 'Ula', 'Ujian Semester', ['Citra'])];
  assert.deepEqual(saringHalaqah(list, { marhalah: 'Ula', jenis: '' }).map((x) => x.id), [1, 3]);
  assert.deepEqual(saringHalaqah(list, { marhalah: '', jenis: 'Ujian Semester' }).map((x) => x.id), [2, 3]);
  assert.deepEqual(saringHalaqah(list, { marhalah: '', jenis: '', cari: 'budi' }).map((x) => x.id), [2]);
  assert.deepEqual(saringHalaqah(list, { marhalah: '', jenis: '', cari: 'ust 3' }).map((x) => x.id), [3]);
  assert.deepEqual(unik(['Wustha', 'Ula', '', 'Ula', null]), ['Ula', 'Wustha']);
});

test('Analitik: filter tanpa sel kosong dan grafik tanpa ruang bawah ganda', () => {
  assert.ok(read('pages/Laporan/AnalisisPerKelasPage.tsx').includes('grid-filter sm:grid-cols-3 lg:grid-cols-3'));
  assert.ok(read('pages/Laporan/TrenHistorisPage.tsx').includes('grid-filter lg:grid-cols-5'));
  const chart = read('components/Chart.tsx');
  assert.ok(chart.includes('bottom: 4 }} barCategoryGap'), 'margin bawah tidak lagi = tinggi sumbu X');
});
