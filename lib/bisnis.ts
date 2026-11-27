/** Fase 8 · tipe & hitungan kecil untuk paket, langganan, pembayaran, pendaftaran lembaga. */

export interface Paket {
  id: string;
  nama: string;
  batas_santri: number | null;
  harga_bulanan: number;
  harga_tahunan: number;
  keterangan: string;
  aktif: boolean;
  urutan: number;
}

export type StatusLangganan = 'aktif' | 'segera_habis' | 'lewat' | 'belum_bayar';

export interface RingkasanLangganan {
  organization_id: string;
  nama: string;
  status: string;
  plan_id: string | null;
  nama_paket: string | null;
  batas_santri: number | null;
  santri_aktif: number;
  langganan_sampai: string | null;
  status_langganan: StatusLangganan;
  bayar_terakhir: string | null;
  jumlah_terakhir: number | null;
  no_hp: string | null;
  kota: string | null;
  contact_email: string | null;
}

export interface Pendaftaran {
  id: string;
  user_id: string;
  email: string | null;
  nama_pendaftar: string;
  nama_lembaga: string;
  no_hp: string | null;
  kota: string | null;
  perkiraan_santri: number | null;
  organization_id: string | null;
  status: 'menunggu' | 'disetujui' | 'ditolak';
  alasan: string | null;
  created_at: string;
}

export interface Pembayaran {
  id: string;
  organization_id: string;
  plan_id: string | null;
  tanggal_bayar: string;
  jumlah: number;
  periode_mulai: string;
  periode_selesai: string;
  catatan: string;
  status: 'sah' | 'batal';
  alasan_batal: string | null;
}

export interface LanggananSaya {
  plan_id: string;
  nama_paket: string | null;
  batas_santri: number | null;
  harga_bulanan: number;
  harga_tahunan: number;
  santri_aktif: number;
  langganan_sampai: string | null;
  status_langganan: StatusLangganan;
  melebihi_kuota: boolean;
}

export const LABEL_STATUS_LANGGANAN: Record<StatusLangganan, string> = {
  aktif: 'Aktif',
  segera_habis: 'Segera habis',
  lewat: 'Lewat masa',
  belum_bayar: 'Belum ada pembayaran',
};

/** Sama dengan fn_status_langganan di database (≤ 7 hari = segera habis). */
export function statusLangganan(sampai: string | null | undefined, hariIni: string): StatusLangganan {
  if (!sampai) return 'belum_bayar';
  if (sampai < hariIni) return 'lewat';
  const batas = tambahBulan(hariIni, 0, 7);
  return sampai <= batas ? 'segera_habis' : 'aktif';
}

export const rupiah = (n: number | null | undefined) =>
  n === null || n === undefined ? '-' : 'Rp' + Math.round(Number(n)).toLocaleString('id-ID');

export const tanggalId = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Tanggal YYYY-MM-DD + n bulan + h hari (tanpa geser zona waktu). Akhir bulan dipotong ke hari terakhir. */
export function tambahBulan(iso: string, bulan: number, hari = 0): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + bulan, 1));
  const akhir = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, akhir) + hari);
  return target.toISOString().slice(0, 10);
}

export const hariIniJakarta = (now: Date = new Date()) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** "1.500.000" / "Rp 1.500.000" / "1500000" → 1500000; kosong/tidak valid → null. */
export function keAngka(teks: string | number | null | undefined): number | null {
  if (teks === null || teks === undefined) return null;
  const s = String(teks).replace(/[^\d]/g, '');
  return s ? Number(s) : null;
}
