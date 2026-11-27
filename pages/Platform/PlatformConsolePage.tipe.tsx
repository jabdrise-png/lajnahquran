// Dipisah dari PlatformConsolePage.logika.tsx (Fase 8 bagian 2).
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



export type PlatformSection =
  | 'dashboard'
  | 'tenants'
  | 'accounts'
  | 'plans'
  | 'support'
  | 'audit'
  | 'settings';

export interface TenantSetupState {
  hasActiveAcademicYear: boolean;
  hasAdminAssigned: boolean;
  hasMusammiRegistered: boolean;
  hasHalaqahCreated: boolean;
}

export interface TenantItem {
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

export interface AccountGrantSummary {
  id: string;
  role: 'superadmin' | 'admin' | 'musammi' | 'pending' | 'unknown';
  rawRole: string;
  status: 'active' | 'invited' | 'suspended' | 'revoked' | 'expired';
  organizationId: string | null;
  organizationName: string;
  createdAt?: string;
  expiresAt?: string | null;
}

export interface AccountInvitationSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  organizationId: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  acceptedAt?: string | null;
}

export interface PlatformAccountItem {
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
  allGrants?: AccountGrantSummary[];
  invitationInfo?: AccountInvitationSummary | null;
}

export interface SupportSessionItem {
  id: string;
  organization_id: string;
  organization_name?: string;
  actor_id?: string | null;
  reason: string;
  mode: 'read_only' | 'read_write';
  started_at: string;
  expires_at: string;
  ended_at?: string | null;
}

export interface AuditLogItem {
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

export interface HealthCheckResult {
  key: string;
  label: string;
  category: 'Database' | 'Schema V2' | 'Serverless API' | 'Security';
  status: 'healthy' | 'degraded' | 'missing';
  latencyMs?: number;
  detail: string;
  checkedAt?: string;
}

export interface SaaSPlanDefinition {
  id: 'trial' | 'standard' | 'enterprise';
  name: string;
  tagline: string;
  maxStudents: number;
  maxMusammi: number;
  maxHalaqah: number;
  auditRetentionDays: number;
  features: string[];
}

export const SAAS_PLANS: SaaSPlanDefinition[] = [
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

export const SensitiveKeyPattern = /password|secret|token|api_key|apikey|authorization|hash/i;

export function sanitizeAuditPayload(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditPayload);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SensitiveKeyPattern.test(k)) {
        out[k] = '[REDACTED_SECRET]';
      } else {
        out[k] = sanitizeAuditPayload(v);
      }
    }
    return out;
  }
  return value;
}

export interface PlatformConsolePageProps {
  activeTab?: PlatformSection;
  activeSection?: PlatformSection;
  onNavigate?: (page: Page) => void;
  onNavigatePath?: (path: string) => void;
}

/** Fase 8b: label status untuk tampilan (bahasa Indonesia). Nilai di database tetap kode Inggris. */
export const labelStatus = (status?: string | null): string => {
  const k = String(status || '').toLowerCase();
  const peta: Record<string, string> = {
    active: 'AKTIF', suspended: 'DITANGGUHKAN', invited: 'DIUNDANG', revoked: 'DICABUT', expired: 'KEDALUWARSA',
    provisioning: 'DISIAPKAN', provisioning_failed: 'GAGAL DIBUAT', archived: 'DIARSIPKAN', trial: 'UJI COBA',
    pending: 'MENUNGGU', accepted: 'DITERIMA', ended: 'SELESAI', superadmin: 'SUPERADMIN', admin: 'ADMIN', musammi: "MUSAMMI'", system: 'SISTEM',
  };
  return peta[k] || k.toUpperCase();
};
