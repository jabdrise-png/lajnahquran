/**
 * Fase 3 · Arah hafalan & titik awal setoran berikutnya.
 *  - 'mundur' : belakang -> depan (mulai An-Nas, Juz 30). Di dalam satu surat ayat tetap naik;
 *               setelah surat selesai, lanjut ke surat SEBELUMNYA (An-Nas -> Al-Falaq -> Al-Ikhlas ...).
 *  - 'maju'   : depan -> belakang (mulai Al-Fatihah); setelah surat selesai lanjut ke surat berikutnya.
 */
import { SURAHS_DATA } from './quranPageMap';

export type ArahHafalan = 'maju' | 'mundur';

export interface Posisi {
  surah: number;
  ayah: number;
}

const ayahCount = (surah: number) => SURAHS_DATA[surah - 1]?.totalAyah ?? 0;

/** Titik mulai hafalan pertama bila santri belum punya setoran. */
export function titikAwalPertama(arah: ArahHafalan): Posisi {
  return arah === 'maju' ? { surah: 1, ayah: 1 } : { surah: 114, ayah: 1 };
}

/**
 * Titik awal setoran berikutnya dari setoran terakhir.
 * Setoran tersimpan sebagai rentang naik (surah_start..surah_end); "akhir hafalan" bergantung arah:
 *  - maju   : akhir = (surah_end, ayah_end)
 *  - mundur : satu surat -> akhir = (surah, ayah_end); lintas surat -> surat terkecil yang dihafal
 *             (surah_start) sudah selesai sampai ayah_end? Untuk arah mundur rentang lintas surat
 *             disimpan naik (mis. 112:1 - 114:6), jadi titik terdepan yang dicapai adalah surah_start.
 */
export function titikAwalBerikutnya(
  last: { surah_start_no: number | null; ayah_start: number | null; surah_end_no: number | null; ayah_end: number | null } | null | undefined,
  arah: ArahHafalan
): Posisi {
  if (!last || !last.surah_start_no || !last.surah_end_no) return titikAwalPertama(arah);
  const s1 = last.surah_start_no, a1 = last.ayah_start || 1, s2 = last.surah_end_no, a2 = last.ayah_end || 1;

  if (arah === 'maju') {
    if (a2 < ayahCount(s2)) return { surah: s2, ayah: a2 + 1 };
    return s2 < 114 ? { surah: s2 + 1, ayah: 1 } : { surah: 114, ayah: ayahCount(114) };
  }

  // mundur
  if (s1 === s2) {
    if (a2 < ayahCount(s2)) return { surah: s2, ayah: a2 + 1 };
    return s2 > 1 ? { surah: s2 - 1, ayah: 1 } : { surah: 1, ayah: 1 };
  }
  // Lintas surat (disimpan naik): surat terdepan = s1, dihafal mulai a1
  if (a1 > 1) return { surah: s1, ayah: 1 }; // belum lengkap dari awal: lengkapi awal surat (jarang)
  return s1 > 1 ? { surah: s1 - 1, ayah: 1 } : { surah: 1, ayah: 1 };
}

/** Saran akhir rentang: beberapa ayat ke depan dalam surat yang sama. */
export function saranAkhir(awal: Posisi, jumlahAyat = 5): Posisi {
  return { surah: awal.surah, ayah: Math.min(ayahCount(awal.surah), awal.ayah + Math.max(0, jumlahAyat - 1)) };
}

export const labelArah = (arah?: string | null) =>
  arah === 'maju' ? 'Maju (Al-Fatihah → An-Nas)' : 'Mundur (Juz 30 → Juz 1)';
