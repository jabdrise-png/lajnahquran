# Lajnah Quran

Aplikasi manajemen tahfidz untuk banyak lembaga (pondok, ma'had, rumah Qur'an): absensi halaqah, setoran hafalan,
rekap per periode, ujian bulanan & semester, raport berkode verifikasi, notifikasi Telegram ke wali, dan laporan mudir.
Bisa dipasang di HP (PWA).

> **Baca dulu sebelum mengubah kode:**
>
> - [`docs/CATATAN_UNTUK_AI.md`](docs/CATATAN_UNTUK_AI.md) — perubahan Fase 0–8 dan aturan wajib (juga untuk asisten AI)
> - [`docs/SPESIFIKASI_V2.md`](docs/SPESIFIKASI_V2.md) — kebutuhan produk · [`docs/RENCANA_V2.md`](docs/RENCANA_V2.md) — fase pengerjaan
> - [`docs/PANDUAN_PENGGUNA.md`](docs/PANDUAN_PENGGUNA.md) — panduan pemakaian untuk Admin, Musammi' & Superadmin
> - [`docs/PANDUAN_UI.md`](docs/PANDUAN_UI.md) — aturan tampilan (warna, filter, tabel, komponen)
> - [`database/migrations/README.md`](database/migrations/README.md) — aturan & riwayat migrasi database
> - [`docs/LINGKUNGAN.md`](docs/LINGKUNGAN.md) — lingkungan pengembangan v2 vs produksi lama

## 1. Peran

| Peran | Bisa |
| --- | --- |
| **Superadmin** | Mengelola lembaga, paket & harga, antrean pendaftaran, pembayaran, sesi bantuan (tercatat audit) |
| **Admin lembaga** | Semua data lembaganya: tahun ajaran, kelas, santri, halaqah, musammi', ujian, raport, Telegram, laporan |
| **Musammi'** | Halaqah yang dipegang: absensi, setoran, rekap periode, nilai ujian sebagai penguji |

Satu akun boleh memegang beberapa peran (mis. Admin sekaligus Musammi'); peran aktif dipilih setelah masuk.

## 2. Teknologi

- **Frontend:** React 18 + Vite + TypeScript, Tailwind (build), PWA (`vite-plugin-pwa`). Halaman dimuat terpisah (lazy).
- **Data:** Supabase (PostgreSQL + Row Level Security per lembaga + fungsi RPC). Perubahan skema hanya lewat `database/migrations/`.
- **Server:** Netlify Functions — `netlify/functions/api.ts` (router `/api/*`), `netlify/functions/telegram-antrian.ts` (terjadwal tiap menit).
- **Integrasi:** bot Telegram per lembaga (webhook + antrian pesan), asisten AI (Gemini, server-side).

## 3. Menjalankan

```bash
npm install
cp .env.example .env      # isi VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (+ SUPABASE_SERVICE_ROLE_KEY untuk server)
npm run dev               # aplikasi + API lokal
npm run lint              # pemeriksaan tipe (tsc)
npm run test              # test v2 (PGlite) + skrip verifikasi lama
npx vite build            # build produksi (Netlify menjalankan ini otomatis)
```

Database baru: jalankan file skema dasar lalu **semua** file `database/migrations/*.sql` berurutan (lihat README migrasi).

## 4. Struktur kode

| Folder | Isi |
| --- | --- |
| `pages/` | Halaman per menu. Halaman besar dipecah: `X.tsx` (tampilan) + `X.logika.tsx` (state & handler, hook `useXLogika`) + `X.bagian*.tsx` (potongan tampilan) |
| `components/` | Komponen bersama; `components/ui/` komponen dasar (`SaaSPrimitives`, `Dialog`) |
| `hooks/useSupabaseData*.tsx` | Data lembaga untuk seluruh halaman (dimuat sekali, absensi & setoran per jendela 14 hari) |
| `lib/` | Hitungan & aturan (ujian, kelancaran, laporan, permissions, rute, excel, bisnis) |
| `api/`, `netlify/functions/` | Endpoint server (Telegram, notifikasi, undangan, integrasi) |
| `database/migrations/` | Migrasi berurutan, aman diulang |
| `tests/v2/` | Test database (PGlite) & pemeriksaan kode |

Aturan kerapian (dijaga test): tidak ada file kode > 1.000 baris (kecuali data `lib/quranPageMap.ts`), jumlah `any` tidak boleh bertambah,
tampilan mengikuti `docs/PANDUAN_UI.md`.

## 5. Deploy

Netlify (build `vite build`, folder `dist`). Variabel lingkungan & langkah lengkap: [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md).
Setiap fase punya panduan pasang & uji di `docs/FASE_*_UJI.md`.
