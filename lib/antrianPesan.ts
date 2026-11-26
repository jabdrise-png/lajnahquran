/**
 * Fase 6 · Memicu pengiriman antrian pesan Telegram lembaga sekarang juga (POST /api/notify/proses).
 * Pesan sendiri dibuat database (setoran, form periode terkirim, kehadiran mingguan); fungsi ini hanya
 * mempercepat. Bila gagal/tidak tersedia, pemroses terjadwal mengirim dalam ±1 menit — jadi diam saja.
 */
import { supabase } from './supabaseClient';
import { SupportSessionStore } from './permissions';

export async function kirimAntrianSekarang(opts: { tunggu?: boolean } = {}): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    const jwt = data?.session?.access_token;
    if (!jwt) return { ok: false, error: 'Belum login.' };
    const req = fetch('/api/notify/proses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ organizationId: SupportSessionStore.getSession()?.organizationId || undefined }),
      keepalive: true,
    });
    if (!opts.tunggu) {
      req.catch(() => undefined);
      return { ok: true };
    }
    const res = await req;
    const isi = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: isi } : { ok: false, error: isi?.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Gagal menghubungi server.' };
  }
}
