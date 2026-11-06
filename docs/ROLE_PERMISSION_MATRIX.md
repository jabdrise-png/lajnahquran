# Matriks Hak Akses & Peran (RBAC) — Lajnah Quran SaaS

Dokumen ini memetakan seluruh hak akses navigasi, kemampuan fungsional, dan izin pemanggilan fungsi RPC untuk 3 peran kanonikal pada platform Lajnah Quran.

---

## 1. Tiga Peran Kanonikal (Canonical Roles)

Sistem Lajnah Quran secara ketat memberlakukan tiga peran login:
1. **`superadmin`** (Superadmin Platform): Mengelola platform SaaS secara menyeluruh, kesehatan teknis tenant, provisioning lembaga baru, paket kuota, dan memberikan bantuan teknis via Support Session berbatas waktu.
2. **`admin`** (Admin Lembaga): Penanggung jawab utama satu tenant organisasi. Mengelola struktur kurikulum, data santri, staf musammi, review setoran, ujian semester, hingga penerbitan raport resmi.
3. **`musammi`** (Pengampu Halaqah / Ustadz): Pelaksana harian bimbingan tahfidz. Membuka sesi halaqah yang ditugaskan, mengisi kehadiran santri, dan menginput setoran ziyadah/sabqi/manzil.

### Non-Login Administrative Attributes
- **Wali Kelas**: Penanggung jawab administratif kelas santri (informasi kontak untuk pelaporan). Bukan peran akun login.
- **Musyrif**: Pembina asrama/asuhan santri (informasi kontak untuk tembusan presensi/setoran). Bukan peran akun login.

---

## 2. Matriks Rute & Navigasi Antarmuka (UI Routes)

| Path Rute | Halaman / Komponen | superadmin | admin | musammi | Catatan Otorisasi |
|---|---|:---:|:---:|:---:|---|
| `/platform/dashboard` | Dashboard Platform | ✅ | ❌ | ❌ | Ringkasan platform global & KPI tenant |
| `/platform/tenants` | Organisasi & Provisioning | ✅ | ❌ | ❌ | Manajemen lembaga & pembuatan tenant baru |
| `/platform/accounts` | Akun & Grants Global | ✅ | ❌ | ❌ | Audit grant akses seluruh pengguna |
| `/platform/plans` | Paket & Entitlements | ✅ | ❌ | ❌ | Konfigurasi kuota santri & musammi per plan |
| `/platform/support-sessions`| Support Access Sessions | ✅ | ❌ | ❌ | Inisiasi sesi bantuan tenant berbatas waktu |
| `/platform/audit` | Audit Platform & Health | ✅ | ❌ | ❌ | Pemantauan log aktivitas & kesehatan API |
| `/platform/settings` | Pengaturan Platform Global | ✅ | ❌ | ❌ | Konfigurasi sistem pusat |
| `/app/dashboard` | Beranda Lembaga | ⚠️ *(Break-Glass)* | ✅ | ✅ | Statistik & ringkasan operasional harian |
| `/app/sessions` | Workspace Sesi Halaqah | ⚠️ *(Break-Glass)* | ✅ | ✅ | Pembukaan sesi, absensi, & setoran santri |
| `/app/recitations` | Setoran & Murajaah | ⚠️ *(Break-Glass)* | ✅ | ✅ | Riwayat setoran & status persetujuan |
| `/app/attendance` | Input Absensi Cepat | ⚠️ *(Break-Glass)* | ✅ | ✅ | Presensi santri per sesi |
| `/app/attendance-book` | Buku & Rekap Absensi | ⚠️ *(Break-Glass)* | ✅ | ✅ | Rekap kehadiran bulanan & cetak fisik |
| `/app/evaluations` | Input Evaluasi Berkala | ⚠️ *(Break-Glass)* | ✅ | ✅ | Evaluasi adab & capaian santri |
| `/app/evaluations-master`| Progres & Analitik Santri | ⚠️ *(Break-Glass)* | ✅ | ✅ | Grafik linimasa hafalan santri |
| `/app/targets` | Target & Periode Hafalan | ⚠️ *(Break-Glass)* | ✅ | ❌ | Konfigurasi target juz per tahun/semester |
| `/app/exams-monthly` | Ujian Bulanan | ⚠️ *(Break-Glass)* | ✅ | ❌ | Pelaksanaan & skor ujian hafalan bulanan |
| `/app/exams-semester` | Ujian Semester & Remedial | ⚠️ *(Break-Glass)* | ✅ | ❌ | Penilaian ujian semester per juz & remedial |
| `/app/report-cards` | Buku Nilai & Raport | ⚠️ *(Break-Glass)* | ✅ | ❌ | Rekap komprehensif & penerbitan raport |
| `/app/settings/rubrics` | Rubrik & Skema Nilai | ⚠️ *(Break-Glass)* | ✅ | ❌ | Skema bobot nilai & pengurang kesalahan |
| `/app/reports` | Laporan & Analitik Lembaga | ⚠️ *(Break-Glass)* | ✅ | ✅ | Laporan agregat & ekspor data Excel |
| `/app/academic-years` | Tahun Ajaran & Struktur Rombel| ⚠️ *(Break-Glass)* | ✅ | ❌ | Kelola tahun ajaran, semester, marhalah |
| `/app/students` | Data Santri & Enrollment | ⚠️ *(Break-Glass)* | ✅ | ❌ | Identitas santri & penempatan kelas aktif |
| `/app/Enrollment-promotion`| Mutasi & Kenaikan Kelas | ⚠️ *(Break-Glass)* | ✅ | ❌ | Promosi kelas santri antar periode ajaran |
| `/app/musammi` | Data Musammi & Undangan | ⚠️ *(Break-Glass)* | ✅ | ❌ | Profil ustadz & pengiriman undangan akun |
| `/app/halaqah` | Kelompok Halaqah & Member | ⚠️ *(Break-Glass)* | ✅ | ❌ | Pembagian kelompok & penugasan musammi |
| `/app/structure/homeroom` | Penanggung Jawab Wali Kelas | ⚠️ *(Break-Glass)* | ✅ | ❌ | Atribut kontak wali kelas per rombel |
| `/app/structure/musyrif` | Penanggung Jawab Musyrif | ⚠️ *(Break-Glass)* | ✅ | ❌ | Atribut kontak pembina asrama santri |
| `/app/users` | Manajemen Akses Lembaga | ⚠️ *(Break-Glass)* | ✅ | ❌ | Status aktivasi & revoke grant tenant |
| `/app/settings` | Pengaturan & Integrasi | ⚠️ *(Break-Glass)* | ✅ | ❌ | Metadata ma'had, bot Telegram, WhatsApp |
| `/app/settings/audit` | Audit Log & Snapshot Raport | ⚠️ *(Break-Glass)* | ✅ | ❌ | Arsip snapshot raport & audit transaksi |

*(Break-Glass)*: Superadmin hanya dapat melihat rute `/app/*` jika memiliki Support Access Session aktif di database dengan alasan terdokumentasi.

---

## 3. Matriks Hak Eksekusi Database RPC (Security Definer)

| Nama Fungsi RPC | Deskripsi Fungsi | superadmin | admin | musammi | Batasan Keamanan |
|---|---|:---:|:---:|:---:|---|
| `rpc_create_tenant_with_admin` | Provisioning tenant & organisasi baru | ✅ | ❌ | ❌ | Hanya Superadmin; status default `provisioning` |
| `rpc_accept_invitation` | Aktivasi token undangan akun pengguna | ✅ | ✅ | ✅ | Wajib token hash sah; single-use |
| `rpc_revoke_invitation` | Membatalkan undangan belum aktif | ✅ | ✅ | ❌ | Admin hanya di tenantnya; Superadmin global |
| `rpc_upsert_academic_year` | Buat/update tahun ajaran & semester | ❌ | ✅ | ❌ | Validasi tgl konsisten; max 1 tahun aktif |
| `rpc_set_active_academic_year`| Aktifkan tahun ajaran berjalan | ❌ | ✅ | ❌ | Otomatis nonaktifkan tahun lain di tenant |
| `rpc_close_academic_year` | Menutup tahun ajaran secara resmi | ❌ | ✅ | ❌ | Verifikasi 6 prasyarat integritas akademik |
| `rpc_promote_or_graduate_students` | Promosi santri & mutasi rombel | ❌ | ✅ | ❌ | Menjaga histori tahun lama tanpa menimpa |
| `rpc_assign_halaqah_musammi` | Tugaskan musammi utama / pengganti | ❌ | ✅ | ❌ | Sinkronisasi `is_primary` & rentang tanggal |
| `rpc_open_halaqah_session` | Membuka sesi halaqah aktif | ❌ | ✅ | ✅ | Musammi wajib memiliki assignment aktif |
| `rpc_save_attendance_batch` | Simpan presensi seluruh santri sesi | ❌ | ✅ | ✅ | Menolak santri di luar roster snapshot |
| `rpc_submit_recitation_entry` | Catat transaksi setoran Al-Qur'an | ❌ | ✅ | ✅ | Validasi juz 1..30 & surah 1..114 |
| `rpc_review_recitation_entry` | Terima (accept) / kembalikan (return) | ❌ | ✅ | ❌ | Catat revisi snapshot; alasan min 5 karakter |
| `rpc_lock_halaqah_session` | Kunci sesi permanen | ❌ | ✅ | ✅ | Wajib seluruh santri memiliki presensi |
| `rpc_correct_locked_session_attendance` | Koreksi presensi pada sesi terkunci | ❌ | ✅ | ❌ | Wajib alasan tertulis & tercatat audit log |
| `rpc_record_exam_attempt` | Input hasil ujian bulanan/semester | ❌ | ✅ | ❌ | Remedial menambah attempt_no atomik |
| `rpc_publish_report_card` | Publikasi snapshot resmi raport | ❌ | ✅ | ❌ | Diproteksi advisory lock & trigger immutability |
| `rpc_amend_published_report_card` | Revisi raport resmi yang sudah terbit | ❌ | ✅ | ❌ | Menghasilkan version_no baru; status `amended` |
| `rpc_verify_report_card` | Verifikasi keaslian dokumen via token | Publik (Anonim) | Publik | Publik | PII Masked: sensor nama santri jika unauthenticated |
