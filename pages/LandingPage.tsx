import React, { useState, useEffect } from "react";
import { 
  ArrowRight, 
  Menu, 
  X,
  FileText,
  Layout,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check
} from "lucide-react";
import * as Icons from "lucide-react";
import { useLandingPageContent } from "../hooks/useLandingPageContent";
import { LandingPageConfig } from "../types/landingPage";

interface LandingPageProps {
    onLoginClick?: () => void;
    configOverrides?: LandingPageConfig;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, configOverrides }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [activeCustomPageSlug, setActiveCustomPageSlug] = useState<string | null>(null);
  
  const { publishedConfig, loading } = useLandingPageContent();

  useEffect(() => {
    if (publishedConfig && publishedConfig.seo) {
      document.title = publishedConfig.seo.title || "Halaqah Attendance System";
      
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", publishedConfig.seo.description || "");
      
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", publishedConfig.seo.title || "");
      
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", publishedConfig.seo.description || "");
      
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) ogImage.setAttribute("content", publishedConfig.seo.ogImage || "");
    }
  }, [publishedConfig]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe && heroSection?.data?.heroImages) {
      setCurrentHeroIndex(prev => prev === heroSection.data.heroImages.length - 1 ? 0 : prev + 1);
    }
    if (isRightSwipe && heroSection?.data?.heroImages) {
      setCurrentHeroIndex(prev => prev === 0 ? heroSection.data.heroImages.length - 1 : prev - 1);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (loading && !configOverrides) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>;
  }

  const rawConfig = configOverrides || publishedConfig;
  const config = JSON.parse(JSON.stringify(rawConfig)) as LandingPageConfig;

  const renderIcon = (iconName: string) => {
      const IconComponent = (Icons as any)[iconName] || FileText;
      return <IconComponent className="w-5 h-5 flex-shrink-0" />;
  };

  const primaryColor = config.theme?.primaryColor || '#2563eb';

  const heroSection = config.sections.find(s => s.id === 'hero');
  const featuresSection = config.sections.find(s => s.id === 'features');
  const testimonialsSection = config.sections.find(s => s.id === 'testimonials');
  const detailsSection = config.sections.find(s => s.id === 'details');
  const pricingSection = config.sections.find(s => s.id === 'pricing');
  const ctaSection = config.sections.find(s => s.id === 'cta');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900" style={{ '--primary-color': primaryColor } as React.CSSProperties}>
      <style>{`
        .bg-primary { background-color: var(--primary-color) !important; }
        .text-primary { color: var(--primary-color) !important; }
        .border-primary { border-color: var(--primary-color) !important; }
        .hover\\:bg-primary-dark:hover { background-color: color-mix(in srgb, var(--primary-color) 85%, black) !important; }
      `}</style>
      
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200/50 py-3" : "bg-transparent py-5"}`}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.theme.logoUrl ? (
                <img src={config.theme.logoUrl} alt="Logo" className="h-8" />
            ) : (
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary shadow-sm">
                <BookOpen className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="text-[15px] font-bold tracking-tight text-slate-900 cursor-pointer" onClick={() => setActiveCustomPageSlug(null)}>
              {config.theme.appName}
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <div className="flex gap-6 items-center">
              {featuresSection?.isVisible && <button onClick={() => { setActiveCustomPageSlug(null); setTimeout(() => window.location.hash='fitur', 50); }} className="text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors">Fitur</button>}
              {testimonialsSection?.isVisible && <button onClick={() => { setActiveCustomPageSlug(null); setTimeout(() => window.location.hash='testimoni', 50); }} className="text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors">Testimoni</button>}
              
              {/* Custom Pages Desktop Navigation */}
              {config.customPages && config.customPages.length > 0 && (
                config.customPages.length <= 2 ? (
                  // If 1 or 2 pages, just show them inline
                  config.customPages.map(p => (
                     <button key={p.id} onClick={() => setActiveCustomPageSlug(p.slug)} className={`text-[13px] font-medium transition-colors ${activeCustomPageSlug === p.slug ? 'text-primary' : 'text-slate-600 hover:text-slate-900'}`}>{p.menuTitle || p.title}</button>
                  ))
                ) : (
                  // If > 2 pages, group them in a dropdown
                  <div className="relative group">
                    <button className="flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors">
                      Informasi <ChevronDown size={14} />
                    </button>
                    <div className="absolute top-full left-0 pt-4 hidden group-hover:block z-50">
                      <div className="bg-white rounded-xl shadow-xl border border-slate-100 py-2 min-w-[200px] flex flex-col">
                        {config.customPages.map(p => (
                          <button key={p.id} onClick={() => setActiveCustomPageSlug(p.slug)} className={`px-4 py-2 text-left text-[13px] font-medium hover:bg-slate-50 transition-colors ${activeCustomPageSlug === p.slug ? 'text-primary bg-primary/5' : 'text-slate-700'}`}>
                            {p.menuTitle || p.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
            {onLoginClick && (
              <div className="flex items-center gap-3">
                <button onClick={onLoginClick} className="text-[13px] font-medium text-slate-600 hover:text-slate-900 transition-colors">Log in</button>
                <button onClick={onLoginClick} className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-slate-800">Masuk</button>
              </div>
            )}
          </div>

          <button className="md:hidden p-2 text-slate-600" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Menu Content */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-[100%] left-0 right-0 bg-white border-b border-slate-200 shadow-xl px-6 py-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto w-full z-50">
             {featuresSection?.isVisible && (
               <button onClick={() => { setActiveCustomPageSlug(null); setMobileMenuOpen(false); setTimeout(() => window.location.hash='fitur', 50); }} className="text-left py-2 text-[15px] font-medium text-slate-700 border-b border-slate-100">Fitur</button>
             )}
             {testimonialsSection?.isVisible && (
               <button onClick={() => { setActiveCustomPageSlug(null); setMobileMenuOpen(false); setTimeout(() => window.location.hash='testimoni', 50); }} className="text-left py-2 text-[15px] font-medium text-slate-700 border-b border-slate-100">Testimoni</button>
             )}
             {(config.customPages || []).map(p => (
               <button key={p.id} onClick={() => { setActiveCustomPageSlug(p.slug); setMobileMenuOpen(false); }} className={`text-left py-2 text-[15px] font-medium ${activeCustomPageSlug === p.slug ? 'text-primary' : 'text-slate-700'} border-b border-slate-100`}>
                 {p.menuTitle || p.title}
               </button>
             ))}
             {onLoginClick && (
               <div className="flex flex-col gap-3 mt-2">
                 <button onClick={() => { setMobileMenuOpen(false); onLoginClick(); }} className="w-full h-11 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-[15px] font-semibold text-slate-700">Log in</button>
                 <button onClick={() => { setMobileMenuOpen(false); onLoginClick(); }} className="w-full h-11 flex items-center justify-center rounded-lg bg-slate-900 text-[15px] font-semibold text-white">Masuk Aplikasi</button>
               </div>
             )}
          </div>
        )}
      </nav>

      {/* Render Custom Page OR Landing Page Sections */}
      {activeCustomPageSlug ? (() => {
         const activePage = (config.customPages || []).find(p => p.slug === activeCustomPageSlug);
         if (!activePage) return <div className="pt-32 pb-20 text-center text-slate-500">Halaman tidak ditemukan.</div>;
         
         // Backward compatibility for old single-content pages
         const sections = (activePage.sections && activePage.sections.length > 0) ? activePage.sections : [
           { id: 'default', title: '', subtitle: '', content: (activePage as any).content || '', mediaUrl: (activePage as any).mediaUrl || '' }
         ];

         return (
           <article className="pt-32 pb-20 md:pt-40 md:pb-32 px-6 max-w-[800px] mx-auto min-h-screen">
             <div className="mb-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
               {activePage.subtitle && <p className="text-primary font-semibold tracking-wide text-sm mb-3 uppercase">{activePage.subtitle}</p>}
               <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">{activePage.title}</h1>
             </div>
             
             {sections.map((sec, sIdx) => {
                const hasMedia = !!sec.mediaUrl;
                const isYouTube = hasMedia && (sec.mediaUrl!.includes('youtube.com') || sec.mediaUrl!.includes('youtu.be'));
                
                return (
                  <section key={sec.id} className={`animate-in fade-in slide-in-from-bottom-8 duration-700 ${sIdx > 0 ? 'mt-16 pt-10 border-t border-slate-100' : ''}`} style={{animationDelay: `${sIdx * 100}ms`}}>
                    {(sec.title || sec.subtitle) && (
                      <div className="mb-8">
                        {sec.title && <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">{sec.title}</h2>}
                        {sec.subtitle && <p className="text-lg text-slate-500">{sec.subtitle}</p>}
                      </div>
                    )}
                    
                    {hasMedia && (
                      <div className="rounded-2xl overflow-hidden aspect-[16/9] shadow-lg mb-8 border border-slate-200/50 bg-slate-50">
                        {isYouTube ? (
                          <iframe 
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${sec.mediaUrl!.includes('v=') ? sec.mediaUrl!.split('v=')[1].split('&')[0] : sec.mediaUrl!.split('youtu.be/')[1]}`} 
                            title={sec.title || "Video"}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowFullScreen
                          ></iframe>
                        ) : (
                          <img src={sec.mediaUrl} alt={sec.title || ""} className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                    
                    {sec.content && (
                      <div className="prose prose-slate prose-lg max-w-none text-slate-700 prose-headings:text-slate-900 prose-a:text-primary preserve-whitespace">
                        {sec.content.split('\n').map((para, i) => (
                          para.trim() ? <p key={i}>{para}</p> : <br key={i} />
                        ))}
                      </div>
                    )}
                  </section>
                )
             })}
           </article>
         );
      })() : (
        <>
          {/* Hero Section */}
      {heroSection?.isVisible && (
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-slate-50 -z-10"></div>
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl -z-10 opacity-70"></div>
        
        <div className="max-w-[1200px] mx-auto px-6 md:px-8">
          <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-20">
            <div className="flex-1 max-w-[600px] z-10">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 mb-8 shadow-sm">
                <span className="flex h-1.5 w-1.5 rounded-full bg-primary mr-2"></span>
                <span className="text-[12px] font-medium text-primary tracking-tight">{config.seo.description}</span>
              </div>
              
              <h1 className="text-4xl md:text-[56px] font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.1]" dangerouslySetInnerHTML={{__html: heroSection.data.headline.replace(/\n/g, '<br class="hidden md:block"/>')}}>
              </h1>
              
              <p className="text-[15px] md:text-[17px] text-slate-500 mb-10 max-w-[600px] leading-relaxed">
                {heroSection.data.subheadline}
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mb-16">
                <button onClick={() => { if (heroSection.data.buttonLink && heroSection.data.buttonLink.trim() !== '' && !heroSection.data.buttonLink.includes('login')) { window.open(heroSection.data.buttonLink, '_blank'); } else if(onLoginClick) { onLoginClick(); } }} className="w-full sm:w-auto inline-flex h-11 items-center justify-center rounded-xl bg-primary hover:bg-primary-dark px-6 text-[14px] font-medium text-white shadow-sm transition-all hover:-translate-y-0.5">
                  {heroSection.data.buttonText}
                  <ArrowRight className="ml-2 w-4 h-4 text-white" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 w-full relative perspective-1000">
              <div className="absolute -inset-1 bg-gradient-to-tr from-slate-200 to-slate-100 rounded-3xl blur-[2px] opacity-50 transform rotate-1"></div>
              <div className="rounded-2xl border border-slate-200/60 bg-white p-2 md:p-3 shadow-xl ring-1 ring-slate-900/5 rotate-[-1deg] hover:rotate-0 transition-transform duration-500">
                <div 
                  className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50 relative aspect-[16/9] md:aspect-[4/3] lg:aspect-[16/9] group"
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="flex transition-transform duration-700 ease-in-out w-full h-full" style={{ transform: `translateX(-${currentHeroIndex * 100}%)` }}>
                    {(heroSection.data.heroImages || [heroSection.data.heroImage]).map((img: string, idx: number) => (
                      <div key={idx} className="w-full h-full flex-shrink-0 relative">
                        <img 
                          src={img} 
                          alt={`Mockup ${idx+1}`} 
                          className="w-full h-full object-cover object-top opacity-95 hover:opacity-100 transition-opacity duration-500"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Controls */}
                  {((heroSection.data.heroImages || []).length > 1) && (
                    <>
                      <button 
                        onClick={() => setCurrentHeroIndex(prev => prev === 0 ? heroSection.data.heroImages.length - 1 : prev - 1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur border border-slate-200 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-slate-700 z-10"
                      >
                         <ChevronLeft size={18} />
                      </button>
                      <button 
                        onClick={() => setCurrentHeroIndex(prev => prev === (heroSection.data.heroImages || []).length - 1 ? 0 : prev + 1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur border border-slate-200 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-slate-700 z-10"
                      >
                         <ChevronRight size={18} />
                      </button>
                      
                      {/* Dots */}
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                         {(heroSection.data.heroImages || []).map((_: any, idx: number) => (
                            <button key={idx} onClick={() => setCurrentHeroIndex(idx)} className={`w-1.5 h-1.5 rounded-full transition-all ${currentHeroIndex === idx ? 'bg-slate-800 w-3' : 'bg-slate-400'}`}></button>
                         ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Features Section */}
      {featuresSection?.isVisible && (
      <section id="fitur" className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16">
            <h2 className="text-[28px] font-bold tracking-tight text-slate-900 mb-3">{featuresSection.data.title}</h2>
            <p className="text-[14px] text-slate-500">{featuresSection.data.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featuresSection.data.features.map((item: any, i: number) => (
              <div key={item.id || i} className="rounded-2xl border border-slate-200/60 bg-slate-50/50 p-6 shadow-sm hover:shadow-md hover:bg-white transition-all duration-300 hover:-translate-y-1">
                <div className="w-10 h-10 rounded-xl border border-slate-200/60 bg-white flex items-center justify-center mb-5 text-primary shadow-sm">
                  {renderIcon(item.icon)}
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Details Section */}
      {detailsSection?.isVisible && detailsSection.data && (
      <section className="py-24 bg-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-20">
            <h2 className="text-[32px] md:text-[40px] font-bold tracking-tight text-slate-900 mb-4">{detailsSection.data.title}</h2>
            <p className="text-[15px] md:text-[17px] text-slate-500">{detailsSection.data.description}</p>
          </div>

          <div className="space-y-32">
            {(detailsSection.data.items || []).map((item: any, idx: number) => (
              <div key={item.id || idx} className={`flex flex-col md:flex-row items-center gap-12 lg:gap-24 ${item.imageRight ? '' : 'md:flex-row-reverse'}`}>
                <div className="flex-1 space-y-6">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shadow-sm">
                    {renderIcon(item.icon)}
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{item.title}</h3>
                  <p className="text-[15px] leading-relaxed text-slate-500">{item.description}</p>
                  
                  {item.bullets && item.bullets.length > 0 && item.bullets[0] !== '' && (
                    <ul className="space-y-4 pt-4">
                      {item.bullets.map((bullet: string, i: number) => (
                        <li key={i} className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                            <Check className="w-3 h-3" strokeWidth={3} />
                          </div>
                          <span className="text-[14px] font-medium text-slate-800">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex-1 w-full relative">
                  <div className="absolute -inset-4 bg-slate-50 rounded-[2rem] -z-10 hidden md:block"></div>
                  <div className="rounded-2xl border border-slate-200/50 bg-white p-2 shadow-sm">
                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 aspect-[4/3] md:aspect-[16/10]">
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover object-top" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Pricing Section */}
      {pricingSection?.isVisible && pricingSection.data && (
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16">
            <h2 className="text-[32px] md:text-[40px] font-bold tracking-tight text-slate-900 mb-4">{pricingSection.data.title}</h2>
            <p className="text-[15px] md:text-[17px] text-slate-500">{pricingSection.data.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[900px] mx-auto">
            {(pricingSection.data.plans || []).map((plan: any, idx: number) => (
              <div key={plan.id || idx} className={`relative flex flex-col bg-white rounded-3xl p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-transform hover:-translate-y-1 ${plan.isRecommended ? 'border-2 border-blue-500 shadow-[0_8px_30px_rgba(59,130,246,0.1)]' : 'border border-slate-200'}`}>
                {plan.isRecommended && plan.recommendedLabel && (
                   <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-[11px] font-bold tracking-wider uppercase px-4 py-1.5 rounded-full shadow-sm">
                     {plan.recommendedLabel}
                   </div>
                )}
                
                <h3 className="text-xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                <p className="text-sm text-slate-500 mb-6 h-10">{plan.description}</p>
                
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-slate-500 font-semibold">{plan.currency}</span>
                  <span className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">{plan.price}</span>
                  <span className="text-slate-500 ml-1">{plan.period}</span>
                </div>
                
                {plan.capacityLabel && (
                  <div className="mb-8">
                     <span className="inline-flex bg-slate-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-md">
                       {plan.capacityLabel}
                     </span>
                  </div>
                )}
                
                <ul className="space-y-4 mb-10 flex-1">
                  {(plan.features || []).map((feature: string, fIdx: number) => (
                    <li key={fIdx} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${plan.isRecommended ? 'bg-blue-50 text-blue-600' : 'text-emerald-500'}`}>
                        <Check className="w-3.5 h-3.5" strokeWidth={plan.isRecommended ? 3 : 2.5} />
                      </div>
                      <span className="text-[14px] text-slate-600 leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <button onClick={() => { if (plan.buttonLink && plan.buttonLink.trim() !== '' && !plan.buttonLink.includes('login')) { window.open(plan.buttonLink, '_blank'); } else if(onLoginClick) { onLoginClick(); } }} className={`w-full py-3.5 rounded-xl text-[15px] font-semibold transition-all ${plan.isRecommended ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700' : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'}`}>
                   {plan.buttonText}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* Testimonials */}
      {testimonialsSection?.isVisible && (
      <section id="testimoni" className="py-24 bg-slate-50">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[28px] font-bold tracking-tight text-slate-900">{testimonialsSection.data.title}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonialsSection.data.testimonials.map((item: any, i: number) => (
              <div key={item.id || i} className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
                <p className="text-[14px] leading-relaxed text-slate-600 mb-8">"{item.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-bold text-primary">
                    {item.name.substring(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-900">{item.name}</div>
                    <div className="text-[12px] text-slate-500">{item.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* CTA Section */}
      {ctaSection?.isVisible && ctaSection.data && (
      <section className="py-32 bg-white relative overflow-hidden">
        <div className="max-w-[800px] mx-auto px-6 text-center z-10 relative">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">{ctaSection.data.title}</h2>
            <p className="text-[16px] md:text-[18px] text-slate-500 mb-10 max-w-[600px] mx-auto leading-relaxed">{ctaSection.data.description}</p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
               <button onClick={() => { if (ctaSection.data.buttonLink && ctaSection.data.buttonLink.trim() !== '' && !ctaSection.data.buttonLink.includes('login')) { window.open(ctaSection.data.buttonLink, '_blank'); } else if(onLoginClick) { onLoginClick(); } }} className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-[15px] font-semibold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-95" style={{ backgroundColor: 'var(--primary-color)' }}>
                  {ctaSection.data.buttonText}
               </button>
               {ctaSection.data.secondaryButtonText && (
                 <button onClick={() => { if (ctaSection.data.secondaryButtonLink && ctaSection.data.secondaryButtonLink.trim() !== '' && !ctaSection.data.secondaryButtonLink.includes('login')) { window.open(ctaSection.data.secondaryButtonLink, '_blank'); } else if(onLoginClick) { onLoginClick(); } }} className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-xl bg-white border border-slate-200 px-8 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 transition-all active:scale-95">
                    {ctaSection.data.secondaryButtonText}
                 </button>
               )}
            </div>
        </div>
      </section>
      )}
      </>
      )}

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-200/80">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between mb-12">
            <div className="max-w-[300px] mb-8 md:mb-0">
              <div className="flex items-center gap-2 mb-4">
                 {config.theme.logoUrl ? (
                    <img src={config.theme.logoUrl} alt="Logo" className="h-6" />
                ) : (
                  <div className="flex items-center justify-center h-6 w-6 rounded bg-slate-900">
                    <BookOpen className="h-3 w-3 text-white" />
                  </div>
                )}
                <span className="text-[14px] font-bold tracking-tight text-slate-900">{config.theme.appName}</span>
              </div>
              <p className="text-[13px] leading-relaxed max-w-[280px] text-slate-500">
                {config.footer.description}
              </p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-slate-100 text-[12px] text-slate-500">
            <p>© {new Date().getFullYear()} {config.theme.appName}. All rights reserved.</p>
            <div className="flex gap-4 mt-4 md:mt-0 font-medium">
              {config.footer.instagram && <a href={config.footer.instagram} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">Instagram</a>}
              {config.footer.whatsapp && <a href={config.footer.whatsapp} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">WhatsApp</a>}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
