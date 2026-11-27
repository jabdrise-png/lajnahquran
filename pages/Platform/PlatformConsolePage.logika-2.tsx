// Dipisah dari PlatformConsolePage.logika.tsx (Fase 8 bagian 2): paruh awal usePlatformConsolePageLogika.
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
import { usePlatformConsolePageLogikaBagian2Bagian1 } from './PlatformConsolePage.logika-1';

export function usePlatformConsolePageLogikaBagian2(__props: PlatformConsolePageProps) {
  const {
  activeTab,
  activeSection,
  onNavigate,
  onNavigatePath,
} = __props;
  const __bagian1 = usePlatformConsolePageLogikaBagian2Bagian1(__props);
  const { params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData } = __bagian1;

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
        { name: 'access_grants', label: 'Tabel Otorisasi 3-Peran ' },
        { name: 'support_access_sessions', label: 'Tabel Break-Glass ' },
        { name: 'audit_logs', label: 'Tabel Jejak Audit ' },
        { name: 'recitation_entries', label: 'Ledger Setoran V2 (recitation_entries)' },
        { name: 'report_cards', label: 'Tabel Arsip Raport ' },
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
          label: 'Disiplin 3 Peran & Otoritas access_grants',
          category: 'Security',
          status: grantsErr ? 'degraded' : 'healthy',
          latencyMs: secMs,
          detail: grantsErr
            ? `Gagal memverifikasi hak akses: ${grantsErr.message}`
            : `Buku besar otorisasi access_grants aktif & terisolasi (${secMs} ms).`,
          checkedAt: new Date().toISOString(),
        });
      } catch (e: any) {
        results.push({
          key: 'sec_3role',
          label: 'Disiplin 3 Peran & Otoritas access_grants',
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
            label: 'Server API (/api/health)',
            category: 'Serverless API',
            status: body.status === 'healthy' ? 'healthy' : 'degraded',
            latencyMs: apiMs,
            detail: `Probe HTTP ${res.status} OK (${apiMs} ms) — ${ringkasStatusDb(body)}.`,
            checkedAt: new Date().toISOString(),
          });
        } else {
          results.push({
            key: 'serverless_adapter',
            label: 'Server API (/api/health)',
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
          label: 'Server API (/api/health)',
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
        `Lembaga "${createdOrg.name}" berstatus DISIAPKAN dan undangan Admin telah diterbitkan. Lembaga akan otomatis AKTIF setelah Admin mengonfirmasi undangan di /invite.`,
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
  return { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant };
}
