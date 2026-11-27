/**
 * Fase 3 · logika murni layar Absensi & Sesi Halaqah (diuji di tests/v2/f3-lib.test.ts).
 */
import type { Halaqah, Santri } from '../types';
import type { AttendanceStatusRef, SessionSlotRef } from './v2Adapter';

/** Tanggal hari ini di zona waktu lembaga (bawaan Asia/Jakarta, UTC+7), format YYYY-MM-DD. */
export function hariIni(timeZone = 'Asia/Jakarta', now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

/** Halaqah yang dipegang pengguna: musammi' utama, penugasan aktif (utama/pengganti), atau badal pada tanggal itu. */
export function halaqahSaya(
  list: Halaqah[],
  opts: { role: string; userId?: string | null; myMusammiIds?: number[]; badalHalaqahIds?: number[] }
): Halaqah[] {
  const aktif = list.filter((h) => h.is_active !== false && !h.is_archived);
  if (opts.role !== 'musammi') return aktif;
  const myIds = new Set(opts.myMusammiIds || []);
  const badal = new Set(opts.badalHalaqahIds || []);
  return aktif.filter((h) =>
    (opts.userId && h.musammi?.user_id === opts.userId) ||
    myIds.has(Number(h.musammi?.id)) ||
    (h.musammi_assignments || []).some((a) => a.is_active && !a.valid_to &&
      ((opts.userId && a.musammi_user_id === opts.userId) || myIds.has(Number(a.musammi_id)))) ||
    badal.has(Number(h.id))
  );
}

/** BUG-11: pilihan waktu = waktu aktif lembaga yang dipakai jadwal halaqah (urut sesuai pengaturan). */
export function opsiWaktu(halaqahList: Halaqah[], slots: SessionSlotRef[]): string[] {
  const dipakai = new Set<string>();
  halaqahList.forEach((h) => (h.waktu || []).forEach((w) => dipakai.add(String(w))));
  const urut = slots.filter((s) => s.is_active).map((s) => s.code);
  const hasil = urut.filter((c) => dipakai.has(c));
  // Waktu di jadwal halaqah yang belum ada di pengaturan tetap ditampilkan (di akhir)
  dipakai.forEach((w) => { if (!hasil.includes(w)) hasil.push(w); });
  return hasil;
}

/** Halaqah yang terjadwal pada waktu tertentu. Halaqah tanpa jadwal ikut tampil (agar tetap bisa diabsen). */
export function halaqahPadaWaktu(list: Halaqah[], slot: string): Halaqah[] {
  return list.filter((h) => !h.waktu || h.waktu.length === 0 || h.waktu.map(String).includes(slot));
}

/** Santri anggota halaqah pada tanggal tertentu (riwayat keanggotaan), urut nama. */
export function rosterPadaTanggal(h: Halaqah, date: string, allSantri: Santri[] = []): Santri[] {
  const byId = new Map<number, Santri>();
  [...(h.santri || []), ...allSantri].forEach((s) => byId.set(Number(s.id), s));
  if (h.history && h.history.length > 0) {
    const ids = new Set(
      h.history
        .filter((x) => (!x.start_date || x.start_date <= date) && (!x.end_date || x.end_date >= date))
        .map((x) => Number(x.santri_id))
    );
    const hasil = Array.from(ids).map((id) => byId.get(id) || (h.history || []).find((x) => Number(x.santri_id) === id)?.santri)
      .filter(Boolean) as Santri[];
    if (hasil.length > 0) return hasil.sort((a, b) => a.nama.localeCompare(b.nama));
  }
  return [...(h.santri || [])].sort((a, b) => a.nama.localeCompare(b.nama));
}

/** Status untuk tombol "Tandai semua hadir". */
export function statusHadir(statuses: AttendanceStatusRef[]): AttendanceStatusRef | undefined {
  const aktif = statuses.filter((s) => s.is_active);
  return aktif.find((s) => s.code === 'hadir') || aktif.find((s) => s.counts_as_present);
}

/**
 * Hitung perubahan draf terhadap data tersimpan.
 * existing/draft: key -> nama status. Mengembalikan key yang berubah dan apakah ada yang
 * mengubah catatan tersimpan (bukan sekadar mengisi yang kosong) — untuk aturan koreksi.
 */
export function hitungPerubahan(existing: Record<string, string | undefined>, draft: Record<string, string | undefined>) {
  const berubah: string[] = [];
  let mengubahTersimpan = false;
  Object.entries(draft).forEach(([k, v]) => {
    if (!v) return;
    if (existing[k] !== v) {
      berubah.push(k);
      if (existing[k]) mengubahTersimpan = true;
    }
  });
  return { berubah, mengubahTersimpan };
}
