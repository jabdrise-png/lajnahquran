# Catatan untuk Asisten AI (AI Studio, dll.) — Perubahan Fase 0 s.d. Fase 4

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
9. **Jangan menghidupkan lagi Kunci Sesi atau Validasi Setoran** (Fase 3). Setoran langsung sah; halaman & predikat dihitung server — jangan mengirim angka/predikat dari layar sebagai kebenaran.
10. **Capaian per periode hanya dari Rekap Periode** (`period_recaps`, Fase 4). Jangan membaca/menulis `student_progress`, `student_evaluation`, `halaqah_evaluations`, `halaqah_evaluation_questions`, `evaluation_settings`, atau JSON `EVALUATION_PERIODS`. Menulis rekap hanya lewat `rpc_simpan_form_periode`.

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

Detail kolom: `docs/FASE_2_INVENTARIS.md`. Tabel `santri`, `halaqah`, `musammi`, `master_marhalah`, `master_kelas_relasi`, `academic_years` tetap dipakai. `ujian_bulanan`, `ujian_semester`, `student_progress`, `student_evaluation` masih dipakai sampai F4/F5.

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

Helper layar: `lib/sesiHalaqah.ts` (`hariIni`, `halaqahSaya`, `opsiWaktu` (BUG-11), `halaqahPadaWaktu`, `rosterPadaTanggal`, `statusHadir`, `hitungPerubahan`), `lib/notifSetoran.ts` (pesan Telegram wali, placeholder `{ulang}`).

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
| `silabus_scores` | nilai Silabus Hafalan raport per santri per semester (dulu `student_progress` `SEM-*`) |

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
| Periode & isian (Admin, RLS) | tabel langsung: `simpanPeriode`, `simpanIsianForm`, `hapusIsianForm`, `simpanNilaiSilabus` |

### 7.4 Frontend

- Hook memuat `evaluationPeriods`, `periodeEvaluasi` (bentuk lama `MasterEvaluationPeriod`, id = UUID), `periodFormFields`, `periodRecaps` (diambil bertahap per 1000 baris), `periodForms`, `silabusScores`.
- `lib/rekapAdapter.ts` menurunkan bentuk lama untuk halaman analitik: `studentProgress` (Ziyadah = halaman, Murojaah & Total Hafalan = juz, Hafalan Depan/Belakang, Kelancaran, Kehadiran, isian bebas per label), `studentEvaluations`, `evaluationSettings` (dari isian pilihan), `halaqahEvalQuestions`, `halaqahEvaluations`. `month_key` = id periode. Fungsi lama `getEvaluationPeriods()` dihapus; `formatPeriodName(id, periodeEvaluasi)`.
- Layar: `pages/Evaluasi/FormEvaluasiPeriodePage.tsx` (`/app/evaluations`), `pages/Evaluasi/ProgresEvaluasiPage.tsx` (`/app/evaluations-master`: Pemantauan, Rekap Santri + ekspor, Pivot, Statistik), panel `components/evaluasi/PeriodeEvaluasiPanel.tsx`, `ModePencatatanPanel.tsx`, `IsianFormPanel.tsx` di `pages/PengaturanEvaluasiPage.tsx`.
- Dihapus: `PerkembanganInputPage`, `PerkembanganMasterDataPage`, `lib/syncEngine.ts` (Tarik Data/sinkronisasi), halaman tak terpakai `Chat.tsx`, `WaliSantriReport.tsx`, `WaliKelasReport.tsx`, tipe `AutoSync*`.

### 7.5 Migrasi Fase 4 (urutan)

`2026_11_29_01_f4_periode_dan_rekap` → `_02_f4_hitung_rekap` → `_03_f4_migrasi_evaluasi_lama` (`f4_migrate_legacy_evaluations()`, `f4_legacy_reconciliation()`, bisa diulang). Pemeriksaan awal: `database/checks/f4_preflight.sql`. Panduan: `docs/FASE_4_UJI.md`.

---

## 8. Test otomatis

- `npm run test` = `npm run test:v2` + suite lama (`scripts/verify-fase*.ts`).
- `tests/v2/` memakai PGlite (PostgreSQL di memori). `tests/v2/helpers/db.ts` membangun database dari skema repo + **semua** migrasi; `seed.sql` (data uji: 1 lembaga, superadmin, admin, musammi', halaqah, 2 santri), `seed_legacy.sql` (contoh data tabel lama).
- Helper: `as(db, userId, fn)` menjalankan kueri sebagai pengguna tertentu (RLS aktif); `expectError()`.
- Test penting yang menjaga aturan di atas: `f2-kode-dan-peran.test.ts` (tidak ada query tabel lama / kunci app_settings lama), `migrasi-umum.test.ts` (aturan migrasi + aman diulang), `f3-database.test.ts` (aturan 6.1), `f3-lib.test.ts` (predikat layar = database, arah hafalan, dan larangan kunci sesi/validasi di kode), `f4-database.test.ts` (aturan 7.2), `f4-lib.test.ts` (adaptor Rekap Periode dan larangan tabel evaluasi lama di kode).
- Bila mengubah perilaku yang diuji, perbarui test-nya dan jelaskan alasannya. Jangan menghapus test agar lulus.

---

## 9. Yang masih dikerjakan fase berikutnya (jangan dianggap selesai)

- Halaman analitik lama (Pivot, Statistik, Detail Santri, Raport) masih memakai bentuk lama lewat `lib/rekapAdapter.ts`; bila ditulis ulang, bacalah `periodRecaps` langsung.
- **F5–F8:** ujian & raport, Telegram, PWA, bisnis. Lihat `docs/RENCANA_V2.md`.
- Pengaturan lama "Automasi Perhitungan Nilai" (`SETORAN_AUTO_*` di `app_settings`) tidak dipakai untuk setoran baru; masih dibaca beberapa laporan lama untuk rata-rata nilai. Jangan dipakai di fitur baru.

## 10. Cara meminta pekerjaan ke AI (contoh)

```text
Baca docs/CATATAN_UNTUK_AI.md dan docs/SPESIFIKASI_V2.md bagian 4.
Kerjakan F5 butir 1 (raport 3 komponen). Perubahan database lewat file migrasi baru.
Tambahkan test di tests/v2/. Jalankan npm run test sampai lulus.
```
