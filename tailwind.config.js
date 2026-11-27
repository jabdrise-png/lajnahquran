/**
 * Fase 7: Tailwind lewat build (sebelumnya CDN cdn.tailwindcss.com di index.html).
 * Tema sama dengan konfigurasi CDN lama. Kelas Tailwind harus ditulis UTUH di kode
 * (jangan dirangkai seperti `bg-${warna}-500`) agar ikut terbangun.
 *
 * Fase 7b · ATURAN DESAIN (lihat docs/PANDUAN_UI.md):
 * - Warna merek = `blue` (blue-600 = #1557D5). Jangan pakai indigo/sky/hex lepas untuk biru.
 * - Abu = `slate`. Status: emerald (berhasil), amber (peringatan), rose/red (bahaya), blue (info).
 * - Sudut: tombol/input `rounded-lg` (8px), kartu `rounded-xl` (12px), modal/panel besar `rounded-2xl` (16px),
 *   label/avatar `rounded-full`. `rounded-md` disamakan 8px, `rounded` 6px.
 * - Bayangan: `shadow-xs` (kartu), `shadow-sm` (kartu menonjol), `shadow-lg`/`shadow-xl` hanya untuk melayang (modal, menu).
 */
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        DEFAULT: '6px',
        md: '8px',
      },
      fontSize: {
        // Ukuran terkecil (label/badge/keterangan). Teks isi minimal text-sm (14px) di HP.
        '2xs': ['11px', { lineHeight: '16px' }],
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(16, 24, 40, 0.04)',
        xs: '0 1px 2px 0 rgba(16, 24, 40, 0.05)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Palet merek: seluruh kelas blue-* mengikuti biru Lajnah Quran (#1557D5)
        blue: {
          50: '#EEF4FF', 100: '#E0EAFF', 200: '#C2D6FF', 300: '#93B7FB', 400: '#5B8EF0',
          500: '#2F6FE4', 600: '#1557D5', 700: '#1245AD', 800: '#133B8A', 900: '#15346F', 950: '#0F2147',
        },
        primary: '#FFFFFF',
        secondary: '#1557D5',
        accent: '#1245AD',
        neutral: '#F1F5F9',
        'base-100': '#0F172A',
        info: '#0EA5E9',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
      },
    },
  },
  plugins: [typography],
};
