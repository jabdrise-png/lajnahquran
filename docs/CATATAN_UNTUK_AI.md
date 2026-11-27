# Catatan untuk Asisten AI (AI Studio, dll.) — Perubahan Fase 0 s.d. Fase 7

Baca file ini **sebelum** mengubah kode. Isinya: apa yang sudah diubah, aturan yang wajib diikuti, dan hal yang tidak boleh dilakukan. Acuan utama: `docs/SPESIFIKASI_V2.md` (kebutuhan) dan `docs/RENCANA_V2.md` (urutan fase).

---

## 1. Konteks singkat

- Aplikasi: Lajnah Quran, SaaS manajemen tahfidz multi-lembaga. React 18 + Vite + TypeScript, Supabase (Postgres + RLS + fungsi RPC), Netlify Functions (`netlify/functions/api.ts`, `api/*`).
- Repo, Netlify, dan Supabase ini adalah **lingkungan pengembangan v2**. Aplikasi produksi lama berjalan di tempat lain dan tidak boleh disentuh (`docs/LINGKUNGAN.md`).
- Peran login: `superadmin`, `admin`, `musammi`. `wali_kelas` dan `wali_santri` sudah ada di tabel `roles` tetapi **belum aktif**.

---

## 2. Aturan wajib (jangan dilanggar)

1. **Semua perubahan database = file migrasi baru** di `database/migrations/`, nama `YYYY_MM_DD_NN_deskripsi.sql`, dibungkus `begin; … commit;`, ada komentar tujuan + **Rollback**, aman dijalankan ulang (`if exists`, `create or replace`, `on conflict do nothing`), dan dicatat di tabel Riwayat `database/migrations/README.md`. Jangan mengedit file SQL lama (`supabase_saas_v2_migration.sql`, `supabase_v2_1_production_hardening.sql`, `skema_lajnah.sql`) — itu arsip. Penyebab BUG-01 adalah perubahan database yang tidak tersimpan di repo.
2. **Jangan membaca/menulis tabel lama** dari kode: `setoran_harian`, `attendance`, `halaqah_santri`, `student_classes`. Aksesnya sudah dicabut di database; ada test yang gagal bila kode memakainya.
3. **Jangan membaca daftar referensi dari `app_settings`**: `SETORAN_SKEMA_OPTIONS`, `SETORAN_WAKTU_SKEMA_MAP`, `GLOBAL_WAKTU_HALAQAH`, `GLOBAL_ATTENDANCE_STATUS`, `GLOBAL_JENIS_HALAQAH`. Pakai tabel referensi (bagian 4).
4. **Menulis absensi & setoran hanya lewat RPC** (bagian 5), bukan `insert/update` langsung dari halaman.
5. **Jalankan `npm run test` sebelum selesai.** Semua harus lulus. Bila menambah migrasi, test otomatis menjalankannya (dua kali) di database memori; bila gagal, perbaiki migrasinya, jangan menonaktifkan test.
6. **Pesan error ke pengguna dalam bahasa Indonesia yang ramah.** Gunakan `tampilkanError(err, 'Gagal …')` dari `lib/pesanError.ts`. `NotificationStore` juga otomatis menerjemahkan pesan error teknis.
7. **Alasan (reason) divalidasi di server**, bukan hanya di layar. Untuk validasi di layar pakai `cekAlasan()` (aturannya sama dengan fungsi database `fn_alasan_valid`).
8. Jangan menambah fitur di luar `docs/RENCANA_V2.md` selama F1–F3 (pembekuan fitur).
9. **Jangan menghidupkan lagi Kunci Sesi atau Validasi Setoran** (Fase 3). Koreksi setoran: Admin & musammi' halaqah itu (alasan opsional); pembatalan hanya Admin + alasan. Setoran langsung sah; halaman & predikat dihitung server — jangan mengirim angka/predikat dari layar sebagai kebenaran.
10. **Capaian per periode hanya dari Rekap Periode** (`period_recaps`, Fase 4). Jangan membaca/menulis `student_progress`, `student_evaluation`, `halaqah_evaluations`, `halaqah_evaluation_questions`, `evaluation_settings`, atau JSON `EVALUATION_PERIODS`. Menulis rekap hanya lewat `rpc_simpan_form_periode`.
11. **Nilai ujian hanya di `exam_attempts`, ditulis lewat `rpc_simpan_ujian`** (Fase 5); raport hanya lewat `rpc_publish_report_card` (komponen & nilai dihitung server). Jangan membaca/menulis `ujian_bulanan`, `ujian_semester`, `silabus_scores`, atau pengaturan `PCT_*`, `UB_PERIODS_*`, `NILAI_AWAL_JUZ`, `PENGURANG_KHOTO_*`, `GLOBAL_PREDIKAT_NILAI`; jangan menghitung nilai raport di layar sebagai kebenaran.
12. **Pesan Telegram ke wali hanya lewat antrian server** (`notification_queue`, Fase 6). Jangan mengirim pesan setoran/kehadiran/progres dari layar, jangan membaca token bot di browser, jangan menulis `notification_queue` atau `santri.kode_telegram` langsung. Pesan dibuat fungsi database (pemicu/RPC) dan dikirim `api/notify/antrian.ts`. WhatsApp Fonnte tidak dipakai di tampilan.

---

## 3. Fase 0 — Persiapan (dokumen)

- `docs/SPESIFIKASI_V2.md`, `docs/RENCANA_V2.md`, `docs/LINGKUNGAN.md`, `docs/audit/BUG_REPORT_2026-11.md`.
- `database/migrations/README.md` (aturan migrasi), `scripts/dump-production-schema.sh` (ekspor struktur database).

---

## 4. Fase 1 — Perbaikan kritis

### Migrasi

| File | Isi |
| --- | --- |
| `2026_11_26_01_fix_recitation_revisions_action_check.sql` | BUG-01: constraint `recitation_revisions_action_check` memuat semua aksi RPC (setoran bisa disimpan) |
| `2026_11_26_02_platform_tenant_stats_rpc.sql` | BUG-03: `rpc_platform_tenant_stats()` (khusus superadmin, angka agregat per lembaga) |
| `2026_11_26_03_guard_access_grants.sql` | BUG-04/05: trigger `trg_guard_access_grants` — hanya superadmin menyentuh grant superadmin; tidak ada yang bisa mengubah peran/status grant **miliknya sendiri** (kecuali invited→active); superadmin aktif terakhir & admin aktif terakhir per lembaga tidak bisa dinonaktifkan |
| `2026_11_26_04_reason_validation.sql` | BUG-07/08: `fn_alasan_valid(teks, min)`; trigger alasan amandemen raport (≥5) dan alasan Support Access (≥10 karakter, ≥2 kata) |
| `2026_11_27_01_fix_publish_report_card_version.sql` | Temuan test: `rpc_publish_report_card` dulu memberi nomor versi amandemen yang bentrok |

### Kode

- `lib/ramahkanError.ts` + `lib/pesanError.ts`: penerjemah pesan error (BUG-16); dipasang di `lib/NotificationStore.ts`.
- `lib/aksesPengguna.ts`: `bolehKelolaAkses()` (tombol Edit/Suspend/Revoke disembunyikan untuk akun sendiri; Admin hanya mengelola Musammi'), `tujuanSuperadminTanpaSupport()` (BUG-29: superadmin ke `/platform/dashboard`), `ringkasStatusDb()` (BUG-26).
- `pages/Platform/PlatformConsolePage.tsx` memakai `rpc_platform_tenant_stats`; `pages/Users.tsx`, `components/layouts/SaaSLayouts.tsx`, `netlify/functions/api.ts` (status DB `not_configured`).

---

## 5. Fase 2 — Satu model data & peran fleksibel

### 5.1 Peta tabel (lama → V2)

| Lama (arsip, jangan dipakai) | V2 (pakai ini) |
| --- | --- |
| `setoran_harian` | `recitation_entries` |
| `attendance` (peran Santri) | `halaqah_sessions` + `attendance_records` |
| `attendance` (peran Musammi) | `halaqah_sessions` + `musammi_attendance_records` (tabel baru, ada kolom badal) |
| `halaqah_santri` | `halaqah_student_memberships` |
| `student_classes` | `student_enrollments` |

Detail kolom: `docs/FASE_2_INVENTARIS.md`. Tabel `santri`, `halaqah`, `musammi`, `master_marhalah`, `master_kelas_relasi`, `academic_years` tetap dipakai. `student_progress` & `student_evaluation` dipindah ke Rekap Periode di F4 (bagian 7); `ujian_bulanan` & `ujian_semester` dipindah ke `exam_attempts` di F5 (bagian 8).

### 5.2 Tabel referensi baru (per lembaga, diatur Admin)

| Tabel | Kolom penting | Catatan |
| --- | --- | --- |
| `roles` | `code`, `label`, `scope`, `is_active` | Menggantikan CHECK peran; `access_grants.role` foreign key ke sini |
| `recitation_kinds` | `code`, `name`, `adds_memorization`, `counts_as_murojaah`, `is_active` | Jenis setoran. **Hanya jenis dengan `adds_memorization = true` yang menambah hafalan.** `recitation_entries.kind` = `code` (foreign key) |
| `attendance_statuses` | `code`, `name`, `counts_as_present`, `allows_recitation`, `is_active` | `attendance_records.status` menyimpan `code` (huruf kecil, mis. `hadir`) |
| `session_slots` | `code`, `name`, `default_kind_code`, `start_time` | `code` = nilai yang disimpan di `halaqah.waktu` / `session_slot` (mis. `Shubuh`). Jangan diganti; ubah `name` |
| `halaqah_types` | `name` | Jenis halaqah |
| `quran_surahs` | `no`, `name`, `ayah_count` | 114 surat |

Aturan database: referensi yang sudah dipakai tidak bisa dihapus (nonaktifkan saja); `code` tidak bisa diubah; lembaga baru otomatis mendapat nilai bawaan. Layar pengaturan: `components/ReferensiLembagaPanel.tsx` (di `pages/SettingsPage.tsx`).

### 5.3 Kolom yang dihapus dari `recitation_entries`

`student_id`, `entry_date`, `start_surah`, `end_surah`, `start_ayah`, `end_ayah`, `pages`, `mistakes_major`, `mistakes_minor`.
Pakai: `santri_id`, `recitation_date`, `surah_start_no`, `ayah_start`, `surah_end_no`, `ayah_end`, `calculated_pages`, `major_mistakes`, `minor_mistakes`. Baris hasil migrasi punya `legacy_setoran_id` dan `legacy_payload`.

### 5.4 RPC yang dipakai halaman

| Keperluan | RPC |
| --- | --- |
| Simpan / ubah setoran | `rpc_submit_recitation_entry` (ubah: isi `p_existing_entry_id`); `p_kind` boleh kode atau nama jenis |
| Batalkan setoran | `rpc_review_recitation_entry(p_entry_id, 'voided', alasan)` |
| Simpan absensi santri & musammi' | `rpc_record_attendance(p_records jsonb, p_reason)` — sesi dibuat otomatis |
| Ubah / hapus absensi | `rpc_update_attendance_entry(p_kind, p_id, p_status, p_reason)`, `rpc_delete_attendance_entries(p_items, p_reason)` |
| Buka sesi (roster) | `rpc_open_halaqah_session` (nama marhalah/kelas dari master) |
| Statistik absensi | `rpc_get_attendance_stats`, `_trend`, `rpc_get_santri_attendance_percentages`, `rpc_get_waktu_stats` (membaca V2) |
| Peran pengguna login | `rpc_my_roles()` |
| Kelola peran pengguna | `rpc_manage_access_grant` — tanpa `p_grant_id`, grant dicari per (pengguna, lembaga, **peran**), jadi menambah peran tidak menimpa peran lain |

Dihapus: `rpc_get_academic_reconciliation_report`, `rpc_reconcile_academic_v2_data`, semua trigger/fungsi sinkronisasi lama ↔ V2.

### 5.5 Data di frontend

- `hooks/useSupabaseData.tsx` memuat **hanya tabel V2** dan menyediakan juga `recitationKinds`, `attendanceStatuses`, `sessionSlots`, `halaqahTypes`.
- `lib/v2Adapter.ts` menerjemahkan V2 ke bentuk lama agar halaman lama tetap jalan:
  - `setoranHarian` = baris `recitation_entries` berbentuk lama (`tanggal`, `waktu`, `skema` = nama jenis, `surat_mulai`, `ayat_mulai`, `jumlah_halaman`, `nilai`, …) **plus** `id`/`v2_id` (UUID), `kind`, `adds_memorization`, `counts_as_murojaah`. Setoran `voided` tidak dimuat.
  - `attendance` = gabungan `attendance_records` + `musammi_attendance_records` berbentuk `AttendanceRecord` (`id` UUID, `kind: 'santri'|'musammi'`, `status` = nama status, `statusCode`).
  - `surahNo()`, `slug()`, `findKind()`, `findStatus()` sama aturannya dengan fungsi database.
- Untuk logika hafalan, gunakan `row.adds_memorization` / `row.counts_as_murojaah`, **bukan** mencocokkan teks "ziyadah".
- `addAttendanceRecords(records, reason?)`, `updateAttendanceRecord(id, updates, reason?)`, `deleteAttendanceRecord(id, reason?)`, `addSetoranHarianRecord`, `updateSetoranHarianRecord`, `deleteSetoranHarianRecord(id, reason?)` di hook sudah memakai RPC di atas.

### 5.6 Multi peran

- Satu akun boleh punya grant `admin` dan `musammi` di lembaga yang sama.
- Peran aktif dipilih pengguna (`lib/activeRole.ts`: `ActiveRoleStore`, `pilihPeranAktif`); `resolveTenantContext()` di `lib/permissions.ts` mengembalikan `availableRoles`.
- `App.tsx` menampilkan layar "Masuk sebagai" bila belum memilih; `components/Header.tsx` punya pilihan ganti peran.
- Pilihan peran hanya mengatur **tampilan/menu**. Hak akses di database tetap mengikuti seluruh grant aktif.
- `pages/Users.tsx`: modal edit memakai centang peran. Admin boleh menambah peran Musammi' untuk dirinya sendiri, tidak boleh mengubah/mencabut grant miliknya.

### 5.7 Santri & marhalah

- `santri.kode` = **NIS**, wajib untuk santri baru dan unik per lembaga. Kolom baru: `tanggal_lahir`, `asal`.
- Kolom teks `marhalah`/`kelas` (di `santri`, `halaqah`, `musammi`, `student_enrollments`, dll.) diisi otomatis dari `master_marhalah`/`master_kelas_relasi` dan ikut berubah saat nama master diganti. Selalu simpan `marhalah_id`/`kelas_id`; jangan mengandalkan teks.

### 5.8 Perbaikan keamanan

`rpc_submit_recitation_entry` versi lama tidak memeriksa penugasan Musammi' (argumen tertukar). Versi baru memeriksa: Admin lembaga, atau Musammi' yang ditugaskan pada halaqah & tanggal itu. Ada test untuk Musammi' tanpa penugasan dan dari lembaga lain.

### 5.9 Migrasi Fase 2 (urutan)

`2026_11_27_02_f2_tabel_referensi` → `_03_f2_multi_peran` → `_04_f2_santri_dan_nama_marhalah` → `_05_f2_tabel_v2_pendukung` → `_06_f2_migrasi_data_lama` (fungsi `f2_migrate_legacy_data()` & `f2_legacy_reconciliation()`, bisa diulang) → `_07_f2_rpc_hanya_v2` → `_08_f2_hapus_kolom_kembar` → `_09_f2_cabut_akses_tabel_lama`.
Pemeriksaan sebelum migrasi: `database/checks/f2_preflight.sql`. Panduan lengkap: `docs/FASE_2_UJI.md`.

---

## 6. Fase 3 — Absensi & setoran sesuai spesifikasi

### 6.1 Aturan bisnis (dijaga database)

| Aturan | Di mana |
| --- | --- |
| Setoran langsung sah: status hanya `accepted` / `voided` | trigger `fn_validate_recitation_state_machine` |
| Halaman dihitung server dari mushaf Madinah (`quran_ayahs`), angka dari layar diabaikan | `fn_hitung_halaman(s1,a1,s2,a2)` — sama persis dengan `calculateHalamanSetoran()` di `lib/quranPageMap.ts` (diuji 312 rentang) |
| Predikat otomatis dari khoto kabir/shoghir | tabel `fluency_rules` per lembaga + `fn_predikat_kelancaran(org, kabir, shoghir)`; layar: `hitungPredikat()` di `lib/kelancaran.ts` (aturan sama, diuji) |
| Rasib = diulang, **tidak menambah hafalan** | kolom `recitation_entries.is_repeat`; adaptor: `adds_memorization = kind.adds_memorization && !is_repeat` |
| Koreksi / batal setoran hanya Admin + alasan ≥ 5 | `rpc_submit_recitation_entry(p_existing_entry_id, p_reason)`, `rpc_review_recitation_entry(id, 'voided', alasan)` (status lain ditolak: "Validasi setoran sudah dihapus") |
| Santri berstatus absensi yang tidak `allows_recitation` (Sakit/Izin/Alpa) tidak bisa setor | `rpc_submit_recitation_entry` (BUG-12) |
| Tidak ada kunci sesi; sesi dibuat saat absensi pertama disimpan | `rpc_record_attendance`; `rpc_open_halaqah_session` hanya mengembalikan roster (status `belum_dibuka`, tanpa insert) |
| Absensi hari ini bebas diperbarui (Admin, musammi' bertugas, badal); tanggal lampau = Admin + alasan | `fn_assert_can_record`, `fn_assert_can_correct`; "hari ini" = `fn_hari_ini_lembaga(org)` (zona waktu lembaga) |
| Badal: musammi' pengganti otomatis boleh mencatat untuk halaqah & tanggal itu | `fn_bisa_mencatat(org, halaqah, tanggal)` |
| Nama pencatat absensi tersimpan | kolom `marked_by_name` (trigger `fn_fill_marked_by_name`) |
| Jadwal bentrok (orang di 2 halaqah pada waktu sama) | `rpc_jadwal_bentrok(org)` — Admin saja |
| Arah hafalan per santri | `santri.arah_hafalan` (`mundur` bawaan / `maju`); layar: `lib/arahHafalan.ts` |

Dihapus: `rpc_lock_halaqah_session` (2 versi), `rpc_save_attendance_batch`, status sesi `locked`, status setoran `draft/submitted/returned`, policy delete langsung `recitation_entries`.

### 6.2 Layar

| Layar | File |
| --- | --- |
| Absensi (satu layar, semua halaqah per waktu) — rute `/app/attendance` | `pages/Operasional/AbsensiPage.tsx` + `components/absensi/AbsensiHalaqahCard.tsx` (`pages/Attendance.tsx` dihapus) |
| Sesi Halaqah (tab Absensi / Setoran / Santri / Riwayat) | `pages/Operasional/SesiHalaqahPage.tsx` |
| Setoran & Murojaah (daftar + rekap + "Catat setoran") | `pages/SetoranHarianPage.tsx` |
| Input setoran ringkas (dipakai di dua layar di atas) | `components/setoran/FormSetoranRingkas.tsx` → `simpanSetoran(args)` di hook |
| Daftar setoran + riwayat revisi + Koreksi/Batalkan (Admin) | `components/setoran/DaftarSetoran.tsx` |
| Dialog alasan | `components/ui/AlasanDialog.tsx` (`<AlasanDialog>` atau `useMintaAlasan()` berbasis Promise) |
| Tabel Kelancaran | bagian di `components/ReferensiLembagaPanel.tsx` |
| Arah hafalan | form di `pages/DataMaster/SantriPage.tsx` |

Helper layar: `lib/sesiHalaqah.ts` (`hariIni`, `halaqahSaya`, `opsiWaktu` (BUG-11), `halaqahPadaWaktu`, `rosterPadaTanggal`, `statusHadir`, `hitungPerubahan`), pesan Telegram wali sejak Fase 6 dibuat server (bagian 9).

Hook (`hooks/useSupabaseData.tsx`): tambah `fluencyRules`, `simpanSetoran(args, {refresh})`; `deleteSetoranHarianRecord(id, alasan)` wajib alasan; `addAttendanceRecords/updateAttendanceRecord/deleteAttendanceRecord/deleteAttendanceBatch(..., reason)` — **kirim alasan bila tanggalnya sudah lewat**, server menolak tanpa alasan.

### 6.3 Migrasi Fase 3 (urutan)

`2026_11_28_01_f3_mushaf_kelancaran_arah` → `_02_f3_setoran_langsung_sah` → `_03_f3_absensi_tanpa_kunci`. Panduan pasang & uji manual: `docs/FASE_3_UJI.md`.

---

## 7. Fase 4 — Rekap Periode

### 7.1 Tabel baru

| Tabel | Isi |
| --- | --- |
| `evaluation_periods` | periode per lembaga (`name`, `start_date`, `end_date`, `academic_year_id`, `legacy_key`, `needs_review`). Tidak boleh tumpang tindih (trigger `fn_validate_evaluation_period`); periode `needs_review` (hasil migrasi meragukan) diabaikan perhitungan & formnya tidak bisa dibuka |
| `halaqah.recording_mode` | `harian` / `rekap`. Ubah lewat `rpc_set_mode_halaqah`; mode periode berjalan dibekukan di `period_forms` (berlaku periode berikutnya) |
| `period_form_fields` | isian form: `system_key` (ziyadah, murojaah, posisi, kelancaran, kehadiran — tidak bisa dihapus, hanya ganti nama) dan isian bebas (`number`/`choice`/`boolean`/`text`), `scope` `santri` atau `kegiatan` |
| `period_forms` | satu per halaqah per periode: `recording_mode` (dibekukan), `status` (`belum_diisi`/`draft`/`submitted`), `activity_answers` |
| `period_recaps` | **satu baris per santri per periode**: `ziyadah_pages`, `murojaah_pages` (halaman), `posisi_maju_*`/`posisi_mundur_*`, `total_pages`, `total_juz`, `kelancaran`, `hadir_count`/`kehadiran_total`/`kehadiran_persen`, `sumber` (`harian`/`rekap`/`migrasi`), `overrides` (isian sistem yang dikoreksi Admin), `free_answers`, `notes` |
| `quran_juz` + `fn_total_hafalan(maju_s, maju_a, mundur_s, mundur_a)` | total hafalan dari posisi = `hitungTotalHafalan()` di `lib/totalHafalan.ts` (diuji) |
| `silabus_scores` | nilai Silabus Hafalan per santri per semester (dulu `student_progress` `SEM-*`). **Sejak Fase 5 tidak dipakai raport** (hanya arsip) |

### 7.2 Aturan (dijaga database)

- Mode Harian: `fn_hitung_rekap_santri` — ziyadah = jumlah halaman setoran jenis `adds_memorization` yang bukan Rasib; murojaah = jenis `counts_as_murojaah`; posisi = dari ziyadah terakhir (sesuai arah hafalan, `fn_posisi_dari_setoran`), kalau tidak ada dari rekap periode sebelumnya; kelancaran = rata-rata peringkat predikat; kehadiran dari `attendance_records`.
- Trigger `trg_rekap_dari_setoran` / `trg_rekap_dari_absensi` menghitung ulang rekap otomatis; koreksi Admin (`overrides`) tidak ditimpa.
- Isian sistem Mode Harian hanya bisa diubah Admin dengan alasan; Mode Rekap diisi musammi'. Kirim ditolak bila Mode Rekap belum lengkap.
- Form terkirim: musammi' tidak bisa mengubah form maupun menambah setoran bertanggal di periode itu (`trg_jaga_setoran_periode_terkirim`); Admin bisa mengoreksi (alasan) atau `rpc_buka_kembali_form_periode`.
- Rekap milik halaqah tempat santri di akhir periode (`fn_halaqah_pemilik`); setoran halaqah lama tetap dijumlah.

### 7.3 RPC

| Keperluan | RPC / hook |
| --- | --- |
| Buka form (membuat form & baris rekap bila belum ada) | `rpc_buka_form_periode(period, halaqah)` → `bukaFormPeriode` |
| Simpan Draft / Kirim / koreksi | `rpc_simpan_form_periode(period, halaqah, rows, activity, kirim, reason)` → `simpanFormPeriode` |
| Buka kembali form terkirim | `rpc_buka_kembali_form_periode(form, reason)` |
| Hitung ulang rekap harian | `rpc_hitung_rekap_harian(period, halaqah \| null)` |
| Pemantauan Periode | `rpc_status_periode(period)` → `statusPeriode` |
| Hapus periode berisi rekap | `rpc_hapus_periode(period, reason)` |
| Mode halaqah | `rpc_set_mode_halaqah(halaqah, mode)` |
| Periode & isian (Admin, RLS) | tabel langsung: `simpanPeriode`, `simpanIsianForm`, `hapusIsianForm` (`simpanNilaiSilabus` dihapus di Fase 5) |

### 7.4 Frontend

- Hook memuat `evaluationPeriods`, `periodeEvaluasi` (bentuk lama `MasterEvaluationPeriod`, id = UUID), `periodFormFields`, `periodRecaps` (diambil bertahap per 1000 baris), `periodForms` (`silabusScores` tidak dimuat lagi sejak Fase 5).
- `lib/rekapAdapter.ts` menurunkan bentuk lama untuk halaman analitik: `studentProgress` (Ziyadah = halaman, Murojaah & Total Hafalan = juz, Hafalan Depan/Belakang, Kelancaran, Kehadiran, isian bebas per label), `studentEvaluations`, `evaluationSettings` (dari isian pilihan), `halaqahEvalQuestions`, `halaqahEvaluations`. `month_key` = id periode. Fungsi lama `getEvaluationPeriods()` dihapus; `formatPeriodName(id, periodeEvaluasi)`.
- Layar: `pages/Evaluasi/FormEvaluasiPeriodePage.tsx` (`/app/evaluations`), `pages/Evaluasi/ProgresEvaluasiPage.tsx` (`/app/evaluations-master`: Pemantauan, Rekap Santri + ekspor, Pivot, Statistik), panel `components/evaluasi/PeriodeEvaluasiPanel.tsx`, `ModePencatatanPanel.tsx`, `IsianFormPanel.tsx` di `pages/PengaturanEvaluasiPage.tsx`.
- Dihapus: `PerkembanganInputPage`, `PerkembanganMasterDataPage`, `lib/syncEngine.ts` (Tarik Data/sinkronisasi), halaman tak terpakai `Chat.tsx`, `WaliSantriReport.tsx`, `WaliKelasReport.tsx`, tipe `AutoSync*`.

### 7.5 Migrasi Fase 4 (urutan)

`2026_11_29_01_f4_periode_dan_rekap` → `_02_f4_hitung_rekap` → `_03_f4_migrasi_evaluasi_lama` (`f4_migrate_legacy_evaluations()`, `f4_legacy_reconciliation()`, bisa diulang). Pemeriksaan awal: `database/checks/f4_preflight.sql`. Panduan: `docs/FASE_4_UJI.md`.

---

## 8. Fase 5 — Ujian & Raport

### 8.1 Tabel

| Tabel | Isi |
| --- | --- |
| `exam_attempts` | **satu sumber nilai ujian**. `exam_type` `monthly`/`semester`, `period_id` (ujian bulanan ke-n), `halaqah_id`, `attempt_no` (remedial = percobaan baru), `is_remedial`, `materi_juz`, `juz_scores` (`[{juz, kabir, shoghir, nilai}]`), `final_score`, `predikat`, `passed`, `rubric_version_id`, `status` `valid`/`voided` (koreksi Admin membatalkan, tidak menghapus), `source` `aplikasi`/`migrasi`. Hanya bisa dibaca dari aplikasi; tulis lewat RPC |
| `monthly_exam_periods` | ujian bulanan ke-1…24 per tahun ajaran & semester (`label`, `legacy_key`). Admin kelola (RLS); tidak bisa dihapus bila sudah ada nilai |
| `rubric_versions` | rubrik aktif (`fn_rubrik_aktif`): `initial_score`, `deduction_major` (kabir), `deduction_minor` (shoghir), `min_score`, `passing_score` (KKM), `predicates` `[{label, minScore}]`. Simpan lewat `rpc_save_rubric_version` (versi baru) |
| `raport_settings` | per lembaga: `bobot_semester` (> 0), `bobot_bulanan`, `bobot_kehadiran` (total 100; awal 50/30/20), `ketua_lajnah_nama`, `ketua_lajnah_jabatan`, `ttd_image` (data URL ≤ 400.000 karakter), `kota_terbit` |
| `exam_assignments` | penguji tambahan: musammi' → halaqah, `exam_type` `semua`/`bulanan`/`semester`, per tahun ajaran & semester |
| `raport_catatan` | catatan raport per santri per semester (tulis lewat `rpc_simpan_catatan_raport`) |
| `report_cards` | raport terbit (versi, `snapshot_json` format `f5`, `snapshot_hash`). Tulis langsung dicabut |

### 8.2 Aturan (dijaga database)

- Nilai juz = nilai custom penguji (`nilai_custom` 0–100, ditandai `custom: true`) bila diisi, selain itu `fn_nilai_juz(rubrik, kabir, shoghir)` = max(min, nilai awal − kabir × pengurang kabir − shoghir × pengurang shoghir); nilai semester = rata-rata juz; predikat `fn_predikat_nilai`. Rumus layar `lib/ujian.ts` (`nilaiJuz`, `nilaiSemester`, `predikatNilai`, `percobaanRaport`) diuji sama dengan server.
- Penguji (`fn_bisa_menguji`): Admin; musammi' yang boleh mencatat halaqah santri saat ini; atau musammi' yang ditugaskan di `exam_assignments` sesuai jenis ujian.
- Simpan nilai baru ditolak bila sudah ada nilai → mode `remedial`. Mode `koreksi` hanya Admin + alasan (`fn_alasan_valid`). Musammi' tidak bisa mengubah nilai bila raport santri sudah terbit.
- Komponen raport `fn_komponen_raport`: ujian semester (**nilai tertinggi** dari percobaan sah; sama tinggi → terbaru), rata-rata ujian bulanan (nilai tertinggi per ujian bulanan), kehadiran (`attendance_records` dalam tanggal semester, `fn_tanggal_semester`). `kekurangan` (menghalangi terbit) vs `peringatan`.
- `rpc_publish_report_card` hanya Admin; menolak bila ada kekurangan; idempoten bila hash sama; amandemen wajib alasan; snapshot menyimpan identitas santri, komponen, info hafalan (whitelist), tanda tangan (nama, jabatan, kota, sha256 gambar).

### 8.3 RPC & hook

| Keperluan | RPC / hook |
| --- | --- |
| Simpan nilai ujian (baru / remedial / koreksi) | `rpc_simpan_ujian(santri, exam_type, year, semester, period, materi_juz, juz, nilai, mode, reason, notes)` → `simpanUjian` |
| Batalkan percobaan (Admin) | `rpc_batal_ujian(id, reason)` → `batalUjian` |
| Catatan raport | `rpc_simpan_catatan_raport` → `simpanCatatanRaport` |
| Komponen raport (difilter sesuai hak penguji) | `rpc_komponen_raport(year, semester, santri_ids)` → `komponenRaport` |
| Terbit / amandemen raport | `rpc_publish_report_card(year, semester, santri, info, amendment_reason)` → `terbitkanRaport` |
| Ujian bulanan, pengaturan raport, penguji (Admin, RLS) | tabel langsung: `simpanPeriodeUjian`, `hapusPeriodeUjian`, `simpanPengaturanRaport`, `tambahPenguji`, `hapusPenguji` |

Hook memuat `examAttempts`, `periodeUjianBulanan`, `rubrikAktif`, `pengaturanRaport`, `pengujiUjian`, `catatanRaport`; `globalPredikatNilai` = predikat rubrik aktif. Dihapus: `ujianBulanan`, `ujianSemester`, `saveUjian*`, `deleteUjianBulanan`, `rpc_record_exam_attempt`.

### 8.4 Layar

- `pages/UjianRaport/UjianBulananPage.tsx` (`/app/exams-monthly`), `UjianSemesterPage.tsx` (`/app/exams-semester`) — Admin & musammi' (menu "Ujian").
- `RekapNilaiPage.tsx` (`/app/report-cards`) — komponen dari server, kekurangan, terbit/amandemen, cetak; dokumen `components/RaportDocument.tsx` (3 komponen, tanda tangan Ketua Lajnah, ruang tanda tangan wali; raport terbit dicetak dari snapshot).
- `PengaturanNilaiPage.tsx` (`/app/settings/rubrics`) — rubrik, bobot & tanda tangan raport, penguji.

### 8.5 Migrasi Fase 5 (urutan)

`2026_11_30_01_f5_ujian_struktur` → `_02_f5_rpc_ujian_raport` → `_03_f5_migrasi_ujian_lama` (`f5_migrate_legacy_exams()`, `f5_legacy_reconciliation()`, bisa diulang) → `_04_keputusan_f3_f4` (keputusan pemilik 26-11-2026: `santri.arah_hafalan` bawaan `maju` + `dua_arah` dengan `fn_sisi_setoran` = `sisiSetoran()` di `lib/arahHafalan.ts`; kehadiran rekap selalu dari absensi — `rpc_simpan_form_periode` menolak isian kehadiran; koreksi setoran oleh musammi' via `rpc_submit_recitation_entry` + `fn_validate_recitation_state_machine`). Pemeriksaan awal: `database/checks/f5_preflight.sql`. Panduan: `docs/FASE_5_UJI.md`.

---

## 9. Fase 6 — Telegram & laporan otomatis

### 9.1 Data

| Tabel / kolom | Isi |
| --- | --- |
| `santri.kode_telegram`, `telegram_linked_at` | kode acak 8 karakter (abjad tanpa I O 0 1), dibuat trigger `trg_kode_telegram`; tidak bisa diubah langsung (hanya `rpc_buat_ulang_kode_telegram`). `telegram_chat_id` boleh sama untuk beberapa santri (satu wali beberapa anak) |
| `telegram_settings` | per lembaga: `setoran_aktif/_template`, `mingguan_aktif/_hari (0=Ahad)/_jam/_template/_terakhir`, `periode_aktif/_template`. Admin baca/ubah lewat RLS |
| `notification_queue` | antrian: `jenis` (setoran, kehadiran_mingguan, progres_periode, uji), `pesan` (sudah jadi), `dedup_key` unik per lembaga, `status` antri/proses/terkirim/gagal/batal, `attempts`, `next_attempt_at`, `last_error`. Admin hanya membaca |
| `telegram_link_attempts` | percobaan penautan (batas 5 kode salah/jam/chat); hanya server |

### 9.2 Alur

- Template: `fn_render_template(tpl, vars)` = `renderTemplate()` di `lib/telegramPesan.ts` (diuji sama). `{var}` tak dikenal dibiarkan, null → "-".
- Setoran: trigger `trg_antrian_setoran` (insert `recitation_entries`, status accepted, halaqah bukan Mode Rekap, `setoran_aktif`) → `fn_antrikan` (hanya bila santri tertaut & token bot aktif). Variabel lama `{skema} {jumlah_halaman} {khoto_kabir} {khoto_shoghir} {nilai} {keterangan}` tetap didukung.
- Capaian periode: trigger `trg_antrian_progres_periode` saat `period_forms.status` menjadi `submitted` (`periode_aktif`), atau `rpc_kirim_progres_periode(period, halaqah, ulang)`.
- Kehadiran mingguan: `rpc_proses_jadwal_telegram(now)` (service role, tiap menit) mengantrikan pada hari/jam lembaga (`organizations.timezone`, bawaan Asia/Jakarta) sekali per hari; `rpc_kirim_kehadiran_mingguan(selesai)` untuk Admin.
- Pengiriman: `fn_antrian_ambil(batas, org)` (kunci `for update skip locked`) → kirim → `fn_antrian_selesai(id, ok, error, permanen)` (coba ulang 1–2–4–8 menit, maks. 5).
- Penautan (webhook): `fn_tautkan_telegram(org, chat, kode)`, `fn_telegram_anak`, `fn_telegram_berhenti` — hanya service role.
- RPC Admin: `rpc_status_telegram`, `rpc_buat_ulang_kode_telegram`, `rpc_putus_telegram`, `rpc_uji_telegram`, `rpc_antrian_ulangi`, `rpc_antrian_batal`.

### 9.3 Server (Netlify)

- `api/telegram-webhook.ts` (rute `/api/telegram-webhook`, diverifikasi secret per lembaga): `uraiPesanWali()` → kode / `/anak` / `/berhenti` / sambutan; balasan teks biasa dari `lib/telegramPesan.ts`. ID/NIS santri tidak pernah menautkan.
- `api/notify/antrian.ts` `prosesAntrian()` dipakai `netlify/functions/telegram-antrian.ts` (terjadwal tiap menit, `netlify.toml`) dan `POST /api/notify/proses` (`api/notify/proses.ts`, dipicu layar lewat `kirimAntrianSekarang()` di `lib/antrianPesan.ts`).
- Wajib env Netlify: `SUPABASE_SERVICE_ROLE_KEY`. `/api/health` → `telegramOtomatis: siap | belum_diatur`.

### 9.4 Layar

- `pages/Pengaturan/NotifikasiTelegramPage.tsx` (`/app/telegram`): status bot, sambungkan webhook, template + pratinjau, kode wali (undangan, kode baru, putuskan, uji, ekspor), antrian.
- `pages/Laporan/LaporanMudirPage.tsx` (`/app/reports/mudir`): hitungan `lib/laporanMudir.ts`, PDF `lib/laporanMudirPdf.ts` (jsPDF).
- Dihapus: `components/SetoranSettingsModal.tsx`, `lib/notifSetoran.ts`, `lib/whatsapp.ts`, `lib/notifications.ts`; kartu WhatsApp (Fonnte) di Pengaturan; kirim massal Fonnte di Analisis per Kelas.

### 9.5 Migrasi Fase 6 (urutan)

`2026_12_01_01_f6_telegram_struktur` → `_02_f6_telegram_fungsi`. Panduan: `docs/FASE_6_UJI.md`.

---

## 10. Fase 7 — HP, performa & PWA

### 10.1 Build & muat

- Tailwind lewat build (`tailwind.config.js`, `postcss.config.js`, `index.css` berisi `@tailwind`); font Inter dari `@fontsource/inter` (latin). **Jangan** menambah CDN/importmap ke `index.html`.
- Semua halaman di `App.tsx` memakai `lazyHalaman(() => import(...))` (`lib/muatHalaman.tsx`, memuat ulang sekali bila potongan gagal setelah deploy) + `<Suspense>`. Halaman baru wajib ikut pola ini.
- Pustaka berat dimuat saat dipakai: `exceljs` (lewat `lib/excel.ts`: `bacaBaris`, `unduhExcel`, `bacaCsv`), `jspdf`/`jspdf-autotable` (`exportToPDF` async). `xlsx` **dilarang** (dihapus; dicek test).

### 10.2 Data per halaman (`hooks/useSupabaseData.tsx`)

- Muat awal: absensi santri/musammi' & `recitation_entries` sejak `awalJendelaOperasional()` (14 hari) + `rpc_setoran_terakhir(org)` (setoran diterima terakhir per santri per jenis, SECURITY INVOKER).
- Riwayat penuh: `useRiwayat({ aktif?, tunda? })` di halaman laporan/riwayat; `pastikanTanggal(tgl)` di layar yang memilih tanggal (memuat riwayat bila tanggal < jendela). Status: `riwayatTermuat`, `memuatRiwayat` (`IndikatorRiwayat` di layout). Halaman baru yang membaca `attendance`/`setoranHarian` di luar 14 hari **wajib** memanggil salah satunya.
- Tabel besar diambil per 1.000 baris (`ambilBertahap`) — jangan pakai `.limit(50000)`; Supabase memotong diam-diam.
- Setelah mutasi absensi/setoran panggil `segarkanAbsensiSetoran()`, bukan `fetchData()` (BUG-18).
- `resolveTenantContext` di-cache 60 detik per klien+pengguna+peran (`bersihkanCacheKonteks()` saat auth berubah/ubah lembaga). Tidak ada `supabase.channel` (realtime) — banner pengumuman cek ulang tiap 5 menit.

### 10.3 Tampilan HP

- Layar operasional: teks `text-sm sm:text-xs` (≥ 14 px di HP), tombol status absensi `min-h-[44px]` grid 3 kolom.
- Tabel yang harus terbaca di HP: tambah kelas `tabel-kartu` pada `<table>` dan `data-label="…"` pada `<td>` (CSS di `index.css`, < 640 px jadi kartu). Contoh: Ujian Bulanan/Semester, Rekap Nilai. Buku Absensi: kartu ringkasan `sm:hidden`, matriks `hidden sm:block print:block`.

### 10.4 PWA & login

- `vite-plugin-pwa` (`vite.config.ts`): `registerType: 'prompt'`, precache hanya kerangka (index.html, `assets/index-*`, font, ikon); potongan lain `CacheFirst` saat dipakai. **Supabase & `/api` tidak di-cache.** Ikon di `public/icons/`.
- `components/PwaKontrol.tsx` (di `App.tsx`): banner versi baru, kartu "Pasang aplikasi" (`usePasangAplikasi()`; iPhone: petunjuk), pita offline.
- Login: "Lupa sandi?" → `resetPasswordForEmail(redirectTo: /reset-password)`; `pages/ResetSandiPage.tsx` → `auth.updateUser` (aturan `lib/sandi.ts`: ≥ 8, bukan `Mahad123!`, konfirmasi sama). Google: `signInWithOAuth({ provider: 'google' })`. `handle_new_user` (migrasi `2026_12_02_02`) hanya membuat lembaga untuk pendaftaran email dengan `mahad_name`.

### 10.5 Migrasi Fase 7 (urutan)

`2026_12_02_01_f7_kinerja` → `_02_f7_login_google`. Panduan & pengaturan Supabase/Google: `docs/FASE_7_UJI.md`.

---

## 11. Test otomatis

- `npm run test` = `npm run test:v2` + suite lama (`scripts/verify-fase*.ts`).
- `tests/v2/` memakai PGlite (PostgreSQL di memori). `tests/v2/helpers/db.ts` membangun database dari skema repo + **semua** migrasi; `seed.sql` (data uji: 1 lembaga, superadmin, admin, musammi', halaqah, 2 santri), `seed_legacy.sql` (contoh data tabel lama).
- Helper: `as(db, userId, fn)` menjalankan kueri sebagai pengguna tertentu (RLS aktif); `expectError()`.
- Test penting yang menjaga aturan di atas: `f2-kode-dan-peran.test.ts` (tidak ada query tabel lama / kunci app_settings lama), `migrasi-umum.test.ts` (aturan migrasi + aman diulang), `f3-database.test.ts` (aturan 6.1), `f3-lib.test.ts` (predikat layar = database, arah hafalan, dan larangan kunci sesi/validasi di kode), `f4-database.test.ts` (aturan 7.2), `f4-lib.test.ts` (adaptor Rekap Periode dan larangan tabel evaluasi lama di kode), `f5-database.test.ts` (aturan 8.2), `f5-lib.test.ts` (rumus layar = server dan larangan tabel/pengaturan ujian lama di kode), `f6-database.test.ts` (aturan 9.2), `f6-server.test.ts` (webhook & pemroses antrian), `f6-lib.test.ts` (laporan mudir & layar), `f7-database.test.ts` (setoran terakhir, handle_new_user), `f7-lib.test.ts` (tanpa CDN/xlsx, lazy, data per halaman, PWA, lupa sandi).
- Bila mengubah perilaku yang diuji, perbarui test-nya dan jelaskan alasannya. Jangan menghapus test agar lulus.

---

## 12. Yang masih dikerjakan fase berikutnya (jangan dianggap selesai)

- Halaman analitik lama (Pivot, Statistik, Detail Santri, Raport) masih memakai bentuk lama lewat `lib/rekapAdapter.ts`; bila ditulis ulang, bacalah `periodRecaps` langsung.
- **F8:** bisnis, kerapian & uji coba lembaga. Lihat `docs/RENCANA_V2.md`.
- Dasbor masih menghitung di browser; untuk lembaga besar pertimbangkan RPC ringkasan.
- Pengaturan lama "Automasi Perhitungan Nilai" (`SETORAN_AUTO_*` di `app_settings`) tidak dipakai untuk setoran baru; masih dibaca beberapa laporan lama untuk rata-rata nilai. Jangan dipakai di fitur baru.

## 13. Cara meminta pekerjaan ke AI (contoh)

```text
Baca docs/CATATAN_UNTUK_AI.md dan docs/SPESIFIKASI_V2.md bagian 4.
Kerjakan F8 butir 1. Perubahan database lewat file migrasi baru.
Tambahkan test di tests/v2/. Jalankan npm run test sampai lulus.
```
