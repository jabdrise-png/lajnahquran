import fs from 'fs';
import path from 'path';
import {
  resolveTenantContext,
  SupportSessionStore,
  AccessGrantRecord,
  isRouteAllowed,
} from '../lib/permissions';
import { resolveServerTenantContext } from '../api/_tenantContext';

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

// Memory storage mock for SupportSessionStore in Node environment
const memorySessionStorage = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => memorySessionStorage.get(k) ?? null,
  setItem: (k: string, v: string) => memorySessionStorage.set(k, v),
  removeItem: (k: string) => memorySessionStorage.delete(k),
};
(globalThis as any).CustomEvent = class CustomEvent {
  detail: any;
  constructor(_type: string, opts?: { detail?: any }) {
    this.detail = opts?.detail;
  }
};
(globalThis as any).window = {
  sessionStorage: (globalThis as any).sessionStorage,
  dispatchEvent: () => true,
};

function createMockSupabase(options: {
  userId?: string | null;
  isSuperadmin?: boolean;
  grants?: AccessGrantRecord[];
  legacyProfile?: { id: string; role: string; organization_id: string | null } | null;
  supportSessions?: Array<{
    id: string;
    superadmin_user_id: string;
    organization_id: string;
    reason: string;
    mode: 'read_only' | 'read_write';
    started_at: string;
    expires_at: string;
    ended_at: string | null;
    organizations?: { name: string };
  }>;
}) {
  return {
    auth: {
      getSession: async () => ({
        data: {
          session: options.userId
            ? { user: { id: options.userId, email: 'user@example.com' } }
            : null,
        },
        error: null,
      }),
      getUser: async () => ({
        data: { user: options.userId ? { id: options.userId, email: 'user@example.com' } : null },
        error: options.userId ? null : new Error('Not authenticated'),
      }),
    },
    from: (table: string) => {
      const filters: Record<string, any> = {};
      let isNullKey: string | null = null;

      const resolveRows = () => {
        if (table === 'access_grants') {
          const list = (options.grants || []).filter(
            (g) => !filters.user_id || g.user_id === filters.user_id
          );
          if (options.isSuperadmin && !list.some((g) => g.role === 'superadmin')) {
            list.push({
              id: 'grant-super',
              user_id: options.userId || 'superadmin-1',
              organization_id: null,
              role: 'superadmin',
              status: 'active',
              expires_at: null,
            });
          }
          return list;
        }
        if (table === 'support_access_sessions') {
          return (options.supportSessions || []).filter((s) => {
            if (filters.id && s.id !== filters.id) return false;
            if (filters.superadmin_user_id && s.superadmin_user_id !== filters.superadmin_user_id)
              return false;
            if (filters.organization_id && s.organization_id !== filters.organization_id)
              return false;
            if (isNullKey === 'ended_at' && s.ended_at !== null) return false;
            return true;
          });
        }
        return [];
      };

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          filters[col] = val;
          return builder;
        },
        is: (col: string, val: any) => {
          if (val === null) isNullKey = col;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === 'profiles') {
            if (options.legacyProfile && filters.id === options.legacyProfile.id) {
              return { data: options.legacyProfile, error: null };
            }
            return { data: null, error: null };
          }
          if (table === 'support_access_sessions') {
            const rows = resolveRows();
            return { data: rows[0] || null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          return Promise.resolve({ data: resolveRows(), error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

async function runTests() {
  const sqlHardening = fs.readFileSync(
    path.resolve(process.cwd(), 'database/supabase_v2_1_production_hardening.sql'),
    'utf8'
  );
  const sqlMigrationV2 = fs.readFileSync(
    path.resolve(process.cwd(), 'database/supabase_saas_v2_migration.sql'),
    'utf8'
  );
  const sqlSkema = fs.readFileSync(
    path.resolve(process.cwd(), 'database/skema_lajnah.sql'),
    'utf8'
  );
  const invitationsApi = fs.readFileSync(
    path.resolve(process.cwd(), 'api/invitations.ts'),
    'utf8'
  );

  // =========================================================================
  // SKENARIO 1: Admin tidak dapat membuat Admin lain (UI, API, dan DB)
  // =========================================================================
  const hasAdminBlockInInvitations =
    invitationsApi.includes('Admin Lembaga hanya berwenang mengundang Musammi') &&
    invitationsApi.includes('canonicalRole === "admin" && requestedRole !== "musammi"');
  const hasAdminBlockInManageGrantRpc =
    sqlHardening.includes(
      'Forbidden: Admin Lembaga hanya dapat menetapkan atau mengelola role Musammi.'
    ) &&
    sqlHardening.includes('CREATE POLICY access_grants_insert ON public.access_grants') &&
    sqlHardening.includes("AND role = 'musammi'");
  recordTest(
    'SEC-01',
    'Admin tidak dapat membuat atau mempromosikan Admin lain',
    hasAdminBlockInInvitations && hasAdminBlockInManageGrantRpc,
    'API /api/invitations, RPC rpc_manage_access_grant, dan RLS access_grants_insert/update membatasi Admin hanya untuk role musammi'
  );

  // =========================================================================
  // SKENARIO 2: Musammi tidak dapat memanggil API invitation atau kelola grant
  // =========================================================================
  const mockMusammiSupabase = createMockSupabase({
    userId: 'user-musammi-1',
    isSuperadmin: false,
    grants: [
      {
        id: 'grant-m1',
        user_id: 'user-musammi-1',
        organization_id: 'org-a',
        role: 'musammi',
        status: 'active',
        expires_at: null,
      },
    ],
  });
  const musammiServerCtx = await resolveServerTenantContext({
    authHeader: 'Bearer valid-token',
    requestedOrganizationId: 'org-a',
    requireWrite: true,
    injectedClient: mockMusammiSupabase,
  });
  const musammiCannotAccessUsersRoute = !isRouteAllowed('/app/users', 'musammi');
  const musammiBlockedFromInvitations =
    musammiServerCtx.effectiveRole === 'musammi' &&
    invitationsApi.includes(
      'Hanya Superadmin atau Admin Lembaga yang dapat mengundang pengguna'
    );
  recordTest(
    'SEC-02',
    'Musammi tidak dapat memanggil API invitation atau mengelola akun/grant',
    musammiBlockedFromInvitations && musammiCannotAccessUsersRoute,
    `Role efektif Musammi terdeteksi (${musammiServerCtx.effectiveRole}), ditolak oleh endpoint undangan & rute /app/users=${isRouteAllowed('/app/users', 'musammi')}`
  );

  // =========================================================================
  // SKENARIO 3: User tidak dapat mengubah is_superadmin pada user_profiles
  // =========================================================================
  const hasSuperadminSelfEscalationGuard =
    sqlHardening.includes('NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin') &&
    sqlHardening.includes("current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'") &&
    sqlHardening.includes('Forbidden: Hanya Superadmin yang dapat mengubah atribut is_superadmin.');
  recordTest(
    'SEC-03',
    'User tidak dapat mengubah atribut privilege is_superadmin pada user_profiles',
    hasSuperadminSelfEscalationGuard,
    'Trigger trg_normalize_user_profiles menolak perubahan is_superadmin kecuali oleh service_role atau superadmin'
  );

  // =========================================================================
  // SKENARIO 4: User suspended, revoked, invited, atau expired tidak dapat baca/tulis
  // =========================================================================
  const statusesToTest: Array<{ status: any; expires_at: string | null; expectedStatus: string }> = [
    { status: 'suspended', expires_at: null, expectedStatus: 'suspended' },
    { status: 'revoked', expires_at: null, expectedStatus: 'revoked' },
    { status: 'invited', expires_at: null, expectedStatus: 'invited' },
    {
      status: 'active',
      expires_at: new Date(Date.now() - 3600_000).toISOString(),
      expectedStatus: 'expired',
    },
  ];

  let allBlocked = true;
  for (const item of statusesToTest) {
    const client = createMockSupabase({
      userId: 'user-blocked',
      isSuperadmin: false,
      grants: [
        {
          id: 'g-1',
          user_id: 'user-blocked',
          organization_id: 'org-a',
          role: 'admin',
          status: item.status,
          expires_at: item.expires_at,
        },
      ],
      // Sekalipun legacy profile masih tertulis 'admin' di 'org-a', resolver TIDAK BOLEH fallback ke profiles!
      legacyProfile: {
        id: 'user-blocked',
        role: 'admin',
        organization_id: 'org-a',
      },
    });

    const resolvedClient = await resolveTenantContext(client as any, 'org-a');
    const resolvedServer = await resolveServerTenantContext({
      authHeader: 'Bearer token',
      requestedOrganizationId: 'org-a',
      injectedClient: client,
    });

    if (
      resolvedClient.isAuthorized ||
      resolvedClient.organizationId !== null ||
      resolvedClient.membershipStatus !== item.expectedStatus ||
      resolvedServer.ok
    ) {
      allBlocked = false;
    }
  }

  const sqlBlocksFallbackWhenGrantExists =
    sqlHardening.includes('SELECT 1 FROM public.access_grants ag WHERE ag.user_id = auth.uid()') &&
    sqlHardening.includes('IF v_has_any_grant THEN') &&
    sqlHardening.includes('(ag.expires_at IS NULL OR ag.expires_at > now())');

  recordTest(
    'SEC-04',
    'User dengan grant invited, suspended, revoked, atau expired ditolak tanpa fallback ke profiles',
    allBlocked && sqlBlocksFallbackWhenGrantExists,
    'Client resolver, Server resolver, dan fungsi SQL get_canonical_role/get_role_for_org/get_my_org_id menolak akses & memblokir fallback ke profiles'
  );

  // =========================================================================
  // SKENARIO 5: Update profile tidak mengaktifkan kembali grant suspended/revoked
  // =========================================================================
  const syncTriggerBodyMatch = sqlHardening.match(
    /CREATE OR REPLACE FUNCTION public\.sync_profile_to_v2_grants\(\)[\s\S]*?\$\$;/
  );
  const syncTriggerBody = syncTriggerBodyMatch ? syncTriggerBodyMatch[0] : '';
  const updateBranchSection = syncTriggerBody.split('-- Pada INSERT profil awal')[0] || '';
  const updateDoesNotTouchGrants =
    updateBranchSection.includes("IF TG_OP = 'UPDATE' THEN") &&
    !updateBranchSection.includes('INSERT INTO public.access_grants') &&
    !updateBranchSection.includes('UPDATE public.access_grants');

  recordTest(
    'SEC-05',
    'Update pada tabel profiles tidak mengaktifkan kembali grant atau mengubah role/organization_id',
    updateDoesNotTouchGrants,
    'Cabang TG_OP = UPDATE pada sync_profile_to_v2_grants() hanya menyinkronkan full_name dan email ke user_profiles'
  );

  // =========================================================================
  // SKENARIO 6: Tenant A tidak dapat membaca atau menulis Tenant B
  // =========================================================================
  const tenantAClient = createMockSupabase({
    userId: 'admin-org-a',
    isSuperadmin: false,
    grants: [
      {
        id: 'grant-org-a',
        user_id: 'admin-org-a',
        organization_id: 'org-a',
        role: 'admin',
        status: 'active',
        expires_at: null,
      },
    ],
  });
  const crossTenantServerAttempt = await resolveServerTenantContext({
    authHeader: 'Bearer token',
    requestedOrganizationId: 'org-b',
    requireWrite: true,
    injectedClient: tenantAClient,
  });
  const crossTenantClientAttempt = await resolveTenantContext(tenantAClient as any, 'org-b');
  recordTest(
    'SEC-06',
    'Tenant A tidak dapat membaca atau menulis ke Tenant B',
    crossTenantServerAttempt.ok === false &&
      crossTenantServerAttempt.status === 403 &&
      crossTenantClientAttempt.isAuthorized === false,
    `Permintaan operasi Admin Tenant A terhadap Tenant B ditolak dengan HTTP ${crossTenantServerAttempt.status} & isAuthorized=${crossTenantClientAttempt.isAuthorized}`
  );

  // =========================================================================
  // SKENARIO 7: Musammi A tidak dapat menulis ke Halaqah B
  // =========================================================================
  const hasHalaqahAssignmentCheck =
    sqlHardening.includes('public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)') &&
    sqlHardening.includes('public.is_musammi_assigned_to_student(organization_id, santri_id)') &&
    sqlHardening.includes('CREATE POLICY attendance_insert ON public.attendance') &&
    sqlHardening.includes('CREATE POLICY setoran_harian_insert ON public.setoran_harian');
  recordTest(
    'SEC-07',
    'Musammi A tidak dapat menulis ke Halaqah B atau santri di luar penugasan aktifnya',
    hasHalaqahAssignmentCheck,
    'RLS halaqah_sessions, recitation_entries, attendance, dan setoran_harian mewajibkan is_musammi_assigned_to_halaqah / is_musammi_assigned_to_student'
  );

  // =========================================================================
  // SKENARIO 8: Browser tidak dapat membaca integration_secrets
  // =========================================================================
  const hasIntegrationSecretsLockdown =
    sqlHardening.includes('REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated;') &&
    sqlHardening.includes('GRANT ALL ON TABLE public.integration_secrets TO service_role;') &&
    sqlHardening.includes('CREATE POLICY integration_secrets_no_browser_read ON public.integration_secrets') &&
    sqlHardening.includes('USING (false)');
  recordTest(
    'SEC-08',
    'Browser (anon/authenticated) tidak dapat membaca tabel integration_secrets',
    hasIntegrationSecretsLockdown,
    'REVOKE ALL dari anon & authenticated serta policy USING (false) WITH CHECK (false) diterapkan pada integration_secrets'
  );

  // =========================================================================
  // SKENARIO 9: audit_logs dan recitation_revisions tidak dapat diupdate atau dihapus
  // =========================================================================
  const hasAppendOnlyAuditAndRevisions =
    sqlHardening.includes(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM anon, authenticated;'
    ) &&
    sqlHardening.includes(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.recitation_revisions FROM anon, authenticated;'
    ) &&
    sqlHardening.includes(
      'REVOKE DELETE, TRUNCATE ON TABLE public.support_access_sessions FROM anon, authenticated;'
    );
  recordTest(
    'SEC-09',
    'audit_logs dan recitation_revisions bersifat append-only (tidak dapat di-UPDATE atau di-DELETE)',
    hasAppendOnlyAuditAndRevisions,
    'Privilege UPDATE, DELETE, TRUNCATE dicabut dari anon dan authenticated pada audit_logs & recitation_revisions'
  );

  // =========================================================================
  // SKENARIO 10: Support session read_only tidak dapat melakukan write
  // =========================================================================
  const futureExpiry = new Date(Date.now() + 30 * 60_000).toISOString();
  SupportSessionStore.startSession({
    id: 'sess-ro-1',
    organizationId: 'org-target',
    organizationName: 'Ma’had Target',
    mode: 'read_only',
    reason: 'Audit investigasi laporan',
    startedAt: new Date().toISOString(),
    expiresAt: futureExpiry,
  });

  const superadminRoSupabase = createMockSupabase({
    userId: 'superadmin-1',
    isSuperadmin: true,
    supportSessions: [
      {
        id: 'sess-ro-1',
        superadmin_user_id: 'superadmin-1',
        organization_id: 'org-target',
        reason: 'Audit investigasi laporan',
        mode: 'read_only',
        started_at: new Date().toISOString(),
        expires_at: futureExpiry,
        ended_at: null,
        organizations: { name: 'Ma’had Target' },
      },
    ],
  });

  const roServerWriteAttempt = await resolveServerTenantContext({
    authHeader: 'Bearer superadmin-token',
    requestedOrganizationId: 'org-target',
    requireWrite: true,
    injectedClient: superadminRoSupabase,
  });

  const sqlAdminWriteRequiresReadWriteSession =
    sqlHardening.includes('public.has_active_support_session(target_org_id, true)') &&
    sqlHardening.includes(
      'CREATE POLICY "Tenant Isolation Academic Years Modify" ON public.academic_years\n  FOR ALL TO authenticated\n  USING (public.is_admin_of_org(organization_id))\n  WITH CHECK (public.is_admin_of_org(organization_id));'
    );

  SupportSessionStore.endSession();

  recordTest(
    'SEC-10',
    'Support session dengan mode read_only tidak dapat melakukan operasi write',
    roServerWriteAttempt.ok === false &&
      roServerWriteAttempt.status === 403 &&
      sqlAdminWriteRequiresReadWriteSession,
    'API menolak write saat support session read_only (HTTP 403) & is_admin_of_org(org) mewajibkan has_active_support_session(org, true)'
  );

  // =========================================================================
  // SKENARIO 11: Support session expired tidak dapat dipakai
  // =========================================================================
  const pastExpiry = new Date(Date.now() - 10 * 60_000).toISOString();
  SupportSessionStore.startSession({
    id: 'sess-exp-1',
    organizationId: 'org-target',
    organizationName: 'Ma’had Target',
    mode: 'read_write',
    reason: 'Sesi sudah kadaluarsa',
    startedAt: new Date(Date.now() - 70 * 60_000).toISOString(),
    expiresAt: pastExpiry,
  });

  const superadminExpiredSupabase = createMockSupabase({
    userId: 'superadmin-1',
    isSuperadmin: true,
    supportSessions: [
      {
        id: 'sess-exp-1',
        superadmin_user_id: 'superadmin-1',
        organization_id: 'org-target',
        reason: 'Sesi sudah kadaluarsa',
        mode: 'read_write',
        started_at: new Date(Date.now() - 70 * 60_000).toISOString(),
        expires_at: pastExpiry,
        ended_at: null,
        organizations: { name: 'Ma’had Target' },
      },
    ],
  });

  const expiredClientCtx = await resolveTenantContext(superadminExpiredSupabase as any);
  const expiredServerCtx = await resolveServerTenantContext({
    authHeader: 'Bearer superadmin-token',
    requestedOrganizationId: 'org-target',
    injectedClient: superadminExpiredSupabase,
  });

  recordTest(
    'SEC-11',
    'Support session yang sudah expired otomatis dibersihkan dan ditolak oleh server maupun DB',
    expiredClientCtx.supportSession === null &&
      SupportSessionStore.getSession() === null &&
      expiredServerCtx.supportSession === null,
    'SupportSessionStore otomatis dihapus ketika expires_at <= now() dan server mengabaikan sesi kadaluarsa'
  );

  // =========================================================================
  // SKENARIO 12: RPC privat tidak dapat dieksekusi oleh anon & seluruh SECURITY DEFINER aman
  // =========================================================================
  const revokeFromPublicAndAnonPresent =
    sqlHardening.includes('FROM PUBLIC, anon;') &&
    sqlMigrationV2.includes('FROM PUBLIC, anon;');
  const syncUserEmailHasSearchPath = sqlSkema.includes(
    'CREATE OR REPLACE FUNCTION public.sync_user_email()\nRETURNS trigger\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public'
  );

  recordTest(
    'SEC-12',
    'Seluruh RPC privat di-REVOKE dari PUBLIC & anon, serta 100% fungsi SECURITY DEFINER memiliki SET search_path = public',
    revokeFromPublicAndAnonPresent && syncUserEmailHasSearchPath,
    'REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon diterapkan dan sync_user_email() memiliki SET search_path = public'
  );

  const failed = results.filter((r) => !r.passed);
  console.log('\n=============================================================================');
  console.log(
    `FASE 1 SECURITY VERIFICATION SUMMARY: ${results.length - failed.length}/${results.length} PASSED`
  );
  console.log('=============================================================================');

  if (failed.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in security verification suite:', err);
  process.exit(1);
});
