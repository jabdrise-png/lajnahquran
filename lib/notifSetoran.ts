/**
 * Fase 3 · pesan Telegram ke wali setiap setoran disimpan (spesifikasi bagian 5).
 * Template diatur di Pengaturan Setoran (SETORAN_TELEGRAM_NOTIF_TEMPLATE).
 */
export const TEMPLATE_BAWAAN =
  'Ananda {nama_santri} ({halaqah}) setoran {skema} pada {tanggal} {waktu}.\nSurat: {surat} ayat {ayat}\nHalaman: {jumlah_halaman}\nKhoto kabir/shoghir: {khoto_kabir}/{khoto_shoghir}\nPredikat: {nilai}{ulang}\nCatatan: {keterangan}';

export interface DataPesanSetoran {
  nama_santri: string;
  halaqah: string;
  tanggal: string;
  waktu: string;
  skema: string;
  surat: string;
  ayat: string;
  jumlah_halaman: number | string;
  khoto_kabir: number | string;
  khoto_shoghir: number | string;
  nilai: string;
  ulang: boolean;
  keterangan?: string | null;
}

export function buatPesanSetoran(template: string | null | undefined, d: DataPesanSetoran): string {
  const t = template && template.trim() ? template : TEMPLATE_BAWAAN;
  const map: Record<string, string> = {
    nama_santri: d.nama_santri,
    halaqah: d.halaqah,
    tanggal: d.tanggal,
    waktu: d.waktu,
    skema: d.skema,
    surat: d.surat,
    ayat: d.ayat,
    jumlah_halaman: String(d.jumlah_halaman),
    khoto_kabir: String(d.khoto_kabir),
    khoto_shoghir: String(d.khoto_shoghir),
    nilai: d.nilai,
    ulang: d.ulang ? ' (diulang)' : '',
    keterangan: d.keterangan && d.keterangan.trim() ? d.keterangan : '-',
  };
  return t.replace(/\{([a-z_]+)\}/g, (all, key) => (key in map ? map[key] : all));
}
