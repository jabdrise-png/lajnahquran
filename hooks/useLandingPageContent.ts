import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LandingPageConfig, defaultLandingPageConfig } from '../types/landingPage';

async function logCmsAuditEvent(params: {
  action: string;
  resourceType: string;
  resourceId?: string;
  reason?: string;
  beforeState?: any;
  afterState?: any;
}) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    await (supabase as any).from('audit_logs').insert([
      {
        organization_id: null,
        actor_id: userData?.user?.id || null,
        actor_role: 'superadmin',
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId || null,
        reason: params.reason || null,
        before_state: params.beforeState || null,
        after_state: params.afterState || null,
      },
    ]);
  } catch {
    // Non-blocking if audit_logs table is not reachable
  }
}

export function useLandingPageContent() {
  const [draftConfig, setDraftConfig] = useState<LandingPageConfig>(defaultLandingPageConfig);
  const [publishedConfig, setPublishedConfig] = useState<LandingPageConfig>(defaultLandingPageConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);

  // Track hasDraft changes compared to published configuration
  const [hasDraftChanges, setHasDraftChanges] = useState(false);

  const mergeConfig = useCallback((dbConfig: any): LandingPageConfig => {
    if (!dbConfig) return defaultLandingPageConfig;
    const merged = { ...defaultLandingPageConfig, ...dbConfig };

    merged.sections = defaultLandingPageConfig.sections.map((ds) => {
      const ex = dbConfig.sections?.find((s: any) => s.id === ds.id);
      if (ex) {
        return {
          ...ds,
          ...ex,
          data: { ...ds.data, ...ex.data },
        };
      }
      return ds;
    });

    merged.theme = { ...defaultLandingPageConfig.theme, ...(dbConfig.theme || {}) };
    merged.seo = { ...defaultLandingPageConfig.seo, ...(dbConfig.seo || {}) };
    merged.footer = { ...defaultLandingPageConfig.footer, ...(dbConfig.footer || {}) };
    merged.loginPage = { ...defaultLandingPageConfig.loginPage, ...(dbConfig.loginPage || {}) };
    merged.customPages = dbConfig.customPages || defaultLandingPageConfig.customPages || [];

    if (dbConfig.sections) {
      const dbOrderIds = dbConfig.sections.map((s: any) => s.id);
      const missingIds = defaultLandingPageConfig.sections
        .map((s) => s.id)
        .filter((id) => !dbOrderIds.includes(id));

      const orderedSections: any[] = [];
      dbOrderIds.forEach((id: string) => {
        const sec = merged.sections.find((s) => s.id === id);
        if (sec) orderedSections.push(sec);
      });
      missingIds.forEach((id) => {
        const sec = merged.sections.find((s) => s.id === id);
        if (sec) orderedSections.push(sec);
      });
      merged.sections = orderedSections;
    }
    return merged;
  }, []);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchErr } = await (supabase as any)
        .from('cms_landing_page')
        .select('*');

      if (fetchErr) {
        if (fetchErr.code === '42P01') {
          console.warn('cms_landing_page table does not exist yet. Returning default array.');
        } else {
          throw fetchErr;
        }
      } else if (data && data.length > 0) {
        const draft = (data as any[]).find((d) => d.status === 'draft');
        const published = (data as any[]).find((d) => d.status === 'published');

        const nextPublished = published ? mergeConfig(published.config) : defaultLandingPageConfig;
        const nextDraft = draft
          ? mergeConfig(draft.config)
          : published
          ? mergeConfig(published.config)
          : defaultLandingPageConfig;

        if (published) {
          setPublishedConfig(nextPublished);
          setLastPublishedAt(published.updated_at || published.created_at || null);
        }
        if (draft) {
          setDraftConfig(nextDraft);
          setLastDraftSavedAt(draft.updated_at || draft.created_at || null);
        } else if (published) {
          setDraftConfig(nextPublished);
          setLastDraftSavedAt(published.updated_at || published.created_at || null);
        }

        setHasDraftChanges(JSON.stringify(nextDraft) !== JSON.stringify(nextPublished));
      }
    } catch (err: any) {
      console.error('Error fetching landing page config:', err);
      setError(err.message || 'Gagal memuat konfigurasi CMS dari server.');
    } finally {
      setLoading(false);
    }
  }, [mergeConfig]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Update specific parts of the draft config remotely FIRST, then update local state after server confirmation
  const updateDraftConfig = async (newConfig: LandingPageConfig): Promise<boolean> => {
    try {
      setError(null);
      const nowIso = new Date().toISOString();

      const { data: exist, error: selectErr } = await (supabase as any)
        .from('cms_landing_page')
        .select('id')
        .eq('status', 'draft')
        .maybeSingle();

      if (selectErr && selectErr.code !== '42P01') {
        throw selectErr;
      }

      let res;
      if (exist) {
        res = await (supabase as any)
          .from('cms_landing_page')
          .update({ config: newConfig, updated_at: nowIso })
          .eq('status', 'draft');
      } else {
        res = await (supabase as any)
          .from('cms_landing_page')
          .insert([{ status: 'draft', config: newConfig, updated_at: nowIso }]);
      }

      if (res?.error) throw res.error;

      // Hanya mutakhirkan state draft setelah database mengonfirmasi penyimpanan berhasil
      setDraftConfig(newConfig);
      setLastDraftSavedAt(nowIso);
      setHasDraftChanges(JSON.stringify(newConfig) !== JSON.stringify(publishedConfig));

      await logCmsAuditEvent({
        action: 'cms.landing_page.draft_saved',
        resourceType: 'cms_landing_page',
        resourceId: exist?.id || 'draft',
        reason: 'Superadmin menyimpan draft konfigurasi landing page',
        afterState: {
          appName: newConfig.theme?.appName,
          seoTitle: newConfig.seo?.title,
          updatedAt: nowIso,
        },
      });

      return true;
    } catch (err: any) {
      console.error('Error updating draft config:', err);
      setError(err.message || 'Gagal menyimpan draft ke server.');
      return false;
    }
  };

  const publishConfig = async (
    configToPublish?: LandingPageConfig,
    reason?: string
  ): Promise<boolean> => {
    const targetConfig = configToPublish || draftConfig;
    try {
      setError(null);
      const nowIso = new Date().toISOString();

      // 1. Pastikan draft juga tersimpan sinkron di database
      const { data: existDraft } = await (supabase as any)
        .from('cms_landing_page')
        .select('id')
        .eq('status', 'draft')
        .maybeSingle();

      if (existDraft) {
        const draftRes = await (supabase as any)
          .from('cms_landing_page')
          .update({ config: targetConfig, updated_at: nowIso })
          .eq('status', 'draft');
        if (draftRes?.error) throw draftRes.error;
      } else {
        const draftRes = await (supabase as any)
          .from('cms_landing_page')
          .insert([{ status: 'draft', config: targetConfig, updated_at: nowIso }]);
        if (draftRes?.error) throw draftRes.error;
      }

      // 2. Simpan ke baris status = 'published'
      const { data: existPub, error: selectPubErr } = await (supabase as any)
        .from('cms_landing_page')
        .select('id')
        .eq('status', 'published')
        .maybeSingle();

      if (selectPubErr && selectPubErr.code !== '42P01') {
        throw selectPubErr;
      }

      let pubRes;
      if (existPub) {
        pubRes = await (supabase as any)
          .from('cms_landing_page')
          .update({ config: targetConfig, updated_at: nowIso })
          .eq('status', 'published');
      } else {
        pubRes = await (supabase as any)
          .from('cms_landing_page')
          .insert([{ status: 'published', config: targetConfig, updated_at: nowIso }]);
      }

      if (pubRes?.error) throw pubRes.error;

      // 3. Catat ke audit_logs produksi
      await logCmsAuditEvent({
        action: 'cms.landing_page.published',
        resourceType: 'cms_landing_page',
        resourceId: existPub?.id || 'published',
        reason: reason || 'Publikasi landing page baru oleh Superadmin',
        beforeState: {
          appName: publishedConfig.theme?.appName,
          seoTitle: publishedConfig.seo?.title,
        },
        afterState: {
          appName: targetConfig.theme?.appName,
          seoTitle: targetConfig.seo?.title,
          publishedAt: nowIso,
        },
      });

      // 4. Refresh dari database setelah sukses
      await fetchConfigs();
      setHasDraftChanges(false);
      return true;
    } catch (err: any) {
      console.error('Error publishing config:', err);
      setError(err.message || 'Gagal mempublikasikan landing page ke server.');
      return false;
    }
  };

  return {
    draftConfig,
    publishedConfig,
    loading,
    error,
    lastDraftSavedAt,
    lastPublishedAt,
    updateDraftConfig,
    publishConfig,
    hasDraftChanges,
    refreshConfigs: fetchConfigs,
    clearError: () => setError(null),
  };
}
