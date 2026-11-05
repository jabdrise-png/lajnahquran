import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

const isMaskedToken = (val?: string | null) => {
  if (!val) return true;
  const clean = String(val).trim();
  return !clean || clean.includes("••") || clean.includes("**");
};

export async function processTelegramNotification(
  authHeader: string | undefined,
  body: any
) {
  const { chatId, message, botToken: clientBotToken, parseMode } = body || {};
  if (!chatId || !message) {
    return { status: 400, data: { error: "chatId and message are required" } };
  }

  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  let token = !isMaskedToken(clientBotToken)
    ? String(clientBotToken).trim()
    : getEnv("TELEGRAM_BOT_TOKEN") || getEnv("VITE_TELEGRAM_BOT_TOKEN");

  if (!token && supabaseUrl && supabaseAnonKey) {
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (bearer) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData } = await userClient.auth.getUser(bearer);
      const userId = userData?.user?.id;
      if (userId) {
        const { data: profile } = await userClient
          .from("profiles")
          .select("organization_id")
          .eq("id", userId)
          .maybeSingle();

        const orgId = profile?.organization_id;
        if (orgId) {
          const secretReader = serviceRoleKey
            ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
            : userClient;

          try {
            const { data: secretRow } = await secretReader
              .from("integration_secrets")
              .select("secret_value")
              .eq("organization_id", orgId)
              .eq("secret_key_name", "TELEGRAM_BOT_TOKEN")
              .maybeSingle();
            if (secretRow?.secret_value && !isMaskedToken(secretRow.secret_value)) {
              token = String(secretRow.secret_value).trim();
            }
          } catch {
            // fallback to app_settings if integration_secrets not migrated yet
          }

          if (!token) {
            const { data: setting } = await userClient
              .from("app_settings")
              .select("value")
              .eq("organization_id", orgId)
              .eq("key", "TELEGRAM_BOT_TOKEN")
              .maybeSingle();
            if (setting?.value && !isMaskedToken(setting.value)) {
              token = String(setting.value).trim();
            }
          }
        }
      }
    }
  }

  if (!token || isMaskedToken(token)) {
    return { status: 400, data: { error: "Token Bot Telegram belum dikonfigurasi di server." } };
  }

  const cleanToken = String(token).trim();
  const cleanChatId = String(chatId).trim();

  const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cleanChatId,
      text: message,
      parse_mode: parseMode || "Markdown",
    }),
  });

  const result: any = await response.json();
  if (!result.ok) {
    return { status: 400, data: { error: result.description || "Gagal mengirim pesan Telegram" } };
  }
  return { status: 200, data: { success: true, result } };
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    const result = await processTelegramNotification(req.headers?.authorization, req.body);
    return res.status(result.status).json(result.data);
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  const authHeader = req.headers?.get ? req.headers.get("authorization") : undefined;
  const body = await req.json().catch(() => ({}));
  const result = await processTelegramNotification(authHeader || undefined, body);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
