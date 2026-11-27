import { ActiveRoleStore, pilihPeranAktif } from './activeRole';
import type { Page } from '../types';
import { SAAS_ROUTE_MAP, PATH_ALIAS_MAP, type CanonicalRole, type MembershipStatus, type SaaSRouteConfig } from './rute';
export * from './rute';

export function normalizeRole(raw?: string | null): CanonicalRole | 'pending' | 'unknown' {
  if (!raw) return 'unknown';
  const r = raw.trim().toLowerCase();
  if (r === 'super_admin' || r === 'superadmin') return 'superadmin';
  if (r === 'admin' || r === 'admin_mahad') return 'admin';
  if (r === 'musammi' || r === 'pengajar') return 'musammi';
  if (r === 'pending' || r === 'invited') return 'pending';
  return 'unknown';
}

export function formatCanonicalRoleLabel(raw?: string | null): string {
  const role = normalizeRole(raw);
  if (role === 'superadmin') return 'Superadmin Platform';
  if (role === 'admin') return 'Admin Lembaga';
  if (role === 'musammi') return 'Musammi';
  if (role === 'pending') return 'Menunggu Aktivasi';
  return 'Pengguna';
}

export function resolveRouteByPath(pathname: string): SaaSRouteConfig | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const canonicalPath = PATH_ALIAS_MAP[clean] || clean;
  if (canonicalPath.startsWith('/platform/tenants/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/platform/tenants');
  }
  if (canonicalPath.startsWith('/app/students/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/app/students');
  }
  if (canonicalPath.startsWith('/app/halaqah/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/app/halaqah');
  }
  if (canonicalPath.startsWith('/app/sessions/')) {
    return SAAS_ROUTE_MAP.find((r) => r.path === '/app/sessions');
  }
  return SAAS_ROUTE_MAP.find((r) => r.path === canonicalPath);
}

export function resolveRouteByPageKey(pageKey: string): SaaSRouteConfig | undefined {
  return SAAS_ROUTE_MAP.find((r) => r.pageKey === pageKey);
}

export function isRouteAllowed(
  pageOrPath: string,
  rawRole?: string | null,
  hasActiveSupportSession: boolean = false
): boolean {
  const role = normalizeRole(rawRole);
  if (role === 'pending' || role === 'unknown') return false;

  const route =
    resolveRouteByPath(pageOrPath) ||
    resolveRouteByPageKey(pageOrPath);

  if (!route) {
    return false;
  }

  // Superadmin secara default berada di Platform Shell (/platform/*).
  // Akses ke rute akademik tenant (/app/*) wajib melalui Support Access Session aktif (Break-Glass).
  if (role === 'superadmin') {
    if (route.group === 'platform') return true;
    return Boolean(hasActiveSupportSession);
  }

  return route.roles.includes(role);
}

// ============================================================================
// SUPPORT ACCESS SESSION STORE (UNTUK SUPERADMIN BREAK-GLASS KE TENANT)
// ============================================================================
export interface ActiveSupportSession {
  id: string;
  organizationId: string;
  organizationName: string;
  reason: string;
  mode: 'read_only' | 'read_write';
  startedAt: string;
  expiresAt: string;
}

const SUPPORT_SESSION_STORAGE_KEY = 'lajnah_active_support_session_v2';
type Listener = (session: ActiveSupportSession | null) => void;
const listeners = new Set<Listener>();

export const SupportSessionStore = {
  getSession(): ActiveSupportSession | null {
    try {
      const raw = sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed: ActiveSupportSession = JSON.parse(raw);
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  startSession(session: ActiveSupportSession) {
    try {
      sessionStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage quota errors
    }
    window.dispatchEvent(new CustomEvent('support_session_changed', { detail: session }));
    listeners.forEach((l) => l(session));
  },

  endSession() {
    try {
      sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('support_session_changed', { detail: null }));
    listeners.forEach((l) => l(null));
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// ============================================================================
// AUTHORITATIVE TENANT & ACCESS GRANT RESOLVER (FASE 1 HARDENING)
// ============================================================================
export interface AccessGrantRecord {
  id?: string;
  user_id: string;
  organization_id: string | null;
  role: string;
  status: string;
  expires_at?: string | null;
}

export interface ResolvedTenantContext {
  userId: string | null;
  email: string | null;
  organizationId: string | null;
  organizationName: string;
  organizationLogo: string;
  fullName: string;
  effectiveRole: CanonicalRole | 'pending' | 'unknown';
  membershipStatus: MembershipStatus | 'expired' | 'none';
  supportSession: ActiveSupportSession | null;
  isSuperAdmin: boolean;
  isAuthorized: boolean;
  /** Fase 2: semua peran aktif pengguna di lembaga ini (mis. ['admin','musammi']) */
  availableRoles?: string[];
}

export function isGrantExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return !Number.isNaN(ts) && ts <= Date.now();
}

export function getEffectiveGrantStatus(
  grant: Pick<AccessGrantRecord, 'status' | 'expires_at'>
): MembershipStatus | 'expired' {
  if (isGrantExpired(grant.expires_at)) {
    return 'expired';
  }
  const s = (grant.status || '').trim().toLowerCase();
  if (s === 'active' || s === 'invited' || s === 'suspended' || s === 'revoked') {
    return s;
  }
  return 'revoked';
}

/**
 * Resolves the caller's authoritative role, membership status, organization context,
 * and database-verified support session.
 *
 * Rules enforced (Fase 1):
 * 1. `access_grants` is the authoritative source of role and membership status.
 * 2. If a user has ANY row in `access_grants`, `profiles` is NEVER used as a fallback
 *    for privilege or active status.
 * 3. Grants with status `invited`, `suspended`, `revoked`, or `expired` (`expires_at <= now()`)
 *    are strictly rejected (`isAuthorized: false`, `effectiveRole: 'pending'`).
 * 4. Tenant grants are matched explicitly against `preferredOrgId` or `profile.organization_id`
 *    (never selected randomly via `.find(status === 'active')`).
 * 5. Support Access Sessions are verified against `public.support_access_sessions` in the DB.
 */
// Fase 7 (BUG-19 & kinerja): hasil resolveTenantContext dipakai bersama selama 60 detik dan
// permintaan yang sedang berjalan tidak digandakan. Sebelumnya profil & izin akses diminta
// hingga 6 kali per halaman. Cache dikosongkan saat login/logout & sesi support berubah.
const CACHE_KONTEKS_MS = 60_000;
type CacheKonteks = Map<string, { sampai: number; janji: Promise<ResolvedTenantContext> }>;
let cachePerKlien = new WeakMap<object, CacheKonteks>();
export function bersihkanCacheKonteks() {
  cachePerKlien = new WeakMap();
}

export async function resolveTenantContext(
  supabaseClient: any,
  preferredOrgId?: string | null,
  preferredRole?: string | null
): Promise<ResolvedTenantContext> {
  let userId = '';
  try {
    const { data } = await supabaseClient?.auth?.getSession?.() ?? { data: null };
    userId = data?.session?.user?.id || '';
  } catch {
    userId = '';
  }
  const kunci = [userId, SupportSessionStore.getSession()?.id || '', preferredOrgId || '', preferredRole ?? ActiveRoleStore.get() ?? ''].join('|');
  let cacheKonteks = supabaseClient && typeof supabaseClient === 'object' ? cachePerKlien.get(supabaseClient) : undefined;
  if (!cacheKonteks && supabaseClient && typeof supabaseClient === 'object') { cacheKonteks = new Map(); cachePerKlien.set(supabaseClient, cacheKonteks); }
  const ada = cacheKonteks?.get(kunci);
  if (userId && ada && ada.sampai > Date.now()) return ada.janji;
  const janji = resolveTenantContextLangsung(supabaseClient, preferredOrgId, preferredRole);
  if (userId && cacheKonteks) {
    const c = cacheKonteks;
    c.set(kunci, { sampai: Date.now() + CACHE_KONTEKS_MS, janji });
    janji.catch(() => c.delete(kunci));
  }
  return janji;
}

async function resolveTenantContextLangsung(
  supabaseClient: any,
  preferredOrgId?: string | null,
  preferredRole?: string | null
): Promise<ResolvedTenantContext> {
  const emptyCtx: ResolvedTenantContext = {
    userId: null,
    email: null,
    organizationId: null,
    organizationName: '',
    organizationLogo: '',
    fullName: '',
    effectiveRole: 'unknown',
    membershipStatus: 'none',
    supportSession: null,
    isSuperAdmin: false,
    isAuthorized: false,
  };

  try {
    let user: any = null;
    if (typeof supabaseClient?.auth?.getSession === 'function') {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData?.session?.user) {
        user = sessionData.session.user;
      }
    }
    if (!user && typeof supabaseClient?.auth?.getUser === 'function') {
      const { data: userData } = await supabaseClient.auth.getUser();
      user = userData?.user || null;
    }

    if (!user?.id) {
      return emptyCtx;
    }

    const userId: string = user.id;
    const userEmail: string | null = user.email || null;

    // 1. Load identity & preferred organization pointer from profiles
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('id, organization_id, full_name, role, organizations(name, logo_url)')
      .eq('id', userId)
      .maybeSingle();

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'Pengguna';
    const rawOrgRel = profile?.organizations;
    const orgObj = Array.isArray(rawOrgRel) ? rawOrgRel[0] : rawOrgRel;
    let orgName = orgObj?.name || '';
    const orgLogo = orgObj?.logo_url || '';
    const profileOrgId: string | null = profile?.organization_id || null;

    // 2. Load authoritative access_grants for this user
    let grants: AccessGrantRecord[] = [];
    let grantsTableAvailable = true;
    try {
      const { data: grantRows, error: grantErr } = await supabaseClient
        .from('access_grants')
        .select('id, user_id, organization_id, role, status, expires_at')
        .eq('user_id', userId);

      if (grantErr && grantErr.code === '42P01') {
        grantsTableAvailable = false;
      } else if (Array.isArray(grantRows)) {
        grants = grantRows;
      }
    } catch {
      grantsTableAvailable = false;
    }

    // 3. Determine if user is an authoritative Superadmin
    let isSuperadmin = false;
    let superadminBlocked = false;

    if (grantsTableAvailable && grants.length > 0) {
      const superGrant = grants.find((g) => normalizeRole(g.role) === 'superadmin');
      if (superGrant) {
        const superStatus = getEffectiveGrantStatus(superGrant);
        if (superStatus === 'active') {
          isSuperadmin = true;
        } else {
          superadminBlocked = true;
        }
      }
    } else if (!grantsTableAvailable || grants.length === 0) {
      // Legacy fallback ONLY when user has 0 rows in access_grants
      if (normalizeRole(profile?.role) === 'superadmin') {
        isSuperadmin = true;
      }
    }

    // 4. Verify Support Access Session against database (never trust sessionStorage alone)
    const localSupport = SupportSessionStore.getSession();
    let verifiedSupportSession: ActiveSupportSession | null = null;

    if (localSupport) {
      if (!isSuperadmin || localSupport.id.startsWith('local-')) {
        SupportSessionStore.endSession();
      } else {
        try {
          const { data: dbSupport } = await supabaseClient
            .from('support_access_sessions')
            .select('id, organization_id, superadmin_user_id, reason, mode, started_at, expires_at, ended_at')
            .eq('id', localSupport.id)
            .eq('superadmin_user_id', userId)
            .maybeSingle();

          if (
            !dbSupport ||
            dbSupport.ended_at ||
            isGrantExpired(dbSupport.expires_at)
          ) {
            SupportSessionStore.endSession();
          } else {
            verifiedSupportSession = {
              id: dbSupport.id,
              organizationId: dbSupport.organization_id,
              organizationName: localSupport.organizationName || orgName,
              reason: dbSupport.reason,
              mode: dbSupport.mode === 'read_write' ? 'read_write' : 'read_only',
              startedAt: dbSupport.started_at,
              expiresAt: dbSupport.expires_at,
            };
          }
        } catch {
          SupportSessionStore.endSession();
        }
      }
    }

    if (isSuperadmin) {
      const activeOrgId = verifiedSupportSession?.organizationId || preferredOrgId || null;
      if (verifiedSupportSession?.organizationName) {
        orgName = verifiedSupportSession.organizationName;
      }
      return {
        userId,
        email: userEmail,
        organizationId: activeOrgId,
        organizationName: orgName,
        organizationLogo: orgLogo,
        fullName,
        effectiveRole: 'superadmin',
        membershipStatus: 'active',
        supportSession: verifiedSupportSession,
        isSuperAdmin: true,
        isAuthorized: true,
      };
    }

    if (superadminBlocked && grants.length === 1) {
      const superStatus = getEffectiveGrantStatus(grants[0]);
      return {
        userId,
        email: userEmail,
        organizationId: null,
        organizationName: orgName,
        organizationLogo: orgLogo,
        fullName,
        effectiveRole: 'pending',
        membershipStatus: superStatus,
        supportSession: null,
        isSuperAdmin: false,
        isAuthorized: false,
      };
    }

    // 5. Resolve explicit tenant grant for Admin / Musammi
    const tenantGrants = grants.filter((g) => g.organization_id !== null);

    if (grantsTableAvailable && grants.length > 0) {
      // Explicit target organization resolution:
      // 1) preferredOrgId passed by caller
      // 2) profile.organization_id
      // 3) if and only if the user has exactly 1 tenant grant, that single grant's organization_id
      const explicitTargetOrgId =
        preferredOrgId ||
        profileOrgId ||
        (tenantGrants.length === 1 ? tenantGrants[0].organization_id : null);

      if (!explicitTargetOrgId) {
        return {
          userId,
          email: userEmail,
          organizationId: null,
          organizationName: orgName,
          organizationLogo: orgLogo,
          fullName,
          effectiveRole: 'pending',
          membershipStatus: 'none',
          supportSession: null,
          isSuperAdmin: false,
          isAuthorized: false,
        };
      }

      const matchingOrgGrants = tenantGrants.filter(
        (g) => g.organization_id === explicitTargetOrgId
      );

      if (matchingOrgGrants.length === 0) {
        // User has grants in access_grants, but none for explicitTargetOrgId -> DO NOT fallback to profiles!
        return {
          userId,
          email: userEmail,
          organizationId: null,
          organizationName: orgName,
          organizationLogo: orgLogo,
          fullName,
          effectiveRole: 'pending',
          membershipStatus: 'none',
          supportSession: null,
          isSuperAdmin: false,
          isAuthorized: false,
        };
      }

      // Fase 2: satu akun bisa punya beberapa peran aktif di lembaga yang sama.
      // Peran yang dipakai = pilihan pengguna (ActiveRoleStore) bila masih aktif; jika tidak, Admin lebih dulu.
      const activeOrgGrants = matchingOrgGrants.filter((g) => getEffectiveGrantStatus(g) === 'active');
      const availableRoles = Array.from(new Set(activeOrgGrants.map((g) => normalizeRole(g.role) as string)))
        .filter((r) => r === 'admin' || r === 'musammi');
      const chosenRole = pilihPeranAktif(availableRoles, preferredRole ?? ActiveRoleStore.get());
      const targetGrant =
        activeOrgGrants.find((g) => normalizeRole(g.role) === chosenRole) ||
        [...matchingOrgGrants].sort((a, b) => {
          const rA = normalizeRole(a.role) === 'admin' ? 0 : 1;
          const rB = normalizeRole(b.role) === 'admin' ? 0 : 1;
          return rA - rB;
        })[0];

      const effectiveStatus = getEffectiveGrantStatus(targetGrant);
      if (effectiveStatus !== 'active') {
        // Invited, suspended, revoked, or expired grant -> strictly blocked, no fallback to profiles
        return {
          userId,
          email: userEmail,
          organizationId: null,
          organizationName: orgName,
          organizationLogo: orgLogo,
          fullName,
          effectiveRole: 'pending',
          membershipStatus: effectiveStatus,
          supportSession: null,
          isSuperAdmin: false,
          isAuthorized: false,
        };
      }

      const canonical = normalizeRole(targetGrant.role);
      const isValidTenantRole = canonical === 'admin' || canonical === 'musammi';

      return {
        userId,
        email: userEmail,
        organizationId: isValidTenantRole ? targetGrant.organization_id : null,
        organizationName: orgName,
        organizationLogo: orgLogo,
        fullName,
        effectiveRole: isValidTenantRole ? canonical : 'pending',
        membershipStatus: isValidTenantRole ? 'active' : 'revoked',
        supportSession: null,
        isSuperAdmin: false,
        isAuthorized: isValidTenantRole && Boolean(targetGrant.organization_id),
        availableRoles,
      };
    }

    // 6. Legacy fallback ONLY when user has 0 rows in access_grants
    const legacyRole = normalizeRole(profile?.role);
    const isLegacyAuthorized =
      (legacyRole === 'admin' || legacyRole === 'musammi') && Boolean(profileOrgId);

    return {
      userId,
      email: userEmail,
      organizationId: isLegacyAuthorized ? profileOrgId : null,
      organizationName: orgName,
      organizationLogo: orgLogo,
      fullName,
      effectiveRole: isLegacyAuthorized ? legacyRole : 'pending',
      membershipStatus: isLegacyAuthorized ? 'active' : 'invited',
      supportSession: null,
      isSuperAdmin: false,
      isAuthorized: isLegacyAuthorized,
    };
  } catch {
    return emptyCtx;
  }
}

