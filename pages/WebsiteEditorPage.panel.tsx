// Dipisah dari WebsiteEditorPage.bagian.tsx (Fase 8 bagian 2).
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

export const Panel1: React.FC<{ s: WebsiteEditorPageLogika }> = ({ s }) => {
  const { draftConfig, publishedConfig, loading, backendError, lastDraftSavedAt, lastPublishedAt, updateDraftConfig, publishConfig, hasDraftChanges, clearError, activeTab, setActiveTab, device, setDevice, publishModalOpen, setPublishModalOpen, publishReason, setPublishReason, isSaving, setIsSaving, isPublishing, setIsPublishing, localConfig, setLocalConfig, statusFeedback, setStatusFeedback, pendingNavCallback, setPendingNavCallback, resetConfirmOpen, setResetConfirmOpen, isDirty, getSection, validationErrors, hasValidationErrors, sectionDirtyMap, publishDiffSummary, updateSectionData, updateTheme, updateSEO, updateFooter, handleSaveDraft, handleConfirmPublish, handleResetToSavedDraft, heroSec, draftHeroSec, featSec, draftFeatSec, detailsSec, draftDetailsSec, pricingSec, draftPricingSec, testSec, ctaSec, draftCtaSec, announcementBadge, draftAnnouncementBadge, secondaryCtaText, draftSecondaryCtaText, formatShortTime } = s;
  return (
    <>
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

                {(featSec.data.features || []).map((f, idx: number) => (
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
                              (_, i: number) => i !== idx
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
                          features: featSec.data.features.map((item, i: number) =>
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
                          features: featSec.data.features.map((item, i: number) =>
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

                {(detailsSec.data.items || []).map((item, idx: number) => (
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
                            items: detailsSec.data.items.filter((_, i: number) => i !== idx),
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
                          items: detailsSec.data.items.map((it, i: number) =>
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
                          items: detailsSec.data.items.map((it, i: number) =>
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

                {(pricingSec.data.plans || []).map((plan, idx: number) => (
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
                          plans: pricingSec.data.plans.map((p, i: number) =>
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
                              plans: pricingSec.data.plans.map((p, i: number) =>
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
                              plans: pricingSec.data.plans.map((p, i: number) =>
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
                {(testSec.data.testimonials || []).map((t, idx: number) => (
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
                          testimonials: testSec.data.testimonials.map((item, i: number) =>
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
                            testimonials: testSec.data.testimonials.map((item, i: number) =>
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
                            testimonials: testSec.data.testimonials.map((item, i: number) =>
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
    </>
  );
};
