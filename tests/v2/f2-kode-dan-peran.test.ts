/**
 * Fase 2 · pemeriksaan kode sumber & peran aktif.
 *  - Tidak ada query ke tabel lama di kode aplikasi (checklist F2 no. 1).
 *  - Pengaturan referensi tidak lagi dibaca dari app_settings.
 *  - Satu akun bisa Admin + Musammi', peran aktif dipilih (checklist F2 no. 4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pilihPeranAktif, ActiveRoleStore, labelPeran } from '../../lib/activeRole';

const APP_DIRS = ['pages', 'components', 'hooks', 'lib', 'api', 'netlify', 'App.tsx', 'server.ts'];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(p)) if (f !== 'node_modules') walk(path.join(p, f));
    } else if (/\.(ts|tsx)$/.test(p)) {
      out.push(p);
    }
  };
  APP_DIRS.forEach(walk);
  return out;
}

test('tidak ada query ke tabel lama di kode aplikasi', () => {
  const pattern = /\.from\(\s*['"`](setoran_harian|attendance|halaqah_santri|student_classes)['"`]/;
  const offenders = sourceFiles().filter((f) => pattern.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});

test('tidak ada pemanggilan RPC rekonsiliasi lama', () => {
  const offenders = sourceFiles().filter((f) =>
    /rpc_get_academic_reconciliation_report|rpc_reconcile_academic_v2_data/.test(fs.readFileSync(f, 'utf8'))
  );
  assert.deepEqual(offenders, []);
});

test('jenis setoran & waktu tidak lagi dibaca dari app_settings', () => {
  const offenders = sourceFiles().filter((f) =>
    /key\s*===\s*['"](SETORAN_SKEMA_OPTIONS|SETORAN_WAKTU_SKEMA_MAP)['"]/.test(fs.readFileSync(f, 'utf8'))
  );
  assert.deepEqual(offenders, []);
});

test('pilihPeranAktif: pilihan tersimpan dipakai bila masih aktif, jika tidak Admin lebih dulu', () => {
  assert.equal(pilihPeranAktif(['musammi', 'admin'], null), 'admin');
  assert.equal(pilihPeranAktif(['admin', 'musammi'], 'musammi'), 'musammi');
  assert.equal(pilihPeranAktif(['musammi'], 'admin'), 'musammi', 'peran yang sudah dicabut tidak dipakai');
  assert.equal(pilihPeranAktif([], 'admin'), null);
  assert.equal(labelPeran('musammi'), "Musammi'");
});

test('resolveTenantContext: akun Admin + Musammi\' mendapat dua peran dan memakai peran pilihan', async () => {
  const mem = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).sessionStorage = (globalThis as any).window.sessionStorage;
  (globalThis as any).CustomEvent = class { constructor(public type: string, public init?: any) {} };
  const { resolveTenantContext } = await import('../../lib/permissions');

  const org = 'org-1';
  const grants = [
    { id: 'g1', user_id: 'u1', organization_id: org, role: 'admin', status: 'active', expires_at: null },
    { id: 'g2', user_id: 'u1', organization_id: org, role: 'musammi', status: 'active', expires_at: null },
  ];
  const fake = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }) },
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, order: () => q,
        maybeSingle: async () => ({ data: table === 'profiles' ? { id: 'u1', organization_id: org, full_name: 'Ust. A', role: 'admin', organizations: { name: 'L', logo_url: '' } } : null }),
        then: (res: any) => res({ data: table === 'access_grants' ? grants : [], error: null }),
      };
      return q;
    },
  };

  ActiveRoleStore.set(null);
  const a = await resolveTenantContext(fake);
  assert.equal(a.effectiveRole, 'admin');
  assert.deepEqual([...(a.availableRoles || [])].sort(), ['admin', 'musammi']);

  ActiveRoleStore.set('musammi');
  const b = await resolveTenantContext(fake);
  assert.equal(b.effectiveRole, 'musammi');
  assert.equal(b.isAuthorized, true);

  // Peran musammi dicabut -> kembali ke admin walau pilihan tersimpan musammi
  grants[1].status = 'revoked';
  const c = await resolveTenantContext(fake);
  assert.equal(c.effectiveRole, 'admin');
  assert.deepEqual(c.availableRoles, ['admin']);
  ActiveRoleStore.set(null);
});
