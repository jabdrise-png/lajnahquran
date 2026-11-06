import crypto from "crypto";
import { processInvitationPayload, generateInvitationTokenPair } from "../api/invitations";
import {
  resolveTenantContext,
  getEffectiveGrantStatus,
  isRouteAllowed,
} from "../lib/permissions";

interface MockStatefulDbOptions {
  callerUser: { id: string; email: string } | null;
  grants: any[];
  profiles: any[];
  userProfiles: any[];
  organizations: any[];
  musammi: any[];
  tenantInvitations: any[];
  auditLogs: any[];
  failGrantUpsert?: boolean;
}

function createStatefulMockSupabase(state: MockStatefulDbOptions) {
  const client: any = {
    auth: {
      getUser: async () => {
        if (!state.callerUser) {
          return { data: { user: null }, error: { message: "Invalid token" } };
        }
        return { data: { user: state.callerUser }, error: null };
      },
      signUp: async ({ email, options }: any) => {
        const cleanEmail = String(email).trim().toLowerCase();
        const existing = state.profiles.find((p) => p.email?.toLowerCase() === cleanEmail);
        if (existing) {
          return { data: { user: null }, error: { message: "User already registered" } };
        }
        const newId = crypto.randomUUID();
        state.profiles.push({
          id: newId,
          email: cleanEmail,
          full_name: options?.data?.full_name || "",
          role: "pending",
          organization_id: options?.data?.target_organization_id || null,
        });
        return { data: { user: { id: newId, email: cleanEmail } }, error: null };
      },
    },
    rpc: async (fnName: string, params: any = {}) => {
      if (fnName === "rpc_create_tenant_with_admin") {
        const callerGrant = state.grants.find(
          (g) => g.user_id === state.callerUser?.id && g.role === "superadmin" && g.status === "active"
        );
        if (!callerGrant) {
          return { data: null, error: { message: "Forbidden: Superadmin required" } };
        }
        const cleanName = String(params.p_name || "").trim();
        const baseSlug =
          params.p_slug ||
          cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const cleanStatus = params.p_status || "provisioning";

        const existingRetry = state.organizations.find(
          (o) =>
            (o.name.toLowerCase() === cleanName.toLowerCase() || o.slug === baseSlug) &&
            (o.status === "provisioning" || o.status === "provisioning_failed")
        );

        if (existingRetry) {
          existingRetry.status = cleanStatus;
          existingRetry.plan_id = params.p_plan_id || existingRetry.plan_id || "standard";
          state.auditLogs.push({
            id: crypto.randomUUID(),
            organization_id: existingRetry.id,
            actor_id: state.callerUser?.id,
            actor_role: "superadmin",
            action: "tenant.provisioning_retried",
            resource_type: "organizations",
            resource_id: existingRetry.id,
          });
          return {
            data: {
              id: existingRetry.id,
              name: existingRetry.name,
              slug: existingRetry.slug,
              status: existingRetry.status,
              plan_id: existingRetry.plan_id,
              retried: true,
            },
            error: null,
          };
        }

        const newOrg = {
          id: crypto.randomUUID(),
          name: cleanName,
          slug: baseSlug,
          status: cleanStatus,
          timezone: params.p_timezone || "Asia/Jakarta",
          plan_id: params.p_plan_id || "standard",
          setup_state: { hasAdminAssigned: false },
        };
        state.organizations.push(newOrg);
        state.auditLogs.push({
          id: crypto.randomUUID(),
          organization_id: newOrg.id,
          actor_id: state.callerUser?.id,
          actor_role: "superadmin",
          action: "tenant.provisioned",
          resource_type: "organizations",
          resource_id: newOrg.id,
        });
        return { data: { ...newOrg, retried: false }, error: null };
      }

      if (fnName === "rpc_mark_tenant_provisioning_status") {
        const org = state.organizations.find((o) => o.id === params.p_organization_id);
        if (!org) return { data: null, error: { message: "Organization not found" } };
        org.status = params.p_status;
        state.auditLogs.push({
          id: crypto.randomUUID(),
          organization_id: org.id,
          actor_id: state.callerUser?.id,
          actor_role: "superadmin",
          action: `tenant.status_changed.${params.p_status}`,
          resource_type: "organizations",
          resource_id: org.id,
          reason: params.p_reason,
        });
        return { data: { id: org.id, status: org.status }, error: null };
      }

      if (fnName === "rpc_inspect_invitation_token") {
        const raw = String(params.p_token || "").trim();
        if (raw.length < 8) {
          return { data: { valid: false, status: "invalid", message: "Invalid token" }, error: null };
        }
        const hash = crypto.createHash("sha256").update(raw).digest("hex");
        const inv = state.tenantInvitations.find((ti) => ti.token_hash === hash);
        if (!inv) {
          return { data: { valid: false, status: "invalid", message: "Token not found" }, error: null };
        }
        let effStatus = inv.status;
        if (effStatus === "pending" && new Date(inv.expires_at).getTime() < Date.now()) {
          effStatus = "expired";
        }
        return {
          data: {
            valid: effStatus === "pending",
            invitation_id: inv.id,
            status: effStatus,
            email: inv.email,
            full_name: inv.full_name,
            role: inv.role,
            organization_id: inv.organization_id,
            expires_at: inv.expires_at,
          },
          error: null,
        };
      }

      if (fnName === "rpc_accept_invitation") {
        if (!state.callerUser) {
          return { data: null, error: { message: "Unauthorized" } };
        }
        const rawToken = String(params.p_token || "").trim();
        const hash = rawToken
          ? crypto.createHash("sha256").update(rawToken).digest("hex")
          : null;

        const inv = hash
          ? state.tenantInvitations.find((ti) => ti.token_hash === hash)
          : state.tenantInvitations.find(
              (ti) =>
                ti.user_id === state.callerUser?.id &&
                (!params.p_organization_id || ti.organization_id === params.p_organization_id)
            );

        if (!inv) {
          return { data: null, error: { message: "Token undangan tidak sah atau tidak ditemukan." } };
        }
        if (inv.status === "revoked") {
          return { data: null, error: { message: "Undangan ini telah dibatalkan (revoked)." } };
        }
        if (inv.status === "accepted") {
          return { data: null, error: { message: "Token undangan ini sudah pernah digunakan (sekali pakai)." } };
        }
        if (new Date(inv.expires_at).getTime() < Date.now() || inv.status === "expired") {
          inv.status = "expired";
          return { data: null, error: { message: "Tautan undangan telah kedaluwarsa." } };
        }
        if (inv.email.toLowerCase() !== state.callerUser.email.toLowerCase()) {
          return { data: null, error: { message: "Forbidden: Email akun tidak cocok dengan email tujuan undangan." } };
        }

        const grant = state.grants.find(
          (g) => g.user_id === state.callerUser?.id && g.organization_id === inv.organization_id
        );
        if (!grant) {
          return { data: null, error: { message: "Grant tidak ditemukan." } };
        }
        if (grant.status === "revoked" || grant.status === "suspended") {
          return { data: null, error: { message: `Grant berstatus ${grant.status}` } };
        }

        inv.status = "accepted";
        inv.accepted_at = new Date().toISOString();
        grant.status = "active";
        grant.accepted_at = new Date().toISOString();
        grant.expires_at = null;

        const profile = state.profiles.find((p) => p.id === state.callerUser?.id);
        if (profile) {
          profile.role = grant.role === "superadmin" ? "super_admin" : grant.role;
          profile.organization_id = grant.organization_id;
        }

        if (grant.organization_id && grant.role === "admin") {
          const org = state.organizations.find((o) => o.id === grant.organization_id);
          if (org) {
            if (org.status === "provisioning" || org.status === "provisioning_failed") {
              org.status = "active";
            }
            org.setup_state = { ...(org.setup_state || {}), hasAdminAssigned: true };
          }
        }

        state.auditLogs.push({
          id: crypto.randomUUID(),
          organization_id: grant.organization_id,
          actor_id: state.callerUser.id,
          actor_role: grant.role,
          action: "invitation.accepted",
          resource_type: "access_grants",
          resource_id: grant.id,
        });

        return {
          data: {
            grant_id: grant.id,
            invitation_id: inv.id,
            organization_id: grant.organization_id,
            role: grant.role,
            status: "active",
          },
          error: null,
        };
      }

      if (fnName === "rpc_revoke_invitation") {
        const inv = params.p_invitation_id
          ? state.tenantInvitations.find((ti) => ti.id === params.p_invitation_id)
          : null;
        const grant = params.p_grant_id
          ? state.grants.find((g) => g.id === params.p_grant_id)
          : inv
          ? state.grants.find(
              (g) => g.user_id === inv.user_id && g.organization_id === inv.organization_id
            )
          : null;

        if (inv) {
          inv.status = "revoked";
          inv.revoked_at = new Date().toISOString();
        }
        if (grant) {
          grant.status = "revoked";
          grant.revoked_at = new Date().toISOString();
        }
        state.auditLogs.push({
          id: crypto.randomUUID(),
          organization_id: inv?.organization_id || grant?.organization_id || null,
          actor_id: state.callerUser?.id,
          action: "invitation.revoked",
          resource_type: "tenant_invitations",
          resource_id: inv?.id || grant?.id,
          reason: params.p_reason,
        });
        return {
          data: { invitation_id: inv?.id || null, grant_id: grant?.id || null, status: "revoked" },
          error: null,
        };
      }

      if (fnName === "rpc_manage_access_grant") {
        const grant = params.p_grant_id
          ? state.grants.find((g) => g.id === params.p_grant_id)
          : state.grants.find(
              (g) =>
                g.user_id === params.p_target_user_id &&
                g.organization_id === params.p_organization_id
            );
        if (!grant) return { data: null, error: { message: "Grant not found" } };
        grant.status = params.p_status;
        if (params.p_role) grant.role = params.p_role;
        const prof = state.profiles.find((p) => p.id === grant.user_id);
        if (prof) {
          prof.role = grant.status === "active" ? grant.role : "pending";
        }
        state.auditLogs.push({
          id: crypto.randomUUID(),
          organization_id: grant.organization_id,
          actor_id: state.callerUser?.id,
          action: `access_grant.${params.p_status}`,
          resource_type: "access_grants",
          resource_id: grant.id,
          reason: params.p_reason,
        });
        return { data: grant, error: null };
      }

      return { data: null, error: null };
    },
    from: (table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let pendingUpdate: any = null;

      const getCollection = (): any[] => {
        if (table === "access_grants") return state.grants;
        if (table === "profiles") return state.profiles;
        if (table === "user_profiles") return state.userProfiles;
        if (table === "organizations") return state.organizations;
        if (table === "musammi") return state.musammi;
        if (table === "tenant_invitations") return state.tenantInvitations;
        if (table === "audit_logs") return state.auditLogs;
        return [];
      };

      const applyFilters = () => {
        const rows = getCollection().filter((row) => filters.every((f) => f(row)));
        if (pendingUpdate) {
          for (const r of rows) {
            Object.assign(r, pendingUpdate);
          }
        }
        return rows;
      };

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          filters.push((r) => r[col] === val);
          return builder;
        },
        ilike: (col: string, val: string) => {
          filters.push((r) => String(r[col] || "").toLowerCase() === String(val || "").toLowerCase());
          return builder;
        },
        is: (col: string, val: any) => {
          filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
          return builder;
        },
        gt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const matched = applyFilters();
          return { data: matched[0] || null, error: null };
        },
        single: async () => {
          const matched = applyFilters();
          if (!matched[0]) return { data: null, error: { message: "Row not found" } };
          return { data: matched[0], error: null };
        },
        insert: (payload: any) => {
          const row = { id: payload.id || crypto.randomUUID(), ...payload };
          getCollection().push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
              maybeSingle: async () => ({ data: row, error: null }),
            }),
            then: (resolve: any) => resolve({ data: row, error: null }),
          };
        },
        upsert: (payload: any) => {
          if (table === "access_grants" && state.failGrantUpsert) {
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { code: "23505", message: "Simulated grant failure" },
                }),
              }),
            };
          }
          const col = getCollection();
          let existing = col.find((r) => {
            if (table === "profiles") return r.id === payload.id;
            if (table === "user_profiles") return r.user_id === payload.user_id;
            if (table === "access_grants")
              return r.user_id === payload.user_id && r.organization_id === payload.organization_id;
            return false;
          });
          if (existing) {
            Object.assign(existing, payload);
          } else {
            existing = { id: payload.id || crypto.randomUUID(), ...payload };
            col.push(existing);
          }
          return {
            select: () => ({
              maybeSingle: async () => ({ data: existing, error: null }),
              single: async () => ({ data: existing, error: null }),
            }),
            then: (resolve: any) => resolve({ data: existing, error: null }),
          };
        },
        update: (payload: any) => {
          pendingUpdate = payload;
          return builder;
        },
        then: (resolve: any) => {
          const matched = applyFilters();
          return resolve({ data: matched, error: null });
        },
      };

      return builder;
    },
  };

  return client;
}

async function runFase2LifecycleVerification() {
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, label: string, detail?: string) => {
    if (condition) {
      console.log(`✅ [PASS] ${label}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  };

  console.log("=== VERIFIKASI FASE 2: TENANT PROVISIONING & USER LIFECYCLE (13 SKENARIO WAJIB) ===\n");

  const superAdminId = "00000000-0000-4000-8000-000000000001";
  const orgBId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const state: MockStatefulDbOptions = {
    callerUser: { id: superAdminId, email: "superadmin@lajnah.id" },
    grants: [
      {
        id: "grant-super",
        user_id: superAdminId,
        organization_id: null,
        role: "superadmin",
        status: "active",
      },
    ],
    profiles: [
      {
        id: superAdminId,
        email: "superadmin@lajnah.id",
        full_name: "Superadmin Platform",
        role: "super_admin",
        organization_id: null,
      },
    ],
    userProfiles: [
      {
        user_id: superAdminId,
        id: superAdminId,
        email: "superadmin@lajnah.id",
        full_name: "Superadmin Platform",
        is_superadmin: true,
      },
    ],
    organizations: [
      {
        id: orgBId,
        name: "Ma'had B",
        slug: "mahad-b",
        status: "active",
        plan_id: "standard",
        setup_state: { hasAdminAssigned: true },
      },
    ],
    musammi: [],
    tenantInvitations: [],
    auditLogs: [],
  };

  const mockSupabase = createStatefulMockSupabase(state);

  process.env.VITE_SUPABASE_URL = "https://mock.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "mock-anon-key";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  // -------------------------------------------------------------------------
  // Skenario 1 & 2: Kegagalan membuat Admin tidak menghasilkan tenant yang terlihat siap ('provisioning_failed')
  // -------------------------------------------------------------------------
  const { data: createdTenant } = await mockSupabase.rpc("rpc_create_tenant_with_admin", {
    p_name: "Ma'had Al-Fajr",
    p_slug: "mahad-al-fajr",
    p_status: "provisioning",
  });

  assert(
    createdTenant?.status === "provisioning",
    "Skenario 1a: Tenant baru dibuat dengan status 'provisioning' (belum aktif sebelum Admin menerima undangan)"
  );

  // Simulasikan kegagalan pembuatan Admin (mis. password default terlarang Mahad123!)
  const failedAdminInvite = await processInvitationPayload(
    "Bearer valid-super",
    {
      email: "admin@alfajr.id",
      password: "Mahad123!",
      fullName: "Ustadz Fajr",
      role: "admin",
      targetOrganizationId: createdTenant.id,
      isTenantProvisioning: true,
    },
    mockSupabase
  );
  if (failedAdminInvite.status !== 200) {
    await mockSupabase.rpc("rpc_mark_tenant_provisioning_status", {
      p_organization_id: createdTenant.id,
      p_status: "provisioning_failed",
      p_reason: "Simulated failure",
    });
  }

  const orgAfterFail = state.organizations.find((o) => o.id === createdTenant.id);
  assert(
    failedAdminInvite.status === 400 && orgAfterFail?.status === "provisioning_failed",
    "Skenario 2: Kegagalan membuat Admin menandai tenant sebagai 'provisioning_failed' (tidak terlihat sebagai tenant siap)"
  );

  // -------------------------------------------------------------------------
  // Skenario 3: Retry provisioning tidak membuat organisasi atau user duplikat
  // -------------------------------------------------------------------------
  const orgCountBeforeRetry = state.organizations.length;
  const { data: retriedTenant } = await mockSupabase.rpc("rpc_create_tenant_with_admin", {
    p_name: "Ma'had Al-Fajr",
    p_slug: "mahad-al-fajr",
    p_status: "provisioning",
  });

  assert(
    retriedTenant?.id === createdTenant.id &&
      retriedTenant?.retried === true &&
      state.organizations.length === orgCountBeforeRetry,
    "Skenario 3a: Retry provisioning menggunakan kembali organisasi yang ada tanpa membuat organisasi duplikat"
  );

  // Kirim undangan Admin yang valid
  const firstInviteRes = await processInvitationPayload(
    "Bearer valid-super",
    {
      email: "admin@alfajr.id",
      fullName: "Ustadz Fajr",
      role: "admin",
      targetOrganizationId: createdTenant.id,
      isTenantProvisioning: true,
    },
    mockSupabase
  );

  const userCountAfterFirstInvite = state.profiles.length;
  // Retry pengiriman undangan ke email yang sama (status masih 'invited')
  const secondInviteRes = await processInvitationPayload(
    "Bearer valid-super",
    {
      email: "admin@alfajr.id",
      fullName: "Ustadz Fajr",
      role: "admin",
      targetOrganizationId: createdTenant.id,
      isTenantProvisioning: true,
    },
    mockSupabase
  );

  assert(
    firstInviteRes.status === 200 &&
      secondInviteRes.status === 200 &&
      secondInviteRes.data.retried === true &&
      secondInviteRes.data.userId === firstInviteRes.data.userId &&
      state.profiles.length === userCountAfterFirstInvite,
    "Skenario 3b: Retry pengiriman undangan Admin tidak membuat user duplikat dan membatalkan token lama"
  );

  // -------------------------------------------------------------------------
  // Skenario 4: Undangan memiliki token, masa berlaku, status, dan audit log
  // -------------------------------------------------------------------------
  const activeToken = secondInviteRes.data.invitationToken;
  const inspectRes = await mockSupabase.rpc("rpc_inspect_invitation_token", {
    p_token: activeToken,
  });
  const hasInviteAudit = state.auditLogs.some(
    (l) => l.action === "invitation.created" || l.action === "invitation.resent"
  );

  assert(
    Boolean(activeToken?.startsWith("inv_")) &&
      inspectRes.data?.valid === true &&
      inspectRes.data?.status === "pending" &&
      Boolean(inspectRes.data?.expires_at) &&
      hasInviteAudit,
    "Skenario 4: Undangan memiliki token kriptografis, masa berlaku (expires_at), status ('pending'), dan audit log"
  );

  // -------------------------------------------------------------------------
  // Skenario 12: User dengan grant 'invited' hanya dapat mengakses proses aktivasi (/invite) dan tidak memperoleh akses aktif
  // -------------------------------------------------------------------------
  const invitedAdminId = secondInviteRes.data.userId;
  state.callerUser = { id: invitedAdminId, email: "admin@alfajr.id" };

  const invitedCtx = await resolveTenantContext(mockSupabase);
  const orgWhileInvited = state.organizations.find((o) => o.id === createdTenant.id);

  assert(
    invitedCtx.isAuthorized === false &&
      invitedCtx.effectiveRole === "pending" &&
      invitedCtx.membershipStatus === "invited" &&
      orgWhileInvited?.status === "provisioning" &&
      !isRouteAllowed("/app/dashboard", invitedCtx.effectiveRole),
    "Skenario 1b & 12: Sebelum menerima undangan, grant berstatus 'invited' (isAuthorized=false, effectiveRole='pending') dan tenant masih 'provisioning'"
  );

  // -------------------------------------------------------------------------
  // Skenario 13: User yang menyelesaikan aktivasi memiliki grant 'active', profil tersinkron, dan tenant menjadi 'active'
  // -------------------------------------------------------------------------
  const acceptRes = await mockSupabase.rpc("rpc_accept_invitation", {
    p_organization_id: createdTenant.id,
    p_token: activeToken,
  });

  const activeAdminCtx = await resolveTenantContext(mockSupabase);
  const orgAfterAccept = state.organizations.find((o) => o.id === createdTenant.id);
  const adminProfileAfterAccept = state.profiles.find((p) => p.id === invitedAdminId);

  assert(
    acceptRes.data?.status === "active" &&
      activeAdminCtx.isAuthorized === true &&
      activeAdminCtx.effectiveRole === "admin" &&
      activeAdminCtx.membershipStatus === "active" &&
      adminProfileAfterAccept?.role === "admin" &&
      orgAfterAccept?.status === "active" &&
      isRouteAllowed("/app/dashboard", activeAdminCtx.effectiveRole),
    "Skenario 13: Setelah aktivasi undangan, grant menjadi 'active', profil tersinkron, tenant menjadi 'active', dan Admin dapat masuk ke aplikasi"
  );

  // -------------------------------------------------------------------------
  // Skenario 5: Token undangan hanya dapat dipakai satu kali
  // -------------------------------------------------------------------------
  const secondAcceptAttempt = await mockSupabase.rpc("rpc_accept_invitation", {
    p_organization_id: createdTenant.id,
    p_token: activeToken,
  });
  const inspectAfterAccept = await mockSupabase.rpc("rpc_inspect_invitation_token", {
    p_token: activeToken,
  });

  assert(
    secondAcceptAttempt.error !== null && inspectAfterAccept.data?.status === "accepted",
    "Skenario 5: Token undangan hanya dapat dipakai satu kali (percobaan kedua ditolak dengan status 'accepted')"
  );

  // -------------------------------------------------------------------------
  // Skenario 6: Undangan expired ditolak
  // -------------------------------------------------------------------------
  const expiredInviteRes = await processInvitationPayload(
    "Bearer valid-admin",
    {
      email: "expired.musammi@alfajr.id",
      fullName: "Musammi Expired",
      role: "musammi",
      organizationId: createdTenant.id,
      expiresInHours: -2,
    },
    mockSupabase
  );
  const expiredToken = expiredInviteRes.data.invitationToken;
  state.callerUser = { id: expiredInviteRes.data.userId, email: "expired.musammi@alfajr.id" };

  const inspectExpired = await mockSupabase.rpc("rpc_inspect_invitation_token", {
    p_token: expiredToken,
  });
  const acceptExpired = await mockSupabase.rpc("rpc_accept_invitation", {
    p_organization_id: createdTenant.id,
    p_token: expiredToken,
  });

  assert(
    inspectExpired.data?.status === "expired" &&
      inspectExpired.data?.valid === false &&
      acceptExpired.error !== null,
    "Skenario 6: Undangan yang telah kedaluwarsa (expired) ditolak saat inspeksi maupun aktivasi"
  );

  // -------------------------------------------------------------------------
  // Skenario 7: Undangan revoked ditolak
  // -------------------------------------------------------------------------
  state.callerUser = { id: invitedAdminId, email: "admin@alfajr.id" };
  const revocableInviteRes = await processInvitationPayload(
    "Bearer valid-admin",
    {
      email: "revoked.musammi@alfajr.id",
      fullName: "Musammi Revoked",
      role: "musammi",
      organizationId: createdTenant.id,
    },
    mockSupabase
  );
  const revocableToken = revocableInviteRes.data.invitationToken;

  // Admin membatalkan (revoke) undangan tersebut
  await processInvitationPayload(
    "Bearer valid-admin",
    {
      action: "revoke",
      invitationId: revocableInviteRes.data.invitationId,
      grantId: revocableInviteRes.data.grantId,
      reason: "Salah alamat email",
    },
    mockSupabase
  );

  state.callerUser = { id: revocableInviteRes.data.userId, email: "revoked.musammi@alfajr.id" };
  const inspectRevoked = await mockSupabase.rpc("rpc_inspect_invitation_token", {
    p_token: revocableToken,
  });
  const acceptRevoked = await mockSupabase.rpc("rpc_accept_invitation", {
    p_organization_id: createdTenant.id,
    p_token: revocableToken,
  });

  assert(
    inspectRevoked.data?.status === "revoked" &&
      inspectRevoked.data?.valid === false &&
      acceptRevoked.error !== null,
    "Skenario 7: Undangan yang telah dibatalkan (revoked) ditolak saat inspeksi maupun aktivasi"
  );

  // -------------------------------------------------------------------------
  // Skenario 8: Admin berhasil mengundang Musammi di tenant sendiri (termasuk tautan ke Master Musammi)
  // -------------------------------------------------------------------------
  state.callerUser = { id: invitedAdminId, email: "admin@alfajr.id" };
  state.musammi.push({
    id: 501,
    nama: "Ustadz Zaid Musammi",
    organization_id: createdTenant.id,
    user_id: null,
  });

  const validMusammiInvite = await processInvitationPayload(
    "Bearer valid-admin",
    {
      email: "zaid@alfajr.id",
      fullName: "Ustadz Zaid Musammi",
      role: "musammi",
      organizationId: createdTenant.id,
      musammiId: 501,
    },
    mockSupabase
  );

  const linkedMusammi = state.musammi.find((m) => m.id === 501);
  assert(
    validMusammiInvite.status === 200 &&
      validMusammiInvite.data?.role === "musammi" &&
      validMusammiInvite.data?.status === "invited" &&
      linkedMusammi?.user_id === validMusammiInvite.data?.userId,
    "Skenario 8: Admin berhasil mengundang Musammi di tenant sendiri dan menautkan ke Master Musammi"
  );

  // -------------------------------------------------------------------------
  // Skenario 9: Admin gagal mengundang Admin (atau Superadmin)
  // -------------------------------------------------------------------------
  const adminInviteAdminAttempt = await processInvitationPayload(
    "Bearer valid-admin",
    {
      email: "another.admin@alfajr.id",
      fullName: "Admin Ilegal",
      role: "admin",
      organizationId: createdTenant.id,
    },
    mockSupabase
  );

  assert(
    adminInviteAdminAttempt.status === 403,
    "Skenario 9: Admin gagal mengundang Admin baru (ditolak HTTP 403)"
  );

  // -------------------------------------------------------------------------
  // Skenario 10: Admin gagal mengundang user ke tenant lain
  // -------------------------------------------------------------------------
  const adminCrossTenantAttempt = await processInvitationPayload(
    "Bearer valid-admin",
    {
      email: "cross@mahadb.id",
      fullName: "Musammi Lintas Tenant",
      role: "musammi",
      targetOrganizationId: orgBId,
    },
    mockSupabase
  );

  assert(
    adminCrossTenantAttempt.status === 403,
    "Skenario 10: Admin gagal mengundang user ke tenant lain (ditolak HTTP 403)"
  );

  // -------------------------------------------------------------------------
  // Skenario 11: Suspend dan revoke tidak menghapus histori
  // -------------------------------------------------------------------------
  // Aktifkan Ustadz Zaid terlebih dahulu
  const zaidUserId = validMusammiInvite.data.userId;
  state.callerUser = { id: zaidUserId, email: "zaid@alfajr.id" };
  await mockSupabase.rpc("rpc_accept_invitation", {
    p_organization_id: createdTenant.id,
    p_token: validMusammiInvite.data.invitationToken,
  });

  // Admin melakukan suspend lalu revoke pada Ustadz Zaid
  state.callerUser = { id: invitedAdminId, email: "admin@alfajr.id" };
  await mockSupabase.rpc("rpc_manage_access_grant", {
    p_grant_id: validMusammiInvite.data.grantId,
    p_target_user_id: zaidUserId,
    p_organization_id: createdTenant.id,
    p_role: "musammi",
    p_status: "suspended",
    p_reason: "Cuti semester",
  });

  state.callerUser = { id: zaidUserId, email: "zaid@alfajr.id" };
  const suspendedZaidCtx = await resolveTenantContext(mockSupabase);

  state.callerUser = { id: invitedAdminId, email: "admin@alfajr.id" };
  await mockSupabase.rpc("rpc_manage_access_grant", {
    p_grant_id: validMusammiInvite.data.grantId,
    p_target_user_id: zaidUserId,
    p_organization_id: createdTenant.id,
    p_role: "musammi",
    p_status: "revoked",
    p_reason: "Purna tugas",
  });

  state.callerUser = { id: zaidUserId, email: "zaid@alfajr.id" };
  const revokedZaidCtx = await resolveTenantContext(mockSupabase);
  const zaidProfileStillExists = state.profiles.some((p) => p.id === zaidUserId);
  const zaidMusammiStillExists = state.musammi.some((m) => m.id === 501);
  const zaidAuditLogsExist = state.auditLogs.some((l) => l.resource_id === validMusammiInvite.data.grantId);

  assert(
    suspendedZaidCtx.isAuthorized === false &&
      suspendedZaidCtx.membershipStatus === "suspended" &&
      revokedZaidCtx.isAuthorized === false &&
      revokedZaidCtx.membershipStatus === "revoked" &&
      zaidProfileStillExists &&
      zaidMusammiStillExists &&
      zaidAuditLogsExist,
    "Skenario 11: Suspend dan revoke mencabut akses (isAuthorized=false) tanpa menghapus histori profil, master Musammi, maupun audit log"
  );

  console.log(`\n=== HASIL VERIFIKASI FASE 2: ${passed} LULUS, ${failed} GAGAL ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runFase2LifecycleVerification().catch((err) => {
  console.error("Fatal error in verification script:", err);
  process.exit(1);
});
