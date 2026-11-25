# Lingkungan Aplikasi

Lajnah Quran saat ini punya dua lingkungan yang **terpisah sepenuhnya** (repo, Netlify, dan Supabase berbeda).

| | Produksi lama | Pengembangan v2 (repo ini) |
| --- | --- | --- |
| Website | URL lama, dipakai lembaga | `https://lajnahquran.netlify.app` |
| GitHub | repo lama | `jabdrise-png/lajnahquran` |
| Database | Supabase lama | Supabase proyek ini |
| Fungsi | Tetap berjalan untuk pengguna | Membangun & menguji v2; data uji boleh dibuat/dihapus |

Karena itu **tidak perlu staging terpisah**: repo, Netlify, dan Supabase proyek ini sudah menjadi lingkungan uji. Aplikasi lama tidak disentuh selama pengembangan v2.

## Aturan kerja di lingkungan pengembangan

1. Kode: satu fase = satu cabang (`fase-1-…`). Netlify men-deploy `main`; gabungkan cabang ke `main` setelah diuji lokal (`npm run dev`).
2. Database: setiap perubahan ditulis di `database/migrations/` lalu dijalankan ke Supabase proyek ini. Jangan mengubah struktur lewat dashboard tanpa menyimpan SQL-nya.
3. Sebelum migrasi besar (terutama Fase 2), simpan cadangan struktur dengan `scripts/dump-production-schema.sh` (variabel `PROD_DB_URL` = URL database **proyek ini**).
4. Akun uji: gunakan sandi yang tidak pernah ditulis di chat atau dokumen.

## Ekspor struktur database (Fase 0)

Tujuan: mencatat struktur database proyek ini apa adanya, termasuk constraint yang tidak ada di repo (penyebab BUG-01).

**Linux/Mac:**

```bash
export PROD_DB_URL='postgresql://...'   # Supabase → Connect → Session pooler
bash scripts/dump-production-schema.sh
```

**Windows (PowerShell)** — pasang PostgreSQL 17 (cukup "Command Line Tools"), lalu:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" "URL_DATABASE" --schema-only --schema=public --no-owner --no-privileges -f database\baseline_2026-11.sql
```

Gunakan URI **Session pooler** (koneksi langsung hanya IPv6). Hasilnya di-commit ke repo.

## Saat v2 siap (Fase 8)

Data lembaga dari produksi lama **dipindahkan bila memungkinkan**, karena strukturnya mirip. Jika tidak memungkinkan, lembaga mulai dengan data baru (impor Excel santri). Keputusan diambil di Fase 8 setelah membandingkan struktur kedua database.
