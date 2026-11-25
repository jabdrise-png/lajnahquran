# Migrasi Database

Mulai Fase 1, **setiap** perubahan database (tabel, kolom, constraint, fungsi, policy) ditulis sebagai file SQL di folder ini. Jangan mengubah struktur langsung di dashboard Supabase tanpa menyimpan SQL-nya di sini.

## Aturan penamaan

```
YYYY_MM_DD_NN_deskripsi_singkat.sql
contoh: 2026_12_01_01_fix_recitation_revisions_action_check.sql
```

## Isi setiap file

1. Komentar di baris atas: tujuan, ID bug/fase terkait, dan cara rollback.
2. Bungkus dalam `begin; … commit;`.
3. Buat **idempoten** bila memungkinkan (`if exists`, `if not exists`, `create or replace`).

## Urutan menjalankan

1. Untuk migrasi besar, simpan cadangan struktur (`scripts/dump-production-schema.sh`).
2. Jalankan ke Supabase proyek ini (SQL Editor, atau `psql "$DB_URL" -f database/migrations/<file>.sql`).
3. Uji aplikasi sesuai checklist fase.
4. Catat di tabel di bawah. File yang sama nanti dipakai saat memindahkan v2 ke produksi.

## Riwayat

| File | Fase | Dijalankan |
| --- | --- | --- |
| (belum ada) | | |

## Titik awal

- `database/baseline_2026-11.sql` — struktur produksi per November 2026 (dibuat di Fase 0 dengan `scripts/dump-production-schema.sh`).
- File lama (`supabase_saas_v2_migration.sql`, `supabase_v2_1_production_hardening.sql`, dll.) disimpan sebagai arsip; jangan dijalankan ulang ke database yang sudah berjalan.
