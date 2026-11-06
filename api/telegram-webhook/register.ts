import crypto from "crypto";
import { resolveServerTenantContext } from "../_tenantContext";

const isMaskedToken = (val?: string | null) => {
  if (!val) return true;
  const clean = String(val).trim();
  return !clean || clean.includes("••") || clean.includes("**");
};

export async function processTelegramWebhookRegister(
  authHeader: string | undefined,
  body: any,
  injectedClient?: any,
  injectedFetch?: typeof fetch
) {
  const ctx = await resolveServerTenantContext({
    authHeader,
    requestedOrganizationId: body?.organizationId || null,
    requireWrite: true,
    requireOrganization: true,
    requireSupportSessionForSuperadmin: true,
    injectedClient,
  });

  if (!ctx.ok || !ctx.userId || !ctx.userClient || !ctx.organizationId) {
    return {
      status: ctx.status,
      data: { error: ctx.error || "Akses ditolak." },
    };
  }

  const role = ctx.effectiveRole;
  const orgId = ctx.organizationId;
  const userClient = ctx.userClient;

  if (role !== "admin" && role !== "superadmin") {
    return {
      status: 403,
      data: {
        error: "Akses ditolak: Hanya Admin Lembaga dengan konteks organisasi aktif yang dapat mendaftarkan webhook.",
      },
    };
  }

  const { webhookUrl, rotateWebhookSecret } = body || {};
  if (!webhookUrl || typeof webhookUrl !== "string") {
    return { status: 400, data: { error: "webhookUrl wajib diisi." } };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl.trim());
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
      return { status: 400, data: { error: "webhookUrl wajib menggunakan protokol HTTPS." } };
    }
  } catch {
    return { status: 400, data: { error: "Format webhookUrl tidak valid." } };
  }

  const secretClient = ctx.adminClient || userClient;

  let botToken = "";
  let tenantWebhookSecret = "";
  let existingWebhookRotationCount = 0;

  try {
    const { data: secretRows } = await secretClient
      .from("integration_secrets")
      .select("secret_key_name, secret_value, status, rotation_count")
      .eq("organization_id", orgId)
      .in("secret_key_name", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"]);

    for (const row of secretRows || []) {
      if (row.secret_key_name === "TELEGRAM_BOT_TOKEN") {
        if (row.status === "disabled") {
          return {
            status: 403,
            data: { error: "Token Bot Telegram pada lembaga ini sedang dinonaktifkan (disabled)." },
          };
        }
        if (row.status === "active" && !isMaskedToken(row.secret_value)) {
          botToken = String(row.secret_value).trim();
        }
      }
      if (row.secret_key_name === "TELEGRAM_WEBHOOK_SECRET") {
        existingWebhookRotationCount = Number(row.rotation_count || 1);
        if (!rotateWebhookSecret && row.status === "active" && !isMaskedToken(row.secret_value)) {
          tenantWebhookSecret = String(row.secret_value).trim();
        }
      }
    }
  } catch {
    // ignore
  }

  if (!botToken || isMaskedToken(botToken)) {
    return {
      status: 400,
      data: { error: "Token Bot Telegram belum dikonfigurasi di server untuk lembaga ini. Simpan token terlebih dahulu." },
    };
  }

  const nowIso = new Date().toISOString();
  if (!tenantWebhookSecret) {
    tenantWebhookSecret = crypto.randomBytes(24).toString("hex");
    const nextRotation = existingWebhookRotationCount + 1;
    try {
      await secretClient.from("integration_secrets").upsert(
        {
          organization_id: orgId,
          provider: "webhook",
          secret_key_name: "TELEGRAM_WEBHOOK_SECRET",
          secret_value: tenantWebhookSecret,
          masked_preview: `${tenantWebhookSecret.slice(0, 3)}••••••${tenantWebhookSecret.slice(-3)}`,
          status: "active",
          rotation_count: nextRotation,
          last_rotated_at: nowIso,
          disabled_at: null,
          disabled_by: null,
          updated_by: ctx.userId,
          updated_at: nowIso,
        },
        { onConflict: "organization_id,provider,secret_key_name" }
      );
    } catch {
      // ignore if table not accessible
    }
  }

  // Sertakan org_id pada URL webhook agar telegram-webhook bersifat tenant-isolated
  parsedUrl.searchParams.set("org_id", orgId);

  const webhookPayload: Record<string, any> = {
    url: parsedUrl.toString(),
    secret_token: tenantWebhookSecret,
  };

  const fetchFn = injectedFetch || fetch;
  const response = await fetchFn(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });
  const data: any = await response.json().catch(() => ({ ok: false, description: "Invalid response from Telegram API" }));

  try {
    await userClient.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: ctx.userId,
      actor_user_id: ctx.userId,
      actor_role: role === "superadmin" ? "superadmin" : "admin",
      action: "REGISTER_TELEGRAM_WEBHOOK",
      entity_type: "integration_secrets",
      resource_type: "telegram_webhook",
      entity_id: orgId,
      resource_id: orgId,
      reason: "Pendaftaran webhook Telegram tenant",
      after_state: {
        webhook_url: parsedUrl.toString(),
        ok: Boolean(data?.ok),
      },
    });
  } catch {
    // ignore
  }

  if (!response.ok || !data?.ok) {
    return {
      status: 400,
      data: { error: data?.description || "Gagal mendaftarkan webhook ke Telegram API." },
    };
  }

  return { status: 200, data: { ok: true, result: true, description: data.description || "Webhook was set" } };
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
