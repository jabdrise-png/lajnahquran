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
import { Bagian3, Bagian4 } from './PlatformConsolePage.bagian-2';
import { Bagian5, Bagian6 } from './PlatformConsolePage.bagian-3';


export const Bagian7: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      {!selectedTenant && tab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleSavePlatformSettings}
            className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs"
          >
            <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Kebijakan Global Bantuan, pembuatan lembaga & tata kelola Akun
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
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
                className={`rounded-xl border p-3.5 text-xs font-medium leading-relaxed ${
                  settingsFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {settingsFeedback.message}
              </div>
            )}

            {/* Kelompok 1: Support Defaults */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">1. Bantuan Defaults</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Parameter keamanan default ketika Superadmin memulai sesi bantuan Break-Glass.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Durasi bawaan sesi bantuan"
                  hint="Batas waktu otomatis sebelum sesi bantuan kedaluwarsa."
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
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value={15}>15 Menit</option>
                    <option value={30}>30 Menit (Standar ISO 27017)</option>
                    <option value={60}>60 Menit</option>
                  </select>
                </FormField>

                <FormField
                  label="Mode bawaan sesi bantuan"
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
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="read_only">Read-Only (Default Aman)</option>
                    <option value="read_write">Controlled-Write (Koreksi Darurat)</option>
                  </select>
                </FormField>
              </div>
            </div>

            {/* Kelompok 2: Tenant Provisioning */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">2. Pembuatan Lembaga</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Konfigurasi paket awal dan zona waktu saat membuat organisasi baru.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  label="Paket awal lembaga baru"
                  hint="Paket default saat lembaga baru dibuat."
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
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
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
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                    <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                    <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  </select>
                </FormField>
              </div>
            </div>

            {/* Kelompok 3: Account Governance */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">3. Account tata kelola</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kebijakan tata kelola undangan akun dan pembatasan akses semua lembaga.
                </p>
              </div>
              <label className="flex items-start gap-3 text-xs font-semibold text-slate-900 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={platformConfig.inviteOnlyMode}
                  onChange={(e) => {
                    setSettingsFeedback(null);
                    setPlatformConfig({ ...platformConfig, inviteOnlyMode: e.target.checked });
                  }}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <div className="space-y-0.5">
                  <div>
                    Wajibkan Kebijakan Undangan Terverifikasi Server-Side (One-Time Token)
                  </div>
                  <p className="font-normal text-slate-500 leading-relaxed">
                    Memblokir pembuatan akun tanpa organisasi/grant sah dan mewajibkan aktivasi
                    melalui token undangan kriptografis sekali pakai (`/invite`).
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={!isSettingsDirty || isSavingSettings}
                onClick={() => {
                  setPlatformConfig(savedPlatformConfig);
                  setSettingsFeedback(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors"
              >
                Reset Perubahan
              </button>
              <button
                type="submit"
                disabled={!isSettingsDirty || isSavingSettings}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSavingSettings ? 'Menyimpan ke Server...' : 'Simpan Kebijakan Platform'}
              </button>
            </div>
          </form>

          {/* Website Editor Entry Card */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-5 shadow-2xs">
              <div className="space-y-3">
                <StatusBadge label="WEBSITE EDITOR · CMS PUBLIK" tone="primary" />
                <h3 className="text-base font-bold text-slate-900">
                  Editor Landing Page & Dokumentasi Publik
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Kelola konten halaman depan publik (`/`), narasi fitur unggulan platform, dan
                  dokumentasi layanan di ruang kerja terpisah (`/platform/cms`) tanpa menyentuh
                  konfigurasi operasional lembaga.
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
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Buka Website Editor (/platform/cms)
              </button>
            </div>

            <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5 space-y-2 text-xs">
              <div className="font-bold text-blue-600">Jaminan Keamanan Pengaturan</div>
              <p className="text-slate-600 leading-relaxed">
                Halaman ini hanya dapat diakses oleh <span className="font-semibold">Superadmin</span>.
                Kredensial rahasia (seperti bot token Telegram/WhatsApp atau service peran key)
                tidak pernah diekspos ke browser dan dikelola secara terisolasi di server.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Bagian8: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      <Drawer
        isOpen={Boolean(selectedAccountDetail)}
        onClose={() => setSelectedAccountDetail(null)}
        title={selectedAccountDetail ? `Detail Akun: ${selectedAccountDetail.fullName}` : 'Detail Akun'}
        subtitle="Inspeksi identitas, cakupan tenant, access grants, dan riwayat keamanan akun."
      >
        {selectedAccountDetail && (
          <div className="space-y-6 text-xs">
            {/* 1. Identity & Scope */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {selectedAccountDetail.fullName}
                  </div>
                  <div className="font-mono text-slate-500 mt-0.5">
                    {selectedAccountDetail.email || 'Email belum tersinkronisasi'}
                  </div>
                </div>
                <StatusBadge
                  label={labelStatus(selectedAccountDetail.status)}
                  tone={statusTone(selectedAccountDetail.status)}
                  dot
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <div className="text-slate-500">User ID</div>
                  <div className="font-mono font-semibold text-slate-900 break-all mt-0.5">
                    {selectedAccountDetail.userId}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Peran</div>
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
                  <div className="text-slate-500">Scope Lembaga</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {selectedAccountDetail.organizationName}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Daftar Access Grants */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Hak Akses Terdaftar
              </h4>
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white overflow-hidden">
                {(selectedAccountDetail.allGrants || []).map((g) => (
                  <div key={g.id} className="p-3.5 flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{g.organizationName}</div>
                      <div className="font-mono text-2xs text-slate-500">
                        Hak Akses ID: {String(g.id).slice(0, 12)}...
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
                        label={labelStatus(g.status)}
                        tone={statusTone(g.status)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Informasi Undangan Bila Tersedia */}
            {selectedAccountDetail.invitationInfo && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-600">Informasi Undangan Server-Side</span>
                  <StatusBadge
                    label={labelStatus(selectedAccountDetail.invitationInfo.status)}
                    tone={statusTone(selectedAccountDetail.invitationInfo.status)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    Email Tujuan:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {selectedAccountDetail.invitationInfo.email}
                    </span>
                  </div>
                  {selectedAccountDetail.invitationInfo.expiresAt && (
                    <div>
                      Kedaluwarsa:{' '}
                      <span className="font-mono font-semibold text-slate-900">
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
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
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
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">
                      Belum ada rekaman aktivitas keamanan spesifik untuk akun ini di audit_logs.
                    </div>
                  );
                }
                return (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                    {accountLogs.slice(0, 6).map((l) => (
                      <div key={l.id} className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900">{l.action}</span>
                          <span className="font-mono text-2xs text-slate-500">
                            {new Date(l.created_at).toLocaleString('id-ID')}
                          </span>
                        </div>
                        {l.reason && <div className="text-slate-500">Alasan: {l.reason}</div>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* 5. Kontrol Tindakan Akun */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleToggleAccountStatus(selectedAccountDetail)}
                className={`px-3.5 py-2 rounded-lg border text-xs font-semibold ${
                  selectedAccountDetail.status === 'suspended' ||
                  selectedAccountDetail.status === 'revoked'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-white text-red-700'
                }`}
              >
                {selectedAccountDetail.status === 'suspended' ||
                selectedAccountDetail.status === 'revoked'
                  ? 'Pulihkan Akses (Restore)'
                  : 'Tangguhkan akses'}
              </button>
              {selectedAccountDetail.status !== 'revoked' && (
                <button
                  type="button"
                  onClick={() => handleRevokeAccountAccess(selectedAccountDetail)}
                  className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  {selectedAccountDetail.status === 'invited'
                    ? 'Batalkan Undangan'
                    : 'Cabut Hak Akses'}
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
};
