/** Fase 7 · aturan kata sandi baru (atur ulang sandi mandiri). */
export const SANDI_TERLARANG = ['mahad123!'];

/** Aturan sandi baru; kembalikan pesan galat atau null bila sah. */
export function cekSandiBaru(sandi: string, ulang: string): string | null {
  if (sandi.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (SANDI_TERLARANG.includes(sandi.trim().toLowerCase())) return 'Demi keamanan, kata sandi bawaan Mahad123! tidak boleh dipakai.';
  if (sandi !== ulang) return 'Konfirmasi kata sandi tidak sama.';
  return null;
}
