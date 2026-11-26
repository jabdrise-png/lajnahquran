/**
 * Fase 6 · Netlify Scheduled Function — tiap menit (jadwal di netlify.toml).
 *  1. rpc_proses_jadwal_telegram: antrikan kehadiran mingguan lembaga yang jatuh tempo
 *     (hari & jam di Pengaturan Telegram, zona waktu lembaga).
 *  2. Kirim antrian pesan Telegram semua lembaga (maks. 60 per menit).
 * Butuh environment Netlify: SUPABASE_URL (atau VITE_SUPABASE_URL) dan SUPABASE_SERVICE_ROLE_KEY.
 * Fungsi terjadwal hanya berjalan pada deploy produksi situs (cabang produksi Netlify).
 */
import { createClient } from "@supabase/supabase-js";
import { prosesAntrian } from "../../api/notify/antrian";

export const handler = async () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    console.warn("[telegram-antrian] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diatur; antrian tidak diproses.");
    return { statusCode: 200, body: JSON.stringify({ dilewati: "service role belum diatur" }) };
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const mulai = Date.now();
  const hasil = await prosesAntrian({ client, batas: 30, jalankanJadwal: true });
  // Putaran kedua bila masih ada waktu (fungsi terjadwal dibatasi ±30 detik)
  if (hasil.diambil === 30 && Date.now() - mulai < 12_000) {
    const lagi = await prosesAntrian({ client, batas: 30 });
    hasil.diambil += lagi.diambil;
    hasil.terkirim += lagi.terkirim;
    hasil.dicobaLagi += lagi.dicobaLagi;
    hasil.gagal += lagi.gagal;
  }
  if (hasil.diambil || hasil.galat) console.log("[telegram-antrian]", JSON.stringify(hasil));
  return { statusCode: 200, body: JSON.stringify(hasil) };
};
