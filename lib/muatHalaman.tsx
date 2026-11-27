/**
 * Fase 7 · Halaman dimuat saat dibuka (code-splitting per rute).
 * Bila file halaman versi lama sudah tidak ada setelah deploy baru (galat "Failed to fetch
 * dynamically imported module"), aplikasi dimuat ulang SEKALI agar mengambil versi terbaru.
 */
import React from 'react';

const KUNCI = 'lq:muat-ulang-chunk';

export function lazyHalaman<T extends React.ComponentType<any>>(impor: () => Promise<{ default: T }>) {
  return React.lazy(async () => {
    try {
      const m = await impor();
      try { sessionStorage.removeItem(KUNCI); } catch { /* abaikan */ }
      return m;
    } catch (e: any) {
      const pesan = String(e?.message || e);
      const chunkHilang = /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk/i.test(pesan);
      let sudah = false;
      try { sudah = sessionStorage.getItem(KUNCI) === '1'; } catch { /* abaikan */ }
      if (chunkHilang && !sudah) {
        try { sessionStorage.setItem(KUNCI, '1'); } catch { /* abaikan */ }
        window.location.reload();
        return new Promise<{ default: T }>(() => undefined);
      }
      throw e;
    }
  });
}

/** Tampilan ringan selagi halaman dimuat. */
export const MemuatHalaman: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      Memuat halaman…
    </div>
  </div>
);
