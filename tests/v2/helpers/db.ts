/**
 * Database uji untuk test v2.
 *
 * Membangun PostgreSQL di memori (PGlite, tanpa server) dari file skema repo:
 *   1. stub Supabase (schema auth, role anon/authenticated/service_role)
 *   2. database/skema_lajnah.sql + file V2 lama (arsip)
 *   3. SEMUA file di database/migrations/ secara berurutan
 *   4. data uji (seed.sql)
 *
 * Dengan begitu setiap migrasi baru otomatis ikut diuji di atas skema yang sama.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const BASE_FILES = [
  'database/skema_lajnah.sql',
  'database/supabase_production_security_fix.sql',
  'database/supabase_saas_v2_migration.sql',
  'database/supabase_v2_1_production_hardening.sql',
];

export const ID = {
  org: '11111111-1111-1111-1111-111111111111',
  superadmin: '00000000-0000-0000-0000-00000000a001',
  admin: '00000000-0000-0000-0000-00000000b001',
  admin2: '00000000-0000-0000-0000-00000000b002',
  musammi: '00000000-0000-0000-0000-00000000c001',
  grantSuper: 'a0000000-0000-0000-0000-00000000a001',
  grantAdmin: 'a0000000-0000-0000-0000-00000000b001',
  grantMusammi: 'a0000000-0000-0000-0000-00000000c001',
  academicYear: 9001,
  marhalah: '33333333-3333-3333-3333-333333333301',
  musammiRow: 9101,
  halaqah: 9201,
  santri1: 9301,
  santri2: 9302,
} as const;

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function migrationFiles(): string[] {
  return fs
    .readdirSync(path.join(ROOT, 'database/migrations'))
    .filter((f) => /^\d{4}_\d{2}_\d{2}_\d{2}_.+\.sql$/.test(f))
    .sort();
}

export interface BuildOptions {
  /** Jalankan SQL ini setelah skema dasar, SEBELUM migrasi (mis. meniru kondisi database produksi). */
  beforeMigrations?: string;
  /** Hanya jalankan migrasi yang namanya lolos filter. */
  migrationFilter?: (file: string) => boolean;
  /** Lewati seed data uji. */
  skipSeed?: boolean;
  /** Tambahkan data tabel lama (seed_legacy.sql) sebelum migrasi, untuk menguji migrasi data Fase 2. */
  legacySeed?: boolean;
}

export async function buildTestDb(opts: BuildOptions = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('create extension if not exists pgcrypto;');
  await db.exec(read('tests/v2/helpers/supabase_stub.sql'));
  for (const f of BASE_FILES) {
    const sql = read(f)
      .split('\n')
      .filter((l) => !/^\s*CREATE EXTENSION/i.test(l))
      .join('\n');
    await db.exec(sql);
  }
  // skema_lajnah.sql (hasil pg_dump) mematikan row_security & mengosongkan search_path untuk sesi.
  await db.exec('reset row_security; reset search_path; reset check_function_bodies; reset client_min_messages;');
  await db.exec(`insert into public.organizations(id, name) values ('${ID.org}', 'Lembaga Uji') on conflict do nothing;`);
  if (!opts.skipSeed) await db.exec(read('tests/v2/helpers/seed.sql'));
  if (opts.legacySeed) await db.exec(read('tests/v2/helpers/seed_legacy.sql'));
  if (opts.beforeMigrations) await db.exec(opts.beforeMigrations);
  for (const f of migrationFiles()) {
    if (opts.migrationFilter && !opts.migrationFilter(f)) continue;
    try {
      await db.exec(read(`database/migrations/${f}`));
    } catch (e: any) {
      throw new Error(`Migrasi ${f} gagal: ${e.message}`);
    }
  }
  return db;
}

/** Jalankan fn sebagai pengguna login (role authenticated, auth.uid() = userId). null = SQL Editor/postgres. */
export async function as<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  if (userId) await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Ambil satu nilai. */
export async function one<T = any>(db: PGlite, sql: string, params: any[] = []): Promise<T> {
  const r = await db.query<any>(sql, params);
  const row = r.rows[0];
  return row ? (Object.values(row)[0] as T) : (undefined as T);
}

/** Pastikan promise gagal dan pesan error cocok pola. Mengembalikan pesannya. */
export async function expectError(p: Promise<unknown>, pattern: RegExp): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (!pattern.test(msg)) throw new Error(`Pesan error tidak sesuai.\n  Harapan: ${pattern}\n  Didapat: ${msg}`);
    return msg;
  }
  throw new Error(`Seharusnya gagal (${pattern}), tetapi berhasil.`);
}
