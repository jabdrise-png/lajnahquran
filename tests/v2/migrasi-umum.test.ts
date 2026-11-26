/**
 * Aturan umum folder database/migrations (lihat README di folder itu):
 * nama file, begin/commit, komentar rollback, dan aman dijalankan ulang.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTestDb, migrationFiles } from './helpers/db';

const files = migrationFiles();

test('ada file migrasi dan semuanya mengikuti aturan penamaan', () => {
  assert.ok(files.length > 0);
  const semua = fs.readdirSync('database/migrations').filter((f) => f.endsWith('.sql'));
  assert.deepEqual(semua.sort(), files, 'ada file .sql yang namanya tidak sesuai YYYY_MM_DD_NN_deskripsi.sql');
});

test('setiap migrasi punya komentar tujuan & rollback serta dibungkus begin/commit', () => {
  for (const f of files) {
    const sql = fs.readFileSync(`database/migrations/${f}`, 'utf8');
    assert.match(sql, /Rollback/i, `${f}: tidak ada catatan rollback`);
    assert.match(sql, /^\s*begin;/im, `${f}: tidak ada begin;`);
    assert.match(sql, /^\s*commit;/im, `${f}: tidak ada commit;`);
  }
});

test('setiap migrasi tercatat di tabel riwayat README', () => {
  const readme = fs.readFileSync('database/migrations/README.md', 'utf8');
  for (const f of files) assert.ok(readme.includes(f), `${f} belum dicatat di database/migrations/README.md`);
});

test('semua migrasi aman dijalankan ulang (idempoten)', async () => {
  const db = await buildTestDb();
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(`database/migrations/${f}`, 'utf8'));
    } catch (e: any) {
      assert.fail(`${f} gagal saat dijalankan kedua kali: ${e.message}`);
    }
  }
  await db.close();
});
