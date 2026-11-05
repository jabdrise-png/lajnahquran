import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

const maskSecret = (val: string) => {
  const clean = (val || "").trim();
  if (!clean) return "";
  if (clean.length <= 6) return "••••••••";
  return `${clean.slice(0, 3)}••••••${clean.slice(-3)}`;
};

export async function processIntegrationSecrets(
  method: string,
  authHeader: string | undefined,
  body: any
) {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 500, data: { error: "Konfigurasi Supabase belum diatur." } };
  }

  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { status: 401, data: { error: "Unauthorized" } };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData } = await client.auth.getUser(token);
  if (!userData?.user) {
    return { status: 401, data: { error: "Unauthorized" } };
  }

  const { data: profile } = await client
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  let effectiveRole = (profile?.role || "").toLowerCase();
  let effectiveOrgId = profile?.organization_id || null;

  try {
    const { data: grants } = await client
      .from("access_grants")
      .select("role, organization_id, status")
      .eq("user_id", userData.user.id);

    if (Array.isArray(grants) && grants.length > 0) {
      const activeGrant = grants.find((g: any) => g.status === "active");
      if (!activeGrant) {
        return { status: 403, data: { error: "Akses Anda sedang ditangguhkan atau dicabut." } };
      }
      effectiveRole = (activeGrant.role || effectiveRole).toLowerCase();
      effectiveOrgId = activeGrant.organization_id || effectiveOrgId;
    }
  } catch {
    // Fallback ke profiles jika tabel access_grants belum dimigrasikan
  }

  const targetOrgId = body?.organizationId || effectiveOrgId;
  if (!["admin", "admin_mahad", "super_admin", "superadmin"].includes(effectiveRole) || !targetOrgId) {
    return { status: 403, data: { error: "Hanya Admin Lembaga yang dapat mengelola integrasi." } };
  }

  const orgId = targetOrgId;

  if (method === "GET") {
    const { data: secrets, error: getErr } = await client
      .from("integration_secrets")
      .select("provider, secret_key_name, masked_preview, status, updated_at")
      .eq("organization_id", orgId);

    if (getErr && getErr.code !== "42P01") {
      return { status: 500, data: { error: getErr.message } };
    }

    return { status: 200, data: { secrets: secrets || [] } };
  }

  if (method === "POST") {
    const { telegramBotToken, fonnteApiToken } = body || {};
    const updates: Array<{ provider: string; key: string; val: string }> = [];

    if (typeof telegramBotToken === "string" && telegramBotToken.trim() && !telegramBotToken.includes("••")) {
      updates.push({ provider: "telegram", key: "TELEGRAM_BOT_TOKEN", val: telegramBotToken.trim() });
    }
    if (typeof fonnteApiToken === "string" && fonnteApiToken.trim() && !fonnteApiToken.includes("••")) {
      updates.push({ provider: "whatsapp", key: "FONNTE_API_TOKEN", val: fonnteApiToken.trim() });
    }

    for (const item of updates) {
      const masked = maskSecret(item.val);
      const { error: secretErr } = await client.from("integration_secrets").upsert(
        {
          organization_id: orgId,
          provider: item.provider,
          secret_key_name: item.key,
          secret_value: item.val,
          masked_preview: masked,
          status: "active",
          updated_by: userData.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,provider,secret_key_name" }
      );

      if (secretErr && secretErr.code !== "42P01") {
        return {
          status: 500,
          data: { error: `Gagal menyimpan rahasia integrasi (${item.key}): ${secretErr.message}` },
        };
      }

      // Simpan HANYA nilai ter-masking di app_settings agar secret mentah tidak pernah bocor ke browser
      const { error: settingsErr } = await client.from("app_settings").upsert(
        {
          organization_id: orgId,
          key: item.key,
          value: masked,
        },
        { onConflict: "organization_id,key" }
      );

      if (settingsErr && settingsErr.code !== "42P01") {
        return {
          status: 500,
          data: { error: `Gagal memperbarui status pengaturan (${item.key}): ${settingsErr.message}` },
        };
      }
    }

    try {
      await client.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: userData.user.id,
        actor_role: effectiveRole === "superadmin" || effectiveRole === "super_admin" ? "superadmin" : "admin",
        action: "update_integration_secrets",
        resource_type: "integration_secrets",
        after_state: { updated_keys: updates.map((u) => u.key) },
      });
    } catch {
      // ignore if audit_logs not migrated yet
    }

    return { status: 200, data: { success: true, updated: updates.map((u) => u.key) } };
  }

  return { status: 405, data: { error: "Method Not Allowed" } };
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    const result = await processIntegrationSecrets(req.method, req.headers?.authorization, req.body);
    return res.status(result.status).json(result.data);
  }

  const authHeader = req.headers?.get ? req.headers.get("authorization") : undefined;
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const result = await processIntegrationSecrets(req.method, authHeader || undefined, body);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
