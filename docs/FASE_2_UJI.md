# Fase 2 – Satu Model Data & Peran Fleksibel: Cara Pasang & Uji

Mulai fase ini aplikasi **hanya** memakai tabel V2. Tabel lama (`setoran_harian`, `attendance`, `halaqah_santri`, `student_classes`) diarsipkan: datanya dipindah ke V2 lalu akses aplikasi ke tabel itu dicabut.

## 1. Sebelum mulai

1. **Cadangan.** Supabase > Database > Backups (atau `scripts/dump-production-schema.sh` untuk struktur). Migrasi ini memindahkan data.
2. **Pemeriksaan awal.** Jalankan `database/checks/f2_preflight.sql` di SQL Editor (hanya membaca).
   - Semua baris `OK` / `INFO` → lanjut.
   - Ada baris `PERIKSA` → berhenti, kirim hasilnya ke pengembang. Artinya database Anda berbeda dari repo (seperti penyebab BUG-01).
3. Pastikan migrasi Fase 1 sudah dijalankan, termasuk `2026_11_27_01_fix_publish_report_card_version.sql` (baru, hasil temuan test).

## 2. Jalankan migrasi (berurutan, satu file per kali)

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | `2026_11_27_02_f2_tabel_referensi.sql` | Tabel `roles`, `recitation_kinds`, `attendance_statuses`, `session_slots`, `halaqah_types`, `quran_surahs`; nilai awal diambil dari pengaturan lama |
| 2 | `2026_11_27_03_f2_multi_peran.sql` | Satu akun boleh banyak peran; `rpc_my_roles()` |
| 3 | `2026_11_27_04_f2_santri_dan_nama_marhalah.sql` | Kolom tanggal lahir & asal; NIS wajib & unik; nama marhalah/kelas selalu dari master (BUG-10) |
| 4 | `2026_11_27_05_f2_tabel_v2_pendukung.sql` | Tabel kehadiran musammi'; validasi memakai tabel referensi |
| 5 | `2026_11_27_06_f2_migrasi_data_lama.sql` | **Memindahkan data lama ke V2** dan mematikan sinkronisasi dua arah |
| 6 | `2026_11_27_07_f2_rpc_hanya_v2.sql` | Semua fungsi database hanya memakai V2; RPC absensi baru |
| 7 | `2026_11_27_08_f2_hapus_kolom_kembar.sql` | Hapus kolom kembar `recitation_entries` |
| 8 | `2026_11_27_09_f2_cabut_akses_tabel_lama.sql` | Cabut akses aplikasi ke tabel lama |

Jalankan 1–8 lalu **langsung deploy** kode Fase 2 (langkah 3). Selama jeda antara migrasi dan deploy, aplikasi versi lama akan gagal menyimpan absensi/setoran; pilih waktu sepi.

## 3. Deploy & rekonsiliasi

1. Merge cabang `fase-2-satu-model-data` → Netlify deploy.
2. Di SQL Editor, tangkap data yang mungkin masih ditulis aplikasi lama di sela waktu:

   ```sql
   select public.f2_migrate_legacy_data();
   select * from public.f2_legacy_reconciliation();
   ```

3. Kolom `belum_pindah` harus 0 kecuali baris yang memang rusak (keterangan menyebut alasannya, mis. tanggal absensi tidak valid). Simpan hasilnya.

## 4. Test otomatis

```bash
npm run test:v2   # ±30 detik, 70+ test
npm run test      # test v2 + suite lama
```

| File | Menguji |
| --- | --- |
| `tests/v2/f2-database.test.ts` | Migrasi data lama (setoran, absensi santri & musammi', keanggotaan, kelas), rekonsiliasi, migrasi ulang tanpa ganda, tabel referensi, jenis setoran baru oleh Admin, multi peran, BUG-10, NIS, akses tabel lama dicabut, tidak ada fungsi yang memakai tabel lama, pemeriksaan awal |
| `tests/v2/f2-adapter.test.ts` | Penerjemah V2 ↔ bentuk lama (nama surat ↔ nomor, arah mundur, status, jenis) |
| `tests/v2/f2-kode-dan-peran.test.ts` | Tidak ada query ke tabel lama di kode; pemilihan peran aktif untuk akun multi-peran |

Data uji tabel lama ada di `tests/v2/helpers/seed_legacy.sql` (contoh format nama surat, "Surat 2", arah mundur An-Nas → An-Naba', status kustom "Dispensasi", tanggal rusak).

## 5. Checklist uji manual (setelah deploy)

| No | Akun | Langkah | Harapan | OK |
| --- | --- | --- | --- | --- |
| 1 | Admin | Buka Setoran Harian, pilih tanggal lama | Setoran lama tampil dengan surat & jenis aslinya (Murojaah tidak berubah menjadi Manzil) | ☐ |
| 2 | Admin | Buka Sesi Halaqah tanggal lama | Absensi & setoran lama tampil | ☐ |
| 3 | Admin | Buku Absensi bulan lalu | Angka sama dengan sebelum migrasi | ☐ |
| 4 | Admin | Pengaturan > Referensi Data Dasar > tambah jenis "Tasmi'" tanpa centang "Menambah hafalan" | Muncul di pilihan jenis setoran | ☐ |
| 5 | Admin | Ubah jenis bawaan waktu Isya | Form setoran waktu Isya memakai jenis itu | ☐ |
| 6 | Admin | Tambah status kehadiran "Dispensasi" | Muncul di layar absensi | ☐ |
| 7 | Musammi' | Catat 1 setoran & absensi | Tersimpan; tidak ada error | ☐ |
| 8 | Superadmin | Users > edit akun Admin uji > centang juga "Musammi'" | Tampil 2 peran | ☐ |
| 9 | Akun no. 8 | Login | Muncul layar "Masuk sebagai"; pilih Musammi' → menu Musammi'; ganti lewat pilihan di atas layar | ☐ |
| 10 | Admin | Ganti nama marhalah di Struktur | Nama baru tampil di santri, halaqah, roster sesi | ☐ |
| 11 | Admin | Tambah santri tanpa NIS | Ditolak "NIS wajib diisi" | ☐ |
| 12 | Admin | Tambah santri dengan tanggal lahir & asal | Tersimpan | ☐ |
| 13 | Admin | Tahun Ajaran | Tab Rekonsiliasi sudah tidak ada | ☐ |

## 6. Yang berubah

| Butir rencana F2 | Perubahan |
| --- | --- |
| 1. Inventaris tabel lama → V2 | Lihat tabel di atas dan `docs/FASE_2_INVENTARIS.md` |
| 2. `recitation_kinds` | Jenis setoran per lembaga + `adds_memorization`, `counts_as_murojaah`; `recitation_entries.kind` foreign key ke tabel ini |
| 3. Referensi dari `app_settings` ke tabel | `attendance_statuses`, `session_slots` (dengan jenis bawaan per waktu), `halaqah_types`; layar Pengaturan baru |
| 4. Kolom kembar | 9 kolom kembar `recitation_entries` dihapus |
| 5. Migrasi data lama | `f2_migrate_legacy_data()` (bisa diulang) + `f2_legacy_reconciliation()` |
| 6. Halaman hanya membaca V2 | `useSupabaseData` + `lib/v2Adapter.ts`; RPC `rpc_record_attendance`, `rpc_update_attendance_entry`, `rpc_delete_attendance_entries` |
| 7. Tabel `roles`, multi peran | `roles` menggantikan CHECK; layar "Masuk sebagai" dan pilihan peran di header; centang peran di Users |
| 8. BUG-10 | Nama marhalah/kelas selalu dari master (trigger + roster sesi) |
| 9. Santri | Tanggal lahir, asal; NIS wajib & unik |
| 10. Cabut akses tabel lama, hapus Rekonsiliasi | Migrasi `_09`; tab Rekonsiliasi dihapus dari halaman Tahun Ajaran |

Temuan & perbaikan tambahan:

- **Keamanan:** `rpc_submit_recitation_entry` versi lama tidak benar-benar memeriksa penugasan Musammi' (argumen lembaga tertukar), sehingga akun Musammi' mana pun bisa mencatat setoran santri mana pun. Diperbaiki & diuji.
- Import santri menyimpan ID master marhalah/kelas sebagai angka (selalu kosong untuk UUID). Diperbaiki.
- Undangan pengguna (`api/invitations.ts`) memakai kunci unik baru per peran.

## 7. Catatan untuk fase berikutnya

- Perhitungan total hafalan di beberapa laporan masih mencocokkan nama jenis ("ziyadah"); F3/F4 memindahkannya ke penanda `adds_memorization` sepenuhnya.
- Alur validasi (accepted/returned) masih ada sampai F3.
- Tabel lama tidak dihapus; bisa dihapus setelah uji coba lembaga (F8).
