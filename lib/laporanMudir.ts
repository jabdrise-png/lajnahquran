/**
 * Fase 6 · Laporan mudir (bulanan per periode & semester) — hitungan murni dari Rekap Periode.
 * Dipakai layar Laporan Mudir & pembuat PDF (lib/laporanMudirPdf.ts). Diuji di tests/v2/f6-lib.test.ts.
 *
 * Aturan gabungan beberapa periode (semester):
 *  - ziyadah & murojaah dijumlah;
 *  - kehadiran = Σ hadir / Σ sesi (bila jumlah sesi tidak ada: rata-rata persen);
 *  - total hafalan, kelancaran, halaqah = dari periode TERAKHIR yang punya nilai.
 */
import type { PeriodRecap, PeriodForm, EvaluationPeriod } from './rekapAdapter';

export interface BarisSantri {
  santri_id: number; nama: string; nis: string; kelas: string; halaqah_id: number | null; halaqah: string;
  ziyadah: number; murojaah: number; kehadiran: number | null; total_juz: number | null; kelancaran: string | null; jumlah_periode: number;
}
export interface BarisHalaqah {
  halaqah_id: number; halaqah: string; musammi: string; santri: number;
  ziyadah: number; rata_murojaah: number | null; kehadiran: number | null; rata_total_juz: number | null;
  form_terkirim: number; form_total: number;
}
export interface RingkasanLembaga {
  periode: number; halaqah: number; santri: number;
  ziyadah_halaman: number; ziyadah_juz: number; kehadiran: number | null; rata_total_juz: number | null;
  form_terkirim: number; form_total: number;
}

const bulat = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const rata = (xs: number[]) => (xs.length ? bulat(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Gabungan kehadiran: Σhadir/Σtotal; tanpa jumlah sesi → rata-rata persen. */
function kehadiranGabungan(rs: { hadir_count: number | null; kehadiran_total: number | null; kehadiran_persen: number | null }[]): number | null {
  const dgnJumlah = rs.filter((r) => r.kehadiran_total && r.kehadiran_total > 0 && r.hadir_count !== null);
  if (dgnJumlah.length) {
    const h = dgnJumlah.reduce((a, r) => a + Number(r.hadir_count), 0);
    const t = dgnJumlah.reduce((a, r) => a + Number(r.kehadiran_total), 0);
    return bulat((100 * h) / t, 1);
  }
  return rata(rs.map((r) => r.kehadiran_persen).filter((x): x is number => x !== null && x !== undefined));
}

/** Periode yang beririsan dengan rentang tanggal (semester). */
export function periodeDalamRentang(periode: EvaluationPeriod[], mulai: string | null, selesai: string | null): EvaluationPeriod[] {
  return periode
    .filter((p) => !p.needs_review && (!mulai || p.end_date >= mulai) && (!selesai || p.start_date <= selesai))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export function rekapLembaga(input: {
  periode: EvaluationPeriod[];
  recaps: PeriodRecap[];
  forms: PeriodForm[];
  halaqah: { id: number | string; nama: string; musammi?: { nama?: string } | null }[];
  santri: { id: number | string; nama: string; kode?: string | null; kelas?: string | null }[];
}): { ringkas: RingkasanLembaga; perHalaqah: BarisHalaqah[]; perSantri: BarisSantri[] } {
  const ids = new Set(input.periode.map((p) => p.id));
  const urut = new Map(input.periode.map((p) => [p.id, p.end_date]));
  const recaps = input.recaps.filter((r) => ids.has(r.period_id));
  const forms = input.forms.filter((f) => ids.has(f.period_id));
  const namaH = new Map(input.halaqah.map((h) => [Number(h.id), h]));
  const santriMap = new Map(input.santri.map((s) => [Number(s.id), s]));

  // per santri
  const perSantriMap = new Map<number, PeriodRecap[]>();
  for (const r of recaps) perSantriMap.set(r.santri_id, [...(perSantriMap.get(r.santri_id) || []), r]);
  const perSantri: BarisSantri[] = [...perSantriMap.entries()].map(([sid, rs]) => {
    const terurut = [...rs].sort((a, b) => String(urut.get(b.period_id)).localeCompare(String(urut.get(a.period_id))));
    const terakhir = <K extends keyof PeriodRecap>(k: K) => terurut.find((r) => r[k] !== null && r[k] !== undefined && r[k] !== '')?.[k] ?? null;
    const hid = (terakhir('halaqah_id') as number | null);
    const s = santriMap.get(sid);
    return {
      santri_id: sid, nama: s?.nama || `#${sid}`, nis: s?.kode || '', kelas: s?.kelas || '',
      halaqah_id: hid, halaqah: hid ? namaH.get(Number(hid))?.nama || '-' : '-',
      ziyadah: bulat(rs.reduce((a, r) => a + (r.ziyadah_pages || 0), 0)),
      murojaah: bulat(rs.reduce((a, r) => a + (r.murojaah_pages || 0), 0)),
      kehadiran: kehadiranGabungan(rs),
      total_juz: terakhir('total_juz') as number | null,
      kelancaran: terakhir('kelancaran') as string | null,
      jumlah_periode: rs.length,
    };
  }).sort((a, b) => a.halaqah.localeCompare(b.halaqah) || a.nama.localeCompare(b.nama));

  // per halaqah (santri dikelompokkan menurut halaqah terakhirnya)
  const hIds = new Set<number>([...perSantri.map((s) => s.halaqah_id).filter((x): x is number => x !== null), ...forms.map((f) => Number(f.halaqah_id))]);
  const perHalaqah: BarisHalaqah[] = [...hIds].map((hid) => {
    const ss = perSantri.filter((s) => s.halaqah_id === hid);
    const rsH = recaps.filter((r) => perSantri.some((s) => s.santri_id === r.santri_id && s.halaqah_id === hid));
    const fs = forms.filter((f) => Number(f.halaqah_id) === hid);
    const h = namaH.get(hid);
    return {
      halaqah_id: hid, halaqah: h?.nama || `#${hid}`, musammi: h?.musammi?.nama || '-', santri: ss.length,
      ziyadah: bulat(ss.reduce((a, s) => a + s.ziyadah, 0)),
      rata_murojaah: rata(ss.map((s) => s.murojaah)),
      kehadiran: kehadiranGabungan(rsH),
      rata_total_juz: rata(ss.map((s) => s.total_juz).filter((x): x is number => x !== null)),
      form_terkirim: fs.filter((f) => f.status === 'submitted').length, form_total: fs.length,
    };
  }).sort((a, b) => a.halaqah.localeCompare(b.halaqah));

  const zh = bulat(perSantri.reduce((a, s) => a + s.ziyadah, 0));
  return {
    ringkas: {
      periode: input.periode.length, halaqah: perHalaqah.length, santri: perSantri.length,
      ziyadah_halaman: zh, ziyadah_juz: bulat(zh / 20), kehadiran: kehadiranGabungan(recaps),
      rata_total_juz: rata(perSantri.map((s) => s.total_juz).filter((x): x is number => x !== null)),
      form_terkirim: forms.filter((f) => f.status === 'submitted').length, form_total: forms.length,
    },
    perHalaqah, perSantri,
  };
}

/** Ringkasan ujian semester dari komponen raport server (rpc_komponen_raport). */
export function ringkasUjian(komponen: { lengkap: boolean; nilai_akhir: number | null; semester: { nilai: number } | null }[], terbit: number) {
  const nilaiAkhir = komponen.map((k) => k.nilai_akhir).filter((x): x is number => x !== null && x !== undefined).map(Number);
  const nilaiSem = komponen.map((k) => k.semester?.nilai).filter((x): x is number => x !== null && x !== undefined).map(Number);
  return {
    santri: komponen.length, lengkap: komponen.filter((k) => k.lengkap).length, terbit,
    sudah_ujian_semester: nilaiSem.length, rata_nilai_semester: rata(nilaiSem), rata_nilai_akhir: rata(nilaiAkhir),
  };
}

/** 12.5 → "12,5"; null → "-" */
export const fmt = (n: number | null | undefined, satuan = '') =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? '-' : `${String(bulat(Number(n))).replace('.', ',')}${satuan}`;
