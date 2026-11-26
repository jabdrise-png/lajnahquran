# Fase 1 – Perbaikan Kritis: Cara Pasang & Uji

## 1. Jalankan migrasi (Supabase → SQL Editor)

Jalankan berurutan, satu file per kali (salin isi file → Run):

1. `database/migrations/2026_11_26_01_fix_recitation_revisions_action_check.sql`
2. `database/migrations/2026_11_26_02_platform_tenant_stats_rpc.sql`
3. `database/migrations/2026_11_26_03_guard_access_grants.sql`
4. `database/migrations/2026_11_26_04_reason_validation.sql`
5. `database/migrations/2026_11_27_01_fix_publish_report_card_version.sql`

Semua file aman dijalankan ulang. Setelah berhasil, ubah kolom "Dijalankan" di `database/migrations/README.md` menjadi tanggal hari itu.

## 2. Deploy kode

Push branch `fase-1-perbaikan-kritis` → buat Pull Request ke `main` → Netlify membuat Deploy Preview. Uji di preview, lalu merge.

## 3. Test otomatis

```bash
npm run test:v2     # hanya test v2 (±15 detik)
npm run test        # test v2 + suite lama
```

Test v2 membangun PostgreSQL di memori (PGlite) dari file skema repo + **semua** file `database/migrations/`, lalu menjalankan RPC sungguhan sebagai Superadmin/Admin/Musammi'. File:

| File | Menguji |
| --- | --- |
| `tests/v2/f1-database.test.ts` | No. 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13 di database |
| `tests/v2/f1-akses-ui.test.ts` | No. 4, 6, 7, 8, 9 (aturan tombol, arah superadmin, monitor health) |
| `tests/v2/f1-pesan-error.test.ts` | No. 14 dan aturan alasan di layar |
| `tests/v2/migrasi-umum.test.ts` | Aturan folder migrasi + semua migrasi aman dijalankan ulang |

Test otomatis memakai skema **repo**. Database Supabase Anda pernah berbeda dari repo (penyebab BUG-01), jadi tetap lakukan uji manual singkat di bawah setelah migrasi dijalankan.

Temuan test: `rpc_publish_report_card` versi repo tidak pernah bisa menerbitkan amandemen (nomor versi bentrok). Diperbaiki di `2026_11_27_01_fix_publish_report_card_version.sql`.

## 4. Checklist uji manual

| No | Akun | Langkah | Hasil yang diharapkan | OK |
| --- | --- | --- | --- | --- |
| 1 | Musammi' | Sesi Halaqah → buka sesi → simpan setoran 1 santri | Tersimpan, tanpa error `recitation_revisions_action_check` | ☐ |
| 2 | Musammi' | Setoran Harian → simpan setoran | Tersimpan | ☐ |
| 3 | Admin | Validasi setoran: Accepted, lalu satu Returned dan satu Voided (alasan ≥ 5 huruf) | Ketiganya berhasil | ☐ |
| 4 | Superadmin | Login | Langsung ke Dashboard Platform, bukan Support Access | ☐ |
| 5 | Superadmin | Dashboard/Konsol Platform → daftar lembaga | Angka santri, musammi', halaqah sesuai data (tidak 0) | ☐ |
| 6 | Superadmin | Konsol → Monitor/Health | Tertulis `DB: healthy`, bukan `unknown` | ☐ |
| 7 | Superadmin | Konsol → Akun Platform → baris akun sendiri | Tombol Suspend/Revoke tidak muncul | ☐ |
| 8 | Admin | Manajemen Users → baris Superadmin dan Admin lain | Tidak ada tombol Edit/Cabut/Aktifkan | ☐ |
| 9 | Admin | Manajemen Users → baris akun sendiri | Hanya "Edit Nama Saya"; role tidak bisa diubah; simpan nama berhasil | ☐ |
| 10 | Admin | Edit/Cabut akses Musammi' | Tetap bisa | ☐ |
| 11 | Superadmin | Support Access dengan alasan `asdfasdfasdf` atau `tes` | Ditolak dengan pesan jelas | ☐ |
| 12 | Superadmin | Support Access dengan alasan `Bantu admin cek absensi` | Berhasil | ☐ |
| 13 | Admin | Rekap Nilai → terbitkan ulang raport dengan alasan `tes` | Ditolak | ☐ |
| 14 | Semua | Picu error (mis. matikan internet lalu simpan) | Pesan bahasa Indonesia yang ramah, bukan teks database | ☐ |

Catatan uji no. 13: hanya untuk data uji. Jangan menerbitkan raport santri sungguhan.

## 5. Yang berubah

| Bug | Perbaikan |
| --- | --- |
| BUG-01/02 | Constraint `recitation_revisions_action_check` disamakan dengan aksi yang dipakai RPC; nilai lama di tabel tetap diizinkan |
| BUG-03 | RPC `rpc_platform_tenant_stats()` (khusus superadmin, hanya angka agregat) dipakai konsol; cara lama jadi cadangan bila RPC belum ada |
| BUG-04/05 | Trigger `trg_guard_access_grants`: hanya superadmin yang menyentuh grant superadmin, tidak ada yang bisa mengubah akses sendiri, superadmin/admin aktif terakhir tidak bisa dinonaktifkan. Tombol terkait disembunyikan di Users dan Konsol |
| BUG-07/08 | Trigger validasi alasan di `report_cards` (amandemen) dan `support_access_sessions`; layar memakai aturan yang sama (`cekAlasan`) |
| BUG-16 | `lib/ramahkanError.ts` + `lib/pesanError.ts` (`tampilkanError`, `pesanErrorRamah`). Semua notifikasi error otomatis diterjemahkan |
| BUG-26 | Monitor membaca `database.status` dari `/api/health`; status `not_configured` bila env Supabase kosong |
| BUG-29 | Superadmin tanpa Support Access yang membuka `/app` atau `/app/dashboard` diarahkan ke Dashboard Platform |
