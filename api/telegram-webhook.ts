import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_ID_REGEX = /^-?\d{1,20}$/;
const MAX_WEBHOOK_BYTES = 16_384; // 16 KB
const MAX_TIMESTAMP_DRIFT_SECONDS = 300; // 5 menit
const REPLAY_TTL_MS = 10 * 60_000; // 10 menit

// Cache in-memory untuk proteksi replay update_id per tenant
const processedUpdateCache = new Map<string, number>();

export function resetWebhookReplayCacheForTesting() {
  processedUpdateCache.clear();
}

function timingSafeCompare(a: string, b: string): boolean {
  const cleanA = String(a || "");
  const cleanB = String(b || "");
  if (!cleanA || !cleanB) return false;
  const bufA = Buffer.from(cleanA, "utf8");
  const bufB = Buffer.from(cleanB, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isReplayUpdate(orgId: string, updateId: number): boolean {
  const now = Date.now();
  for (const [k, exp] of processedUpdateCache.entries()) {
    if (exp <= now) processedUpdateCache.delete(k);
  }
  const key = `${orgId}:${updateId}`;
  const existing = processedUpdateCache.get(key);
  if (existing && existing > now) {
    return true;
  }
  processedUpdateCache.set(key, now + REPLAY_TTL_MS);
  return false;
}

export async function processTelegramWebhook(options: {
  method?: string;
  headers?: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
  injectedClient?: any;
  injectedFetch?: typeof fetch;
}): Promise<{ status: number; data: any }> {
  if (options.method && options.method !== "POST") {
    return { status: 405, data: { error: "Method Not Allowed" } };
  }

  const secretHeader = String(
    options.headers?.["x-telegram-bot-api-secret-token"] ||
      options.headers?.["X-Telegram-Bot-Api-Secret-Token"] ||
      ""
  ).trim();

  if (!secretHeader || secretHeader.length < 8 || secretHeader.length > 256) {
    return {
      status: 401,
      data: { error: "Unauthorized webhook request: Missing or invalid secret token header." },
    };
  }

  // Batas ukuran payload
  const rawBodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body || {});
  if (Buffer.byteLength(rawBodyStr, "utf8") > MAX_WEBHOOK_BYTES) {
    return {
      status: 413,
      data: { error: "Payload webhook melebihi batas ukuran maksimum (16 KB)." },
    };
  }

  const update = typeof options.body === "string" ? JSON.parse(rawBodyStr || "{}") : options.body || {};

  // Validasi struktur dasar payload Telegram Update
  if (
    typeof update !== "object" ||
    update === null ||
    typeof update.update_id !== "number" ||
    !Number.isInteger(update.update_id) ||
    update.update_id <= 0
  ) {
    return {
      status: 400,
      data: { error: "Payload webhook tidak valid: update_id wajib berupa bilangan bulat positif." },
    };
  }

  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!options.injectedClient && (!supabaseUrl || !serviceRoleKey)) {
    return {
      status: 503,
      data: { error: "Konfigurasi keamanan webhook server (Service Role) belum tersedia." },
    };
  }

  const supabase: any = options.injectedClient
    ? options.injectedClient
    : createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

  const requestedOrgIdRaw = typeof options.query?.org_id === "string" ? options.query.org_id.trim() : "";
  if (requestedOrgIdRaw && !UUID_REGEX.test(requestedOrgIdRaw)) {
    return {
      status: 400,
      data: { error: "Parameter org_id pada webhook tidak berformat UUID valid." },
    };
  }

  let targetOrgId: string | null = requestedOrgIdRaw || null;
  let isSecretVerified = false;

  // Verifikasi secret wajib terikat ke tenant (tidak boleh lintas tenant)
  if (targetOrgId) {
    const { data: secretRow } = await supabase
      .from("integration_secrets")
      .select("organization_id, secret_value, status")
      .eq("organization_id", targetOrgId)
      .eq("secret_key_name", "TELEGRAM_WEBHOOK_SECRET")
      .maybeSingle();

    if (secretRow?.status === "disabled") {
      return {
        status: 403,
        data: { error: "Webhook Telegram untuk lembaga ini sedang dinonaktifkan." },
      };
    }

    if (
      secretRow?.organization_id === targetOrgId &&
      secretRow?.status === "active" &&
      secretRow?.secret_value &&
      timingSafeCompare(String(secretRow.secret_value).trim(), secretHeader)
    ) {
      isSecretVerified = true;
    }
  } else {
    // Jika org_id tidak ada di query, cari tenant yang memiliki secret aktif yang persis cocok
    const { data: secretRows } = await supabase
      .from("integration_secrets")
      .select("organization_id, secret_value, status")
      .eq("secret_key_name", "TELEGRAM_WEBHOOK_SECRET")
      .eq("status", "active");

    if (Array.isArray(secretRows)) {
      const matched = secretRows.find(
        (r: any) => r.secret_value && timingSafeCompare(String(r.secret_value).trim(), secretHeader)
      );
      if (matched?.organization_id) {
        targetOrgId = String(matched.organization_id);
        isSecretVerified = true;
      }
    }
  }

  if (!isSecretVerified || !targetOrgId) {
    return {
      status: 401,
      data: { error: "Unauthorized webhook request: Invalid or mismatched tenant webhook secret." },
    };
  }

  // Validasi status organisasi harus aktif/trial
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("id, status")
    .eq("id", targetOrgId)
    .maybeSingle();

  if (orgRow && orgRow.status && !["active", "trial"].includes(String(orgRow.status).toLowerCase())) {
    return {
      status: 403,
      data: { error: `Operasional webhook ditolak karena status lembaga adalah '${orgRow.status}'.` },
    };
  }

  // Proteksi Replay: periksa umur timestamp message.date (jika ada) & deduplikasi update_id
  if (update.message && typeof update.message.date === "number") {
    const nowSec = Math.floor(Date.now() / 1000);
    const ageSec = Math.abs(nowSec - update.message.date);
    if (ageSec > MAX_TIMESTAMP_DRIFT_SECONDS) {
      return {
        status: 400,
        data: { error: "Webhook ditolak: Timestamp pesan sudah kadaluarsa (proteksi replay)." },
      };
    }
  }

  if (isReplayUpdate(targetOrgId, update.update_id)) {
    return {
      status: 409,
      data: { ok: false, error: "Replay terdeteksi: update_id sudah pernah diproses." },
    };
  }

  try {
    if (update.message && typeof update.message.text === "string") {
      const rawChatId = String(update.message?.chat?.id ?? "").trim();
      const text = update.message.text.trim();

      if (!CHAT_ID_REGEX.test(rawChatId)) {
        return {
          status: 400,
          data: { error: "Format Chat ID Telegram tidak valid." },
        };
      }

      if (text.length > 512) {
        return {
          status: 400,
          data: { error: "Pesan perintah webhook melebihi batas panjang maksimum (512 karakter)." },
        };
      }

      if (text.startsWith("/start")) {
        const parts = text.split(/\s+/);
        let replyText = "";

        if (parts.length > 1 && parts[1].trim().length > 0) {
          // KEBIJAKAN KEAMANAN FASE 3:
          // Karena Portal Wali Santri ditunda, fitur pengaitan Chat ID publik menggunakan identifier bebas
          // (/start <id/kode>) DINONAKTIFKAN agar pihak luar tidak dapat menebak ID santri atau membocorkan nama/kelas.
          try {
            await supabase.from("audit_logs").insert({
              organization_id: targetOrgId,
              actor_role: "system",
              action: "WEBHOOK_PUBLIC_LINK_BLOCKED",
              entity_type: "santri",
              resource_type: "telegram_webhook",
              reason: "Percobaan penautan Chat ID mandiri via argumen /start ditolak (fitur publik dinonaktifkan)",
              after_state: {
                chat_id: rawChatId,
                update_id: update.update_id,
              },
            });
          } catch {
            // ignore audit error
          }

          replyText =
            `🔒 *Penautan Otomatis Dinonaktifkan*\n\n` +
            `Demi keamanan privasi data santri, penautan mandiri melalui kode/tautan publik tidak diaktifkan.\n\n` +
            `Silakan sampaikan *ID Chat Telegram* Anda berikut kepada Admin Lembaga untuk diverifikasi dan ditautkan secara resmi:\n` +
            `ID Chat: \`${rawChatId}\``;
        } else {
          replyText =
            `Assalamu'alaikum! Selamat datang di Bot Resmi Lajnah Al-Qur'an.\n\n` +
            `Untuk menerima notifikasi resmi dari lembaga, silakan berikan *ID Chat Telegram* Anda kepada Admin Lembaga:\n` +
            `ID Chat Anda: \`${rawChatId}\``;
        }

        // Ambil TELEGRAM_BOT_TOKEN secara eksklusif dari tenant yang terverifikasi (targetOrgId)
        const { data: botSecretRow } = await supabase
          .from("integration_secrets")
          .select("secret_value, status")
          .eq("organization_id", targetOrgId)
          .eq("secret_key_name", "TELEGRAM_BOT_TOKEN")
          .maybeSingle();

        if (!botSecretRow || botSecretRow.status !== "active" || !botSecretRow.secret_value) {
          return {
            status: 400,
            data: { error: "Token Bot Telegram untuk lembaga ini belum aktif atau belum dikonfigurasi." },
          };
        }

        const cleanBotToken = String(botSecretRow.secret_value).trim();
        if (!cleanBotToken || cleanBotToken.includes("••") || cleanBotToken.includes("**")) {
          return {
            status: 400,
            data: { error: "Token Bot Telegram pada lembaga ini tidak valid." },
          };
        }

        const fetchFn = options.injectedFetch || fetch;
        const tgResponse = await fetchFn(`https://api.telegram.org/bot${cleanBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: rawChatId,
            text: replyText,
            parse_mode: "Markdown",
          }),
        });

        const tgResult: any = await tgResponse.json().catch(() => ({ ok: false }));
        if (!tgResponse.ok || !tgResult?.ok) {
          return {
            status: 502,
            data: { error: "Gagal meneruskan balasan ke layanan Telegram API." },
          };
        }
      }
    }

    return { status: 200, data: { ok: true } };
  } catch {
    // Jangan pernah mencetak isi error mentah yang berpotensi memuat URL token bot
    return {
      status: 500,
      data: { error: "Terjadi gangguan internal saat memproses pembaruan webhook." },
    };
  }
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    const result = await processTelegramWebhook({
      method: req.method,
      headers: req.headers,
      query: req.query,
      body: req.body,
    });
    return res.status(result.status).json(result.data);
  }

  const headersObj: Record<string, string> = {};
  if (req.headers?.forEach) {
    req.headers.forEach((v: string, k: string) => {
      headersObj[k.toLowerCase()] = v;
    });
  }
  const queryObj: Record<string, string> = {};
  if (req.url) {
    try {
      const u = new URL(req.url, "http://localhost");
      u.searchParams.forEach((v, k) => {
        queryObj[k] = v;
      });
    } catch {
      // ignore
    }
  }
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const result = await processTelegramWebhook({
    method: req.method,
    headers: headersObj,
    query: queryObj,
    body,
  });
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
