// Dipisah dari PlatformConsolePage.bagian.tsx (Fase 8 bagian 2).
import { labelStatus } from './PlatformConsolePage.tipe';
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
import { usePlatformConsolePageLogika, type PlatformConsolePageLogika, SAAS_PLANS, SensitiveKeyPattern, sanitizeAuditPayload, type PlatformSection, type TenantSetupState, type TenantItem, type AccountGrantSummary, type AccountInvitationSummary, type PlatformAccountItem, type SupportSessionItem, type AuditLogItem, type HealthCheckResult, type SaaSPlanDefinition, type PlatformConsolePageProps } from './PlatformConsolePage.logika';


export const Bagian1: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
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
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold text-slate-900">{selectedTenant.name}</h2>
                    <StatusBadge
                      label={labelStatus(selectedTenant.status)}
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
                  <p className="text-xs font-mono text-slate-500 mt-1.5">
                    ID: {selectedTenant.id} · Slug: {selectedTenant.slug} · Zona Waktu:{' '}
                    {selectedTenant.timezone} · Tahun Ajaran Aktif:{' '}
                    <span className="font-semibold text-slate-900">
                      {selectedTenant.activeAcademicYearName || 'Belum diatur'}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={closeTenantDetail}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    ← Kembali ke Daftar Lembaga
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateTenantLifecycle(
                        selectedTenant,
                        isTenantSuspended ? 'active' : 'suspended'
                      )
                    }
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      isTenantSuspended
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    {isTenantSuspended ? 'Pulihkan lembaga' : 'Tangguhkan lembaga'}
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
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors shadow-2xs"
                  >
                    Buka Sesi Bantuan
                  </button>
                </div>
              </div>

              {/* Ringkasan Struktur, Kuota & Kontrol Siklus Hidup Tenant */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
                {/* Kolom 1: Kesiapan Setup Operasional (setup_state) */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Checklist Kesiapan Setup
                    </h3>
                    <span className="text-xs font-mono font-bold text-blue-600">
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
                        className="flex items-center justify-between py-1.5 border-b border-slate-200/70 last:border-none"
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

                {/* Kolom 2: Pemakaian Kuota & Kapasitas Tenant */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
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
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-2xs">Admin Lembaga</span>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {selectedTenant.adminCount} Akun
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-slate-500 block text-2xs">Tahun Ajaran</span>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {selectedTenant.academicYearCount} Periode
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kolom 3: Governance Status & Paket Layanan */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/50">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Kontrol Siklus Hidup Lembaga (Teraudit)
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
                              ? 'bg-blue-600 text-white border-blue-600 cursor-default'
                              : st === 'suspended' || st === 'archived'
                              ? 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {labelStatus(st)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Paket & Entitlements Lembaga
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
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
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
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Tim Lembaga: Admin & Musammi ({selectedTenant.name})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Daftar hak akses yang terikat langsung ke organisasi ini.
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
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
                  >
                    + Undang Admin / Musammi
                  </button>
                </div>
                <div className="wadah-tabel overflow-x-auto">
                  <table className="tabel">
                    <thead>
                      <tr>
                        <th>Nama Pengguna</th>
                        <th>Peran</th>
                        <th>Status Akses</th>
                        <th className="text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.filter((a) => a.organizationId === selectedTenant.id).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-xs text-slate-500">
                            Belum ada akun Admin atau Musammi terdaftar pada lembaga ini.
                          </td>
                        </tr>
                      ) : (
                        accounts
                          .filter((a) => a.organizationId === selectedTenant.id)
                          .map((acc) => (
                            <tr key={acc.id}>
                              <td>
                                <div className="font-semibold text-slate-900">{acc.fullName}</div>
                                <div className="text-2xs font-mono text-slate-500">
                                  ID: {acc.userId.slice(0, 8)}...
                                </div>
                              </td>
                              <td>
                                <StatusBadge
                                  label={formatCanonicalRoleLabel(acc.role)}
                                  tone={acc.role === 'admin' ? 'primary' : 'success'}
                                />
                              </td>
                              <td>
                                <StatusBadge
                                  label={labelStatus(acc.status)}
                                  tone={statusTone(acc.status)}
                                  dot
                                />
                              </td>
                              <td className="text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    hidden={isOwnAccount(acc)}
                                    onClick={() => handleToggleAccountStatus(acc)}
                                    className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                                  >
                                    {acc.status === 'suspended' || acc.status === 'revoked'
                                      ? 'Aktifkan'
                                      : 'Tangguhkan'}
                                  </button>
                                  {acc.status !== 'revoked' && (
                                    <button
                                      type="button"
                                      hidden={isOwnAccount(acc)}
                                    onClick={() => handleRevokeAccountAccess(acc)}
                                      className="px-3 py-1 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-700"
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
                <div className="p-4 sm:px-5 border-b border-slate-200">
                  <h3 className="text-base font-bold text-slate-900">Aktivitas Terbaru Lembaga</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Jejak audit perubahan status, paket, dan akses pada lembaga ini.
                  </p>
                </div>
                <div className="divide-y divide-slate-200 flex-1">
                  {tenantAuditLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Belum ada rekaman audit log spesifik untuk lembaga ini.
                    </div>
                  ) : (
                    tenantAuditLogs.slice(0, 6).map((log) => (
                      <div key={log.id} className="p-4 space-y-1.5 hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-blue-600 truncate">
                            {log.action}
                          </span>
                          <span className="text-2xs font-mono text-slate-500 shrink-0">
                            {new Date(log.created_at).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 line-clamp-2">
                          {log.reason || `Sumber daya: ${log.resource_type}`}
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-2xs text-slate-500 uppercase font-semibold">
                            Aktor: {log.actor_role || 'superadmin'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="text-2xs font-semibold text-blue-600 hover:underline"
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
    </>
  );
};

export const Bagian2: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      {!selectedTenant && tab === 'dashboard' && (
        <div className="space-y-6">
          {/* 1A. Kesiapan Operasional Tenant */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 sm:px-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Kesiapan Operasional Lembaga
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Indikator kelengkapan setup nyata (Tahun Ajaran Aktif, Admin, Musammi, dan Halaqah)
                  untuk setiap organisasi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigateToSection('tenants', '/platform/tenants')}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Kelola Semua Lembaga ({tenants.length})
              </button>
            </div>

            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Memuat data kesiapan lembaga dari database...
              </div>
            ) : tenants.length === 0 ? (
              <EmptyState
                title="Belum Ada Lembaga Terdaftar"
                description="Mulai dengan melakukan pembuatan lembaga pertama beserta akun Admin lembaganya."
                actionLabel="Buat lembaga Pertama"
                onAction={() => setProvisionModalOpen(true)}
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="wadah-tabel hidden md:block overflow-x-auto">
                  <table className="tabel">
                    <thead>
                      <tr>
                        <th>Nama Organisasi</th>
                        <th>Status</th>
                        <th className="text-right">Admin</th>
                        <th className="text-right">Musammi</th>
                        <th className="text-right">Santri</th>
                        <th className="w-56">Readiness (Data Setup)</th>
                        <th className="text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.slice(0, 10).map((t) => {
                        const readyCount = [
                          t.setupState.hasActiveAcademicYear,
                          t.setupState.hasAdminAssigned,
                          t.setupState.hasMusammiRegistered,
                          t.setupState.hasHalaqahCreated,
                        ].filter(Boolean).length;
                        const readyPct = Math.round((readyCount / 4) * 100);
                        return (
                          <tr key={t.id}>
                            <td>
                              <button
                                type="button"
                                onClick={() => openTenantDetail(t.id)}
                                className="font-semibold text-slate-900 hover:text-blue-600 text-left transition-colors"
                              >
                                {t.name}
                              </button>
                              <div className="text-xs font-mono text-slate-500 mt-0.5">
                                {t.slug} ·{' '}
                                {t.activeAcademicYearName ? (
                                  <span className="text-slate-700 font-sans">
                                    TA {t.activeAcademicYearName}
                                  </span>
                                ) : (
                                  <span className="text-amber-700 font-sans font-medium">
                                    Belum ada TA Aktif
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <StatusBadge
                                label={labelStatus((t.status || 'active'))}
                                tone={statusTone(t.status)}
                                dot
                              />
                            </td>
                            <td className="text-right font-mono tabular-nums font-semibold text-slate-900">
                              {t.adminCount}
                            </td>
                            <td className="text-right font-mono tabular-nums font-semibold text-slate-900">
                              {t.musammiCount}
                            </td>
                            <td className="text-right font-mono tabular-nums font-semibold text-slate-900">
                              {t.santriCount}
                            </td>
                            <td>
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
                                  <span className="font-mono font-semibold text-slate-600 tabular-nums">
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
                            <td className="text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openTenantDetail(t.id)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
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
                                  className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold transition-colors"
                                >
                                  Bantuan
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
                <div className="md:hidden divide-y divide-slate-200">
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
                            <div className="font-bold text-slate-900">{t.name}</div>
                            <div className="text-xs font-mono text-slate-500">{t.slug}</div>
                          </div>
                          <StatusBadge
                            label={labelStatus((t.status || 'active'))}
                            tone={statusTone(t.status)}
                            dot
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <div>
                            <div className="text-2xs text-slate-500">Admin</div>
                            <div className="font-mono font-bold text-xs text-slate-900">
                              {t.adminCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-2xs text-slate-500">Musammi</div>
                            <div className="font-mono font-bold text-xs text-slate-900">
                              {t.musammiCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-2xs text-slate-500">Santri</div>
                            <div className="font-mono font-bold text-xs text-slate-900">
                              {t.santriCount}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 font-medium">
                              Readiness: {readyCount}/4 tahap
                            </span>
                            <span className="font-mono font-semibold text-blue-600">
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
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
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
                            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold"
                          >
                            Bantuan
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
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Fokus Hari Ini</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
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
                  <p className="text-xs text-slate-500 text-center py-6">
                    Menganalisis kesiapan sistem...
                  </p>
                ) : focusTodayItems.length === 0 ? (
                  <div className="p-6 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center space-y-1">
                    <div className="text-sm font-bold text-emerald-700">
                      Tidak Ada Peringatan Operasional
                    </div>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      Seluruh lembaga yang terdaftar telah melengkapi setup dasar, kuota dalam batas
                      aman, dan diagnostik sistem berstatus normal.
                    </p>
                  </div>
                ) : (
                  focusTodayItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                          {item.title}
                        </span>
                        <StatusBadge label={item.badgeLabel} tone={item.tone} />
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
                      {item.actionLabel && item.onAction && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={item.onAction}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
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
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Aktivitas Terbaru</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekaman langsung dari tabel audit_logs produksi lintas organisasi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToSection('audit', '/platform/audit')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Lihat Semua Audit Log
                </button>
              </div>

              {loading ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Memuat riwayat aktivitas...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada rekaman aktivitas di tabel audit_logs.
                </div>
              ) : (
                <div className="wadah-tabel overflow-x-auto">
                  <table className="tabel sm:text-sm">
                    <thead>
                      <tr>
                        <th>Waktu</th>
                        <th>Aktor</th>
                        <th>Aktivitas</th>
                        <th>Lembaga</th>
                        <th className="text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.slice(0, 8).map((log) => {
                        const isFailureAction =
                          log.action.includes('failed') ||
                          log.action.includes('revoked') ||
                          log.action.includes('suspended');
                        return (
                          <tr key={log.id}>
                            <td className="font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                              {new Date(log.created_at).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td>
                              <StatusBadge
                                label={labelStatus((log.actor_role || 'superadmin'))}
                                tone="primary"
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setSelectedAuditLog(log)}
                                className="font-mono text-xs font-semibold text-slate-900 hover:text-blue-600 text-left"
                              >
                                {log.action}
                              </button>
                              {log.reason && (
                                <div className="text-2xs text-slate-500 truncate max-w-[220px]">
                                  {log.reason}
                                </div>
                              )}
                            </td>
                            <td className="text-xs font-medium text-slate-700">
                              {log.organization_name || 'Platform Global'}
                            </td>
                            <td className="text-right">
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
    </>
  );
};
