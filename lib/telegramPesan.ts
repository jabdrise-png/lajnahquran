/**
 * Fase 6 · Pesan Telegram wali — dipakai server (webhook, pemroses antrian) dan layar (pratinjau).
 * Tidak boleh mengimpor apa pun dari browser/Supabase: modul ini murni.
 *
 *  - renderTemplate  : sama persis dengan public.fn_render_template (diuji).
 *  - TEMPLATE_BAWAAN : sama dengan nilai bawaan kolom telegram_settings (diuji).
 *  - uraiPesanWali   : mengenali perintah wali ke bot (/start KODE, kode saja, /anak, /berhenti).
 *  - balasan*        : teks balasan bot (tanpa format Markdown agar nama dengan _ atau * aman).
 */

export type JenisPesan = 'setoran' | 'mingguan' | 'periode';

/** {variabel} diganti satu kali lintas; variabel tak dikenal dibiarkan; null/undefined → "-". */
export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return String(tpl ?? '').replace(/\{([a-z_]+)\}/g, (asli, k: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, k)) return asli;
    const v = vars[k];
    return v === null || v === undefined ? '-' : String(v);
  });
}

export const TEMPLATE_BAWAAN: Record<JenisPesan, string> = {
  setoran:
    "Assalamu'alaikum. Setoran {jenis} ananda {nama_santri} ({halaqah})\n{tanggal}, {waktu}\nSurat: {surat}\nHalaman: {halaman}\nKhoto kabir/shoghir: {kabir}/{shoghir}\nPredikat: {predikat}{ulang}\nCatatan: {catatan}\n— {lembaga}",
  mingguan:
    "Assalamu'alaikum. Rekap kehadiran ananda {nama_santri} ({halaqah})\n{mulai} s.d. {selesai}\nHadir: {hadir} dari {total} sesi ({kehadiran})\nRincian: {rincian}\n— {lembaga}",
  periode:
    "Assalamu'alaikum. Capaian ananda {nama_santri} ({halaqah}) — {periode}\nZiyadah: {ziyadah} halaman\nMurojaah: {murojaah} halaman\nPosisi hafalan: {posisi}\nTotal hafalan: {total_hafalan} juz\nKelancaran: {kelancaran}\nKehadiran: {kehadiran}\nCatatan: {catatan}\n— {lembaga}",
};

/** Variabel yang tersedia per jenis pesan + contoh nilai (untuk pratinjau di Pengaturan). */
export const VARIABEL: Record<JenisPesan, { nama: string; ket: string; contoh: string }[]> = {
  setoran: [
    { nama: 'nama_santri', ket: 'Nama santri', contoh: 'Ahmad Fauzan' },
    { nama: 'halaqah', ket: 'Nama halaqah', contoh: 'Halaqah Abu Bakar' },
    { nama: 'tanggal', ket: 'Tanggal setoran', contoh: '26 November 2026' },
    { nama: 'waktu', ket: 'Waktu halaqah', contoh: 'Shubuh' },
    { nama: 'jenis', ket: 'Jenis setoran', contoh: 'Ziyadah' },
    { nama: 'surat', ket: 'Surat & ayat', contoh: "An-Naba' 1–10" },
    { nama: 'halaman', ket: 'Jumlah halaman', contoh: '0,5' },
    { nama: 'kabir', ket: 'Khoto kabir', contoh: '0' },
    { nama: 'shoghir', ket: 'Khoto shoghir', contoh: '1' },
    { nama: 'predikat', ket: 'Predikat kelancaran', contoh: 'Mumtaz' },
    { nama: 'ulang', ket: '" (diulang)" bila Rasib', contoh: '' },
    { nama: 'catatan', ket: 'Catatan musammi\'', contoh: '-' },
    { nama: 'lembaga', ket: 'Nama lembaga', contoh: 'Lajnah Al-Qur\'an' },
  ],
  mingguan: [
    { nama: 'nama_santri', ket: 'Nama santri', contoh: 'Ahmad Fauzan' },
    { nama: 'halaqah', ket: 'Nama halaqah', contoh: 'Halaqah Abu Bakar' },
    { nama: 'mulai', ket: 'Awal minggu', contoh: '21 November 2026' },
    { nama: 'selesai', ket: 'Akhir minggu', contoh: '27 November 2026' },
    { nama: 'hadir', ket: 'Jumlah sesi hadir', contoh: '9' },
    { nama: 'total', ket: 'Jumlah sesi tercatat', contoh: '10' },
    { nama: 'kehadiran', ket: 'Persen kehadiran', contoh: '90%' },
    { nama: 'rincian', ket: 'Rincian per status', contoh: 'Hadir 9, Izin 1' },
    { nama: 'lembaga', ket: 'Nama lembaga', contoh: 'Lajnah Al-Qur\'an' },
  ],
  periode: [
    { nama: 'nama_santri', ket: 'Nama santri', contoh: 'Ahmad Fauzan' },
    { nama: 'halaqah', ket: 'Nama halaqah', contoh: 'Halaqah Abu Bakar' },
    { nama: 'periode', ket: 'Nama periode', contoh: 'November 2026' },
    { nama: 'mulai', ket: 'Tanggal mulai periode', contoh: '1 November 2026' },
    { nama: 'selesai', ket: 'Tanggal akhir periode', contoh: '30 November 2026' },
    { nama: 'ziyadah', ket: 'Ziyadah (halaman)', contoh: '12,5' },
    { nama: 'murojaah', ket: 'Murojaah (halaman)', contoh: '40' },
    { nama: 'posisi', ket: 'Posisi hafalan', contoh: "belakang sampai An-Naba' 40" },
    { nama: 'total_hafalan', ket: 'Total hafalan (juz)', contoh: '1,5' },
    { nama: 'kelancaran', ket: 'Kelancaran', contoh: 'Jayyid Jiddan' },
    { nama: 'kehadiran', ket: 'Persen kehadiran', contoh: '92%' },
    { nama: 'catatan', ket: 'Catatan musammi\'', contoh: '-' },
    { nama: 'lembaga', ket: 'Nama lembaga', contoh: 'Lajnah Al-Qur\'an' },
  ],
};

export const contohVariabel = (jenis: JenisPesan) =>
  Object.fromEntries(VARIABEL[jenis].map((v) => [v.nama, v.contoh]));

/** Variabel di template yang tidak dikenal (untuk peringatan di layar). */
export function variabelTakDikenal(tpl: string, jenis: JenisPesan): string[] {
  const dikenal = new Set(VARIABEL[jenis].map((v) => v.nama));
  if (jenis === 'setoran') ['skema', 'jumlah_halaman', 'khoto_kabir', 'khoto_shoghir', 'nilai', 'keterangan'].forEach((k) => dikenal.add(k));
  return [...new Set([...String(tpl).matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !dikenal.has(k)))];
}

// ---------------------------------------------------------------- kode & perintah wali
const ABJAD = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** "abcd-efgh" / "ABCD EFGH" → "ABCDEFGH"; null bila bukan bentuk kode santri. */
export function normalisasiKode(teks: string): string | null {
  const k = String(teks || '').toUpperCase().replace(/[\s\-_.]/g, '');
  if (k.length !== 8) return null;
  for (const c of k) if (!ABJAD.includes(c)) return null;
  return k;
}

/** Tampilan kode untuk dibagikan: ABCD-EFGH */
export const tampilKode = (k?: string | null) => (k && k.length === 8 ? `${k.slice(0, 4)}-${k.slice(4)}` : k || '-');

export type PesanWali =
  | { jenis: 'kode'; kode: string }
  | { jenis: 'kode_salah_bentuk' }
  | { jenis: 'sambutan' }
  | { jenis: 'anak' }
  | { jenis: 'berhenti' }
  | { jenis: 'bantuan' };

export function uraiPesanWali(teks: string): PesanWali {
  const t = String(teks || '').trim();
  const perintah = t.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');
  const sisa = t.slice(t.split(/\s+/)[0].length).trim();
  if (perintah === '/start') {
    if (!sisa) return { jenis: 'sambutan' };
    const k = normalisasiKode(sisa);
    return k ? { jenis: 'kode', kode: k } : { jenis: 'kode_salah_bentuk' };
  }
  if (perintah === '/anak') return { jenis: 'anak' };
  if (perintah === '/berhenti' || perintah === '/stop') return { jenis: 'berhenti' };
  if (perintah === '/bantuan' || perintah === '/help') return { jenis: 'bantuan' };
  const k = normalisasiKode(t);
  if (k) return { jenis: 'kode', kode: k };
  return t.length >= 6 && t.length <= 12 && /^[A-Za-z0-9\s\-]+$/.test(t) && /\d/.test(t) ? { jenis: 'kode_salah_bentuk' } : { jenis: 'bantuan' };
}

const PETUNJUK =
  'Kirim kode santri (8 huruf/angka, contoh ABCD-EFGH) yang diberikan lembaga untuk menerima kabar setoran, kehadiran mingguan, dan capaian ananda.\n\n' +
  'Perintah lain:\n/anak — daftar ananda yang tertaut\n/berhenti — berhenti menerima pesan';

export function balasanSambutan(lembaga?: string | null): string {
  return `Assalamu'alaikum. Ini bot resmi ${lembaga || 'lembaga'} (pesan otomatis, tidak dibaca petugas).\n\n${PETUNJUK}`;
}

export const balasanBantuan = () => PETUNJUK;

export function balasanTautan(h: { ok: boolean; alasan?: string; sisa?: number; sudah?: boolean; nama?: string; halaqah?: string | null; lembaga?: string | null; anak?: string[] }): string {
  if (h.ok) {
    const daftar = (h.anak || []).length > 1 ? `\n\nAnanda yang tertaut di Telegram ini: ${(h.anak || []).join(', ')}.` : '';
    return (h.sudah
      ? `Telegram ini sudah tertaut untuk ananda ${h.nama}${h.halaqah ? ` (${h.halaqah})` : ''}.`
      : `Alhamdulillah, Telegram ini berhasil tertaut untuk ananda ${h.nama}${h.halaqah ? ` (${h.halaqah})` : ''} di ${h.lembaga || 'lembaga'}.\nKabar setoran, kehadiran, dan capaian ananda akan dikirim ke sini.`)
      + daftar + '\n\nPunya anak lain di lembaga ini? Kirim juga kodenya.';
  }
  if (h.alasan === 'terlalu_banyak') return 'Terlalu banyak kode salah. Silakan coba lagi 1 jam lagi, atau hubungi Admin lembaga.';
  return `Kode tidak dikenali. Periksa kembali kode santri dari lembaga (8 huruf/angka, contoh ABCD-EFGH).${typeof h.sisa === 'number' ? ` Sisa percobaan: ${h.sisa}.` : ''}`;
}

export function balasanAnak(anak: string[]): string {
  return anak.length
    ? `Ananda yang tertaut di Telegram ini:\n${anak.map((n) => `• ${n}`).join('\n')}`
    : `Belum ada ananda yang tertaut. ${PETUNJUK}`;
}

export const balasanBerhenti = (n: number) =>
  n > 0
    ? `Telegram ini tidak lagi menerima pesan untuk ${n} ananda. Untuk berlangganan lagi, kirim kode santri.`
    : 'Telegram ini belum tertaut dengan santri mana pun.';

export const balasanKodeSalahBentuk = () => balasanTautan({ ok: false, alasan: 'kode_salah' });

/** Tautan undangan ke bot (t.me) dengan kode langsung. */
export function tautanBot(username: string | null | undefined, kode: string | null | undefined): string | null {
  const u = String(username || '').trim().replace(/^@/, '');
  if (!u || !/^[A-Za-z0-9_]{5,32}$/.test(u) || !kode) return null;
  return `https://t.me/${u}?start=${kode}`;
}

/** Pesan undangan yang dibagikan Admin ke wali (WhatsApp/kertas). */
export function pesanUndangan(o: { nama: string; kode: string; lembaga?: string | null; username?: string | null }): string {
  const link = tautanBot(o.username, o.kode);
  return `Assalamu'alaikum Bapak/Ibu wali ananda ${o.nama}.\n` +
    `Untuk menerima kabar setoran, kehadiran, dan capaian ananda dari ${o.lembaga || 'lembaga'} lewat Telegram:\n` +
    (link ? `1. Buka ${link}\n2. Tekan MULAI (Start).` : `1. Buka bot Telegram lembaga.\n2. Kirim kode: ${tampilKode(o.kode)}`) +
    `\n\nKode ananda: ${tampilKode(o.kode)} (jangan dibagikan ke orang lain).`;
}

/** Kesalahan Telegram yang tidak perlu dicoba lagi (wali memblokir bot, chat tidak ada). */
export function galatPermanen(status: number, deskripsi: string): boolean {
  if (status === 403) return true;
  return status === 400 && /chat not found|user is deactivated|bot was blocked|have no rights|chat_id is empty/i.test(deskripsi || '');
}

/** Galat Telegram/antrian dalam bahasa Indonesia untuk Admin. */
export function terjemahGalat(galat?: string | null): string {
  const g = String(galat || '');
  if (!g) return '';
  if (/bot was blocked/i.test(g)) return 'Wali memblokir bot (minta wali membuka bot dan menekan Mulai/Start lagi)';
  if (/user is deactivated/i.test(g)) return 'Akun Telegram wali sudah tidak aktif';
  if (/chat not found/i.test(g)) return 'Chat wali tidak ditemukan (wali belum pernah memulai bot)';
  if (/too many requests/i.test(g)) return 'Telegram sedang membatasi pengiriman; dicoba lagi otomatis';
  if (/unauthorized|401/i.test(g)) return 'Token bot tidak valid; periksa token di Pengaturan › Integrasi';
  return g;
}
