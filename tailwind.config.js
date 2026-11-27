/**
 * Fase 7: Tailwind lewat build (sebelumnya CDN cdn.tailwindcss.com di index.html).
 * Tema sama dengan konfigurasi CDN lama. Kelas Tailwind harus ditulis UTUH di kode
 * (jangan dirangkai seperti `bg-${warna}-500`) agar ikut terbangun.
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
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#FFFFFF',
        secondary: '#2563EB',
        accent: '#1D4ED8',
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
