import fs from "fs";
import path from "path";
import { processIntegrationSecrets } from "../api/integrations";
import {
  processTelegramWebhook,
  resetWebhookReplayCacheForTesting,
} from "../api/telegram-webhook";
import { processTelegramWebhookRegister } from "../api/telegram-webhook/register";
import {
  processTelegramNotification,
  resetTelegramNotifyGuardsForTesting,
} from "../api/notify/telegram";
import {
  processWhatsAppNotification,
  resetWhatsAppNotifyGuardsForTesting,
} from "../api/notify/whatsapp";
import {
  processChatRequest,
  resetChatRateAndQuotaForTesting,
  SYSTEM_INSTRUCTION,
} from "../api/chat";

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function recordTest(id: string, name: string, passed: boolean, detail: string) {
  results.push({ id, name, passed, detail });
  if (!passed) {
    console.error(`❌ [${id}] ${name}: ${detail}`);
  } else {
    console.log(`✅ [${id}] ${name}: ${detail}`);
  }
}

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

function createInMemoryState() {
  return {
    organizations: [
      { id: ORG_A, name: "Ma'had Al-Fajr (Tenant A)", status: "active" },
      { id: ORG_B, name: "Ma'had An-Nur (Tenant B)", status: "active" },
    ],
    profiles: [
      { id: "super-1", role: "superadmin", organization_id: null, email: "super@platform.id" },
      { id: "admin-a", role: "admin", organization_id: ORG_A, email: "admin@tenanta.id" },
      { id: "admin-b", role: "admin", organization_id: ORG_B, email: "admin@tenantb.id" },
      { id: "musammi-a1", role: "musammi", organization_id: ORG_A, email: "ustadz1@tenanta.id" },
      { id: "invited-a", role: "pending", organization_id: ORG_A, email: "invited@tenanta.id" },
    ],
    access_grants: [
      {
        id: "g-super",
        user_id: "super-1",
        organization_id: null,
        role: "superadmin",
        status: "active",
        expires_at: null,
        musammi_id: null,
      },
      {
        id: "g-admin-a",
        user_id: "admin-a",
        organization_id: ORG_A,
        role: "admin",
        status: "active",
        expires_at: null,
        musammi_id: null,
      },
      {
        id: "g-admin-b",
        user_id: "admin-b",
        organization_id: ORG_B,
        role: "admin",
        status: "active",
        expires_at: null,
        musammi_id: null,
      },
      {
        id: "g-musammi-a1",
        user_id: "musammi-a1",
        organization_id: ORG_A,
        role: "musammi",
        status: "active",
        expires_at: null,
        musammi_id: 101,
      },
      {
        id: "g-invited-a",
        user_id: "invited-a",
        organization_id: ORG_A,
        role: "musammi",
        status: "invited",
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
        musammi_id: null,
      },
    ],
    support_access_sessions: [] as any[],
    integration_secrets: [
      {
        id: "sec-b-tg",
        organization_id: ORG_B,
        provider: "telegram",
        secret_key_name: "TELEGRAM_BOT_TOKEN",
        secret_value: "999999:TENANT_B_SECRET_BOT_TOKEN_XYZ",
        masked_preview: "999••••••XYZ",
        status: "active",
        rotation_count: 1,
        last_rotated_at: new Date().toISOString(),
        disabled_at: null,
        disabled_by: null,
        updated_by: "admin-b",
        updated_at: new Date().toISOString(),
      },
      {
        id: "sec-b-wh",
        organization_id: ORG_B,
        provider: "webhook",
        secret_key_name: "TELEGRAM_WEBHOOK_SECRET",
        secret_value: "WEBHOOK_SECRET_TENANT_B_987654321",
        masked_preview: "WEB••••••321",
        status: "active",
        rotation_count: 1,
        last_rotated_at: new Date().toISOString(),
        disabled_at: null,
        disabled_by: null,
        updated_by: "admin-b",
        updated_at: new Date().toISOString(),
      },
    ] as any[],
    app_settings: [
      { organization_id: ORG_A, key: "TELEGRAM_GLOBAL_CHAT_ID", value: "-100555666777" },
    ] as any[],
    musammi: [
      { id: 101, nama: "Ustadz Ahmad", email: "ustadz1@tenanta.id", no_hp: "081211112222", organization_id: ORG_A },
      { id: 102, nama: "Ustadz Bilal", email: "ustadz2@tenanta.id", no_hp: "081233334444", organization_id: ORG_A },
    ],
    halaqah: [
      { id: 10, nama: "Halaqah Abu Bakar", musammi_id: 101, organization_id: ORG_A },
      { id: 20, nama: "Halaqah Umar", musammi_id: 102, organization_id: ORG_A },
    ],
    halaqah_memberships: [
      { halaqah_id: 10, santri_id: 1001, organization_id: ORG_A },
      { halaqah_id: 20, santri_id: 1002, organization_id: ORG_A },
    ],
    halaqah_mentors: [
      { halaqah_id: 10, musammi_id: 101, is_active: true, organization_id: ORG_A },
      { halaqah_id: 20, musammi_id: 102, is_active: true, organization_id: ORG_A },
    ],
    santri: [
      {
        id: 1001,
        nama: "Zaid bin Tsabit",
        kelas: "7A",
        halaqah_id: 10,
        telegram_chat_id: "777001",
        no_hp: "081300001001",
        organization_id: ORG_A,
      },
      {
        id: 1002,
        nama: "Muadz bin Jabal",
        kelas: "7B",
        halaqah_id: 20,
        telegram_chat_id: "777002",
        no_hp: "081300001002",
        organization_id: ORG_A,
      },
      {
        id: 2001,
        nama: "Santri Tenant B",
        kelas: "8A",
        halaqah_id: 99,
        telegram_chat_id: "888001",
        no_hp: "081399992001",
        organization_id: ORG_B,
      },
    ],
    musyrifs: [
      { id: 501, nama: "Musyrif Wustha", no_hp: "081577778888", organization_id: ORG_A },
    ],
    master_kelas_relasi: [
      { id: 601, nama_kelas: "7A", wali_kelas_phone: "081699990000", musyrif_phone: null, organization_id: ORG_A },
    ],
    audit_logs: [] as any[],
  };
}

function createStatefulMockSupabase(state: ReturnType<typeof createInMemoryState>, currentUserId: string | null) {
  const userProfile = state.profiles.find((p) => p.id === currentUserId);

  return {
    auth: {
      getUser: async () => ({
        data: {
          user: currentUserId
            ? { id: currentUserId, email: userProfile?.email || `${currentUserId}@example.com` }
            : null,
        },
        error: currentUserId ? null : new Error("Unauthorized"),
      }),
    },
    from: (tableName: keyof typeof state) => {
      const eqFilters: Record<string, any> = {};
      const inFilters: Record<string, any[]> = {};
      let isNullCol: string | null = null;

      const filterRows = () => {
        const list = (state[tableName] as any[]) || [];
        return list.filter((row) => {
          for (const [k, v] of Object.entries(eqFilters)) {
            if (String(row[k] ?? "") !== String(v ?? "")) return false;
          }
          for (const [k, arr] of Object.entries(inFilters)) {
            if (!arr.map(String).includes(String(row[k]))) return false;
          }
          if (isNullCol && row[isNullCol] !== null && row[isNullCol] !== undefined) {
            return false;
          }
          return true;
        });
      };

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          eqFilters[col] = val;
          return builder;
        },
        in: (col: string, arr: any[]) => {
          inFilters[col] = arr;
          return builder;
        },
        is: (col: string, val: any) => {
          if (val === null) isNullCol = col;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const rows = filterRows();
          return { data: rows[0] ? { ...rows[0] } : null, error: null };
        },
        insert: async (payload: any) => {
          const items = Array.isArray(payload) ? payload : [payload];
          for (const item of items) {
            (state[tableName] as any[]).push({ id: `row-${Date.now()}-${Math.random()}`, ...item });
          }
          return { data: items, error: null };
        },
        update: (patch: any) => {
          const updateBuilder: any = {
            eq: (col: string, val: any) => {
              eqFilters[col] = val;
              return updateBuilder;
            },
            then: (resolve: any) => {
              const rows = filterRows();
              for (const r of rows) {
                Object.assign(r, patch);
              }
              return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
          };
          return updateBuilder;
        },
        upsert: async (payload: any, opts?: { onConflict?: string }) => {
          const items = Array.isArray(payload) ? payload : [payload];
          const conflictCols = (opts?.onConflict || "").split(",").map((s) => s.trim()).filter(Boolean);
          for (const item of items) {
            const list = state[tableName] as any[];
            const existingIdx =
              conflictCols.length > 0
                ? list.findIndex((r) => conflictCols.every((c) => String(r[c]) === String(item[c])))
                : -1;
            if (existingIdx >= 0) {
              list[existingIdx] = { ...list[existingIdx], ...item };
            } else {
              list.push({ id: `sec-${Date.now()}-${Math.random()}`, ...item });
            }
          }
          return { data: items, error: null };
        },
        then: (resolve: any) => {
          return Promise.resolve({ data: filterRows().map((r) => ({ ...r })), error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

async function runFase3Verification() {
  console.log("=== VERIFIKASI FASE 3: INTEGRATION, SECRET & NOTIFICATION SECURITY ===");
  const state = createInMemoryState();

  const sqlHardening = fs.readFileSync(
    path.resolve(process.cwd(), "database/supabase_v2_1_production_hardening.sql"),
    "utf8"
  );
  const sqlMigrationV2 = fs.readFileSync(
    path.resolve(process.cwd(), "database/supabase_saas_v2_migration.sql"),
    "utf8"
  );

  // =========================================================================
  // 1. PENYIMPANAN SECRET & PEMISAHAN METADATA
  // =========================================================================
  const hasSecretSqlHardening =
    sqlHardening.includes("REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated") &&
    sqlHardening.includes("CREATE TRIGGER trg_sanitize_app_settings_secrets") &&
    sqlHardening.includes("CREATE OR REPLACE FUNCTION public.rpc_get_integration_secrets_metadata") &&
    sqlMigrationV2.includes("CREATE TRIGGER trg_sanitize_app_settings_secrets") &&
    sqlMigrationV2.includes("CREATE OR REPLACE FUNCTION public.rpc_get_integration_secrets_metadata");

  recordTest(
    "INT-01",
    "Browser diblokir dari integration_secrets, trigger app_settings mem-masking token plaintext, dan RPC metadata terpisah",
    hasSecretSqlHardening,
    "REVOKE ALL dari anon/authenticated, trg_sanitize_app_settings_secrets, dan rpc_get_integration_secrets_metadata aktif di kedua file migrasi SQL"
  );

  // Musammi tidak boleh membaca atau mengubah secret
  const musammiClient = createStatefulMockSupabase(state, "musammi-a1");
  const musammiGetRes = await processIntegrationSecrets("GET", "Bearer token", {}, musammiClient);
  const musammiPostRes = await processIntegrationSecrets(
    "POST",
    "Bearer token",
    { telegramBotToken: "123456:ABCDEF_MUSAMMI_ATTEMPT" },
    musammiClient
  );
  recordTest(
    "INT-02",
    "Musammi ditolak saat membaca (GET) maupun mengubah (POST) secret integrasi",
    musammiGetRes.status === 403 && musammiPostRes.status === 403,
    `GET=${musammiGetRes.status}, POST=${musammiPostRes.status}`
  );

  // Admin Tenant A tidak boleh membaca atau mengubah secret Tenant B
  const adminAClient = createStatefulMockSupabase(state, "admin-a");
  const crossTenantGet = await processIntegrationSecrets(
    "GET",
    "Bearer token",
    { organizationId: ORG_B },
    adminAClient
  );
  const crossTenantPost = await processIntegrationSecrets(
    "POST",
    "Bearer token",
    { organizationId: ORG_B, telegramBotToken: "123456:HACK_TENANT_B" },
    adminAClient
  );
  recordTest(
    "INT-03",
    "Tenant Admin A ditolak saat mengakses atau memodifikasi secret Tenant B",
    crossTenantGet.status === 403 && crossTenantPost.status === 403,
    `Cross-tenant GET=${crossTenantGet.status}, POST=${crossTenantPost.status}`
  );

  // Superadmin hanya dapat mengakses secret tenant sesuai kebijakan Support Session
  const superClient = createStatefulMockSupabase(state, "super-1");
  const superNoSession = await processIntegrationSecrets(
    "GET",
    "Bearer token",
    { organizationId: ORG_A },
    superClient
  );

  // Tambahkan sesi Read-Only untuk Superadmin ke ORG_A
  state.support_access_sessions.push({
    id: "supp-ro-1",
    superadmin_user_id: "super-1",
    organization_id: ORG_A,
    mode: "read_only",
    reason: "Investigasi integrasi",
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1800_000).toISOString(),
    ended_at: null,
  });

  const superRoGet = await processIntegrationSecrets(
    "GET",
    "Bearer token",
    { organizationId: ORG_A },
    superClient
  );
  const superRoPost = await processIntegrationSecrets(
    "POST",
    "Bearer token",
    { organizationId: ORG_A, telegramBotToken: "123456:SUPER_RO_WRITE" },
    superClient
  );

  // Bersihkan sesi support
  state.support_access_sessions.length = 0;

  recordTest(
    "INT-04",
    "Superadmin wajib memiliki Support Session aktif (Read-Only hanya boleh GET metadata, tidak boleh POST secret)",
    superNoSession.status === 403 && superRoGet.status === 200 && superRoPost.status === 403,
    `Tanpa sesi=${superNoSession.status}, Read-Only GET=${superRoGet.status}, Read-Only POST=${superRoPost.status}`
  );

  // Admin Tenant A menyimpan, merotasi, membaca metadata (tanpa secret_value), dan menonaktifkan token
  const rawTgTokenV1 = "111111:TENANT_A_TG_BOT_TOKEN_V1_SECRET";
  const rawWaTokenV1 = "FONNTE_TENANT_A_SECRET_TOKEN_V1";
  const createSecRes = await processIntegrationSecrets(
    "POST",
    "Bearer token",
    {
      telegramBotToken: rawTgTokenV1,
      fonnteApiToken: rawWaTokenV1,
    },
    adminAClient
  );

  const rawTgTokenV2 = "111111:TENANT_A_TG_BOT_TOKEN_V2_ROTATED";
  const rotateSecRes = await processIntegrationSecrets(
    "POST",
    "Bearer token",
    {
      telegramBotToken: rawTgTokenV2,
      reason: "Rotasi berkala token bot Telegram",
    },
    adminAClient
  );

  const metaGetRes = await processIntegrationSecrets("GET", "Bearer token", {}, adminAClient);
  const metaList: any[] = metaGetRes.data?.secrets || [];
  const tgMeta = metaList.find((m) => m.secret_key_name === "TELEGRAM_BOT_TOKEN");
  const appSettingTg = state.app_settings.find(
    (s) => s.organization_id === ORG_A && s.key === "TELEGRAM_BOT_TOKEN"
  );

  const rawSecretNeverExposedInGet =
    !JSON.stringify(metaGetRes.data).includes(rawTgTokenV2) &&
    !JSON.stringify(metaGetRes.data).includes(rawWaTokenV1) &&
    tgMeta?.secret_value === undefined;
  const appSettingsOnlyMasked =
    Boolean(appSettingTg?.value) &&
    appSettingTg.value.includes("••••") &&
    !appSettingTg.value.includes("ROTATED");
  const rotationRecorded =
    tgMeta?.rotation_count === 2 &&
    Boolean(tgMeta?.last_rotated_at) &&
    state.audit_logs.some(
      (a) =>
        a.organization_id === ORG_A &&
        a.action === "ROTATE_INTEGRATION_SECRET" &&
        !JSON.stringify(a).includes(rawTgTokenV2)
    );

  recordTest(
    "INT-05",
    "Rotasi token tercatat (rotation_count=2), app_settings hanya menyimpan nilai ter-masking, dan GET /api/integrations tidak pernah membocorkan secret_value",
    createSecRes.status === 200 &&
      rotateSecRes.status === 200 &&
      rawSecretNeverExposedInGet &&
      appSettingsOnlyMasked &&
      rotationRecorded,
    `rotation_count=${tgMeta?.rotation_count}, masked=${tgMeta?.masked_preview}, app_settings=${appSettingTg?.value}`
  );

  // =========================================================================
  // 2. TELEGRAM WEBHOOK HARDENING
  // =========================================================================
  resetWebhookReplayCacheForTesting();

  let registeredWebhookPayload: any = null;
  const regWebhookRes = await processTelegramWebhookRegister(
    "Bearer token",
    { webhookUrl: "https://lajnah.example.com/api/telegram-webhook" },
    adminAClient,
    (async (_url: any, init: any) => {
      registeredWebhookPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, description: "Webhook was set" }), { status: 200 });
    }) as any
  );

  const tenantAWebhookSecret = state.integration_secrets.find(
    (s) => s.organization_id === ORG_A && s.secret_key_name === "TELEGRAM_WEBHOOK_SECRET"
  )?.secret_value;

  // 2a. Webhook tanpa secret atau secret salah wajib ditolak (401)
  const webhookNoSecret = await processTelegramWebhook({
    method: "POST",
    headers: {},
    query: { org_id: ORG_A },
    body: { update_id: 1001, message: { date: Math.floor(Date.now() / 1000), chat: { id: 777001 }, text: "/start" } },
    injectedClient: adminAClient,
  });

  // 2b. Cross-tenant webhook secret (Secret Tenant B dikirim ke org_id Tenant A) wajib ditolak (401)
  const webhookCrossTenantSecret = await processTelegramWebhook({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "WEBHOOK_SECRET_TENANT_B_987654321" },
    query: { org_id: ORG_A },
    body: { update_id: 1002, message: { date: Math.floor(Date.now() / 1000), chat: { id: 777001 }, text: "/start" } },
    injectedClient: adminAClient,
  });

  recordTest(
    "INT-06",
    "Telegram Webhook menolak request tanpa secret valid maupun percobaan lintas-tenant secret",
    regWebhookRes.status === 200 &&
      Boolean(tenantAWebhookSecret) &&
      registeredWebhookPayload?.url?.includes(`org_id=${ORG_A}`) &&
      webhookNoSecret.status === 401 &&
      webhookCrossTenantSecret.status === 401,
    `Register=${regWebhookRes.status}, NoSecret=${webhookNoSecret.status}, CrossTenantSecret=${webhookCrossTenantSecret.status}`
  );

  // 2c. Penautan Chat ID publik via /start <identifier> dinonaktifkan & tidak membocorkan data santri
  let webhookReplyBody: any = null;
  let webhookUsedUrl = "";
  const webhookPublicLinkAttempt = await processTelegramWebhook({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": tenantAWebhookSecret },
    query: { org_id: ORG_A },
    body: {
      update_id: 1003,
      message: {
        date: Math.floor(Date.now() / 1000),
        chat: { id: 999888777 },
        text: "/start 1001",
      },
    },
    injectedClient: adminAClient,
    injectedFetch: (async (url: any, init: any) => {
      webhookUsedUrl = String(url);
      webhookReplyBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any,
  });

  const santri1001AfterAttempt = state.santri.find((s) => s.id === 1001);
  const publicLinkBlockedProperly =
    webhookPublicLinkAttempt.status === 200 &&
    santri1001AfterAttempt?.telegram_chat_id === "777001" && // tidak berubah menjadi 999888777!
    webhookUsedUrl.includes(rawTgTokenV2) && // menggunakan token Tenant A
    !String(webhookReplyBody?.text || "").includes("Zaid bin Tsabit") && // tidak membocorkan nama santri!
    String(webhookReplyBody?.text || "").includes("Penautan Otomatis Dinonaktifkan") &&
    state.audit_logs.some((a) => a.action === "WEBHOOK_PUBLIC_LINK_BLOCKED" && a.organization_id === ORG_A) &&
    sqlHardening.includes("Penautan Chat ID Telegram secara publik tanpa verifikasi Admin dinonaktifkan");

  recordTest(
    "INT-07",
    "Fitur pengaitan Chat ID publik (/start <identifier>) dinonaktifkan, tidak mengubah data santri, dan tidak membocorkan nama/kelas santri",
    publicLinkBlockedProperly,
    `Status=${webhookPublicLinkAttempt.status}, chat_id santri tetap=${santri1001AfterAttempt?.telegram_chat_id}, audit tercatat=true`
  );

  // 2d. Proteksi replay (update_id duplikat & timestamp kadaluarsa) serta batas ukuran payload
  const webhookReplayAttempt = await processTelegramWebhook({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": tenantAWebhookSecret },
    query: { org_id: ORG_A },
    body: {
      update_id: 1003, // update_id yang sama dengan request sebelumnya!
      message: {
        date: Math.floor(Date.now() / 1000),
        chat: { id: 999888777 },
        text: "/start",
      },
    },
    injectedClient: adminAClient,
  });

  const webhookStaleAttempt = await processTelegramWebhook({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": tenantAWebhookSecret },
    query: { org_id: ORG_A },
    body: {
      update_id: 1004,
      message: {
        date: Math.floor(Date.now() / 1000) - 3600, // 1 jam lalu (stale)
        chat: { id: 999888777 },
        text: "/start",
      },
    },
    injectedClient: adminAClient,
  });

  const webhookOversizedAttempt = await processTelegramWebhook({
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": tenantAWebhookSecret },
    query: { org_id: ORG_A },
    body: {
      update_id: 1005,
      padding: "X".repeat(20_000),
    },
    injectedClient: adminAClient,
  });

  recordTest(
    "INT-08",
    "Proteksi Replay (update_id duplikat & timestamp lama) dan batas ukuran payload (16 KB) berfungsi",
    webhookReplayAttempt.status === 409 &&
      webhookStaleAttempt.status === 400 &&
      webhookOversizedAttempt.status === 413,
    `DuplicateUpdateId=${webhookReplayAttempt.status}, StaleTimestamp=${webhookStaleAttempt.status}, Oversized=${webhookOversizedAttempt.status}`
  );

  // =========================================================================
  // 3. TELEGRAM & WHATSAPP NOTIFICATION API HARDENING
  // =========================================================================
  resetTelegramNotifyGuardsForTesting();
  resetWhatsAppNotifyGuardsForTesting();

  // 3a. Musammi mengirim ke santri dalam halaqah penugasannya sendiri (Santri 1001 di Halaqah 10) -> BERHASIL
  let tgTokenUsedForMusammi = "";
  const musammiValidTg = await processTelegramNotification(
    "Bearer token",
    {
      santriId: 1001,
      chatId: "777001",
      message: "Setoran Ziyadah Ananda Zaid bin Tsabit: QS. An-Naba 1-20 (Mumtaz).",
    },
    musammiClient,
    (async (url: any) => {
      tgTokenUsedForMusammi = String(url);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }) as any
  );

  // 3b. Musammi mencoba memanipulasi chatId di browser untuk santriId 1001 -> DITOLAK (403)
  const musammiTamperedChatId = await processTelegramNotification(
    "Bearer token",
    {
      santriId: 1001,
      chatId: "999999999", // berbeda dari database (777001)
      message: "Pesan dengan chatId palsu",
    },
    musammiClient
  );

  // 3c. Musammi mencoba mengirim ke santri halaqah lain (Santri 1002 di Halaqah 20 milik Ustadz Bilal) -> DITOLAK (403)
  const musammiUnassignedSantriTg = await processTelegramNotification(
    "Bearer token",
    {
      santriId: 1002,
      message: "Setoran Ananda Muadz",
    },
    musammiClient
  );

  const musammiUnassignedSantriWa = await processWhatsAppNotification(
    "Bearer token",
    {
      santriId: 1002,
      message: "Setoran Ananda Muadz via WA",
    },
    musammiClient
  );

  // 3d. Musammi mencoba mengirim ke nomor / Chat ID bebas di luar lembaga -> DITOLAK (403)
  const musammiArbitraryWa = await processWhatsAppNotification(
    "Bearer token",
    {
      target: "089988887777",
      message: "Halo ini pesan bebas menggunakan token lembaga",
    },
    musammiClient
  );

  // 3e. Musammi mencoba mengirim pesan bebas (bukan template laporan kehadiran) ke Grup Global / Musyrif -> DITOLAK (403)
  const musammiFreeTextToGlobalGroup = await processTelegramNotification(
    "Bearer token",
    {
      chatId: "-100555666777",
      message: "Pesan obrolan bebas ke grup global tanpa template resmi",
    },
    musammiClient
  );

  recordTest(
    "INT-09",
    "Musammi hanya dapat mengirim notifikasi ke santri penugasannya; percobaan ke halaqah lain, manipulasi chatId, nomor sembarang, atau pesan bebas ditolak (403)",
    musammiValidTg.status === 200 &&
      tgTokenUsedForMusammi.includes(rawTgTokenV2) &&
      musammiTamperedChatId.status === 403 &&
      musammiUnassignedSantriTg.status === 403 &&
      musammiUnassignedSantriWa.status === 403 &&
      musammiArbitraryWa.status === 403 &&
      musammiFreeTextToGlobalGroup.status === 403,
    `ValidAssigned=${musammiValidTg.status}, TamperedChatId=${musammiTamperedChatId.status}, UnassignedTg=${musammiUnassignedSantriTg.status}, UnassignedWa=${musammiUnassignedSantriWa.status}, ArbitraryWa=${musammiArbitraryWa.status}, FreeTextGlobal=${musammiFreeTextToGlobalGroup.status}`
  );

  // 3f. Isolasi Token Lintas Tenant: Tenant A tidak dapat memakai token Tenant B atau mengirim ke santri Tenant B
  const adminAToTenantBSantri = await processTelegramNotification(
    "Bearer token",
    {
      santriId: 2001, // Santri milik Tenant B
      message: "Percobaan lintas tenant",
    },
    adminAClient
  );

  // 3g. Penonaktifan Token: Saat token dinonaktifkan (disabled), pengiriman notifikasi langsung ditolak (403)
  const disableTokenRes = await processIntegrationSecrets(
    "POST",
    "Bearer token",
    {
      action: "set_status",
      secretKeyName: "TELEGRAM_BOT_TOKEN",
      status: "disabled",
      reason: "Penonaktifan sementara token Telegram",
    },
    adminAClient
  );

  const sendWhileDisabledRes = await processTelegramNotification(
    "Bearer token",
    {
      santriId: 1001,
      message: "Percobaan kirim saat token dinonaktifkan oleh Admin",
    },
    adminAClient
  );

  // Aktifkan kembali token untuk pengujian berikutnya
  await processIntegrationSecrets(
    "POST",
    "Bearer token",
    {
      action: "set_status",
      secretKeyName: "TELEGRAM_BOT_TOKEN",
      status: "active",
    },
    adminAClient
  );

  // 3h. Pengiriman WA terverifikasi oleh Admin mencatat audit_logs & idempotency menahan duplikasi
  let waFetchCount = 0;
  const adminValidWa1 = await processWhatsAppNotification(
    "Bearer token",
    {
      santriId: 1001,
      idempotencyKey: "idem-wa-test-1",
      message: "Laporan Tahfidz Ananda Zaid bin Tsabit: Alhamdulillah tuntas Juz 30.",
    },
    adminAClient,
    (async () => {
      waFetchCount += 1;
      return new Response(JSON.stringify({ status: true, id: "fonnte-1" }), { status: 200 });
    }) as any
  );

  const adminValidWaDuplicate = await processWhatsAppNotification(
    "Bearer token",
    {
      santriId: 1001,
      idempotencyKey: "idem-wa-test-1",
      message: "Laporan Tahfidz Ananda Zaid bin Tsabit: Alhamdulillah tuntas Juz 30.",
    },
    adminAClient,
    (async () => {
      waFetchCount += 1;
      return new Response(JSON.stringify({ status: true, id: "fonnte-2" }), { status: 200 });
    }) as any
  );

  const hasNotificationAuditTrail =
    state.audit_logs.some((a) => a.action === "SEND_TELEGRAM_NOTIFICATION" && a.organization_id === ORG_A) &&
    state.audit_logs.some((a) => a.action === "SEND_WHATSAPP_NOTIFICATION" && a.organization_id === ORG_A);

  recordTest(
    "INT-10",
    "Isolasi token lintas-tenant, penolakan saat token disabled, deduplikasi idempotency, dan audit trail notifikasi berfungsi penuh",
    adminAToTenantBSantri.status === 403 &&
      disableTokenRes.status === 200 &&
      sendWhileDisabledRes.status === 403 &&
      adminValidWa1.status === 200 &&
      adminValidWaDuplicate.status === 200 &&
      adminValidWaDuplicate.data?.deduplicated === true &&
      waFetchCount === 1 &&
      hasNotificationAuditTrail,
    `CrossTenant=${adminAToTenantBSantri.status}, DisabledTokenSend=${sendWhileDisabledRes.status}, WaFetchCount=${waFetchCount}, AuditRecorded=${hasNotificationAuditTrail}`
  );

  // =========================================================================
  // 4. AI CHATBOT PROTECTION & SYSTEM INSTRUCTION ALIGNMENT
  // =========================================================================
  resetChatRateAndQuotaForTesting();

  // 4a. Pengguna tanpa token (401) dan pengguna berstatus invited/pending (403) ditolak
  const unauthClient = createStatefulMockSupabase(state, null);
  const invitedClient = createStatefulMockSupabase(state, "invited-a");

  const chatUnauth = await processChatRequest(undefined, { message: "Halo" }, unauthClient);
  const chatInvited = await processChatRequest("Bearer token", { message: "Halo" }, invitedClient);

  // 4b. Validasi batas ukuran history & panjang pesan
  const chatTooLongMsg = await processChatRequest(
    "Bearer token",
    { message: "A".repeat(1600) },
    adminAClient
  );
  const chatTooManyHistory = await processChatRequest(
    "Bearer token",
    {
      history: Array.from({ length: 25 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "model",
        content: `Pesan ke-${i}`,
      })),
    },
    adminAClient
  );

  // 4c. Sanitasi error internal agar detail error internal / stack trace tidak bocor ke publik
  const chatInternalErrorRes = await processChatRequest(
    "Bearer token",
    { message: "Bagaimana cara mengunci sesi halaqah?" },
    adminAClient,
    async () => {
      throw new Error("INTERNAL_SECRET_STACK_TRACE_KEY_AIzaSy123456789");
    }
  );

  const errorSanitized =
    chatInternalErrorRes.status === 502 &&
    !JSON.stringify(chatInternalErrorRes.data).includes("INTERNAL_SECRET_STACK_TRACE") &&
    !JSON.stringify(chatInternalErrorRes.data).includes("AIzaSy");

  // 4d. Rate limit per menit (maksimal 10 request/menit per user)
  resetChatRateAndQuotaForTesting();
  let lastChatStatus = 200;
  for (let i = 1; i <= 11; i++) {
    const res = await processChatRequest(
      "Bearer token",
      { message: `Pertanyaan ke-${i}` },
      musammiClient,
      async () => ({ text: "Jawaban singkat." })
    );
    lastChatStatus = res.status;
  }

  // 4e. System Instruction selaras dengan 3 role kanonikal dan keputusan produk
  const instructionAligned =
    SYSTEM_INSTRUCTION.includes("superadmin") &&
    SYSTEM_INSTRUCTION.includes("admin") &&
    SYSTEM_INSTRUCTION.includes("musammi") &&
    SYSTEM_INSTRUCTION.includes("Wali Kelas dan Musyrif BUKAN role login") &&
    SYSTEM_INSTRUCTION.includes("Portal Wali Santri");

  recordTest(
    "INT-11",
    "AI Chatbot memblokir unauthenticated/pending user, membatasi ukuran history & rate limit, menyelaraskan System Instruction 3 role, dan menyensor detail error internal",
    chatUnauth.status === 401 &&
      chatInvited.status === 403 &&
      chatTooLongMsg.status === 400 &&
      chatTooManyHistory.status === 400 &&
      errorSanitized &&
      lastChatStatus === 429 &&
      instructionAligned,
    `Unauth=${chatUnauth.status}, Invited=${chatInvited.status}, TooLong=${chatTooLongMsg.status}, TooManyHistory=${chatTooManyHistory.status}, ErrorSanitized=${errorSanitized}, RateLimit11th=${lastChatStatus}`
  );

  const failed = results.filter((r) => !r.passed);
  console.log(`\n=== HASIL VERIFIKASI FASE 3: ${results.length - failed.length} LULUS, ${failed.length} GAGAL ===`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

runFase3Verification().catch((err) => {
  console.error("Fatal error running Fase 3 verification:", err);
  process.exit(1);
});
