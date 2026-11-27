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
import { Bagian1, Bagian2, Bagian3, Bagian4, Bagian5, Bagian6, Bagian7, Bagian8, Bagian9, Bagian10, Bagian11, Bagian12 } from './PlatformConsolePage.bagian';

export * from './PlatformConsolePage.logika';

const PlatformConsolePage: React.FC<PlatformConsolePageProps> = (props) => {
  const s = usePlatformConsolePageLogika(props);
  const { activeTab, activeSection, onNavigate, onNavigatePath, params, navigate, resolvedInitialTab, tab, setTab, selectedTenantId, setSelectedTenantId, myUserId, setMyUserId, searchTenant, setSearchTenant, filterStatus, setFilterStatus, filterPlan, setFilterPlan, searchAccount, setSearchAccount, filterAccountOrg, setFilterAccountOrg, filterAccountRole, setFilterAccountRole, filterAccountStatus, setFilterAccountStatus, selectedAccountDetail, setSelectedAccountDetail, filterSupportTenant, setFilterSupportTenant, filterSupportMode, setFilterSupportMode, filterSupportStatus, setFilterSupportStatus, filterSupportDate, setFilterSupportDate, nowTick, setNowTick, searchAudit, setSearchAudit, filterAuditTenant, setFilterAuditTenant, filterAuditRole, setFilterAuditRole, filterAuditAction, setFilterAuditAction, filterAuditDate, setFilterAuditDate, tenants, setTenants, paketDb, setPaketDb, accounts, setAccounts, supportSessions, setSupportSessions, auditLogs, setAuditLogs, healthChecks, setHealthChecks, lastHealthCheckAt, setLastHealthCheckAt, healthCheckError, setHealthCheckError, isCheckingHealth, setIsCheckingHealth, loading, setLoading, platformConfig, setPlatformConfig, savedPlatformConfig, setSavedPlatformConfig, isSavingSettings, setIsSavingSettings, settingsFeedback, setSettingsFeedback, isSettingsDirty, isProvisionModalOpen, setProvisionModalOpen, provisionError, setProvisionError, provisionForm, setProvisionForm, lastIssuedInviteInfo, setLastIssuedInviteInfo, isSubmitting, setIsSubmitting, isInviteAccountModalOpen, setInviteAccountModalOpen, inviteError, setInviteError, inviteAccountForm, setInviteAccountForm, planChangeModal, setPlanChangeModal, isSupportModalOpen, setSupportModalOpen, supportError, setSupportError, supportAcknowledge, setSupportAcknowledge, selectedTenantForSupport, setSelectedTenantForSupport, supportForm, setSupportForm, selectedAuditLog, setSelectedAuditLog, confirmAction, setConfirmAction, performNavigation, navigateToSection, openTenantDetail, closeTenantDetail, recordPlatformAuditLog, fetchPlatformData, runHealthDiagnostics, selectedTenant, filteredTenants, filteredAccounts, filteredSupportSessions, availableAuditActions, filteredAuditLogs, handleProvisionTenant, handleUpdateTenantLifecycle, handleUpdateTenantPlan, handleConfirmPlanChange, handleInvitePlatformOrTenantAccount, isOwnAccount, handleToggleAccountStatus, handleRevokeAccountAccess, handleStartSupportSession, handleRevokeSupportSession, handleSavePlatformSettings, totalAdmins, totalMusammi, totalSantriGlobal, activeTenantsCount, trialTenantsCount, provisioningTenantsCount, activeSupportSession, activeDbSupportSessions, activeDbSupportCount, effectiveActiveSupportCount, healthyProbesCount, attentionProbesCount, getPlanEntitlement, formatRemainingTime, focusTodayItems, statusTone, dynamicPageTitle, dynamicPageDescription } = s;

  return (<PageShell>
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
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs disabled:opacity-50"
              >
                {isCheckingHealth ? 'Memeriksa...' : 'Periksa kesehatan'}
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
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
              >
                Mulai Sesi Bantuan
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
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'accounts'
                    ? 'bg-blue-600 hover:bg-blue-800 text-white shadow-xs'
                    : 'border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600'
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
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
              >
                Buat lembaga
              </button>
            )}
          </div>
        }
      />

      {lastIssuedInviteInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="space-y-1">
            <div className="font-bold text-slate-900">
              Tautan Undangan Sekali Pakai Diterbitkan ({lastIssuedInviteInfo.email} ·{' '}
              {lastIssuedInviteInfo.role.toUpperCase()})
            </div>
            <div className="font-mono text-2xs text-blue-600 break-all">
              {window.location.origin}
              {lastIssuedInviteInfo.invitePath}
            </div>
            {lastIssuedInviteInfo.temporaryPassword && (
              <div className="text-slate-600">
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
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-800 text-white font-semibold"
            >
              Salin Tautan /invite
            </button>
            <button
              type="button"
              onClick={() => setLastIssuedInviteInfo(null)}
              className="px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold"
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
            label="Lembaga Aktif"
            value={loading ? '...' : activeTenantsCount}
            meta={
              loading
                ? 'Memuat data organisasi...'
                : `${tenants.length} total lembaga · ${trialTenantsCount} trial · ${provisioningTenantsCount} pembuatan lembaga`
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
            label="Bantuan Aktif"
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
                label={effectiveActiveSupportCount > 0 ? 'DARURAT' : 'AMAN'}
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
                    ? 'SEHAT'
                    : 'PANTAU'
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
      <Bagian1 s={s} />

      {/* =====================================================================
          SECTION 1: DASHBOARD PLATFORM (IKHTISAR, KESIAPAN TENANT, FOKUS HARI INI & AKTIVITAS TERBARU)
         ===================================================================== */}
      <Bagian2 s={s} />

      {/* =====================================================================
          SECTION 2: DIREKTORI ORGANISASI & TENANT (/platform/tenants)
         ===================================================================== */}
      <Bagian3 s={s} />

      {/* =====================================================================
          SECTION 3: AKUN PLATFORM & ACCESS GRANTS GLOBAL (/platform/accounts)
         ===================================================================== */}
      <Bagian4 s={s} />

      {/* SECTION 4 (Fase 8): Pendaftaran lembaga, langganan & pembayaran, paket — pages/Platform/BisnisPanel.tsx */}
      {!selectedTenant && tab === 'plans' && <BisnisPanel />}

      {/* =====================================================================
          SECTION 5: SUPPORT ACCESS SESSIONS (/platform/support-sessions)
         ===================================================================== */}
      <Bagian5 s={s} />

      {/* =====================================================================
          SECTION 6: AUDIT PLATFORM & HEALTH MONITOR (/platform/audit)
         ===================================================================== */}
      <Bagian6 s={s} />

      {/* =====================================================================
          SECTION 7: PENGATURAN PLATFORM GLOBAL (/platform/settings)
         ===================================================================== */}
      <Bagian7 s={s} />

      {/* =====================================================================
          DRAWER DETAIL AKUN & ACCESS GRANTS (FASE 3A)
         ===================================================================== */}
      <Bagian8 s={s} />

      {/* =====================================================================
          MODAL UBAH PAKET TENANT (FASE 3B)
         ===================================================================== */}
      <Bagian9 s={s} />

      {/* =====================================================================
          MODAL 1: PROVISION TENANT BARU
         ===================================================================== */}
      <Bagian10 s={s} />

      {/* =====================================================================
          MODAL 2: UNDANG AKUN BARU (SUPERADMIN / ADMIN TENANT / MUSAMMI)
         ===================================================================== */}
      <Bagian11 s={s} />

      {/* =====================================================================
          MODAL 3: BUKA SUPPORT ACCESS SESSION (FASE 4)
         ===================================================================== */}
      <Bagian12 s={s} />

      {/* =====================================================================
          MODAL 4: INSPEKSI PAYLOAD JSON AUDIT LOG (FASE 5A — SANITIZED)
         ===================================================================== */}
      <Modal
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        title={`Detail Peristiwa audit: ${selectedAuditLog?.action || ''}`}
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
                <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-500">Waktu Event:</span>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {new Date(selectedAuditLog.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Cakupan lembaga:</span>
                    <div className="font-semibold text-slate-900 mt-0.5">
                      {selectedAuditLog.organization_name || 'Platform Global'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Aktor & Peran:</span>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {(selectedAuditLog.actor_role || 'system').toUpperCase()}{' '}
                      {selectedAuditLog.actor_id
                        ? `(${String(selectedAuditLog.actor_id).slice(0, 8)}...)`
                        : ''}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Resource Target:</span>
                    <div className="font-mono font-semibold text-slate-900 mt-0.5">
                      {selectedAuditLog.resource_type}{' '}
                      {selectedAuditLog.resource_id
                        ? `(${String(selectedAuditLog.resource_id).slice(0, 8)})`
                        : ''}
                    </div>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Alasan (Reason):</span>{' '}
                    <span className="font-semibold text-slate-900">
                      {selectedAuditLog.reason || '-'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">
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
                    className="px-3 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold transition-colors"
                  >
                    Salin JSON
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="font-semibold text-slate-600 mb-1">Before State:</div>
                    <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-auto max-h-60 font-mono text-2xs leading-relaxed">
                      {JSON.stringify(safeBefore, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-600 mb-1">After State:</div>
                    <pre className="p-3 bg-slate-900 text-emerald-300 rounded-lg overflow-auto max-h-60 font-mono text-2xs leading-relaxed">
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
    </PageShell>);
};

export default PlatformConsolePage;
