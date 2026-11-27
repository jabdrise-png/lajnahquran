/**
 * Fase 8 bagian 2: komponen/hook besar dipecah ke beberapa file bersaudara
 * (X.tsx + X.logika.tsx + X.bagian*.tsx + X.*.tsx). Pemeriksaan kode membaca semuanya sebagai satu modul.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export function bacaModul(root: string, p: string): string {
  const penuh = join(root, p);
  const dir = dirname(penuh);
  const dasar = basename(p).replace(/\.(tsx?|ts)$/, '');
  const saudara = existsSync(dir)
    ? readdirSync(dir).filter((n) => n !== basename(p) && n.startsWith(dasar + '.') && /\.tsx?$/.test(n)).sort()
    : [];
  const isi = [readFileSync(penuh, 'utf8'), ...saudara.map((n) => readFileSync(join(dir, n), 'utf8'))];
  // ikut sertakan modul yang diekspor ulang (export * from './x') di folder yang sama, mis. lib/permissions → lib/rute
  for (const m of isi[0].matchAll(/export \* from '\.\/([\w.-]+)'/g)) {
    for (const ext of ['.ts', '.tsx']) {
      const f = join(dir, m[1] + ext);
      if (existsSync(f) && !saudara.includes(m[1] + ext)) isi.push(readFileSync(f, 'utf8'));
    }
  }
  return isi.join('\n');
}
