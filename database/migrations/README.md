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
| `2026_11_26_01_fix_recitation_revisions_action_check.sql` | F1 (BUG-01/02) | belum |
| `2026_11_26_02_platform_tenant_stats_rpc.sql` | F1 (BUG-03) | belum |
| `2026_11_26_03_guard_access_grants.sql` | F1 (BUG-04/05) | belum |
| `2026_11_26_04_reason_validation.sql` | F1 (BUG-07/08) | belum |
| `2026_11_27_01_fix_publish_report_card_version.sql` | F1 (temuan test: amandemen raport) | belum |
| `2026_11_27_02_f2_tabel_referensi.sql` | F2 (referensi & peran) | belum |
| `2026_11_27_03_f2_multi_peran.sql` | F2 (multi peran) | belum |
| `2026_11_27_04_f2_santri_dan_nama_marhalah.sql` | F2 (santri, BUG-10) | belum |
| `2026_11_27_05_f2_tabel_v2_pendukung.sql` | F2 (absensi musammi', validasi) | belum |
| `2026_11_27_06_f2_migrasi_data_lama.sql` | F2 (migrasi data lama) | belum |
| `2026_11_27_07_f2_rpc_hanya_v2.sql` | F2 (fungsi hanya V2) | belum |
| `2026_11_27_08_f2_hapus_kolom_kembar.sql` | F2 (kolom kembar) | belum |
| `2026_11_27_09_f2_cabut_akses_tabel_lama.sql` | F2 (cabut akses tabel lama) | belum |
| `2026_11_28_01_f3_mushaf_kelancaran_arah.sql` | F3 (mushaf, Tabel Kelancaran, arah hafalan) | belum |
| `2026_11_28_02_f3_setoran_langsung_sah.sql` | F3 (setoran langsung sah, BUG-12/13) | belum |
| `2026_11_28_03_f3_absensi_tanpa_kunci.sql` | F3 (absensi tanpa kunci, badal, koreksi) | belum |
| `2026_11_29_01_f4_periode_dan_rekap.sql` | F4 (periode, mode halaqah, form & Rekap Periode, total hafalan) | belum |
| `2026_11_29_02_f4_hitung_rekap.sql` | F4 (hitung rekap harian, form evaluasi, pemantauan) | belum |
| `2026_11_29_03_f4_migrasi_evaluasi_lama.sql` | F4 (pindah data evaluasi lama, nilai Silabus Hafalan → `silabus_scores`, cabut akses tabel lama) | belum |
| `2026_11_30_01_f5_ujian_struktur.sql` | F5 (pengaturan raport, rubrik aktif, ujian bulanan, kolom exam_attempts, penguji, catatan raport) | belum |
| `2026_11_30_02_f5_rpc_ujian_raport.sql` | F5 (simpan ujian, komponen raport, terbit raport dijaga server) | belum |
| `2026_11_30_03_f5_migrasi_ujian_lama.sql` | F5 (pindah nilai ujian lama ke exam_attempts, cabut akses tabel lama) | belum |
| `2026_11_30_04_keputusan_f3_f4.sql` | Keputusan 26-11-2026: arah bawaan maju + dua arah, kehadiran rekap selalu dari absensi, koreksi setoran oleh musammi' | belum |
| `2026_12_01_01_f6_telegram_struktur.sql` | F6 (kode Telegram santri, telegram_settings + template, notification_queue, render template) | belum |
| `2026_12_01_02_f6_telegram_fungsi.sql` | F6 (penautan wali, antrian + retry, pesan setoran / progres periode / kehadiran mingguan terjadwal, RPC Admin) | belum |
| `2026_12_02_01_f7_kinerja.sql` | F7 (rpc_setoran_terakhir untuk muat awal 14 hari, indeks setoran terakhir & keanggotaan halaqah) | belum |
| `2026_12_02_02_f7_login_google.sql` | F7 (handle_new_user: pengguna Google/OAuth yang belum diundang tidak lagi membuat lembaga "Ma'had Baru") | belum |
| `2026_12_03_01_f8_bisnis.sql` | F8 (paket & harga diatur Superadmin, pembayaran transfer manual + status langganan, antrean pendaftaran lembaga) | belum |
| `2026_12_03_02_f8_tahun_ditutup.sql` | F8 (tahun ajaran Ditutup = data operasional terkunci; Admin bisa membuka kembali) | belum |

## Pemeriksaan sebelum migrasi

Folder `database/checks/` berisi kueri **baca-saja** untuk dijalankan sebelum migrasi besar,
mis. `database/checks/f2_preflight.sql` sebelum Fase 2. Semua baris harus `OK`/`INFO`.

## Test otomatis

`npm run test:v2` membangun PostgreSQL di memori dari skema repo lalu menjalankan **semua** file di folder ini
(dua kali, untuk memastikan aman diulang). File baru otomatis ikut diuji dan wajib dicatat di tabel Riwayat.

## Titik awal

- `database/baseline_2026-11.sql` — struktur produksi per November 2026 (dibuat di Fase 0 dengan `scripts/dump-production-schema.sh`).
- File lama (`supabase_saas_v2_migration.sql`, `supabase_v2_1_production_hardening.sql`, dll.) disimpan sebagai arsip; jangan dijalankan ulang ke database yang sudah berjalan.
