// Dipecah otomatis dari PlatformConsolePage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen PlatformConsolePage.
// Ubah perilaku di sini; tampilan ada di PlatformConsolePage.tsx dan PlatformConsolePage.bagian.tsx.
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
import { usePlatformConsolePageLogikaBagian2 } from './PlatformConsolePage.logika-2';
import { SAAS_PLANS, SensitiveKeyPattern, sanitizeAuditPayload, type PlatformSection, type TenantSetupState, type TenantItem, type AccountGrantSummary, type AccountInvitationSummary, type PlatformAccountItem, type SupportSessionItem, type AuditLogItem, type HealthCheckResult, type SaaSPlanDefinition, type PlatformConsolePageProps } from './PlatformConsolePage.tipe';
export * from './PlatformConsolePage.tipe';

export function usePlatformConsolePageLogika(__props: PlatformConsolePageProps) {
  const {
  activeTab,
  activeSection,
  onNavigate,
  onNavigatePath,
} = __props;
  const __bagian2 = usePlatformConsolePageLogikaBagian2(__props);
  const { params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant } = __bagian2;

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
        ? `Tangguhkan Lembaga: ${tenant.name}`
        : isRestoring
        ? `Pulihkan lembaga: ${tenant.name}`
        : `Ubah Status Lembaga: ${tenant.name}`,
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
            `Status lembaga "${tenant.name}" diperbarui menjadi ${nextStatus.toUpperCase()}.`,
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

  // BUG-05: akun sendiri tidak boleh di-suspend / di-revoke dari konsol.
  const isOwnAccount = (account: PlatformAccountItem) =>
    Boolean(myUserId) && account.userId === myUserId;

  const handleToggleAccountStatus = (account: PlatformAccountItem) => {
    if (isOwnAccount(account)) {
      NotificationStore.addNotification('Anda tidak dapat menangguhkan akses akun sendiri.', 'error');
      return;
    }
    const isRestoring = account.status === 'suspended' || account.status === 'revoked';
    const nextStatus = isRestoring ? 'active' : 'suspended';
    setConfirmAction({
      isOpen: true,
      title: `${nextStatus === 'suspended' ? 'Tangguhkan (Suspend)' : 'Pulihkan (Restore)'} Akses Akun: ${account.fullName}`,
      description:
        nextStatus === 'suspended'
          ? `Konsekuensi: Hak akses "${account.fullName}" (${formatCanonicalRoleLabel(
              account.role
            )}) pada "${account.organizationName}" akan ditangguhkan sementara (DITANGGUHKAN). Pengguna tidak dapat masuk ke ruang kerja lembaga sampai dipulihkan, namun seluruh histori akademik dan audit tetap utuh.`
          : `Konsekuensi: Hak akses "${account.fullName}" (${formatCanonicalRoleLabel(
              account.role
            )}) pada "${account.organizationName}" akan dipulihkan menjadi AKTIF dan dicatat ke Audit Log Platform.`,
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
    if (isOwnAccount(account)) {
      NotificationStore.addNotification('Anda tidak dapat mencabut akses akun sendiri.', 'error');
      return;
    }
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

    // BUG-08: aturan yang sama ditegakkan server (fn_validate_support_session_reason)
    const minChars = Math.max(10, platformConfig.minSupportReasonChars || 10);
    const alasanError = cekAlasan(supportForm.reason, minChars, 2);
    if (alasanError) {
      const msg = `${alasanError} Jelaskan keperluan support, contoh: "Bantu admin cek absensi".`;
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
        `Sesi Bantuan (${
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
      title: `Akhiri Sesi Bantuan: ${sessionItem.organization_name || 'Tenant'}`,
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
            'sesi bantuan berhasil diakhiri di database dan tercatat pada Audit Log.',
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
    const dasar = SAAS_PLANS.find((p) => p.id === clean) || SAAS_PLANS[1];
    const db = paketDb.find((p) => p.id === clean);
    // batas santri dari paket di database; 0 = tanpa batas (tidak dihitung sebagai kuota)
    return db ? { ...dasar, id: db.id, name: db.nama, maxStudents: db.batas_santri ?? 0, maxMusammi: 0 } : dasar;
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
        title: `sesi bantuan Aktif: ${activeSupportSession.organizationName}`,
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
          actionLabel: 'Buka pemantau',
          onAction: () => navigateToSection('audit', '/platform/audit'),
        });
      }
    }

    for (const t of tenants) {
      if (t.status === 'provisioning_failed') {
        items.push({
          id: `prov-fail-${t.id}`,
          title: `pembuatan lembaga Gagal: ${t.name}`,
          detail: `Pengiriman undangan Admin awal belum tuntas. Lakukan retry pembuatan lembaga atau undang ulang Admin.`,
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
          actionLabel: 'Detail Lembaga',
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
    ? 'Ringkasan platform'
    : tab === 'tenants'
    ? 'Daftar lembaga'
    : tab === 'accounts'
    ? 'Akun & hak akses'
    : tab === 'plans'
    ? 'Pendaftaran & Langganan'
    : tab === 'support'
    ? 'Sesi bantuan'
    : tab === 'audit'
    ? 'Kesehatan sistem & audit'
    : 'Pengaturan platform';

  const dynamicPageDescription = selectedTenant
    ? `Awasi kesiapan setup operasional, pemakaian kuota paket, anggota tim, dan histori aktivitas untuk ${selectedTenant.name}.`
    : tab === 'dashboard'
    ? 'Pantau kesiapan lembaga, akses lintas lembaga, dan kesehatan sistem dari satu ruang kerja Superadmin.'
    : tab === 'tenants'
    ? 'Kelola pembuatan lembaga lembaga baru, awasi pemakaian kuota paket, dan kendalikan status operasional setiap lembaga secara teraudit.'
    : tab === 'accounts'
    ? 'Kelola identitas dan hak akses semua lembaga tanpa memperluas model otorisasi yang sudah ditetapkan.'
    : tab === 'plans'
    ? 'Setujui pendaftaran lembaga baru, catat pembayaran transfer, dan atur paket (batas santri & harga).'
    : tab === 'support'
    ? 'Setiap sesi bantuan memiliki alasan, scope, batas waktu, dan jejak audit untuk menjaga kepercayaan lembaga.'
    : tab === 'audit'
    ? 'Pisahkan sinyal infrastruktur dari audit tata kelola agar anomali dapat ditindaklanjuti tanpa kehilangan konteks.'
    : 'Atur kebijakan global untuk support, pembuatan lembaga, dan invitation tanpa menyentuh konfigurasi operasional lembaga.';
  return { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription };
}

export type PlatformConsolePageLogika = ReturnType<typeof usePlatformConsolePageLogika>;
