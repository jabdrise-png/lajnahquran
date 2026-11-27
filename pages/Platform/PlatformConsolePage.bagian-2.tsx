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
import { Bagian1, Bagian2 } from './PlatformConsolePage.bagian-1';


export const Bagian3: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
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
                className="kontrol kontrol-cari"
              />
            </FormField>
            <FormField label="Status">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Status</option>
                <option value="provisioning">DISIAPKAN</option>
                <option value="provisioning_failed">GAGAL DIBUAT</option>
                <option value="active">AKTIF</option>
                <option value="trial">TRIAL</option>
                <option value="suspended">DITANGGUHKAN</option>
                <option value="archived">ARCHIVED</option>
              </select>
            </FormField>
            <FormField label="Paket Layanan">
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Paket</option>
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Direktori Lembaga
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar seluruh lembaga pengguna Lajnah Quran beserta status siklus, paket, dan kesiapan operasionalnya.
                </p>
              </div>
              <StatusBadge
                label={`Menampilkan ${filteredTenants.length} dari ${tenants.length} lembaga`}
                tone="primary"
              />
            </div>
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Memuat data organisasi...
              </div>
            ) : filteredTenants.length === 0 ? (
              <EmptyState
                title="Tidak Ada Lembaga yang Cocok"
                description="Tidak ditemukan organisasi yang sesuai dengan filter pencarian saat ini."
                actionLabel="Atur ulang"
                onAction={() => {
                  setSearchTenant('');
                  setFilterStatus('all');
                  setFilterPlan('all');
                }}
              />
            ) : (
              <>
                {/* Desktop Tenant Table */}
                <div className="wadah-tabel hidden md:block overflow-x-auto">
                  <table className="tabel">
                    <thead>
                      <tr>
                        <th>Lembaga</th>
                        <th>Paket</th>
                        <th>Tim</th>
                        <th className="w-64">Kapasitas & pemakaian</th>
                        <th>Status</th>
                        <th className="text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.map((t) => {
                        const planDef = getPlanEntitlement(t.plan_id);
                        const isSuspended =
                          t.status === 'suspended' || t.status === 'archived';
                        return (
                          <tr key={t.id}>
                            <td>
                              <button
                                type="button"
                                onClick={() => openTenantDetail(t.id)}
                                className="font-bold text-slate-900 hover:text-blue-600 text-left transition-colors"
                              >
                                {t.name}
                              </button>
                              <div className="text-xs font-mono text-slate-500 mt-0.5">
                                {t.slug} · {t.timezone || 'Asia/Jakarta'}
                              </div>
                            </td>
                            <td>
                              <StatusBadge
                                label={labelStatus((t.plan_id || 'standard'))}
                                tone="primary"
                              />
                              <div className="text-2xs text-slate-500 mt-1">
                                Maks. {planDef.maxStudents} santri
                              </div>
                            </td>
                            <td className="text-xs text-slate-700">
                              <div className="font-semibold text-slate-900 font-mono tabular-nums">
                                {t.adminCount} Admin
                              </div>
                              <div className="text-slate-500 font-mono tabular-nums mt-0.5">
                                {t.musammiCount} Musammi
                              </div>
                            </td>
                            <td>
                              <QuotaBar
                                label="Santri"
                                used={t.santriCount}
                                limit={planDef.maxStudents}
                              />
                            </td>
                            <td>
                              <StatusBadge
                                label={labelStatus((t.status || 'active'))}
                                tone={statusTone(t.status)}
                                dot
                              />
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
                                  onClick={() =>
                                    handleUpdateTenantLifecycle(
                                      t,
                                      isSuspended ? 'active' : 'suspended'
                                    )
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                    isSuspended
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                      : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                                  }`}
                                >
                                  {isSuspended ? 'Restore' : 'Tangguhkan'}
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
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-800 text-xs font-semibold text-white whitespace-nowrap transition-colors"
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

                {/* Mobile Tenant Cards (<768px) */}
                <div className="md:hidden divide-y divide-slate-200">
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
                              className="font-bold text-slate-900 text-left"
                            >
                              {t.name}
                            </button>
                            <div className="text-xs font-mono text-slate-500">
                              {t.slug} · {t.timezone || 'Asia/Jakarta'}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <StatusBadge
                              label={labelStatus((t.status || 'active'))}
                              tone={statusTone(t.status)}
                              dot
                            />
                            <StatusBadge
                              label={labelStatus((t.plan_id || 'standard'))}
                              tone="primary"
                            />
                          </div>
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

                        <QuotaBar
                          label="Kuota Santri"
                          used={t.santriCount}
                          limit={planDef.maxStudents}
                        />

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openTenantDetail(t.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
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
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                              isSuspended
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-white text-red-700'
                            }`}
                          >
                            {isSuspended ? 'Restore' : 'Tangguhkan'}
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
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
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
        </div>
      )}
    </>
  );
};

export const Bagian4: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
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
                className="kontrol kontrol-cari"
              />
            </FormField>
            <FormField label="Lembaga">
              <select
                value={filterAccountOrg}
                onChange={(e) => setFilterAccountOrg(e.target.value)}
                className="kontrol"
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
            <FormField label="Peran">
              <select
                value={filterAccountRole}
                onChange={(e) => setFilterAccountRole(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Peran</option>
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="musammi">Musammi</option>
              </select>
            </FormField>
            <FormField label="Filter Status Akses">
              <select
                value={filterAccountStatus}
                onChange={(e) => setFilterAccountStatus(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Status</option>
                <option value="active">AKTIF</option>
                <option value="invited">DIUNDANG</option>
                <option value="suspended">DITANGGUHKAN</option>
                <option value="revoked">REVOKED</option>
                <option value="expired">EXPIRED</option>
              </select>
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Direktori Akun & Hak Akses Lintas Lembaga
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Otorisasi dibatasi tegas pada 3 peran kanonikal (Superadmin, Admin, Musammi) dengan
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
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors shadow-xs"
                >
                  Undang akun
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Memuat direktori akun dan hak akses...
              </div>
            ) : filteredAccounts.length === 0 ? (
              <EmptyState
                title="Tidak Ada Akun yang Sesuai Filter"
                description="Ubah kriteria pencarian atau reset filter untuk menampilkan daftar akun dan hak akses."
                actionLabel="Atur ulang"
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
                <div className="wadah-tabel hidden md:block overflow-x-auto">
                  <table className="tabel">
                    <thead>
                      <tr>
                        <th>Identitas</th>
                        <th>Organisasi</th>
                        <th>Peran</th>
                        <th>Status</th>
                        <th className="text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((acc) => {
                        const isSuspendedOrRevoked =
                          acc.status === 'suspended' || acc.status === 'revoked';
                        return (
                          <tr key={acc.id}>
                            <td>
                              <button
                                type="button"
                                onClick={() => setSelectedAccountDetail(acc)}
                                className="font-bold text-slate-900 hover:text-blue-600 text-left transition-colors"
                              >
                                {acc.fullName}
                              </button>
                              <div className="text-xs text-slate-500 mt-0.5 font-mono">
                                {acc.email ? acc.email : `ID: ${acc.userId.slice(0, 12)}...`}
                              </div>
                            </td>
                            <td>
                              <div className="text-xs font-semibold text-slate-900">
                                {acc.organizationName}
                              </div>
                              <div className="text-2xs text-slate-500 mt-0.5">
                                {acc.organizationId
                                  ? `Cakupan lembaga (${acc.organizationId.slice(0, 8)})`
                                  : 'Seluruh platform'}
                              </div>
                            </td>
                            <td>
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
                            <td>
                              <div className="flex flex-col items-start gap-1">
                                <StatusBadge
                                  label={labelStatus(acc.status)}
                                  tone={statusTone(acc.status)}
                                  dot
                                />
                                {acc.createdAt && (
                                  <span className="text-2xs font-mono text-slate-500 tabular-nums">
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
                            <td className="text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAccountDetail(acc)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                                >
                                  Detail
                                </button>
                                <button
                                  type="button"
                                  hidden={isOwnAccount(acc)}
                                    onClick={() => handleToggleAccountStatus(acc)}
                                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                    isSuspendedOrRevoked
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                      : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                                  }`}
                                >
                                  {isSuspendedOrRevoked ? 'Restore' : 'Tangguhkan'}
                                </button>
                                {acc.status !== 'revoked' && (
                                  <button
                                    type="button"
                                    hidden={isOwnAccount(acc)}
                                    onClick={() => handleRevokeAccountAccess(acc)}
                                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors"
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
                <div className="md:hidden divide-y divide-slate-200">
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
                              className="font-bold text-slate-900 text-left"
                            >
                              {acc.fullName}
                            </button>
                            <div className="text-xs font-mono text-slate-500">
                              {acc.email || `ID: ${acc.userId.slice(0, 10)}...`}
                            </div>
                          </div>
                          <StatusBadge
                            label={labelStatus(acc.status)}
                            tone={statusTone(acc.status)}
                            dot
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                          <span className="font-semibold text-slate-700">
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
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
                          >
                            Detail
                          </button>
                          <button
                            type="button"
                            hidden={isOwnAccount(acc)}
                                    onClick={() => handleToggleAccountStatus(acc)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                              isSuspendedOrRevoked
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-white text-red-700'
                            }`}
                          >
                            {isSuspendedOrRevoked ? 'Restore' : 'Tangguhkan'}
                          </button>
                          {acc.status !== 'revoked' && (
                            <button
                              type="button"
                              hidden={isOwnAccount(acc)}
                                    onClick={() => handleRevokeAccountAccess(acc)}
                              className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold"
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
    </>
  );
};
