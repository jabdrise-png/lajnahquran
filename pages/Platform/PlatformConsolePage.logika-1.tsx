// Dipisah dari PlatformConsolePage.logika-2.tsx (Fase 8 bagian 2): paruh awal usePlatformConsolePageLogikaBagian2.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { cekAlasan } from '../../lib/pesanError';
import { ringkasStatusDb } from '../../lib/aksesPengguna';
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
import BisnisPanel from './BisnisPanel';
import { PlatformSection, TenantSetupState, TenantItem, AccountGrantSummary, AccountInvitationSummary, PlatformAccountItem, SupportSessionItem, AuditLogItem, HealthCheckResult, SaaSPlanDefinition, SAAS_PLANS, SensitiveKeyPattern, sanitizeAuditPayload, PlatformConsolePageProps } from './PlatformConsolePage.logika';

export function usePlatformConsolePageLogikaBagian2Bagian1({
  activeTab,
  activeSection,
  onNavigate,
  onNavigatePath,
}: PlatformConsolePageProps) {
  const params = useParams<{ tenantId?: string }>();
  const navigate = useNavigate();

  const resolvedInitialTab: PlatformSection = activeTab || activeSection || 'dashboard';
  const [tab, setTab] = useState<PlatformSection>(resolvedInitialTab);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(params.tenantId || null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyUserId(data?.session?.user?.id || null));
  }, []);

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
  // Fase 8: paket dari tabel platform_plans (diatur di tab Bisnis)
  const [paketDb, setPaketDb] = useState<Array<{ id: string; nama: string; batas_santri: number | null; aktif: boolean }>>([]);
  useEffect(() => {
    (supabase as any).from('platform_plans').select('id,nama,batas_santri,aktif').order('urutan')
      .then(({ data }: any) => setPaketDb(data || []));
  }, []);
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
      // BUG-03: angka santri/musammi'/halaqah diambil dari RPC agregat superadmin
      // (rpc_platform_tenant_stats) karena RLS tabel tenant memblokir superadmin
      // di luar Support Access. Bila RPC belum dimigrasikan, kembali ke cara lama.
      const [{ data: orgs }, { data: profiles }, statsRes] = await Promise.all([
        supabase.from('organizations').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        (supabase as any).rpc('rpc_platform_tenant_stats'),
      ]);

      const statsMap = new Map<string, any>();
      let santriList: any[] = [];
      let musammiList: any[] = [];
      let halaqahList: any[] = [];
      let ayList: any[] = [];

      if (!statsRes?.error && Array.isArray(statsRes?.data)) {
        statsRes.data.forEach((row) => statsMap.set(row.organization_id, row));
      } else {
        const [{ data: santriRows }, { data: musammiRows }, { data: halaqahRows }, { data: ayRows }] =
          await Promise.all([
            supabase.from('santri').select('id, organization_id'),
            supabase.from('musammi').select('id, organization_id'),
            supabase.from('halaqah').select('id, organization_id'),
            supabase.from('academic_years').select('id, organization_id, name, is_active'),
          ]);
        santriList = santriRows || [];
        musammiList = musammiRows || [];
        halaqahList = halaqahRows || [];
        ayList = ayRows || [];
      }

      const profileList = profiles || [];

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
        const orgProfiles = profileList.filter((p) => p.organization_id === o.id);
        const orgGrants = grantsList.filter(
          (g) => g.organization_id === o.id && g.status === 'active'
        );

        const adminCount =
          orgGrants.length > 0
            ? orgGrants.filter((g) => g.role === 'admin').length
            : orgProfiles.filter((p) =>
                ['admin', 'admin_mahad'].includes((p.role || '').toLowerCase())
              ).length;

        const musammiProfileCount =
          orgGrants.length > 0
            ? orgGrants.filter((g) => g.role === 'musammi').length
            : orgProfiles.filter((p) =>
                ['musammi', 'pengajar'].includes((p.role || '').toLowerCase())
              ).length;

        const stats = statsMap.get(o.id);
        const orgMusammiMasterCount = stats
          ? Number(stats.musammi_total || 0)
          : musammiList.filter((m) => m.organization_id === o.id).length;
        const musammiCount = Math.max(musammiProfileCount, orgMusammiMasterCount);

        const santriCount = stats
          ? Number(stats.santri_active || 0)
          : santriList.filter((s) => s.organization_id === o.id).length;
        const halaqahCount = stats
          ? Number(stats.halaqah_active || 0)
          : halaqahList.filter((h) => h.organization_id === o.id).length;
        const orgAys = stats ? [] : ayList.filter((ay) => ay.organization_id === o.id);
        const activeAy: { name?: string } | undefined = stats
          ? stats.active_academic_year_id
            ? { name: stats.active_academic_year_name }
            : undefined
          : orgAys.find((ay) => ay.is_active);
        const academicYearCount = stats ? Number(stats.academic_year_count || 0) : orgAys.length;

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
          academicYearCount,
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
      userProfilesList.forEach((up) => {
        if (up.user_id && up.email) emailMap.set(up.user_id, up.email);
      });
      invitationsList.forEach((inv) => {
        if (inv.user_id && inv.email && !emailMap.has(inv.user_id)) {
          emailMap.set(inv.user_id, inv.email);
        }
      });

      const mappedAccounts: PlatformAccountItem[] = profileList.map((p: any) => {
        const userGrants = grantsList.filter((g) => g.user_id === p.id);
        const matchingGrant =
          userGrants.find((g) => g.organization_id && g.organization_id === p.organization_id) ||
          userGrants.find((g) => normalizeRole(g.role) === 'superadmin') ||
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
            ? userGrants.map((g) => {
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
            (inv) =>
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
            sData.map((s) => ({
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
          const mappedLogs: AuditLogItem[] = aData.map((a) => ({
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
  return { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData };
}
