// Dipecah otomatis dari WebsiteEditorPage.tsx (Fase 8 bagian 2): bagian tampilan besar komponen WebsiteEditorPage.
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
import { useWebsiteEditorPageLogika, type WebsiteEditorPageLogika, EDITOR_TABS, DirtyBadge, type EditorTabId } from './WebsiteEditorPage.logika';
import { Panel1 } from './WebsiteEditorPage.panel';

export const Bagian1: React.FC<{ s: WebsiteEditorPageLogika }> = ({ s }) => {
  const { draftConfig, publishedConfig, loading, backendError, lastDraftSavedAt, lastPublishedAt, updateDraftConfig, publishConfig, hasDraftChanges, clearError, activeTab, setActiveTab, device, setDevice, publishModalOpen, setPublishModalOpen, publishReason, setPublishReason, isSaving, setIsSaving, isPublishing, setIsPublishing, localConfig, setLocalConfig, statusFeedback, setStatusFeedback, pendingNavCallback, setPendingNavCallback, resetConfirmOpen, setResetConfirmOpen, isDirty, getSection, validationErrors, hasValidationErrors, sectionDirtyMap, publishDiffSummary, updateSectionData, updateTheme, updateSEO, updateFooter, handleSaveDraft, handleConfirmPublish, handleResetToSavedDraft, heroSec, draftHeroSec, featSec, draftFeatSec, detailsSec, draftDetailsSec, pricingSec, draftPricingSec, testSec, ctaSec, draftCtaSec, announcementBadge, draftAnnouncementBadge, secondaryCtaText, draftSecondaryCtaText, formatShortTime } = s;
  return (
    <>
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
    </>
  );
};

export const Bagian2: React.FC<{ s: WebsiteEditorPageLogika }> = ({ s }) => {
  const { draftConfig, publishedConfig, loading, backendError, lastDraftSavedAt, lastPublishedAt, updateDraftConfig, publishConfig, hasDraftChanges, clearError, activeTab, setActiveTab, device, setDevice, publishModalOpen, setPublishModalOpen, publishReason, setPublishReason, isSaving, setIsSaving, isPublishing, setIsPublishing, localConfig, setLocalConfig, statusFeedback, setStatusFeedback, pendingNavCallback, setPendingNavCallback, resetConfirmOpen, setResetConfirmOpen, isDirty, getSection, validationErrors, hasValidationErrors, sectionDirtyMap, publishDiffSummary, updateSectionData, updateTheme, updateSEO, updateFooter, handleSaveDraft, handleConfirmPublish, handleResetToSavedDraft, heroSec, draftHeroSec, featSec, draftFeatSec, detailsSec, draftDetailsSec, pricingSec, draftPricingSec, testSec, ctaSec, draftCtaSec, announcementBadge, draftAnnouncementBadge, secondaryCtaText, draftSecondaryCtaText, formatShortTime } = s;
  return (
    <>
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
          <Panel1 s={s} />
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
    </>
  );
};
