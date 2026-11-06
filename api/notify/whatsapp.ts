import crypto from "crypto";
import { resolveServerTenantContext } from "../_tenantContext";

const isMaskedToken = (val?: string | null) => {
  if (!val) return true;
  const clean = String(val).trim();
  return !clean || clean.includes("••") || clean.includes("**");
};

const normalizePhoneDigits = (phone: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("62")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
};

const MAX_MESSAGE_LENGTH = 4000;
const MIN_MESSAGE_LENGTH = 5;
const USER_RATE_LIMIT_PER_MIN = 25;
const TENANT_RATE_LIMIT_PER_MIN = 60;
const IDEMPOTENCY_WINDOW_MS = 15_000;

const userRateCounters = new Map<string, { count: number; resetAt: number }>();
const tenantRateCounters = new Map<string, { count: number; resetAt: number }>();
const idempotencyStore = new Map<string, { expiresAt: number; response: any }>();

export function resetWhatsAppNotifyGuardsForTesting() {
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

function validateWhatsAppTemplateAndContent(
  message: string,
  role: string,
  recipientType: "santri" | "musammi" | "musyrif" | "wali_kelas"
): { ok: boolean; error?: string } {
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

  if (role === "musammi") {
    if (recipientType === "musammi") {
      return {
        ok: false,
        error: "Akses ditolak: Musammi tidak diizinkan mengirim pesan WhatsApp bebas ke sesama Musammi melalui token lembaga.",
      };
    }
    if (recipientType === "musyrif" || recipientType === "wali_kelas") {
      const isOfficialAttendanceTemplate =
        clean.includes("LAPORAN KEHADIRAN HALAQAH") || clean.includes("LAPORAN ABSENSI HALAQAH");
      if (!isOfficialAttendanceTemplate) {
        return {
          ok: false,
          error:
            "Akses ditolak: Musammi hanya diizinkan mengirim template resmi Laporan Kehadiran Halaqah kepada Musyrif/Wali Kelas.",
        };
      }
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

export async function processWhatsAppNotification(
  authHeader: string | undefined,
  body: any,
  injectedClient?: any,
  injectedFetch?: typeof fetch
) {
  const {
    target,
    message,
    santriId,
    isTest,
    idempotencyKey,
    organizationId: requestedOrgId,
  } = body || {};

  if ((!target && !santriId) || !message || String(message).trim().length === 0) {
    return { status: 400, data: { error: "target (atau santriId) dan message wajib diisi." } };
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
      data: { error: "Batas pengiriman notifikasi WhatsApp per menit tercapai. Silakan tunggu sebentar." },
    };
  }
  if (!checkRateLimit(tenantRateCounters, orgId, TENANT_RATE_LIMIT_PER_MIN)) {
    return {
      status: 429,
      data: { error: "Kuota pengiriman notifikasi WhatsApp lembaga per menit tercapai. Silakan tunggu sebentar." },
    };
  }

  // 4 & 5: Periksa penerima dari database serta assignment & kewenangan pengirim
  const cleanRequestedTarget = target ? String(target).trim() : "";
  const requestedCore = cleanRequestedTarget ? normalizePhoneDigits(cleanRequestedTarget) : "";
  let resolvedTarget = "";
  let resolvedSantriId: number | string | null = santriId ?? null;
  let recipientType: "santri" | "musammi" | "musyrif" | "wali_kelas" = "santri";

  if (santriId != null && String(santriId).trim() !== "") {
    const { data: santriRow } = await dbReader
      .from("santri")
      .select("id, nama, no_hp, halaqah_id, organization_id")
      .eq("organization_id", orgId)
      .eq("id", santriId)
      .maybeSingle();

    if (!santriRow || santriRow.organization_id !== orgId) {
      return { status: 403, data: { error: "Akses ditolak: Santri tidak ditemukan pada lembaga Anda." } };
    }

    const dbPhone = String(santriRow.no_hp || "").trim();
    const dbCore = normalizePhoneDigits(dbPhone);
    if (!dbCore || dbCore.length < 7) {
      return { status: 400, data: { error: "Santri belum memiliki nomor WhatsApp yang valid di database." } };
    }

    // Tolak jika browser mencoba memanipulasi target nomor telepon yang berbeda dari database
    if (requestedCore && requestedCore !== dbCore) {
      return {
        status: 403,
        data: {
          error: "Akses ditolak: Nomor tujuan tidak sesuai dengan data santri terverifikasi di database.",
        },
      };
    }

    if (role === "musammi") {
      const assigned = await isMusammiAssignedToSantriServer(
        dbReader,
        orgId,
        ctx.userId,
        ctx.userEmail,
        santriRow
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

    resolvedTarget = dbPhone;
    resolvedSantriId = santriRow.id;
    recipientType = "santri";
  } else {
    if (!requestedCore || requestedCore.length < 7 || requestedCore.length > 16) {
      return { status: 400, data: { error: "Nomor tujuan WhatsApp tidak valid." } };
    }

    // Periksa pada tabel santri, musyrifs, wali_kelas (master_kelas_relasi), dan musammi milik organisasi ini
    const [santriRes, musyrifRes, kelasRes, musammiRes] = await Promise.all([
      dbReader.from("santri").select("id, no_hp, halaqah_id, organization_id").eq("organization_id", orgId),
      dbReader.from("musyrifs").select("id, no_hp, organization_id").eq("organization_id", orgId),
      dbReader
        .from("master_kelas_relasi")
        .select("id, wali_kelas_phone, musyrif_phone, organization_id")
        .eq("organization_id", orgId),
      dbReader.from("musammi").select("id, no_hp, organization_id").eq("organization_id", orgId),
    ]);

    const matchedSantri = (santriRes?.data || []).find(
      (s: any) => normalizePhoneDigits(s.no_hp || "") === requestedCore
    );
    const matchedMusyrif = (musyrifRes?.data || []).find(
      (m: any) => normalizePhoneDigits(m.no_hp || "") === requestedCore
    );
    const matchedKelasWali = (kelasRes?.data || []).find(
      (k: any) =>
        normalizePhoneDigits(k.wali_kelas_phone || "") === requestedCore ||
        normalizePhoneDigits(k.musyrif_phone || "") === requestedCore
    );
    const matchedMusammi = (musammiRes?.data || []).find(
      (m: any) => normalizePhoneDigits(m.no_hp || "") === requestedCore
    );

    if (matchedSantri) {
      if (role === "musammi") {
        const assigned = await isMusammiAssignedToSantriServer(
          dbReader,
          orgId,
          ctx.userId,
          ctx.userEmail,
          matchedSantri
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
      resolvedTarget = String(matchedSantri.no_hp).trim();
      resolvedSantriId = matchedSantri.id;
      recipientType = "santri";
    } else if (matchedMusyrif) {
      resolvedTarget = String(matchedMusyrif.no_hp).trim();
      recipientType = "musyrif";
    } else if (matchedKelasWali) {
      resolvedTarget = cleanRequestedTarget;
      recipientType = "wali_kelas";
    } else if (matchedMusammi) {
      resolvedTarget = String(matchedMusammi.no_hp).trim();
      recipientType = "musammi";
    } else {
      return {
        status: 403,
        data: {
          error:
            "Akses ditolak: Nomor tujuan WhatsApp tidak terdaftar pada data Santri, Musyrif, Wali Kelas, atau Musammi di lembaga Anda.",
        },
      };
    }
  }

  // Validasi panjang pesan & template
  const templateCheck = validateWhatsAppTemplateAndContent(String(message), role, recipientType);
  if (!templateCheck.ok) {
    return { status: 403, data: { error: templateCheck.error } };
  }

  // Idempotency check
  const computedIdemKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim()
      ? `${orgId}:${idempotencyKey.trim()}`
      : crypto
          .createHash("sha256")
          .update(`${orgId}:${ctx.userId}:${normalizePhoneDigits(resolvedTarget)}:${String(message).trim()}`)
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
    .eq("secret_key_name", "FONNTE_API_TOKEN")
    .maybeSingle();

  if (secretRow?.status === "disabled") {
    return {
      status: 403,
      data: { error: "Token API Fonnte untuk lembaga ini sedang dinonaktifkan (disabled)." },
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
      data: { error: "Token API Fonnte belum dikonfigurasi di server untuk lembaga ini." },
    };
  }

  // 7: Kirim pesan melalui Fonnte
  const formData = new URLSearchParams();
  formData.append("target", String(resolvedTarget));
  formData.append("message", String(message).trim());

  const fetchFn = injectedFetch || fetch;
  let sendOk = false;
  let resultData: any = null;
  let errorReason = "";

  try {
    const response = await fetchFn("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
    resultData = await response.json().catch(() => ({ status: false }));
    sendOk = Boolean(response.ok && resultData?.status);
    if (!sendOk) {
      errorReason = resultData?.reason || "Gagal mengirim pesan melalui Fonnte.";
    }
  } catch {
    sendOk = false;
    errorReason = "Gagal menghubungi layanan Fonnte API.";
  }

  // 8: Catat hasil ke audit_logs (tanpa pernah mencatat nilai token!)
  try {
    await userClient.from("audit_logs").insert({
      organization_id: orgId,
      actor_id: ctx.userId,
      actor_user_id: ctx.userId,
      actor_role: role,
      action: sendOk ? "SEND_WHATSAPP_NOTIFICATION" : "SEND_WHATSAPP_NOTIFICATION_FAILED",
      entity_type: "notifications",
      resource_type: "notifications",
      entity_id: resolvedSantriId ? String(resolvedSantriId) : normalizePhoneDigits(resolvedTarget),
      resource_id: resolvedSantriId ? String(resolvedSantriId) : normalizePhoneDigits(resolvedTarget),
      reason: sendOk ? "Pengiriman notifikasi WhatsApp berhasil" : `Pengiriman gagal: ${errorReason}`,
      after_state: {
        channel: "whatsapp",
        recipient_type: recipientType,
        santri_id: resolvedSantriId,
        target: resolvedTarget,
        status: sendOk ? "sent" : "failed",
        idempotency_key: computedIdemKey,
      },
    });
  } catch {
    // ignore if audit_logs unavailable
  }

  if (!sendOk) {
    return { status: 400, data: { error: errorReason || "Gagal mengirim pesan melalui Fonnte" } };
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
    const result = await processWhatsAppNotification(req.headers?.authorization, req.body);
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
  const result = await processWhatsAppNotification(authHeader || undefined, body);
  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}
