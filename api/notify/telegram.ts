import crypto from "crypto";
import { resolveServerTenantContext } from "../_tenantContext";

const isMaskedToken = (val?: string | null) => {
  if (!val) return true;
  const clean = String(val).trim();
  return !clean || clean.includes("••") || clean.includes("**");
};

const MAX_MESSAGE_LENGTH = 4000;
const MIN_MESSAGE_LENGTH = 5;
const USER_RATE_LIMIT_PER_MIN = 25;
const TENANT_RATE_LIMIT_PER_MIN = 60;
const IDEMPOTENCY_WINDOW_MS = 15_000;

const userRateCounters = new Map<string, { count: number; resetAt: number }>();
const tenantRateCounters = new Map<string, { count: number; resetAt: number }>();
const idempotencyStore = new Map<string, { expiresAt: number; response: any }>();

export function resetTelegramNotifyGuardsForTesting() {
  userRateCounters.clear();
  tenantRateCounters.clear();
  idempotencyStore.clear();
}

function checkRateLimit(map: Map<string, { count: number; resetAt: number }>, key: string, max: number): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now >= entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

function validateNotificationTemplateAndContent(message: string, role: string, recipientType: "santri" | "global_group"): {
  ok: boolean;
  error?: string;
} {
  const clean = String(message || "").trim();
  if (clean.length < MIN_MESSAGE_LENGTH) {
    return { ok: false, error: "Isi pesan terlalu pendek (minimal 5 karakter)." };
  }
  if (clean.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "Panjang pesan melebihi batas maksimum (4000 karakter)." };
  }
  if (/<\s*script|javascript:/i.test(clean)) {
    return { ok: false, error: "Isi pesan mengandung pola karakter yang dilarang." };
  }

  // Jika pengirim adalah Musammi dan mengirim ke grup global lembaga, wajib mengikuti template laporan kehadiran resmi
  if (role === "musammi" && recipientType === "global_group") {
    const isOfficialAttendanceTemplate =
      clean.includes("LAPORAN KEHADIRAN HALAQAH") || clean.includes("LAPORAN ABSENSI HALAQAH");
    if (!isOfficialAttendanceTemplate) {
      return {
        ok: false,
        error:
          "Akses ditolak: Musammi hanya diizinkan mengirim template resmi Laporan Kehadiran Halaqah ke grup global.",
      };
    }
  }

  return { ok: true };
}

async function isMusammiAssignedToSantriServer(
  dbReader: any,
  orgId: string,
  userId: string,
  userEmail: string | null,
  santriRow: { id: number | string; halaqah_id?: number | string | null }
): Promise<boolean> {
  const musammiIds = new Set<string>();

  // 1. Cek musammi_id pada access_grants
  try {
    const { data: grantRows } = await dbReader
      .from("access_grants")
      .select("musammi_id")
      .eq("user_id", userId)
      .eq("organization_id", orgId)
      .eq("status", "active");
    for (const g of grantRows || []) {
      if (g?.musammi_id != null) musammiIds.add(String(g.musammi_id));
    }
  } catch {
    // ignore
  }

  // 2. Cek master musammi berdasarkan email di organisasi yang sama
  if (userEmail) {
    try {
      const { data: musammiRows } = await dbReader
        .from("musammi")
        .select("id, email")
        .eq("organization_id", orgId);
      for (const m of musammiRows || []) {
        if (m?.id != null && String(m.email || "").trim().toLowerCase() === userEmail.trim().toLowerCase()) {
          musammiIds.add(String(m.id));
        }
      }
    } catch {
      // ignore
    }
  }

  if (musammiIds.size === 0) return false;

  // 3. Cek penugasan langsung lewat halaqah.musammi_id (skema legacy & hibrida)
  if (santriRow.halaqah_id != null) {
    try {
      const { data: halaqahRow } = await dbReader
        .from("halaqah")
        .select("id, musammi_id, organization_id")
        .eq("id", santriRow.halaqah_id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (halaqahRow?.musammi_id != null && musammiIds.has(String(halaqahRow.musammi_id))) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  // 4. Cek penugasan V2 lewat halaqah_memberships & halaqah_mentors
  try {
    const { data: memberships } = await dbReader
      .from("halaqah_memberships")
      .select("halaqah_id")
      .eq("organization_id", orgId)
      .eq("santri_id", santriRow.id);

    const studentHalaqahIds = (memberships || []).map((m: any) => m.halaqah_id).filter(Boolean);
    if (studentHalaqahIds.length > 0) {
      const { data: mentors } = await dbReader
        .from("halaqah_mentors")
        .select("halaqah_id, musammi_id, is_active")
        .eq("organization_id", orgId)
        .in("halaqah_id", studentHalaqahIds);

      for (const mt of mentors || []) {
        if (mt.is_active !== false && mt.musammi_id != null && musammiIds.has(String(mt.musammi_id))) {
          return true;
        }
      }

      // Cek juga tabel halaqah untuk daftar studentHalaqahIds
      const { data: halaqahList } = await dbReader
        .from("halaqah")
        .select("id, musammi_id")
        .eq("organization_id", orgId)
        .in("id", studentHalaqahIds);
      for (const h of halaqahList || []) {
        if (h?.musammi_id != null && musammiIds.has(String(h.musammi_id))) {
          return true;
        }
      }
    }
  } catch {
    // ignore
  }

  return false;
}

export async function processTelegramNotification(
  authHeader: string | undefined,
  body: any,
  injectedClient?: any,
  injectedFetch?: typeof fetch
) {
  const {
    chatId,
    message,
    parseMode,
    santriId,
    isTest,
    idempotencyKey,
    organizationId: requestedOrgId,
  } = body || {};

  if (!chatId && !santriId) {
    return { status: 400, data: { error: "santriId atau chatId wajib disertakan." } };
  }
  if (!message || String(message).trim().length === 0) {
    return { status: 400, data: { error: "Isi pesan (message) wajib diisi." } };
  }

  // 1, 2, 3: Verifikasi token pengguna, effective role, dan organization context
  const ctx = await resolveServerTenantContext({
    authHeader,
    requestedOrganizationId: requestedOrgId || null,
    requireWrite: false,
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

  const orgId = ctx.organizationId;
  const role = ctx.effectiveRole;
  const userClient = ctx.userClient;
  const dbReader = ctx.adminClient || userClient;

  if (!["admin", "musammi", "superadmin"].includes(role)) {
    return { status: 403, data: { error: "Akses ditolak: Anda tidak memiliki kewenangan mengirim notifikasi." } };
  }

  if (role === "musammi" && isTest === true) {
    return {
      status: 403,
      data: { error: "Akses ditolak: Hanya Admin Lembaga yang dapat melakukan pengiriman uji coba." },
    };
  }

  // Rate limiting per-user dan per-tenant
  if (!checkRateLimit(userRateCounters, `${orgId}:${ctx.userId}`, USER_RATE_LIMIT_PER_MIN)) {
    return {
      status: 429,
      data: { error: "Batas pengiriman notifikasi per menit tercapai. Silakan tunggu sebentar." },
    };
  }
  if (!checkRateLimit(tenantRateCounters, orgId, TENANT_RATE_LIMIT_PER_MIN)) {
    return {
      status: 429,
      data: { error: "Kuota pengiriman notifikasi lembaga per menit tercapai. Silakan tunggu sebentar." },
    };
  }

  // 4 & 5: Periksa penerima dari database serta assignment & kewenangan pengirim
  const cleanRequestedChatId = chatId ? String(chatId).trim() : "";
  let resolvedChatId = "";
  let resolvedSantriId: number | string | null = santriId ?? null;
  let recipientType: "santri" | "global_group" = "santri";

  if (santriId != null && String(santriId).trim() !== "") {
    const { data: santriMatch } = await dbReader
      .from("santri")
      .select("id, nama, telegram_chat_id, halaqah_id, organization_id")
      .eq("organization_id", orgId)
      .eq("id", santriId)
      .maybeSingle();

    if (!santriMatch || santriMatch.organization_id !== orgId) {
      return {
        status: 403,
        data: { error: "Akses ditolak: Penerima Telegram tidak terdaftar sebagai santri pada lembaga Anda." },
      };
    }

    const dbChatId = String(santriMatch.telegram_chat_id || "").trim();
    if (!dbChatId) {
      return { status: 400, data: { error: "Santri belum memiliki ID Chat Telegram terverifikasi di database." } };
    }

    // Tolak jika browser mencoba memanipulasi chatId yang berbeda dari database
    if (cleanRequestedChatId && cleanRequestedChatId !== dbChatId) {
      return {
        status: 403,
        data: {
          error: "Akses ditolak: Chat ID yang dikirim tidak sesuai dengan data santri terverifikasi di database.",
        },
      };
    }

    // Jika pengirim adalah Musammi, wajib terverifikasi memiliki assignment aktif terhadap santri tersebut
    if (role === "musammi") {
      const assigned = await isMusammiAssignedToSantriServer(
        dbReader,
        orgId,
        ctx.userId,
        ctx.userEmail,
        santriMatch
      );
      if (!assigned) {
        return {
          status: 403,
          data: {
            error:
              "Akses ditolak: Musammi hanya berwenang mengirim notifikasi kepada santri dalam halaqah penugasannya.",
          },
        };
      }
    }

    resolvedChatId = dbChatId;
    resolvedSantriId = santriMatch.id;
    recipientType = "santri";
  } else {
    // Jika santriId tidak dikirim, periksa apakah chatId milik santri di lembaga ini ATAU TELEGRAM_GLOBAL_CHAT_ID lembaga
    const { data: santriByChat } = await dbReader
      .from("santri")
      .select("id, nama, telegram_chat_id, halaqah_id, organization_id")
      .eq("organization_id", orgId)
      .eq("telegram_chat_id", cleanRequestedChatId)
      .maybeSingle();

    if (santriByChat && santriByChat.organization_id === orgId) {
      if (role === "musammi") {
        const assigned = await isMusammiAssignedToSantriServer(
          dbReader,
          orgId,
          ctx.userId,
          ctx.userEmail,
          santriByChat
        );
        if (!assigned) {
          return {
            status: 403,
            data: {
              error:
                "Akses ditolak: Musammi hanya berwenang mengirim notifikasi kepada santri dalam halaqah penugasannya.",
            },
          };
        }
      }
      resolvedChatId = String(santriByChat.telegram_chat_id).trim();
      resolvedSantriId = santriByChat.id;
      recipientType = "santri";
    } else {
      // Cek apakah cocok dengan TELEGRAM_GLOBAL_CHAT_ID milik organisasi
      const { data: globalChatSetting } = await dbReader
        .from("app_settings")
        .select("value")
        .eq("organization_id", orgId)
        .eq("key", "TELEGRAM_GLOBAL_CHAT_ID")
        .maybeSingle();

      const configuredGlobalChatId = String(globalChatSetting?.value || "").trim();
      if (configuredGlobalChatId && configuredGlobalChatId === cleanRequestedChatId) {
        resolvedChatId = configuredGlobalChatId;
        recipientType = "global_group";
      } else {
        return {
          status: 403,
          data: {
            error:
              "Akses ditolak: Penerima Telegram tidak terdaftar sebagai santri maupun Grup Global pada lembaga Anda.",
          },
        };
      }
    }
  }

  // Validasi panjang pesan & template
  const templateCheck = validateNotificationTemplateAndContent(String(message), role, recipientType);
  if (!templateCheck.ok) {
    return { status: 403, data: { error: templateCheck.error } };
  }

  // Idempotency check
  const computedIdemKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim()
      ? `${orgId}:${idempotencyKey.trim()}`
      : crypto
          .createHash("sha256")
          .update(`${orgId}:${ctx.userId}:${resolvedChatId}:${String(message).trim()}`)
          .digest("hex");

  const now = Date.now();
  for (const [k, v] of idempotencyStore.entries()) {
    if (v.expiresAt <= now) idempotencyStore.delete(k);
  }
  const cachedIdem = idempotencyStore.get(computedIdemKey);
  if (cachedIdem && cachedIdem.expiresAt > now) {
    return {
      status: 200,
      data: { ...cachedIdem.response, deduplicated: true },
    };
  }

  // 6: Ambil secret tenant secara eksklusif dari integration_secrets milik orgId
  let token = "";
  const { data: secretRow } = await dbReader
    .from("integration_secrets")
    .select("organization_id, secret_value, status")
    .eq("organization_id", orgId)
    .eq("secret_key_name", "TELEGRAM_BOT_TOKEN")
    .maybeSingle();

  if (secretRow?.status === "disabled") {
    return {
      status: 403,
      data: { error: "Token Bot Telegram untuk lembaga ini sedang dinonaktifkan (disabled)." },
    };
  }

  if (
    secretRow?.organization_id === orgId &&
    secretRow?.status === "active" &&
    !isMaskedToken(secretRow?.secret_value)
  ) {
    token = String(secretRow.secret_value).trim();
  }

  if (!token || isMaskedToken(token)) {
    return {
      status: 400,
      data: { error: "Token Bot Telegram belum dikonfigurasi di server untuk lembaga ini." },
    };
  }

  // 7: Kirim pesan ke Telegram API
  const fetchFn = injectedFetch || fetch;
  let sendOk = false;
  let resultData: any = null;
  let errorDescription = "";

  try {
    const response = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: resolvedChatId,
        text: String(message).trim(),
        parse_mode: parseMode || "Markdown",
      }),
    });
    resultData = await response.json().catch(() => ({ ok: false }));
    sendOk = Boolean(response.ok && resultData?.ok);
    if (!sendOk) {
      errorDescription = resultData?.description || "Gagal mengirim pesan Telegram.";
    }
  } catch {
    sendOk = false;
    errorDescription = "Gagal menghubungi layanan Telegram API.";
  }

  // 8: Catat hasil ke audit_logs (tanpa pernah mencatat nilai token!)
  try {
    await userClient.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: ctx.userId,
      actor_user_id: ctx.userId,
      actor_role: role,
      action: sendOk ? "SEND_TELEGRAM_NOTIFICATION" : "SEND_TELEGRAM_NOTIFICATION_FAILED",
      entity_type: "notifications",
      resource_type: "notifications",
      entity_id: resolvedSantriId ? String(resolvedSantriId) : resolvedChatId,
      resource_id: resolvedSantriId ? String(resolvedSantriId) : resolvedChatId,
      reason: sendOk ? "Pengiriman notifikasi Telegram berhasil" : `Pengiriman gagal: ${errorDescription}`,
      after_state: {
        channel: "telegram",
        recipient_type: recipientType,
        santri_id: resolvedSantriId,
        chat_id: resolvedChatId,
        status: sendOk ? "sent" : "failed",
        idempotency_key: computedIdemKey,
      },
    });
  } catch {
    // ignore if audit_logs unavailable
  }

  if (!sendOk) {
    return { status: 400, data: { error: errorDescription || "Gagal mengirim pesan Telegram" } };
  }

  const successPayload = { success: true, result: resultData };
  idempotencyStore.set(computedIdemKey, {
    expiresAt: Date.now() + IDEMPOTENCY_WINDOW_MS,
    response: successPayload,
  });

  return { status: 200, data: successPayload };
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
