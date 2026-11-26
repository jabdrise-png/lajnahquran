/**
 * Fase 3 · Tabel Kelancaran (predikat otomatis dari jumlah khoto).
 * Aturan sama persis dengan fungsi database public.fn_predikat_kelancaran:
 *   predikat pertama (urut sort_order) yang batas khoto kabir & shoghirnya terpenuhi;
 *   jika tidak ada, baris "ulang" (Rasib) — setoran diulang & tidak menambah hafalan.
 * Server tetap menghitung ulang saat menyimpan; fungsi ini untuk pratinjau di layar.
 */
export interface FluencyRule {
  id?: string;
  organization_id?: string;
  predicate: string;
  sort_order: number;
  max_major: number | null;
  max_minor: number | null;
  is_repeat: boolean;
  is_active: boolean;
}

export const DEFAULT_FLUENCY_RULES: FluencyRule[] = [
  { predicate: 'Mumtaz', sort_order: 1, max_major: 0, max_minor: 1, is_repeat: false, is_active: true },
  { predicate: 'Jayyid Jiddan', sort_order: 2, max_major: 1, max_minor: 3, is_repeat: false, is_active: true },
  { predicate: 'Jayyid', sort_order: 3, max_major: 1, max_minor: 4, is_repeat: false, is_active: true },
  { predicate: 'Maqbul', sort_order: 4, max_major: 2, max_minor: 5, is_repeat: false, is_active: true },
  { predicate: 'Rasib', sort_order: 5, max_major: null, max_minor: null, is_repeat: true, is_active: true },
];

export function hitungPredikat(
  rules: FluencyRule[],
  kabir: number,
  shoghir: number
): { predicate: string; isRepeat: boolean } {
  const k = Math.max(0, Number(kabir) || 0);
  const s = Math.max(0, Number(shoghir) || 0);
  const list = (rules && rules.length ? rules : DEFAULT_FLUENCY_RULES).filter((r) => r.is_active);
  const lulus = list
    .filter((r) => !r.is_repeat && r.max_major !== null && r.max_minor !== null && k <= r.max_major && s <= r.max_minor)
    .sort((a, b) => a.sort_order - b.sort_order || (a.max_major ?? 0) - (b.max_major ?? 0) || (a.max_minor ?? 0) - (b.max_minor ?? 0))[0];
  if (lulus) return { predicate: lulus.predicate, isRepeat: false };
  const ulang = list.filter((r) => r.is_repeat).sort((a, b) => a.sort_order - b.sort_order)[0];
  return { predicate: ulang?.predicate || 'Rasib', isRepeat: true };
}
