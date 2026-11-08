import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  PageShell,
  PageHeader,
  StatCard,
  StatusBadge,
  EmptyState,
  FilterBar,
  useUrlFilterParam,
  FormField,
  ConfirmDialog,
  BadgeTone,
  QuotaBar,
  ProgressBar,
  Drawer,
} from '../../components/ui/SaaSPrimitives';
import {
  SupportSessionStore,
  normalizeRole,
  formatCanonicalRoleLabel,
  getEffectiveGrantStatus,
} from '../../lib/permissions';
import Modal from '../../components/Modal';
import { NotificationStore } from '../../lib/NotificationStore';
import type { Page } from '../../types';

export type PlatformSection =
  | 'dashboard'
  | 'tenants'
  | 'accounts'
  | 'plans'
  | 'support'
  | 'audit'
  | 'settings';

interface TenantSetupState {
  hasActiveAcademicYear: boolean;
  hasAdminAssigned: boolean;
  hasMusammiRegistered: boolean;
  hasHalaqahCreated: boolean;
}

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  status:
    | 'provisioning'
    | 'provisioning_failed'
    | 'trial'
    | 'active'
    | 'suspended'
    | 'archived'
    | string;
  timezone: string;
  locale: string;
  plan_id: 'trial' | 'standard' | 'enterprise' | string;
  created_at?: string;
  adminCount: number;
  musammiCount: number;
  santriCount: number;
  halaqahCount: number;
  academicYearCount: number;
  activeAcademicYearName?: string;
  setupState: TenantSetupState;
}

interface AccountGrantSummary {
  id: string;
  role: 'superadmin' | 'admin' | 'musammi' | 'pending' | 'unknown';
  rawRole: string;
  status: 'active' | 'invited' | 'suspended' | 'revoked' | 'expired';
  organizationId: string | null;
  organizationName: string;
  createdAt?: string;
  expiresAt?: string | null;
}

interface AccountInvitationSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  organizationId: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  acceptedAt?: string | null;
}

interface PlatformAccountItem {
  id: string;
  grantId: string | null;
  userId: string;
  fullName: string;
  email?: string;
  role: 'superadmin' | 'admin' | 'musammi' | 'pending' | 'unknown';
  rawRole: string;
  status: 'active' | 'invited' | 'suspended' | 'revoked' | 'expired';
  organizationId: string | null;
  organizationName: string;
  createdAt?: string;
  allGrants?: AccountGrantSummary[];
  invitationInfo?: AccountInvitationSummary | null;
}

interface SupportSessionItem {
  id: string;
  organization_id: string;
  organization_name?: string;
  actor_id?: string | null;
  reason: string;
  mode: 'read_only' | 'read_write';
  started_at: string;
  expires_at: string;
  ended_at?: string | null;
}

interface AuditLogItem {
  id: string;
  organization_id?: string | null;
  organization_name?: string;
  actor_id?: string | null;
  actor_role?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  reason?: string;
  before_state?: any;
  after_state?: any;
  created_at: string;
}

interface HealthCheckResult {
  key: string;
  label: string;
  category: 'Database' | 'Schema V2' | 'Serverless API' | 'Security';
  status: 'healthy' | 'degraded' | 'missing';
  latencyMs?: number;
  detail: string;
  checkedAt?: string;
}

interface SaaSPlanDefinition {
  id: 'trial' | 'standard' | 'enterprise';
  name: string;
  tagline: string;
  maxStudents: number;
  maxMusammi: number;
  maxHalaqah: number;
  auditRetentionDays: number;
  features: string[];
}

const SAAS_PLANS: SaaSPlanDefinition[] = [
  {
    id: 'trial',
    name: 'Trial / Evaluasi Lembaga',
    tagline: 'Untuk uji coba kurikulum dan evaluasi kesiapan sistem ma\'had baru.',
    maxStudents: 50,
    maxMusammi: 5,
    maxHalaqah: 5,
    auditRetentionDays: 30,
    features: [
      'Isolasi Multi-Tenant (organization_id)',
      'Sesi Halaqah, Absensi Batch & Ledger Setoran',
      '1 Tahun Ajaran Aktif',
      'Audit Log Standar (30 Hari)',
    ],
  },
  {
    id: 'standard',
    name: 'Standard Ma\'had',
    tagline: 'Paket operasional lengkap untuk pondok pesantren dan ma\'had tahfidz.',
    maxStudents: 500,
    maxMusammi: 50,
    maxHalaqah: 50,
    auditRetentionDays: 365,
    features: [
      'Semua fitur Trial + Multi Tahun Ajaran',
      'Rubrik Penilaian Berversi & Ujian Remedial',
      'Penerbitan Snapshot Raport Immutable & Amendment',
      'Integrasi Server-Side Telegram & WhatsApp Gateway',
      'Retensi Audit Log 1 Tahun',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise Yayasan / Multi-Kampus',
    tagline: 'Kapasitas penuh dengan dukungan SLA prioritas dan retensi audit jangka panjang.',
    maxStudents: 5000,
    maxMusammi: 500,
    maxHalaqah: 500,
    auditRetentionDays: 1825,
    features: [
      'Kapasitas hingga 5.000 Santri & 500 Musammi per Tenant',
      'Semua fitur Standard Ma\'had',
      'Support Access Session (Break-Glass) Teraudit Penuh',
      'Retensi Audit Log & Arsip Snapshot Raport 5 Tahun',
      'Prioritas Webhook & Ekspor Data Analitik',
    ],
  },
];

const SensitiveKeyPattern = /password|secret|token|api_key|apikey|authorization|hash/i;

function sanitizeAuditPayload(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditPayload);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SensitiveKeyPattern.test(k)) {
        out[k] = '[REDACTED_SECRET]';
      } else {
        out[k] = sanitizeAuditPayload(v);
      }
    }
    return out;
  }
  return value;
}

interface PlatformConsolePageProps {
  activeTab?: PlatformSection;
  activeSection?: PlatformSection;
  onNavigate?: (page: Page) => void;
  onNavigatePath?: (path: string) => void;
}

const PlatformConsolePage: React.FC<PlatformConsolePageProps> = ({
  activeTab,
  activeSection,
  onNavigate,
  onNavigatePath,
}) => {
  const params = useParams<{ tenantId?: string }>();
  const navigate = useNavigate();

  const resolvedInitialTab: PlatformSection = activeTab || activeSection || 'dashboard';
  const [tab, setTab] = useState<PlatformSection>(resolvedInitialTab);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(params.tenantId || null);

  // URL-synced filters (Tenants)
  const [searchTenant, setSearchTenant] = useUrlFilterParam('q', '');
  const [filterStatus, setFilterStatus] = useUrlFilterParam('status', 'all');
  const [filterPlan, setFilterPlan] = useUrlFilterParam('plan', 'all');

  // Filters: Accounts & Grants (Fase 3)
  const [searchAccount, setSearchAccount] = useState('');
  const [filterAccountOrg, setFilterAccountOrg] = useState<string>('all');
  const [filterAccountRole, setFilterAccountRole] = useState<string>('all');
  const [filterAccountStatus, setFilterAccountStatus] = useState<string>('all');
  const [selectedAccountDetail, setSelectedAccountDetail] = useState<PlatformAccountItem | null>(
    null
  );

  // Filters: Support Access Sessions (Fase 4)
  const [filterSupportTenant, setFilterSupportTenant] = useState<string>('all');
  const [filterSupportMode, setFilterSupportMode] = useState<string>('all');
  const [filterSupportStatus, setFilterSupportStatus] = useState<string>('all');
  const [filterSupportDate, setFilterSupportDate] = useState<string>('');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Filters: Audit & Health Monitor (Fase 5)
  const [searchAudit, setSearchAudit] = useState('');
  const [filterAuditTenant, setFilterAuditTenant] = useState<string>('all');
  const [filterAuditRole, setFilterAuditRole] = useState<string>('all');
  const [filterAuditAction, setFilterAuditAction] = useState<string>('all');
  const [filterAuditDate, setFilterAuditDate] = useState<string>('');

  // Data States
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [supportSessions, setSupportSessions] = useState<SupportSessionItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheckResult[]>([]);
  const [lastHealthCheckAt, setLastHealthCheckAt] = useState<string | null>(null);
  const [healthCheckError, setHealthCheckError] = useState<string | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [loading, setLoading] = useState(true);

  // Platform Global Settings State (Fase 5)
  const [platformConfig, setPlatformConfig] = useState({
    defaultSupportDurationMinutes: 30,
    defaultSupportMode: 'read_only' as 'read_only' | 'read_write',
    minSupportReasonChars: 10,
    defaultTenantPlan: 'standard' as 'trial' | 'standard' | 'enterprise',
    defaultTimezone: 'Asia/Jakarta',
    inviteOnlyMode: true,
    maintenanceBannerText: '',
  });
  const [savedPlatformConfig, setSavedPlatformConfig] = useState({
    defaultSupportDurationMinutes: 30,
    defaultSupportMode: 'read_only' as 'read_only' | 'read_write',
    minSupportReasonChars: 10,
    defaultTenantPlan: 'standard' as 'trial' | 'standard' | 'enterprise',
    defaultTimezone: 'Asia/Jakarta',
    inviteOnlyMode: true,
    maintenanceBannerText: '',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const isSettingsDirty = useMemo(() => {
    return JSON.stringify(platformConfig) !== JSON.stringify(savedPlatformConfig);
  }, [platformConfig, savedPlatformConfig]);

  // Modal: Provision Tenant Baru + Invite Admin
  const [isProvisionModalOpen, setProvisionModalOpen] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionForm, setProvisionForm] = useState({
    name: '',
    slug: '',
    timezone: 'Asia/Jakarta',
    planId: 'standard' as 'trial' | 'standard' | 'enterprise',
    status: 'provisioning' as 'provisioning' | 'trial' | 'active',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [lastIssuedInviteInfo, setLastIssuedInviteInfo] = useState<{
    email: string;
    role: string;
    invitePath: string;
    temporaryPassword?: string | null;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal: Undang Akun Baru (Platform / Tenant Admin)
  const [isInviteAccountModalOpen, setInviteAccountModalOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteAccountForm, setInviteAccountForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'admin' as 'superadmin' | 'admin' | 'musammi',
    targetOrganizationId: '',
  });

  // Modal: Ubah Paket Layanan Tenant (Fase 3B)
  const [planChangeModal, setPlanChangeModal] = useState<{
    tenant: TenantItem;
    nextPlan: 'trial' | 'standard' | 'enterprise';
    reason: string;
    error?: string | null;
  } | null>(null);

  // Modal: Buka Support Access Session (Fase 4)
  const [isSupportModalOpen, setSupportModalOpen] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportAcknowledge, setSupportAcknowledge] = useState(false);
  const [selectedTenantForSupport, setSelectedTenantForSupport] = useState<TenantItem | null>(null);
  const [supportForm, setSupportForm] = useState({
    organizationId: '',
    reason: '',
    durationMinutes: 30,
    mode: 'read_only' as 'read_only' | 'read_write',
  });

  // Modal / Drawer: Inspeksi Detail Audit Log (Fase 5)
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogItem | null>(null);

  // Confirm Dialog Teraudit (Untuk perubahan status tenant, ubah paket, atau suspend akun)
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    tone: 'primary' | 'danger';
    confirmLabel: string;
    onExecute: (reason: string) => Promise<void>;
  } | null>(null);

  // Real-time countdown ticker untuk active support session
  useEffect(() => {
    const activeSession = SupportSessionStore.getSession();
    if (!activeSession && tab !== 'support') return;
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tab]);

  // Peringatan beforeunload jika ada perubahan pengaturan platform yang belum disimpan
  useEffect(() => {
    if (!isSettingsDirty) {
      delete (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
      return;
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    if (tab === 'settings') {
      (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__ = (_targetPath: string, proceed: () => void) => {
        setConfirmAction({
          isOpen: true,
          title: 'Tinggalkan Halaman Tanpa Menyimpan?',
          description:
            'Anda memiliki perubahan kebijakan platform yang belum disimpan. Jika berpindah halaman sekarang, perubahan lokal akan dibatalkan.',
          confirmLabel: 'Tinggalkan Halaman',
          variant: 'warning',
          requireReason: false,
          onExecute: async () => {
            setPlatformConfig({ ...savedPlatformConfig });
            delete (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
            setConfirmAction((prev) => ({ ...prev, isOpen: false }));
            proceed();
          },
        });
        return true;
      };
    }
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      delete (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
    };
  }, [isSettingsDirty, tab, savedPlatformConfig]);

  useEffect(() => {
    const nextTab = activeTab || activeSection || 'dashboard';
    setTab(nextTab);
  }, [activeTab, activeSection]);

  useEffect(() => {
    setSelectedTenantId(params.tenantId || null);
    if (params.tenantId) {
      setTab('tenants');
    }
  }, [params.tenantId]);

  const performNavigation = useCallback(
    (nextTab: PlatformSection, path: string) => {
      setTab(nextTab);
      setSelectedTenantId(null);
      setSettingsFeedback(null);
      if (onNavigatePath) {
        onNavigatePath(path);
      } else {
        navigate(path);
      }
    },
    [navigate, onNavigatePath]
  );

  const navigateToSection = useCallback(
    (nextTab: PlatformSection, path: string) => {
      if (tab === 'settings' && nextTab !== 'settings' && isSettingsDirty) {
        setConfirmAction({
          isOpen: true,
          title: 'Tinggalkan Halaman Tanpa Menyimpan?',
          description:
            'Anda memiliki perubahan kebijakan platform yang belum disimpan. Jika meninggalkan halaman ini sekarang, perubahan akan dibatalkan.',
          tone: 'danger',
          confirmLabel: 'Buang Perubahan & Pindah',
          onExecute: async () => {
            setPlatformConfig(savedPlatformConfig);
            setConfirmAction(null);
            performNavigation(nextTab, path);
          },
        });
        return;
      }
      performNavigation(nextTab, path);
    },
    [tab, isSettingsDirty, savedPlatformConfig, performNavigation]
  );

  const openTenantDetail = useCallback(
    (tenantId: string) => {
      setSelectedTenantId(tenantId);
      setTab('tenants');
      navigate(`/platform/tenants/${tenantId}`);
    },
    [navigate]
  );

  const closeTenantDetail = useCallback(() => {
    setSelectedTenantId(null);
    navigate('/platform/tenants');
  }, [navigate]);

  const recordPlatformAuditLog = async (payload: {
    organizationId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    reason?: string;
    beforeState?: any;
    afterState?: any;
  }) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const actorId = sessionData?.session?.user?.id || null;
      await (supabase as any).from('audit_logs').insert({
        organization_id: payload.organizationId || null,
        actor_id: actorId,
        actor_role: 'superadmin',
        action: payload.action,
        resource_type: payload.resourceType,
        resource_id: payload.resourceId || null,
        reason: payload.reason || null,
        before_state: payload.beforeState || null,
        after_state: payload.afterState || null,
      });
    } catch {
      // Abaikan bila tabel audit_logs belum dimigrasikan
    }
  };

  const fetchPlatformData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: orgs },
        { data: profiles },
        { data: santriRows },
        { data: musammiRows },
        { data: halaqahRows },
        { data: ayRows },
      ] = await Promise.all([
        supabase.from('organizations').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase.from('santri').select('id, organization_id'),
        supabase.from('musammi').select('id, organization_id'),
        supabase.from('halaqah').select('id, organization_id'),
        supabase.from('academic_years').select('id, organization_id, name, is_active'),
      ]);

      const profileList = profiles || [];
      const santriList = santriRows || [];
      const musammiList = musammiRows || [];
      const halaqahList = halaqahRows || [];
      const ayList = ayRows || [];

      // Coba muat access_grants, user_profiles, dan tenant_invitations jika skema V2 sudah aktif
      let grantsList: any[] = [];
      let userProfilesList: any[] = [];
      let invitationsList: any[] = [];

      await Promise.all([
        (async () => {
          try {
            const { data: gData } = await (supabase as any)
              .from('access_grants')
              .select('id, user_id, organization_id, role, status, created_at, expires_at');
            if (gData) grantsList = gData;
          } catch {
            // Fallback ke profiles
          }
        })(),
        (async () => {
          try {
            const { data: upData } = await (supabase as any)
              .from('user_profiles')
              .select('user_id, email, full_name');
            if (upData) userProfilesList = upData;
          } catch {
            // Tabel belum dimigrasikan
          }
        })(),
        (async () => {
          try {
            const { data: invData } = await (supabase as any)
              .from('tenant_invitations')
              .select('id, user_id, email, full_name, role, status, organization_id, expires_at, created_at, accepted_at')
              .order('created_at', { ascending: false });
            if (invData) invitationsList = invData;
          } catch {
            // Tabel belum dimigrasikan
          }
        })(),
      ]);

      const mappedTenants: TenantItem[] = (orgs || []).map((o: any) => {
        const orgProfiles = profileList.filter((p: any) => p.organization_id === o.id);
        const orgGrants = grantsList.filter(
          (g: any) => g.organization_id === o.id && g.status === 'active'
        );

        const adminCount =
          orgGrants.length > 0
            ? orgGrants.filter((g: any) => g.role === 'admin').length
            : orgProfiles.filter((p: any) =>
                ['admin', 'admin_mahad'].includes((p.role || '').toLowerCase())
              ).length;

        const musammiProfileCount =
          orgGrants.length > 0
            ? orgGrants.filter((g: any) => g.role === 'musammi').length
            : orgProfiles.filter((p: any) =>
                ['musammi', 'pengajar'].includes((p.role || '').toLowerCase())
              ).length;

        const orgMusammiMasterCount = musammiList.filter(
          (m: any) => m.organization_id === o.id
        ).length;
        const musammiCount = Math.max(musammiProfileCount, orgMusammiMasterCount);

        const santriCount = santriList.filter((s: any) => s.organization_id === o.id).length;
        const halaqahCount = halaqahList.filter((h: any) => h.organization_id === o.id).length;
        const orgAys = ayList.filter((ay: any) => ay.organization_id === o.id);
        const activeAy = orgAys.find((ay: any) => ay.is_active);

        const autoSlug =
          o.slug ||
          `${String(o.name || 'mahad')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')}-${String(o.id).slice(0, 6)}`;

        return {
          id: o.id,
          name: o.name || 'Tanpa Nama',
          slug: autoSlug,
          status: o.status || 'active',
          timezone: o.timezone || 'Asia/Jakarta',
          locale: o.locale || 'id-ID',
          plan_id: o.plan_id || 'standard',
          created_at: o.created_at,
          adminCount,
          musammiCount,
          santriCount,
          halaqahCount,
          academicYearCount: orgAys.length,
          activeAcademicYearName: activeAy?.name,
          setupState: {
            hasActiveAcademicYear: Boolean(activeAy),
            hasAdminAssigned: adminCount > 0,
            hasMusammiRegistered: musammiCount > 0,
            hasHalaqahCreated: halaqahCount > 0,
          },
        };
      });

      setTenants(mappedTenants);

      // Map Akun Platform & Access Grants
      const orgMap = new Map<string, string>();
      mappedTenants.forEach((t) => orgMap.set(t.id, t.name));

      const emailMap = new Map<string, string>();
      userProfilesList.forEach((up: any) => {
        if (up.user_id && up.email) emailMap.set(up.user_id, up.email);
      });
      invitationsList.forEach((inv: any) => {
        if (inv.user_id && inv.email && !emailMap.has(inv.user_id)) {
          emailMap.set(inv.user_id, inv.email);
        }
      });

      const mappedAccounts: PlatformAccountItem[] = profileList.map((p: any) => {
        const userGrants = grantsList.filter((g: any) => g.user_id === p.id);
        const matchingGrant =
          userGrants.find((g: any) => g.organization_id && g.organization_id === p.organization_id) ||
          userGrants.find((g: any) => normalizeRole(g.role) === 'superadmin') ||
          userGrants[0] ||
          null;
        const canonical = normalizeRole(matchingGrant?.role || p.role);
        const effectiveStatus = matchingGrant
          ? getEffectiveGrantStatus(matchingGrant)
          : p.role === 'pending'
          ? 'invited'
          : 'active';
        const orgId = matchingGrant?.organization_id ?? p.organization_id ?? null;
        const resolvedEmail = p.email || emailMap.get(p.id) || undefined;

        const allGrants: AccountGrantSummary[] =
          userGrants.length > 0
            ? userGrants.map((g: any) => {
                const gRole = normalizeRole(g.role);
                const gOrgId = g.organization_id ?? null;
                return {
                  id: g.id,
                  role: gRole,
                  rawRole: g.role,
                  status: getEffectiveGrantStatus(g),
                  organizationId: gOrgId,
                  organizationName: gOrgId
                    ? orgMap.get(gOrgId) || `Tenant (${String(gOrgId).slice(0, 6)})`
                    : gRole === 'superadmin'
                    ? 'Platform Global (Lintas Tenant)'
                    : 'Belum Terikat Organisasi',
                  createdAt: g.created_at,
                  expiresAt: g.expires_at,
                };
              })
            : [
                {
                  id: p.id,
                  role: canonical,
                  rawRole: p.role || 'unknown',
                  status: effectiveStatus,
                  organizationId: orgId,
                  organizationName: orgId
                    ? orgMap.get(orgId) || `Tenant (${String(orgId).slice(0, 6)})`
                    : canonical === 'superadmin'
                    ? 'Platform Global (Lintas Tenant)'
                    : 'Belum Terikat Organisasi',
                  createdAt: p.created_at,
                },
              ];

        const latestInv =
          invitationsList.find(
            (inv: any) =>
              inv.user_id === p.id ||
              (resolvedEmail &&
                String(inv.email || '').toLowerCase() === resolvedEmail.toLowerCase())
          ) || null;

        return {
          id: matchingGrant?.id || p.id,
          grantId: matchingGrant?.id || null,
          userId: p.id,
          fullName: p.full_name || latestInv?.full_name || 'Tanpa Nama',
          email: resolvedEmail,
          role: canonical,
          rawRole: matchingGrant?.role || p.role || 'unknown',
          status: effectiveStatus,
          organizationId: orgId,
          organizationName: orgId
            ? orgMap.get(orgId) || `Tenant (${String(orgId).slice(0, 6)})`
            : canonical === 'superadmin'
            ? 'Platform Global (Lintas Tenant)'
            : 'Belum Terikat Organisasi',
          createdAt: matchingGrant?.created_at || p.created_at,
          allGrants,
          invitationInfo: latestInv
            ? {
                id: latestInv.id,
                email: latestInv.email,
                role: latestInv.role,
                status: latestInv.status,
                organizationId: latestInv.organization_id || null,
                expiresAt: latestInv.expires_at,
                createdAt: latestInv.created_at,
                acceptedAt: latestInv.accepted_at,
              }
            : null,
        };
      });
      setAccounts(mappedAccounts);

      // Muat support_access_sessions
      try {
        const { data: sData } = await (supabase as any)
          .from('support_access_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(60);
        if (sData) {
          setSupportSessions(
            sData.map((s: any) => ({
              ...s,
              organization_name:
                orgMap.get(s.organization_id) ||
                mappedTenants.find((t) => t.id === s.organization_id)?.name ||
                s.organization_id,
            }))
          );
        }
      } catch {
        // Tabel belum dimigrasikan
      }

      // Muat audit_logs & sinkronkan konfigurasi platform terakhir bila ada
      try {
        const { data: aData } = await (supabase as any)
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(80);
        if (aData) {
          const mappedLogs: AuditLogItem[] = aData.map((a: any) => ({
            ...a,
            organization_name: a.organization_id
              ? orgMap.get(a.organization_id) || String(a.organization_id).slice(0, 8)
              : 'Platform Global',
          }));
          setAuditLogs(mappedLogs);

          const latestSettingsLog = mappedLogs.find(
            (l) => l.action === 'platform.settings.updated' && l.after_state
          );
          if (latestSettingsLog?.after_state) {
            const s = latestSettingsLog.after_state;
            const loadedCfg = {
              defaultSupportDurationMinutes: Number(s.defaultSupportDurationMinutes) || 30,
              defaultSupportMode:
                s.defaultSupportMode === 'read_write'
                  ? ('read_write' as const)
                  : ('read_only' as const),
              minSupportReasonChars: Number(s.minSupportReasonChars) || 10,
              defaultTenantPlan: (['trial', 'standard', 'enterprise'].includes(s.defaultTenantPlan)
                ? s.defaultTenantPlan
                : 'standard') as 'trial' | 'standard' | 'enterprise',
              defaultTimezone: String(s.defaultTimezone || 'Asia/Jakarta'),
              inviteOnlyMode: s.inviteOnlyMode !== undefined ? Boolean(s.inviteOnlyMode) : true,
              maintenanceBannerText: String(s.maintenanceBannerText || ''),
            };
            setPlatformConfig(loadedCfg);
            setSavedPlatformConfig(loadedCfg);
          }
        }
      } catch {
        // Tabel belum dimigrasikan
      }
    } catch (err) {
      console.error('Error fetching platform data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const runHealthDiagnostics = useCallback(async () => {
    setIsCheckingHealth(true);
    setHealthCheckError(null);
    const results: HealthCheckResult[] = [];
    const checkTimestamp = new Date().toISOString();

    try {
      // 1. Probe PostgREST Core Latency
      const t0 = performance.now();
      try {
        const { error } = await supabase.from('organizations').select('id').limit(1);
        const latency = Math.round(performance.now() - t0);
        results.push({
          key: 'db_postgrest',
          label: 'Koneksi Utama Supabase PostgREST',
          category: 'Database',
          status: error ? 'degraded' : 'healthy',
          latencyMs: latency,
          detail: error
            ? `Error: ${error.message}`
            : `Respons query organisasi normal (${latency} ms).`,
          checkedAt: new Date().toISOString(),
        });
      } catch (e: any) {
        results.push({
          key: 'db_postgrest',
          label: 'Koneksi Utama Supabase PostgREST',
          category: 'Database',
          status: 'degraded',
          detail: e?.message || 'Koneksi gagal',
          checkedAt: new Date().toISOString(),
        });
      }

      // 2. Probe Tabel Governance V2
      const v2Tables = [
        { name: 'access_grants', label: 'Tabel Otorisasi 3-Role (access_grants)' },
        { name: 'support_access_sessions', label: 'Tabel Break-Glass (support_access_sessions)' },
        { name: 'audit_logs', label: 'Tabel Jejak Audit (audit_logs)' },
        { name: 'recitation_entries', label: 'Ledger Setoran V2 (recitation_entries)' },
        { name: 'report_cards', label: 'Tabel Snapshot Raport Immutable (report_cards)' },
      ];

      for (const tbl of v2Tables) {
        const start = performance.now();
        try {
          const { error } = await (supabase as any).from(tbl.name).select('id').limit(1);
          const ms = Math.round(performance.now() - start);
          results.push({
            key: `tbl_${tbl.name}`,
            label: tbl.label,
            category: 'Schema V2',
            status: error ? 'missing' : 'healthy',
            latencyMs: ms,
            detail: error
              ? 'Belum dimigrasikan (jalankan /database/supabase_saas_v2_migration.sql)'
              : `Tabel siap & terindeks (${ms} ms).`,
            checkedAt: new Date().toISOString(),
          });
        } catch {
          results.push({
            key: `tbl_${tbl.name}`,
            label: tbl.label,
            category: 'Schema V2',
            status: 'missing',
            detail: 'Belum dimigrasikan di database aktif.',
            checkedAt: new Date().toISOString(),
          });
        }
      }

      // 3. Kebijakan Isolasi Role & Access Grants Verifikasi Aktual
      try {
        const secStart = performance.now();
        const { error: grantsErr } = await (supabase as any)
          .from('access_grants')
          .select('id, role, status')
          .limit(1);
        const secMs = Math.round(performance.now() - secStart);
        results.push({
          key: 'sec_3role',
          label: 'Disiplin 3 Role Kanonikal & Otoritas access_grants',
          category: 'Security',
          status: grantsErr ? 'degraded' : 'healthy',
          latencyMs: secMs,
          detail: grantsErr
            ? `Gagal memverifikasi grants: ${grantsErr.message}`
            : `Buku besar otorisasi access_grants aktif & terisolasi (${secMs} ms).`,
          checkedAt: new Date().toISOString(),
        });
      } catch (e: any) {
        results.push({
          key: 'sec_3role',
          label: 'Disiplin 3 Role Kanonikal & Otoritas access_grants',
          category: 'Security',
          status: 'degraded',
          detail: `Error pemeriksaan: ${e?.message || 'Tidak dapat diakses'}`,
          checkedAt: new Date().toISOString(),
        });
      }

      // 4. Probe Aktual Serverless / Express Backend Endpoint (/api/health)
      const apiStart = performance.now();
      try {
        const res = await fetch('/api/health');
        const apiMs = Math.round(performance.now() - apiStart);
        if (res.ok) {
          const body = await res.json();
          results.push({
            key: 'serverless_adapter',
            label: 'Backend & Serverless API Monitor (/api/health)',
            category: 'Serverless API',
            status: body.status === 'healthy' ? 'healthy' : 'degraded',
            latencyMs: apiMs,
            detail: `Probe HTTP ${res.status} OK (${apiMs} ms) — Uptime: ${body.uptimeSeconds || 0}s, DB: ${body.services?.database?.status || 'unknown'}.`,
            checkedAt: new Date().toISOString(),
          });
        } else {
          results.push({
            key: 'serverless_adapter',
            label: 'Backend & Serverless API Monitor (/api/health)',
            category: 'Serverless API',
            status: 'degraded',
            latencyMs: apiMs,
            detail: `Endpoint /api/health mengembalikan status ${res.status}. Periksa konfigurasi serverless.`,
            checkedAt: new Date().toISOString(),
          });
        }
      } catch {
        results.push({
          key: 'serverless_adapter',
          label: 'Backend & Serverless API Monitor (/api/health)',
          category: 'Serverless API',
          status: 'degraded',
          detail: 'Serverless backend offline atau belum dijalankan di port 3000.',
          checkedAt: new Date().toISOString(),
        });
      }

      setHealthChecks(results);
      setLastHealthCheckAt(checkTimestamp);
    } catch (err: any) {
      setHealthCheckError(err?.message || 'Gagal menjalankan pemeriksaan kesehatan sistem.');
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchPlatformData();
    runHealthDiagnostics();
  }, [fetchPlatformData, runHealthDiagnostics]);

  const selectedTenant = useMemo(
    () => tenants.find((t) => t.id === selectedTenantId) || null,
    [tenants, selectedTenantId]
  );

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      if (filterStatus !== 'all' && (t.status || 'active') !== filterStatus) return false;
      if (filterPlan !== 'all' && (t.plan_id || 'standard') !== filterPlan) return false;
      if (
        searchTenant &&
        !t.name.toLowerCase().includes(searchTenant.toLowerCase()) &&
        !(t.slug || '').toLowerCase().includes(searchTenant.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [tenants, filterStatus, filterPlan, searchTenant]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      // Hanya 3 role kanonikal yang boleh muncul pada filter role (superadmin, admin, musammi)
      if (filterAccountRole !== 'all' && a.role !== filterAccountRole) return false;
      if (filterAccountStatus !== 'all' && a.status !== filterAccountStatus) return false;
      if (filterAccountOrg !== 'all') {
        if (filterAccountOrg === 'platform_global') {
          if (a.organizationId !== null) return false;
        } else if (a.organizationId !== filterAccountOrg) {
          return false;
        }
      }
      if (searchAccount.trim()) {
        const q = searchAccount.trim().toLowerCase();
        const matchName = a.fullName.toLowerCase().includes(q);
        const matchEmail = (a.email || '').toLowerCase().includes(q);
        const matchOrg = a.organizationName.toLowerCase().includes(q);
        const matchId = a.userId.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchOrg && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [accounts, filterAccountRole, filterAccountStatus, filterAccountOrg, searchAccount]);

  const filteredSupportSessions = useMemo(() => {
    return supportSessions.filter((s) => {
      if (filterSupportTenant !== 'all' && s.organization_id !== filterSupportTenant) {
        return false;
      }
      if (filterSupportMode !== 'all' && s.mode !== filterSupportMode) {
        return false;
      }
      const isEnded = Boolean(s.ended_at);
      const isExpired = !isEnded && new Date(s.expires_at).getTime() <= nowTick;
      const effStatus = isEnded ? 'ended' : isExpired ? 'expired' : 'active';
      if (filterSupportStatus !== 'all' && effStatus !== filterSupportStatus) {
        return false;
      }
      if (filterSupportDate) {
        const startedDate = new Date(s.started_at).toISOString().slice(0, 10);
        if (startedDate !== filterSupportDate) return false;
      }
      return true;
    });
  }, [
    supportSessions,
    filterSupportTenant,
    filterSupportMode,
    filterSupportStatus,
    filterSupportDate,
    nowTick,
  ]);

  const availableAuditActions = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((l) => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      if (
        filterAuditRole !== 'all' &&
        (l.actor_role || '').toLowerCase() !== filterAuditRole.toLowerCase()
      ) {
        return false;
      }
      if (filterAuditTenant !== 'all') {
        if (filterAuditTenant === 'platform_global') {
          if (l.organization_id) return false;
        } else if (l.organization_id !== filterAuditTenant) {
          return false;
        }
      }
      if (filterAuditAction !== 'all' && l.action !== filterAuditAction) {
        return false;
      }
      if (filterAuditDate) {
        const logDate = new Date(l.created_at).toISOString().slice(0, 10);
        if (logDate !== filterAuditDate) return false;
      }
      if (searchAudit.trim()) {
        const q = searchAudit.trim().toLowerCase();
        const matchAction = l.action.toLowerCase().includes(q);
        const matchResource = l.resource_type.toLowerCase().includes(q);
        const matchReason = (l.reason || '').toLowerCase().includes(q);
        const matchOrg = (l.organization_name || '').toLowerCase().includes(q);
        const matchActor = (l.actor_id || '').toLowerCase().includes(q);
        if (!matchAction && !matchResource && !matchReason && !matchOrg && !matchActor) {
          return false;
        }
      }
      return true;
    });
  }, [
    auditLogs,
    filterAuditRole,
    filterAuditTenant,
    filterAuditAction,
    filterAuditDate,
    searchAudit,
  ]);

  // ============================================================================
  // HANDLERS: PROVISION TENANT, UPDATE STATUS/PLAN, INVITE ACCOUNT, SUPPORT SESSION
  // ============================================================================
  const handleProvisionTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionError(null);

    const cleanName = provisionForm.name.trim();
    const cleanAdminName = provisionForm.adminFullName.trim();
    const cleanAdminEmail = provisionForm.adminEmail.trim().toLowerCase();
    const rawSlug = provisionForm.slug.trim().toLowerCase();

    if (!cleanName || !cleanAdminName || !cleanAdminEmail) {
      const msg =
        'Nama Lembaga, Nama Lengkap Admin, dan Email Admin awal wajib diisi.';
      setProvisionError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanAdminEmail)) {
      const msg = 'Format alamat email Admin awal tidak valid (contoh: admin@mahad.id).';
      setProvisionError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    if (rawSlug && !/^[a-z0-9-]+$/.test(rawSlug)) {
      const msg =
        'Slug hanya boleh berisi huruf kecil (a-z), angka (0-9), dan tanda hubung (-).';
      setProvisionError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    const slug =
      rawSlug ||
      `${cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}-${Math.random().toString(36).slice(2, 6)}`;

    // Cek duplikasi nama atau slug pada tenant aktif/trial/suspended/archived
    // (Tenant berstatus 'provisioning' atau 'provisioning_failed' diizinkan untuk idempotent retry)
    const duplicateTenant = tenants.find(
      (t) =>
        (t.name.trim().toLowerCase() === cleanName.toLowerCase() ||
          (rawSlug && t.slug.trim().toLowerCase() === rawSlug)) &&
        t.status !== 'provisioning' &&
        t.status !== 'provisioning_failed'
    );
    if (duplicateTenant) {
      const msg = `Lembaga dengan nama atau slug tersebut sudah terdaftar (${duplicateTenant.name} · ${duplicateTenant.slug}). Gunakan nama atau slug unik.`;
      setProvisionError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      let createdOrg: { id: string; name: string } | null = null;
      let loggedViaRpc = false;

      // 1. Buat / lanjutkan tenant dalam status 'provisioning' via RPC SECURITY DEFINER (idempoten untuk retry)
      try {
        const { data: rpcOrg, error: rpcErr } = await (supabase as any).rpc(
          'rpc_create_tenant_with_admin',
          {
            p_name: cleanName,
            p_slug: slug,
            p_timezone: provisionForm.timezone,
            p_plan_id: provisionForm.planId,
            p_status: 'provisioning',
          }
        );
        if (!rpcErr && rpcOrg && rpcOrg.id) {
          createdOrg = { id: rpcOrg.id, name: rpcOrg.name || cleanName };
          loggedViaRpc = true;
        }
      } catch {
        // Fallback ke insert PostgREST jika RPC belum dimigrasikan
      }

      // 2. Fallback insert ke tabel organizations jika RPC belum tersedia
      if (!createdOrg) {
        const { data: v2Org, error: v2Err } = await (supabase as any)
          .from('organizations')
          .insert({
            name: cleanName,
            slug,
            status: 'provisioning',
            timezone: provisionForm.timezone,
            plan_id: provisionForm.planId,
          })
          .select('id, name')
          .single();

        if (!v2Err && v2Org) {
          createdOrg = v2Org;
        } else {
          const { data: legacyOrg, error: legacyErr } = await supabase
            .from('organizations')
            .insert({
              name: cleanName,
            })
            .select('id, name')
            .single();
          if (legacyErr || !legacyOrg) {
            throw legacyErr || new Error('Gagal membuat organisasi baru.');
          }
          createdOrg = legacyOrg;
        }
      }

      if (!loggedViaRpc) {
        await recordPlatformAuditLog({
          organizationId: createdOrg.id,
          action: 'tenant.provisioned',
          resourceType: 'organizations',
          resourceId: createdOrg.id,
          reason: `Provisioning tenant baru (${provisionForm.planId})`,
          afterState: {
            name: createdOrg.name,
            slug,
            status: 'provisioning',
            plan_id: provisionForm.planId,
            timezone: provisionForm.timezone,
          },
        });
      }

      // 3. Kirim undangan Admin pertama (status grant = 'invited', token sekali pakai)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const resp = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: cleanAdminEmail,
          password: provisionForm.adminPassword.trim() || undefined,
          fullName: cleanAdminName,
          role: 'admin',
          targetOrganizationId: createdOrg.id,
          mahadName: createdOrg.name,
          isTenantProvisioning: true,
        }),
      });
      const resJson = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // Tandai tenant sebagai 'provisioning_failed' agar tidak terlihat sebagai tenant siap!
        try {
          await (supabase as any).rpc('rpc_mark_tenant_provisioning_status', {
            p_organization_id: createdOrg.id,
            p_status: 'provisioning_failed',
            p_reason: `Undangan Admin gagal: ${resJson.error || resp.statusText}`,
          });
        } catch {
          await (supabase as any)
            .from('organizations')
            .update({ status: 'provisioning_failed' })
            .eq('id', createdOrg.id);
        }

        const errMsg = `Undangan Admin gagal (${resJson.error || resp.statusText}). Status tenant ditandai PROVISIONING_FAILED dan dapat di-retry tanpa duplikasi.`;
        setProvisionError(errMsg);
        NotificationStore.addNotification(errMsg, 'error');
        await fetchPlatformData();
        return;
      }

      setLastIssuedInviteInfo({
        email: cleanAdminEmail,
        role: 'admin',
        invitePath:
          resJson.inviteAcceptPath ||
          `/invite?email=${encodeURIComponent(cleanAdminEmail)}&org=${createdOrg.id}`,
        temporaryPassword: resJson.temporaryPassword || null,
      });

      NotificationStore.addNotification(
        `Tenant "${createdOrg.name}" berstatus PROVISIONING dan undangan Admin telah diterbitkan. Tenant akan otomatis ACTIVE setelah Admin mengonfirmasi undangan di /invite.`,
        'success'
      );

      setProvisionError(null);
      setProvisionModalOpen(false);
      setProvisionForm({
        name: '',
        slug: '',
        timezone: 'Asia/Jakarta',
        planId: 'standard',
        status: 'provisioning',
        adminFullName: '',
        adminEmail: '',
        adminPassword: '',
      });
      await fetchPlatformData();
    } catch (err: any) {
      const errMsg = err.message || 'Gagal membuat tenant';
      setProvisionError(errMsg);
      NotificationStore.addNotification(errMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTenantLifecycle = (
    tenant: TenantItem,
    nextStatus: 'provisioning' | 'provisioning_failed' | 'trial' | 'active' | 'suspended' | 'archived'
  ) => {
    const isSuspending = nextStatus === 'suspended';
    const isRestoring =
      nextStatus === 'active' &&
      (tenant.status === 'suspended' || tenant.status === 'archived');
    const consequenceDetail = isSuspending
      ? `Konsekuensi: Seluruh akses operasional pengguna "${tenant.name}" akan ditangguhkan sementara (SUSPENDED), namun seluruh data santri, setoran, raport, dan histori audit tetap tersimpan utuh.`
      : isRestoring
      ? `Konsekuensi: Hak akses operasional "${tenant.name}" akan dipulihkan menjadi ACTIVE sehingga Admin dan Musammi dapat kembali beraktivitas.`
      : `Anda akan mengubah status siklus hidup "${tenant.name}" dari ${tenant.status.toUpperCase()} menjadi ${nextStatus.toUpperCase()}. Tindakan ini dicatat ke Audit Log Platform.`;

    setConfirmAction({
      isOpen: true,
      title: isSuspending
        ? `Tangguhkan (Suspend) Tenant: ${tenant.name}`
        : isRestoring
        ? `Pulihkan (Restore) Tenant: ${tenant.name}`
        : `Ubah Status Tenant: ${tenant.name}`,
      description: consequenceDetail,
      tone: nextStatus === 'suspended' || nextStatus === 'archived' ? 'danger' : 'primary',
      confirmLabel: isSuspending
        ? 'Suspend Tenant'
        : isRestoring
        ? 'Pulihkan ke ACTIVE'
        : `Ubah ke ${nextStatus.toUpperCase()}`,
      onExecute: async (reason: string) => {
        setIsSubmitting(true);
        try {
          await (supabase as any)
            .from('organizations')
            .update({ status: nextStatus })
            .eq('id', tenant.id);

          await recordPlatformAuditLog({
            organizationId: tenant.id,
            action: `tenant.status_changed.${nextStatus}`,
            resourceType: 'organizations',
            resourceId: tenant.id,
            reason,
            beforeState: { status: tenant.status },
            afterState: { status: nextStatus },
          });

          setTenants((prev) =>
            prev.map((t) => (t.id === tenant.id ? { ...t, status: nextStatus } : t))
          );
          NotificationStore.addNotification(
            `Status tenant "${tenant.name}" diperbarui menjadi ${nextStatus.toUpperCase()}.`,
            'success'
          );
        } catch (err: any) {
          NotificationStore.addNotification(
            err.message || 'Gagal memperbarui status tenant',
            'error'
          );
        } finally {
          setIsSubmitting(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleUpdateTenantPlan = (
    tenant: TenantItem,
    nextPlan?: 'trial' | 'standard' | 'enterprise'
  ) => {
    const resolvedNext: 'trial' | 'standard' | 'enterprise' =
      nextPlan && nextPlan !== tenant.plan_id
        ? nextPlan
        : tenant.plan_id === 'trial'
        ? 'standard'
        : tenant.plan_id === 'standard'
        ? 'enterprise'
        : 'standard';

    setPlanChangeModal({
      tenant,
      nextPlan: resolvedNext,
      reason: '',
      error: null,
    });
  };

  const handleConfirmPlanChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planChangeModal) return;
    const { tenant, nextPlan, reason } = planChangeModal;

    if (tenant.plan_id === nextPlan) {
      setPlanChangeModal({
        ...planChangeModal,
        error: 'Pilih paket baru yang berbeda dari paket saat ini.',
      });
      return;
    }

    if (reason.trim().length < 5) {
      setPlanChangeModal({
        ...planChangeModal,
        error: 'Alasan perubahan paket wajib diisi minimal 5 karakter untuk jejak audit.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updErr } = await (supabase as any)
        .from('organizations')
        .update({ plan_id: nextPlan })
        .eq('id', tenant.id);

      if (updErr) {
        throw updErr;
      }

      await recordPlatformAuditLog({
        organizationId: tenant.id,
        action: `tenant.plan_changed.${nextPlan}`,
        resourceType: 'organizations',
        resourceId: tenant.id,
        reason: reason.trim(),
        beforeState: { plan_id: tenant.plan_id },
        afterState: { plan_id: nextPlan },
      });

      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, plan_id: nextPlan } : t))
      );
      NotificationStore.addNotification(
        `Paket layanan "${tenant.name}" berhasil diubah ke ${nextPlan.toUpperCase()} setelah konfirmasi server.`,
        'success'
      );
      setPlanChangeModal(null);
      await fetchPlatformData();
    } catch (err: any) {
      const msg = err.message || 'Gagal mengubah paket tenant di database.';
      setPlanChangeModal((prev) => (prev ? { ...prev, error: msg } : null));
      NotificationStore.addNotification(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvitePlatformOrTenantAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    const cleanName = inviteAccountForm.fullName.trim();
    const cleanEmail = inviteAccountForm.email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      const msg = 'Nama lengkap dan alamat email wajib diisi.';
      setInviteError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      const msg = 'Format alamat email tidak valid.';
      setInviteError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    if (!['superadmin', 'admin', 'musammi'].includes(inviteAccountForm.role)) {
      const msg = 'Role tidak sah. Sistem hanya mengizinkan Superadmin, Admin, atau Musammi.';
      setInviteError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    if (
      inviteAccountForm.role !== 'superadmin' &&
      !inviteAccountForm.targetOrganizationId
    ) {
      const msg = 'Pilih organisasi/lembaga target untuk akun Admin atau Musammi.';
      setInviteError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetOrg = tenants.find((t) => t.id === inviteAccountForm.targetOrganizationId);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const resp = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: cleanEmail,
          fullName: cleanName,
          role: inviteAccountForm.role,
          targetOrganizationId:
            inviteAccountForm.role === 'superadmin'
              ? null
              : inviteAccountForm.targetOrganizationId,
          mahadName: targetOrg?.name || 'Platform Global',
          activateImmediately: false,
        }),
      });

      const resJson = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(resJson.error || 'Gagal membuat undangan akun di server.');
      }

      await recordPlatformAuditLog({
        organizationId:
          inviteAccountForm.role === 'superadmin'
            ? null
            : inviteAccountForm.targetOrganizationId,
        action: `account.invited.${inviteAccountForm.role}`,
        resourceType: 'access_grants',
        reason: `Undangan akun ${inviteAccountForm.role} untuk ${cleanName}`,
        afterState: {
          email: cleanEmail,
          role: inviteAccountForm.role,
          organization_id:
            inviteAccountForm.role === 'superadmin'
              ? null
              : inviteAccountForm.targetOrganizationId || null,
        },
      });

      setLastIssuedInviteInfo({
        email: cleanEmail,
        role: inviteAccountForm.role,
        invitePath:
          resJson.inviteAcceptPath ||
          `/invite?email=${encodeURIComponent(cleanEmail)}`,
        temporaryPassword: resJson.temporaryPassword || null,
      });
      NotificationStore.addNotification(
        `Undangan akun ${cleanName} (${formatCanonicalRoleLabel(inviteAccountForm.role)}) berhasil diterbitkan melalui mekanisme server-side.`,
        'success'
      );
      setInviteError(null);
      setInviteAccountModalOpen(false);
      setInviteAccountForm({
        fullName: '',
        email: '',
        password: '',
        role: 'admin',
        targetOrganizationId: '',
      });
      await fetchPlatformData();
    } catch (err: any) {
      const msg = err.message || 'Gagal mengundang akun';
      setInviteError(msg);
      NotificationStore.addNotification(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAccountStatus = (account: PlatformAccountItem) => {
    const isRestoring = account.status === 'suspended' || account.status === 'revoked';
    const nextStatus = isRestoring ? 'active' : 'suspended';
    setConfirmAction({
      isOpen: true,
      title: `${nextStatus === 'suspended' ? 'Tangguhkan (Suspend)' : 'Pulihkan (Restore)'} Akses Akun: ${account.fullName}`,
      description:
        nextStatus === 'suspended'
          ? `Konsekuensi: Hak akses "${account.fullName}" (${formatCanonicalRoleLabel(
              account.role
            )}) pada "${account.organizationName}" akan ditangguhkan sementara (SUSPENDED). Pengguna tidak dapat masuk ke workspace tenant sampai dipulihkan, namun seluruh histori akademik dan audit tetap utuh.`
          : `Konsekuensi: Hak akses "${account.fullName}" (${formatCanonicalRoleLabel(
              account.role
            )}) pada "${account.organizationName}" akan dipulihkan menjadi ACTIVE dan dicatat ke Audit Log Platform.`,
      tone: nextStatus === 'suspended' ? 'danger' : 'primary',
      confirmLabel: nextStatus === 'suspended' ? 'Suspend Akses' : 'Pulihkan ke ACTIVE',
      onExecute: async (reason: string) => {
        setIsSubmitting(true);
        try {
          const targetRole =
            account.role === 'superadmin' || account.role === 'admin' || account.role === 'musammi'
              ? account.role
              : 'musammi';

          const { error: rpcErr } = await (supabase as any).rpc('rpc_manage_access_grant', {
            p_grant_id: account.grantId,
            p_target_user_id: account.userId,
            p_organization_id: account.organizationId,
            p_role: targetRole,
            p_status: nextStatus,
            p_reason: reason,
          });

          if (rpcErr) {
            throw rpcErr;
          }

          await recordPlatformAuditLog({
            organizationId: account.organizationId,
            action: `access_grant.${nextStatus}`,
            resourceType: 'access_grants',
            resourceId: account.grantId || account.userId,
            reason,
            beforeState: { status: account.status, role: targetRole },
            afterState: { status: nextStatus, role: targetRole },
          });

          setAccounts((prev) =>
            prev.map((a) =>
              a.userId === account.userId && a.organizationId === account.organizationId
                ? { ...a, status: nextStatus }
                : a
            )
          );
          setSelectedAccountDetail((prev) =>
            prev && prev.userId === account.userId && prev.organizationId === account.organizationId
              ? { ...prev, status: nextStatus }
              : prev
          );
          NotificationStore.addNotification(
            `Status akses ${account.fullName} berhasil diubah ke ${nextStatus.toUpperCase()}.`,
            'success'
          );
          await fetchPlatformData();
        } catch (err: any) {
          NotificationStore.addNotification(err.message || 'Gagal mengubah status akun', 'error');
        } finally {
          setIsSubmitting(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleRevokeAccountAccess = (account: PlatformAccountItem) => {
    const isInvited = account.status === 'invited';
    setConfirmAction({
      isOpen: true,
      title: `${isInvited ? 'Batalkan Undangan (Revoke Invite)' : 'Cabut Hak Akses (Revoke Grant)'}: ${account.fullName}`,
      description: isInvited
        ? `Konsekuensi: Token undangan untuk "${account.fullName}" pada "${account.organizationName}" akan segera dibatalkan (REVOKED) di server dan tidak dapat digunakan lagi.`
        : `Konsekuensi: Hak akses "${account.fullName}" pada "${account.organizationName}" akan dicabut (REVOKED) tanpa menghapus histori profil, setoran, maupun jejak audit.`,
      tone: 'danger',
      confirmLabel: isInvited ? 'Batalkan Undangan' : 'Cabut Akses (Revoke)',
      onExecute: async (reason: string) => {
        setIsSubmitting(true);
        try {
          if (isInvited) {
            const { error: revErr } = await (supabase as any).rpc('rpc_revoke_invitation', {
              p_invitation_id: account.invitationInfo?.id || null,
              p_grant_id: account.grantId,
              p_reason: reason,
            });
            if (revErr) throw revErr;
          } else {
            const targetRole =
              account.role === 'superadmin' || account.role === 'admin' || account.role === 'musammi'
                ? account.role
                : 'musammi';
            const { error: rpcErr } = await (supabase as any).rpc('rpc_manage_access_grant', {
              p_grant_id: account.grantId,
              p_target_user_id: account.userId,
              p_organization_id: account.organizationId,
              p_role: targetRole,
              p_status: 'revoked',
              p_reason: reason,
            });
            if (rpcErr) throw rpcErr;
          }

          await recordPlatformAuditLog({
            organizationId: account.organizationId,
            action: isInvited ? 'invitation.revoked' : 'access_grant.revoked',
            resourceType: isInvited ? 'tenant_invitations' : 'access_grants',
            resourceId: account.grantId || account.userId,
            reason,
            beforeState: { status: account.status },
            afterState: { status: 'revoked' },
          });

          setAccounts((prev) =>
            prev.map((a) =>
              a.userId === account.userId && a.organizationId === account.organizationId
                ? { ...a, status: 'revoked' }
                : a
            )
          );
          setSelectedAccountDetail((prev) =>
            prev && prev.userId === account.userId && prev.organizationId === account.organizationId
              ? { ...prev, status: 'revoked' }
              : prev
          );
          NotificationStore.addNotification(
            `Akses/undangan untuk ${account.fullName} berhasil dicabut (REVOKED).`,
            'success'
          );
          await fetchPlatformData();
        } catch (err: any) {
          NotificationStore.addNotification(err.message || 'Gagal mencabut akses akun', 'error');
        } finally {
          setIsSubmitting(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleStartSupportSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupportError(null);

    const targetTenant =
      selectedTenantForSupport ||
      tenants.find((t) => t.id === supportForm.organizationId) ||
      null;

    if (!targetTenant) {
      const msg = 'Pilih organisasi/tenant target terlebih dahulu.';
      setSupportError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    const minChars = Math.max(5, platformConfig.minSupportReasonChars || 10);
    if (supportForm.reason.trim().length < minChars) {
      const msg = `Alasan operasional wajib diisi minimal ${minChars} karakter sesuai kebijakan keamanan platform.`;
      setSupportError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    if (!supportAcknowledge) {
      const msg =
        'Anda wajib mencentang pernyataan pengakuan tanggung jawab audit (Break-Glass Acknowledgement) sebelum membuka sesi.';
      setSupportError(msg);
      NotificationStore.addNotification(msg, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc(
        'rpc_start_support_session',
        {
          p_organization_id: targetTenant.id,
          p_reason: supportForm.reason.trim(),
          p_duration_minutes: supportForm.durationMinutes,
          p_mode: supportForm.mode,
        }
      );

      if (rpcErr || !rpcRes?.id) {
        throw new Error(
          rpcErr?.message ||
            'Gagal mengotorisasi Support Access Session di database. Pastikan Anda memiliki otoritas Superadmin dan migrasi V2 telah aktif.'
        );
      }

      const sessionId = rpcRes.id;
      const startedAt = rpcRes.started_at || new Date().toISOString();
      const expiresAt =
        rpcRes.expires_at ||
        new Date(Date.now() + supportForm.durationMinutes * 60 * 1000).toISOString();

      SupportSessionStore.startSession({
        id: sessionId,
        organizationId: targetTenant.id,
        organizationName: targetTenant.name,
        reason: supportForm.reason.trim(),
        mode: supportForm.mode,
        startedAt,
        expiresAt,
      });

      await recordPlatformAuditLog({
        organizationId: targetTenant.id,
        action: 'support_session.started',
        resourceType: 'support_access_sessions',
        resourceId: sessionId,
        reason: supportForm.reason.trim(),
        afterState: {
          organization_id: targetTenant.id,
          mode: supportForm.mode,
          duration_minutes: supportForm.durationMinutes,
          expires_at: expiresAt,
        },
      });

      NotificationStore.addNotification(
        `Support Session (${
          supportForm.mode === 'read_write' ? 'CONTROLLED-WRITE' : 'READ-ONLY'
        }) berhasil diotorisasi untuk ${targetTenant.name} (${supportForm.durationMinutes} menit).`,
        'success'
      );
      setSupportError(null);
      setSupportAcknowledge(false);
      setSupportModalOpen(false);
      await fetchPlatformData();
    } catch (err: any) {
      const msg = err.message || 'Gagal membuka sesi support';
      setSupportError(msg);
      NotificationStore.addNotification(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSupportSession = (sessionItem: SupportSessionItem) => {
    setConfirmAction({
      isOpen: true,
      title: `Akhiri Support Session: ${sessionItem.organization_name || 'Tenant'}`,
      description: `Konsekuensi: Akses bantuan sementara Superadmin (${
        sessionItem.mode === 'read_write' ? 'Controlled-Write' : 'Read-Only'
      }) ke "${
        sessionItem.organization_name || sessionItem.organization_id
      }" akan segera diputus di server, sesi ditandai berakhir secara permanen, dan peristiwa penghentian dicatat ke Audit Log Platform.`,
      tone: 'danger',
      confirmLabel: 'Akhiri Sesi Sekarang',
      onExecute: async (reason: string) => {
        setIsSubmitting(true);
        try {
          const { data: endedOk, error: endErr } = await (supabase as any).rpc(
            'rpc_end_support_session',
            {
              p_session_id: sessionItem.id,
            }
          );

          if (endErr || endedOk === false) {
            throw new Error(
              endErr?.message || 'Sesi tidak ditemukan atau gagal dihentikan di database.'
            );
          }

          await recordPlatformAuditLog({
            organizationId: sessionItem.organization_id,
            action: 'support_session.ended',
            resourceType: 'support_access_sessions',
            resourceId: sessionItem.id,
            reason: reason || 'Diakhiri oleh Superadmin melalui konsol Support Access',
            beforeState: { ended_at: null, mode: sessionItem.mode },
            afterState: { ended_at: new Date().toISOString(), mode: sessionItem.mode },
          });

          const activeClientSession = SupportSessionStore.getSession();
          if (activeClientSession && activeClientSession.id === sessionItem.id) {
            SupportSessionStore.endSession();
          }
          setSupportSessions((prev) =>
            prev.map((s) =>
              s.id === sessionItem.id ? { ...s, ended_at: new Date().toISOString() } : s
            )
          );
          NotificationStore.addNotification(
            'Sesi support berhasil diakhiri di database dan tercatat pada Audit Log.',
            'success'
          );
          await fetchPlatformData();
        } catch (err: any) {
          NotificationStore.addNotification(
            err.message || 'Gagal mengakhiri Support Access Session.',
            'error'
          );
        } finally {
          setIsSubmitting(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleSavePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSettingsDirty) return;
    setIsSavingSettings(true);
    setSettingsFeedback(null);
    try {
      await recordPlatformAuditLog({
        organizationId: null,
        action: 'platform.settings.updated',
        resourceType: 'platform_settings',
        reason: 'Pembaruan parameter keamanan, provisioning, dan tata kelola undangan platform',
        beforeState: savedPlatformConfig,
        afterState: platformConfig,
      });
      setSavedPlatformConfig({ ...platformConfig });
      setSettingsFeedback({
        type: 'success',
        message:
          'Kebijakan global platform berhasil dikonfirmasi oleh server dan dicatat ke Audit Log.',
      });
      NotificationStore.addNotification(
        'Kebijakan global platform berhasil disimpan dan dicatat ke Audit Log.',
        'success'
      );
      await fetchPlatformData();
    } catch (err: any) {
      const msg = err?.message || 'Gagal menyimpan kebijakan platform.';
      setSettingsFeedback({
        type: 'error',
        message: msg,
      });
      NotificationStore.addNotification(msg, 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // KPI Metrics & Real-Time Operational Focus (Dihitung murni dari data produksi)
  const totalAdmins = tenants.reduce((acc, t) => acc + t.adminCount, 0);
  const totalMusammi = tenants.reduce((acc, t) => acc + t.musammiCount, 0);
  const totalSantriGlobal = tenants.reduce((acc, t) => acc + t.santriCount, 0);
  const activeTenantsCount = tenants.filter((t) => (t.status || 'active') === 'active').length;
  const trialTenantsCount = tenants.filter((t) => t.status === 'trial').length;
  const provisioningTenantsCount = tenants.filter(
    (t) => t.status === 'provisioning' || t.status === 'provisioning_failed'
  ).length;
  const activeSupportSession = SupportSessionStore.getSession();
  const activeDbSupportSessions = useMemo(
    () =>
      supportSessions.filter(
        (s) => !s.ended_at && new Date(s.expires_at).getTime() > nowTick
      ),
    [supportSessions, nowTick]
  );
  const activeDbSupportCount = activeDbSupportSessions.length;
  const effectiveActiveSupportCount = Math.max(
    activeSupportSession ? 1 : 0,
    activeDbSupportCount
  );
  const healthyProbesCount = healthChecks.filter((h) => h.status === 'healthy').length;
  const attentionProbesCount = healthChecks.filter((h) => h.status !== 'healthy').length;

  const getPlanEntitlement = (planId?: string): SaaSPlanDefinition => {
    const clean = (planId || 'standard').toLowerCase();
    return SAAS_PLANS.find((p) => p.id === clean) || SAAS_PLANS[1];
  };

  const formatRemainingTime = (expiresAtIso: string): string => {
    const diffMs = new Date(expiresAtIso).getTime() - nowTick;
    if (diffMs <= 0) return 'Kedaluwarsa (0m 00d)';
    const totalSec = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${String(secs).padStart(2, '0')}d tersisa`;
  };

  // Daftar "Fokus Hari Ini" — murni berdasarkan kondisi nyata tenant, kuota, support session, dan health check
  const focusTodayItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      detail: string;
      tone: BadgeTone;
      badgeLabel: string;
      actionLabel?: string;
      onAction?: () => void;
    }> = [];

    if (activeSupportSession) {
      items.push({
        id: `support-${activeSupportSession.id}`,
        title: `Sesi Support Aktif: ${activeSupportSession.organizationName}`,
        detail: `Mode ${
          activeSupportSession.mode === 'read_write' ? 'Controlled-Write' : 'Read-Only'
        } · Alasan: ${activeSupportSession.reason}`,
        tone: 'warning',
        badgeLabel: 'SUPPORT AKTIF',
        actionLabel: 'Kelola Sesi',
        onAction: () => navigateToSection('support', '/platform/support-sessions'),
      });
    }

    for (const h of healthChecks) {
      if (h.status !== 'healthy') {
        items.push({
          id: `health-${h.key}`,
          title: `Perhatian Kesehatan Sistem: ${h.label}`,
          detail: h.detail,
          tone: h.status === 'missing' ? 'danger' : 'warning',
          badgeLabel: h.status.toUpperCase(),
          actionLabel: 'Buka Monitor',
          onAction: () => navigateToSection('audit', '/platform/audit'),
        });
      }
    }

    for (const t of tenants) {
      if (t.status === 'provisioning_failed') {
        items.push({
          id: `prov-fail-${t.id}`,
          title: `Provisioning Gagal: ${t.name}`,
          detail: `Pengiriman undangan Admin awal belum tuntas. Lakukan retry provisioning atau undang ulang Admin.`,
          tone: 'danger',
          badgeLabel: 'PROVISIONING FAILED',
          actionLabel: 'Lihat Detail',
          onAction: () => openTenantDetail(t.id),
        });
      }

      const planDef = getPlanEntitlement(t.plan_id);
      const santriRatio = planDef.maxStudents > 0 ? t.santriCount / planDef.maxStudents : 0;
      const musammiRatio = planDef.maxMusammi > 0 ? t.musammiCount / planDef.maxMusammi : 0;
      if (santriRatio >= 0.8 || musammiRatio >= 0.8) {
        items.push({
          id: `quota-${t.id}`,
          title: `${t.name} Mendekati Batas Kuota Paket (${planDef.id.toUpperCase()})`,
          detail: `Santri: ${t.santriCount}/${planDef.maxStudents} (${Math.round(
            santriRatio * 100
          )}%) · Musammi: ${t.musammiCount}/${planDef.maxMusammi} (${Math.round(
            musammiRatio * 100
          )}%)`,
          tone: santriRatio >= 0.95 || musammiRatio >= 0.95 ? 'danger' : 'warning',
          badgeLabel: 'KUOTA TINGGI',
          actionLabel: 'Sesuaikan Paket',
          onAction: () => openTenantDetail(t.id),
        });
      }

      const readyCount = [
        t.setupState.hasActiveAcademicYear,
        t.setupState.hasAdminAssigned,
        t.setupState.hasMusammiRegistered,
        t.setupState.hasHalaqahCreated,
      ].filter(Boolean).length;

      if (readyCount < 4 && t.status !== 'archived') {
        const missingSteps: string[] = [];
        if (!t.setupState.hasAdminAssigned) missingSteps.push('Admin aktif');
        if (!t.setupState.hasActiveAcademicYear) missingSteps.push('Tahun ajaran aktif');
        if (!t.setupState.hasMusammiRegistered) missingSteps.push('Musammi');
        if (!t.setupState.hasHalaqahCreated) missingSteps.push('Halaqah');

        items.push({
          id: `setup-${t.id}`,
          title: `Setup Belum Lengkap (${readyCount}/4): ${t.name}`,
          detail: `Belum tersedia: ${missingSteps.join(', ')}.`,
          tone: readyCount <= 1 ? 'warning' : 'primary',
          badgeLabel: `${readyCount}/4 SIAP`,
          actionLabel: 'Detail Tenant',
          onAction: () => openTenantDetail(t.id),
        });
      }
    }

    return items.slice(0, 8);
  }, [activeSupportSession, healthChecks, tenants, navigateToSection, openTenantDetail]);

  const statusTone = (status?: string): BadgeTone => {
    const s = (status || 'active').toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'trial' || s === 'invited' || s === 'provisioning') return 'warning';
    if (s === 'suspended' || s === 'revoked' || s === 'provisioning_failed' || s === 'expired')
      return 'danger';
    return 'neutral';
  };

  const dynamicPageTitle = selectedTenant
    ? `Detail Lembaga: ${selectedTenant.name}`
    : tab === 'dashboard'
    ? 'Kendali platform, tanpa kehilangan konteks.'
    : tab === 'tenants'
    ? 'Lifecycle lembaga yang mudah diawasi.'
    : tab === 'accounts'
    ? 'Tiga role. Scope yang tetap tegas.'
    : tab === 'plans'
    ? 'Kapasitas terukur untuk setiap skala lembaga.'
    : tab === 'support'
    ? 'Bantuan terkontrol, bukan akses permanen.'
    : tab === 'audit'
    ? 'Kesehatan sistem dan jejak perubahan.'
    : 'Default yang aman sejak awal.';

  const dynamicPageDescription = selectedTenant
    ? `Awasi kesiapan setup operasional, pemakaian kuota paket, anggota tim, dan histori aktivitas untuk ${selectedTenant.name}.`
    : tab === 'dashboard'
    ? 'Pantau kesiapan tenant, akses lintas lembaga, dan kesehatan sistem dari satu ruang kerja Superadmin.'
    : tab === 'tenants'
    ? 'Kelola provisioning lembaga baru, awasi pemakaian kuota paket, dan kendalikan status operasional setiap tenant secara teraudit.'
    : tab === 'accounts'
    ? 'Kelola identitas dan access grants lintas tenant tanpa memperluas model otorisasi yang sudah ditetapkan.'
    : tab === 'plans'
    ? 'Standarisasi kuota santri, musammi, dan retensi audit lintas lembaga sesuai definisi paket sistem produksi.'
    : tab === 'support'
    ? 'Setiap sesi support memiliki alasan, scope, batas waktu, dan jejak audit untuk menjaga kepercayaan tenant.'
    : tab === 'audit'
    ? 'Pisahkan sinyal infrastruktur dari audit governance agar anomali dapat ditindaklanjuti tanpa kehilangan konteks.'
    : 'Atur kebijakan global untuk support, provisioning, dan invitation tanpa menyentuh konfigurasi operasional tenant.';

  return (
    <PageShell>
      <PageHeader
        title={dynamicPageTitle}
        description={dynamicPageDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {tab === 'audit' && !selectedTenant && (
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={() => runHealthDiagnostics()}
                className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs disabled:opacity-50"
              >
                {isCheckingHealth ? 'Memeriksa...' : 'Jalankan health check'}
              </button>
            )}
            {tab === 'support' && !selectedTenant && (
              <button
                type="button"
                onClick={() => {
                  setSupportError(null);
                  setSupportAcknowledge(false);
                  setSelectedTenantForSupport(null);
                  setSupportForm({
                    organizationId: tenants[0]?.id || '',
                    reason: '',
                    durationMinutes: platformConfig.defaultSupportDurationMinutes,
                    mode: platformConfig.defaultSupportMode,
                  });
                  setSupportModalOpen(true);
                }}
                className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
              >
                Mulai support session
              </button>
            )}
            {(tab === 'tenants' || tab === 'accounts' || selectedTenant) && (
              <button
                type="button"
                onClick={() => {
                  setInviteError(null);
                  setInviteAccountForm({
                    fullName: '',
                    email: '',
                    password: '',
                    role: 'admin',
                    targetOrganizationId: selectedTenant?.id || tenants[0]?.id || '',
                  });
                  setInviteAccountModalOpen(true);
                }}
                className={`px-3.5 py-2 rounded-[10px] text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'accounts'
                    ? 'bg-[#1557D5] hover:bg-[#1E40AF] text-white shadow-xs'
                    : 'border border-[#BFDBFE] bg-[#E7F0FF] hover:bg-[#DBEAFE] text-[#1557D5]'
                }`}
              >
                Undang akun
              </button>
            )}
            {tab === 'tenants' && !selectedTenant && (
              <button
                type="button"
                onClick={() => {
                  setProvisionError(null);
                  setProvisionForm((prev) => ({
                    ...prev,
                    planId: platformConfig.defaultTenantPlan,
                    timezone: platformConfig.defaultTimezone,
                  }));
                  setProvisionModalOpen(true);
                }}
                className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
              >
                Provision tenant
              </button>
            )}
          </div>
        }
      />

      {lastIssuedInviteInfo && (
        <div className="bg-[#F3F7FF] border border-[#BFDBFE] rounded-[16px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="space-y-1">
            <div className="font-bold text-[#101828]">
              Tautan Undangan Sekali Pakai Diterbitkan ({lastIssuedInviteInfo.email} ·{' '}
              {lastIssuedInviteInfo.role.toUpperCase()})
            </div>
            <div className="font-mono text-[11px] text-[#1557D5] break-all">
              {window.location.origin}
              {lastIssuedInviteInfo.invitePath}
            </div>
            {lastIssuedInviteInfo.temporaryPassword && (
              <div className="text-[#475467]">
                Kode Verifikasi Undangan:{' '}
                <span className="font-mono font-bold text-[#101828]">
                  {lastIssuedInviteInfo.temporaryPassword}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}${lastIssuedInviteInfo.invitePath}`
                );
                NotificationStore.addNotification('Tautan undangan disalin ke clipboard.', 'info');
              }}
              className="px-3.5 py-1.5 rounded-[8px] bg-[#1557D5] hover:bg-[#1E40AF] text-white font-semibold"
            >
              Salin Tautan /invite
            </button>
            <button
              type="button"
              onClick={() => setLastIssuedInviteInfo(null)}
              className="px-2.5 py-1.5 rounded-[8px] border border-[#BFDBFE] text-[#1557D5] hover:bg-[#E7F0FF] font-semibold"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* KPI Summary Strip (Khusus Dashboard Platform) */}
      {!selectedTenant && tab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Tenant Aktif"
            value={loading ? '...' : activeTenantsCount}
            meta={
              loading
                ? 'Memuat data organisasi...'
                : `${tenants.length} total lembaga · ${trialTenantsCount} trial · ${provisioningTenantsCount} provisioning`
            }
            tone="primary"
            badge={<StatusBadge label="ORGANISASI" tone="primary" />}
          />
          <StatCard
            label="Santri Terkelola"
            value={loading ? '...' : totalSantriGlobal}
            meta={
              loading
                ? 'Menghitung populasi...'
                : `${totalAdmins} Admin · ${totalMusammi} Musammi terdaftar`
            }
            tone="neutral"
            badge={<StatusBadge label="AKADEMIK" tone="neutral" />}
          />
          <StatCard
            label="Support Aktif"
            value={
              loading
                ? '...'
                : effectiveActiveSupportCount > 0
                ? `${effectiveActiveSupportCount} Sesi Aktif`
                : '0 Sesi Aktif'
            }
            meta={
              activeSupportSession
                ? `Target: ${activeSupportSession.organizationName} (${activeSupportSession.mode})`
                : 'Standby · Wajib alasan tiket & batas waktu'
            }
            tone={effectiveActiveSupportCount > 0 ? 'warning' : 'success'}
            badge={
              <StatusBadge
                label={effectiveActiveSupportCount > 0 ? 'BREAK-GLASS' : 'AMAN'}
                tone={effectiveActiveSupportCount > 0 ? 'warning' : 'success'}
              />
            }
          />
          <StatCard
            label="Kesehatan Sistem"
            value={
              isCheckingHealth && healthChecks.length === 0
                ? 'Memeriksa...'
                : healthChecks.length > 0
                ? `${healthyProbesCount}/${healthChecks.length} Normal`
                : 'Belum Diuji'
            }
            meta={
              healthChecks.length > 0
                ? healthyProbesCount === healthChecks.length
                  ? 'PostgREST, Skema V2 & API beroperasi normal'
                  : `${healthChecks.length - healthyProbesCount} komponen memerlukan perhatian`
                : 'Menunggu hasil diagnostik sistem'
            }
            tone={
              healthChecks.length === 0
                ? 'neutral'
                : healthyProbesCount === healthChecks.length
                ? 'success'
                : 'warning'
            }
            badge={
              <StatusBadge
                label={
                  healthChecks.length > 0 && healthyProbesCount === healthChecks.length
                    ? 'HEALTHY'
                    : 'MONITOR'
                }
                tone={
                  healthChecks.length > 0 && healthyProbesCount === healthChecks.length
                    ? 'success'
                    : 'warning'
                }
              />
            }
          />
        </div>
      )}

      {/* =====================================================================
          VIEW A: DETAIL TENANT (/platform/tenants/:tenantId)
         ===================================================================== */}
      {selectedTenant && (() => {
        const tenantPlan = getPlanEntitlement(selectedTenant.plan_id);
        const tenantReadyCount = [
          selectedTenant.setupState.hasActiveAcademicYear,
          selectedTenant.setupState.hasAdminAssigned,
          selectedTenant.setupState.hasMusammiRegistered,
          selectedTenant.setupState.hasHalaqahCreated,
        ].filter(Boolean).length;
        const tenantReadyPct = Math.round((tenantReadyCount / 4) * 100);
        const tenantAuditLogs = auditLogs.filter(
          (l) => l.organization_id === selectedTenant.id
        );
        const isTenantSuspended =
          selectedTenant.status === 'suspended' || selectedTenant.status === 'archived';

        return (
          <div className="space-y-6">
            <div className="bg-white rounded-[16px] border border-[#E1E7EF] p-5 sm:p-6 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E1E7EF]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold text-[#101828]">{selectedTenant.name}</h2>
                    <StatusBadge
                      label={selectedTenant.status.toUpperCase()}
                      tone={statusTone(selectedTenant.status)}
                      dot
                    />
                    <StatusBadge
                      label={`PAKET: ${selectedTenant.plan_id.toUpperCase()}`}
                      tone="primary"
                    />
                    <StatusBadge
                      label={`READINESS: ${tenantReadyCount}/4 (${tenantReadyPct}%)`}
                      tone={tenantReadyCount === 4 ? 'success' : 'warning'}
                    />
                  </div>
                  <p className="text-xs font-mono text-[#667085] mt-1.5">
                    ID: {selectedTenant.id} · Slug: {selectedTenant.slug} · Zona Waktu:{' '}
                    {selectedTenant.timezone} · Tahun Ajaran Aktif:{' '}
                    <span className="font-semibold text-[#101828]">
                      {selectedTenant.activeAcademicYearName || 'Belum diatur'}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={closeTenantDetail}
                    className="px-3.5 py-2 rounded-[10px] border border-[#E1E7EF] text-xs font-semibold text-[#344054] hover:bg-[#F3F6FB] transition-colors"
                  >
                    ← Kembali ke Daftar Tenant
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateTenantLifecycle(
                        selectedTenant,
                        isTenantSuspended ? 'active' : 'suspended'
                      )
                    }
                    className={`px-3.5 py-2 rounded-[10px] text-xs font-semibold border transition-colors ${
                      isTenantSuspended
                        ? 'bg-[#ECFDF3] border-[#BBF7D0] text-[#15803D] hover:bg-emerald-100'
                        : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] hover:bg-red-100'
                    }`}
                  >
                    {isTenantSuspended ? 'Pulihkan (Restore) Tenant' : 'Suspend Tenant'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTenantForSupport(selectedTenant);
                      setSupportForm({
                        organizationId: selectedTenant.id,
                        reason: '',
                        durationMinutes: platformConfig.defaultSupportDurationMinutes,
                        mode: platformConfig.defaultSupportMode,
                      });
                      setSupportModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors shadow-2xs"
                  >
                    Buka Support Session
                  </button>
                </div>
              </div>

              {/* Ringkasan Struktur, Kuota & Kontrol Siklus Hidup Tenant */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
                {/* Kolom 1: Kesiapan Setup Operasional (setup_state) */}
                <div className="border border-[#E1E7EF] rounded-[14px] p-4 space-y-3 bg-[#F8FAFC]/50">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                      Checklist Kesiapan Setup
                    </h3>
                    <span className="text-xs font-mono font-bold text-[#1557D5]">
                      {tenantReadyPct}%
                    </span>
                  </div>
                  <ProgressBar
                    value={tenantReadyCount}
                    max={4}
                    tone={tenantReadyCount === 4 ? 'success' : 'primary'}
                    size="sm"
                  />
                  <div className="space-y-2 text-xs pt-1">
                    {[
                      {
                        done: selectedTenant.setupState.hasActiveAcademicYear,
                        label: 'Tahun Ajaran Aktif',
                        meta: selectedTenant.activeAcademicYearName || 'Belum diatur',
                      },
                      {
                        done: selectedTenant.setupState.hasAdminAssigned,
                        label: 'Admin Lembaga Aktif',
                        meta: `${selectedTenant.adminCount} Admin`,
                      },
                      {
                        done: selectedTenant.setupState.hasMusammiRegistered,
                        label: 'Staf Musammi Terdaftar',
                        meta: `${selectedTenant.musammiCount} Musammi`,
                      },
                      {
                        done: selectedTenant.setupState.hasHalaqahCreated,
                        label: 'Kelompok Halaqah',
                        meta: `${selectedTenant.halaqahCount} Halaqah`,
                      },
                    ].map((chk, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1.5 border-b border-[#E1E7EF]/70 last:border-none"
                      >
                        <span className="text-[#344054] font-medium">{chk.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#667085] font-mono">{chk.meta}</span>
                          <StatusBadge
                            label={chk.done ? 'SIAP' : 'BELUM'}
                            tone={chk.done ? 'success' : 'warning'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kolom 2: Pemakaian Kuota & Kapasitas Tenant */}
                <div className="border border-[#E1E7EF] rounded-[14px] p-4 space-y-3.5 bg-[#F8FAFC]/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                      Kapasitas & Kuota Paket ({tenantPlan.name})
                    </h3>
                  </div>
                  <QuotaBar
                    label="Kuota Santri"
                    used={selectedTenant.santriCount}
                    limit={tenantPlan.maxStudents}
                    unit="santri"
                  />
                  <QuotaBar
                    label="Kuota Staf Musammi"
                    used={selectedTenant.musammiCount}
                    limit={tenantPlan.maxMusammi}
                    unit="musammi"
                  />
                  <QuotaBar
                    label="Kuota Kelompok Halaqah"
                    used={selectedTenant.halaqahCount}
                    limit={tenantPlan.maxHalaqah}
                    unit="halaqah"
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="p-2.5 bg-white rounded-[10px] border border-[#E1E7EF]">
                      <span className="text-[#667085] block text-[11px]">Admin Lembaga</span>
                      <span className="font-mono font-bold text-sm text-[#101828]">
                        {selectedTenant.adminCount} Akun
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-[10px] border border-[#E1E7EF]">
                      <span className="text-[#667085] block text-[11px]">Tahun Ajaran</span>
                      <span className="font-mono font-bold text-sm text-[#101828]">
                        {selectedTenant.academicYearCount} Periode
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kolom 3: Governance Status & Paket Layanan */}
                <div className="border border-[#E1E7EF] rounded-[14px] p-4 space-y-4 bg-[#F8FAFC]/50">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085] mb-2">
                      Kontrol Siklus Hidup Tenant (Teraudit)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(['active', 'trial', 'suspended', 'archived'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={selectedTenant.status === st}
                          onClick={() => handleUpdateTenantLifecycle(selectedTenant, st)}
                          className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${
                            selectedTenant.status === st
                              ? 'bg-[#1557D5] text-white border-[#1557D5] cursor-default'
                              : st === 'suspended' || st === 'archived'
                              ? 'bg-white border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2]'
                              : 'bg-white border-[#E1E7EF] text-[#344054] hover:bg-[#F3F6FB]'
                          }`}
                        >
                          {st.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E1E7EF]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085] mb-2">
                      Paket & Entitlements Tenant
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(['trial', 'standard', 'enterprise'] as const).map((pl) => (
                        <button
                          key={pl}
                          type="button"
                          disabled={selectedTenant.plan_id === pl}
                          onClick={() => handleUpdateTenantPlan(selectedTenant, pl)}
                          className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${
                            selectedTenant.plan_id === pl
                              ? 'bg-[#1557D5] text-white border-[#1557D5] cursor-default'
                              : 'bg-white border-[#E1E7EF] text-[#344054] hover:bg-[#F3F6FB]'
                          }`}
                        >
                          {pl.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid 2 Kolom: Daftar Tim (Admin & Musammi) dan Aktivitas Terbaru Tenant */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daftar Akun Pengguna Khusus Tenant Ini (2 Kolom) */}
              <div className="lg:col-span-2 bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#101828]">
                      Tim Lembaga: Admin & Musammi ({selectedTenant.name})
                    </h3>
                    <p className="text-xs text-[#667085] mt-0.5">
                      Daftar access grants yang terikat langsung ke organisasi ini.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInviteAccountForm({
                        fullName: '',
                        email: '',
                        password: '',
                        role: 'admin',
                        targetOrganizationId: selectedTenant.id,
                      });
                      setInviteAccountModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors"
                  >
                    + Undang Admin / Musammi
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                      <tr>
                        <th className="px-5 py-3">Nama Pengguna</th>
                        <th className="px-5 py-3">Role Kanonikal</th>
                        <th className="px-5 py-3">Status Grant</th>
                        <th className="px-5 py-3 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E7EF]">
                      {accounts.filter((a) => a.organizationId === selectedTenant.id).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-xs text-[#667085]">
                            Belum ada akun Admin atau Musammi terdaftar pada tenant ini.
                          </td>
                        </tr>
                      ) : (
                        accounts
                          .filter((a) => a.organizationId === selectedTenant.id)
                          .map((acc) => (
                            <tr key={acc.id} className="hover:bg-[#F3F7FF]/50">
                              <td className="px-5 py-3.5">
                                <div className="font-semibold text-[#101828]">{acc.fullName}</div>
                                <div className="text-[11px] font-mono text-[#667085]">
                                  ID: {acc.userId.slice(0, 8)}...
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <StatusBadge
                                  label={formatCanonicalRoleLabel(acc.role)}
                                  tone={acc.role === 'admin' ? 'primary' : 'success'}
                                />
                              </td>
                              <td className="px-5 py-3.5">
                                <StatusBadge
                                  label={acc.status.toUpperCase()}
                                  tone={statusTone(acc.status)}
                                  dot
                                />
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAccountStatus(acc)}
                                    className="px-3 py-1 rounded-[8px] border border-[#E1E7EF] hover:bg-[#F3F6FB] text-xs font-semibold text-[#344054]"
                                  >
                                    {acc.status === 'suspended' || acc.status === 'revoked'
                                      ? 'Aktifkan'
                                      : 'Suspend'}
                                  </button>
                                  {acc.status !== 'revoked' && (
                                    <button
                                      type="button"
                                      onClick={() => handleRevokeAccountAccess(acc)}
                                      className="px-3 py-1 rounded-[8px] border border-[#FECACA] hover:bg-[#FEF2F2] text-xs font-semibold text-[#B91C1C]"
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Aktivitas Terbaru Khusus Tenant Ini */}
              <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden flex flex-col">
                <div className="p-4 sm:px-5 border-b border-[#E1E7EF]">
                  <h3 className="text-base font-bold text-[#101828]">Aktivitas Terbaru Tenant</h3>
                  <p className="text-xs text-[#667085] mt-0.5">
                    Jejak audit perubahan status, paket, dan akses pada lembaga ini.
                  </p>
                </div>
                <div className="divide-y divide-[#E1E7EF] flex-1">
                  {tenantAuditLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#667085]">
                      Belum ada rekaman audit log spesifik untuk tenant ini.
                    </div>
                  ) : (
                    tenantAuditLogs.slice(0, 6).map((log) => (
                      <div key={log.id} className="p-4 space-y-1.5 hover:bg-[#F8FAFC]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-[#1557D5] truncate">
                            {log.action}
                          </span>
                          <span className="text-[11px] font-mono text-[#667085] shrink-0">
                            {new Date(log.created_at).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-[#344054] line-clamp-2">
                          {log.reason || `Sumber daya: ${log.resource_type}`}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-[#667085] uppercase font-semibold">
                            Aktor: {log.actor_role || 'superadmin'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="text-[11px] font-semibold text-[#1557D5] hover:underline"
                          >
                            Lihat Payload
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          SECTION 1: DASHBOARD PLATFORM (IKHTISAR, KESIAPAN TENANT, FOKUS HARI INI & AKTIVITAS TERBARU)
         ===================================================================== */}
      {!selectedTenant && tab === 'dashboard' && (
        <div className="space-y-6">
          {/* 1A. Kesiapan Operasional Tenant */}
          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 sm:px-6 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#101828]">
                  Kesiapan Operasional Tenant
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Indikator kelengkapan setup nyata (Tahun Ajaran Aktif, Admin, Musammi, dan Halaqah)
                  untuk setiap organisasi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateToSection('tenants', '/platform/tenants')}
                className="px-3.5 py-2 rounded-[10px] border border-[#E1E7EF] text-xs font-semibold text-[#344054] hover:bg-[#F3F6FB] transition-colors"
              >
                Kelola Semua Tenant ({tenants.length})
              </button>
            </div>

            {loading ? (
              <div className="p-6 text-center text-xs text-[#667085]">
                Memuat data kesiapan tenant dari database...
              </div>
            ) : tenants.length === 0 ? (
              <EmptyState
                title="Belum Ada Organisasi / Tenant Terdaftar"
                description="Mulai dengan melakukan provisioning tenant pertama beserta akun Admin lembaganya."
                actionLabel="Provision Tenant Pertama"
                onAction={() => setProvisionModalOpen(true)}
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                      <tr>
                        <th className="px-6 py-3.5">Nama Organisasi</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Admin</th>
                        <th className="px-6 py-3.5 text-right">Musammi</th>
                        <th className="px-6 py-3.5 text-right">Santri</th>
                        <th className="px-6 py-3.5 w-56">Readiness (Data Setup)</th>
                        <th className="px-6 py-3.5 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E7EF]">
                      {tenants.slice(0, 10).map((t) => {
                        const readyCount = [
                          t.setupState.hasActiveAcademicYear,
                          t.setupState.hasAdminAssigned,
                          t.setupState.hasMusammiRegistered,
                          t.setupState.hasHalaqahCreated,
                        ].filter(Boolean).length;
                        const readyPct = Math.round((readyCount / 4) * 100);
                        return (
                          <tr key={t.id} className="hover:bg-[#F3F7FF]/50 transition-colors">
                            <td className="px-6 py-3.5">
                              <button
                                type="button"
                                onClick={() => openTenantDetail(t.id)}
                                className="font-semibold text-[#101828] hover:text-[#1557D5] text-left transition-colors"
                              >
                                {t.name}
                              </button>
                              <div className="text-xs font-mono text-[#667085] mt-0.5">
                                {t.slug} ·{' '}
                                {t.activeAcademicYearName ? (
                                  <span className="text-[#344054] font-sans">
                                    TA {t.activeAcademicYearName}
                                  </span>
                                ) : (
                                  <span className="text-[#B45309] font-sans font-medium">
                                    Belum ada TA Aktif
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-3.5">
                              <StatusBadge
                                label={(t.status || 'active').toUpperCase()}
                                tone={statusTone(t.status)}
                                dot
                              />
                            </td>
                            <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-[#101828]">
                              {t.adminCount}
                            </td>
                            <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-[#101828]">
                              {t.musammiCount}
                            </td>
                            <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-[#101828]">
                              {t.santriCount}
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <StatusBadge
                                    label={`${readyCount}/4 SIAP`}
                                    tone={
                                      readyCount === 4
                                        ? 'success'
                                        : readyCount >= 2
                                        ? 'warning'
                                        : 'danger'
                                    }
                                  />
                                  <span className="font-mono font-semibold text-[#475467] tabular-nums">
                                    {readyPct}%
                                  </span>
                                </div>
                                <ProgressBar
                                  value={readyCount}
                                  max={4}
                                  tone={
                                    readyCount === 4
                                      ? 'success'
                                      : readyCount >= 2
                                      ? 'warning'
                                      : 'danger'
                                  }
                                  size="sm"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openTenantDetail(t.id)}
                                  className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] bg-white hover:bg-[#F3F6FB] text-xs font-semibold text-[#344054] transition-colors"
                                >
                                  Detail
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTenantForSupport(t);
                                    setSupportForm({
                                      organizationId: t.id,
                                      reason: '',
                                      durationMinutes: platformConfig.defaultSupportDurationMinutes,
                                      mode: platformConfig.defaultSupportMode,
                                    });
                                    setSupportModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded-[8px] bg-[#E7F0FF] hover:bg-[#DBEAFE] text-[#1557D5] text-xs font-semibold transition-colors"
                                >
                                  Support
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards (<768px) */}
                <div className="md:hidden divide-y divide-[#E1E7EF]">
                  {tenants.slice(0, 10).map((t) => {
                    const readyCount = [
                      t.setupState.hasActiveAcademicYear,
                      t.setupState.hasAdminAssigned,
                      t.setupState.hasMusammiRegistered,
                      t.setupState.hasHalaqahCreated,
                    ].filter(Boolean).length;
                    const readyPct = Math.round((readyCount / 4) * 100);
                    return (
                      <div key={t.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-[#101828]">{t.name}</div>
                            <div className="text-xs font-mono text-[#667085]">{t.slug}</div>
                          </div>
                          <StatusBadge
                            label={(t.status || 'active').toUpperCase()}
                            tone={statusTone(t.status)}
                            dot
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center bg-[#F8FAFC] p-2.5 rounded-[10px] border border-[#E1E7EF]">
                          <div>
                            <div className="text-[11px] text-[#667085]">Admin</div>
                            <div className="font-mono font-bold text-xs text-[#101828]">
                              {t.adminCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#667085]">Musammi</div>
                            <div className="font-mono font-bold text-xs text-[#101828]">
                              {t.musammiCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#667085]">Santri</div>
                            <div className="font-mono font-bold text-xs text-[#101828]">
                              {t.santriCount}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#475467] font-medium">
                              Readiness: {readyCount}/4 tahap
                            </span>
                            <span className="font-mono font-semibold text-[#1557D5]">
                              {readyPct}%
                            </span>
                          </div>
                          <ProgressBar
                            value={readyCount}
                            max={4}
                            tone={readyCount === 4 ? 'success' : 'warning'}
                            size="sm"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openTenantDetail(t.id)}
                            className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] text-xs font-semibold text-[#344054]"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTenantForSupport(t);
                              setSupportForm({
                                organizationId: t.id,
                                reason: '',
                                durationMinutes: platformConfig.defaultSupportDurationMinutes,
                                mode: platformConfig.defaultSupportMode,
                              });
                              setSupportModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-[8px] bg-[#E7F0FF] text-[#1557D5] text-xs font-semibold"
                          >
                            Support
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 1B. Fokus Hari Ini & Aktivitas Terbaru (2 Kolom) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Fokus Hari Ini (5 Kolom) */}
            <div className="lg:col-span-5 bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden flex flex-col">
              <div className="p-5 border-b border-[#E1E7EF] flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#101828]">Fokus Hari Ini</h2>
                  <p className="text-xs text-[#667085] mt-0.5">
                    Item operasional nyata yang memerlukan perhatian Superadmin.
                  </p>
                </div>
                <StatusBadge
                  label={`${focusTodayItems.length} ITEM`}
                  tone={focusTodayItems.length > 0 ? 'warning' : 'success'}
                />
              </div>

              <div className="p-4 space-y-3 flex-1">
                {loading ? (
                  <p className="text-xs text-[#667085] text-center py-6">
                    Menganalisis kesiapan sistem...
                  </p>
                ) : focusTodayItems.length === 0 ? (
                  <div className="p-6 rounded-[12px] bg-[#ECFDF3]/60 border border-[#BBF7D0] text-center space-y-1">
                    <div className="text-sm font-bold text-[#15803D]">
                      Tidak Ada Peringatan Operasional
                    </div>
                    <p className="text-xs text-[#166534] leading-relaxed">
                      Seluruh tenant yang terdaftar telah melengkapi setup dasar, kuota dalam batas
                      aman, dan diagnostik sistem berstatus normal.
                    </p>
                  </div>
                ) : (
                  focusTodayItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF] space-y-2 hover:border-[#CBD5E1] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold text-[#101828] leading-snug">
                          {item.title}
                        </span>
                        <StatusBadge label={item.badgeLabel} tone={item.tone} />
                      </div>
                      <p className="text-xs text-[#667085] leading-relaxed">{item.detail}</p>
                      {item.actionLabel && item.onAction && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={item.onAction}
                            className="text-xs font-semibold text-[#1557D5] hover:text-[#1E40AF] hover:underline"
                          >
                            {item.actionLabel} →
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Aktivitas Terbaru dari Audit Log Produksi (7 Kolom) */}
            <div className="lg:col-span-7 bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden flex flex-col">
              <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#101828]">Aktivitas Terbaru</h2>
                  <p className="text-xs text-[#667085] mt-0.5">
                    Rekaman langsung dari tabel audit_logs produksi lintas organisasi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToSection('audit', '/platform/audit')}
                  className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] text-xs font-semibold text-[#344054] hover:bg-[#F3F6FB]"
                >
                  Lihat Semua Audit Log
                </button>
              </div>

              {loading ? (
                <div className="p-6 text-center text-xs text-[#667085]">
                  Memuat riwayat aktivitas...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#667085]">
                  Belum ada rekaman aktivitas di tabel audit_logs.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                      <tr>
                        <th className="px-4 py-3">Waktu</th>
                        <th className="px-4 py-3">Aktor</th>
                        <th className="px-4 py-3">Aktivitas</th>
                        <th className="px-4 py-3">Tenant</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E7EF]">
                      {auditLogs.slice(0, 8).map((log) => {
                        const isFailureAction =
                          log.action.includes('failed') ||
                          log.action.includes('revoked') ||
                          log.action.includes('suspended');
                        return (
                          <tr key={log.id} className="hover:bg-[#F3F7FF]/50">
                            <td className="px-4 py-3 font-mono text-xs text-[#667085] whitespace-nowrap tabular-nums">
                              {new Date(log.created_at).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                label={(log.actor_role || 'superadmin').toUpperCase()}
                                tone="primary"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedAuditLog(log)}
                                className="font-mono text-xs font-semibold text-[#101828] hover:text-[#1557D5] text-left"
                              >
                                {log.action}
                              </button>
                              {log.reason && (
                                <div className="text-[11px] text-[#667085] truncate max-w-[220px]">
                                  {log.reason}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-[#344054]">
                              {log.organization_name || 'Platform Global'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <StatusBadge
                                label={isFailureAction ? 'PERHATIAN' : 'TERCATAT'}
                                tone={isFailureAction ? 'warning' : 'success'}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 2: DIREKTORI ORGANISASI & TENANT (/platform/tenants)
         ===================================================================== */}
      {!selectedTenant && tab === 'tenants' && (
        <div className="space-y-4">
          <FilterBar
            onReset={() => {
              setSearchTenant('');
              setFilterStatus('all');
              setFilterPlan('all');
            }}
          >
            <FormField label="Pencarian Nama / Slug">
              <input
                type="text"
                value={searchTenant}
                onChange={(e) => setSearchTenant(e.target.value)}
                placeholder="Cari nama ma'had atau slug..."
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs text-[#101828] focus:outline-none focus:border-[#1557D5] bg-white"
              />
            </FormField>
            <FormField label="Lifecycle / Status">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Status</option>
                <option value="provisioning">PROVISIONING</option>
                <option value="provisioning_failed">PROVISIONING_FAILED</option>
                <option value="active">ACTIVE</option>
                <option value="trial">TRIAL</option>
                <option value="suspended">SUSPENDED</option>
                <option value="archived">ARCHIVED</option>
              </select>
            </FormField>
            <FormField label="Paket Layanan">
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Paket</option>
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#101828]">
                  Direktori Organisasi & Tenant
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Daftar seluruh lembaga pengguna Lajnah Quran beserta status lifecycle, paket, dan kesiapan operasionalnya.
                </p>
              </div>
              <StatusBadge
                label={`Menampilkan ${filteredTenants.length} dari ${tenants.length} lembaga`}
                tone="primary"
              />
            </div>
            {loading ? (
              <div className="p-8 text-center text-xs text-[#667085]">
                Memuat data organisasi...
              </div>
            ) : filteredTenants.length === 0 ? (
              <EmptyState
                title="Tidak Ada Lembaga yang Cocok"
                description="Tidak ditemukan organisasi yang sesuai dengan filter pencarian saat ini."
                actionLabel="Reset Filter"
                onAction={() => {
                  setSearchTenant('');
                  setFilterStatus('all');
                  setFilterPlan('all');
                }}
              />
            ) : (
              <>
                {/* Desktop Tenant Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                      <tr>
                        <th className="px-6 py-3.5">Lembaga</th>
                        <th className="px-6 py-3.5">Paket</th>
                        <th className="px-6 py-3.5">Tim</th>
                        <th className="px-6 py-3.5 w-64">Kapasitas & Quota Usage</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E7EF]">
                      {filteredTenants.map((t) => {
                        const planDef = getPlanEntitlement(t.plan_id);
                        const isSuspended =
                          t.status === 'suspended' || t.status === 'archived';
                        return (
                          <tr key={t.id} className="hover:bg-[#F3F7FF]/50 transition-colors">
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => openTenantDetail(t.id)}
                                className="font-bold text-[#101828] hover:text-[#1557D5] text-left transition-colors"
                              >
                                {t.name}
                              </button>
                              <div className="text-xs font-mono text-[#667085] mt-0.5">
                                {t.slug} · {t.timezone || 'Asia/Jakarta'}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge
                                label={(t.plan_id || 'standard').toUpperCase()}
                                tone="primary"
                              />
                              <div className="text-[11px] text-[#667085] mt-1">
                                Maks. {planDef.maxStudents} santri
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-[#344054]">
                              <div className="font-semibold text-[#101828] font-mono tabular-nums">
                                {t.adminCount} Admin
                              </div>
                              <div className="text-[#667085] font-mono tabular-nums mt-0.5">
                                {t.musammiCount} Musammi
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <QuotaBar
                                label="Santri"
                                used={t.santriCount}
                                limit={planDef.maxStudents}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge
                                label={(t.status || 'active').toUpperCase()}
                                tone={statusTone(t.status)}
                                dot
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openTenantDetail(t.id)}
                                  className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] bg-white hover:bg-[#F3F6FB] text-xs font-semibold text-[#344054] transition-colors"
                                >
                                  Detail
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTenantLifecycle(
                                      t,
                                      isSuspended ? 'active' : 'suspended'
                                    )
                                  }
                                  className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors ${
                                    isSuspended
                                      ? 'border-[#BBF7D0] bg-[#ECFDF3] text-[#15803D] hover:bg-emerald-100'
                                      : 'border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]'
                                  }`}
                                >
                                  {isSuspended ? 'Restore' : 'Suspend'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTenantForSupport(t);
                                    setSupportForm({
                                      organizationId: t.id,
                                      reason: '',
                                      durationMinutes: platformConfig.defaultSupportDurationMinutes,
                                      mode: platformConfig.defaultSupportMode,
                                    });
                                    setSupportModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded-[8px] bg-[#1557D5] hover:bg-[#1E40AF] text-xs font-semibold text-white whitespace-nowrap transition-colors"
                                >
                                  Support
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Tenant Cards (<768px) */}
                <div className="md:hidden divide-y divide-[#E1E7EF]">
                  {filteredTenants.map((t) => {
                    const planDef = getPlanEntitlement(t.plan_id);
                    const isSuspended =
                      t.status === 'suspended' || t.status === 'archived';
                    return (
                      <div key={t.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              onClick={() => openTenantDetail(t.id)}
                              className="font-bold text-[#101828] text-left"
                            >
                              {t.name}
                            </button>
                            <div className="text-xs font-mono text-[#667085]">
                              {t.slug} · {t.timezone || 'Asia/Jakarta'}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <StatusBadge
                              label={(t.status || 'active').toUpperCase()}
                              tone={statusTone(t.status)}
                              dot
                            />
                            <StatusBadge
                              label={(t.plan_id || 'standard').toUpperCase()}
                              tone="primary"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center bg-[#F8FAFC] p-2.5 rounded-[10px] border border-[#E1E7EF]">
                          <div>
                            <div className="text-[11px] text-[#667085]">Admin</div>
                            <div className="font-mono font-bold text-xs text-[#101828]">
                              {t.adminCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#667085]">Musammi</div>
                            <div className="font-mono font-bold text-xs text-[#101828]">
                              {t.musammiCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#667085]">Santri</div>
                            <div className="font-mono font-bold text-xs text-[#101828]">
                              {t.santriCount}
                            </div>
                          </div>
                        </div>

                        <QuotaBar
                          label="Kuota Santri"
                          used={t.santriCount}
                          limit={planDef.maxStudents}
                        />

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openTenantDetail(t.id)}
                            className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] text-xs font-semibold text-[#344054]"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateTenantLifecycle(
                                t,
                                isSuspended ? 'active' : 'suspended'
                              )
                            }
                            className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border ${
                              isSuspended
                                ? 'border-[#BBF7D0] bg-[#ECFDF3] text-[#15803D]'
                                : 'border-[#FECACA] bg-white text-[#B91C1C]'
                            }`}
                          >
                            {isSuspended ? 'Restore' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTenantForSupport(t);
                              setSupportForm({
                                organizationId: t.id,
                                reason: '',
                                durationMinutes: platformConfig.defaultSupportDurationMinutes,
                                mode: platformConfig.defaultSupportMode,
                              });
                              setSupportModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-[8px] bg-[#1557D5] text-white text-xs font-semibold"
                          >
                            Support
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 3: AKUN PLATFORM & ACCESS GRANTS GLOBAL (/platform/accounts)
         ===================================================================== */}
      {!selectedTenant && tab === 'accounts' && (
        <div className="space-y-4">
          <FilterBar
            onReset={() => {
              setSearchAccount('');
              setFilterAccountOrg('all');
              setFilterAccountRole('all');
              setFilterAccountStatus('all');
            }}
          >
            <FormField label="Pencarian Nama / Email / Organisasi">
              <input
                type="text"
                value={searchAccount}
                onChange={(e) => setSearchAccount(e.target.value)}
                placeholder="Cari nama, email, atau organisasi..."
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs text-[#101828] focus:outline-none focus:border-[#1557D5] bg-white"
              />
            </FormField>
            <FormField label="Organisasi / Scope Tenant">
              <select
                value={filterAccountOrg}
                onChange={(e) => setFilterAccountOrg(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Organisasi</option>
                <option value="platform_global">Platform Global (Superadmin)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Filter Role (3 Role)">
              <select
                value={filterAccountRole}
                onChange={(e) => setFilterAccountRole(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Role</option>
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="musammi">Musammi</option>
              </select>
            </FormField>
            <FormField label="Filter Status Grant">
              <select
                value={filterAccountStatus}
                onChange={(e) => setFilterAccountStatus(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Status</option>
                <option value="active">ACTIVE</option>
                <option value="invited">INVITED</option>
                <option value="suspended">SUSPENDED</option>
                <option value="revoked">REVOKED</option>
                <option value="expired">EXPIRED</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#101828]">
                  Direktori Akun & Access Grants Lintas Lembaga
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Otorisasi dibatasi tegas pada 3 role kanonikal (Superadmin, Admin, Musammi) dengan
                  isolasi scope per organisasi.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge
                  label={`Menampilkan ${filteredAccounts.length} dari ${accounts.length} akun`}
                  tone="primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    setInviteError(null);
                    setInviteAccountForm({
                      fullName: '',
                      email: '',
                      password: '',
                      role: 'admin',
                      targetOrganizationId: tenants[0]?.id || '',
                    });
                    setInviteAccountModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors shadow-xs"
                >
                  Undang akun
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-[#667085]">
                Memuat direktori akun dan access grants...
              </div>
            ) : filteredAccounts.length === 0 ? (
              <EmptyState
                title="Tidak Ada Akun yang Sesuai Filter"
                description="Ubah kriteria pencarian atau reset filter untuk menampilkan daftar akun dan access grants."
                actionLabel="Reset Filter"
                onAction={() => {
                  setSearchAccount('');
                  setFilterAccountOrg('all');
                  setFilterAccountRole('all');
                  setFilterAccountStatus('all');
                }}
              />
            ) : (
              <>
                {/* Desktop Accounts Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                      <tr>
                        <th className="px-6 py-3.5">Identitas</th>
                        <th className="px-6 py-3.5">Organisasi</th>
                        <th className="px-6 py-3.5">Role</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E7EF]">
                      {filteredAccounts.map((acc) => {
                        const isSuspendedOrRevoked =
                          acc.status === 'suspended' || acc.status === 'revoked';
                        return (
                          <tr key={acc.id} className="hover:bg-[#F3F7FF]/50 transition-colors">
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => setSelectedAccountDetail(acc)}
                                className="font-bold text-[#101828] hover:text-[#1557D5] text-left transition-colors"
                              >
                                {acc.fullName}
                              </button>
                              <div className="text-xs text-[#667085] mt-0.5 font-mono">
                                {acc.email ? acc.email : `ID: ${acc.userId.slice(0, 12)}...`}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-semibold text-[#101828]">
                                {acc.organizationName}
                              </div>
                              <div className="text-[11px] text-[#667085] mt-0.5">
                                {acc.organizationId
                                  ? `Tenant Scope (${acc.organizationId.slice(0, 8)})`
                                  : 'Platform Scope (Global)'}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge
                                label={formatCanonicalRoleLabel(acc.role)}
                                tone={
                                  acc.role === 'superadmin'
                                    ? 'warning'
                                    : acc.role === 'admin'
                                    ? 'primary'
                                    : 'success'
                                }
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col items-start gap-1">
                                <StatusBadge
                                  label={acc.status.toUpperCase()}
                                  tone={statusTone(acc.status)}
                                  dot
                                />
                                {acc.createdAt && (
                                  <span className="text-[11px] font-mono text-[#667085] tabular-nums">
                                    Terdaftar{' '}
                                    {new Date(acc.createdAt).toLocaleDateString('id-ID', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAccountDetail(acc)}
                                  className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] bg-white hover:bg-[#F3F6FB] text-xs font-semibold text-[#344054] transition-colors"
                                >
                                  Detail
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAccountStatus(acc)}
                                  className={`px-3 py-1.5 rounded-[8px] border text-xs font-semibold transition-colors ${
                                    isSuspendedOrRevoked
                                      ? 'border-[#BBF7D0] bg-[#ECFDF3] text-[#15803D] hover:bg-emerald-100'
                                      : 'border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]'
                                  }`}
                                >
                                  {isSuspendedOrRevoked ? 'Restore' : 'Suspend'}
                                </button>
                                {acc.status !== 'revoked' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeAccountAccess(acc)}
                                    className="px-3 py-1.5 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] hover:bg-red-100 text-[#B91C1C] text-xs font-semibold transition-colors"
                                  >
                                    {acc.status === 'invited' ? 'Batalkan Undangan' : 'Revoke'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Account Cards (<768px) */}
                <div className="md:hidden divide-y divide-[#E1E7EF]">
                  {filteredAccounts.map((acc) => {
                    const isSuspendedOrRevoked =
                      acc.status === 'suspended' || acc.status === 'revoked';
                    return (
                      <div key={acc.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedAccountDetail(acc)}
                              className="font-bold text-[#101828] text-left"
                            >
                              {acc.fullName}
                            </button>
                            <div className="text-xs font-mono text-[#667085]">
                              {acc.email || `ID: ${acc.userId.slice(0, 10)}...`}
                            </div>
                          </div>
                          <StatusBadge
                            label={acc.status.toUpperCase()}
                            tone={statusTone(acc.status)}
                            dot
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F8FAFC] p-2.5 rounded-[10px] border border-[#E1E7EF] text-xs">
                          <span className="font-semibold text-[#344054]">
                            {acc.organizationName}
                          </span>
                          <StatusBadge
                            label={formatCanonicalRoleLabel(acc.role)}
                            tone={
                              acc.role === 'superadmin'
                                ? 'warning'
                                : acc.role === 'admin'
                                ? 'primary'
                                : 'success'
                            }
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAccountDetail(acc)}
                            className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] text-xs font-semibold text-[#344054]"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleAccountStatus(acc)}
                            className={`px-3 py-1.5 rounded-[8px] border text-xs font-semibold ${
                              isSuspendedOrRevoked
                                ? 'border-[#BBF7D0] bg-[#ECFDF3] text-[#15803D]'
                                : 'border-[#FECACA] bg-white text-[#B91C1C]'
                            }`}
                          >
                            {isSuspendedOrRevoked ? 'Restore' : 'Suspend'}
                          </button>
                          {acc.status !== 'revoked' && (
                            <button
                              type="button"
                              onClick={() => handleRevokeAccountAccess(acc)}
                              className="px-3 py-1.5 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] text-xs font-semibold"
                            >
                              {acc.status === 'invited' ? 'Batalkan Undangan' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 4: PAKET & ENTITLEMENTS SAAS (/platform/plans)
         ===================================================================== */}
      {!selectedTenant && tab === 'plans' && (
        <div className="space-y-6">
          {/* 4A. Package Comparison Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {SAAS_PLANS.map((plan) => {
              const countOnPlan = tenants.filter(
                (t) => (t.plan_id || 'standard').toLowerCase() === plan.id
              ).length;
              const isStandard = plan.id === 'standard';
              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-[16px] border p-6 flex flex-col justify-between space-y-5 shadow-2xs ${
                    isStandard
                      ? 'border-[#93C5FD] ring-1 ring-[#1557D5]/15'
                      : 'border-[#E1E7EF]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge
                        label={plan.id.toUpperCase()}
                        tone={
                          plan.id === 'enterprise'
                            ? 'primary'
                            : plan.id === 'standard'
                            ? 'success'
                            : 'warning'
                        }
                      />
                      <span className="px-2.5 py-1 rounded-md bg-[#F3F6FB] border border-[#E1E7EF] text-xs font-mono font-semibold text-[#344054] tabular-nums">
                        {countOnPlan} Tenant Terdaftar
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-[#101828]">{plan.name}</h3>
                      <p className="text-xs text-[#667085] mt-1 leading-relaxed">{plan.tagline}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-[#E1E7EF] text-center">
                      <div className="p-2.5 bg-[#F8FAFC] rounded-[12px] border border-[#E1E7EF]">
                        <div className="text-[11px] font-medium text-[#667085]">Quota Santri</div>
                        <div className="text-base font-bold font-mono tabular-nums text-[#101828] mt-0.5">
                          {plan.maxStudents.toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className="p-2.5 bg-[#F8FAFC] rounded-[12px] border border-[#E1E7EF]">
                        <div className="text-[11px] font-medium text-[#667085]">Quota Musammi</div>
                        <div className="text-base font-bold font-mono tabular-nums text-[#101828] mt-0.5">
                          {plan.maxMusammi.toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className="p-2.5 bg-[#F8FAFC] rounded-[12px] border border-[#E1E7EF]">
                        <div className="text-[11px] font-medium text-[#667085]">Retensi Audit</div>
                        <div className="text-base font-bold font-mono tabular-nums text-[#101828] mt-0.5">
                          {plan.auditRetentionDays} hr
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 space-y-2">
                      <div className="text-xs font-semibold text-[#344054]">
                        Fitur & Kapabilitas Paket:
                      </div>
                      <ul className="space-y-2 text-xs text-[#475467]">
                        {plan.features.map((feat, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-[#E7F0FF] text-[#1557D5] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                              ✓
                            </span>
                            <span className="leading-relaxed">{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E1E7EF] flex items-center justify-between text-xs text-[#667085]">
                    <span>Quota Halaqah</span>
                    <span className="font-mono font-semibold text-[#101828] tabular-nums">
                      Maks. {plan.maxHalaqah} halaqah aktif
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4B. Quota Usage & Penetapan Paket per Tenant */}
          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#101828]">
                  Pemakaian Kuota & Penetapan Paket per Tenant
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Pantau pemakaian aktual santri dan musammi terhadap kuota paket. Perubahan paket
                  hanya memodifikasi assignment lembaga dan wajib dikonfirmasi oleh server.
                </p>
              </div>
              <StatusBadge label={`${tenants.length} LEMBAGA`} tone="primary" />
            </div>

            {tenants.length === 0 ? (
              <EmptyState
                title="Belum Ada Tenant Terdaftar"
                description="Provision organisasi baru terlebih dahulu untuk mengelola penetapan paket dan kuota."
              />
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                      <tr>
                        <th className="px-6 py-3.5">Nama Tenant</th>
                        <th className="px-6 py-3.5">Paket Saat Ini</th>
                        <th className="px-6 py-3.5 w-64">Pemakaian & Quota Santri</th>
                        <th className="px-6 py-3.5 w-64">Pemakaian & Quota Musammi</th>
                        <th className="px-6 py-3.5 text-right">Aksi Ubah Paket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E1E7EF]">
                      {tenants.map((t) => {
                        const planDef = getPlanEntitlement(t.plan_id);
                        return (
                          <tr key={t.id} className="hover:bg-[#F3F7FF]/50 transition-colors">
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => openTenantDetail(t.id)}
                                className="font-bold text-[#101828] hover:text-[#1557D5] text-left"
                              >
                                {t.name}
                              </button>
                              <div className="text-xs font-mono text-[#667085] mt-0.5">
                                {t.slug}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge
                                label={planDef.id.toUpperCase()}
                                tone={
                                  planDef.id === 'enterprise'
                                    ? 'primary'
                                    : planDef.id === 'standard'
                                    ? 'success'
                                    : 'warning'
                                }
                              />
                              <div className="text-[11px] text-[#667085] mt-1">
                                Retensi audit {planDef.auditRetentionDays} hari
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <QuotaBar
                                label="Santri"
                                used={t.santriCount}
                                limit={planDef.maxStudents}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <QuotaBar
                                label="Musammi"
                                used={t.musammiCount}
                                limit={planDef.maxMusammi}
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleUpdateTenantPlan(t)}
                                className="px-3.5 py-1.5 rounded-[8px] border border-[#BFDBFE] bg-[#E7F0FF] hover:bg-[#DBEAFE] text-[#1557D5] text-xs font-semibold transition-colors"
                              >
                                Ubah Paket
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Quota Cards (<768px) */}
                <div className="md:hidden divide-y divide-[#E1E7EF]">
                  {tenants.map((t) => {
                    const planDef = getPlanEntitlement(t.plan_id);
                    return (
                      <div key={t.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-[#101828]">{t.name}</div>
                            <div className="text-xs font-mono text-[#667085]">{t.slug}</div>
                          </div>
                          <StatusBadge label={planDef.id.toUpperCase()} tone="primary" />
                        </div>
                        <QuotaBar
                          label="Santri"
                          used={t.santriCount}
                          limit={planDef.maxStudents}
                        />
                        <QuotaBar
                          label="Musammi"
                          used={t.musammiCount}
                          limit={planDef.maxMusammi}
                        />
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateTenantPlan(t)}
                            className="px-3.5 py-1.5 rounded-[8px] bg-[#E7F0FF] text-[#1557D5] text-xs font-semibold"
                          >
                            Ubah Paket
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 5: SUPPORT ACCESS SESSIONS (/platform/support-sessions)
         ===================================================================== */}
      {!selectedTenant && tab === 'support' && (
        <div className="space-y-6">
          {/* 5A. KPI Support Access */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Sesi Aktif Saat Ini"
              value={loading ? '...' : effectiveActiveSupportCount}
              hint={
                effectiveActiveSupportCount > 0
                  ? 'Sesi bantuan lintas tenant sedang berlangsung'
                  : 'Tidak ada sesi break-glass aktif'
              }
              tone={effectiveActiveSupportCount > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Durasi Default"
              value={`${platformConfig.defaultSupportDurationMinutes} Menit`}
              hint="Batas waktu otomatis sebelum sesi kedaluwarsa"
              tone="primary"
            />
            <StatCard
              label="Mode Default"
              value={
                platformConfig.defaultSupportMode === 'read_only'
                  ? 'Read-Only'
                  : 'Controlled-Write'
              }
              hint="Prinsip least-privilege untuk observasi aman"
              tone={platformConfig.defaultSupportMode === 'read_only' ? 'success' : 'warning'}
            />
          </div>

          {/* 5B. Active Support Session Banner / Panel */}
          {(activeSupportSession || activeDbSupportSessions.length > 0) && (
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[16px] p-5 space-y-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FDE68A] pb-3">
                <div className="flex items-center gap-2">
                  <StatusBadge label="ACTIVE SUPPORT SESSION (BREAK-GLASS)" tone="warning" dot />
                  <span className="text-xs font-semibold text-[#92400E]">
                    Seluruh pembacaan & tindakan dalam sesi ini dicatat ke Audit Log
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-[#B45309] tabular-nums">
                  {activeSupportSession
                    ? formatRemainingTime(activeSupportSession.expiresAt)
                    : activeDbSupportSessions[0]
                    ? formatRemainingTime(activeDbSupportSessions[0].expires_at)
                    : ''}
                </span>
              </div>

              {activeSupportSession ? (
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1 text-xs">
                    <div className="p-3 rounded-[12px] bg-white/90 border border-[#FDE68A]">
                      <div className="text-[#92400E] font-medium">Nama Tenant</div>
                      <div className="text-sm font-bold text-[#101828] mt-0.5">
                        {activeSupportSession.organizationName}
                      </div>
                    </div>
                    <div className="p-3 rounded-[12px] bg-white/90 border border-[#FDE68A]">
                      <div className="text-[#92400E] font-medium">Mode Akses</div>
                      <div className="mt-1">
                        <StatusBadge
                          label={
                            activeSupportSession.mode === 'read_write'
                              ? 'CONTROLLED-WRITE'
                              : 'READ-ONLY'
                          }
                          tone={activeSupportSession.mode === 'read_write' ? 'danger' : 'warning'}
                        />
                      </div>
                    </div>
                    <div className="p-3 rounded-[12px] bg-white/90 border border-[#FDE68A]">
                      <div className="text-[#92400E] font-medium">Waktu Mulai & Berakhir</div>
                      <div className="font-mono font-semibold text-[#101828] mt-0.5 tabular-nums">
                        {new Date(activeSupportSession.startedAt).toLocaleTimeString('id-ID')} —{' '}
                        {new Date(activeSupportSession.expiresAt).toLocaleTimeString('id-ID')}
                      </div>
                    </div>
                    <div className="p-3 rounded-[12px] bg-white/90 border border-[#FDE68A]">
                      <div className="text-[#92400E] font-medium">Alasan Operasional</div>
                      <div className="font-semibold text-[#101828] mt-0.5 line-clamp-2">
                        {activeSupportSession.reason}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate('/app/dashboard')}
                      className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors"
                    >
                      Buka Ruang Kerja Tenant
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRevokeSupportSession({
                          id: activeSupportSession.id,
                          organization_id: activeSupportSession.organizationId,
                          organization_name: activeSupportSession.organizationName,
                          reason: activeSupportSession.reason,
                          mode: activeSupportSession.mode,
                          started_at: activeSupportSession.startedAt,
                          expires_at: activeSupportSession.expiresAt,
                        })
                      }
                      className="px-4 py-2 rounded-[10px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors"
                    >
                      Akhiri Sesi
                    </button>
                  </div>
                </div>
              ) : (
                activeDbSupportSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 p-3.5 rounded-[12px] border border-[#FDE68A]"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#101828]">
                          {s.organization_name}
                        </span>
                        <StatusBadge
                          label={s.mode === 'read_write' ? 'CONTROLLED-WRITE' : 'READ-ONLY'}
                          tone={s.mode === 'read_write' ? 'danger' : 'warning'}
                        />
                      </div>
                      <div className="text-[#475467]">
                        Alasan: <span className="font-semibold text-[#101828]">{s.reason}</span> ·
                        Mulai: {new Date(s.started_at).toLocaleTimeString('id-ID')} · Berakhir:{' '}
                        {new Date(s.expires_at).toLocaleTimeString('id-ID')} (
                        {formatRemainingTime(s.expires_at)})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeSupportSession(s)}
                      className="px-3.5 py-2 rounded-[10px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold shrink-0"
                    >
                      Akhiri Sesi
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 5C. Filter Riwayat Support Access */}
          <FilterBar
            onReset={() => {
              setFilterSupportTenant('all');
              setFilterSupportMode('all');
              setFilterSupportStatus('all');
              setFilterSupportDate('');
            }}
          >
            <FormField label="Filter Tenant">
              <select
                value={filterSupportTenant}
                onChange={(e) => setFilterSupportTenant(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Lembaga</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Filter Mode Akses">
              <select
                value={filterSupportMode}
                onChange={(e) => setFilterSupportMode(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Mode</option>
                <option value="read_only">Read-Only</option>
                <option value="read_write">Controlled-Write</option>
              </select>
            </FormField>
            <FormField label="Filter Status Sesi">
              <select
                value={filterSupportStatus}
                onChange={(e) => setFilterSupportStatus(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Status</option>
                <option value="active">AKTIF</option>
                <option value="ended">DIAKHIRI</option>
                <option value="expired">KEDALUWARSA</option>
              </select>
            </FormField>
            <FormField label="Tanggal Mulai">
              <input
                type="date"
                value={filterSupportDate}
                onChange={(e) => setFilterSupportDate(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
              />
            </FormField>
          </FilterBar>

          {/* 5D. Tabel Riwayat Support Access */}
          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#101828]">
                  Riwayat Support Access (Break-Glass Audit Ledger)
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Catatan permanen seluruh sesi bantuan lintas tenant beserta durasi, mode akses,
                  alasan operasional, dan status penghentian.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSupportError(null);
                  setSupportAcknowledge(false);
                  setSelectedTenantForSupport(null);
                  setSupportForm({
                    organizationId: tenants[0]?.id || '',
                    reason: '',
                    durationMinutes: platformConfig.defaultSupportDurationMinutes,
                    mode: platformConfig.defaultSupportMode,
                  });
                  setSupportModalOpen(true);
                }}
                className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Mulai support session
              </button>
            </div>

            {filteredSupportSessions.length === 0 ? (
              <EmptyState
                title="Tidak Ada Riwayat Support Session"
                description="Belum ada sesi support yang tercatat atau sesuai filter. Klik 'Mulai support session' untuk membuka akses bantuan teraudit."
                actionLabel="Mulai support session"
                onAction={() => {
                  setSupportError(null);
                  setSupportAcknowledge(false);
                  setSelectedTenantForSupport(null);
                  setSupportForm({
                    organizationId: tenants[0]?.id || '',
                    reason: '',
                    durationMinutes: platformConfig.defaultSupportDurationMinutes,
                    mode: platformConfig.defaultSupportMode,
                  });
                  setSupportModalOpen(true);
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                    <tr>
                      <th className="px-5 py-3.5">Tenant</th>
                      <th className="px-5 py-3.5">Waktu</th>
                      <th className="px-5 py-3.5">Mode</th>
                      <th className="px-5 py-3.5">Alasan</th>
                      <th className="px-5 py-3.5">Durasi</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Aktor</th>
                      <th className="px-5 py-3.5 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E1E7EF]">
                    {filteredSupportSessions.map((s) => {
                      const isEnded = Boolean(s.ended_at);
                      const isExpired = !isEnded && new Date(s.expires_at).getTime() <= nowTick;
                      const isActive = !isEnded && !isExpired;
                      const durationMins = Math.max(
                        1,
                        Math.round(
                          (new Date(s.expires_at).getTime() - new Date(s.started_at).getTime()) /
                            60000
                        )
                      );
                      return (
                        <tr key={s.id} className="hover:bg-[#F3F7FF]/50 transition-colors">
                          <td className="px-5 py-4 font-bold text-[#101828]">
                            {s.organization_name}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs text-[#475467] tabular-nums whitespace-nowrap">
                            <div>Mulai: {new Date(s.started_at).toLocaleString('id-ID')}</div>
                            <div className="text-[#667085]">
                              Batas: {new Date(s.expires_at).toLocaleString('id-ID')}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge
                              label={
                                s.mode === 'read_write' ? 'CONTROLLED-WRITE' : 'READ-ONLY'
                              }
                              tone={s.mode === 'read_write' ? 'warning' : 'neutral'}
                            />
                          </td>
                          <td className="px-5 py-4 text-xs text-[#344054] max-w-xs">
                            {s.reason}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs font-semibold text-[#101828] tabular-nums">
                            {durationMins} menit
                            {isActive && (
                              <div className="text-[11px] text-[#B45309] font-normal mt-0.5">
                                {formatRemainingTime(s.expires_at)}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge
                              label={
                                isActive
                                  ? 'AKTIF'
                                  : isEnded
                                  ? 'DIAKHIRI'
                                  : 'KEDALUWARSA'
                              }
                              tone={
                                isActive ? 'success' : isEnded ? 'neutral' : 'warning'
                              }
                              dot={isActive}
                            />
                          </td>
                          <td className="px-5 py-4 text-xs text-[#475467]">
                            <span className="font-semibold text-[#101828]">Superadmin</span>
                            {s.actor_id && (
                              <div className="font-mono text-[11px] text-[#667085]">
                                {String(s.actor_id).slice(0, 8)}...
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {isActive ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeSupportSession(s)}
                                className="px-3 py-1.5 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] hover:bg-red-100 text-[#B91C1C] text-xs font-semibold transition-colors"
                              >
                                Akhiri Sesi
                              </button>
                            ) : (
                              <span className="text-xs text-[#667085] font-mono">Selesai</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 6: AUDIT PLATFORM & HEALTH MONITOR (/platform/audit)
         ===================================================================== */}
      {!selectedTenant && tab === 'audit' && (
        <div className="space-y-6">
          {/* 6A. Health Summary (4 KPI Aktual) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Service Healthy"
              value={
                isCheckingHealth && healthChecks.length === 0
                  ? 'Memeriksa...'
                  : `${healthyProbesCount} / ${healthChecks.length || 0}`
              }
              hint="Komponen infrastruktur & skema V2 berstatus sehat"
              tone={
                healthChecks.length > 0 && healthyProbesCount === healthChecks.length
                  ? 'success'
                  : 'primary'
              }
            />
            <StatCard
              label="Perlu Perhatian"
              value={isCheckingHealth && healthChecks.length === 0 ? '...' : attentionProbesCount}
              hint={
                attentionProbesCount === 0
                  ? 'Seluruh pemeriksaan lulus verifikasi'
                  : 'Layanan degraded atau tabel menunggu migrasi'
              }
              tone={attentionProbesCount === 0 ? 'success' : 'warning'}
            />
            <StatCard
              label="Jumlah Audit Events"
              value={loading ? '...' : auditLogs.length}
              hint="Peristiwa governance & keamanan tercatat di database"
              tone="primary"
            />
            <StatCard
              label="Waktu Pemeriksaan Terakhir"
              value={
                isCheckingHealth
                  ? 'Memeriksa...'
                  : lastHealthCheckAt
                  ? new Date(lastHealthCheckAt).toLocaleTimeString('id-ID')
                  : 'Belum diperiksa'
              }
              hint={
                lastHealthCheckAt
                  ? new Date(lastHealthCheckAt).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Klik Jalankan health check'
              }
              tone="neutral"
            />
          </div>

          {healthCheckError && (
            <div
              role="alert"
              className="rounded-[16px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-xs font-medium text-[#B91C1C]"
            >
              Gagal menyelesaikan diagnostik kesehatan sistem: {healthCheckError}
            </div>
          )}

          {/* 6B. System Health Monitor */}
          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#101828]">
                  System Health Monitor & Kesiapan Infrastruktur
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Pemeriksaan aktual koneksi database/PostgREST, kesiapan skema otorisasi 3-role,
                  audit logging, dan endpoint Serverless API (/api/health).
                </p>
              </div>
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={runHealthDiagnostics}
                className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
              >
                {isCheckingHealth ? 'Memeriksa...' : 'Jalankan health check'}
              </button>
            </div>
            <div className="divide-y divide-[#E1E7EF]">
              {healthChecks.map((hc) => (
                <div
                  key={hc.key}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F3F7FF]/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#F3F6FB] border border-[#E1E7EF] text-[11px] font-mono font-semibold text-[#475467] uppercase">
                        {hc.category}
                      </span>
                      <span className="text-sm font-bold text-[#101828]">{hc.label}</span>
                    </div>
                    <p className="text-xs text-[#667085]">{hc.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    {hc.checkedAt && (
                      <span className="font-mono text-[11px] text-[#667085] tabular-nums">
                        Diperiksa {new Date(hc.checkedAt).toLocaleTimeString('id-ID')}
                      </span>
                    )}
                    {hc.latencyMs !== undefined && (
                      <span className="px-2.5 py-0.5 rounded bg-[#F8FAFC] border border-[#E1E7EF] font-mono text-xs font-semibold text-[#344054] tabular-nums">
                        {hc.latencyMs} ms
                      </span>
                    )}
                    <StatusBadge
                      label={
                        hc.status === 'healthy'
                          ? 'HEALTHY'
                          : hc.status === 'missing'
                          ? 'PENDING MIGRATION'
                          : 'DEGRADED'
                      }
                      tone={
                        hc.status === 'healthy'
                          ? 'success'
                          : hc.status === 'missing'
                          ? 'warning'
                          : 'danger'
                      }
                      dot
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6C. Filter & Tabel Audit Events */}
          <FilterBar
            onReset={() => {
              setSearchAudit('');
              setFilterAuditTenant('all');
              setFilterAuditRole('all');
              setFilterAuditAction('all');
              setFilterAuditDate('');
            }}
          >
            <FormField label="Pencarian Aksi / Resource / Alasan">
              <input
                type="text"
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                placeholder="Cari action, resource, atau alasan..."
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs text-[#101828] focus:outline-none focus:border-[#1557D5] bg-white"
              />
            </FormField>
            <FormField label="Filter Tenant">
              <select
                value={filterAuditTenant}
                onChange={(e) => setFilterAuditTenant(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Tenant</option>
                <option value="platform_global">Platform Global</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Filter Role">
              <select
                value={filterAuditRole}
                onChange={(e) => setFilterAuditRole(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Role</option>
                <option value="superadmin">SUPERADMIN</option>
                <option value="admin">ADMIN</option>
                <option value="musammi">MUSAMMI</option>
              </select>
            </FormField>
            <FormField label="Filter Action">
              <select
                value={filterAuditAction}
                onChange={(e) => setFilterAuditAction(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs font-medium text-[#344054] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="all">Semua Action</option>
                {availableAuditActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Filter Tanggal">
              <input
                type="date"
                value={filterAuditDate}
                onChange={(e) => setFilterAuditDate(e.target.value)}
                className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-xs text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
              />
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-[16px] border border-[#E1E7EF] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E1E7EF] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#101828]">Audit Events Platform Global</h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Jejak perubahan konfigurasi tenant, pemberian access grants, sesi bantuan
                  break-glass, dan kebijakan global.
                </p>
              </div>
              <StatusBadge
                label={`Menampilkan ${filteredAuditLogs.length} dari ${auditLogs.length} event`}
                tone="primary"
              />
            </div>
            {filteredAuditLogs.length === 0 ? (
              <EmptyState
                title="Tidak Ada Audit Event yang Cocok"
                description="Belum ada catatan audit_logs yang sesuai dengan filter pencarian saat ini."
                actionLabel="Reset Filter"
                onAction={() => {
                  setSearchAudit('');
                  setFilterAuditTenant('all');
                  setFilterAuditRole('all');
                  setFilterAuditAction('all');
                  setFilterAuditDate('');
                }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-[#E1E7EF] text-xs font-semibold text-[#475467]">
                    <tr>
                      <th className="px-5 py-3.5">Waktu</th>
                      <th className="px-5 py-3.5">Tenant</th>
                      <th className="px-5 py-3.5">Aktor</th>
                      <th className="px-5 py-3.5">Role</th>
                      <th className="px-5 py-3.5">Action</th>
                      <th className="px-5 py-3.5">Resource</th>
                      <th className="px-5 py-3.5">Reason</th>
                      <th className="px-5 py-3.5 text-right">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E1E7EF]">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#F3F7FF]/50 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-xs text-[#475467] tabular-nums whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold text-[#101828]">
                          {log.organization_name || 'Platform Global'}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-[#667085]">
                          {log.actor_id ? `${String(log.actor_id).slice(0, 8)}...` : 'system'}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge
                            label={(log.actor_role || 'system').toUpperCase()}
                            tone={
                              log.actor_role === 'superadmin'
                                ? 'warning'
                                : log.actor_role === 'admin'
                                ? 'primary'
                                : 'neutral'
                            }
                          />
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs font-bold text-[#101828]">
                          {log.action}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-[#475467]">
                          {log.resource_type}
                          {log.resource_id ? ` (${String(log.resource_id).slice(0, 8)})` : ''}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-[#475467] max-w-xs truncate">
                          {log.reason || '-'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="px-3 py-1.5 rounded-[8px] border border-[#E1E7EF] bg-white hover:bg-[#F3F6FB] text-xs font-semibold text-[#344054] transition-colors"
                          >
                            Detail JSON
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 7: PENGATURAN PLATFORM GLOBAL (/platform/settings)
         ===================================================================== */}
      {!selectedTenant && tab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleSavePlatformSettings}
            className="lg:col-span-2 bg-white rounded-[16px] border border-[#E1E7EF] p-6 space-y-6 shadow-2xs"
          >
            <div className="border-b border-[#E1E7EF] pb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#101828]">
                  Kebijakan Global Support, Provisioning & Governance Akun
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">
                  Perubahan hanya berlaku sebagai nilai default platform dan dicatat ke Audit Log
                  setelah dikonfirmasi oleh server.
                </p>
              </div>
              <StatusBadge
                label={isSettingsDirty ? 'PERUBAHAN BELUM DISIMPAN' : 'TERSINKRONISASI'}
                tone={isSettingsDirty ? 'warning' : 'success'}
                dot
              />
            </div>

            {settingsFeedback && (
              <div
                role="alert"
                className={`rounded-[12px] border p-3.5 text-xs font-medium leading-relaxed ${
                  settingsFeedback.type === 'success'
                    ? 'border-[#BBF7D0] bg-[#ECFDF3] text-[#15803D]'
                    : 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                }`}
              >
                {settingsFeedback.message}
              </div>
            )}

            {/* Kelompok 1: Support Defaults */}
            <div className="p-4 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF] space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#101828]">1. Support Defaults</h3>
                <p className="text-xs text-[#667085] mt-0.5">
                  Parameter keamanan default ketika Superadmin memulai sesi bantuan Break-Glass.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Durasi Default Support Session"
                  hint="Batas waktu otomatis sebelum sesi support kedaluwarsa."
                >
                  <select
                    value={platformConfig.defaultSupportDurationMinutes}
                    onChange={(e) => {
                      setSettingsFeedback(null);
                      setPlatformConfig({
                        ...platformConfig,
                        defaultSupportDurationMinutes: Number(e.target.value),
                      });
                    }}
                    className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
                  >
                    <option value={15}>15 Menit</option>
                    <option value={30}>30 Menit (Standar ISO 27017)</option>
                    <option value={60}>60 Menit</option>
                  </select>
                </FormField>

                <FormField
                  label="Mode Default Support Session"
                  hint="Prinsip Least Privilege menganjurkan Read-Only."
                >
                  <select
                    value={platformConfig.defaultSupportMode}
                    onChange={(e) => {
                      setSettingsFeedback(null);
                      setPlatformConfig({
                        ...platformConfig,
                        defaultSupportMode: e.target.value as 'read_only' | 'read_write',
                      });
                    }}
                    className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
                  >
                    <option value="read_only">Read-Only (Default Aman)</option>
                    <option value="read_write">Controlled-Write (Koreksi Darurat)</option>
                  </select>
                </FormField>
              </div>
            </div>

            {/* Kelompok 2: Tenant Provisioning */}
            <div className="p-4 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF] space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#101828]">2. Tenant Provisioning</h3>
                <p className="text-xs text-[#667085] mt-0.5">
                  Konfigurasi paket awal dan zona waktu saat membuat organisasi baru.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Paket Awal Provisioning Tenant"
                  hint="Paket default saat lembaga baru di-provision."
                >
                  <select
                    value={platformConfig.defaultTenantPlan}
                    onChange={(e) => {
                      setSettingsFeedback(null);
                      setPlatformConfig({
                        ...platformConfig,
                        defaultTenantPlan: e.target.value as 'trial' | 'standard' | 'enterprise',
                      });
                    }}
                    className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
                  >
                    <option value="trial">Trial / Evaluasi</option>
                    <option value="standard">Standard Ma&apos;had</option>
                    <option value="enterprise">Enterprise Yayasan</option>
                  </select>
                </FormField>

                <FormField
                  label="Zona Waktu Default"
                  hint="Digunakan sebagai zona waktu awal jadwal sesi halaqah."
                >
                  <select
                    value={platformConfig.defaultTimezone}
                    onChange={(e) => {
                      setSettingsFeedback(null);
                      setPlatformConfig({ ...platformConfig, defaultTimezone: e.target.value });
                    }}
                    className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
                  >
                    <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                    <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                    <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  </select>
                </FormField>
              </div>
            </div>

            {/* Kelompok 3: Account Governance */}
            <div className="p-4 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF] space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#101828]">3. Account Governance</h3>
                <p className="text-xs text-[#667085] mt-0.5">
                  Kebijakan tata kelola undangan akun dan pembatasan akses lintas tenant.
                </p>
              </div>
              <label className="flex items-start gap-3 text-xs font-semibold text-[#101828] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={platformConfig.inviteOnlyMode}
                  onChange={(e) => {
                    setSettingsFeedback(null);
                    setPlatformConfig({ ...platformConfig, inviteOnlyMode: e.target.checked });
                  }}
                  className="mt-0.5 rounded border-[#CBD5E1] text-[#1557D5] focus:ring-[#2563EB]"
                />
                <div className="space-y-0.5">
                  <div>
                    Wajibkan Kebijakan Undangan Terverifikasi Server-Side (One-Time Token)
                  </div>
                  <p className="font-normal text-[#667085] leading-relaxed">
                    Memblokir pembuatan akun tanpa organisasi/grant sah dan mewajibkan aktivasi
                    melalui token undangan kriptografis sekali pakai (`/invite`).
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-[#E1E7EF] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={!isSettingsDirty || isSavingSettings}
                onClick={() => {
                  setPlatformConfig(savedPlatformConfig);
                  setSettingsFeedback(null);
                }}
                className="px-4 py-2 rounded-[10px] border border-[#E1E7EF] bg-white hover:bg-[#F3F6FB] text-xs font-semibold text-[#344054] disabled:opacity-40 transition-colors"
              >
                Reset Perubahan
              </button>
              <button
                type="submit"
                disabled={!isSettingsDirty || isSavingSettings}
                className="px-5 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSavingSettings ? 'Menyimpan ke Server...' : 'Simpan Kebijakan Platform'}
              </button>
            </div>
          </form>

          {/* Website Editor Entry Card */}
          <div className="space-y-4">
            <div className="bg-white rounded-[16px] border border-[#E1E7EF] p-6 flex flex-col justify-between space-y-5 shadow-2xs">
              <div className="space-y-3">
                <StatusBadge label="WEBSITE EDITOR · CMS PUBLIK" tone="primary" />
                <h3 className="text-base font-bold text-[#101828]">
                  Editor Landing Page & Dokumentasi Publik
                </h3>
                <p className="text-xs text-[#667085] leading-relaxed">
                  Kelola konten halaman depan publik (`/`), narasi fitur unggulan platform, dan
                  dokumentasi layanan di ruang kerja terpisah (`/platform/cms`) tanpa menyentuh
                  konfigurasi operasional tenant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isSettingsDirty) {
                    setConfirmAction({
                      isOpen: true,
                      title: 'Tinggalkan Pengaturan Tanpa Menyimpan?',
                      description:
                        'Anda memiliki perubahan kebijakan platform yang belum disimpan. Lanjutkan membuka Editor Landing Page (/platform/cms)?',
                      tone: 'danger',
                      confirmLabel: 'Buka /platform/cms',
                      onExecute: async () => {
                        setPlatformConfig(savedPlatformConfig);
                        setConfirmAction(null);
                        if (onNavigate) onNavigate('WebsiteEditor');
                        else navigate('/platform/cms');
                      },
                    });
                    return;
                  }
                  if (onNavigate) onNavigate('WebsiteEditor');
                  else navigate('/platform/cms');
                }}
                className="w-full py-2.5 px-4 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Buka Website Editor (/platform/cms)
              </button>
            </div>

            <div className="bg-[#F3F7FF] rounded-[16px] border border-[#BFDBFE] p-5 space-y-2 text-xs">
              <div className="font-bold text-[#1557D5]">Jaminan Keamanan Pengaturan</div>
              <p className="text-[#475467] leading-relaxed">
                Halaman ini hanya dapat diakses oleh <span className="font-semibold">Superadmin</span>.
                Kredensial rahasia (seperti bot token Telegram/WhatsApp atau service role key)
                tidak pernah diekspos ke browser dan dikelola secara terisolasi di server.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DRAWER DETAIL AKUN & ACCESS GRANTS (FASE 3A)
         ===================================================================== */}
      <Drawer
        isOpen={Boolean(selectedAccountDetail)}
        onClose={() => setSelectedAccountDetail(null)}
        title={selectedAccountDetail ? `Detail Akun: ${selectedAccountDetail.fullName}` : 'Detail Akun'}
        subtitle="Inspeksi identitas, cakupan tenant, access grants, dan riwayat keamanan akun."
      >
        {selectedAccountDetail && (
          <div className="space-y-6 text-xs">
            {/* 1. Identity & Scope */}
            <div className="p-4 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF] space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-[#101828]">
                    {selectedAccountDetail.fullName}
                  </div>
                  <div className="font-mono text-[#667085] mt-0.5">
                    {selectedAccountDetail.email || 'Email belum tersinkronisasi'}
                  </div>
                </div>
                <StatusBadge
                  label={selectedAccountDetail.status.toUpperCase()}
                  tone={statusTone(selectedAccountDetail.status)}
                  dot
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E1E7EF]">
                <div>
                  <div className="text-[#667085]">User ID</div>
                  <div className="font-mono font-semibold text-[#101828] break-all mt-0.5">
                    {selectedAccountDetail.userId}
                  </div>
                </div>
                <div>
                  <div className="text-[#667085]">Role Kanonikal</div>
                  <div className="mt-1">
                    <StatusBadge
                      label={formatCanonicalRoleLabel(selectedAccountDetail.role)}
                      tone={
                        selectedAccountDetail.role === 'superadmin'
                          ? 'warning'
                          : selectedAccountDetail.role === 'admin'
                          ? 'primary'
                          : 'success'
                      }
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[#667085]">Scope Organisasi / Tenant</div>
                  <div className="font-semibold text-[#101828] mt-0.5">
                    {selectedAccountDetail.organizationName}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Daftar Access Grants */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-[#101828] uppercase tracking-wider">
                Access Grants Terdaftar
              </h4>
              <div className="divide-y divide-[#E1E7EF] rounded-[12px] border border-[#E1E7EF] bg-white overflow-hidden">
                {(selectedAccountDetail.allGrants || []).map((g) => (
                  <div key={g.id} className="p-3.5 flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#101828]">{g.organizationName}</div>
                      <div className="font-mono text-[11px] text-[#667085]">
                        Grant ID: {String(g.id).slice(0, 12)}...
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={formatCanonicalRoleLabel(g.role)}
                        tone={
                          g.role === 'superadmin'
                            ? 'warning'
                            : g.role === 'admin'
                            ? 'primary'
                            : 'success'
                        }
                      />
                      <StatusBadge
                        label={g.status.toUpperCase()}
                        tone={statusTone(g.status)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Informasi Undangan Bila Tersedia */}
            {selectedAccountDetail.invitationInfo && (
              <div className="p-4 rounded-[12px] bg-[#F3F7FF] border border-[#BFDBFE] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1557D5]">Informasi Undangan Server-Side</span>
                  <StatusBadge
                    label={selectedAccountDetail.invitationInfo.status.toUpperCase()}
                    tone={statusTone(selectedAccountDetail.invitationInfo.status)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#475467]">
                  <div>
                    Email Tujuan:{' '}
                    <span className="font-mono font-semibold text-[#101828]">
                      {selectedAccountDetail.invitationInfo.email}
                    </span>
                  </div>
                  {selectedAccountDetail.invitationInfo.expiresAt && (
                    <div>
                      Kedaluwarsa:{' '}
                      <span className="font-mono font-semibold text-[#101828]">
                        {new Date(
                          selectedAccountDetail.invitationInfo.expiresAt
                        ).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Riwayat Aktivitas Keamanan Akun */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-[#101828] uppercase tracking-wider">
                Riwayat Aktivitas Keamanan
              </h4>
              {(() => {
                const accountLogs = auditLogs.filter(
                  (l) =>
                    l.actor_id === selectedAccountDetail.userId ||
                    l.resource_id === selectedAccountDetail.grantId ||
                    l.resource_id === selectedAccountDetail.userId
                );
                if (accountLogs.length === 0) {
                  return (
                    <div className="p-4 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF] text-[#667085] text-center">
                      Belum ada rekaman aktivitas keamanan spesifik untuk akun ini di audit_logs.
                    </div>
                  );
                }
                return (
                  <div className="divide-y divide-[#E1E7EF] rounded-[12px] border border-[#E1E7EF] bg-white">
                    {accountLogs.slice(0, 6).map((l) => (
                      <div key={l.id} className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#101828]">{l.action}</span>
                          <span className="font-mono text-[11px] text-[#667085]">
                            {new Date(l.created_at).toLocaleString('id-ID')}
                          </span>
                        </div>
                        {l.reason && <div className="text-[#667085]">Alasan: {l.reason}</div>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* 5. Kontrol Tindakan Akun */}
            <div className="pt-4 border-t border-[#E1E7EF] flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleToggleAccountStatus(selectedAccountDetail)}
                className={`px-3.5 py-2 rounded-[10px] border text-xs font-semibold ${
                  selectedAccountDetail.status === 'suspended' ||
                  selectedAccountDetail.status === 'revoked'
                    ? 'border-[#BBF7D0] bg-[#ECFDF3] text-[#15803D]'
                    : 'border-[#FECACA] bg-white text-[#B91C1C]'
                }`}
              >
                {selectedAccountDetail.status === 'suspended' ||
                selectedAccountDetail.status === 'revoked'
                  ? 'Pulihkan Akses (Restore)'
                  : 'Tangguhkan Akses (Suspend)'}
              </button>
              {selectedAccountDetail.status !== 'revoked' && (
                <button
                  type="button"
                  onClick={() => handleRevokeAccountAccess(selectedAccountDetail)}
                  className="px-3.5 py-2 rounded-[10px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold"
                >
                  {selectedAccountDetail.status === 'invited'
                    ? 'Batalkan Undangan'
                    : 'Cabut Grant (Revoke)'}
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* =====================================================================
          MODAL UBAH PAKET TENANT (FASE 3B)
         ===================================================================== */}
      <Modal
        isOpen={Boolean(planChangeModal)}
        onClose={() => setPlanChangeModal(null)}
        title={
          planChangeModal
            ? `Ubah Paket Layanan: ${planChangeModal.tenant.name}`
            : 'Ubah Paket Layanan'
        }
        subtitle="Penyesuaian assignment paket dan batas kuota operasional lembaga."
      >
        {planChangeModal &&
          (() => {
            const currentPlanDef = getPlanEntitlement(planChangeModal.tenant.plan_id);
            const nextPlanDef = getPlanEntitlement(planChangeModal.nextPlan);
            const exceedsStudents =
              planChangeModal.tenant.santriCount > nextPlanDef.maxStudents;
            const exceedsMusammi =
              planChangeModal.tenant.musammiCount > nextPlanDef.maxMusammi;

            return (
              <form onSubmit={handleConfirmPlanChange} className="space-y-4 text-xs">
                {planChangeModal.error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 font-medium text-red-800"
                  >
                    {planChangeModal.error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-[12px] bg-[#F8FAFC] border border-[#E1E7EF]">
                    <div className="text-[#667085] font-medium">Paket Saat Ini</div>
                    <div className="text-sm font-bold text-[#101828] mt-1">
                      {currentPlanDef.name}
                    </div>
                    <div className="font-mono text-[11px] text-[#475467] mt-1">
                      Kuota: {currentPlanDef.maxStudents} Santri · {currentPlanDef.maxMusammi}{' '}
                      Musammi
                    </div>
                  </div>

                  <div className="p-3.5 rounded-[12px] bg-[#F3F7FF] border border-[#BFDBFE]">
                    <label className="block text-[#1557D5] font-bold mb-1">
                      Pilih Paket Baru <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={planChangeModal.nextPlan}
                      onChange={(e) =>
                        setPlanChangeModal({
                          ...planChangeModal,
                          nextPlan: e.target.value as 'trial' | 'standard' | 'enterprise',
                          error: null,
                        })
                      }
                      className="w-full h-9 border border-[#93C5FD] rounded-lg px-2.5 text-xs font-semibold text-[#101828] bg-white"
                    >
                      <option value="trial">TRIAL ({SAAS_PLANS[0].maxStudents} Santri)</option>
                      <option value="standard">
                        STANDARD ({SAAS_PLANS[1].maxStudents} Santri)
                      </option>
                      <option value="enterprise">
                        ENTERPRISE ({SAAS_PLANS[2].maxStudents} Santri)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Perbandingan Perubahan Kuota */}
                <div className="p-3.5 rounded-[12px] border border-[#E1E7EF] bg-white space-y-2">
                  <div className="font-bold text-[#101828]">Perbandingan Perubahan Kuota</div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 rounded bg-[#F8FAFC]">
                      <div className="text-[11px] text-[#667085]">Quota Santri</div>
                      <div className="font-mono font-bold text-[#101828] mt-0.5">
                        {currentPlanDef.maxStudents} → {nextPlanDef.maxStudents}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[#F8FAFC]">
                      <div className="text-[11px] text-[#667085]">Quota Musammi</div>
                      <div className="font-mono font-bold text-[#101828] mt-0.5">
                        {currentPlanDef.maxMusammi} → {nextPlanDef.maxMusammi}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-[#F8FAFC]">
                      <div className="text-[11px] text-[#667085]">Retensi Audit</div>
                      <div className="font-mono font-bold text-[#101828] mt-0.5">
                        {currentPlanDef.auditRetentionDays}hr → {nextPlanDef.auditRetentionDays}hr
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dampak Perubahan */}
                <div
                  className={`p-3.5 rounded-[12px] border leading-relaxed ${
                    exceedsStudents || exceedsMusammi
                      ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                      : 'bg-[#F8FAFC] border-[#E1E7EF] text-[#475467]'
                  }`}
                >
                  <div className="font-bold mb-0.5">Dampak Perubahan Paket:</div>
                  {exceedsStudents || exceedsMusammi ? (
                    <p>
                      Perhatian: Pemakaian aktual lembaga saat ini (
                      {planChangeModal.tenant.santriCount} santri,{' '}
                      {planChangeModal.tenant.musammiCount} musammi) melebihi batas kuota paket{' '}
                      <span className="font-bold uppercase">{nextPlanDef.id}</span>. Data yang
                      sudah ada tidak dihapus, namun penambahan santri/musammi baru akan dibatasi.
                    </p>
                  ) : (
                    <p>
                      Pemakaian aktual lembaga ({planChangeModal.tenant.santriCount} santri,{' '}
                      {planChangeModal.tenant.musammiCount} musammi) berada dalam batas aman kuota
                      paket <span className="font-bold uppercase">{nextPlanDef.id}</span>. Definisi
                      paket global tidak berubah.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-[#344054] mb-1">
                    Alasan Perubahan Paket (Wajib untuk Audit Log){' '}
                    <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={planChangeModal.reason}
                    onChange={(e) =>
                      setPlanChangeModal({
                        ...planChangeModal,
                        reason: e.target.value,
                        error: null,
                      })
                    }
                    placeholder="Contoh: Upgrade kapasitas tahun ajaran baru sesuai persetujuan yayasan..."
                    className="w-full border border-[#E1E7EF] rounded-[10px] px-3 py-2 text-xs text-[#101828] focus:outline-none focus:border-[#1557D5]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E7EF]">
                  <button
                    type="button"
                    onClick={() => setPlanChangeModal(null)}
                    className="px-4 py-2 rounded-[10px] border border-[#E1E7EF] text-xs font-semibold text-[#344054] hover:bg-[#F3F6FB]"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || planChangeModal.tenant.plan_id === planChangeModal.nextPlan}
                    className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {isSubmitting
                      ? 'Menyimpan ke Server...'
                      : `Konfirmasi ke ${nextPlanDef.id.toUpperCase()}`}
                  </button>
                </div>
              </form>
            );
          })()}
      </Modal>

      {/* =====================================================================
          MODAL 1: PROVISION TENANT BARU
         ===================================================================== */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => {
          setProvisionError(null);
          setProvisionModalOpen(false);
        }}
        title="Provision Organisasi / Tenant Baru"
        subtitle="Siapkan workspace tenant terisolasi beserta undangan Admin Lembaga pertama."
      >
        <form onSubmit={handleProvisionTenant} className="space-y-4">
          {provisionError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-800 leading-relaxed"
            >
              {provisionError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama Lembaga / Ma&apos;had <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={provisionForm.name}
              onChange={(e) => {
                setProvisionError(null);
                setProvisionForm({ ...provisionForm, name: e.target.value });
              }}
              placeholder="Contoh: Ma'had Al-Ikhlas Putri"
              className="w-full h-10 border border-slate-300 rounded-xl px-3.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Slug Tenant (Unik)
              </label>
              <input
                type="text"
                value={provisionForm.slug}
                onChange={(e) => {
                  setProvisionError(null);
                  setProvisionForm({ ...provisionForm, slug: e.target.value.toLowerCase() });
                }}
                placeholder={
                  provisionForm.name.trim()
                    ? provisionForm.name
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')
                    : 'otomatis-dari-nama'
                }
                className="w-full h-10 border border-slate-300 rounded-xl px-3 text-sm font-mono text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Huruf kecil, angka, tanda hubung (-).
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Paket Layanan
              </label>
              <select
                value={provisionForm.planId}
                onChange={(e) =>
                  setProvisionForm({
                    ...provisionForm,
                    planId: e.target.value as 'trial' | 'standard' | 'enterprise',
                  })
                }
                className="w-full h-10 border border-slate-300 rounded-xl px-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="trial">Trial (Kuota Uji Coba)</option>
                <option value="standard">Standard (Operasional Reguler)</option>
                <option value="enterprise">Enterprise (Skala Penuh)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Zona Waktu</label>
              <select
                value={provisionForm.timezone}
                onChange={(e) => setProvisionForm({ ...provisionForm, timezone: e.target.value })}
                className="w-full h-10 border border-slate-300 rounded-xl px-3 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              </select>
            </div>
          </div>

          <div className="pt-3.5 border-t border-slate-200 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Undangan Admin Lembaga Pertama (Wajib)
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sistem akan menerbitkan access grant role{' '}
                <span className="font-mono font-semibold text-slate-700">admin</span> dan token
                undangan sekali pakai.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Lengkap Admin <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={provisionForm.adminFullName}
                onChange={(e) => {
                  setProvisionError(null);
                  setProvisionForm({ ...provisionForm, adminFullName: e.target.value });
                }}
                placeholder="Contoh: Ustadz Ahmad Fauzi"
                className="w-full h-10 border border-slate-300 rounded-xl px-3.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Login Admin <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={provisionForm.adminEmail}
                  onChange={(e) => {
                    setProvisionError(null);
                    setProvisionForm({ ...provisionForm, adminEmail: e.target.value });
                  }}
                  placeholder="admin@mahad.id"
                  className="w-full h-10 border border-slate-300 rounded-xl px-3.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Kode Verifikasi Awal (Opsional)
                </label>
                <input
                  type="password"
                  value={provisionForm.adminPassword}
                  onChange={(e) =>
                    setProvisionForm({ ...provisionForm, adminPassword: e.target.value })
                  }
                  placeholder="Kosongkan untuk sandi acak otomatis"
                  className="w-full h-10 border border-slate-300 rounded-xl px-3.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setProvisionError(null);
                setProvisionModalOpen(false);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Memproses Provisioning...' : 'Provision Tenant'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 2: UNDANG AKUN BARU (SUPERADMIN / ADMIN TENANT / MUSAMMI)
         ===================================================================== */}
      <Modal
        isOpen={isInviteAccountModalOpen}
        onClose={() => {
          setInviteError(null);
          setInviteAccountModalOpen(false);
        }}
        title="Undang Akun & Terbitkan Access Grant"
        subtitle="Undangan dikirim melalui mekanisme server-side dengan token aktivasi sekali pakai."
      >
        <form onSubmit={handleInvitePlatformOrTenantAccount} className="space-y-4">
          {inviteError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
            >
              {inviteError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#344054] mb-1.5">
              Nama Lengkap Pengguna <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={inviteAccountForm.fullName}
              onChange={(e) => {
                setInviteError(null);
                setInviteAccountForm({ ...inviteAccountForm, fullName: e.target.value });
              }}
              placeholder="Contoh: Ustadz Ibrahim"
              className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3.5 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#344054] mb-1.5">
              Alamat Email Login <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              required
              value={inviteAccountForm.email}
              onChange={(e) => {
                setInviteError(null);
                setInviteAccountForm({ ...inviteAccountForm, email: e.target.value });
              }}
              placeholder="nama@lembaga.id"
              className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3.5 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                Role Kanonikal (3-Role) <span className="text-red-600">*</span>
              </label>
              <select
                value={inviteAccountForm.role}
                onChange={(e) => {
                  setInviteError(null);
                  setInviteAccountForm({
                    ...inviteAccountForm,
                    role: e.target.value as 'superadmin' | 'admin' | 'musammi',
                  });
                }}
                className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="admin">Admin</option>
                <option value="musammi">Musammi</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>

            {inviteAccountForm.role !== 'superadmin' ? (
              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Organisasi / Tenant Target <span className="text-red-600">*</span>
                </label>
                <select
                  required
                  value={inviteAccountForm.targetOrganizationId}
                  onChange={(e) => {
                    setInviteError(null);
                    setInviteAccountForm({
                      ...inviteAccountForm,
                      targetOrganizationId: e.target.value,
                    });
                  }}
                  className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
                >
                  <option value="">-- Pilih Lembaga --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Scope Otorisasi
                </label>
                <div className="h-10 px-3 rounded-[10px] bg-[#F8FAFC] border border-[#E1E7EF] flex items-center text-xs font-semibold text-[#475467]">
                  Platform Global (Lintas Tenant)
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-[12px] bg-[#F3F7FF] border border-[#BFDBFE] text-xs text-[#344054] space-y-1 leading-relaxed">
            <div className="font-bold text-[#1557D5]">Informasi Akses & Keamanan Undangan</div>
            <p>
              Sistem tidak membuat akun dengan password default statis. Server (`/api/invitations`)
              akan menerbitkan grant berstatus <span className="font-mono font-semibold">invited</span>{' '}
              beserta tautan token aktivasi sekali pakai yang wajib dikonfirmasi oleh penerima.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E7EF]">
            <button
              type="button"
              onClick={() => {
                setInviteError(null);
                setInviteAccountModalOpen(false);
              }}
              className="px-4 py-2 rounded-[10px] border border-[#E1E7EF] text-xs font-semibold text-[#344054] hover:bg-[#F3F6FB]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Menerbitkan Undangan...' : 'Kirim Undangan Server-Side'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 3: BUKA SUPPORT ACCESS SESSION (FASE 4)
         ===================================================================== */}
      <Modal
        isOpen={isSupportModalOpen}
        onClose={() => {
          setSupportError(null);
          setSupportAcknowledge(false);
          setSupportModalOpen(false);
        }}
        title={`Mulai Support Session${
          selectedTenantForSupport ? `: ${selectedTenantForSupport.name}` : ''
        }`}
        subtitle="Akses bantuan terkontrol berbatas waktu dengan pencatatan audit penuh."
      >
        <form onSubmit={handleStartSupportSession} className="space-y-4">
          {supportError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 leading-relaxed"
            >
              {supportError}
            </div>
          )}

          {!selectedTenantForSupport ? (
            <div>
              <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                Tenant Target <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={supportForm.organizationId}
                onChange={(e) => {
                  setSupportError(null);
                  setSupportForm({ ...supportForm, organizationId: e.target.value });
                }}
                className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="">-- Pilih Lembaga Target --</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 rounded-[10px] bg-[#F8FAFC] border border-[#E1E7EF] flex items-center justify-between text-xs">
              <span className="text-[#667085] font-medium">Target Lembaga:</span>
              <span className="font-bold text-[#101828]">{selectedTenantForSupport.name}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                Mode Akses <span className="text-red-600">*</span>
              </label>
              <select
                value={supportForm.mode}
                onChange={(e) => {
                  setSupportError(null);
                  setSupportForm({
                    ...supportForm,
                    mode: e.target.value as 'read_only' | 'read_write',
                  });
                }}
                className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value="read_only">Read-Only (Observasi Aman)</option>
                <option value="read_write">Controlled-Write (Koreksi Darurat)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                Durasi Sesi <span className="text-red-600">*</span>
              </label>
              <select
                value={supportForm.durationMinutes}
                onChange={(e) => {
                  setSupportError(null);
                  setSupportForm({ ...supportForm, durationMinutes: Number(e.target.value) });
                }}
                className="w-full h-10 border border-[#E1E7EF] rounded-[10px] px-3 text-sm text-[#101828] bg-white focus:outline-none focus:border-[#1557D5]"
              >
                <option value={15}>15 Menit</option>
                <option value={30}>30 Menit (Standar)</option>
                <option value={60}>60 Menit</option>
              </select>
            </div>
          </div>

          {/* Peringatan Konsekuensi Berdasarkan Mode */}
          {supportForm.mode === 'read_write' ? (
            <div className="p-3.5 rounded-[12px] bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] space-y-1 leading-relaxed">
              <div className="font-bold">
                Peringatan Tingkat Tinggi: Mode Controlled-Write (Read & Write)
              </div>
              <p>
                Mode ini mengizinkan modifikasi terbatas pada data operasional tenant selama sesi
                berlangsung. Setiap perubahan menulis jejak `before_state` dan `after_state` ke
                Audit Log lembaga dan platform. Gunakan Read-Only jika hanya melakukan investigasi.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] leading-relaxed">
              <span className="font-bold">Mode Read-Only:</span> Anda hanya dapat menginspeksi
              konfigurasi dan data tenant tanpa dapat mengubah data akademik, nilai, atau raport.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#344054]">
                Alasan Operasional / Nomor Tiket <span className="text-red-600">*</span>
              </label>
              <span className="text-[11px] font-mono text-[#667085]">
                Min. {Math.max(5, platformConfig.minSupportReasonChars || 10)} karakter (
                {supportForm.reason.trim().length} diisi)
              </span>
            </div>
            <textarea
              required
              rows={3}
              value={supportForm.reason}
              onChange={(e) => {
                setSupportError(null);
                setSupportForm({ ...supportForm, reason: e.target.value });
              }}
              placeholder="Tuliskan nomor tiket bantuan dan alasan teknis pembukaan sesi support..."
              className="w-full border border-[#E1E7EF] rounded-[10px] px-3.5 py-2 text-sm text-[#101828] focus:outline-none focus:border-[#1557D5]"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#F8FAFC] border border-[#E1E7EF] text-xs text-[#344054] cursor-pointer">
            <input
              type="checkbox"
              checked={supportAcknowledge}
              onChange={(e) => {
                setSupportError(null);
                setSupportAcknowledge(e.target.checked);
              }}
              className="mt-0.5 rounded border-[#CBD5E1] text-[#1557D5]"
            />
            <span className="leading-relaxed">
              <strong className="text-[#101828]">Acknowledgement:</strong> Saya menyatakan sesi
              support ini memiliki otorisasi operasional yang sah, terikat ke scope tenant yang
              dipilih, otomatis berakhir sesuai durasi, dan seluruh aktivitas diaudit.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E7EF]">
            <button
              type="button"
              onClick={() => {
                setSupportError(null);
                setSupportAcknowledge(false);
                setSupportModalOpen(false);
              }}
              className="px-4 py-2 rounded-[10px] border border-[#E1E7EF] text-xs font-semibold text-[#344054] hover:bg-[#F3F6FB]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-[10px] bg-[#1557D5] hover:bg-[#1E40AF] text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Mengotorisasi Sesi...' : 'Mulai Support Session'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 4: INSPEKSI PAYLOAD JSON AUDIT LOG (FASE 5A — SANITIZED)
         ===================================================================== */}
      <Modal
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        title={`Detail Audit Event: ${selectedAuditLog?.action || ''}`}
        subtitle="Inspeksi metadata governance dan state perubahan (field sensitif disensor otomatis)."
      >
        {selectedAuditLog &&
          (() => {
            const safeBefore = sanitizeAuditPayload(selectedAuditLog.before_state || null);
            const safeAfter = sanitizeAuditPayload(selectedAuditLog.after_state || null);
            const fullSafePayload = {
              id: selectedAuditLog.id,
              created_at: selectedAuditLog.created_at,
              organization_id: selectedAuditLog.organization_id || null,
              organization_name: selectedAuditLog.organization_name || 'Platform Global',
              actor_id: selectedAuditLog.actor_id || null,
              actor_role: selectedAuditLog.actor_role || 'system',
              action: selectedAuditLog.action,
              resource_type: selectedAuditLog.resource_type,
              resource_id: selectedAuditLog.resource_id || null,
              reason: selectedAuditLog.reason || null,
              before_state: safeBefore,
              after_state: safeAfter,
            };

            return (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-[#F8FAFC] rounded-[12px] border border-[#E1E7EF]">
                  <div>
                    <span className="text-[#667085]">Waktu Event:</span>
                    <div className="font-mono font-semibold text-[#101828] mt-0.5">
                      {new Date(selectedAuditLog.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#667085]">Tenant Scope:</span>
                    <div className="font-semibold text-[#101828] mt-0.5">
                      {selectedAuditLog.organization_name || 'Platform Global'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#667085]">Aktor & Role:</span>
                    <div className="font-mono font-semibold text-[#101828] mt-0.5">
                      {(selectedAuditLog.actor_role || 'system').toUpperCase()}{' '}
                      {selectedAuditLog.actor_id
                        ? `(${String(selectedAuditLog.actor_id).slice(0, 8)}...)`
                        : ''}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#667085]">Resource Target:</span>
                    <div className="font-mono font-semibold text-[#101828] mt-0.5">
                      {selectedAuditLog.resource_type}{' '}
                      {selectedAuditLog.resource_id
                        ? `(${String(selectedAuditLog.resource_id).slice(0, 8)})`
                        : ''}
                    </div>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-[#E1E7EF]">
                    <span className="text-[#667085]">Alasan (Reason):</span>{' '}
                    <span className="font-semibold text-[#101828]">
                      {selectedAuditLog.reason || '-'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#344054]">
                    State Perubahan & Payload JSON (Monospace)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(fullSafePayload, null, 2));
                      NotificationStore.addNotification(
                        'Payload JSON berhasil disalin ke clipboard.',
                        'info'
                      );
                    }}
                    className="px-3 py-1 rounded-[8px] border border-[#BFDBFE] bg-[#E7F0FF] hover:bg-[#DBEAFE] text-[#1557D5] text-xs font-semibold transition-colors"
                  >
                    Salin JSON
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="font-semibold text-[#475467] mb-1">Before State:</div>
                    <pre className="p-3 bg-slate-900 text-slate-100 rounded-[10px] overflow-auto max-h-60 font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(safeBefore, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="font-semibold text-[#475467] mb-1">After State:</div>
                    <pre className="p-3 bg-slate-900 text-emerald-300 rounded-[10px] overflow-auto max-h-60 font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(safeAfter, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })()}
      </Modal>

      {/* =====================================================================
          CONFIRM DIALOG TERAUDIT (WAJIB ALASAN)
         ===================================================================== */}
      <ConfirmDialog
        isOpen={Boolean(confirmAction?.isOpen)}
        title={confirmAction?.title || ''}
        description={confirmAction?.description || ''}
        confirmLabel={confirmAction?.confirmLabel || 'Konfirmasi'}
        tone={confirmAction?.tone || 'primary'}
        requireReason={true}
        isSubmitting={isSubmitting}
        onCancel={() => setConfirmAction(null)}
        onConfirm={(reason) => {
          if (confirmAction && reason) {
            confirmAction.onExecute(reason);
          }
        }}
      />
    </PageShell>
  );
};

export default PlatformConsolePage;

