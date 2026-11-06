# Transformasi Arsitektur Lajnah Quran SaaS Multi-Tenant (3-Role & Serverless-Ready)

Rencana induk perombakan aplikasi **Lajnah Quran** menjadi platform manajemen akademik Tahfidz berstandar **Enterprise SaaS Multi-Tenant** dengan **tiga role kanonikal (`superadmin`, `admin`, `musammi`)**, arsitektur **100% Serverless-Ready untuk Vercel & Netlify**, evolusi terstruktur dari halaman-halaman eksisting ke standar internasional (**ISO/IEC 25010, ISO 27001/27017/27018, OWASP ASVS 5.0, WCAG 2.2 AA, AWS SaaS Lens**), serta disiplin visual minimalis.

---

## User Review & Keputusan Kritis yang Dikonfirmasi (Hasil Revisi)

> [!IMPORTANT]
> Berdasarkan tinjauan dan catatan Anda pada draf sebelumnya, berikut adalah penyempurnaan arsitektur yang telah diperbarui di dalam rencana ini:

- **Revisi 1 — Arsitektur Serverless-Ready (Kompatibel Penuh dengan Vercel, Netlify & Supabase)**:
  - **Mengapa `server.ts` murni tidak cukup untuk Vercel/Netlify?** File `server.ts` yang menjalankan `app.listen(3000)` dengan middleware Vite adalah server Node.js *long-running* (cocok untuk preview lokal/VPS), namun **Vercel** dan **Netlify** bekerja secara *serverless* (menjalankan frontend sebagai *Static SPA CDN* + fungsi *stateless* per request).
  - **Solusi Arsitektur Hibrida Serverless**:
    1. **Supabase RPC (`SECURITY DEFINER`) sebagai Mesin Transaksi Utama**: Seluruh operasi bisnis inti (pembukaan sesi, batch absensi, transaksi & revisi setoran, *support access session*, penerbitan raport *snapshot*, rekonsiliasi tahun ajaran, dan pencatatan `audit_logs`) dieksekusi langsung di dalam PostgreSQL melalui fungsi RPC terproteksi—sehingga berjalan instan di Vercel/Netlify tanpa bergantung pada server Node.js.
    2. **Modular API Handler (`api/` Serverless Functions + Supabase Edge Functions)**: Untuk operasi yang wajib memegang *secret key* pihak ketiga (undangan akun via Supabase Auth Admin API & pengiriman webhook/pesan Telegram/Fonnte), logika server dipisahkan ke modul handler murni yang diekspor ganda ke `/api/*` (otomatis menjadi **Vercel Serverless Functions** & **Netlify Functions** lengkap dengan `vercel.json` dan `netlify.toml`) sekaligus tetap di-mount oleh `server.ts` untuk preview lokal.
- **Revisi 2 — Evolusi Halaman Eksisting ke Standar Enterprise SaaS**:
  - Struktur halaman dirancang dengan **memodernisasi dan menyatukan halaman-halaman yang sudah ada** (`Dashboard`, `TahunAjaranPage`, `SantriPage`, `MusammiPage`, `HalaqahPage`, `Attendance`, `BukuAbsensiPage`, `SetoranHarianPage`, `PerkembanganInputPage`, `PengaturanEvaluasiPage`, `UjianBulananPage`, `UjianSemesterPage`, `RaportPage`, `RingkasanGlobalPage`, `TrenHistorisPage`, `StatistikPerkembangan`, `InformasiPage`, `Users`, `SettingsPage`) ke dalam struktur rute standar `/platform/*` dan `/app/*` (dengan *auto-redirect* dari URL lama agar tidak ada tautan yang rusak).
- **Revisi 3 — Disiplin Penggunaan Ikon (Minimalis, Kontekstual & Tanpa Ikon Paksaan)**:
  - Ikon hanya digunakan apabila benar-benar presisi, proporsional, dan memiliki fungsi navigasi/interaksi yang jelas (seperti navigasi utama *Sidebar*, input pencarian, indikator urut kolom, dan tombol aksi utama).
  - **Dilarang menggunakan ikon dekoratif atau memaksakan ikon** pada *status badge*, judul seksi, sel tabel, atau label teks jika tipografi bersih dan warna semantik sudah menyampaikan informasi dengan jelas.

---

## 1. Gambaran Umum & Konsep Inti

- **Apa yang Dilakukan Sistem**: Menyediakan platform SaaS manajemen pendidikan Tahfidz Al-Qur'an lintas lembaga (*multi-tenant*) yang memisahkan secara tegas tata kelola platform global (**Superadmin**), pengelolaan akademik & operasional lembaga (**Admin Lembaga**), serta pelaksanaan harian halaqah, absensi, dan setoran hafalan (**Musammi**).
- **Tiga Role Kanonikal & Batas Kewenangan**:
  1. **`superadmin` (Lingkup Platform Global — `/platform/*`)**: Mengelola siklus hidup organisasi/tenant, paket layanan, kesehatan sistem, log audit platform, akun Superadmin/undangan Admin pertama, serta *Support Access Session* (*break-glass* berbatas waktu, wajib alasan, dan *read-only* secara default). Tidak mengintervensi nilai, absensi, atau raport harian tenant secara langsung.
  2. **`admin` (Lingkup Satu Organisasi/Tenant — `/app/*`)**: Mengonfigurasi profil lembaga, tahun ajaran & semester, struktur marhalah & kelas (termasuk atribut administratif Wali Kelas/Musyrif), *enrollment* santri tahunan, staf & undangan Musammi, kelompok & jadwal halaqah, target hafalan & versi rubrik penilaian, validasi setoran, pelaksanaan ujian/remedial, penerbitan raport *snapshot*, serta pengumuman & laporan lembaga.
  3. **`musammi` (Lingkup Halaqah yang Ditugaskan — `/app/*`)**: Hanya mengakses halaqah dan santri binaan yang memiliki penugasan (*assignment*) aktif pada tahun ajaran berjalan. Membuka dan menyelesaikan sesi halaqah, mengisi absensi sesi, mencatat transaksi setoran (*ziyadah/sabaq*, *sabqi*, *manzil*) terstruktur berdasarkan surat & ayat, serta memantau progres santri binaannya.

---

## 2. Pengalaman Pengguna (UX), Evolusi Halaman & Sistem Desain

### A. Pemetaan & Standarisasi Halaman Eksisting ke Rute Enterprise SaaS

Navigasi menggunakan **React Router 7 Nested Layouts** (`PublicLayout`, `PlatformLayout`, `TenantLayout`) yang digerakkan oleh satu konfigurasi izin terpusat (*Single Route Permission Config*), mendukung *URL Search Params* untuk filter/pencarian/tab, dan memetakan halaman lama secara mulus ke standar baru:

| Kelompok Modul | Halaman Saat Ini (Eksisting) | Rute Standar Enterprise SaaS Baru | Peningkatan Standar Internasional yang Diterapkan |
| :--- | :--- | :--- | :--- |
| **Platform Console (`superadmin`)** | `AdminDashboard.tsx`, `WebsiteEditorPage.tsx`, `AdminGalleryPage.tsx` | `/platform/dashboard`, `/platform/tenants`, `/platform/tenants/:id`, `/platform/support-sessions`, `/platform/audit`, `/platform/settings` | Pemisahan penuh shell Superadmin dari shell lembaga; *provisioning* tenant baru; *Support Access Session* berbatas waktu dengan banner peringatan & log audit. |
| **Beranda & Informasi** | `Dashboard.tsx`, `InformasiPage.tsx` | `/app/dashboard`, `/app/announcements`, `/app/profile` | Beranda kontekstual per role (Admin melihat KPI lembaga & sesi belum lengkap; Musammi melihat jadwal halaqah hari ini & tombol lanjutkan sesi). |
| **Persiapan & Struktur Akademik** | `TahunAjaranPage.tsx` + tab Kelas/Marhalah | `/app/academic-years`, `/app/structure/marhalah`, `/app/structure/classes` | Siklus status tahun ajaran (`draft -> setup -> active -> closing -> closed`), relasi berbasis ID/UUID, dan penyimpanan nama Wali Kelas/Musyrif sebagai atribut administratif kelas. |
| **Master Santri & Enrollment** | `SantriPage.tsx`, `KenaikanKelasPage.tsx`, `SantriDetailProgressView.tsx` | `/app/students`, `/app/students/:id` | Pemisahan identitas induk santri dari penempatan kelas tahunan (`student_enrollments`); santri tanpa enrollment aktif muncul di peringatan setup, bukan otomatis masuk semua sesi. |
| **Master Musammi & Halaqah** | `MusammiPage.tsx`, `HalaqahPage.tsx` | `/app/musammi`, `/app/halaqah`, `/app/halaqah/:id`, `/app/schedule` | Undangan akun Musammi secara *serverless* (tanpa `signUp` browser + *delay*), riwayat keanggotaan halaqah (`valid_from`/`valid_to`), dan deteksi bentrok jadwal. |
| **Sesi, Absensi & Buku Absensi** | `Attendance.tsx`, `BukuAbsensiPage.tsx`, `AttendanceBook.tsx` | `/app/sessions`, `/app/sessions/:id/attendance`, `/app/attendance` (Admin) & `/app/my-halaqah`, `/app/my-schedule` (Musammi) | Pembekuan *roster snapshot* saat sesi dibuka; status awal peserta wajib *"Belum diisi"* (bukan otomatis Hadir); penyimpanan batch idempoten; koreksi pasca-kunci wajib alasan. |
| **Setoran & Evaluasi Berkala** | `SetoranHarianPage.tsx`, `PerkembanganInputPage.tsx`, `PerkembanganMasterDataPage.tsx`, `PengaturanEvaluasiPage.tsx` | `/app/sessions/:id/recitations`, `/app/recitations`, `/app/targets`, `/app/evaluations`, `/app/settings/rubrics` | Transaksi setoran terstruktur (`ziyadah`, `sabqi`, `manzil`) dengan validasi surat/ayat Al-Qur'an, kalkulasi halaman otomatis, siklus status (`draft -> submitted -> accepted/returned/voided`), dan target/rubrik berversi. |
| **Ujian, Buku Nilai & Raport** | `UjianBulananPage.tsx`, `UjianSemesterPage.tsx`, `RaportPage.tsx`, `RaportDocument.tsx` | `/app/exams`, `/app/exams/:id`, `/app/gradebook`, `/app/report-cards` | Pemisahan periode ujian, *attempt* nilai, dan remedial tanpa menimpa nilai lama; penerbitan raport membekukan `snapshot_json` (*immutable*) dengan alur *amendment* teraudit. |
| **Laporan Analitik & Sistem Lembaga** | `RingkasanGlobalPage.tsx`, `TrenHistorisPage.tsx`, `LaporanPerKelasPage.tsx`, `StatistikPerkembangan.tsx`, `Users.tsx`, `SettingsPage.tsx` | `/app/reports`, `/app/users`, `/app/settings/organization`, `/app/settings/methodology`, `/app/settings/integrations`, `/app/settings/audit` | Filter seragam tersimpan di URL, paginasi terukur, manajemen akses anggota lembaga, penyimpanan token rahasia Telegram/Fonnte di sisi server, serta penangguhan `WaliSantriReport.tsx`. |

### B. Identitas Visual, Tipografi & Disiplin Ikon Minimalis (WCAG 2.2 AA)

- **Aesthetic Direction**: *Clean Enterprise SaaS & Academic Precision* — tata letak presisi untuk layar desktop 1440px dan responsif di tablet/mobile (target sentuh minimum $\ge 40\text{px}$ desktop / $\ge 44\text{px}$ mobile), satu tingkat elevasi kartu (*single-elevation depth* dengan *hairline border* `1px solid #E2E8F0`), tanpa *nested cards* yang menumpuk.
- **Disiplin Ikon Ketat (Hanya Jika Tepat & Fungsional)**:
  - **Kapan Menggunakan Ikon**: Hanya pada navigasi level atas di *Sidebar*, indikator kontrol input (pencarian, pemilih tanggal, panah pengurutan kolom tabel, tombol tutup modal), dan tombol aksi primer yang memang terbantu oleh ikon standar yang sangat jelas.
  - **Kapan Tidak Menggunakan Ikon**: *Status badge* (`Aktif`, `Draft`, `Selesai`, `Diterima`), header kartu/seksi, tab filter, dan isi sel tabel ditampilkan menggunakan **tipografi bersih tanpa ikon tambahan**. Tidak ada ikon hiasan yang dipaksakan.
- **Palet Warna Semantik (60-30-10)**:
  - **60% Canvas Netral**: `#F8FAFC` (Slate 50) untuk latar ruang kerja dan `#FFFFFF` untuk permukaan tabel/kartu.
  - **30% Struktur & Teks**: `#0F172A` (Slate 900) untuk tipografi utama, `#475569` (Slate 600) untuk teks sekunder, dan `#E2E8F0` (Slate 200) untuk pembatas struktural.
  - **10% Aksen Fungsional & Status (Mengandalkan Teks Jelas + Kontras Warna WCAG AA)**:
    - Primary Action: `#2563EB` (Biru Akademik)
    - Nominal / Active / Accepted / Published: `#16A34A` (Hijau Emerald pada latar lembut `#F0FDF4` dengan teks `#15803D`)
    - Warning / Draft / Pending Review / Remedial: `#D97706` (Amber pada latar `#FFFBEB` dengan teks `#B45309`)
    - Danger / Alpa / Voided / Suspended: `#DC2626` (Crimson pada latar `#FEF2F2` dengan teks `#B91C1C`)
- **Tipografi & Disiplin Angka Tabular (2+1 Font Rule)**:
  - **Display & Navigasi**: `Plus Jakarta Sans` (SemiBold/Bold 600–700).
  - **Body & Tabel Operasional**: `Plus Jakarta Sans` / `DM Sans` (Regular/Medium 400–500, 13px–15px).
  - **Angka, Skor, Juz/Ayat & Timestamp**: Wajib menggunakan `font-variant-numeric: tabular-nums` dan `JetBrains Mono` pada kode santri, rentang ayat, nilai ujian, dan metrik persentase agar kolom angka sejajar vertikal.

---

## 3. Keputusan Produk Utama & Trade-Off Arsitektur

- **Keputusan 1: Arsitektur "Supabase RPC-First + Serverless API Adapter" untuk Vercel & Netlify**
  - *Pendekatan*:
    1. Menempatkan seluruh logika transaksi multi-tabel dan otorisasi di dalam **PostgreSQL RPC Functions (`SECURITY DEFINER`)** pada Supabase. Karena frontend berkomunikasi langsung ke Supabase melalui HTTPS menggunakan JWT user aktif, 95% fitur berjalan 100% *serverless* tanpa memerlukan proses Node.js yang terus hidup.
    2. Untuk 5% operasi yang membutuhkan *server-only secret* (seperti `SUPABASE_SERVICE_ROLE_KEY` untuk undangan email tanpa me-logout sesi Admin, atau pengiriman pesan Telegram/Fonnte menggunakan token terenkripsi), kita menyediakan **Serverless API Handler standar** di `/api/*` beserta konfigurasi `vercel.json` dan `netlify.toml` (serta *fallback* RPC aman), yang juga di-mount secara otomatis oleh `server.ts` saat dijalankan di lingkungan preview lokal.
  - *Mengapa*: Menjamin aplikasi dapat di-deploy langsung ke **Vercel** atau **Netlify** hanya dengan *git push* tanpa biaya server VPS tambahan dan tanpa error *timeout/cold-start* pada operasi akademik harian.
- **Keputusan 2: Pemisahan `user_profiles` dan `access_grants` (3 Role Kanonikal)**
  - *Pendekatan*: Memisahkan profil identitas global (`user_profiles`) dari izin akses (`access_grants` dengan `role IN ('superadmin', 'admin', 'musammi')` dan `status IN ('invited', 'active', 'suspended', 'revoked')`). Data lama pada `profiles` dimigrasikan otomatis: `super_admin` $\rightarrow$ `superadmin`, `admin`/`admin_mahad` $\rightarrow$ `admin`, `musammi` $\rightarrow$ `musammi` + `musammi_staff`, `pending` $\rightarrow$ status `invited`, sedangkan data `wali_kelas` & `musyrif` dipertahankan sebagai atribut teks administratif pada Kelas dan Santri.
  - *Mengapa*: Menghilangkan kerancuan antara status akun dan role otorisasi, serta menutup celah eskalasi hak akses dari sisi client.
- **Keputusan 3: Roster Snapshot Sesi, Transaksi Setoran Terstruktur & Raport Immutable**
  - *Pendekatan*:
    - Sesi halaqah membekukan daftar santri aktif saat dibuka dengan status awal `"Belum diisi"` (`unmarked`).
    - Setoran disimpan dengan nomor surat & ayat tervalidasi (`surah_start_no`, `ayah_start`, `surah_end_no`, `ayah_end`, `calculated_pages`) dan status siklus (`draft -> submitted -> accepted/returned/voided`) beserta histori revisi `recitation_revisions`.
    - Raport yang telah diterbitkan (`published`) disimpan sebagai `snapshot_json` permanen; revisi pasca-terbit wajib membuat versi *amendment* baru dengan alasan.
  - *Mengapa*: Menjamin integritas data historis dan auditabilitas penuh sesuai standar ISO/IEC 25010 dan AWS SaaS Lens.

---

## 4. Arsitektur Teknis, Strategi Data & Peta Jalan Fase Implementasi

### A. Diagram Arsitektur Serverless-Ready (Vercel / Netlify + Supabase)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                 STATIC SPA FRONTEND (Vite Build — Hosted on Vercel / Netlify)            │
│                                                                                          │
│  ┌──────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────────┐  │
│  │    PublicLayout      │   │      PlatformLayout       │   │      TenantLayout       │  │
│  │  /, /login, /invite  │   │  /platform/* (superadmin) │   │ /app/* (admin, musammi) │  │
│  └──────────┬───────────┘   └─────────────┬─────────────┘   └────────────┬────────────┘  │
│             │                             │                              │               │
│             ▼                             ▼                              ▼               │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │         Shared Design System & Permission Engine (Route Metadata + Guards)         │  │
│  │   PageShell · PageHeader · FilterBar (URL Sync) · DataTable · FormField · Modal    │  │
│  └──────────────────────────┬─────────────────────────────────────────┬───────────────┘  │
│                             │                                         │                  │
│        95% Operasi Akademik & Transaksi               5% Operasi Secret & Integrasi      │
│           (Direct HTTPS + User JWT)                      (Serverless Function Call)      │
└─────────────────────────────┼─────────────────────────────────────────┼──────────────────┘
                              │                                         │
                              ▼                                         ▼
┌───────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│     SUPABASE POSTGREST & RPC ENGINE       │   │  SERVERLESS API FUNCTIONS (/api/*)       │
│  (100% Serverless pada Cloud Supabase)    │   │  (Vercel Functions / Netlify / server.ts)│
│                                           │   │                                          │
│  • rpc_open_halaqah_session (Snapshot)    │   │  • POST /api/invitations (Auth Admin)    │
│  • rpc_save_attendance_batch (Idempotent) │   │  • POST /api/integrations/secrets        │
│  • rpc_submit_recitation_with_revision    │   │  • POST /api/notify/telegram & whatsapp  │
│  • rpc_publish_report_card_snapshot       │   │  • POST /api/telegram-webhook            │
│  • rpc_manage_support_session             │   │  (Dilengkapi vercel.json & netlify.toml) │
│  • rpc_close_academic_year_reconcile      │   └───────────────────────┬──────────────────┘
└─────────────────────┬─────────────────────┘                           │
                      │                                                 │
                      └────────────────────────┬────────────────────────┘
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│              POSTGRESQL MULTI-TENANT SCHEMA + ROW LEVEL SECURITY (RLS)                   │
│                                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  ┌────────────────────────┐  │
│  │ Identity & Governance    │  │ Academic Structure       │  │ Daily Operations       │  │
│  │ • organizations          │  │ • academic_years         │  │ • halaqah_sessions     │  │
│  │ • user_profiles          │  │ • semesters              │  │ • attendance_records   │  │
│  │ • access_grants (3 role) │  │ • marhalah / classes     │  │ • recitation_entries   │  │
│  │ • support_access_sessions│  │ • students               │  │ • recitation_revisions │  │
│  │ • audit_logs             │  │ • student_enrollments    │  ├────────────────────────┤  │
│  │ • integration_secrets    │  │ • musammi_staff          │  │ Quality & Assessment   │  │
│  └──────────────────────────┘  │ • halaqahs               │  │ • target_plans         │  │
│                                │ • halaqah_student_member.│  │ • rubric_versions      │  │
│  Composite Tenant FKs:         │ • halaqah_musammi_assign.│  │ • evaluations / exams  │  │
│  (organization_id, id)         └──────────────────────────┘  │ • report_cards         │  │
│                                                              └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### B. Pemodelan Data & Skema Migrasi Otomatis Multi-Tenant

Seluruh tabel *tenant-scoped* wajib memiliki `organization_id UUID NOT NULL` dan diikat menggunakan **Composite Foreign Key `(organization_id, parent_id)`** serta bermigrasi otomatis dari tabel lama tanpa kehilangan data:

1. **Identitas, Tenant & Governance**:
   - `organizations`: Ditambahkan kolom `slug` (UNIQUE), `status` (`trial`, `active`, `suspended`, `archived`), `timezone`, `locale`, `plan_id`, `setup_state` (JSONB checklist kesiapan operasional).
   - `user_profiles` & `access_grants`: Memisahkan identitas global user dari keanggotaan tenant (`role IN ('superadmin', 'admin', 'musammi')`, `status IN ('invited', 'active', 'suspended', 'revoked')`). Constraint menjamin `organization_id IS NULL` hanya untuk `superadmin` dan `NOT NULL` untuk `admin`/`musammi`.
   - `support_access_sessions` & `audit_logs`: Mencatat sesi bantuan lintas tenant Superadmin (wajib alasan & waktu kedaluwarsa) serta jejak audit perubahan data sensitif.
   - `integration_secrets`: Menyimpan konfigurasi dan token Telegram/WhatsApp per tenant yang hanya dapat dibaca oleh fungsi server/RPC terotorisasi, bukan diekspos sebagai teks biasa di `app_settings` client.
2. **Struktur Akademik, Enrollment & Penugasan**:
   - `academic_years` & `semesters`: Siklus status `draft`, `setup`, `active`, `closing`, `closed`.
   - `marhalah` & `classes`: Tabel `classes` menyimpan atribut administratif `wali_kelas_name` dan `musyrif_name` (dimigrasikan otomatis dari tabel `wali_kelas` dan `musyrif` lama).
   - `students` & `student_enrollments`: Memisahkan biodata induk santri dari penempatan kelas per tahun ajaran (dimigrasikan otomatis dari `santri` dan `student_classes`).
   - `musammi_staff`, `halaqahs`, `halaqah_student_memberships`, `halaqah_musammi_assignments`: Menggantikan PK komposit `(halaqah_id, santri_id)` dengan ID keanggotaan tersendiri dan periode `valid_from`/`valid_to`.
3. **Operasional Sesi, Absensi, Setoran, Ujian & Raport**:
   - `halaqah_sessions` & `attendance_records`: Sesi aktual dengan *snapshot* peserta berstatus awal `unmarked` (`Belum diisi`) dan `idempotency_key` untuk mencegah duplikasi saat sinyal tidak stabil.
   - `recitation_entries` & `recitation_revisions`: Normalisasi `setoran_harian` dengan `academic_year_id`, `session_id`, `kind` (`ziyadah`, `sabqi`, `manzil`), referensi surat/ayat Al-Qur'an, `status` validasi, dan tabel riwayat revisi *append-only*.
   - `target_plans`, `rubric_versions`, `evaluations`, `exams`, `exam_attempts`, `report_cards`: Menyimpan versi target/rubrik, riwayat *attempt* ujian/remedial, serta *snapshot* raport final yang *immutable*.

### C. Pemetaan Interaksi Komponen & State (End-to-End Working Handlers)

| Alur / Komponen Utama | Interaksi Pengguna | Mutasi State, Validasi & Operasi RPC / Serverless |
| :--- | :--- | :--- |
| **Platform Tenant & Support Access (`/platform/*`)** | Superadmin membuat tenant baru, mengundang Admin, atau membuka sesi bantuan (*Support Access*) dengan mengisi alasan & durasi. | Memanggil `rpc_create_tenant_with_admin` / `rpc_start_support_session`. Mengaktifkan `TenantContextBar` dengan hitung mundur kedaluwarsa dan mencatat setiap aksi ke `audit_logs`. |
| **Manajemen Tahun Ajaran & Enrollment (`/app/academic-years`, `/app/students`)** | Admin mengubah status tahun ajaran (`draft -> setup -> active -> closing -> closed`) dan menempatkan santri ke kelas/halaqah. | Memvalidasi prasyarat kesiapan akademik. Saat `closed`, seluruh mutasi dikunci. Santri tanpa *enrollment* pada tahun aktif tidak masuk ke *roster* sesi melainkan ditampilkan pada *setup alert*. |
| **Undangan & Penugasan Musammi (`/app/musammi`, `/app/users`)** | Admin membuat profil staf Musammi, mengirim undangan akun, dan menugaskan ke Halaqah. | Memanggil endpoint serverless `/api/invitations` (atau RPC undangan terverifikasi) tanpa `signUp` anonim + delay di browser. Membuat `access_grants` (`role: 'musammi'`) dan menautkan `musammi_staff` ke `halaqah_musammi_assignments`. |
| **Siklus Sesi, Absensi & Setoran (`/app/sessions/:id/*`)** | Musammi membuka sesi halaqah, mengisi absensi santri, menginput setoran surat/ayat, dan mengunci sesi. | `rpc_open_halaqah_session` membekukan *roster* santri aktif dengan status awal `unmarked`. Input setoran memvalidasi urutan nomor surat & ayat Al-Qur'an (1–114) dan menghitung jumlah halaman otomatis. Penyimpanan absensi memakai `rpc_save_attendance_batch` dengan `idempotency_key`. |
| **Review Setoran & Koreksi Admin (`/app/attendance`, `/app/recitations`)** | Admin meninjau setoran (`accept`/`return`/`void`) atau mengoreksi absensi sesi yang sudah ditutup. | Membuka `ConfirmDialog` dengan input `reason` wajib. Memanggil `rpc_review_recitation_entry` yang memperbarui status dan menyisipkan baris *append-only* ke `recitation_revisions` dan `audit_logs`. |
| **Ujian, Remedial & Penerbitan Raport (`/app/exams`, `/app/report-cards`)** | Admin menjadwalkan ujian, penguji menginput nilai per *attempt*/remedial, Admin menerbitkan raport semester. | Menyimpan setiap percobaan ujian sebagai `exam_attempts` terpisah. Saat klik *Publish Raport*, `rpc_publish_report_card` membekukan hasil ke `report_cards.snapshot_json` (`status: 'published'`), dan membuka alur *Amendment* jika diperlukan revisi pasca-terbit. |

### D. Urutan Tahapan Eksekusi & Status Verifikasi (Fase 1 s/d Fase 8)

1. **Fase 0 — Baseline Audit & Dependency Map**: [SELESAI & TERVERIFIKASI]
2. **Fase 1 — Security, Canonical RBAC & Tenant Isolation**: [SELESAI — 12/12 CHECKS PASSED]
3. **Fase 2 — Tenant Provisioning & User Lifecycle**: [SELESAI — 14/14 CHECKS PASSED]
4. **Fase 3 — Integration, Secret & Notification Security**: [SELESAI — 11/11 CHECKS PASSED]
5. **Fase 4 — Academic Foundation & Canonical V2 Data**: [SELESAI — 9/9 CHECKS PASSED]
6. **Fase 5 — Halaqah Session & Attendance State Machine**: [SELESAI — 10/10 CHECKS PASSED]
   - *Date-aware assignment*: `is_musammi_assigned_to_halaqah_on_date` memeriksa penugasan aktif (primary & substitute) pada tanggal sesi.
   - *State machine trigger*: `trg_validate_session_state_machine` menegakkan transisi kanonikal `scheduled → open → submitted → completed → locked` (dan `cancelled`), serta melarang mutasi status ilegal maupun perubahan roster setelah sesi dikunci.
   - *Attendance roster integrity trigger*: `trg_validate_attendance_record` menolak santri di luar roster snapshot dan mewajibkan alasan koreksi (min 5 karakter) pada sesi terkunci.
   - *Atomic batch attendance*: `rpc_save_attendance_batch` memvalidasi status kehadiran, keanggotaan roster, dan menyimpan secara atomik ke `attendance_records` serta `attendance` (legacy).
   - *Idempotent submitting*: Deduplikasi submit berbasis `idempotency_key` dan composite conflict key `(session_id, santri_id)`.
   - *Pre-lock gate*: `rpc_lock_halaqah_session` menolak penguncian jika ada santri dalam roster yang belum memiliki status kehadiran (`v_recorded_count < v_roster_count`).
   - *Frontend UX*: `SesiHalaqahPage.tsx` memprioritaskan `v2SessionRecord.roster_snapshot`, menampilkan 6 status kanonikal, menyediakan modal konfirmasi penguncian dan modal koreksi pasca-kunci wajib alasan, serta memperbarui memori lokal via `fetchData()`.
7. **Fase 6 — Recitation Ledger & Review Workflow**: [SELESAI — 11/11 CHECKS PASSED]
   - *Canonical Ledger*: `recitation_entries` dijadikan sumber transaksi utama (ziyadah, sabqi, manzil/murajaah) dengan sinkronisasi atomik ke `setoran_harian` pada server-side via `rpc_submit_recitation_entry`. Client dual-write dieliminasi sepenuhnya.
   - *State Machine Enforced*: Trigger `trg_validate_recitation_state_machine` menegakkan transisi kanonikal `draft → submitted → accepted` (serta `returned` dan `voided`). Catatan `voided` bersifat terminal dan tidak dapat dimutasi.
   - *Musammi Modification Guard*: Musammi dilarang memodifikasi langsung konten setoran yang telah berstatus `submitted` tanpa proses `return` oleh Admin.
   - *Mandatory Reason*: Pengembalian (`returned`) dan pembatalan (`voided`) wajib menyertakan alasan minimal 5 karakter, ditegakkan pada tingkat DB trigger/RPC dan frontend UI modal.
   - *Revision History & Immutability*: Setiap revisi, review, resubmit, dan pembatalan mencatat snapshot lengkap (`before_snapshot`, `after_snapshot`) ke `recitation_revisions`. Trigger `trg_prevent_recitation_revision_tampering` melarang mutasi `UPDATE` dan `DELETE` pada tabel riwayat revisi (append-only).
   - *Idempotency & Deduplication*: Parameter `p_idempotency_key` dan index `idx_recitation_entries_idempotency` mencegah duplikasi data setoran saat jaringan putus/retry submit.
   - *No Client Bypass*: Kesalahan RPC tidak menghasilkan fallback direct update client yang melewati validasi.
   - *Overloaded Review RPC*: `rpc_review_recitation_entry` mendukung parameter UUID (`p_entry_id`) dan legacy bigint (`p_legacy_id`).
   - *Scalable Querying*: `fetchV2EntriesForDate` di `SetoranHarianPage.tsx` mendukung filter multi-parameter (jenis, status ledger, halaqah) tanpa cliff batasan 500 baris.
8. **Fase 7 — Exam, Gradebook & Report Card Integrity**: [SELESAI — 13/13 CHECKS PASSED]
   - *Canonical Exam Ledger*: `exam_attempts` dijadikan buku besar kanonikal untuk seluruh ujian semester dan bulanan (`exam_type: 'semester'` | `'monthly'`) dengan sinkronisasi atomik ke tabel legacy `ujian_semester` dan `ujian_bulanan`.
   - *Atomic Attempt Progression & Remedial Preservation*: RPC `rpc_record_exam_attempt` menghitung nomor attempt berikutnya secara atomik (`MAX(attempt_no) + 1`) menggunakan advisory transaction lock. Histori attempt lama strictly preserved (tidak pernah ditimpa saat remedial).
   - *Comprehensive Attempt Audit*: Setiap baris attempt menyimpan `raw_score`, `final_score`, `predikat`, `detail_json` (khoto shogir, khoto kabir, custom nilai), `notes`, `examiner_id`, serta mencatat event ke `audit_logs`.
   - *Rubric Versioning*: RPC `rpc_save_rubric_version` memeriksa penggunaan rubrik aktif pada `exam_attempts` atau `report_cards`. Jika sudah digunakan, sistem membuat versi baru secara atomik (`version_no := MAX(version_no) + 1`) dan menonaktifkan versi lama tanpa merusak riwayat penilaian masa lalu.
   - *Transparent Gradebook Calculation*: Formula bobot komponen ujian bulanan, ujian semester, silabus hafalan, dan kehadiran dihitung transparan dengan penanganan nilai kosong yang aman dan predikat nilai dinamis.
   - *First Publication Invariant*: Publikasi pertama raport resmi menjamin `version_no = 1` dengan status `published`.
   - *Amendment Workflow*: Penerbitan revisi raport (amendment) mewajibkan alasan revisi minimal 5 karakter, menandai versi sebelumnya sebagai `amended`, menaikkan `version_no` secara atomik, dan menautkan `parent_report_card_id`.
   - *Parallel & Bulk Publication Safety*: `pg_advisory_xact_lock` pada `(org_id, academic_year_id, semester, santri_id)` mencegah *race conditions* saat publikasi massal. Idempotensi otomatis mengembalikan snapshot terbit yang sama (`is_duplicate_prevented: true`) tanpa menduplikasi data.
   - *Snapshot Immutability Trigger*: Trigger `trg_enforce_report_card_immutability` diaktifkan pada `public.report_cards`, memblokir operasi `DELETE` dan mutasi kolom data pada status `published`, `amended`, atau `archived`.
   - *Superseded Document Handling*: Dokumen raport lama (`amended`/`archived`) ditandai sebagai `is_superseded` dan tidak lagi dianggap sebagai raport aktif sah.
   - *Privacy-Preserving Public Verification*: RPC `rpc_verify_report_card` mendukung verifikasi QR Code via `verification_code` (`LQ-******-****`) atau hash SHA-256. Nama santri disensor/dimask (`SUBSTRING(nama, 1, 3) || '***'`) untuk pemanggil publik anonim guna melindungi privasi santri.
   - *Export & Report Consistency*: Export file Excel dan tampilan tabel rekap nilai menggunakan filter, metrik, skor akhir, dan predikat yang 100% konsisten.
9. **Fase 8 — UI/UX Consolidation, QA & Production Readiness**: [SELESAI — 43/43 CHECKS PASSED, 123/123 TOTAL ALL PHASES]
   - *Design System & Accessibility Consolidation*: Komponen modal dialog (`ConfirmDialog`) di `components/ui/SaaSPrimitives.tsx` ditingkatkan ke standar aksesibilitas **WCAG 2.2 AA** dengan dukungan penekanan tombol `Escape`, penjebak fokus keyboard (`focus trap & restoration`), `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, dan `aria-describedby`.
   - *Workspace Musammi Alur Ringkas*: Alur operasional Musammi difokuskan pada 5 langkah (Pilih Halaqah → Pilih Tanggal/Waktu → Buka Sesi → Isi Absensi → Catat Setoran → Selesaikan Sesi) dengan antarmuka yang nyaman dioperasikan satu tangan pada layar ponsel (`touch target >= 44px`).
   - *Workspace Admin Terstruktur*: Tata letak navigasi Admin dikonsolidasi tanpa duplikasi halaman; pemisahan yang jelas antara master data, operasional halaqah, dan penerbitan raport.
   - *Platform Console & Live Health Monitor*: Superadmin Platform Console (`PlatformConsolePage.tsx`) menyajikan direktori tenant lengkap dengan filter status, manajemen paket/entitlements, sesi bantuan Break-Glass, dan kartu *Health Monitor* dinamis yang melakukan *live probe* ke `/api/health` serta status grant tanpa nilai *hardcoded*.
   - *Monitoring & Observability*: Server Node.js (`server.ts`) menyematkan header korelasi `X-Request-ID` pada setiap response HTTP, middleware logging tersanitasi (penyensoran otomatis kata sandi, token, dan secret), serta endpoint `/api/health` yang menguji koneksi basis data aktif beserta latensi.
   - *Deployability (Vercel & Netlify)*: Endpoint standalone `/api/health.ts` disediakan untuk Vercel Serverless Function, router terpadu `netlify/functions/api.ts` disediakan untuk Netlify Functions, dan rewrite `/api/*` dikonfigurasi pada `netlify.toml` dan `vercel.json`.
   - *Environment Variables Hardening*: File `.env.example` diproteksi secara ketat dengan memisahkan variabel peramban publik bertanda `VITE_*` dari rahasia server-side (`SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `FONNTE_API_TOKEN`, `GEMINI_API_KEY`). Variabel berbahaya `VITE_TELEGRAM_BOT_TOKEN` telah dieliminasi.
   - *Continuous Integration (CI/CD)*: Workflow pipeline `.github/workflows/ci.yml` dikonfigurasi untuk mengeksekusi pemeriksaan tipe (`tsc --noEmit`), linter ESLint, pengujian unit, pengujian integrasi, keamanan database/RLS, pengujian E2E 16-tahap, audit checklist produksi, dan validasi *production build*.
   - *Complete Test Suite*: 5 suite pengujian otomatis Fase 8 berhasil diselesaikan dengan tingkat kelulusan 100%:
     - `verify-fase8-unit.ts`: 6/6 lulus (normalisasi peran, evaluasi grant, pembatasan rute RBAC, kalkulasi Al-Qur'an 1..114, predikat, dan pembobotan gradebook 0..100).
     - `verify-fase8-integration.ts`: 5/5 lulus (penolakan request tanpa Bearer token, validasi payload undangan, proteksi secret integrasi, dan routing Netlify functions).
     - `verify-fase8-db-security.ts`: 6/6 lulus (RLS 100% pada tabel V2, predikat tenant isolation, pembatasan 3 peran kanonikal, pencabutan hak eksekusi anon/PUBLIC, proteksi USING false tabel secret, dan trigger immutability).
     - `verify-fase8-e2e.ts`: 16/16 lulus (simulasi kanonikal 16 langkah dari pembuatan tenant hingga penutupan tahun ajaran).
     - `verify-fase8-production-readiness.ts`: 10/10 lulus (audit 10 kriteria utama kesiapan produksi).
   - *Comprehensive Production Documentation*: Tersedia lengkap 7 dokumen teknis resmi di root dan direktori `docs/`:
     - `README.md` (Gambaran umum sistem, arsitektur, quickstart, model 3 peran, dan daftar perintah penting).
     - `docs/ARCHITECTURE.md` (Arsitektur SaaS, entitas kanonikal V2, state machines sesi & setoran, dan proteksi multi-tenant).
     - `docs/ROLE_PERMISSION_MATRIX.md` (Matriks izin navigasi rute dan izin eksekusi RPC untuk superadmin, admin, dan musammi).
     - `docs/DEPLOYMENT_GUIDE.md` (Panduan deployment Vercel, Netlify, Docker VM, dan urutan migrasi database).
     - `docs/OPERATIONAL_MANUAL.md` (Prosedur standar operasi Superadmin, Admin, dan Musammi).
     - `docs/TESTING_GUIDE.md` (Panduan piramida pengujian, eksekusi skrip, dan integrasi CI/CD).
     - `docs/PRODUCTION_CHECKLIST.md` (Penandatanganan formal kesiapan rilis produksi berdasarkan 12 kriteria faktual).
   - *Final Sign-Off*: Seluruh 8 fase transformasi arsitektur telah tuntas dengan **123/123 pengujian LULUS (100% PASS RATE)**. Sistem resmi dinyatakan siap untuk rilis ke lingkungan produksi (*Ready for Production Release*).
