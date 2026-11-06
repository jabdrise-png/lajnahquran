import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type CanonicalServerRole = "superadmin" | "admin" | "musammi";
export type GrantMembershipStatus = "invited" | "active" | "suspended" | "revoked" | "expired" | "none";

export interface ServerSupportSession {
  id: string;
  organizationId: string;
  mode: "read_only" | "read_write";
  reason: string;
  expiresAt: string;
}

export interface ServerTenantContextResult {
  ok: boolean;
  status: number;
  error?: string;
  userId: string | null;
  userEmail: string | null;
  organizationId: string | null;
  effectiveRole: CanonicalServerRole | "pending" | "unknown";
  membershipStatus: GrantMembershipStatus;
  supportSession: ServerSupportSession | null;
  userClient?: SupabaseClient;
  adminClient?: SupabaseClient | null;
}

const getEnv = (key: string) =>
  (typeof process !== "undefined" && process.env ? process.env[key] : undefined) || "";

export function normalizeServerRole(raw?: string | null): CanonicalServerRole | "pending" | "unknown" {
  if (!raw) return "unknown";
  const r = raw.trim().toLowerCase();
  if (r === "super_admin" || r === "superadmin") return "superadmin";
  if (r === "admin" || r === "admin_mahad") return "admin";
  if (r === "musammi" || r === "pengajar") return "musammi";
  if (r === "pending" || r === "invited") return "pending";
  return "unknown";
}

export function isTimestampExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return !Number.isNaN(ts) && ts <= Date.now();
}

export function evaluateGrantStatus(grant: {
  status?: string | null;
  expires_at?: string | null;
}): GrantMembershipStatus {
  if (isTimestampExpired(grant.expires_at)) {
    return "expired";
  }
  const s = (grant.status || "").trim().toLowerCase();
  if (s === "active" || s === "invited" || s === "suspended" || s === "revoked") {
    return s;
  }
  return "revoked";
}

/**
 * Authoritative Server-Side Tenant & Role Resolver (Fase 1 Security Hardening)
 *
 * Enforces:
 * 1. Valid Bearer JWT token via Supabase Auth.
 * 2. `access_grants` as the authoritative source of truth for role & membership status.
 * 3. Never falls back to `profiles` if any row exists in `access_grants` for the user.
 * 4. Rejects `invited`, `suspended`, `revoked`, or `expired` (`expires_at <= now()`) grants.
 * 5. Resolves explicit `organizationId` context without random `.find(status === 'active')`.
 * 6. Validates Superadmin Support Access Sessions against `support_access_sessions` in the DB,
 *    including `read_only` vs `read_write` mode enforcement.
 */
export async function resolveServerTenantContext(options: {
  authHeader?: string;
  requestedOrganizationId?: string | null;
  requireWrite?: boolean;
  requireOrganization?: boolean;
  requireSupportSessionForSuperadmin?: boolean;
  allowedRoles?: CanonicalServerRole[];
  injectedClient?: any;
}): Promise<ServerTenantContextResult> {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!options.injectedClient && (!supabaseUrl || !supabaseAnonKey)) {
    return {
      ok: false,
      status: 500,
      error: "Konfigurasi Supabase URL/Key belum diatur di server.",
      userId: null,
      userEmail: null,
      organizationId: null,
      effectiveRole: "unknown",
      membershipStatus: "none",
      supportSession: null,
    };
  }

  const token = options.authHeader?.startsWith("Bearer ")
    ? options.authHeader.slice(7).trim()
    : null;

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Token sesi autentikasi tidak ditemukan.",
      userId: null,
      userEmail: null,
      organizationId: null,
      effectiveRole: "unknown",
      membershipStatus: "none",
      supportSession: null,
    };
  }

  const userClient: any = options.injectedClient
    ? options.injectedClient
    : createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      });

  const adminClient: any = options.injectedClient
    ? options.injectedClient
    : serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      : null;

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: Sesi tidak valid atau telah berakhir.",
      userId: null,
      userEmail: null,
      organizationId: null,
      effectiveRole: "unknown",
      membershipStatus: "none",
      supportSession: null,
    };
  }

  const userId = userData.user.id;
  const userEmail = userData.user.email || null;
  const dbReader = adminClient || userClient;

  // 1. Fetch profile for default organization pointer (and legacy fallback ONLY if 0 grants exist)
  const { data: profile } = await dbReader
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", userId)
    .maybeSingle();

  const profileOrgId: string | null = profile?.organization_id || null;

  // 2. Fetch all access_grants for this user
  let grants: Array<{
    id: string;
    user_id: string;
    organization_id: string | null;
    role: string;
    status: string;
    expires_at?: string | null;
  }> = [];
  let grantsTableExists = true;

  try {
    const { data: grantRows, error: grantErr } = await dbReader
      .from("access_grants")
      .select("id, user_id, organization_id, role, status, expires_at")
      .eq("user_id", userId);

    if (grantErr && grantErr.code === "42P01") {
      grantsTableExists = false;
    } else if (Array.isArray(grantRows)) {
      grants = grantRows;
    }
  } catch {
    grantsTableExists = false;
  }

  // 3. Check Superadmin authority
  let isSuperadmin = false;
  if (grantsTableExists && grants.length > 0) {
    const superGrant = grants.find((g) => normalizeServerRole(g.role) === "superadmin");
    if (superGrant) {
      const superStatus = evaluateGrantStatus(superGrant);
      if (superStatus === "active") {
        isSuperadmin = true;
      } else if (grants.length === 1) {
        return {
          ok: false,
          status: 403,
          error: `Akses ditolak: Grant Superadmin Anda berstatus ${superStatus}.`,
          userId,
          userEmail,
          organizationId: null,
          effectiveRole: "pending",
          membershipStatus: superStatus,
          supportSession: null,
        };
      }
    }
  } else if (!grantsTableExists || grants.length === 0) {
    if (normalizeServerRole(profile?.role) === "superadmin") {
      isSuperadmin = true;
    }
  }

  if (isSuperadmin) {
    const targetOrgId = options.requestedOrganizationId || profileOrgId || null;
    let activeSupportSession: ServerSupportSession | null = null;

    if (targetOrgId) {
      try {
        const { data: supportRows } = await dbReader
          .from("support_access_sessions")
          .select("id, organization_id, mode, reason, expires_at, ended_at")
          .eq("superadmin_user_id", userId)
          .eq("organization_id", targetOrgId)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1);

        const latestSupport = Array.isArray(supportRows) ? supportRows[0] : null;
        if (latestSupport && !isTimestampExpired(latestSupport.expires_at)) {
          activeSupportSession = {
            id: latestSupport.id,
            organizationId: latestSupport.organization_id,
            mode: latestSupport.mode === "read_write" ? "read_write" : "read_only",
            reason: latestSupport.reason,
            expiresAt: latestSupport.expires_at,
          };
        }
      } catch {
        // support_access_sessions table might not exist in legacy schema
      }

      const hasDirectAdminGrantInTargetOrg = grants.some(
        (g) =>
          g.organization_id === targetOrgId &&
          normalizeServerRole(g.role) === "admin" &&
          evaluateGrantStatus(g.status ? g : { status: "revoked" }) === "active"
      );

      if (
        options.requireSupportSessionForSuperadmin &&
        !activeSupportSession &&
        !hasDirectAdminGrantInTargetOrg &&
        targetOrgId !== profileOrgId
      ) {
        return {
          ok: false,
          status: 403,
          error:
            "Akses ditolak: Superadmin wajib memiliki Sesi Support Access aktif untuk mengakses integrasi atau notifikasi tenant.",
          userId,
          userEmail,
          organizationId: targetOrgId,
          effectiveRole: "superadmin",
          membershipStatus: "active",
          supportSession: null,
        };
      }

      if (
        options.requireWrite &&
        activeSupportSession &&
        activeSupportSession.mode === "read_only"
      ) {
        return {
          ok: false,
          status: 403,
          error:
            "Akses ditolak: Sesi Support Access Anda berada dalam mode Read-Only dan tidak diizinkan mengubah data tenant.",
          userId,
          userEmail,
          organizationId: targetOrgId,
          effectiveRole: "superadmin",
          membershipStatus: "active",
          supportSession: activeSupportSession,
        };
      }
    }

    if (options.requireOrganization && !targetOrgId) {
      return {
        ok: false,
        status: 400,
        error: "Konteks organisasi (organizationId) wajib disertakan.",
        userId,
        userEmail,
        organizationId: null,
        effectiveRole: "superadmin",
        membershipStatus: "active",
        supportSession: null,
      };
    }

    return {
      ok: true,
      status: 200,
      userId,
      userEmail,
      organizationId: targetOrgId,
      effectiveRole: "superadmin",
      membershipStatus: "active",
      supportSession: activeSupportSession,
      userClient,
      adminClient,
    };
  }

  // 4. Tenant Role Resolution (Admin / Musammi) from authoritative access_grants
  if (grantsTableExists && grants.length > 0) {
    const tenantGrants = grants.filter((g) => Boolean(g.organization_id));

    // Determine explicit organization context:
    // If requestedOrganizationId is provided, verify it matches caller's grant.
    // Otherwise use profileOrgId or the single unambiguous tenant grant.
    const explicitOrgId =
      options.requestedOrganizationId ||
      profileOrgId ||
      (tenantGrants.length === 1 ? tenantGrants[0].organization_id : null);

    if (!explicitOrgId) {
      return {
        ok: false,
        status: 403,
        error: "Akses ditolak: Konteks organisasi tidak ditemukan atau ambigu.",
        userId,
        userEmail,
        organizationId: null,
        effectiveRole: "pending",
        membershipStatus: "none",
        supportSession: null,
      };
    }

    // Prevent cross-tenant access if caller's profile belongs to a different org and has no grant in requested org
    const matchingOrgGrants = tenantGrants.filter((g) => g.organization_id === explicitOrgId);
    if (matchingOrgGrants.length === 0) {
      return {
        ok: false,
        status: 403,
        error: "Akses lintas organisasi ditolak: Anda tidak memiliki grant pada lembaga ini.",
        userId,
        userEmail,
        organizationId: explicitOrgId,
        effectiveRole: "pending",
        membershipStatus: "none",
        supportSession: null,
      };
    }

    const selectedGrant = [...matchingOrgGrants].sort((a, b) => {
      const rA = normalizeServerRole(a.role) === "admin" ? 0 : 1;
      const rB = normalizeServerRole(b.role) === "admin" ? 0 : 1;
      return rA - rB;
    })[0];

    const grantStatus = evaluateGrantStatus(selectedGrant);
    if (grantStatus !== "active") {
      return {
        ok: false,
        status: 403,
        error: `Akses ditolak: Status keanggotaan Anda pada lembaga ini adalah '${grantStatus}'.`,
        userId,
        userEmail,
        organizationId: explicitOrgId,
        effectiveRole: "pending",
        membershipStatus: grantStatus,
        supportSession: null,
      };
    }

    const canonicalRole = normalizeServerRole(selectedGrant.role);
    if (canonicalRole !== "admin" && canonicalRole !== "musammi") {
      return {
        ok: false,
        status: 403,
        error: "Akses ditolak: Role keanggotaan tidak valid.",
        userId,
        userEmail,
        organizationId: explicitOrgId,
        effectiveRole: "pending",
        membershipStatus: "revoked",
        supportSession: null,
      };
    }

    return {
      ok: true,
      status: 200,
      userId,
      userEmail,
      organizationId: explicitOrgId,
      effectiveRole: canonicalRole,
      membershipStatus: "active",
      supportSession: null,
      userClient,
      adminClient,
    };
  }

  // 5. Legacy fallback ONLY if user has 0 rows in access_grants
  const legacyRole = normalizeServerRole(profile?.role);
  if (legacyRole !== "admin" && legacyRole !== "musammi") {
    return {
      ok: false,
      status: 403,
      error: "Akses ditolak: Akun Anda belum aktif atau sedang menunggu persetujuan.",
      userId,
      userEmail,
      organizationId: profileOrgId,
      effectiveRole: "pending",
      membershipStatus: "invited",
      supportSession: null,
    };
  }

  if (
    options.requestedOrganizationId &&
    profileOrgId &&
    options.requestedOrganizationId !== profileOrgId
  ) {
    return {
      ok: false,
      status: 403,
      error: "Akses lintas organisasi ditolak.",
      userId,
      userEmail,
      organizationId: profileOrgId,
      effectiveRole: legacyRole,
      membershipStatus: "active",
      supportSession: null,
    };
  }

  const finalLegacyOrgId = options.requestedOrganizationId || profileOrgId;
  if (options.requireOrganization && !finalLegacyOrgId) {
    return {
      ok: false,
      status: 403,
      error: "Akses ditolak: Organisasi pengguna tidak ditemukan.",
      userId,
      userEmail,
      organizationId: null,
      effectiveRole: legacyRole,
      membershipStatus: "none",
      supportSession: null,
    };
  }

  return {
    ok: true,
    status: 200,
    userId,
    userEmail,
    organizationId: finalLegacyOrgId,
    effectiveRole: legacyRole,
    membershipStatus: "active",
    supportSession: null,
    userClient,
    adminClient,
  };
}
