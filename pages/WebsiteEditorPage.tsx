import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Layout, AlertCircle, Eye, RefreshCw, Upload, Smartphone, Monitor, ChevronUp, ChevronDown } from 'lucide-react';
import { useLandingPageContent } from '../hooks/useLandingPageContent';
import LandingPage from './LandingPage';
import Login from './Login';
import { LandingPageConfig } from '../types/landingPage';
import * as Icons from 'lucide-react';

const availableIcons = Object.keys(Icons).filter(key => key !== 'createReactComponent' && key !== 'default');

const WebsiteEditorPage: React.FC = () => {
  const { draftConfig, loading, error, updateDraftConfig, publishConfig, hasDraftChanges } = useLandingPageContent();
  const [activeTab, setActiveTab] = useState<'hero' | 'features' | 'testimonials' | 'general' | 'theme' | 'custom_pages' | 'login_page'>('hero');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{text: string, type: 'success'|'error'} | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  // We use local state cloned from draftConfig for instant edits, 
  // but we debounce saving it to draftConfig to avoid too many DB calls.
  const [localConfig, setLocalConfig] = useState<LandingPageConfig | null>(null);

  useEffect(() => {
    if (!loading && draftConfig && !localConfig) {
      setLocalConfig(JSON.parse(JSON.stringify(draftConfig)));
    }
  }, [loading, draftConfig]);

  if (loading || !localConfig) {
    return <div className="p-8 text-center"><div className="animate-spin w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div></div>;
  }

  const updateLocalAndDraft = (newConfig: LandingPageConfig) => {
    setLocalConfig(newConfig);
    // Ideally we debounce this, but for simplicity let's save immediately
    // Or we require manual "Save Draft" click. 
    // Manual "Simpan ke Draft" is better to avoid DB spam.
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    const success = await updateDraftConfig(localConfig);
    setIsSaving(false);
    if (success) {
      setSaveMessage({ text: 'Draft berhasil disimpan!', type: 'success' });
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage({ text: 'Gagal menyimpan draft.', type: 'error' });
    }
  };

  const handlePublish = async () => {
    // First, save the draft
    await updateDraftConfig(localConfig);
    
    setIsPublishing(true);
    setSaveMessage(null);
    const success = await publishConfig();
    setIsPublishing(false);
    if (success) {
      setSaveMessage({ text: 'Perubahan berhasil di-publish dan live!', type: 'success' });
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage({ text: 'Gagal mempublish.', type: 'error' });
    }
  };

  const renderIconSelector = (value: string, onChange: (val: string) => void) => {
    return (
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
      >
        <option value="">Pilih Icon</option>
        <option value="ShieldCheck">Keamanan (Shield)</option>
        <option value="Users">Pengguna (Users)</option>
        <option value="LineChart">Statistik (LineChart)</option>
        <option value="BookOpen">Buku (BookOpen)</option>
        <option value="CheckCircle2">Ceklis (CheckCircle2)</option>
        <option value="Clock">Waktu (Clock)</option>
        <option value="TrendingUp">Meningkat (TrendingUp)</option>
        <option value="FileText">Dokumen (FileText)</option>
        <option value="CalendarCheck">Kalender (Calendar)</option>
      </select>
    );
  };

  // Section Helpers
  const updateTheme = (key: string, value: string) => updateLocalAndDraft({ ...localConfig, theme: { ...localConfig.theme, [key]: value } });
  const updateSEO = (key: string, value: string) => updateLocalAndDraft({ ...localConfig, seo: { ...localConfig.seo, [key]: value } });
  const updateFooter = (key: string, value: string) => updateLocalAndDraft({ ...localConfig, footer: { ...localConfig.footer, [key]: value } });
  
  const getSection = (id: string) => localConfig.sections.find(s => s.id === id);
  const updateSectionData = (id: string, dataObj: any) => {
    updateLocalAndDraft({
      ...localConfig,
      sections: localConfig.sections.map(s => s.id === id ? { ...s, data: { ...s.data, ...dataObj } } : s)
    });
  };
  const toggleSection = (id: string) => {
    updateLocalAndDraft({
      ...localConfig,
      sections: localConfig.sections.map(s => s.id === id ? { ...s, isVisible: !s.isVisible } : s)
    });
  };
  const moveSection = (index: number, direction: 'up'|'down') => {
    const newSections = [...localConfig.sections];
    if (direction === 'up' && index > 0) {
      [newSections[index-1], newSections[index]] = [newSections[index], newSections[index-1]];
    } else if (direction === 'down' && index < newSections.length - 1) {
      [newSections[index], newSections[index+1]] = [newSections[index+1], newSections[index]];
    }
    updateLocalAndDraft({ ...localConfig, sections: newSections });
  };

  const heroSec = getSection('hero');
  const featSec = getSection('features');
  const testSec = getSection('testimonials');
  const detailsSec = getSection('details');
  const pricingSec = getSection('pricing');
  const ctaSec = getSection('cta');

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
      
      {/* Top Bar for Editor */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0 shadow-sm z-10">
        <div>
          <h1 className="text-lg font-bold text-slate-800 flex items-center">
            <Layout className="mr-2 text-blue-600 w-5 h-5" />
            Website Editor
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {saveMessage && (
            <div className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center ${saveMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
               {saveMessage.text}
            </div>
          )}
          
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setPreviewMode('desktop')} className={`px-3 py-1 rounded-md text-sm transition-all ${previewMode === 'desktop' ? 'bg-white shadow-sm font-medium text-slate-900' : 'text-slate-500'}`}><Monitor size={16}/></button>
            <button onClick={() => setPreviewMode('mobile')} className={`px-3 py-1 rounded-md text-sm transition-all ${previewMode === 'mobile' ? 'bg-white shadow-sm font-medium text-slate-900' : 'text-slate-500'}`}><Smartphone size={16}/></button>
          </div>

          <div className="h-6 w-px bg-slate-200"></div>

          <button 
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="flex items-center px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Draft
          </button>

          <button 
            onClick={handlePublish}
            disabled={isPublishing}
            className="flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isPublishing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
            Publish Sekarang {hasDraftChanges && <span className="ml-1.5 flex h-2 w-2 rounded-full bg-red-400"></span>}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL: Editor Controls */}
        <div className="w-full md:w-[450px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="flex overflow-x-auto border-b border-slate-200 custom-scrollbar flex-shrink-0">
            {[
              { id: 'theme', label: 'Tema & Umum' },
              { id: 'hero', label: 'Hero' },
              { id: 'features', label: 'Fitur' },
              { id: 'details', label: 'Cara Kerja' },
              { id: 'pricing', label: 'Harga/Plan' },
              { id: 'testimonials', label: 'Testimoni' },
              { id: 'cta', label: 'Aksi (CTA)' },
              { id: 'custom_pages', label: 'Halaman Custom' },
              { id: 'login_page', label: 'Halaman Login' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 whitespace-nowrap text-[13px] font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50">
            
            {/* THEME TAB */}
            {activeTab === 'theme' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm">Identitas Web (Global)</h3>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Aplikasi</label>
                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.theme.appName} onChange={e => updateTheme('appName', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Logo URL (Kosongkan jika icon)</label>
                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" placeholder="https://..." value={localConfig.theme.logoUrl} onChange={e => updateTheme('logoUrl', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Warna Utama (Primary Color)</label>
                    <div className="flex items-center gap-3">
                      <input type="color" className="w-10 h-10 rounded border border-slate-300 cursor-pointer" value={localConfig.theme.primaryColor} onChange={e => updateTheme('primaryColor', e.target.value)} />
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.theme.primaryColor} onChange={e => updateTheme('primaryColor', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm">SEO Meta Attributes</h3>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Meta Title</label>
                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.seo.title} onChange={e => updateSEO('title', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Meta Description</label>
                    <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={localConfig.seo.description} onChange={e => updateSEO('description', e.target.value)}></textarea>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Meta Image URL (og:image)</label>
                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" placeholder="https://..." value={localConfig.seo.ogImage} onChange={e => updateSEO('ogImage', e.target.value)} />
                    {localConfig.seo.ogImage && (
                      <div className="mt-2 text-xs text-slate-500">
                        Preview:
                        <img src={localConfig.seo.ogImage} alt="OG Preview" className="mt-1 w-full max-w-[240px] h-auto object-cover rounded border border-slate-200" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm">Footer Konfigurasi</h3>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Footer Singkat</label>
                    <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={localConfig.footer.description} onChange={e => updateFooter('description', e.target.value)}></textarea>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Link Instagram</label>
                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.footer.instagram} onChange={e => updateFooter('instagram', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Link WhatsApp</label>
                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.footer.whatsapp} onChange={e => updateFooter('whatsapp', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* HERO TAB */}
            {activeTab === 'hero' && heroSec && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-700">Tampilkan Section Ini</span>
                  <button onClick={() => toggleSection('hero')} className={`w-10 h-5 rounded-full relative transition-colors ${heroSec.isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${heroSec.isVisible ? 'left-5' : 'left-0.5'}`}></div>
                  </button>
                </div>

                <div className={`space-y-4 ${heroSec.isVisible ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Besar (Headline)</label>
                      <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={heroSec.data.headline} onChange={e => updateSectionData('hero', { headline: e.target.value })}></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sub-judul (Deskripsi)</label>
                      <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-20" value={heroSec.data.subheadline} onChange={e => updateSectionData('hero', { subheadline: e.target.value })}></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Teks Tombol Aksi</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={heroSec.data.buttonText} onChange={e => updateSectionData('hero', { buttonText: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Link Tujuan Tombol (kosongkan ttp akan membuka app)</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={heroSec.data.buttonLink} onChange={e => updateSectionData('hero', { buttonLink: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Daftar URL Gambar Mockup (Carousel)</label>
                      <div className="space-y-2">
                        {(heroSec.data.heroImages || [heroSec.data.heroImage || '']).map((img: string, idx: number) => (
                           <div key={idx} className="flex gap-2">
                              <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={img} onChange={e => {
                                 const newImages = [...(heroSec.data.heroImages || [heroSec.data.heroImage || ''])];
                                 newImages[idx] = e.target.value;
                                 updateSectionData('hero', { heroImages: newImages, heroImage: newImages[0] });
                              }} />
                              <button onClick={() => {
                                 const newImages = [...(heroSec.data.heroImages || [heroSec.data.heroImage || ''])];
                                 newImages.splice(idx, 1);
                                 updateSectionData('hero', { heroImages: newImages, heroImage: newImages[0] || '' });
                              }} className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 border border-slate-200 rounded-lg"><Trash2 size={16}/></button>
                           </div>
                        ))}
                      </div>
                      <button onClick={() => {
                         const newImages = [...(heroSec.data.heroImages || [heroSec.data.heroImage || '']), ''];
                         updateSectionData('hero', { heroImages: newImages });
                      }} className="text-xs mt-2 font-semibold text-blue-600 flex items-center bg-blue-50 px-2 py-1.5 rounded hover:bg-blue-100">
                        <Plus size={14} className="mr-1"/> Tambah Gambar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FEATURES TAB */}
            {activeTab === 'features' && featSec && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-700">Tampilkan Section Fitur/Masalah</span>
                  <button onClick={() => toggleSection('features')} className={`w-10 h-5 rounded-full relative transition-colors ${featSec.isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${featSec.isVisible ? 'left-5' : 'left-0.5'}`}></div>
                  </button>
                </div>

                <div className={`space-y-4 ${featSec.isVisible ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Section Utama</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={featSec.data.title} onChange={e => updateSectionData('features', { title: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat</label>
                      <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={featSec.data.description} onChange={e => updateSectionData('features', { description: e.target.value })}></textarea>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm">Daftar Point/Fitur</h3>
                    <button onClick={() => updateSectionData('features', { features: [...featSec.data.features, { id: Date.now().toString(), icon: '', title: '', description: ''}] })} className="text-xs font-semibold text-blue-600 flex items-center bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                      <Plus size={14} className="mr-1"/> Tambah Data
                    </button>
                  </div>

                  <div className="space-y-3">
                    {featSec.data.features.map((f: any, idx: number) => (
                      <div key={f.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] space-y-3 relative group">
                        <button onClick={() => updateSectionData('features', { features: featSec.data.features.filter((f2:any) => f2.id !== f.id) })} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded p-1">
                          <Trash2 size={14}/>
                        </button>
                        <div className="pr-8">
                           <label className="block text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">No. {idx+1} (Icon) </label>
                           {renderIconSelector(f.icon, (v) => updateSectionData('features', { features: featSec.data.features.map((f2:any) => f2.id === f.id ? {...f2, icon: v}: f2)}))}
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Judul Point</label>
                          <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={f.title} onChange={(e) => updateSectionData('features', { features: featSec.data.features.map((f2:any) => f2.id === f.id ? {...f2, title: e.target.value}: f2)})} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Penjelasan</label>
                          <textarea className="w-full p-2 border border-slate-200 rounded text-sm h-14" value={f.description} onChange={(e) => updateSectionData('features', { features: featSec.data.features.map((f2:any) => f2.id === f.id ? {...f2, description: e.target.value}: f2)})}></textarea>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PRICING TAB */}
            {activeTab === 'pricing' && pricingSec && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-700">Tampilkan Section Harga</span>
                  <button onClick={() => toggleSection('pricing')} className={`w-10 h-5 rounded-full relative transition-colors ${pricingSec.isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${pricingSec.isVisible ? 'left-5' : 'left-0.5'}`}></div>
                  </button>
                </div>

                <div className={`space-y-4 ${pricingSec.isVisible ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Section Utama</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={pricingSec.data.title || ''} onChange={e => updateSectionData('pricing', { title: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat</label>
                      <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={pricingSec.data.description || ''} onChange={e => updateSectionData('pricing', { description: e.target.value })}></textarea>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm">Daftar Paket</h3>
                    <button onClick={() => updateSectionData('pricing', { plans: [...(pricingSec.data.plans || []), { id: Date.now().toString(), name: 'Baru', description: '', currency: 'Rp', price: '0', period: '/bulan', capacityLabel: '', features: [''], buttonText: 'Beli', buttonLink: '', isRecommended: false, recommendedLabel: 'Populer'}] })} className="text-xs font-semibold text-blue-600 flex items-center bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                      <Plus size={14} className="mr-1"/> Tambah Paket
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(pricingSec.data.plans || []).map((plan: any, idx: number) => (
                      <div key={plan.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3 relative group">
                        <button onClick={() => updateSectionData('pricing', { plans: pricingSec.data.plans.filter((p:any) => p.id !== plan.id) })} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded p-1">
                          <Trash2 size={14}/>
                        </button>
                        
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Nama Paket</label>
                          <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.name} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, name: e.target.value}: p)})} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Deskripsi Paket</label>
                          <textarea className="w-full p-2 border border-slate-200 rounded text-sm h-14" value={plan.description} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, description: e.target.value}: p)})}></textarea>
                        </div>
                        <div className="flex gap-2">
                           <div className="w-1/4">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Mata Uang</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.currency} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, currency: e.target.value}: p)})} />
                           </div>
                           <div className="w-1/2">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Harga</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.price} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, price: e.target.value}: p)})} />
                           </div>
                           <div className="w-1/4">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Periode</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.period} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, period: e.target.value}: p)})} />
                           </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Label Kapasitas</label>
                          <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.capacityLabel} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, capacityLabel: e.target.value}: p)})} />
                        </div>
                        <div>
                           <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fitur Paket (pisahkan per baris)</label>
                           <textarea className="w-full p-2 border border-slate-200 rounded text-sm h-24" value={(plan.features||[]).join('\n')} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, features: e.target.value.split('\n').filter((s:string)=>s.trim().length > 0)}: p)})}></textarea>
                        </div>
                        <div className="flex gap-2">
                           <div className="w-1/2">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Teks Tombol</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.buttonText} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, buttonText: e.target.value}: p)})} />
                           </div>
                           <div className="w-1/2">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Link Tujuan</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.buttonLink} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, buttonLink: e.target.value}: p)})} />
                           </div>
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                           <span className="text-[11px] font-semibold text-slate-500">Rekomendasi / Paling Diminati?</span>
                           <button onClick={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, isRecommended: !p.isRecommended}: p)})} className={`w-8 h-4 rounded-full relative transition-colors ${plan.isRecommended ? 'bg-blue-600' : 'bg-slate-300'}`}>
                             <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${plan.isRecommended ? 'left-4' : 'left-0.5'}`}></div>
                           </button>
                        </div>
                        {plan.isRecommended && (
                          <div className="mt-2">
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Teks Label Rekomendasi</label>
                            <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={plan.recommendedLabel} onChange={(e) => updateSectionData('pricing', { plans: pricingSec.data.plans.map((p:any) => p.id === plan.id ? {...p, recommendedLabel: e.target.value}: p)})} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TESTIMONIALS TAB */}
            {activeTab === 'testimonials' && testSec && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-700">Tampilkan Section Testimoni</span>
                  <button onClick={() => toggleSection('testimonials')} className={`w-10 h-5 rounded-full relative transition-colors ${testSec.isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${testSec.isVisible ? 'left-5' : 'left-0.5'}`}></div>
                  </button>
                </div>

                <div className={`space-y-4 ${testSec.isVisible ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Section Utama</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={testSec.data.title} onChange={e => updateSectionData('testimonials', { title: e.target.value })} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm">Daftar Testimoni</h3>
                    <button onClick={() => updateSectionData('testimonials', { testimonials: [...testSec.data.testimonials, { id: Date.now().toString(), quote: '', name: '', role: ''}] })} className="text-xs font-semibold text-blue-600 flex items-center bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                      <Plus size={14} className="mr-1"/> Tambah
                    </button>
                  </div>

                  <div className="space-y-3">
                    {testSec.data.testimonials.map((t: any, idx: number) => (
                      <div key={t.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3 relative group">
                        <button onClick={() => updateSectionData('testimonials', { testimonials: testSec.data.testimonials.filter((t2:any) => t2.id !== t.id) })} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded p-1">
                          <Trash2 size={14}/>
                        </button>
                        <div className="pr-8">
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Kutipan Review</label>
                          <textarea className="w-full p-2 border border-slate-200 rounded text-sm h-14" value={t.quote} onChange={(e) => updateSectionData('testimonials', { testimonials: testSec.data.testimonials.map((t2:any) => t2.id === t.id ? {...t2, quote: e.target.value}: t2)})}></textarea>
                        </div>
                        <div className="flex gap-2">
                           <div className="w-1/2">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Nama</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={t.name} onChange={(e) => updateSectionData('testimonials', { testimonials: testSec.data.testimonials.map((t2:any) => t2.id === t.id ? {...t2, name: e.target.value}: t2)})} />
                           </div>
                           <div className="w-1/2">
                             <label className="block text-[11px] font-semibold text-slate-500 mb-1">Jabatan</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={t.role} onChange={(e) => updateSectionData('testimonials', { testimonials: testSec.data.testimonials.map((t2:any) => t2.id === t.id ? {...t2, role: e.target.value}: t2)})} />
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* DETAILS TAB */}
            {activeTab === 'details' && detailsSec && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-700">Tampilkan Section Cara Kerja</span>
                  <button onClick={() => toggleSection('details')} className={`w-10 h-5 rounded-full relative transition-colors ${detailsSec.isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${detailsSec.isVisible ? 'left-5' : 'left-0.5'}`}></div>
                  </button>
                </div>

                <div className={`space-y-4 ${detailsSec.isVisible ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Section Utama</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={detailsSec.data.title} onChange={e => updateSectionData('details', { title: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat</label>
                      <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={detailsSec.data.description} onChange={e => updateSectionData('details', { description: e.target.value })}></textarea>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm">Daftar Konten / Blok</h3>
                    <button onClick={() => updateSectionData('details', { items: [...(detailsSec.data.items || []), { id: Date.now().toString(), icon: '', title: '', description: '', imageUrl: '', bullets: [''], imageRight: false}] })} className="text-xs font-semibold text-blue-600 flex items-center bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                      <Plus size={14} className="mr-1"/> Tambah
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(detailsSec.data.items || []).map((item: any, idx: number) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3 relative group">
                        <button onClick={() => updateSectionData('details', { items: detailsSec.data.items.filter((i:any) => i.id !== item.id) })} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 bg-slate-50 rounded p-1">
                          <Trash2 size={14}/>
                        </button>
                        <div className="pr-8">
                           <label className="block text-[11px] font-semibold text-slate-500 mb-1 flex items-center justify-between">No. {idx+1} (Icon) </label>
                           {renderIconSelector(item.icon, (v) => updateSectionData('details', { items: detailsSec.data.items.map((i:any) => i.id === item.id ? {...i, icon: v}: i)}))}
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Judul Blok</label>
                          <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={item.title} onChange={(e) => updateSectionData('details', { items: detailsSec.data.items.map((i:any) => i.id === item.id ? {...i, title: e.target.value}: i)})} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Penjelasan Singkat</label>
                          <textarea className="w-full p-2 border border-slate-200 rounded text-sm h-14" value={item.description} onChange={(e) => updateSectionData('details', { items: detailsSec.data.items.map((i:any) => i.id === item.id ? {...i, description: e.target.value}: i)})}></textarea>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">URL Gambar Mockup</label>
                          <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={item.imageUrl} onChange={(e) => updateSectionData('details', { items: detailsSec.data.items.map((i:any) => i.id === item.id ? {...i, imageUrl: e.target.value}: i)})} />
                        </div>
                        <div>
                           <label className="block text-[11px] font-semibold text-slate-500 mb-1">Poin Tambahan (Bullets, pisahkan dengan koma)</label>
                           <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={(item.bullets||[]).join(', ')} onChange={(e) => updateSectionData('details', { items: detailsSec.data.items.map((i:any) => i.id === item.id ? {...i, bullets: e.target.value.split(',').map((s:string)=>s.trim())}: i)})} />
                        </div>
                        <div className="flex items-center justify-between pt-2">
                           <span className="text-[11px] font-semibold text-slate-500">Posisi Gambar di Kanan?</span>
                           <button onClick={(e) => updateSectionData('details', { items: detailsSec.data.items.map((i:any) => i.id === item.id ? {...i, imageRight: !i.imageRight}: i)})} className={`w-8 h-4 rounded-full relative transition-colors ${item.imageRight ? 'bg-blue-600' : 'bg-slate-300'}`}>
                             <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${item.imageRight ? 'left-4' : 'left-0.5'}`}></div>
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CTA TAB */}
            {activeTab === 'cta' && ctaSec && (
              <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <span className="text-sm font-semibold text-slate-700">Tampilkan Section CTA</span>
                  <button onClick={() => toggleSection('cta')} className={`w-10 h-5 rounded-full relative transition-colors ${ctaSec.isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${ctaSec.isVisible ? 'left-5' : 'left-0.5'}`}></div>
                  </button>
                </div>

                <div className={`space-y-4 ${ctaSec.isVisible ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Headline CTA</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={ctaSec.data.title} onChange={e => updateSectionData('cta', { title: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Tambahan</label>
                      <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-16" value={ctaSec.data.description} onChange={e => updateSectionData('cta', { description: e.target.value })}></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Teks Tombol Aksi</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={ctaSec.data.buttonText} onChange={e => updateSectionData('cta', { buttonText: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Link Tujuan Tombol Utama (kosongkan ttp akan membuka app)</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={ctaSec.data.buttonLink || ''} onChange={e => updateSectionData('cta', { buttonLink: e.target.value })} />
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Teks Tombol Kedua (Opsional)</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={ctaSec.data.secondaryButtonText || ''} onChange={e => updateSectionData('cta', { secondaryButtonText: e.target.value })} placeholder="Cth: Hubungi Sales" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Link Tombol Kedua</label>
                      <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={ctaSec.data.secondaryButtonLink || ''} onChange={e => updateSectionData('cta', { secondaryButtonLink: e.target.value })} placeholder="Cth: https://wa.me/..." />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CUSTOM PAGES TAB */}
            {activeTab === 'custom_pages' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Halaman Ekstra (Menu Artikel)</h3>
                    <p className="text-xs text-slate-500 mt-1">Halaman ini akan muncul di menu navigasi utama. Anda dapat membuat halaman untuk panduan, syarat ketentuan, program lajnah, dll.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 text-sm">Daftar Halaman</h3>
                  <button onClick={() => updateLocalAndDraft({ ...localConfig, customPages: [...(localConfig.customPages || []), { id: Date.now().toString(), slug: `halaman-${Date.now().toString().slice(-4)}`, menuTitle: 'Halaman Baru', title: 'Halaman Baru', sections: [] }] })} className="text-xs font-semibold text-blue-600 flex items-center bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                    <Plus size={14} className="mr-1"/> Tambah Halaman
                  </button>
                </div>

                <div className="space-y-4">
                  {(localConfig.customPages || []).map((page, idx) => (
                    <div key={page.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 relative group">
                      <button onClick={() => updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.filter(p => p.id !== page.id) })} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 bg-white rounded p-1 shadow-sm">
                        <Trash2 size={16}/>
                      </button>
                      
                      <div className="pr-8 bg-white p-4 rounded-lg border border-slate-200">
                        <h4 className="font-bold text-sm text-slate-800 mb-3 border-b border-slate-100 pb-2">Informasi Dasar</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama di Menu Navigasi</label>
                            <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={page.menuTitle || page.title || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, menuTitle: e.target.value}: p)})} />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Utama Halaman</label>
                            <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={page.title || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, title: e.target.value}: p)})} />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Sub Judul Halaman (Opsional)</label>
                            <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={page.subtitle || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, subtitle: e.target.value}: p)})} />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Slug URL (e.g. cara-penggunaan)</label>
                            <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={page.slug} onChange={(e) => updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')}: p)})} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                          <h4 className="font-bold text-sm text-slate-800">Isi Halaman (Section)</h4>
                          <button onClick={() => {
                             const newSection = { id: Date.now().toString(), title: '', content: '' };
                             updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, sections: [...(p.sections || []), newSection]}: p)});
                          }} className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            + Tambah Section
                          </button>
                        </div>

                        <div className="space-y-4">
                          {((page.sections && page.sections.length > 0) ? page.sections : [
                             // Backward compatibility: map old root level fields to a section
                             { id: 'default', title: page.title || '', subtitle: page.subtitle || '', content: (page as any).content || '', mediaUrl: (page as any).mediaUrl || '' }
                          ]).map((sec, sIdx) => (
                             <div key={sec.id} className="relative bg-slate-50 border border-slate-200 p-3 rounded-lg">
                               <button onClick={() => {
                                  let currentSections = page.sections || [];
                                  if (currentSections.length === 0) currentSections = [{ id: 'default', title: page.title || '', subtitle: page.subtitle || '', content: (page as any).content || '', mediaUrl: (page as any).mediaUrl || '' }];
                                  updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, sections: currentSections.filter(s => s.id !== sec.id)}: p)});
                               }} className="absolute top-2 right-2 text-slate-400 hover:text-red-500">
                                 <Trash2 size={14}/>
                               </button>

                                <div className="space-y-3 pr-6">
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Judul Section (Opsional)</label>
                                    <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" value={sec.title || ''} onChange={(e) => {
                                        const newSections = [...(page.sections || [])];
                                        if (newSections.length === 0) newSections.push({ id: 'default', title: page.title || '', subtitle: page.subtitle || '', content: (page as any).content || '', mediaUrl: (page as any).mediaUrl || '' });
                                        const tgt = newSections.find(s => s.id === sec.id);
                                        if (tgt) tgt.title = e.target.value;
                                        updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, sections: newSections}: p)});
                                    }} />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Media URL (Gambar / YouTube)</label>
                                    <input type="text" className="w-full p-2 border border-slate-200 rounded text-sm" placeholder="https://..." value={sec.mediaUrl || ''} onChange={(e) => {
                                        const newSections = [...(page.sections || [])];
                                        if (newSections.length === 0) newSections.push({ id: 'default', title: page.title || '', subtitle: page.subtitle || '', content: (page as any).content || '', mediaUrl: (page as any).mediaUrl || '' });
                                        const tgt = newSections.find(s => s.id === sec.id);
                                        if (tgt) tgt.mediaUrl = e.target.value;
                                        updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, sections: newSections}: p)});
                                    }} />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Konten Text</label>
                                    <textarea className="w-full p-2 border border-slate-200 rounded text-sm h-24" value={sec.content || ''} onChange={(e) => {
                                        const newSections = [...(page.sections || [])];
                                        if (newSections.length === 0) newSections.push({ id: 'default', title: page.title || '', subtitle: page.subtitle || '', content: (page as any).content || '', mediaUrl: (page as any).mediaUrl || '' });
                                        const tgt = newSections.find(s => s.id === sec.id);
                                        if (tgt) tgt.content = e.target.value;
                                        updateLocalAndDraft({ ...localConfig, customPages: localConfig.customPages!.map(p => p.id === page.id ? {...p, sections: newSections}: p)});
                                    }}></textarea>
                                  </div>
                                </div>
                             </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LOGIN PAGE TAB */}
            {activeTab === 'login_page' && (
               <div className="space-y-4 animate-in fade-in">
                 <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                   <h3 className="font-bold text-slate-800 text-sm">Pengaturan Konten Halaman Login</h3>
                   
                   <div>
                     <label className="block text-xs font-semibold text-slate-700 mb-1">Status Sistem (Kiri Atas Kanan)</label>
                     <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.loginPage?.systemStatusText || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), systemStatusText: e.target.value } })} />
                   </div>

                   <div>
                     <label className="block text-xs font-semibold text-slate-700 mb-1">Teks Kutipan / Testimoni</label>
                     <textarea className="w-full p-2.5 border border-slate-300 rounded-lg text-sm h-24" value={localConfig.loginPage?.quoteText || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), quoteText: e.target.value } })}></textarea>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Author</label>
                       <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.loginPage?.authorName || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), authorName: e.target.value } })} />
                     </div>
                     <div>
                       <label className="block text-xs font-semibold text-slate-700 mb-1">Role / Jabatan Author</label>
                       <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={localConfig.loginPage?.authorRole || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), authorRole: e.target.value } })} />
                     </div>
                   </div>

                   <div>
                     <label className="block text-xs font-semibold text-slate-700 mb-1">Avatar URL Author</label>
                     <input type="text" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" placeholder="https://..." value={localConfig.loginPage?.authorAvatarUrl || ''} onChange={(e) => updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), authorAvatarUrl: e.target.value } })} />
                   </div>
                 </div>

                 <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                   <div className="flex items-center justify-between">
                     <h3 className="font-bold text-slate-800 text-sm">Statistik Tambahan (Max 3)</h3>
                     <button 
                       onClick={() => {
                         const currentStats = localConfig.loginPage?.stats || [];
                         if (currentStats.length < 3) {
                           updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), stats: [...currentStats, { value: '100+', label: 'Stat Baru' }] } });
                         }
                       }} 
                       className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded"
                       disabled={(localConfig.loginPage?.stats || []).length >= 3}
                     >
                       + Tambah Stat
                     </button>
                   </div>
                   
                   <div className="space-y-3">
                     {(localConfig.loginPage?.stats || []).map((stat: any, idx: number) => (
                       <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                         <input type="text" className="w-1/3 p-2 border border-slate-300 rounded text-sm placeholder:text-slate-400" placeholder="Nilai (100k+)" value={stat.value} onChange={(e) => {
                           const newStats = [...(localConfig.loginPage?.stats || [])];
                           newStats[idx].value = e.target.value;
                           updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), stats: newStats } });
                         }} />
                         <input type="text" className="flex-1 p-2 border border-slate-300 rounded text-sm placeholder:text-slate-400" placeholder="Label (Santri Aktif)" value={stat.label} onChange={(e) => {
                           const newStats = [...(localConfig.loginPage?.stats || [])];
                           newStats[idx].label = e.target.value;
                           updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), stats: newStats } });
                         }} />
                         <button onClick={() => {
                           const newStats = [...(localConfig.loginPage?.stats || [])];
                           newStats.splice(idx, 1);
                           updateLocalAndDraft({ ...localConfig, loginPage: { ...(localConfig.loginPage || {} as any), stats: newStats } });
                         }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded border border-transparent shadow-sm">
                           <Trash2 size={16}/>
                         </button>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>
            )}

            {/* Reorder sections visual */}
            <div className="mt-10 pt-6 border-t border-slate-200">
               <h3 className="font-bold text-slate-800 text-sm mb-3">Reorder Sections (Urutan)</h3>
               <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 space-y-1">
                 {localConfig.sections.map((s, idx) => (
                    <div key={s.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${s.isVisible ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                        <span className="text-sm font-medium capitalize text-slate-700">{s.id}</span>
                      </div>
                      <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => moveSection(idx, 'up')} disabled={idx===0} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"><ChevronUp size={16}/></button>
                         <button onClick={() => moveSection(idx, 'down')} disabled={idx===localConfig.sections.length-1} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"><ChevronDown size={16}/></button>
                      </div>
                    </div>
                 ))}
               </div>
            </div>

          </div>
        </div>

        {/* RIGHT PANEL: Live Preview */}
        <div className="flex-1 bg-slate-900 overflow-hidden relative flex items-center justify-center p-4">
          <div className="absolute top-4 left-6 px-3 py-1 bg-black/40 backdrop-blur rounded-full border border-white/10 z-20">
             <span className="flex items-center gap-2 text-xs font-medium text-white/90">
               <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
               </span>
               Live Preview
             </span>
          </div>

          <div className={`w-full bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300 ${previewMode === 'mobile' ? 'max-w-[375px] h-[812px]' : 'max-w-[1440px] h-full'}`}>
             {/* Instead of iframe, we inject LandingPage in a scrollable div */}
             <div className="h-full w-full overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50">
               {/* Non-interactive overlay to block clicks so they don't leave the preview page */}
               <div className="pointer-events-none relative w-full transform origin-top left-0 top-0 pb-16">
                 {/* Re-enable pointer events for links or let user scroll? We want scroll, but not link clicks. We can use a trick inside LandingPage or just render it directly */}
                 <div className="pointer-events-auto">
                    {activeTab === 'login_page' ? (
                       <Login configOverrides={localConfig} onBack={() => {}} />
                    ) : (
                       <LandingPage 
                           configOverrides={localConfig} 
                           onLoginClick={() => alert("Preview mode: Login button ditekan.")} 
                       />
                    )}
                 </div>
               </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default WebsiteEditorPage;
