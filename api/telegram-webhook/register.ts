import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

const isMaskedToken = (val?: string | null) => {
  if (!val) return true;
  const clean = String(val).trim();
  return !clean || clean.includes("••") || clean.includes("**");
};

export async function processTelegramWebhookRegister(
  authHeader: string | undefined,
  body: any
) {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 500, data: { error: "Konfigurasi Supabase belum diatur." } };
  }

  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!bearer) {
    return { status: 401, data: { error: "Unauthorized" } };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData } = await userClient.auth.getUser(bearer);
  if (!userData?.user) {
    return { status: 401, data: { error: "Unauthorized" } };
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = (profile?.role || "").toLowerCase();
  if (!profile || !["admin", "admin_mahad", "super_admin", "superadmin"].includes(role)) {
    return {
      status: 403,
      data: { error: "Akses ditolak: Hanya Admin Lembaga yang dapat mendaftarkan webhook." },
    };
  }

  const { webhookUrl, botToken: explicitToken } = body || {};
  if (!webhookUrl) {
    return { status: 400, data: { error: "webhookUrl is required" } };
  }

  let BOT_TOKEN = !isMaskedToken(explicitToken)
    ? String(explicitToken).trim()
    : getEnv("TELEGRAM_BOT_TOKEN") || getEnv("VITE_TELEGRAM_BOT_TOKEN");

  if (!BOT_TOKEN && profile.organization_id) {
    const secretReader = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      : userClient;

    try {
      const { data: secretRow } = await secretReader
        .from("integration_secrets")
        .select("secret_value")
        .eq("organization_id", profile.organization_id)
        .eq("secret_key_name", "TELEGRAM_BOT_TOKEN")
        .maybeSingle();
      if (secretRow?.secret_value && !isMaskedToken(secretRow.secret_value)) {
        BOT_TOKEN = String(secretRow.secret_value).trim();
      }
    } catch {
      // fallback
    }

    if (!BOT_TOKEN) {
      const { data: settings } = await userClient
        .from("app_settings")
        .select("value")
        .eq("organization_id", profile.organization_id)
        .eq("key", "TELEGRAM_BOT_TOKEN")
        .maybeSingle();
      if (settings?.value && !isMaskedToken(settings.value)) {
        BOT_TOKEN = String(settings.value).trim();
      }
    }
  }

  if (!BOT_TOKEN || isMaskedToken(BOT_TOKEN)) {
    return { status: 400, data: { error: "Token Bot Telegram belum dikonfigurasi di server." } };
  }

  const webhookPayload: Record<string, any> = { url: webhookUrl };
  const webhookSecret = getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret) {
    webhookPayload.secret_token = webhookSecret;
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });
  const data = await response.json();
  return { status: 200, data };
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    const result = await processTelegramWebhookRegister(req.headers?.authorization, req.body);
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
  const result = await processTelegramWebhookRegister(authHeader || undefined, body);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
