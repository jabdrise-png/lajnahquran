/**
 * Fase 1 · BUG-16 — penerjemah pesan error teknis menjadi kalimat ramah.
 * Tidak bergantung pada modul lain (dipakai juga oleh NotificationStore).
 */

type AturanPesan = { cocok: RegExp; pesan: string | ((m: RegExpMatchArray) => string) };

const ATURAN: AturanPesan[] = [
  // Jaringan
  { cocok: /failed to fetch|networkerror|network request failed|load failed/i, pesan: 'Koneksi internet terputus. Periksa jaringan lalu coba lagi.' },
  { cocok: /timeout|timed out|statement_timeout|canceling statement/i, pesan: 'Server terlalu lama merespons. Coba lagi beberapa saat lagi.' },

  // Sesi login
  { cocok: /jwt expired|invalid jwt|refresh token|not authenticated|sesi autentikasi diperlukan/i, pesan: 'Sesi login Anda sudah berakhir. Silakan masuk ulang.' },
  { cocok: /invalid login credentials/i, pesan: 'Email atau kata sandi salah.' },
  { cocok: /email not confirmed/i, pesan: 'Email belum dikonfirmasi. Periksa kotak masuk email Anda.' },

  // Izin
  { cocok: /row-level security|violates row-level|permission denied|42501/i, pesan: 'Anda tidak memiliki izin untuk melakukan tindakan ini.' },

  // Constraint
  { cocok: /duplicate key value|already exists|23505/i, pesan: 'Data yang sama sudah ada. Periksa kembali isian Anda.' },
  { cocok: /violates foreign key constraint|23503/i, pesan: 'Data ini masih terhubung dengan data lain sehingga tidak bisa diubah atau dihapus.' },
  { cocok: /null value in column "([^"]+)"/i, pesan: (m) => `Kolom "${m[1]}" wajib diisi.` },
  { cocok: /violates not-null constraint|23502/i, pesan: 'Ada isian wajib yang masih kosong.' },
  { cocok: /recitation_revisions_action_check/i, pesan: 'Setoran belum bisa disimpan karena pembaruan database belum dijalankan. Hubungi Admin/pengelola sistem.' },
  { cocok: /violates check constraint|23514/i, pesan: 'Isian tidak sesuai aturan yang berlaku. Periksa kembali nilai yang dimasukkan.' },
  { cocok: /invalid input syntax for type (uuid|integer|bigint|numeric|date)/i, pesan: 'Format isian tidak valid. Periksa kembali angka atau tanggal yang dimasukkan.' },

  // Skema / fungsi
  { cocok: /could not find the function|function .* does not exist|PGRST202/i, pesan: 'Fitur ini belum aktif di database. Hubungi pengelola sistem.' },
  { cocok: /relation .* does not exist|could not find the table|PGRST205|42P01/i, pesan: 'Tabel yang dibutuhkan belum tersedia di database. Hubungi pengelola sistem.' },
  { cocok: /column .* does not exist|42703/i, pesan: 'Struktur database belum sesuai versi aplikasi. Hubungi pengelola sistem.' },
];

/** Bersihkan awalan teknis dari pesan RAISE EXCEPTION (mis. "Forbidden: ..."). */
const bersihkanAwalan = (teks: string) =>
  teks.replace(/^(Forbidden|Unauthorized|Akses ditolak|Ditolak)\s*:\s*/i, '').trim();

/** Ambil teks dari bentuk error apa pun (Error, PostgrestError, string, objek). */
export function teksDariError(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as any;
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' | ') || String(err);
}

/** Apakah teks terlihat seperti pesan teknis (bukan kalimat yang ditulis untuk pengguna)? */
function terlihatTeknis(teks: string): boolean {
  return ATURAN.some((a) => a.cocok.test(teks)) || /PGRST\d+|SQLSTATE|\b[0-9A-Z]{5}\b.*constraint/i.test(teks);
}

/** Terjemahkan teks error menjadi kalimat ramah. Pesan yang sudah ramah dikembalikan apa adanya. */
export function ramahkanTeks(teks: string): string {
  if (!teks) return 'Terjadi kesalahan. Coba lagi.';
  for (const aturan of ATURAN) {
    const m = teks.match(aturan.cocok);
    if (m) {
      const pesan = typeof aturan.pesan === 'function' ? aturan.pesan(m) : aturan.pesan;
      // Pertahankan awalan konteks seperti "Gagal menyimpan: ..."
      const awalan = teks.match(/^(Gagal[^:]{0,60}):/i);
      return awalan ? `${awalan[1]}: ${pesan}` : pesan;
    }
  }
  return terlihatTeknis(teks) ? 'Terjadi kesalahan pada server. Coba lagi atau hubungi Admin.' : bersihkanAwalan(teks);
}

/** Pesan ramah dari objek error apa pun. */
export function pesanErrorRamah(err: unknown, konteks?: string): string {
  const e = err as any;
  const teks = e?.message ? String(e.message) : teksDariError(err);
  // Coba juga code/details bila message tidak dikenali
  let pesan = ramahkanTeks(teks);
  if (pesan === bersihkanAwalan(teks) && e && (e.code || e.details)) {
    const alt = ramahkanTeks(teksDariError(err));
    if (alt !== bersihkanAwalan(teksDariError(err))) pesan = alt;
  }
  return konteks ? `${konteks}: ${pesan}` : pesan;
}

/**
 * Validasi alasan di sisi layar, sama dengan fn_alasan_valid() di database.
 * Mengembalikan pesan error, atau null bila valid.
 */
export function cekAlasan(teks: string | null | undefined, minKarakter = 5, minKata = 1): string | null {
  const t = (teks || '').trim();
  if (t.length < minKarakter) return `Alasan wajib diisi minimal ${minKarakter} karakter.`;
  if ((t.match(/\p{L}/gu) || []).length < 3) return 'Alasan harus berupa kalimat yang jelas.';
  if (/^(.)\1*$/u.test(t)) return 'Alasan harus berupa kalimat yang jelas.';
  if (t.split(/\s+/).length < minKata) return `Alasan minimal ${minKata} kata.`;
  return null;
}
