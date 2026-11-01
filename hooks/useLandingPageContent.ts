import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LandingPageConfig, defaultLandingPageConfig } from '../types/landingPage';

export function useLandingPageContent() {
  const [draftConfig, setDraftConfig] = useState<LandingPageConfig>(defaultLandingPageConfig);
  const [publishedConfig, setPublishedConfig] = useState<LandingPageConfig>(defaultLandingPageConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track hasDraft changes compared to published configuration
  const [hasDraftChanges, setHasDraftChanges] = useState(false);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('cms_landing_page')
        .select('*');

      if (error) {
        if (error.code === '42P01') {
          console.warn('cms_landing_page table does not exist yet. Returning default array.');
        } else {
          throw error;
        }
      } else {
        if (data && data.length > 0) {
          const draft = (data as any[]).find(d => d.status === 'draft');
          const published = (data as any[]).find(d => d.status === 'published');
          
          const mergeConfig = (dbConfig: any): LandingPageConfig => {
            if (!dbConfig) return defaultLandingPageConfig;
            const merged = { ...defaultLandingPageConfig, ...dbConfig };
            
            merged.sections = defaultLandingPageConfig.sections.map(ds => {
              const ex = dbConfig.sections?.find((s: any) => s.id === ds.id);
              if (ex) {
                return {
                  ...ds,
                  ...ex,
                  data: { ...ds.data, ...ex.data }
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
               const dbOrderIds = dbConfig.sections.map((s:any) => s.id);
               const missingIds = defaultLandingPageConfig.sections.map(s => s.id).filter(id => !dbOrderIds.includes(id));
               
               const orderedSections: any[] = [];
               dbOrderIds.forEach((id: string) => {
                 const sec = merged.sections.find(s => s.id === id);
                 if (sec) orderedSections.push(sec);
               });
               missingIds.forEach(id => {
                 const sec = merged.sections.find(s => s.id === id);
                 if (sec) orderedSections.push(sec);
               });
               merged.sections = orderedSections;
            }
            return merged;
          };

          if (published) {
            setPublishedConfig(mergeConfig(published.config));
          }
          if (draft) {
            setDraftConfig(mergeConfig(draft.config));
          } else if (published) {
             // If there's no draft but there is a published, draft = published
            setDraftConfig(mergeConfig(published.config));
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching landing page config:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  // Update specific parts of the draft config locally and remotely
  const updateDraftConfig = async (newConfig: LandingPageConfig) => {
    try {
      setDraftConfig(newConfig);
      setHasDraftChanges(JSON.stringify(newConfig) !== JSON.stringify(publishedConfig));

      // Check if draft record exists
      const { data: exist } = await (supabase as any).from('cms_landing_page').select('id').eq('status', 'draft').maybeSingle();
      
      let res;
      if (exist) {
        res = await (supabase as any)
          .from('cms_landing_page')
          .update({ config: newConfig, updated_at: new Date().toISOString() })
          .eq('status', 'draft');
      } else {
        res = await (supabase as any)
          .from('cms_landing_page')
          .insert([{ status: 'draft', config: newConfig }]);
      }

      if (res.error) throw res.error;
      return true;
    } catch (err: any) {
      console.error('Error updating draft config:', err);
      setError(err.message);
      return false;
    }
  };

  const publishConfig = async () => {
    try {
      setLoading(true);
      const { data: exist } = await (supabase as any).from('cms_landing_page').select('id').eq('status', 'published').maybeSingle();
      
      let res;
      if (exist) {
        res = await (supabase as any)
          .from('cms_landing_page')
          .update({ config: draftConfig, updated_at: new Date().toISOString() })
          .eq('status', 'published');
      } else {
        res = await (supabase as any)
          .from('cms_landing_page')
          .insert([{ status: 'published', config: draftConfig }]);
      }

      if (res.error) throw res.error;
      
      await fetchConfigs(); // Refresh everything
      setHasDraftChanges(false);
      return true;
    } catch (err: any) {
      console.error('Error publishing config:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { draftConfig, publishedConfig, loading, error, updateDraftConfig, publishConfig, hasDraftChanges };
}
