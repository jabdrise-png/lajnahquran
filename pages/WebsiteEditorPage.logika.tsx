// Dipecah otomatis dari WebsiteEditorPage.tsx (Fase 8 bagian 2): logika (state, efek, handler) komponen WebsiteEditorPage.
// Ubah perilaku di sini; tampilan ada di WebsiteEditorPage.tsx dan WebsiteEditorPage.bagian.tsx.
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


export type EditorTabId =
  | 'theme'
  | 'hero'
  | 'features'
  | 'details'
  | 'pricing'
  | 'testimonials'
  | 'footer'
  | 'custom_pages'
  | 'login_page';

export const EDITOR_TABS: Array<{ id: EditorTabId; label: string; isCore?: boolean }> = [
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

export const DirtyBadge: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
      Diubah
    </span>
  );
};

export function useWebsiteEditorPageLogika() {
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

  // Fase 8b: hook tidak boleh mengembalikan JSX langsung; komponen membaca __berhenti/__kembali
  if (loading && !localConfig) {
    return { __berhenti: true, __kembali: (
      <div className="p-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent" />
        <p className="mt-3 text-xs font-medium text-[#667085]">
          Memuat konfigurasi Website Editor dari server...
        </p>
      </div>
    ) } as any;
  }

  if (!localConfig) return { __berhenti: true, __kembali: null } as any;

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
  return { draftConfig, publishedConfig, loading, backendError, lastDraftSavedAt, lastPublishedAt, updateDraftConfig, publishConfig, hasDraftChanges, clearError, activeTab, setActiveTab, device, setDevice, publishModalOpen, setPublishModalOpen, publishReason, setPublishReason, isSaving, setIsSaving, isPublishing, setIsPublishing, localConfig, setLocalConfig, statusFeedback, setStatusFeedback, pendingNavCallback, setPendingNavCallback, resetConfirmOpen, setResetConfirmOpen, isDirty, getSection, validationErrors, hasValidationErrors, sectionDirtyMap, publishDiffSummary, updateSectionData, updateTheme, updateSEO, updateFooter, handleSaveDraft, handleConfirmPublish, handleResetToSavedDraft, heroSec, draftHeroSec, featSec, draftFeatSec, detailsSec, draftDetailsSec, pricingSec, draftPricingSec, testSec, ctaSec, draftCtaSec, announcementBadge, draftAnnouncementBadge, secondaryCtaText, draftSecondaryCtaText, formatShortTime };
}

export type WebsiteEditorPageLogika = ReturnType<typeof useWebsiteEditorPageLogika>;
