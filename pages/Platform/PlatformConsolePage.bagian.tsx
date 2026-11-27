// Dipecah otomatis dari PlatformConsolePage.tsx (Fase 8 bagian 2): bagian tampilan besar komponen PlatformConsolePage.
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
import { Bagian3, Bagian4 } from './PlatformConsolePage.bagian-2';
import { Bagian5, Bagian6 } from './PlatformConsolePage.bagian-3';
import { Bagian7, Bagian8 } from './PlatformConsolePage.bagian-4';
export * from './PlatformConsolePage.bagian-4';
export * from './PlatformConsolePage.bagian-3';
export * from './PlatformConsolePage.bagian-2';
export * from './PlatformConsolePage.bagian-1';

export const Bagian9: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
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
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-medium">Paket Saat Ini</div>
                    <div className="text-sm font-bold text-slate-900 mt-1">
                      {currentPlanDef.name}
                    </div>
                    <div className="font-mono text-2xs text-slate-600 mt-1">
                      Kuota: {currentPlanDef.maxStudents} Santri · {currentPlanDef.maxMusammi}{' '}
                      Musammi
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                    <label className="block text-blue-600 font-bold mb-1">
                      Pilih Paket Baru <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={planChangeModal.nextPlan}
                      onChange={(e) =>
                        setPlanChangeModal({
                          ...planChangeModal,
                          nextPlan: e.target.value as any,
                          error: null,
                        })
                      }
                      className="w-full h-9 border border-blue-300 rounded-lg px-2.5 text-xs font-semibold text-slate-900 bg-white"
                    >
                      {paketDb.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nama} ({p.batas_santri ?? 'tanpa batas'} santri){p.aktif ? '' : ' · nonaktif'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Perbandingan Perubahan Kuota */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="font-bold text-slate-900">Perbandingan Perubahan Kuota</div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 rounded bg-slate-50">
                      <div className="text-2xs text-slate-500">Kuota Santri</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {currentPlanDef.maxStudents} → {nextPlanDef.maxStudents}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-50">
                      <div className="text-2xs text-slate-500">Kuota Musammi</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {currentPlanDef.maxMusammi} → {nextPlanDef.maxMusammi}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-slate-50">
                      <div className="text-2xs text-slate-500">Retensi Audit</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {currentPlanDef.auditRetentionDays}hr → {nextPlanDef.auditRetentionDays}hr
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dampak Perubahan */}
                <div
                  className={`p-3.5 rounded-xl border leading-relaxed ${
                    exceedsStudents || exceedsMusammi
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
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
                  <label className="block font-semibold text-slate-700 mb-1">
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
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPlanChangeModal(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || planChangeModal.tenant.plan_id === planChangeModal.nextPlan}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
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
    </>
  );
};

export const Bagian10: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => {
          setProvisionError(null);
          setProvisionModalOpen(false);
        }}
        title="Buat Lembaga Baru"
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
                Slug Lembaga (Unik)
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
              <p className="mt-1 text-2xs text-slate-500">
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
              <p className="text-2xs text-slate-500 mt-0.5">
                Sistem akan menerbitkan hak akses peran{' '}
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
              {isSubmitting ? 'Membuat lembaga…' : 'Buat lembaga'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export const Bagian11: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      <Modal
        isOpen={isInviteAccountModalOpen}
        onClose={() => {
          setInviteError(null);
          setInviteAccountModalOpen(false);
        }}
        title="Undang Akun & Terbitkan Hak Akses"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
              className="w-full h-10 border border-slate-200 rounded-lg px-3.5 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
              className="w-full h-10 border border-slate-200 rounded-lg px-3.5 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Peran (3-Peran) <span className="text-red-600">*</span>
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
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="admin">Admin</option>
                <option value="musammi">Musammi</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>

            {inviteAccountForm.role !== 'superadmin' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Lembaga Target <span className="text-red-600">*</span>
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
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Scope Otorisasi
                </label>
                <div className="h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center text-xs font-semibold text-slate-600">
                  Platform (semua lembaga)
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-slate-700 space-y-1 leading-relaxed">
            <div className="font-bold text-blue-600">Informasi Akses & Keamanan Undangan</div>
            <p>
              Sistem tidak membuat akun dengan password default statis. Server (`/api/invitations`)
              akan menerbitkan grant berstatus <span className="font-mono font-semibold">diundang</span>{' '}
              beserta tautan token aktivasi sekali pakai yang wajib dikonfirmasi oleh penerima.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setInviteError(null);
                setInviteAccountModalOpen(false);
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Menerbitkan Undangan...' : 'Kirim Undangan Server-Side'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export const Bagian12: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      <Modal
        isOpen={isSupportModalOpen}
        onClose={() => {
          setSupportError(null);
          setSupportAcknowledge(false);
          setSupportModalOpen(false);
        }}
        title={`Mulai Sesi Bantuan${
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lembaga Target <span className="text-red-600">*</span>
              </label>
              <select
                required
                value={supportForm.organizationId}
                onChange={(e) => {
                  setSupportError(null);
                  setSupportForm({ ...supportForm, organizationId: e.target.value });
                }}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
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
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Target Lembaga:</span>
              <span className="font-bold text-slate-900">{selectedTenantForSupport.name}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="read_only">Read-Only (Observasi Aman)</option>
                <option value="read_write">Controlled-Write (Koreksi Darurat)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Durasi Sesi <span className="text-red-600">*</span>
              </label>
              <select
                value={supportForm.durationMinutes}
                onChange={(e) => {
                  setSupportError(null);
                  setSupportForm({ ...supportForm, durationMinutes: Number(e.target.value) });
                }}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
              >
                <option value={15}>15 Menit</option>
                <option value={30}>30 Menit (Standar)</option>
                <option value={60}>60 Menit</option>
              </select>
            </div>
          </div>

          {/* Peringatan Konsekuensi Berdasarkan Mode */}
          {supportForm.mode === 'read_write' ? (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1 leading-relaxed">
              <div className="font-bold">
                Peringatan Tingkat Tinggi: Mode Controlled-Write (Read & Write)
              </div>
              <p>
                Mode ini mengizinkan modifikasi terbatas pada data operasional lembaga selama sesi
                berlangsung. Setiap perubahan menulis jejak `before_state` dan `after_state` ke
                Audit Log lembaga dan platform. Gunakan Read-Only jika hanya melakukan investigasi.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
              <span className="font-bold">Mode Read-Only:</span> Anda hanya dapat menginspeksi
              konfigurasi dan data lembaga tanpa dapat mengubah data akademik, nilai, atau raport.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Alasan Operasional / Nomor Tiket <span className="text-red-600">*</span>
              </label>
              <span className="text-2xs font-mono text-slate-500">
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
              placeholder="Tuliskan nomor tiket bantuan dan alasan teknis pembukaan sesi bantuan..."
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={supportAcknowledge}
              onChange={(e) => {
                setSupportError(null);
                setSupportAcknowledge(e.target.checked);
              }}
              className="mt-0.5 rounded border-slate-300 text-blue-600"
            />
            <span className="leading-relaxed">
              <strong className="text-slate-900">Acknowledgement:</strong> Saya menyatakan sesi
              support ini memiliki otorisasi operasional yang sah, terikat ke scope lembaga yang
              dipilih, otomatis berakhir sesuai durasi, dan seluruh aktivitas diaudit.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setSupportError(null);
                setSupportAcknowledge(false);
                setSupportModalOpen(false);
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSubmitting ? 'Mengotorisasi Sesi...' : 'Mulai Sesi Bantuan'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
