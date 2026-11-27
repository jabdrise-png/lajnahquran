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


export const Bagian5: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      {!selectedTenant && tab === 'support' && (
        <div className="space-y-6">
          {/* 5A. KPI Support Access */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Sesi Aktif Saat Ini"
              value={loading ? '...' : effectiveActiveSupportCount}
              hint={
                effectiveActiveSupportCount > 0
                  ? 'Sesi bantuan semua lembaga sedang berlangsung'
                  : 'Tidak ada sesi darurat aktif'
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
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
                <div className="flex items-center gap-2">
                  <StatusBadge label="AKTIF Sesi Bantuan (DARURAT)" tone="warning" dot />
                  <span className="text-xs font-semibold text-amber-800">
                    Seluruh pembacaan & tindakan dalam sesi ini dicatat ke Audit Log
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-700 tabular-nums">
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
                    <div className="p-3 rounded-xl bg-white/90 border border-amber-200">
                      <div className="text-amber-800 font-medium">Nama Lembaga</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {activeSupportSession.organizationName}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/90 border border-amber-200">
                      <div className="text-amber-800 font-medium">Mode Akses</div>
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
                    <div className="p-3 rounded-xl bg-white/90 border border-amber-200">
                      <div className="text-amber-800 font-medium">Waktu Mulai & Berakhir</div>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                        {new Date(activeSupportSession.startedAt).toLocaleTimeString('id-ID')} —{' '}
                        {new Date(activeSupportSession.expiresAt).toLocaleTimeString('id-ID')}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/90 border border-amber-200">
                      <div className="text-amber-800 font-medium">Alasan Operasional</div>
                      <div className="font-semibold text-slate-900 mt-0.5 line-clamp-2">
                        {activeSupportSession.reason}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate('/app/dashboard')}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
                    >
                      Buka Ruang Kerja Lembaga
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
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                    >
                      Akhiri Sesi
                    </button>
                  </div>
                </div>
              ) : (
                activeDbSupportSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 p-3.5 rounded-xl border border-amber-200"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {s.organization_name}
                        </span>
                        <StatusBadge
                          label={s.mode === 'read_write' ? 'CONTROLLED-WRITE' : 'READ-ONLY'}
                          tone={s.mode === 'read_write' ? 'danger' : 'warning'}
                        />
                      </div>
                      <div className="text-slate-600">
                        Alasan: <span className="font-semibold text-slate-900">{s.reason}</span> ·
                        Mulai: {new Date(s.started_at).toLocaleTimeString('id-ID')} · Berakhir:{' '}
                        {new Date(s.expires_at).toLocaleTimeString('id-ID')} (
                        {formatRemainingTime(s.expires_at)})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeSupportSession(s)}
                      className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shrink-0"
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
            <FormField label="Filter Lembaga">
              <select
                value={filterSupportTenant}
                onChange={(e) => setFilterSupportTenant(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Lembaga</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Mode akses">
              <select
                value={filterSupportMode}
                onChange={(e) => setFilterSupportMode(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Mode</option>
                <option value="read_only">Read-Only</option>
                <option value="read_write">Controlled-Write</option>
              </select>
            </FormField>
            <FormField label="Status sesi">
              <select
                value={filterSupportStatus}
                onChange={(e) => setFilterSupportStatus(e.target.value)}
                className="kontrol"
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
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
              />
            </FormField>
          </FilterBar>

          {/* 5D. Tabel Riwayat Support Access */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Riwayat Sesi Bantuan (Break-Glass Audit Ledger)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Catatan permanen seluruh sesi bantuan semua lembaga beserta durasi, mode akses,
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
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors shadow-xs"
              >
                Mulai Sesi Bantuan
              </button>
            </div>

            {filteredSupportSessions.length === 0 ? (
              <EmptyState
                title="Tidak Ada Riwayat Sesi Bantuan"
                description="Belum ada sesi bantuan yang tercatat atau sesuai filter. Klik 'Mulai Sesi Bantuan' untuk membuka akses bantuan teraudit."
                actionLabel="Mulai Sesi Bantuan"
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
              <div className="wadah-tabel overflow-x-auto">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Lembaga</th>
                      <th>Waktu</th>
                      <th>Mode</th>
                      <th>Alasan</th>
                      <th>Durasi</th>
                      <th>Status</th>
                      <th>Aktor</th>
                      <th className="text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
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
                        <tr key={s.id}>
                          <td className="font-bold text-slate-900">
                            {s.organization_name}
                          </td>
                          <td className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                            <div>Mulai: {new Date(s.started_at).toLocaleString('id-ID')}</div>
                            <div className="text-slate-500">
                              Batas: {new Date(s.expires_at).toLocaleString('id-ID')}
                            </div>
                          </td>
                          <td>
                            <StatusBadge
                              label={
                                s.mode === 'read_write' ? 'CONTROLLED-WRITE' : 'READ-ONLY'
                              }
                              tone={s.mode === 'read_write' ? 'warning' : 'neutral'}
                            />
                          </td>
                          <td className="text-xs text-slate-700 max-w-xs">
                            {s.reason}
                          </td>
                          <td className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                            {durationMins} menit
                            {isActive && (
                              <div className="text-2xs text-amber-700 font-normal mt-0.5">
                                {formatRemainingTime(s.expires_at)}
                              </div>
                            )}
                          </td>
                          <td>
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
                          <td className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-900">Superadmin</span>
                            {s.actor_id && (
                              <div className="font-mono text-2xs text-slate-500">
                                {String(s.actor_id).slice(0, 8)}...
                              </div>
                            )}
                          </td>
                          <td className="text-right">
                            {isActive ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeSupportSession(s)}
                                className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition-colors"
                              >
                                Akhiri Sesi
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500 font-mono">Selesai</span>
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
    </>
  );
};

export const Bagian6: React.FC<{ s: PlatformConsolePageLogika }> = ({ s }) => {
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;
  return (
    <>
      {!selectedTenant && tab === 'audit' && (
        <div className="space-y-6">
          {/* 6A. Health Summary (4 KPI Aktual) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Layanan sehat"
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
              label="Jumlah peristiwa audit"
              value={loading ? '...' : auditLogs.length}
              hint="Peristiwa tata kelola & keamanan tercatat di database"
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
                  : 'Klik Periksa kesehatan'
              }
              tone="neutral"
            />
          </div>

          {healthCheckError && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700"
            >
              Gagal menyelesaikan diagnostik kesehatan sistem: {healthCheckError}
            </div>
          )}

          {/* 6B. System Health Monitor */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Kesehatan Sistem
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pemeriksaan aktual koneksi database/PostgREST, kesiapan skema otorisasi 3-peran,
                  audit logging, dan endpoint Serverless API (/api/health).
                </p>
              </div>
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={runHealthDiagnostics}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-xs"
              >
                {isCheckingHealth ? 'Memeriksa...' : 'Periksa kesehatan'}
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {healthChecks.map((hc) => (
                <div
                  key={hc.key}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-2xs font-mono font-semibold text-slate-600 uppercase">
                        {hc.category}
                      </span>
                      <span className="text-sm font-bold text-slate-900">{hc.label}</span>
                    </div>
                    <p className="text-xs text-slate-500">{hc.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    {hc.checkedAt && (
                      <span className="font-mono text-2xs text-slate-500 tabular-nums">
                        Diperiksa {new Date(hc.checkedAt).toLocaleTimeString('id-ID')}
                      </span>
                    )}
                    {hc.latencyMs !== undefined && (
                      <span className="px-2.5 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                        {hc.latencyMs} ms
                      </span>
                    )}
                    <StatusBadge
                      label={
                        hc.status === 'healthy'
                          ? 'SEHAT'
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
                className="kontrol kontrol-cari"
              />
            </FormField>
            <FormField label="Filter Lembaga">
              <select
                value={filterAuditTenant}
                onChange={(e) => setFilterAuditTenant(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Lembaga</option>
                <option value="platform_global">Platform Global</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Peran">
              <select
                value={filterAuditRole}
                onChange={(e) => setFilterAuditRole(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Peran</option>
                <option value="superadmin">SUPERADMIN</option>
                <option value="admin">ADMIN</option>
                <option value="musammi">MUSAMMI</option>
              </select>
            </FormField>
            <FormField label="Aksi">
              <select
                value={filterAuditAction}
                onChange={(e) => setFilterAuditAction(e.target.value)}
                className="kontrol"
              >
                <option value="all">Semua Action</option>
                {availableAuditActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Tanggal">
              <input
                type="date"
                value={filterAuditDate}
                onChange={(e) => setFilterAuditDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:border-blue-600"
              />
            </FormField>
          </FilterBar>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">Peristiwa audit platform</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jejak perubahan konfigurasi lembaga, pemberian hak akses, sesi bantuan
                  darurat, dan kebijakan global.
                </p>
              </div>
              <StatusBadge
                label={`Menampilkan ${filteredAuditLogs.length} dari ${auditLogs.length} event`}
                tone="primary"
              />
            </div>
            {filteredAuditLogs.length === 0 ? (
              <EmptyState
                title="Tidak Ada Peristiwa audit yang Cocok"
                description="Belum ada catatan audit yang sesuai dengan filter pencarian saat ini."
                actionLabel="Atur ulang"
                onAction={() => {
                  setSearchAudit('');
                  setFilterAuditTenant('all');
                  setFilterAuditRole('all');
                  setFilterAuditAction('all');
                  setFilterAuditDate('');
                }}
              />
            ) : (
              <div className="wadah-tabel overflow-x-auto">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Lembaga</th>
                      <th>Aktor</th>
                      <th>Peran</th>
                      <th>Action</th>
                      <th>Resource</th>
                      <th>Reason</th>
                      <th className="text-right">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="text-xs font-semibold text-slate-900">
                          {log.organization_name || 'Platform Global'}
                        </td>
                        <td className="font-mono text-xs text-slate-500">
                          {log.actor_id ? `${String(log.actor_id).slice(0, 8)}...` : 'system'}
                        </td>
                        <td>
                          <StatusBadge
                            label={labelStatus((log.actor_role || 'system'))}
                            tone={
                              log.actor_role === 'superadmin'
                                ? 'warning'
                                : log.actor_role === 'admin'
                                ? 'primary'
                                : 'neutral'
                            }
                          />
                        </td>
                        <td className="font-mono text-xs font-bold text-slate-900">
                          {log.action}
                        </td>
                        <td className="font-mono text-xs text-slate-600">
                          {log.resource_type}
                          {log.resource_id ? ` (${String(log.resource_id).slice(0, 8)})` : ''}
                        </td>
                        <td className="text-xs text-slate-600 max-w-xs truncate">
                          {log.reason || '-'}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
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
    </>
  );
};
