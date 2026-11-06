import { resolveServerTenantContext } from "./_tenantContext";

export const maskSecretValue = (val: string): string => {
  const clean = String(val || "").trim();
  if (!clean) return "";
  if (clean.includes("••") || clean.includes("**")) return clean;
  if (clean.length <= 6) return "••••••••";
  return `${clean.slice(0, 3)}••••••${clean.slice(-3)}`;
};

export interface IntegrationSecretMetadata {
  provider: string;
  secret_key_name: string;
  masked_preview: string;
  status: "active" | "disabled";
  rotation_count: number;
  last_rotated_at: string | null;
  disabled_at: string | null;
  updated_by?: string | null;
  updated_at: string | null;
}

const ALLOWED_SECRET_KEYS: Record<string, { provider: "telegram" | "whatsapp" | "webhook"; key: string }> = {
  TELEGRAM_BOT_TOKEN: { provider: "telegram", key: "TELEGRAM_BOT_TOKEN" },
  FONNTE_API_TOKEN: { provider: "whatsapp", key: "FONNTE_API_TOKEN" },
  TELEGRAM_WEBHOOK_SECRET: { provider: "webhook", key: "TELEGRAM_WEBHOOK_SECRET" },
};

export async function processIntegrationSecrets(
  method: string,
  authHeader: string | undefined,
  body: any,
  injectedClient?: any
) {
  const isWriteMethod = method === "POST" || method === "PATCH" || method === "DELETE";
  const requestedOrgId = body?.organizationId || null;

  const ctx = await resolveServerTenantContext({
    authHeader,
    requestedOrganizationId: requestedOrgId,
    requireWrite: isWriteMethod,
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

  if (ctx.effectiveRole !== "superadmin" && ctx.effectiveRole !== "admin") {
    return {
      status: 403,
      data: { error: "Akses ditolak: Hanya Admin Lembaga yang dapat mengelola integrasi." },
    };
  }

  const orgId = ctx.organizationId;
  const client = ctx.userClient;
  const secretClient = ctx.adminClient || client;
  const actorRole = ctx.effectiveRole === "superadmin" ? "superadmin" : "admin";

  // =========================================================================
  // GET: Hanya mengembalikan metadata secret (TIDAK PERNAH mengembalikan secret_value)
  // =========================================================================
  if (method === "GET") {
    const { data: rawRows, error: getErr } = await secretClient
      .from("integration_secrets")
      .select(
        "provider, secret_key_name, masked_preview, status, rotation_count, last_rotated_at, disabled_at, updated_by, updated_at"
      )
      .eq("organization_id", orgId);

    if (getErr && getErr.code !== "42P01" && getErr.code !== "42501") {
      return { status: 500, data: { error: "Gagal mengambil metadata integrasi lembaga." } };
    }

    const sanitizedMetadata: IntegrationSecretMetadata[] = (Array.isArray(rawRows) ? rawRows : []).map(
      (row: any) => ({
        provider: String(row.provider || ""),
        secret_key_name: String(row.secret_key_name || ""),
        masked_preview: maskSecretValue(row.masked_preview || "••••••••"),
        status: row.status === "disabled" ? "disabled" : "active",
        rotation_count: Number(row.rotation_count || 1),
        last_rotated_at: row.last_rotated_at || row.updated_at || null,
        disabled_at: row.disabled_at || null,
        updated_by: row.updated_by || null,
        updated_at: row.updated_at || null,
      })
    );

    return { status: 200, data: { secrets: sanitizedMetadata } };
  }

  // =========================================================================
  // POST / PATCH: Mengelola status token (active/disabled) atau menyimpan/merotasi secret
  // =========================================================================
  if (method === "POST" || method === "PATCH") {
    const action = body?.action || "upsert";

    // 1. Aksi mengubah status token (Aktifkan / Nonaktifkan tanpa menghapus histori rotasi)
    if (action === "set_status") {
      const rawKey = String(body?.secretKeyName || "").trim().toUpperCase();
      const targetStatus = body?.status === "disabled" ? "disabled" : body?.status === "active" ? "active" : null;
      const reason = String(body?.reason || "").trim() || (targetStatus === "disabled" ? "Penonaktifan token integrasi oleh Admin" : "Pengaktifan kembali token integrasi oleh Admin");

      if (!ALLOWED_SECRET_KEYS[rawKey] || !targetStatus) {
        return {
          status: 400,
          data: { error: "secretKeyName (TELEGRAM_BOT_TOKEN / FONNTE_API_TOKEN / TELEGRAM_WEBHOOK_SECRET) dan status ('active' | 'disabled') wajib valid." },
        };
      }

      const { data: existingRow } = await secretClient
        .from("integration_secrets")
        .select("id, provider, secret_key_name, masked_preview, status, rotation_count")
        .eq("organization_id", orgId)
        .eq("secret_key_name", rawKey)
        .maybeSingle();

      if (!existingRow) {
        return {
          status: 404,
          data: { error: `Token ${rawKey} belum dikonfigurasi pada lembaga ini.` },
        };
      }

      const nowIso = new Date().toISOString();
      const updatePayload: Record<string, any> = {
        status: targetStatus,
        disabled_at: targetStatus === "disabled" ? nowIso : null,
        disabled_by: targetStatus === "disabled" ? ctx.userId : null,
        updated_by: ctx.userId,
        updated_at: nowIso,
      };

      const { error: updErr } = await secretClient
        .from("integration_secrets")
        .update(updatePayload)
        .eq("organization_id", orgId)
        .eq("secret_key_name", rawKey);

      if (updErr) {
        return {
          status: 500,
          data: { error: "Gagal memperbarui status token integrasi." },
        };
      }

      try {
        await client.from("audit_logs").insert({
          organization_id: orgId,
          actor_id: ctx.userId,
          actor_user_id: ctx.userId,
          actor_role: actorRole,
          action: targetStatus === "disabled" ? "DISABLE_INTEGRATION_SECRET" : "ENABLE_INTEGRATION_SECRET",
          entity_type: "integration_secrets",
          resource_type: "integration_secrets",
          entity_id: existingRow.id,
          resource_id: existingRow.id,
          reason,
          before_state: {
            secret_key_name: rawKey,
            status: existingRow.status,
            rotation_count: existingRow.rotation_count || 1,
          },
          after_state: {
            secret_key_name: rawKey,
            status: targetStatus,
            rotation_count: existingRow.rotation_count || 1,
            disabled_at: updatePayload.disabled_at,
          },
        });
      } catch {
        // ignore if audit_logs not migrated
      }

      return {
        status: 200,
        data: {
          success: true,
          secret_key_name: rawKey,
          status: targetStatus,
          disabled_at: updatePayload.disabled_at,
        },
      };
    }

    // 2. Aksi menyimpan / merotasi secret baru
    const { telegramBotToken, fonnteApiToken, telegramWebhookSecret, reason } = body || {};
    const updates: Array<{ provider: "telegram" | "whatsapp" | "webhook"; key: string; val: string }> = [];

    const candidates: Array<{ input: any; provider: "telegram" | "whatsapp" | "webhook"; key: string }> = [
      { input: telegramBotToken, provider: "telegram", key: "TELEGRAM_BOT_TOKEN" },
      { input: fonnteApiToken, provider: "whatsapp", key: "FONNTE_API_TOKEN" },
      { input: telegramWebhookSecret, provider: "webhook", key: "TELEGRAM_WEBHOOK_SECRET" },
    ];

    for (const c of candidates) {
      if (typeof c.input === "string" && c.input.trim()) {
        const cleanVal = c.input.trim();
        if (cleanVal.includes("••") || cleanVal.includes("**")) {
          continue; // abaikan input yang masih berupa nilai ter-masking
        }
        if (cleanVal.length < 8 || cleanVal.length > 512) {
          return {
            status: 400,
            data: { error: `Format ${c.key} tidak valid (panjang harus antara 8 hingga 512 karakter).` },
          };
        }
        updates.push({ provider: c.provider, key: c.key, val: cleanVal });
      }
    }

    if (updates.length === 0) {
      return {
        status: 200,
        data: { success: true, updated: [], rotations: [] },
      };
    }

    const rotationResults: Array<{
      key: string;
      provider: string;
      masked_preview: string;
      status: "active";
      rotation_count: number;
      is_rotated: boolean;
      last_rotated_at: string;
    }> = [];

    for (const item of updates) {
      const masked = maskSecretValue(item.val);
      const nowIso = new Date().toISOString();

      // Cek apakah secret sebelumnya sudah ada untuk menghitung rotasi
      const { data: existingSecret } = await secretClient
        .from("integration_secrets")
        .select("id, masked_preview, status, rotation_count, last_rotated_at")
        .eq("organization_id", orgId)
        .eq("provider", item.provider)
        .eq("secret_key_name", item.key)
        .maybeSingle();

      const isRotation = Boolean(existingSecret);
      const nextRotationCount = existingSecret ? Number(existingSecret.rotation_count || 1) + 1 : 1;

      const { error: secretErr } = await secretClient.from("integration_secrets").upsert(
        {
          organization_id: orgId,
          provider: item.provider,
          secret_key_name: item.key,
          secret_value: item.val,
          masked_preview: masked,
          status: "active",
          rotation_count: nextRotationCount,
          last_rotated_at: nowIso,
          disabled_at: null,
          disabled_by: null,
          updated_by: ctx.userId,
          updated_at: nowIso,
        },
        { onConflict: "organization_id,provider,secret_key_name" }
      );

      if (secretErr && secretErr.code !== "42P01" && secretErr.code !== "42501") {
        return {
          status: 500,
          data: { error: `Gagal menyimpan rahasia integrasi (${item.key}).` },
        };
      }

      // Simpan HANYA nilai ter-masking di app_settings (tidak pernah plaintext!)
      if (item.key === "TELEGRAM_BOT_TOKEN" || item.key === "FONNTE_API_TOKEN") {
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
            data: { error: `Gagal memperbarui metadata pengaturan (${item.key}).` },
          };
        }
      }

      try {
        await client.from("audit_logs").insert({
          organization_id: orgId,
          actor_id: ctx.userId,
          actor_user_id: ctx.userId,
          actor_role: actorRole,
          action: isRotation ? "ROTATE_INTEGRATION_SECRET" : "CREATE_INTEGRATION_SECRET",
          entity_type: "integration_secrets",
          resource_type: "integration_secrets",
          entity_id: item.key,
          resource_id: item.key,
          reason:
            String(reason || "").trim() ||
            (isRotation ? `Rotasi token ${item.key} (rotasi ke-${nextRotationCount})` : `Konfigurasi awal token ${item.key}`),
          before_state: existingSecret
            ? {
                secret_key_name: item.key,
                masked_preview: existingSecret.masked_preview,
                status: existingSecret.status,
                rotation_count: existingSecret.rotation_count || 1,
              }
            : null,
          after_state: {
            secret_key_name: item.key,
            masked_preview: masked,
            status: "active",
            rotation_count: nextRotationCount,
            last_rotated_at: nowIso,
          },
        });
      } catch {
        // ignore if audit_logs not migrated yet
      }

      rotationResults.push({
        key: item.key,
        provider: item.provider,
        masked_preview: masked,
        status: "active",
        rotation_count: nextRotationCount,
        is_rotated: isRotation,
        last_rotated_at: nowIso,
      });
    }

    return {
      status: 200,
      data: {
        success: true,
        updated: rotationResults.map((r) => r.key),
        rotations: rotationResults,
      },
    };
  }

  return { status: 405, data: { error: "Method Not Allowed" } };
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.status === "function") {
    const queryOrgId = typeof req.query?.organizationId === "string" ? req.query.organizationId : undefined;
    const payload = req.method === "GET" ? { organizationId: queryOrgId, ...(req.body || {}) } : req.body;
    const result = await processIntegrationSecrets(req.method, req.headers?.authorization, payload);
    return res.status(result.status).json(result.data);
  }

  const authHeader = req.headers?.get ? req.headers.get("authorization") : undefined;
  let body: any = {};
  if (req.method === "POST" || req.method === "PATCH") {
    body = await req.json().catch(() => ({}));
  } else if (req.url) {
    try {
      const urlObj = new URL(req.url, "http://localhost");
      const qOrg = urlObj.searchParams.get("organizationId");
      if (qOrg) body.organizationId = qOrg;
    } catch {
      // ignore
    }
  }
  const result = await processIntegrationSecrets(req.method, authHeader || undefined, body);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
