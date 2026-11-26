/**
 * Fase 6 · POST /api/notify/proses — kirim antrian pesan Telegram lembaga pemanggil sekarang juga.
 * Dipanggil aplikasi (Admin/musammi') setelah menyimpan setoran atau mengirim form periode, agar pesan
 * ke wali sampai dalam hitungan detik. Pemroses terjadwal tiap menit tetap menjadi cadangan.
 * Hanya memproses pesan yang SUDAH diantrikan database; pemanggil tidak bisa mengirim isi pesan.
 */
import { resolveServerTenantContext } from "../_tenantContext";
import { prosesAntrian } from "./antrian";

const BATAS_PER_MENIT = 30;
const hitungan = new Map<string, { n: number; reset: number }>();

export function resetProsesAntrianGuardsForTesting() {
  hitungan.clear();
}

export async function processProsesAntrian(
  authHeader: string | undefined,
  body: any,
  injectedClient?: any,
  injectedFetch?: typeof fetch
): Promise<{ status: number; data: any }> {
  const ctx = await resolveServerTenantContext({
    authHeader,
    requestedOrganizationId: body?.organizationId || null,
    requireWrite: false,
    requireOrganization: true,
    requireSupportSessionForSuperadmin: true,
    injectedClient,
  });
  if (!ctx.ok || !ctx.organizationId) {
    return { status: ctx.status, data: { error: ctx.error || "Akses ditolak." } };
  }
  if (!["admin", "musammi", "superadmin"].includes(ctx.effectiveRole)) {
    return { status: 403, data: { error: "Akses ditolak." } };
  }
  if (!ctx.adminClient) {
    return {
      status: 503,
      data: { error: "Pengiriman otomatis belum aktif: SUPABASE_SERVICE_ROLE_KEY belum diatur di Netlify." },
    };
  }
  const now = Date.now();
  const h = hitungan.get(ctx.organizationId);
  if (!h || now >= h.reset) hitungan.set(ctx.organizationId, { n: 1, reset: now + 60_000 });
  else if (h.n >= BATAS_PER_MENIT) return { status: 429, data: { error: "Terlalu sering. Pesan tetap dikirim otomatis dalam 1 menit." } };
  else h.n++;

  const hasil = await prosesAntrian({
    client: ctx.adminClient,
    orgId: ctx.organizationId,
    batas: 15,
    fetchFn: injectedFetch,
  });
  return { status: hasil.galat ? 500 : 200, data: hasil.galat ? { error: "Gagal memproses antrian pesan." } : hasil };
}
