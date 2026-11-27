/**
 * Fase 8 · hitungan langganan di layar (sama dengan database) dan pemeriksaan layar bisnis/privasi.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tambahBulan, statusLangganan, keAngka, rupiah, hariIniJakarta } from '../../lib/bisnis';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('tambahBulan: 12 bulan dikurangi 1 hari, akhir bulan aman, hari berikutnya', () => {
  assert.equal(tambahBulan('2026-12-01', 12, -1), '2027-11-30');
  assert.equal(tambahBulan('2026-01-31', 1), '2026-02-28');
  assert.equal(tambahBulan('2028-01-31', 1), '2028-02-29');
  assert.equal(tambahBulan('2027-11-30', 0, 1), '2027-12-01');
  assert.equal(tambahBulan('2026-12-31', 0, 1), '2027-01-01');
});

test('statusLangganan sama dengan fn_status_langganan (≤ 7 hari = segera habis)', () => {
  const h = '2027-01-10';
  assert.deepEqual([statusLangganan(null, h), statusLangganan('2027-03-01', h), statusLangganan('2027-01-17', h), statusLangganan('2027-01-18', h), statusLangganan('2027-01-09', h)],
    ['belum_bayar', 'aktif', 'segera_habis', 'aktif', 'lewat']);
});

test('keAngka & rupiah', () => {
  assert.equal(keAngka('Rp 1.500.000'), 1500000);
  assert.equal(keAngka(''), null);
  assert.equal(rupiah(1500000), 'Rp1.500.000');
  assert.match(hariIniJakarta(new Date('2026-12-31T18:00:00Z')), /^2027-01-01$/);
});

test('layar: konsol bisnis memakai RPC, privasi publik, daftar butuh persetujuan privasi', () => {
  const b = read('pages/Platform/BisnisPanel.tsx');
  for (const r of ['rpc_setujui_pendaftaran', 'rpc_tolak_pendaftaran', 'rpc_catat_pembayaran', 'rpc_batalkan_pembayaran', 'rpc_simpan_paket', 'rpc_ringkasan_langganan']) assert.ok(b.includes(r), r);
  assert.doesNotMatch(read('pages/Platform/PlatformConsolePage.tsx'), /SAAS_PLANS\.map\(/, 'kartu paket lama (hardcode) sudah diganti');
  assert.match(read('App.tsx'), /path="\/privasi"/);
  const login = read('pages/Login.tsx');
  assert.match(login, /setujuPrivasi/);
  assert.match(login, /href="\/privasi"/);
  assert.match(read('pages/DataMaster/TahunAjaranPage.tsx'), /rpc_buka_kembali_tahun_ajaran/);
  for (const f of ['pages/HalaqahData.tsx', 'pages/Reports.tsx', 'hooks/useMockData.ts', 'components/KelolaTargetModal.tsx', 'components/QuranHafalanInput.tsx'])
    assert.ok(!existsSync(join(ROOT, f)), `${f} sudah dihapus`);
  assert.doesNotMatch(read('types/landingPage.ts'), /quote: 'Rekap absensi sangat mudah/);
});
