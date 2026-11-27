/**
 * Fase 7 · PWA: banner versi baru (pembaruan atas persetujuan pengguna), ajakan "Pasang aplikasi"
 * (Android/desktop lewat beforeinstallprompt, iPhone lewat petunjuk Bagikan → Tambah ke Layar Utama),
 * dan penanda saat perangkat offline.
 */
import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'react-router-dom';
import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KUNCI_TUTUP = 'lq:pasang-ditutup';
const JEDA_TUTUP_MS = 14 * 24 * 3600 * 1000;

const baca = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const tulis = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* mode privat */ } };

export const sudahTerpasang = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

const iPhone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

let promptTertunda: BeforeInstallPromptEvent | null = null;
const pendengar = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptTertunda = e as BeforeInstallPromptEvent;
    pendengar.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => { promptTertunda = null; pendengar.forEach((f) => f()); });
}

/** Hook untuk tombol "Pasang aplikasi" di mana pun (mis. menu pengguna). */
export function usePasangAplikasi() {
  const [, paksa] = useState(0);
  useEffect(() => { const f = () => paksa((x) => x + 1); pendengar.add(f); return () => { pendengar.delete(f); }; }, []);
  const bisa = !sudahTerpasang() && (Boolean(promptTertunda) || iPhone());
  const pasang = async (): Promise<'terpasang' | 'batal' | 'ios'> => {
    if (promptTertunda) {
      const p = promptTertunda;
      await p.prompt();
      const { outcome } = await p.userChoice;
      promptTertunda = null; pendengar.forEach((f) => f());
      return outcome === 'accepted' ? 'terpasang' : 'batal';
    }
    return 'ios';
  };
  return { bisa, iPhone: iPhone() && !promptTertunda, pasang };
}

const PwaKontrol: React.FC = () => {
  const { needRefresh: [perluMuat, setPerluMuat], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Cek versi baru tiap jam & saat aplikasi kembali dibuka.
      const cek = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      setInterval(cek, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cek(); });
    },
  });
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const { bisa, iPhone: modeIos, pasang } = usePasangAplikasi();
  const [ditutup, setDitutup] = useState(() => Date.now() - Number(baca(KUNCI_TUTUP) || 0) < JEDA_TUTUP_MS);
  const [petunjukIos, setPetunjukIos] = useState(false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const diAplikasi = useLocation().pathname.startsWith('/app');
  const tampilAjakan = bisa && !ditutup && diAplikasi && !perluMuat;
  const tutupAjakan = () => { tulis(KUNCI_TUTUP, String(Date.now())); setDitutup(true); setPetunjukIos(false); };

  return (
    <>
      {offline && (
        <div role="status" className="fixed top-0 inset-x-0 z-[100000] bg-amber-500 text-white text-sm font-semibold text-center py-1.5 print:hidden flex items-center justify-center gap-2">
          <WifiOff size={15} /> Tidak ada koneksi internet — data belum bisa dimuat atau disimpan.
        </div>
      )}

      {perluMuat && (
        <div role="alert" className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-[100000] rounded-xl bg-slate-900 text-white shadow-xl p-3.5 print:hidden flex items-center gap-3">
          <RefreshCw size={18} className="shrink-0 text-blue-300" />
          <div className="text-sm flex-1">Versi baru aplikasi tersedia.</div>
          <button type="button" onClick={() => updateServiceWorker(true)} className="px-3 py-2 rounded-lg bg-blue-600 text-sm font-semibold">Muat ulang</button>
          <button type="button" aria-label="Nanti saja" onClick={() => setPerluMuat(false)} className="p-2 text-slate-300"><X size={16} /></button>
        </div>
      )}

      {tampilAjakan && (
        <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-[99999] rounded-xl bg-white border border-slate-200 shadow-xl p-3.5 print:hidden">
          <div className="flex items-start gap-3">
            <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 text-[15px]">Pasang Lajnah Quran</div>
              {petunjukIos ? (
                <p className="text-sm text-slate-600 mt-0.5">
                  Di Safari, ketuk <Share size={14} className="inline -mt-0.5" /> <b>Bagikan</b> lalu pilih <b>Tambah ke Layar Utama</b>.
                </p>
              ) : (
                <p className="text-sm text-slate-600 mt-0.5">Buka lebih cepat dari layar utama HP, seperti aplikasi biasa.</p>
              )}
            </div>
            <button type="button" aria-label="Tutup" onClick={tutupAjakan} className="p-2 -m-1 text-slate-400"><X size={16} /></button>
          </div>
          {!petunjukIos && (
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={tutupAjakan} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600">Nanti</button>
              <button type="button" onClick={async () => { const r = await pasang(); if (r === 'ios') setPetunjukIos(true); else tutupAjakan(); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">
                <Download size={15} /> {modeIos ? 'Cara pasang' : 'Pasang aplikasi'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default PwaKontrol;
