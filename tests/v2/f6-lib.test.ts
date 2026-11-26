/**
 * Fase 6 · hitungan laporan mudir (bulanan & semester) dan pemeriksaan layar/kode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rekapLembaga, periodeDalamRentang, ringkasUjian, fmt } from '../../lib/laporanMudir';
import { buatPdfMudir } from '../../lib/laporanMudirPdf';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const P = (id: string, start: string, end: string, extra: any = {}) => ({ id, academic_year_id: 1, name: id, start_date: start, end_date: end, needs_review: false, ...extra });
const R = (period: string, santri: number, halaqah: number, x: any) => ({
  id: `${period}-${santri}`, period_id: period, santri_id: santri, halaqah_id: halaqah, form_id: `f-${period}-${halaqah}`,
  ziyadah_pages: null, murojaah_pages: null, total_pages: null, total_juz: null, kelancaran: null,
  hadir_count: null, kehadiran_total: null, kehadiran_persen: null, posisi_maju_surah: null, posisi_maju_ayah: null,
  posisi_mundur_surah: null, posisi_mundur_ayah: null, sumber: 'harian', overrides: {}, free_answers: {}, notes: null, ...x,
});
const F = (period: string, halaqah: number, status: string) => ({ id: `f-${period}-${halaqah}`, period_id: period, halaqah_id: halaqah, status, recording_mode: 'harian', activity_answers: {} });

const periode = [P('okt', '2026-10-01', '2026-10-31'), P('nov', '2026-11-01', '2026-11-30'), P('lama', '2026-01-01', '2026-01-31', { needs_review: true })];
const recaps = [
  R('okt', 1, 10, { ziyadah_pages: 10, murojaah_pages: 20, total_juz: 1.5, kelancaran: 'Jayyid', hadir_count: 18, kehadiran_total: 20, kehadiran_persen: 90 }),
  R('nov', 1, 11, { ziyadah_pages: 5.5, murojaah_pages: 10, total_juz: 1.8, kelancaran: 'Mumtaz', hadir_count: 9, kehadiran_total: 10, kehadiran_persen: 90 }),
  R('okt', 2, 10, { ziyadah_pages: 4, murojaah_pages: 8, total_juz: 3, kelancaran: 'Maqbul', hadir_count: 10, kehadiran_total: 20, kehadiran_persen: 50 }),
  R('nov', 2, 10, { ziyadah_pages: 0, murojaah_pages: 6, total_juz: null, kelancaran: null, kehadiran_persen: 70 }),
];
const forms = [F('okt', 10, 'submitted'), F('nov', 10, 'draft'), F('nov', 11, 'submitted')];
const halaqah = [{ id: 10, nama: 'Abu Bakar', musammi: { nama: 'Ust. A' } }, { id: 11, nama: 'Umar', musammi: { nama: 'Ust. B' } }];
const santri = [{ id: 1, nama: 'Ahmad', kode: 'S1', kelas: '7A' }, { id: 2, nama: 'Budi', kode: 'S2', kelas: '7B' }];

test('laporan bulanan: satu periode, per halaqah & per santri dari Rekap Periode', () => {
  const r = rekapLembaga({ periode: [periode[1]] as any, recaps: recaps as any, forms: forms as any, halaqah, santri });
  assert.deepEqual([r.ringkas.periode, r.ringkas.santri, r.ringkas.halaqah, r.ringkas.ziyadah_halaman, r.ringkas.form_terkirim, r.ringkas.form_total], [1, 2, 2, 5.5, 1, 2]);
  const umar = r.perHalaqah.find((h) => h.halaqah === 'Umar')!;
  assert.deepEqual([umar.santri, umar.ziyadah, umar.kehadiran, umar.musammi], [1, 5.5, 90, 'Ust. B']);
  // Budi (Nov) tanpa jumlah sesi → persen apa adanya
  assert.equal(r.perSantri.find((s) => s.nama === 'Budi')!.kehadiran, 70);
});

test('laporan semester: periode dalam rentang; jumlah ziyadah; kehadiran Σhadir/Σsesi; total & kelancaran dari periode terakhir', () => {
  const dipakai = periodeDalamRentang(periode as any, '2026-07-01', '2026-12-31');
  assert.deepEqual(dipakai.map((p) => p.id), ['okt', 'nov'], 'periode perlu dicek & di luar semester tidak ikut');
  const r = rekapLembaga({ periode: dipakai, recaps: recaps as any, forms: forms as any, halaqah, santri });
  const ahmad = r.perSantri.find((s) => s.nama === 'Ahmad')!;
  assert.deepEqual([ahmad.ziyadah, ahmad.murojaah, ahmad.kehadiran, ahmad.total_juz, ahmad.kelancaran, ahmad.halaqah, ahmad.jumlah_periode],
    [15.5, 30, 90, 1.8, 'Mumtaz', 'Umar', 2], 'pindah halaqah: ikut halaqah terakhir');
  const budi = r.perSantri.find((s) => s.nama === 'Budi')!;
  assert.deepEqual([budi.kehadiran, budi.total_juz, budi.kelancaran], [50, 3, 'Maqbul'], 'nilai kosong periode terakhir → periode sebelumnya');
  assert.equal(r.ringkas.ziyadah_halaman, 19.5);
  assert.equal(r.ringkas.kehadiran, Math.round((1000 * 37) / 50) / 10, 'Σhadir 37 / Σsesi 50');
  assert.equal(r.ringkas.rata_total_juz, 2.4);
  const u = ringkasUjian([{ lengkap: true, nilai_akhir: 90, semester: { nilai: 95 } }, { lengkap: false, nilai_akhir: null, semester: null }], 1);
  assert.deepEqual(u, { santri: 2, lengkap: 1, terbit: 1, sudah_ujian_semester: 1, rata_nilai_semester: 95, rata_nilai_akhir: 90 });
  assert.equal(fmt(12.5, '%'), '12,5%');
  assert.equal(fmt(null), '-');
});

test('PDF mudir terbentuk (A4 landscape, ringkasan + halaqah + rincian santri)', () => {
  const r = rekapLembaga({ periode: periode.slice(0, 2) as any, recaps: recaps as any, forms: forms as any, halaqah, santri });
  const doc = buatPdfMudir({ lembaga: 'Lajnah Uji', judul: 'Laporan Semester Ganjil', subjudul: 'uji', ...r, ujian: null, catatan: ['catatan'] });
  assert.equal(doc.getNumberOfPages(), 2);
  const bytes = doc.output('arraybuffer');
  assert.ok(bytes.byteLength > 2000);
  assert.equal(new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5)), '%PDF-');
});

test('layar & kode Fase 6 terpasang; WhatsApp Fonnte tidak tampil; pesan setoran tidak dikirim dari layar', () => {
  const perm = read('lib/permissions.ts');
  assert.match(perm, /path: '\/app\/telegram',\s*pageKey: 'NotifikasiTelegram'/);
  assert.match(perm, /path: '\/app\/reports\/mudir',\s*pageKey: 'LaporanMudir'/);
  const app = read('App.tsx');
  assert.match(app, /path="telegram" element={<NotifikasiTelegramPage \/>}/);
  assert.match(app, /path="reports\/mudir" element={<LaporanMudirPage \/>}/);
  const side = read('components/Sidebar.tsx');
  assert.match(side, /page: 'NotifikasiTelegram'/);
  assert.match(side, /page: 'LaporanMudir'/);
  assert.doesNotMatch(read('pages/SettingsPage.tsx'), /WhatsApp \(Fonnte\)|Aktifkan Notifikasi WhatsApp/);
  assert.doesNotMatch(read('pages/Laporan/AnalisisPerKelasPage.tsx'), /sendFonnteMessage|via Fonnte/);
  assert.equal(existsSync(join(ROOT, 'lib/whatsapp.ts')), false);
  assert.equal(existsSync(join(ROOT, 'components/SetoranSettingsModal.tsx')), false);
  // Netlify: webhook & proses antrian dirutekan; fungsi terjadwal tiap menit
  const api = read('netlify/functions/api.ts');
  assert.match(api, /subPath === "\/telegram-webhook"/);
  assert.match(api, /subPath === "\/notify\/proses"/);
  assert.match(read('netlify.toml'), /\[functions\."telegram-antrian"\]\s*\n\s*schedule = "\* \* \* \* \*"/);
  assert.ok(existsSync(join(ROOT, 'netlify/functions/telegram-antrian.ts')));
  // Layar tidak pernah memakai token bot / fungsi server antrian
  const halaman = read('pages/Pengaturan/NotifikasiTelegramPage.tsx');
  assert.doesNotMatch(halaman, /TELEGRAM_BOT_TOKEN|fn_antrian_ambil|fn_tautkan_telegram|integration_secrets/);
});
