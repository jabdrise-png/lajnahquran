/**
 * Fase 6 · Pemroses antrian pesan Telegram (notification_queue).
 *
 * Dipakai oleh:
 *  - netlify/functions/telegram-antrian.ts (terjadwal tiap menit, semua lembaga, juga menjalankan
 *    jadwal kehadiran mingguan lewat rpc_proses_jadwal_telegram);
 *  - POST /api/notify/proses (dipanggil aplikasi setelah menyimpan setoran/form, hanya lembaga pemanggil)
 *    supaya pesan sampai dalam hitungan detik.
 *
 * Wajib memakai klien Supabase SERVICE ROLE (fungsi fn_antrian_* tidak bisa dipanggil pengguna).
 * Token bot tidak pernah dicatat ke log.
 */
import { galatPermanen } from "../../lib/telegramPesan";

export interface HasilProses {
  jadwal?: any;
  diambil: number;
  terkirim: number;
  dicobaLagi: number;
  gagal: number;
  galat?: string;
}

const tokenValid = (v?: string | null) => {
  const t = String(v || "").trim();
  return t.length > 10 && !t.includes("••") && !t.includes("**");
};

export async function prosesAntrian(opts: {
  client: any;
  orgId?: string | null;
  batas?: number;
  jalankanJadwal?: boolean;
  fetchFn?: typeof fetch;
}): Promise<HasilProses> {
  const { client } = opts;
  const fetchFn = opts.fetchFn || fetch;
  const hasil: HasilProses = { diambil: 0, terkirim: 0, dicobaLagi: 0, gagal: 0 };

  if (opts.jalankanJadwal) {
    const { data, error } = await client.rpc("rpc_proses_jadwal_telegram", {});
    hasil.jadwal = error ? { galat: error.message } : data;
  }

  const { data: baris, error } = await client.rpc("fn_antrian_ambil", {
    p_batas: Math.max(1, Math.min(opts.batas ?? 25, 100)),
    p_org: opts.orgId ?? null,
  });
  if (error) {
    hasil.galat = error.message;
    return hasil;
  }
  const antrian: any[] = Array.isArray(baris) ? baris : [];
  hasil.diambil = antrian.length;
  if (!antrian.length) return hasil;

  // Token bot per lembaga (hanya yang aktif)
  const orgIds = [...new Set(antrian.map((b) => String(b.organization_id)))];
  const token = new Map<string, string>();
  const { data: rahasia } = await client
    .from("integration_secrets")
    .select("organization_id, secret_value, status")
    .eq("secret_key_name", "TELEGRAM_BOT_TOKEN")
    .in("organization_id", orgIds);
  for (const r of rahasia || []) {
    if (r?.status === "active" && tokenValid(r.secret_value)) token.set(String(r.organization_id), String(r.secret_value).trim());
  }

  const selesai = async (id: string, ok: boolean, galat?: string, permanen = false) => {
    const { data } = await client.rpc("fn_antrian_selesai", {
      p_id: id, p_ok: ok, p_error: galat ?? null, p_permanen: permanen,
    });
    if (ok) hasil.terkirim++;
    else if (data === "gagal") hasil.gagal++;
    else hasil.dicobaLagi++;
  };

  for (const b of antrian) {
    const t = token.get(String(b.organization_id));
    if (!t) {
      await selesai(b.id, false, "Token Bot Telegram lembaga belum aktif.");
      continue;
    }
    try {
      const res = await fetchFn(`https://api.telegram.org/bot${t}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: b.chat_id, text: b.pesan, disable_web_page_preview: true }),
      });
      const isi: any = await res.json().catch(() => ({}));
      if (res.ok && isi?.ok) {
        await selesai(b.id, true);
      } else {
        const desk = String(isi?.description || `HTTP ${res.status}`).slice(0, 300);
        await selesai(b.id, false, desk, galatPermanen(res.status, desk));
      }
    } catch {
      await selesai(b.id, false, "Gagal menghubungi Telegram.");
    }
  }
  return hasil;
}
