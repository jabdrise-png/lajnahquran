import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  ExternalLink,
  Monitor,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useLandingPageContent } from '../hooks/useLandingPageContent';
import { LandingPageConfig } from '../types/landingPage';
import { NotificationStore } from '../lib/NotificationStore';
import { Badge, Button, ConfirmDialog, Modal } from '../components/ui/SaaSPrimitives';
import LandingPage from './LandingPage';
import Login from './Login';

type EditorTabId =
  | 'theme'
  | 'hero'
  | 'features'
  | 'details'
  | 'pricing'
  | 'testimonials'
  | 'footer'
  | 'custom_pages'
  | 'login_page';

const EDITOR_TABS: Array<{ id: EditorTabId; label: string; isCore?: boolean }> = [
  { id: 'theme', label: '1. Tema & Umum', isCore: true },
  { id: 'hero', label: '2. Hero', isCore: true },
  { id: 'features', label: '3. Fitur', isCore: true },
  { id: 'details', label: '4. Cara Kerja', isCore: true },
  { id: 'pricing', label: '5. Harga/Plan', isCore: true },
  { id: 'testimonials', label: 'Testimoni' },
  { id: 'footer', label: 'Footer & CTA' },
  { id: 'custom_pages', label: 'Halaman Custom' },
  { id: 'login_page', label: 'Halaman Login' },
];

const DirtyBadge: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
      Diubah
    </span>
  );
};

const WebsiteEditorPage: React.FC = () => {
  const {
    draftConfig,
    publishedConfig,
    loading,
    error: backendError,
    lastDraftSavedAt,
    lastPublishedAt,
    updateDraftConfig,
    publishConfig,
    hasDraftChanges,
    clearError,
  } = useLandingPageContent();

  const [activeTab, setActiveTab] = useState<EditorTabId>('hero');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishReason, setPublishReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [localConfig, setLocalConfig] = useState<LandingPageConfig | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Unsaved navigation & reset dialogs
  const [pendingNavCallback, setPendingNavCallback] = useState<(() => void) | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Sync initial draftConfig from backend once loaded
  useEffect(() => {
    if (!loading && draftConfig && !localConfig) {
      const cloned: LandingPageConfig = JSON.parse(JSON.stringify(draftConfig));
      setLocalConfig(cloned);
    }
  }, [loading, draftConfig, localConfig]);

  const isDirty = useMemo(() => {
    if (!localConfig || !draftConfig) return false;
    return JSON.stringify(localConfig) !== JSON.stringify(draftConfig);
  }, [localConfig, draftConfig]);

  // Browser reload / close tab guard when dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Internal route change guard (Sidebar / Header navigation) when dirty
  useEffect(() => {
    if (isDirty) {
      (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__ = (_targetPath: string, proceed: () => void) => {
        setPendingNavCallback(() => proceed);
        return true;
      };
    } else {
      delete (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
    }
    return () => {
      delete (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
    };
  }, [isDirty]);

  const getSection = useCallback(
    (cfg: LandingPageConfig | null, id: string) => cfg?.sections.find((s) => s.id === id),
    []
  );

  // Field validation errors
  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!localConfig) return errs;
    if (!localConfig.theme?.appName?.trim()) {
      errs.appName = 'Nama aplikasi/brand wajib diisi.';
    }
    if (!localConfig.seo?.title?.trim()) {
      errs.seoTitle = 'Meta Title (SEO) wajib diisi.';
    }
    const hero = getSection(localConfig, 'hero');
    if (!hero?.data?.headline?.trim()) {
      errs.heroHeadline = 'Headline utama wajib diisi.';
    }
    if (!hero?.data?.buttonText?.trim()) {
      errs.heroButtonText = 'Teks tombol CTA utama wajib diisi.';
    }
    const feat = getSection(localConfig, 'features');
    if (!feat?.data?.title?.trim()) {
      errs.featuresTitle = 'Judul section fitur wajib diisi.';
    }
    const details = getSection(localConfig, 'details');
    if (!details?.data?.title?.trim()) {
      errs.detailsTitle = 'Judul section cara kerja wajib diisi.';
    }
    const pricing = getSection(localConfig, 'pricing');
    if (!pricing?.data?.title?.trim()) {
      errs.pricingTitle = 'Judul section paket/harga wajib diisi.';
    }
    return errs;
  }, [localConfig, getSection]);

  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  // Section-level dirty tracking compared to saved draftConfig
  const sectionDirtyMap = useMemo(() => {
    const map: Record<EditorTabId, boolean> = {
      theme: false,
      hero: false,
      features: false,
      details: false,
      pricing: false,
      testimonials: false,
      footer: false,
      custom_pages: false,
      login_page: false,
    };
    if (!localConfig || !draftConfig) return map;

    map.theme =
      JSON.stringify(localConfig.theme) !== JSON.stringify(draftConfig.theme) ||
      JSON.stringify(localConfig.seo) !== JSON.stringify(draftConfig.seo);
    map.hero =
      JSON.stringify(getSection(localConfig, 'hero')) !==
      JSON.stringify(getSection(draftConfig, 'hero'));
    map.features =
      JSON.stringify(getSection(localConfig, 'features')) !==
      JSON.stringify(getSection(draftConfig, 'features'));
    map.details =
      JSON.stringify(getSection(localConfig, 'details')) !==
      JSON.stringify(getSection(draftConfig, 'details'));
    map.pricing =
      JSON.stringify(getSection(localConfig, 'pricing')) !==
      JSON.stringify(getSection(draftConfig, 'pricing'));
    map.testimonials =
      JSON.stringify(getSection(localConfig, 'testimonials')) !==
      JSON.stringify(getSection(draftConfig, 'testimonials'));
    map.footer =
      JSON.stringify(localConfig.footer) !== JSON.stringify(draftConfig.footer) ||
      JSON.stringify(getSection(localConfig, 'cta')) !==
        JSON.stringify(getSection(draftConfig, 'cta'));
    map.custom_pages =
      JSON.stringify(localConfig.customPages || []) !==
      JSON.stringify(draftConfig.customPages || []);
    map.login_page =
      JSON.stringify(localConfig.loginPage || {}) !==
      JSON.stringify(draftConfig.loginPage || {});

    return map;
  }, [localConfig, draftConfig, getSection]);

  // Summary of changes between current localConfig and publishedConfig for the Publish confirmation dialog
  const publishDiffSummary = useMemo(() => {
    if (!localConfig || !publishedConfig) return [];
    const changes: string[] = [];

    if (
      JSON.stringify(localConfig.theme) !== JSON.stringify(publishedConfig.theme) ||
      JSON.stringify(localConfig.seo) !== JSON.stringify(publishedConfig.seo)
    ) {
      changes.push('Tema Brand, Identitas Aplikasi & Metadata SEO');
    }
    if (
      JSON.stringify(getSection(localConfig, 'hero')) !==
      JSON.stringify(getSection(publishedConfig, 'hero'))
    ) {
      changes.push('Hero Section (Announcement, Headline, Deskripsi & Tombol CTA)');
    }
    if (
      JSON.stringify(getSection(localConfig, 'features')) !==
      JSON.stringify(getSection(publishedConfig, 'features'))
    ) {
      changes.push('Section Fitur Unggulan');
    }
    if (
      JSON.stringify(getSection(localConfig, 'details')) !==
      JSON.stringify(getSection(publishedConfig, 'details'))
    ) {
      changes.push('Section Cara Kerja & Tahapan Implementasi');
    }
    if (
      JSON.stringify(getSection(localConfig, 'pricing')) !==
      JSON.stringify(getSection(publishedConfig, 'pricing'))
    ) {
      changes.push('Section Paket & Kapasitas Lembaga');
    }
    if (
      JSON.stringify(getSection(localConfig, 'testimonials')) !==
      JSON.stringify(getSection(publishedConfig, 'testimonials'))
    ) {
      changes.push('Section Testimoni Mitra Lembaga');
    }
    if (
      JSON.stringify(localConfig.footer) !== JSON.stringify(publishedConfig.footer) ||
      JSON.stringify(getSection(localConfig, 'cta')) !==
        JSON.stringify(getSection(publishedConfig, 'cta'))
    ) {
      changes.push('Section Penutup (CTA Bawah) & Informasi Footer');
    }
    if (
      JSON.stringify(localConfig.customPages || []) !==
      JSON.stringify(publishedConfig.customPages || [])
    ) {
      changes.push('Daftar Halaman Artikel / Panduan Custom');
    }
    if (
      JSON.stringify(localConfig.loginPage || {}) !==
      JSON.stringify(publishedConfig.loginPage || {})
    ) {
      changes.push('Konfigurasi Tampilan Halaman Login');
    }

    return changes;
  }, [localConfig, publishedConfig, getSection]);

  if (loading && !localConfig) {
    return (
      <div className="p-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent" />
        <p className="mt-3 text-xs font-medium text-[#667085]">
          Memuat konfigurasi Website Editor dari server...
        </p>
      </div>
    );
  }

  if (!localConfig) return null;

  const updateSectionData = (id: string, dataObj: Record<string, any>) => {
    setStatusFeedback(null);
    setLocalConfig({
      ...localConfig,
      sections: localConfig.sections.map((s) =>
        s.id === id ? { ...s, data: { ...s.data, ...dataObj } } : s
      ),
    });
  };

  const updateTheme = (key: string, value: string) => {
    setStatusFeedback(null);
    setLocalConfig({ ...localConfig, theme: { ...localConfig.theme, [key]: value } });
  };

  const updateSEO = (key: string, value: string) => {
    setStatusFeedback(null);
    setLocalConfig({ ...localConfig, seo: { ...localConfig.seo, [key]: value } });
  };

  const updateFooter = (key: string, value: string) => {
    setStatusFeedback(null);
    setLocalConfig({ ...localConfig, footer: { ...localConfig.footer, [key]: value } });
  };

  const handleSaveDraft = async () => {
    if (hasValidationErrors) {
      setStatusFeedback({
        type: 'error',
        message: 'Mohon lengkapi seluruh field wajib yang ditandai merah sebelum menyimpan draft.',
      });
      NotificationStore.addNotification(
        'Masih ada field wajib yang kosong pada editor.',
        'error'
      );
      return;
    }

    clearError();
    setStatusFeedback(null);
    setIsSaving(true);
    const ok = await updateDraftConfig(localConfig);
    setIsSaving(false);

    if (ok) {
      setStatusFeedback({
        type: 'success',
        message: 'Draft berhasil disimpan ke database server.',
      });
      NotificationStore.addNotification('Draft berhasil disimpan ke server.', 'success');
    } else {
      setStatusFeedback({
        type: 'error',
        message:
          backendError ||
          'Gagal menyimpan draft ke server. Perubahan lokal Anda tetap dipertahankan.',
      });
      NotificationStore.addNotification('Gagal menyimpan draft ke server.', 'error');
    }
  };

  const handleConfirmPublish = async () => {
    if (hasValidationErrors) {
      setStatusFeedback({
        type: 'error',
        message: 'Mohon perbaiki field yang belum valid sebelum mempublikasikan.',
      });
      return;
    }

    clearError();
    setStatusFeedback(null);
    setIsPublishing(true);
    const ok = await publishConfig(
      localConfig,
      publishReason.trim() || 'Publikasi versi baru dari Website Editor Superadmin'
    );
    setIsPublishing(false);

    if (ok) {
      setPublishModalOpen(false);
      setPublishReason('');
      setStatusFeedback({
        type: 'success',
        message: 'Landing page berhasil dipublikasikan dan kini aktif di halaman publik!',
      });
      NotificationStore.addNotification(
        'Landing page berhasil dipublikasikan ke versi publik!',
        'success'
      );
    } else {
      setStatusFeedback({
        type: 'error',
        message:
          backendError ||
          'Gagal mempublikasikan landing page. Silakan periksa koneksi atau coba kembali.',
      });
      NotificationStore.addNotification('Gagal mempublikasikan landing page.', 'error');
    }
  };

  const handleResetToSavedDraft = () => {
    const cloned: LandingPageConfig = JSON.parse(JSON.stringify(draftConfig));
    setLocalConfig(cloned);
    setResetConfirmOpen(false);
    setStatusFeedback({
      type: 'info',
      message: 'Perubahan lokal dibatalkan dan dikembalikan ke draft terakhir di server.',
    });
  };

  const heroSec = getSection(localConfig, 'hero');
  const draftHeroSec = getSection(draftConfig, 'hero');
  const featSec = getSection(localConfig, 'features');
  const draftFeatSec = getSection(draftConfig, 'features');
  const detailsSec = getSection(localConfig, 'details');
  const draftDetailsSec = getSection(draftConfig, 'details');
  const pricingSec = getSection(localConfig, 'pricing');
  const draftPricingSec = getSection(draftConfig, 'pricing');
  const testSec = getSection(localConfig, 'testimonials');
  const ctaSec = getSection(localConfig, 'cta');
  const draftCtaSec = getSection(draftConfig, 'cta');

  const announcementBadge =
    (heroSec?.data as any)?.badgeText ??
    localConfig.seo?.description ??
    'Platform manajemen tahfidz generasi baru';
  const draftAnnouncementBadge =
    (draftHeroSec?.data as any)?.badgeText ??
    draftConfig.seo?.description ??
    'Platform manajemen tahfidz generasi baru';

  const secondaryCtaText = (heroSec?.data as any)?.secondaryButtonText ?? 'Lihat cara kerja';
  const draftSecondaryCtaText =
    (draftHeroSec?.data as any)?.secondaryButtonText ?? 'Lihat cara kerja';

  const formatShortTime = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  return (
    <div className="-m-4 flex min-h-[calc(100vh-4rem)] flex-col bg-white sm:-m-6 lg:-m-8 relative z-0">
      {/* Top Toolbar (Static / Non-overlapping) */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E7EF] bg-white px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-[#101828] tracking-tight">
                Website Editor
              </h1>

              {/* Status Perubahan */}
              {isDirty ? (
                <Badge tone="warning" dot label="Perubahan belum disimpan" />
              ) : (
                <Badge
                  tone="success"
                  dot
                  label={
                    lastDraftSavedAt
                      ? `Draft tersimpan (${formatShortTime(lastDraftSavedAt)})`
                      : 'Draft tersimpan di server'
                  }
                />
              )}

              {/* Status Publikasi */}
              {hasDraftChanges || isDirty ? (
                <Badge tone="info" label="Memiliki Draft Belum Dipublish" />
              ) : (
                <Badge tone="neutral" label="Sinkron dengan Publik" />
              )}
            </div>
            <p className="mt-0.5 text-xs text-[#667085] truncate">
              Kelola konten halaman publik <span className="font-mono text-[#1557D5]">/</span> dengan
              penyimpanan draft dan publikasi langsung ke database produksi.
              {lastPublishedAt && (
                <span className="hidden xl:inline">
                  {' '}
                  · Terakhir dipublish {formatShortTime(lastPublishedAt)}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Desktop / Mobile Viewport Switcher */}
          <div
            role="group"
            aria-label="Pilih ukuran layar preview"
            className="hidden rounded-[12px] bg-[#F3F6FB] p-1 border border-[#E1E7EF] sm:flex"
          >
            <button
              type="button"
              aria-pressed={device === 'desktop'}
              onClick={() => setDevice('desktop')}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-3 text-xs font-semibold transition-all ${
                device === 'desktop'
                  ? 'bg-white text-[#101828] shadow-2xs border border-[#E1E7EF]'
                  : 'text-[#667085] hover:text-[#101828]'
              }`}
            >
              <Monitor size={14} />
              Desktop
            </button>
            <button
              type="button"
              aria-pressed={device === 'mobile'}
              onClick={() => setDevice('mobile')}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-3 text-xs font-semibold transition-all ${
                device === 'mobile'
                  ? 'bg-white text-[#101828] shadow-2xs border border-[#E1E7EF]'
                  : 'text-[#667085] hover:text-[#101828]'
              }`}
            >
              <Smartphone size={14} />
              Mobile
            </button>
          </div>

          {/* Link to Public Page */}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs font-semibold text-[#475467] hover:bg-[#F8FAFC] hover:text-[#101828] transition-colors"
            title="Buka halaman publik di tab baru"
          >
            <ExternalLink size={14} />
            Lihat Publik
          </a>

          {/* Reset Unsaved Changes */}
          {isDirty && (
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#F8FAFC] hover:text-[#101828] transition-colors"
              title="Kembalikan ke draft terakhir yang tersimpan"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {/* Simpan Draft */}
          <button
            type="button"
            disabled={!isDirty || isSaving || isPublishing}
            onClick={handleSaveDraft}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#E1E7EF] bg-white px-3.5 py-2 text-xs font-semibold text-[#101828] hover:bg-[#F8FAFC] disabled:opacity-45 transition-colors"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin text-[#2563EB]" /> : <Save size={14} />}
            {isSaving ? 'Menyimpan...' : 'Simpan draft'}
          </button>

          {/* Publish */}
          <button
            type="button"
            disabled={isPublishing || isSaving}
            onClick={() => setPublishModalOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#1557D5] disabled:opacity-50 transition-colors"
          >
            <Eye size={14} />
            Publish
          </button>
        </div>
      </div>

      {/* Inline Status / Error Feedback Banner */}
      {(statusFeedback || backendError) && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs font-medium sm:px-6 ${
            statusFeedback?.type === 'error' || backendError
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : statusFeedback?.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusFeedback?.type === 'error' || backendError ? (
              <AlertTriangle size={15} className="shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            )}
            <span>{statusFeedback?.message || backendError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusFeedback(null);
              clearError();
            }}
            className="text-[11px] font-semibold underline hover:opacity-80"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Unified Editor + Full Page Workspace */}
      <div className="grid flex-1 min-h-0 lg:grid-cols-[440px_1fr] xl:grid-cols-[460px_1fr]">
        {/* Left Editor Panel */}
        <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-[#E1E7EF] bg-white">
          {/* Section Navigation Tabs */}
          <div
            role="tablist"
            aria-label="Bagian konten landing page"
            className="flex overflow-x-auto border-b border-[#E1E7EF] bg-[#F8FAFC]/60 p-2 gap-1 custom-scrollbar"
          >
            {EDITOR_TABS.map((tab) => {
              const isSectionDirty = sectionDirtyMap[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#E7F0FF] text-[#1557D5] border border-[#BFDBFE]/60 shadow-2xs'
                      : 'text-[#667085] hover:bg-white hover:text-[#101828]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {isSectionDirty && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      title="Bagian ini memiliki perubahan belum disimpan"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Form Controls */}
          <div className="grid gap-5 p-5 pb-24 lg:pb-8">
            {/* TAB 1: TEMA & UMUM */}
            {activeTab === 'theme' && (
              <>
                <div>
                  <label
                    htmlFor="cms-announcement"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Announcement Badge
                    <DirtyBadge show={announcementBadge !== draftAnnouncementBadge} />
                  </label>
                  <input
                    id="cms-announcement"
                    type="text"
                    value={announcementBadge}
                    onChange={(e) => updateSectionData('hero', { badgeText: e.target.value })}
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cms-app-name"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Nama Aplikasi / Brand <span className="ml-1 text-rose-600">*</span>
                    <DirtyBadge show={localConfig.theme.appName !== draftConfig.theme.appName} />
                  </label>
                  <input
                    id="cms-app-name"
                    type="text"
                    value={localConfig.theme.appName}
                    onChange={(e) => updateTheme('appName', e.target.value)}
                    className={`w-full rounded-[12px] border px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:ring-2 ${
                      validationErrors.appName
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                        : 'border-[#E1E7EF] focus:border-[#2563EB] focus:ring-[#2563EB]/15'
                    }`}
                  />
                  {validationErrors.appName && (
                    <p className="mt-1 text-xs text-rose-600">{validationErrors.appName}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cms-primary-color"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Warna Aksen Utama (Hex)
                    <DirtyBadge
                      show={localConfig.theme.primaryColor !== draftConfig.theme.primaryColor}
                    />
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      id="cms-primary-color"
                      type="color"
                      value={localConfig.theme.primaryColor || '#2563eb'}
                      onChange={(e) => updateTheme('primaryColor', e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-[10px] border border-[#E1E7EF] bg-white p-1"
                    />
                    <input
                      type="text"
                      aria-label="Kode hex warna aksen"
                      value={localConfig.theme.primaryColor || '#2563eb'}
                      onChange={(e) => updateTheme('primaryColor', e.target.value)}
                      className="flex-1 rounded-[12px] border border-[#E1E7EF] px-3.5 py-2 text-sm font-mono text-[#101828] outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cms-seo-title"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Meta Title (SEO) <span className="ml-1 text-rose-600">*</span>
                    <DirtyBadge show={localConfig.seo.title !== draftConfig.seo.title} />
                  </label>
                  <input
                    id="cms-seo-title"
                    type="text"
                    value={localConfig.seo.title}
                    onChange={(e) => updateSEO('title', e.target.value)}
                    className={`w-full rounded-[12px] border px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:ring-2 ${
                      validationErrors.seoTitle
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                        : 'border-[#E1E7EF] focus:border-[#2563EB] focus:ring-[#2563EB]/15'
                    }`}
                  />
                  {validationErrors.seoTitle && (
                    <p className="mt-1 text-xs text-rose-600">{validationErrors.seoTitle}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cms-seo-description"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Meta Description (SEO)
                    <DirtyBadge
                      show={localConfig.seo.description !== draftConfig.seo.description}
                    />
                  </label>
                  <textarea
                    id="cms-seo-description"
                    rows={3}
                    value={localConfig.seo.description}
                    onChange={(e) => updateSEO('description', e.target.value)}
                    className="w-full rounded-[12px] border border-[#E1E7EF] p-3.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="rounded-[14px] border border-[#BFDBFE] bg-[#F3F7FF] p-4">
                  <div className="text-xs font-bold text-[#101828]">Standar Desain Platform</div>
                  <p className="mt-1 text-xs text-[#475467]">
                    Royal Blue & Slate · Plus Jakarta Sans · Enterprise Multi-Tenant SaaS
                  </p>
                </div>
              </>
            )}

            {/* TAB 2: HERO */}
            {activeTab === 'hero' && heroSec && (
              <>
                <div>
                  <label
                    htmlFor="cms-hero-badge"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Label Pengumuman Atas (Badge)
                    <DirtyBadge show={announcementBadge !== draftAnnouncementBadge} />
                  </label>
                  <input
                    id="cms-hero-badge"
                    type="text"
                    value={announcementBadge}
                    onChange={(e) => updateSectionData('hero', { badgeText: e.target.value })}
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cms-hero-headline"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Headline <span className="ml-1 text-rose-600">*</span>
                    <DirtyBadge
                      show={heroSec.data.headline !== draftHeroSec?.data?.headline}
                    />
                  </label>
                  <textarea
                    id="cms-hero-headline"
                    rows={3}
                    value={heroSec.data.headline}
                    onChange={(e) => updateSectionData('hero', { headline: e.target.value })}
                    className={`w-full rounded-[12px] border p-3.5 text-sm text-[#101828] outline-none focus:ring-2 ${
                      validationErrors.heroHeadline
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                        : 'border-[#E1E7EF] focus:border-[#2563EB] focus:ring-[#2563EB]/15'
                    }`}
                  />
                  {validationErrors.heroHeadline && (
                    <p className="mt-1 text-xs text-rose-600">{validationErrors.heroHeadline}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cms-hero-subheadline"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Deskripsi
                    <DirtyBadge
                      show={heroSec.data.subheadline !== draftHeroSec?.data?.subheadline}
                    />
                  </label>
                  <textarea
                    id="cms-hero-subheadline"
                    rows={3}
                    value={heroSec.data.subheadline}
                    onChange={(e) => updateSectionData('hero', { subheadline: e.target.value })}
                    className="w-full rounded-[12px] border border-[#E1E7EF] p-3.5 text-sm text-[#101828] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="cms-hero-cta-primary"
                      className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                    >
                      CTA utama <span className="ml-1 text-rose-600">*</span>
                      <DirtyBadge
                        show={heroSec.data.buttonText !== draftHeroSec?.data?.buttonText}
                      />
                    </label>
                    <input
                      id="cms-hero-cta-primary"
                      type="text"
                      value={heroSec.data.buttonText}
                      onChange={(e) => updateSectionData('hero', { buttonText: e.target.value })}
                      className={`w-full rounded-[12px] border px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:ring-2 ${
                        validationErrors.heroButtonText
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                          : 'border-[#E1E7EF] focus:border-[#2563EB] focus:ring-[#2563EB]/15'
                      }`}
                    />
                    {validationErrors.heroButtonText && (
                      <p className="mt-1 text-xs text-rose-600">
                        {validationErrors.heroButtonText}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="cms-hero-cta-secondary"
                      className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                    >
                      CTA kedua
                      <DirtyBadge show={secondaryCtaText !== draftSecondaryCtaText} />
                    </label>
                    <input
                      id="cms-hero-cta-secondary"
                      type="text"
                      value={secondaryCtaText}
                      onChange={(e) =>
                        updateSectionData('hero', { secondaryButtonText: e.target.value })
                      }
                      className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cms-hero-cta-link"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Tautan CTA Utama (URL / Rute)
                    <DirtyBadge
                      show={heroSec.data.buttonLink !== draftHeroSec?.data?.buttonLink}
                    />
                  </label>
                  <input
                    id="cms-hero-cta-link"
                    type="text"
                    value={heroSec.data.buttonLink || '/login'}
                    onChange={(e) => updateSectionData('hero', { buttonLink: e.target.value })}
                    placeholder="/login atau https://wa.me/..."
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </>
            )}

            {/* TAB 3: FITUR */}
            {activeTab === 'features' && featSec && (
              <div className="grid gap-4">
                <div>
                  <label
                    htmlFor="cms-features-title"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Judul Section Fitur <span className="ml-1 text-rose-600">*</span>
                    <DirtyBadge show={featSec.data.title !== draftFeatSec?.data?.title} />
                  </label>
                  <input
                    id="cms-features-title"
                    type="text"
                    value={featSec.data.title}
                    onChange={(e) => updateSectionData('features', { title: e.target.value })}
                    className={`w-full rounded-[12px] border px-3.5 py-2.5 text-sm text-[#101828] outline-none ${
                      validationErrors.featuresTitle
                        ? 'border-rose-400'
                        : 'border-[#E1E7EF] focus:border-[#2563EB]'
                    }`}
                  />
                  {validationErrors.featuresTitle && (
                    <p className="mt-1 text-xs text-rose-600">{validationErrors.featuresTitle}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cms-features-desc"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Subjudul Section Fitur
                    <DirtyBadge
                      show={featSec.data.description !== draftFeatSec?.data?.description}
                    />
                  </label>
                  <input
                    id="cms-features-desc"
                    type="text"
                    value={featSec.data.description || ''}
                    onChange={(e) =>
                      updateSectionData('features', { description: e.target.value })
                    }
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-[#101828]">
                    Daftar fitur ({(featSec.data.features || []).length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSectionData('features', {
                        features: [
                          ...(featSec.data.features || []),
                          {
                            id: Date.now().toString(),
                            icon: 'CheckCircle2',
                            title: 'Fitur baru',
                            description: 'Terintegrasi, aman, dan siap digunakan oleh tim.',
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-[8px] bg-[#E7F0FF] px-2.5 py-1.5 text-xs font-semibold text-[#1557D5] hover:bg-blue-100"
                  >
                    <Plus size={14} /> Tambah Fitur
                  </button>
                </div>

                {(featSec.data.features || []).map((f: any, idx: number) => (
                  <div
                    key={f.id || idx}
                    className="rounded-[12px] border border-[#E1E7EF] p-3.5 space-y-2.5 bg-[#F8FAFC]/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`cms-feature-title-${idx}`}
                        className="text-[11px] font-bold uppercase tracking-wider text-[#667085]"
                      >
                        Fitur #{idx + 1}
                      </label>
                      <button
                        type="button"
                        aria-label={`Hapus fitur ${f.title || idx + 1}`}
                        onClick={() =>
                          updateSectionData('features', {
                            features: featSec.data.features.filter(
                              (_: any, i: number) => i !== idx
                            ),
                          })
                        }
                        className="rounded-lg p-1.5 text-[#667085] hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      id={`cms-feature-title-${idx}`}
                      type="text"
                      value={f.title}
                      onChange={(e) =>
                        updateSectionData('features', {
                          features: featSec.data.features.map((item: any, i: number) =>
                            i === idx ? { ...item, title: e.target.value } : item
                          ),
                        })
                      }
                      placeholder="Judul fitur"
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-2 text-sm font-medium text-[#101828] outline-none focus:border-[#2563EB]"
                    />
                    <textarea
                      rows={2}
                      aria-label={`Deskripsi fitur ${idx + 1}`}
                      value={f.description}
                      onChange={(e) =>
                        updateSectionData('features', {
                          features: featSec.data.features.map((item: any, i: number) =>
                            i === idx ? { ...item, description: e.target.value } : item
                          ),
                        })
                      }
                      placeholder="Deskripsi singkat fitur"
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white p-2.5 text-xs text-[#475467] outline-none focus:border-[#2563EB]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* TAB 4: CARA KERJA */}
            {activeTab === 'details' && detailsSec && (
              <div className="grid gap-4">
                <div>
                  <label
                    htmlFor="cms-details-title"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Judul Cara Kerja <span className="ml-1 text-rose-600">*</span>
                    <DirtyBadge
                      show={detailsSec.data.title !== draftDetailsSec?.data?.title}
                    />
                  </label>
                  <input
                    id="cms-details-title"
                    type="text"
                    value={detailsSec.data.title}
                    onChange={(e) => updateSectionData('details', { title: e.target.value })}
                    className={`w-full rounded-[12px] border px-3.5 py-2.5 text-sm text-[#101828] outline-none ${
                      validationErrors.detailsTitle
                        ? 'border-rose-400'
                        : 'border-[#E1E7EF] focus:border-[#2563EB]'
                    }`}
                  />
                  {validationErrors.detailsTitle && (
                    <p className="mt-1 text-xs text-rose-600">{validationErrors.detailsTitle}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cms-details-desc"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Deskripsi Cara Kerja
                    <DirtyBadge
                      show={detailsSec.data.description !== draftDetailsSec?.data?.description}
                    />
                  </label>
                  <textarea
                    id="cms-details-desc"
                    rows={2}
                    value={detailsSec.data.description || ''}
                    onChange={(e) =>
                      updateSectionData('details', { description: e.target.value })
                    }
                    className="w-full rounded-[12px] border border-[#E1E7EF] p-3 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-[#101828]">
                    Tahapan implementasi ({(detailsSec.data.items || []).length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSectionData('details', {
                        items: [
                          ...(detailsSec.data.items || []),
                          {
                            id: Date.now().toString(),
                            icon: 'CheckCircle2',
                            title: 'Tahap baru',
                            description: 'Penjelasan tahap implementasi lembaga.',
                            imageUrl: '',
                            bullets: [],
                            imageRight: false,
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-[8px] bg-[#E7F0FF] px-2.5 py-1.5 text-xs font-semibold text-[#1557D5] hover:bg-blue-100"
                  >
                    <Plus size={14} /> Tambah Tahap
                  </button>
                </div>

                {(detailsSec.data.items || []).map((item: any, idx: number) => (
                  <div
                    key={item.id || idx}
                    className="rounded-[12px] border border-[#E1E7EF] p-3.5 space-y-2.5 bg-[#F8FAFC]/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`cms-step-title-${idx}`}
                        className="text-[11px] font-bold uppercase tracking-wider text-[#667085]"
                      >
                        Langkah #{idx + 1}
                      </label>
                      <button
                        type="button"
                        aria-label={`Hapus langkah ${item.title || idx + 1}`}
                        onClick={() =>
                          updateSectionData('details', {
                            items: detailsSec.data.items.filter((_: any, i: number) => i !== idx),
                          })
                        }
                        className="rounded-lg p-1.5 text-[#667085] hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      id={`cms-step-title-${idx}`}
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        updateSectionData('details', {
                          items: detailsSec.data.items.map((it: any, i: number) =>
                            i === idx ? { ...it, title: e.target.value } : it
                          ),
                        })
                      }
                      placeholder="Judul langkah"
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-2 text-sm font-medium text-[#101828] outline-none focus:border-[#2563EB]"
                    />
                    <textarea
                      rows={2}
                      aria-label={`Deskripsi langkah ${idx + 1}`}
                      value={item.description || ''}
                      onChange={(e) =>
                        updateSectionData('details', {
                          items: detailsSec.data.items.map((it: any, i: number) =>
                            i === idx ? { ...it, description: e.target.value } : it
                          ),
                        })
                      }
                      placeholder="Penjelasan langkah"
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white p-2.5 text-xs text-[#475467] outline-none focus:border-[#2563EB]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* TAB 5: HARGA / PLAN */}
            {activeTab === 'pricing' && pricingSec && (
              <div className="grid gap-4">
                <div>
                  <label
                    htmlFor="cms-pricing-title"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Judul Section Paket <span className="ml-1 text-rose-600">*</span>
                    <DirtyBadge
                      show={pricingSec.data.title !== draftPricingSec?.data?.title}
                    />
                  </label>
                  <input
                    id="cms-pricing-title"
                    type="text"
                    value={pricingSec.data.title || ''}
                    onChange={(e) => updateSectionData('pricing', { title: e.target.value })}
                    className={`w-full rounded-[12px] border px-3.5 py-2.5 text-sm text-[#101828] outline-none ${
                      validationErrors.pricingTitle
                        ? 'border-rose-400'
                        : 'border-[#E1E7EF] focus:border-[#2563EB]'
                    }`}
                  />
                  {validationErrors.pricingTitle && (
                    <p className="mt-1 text-xs text-rose-600">{validationErrors.pricingTitle}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cms-pricing-desc"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Subjudul Section Paket
                    <DirtyBadge
                      show={pricingSec.data.description !== draftPricingSec?.data?.description}
                    />
                  </label>
                  <input
                    id="cms-pricing-desc"
                    type="text"
                    value={pricingSec.data.description || ''}
                    onChange={(e) =>
                      updateSectionData('pricing', { description: e.target.value })
                    }
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>

                {(pricingSec.data.plans || []).map((plan: any, idx: number) => (
                  <div
                    key={plan.id || idx}
                    className="rounded-[12px] border border-[#E1E7EF] p-3.5 space-y-2.5 bg-[#F8FAFC]/60"
                  >
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`cms-plan-name-${idx}`}
                        className="text-xs font-bold uppercase text-[#1557D5]"
                      >
                        Paket {idx + 1}
                      </label>
                      {plan.isRecommended && (
                        <span className="rounded bg-[#E7F0FF] px-2 py-0.5 text-[10px] font-bold text-[#1557D5]">
                          Rekomendasi
                        </span>
                      )}
                    </div>
                    <input
                      id={`cms-plan-name-${idx}`}
                      type="text"
                      value={plan.name}
                      onChange={(e) =>
                        updateSectionData('pricing', {
                          plans: pricingSec.data.plans.map((p: any, i: number) =>
                            i === idx ? { ...p, name: e.target.value } : p
                          ),
                        })
                      }
                      placeholder="Nama paket"
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-2 text-sm font-semibold text-[#101828] outline-none focus:border-[#2563EB]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor={`cms-plan-price-${idx}`}
                          className="mb-1 block text-[11px] font-medium text-[#667085]"
                        >
                          Harga
                        </label>
                        <input
                          id={`cms-plan-price-${idx}`}
                          type="text"
                          value={plan.price}
                          onChange={(e) =>
                            updateSectionData('pricing', {
                              plans: pricingSec.data.plans.map((p: any, i: number) =>
                                i === idx ? { ...p, price: e.target.value } : p
                              ),
                            })
                          }
                          placeholder="Harga"
                          className="w-full rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs text-[#101828] outline-none focus:border-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`cms-plan-cap-${idx}`}
                          className="mb-1 block text-[11px] font-medium text-[#667085]"
                        >
                          Label Kapasitas
                        </label>
                        <input
                          id={`cms-plan-cap-${idx}`}
                          type="text"
                          value={plan.capacityLabel || ''}
                          onChange={(e) =>
                            updateSectionData('pricing', {
                              plans: pricingSec.data.plans.map((p: any, i: number) =>
                                i === idx ? { ...p, capacityLabel: e.target.value } : p
                              ),
                            })
                          }
                          placeholder="Kapasitas"
                          className="w-full rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs text-[#101828] outline-none focus:border-[#2563EB]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 6: TESTIMONI */}
            {activeTab === 'testimonials' && testSec && (
              <div className="grid gap-4">
                {(testSec.data.testimonials || []).map((t: any, idx: number) => (
                  <div
                    key={t.id || idx}
                    className="rounded-[12px] border border-[#E1E7EF] p-3.5 space-y-2.5 bg-[#F8FAFC]/60"
                  >
                    <label
                      htmlFor={`cms-testi-quote-${idx}`}
                      className="block text-xs font-semibold text-[#101828]"
                    >
                      Testimoni #{idx + 1}
                    </label>
                    <textarea
                      id={`cms-testi-quote-${idx}`}
                      rows={3}
                      value={t.quote}
                      onChange={(e) =>
                        updateSectionData('testimonials', {
                          testimonials: testSec.data.testimonials.map((item: any, i: number) =>
                            i === idx ? { ...item, quote: e.target.value } : item
                          ),
                        })
                      }
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white p-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label={`Nama pemberi testimoni ${idx + 1}`}
                        value={t.name}
                        onChange={(e) =>
                          updateSectionData('testimonials', {
                            testimonials: testSec.data.testimonials.map((item: any, i: number) =>
                              i === idx ? { ...item, name: e.target.value } : item
                            ),
                          })
                        }
                        placeholder="Nama tokoh"
                        className="rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs text-[#101828]"
                      />
                      <input
                        type="text"
                        aria-label={`Jabatan pemberi testimoni ${idx + 1}`}
                        value={t.role}
                        onChange={(e) =>
                          updateSectionData('testimonials', {
                            testimonials: testSec.data.testimonials.map((item: any, i: number) =>
                              i === idx ? { ...item, role: e.target.value } : item
                            ),
                          })
                        }
                        placeholder="Jabatan / Lembaga"
                        className="rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs text-[#101828]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 7: DOKUMENTASI & FOOTER */}
            {activeTab === 'footer' && (
              <div className="grid gap-4">
                <div>
                  <label
                    htmlFor="cms-footer-desc"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Deskripsi Footer
                    <DirtyBadge
                      show={localConfig.footer.description !== draftConfig.footer.description}
                    />
                  </label>
                  <textarea
                    id="cms-footer-desc"
                    rows={3}
                    value={localConfig.footer.description}
                    onChange={(e) => updateFooter('description', e.target.value)}
                    className="w-full rounded-[12px] border border-[#E1E7EF] p-3 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cms-footer-wa"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Kontak WhatsApp / Email Publik
                    <DirtyBadge
                      show={localConfig.footer.whatsapp !== draftConfig.footer.whatsapp}
                    />
                  </label>
                  <input
                    id="cms-footer-wa"
                    type="text"
                    value={localConfig.footer.whatsapp}
                    onChange={(e) => updateFooter('whatsapp', e.target.value)}
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cms-footer-ig"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Link Instagram
                    <DirtyBadge
                      show={localConfig.footer.instagram !== draftConfig.footer.instagram}
                    />
                  </label>
                  <input
                    id="cms-footer-ig"
                    type="text"
                    value={localConfig.footer.instagram}
                    onChange={(e) => updateFooter('instagram', e.target.value)}
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>
                {ctaSec && (
                  <div>
                    <label
                      htmlFor="cms-cta-bottom"
                      className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                    >
                      Judul Penutup (CTA Bawah)
                      <DirtyBadge show={ctaSec.data.title !== draftCtaSec?.data?.title} />
                    </label>
                    <input
                      id="cms-cta-bottom"
                      type="text"
                      value={ctaSec.data.title}
                      onChange={(e) => updateSectionData('cta', { title: e.target.value })}
                      className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* TAB 8: HALAMAN CUSTOM */}
            {activeTab === 'custom_pages' && (
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#101828]">
                    Halaman artikel / panduan ({(localConfig.customPages || []).length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLocalConfig({
                        ...localConfig,
                        customPages: [
                          ...(localConfig.customPages || []),
                          {
                            id: Date.now().toString(),
                            slug: `halaman-${Date.now().toString().slice(-4)}`,
                            menuTitle: 'Halaman Baru',
                            title: 'Halaman Baru',
                            sections: [],
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-[8px] bg-[#E7F0FF] px-2.5 py-1.5 text-xs font-semibold text-[#1557D5] hover:bg-blue-100"
                  >
                    <Plus size={14} /> Tambah Halaman
                  </button>
                </div>
                {(localConfig.customPages || []).map((page, pIdx) => (
                  <div
                    key={page.id}
                    className="rounded-[12px] border border-[#E1E7EF] p-3.5 space-y-2.5 bg-[#F8FAFC]/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        aria-label={`Judul halaman custom ${pIdx + 1}`}
                        value={page.menuTitle || page.title || ''}
                        onChange={(e) =>
                          setLocalConfig({
                            ...localConfig,
                            customPages: localConfig.customPages!.map((p) =>
                              p.id === page.id
                                ? { ...p, menuTitle: e.target.value, title: e.target.value }
                                : p
                            ),
                          })
                        }
                        className="flex-1 rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-sm font-semibold text-[#101828]"
                      />
                      <button
                        type="button"
                        aria-label={`Hapus halaman ${page.title || pIdx + 1}`}
                        onClick={() =>
                          setLocalConfig({
                            ...localConfig,
                            customPages: localConfig.customPages!.filter((p) => p.id !== page.id),
                          })
                        }
                        className="rounded-lg p-1.5 text-[#667085] hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <input
                      type="text"
                      aria-label={`Slug halaman custom ${pIdx + 1}`}
                      value={page.slug}
                      onChange={(e) =>
                        setLocalConfig({
                          ...localConfig,
                          customPages: localConfig.customPages!.map((p) =>
                            p.id === page.id
                              ? { ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }
                              : p
                          ),
                        })
                      }
                      placeholder="slug-halaman"
                      className="w-full rounded-[10px] border border-[#E1E7EF] bg-white px-3 py-1.5 text-xs font-mono text-[#475467]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* TAB 9: HALAMAN LOGIN */}
            {activeTab === 'login_page' && (
              <div className="grid gap-4">
                <div>
                  <label
                    htmlFor="cms-login-status"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Status Sistem di Halaman Login
                  </label>
                  <input
                    id="cms-login-status"
                    type="text"
                    value={localConfig.loginPage?.systemStatusText || ''}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        loginPage: {
                          ...(localConfig.loginPage || ({} as any)),
                          systemStatusText: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-[12px] border border-[#E1E7EF] px-3.5 py-2.5 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cms-login-quote"
                    className="mb-1.5 flex items-center text-xs font-semibold text-[#101828]"
                  >
                    Teks Kutipan Login
                  </label>
                  <textarea
                    id="cms-login-quote"
                    rows={3}
                    value={localConfig.loginPage?.quoteText || ''}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        loginPage: {
                          ...(localConfig.loginPage || ({} as any)),
                          quoteText: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-[12px] border border-[#E1E7EF] p-3 text-sm text-[#101828] outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Unified Full Page Preview */}
        <div className="flex flex-col min-h-0 overflow-x-hidden bg-[#F3F6FB] p-4 sm:p-6 pb-12">
          {activeTab === 'login_page' ? (
            <div
              className={`mx-auto overflow-hidden rounded-[20px] border border-[#E1E7EF] bg-white shadow-xl transition-all ${
                device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full max-w-6xl'
              }`}
            >
              <Login configOverrides={localConfig} onBack={() => {}} />
            </div>
          ) : (
            <div
              className={`mx-auto overflow-hidden rounded-[20px] border border-[#E1E7EF] bg-white shadow-xl transition-all ${
                device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full max-w-6xl'
              }`}
            >
              <LandingPage configOverrides={localConfig} />
            </div>
          )}
        </div>
      </div>

      {/* Publish Confirmation Modal */}
      <Modal
        isOpen={publishModalOpen}
        onClose={() => !isPublishing && setPublishModalOpen(false)}
        title="Publikasikan Landing Page ke Versi Publik?"
        description="Draft konfigurasi saat ini akan diterapkan langsung ke halaman depan publik (/)."
        maxWidthClass="max-w-lg"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={isPublishing}
              onClick={() => setPublishModalOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isPublishing}
              disabled={hasValidationErrors}
              onClick={handleConfirmPublish}
            >
              {isPublishing ? 'Mempublikasikan...' : 'Publish Sekarang'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Ringkasan Perubahan */}
          <div className="rounded-[12px] border border-[#E1E7EF] bg-[#F8FAFC] p-3.5">
            <div className="font-bold text-[#101828] mb-2">
              Ringkasan Perubahan ({publishDiffSummary.length} bagian)
            </div>
            {publishDiffSummary.length > 0 ? (
              <ul className="space-y-1.5 text-[#475467]">
                {publishDiffSummary.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-[#2563EB]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[#667085]">
                Konfigurasi saat ini sudah identik dengan versi publik terakhir, namun Anda tetap
                dapat memperbarui timestamp publikasi.
              </p>
            )}
          </div>

          {/* Peringatan Konsekuensi */}
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 p-3.5 text-amber-900 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              Konsekuensi Publikasi
            </div>
            Perubahan pada headline, fitur, cara kerja, paket harga, dan informasi kontak akan
            langsung terlihat oleh seluruh pengunjung publik di URL utama aplikasi dan dicatat pada{' '}
            <span className="font-mono font-semibold">audit_logs</span>.
          </div>

          {/* Catatan Audit */}
          <div>
            <label
              htmlFor="cms-publish-reason"
              className="mb-1.5 block text-xs font-semibold text-[#101828]"
            >
              Catatan Publikasi (Tercatat di Audit Log)
            </label>
            <input
              id="cms-publish-reason"
              type="text"
              value={publishReason}
              onChange={(e) => setPublishReason(e.target.value)}
              placeholder="Contoh: Pembaruan informasi kuota paket tahun ajaran baru"
              className="w-full rounded-[10px] border border-[#E1E7EF] px-3 py-2 text-xs text-[#101828] outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      </Modal>

      {/* Confirm Reset Unsaved Edits */}
      <ConfirmDialog
        isOpen={resetConfirmOpen}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={handleResetToSavedDraft}
        title="Batalkan Perubahan Belum Disimpan?"
        description="Seluruh perubahan yang belum disimpan ke draft server akan dikembalikan ke versi draft terakhir yang tersimpan."
        confirmLabel="Ya, Reset Perubahan"
        cancelLabel="Kembali Mengedit"
        tone="primary"
      />

      {/* Confirm Leave Route With Unsaved Changes */}
      <ConfirmDialog
        isOpen={Boolean(pendingNavCallback)}
        onCancel={() => setPendingNavCallback(null)}
        onConfirm={() => {
          const proceed = pendingNavCallback;
          setPendingNavCallback(null);
          delete (window as any).__LQ_UNSAVED_NAVIGATION_GUARD__;
          if (proceed) proceed();
        }}
        title="Tinggalkan Website Editor Tanpa Menyimpan?"
        description="Anda masih memiliki perubahan konten landing page yang belum disimpan ke draft server. Jika Anda berpindah halaman sekarang, perubahan tersebut akan hilang."
        confirmLabel="Tinggalkan Halaman"
        cancelLabel="Tetap di Editor"
        tone="danger"
      />
    </div>
  );
};

export default WebsiteEditorPage;
