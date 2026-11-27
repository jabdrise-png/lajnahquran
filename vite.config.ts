import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [
        react(),
        // Fase 7 · PWA: hanya kerangka aplikasi yang disimpan offline. Data Supabase & /api TIDAK pernah di-cache.
        VitePWA({
          registerType: 'prompt',
          injectRegister: false,
          manifest: {
            id: '/app/dashboard',
            name: 'Lajnah Quran',
            short_name: 'Lajnah Quran',
            description: 'Absensi, setoran hafalan, ujian & raport halaqah tahfidz.',
            lang: 'id',
            start_url: '/app/dashboard',
            scope: '/',
            display: 'standalone',
            background_color: '#F3F6FB',
            theme_color: '#1557D5',
            icons: [
              { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
            shortcuts: [
              { name: 'Sesi Halaqah', short_name: 'Sesi', url: '/app/sessions', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
              { name: 'Setoran Harian', short_name: 'Setoran', url: '/app/recitations', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            ],
          },
          workbox: {
            // Kerangka: html, css, js utama, font & ikon. Potongan halaman (lazy) disimpan saat dipakai.
            globPatterns: ['index.html', 'assets/index-*.{js,css}', 'assets/*.woff2', 'favicon.svg', 'icons/*.png'],
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//, /^\/assets\//, /\/[^/?]+\.[^/]+$/],
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
                handler: 'CacheFirst',
                options: {
                  cacheName: 'lq-aset-v2',
                  expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: { statuses: [200] },
                  plugins: [
                    {
                      cacheWillUpdate: async ({ response }) => {
                        const ct = response?.headers?.get('content-type') || '';
                        if (!response || response.status !== 200 || ct.includes('text/html')) {
                          return null;
                        }
                        return response;
                      },
                    },
                  ],
                },
              },
            ],
          },
        }),
      ],
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
