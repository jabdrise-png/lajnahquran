# Inventaris Tabel Lama → V2 (Fase 2, butir 1)

Status per 27 November 2026. Semua tabel lama di bawah ini **diarsipkan**: data dipindah oleh `2026_11_27_06_f2_migrasi_data_lama.sql`, akses aplikasi dicabut oleh `2026_11_27_09`.

## setoran_harian → recitation_entries

| Kolom lama | Kolom V2 | Aturan |
| --- | --- | --- |
| `id` | `legacy_setoran_id` | Penanda migrasi; isi asli disimpan di `legacy_payload` |
| `santri_id`, `halaqah_id`, `tanggal`, `waktu` | `santri_id`, `halaqah_id`, `recitation_date`, `session_slot` | Halaqah dari lembaga lain dikosongkan |
| `skema` (teks bebas) | `kind` → `recitation_kinds.code` | Dicocokkan ke kode/nama; jenis yang belum ada dibuat (dihitung murojaah, tidak menambah hafalan) |
| `surat_mulai`/`surat_selesai`/`surat` (nama) | `surah_start_no`, `surah_end_no` | `fn_surah_no()`: nama latin, "Surat 2", "2. Al-Baqarah" |
| `ayat_mulai`/`ayat_selesai`/`ayat` ("1-10") | `ayah_start`, `ayah_end` | Angka pertama/kedua |
| Arah mundur (An-Nas → An-Naba') | rentang naik | Disimpan 78:1–114:6 |
| `jumlah_halaman`, `kesalahan_kabir`, `kesalahan_shoghir` | `calculated_pages`, `major_mistakes`, `minor_mistakes` | |
| `nilai`, `keterangan` | `predicate`, `notes` | |
| `status_verifikasi` | `status` | ditolak/batal → voided; dikembalikan → returned; pending → submitted; lainnya → accepted |

Pemakai sebelumnya: `useSupabaseData` (muat & tulis), `SetoranHarianPage` (setoran terakhir), `PerkembanganMasterDataPage` (sinkron periode), 3 fungsi database. Sekarang: semua lewat `recitation_entries` + `lib/v2Adapter.ts`.

## attendance → halaqah_sessions + attendance_records / musammi_attendance_records

| Kolom lama | V2 | Aturan |
| --- | --- | --- |
| `date` (teks), `waktu`, `halaqah_id` | sesi `(halaqah_id, session_date, session_slot)` | Tanggal harus `YYYY-MM-DD`; sesi dibuat berstatus `completed` bila belum ada |
| `halaqah_id` kosong (santri) | dari keanggotaan pada tanggal itu | |
| `halaqah_id` kosong (musammi') | dari penugasan / musammi' utama halaqah | |
| `peran = 'Santri'`, `person_id` | `attendance_records.santri_id` | `legacy_attendance_id` |
| `peran = 'Musammi'`, `person_id` | `musammi_attendance_records.musammi_id` | Tabel baru (badal disiapkan untuk F3) |
| `status` ("Hadir") | `status` = kode `attendance_statuses` ("hadir") | Status lama yang belum dikenal ditambahkan |

Pemakai sebelumnya: `useSupabaseData` (muat, tambah, ubah, hapus), 5 fungsi statistik/absensi database. Sekarang: `rpc_record_attendance`, `rpc_update_attendance_entry`, `rpc_delete_attendance_entries`, statistik dari `fn_attendance_union`.

## halaqah_santri → halaqah_student_memberships

| Kolom lama | V2 |
| --- | --- |
| `halaqah_id`, `santri_id` | `halaqah_id`, `student_id` |
| `start_date`, `end_date` | `valid_from`, `valid_to` |
| `status` ("Aktif", "Mutasi", "Keluar") | `active`, `transferred`, `removed`, `ended` |

Pemakai sebelumnya: `useSupabaseData`, `HalaqahPage` (mutasi & import), 6 fungsi database, trigger sinkron dua arah. Sekarang: hanya `halaqah_student_memberships`.

## student_classes → student_enrollments

| Kolom lama | V2 |
| --- | --- |
| `santri_id`, `academic_year_id` | `student_id`, `academic_year_id` |
| `marhalah_id`, `kelas_id`, `marhalah`, `kelas` | `master_marhalah_id`, `master_kelas_id`, nama dari master |

Pemakai sebelumnya: `useSupabaseData`, `SantriPage`, `KenaikanKelasPage`, 4 fungsi database, trigger sinkron dua arah. Sekarang: hanya `student_enrollments`.

## Data referensi dari app_settings → tabel

| Kunci lama | Tabel baru |
| --- | --- |
| `SETORAN_SKEMA_OPTIONS` | `recitation_kinds` |
| `SETORAN_WAKTU_SKEMA_MAP` | `session_slots.default_kind_code` |
| `GLOBAL_WAKTU_HALAQAH` | `session_slots` |
| `GLOBAL_ATTENDANCE_STATUS` | `attendance_statuses` |
| `GLOBAL_JENIS_HALAQAH` | `halaqah_types` |
| CHECK `role IN (...)` | `roles` |

Kunci lama di `app_settings` tidak dihapus (hanya tidak dibaca lagi).

## Belum termasuk Fase 2

`ujian_bulanan`, `ujian_semester`, `student_progress`, `student_evaluation` masih dipakai dan akan diganti di F4 (Rekap Periode) dan F5 (Ujian & Raport).
