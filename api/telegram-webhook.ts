import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

const isMaskedToken = (val?: string | null) => {
  if (!val) return true;
  const clean = String(val).trim();
  return !clean || clean.includes("••") || clean.includes("**");
};

export async function processTelegramWebhook(
  secretHeader: string | undefined,
  update: any
) {
  const expectedSecret = getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret && secretHeader !== expectedSecret) {
    return { status: 401, text: "Unauthorized webhook request" };
  }

  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 200, text: "OK" };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey, {
    auth: { persistSession: false },
  });

  if (update && update.message && update.message.text) {
    const text = String(update.message.text).trim();
    const chatId = String(update.message.chat.id);
    let BOT_TOKEN = getEnv("TELEGRAM_BOT_TOKEN") || getEnv("VITE_TELEGRAM_BOT_TOKEN");

    if (text.startsWith("/konek") || text.startsWith("/sync") || text.startsWith("/start")) {
      const parts = text.split(" ");
      let replyMarkdown = "";

      if (parts.length > 1) {
        const identifier = parts.slice(1).join(" ").trim();
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "rpc_link_telegram_chat_id",
          { p_identifier: identifier, p_chat_id: chatId }
        );

        if (!rpcError && rpcResult && typeof rpcResult === "object") {
          if (rpcResult.bot_token && !isMaskedToken(rpcResult.bot_token)) {
            BOT_TOKEN = rpcResult.bot_token;
          }
          if (rpcResult.matched) {
            const names = Array.isArray(rpcResult.names) ? rpcResult.names.join(", ") : "";
            replyMarkdown = `✅ *Berhasil!*\n\nChat ini telah berhasil dihubungkan dengan data:\n*${names}*\n\nAnda akan menerima notifikasi otomatis dari sistem.`;
          } else {
            replyMarkdown = `❌ *Data Santri tidak ditemukan!*\n\nID, Kode Santri, atau Nomor HP *${identifier}* tidak cocok dengan data kami.\n\nPastikan Anda mendapatkan link pendaftaran yang benar dari Pengurus Madrasah, atau ketik format manual:\n\`/start <ID_ATAU_KODE_SANTRI>\`\nContoh: \`/start 12345\``;
          }
        }
      } else {
        replyMarkdown = `⚠️ *Format Pendaftaran Salah*\n\nUntuk menghubungkan akun Telegram dengan data santri, silakan gunakan link otomatis yang diberikan Pengurus Madrasah, atau ketik manual dengan format:\n\`/start <ID_SANTRI>\`\nContoh: \`/start 12345\``;
      }

      if (!BOT_TOKEN || isMaskedToken(BOT_TOKEN)) {
        try {
          const { data: secretRow } = await supabase
            .from("integration_secrets")
            .select("secret_value")
            .eq("secret_key_name", "TELEGRAM_BOT_TOKEN")
            .limit(1)
            .maybeSingle();
          if (secretRow?.secret_value && !isMaskedToken(secretRow.secret_value)) {
            BOT_TOKEN = secretRow.secret_value;
          }
        } catch {
          // fallback
        }
      }

      if (BOT_TOKEN && !isMaskedToken(BOT_TOKEN) && replyMarkdown) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyMarkdown,
            parse_mode: "Markdown",
          }),
        }).catch(() => {});
      }
    }
  }

  return { status: 200, text: "OK" };
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    const secretHeader = req.headers?.["x-telegram-bot-api-secret-token"] as string | undefined;
    const result = await processTelegramWebhook(secretHeader, req.body);
    return res.status(result.status).send(result.text);
  }

  const secretHeader = req.headers?.get
    ? req.headers.get("x-telegram-bot-api-secret-token")
    : undefined;
  const body = await req.json().catch(() => ({}));
  const result = await processTelegramWebhook(secretHeader || undefined, body);
  return new Response(result.text, { status: result.status });
}
