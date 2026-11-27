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
import { Bagian1, Bagian2 } from './WebsiteEditorPage.bagian';

export * from './WebsiteEditorPage.logika';

const WebsiteEditorPage: React.FC = () => {
  const s = useWebsiteEditorPageLogika();
  if ((s as any).__berhenti) return (s as any).__kembali;
  const { draftConfig, publishedConfig, loading, backendError, lastDraftSavedAt, lastPublishedAt, updateDraftConfig, publishConfig, hasDraftChanges, clearError, activeTab, setActiveTab, device, setDevice, publishModalOpen, setPublishModalOpen, publishReason, setPublishReason, isSaving, setIsSaving, isPublishing, setIsPublishing, localConfig, setLocalConfig, statusFeedback, setStatusFeedback, pendingNavCallback, setPendingNavCallback, resetConfirmOpen, setResetConfirmOpen, isDirty, getSection, validationErrors, hasValidationErrors, sectionDirtyMap, publishDiffSummary, updateSectionData, updateTheme, updateSEO, updateFooter, handleSaveDraft, handleConfirmPublish, handleResetToSavedDraft, heroSec, draftHeroSec, featSec, draftFeatSec, detailsSec, draftDetailsSec, pricingSec, draftPricingSec, testSec, ctaSec, draftCtaSec, announcementBadge, draftAnnouncementBadge, secondaryCtaText, draftSecondaryCtaText, formatShortTime } = s;

  return (<div className="-m-4 flex min-h-[calc(100vh-4rem)] flex-col bg-white sm:-m-6 lg:-m-8 relative z-0">
      {/* Top Toolbar (Static / Non-overlapping) */}
      <Bagian1 s={s} />

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
      <Bagian2 s={s} />

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
    </div>);
};

export default WebsiteEditorPage;
