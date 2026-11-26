/**
 * Fase 1 · aturan tampilan hak akses (BUG-04/05), arah superadmin (BUG-29),
 * dan monitor health (BUG-26). Checklist FASE_1_UJI no. 4, 6, 7, 8, 9.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bolehKelolaAkses, tujuanSuperadminTanpaSupport, ringkasStatusDb } from '../../lib/aksesPengguna';
import { handler } from '../../netlify/functions/api';

const superA = { id: 's1', role: 'super_admin' };
const adminA = { id: 'a1', role: 'admin' };
const adminB = { id: 'a2', role: 'admin_mahad' };
const musammi = { id: 'm1', role: 'musammi' };
const pending = { id: 'p1', role: 'pending' };

test('tidak ada yang bisa mengelola akses akun sendiri (BUG-05)', () => {
  for (const u of [superA, adminA, musammi]) assert.equal(bolehKelolaAkses(u, u), false);
});

test('Admin tidak bisa mengelola Superadmin atau Admin lain (BUG-04)', () => {
  assert.equal(bolehKelolaAkses(adminA, superA), false);
  assert.equal(bolehKelolaAkses(adminA, { id: 's2', role: 'superadmin' }), false);
  assert.equal(bolehKelolaAkses(adminA, adminB), false);
});

test('Admin tetap bisa mengelola Musammi\' dan akun pending', () => {
  assert.equal(bolehKelolaAkses(adminA, musammi), true);
  assert.equal(bolehKelolaAkses(adminA, pending), true);
});

test('Superadmin mengelola semua akun lain; Musammi\' tidak mengelola siapa pun', () => {
  assert.equal(bolehKelolaAkses(superA, adminA), true);
  assert.equal(bolehKelolaAkses(superA, { id: 's2', role: 'superadmin' }), true);
  assert.equal(bolehKelolaAkses(musammi, pending), false);
  assert.equal(bolehKelolaAkses(null, musammi), false);
});

test('superadmin tanpa Support Access: rute bawaan ke Dashboard Platform (BUG-29)', () => {
  assert.equal(tujuanSuperadminTanpaSupport('/app'), '/platform/dashboard');
  assert.equal(tujuanSuperadminTanpaSupport('/app/'), '/platform/dashboard');
  assert.equal(tujuanSuperadminTanpaSupport('/app/dashboard'), '/platform/dashboard');
  assert.equal(tujuanSuperadminTanpaSupport('/app/students'), '/platform/support-sessions');
});

test('ringkasan DB membaca format respons /api/health (BUG-26)', () => {
  assert.equal(ringkasStatusDb({ database: { status: 'healthy', latencyMs: 12 } }), 'DB: healthy (12 ms)');
  assert.equal(ringkasStatusDb({ services: { database: { status: 'healthy' } } }), 'DB: healthy');
  assert.equal(ringkasStatusDb({}), 'DB: tidak diketahui');
});

test('/api/health melaporkan not_configured bila env Supabase kosong (BUG-26)', async () => {
  const keys = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  keys.forEach((k) => delete process.env[k]);
  try {
    const res = await handler({ httpMethod: 'GET', path: '/api/health', headers: {} }, {});
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.database.status, 'not_configured');
    assert.match(ringkasStatusDb(body), /^DB: not_configured/);
  } finally {
    for (const k of keys) if (saved[k] !== undefined) process.env[k] = saved[k];
  }
});
