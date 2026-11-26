/**
 * Fase 1 · BUG-16 — pesan error yang ramah pengguna.
 *
 * Pakai:
 *   import { tampilkanError, pesanErrorRamah } from '../lib/pesanError';
 *   try { ... } catch (e) { tampilkanError(e, 'Gagal menyimpan setoran'); }
 *
 * NotificationStore juga otomatis melewatkan setiap notifikasi bertipe 'error'
 * melalui `ramahkanTeks`, jadi pesan teknis lama ikut diterjemahkan.
 */
import { NotificationStore } from './NotificationStore';
import { pesanErrorRamah } from './ramahkanError';

export { pesanErrorRamah, ramahkanTeks, teksDariError, cekAlasan } from './ramahkanError';

/** Tampilkan error ke pengguna (toast) dan catat detail teknis di console untuk debugging. */
export function tampilkanError(err: unknown, konteks?: string): string {
  const pesan = pesanErrorRamah(err, konteks);
  // eslint-disable-next-line no-console
  console.error('[Lajnah]', konteks || 'Error', err);
  NotificationStore.addNotification(pesan, 'error');
  return pesan;
}

