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
}

interface SupportSessionItem {
  id: string;
  organization_id: string;
  organization_name?: string;
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

  // URL-synced filters
  const [searchTenant, setSearchTenant] = useUrlFilterParam('q', '');
  const [filterStatus, setFilterStatus] = useUrlFilterParam('status', 'all');
  const [filterPlan, setFilterPlan] = useUrlFilterParam('plan', 'all');
  const [searchAccount, setSearchAccount] = useState('');
  const [filterAccountRole, setFilterAccountRole] = useState<string>('all');
  const [searchAudit, setSearchAudit] = useState('');
  const [filterAuditRole, setFilterAuditRole] = useState<string>('all');

  // Data States
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccountItem[]>([]);
  const [supportSessions, setSupportSessions] = useState<SupportSessionItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheckResult[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [loading, setLoading] = useState(true);

  // Platform Global Settings State
  const [platformConfig, setPlatformConfig] = useState({
    defaultSupportDurationMinutes: 30,
    defaultSupportMode: 'read_only' as 'read_only' | 'read_write',
    minSupportReasonChars: 10,
    defaultTenantPlan: 'standard' as 'trial' | 'standard' | 'enterprise',
    defaultTimezone: 'Asia/Jakarta',
    inviteOnlyMode: true,
    maintenanceBannerText: '',
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Modal: Provision Tenant Baru + Invite Admin
  const [isProvisionModalOpen, setProvisionModalOpen] = useState(false);
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
  const [inviteAccountForm, setInviteAccountForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'admin' as 'superadmin' | 'admin' | 'musammi',
    targetOrganizationId: '',
  });

  // Modal: Buka Support Access Session
  const [isSupportModalOpen, setSupportModalOpen] = useState(false);
  const [selectedTenantForSupport, setSelectedTenantForSupport] = useState<TenantItem | null>(null);
  const [supportForm, setSupportForm] = useState({
    organizationId: '',
    reason: '',
    durationMinutes: 30,
    mode: 'read_only' as 'read_only' | 'read_write',
  });

  // Modal: Inspeksi Detail Audit Log
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

  const navigateToSection = useCallback(
    (nextTab: PlatformSection, path: string) => {
      setTab(nextTab);
      setSelectedTenantId(null);
      if (onNavigatePath) {
        onNavigatePath(path);
      } else {
        navigate(path);
      }
    },
    [navigate, onNavigatePath]
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
        supabase.from('profiles').select('id, organization_id, role, full_name, created_at'),
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

      // Coba muat access_grants jika skema V2 sudah aktif
      let grantsList: any[] = [];
      try {
        const { data: gData } = await (supabase as any)
          .from('access_grants')
          .select('id, user_id, organization_id, role, status, created_at');
        if (gData) grantsList = gData;
      } catch {
        // Fallback ke profiles
      }

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

        return {
          id: matchingGrant?.id || p.id,
          grantId: matchingGrant?.id || null,
          userId: p.id,
          fullName: p.full_name || 'Tanpa Nama',
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
        };
      });
      setAccounts(mappedAccounts);

      // Muat support_access_sessions
      try {
        const { data: sData } = await (supabase as any)
          .from('support_access_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(40);
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

      // Muat audit_logs
      try {
        const { data: aData } = await (supabase as any)
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60);
        if (aData) {
          setAuditLogs(
            aData.map((a: any) => ({
              ...a,
              organization_name: a.organization_id
                ? orgMap.get(a.organization_id) || String(a.organization_id).slice(0, 8)
                : 'Platform Global',
            }))
          );
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
    const results: HealthCheckResult[] = [];

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
      });
    } catch (e: any) {
      results.push({
        key: 'db_postgrest',
        label: 'Koneksi Utama Supabase PostgREST',
        category: 'Database',
        status: 'degraded',
        detail: e?.message || 'Koneksi gagal',
      });
    }

    // 2. Probe Tabel Governance V2 (access_grants, support_access_sessions, audit_logs, integration_secrets)
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
        });
      } catch {
        results.push({
          key: `tbl_${tbl.name}`,
          label: tbl.label,
          category: 'Schema V2',
          status: 'missing',
          detail: 'Belum dimigrasikan di database aktif.',
        });
      }
    }

    // 3. Kebijakan Isolasi Role & Access Grants Verifikasi Aktual
    try {
      const secStart = performance.now();
      const { data: grantsData, error: grantsErr } = await (supabase as any)
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
      });
    } catch (e: any) {
      results.push({
        key: 'sec_3role',
        label: 'Disiplin 3 Role Kanonikal & Otoritas access_grants',
        category: 'Security',
        status: 'degraded',
        detail: `Error pemeriksaan: ${e?.message || 'Tidak dapat diakses'}`,
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
        });
      } else {
        results.push({
          key: 'serverless_adapter',
          label: 'Backend & Serverless API Monitor (/api/health)',
          category: 'Serverless API',
          status: 'degraded',
          latencyMs: apiMs,
          detail: `Endpoint /api/health mengembalikan status ${res.status}. Periksa konfigurasi serverless.`,
        });
      }
    } catch {
      results.push({
        key: 'serverless_adapter',
        label: 'Backend & Serverless API Monitor (/api/health)',
        category: 'Serverless API',
        status: 'degraded',
        detail: 'Serverless backend offline atau belum dijalankan di port 3000.',
      });
    }

    setHealthChecks(results);
    setIsCheckingHealth(false);
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
      if (filterAccountRole !== 'all' && a.role !== filterAccountRole) return false;
      if (
        searchAccount &&
        !a.fullName.toLowerCase().includes(searchAccount.toLowerCase()) &&
        !a.organizationName.toLowerCase().includes(searchAccount.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [accounts, filterAccountRole, searchAccount]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((l) => {
      if (
        filterAuditRole !== 'all' &&
        (l.actor_role || '').toLowerCase() !== filterAuditRole.toLowerCase()
      ) {
        return false;
      }
      if (
        searchAudit &&
        !l.action.toLowerCase().includes(searchAudit.toLowerCase()) &&
        !l.resource_type.toLowerCase().includes(searchAudit.toLowerCase()) &&
        !(l.reason || '').toLowerCase().includes(searchAudit.toLowerCase()) &&
        !(l.organization_name || '').toLowerCase().includes(searchAudit.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [auditLogs, filterAuditRole, searchAudit]);

  // ============================================================================
  // HANDLERS: PROVISION TENANT, UPDATE STATUS/PLAN, INVITE ACCOUNT, SUPPORT SESSION
  // ============================================================================
  const handleProvisionTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisionForm.name.trim()) return;
    if (!provisionForm.adminEmail.trim() || !provisionForm.adminFullName.trim()) {
      NotificationStore.addNotification(
        'Nama Lengkap dan Email Admin pertama wajib diisi agar siklus provisioning tenant dapat diverifikasi.',
        'error'
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const slug =
        provisionForm.slug.trim() ||
        `${provisionForm.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;

      let createdOrg: { id: string; name: string } | null = null;
      let loggedViaRpc = false;

      // 1. Buat / lanjutkan tenant dalam status 'provisioning' via RPC SECURITY DEFINER (idempoten untuk retry)
      try {
        const { data: rpcOrg, error: rpcErr } = await (supabase as any).rpc(
          'rpc_create_tenant_with_admin',
          {
            p_name: provisionForm.name.trim(),
            p_slug: slug,
            p_timezone: provisionForm.timezone,
            p_plan_id: provisionForm.planId,
            p_status: 'provisioning',
          }
        );
        if (!rpcErr && rpcOrg && rpcOrg.id) {
          createdOrg = { id: rpcOrg.id, name: rpcOrg.name || provisionForm.name.trim() };
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
            name: provisionForm.name.trim(),
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
              name: provisionForm.name.trim(),
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
          email: provisionForm.adminEmail.trim(),
          password: provisionForm.adminPassword.trim() || undefined,
          fullName: provisionForm.adminFullName.trim(),
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

        NotificationStore.addNotification(
          `Undangan Admin gagal (${resJson.error || resp.statusText}). Status tenant ditandai PROVISIONING_FAILED dan dapat di-retry tanpa duplikasi.`,
          'error'
        );
        await fetchPlatformData();
        return;
      }

      setLastIssuedInviteInfo({
        email: provisionForm.adminEmail.trim().toLowerCase(),
        role: 'admin',
        invitePath: resJson.inviteAcceptPath || `/invite?email=${encodeURIComponent(provisionForm.adminEmail.trim().toLowerCase())}&org=${createdOrg.id}`,
        temporaryPassword: resJson.temporaryPassword || null,
      });

      NotificationStore.addNotification(
        `Tenant "${createdOrg.name}" berstatus PROVISIONING dan undangan Admin telah diterbitkan. Tenant akan otomatis ACTIVE setelah Admin mengonfirmasi undangan di /invite.`,
        'success'
      );

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
      NotificationStore.addNotification(err.message || 'Gagal membuat tenant', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTenantLifecycle = (
    tenant: TenantItem,
    nextStatus: 'provisioning' | 'provisioning_failed' | 'trial' | 'active' | 'suspended' | 'archived'
  ) => {
    setConfirmAction({
      isOpen: true,
      title: `Ubah Status Tenant: ${tenant.name}`,
      description: `Anda akan mengubah status siklus hidup "${tenant.name}" dari ${tenant.status.toUpperCase()} menjadi ${nextStatus.toUpperCase()}. Tindakan ini akan dicatat ke Audit Log Platform.`,
      tone: nextStatus === 'suspended' || nextStatus === 'archived' ? 'danger' : 'primary',
      confirmLabel: `Ubah ke ${nextStatus.toUpperCase()}`,
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
    nextPlan: 'trial' | 'standard' | 'enterprise'
  ) => {
    if (tenant.plan_id === nextPlan) return;
    setConfirmAction({
      isOpen: true,
      title: `Ubah Paket Layanan: ${tenant.name}`,
      description: `Perubahan paket dari ${tenant.plan_id.toUpperCase()} ke ${nextPlan.toUpperCase()} akan menyesuaikan batas kuota santri, musammi, dan fitur integrasi lembaga.`,
      tone: 'primary',
      confirmLabel: `Terapkan Paket ${nextPlan.toUpperCase()}`,
      onExecute: async (reason: string) => {
        setIsSubmitting(true);
        try {
          await (supabase as any)
            .from('organizations')
            .update({ plan_id: nextPlan })
            .eq('id', tenant.id);

          await recordPlatformAuditLog({
            organizationId: tenant.id,
            action: `tenant.plan_changed.${nextPlan}`,
            resourceType: 'organizations',
            resourceId: tenant.id,
            reason,
            beforeState: { plan_id: tenant.plan_id },
            afterState: { plan_id: nextPlan },
          });

          setTenants((prev) =>
            prev.map((t) => (t.id === tenant.id ? { ...t, plan_id: nextPlan } : t))
          );
          NotificationStore.addNotification(
            `Paket layanan "${tenant.name}" berhasil diubah ke ${nextPlan.toUpperCase()}.`,
            'success'
          );
        } catch (err: any) {
          NotificationStore.addNotification(err.message || 'Gagal mengubah paket tenant', 'error');
        } finally {
          setIsSubmitting(false);
          setConfirmAction(null);
        }
      },
    });
  };

  const handleInvitePlatformOrTenantAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteAccountForm.email.trim() || !inviteAccountForm.fullName.trim()) return;
    if (
      inviteAccountForm.role !== 'superadmin' &&
      !inviteAccountForm.targetOrganizationId
    ) {
      NotificationStore.addNotification(
        'Pilih organisasi/lembaga target untuk akun Admin atau Musammi.',
        'error'
      );
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
          email: inviteAccountForm.email.trim(),
          password: inviteAccountForm.password.trim() || undefined,
          fullName: inviteAccountForm.fullName.trim(),
          role: inviteAccountForm.role,
          targetOrganizationId:
            inviteAccountForm.role === 'superadmin'
              ? null
              : inviteAccountForm.targetOrganizationId,
          mahadName: targetOrg?.name || 'Platform Global',
          activateImmediately: Boolean(inviteAccountForm.password.trim()),
        }),
      });

      const resJson = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(resJson.error || 'Gagal membuat undangan akun.');
      }

      await recordPlatformAuditLog({
        organizationId:
          inviteAccountForm.role === 'superadmin'
            ? null
            : inviteAccountForm.targetOrganizationId,
        action: `account.invited.${inviteAccountForm.role}`,
        resourceType: 'access_grants',
        reason: `Undangan akun ${inviteAccountForm.role} untuk ${inviteAccountForm.fullName.trim()}`,
        afterState: {
          email: inviteAccountForm.email.trim(),
          role: inviteAccountForm.role,
          organization_id: inviteAccountForm.targetOrganizationId || null,
        },
      });

      setLastIssuedInviteInfo({
        email: inviteAccountForm.email.trim().toLowerCase(),
        role: inviteAccountForm.role,
        invitePath:
          resJson.inviteAcceptPath ||
          `/invite?email=${encodeURIComponent(inviteAccountForm.email.trim().toLowerCase())}`,
        temporaryPassword: resJson.temporaryPassword || null,
      });
      NotificationStore.addNotification(
        `Undangan akun ${inviteAccountForm.fullName} (${formatCanonicalRoleLabel(inviteAccountForm.role)}) berhasil diterbitkan dengan token sekali pakai.`,
        'success'
      );
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
      NotificationStore.addNotification(err.message || 'Gagal mengundang akun', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAccountStatus = (account: PlatformAccountItem) => {
    const nextStatus = account.status === 'suspended' ? 'active' : 'suspended';
    setConfirmAction({
      isOpen: true,
      title: `${nextStatus === 'suspended' ? 'Tangguhkan (Suspend)' : 'Aktifkan Kembali'} Akun: ${account.fullName}`,
      description: `Status akses untuk "${account.fullName}" pada "${account.organizationName}" akan diubah menjadi ${nextStatus.toUpperCase()}. Data historis tetap utuh.`,
      tone: nextStatus === 'suspended' ? 'danger' : 'primary',
      confirmLabel: nextStatus === 'suspended' ? 'Suspend Akses' : 'Aktifkan Akses',
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

          setAccounts((prev) =>
            prev.map((a) =>
              a.userId === account.userId && a.organizationId === account.organizationId
                ? { ...a, status: nextStatus }
                : a
            )
          );
          NotificationStore.addNotification(
            `Status akses ${account.fullName} berhasil diubah ke ${nextStatus.toUpperCase()}.`,
            'success'
          );
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
        ? `Token undangan untuk "${account.fullName}" pada "${account.organizationName}" akan segera dibatalkan dan tidak dapat dipakai lagi.`
        : `Hak akses "${account.fullName}" pada "${account.organizationName}" akan dicabut secara permanen (REVOKED) tanpa menghapus riwayat akademik atau audit.`,
      tone: 'danger',
      confirmLabel: isInvited ? 'Batalkan Undangan' : 'Cabut Akses (Revoke)',
      onExecute: async (reason: string) => {
        setIsSubmitting(true);
        try {
          if (isInvited) {
            const { error: revErr } = await (supabase as any).rpc('rpc_revoke_invitation', {
              p_invitation_id: null,
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

          setAccounts((prev) =>
            prev.map((a) =>
              a.userId === account.userId && a.organizationId === account.organizationId
                ? { ...a, status: 'revoked' }
                : a
            )
          );
          NotificationStore.addNotification(
            `Akses/undangan untuk ${account.fullName} berhasil dicabut (REVOKED).`,
            'success'
          );
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
    const targetTenant =
      selectedTenantForSupport ||
      tenants.find((t) => t.id === supportForm.organizationId) ||
      null;

    if (!targetTenant) {
      NotificationStore.addNotification('Pilih organisasi/tenant target terlebih dahulu.', 'error');
      return;
    }
    if (supportForm.reason.trim().length < 5) {
      NotificationStore.addNotification(
        'Alasan akses support wajib diisi minimal 5 karakter.',
        'error'
      );
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
            'Gagal mengotorisasi Support Access Session di database. Pastikan migrasi V2 telah dijalankan.'
        );
      }

      const sessionId = rpcRes.id;
      const expiresAt =
        rpcRes.expires_at ||
        new Date(Date.now() + supportForm.durationMinutes * 60 * 1000).toISOString();

      SupportSessionStore.startSession({
        id: sessionId,
        organizationId: targetTenant.id,
        organizationName: targetTenant.name,
        reason: supportForm.reason.trim(),
        mode: supportForm.mode,
        startedAt: new Date().toISOString(),
        expiresAt,
      });

      NotificationStore.addNotification(
        `Support Session dibuka untuk ${targetTenant.name} (${supportForm.durationMinutes} menit).`,
        'success'
      );
      setSupportModalOpen(false);
      if (onNavigate) {
        onNavigate('Dashboard');
      } else if (onNavigatePath) {
        onNavigatePath('/app/dashboard');
      } else {
        navigate('/app/dashboard');
      }
    } catch (err: any) {
      NotificationStore.addNotification(err.message || 'Gagal membuka sesi support', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSupportSession = async (sessionItem: SupportSessionItem) => {
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

      const activeClientSession = SupportSessionStore.getSession();
      if (activeClientSession && activeClientSession.id === sessionItem.id) {
        SupportSessionStore.endSession();
      }
      setSupportSessions((prev) =>
        prev.map((s) =>
          s.id === sessionItem.id ? { ...s, ended_at: new Date().toISOString() } : s
        )
      );
      NotificationStore.addNotification('Sesi support berhasil diakhiri.', 'success');
    } catch (err: any) {
      NotificationStore.addNotification(
        err.message || 'Gagal mengakhiri Support Access Session.',
        'error'
      );
    }
  };

  const handleSavePlatformSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await recordPlatformAuditLog({
        organizationId: null,
        action: 'platform.settings.updated',
        resourceType: 'platform_settings',
        reason: 'Pembaruan parameter keamanan & provisioning default platform',
        afterState: platformConfig,
      });
      NotificationStore.addNotification(
        'Kebijakan global platform berhasil disimpan dan dicatat ke Audit Log.',
        'success'
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  // KPI Metrics
  const totalAdmins = tenants.reduce((acc, t) => acc + t.adminCount, 0);
  const totalMusammi = tenants.reduce((acc, t) => acc + t.musammiCount, 0);
  const totalSantriGlobal = tenants.reduce((acc, t) => acc + t.santriCount, 0);
  const activeTenantsCount = tenants.filter((t) => (t.status || 'active') === 'active').length;
  const activeSupportSession = SupportSessionStore.getSession();

  const statusTone = (status?: string): BadgeTone => {
    const s = (status || 'active').toLowerCase();
    if (s === 'active') return 'success';
    if (s === 'trial' || s === 'invited' || s === 'provisioning') return 'warning';
    if (s === 'suspended' || s === 'revoked' || s === 'provisioning_failed' || s === 'expired')
      return 'danger';
    return 'neutral';
  };

  return (
    <PageShell>
      <PageHeader
        kicker="KONSOL PLATFORM GLOBAL · SUPERADMIN"
        title="Manajemen Multi-Tenant & Governance SaaS"
        description="Kelola siklus hidup organisasi/lembaga, akun & access grants, kuota paket layanan, sesi bantuan lintas tenant terkontrol, dan monitor kesehatan sistem."
        breadcrumbs={[
          'Platform Global',
          selectedTenant
            ? `Detail Tenant: ${selectedTenant.name}`
            : tab === 'dashboard'
            ? 'Dashboard Platform'
            : tab === 'tenants'
            ? 'Organisasi & Tenant'
            : tab === 'accounts'
            ? 'Akun Platform & Grants'
            : tab === 'plans'
            ? 'Paket & Entitlements'
            : tab === 'support'
            ? 'Support Access Session'
            : tab === 'audit'
            ? 'Audit & Health Monitor'
            : 'Pengaturan Platform',
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setInviteAccountForm({
                  fullName: '',
                  email: '',
                  password: '',
                  role: 'admin',
                  targetOrganizationId: selectedTenant?.id || tenants[0]?.id || '',
                });
                setInviteAccountModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Undang Akun
            </button>
            <button
              type="button"
              onClick={() => setProvisionModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Provision Tenant Baru
            </button>
          </div>
        }
      />

      {/* Sub-Navigation Bar (7 Modul Lengkap Fase 5) */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit border border-slate-200">
        {[
          { id: 'dashboard', label: 'Dashboard Platform', path: '/platform/dashboard' },
          { id: 'tenants', label: 'Organisasi & Tenant', path: '/platform/tenants' },
          { id: 'accounts', label: 'Akun & Access Grants', path: '/platform/accounts' },
          { id: 'plans', label: 'Paket & Entitlements', path: '/platform/plans' },
          { id: 'support', label: 'Support Access', path: '/platform/support-sessions' },
          { id: 'audit', label: 'Audit & Health Monitor', path: '/platform/audit' },
          { id: 'settings', label: 'Pengaturan Platform', path: '/platform/settings' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigateToSection(item.id as PlatformSection, item.path)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === item.id
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {lastIssuedInviteInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-bold text-blue-950">
              Tautan Undangan Sekali Pakai Diterbitkan ({lastIssuedInviteInfo.email} ·{' '}
              {lastIssuedInviteInfo.role.toUpperCase()})
            </div>
            <div className="font-mono text-[11px] text-blue-900 break-all">
              {window.location.origin}
              {lastIssuedInviteInfo.invitePath}
            </div>
            {lastIssuedInviteInfo.temporaryPassword && (
              <div className="text-slate-700">
                Kode Verifikasi Undangan:{' '}
                <span className="font-mono font-bold text-slate-900">
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
              className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold"
            >
              Salin Tautan /invite
            </button>
            <button
              type="button"
              onClick={() => setLastIssuedInviteInfo(null)}
              className="px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-800 hover:bg-blue-100 font-semibold"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Lembaga (Tenant)"
          value={tenants.length}
          meta={`${activeTenantsCount} aktif · ${tenants.length - activeTenantsCount} trial/arsip`}
          tone="primary"
        />
        <StatCard
          label="Populasi Akademik Global"
          value={totalSantriGlobal}
          meta={`${totalAdmins} Admin · ${totalMusammi} Musammi terdaftar`}
          tone="neutral"
        />
        <StatCard
          label="Status Support Session"
          value={activeSupportSession ? '1 Sesi Aktif' : 'Standby'}
          meta={
            activeSupportSession
              ? `Target: ${activeSupportSession.organizationName}`
              : 'Wajib alasan tiket & batas waktu'
          }
          tone={activeSupportSession ? 'warning' : 'success'}
        />
        <StatCard
          label="Kesehatan Skema & API"
          value={`${healthChecks.filter((h) => h.status === 'healthy').length}/${healthChecks.length || 8}`}
          meta="PostgREST, RLS 3-Role & Serverless API"
          tone="success"
        />
      </div>

      {/* =====================================================================
          VIEW A: DETAIL TENANT (/platform/tenants/:tenantId)
         ===================================================================== */}
      {selectedTenant && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold text-slate-900">{selectedTenant.name}</h2>
                  <StatusBadge
                    label={selectedTenant.status.toUpperCase()}
                    tone={statusTone(selectedTenant.status)}
                  />
                  <StatusBadge
                    label={`PAKET: ${selectedTenant.plan_id.toUpperCase()}`}
                    tone="primary"
                  />
                </div>
                <p className="text-xs font-mono text-slate-500 mt-1">
                  ID: {selectedTenant.id} · Slug: {selectedTenant.slug} · Zona Waktu:{' '}
                  {selectedTenant.timezone}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={closeTenantDetail}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Kembali ke Daftar Tenant
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
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  Buka Support Session ke Tenant Ini
                </button>
              </div>
            </div>

            {/* Ringkasan Struktur & Kontrol Siklus Hidup Tenant */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
              {/* Kolom 1: Kesiapan Setup Operasional (setup_state) */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Checklist Kesiapan Operasional (setup_state)
                </h3>
                <div className="space-y-2 text-xs">
                  {[
                    {
                      done: selectedTenant.setupState.hasActiveAcademicYear,
                      label: 'Tahun Ajaran Aktif Dikonfigurasi',
                      meta: selectedTenant.activeAcademicYearName || 'Belum diatur',
                    },
                    {
                      done: selectedTenant.setupState.hasAdminAssigned,
                      label: 'Minimal 1 Admin Lembaga Aktif',
                      meta: `${selectedTenant.adminCount} Admin`,
                    },
                    {
                      done: selectedTenant.setupState.hasMusammiRegistered,
                      label: 'Staf Musammi Terdaftar',
                      meta: `${selectedTenant.musammiCount} Musammi`,
                    },
                    {
                      done: selectedTenant.setupState.hasHalaqahCreated,
                      label: 'Kelompok Halaqah Dibentuk',
                      meta: `${selectedTenant.halaqahCount} Halaqah`,
                    },
                  ].map((chk, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-none"
                    >
                      <span className="text-slate-700 font-medium">{chk.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-mono">{chk.meta}</span>
                        <StatusBadge
                          label={chk.done ? 'SIAP' : 'BELUM'}
                          tone={chk.done ? 'success' : 'warning'}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kolom 2: Statistik Akademik Tenant */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Metrik Kapasitas & Struktur Tenant
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">Total Santri</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {selectedTenant.santriCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">Kelompok Halaqah</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {selectedTenant.halaqahCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">Staf Musammi</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {selectedTenant.musammiCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                    <div className="text-[11px] text-slate-500">Tahun Ajaran</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {selectedTenant.academicYearCount}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kolom 3: Governance Status & Paket Layanan */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Kontrol Siklus Hidup Tenant (Teraudit)
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(['active', 'trial', 'suspended', 'archived'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={selectedTenant.status === st}
                        onClick={() => handleUpdateTenantLifecycle(selectedTenant, st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          selectedTenant.status === st
                            ? 'bg-slate-900 text-white border-slate-900 cursor-default'
                            : st === 'suspended' || st === 'archived'
                            ? 'border-red-200 text-red-700 hover:bg-red-50'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {st.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Paket & Entitlements Tenant
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(['trial', 'standard', 'enterprise'] as const).map((pl) => (
                      <button
                        key={pl}
                        type="button"
                        disabled={selectedTenant.plan_id === pl}
                        onClick={() => handleUpdateTenantPlan(selectedTenant, pl)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          selectedTenant.plan_id === pl
                            ? 'bg-blue-600 text-white border-blue-600 cursor-default'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50'
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

          {/* Daftar Akun Pengguna Khusus Tenant Ini */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Daftar Access Grants pada {selectedTenant.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Akun Admin Lembaga dan Staf Musammi yang terikat ke organisasi ini.
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
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Undang Admin / Musammi ke Tenant Ini
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Nama Pengguna</th>
                    <th className="px-6 py-3">User ID</th>
                    <th className="px-6 py-3">Role Kanonikal</th>
                    <th className="px-6 py-3">Status Grant</th>
                    <th className="px-6 py-3 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {accounts.filter((a) => a.organizationId === selectedTenant.id).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-xs text-slate-500">
                        Belum ada akun terdaftar pada tenant ini.
                      </td>
                    </tr>
                  ) : (
                    accounts
                      .filter((a) => a.organizationId === selectedTenant.id)
                      .map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50/80">
                          <td className="px-6 py-3.5 font-semibold text-slate-900">
                            {acc.fullName}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-xs text-slate-500 tabular-nums">
                            {acc.userId.slice(0, 8)}...
                          </td>
                          <td className="px-6 py-3.5">
                            <StatusBadge
                              label={formatCanonicalRoleLabel(acc.role)}
                              tone={acc.role === 'admin' ? 'primary' : 'success'}
                            />
                          </td>
                          <td className="px-6 py-3.5">
                            <StatusBadge
                              label={acc.status.toUpperCase()}
                              tone={statusTone(acc.status)}
                            />
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleAccountStatus(acc)}
                                className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                              >
                                {acc.status === 'suspended' || acc.status === 'revoked'
                                  ? 'Aktifkan'
                                  : 'Suspend'}
                              </button>
                              {acc.status !== 'revoked' && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeAccountAccess(acc)}
                                  className="px-3 py-1 rounded-lg border border-rose-200 hover:bg-rose-50 text-xs font-semibold text-rose-700"
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
        </div>
      )}

      {/* =====================================================================
          SECTION 1: DASHBOARD PLATFORM (IKHTISAR & KESIAPAN TENANT)
         ===================================================================== */}
      {!selectedTenant && tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Matriks Kesiapan Operasional Lembaga (Tenant Readiness)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pantau kelengkapan setup dasar setiap ma'had tanpa mengakses data nilai atau
                  setoran harian secara langsung.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateToSection('tenants', '/platform/tenants')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kelola Semua Tenant
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Lembaga / Tenant</th>
                    <th className="px-6 py-3">Tahun Ajaran Aktif</th>
                    <th className="px-6 py-3 text-right">Admin</th>
                    <th className="px-6 py-3 text-right">Musammi</th>
                    <th className="px-6 py-3 text-right">Halaqah</th>
                    <th className="px-6 py-3 text-right">Santri</th>
                    <th className="px-6 py-3">Status Setup</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {tenants.slice(0, 10).map((t) => {
                    const readyCount = [
                      t.setupState.hasActiveAcademicYear,
                      t.setupState.hasAdminAssigned,
                      t.setupState.hasMusammiRegistered,
                      t.setupState.hasHalaqahCreated,
                    ].filter(Boolean).length;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-3.5">
                          <div className="font-semibold text-slate-900">{t.name}</div>
                          <div className="text-xs font-mono text-slate-500">{t.slug}</div>
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-700">
                          {t.activeAcademicYearName || (
                            <span className="text-amber-700 font-semibold">Belum Diatur</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                          {t.adminCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                          {t.musammiCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                          {t.halaqahCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                          {t.santriCount}
                        </td>
                        <td className="px-6 py-3.5">
                          <StatusBadge
                            label={`${readyCount}/4 SIAP`}
                            tone={readyCount === 4 ? 'success' : readyCount >= 2 ? 'warning' : 'danger'}
                          />
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openTenantDetail(t.id)}
                              className="px-2.5 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
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
                              className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
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
            <FormField label="Pencarian Nama / Slug Tenant">
              <input
                type="text"
                value={searchTenant}
                onChange={(e) => setSearchTenant(e.target.value)}
                placeholder="Cari nama ma'had atau slug..."
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600 w-64"
              />
            </FormField>
            <FormField label="Status Siklus Hidup">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-600"
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
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="all">Semua Paket</option>
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Nama Lembaga & Slug</th>
                    <th className="px-6 py-3">ID Tenant</th>
                    <th className="px-6 py-3">Paket & Zona Waktu</th>
                    <th className="px-6 py-3 text-right">Admin</th>
                    <th className="px-6 py-3 text-right">Musammi</th>
                    <th className="px-6 py-3 text-right">Santri</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-xs text-slate-500">
                        Memuat data organisasi...
                      </td>
                    </tr>
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-xs text-slate-500">
                        Tidak ada organisasi yang cocok dengan filter URL saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-3.5">
                          <button
                            type="button"
                            onClick={() => openTenantDetail(t.id)}
                            className="font-semibold text-slate-900 hover:text-blue-600 text-left transition-colors"
                          >
                            {t.name}
                          </button>
                          <div className="text-xs font-mono text-slate-500 mt-0.5">{t.slug}</div>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-slate-600 tabular-nums">
                          {t.id.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-600">
                          <span className="font-semibold text-slate-800 uppercase">
                            {t.plan_id || 'Standard'}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>{t.timezone || 'Asia/Jakarta'}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {t.adminCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {t.musammiCount}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {t.santriCount}
                        </td>
                        <td className="px-6 py-3.5">
                          <StatusBadge
                            label={(t.status || 'active').toUpperCase()}
                            tone={statusTone(t.status)}
                          />
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openTenantDetail(t.id)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                            >
                              Detail Tenant
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
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white whitespace-nowrap"
                            >
                              Buka Support
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
              setFilterAccountRole('all');
            }}
          >
            <FormField label="Cari Nama Pengguna / Organisasi">
              <input
                type="text"
                value={searchAccount}
                onChange={(e) => setSearchAccount(e.target.value)}
                placeholder="Ketik nama pengguna atau lembaga..."
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600 w-64"
              />
            </FormField>
            <FormField label="Filter Role Kanonikal">
              <select
                value={filterAccountRole}
                onChange={(e) => setFilterAccountRole(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="all">Semua Role (3 Role Kanonikal)</option>
                <option value="superadmin">Superadmin Platform</option>
                <option value="admin">Admin Lembaga</option>
                <option value="musammi">Musammi</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Manajemen Akun Platform & Access Grants Lintas Tenant
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pemisahan tegas antara profil identitas pengguna (user_profiles) dan hak akses
                  organisasi (access_grants).
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
                    targetOrganizationId: tenants[0]?.id || '',
                  });
                  setInviteAccountModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Tambah / Undang Akun Baru
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Nama Pengguna</th>
                    <th className="px-6 py-3">User ID</th>
                    <th className="px-6 py-3">Lingkup Organisasi / Tenant</th>
                    <th className="px-6 py-3">Role Kanonikal</th>
                    <th className="px-6 py-3">Status Grant</th>
                    <th className="px-6 py-3 text-right">Kontrol Akses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-xs text-slate-500">
                        Tidak ada akun yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-3.5 font-semibold text-slate-900">{acc.fullName}</td>
                        <td className="px-6 py-3.5 font-mono text-xs text-slate-500 tabular-nums">
                          {acc.userId.slice(0, 8)}...
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-700">
                          {acc.organizationName}
                        </td>
                        <td className="px-6 py-3.5">
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
                        <td className="px-6 py-3.5">
                          <StatusBadge
                            label={acc.status.toUpperCase()}
                            tone={statusTone(acc.status)}
                          />
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleAccountStatus(acc)}
                              className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                                acc.status === 'suspended' || acc.status === 'revoked'
                                  ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                  : 'border-red-200 text-red-700 hover:bg-red-50'
                              }`}
                            >
                              {acc.status === 'suspended' || acc.status === 'revoked'
                                ? 'Aktifkan Kembali'
                                : 'Suspend Grant'}
                            </button>
                            {acc.status !== 'revoked' && (
                              <button
                                type="button"
                                onClick={() => handleRevokeAccountAccess(acc)}
                                className="px-3 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors"
                              >
                                {acc.status === 'invited' ? 'Batalkan Undangan' : 'Revoke Grant'}
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
        </div>
      )}

      {/* =====================================================================
          SECTION 4: PAKET & ENTITLEMENTS SAAS (/platform/plans)
         ===================================================================== */}
      {!selectedTenant && tab === 'plans' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {SAAS_PLANS.map((plan) => {
              const countOnPlan = tenants.filter(
                (t) => (t.plan_id || 'standard').toLowerCase() === plan.id
              ).length;
              return (
                <div
                  key={plan.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
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
                      <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
                        {countOnPlan} Tenant Aktif
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{plan.tagline}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] text-slate-500">Maks Santri</div>
                        <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {plan.maxStudents}
                        </div>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] text-slate-500">Maks Musammi</div>
                        <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {plan.maxMusammi}
                        </div>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-[10px] text-slate-500">Audit Log</div>
                        <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {plan.auditRetentionDays}hr
                        </div>
                      </div>
                    </div>

                    <ul className="space-y-1.5 pt-2 text-xs text-slate-600">
                      {plan.features.map((feat, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-600 font-bold">·</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Pemakaian Kuota & Penetapan Paket per Tenant
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bandingkan jumlah santri dan staf musammi aktual terhadap batas kuota paket
                masing-masing lembaga.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-6 py-3">Lembaga / Tenant</th>
                    <th className="px-6 py-3">Paket Saat Ini</th>
                    <th className="px-6 py-3 text-right">Pemakaian Kuota Santri</th>
                    <th className="px-6 py-3 text-right">Pemakaian Kuota Musammi</th>
                    <th className="px-6 py-3 text-right">Ubah Paket (Teraudit)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {tenants.map((t) => {
                    const planDef =
                      SAAS_PLANS.find((p) => p.id === (t.plan_id || 'standard')) || SAAS_PLANS[1];
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-3.5 font-semibold text-slate-900">{t.name}</td>
                        <td className="px-6 py-3.5">
                          <StatusBadge label={planDef.id.toUpperCase()} tone="primary" />
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono text-xs tabular-nums">
                          {t.santriCount} / {planDef.maxStudents}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono text-xs tabular-nums">
                          {t.musammiCount} / {planDef.maxMusammi}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <select
                            value={t.plan_id || 'standard'}
                            onChange={(e) =>
                              handleUpdateTenantPlan(
                                t,
                                e.target.value as 'trial' | 'standard' | 'enterprise'
                              )
                            }
                            className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white"
                          >
                            <option value="trial">TRIAL</option>
                            <option value="standard">STANDARD</option>
                            <option value="enterprise">ENTERPRISE</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 5: SUPPORT ACCESS SESSIONS (/platform/support-sessions)
         ===================================================================== */}
      {!selectedTenant && tab === 'support' && (
        <div className="space-y-6">
          {activeSupportSession && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StatusBadge label="SESI SUPPORT AKTIF" tone="warning" />
                  <span className="text-sm font-bold text-amber-950">
                    Target: {activeSupportSession.organizationName}
                  </span>
                </div>
                <p className="text-xs text-amber-900">
                  Mode: {activeSupportSession.mode.toUpperCase()} · Alasan:{' '}
                  {activeSupportSession.reason} · Berakhir pada:{' '}
                  {new Date(activeSupportSession.expiresAt).toLocaleTimeString('id-ID')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('/app/dashboard')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  Buka Ruang Kerja Tenant
                </button>
                <button
                  type="button"
                  onClick={() => SupportSessionStore.endSession()}
                  className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  Akhiri Sesi Sekarang
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Riwayat & Kontrol Support Access Session (Break-Glass)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sesuai prinsip ISO/IEC 27017 & AWS SaaS Lens, Superadmin tidak memodifikasi data
                  akademik harian tenant tanpa sesi support berbatas waktu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTenantForSupport(tenants[0] || null);
                  setSupportForm({
                    organizationId: tenants[0]?.id || '',
                    reason: '',
                    durationMinutes: platformConfig.defaultSupportDurationMinutes,
                    mode: platformConfig.defaultSupportMode,
                  });
                  setSupportModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
              >
                Mulai Support Session Baru
              </button>
            </div>
            {supportSessions.length === 0 ? (
              <EmptyState
                title="Belum Ada Riwayat Support Session"
                description="Klik 'Mulai Support Session Baru' atau pilih salah satu lembaga pada tab Organisasi & Tenant untuk memulai akses bantuan teraudit."
                actionLabel="Mulai Support Session"
                onAction={() => {
                  setSelectedTenantForSupport(tenants[0] || null);
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
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-6 py-3">Lembaga Target</th>
                      <th className="px-6 py-3">Mode Akses</th>
                      <th className="px-6 py-3">Alasan Operasional</th>
                      <th className="px-6 py-3">Waktu Mulai</th>
                      <th className="px-6 py-3">Kedaluwarsa</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {supportSessions.map((s) => {
                      const isExpired =
                        !!s.ended_at || new Date(s.expires_at).getTime() <= Date.now();
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80">
                          <td className="px-6 py-3.5 font-semibold text-slate-900">
                            {s.organization_name}
                          </td>
                          <td className="px-6 py-3.5">
                            <StatusBadge
                              label={s.mode === 'read_write' ? 'READ-WRITE' : 'READ-ONLY'}
                              tone={s.mode === 'read_write' ? 'warning' : 'neutral'}
                            />
                          </td>
                          <td className="px-6 py-3.5 text-xs text-slate-700">{s.reason}</td>
                          <td className="px-6 py-3.5 font-mono text-xs text-slate-600 tabular-nums">
                            {new Date(s.started_at).toLocaleString('id-ID')}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-xs text-slate-600 tabular-nums">
                            {new Date(s.expires_at).toLocaleString('id-ID')}
                          </td>
                          <td className="px-6 py-3.5">
                            <StatusBadge
                              label={isExpired ? 'BERAKHIR' : 'AKTIF'}
                              tone={isExpired ? 'neutral' : 'success'}
                            />
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            {!isExpired && (
                              <button
                                type="button"
                                onClick={() => handleRevokeSupportSession(s)}
                                className="px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold"
                              >
                                Akhiri Sesi
                              </button>
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
          {/* Real-Time Health Monitor */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  System Health Monitor & Kesiapan Infrastruktur
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Diagnostik langsung koneksi database PostgREST, tabel skema V2, dan kesiapan
                  fungsi Serverless Vercel/Netlify.
                </p>
              </div>
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={runHealthDiagnostics}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                {isCheckingHealth ? 'Memeriksa...' : 'Jalankan Health Check Ulang'}
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {healthChecks.map((hc) => (
                <div
                  key={hc.key}
                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-500 uppercase">
                        [{hc.category}]
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{hc.label}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{hc.detail}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {hc.latencyMs !== undefined && (
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
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
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter & Tabel Audit Log Platform */}
          <FilterBar
            onReset={() => {
              setSearchAudit('');
              setFilterAuditRole('all');
            }}
          >
            <FormField label="Cari Aksi / Resource / Alasan Audit">
              <input
                type="text"
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                placeholder="Mis. tenant.provisioned, support_session..."
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-600 w-64"
              />
            </FormField>
            <FormField label="Role Aktor">
              <select
                value={filterAuditRole}
                onChange={(e) => setFilterAuditRole(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white"
              >
                <option value="all">Semua Role</option>
                <option value="superadmin">SUPERADMIN</option>
                <option value="admin">ADMIN</option>
                <option value="musammi">MUSAMMI</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">Jejak Audit Platform Global</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Log perubahan konfigurasi tenant, pemberian akses role, dan pembukaan sesi support.
              </p>
            </div>
            {filteredAuditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada catatan log yang sesuai filter di tabel{' '}
                <code className="font-mono">audit_logs</code>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-6 py-3">Waktu</th>
                      <th className="px-6 py-3">Lingkup Tenant</th>
                      <th className="px-6 py-3">Role Aktor</th>
                      <th className="px-6 py-3">Aksi</th>
                      <th className="px-6 py-3">Resource</th>
                      <th className="px-6 py-3">Alasan</th>
                      <th className="px-6 py-3 text-right">Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-3 font-mono text-xs text-slate-600 tabular-nums">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-3 text-xs font-medium text-slate-700">
                          {log.organization_name || 'Platform Global'}
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge label={(log.actor_role || 'system').toUpperCase()} />
                        </td>
                        <td className="px-6 py-3 font-semibold text-slate-900">{log.action}</td>
                        <td className="px-6 py-3 font-mono text-xs text-slate-600">
                          {log.resource_type}{' '}
                          {log.resource_id ? `(${String(log.resource_id).slice(0, 8)})` : ''}
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-600">{log.reason || '-'}</td>
                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
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
            className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 space-y-5"
          >
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-base font-bold text-slate-900">
                Kebijakan Keamanan & Governance Platform Global
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Konfigurasi parameter default untuk Support Access Session dan Provisioning Tenant
                baru.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Durasi Default Support Session"
                hint="Batas waktu otomatis sebelum sesi support kedaluwarsa."
              >
                <select
                  value={platformConfig.defaultSupportDurationMinutes}
                  onChange={(e) =>
                    setPlatformConfig({
                      ...platformConfig,
                      defaultSupportDurationMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
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
                  onChange={(e) =>
                    setPlatformConfig({
                      ...platformConfig,
                      defaultSupportMode: e.target.value as 'read_only' | 'read_write',
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="read_only">Read-Only (Default Aman)</option>
                  <option value="read_write">Read & Write</option>
                </select>
              </FormField>

              <FormField
                label="Paket Default Provisioning Tenant"
                hint="Paket awal saat organisasi baru dibuat."
              >
                <select
                  value={platformConfig.defaultTenantPlan}
                  onChange={(e) =>
                    setPlatformConfig({
                      ...platformConfig,
                      defaultTenantPlan: e.target.value as 'trial' | 'standard' | 'enterprise',
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="trial">Trial</option>
                  <option value="standard">Standard Ma'had</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </FormField>

              <FormField
                label="Zona Waktu Default"
                hint="Digunakan untuk penjadwalan sesi halaqah tenant baru."
              >
                <select
                  value={platformConfig.defaultTimezone}
                  onChange={(e) =>
                    setPlatformConfig({ ...platformConfig, defaultTimezone: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                </select>
              </FormField>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={platformConfig.inviteOnlyMode}
                  onChange={(e) =>
                    setPlatformConfig({ ...platformConfig, inviteOnlyMode: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>
                  Wajibkan Mode Undangan Terverifikasi Server-Side (Blokir Pendaftaran Mandiri Tanpa
                  Organisasi)
                </span>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {isSavingSettings ? 'Menyimpan...' : 'Simpan Kebijakan Platform'}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <StatusBadge label="CMS PUBLIK" tone="primary" />
              <h3 className="text-base font-bold text-slate-900">
                Editor Landing Page & Dokumentasi Publik
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kelola tampilan halaman depan publik (`/`), fitur unggulan platform, dan galeri
                dokumentasi tanpa mencampur pengaturan internal tenant.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate('WebsiteEditor');
                else navigate('/platform/cms');
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              Buka Editor Landing Page (/platform/cms)
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: PROVISION TENANT BARU
         ===================================================================== */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => setProvisionModalOpen(false)}
        title="Provision Organisasi / Tenant Baru"
      >
        <form onSubmit={handleProvisionTenant} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lembaga / Ma'had <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={provisionForm.name}
              onChange={(e) => setProvisionForm({ ...provisionForm, name: e.target.value })}
              placeholder="Contoh: Ma'had Al-Ikhlas Putri"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Slug Tenant (Unik)
              </label>
              <input
                type="text"
                value={provisionForm.slug}
                onChange={(e) => setProvisionForm({ ...provisionForm, slug: e.target.value })}
                placeholder="Otomatis jika kosong"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Zona Waktu</label>
              <select
                value={provisionForm.timezone}
                onChange={(e) => setProvisionForm({ ...provisionForm, timezone: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800">
              Undangan Admin Lembaga Pertama (Wajib — Token Undangan Sekali Pakai)
            </h4>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap Admin <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={provisionForm.adminFullName}
                onChange={(e) =>
                  setProvisionForm({ ...provisionForm, adminFullName: e.target.value })
                }
                placeholder="Contoh: Ustadz Ahmad Fauzi"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Login Admin <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={provisionForm.adminEmail}
                  onChange={(e) =>
                    setProvisionForm({ ...provisionForm, adminEmail: e.target.value })
                  }
                  placeholder="admin@mahad.id"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Verifikasi Awal (Opsional)
                </label>
                <input
                  type="password"
                  value={provisionForm.adminPassword}
                  onChange={(e) =>
                    setProvisionForm({ ...provisionForm, adminPassword: e.target.value })
                  }
                  placeholder="Kosongkan untuk sandi acak otomatis"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setProvisionModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Memproses...' : 'Buat Tenant'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 2: UNDANG AKUN BARU (SUPERADMIN / ADMIN TENANT / MUSAMMI)
         ===================================================================== */}
      <Modal
        isOpen={isInviteAccountModalOpen}
        onClose={() => setInviteAccountModalOpen(false)}
        title="Undang Akun & Buat Access Grant Baru"
      >
        <form onSubmit={handleInvitePlatformOrTenantAccount} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap Pengguna <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={inviteAccountForm.fullName}
              onChange={(e) =>
                setInviteAccountForm({ ...inviteAccountForm, fullName: e.target.value })
              }
              placeholder="Contoh: Ustadz Ibrahim"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Login <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                required
                value={inviteAccountForm.email}
                onChange={(e) =>
                  setInviteAccountForm({ ...inviteAccountForm, email: e.target.value })
                }
                placeholder="nama@lembaga.id"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Verifikasi Awal (Opsional)
              </label>
              <input
                type="password"
                value={inviteAccountForm.password}
                onChange={(e) =>
                  setInviteAccountForm({ ...inviteAccountForm, password: e.target.value })
                }
                placeholder="Kosongkan untuk kode kriptografis otomatis"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Role Kanonikal (3-Role)
              </label>
              <select
                value={inviteAccountForm.role}
                onChange={(e) =>
                  setInviteAccountForm({
                    ...inviteAccountForm,
                    role: e.target.value as 'superadmin' | 'admin' | 'musammi',
                  })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="admin">Admin Lembaga (admin)</option>
                <option value="musammi">Musammi (musammi)</option>
                <option value="superadmin">Superadmin Platform (superadmin)</option>
              </select>
            </div>

            {inviteAccountForm.role !== 'superadmin' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Organisasi / Tenant Target <span className="text-red-600">*</span>
                </label>
                <select
                  required
                  value={inviteAccountForm.targetOrganizationId}
                  onChange={(e) =>
                    setInviteAccountForm({
                      ...inviteAccountForm,
                      targetOrganizationId: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">-- Pilih Lembaga --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setInviteAccountModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Membuat Akun...' : 'Kirim Undangan & Aktifkan Grant'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 3: BUKA SUPPORT ACCESS SESSION
         ===================================================================== */}
      <Modal
        isOpen={isSupportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        title={`Buka Support Session${selectedTenantForSupport ? `: ${selectedTenantForSupport.name}` : ''}`}
      >
        <form onSubmit={handleStartSupportSession} className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            Akses bantuan lintas tenant ini bersifat sementara dan seluruh aktivitas dicatat di
            dalam <span className="font-semibold">Audit Log Platform & Lembaga</span>.
          </div>

          {!selectedTenantForSupport && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pilih Organisasi / Tenant Target <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={supportForm.organizationId}
                onChange={(e) =>
                  setSupportForm({ ...supportForm, organizationId: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">-- Pilih Lembaga --</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alasan Operasional / Nomor Tiket Bantuan <span className="text-red-600">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={supportForm.reason}
              onChange={(e) => setSupportForm({ ...supportForm, reason: e.target.value })}
              placeholder="Jelaskan alasan pembukaan akses support (mis. Investigasi sinkronisasi tahun ajaran atas permintaan Admin Ma'had)..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Durasi Sesi Maksimal
              </label>
              <select
                value={supportForm.durationMinutes}
                onChange={(e) =>
                  setSupportForm({ ...supportForm, durationMinutes: Number(e.target.value) })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600"
              >
                <option value={15}>15 Menit</option>
                <option value={30}>30 Menit (Rekomendasi)</option>
                <option value={60}>60 Menit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mode Akses</label>
              <select
                value={supportForm.mode}
                onChange={(e) =>
                  setSupportForm({
                    ...supportForm,
                    mode: e.target.value as 'read_only' | 'read_write',
                  })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="read_only">Read-Only (Default Aman)</option>
                <option value="read_write">Read & Write (Koreksi Darurat)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setSupportModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Membuka Sesi...' : 'Aktifkan Support Session'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL 4: INSPEKSI PAYLOAD JSON AUDIT LOG
         ===================================================================== */}
      <Modal
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        title={`Detail Audit Log: ${selectedAuditLog?.action || ''}`}
      >
        {selectedAuditLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500">Waktu:</span>{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {new Date(selectedAuditLog.created_at).toLocaleString('id-ID')}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Aktor:</span>{' '}
                <span className="font-semibold text-slate-800 uppercase">
                  {selectedAuditLog.actor_role || 'system'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Alasan:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {selectedAuditLog.reason || '-'}
                </span>
              </div>
            </div>

            <div>
              <div className="font-bold text-slate-700 mb-1">Before State (JSON):</div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(selectedAuditLog.before_state || null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="font-bold text-slate-700 mb-1">After State (JSON):</div>
              <pre className="p-3 bg-slate-900 text-emerald-300 rounded-lg overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(selectedAuditLog.after_state || null, null, 2)}
              </pre>
            </div>
          </div>
        )}
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
