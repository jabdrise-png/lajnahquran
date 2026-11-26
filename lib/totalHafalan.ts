/**
 * Fase 4 · Total hafalan dari POSISI hafalan (spesifikasi bagian 6.1).
 *
 * Posisi hafalan disimpan per arah:
 *  - maju   (s, a): hafal Al-Fatihah 1:1 s.d. surat s ayat a.
 *  - mundur (s, a): hafal An-Nas s.d. surat s+1 penuh, ditambah surat s ayat 1 s.d. a
 *                   (metode umum pesantren: surat mundur, ayat di dalam surat tetap maju).
 * Santri boleh punya keduanya (data lama "Hafalan Depan" + "Hafalan Belakang"); ayat yang
 * tumpang tindih dihitung sekali.
 *
 * Bobot halaman sama persis dengan calculateHafalanMundur / calculateHafalanMaju di
 * lib/quranPageMap.ts (baris mushaf 15 baris, termasuk judul & basmalah). Fungsi database
 * public.fn_total_hafalan memakai aturan yang sama (diuji di tests/v2/f4-*.test.ts).
 */
import { SURAHS_DATA, JUZ_DATA, getAyahsByPage, getAyahsBySurah, type QuranAyahCoordinate } from './quranPageMap';

export interface PosisiHafalan {
  surah: number;
  ayah: number;
}

export interface TotalHafalan {
  halaman: number;
  juz: number;
  ayat: number;
}

const jumlahAyat = (s: number) => SURAHS_DATA[s - 1]?.totalAyah ?? 0;

/** Posisi dianggap sah bila surat 1–114; ayat dipotong ke rentang surat. */
export function rapikanPosisi(p: PosisiHafalan | null | undefined): PosisiHafalan | null {
  if (!p) return null;
  const s = Math.floor(Number(p.surah));
  if (!(s >= 1 && s <= 114)) return null;
  const a = Math.min(Math.max(1, Math.floor(Number(p.ayah) || 1)), jumlahAyat(s));
  return { surah: s, ayah: a };
}

function kumpulkanAyat(maju: PosisiHafalan | null, mundur: PosisiHafalan | null): Set<string> {
  const set = new Set<string>();
  const tambahSurat = (s: number, sampai = jumlahAyat(s)) => {
    for (let a = 1; a <= sampai; a++) set.add(`${s}:${a}`);
  };
  if (maju) {
    for (let s = 1; s < maju.surah; s++) tambahSurat(s);
    tambahSurat(maju.surah, maju.ayah);
  }
  if (mundur) {
    for (let s = 114; s > mundur.surah; s--) tambahSurat(s);
    tambahSurat(mundur.surah, mundur.ayah);
  }
  return set;
}

function bobotHalaman(page: number, hafal: QuranAyahCoordinate[], semua: QuranAyahCoordinate[]): number {
  if (hafal.length === 0) return 0;
  if (hafal.length === semua.length) return 1;
  const lines = new Set<number>();
  for (const it of hafal) for (let l = it.startLine; l <= it.endLine; l++) lines.add(l);
  // Baris judul surat & basmalah ikut bila ayat 1 surat yang mulai di halaman ini dihafal
  for (const s of SURAHS_DATA) {
    if (s.startPage !== page) continue;
    if (!hafal.some((it) => it.surah === s.id && it.ayah === 1)) continue;
    const ayat1 = semua.find((it) => it.surah === s.id && it.ayah === 1);
    if (!ayat1 || ayat1.startLine <= 1) continue;
    const sebelum = semua.filter((it) => it.surah !== s.id);
    const maxPrev = sebelum.length ? Math.max(...sebelum.map((it) => it.endLine)) : 0;
    for (let l = maxPrev + 1; l < ayat1.startLine; l++) lines.add(l);
  }
  return Math.min(1, Math.max(0.05, Math.round((lines.size / 15) * 1000) / 1000));
}

/** Total hafalan (halaman & juz desimal) dari posisi maju dan/atau mundur. */
export function hitungTotalHafalan(
  majuInput?: PosisiHafalan | null,
  mundurInput?: PosisiHafalan | null
): TotalHafalan {
  const maju = rapikanPosisi(majuInput);
  const mundur = rapikanPosisi(mundurInput);
  if (!maju && !mundur) return { halaman: 0, juz: 0, ayat: 0 };
  const hafal = kumpulkanAyat(maju, mundur);

  const bobot = new Map<number, number>();
  let total = 0;
  for (let p = 1; p <= 604; p++) {
    const semua = getAyahsByPage(p);
    const hafalDiHalaman = semua.filter((it) => hafal.has(`${it.surah}:${it.ayah}`));
    if (hafalDiHalaman.length === 0) continue;
    const w = bobotHalaman(p, hafalDiHalaman, semua);
    bobot.set(p, w);
    total += w;
  }

  let juz = 0;
  for (const j of JUZ_DATA) {
    let isi = 0;
    for (let p = j.startPage; p <= j.endPage; p++) isi += bobot.get(p) || 0;
    juz += Math.min(1, isi / j.totalPages);
  }
  return { halaman: Math.round(total * 100) / 100, juz: Math.round(juz * 100) / 100, ayat: hafal.size };
}

/**
 * Posisi hafalan setelah sebuah setoran ziyadah (rentang disimpan naik s1:a1 – s2:a2).
 *  - maju   : posisi = akhir rentang.
 *  - mundur : satu surat → (surat, ayat akhir); lintas surat yang dimulai dari ayat 1 → surat
 *             terdepan (s1) selesai = (s1, ayat terakhir s1); selain itu (s2, a2).
 * Sama dengan public.fn_posisi_dari_setoran di database.
 */
export function posisiDariSetoran(
  e: { surah_start_no: number; ayah_start: number; surah_end_no: number; ayah_end: number },
  arah: 'maju' | 'mundur'
): PosisiHafalan {
  const s1 = e.surah_start_no, a1 = e.ayah_start || 1, s2 = e.surah_end_no, a2 = e.ayah_end || 1;
  if (arah === 'maju') return { surah: s2, ayah: a2 };
  if (s1 === s2) return { surah: s2, ayah: a2 };
  return a1 === 1 ? { surah: s1, ayah: jumlahAyat(s1) } : { surah: s2, ayah: a2 };
}

/** Untuk tampilan: "An-Naba : 40" */
export function labelPosisi(p: PosisiHafalan | null | undefined): string {
  const r = rapikanPosisi(p);
  if (!r) return '-';
  return `${SURAHS_DATA[r.surah - 1]?.name || r.surah} : ${r.ayah}`;
}

/** Selisih halaman antara dua total (dipakai saran ziyadah di Mode Rekap). */
export function selisihHalaman(sebelum: TotalHafalan | null, sesudah: TotalHafalan): number {
  return Math.max(0, Math.round((sesudah.halaman - (sebelum?.halaman || 0)) * 100) / 100);
}

/** Daftar ayat surat (untuk pilihan ayat di form). */
export const daftarAyat = (s: number) => getAyahsBySurah(s).map((x) => x.ayah);
