# FASE 0 — REPOSITORY DISCOVERY & BASELINE AUDIT (`BASELINE.md`)

**Proyek**: Lajnah Quran — SaaS Multi-Tenant Tahfidz Management System  
**Repository**: `https://github.com/jabdrise-png/lajnahquran.git` (`main`)  
**Tanggal Audit**: 6 November 2026  
**Keputusan Produk Kanonikal**:
- Tiga role autentikasi kanonikal: `superadmin`, `admin`, `musammi` (dengan dukungan kompatibilitas baca untuk nilai legacy `super_admin`, `admin_mahad`, `pengajar`).
- `wali_kelas` dan `musyrif` adalah atribut/penanggung jawab administratif pada rombongan belajar dan kesantrian, **bukan** role autentikasi.
- Portal/role `wali_santri` di luar scope produk saat ini.

---

## 1. Inventaris Struktur Direktori & File Repository

### A. Root & Konfigurasi
| File | Fungsi Utama |
|---|---|
| `package.json` | Definisi skrip (`dev`, `build`, `start`, `lint`, `preview`) & dependency aplikasi |
| `tsconfig.json` | Konfigurasi compiler TypeScript (`target: ES2022`, `moduleResolution: bundler`, `jsx: react-jsx`) |
| `vite.config.ts` | Konfigurasi bundler Vite + plugin React |
| `server.ts` | Express 5 full-stack server (menjalankan API `/api/*` + Vite middleware saat dev / static `dist` saat production) |
| `vercel.json` | Konfigurasi rewrite serverless Vercel (`/api/(.*)` -> `/api/$1`, SPA fallback `/(.*)` -> `/index.html`) |
| `netlify.toml` | Konfigurasi build & redirect Netlify (`/api/*` -> `/.netlify/functions/:splat`, `/*` -> `/index.html`) |
| `metadata.json` | Metadata aplikasi AI Studio |
| `index.html`, `index.tsx`, `index.css` | Entry point HTML, React 18 root mount, dan konfigurasi Tailwind CSS |
| `types.ts`, `types/database.types.ts`, `types/landingPage.ts` | Definisi tipe domain, tipe tabel Supabase, dan CMS Landing Page |
| `constants.ts` | Konstanta default marhalah, kelas, waktu halaqah, predikat nilai, dan template |

### B. Serverless / Backend API (`/api/*` & `server.ts`)
| File | Endpoint | Fungsi Utama |
|---|---|---|
| `api/invitations.ts` | `POST /api/invitations` | Provisioning akun undangan Admin/Musammi via Supabase Admin SDK (`service_role`), sinkronisasi `profiles`, `user_profiles`, `access_grants`, dan `audit_logs` |
| `api/invite-user.ts` | Alias `/api/invite-user` | Re-export handler `processInvitationPayload` dari `api/invitations.ts` untuk kompatibilitas mundur |
| `api/integrations.ts` | `GET/POST /api/integrations` | Pembacaan status secret ter-masking dan penyimpanan secret (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WA_API_KEY`) ke `integration_secrets` |
| `api/notify/telegram.ts` | `POST /api/notify/telegram` | Pengiriman pesan Telegram server-side menggunakan token dari `integration_secrets` dengan verifikasi kepemilikan penerima (`santri`/`app_settings`) |
| `api/notify/whatsapp.ts` | `POST /api/notify/whatsapp` | Pengiriman pesan WhatsApp (Fonnte API) server-side menggunakan `WA_API_KEY` dari `integration_secrets` dengan verifikasi nomor wali/musammi/admin |
| `api/telegram-webhook/register.ts` | `POST /api/telegram-webhook/register` | Registrasi `setWebhook` ke API Telegram dengan query `?org_id=<uuid>` dan `secret_token` unik per organisasi |
| `api/telegram-webhook.ts` | `POST /api/telegram-webhook` | Menerima callback bot Telegram (`/start`, `/id`, `/daftar <kode>`), memvalidasi `x-telegram-bot-api-secret-token`, dan memanggil `rpc_link_telegram_chat_id` |
| `api/chat.ts` | `POST /api/chat` | Endpoint asisten AI berbasis `@google/genai` (`gemini-2.5-flash`) dengan autentikasi Bearer JWT Supabase dan rate limit per user |

### C. Database & Migrasi SQL (`/database/*`)
| File | Peran dalam Arsitektur Database |
|---|---|
| `database/skema_lajnah.sql` | Skema dasar multi-tenant (V1/Legacy) beserta fungsi otorisasi dasar, tabel master/operasional awal, trigger `handle_new_user`, `prevent_profile_privilege_escalation`, dan RPC statistik absensi |
| `database/supabase_production_security_fix.sql` | Patch keamanan RLS tabel legacy (`academic_years`, `student_classes`, `informasi`, `landing_images`, `cms_landing_page`) dan RPC statistik |
| `database/supabase_saas_v2_migration.sql` | Migrasi lengkap arsitektur SaaS V2 (3.200+ baris): tabel V2 (`user_profiles`, `access_grants`, `support_access_sessions`, `audit_logs`, `integration_secrets`, `semesters`, `marhalah_levels`, `class_groups`, `student_enrollments`, `musammi_staff`, `halaqah_musammi_assignments`, `halaqah_student_memberships`, `halaqah_schedules`, `halaqah_sessions`, `attendance_records`, `recitation_entries`, `recitation_revisions`, `target_plans`, `rubric_versions`, `exam_attempts`, `report_cards`), backfill otomatis, trigger sinkronisasi, RPC operasional, dan RLS V2 |
| `database/supabase_v2_1_production_hardening.sql` | Migrasi incremental idempotent (V2.1 Production Hardening) yang mengunci seluruh celah privilege escalation, menyelaraskan kolom V2 dengan frontend, mengisolasi `integration_secrets`, memperkuat RPC sesi/absensi/setoran/raport, dan memperbaiki verifikasi publik raport |

### D. Context, Hooks & Library (`/lib/*` & `/hooks/*`)
| File | Fungsi Utama |
|---|---|
| `lib/supabaseClient.ts` | Inisialisasi client `@supabase/supabase-js` |
| `lib/permissions.ts` | Definisi `CanonicalRole` (`superadmin`, `admin`, `musammi`), `SAAS_ROUTE_MAP`, `isRouteAllowed`, dan `SupportSessionStore` |
| `lib/AcademicYearContext.tsx` | Context global pemilihan Tahun Ajaran (`academic_years`) dan Semester aktif per organisasi |
| `hooks/useSupabaseData.tsx` | Hook data utama untuk memuat dan memutasi entitas organisasi (`profiles`, `access_grants`, `santri`, `student_classes`, `student_enrollments`, `musammi`, `halaqah`, `halaqah_santri`, `halaqah_student_memberships`, `halaqah_musammi_assignments`, `attendance`, `setoran_harian`, `recitation_entries`, `student_progress`, `ujian_bulanan`, `ujian_semester`, `app_settings`, `audit_logs`) |
| `hooks/useLandingPageContent.ts` | Hook pemuatan dan penyimpanan konten CMS Landing Page |
| `lib/quranUtils.ts`, `lib/quranPageMap.ts`, `lib/surahs.ts` | Kalkulasi halaman mushaf Madinah (604 halaman), validasi nomor surah (1–114) & jumlah ayat |
| `lib/telegram.ts`, `lib/whatsapp.ts` | Client wrapper yang memanggil proxy server `/api/notify/telegram` dan `/api/notify/whatsapp` dengan header `Authorization: Bearer <jwt>` |
| `lib/NotificationStore.ts`, `lib/notifications.ts` | State notifikasi toast in-app |

### E. Layouts, Komponen & Halaman (`/components/*` & `/pages/*`)
| Kelompok | File |
|---|---|
| **Layouts & Navigasi** | `components/layouts/SaaSLayouts.tsx` (`PublicLayout`, `PlatformShell`, `TenantShell`), `components/Sidebar.tsx`, `components/Header.tsx`, `components/ui/SaaSPrimitives.tsx` |
| **Publik & Auth** | `pages/LandingPage.tsx`, `pages/Login.tsx`, `pages/AcceptInvitePage.tsx` (`/invite`), `pages/VerifyReportPage.tsx` (`/verify/:code`) |
| **Platform Console (`superadmin`)** | `pages/Platform/PlatformConsolePage.tsx` (`/platform/dashboard`, `/platform/tenants`, `/platform/accounts`, `/platform/plans`, `/platform/support-sessions`, `/platform/audit`, `/platform/settings`), `pages/WebsiteEditorPage.tsx` (`/platform/cms`), `pages/AdminGalleryPage.tsx` |
| **Fondasi Akademik & Master Data (`admin`)** | `pages/DataMaster/TahunAjaranPage.tsx`, `pages/DataMaster/SantriPage.tsx`, `pages/DataMaster/KenaikanKelasPage.tsx`, `pages/DataMaster/MusammiPage.tsx`, `pages/DataMaster/HalaqahPage.tsx`, `pages/DataMaster/WaliKelasPage.tsx`, `pages/DataMaster/MusyrifDataPage.tsx`, `pages/Users.tsx` |
| **Operasional Harian (`admin`, `musammi`)** | `pages/Operasional/SesiHalaqahPage.tsx`, `pages/Attendance.tsx`, `pages/BukuAbsensiPage.tsx`, `pages/AttendanceBook.tsx`, `pages/SetoranHarianPage.tsx`, `pages/PerkembanganInputPage.tsx`, `pages/PerkembanganMasterDataPage.tsx`, `pages/StatistikPerkembangan.tsx`, `pages/StudentProgress.tsx` |
| **Target, Rubrik, Ujian & Raport** | `pages/PengaturanEvaluasiPage.tsx`, `pages/UjianRaport/PengaturanNilaiPage.tsx`, `pages/UjianRaport/UjianBulananPage.tsx`, `pages/UjianRaport/UjianSemesterPage.tsx`, `pages/UjianRaport/RekapNilaiPage.tsx`, `components/RaportDocument.tsx` |
| **Laporan, Pengumuman & Pengaturan** | `pages/Dashboard.tsx`, `pages/Laporan/LaporanRekapPage.tsx`, `pages/Laporan/RingkasanGlobalPage.tsx`, `pages/Laporan/AnalisisPerKelasPage.tsx`, `pages/Laporan/TrenHistorisPage.tsx`, `pages/Informasi.tsx`, `pages/SettingsPage.tsx`, `pages/Akademik/AuditLembagaPage.tsx` |

---

## 2. Dependency & Versi Framework (`package.json`)

### Runtime Dependencies
- `react`: `^18.2.0`, `react-dom`: `^18.2.0`
- `react-router-dom`: `^7.14.0`
- `@supabase/supabase-js`: `^2.97.0`
- `express`: `^5.2.1`
- `@google/genai`: `^2.7.0`
- `date-fns`: `^4.1.0`
- `recharts`: `^3.3.0`
- `lucide-react`: `^0.553.0`
- `motion`: `^12.38.0`
- `jspdf`: `^3.0.3`, `jspdf-autotable`: `^5.0.2`, `html2canvas`: `^1.4.1`, `xlsx`: `^0.18.5`
- `dotenv`: `^17.4.2`

### Dev Dependencies
- `typescript`: `~5.8.2`
- `vite`: `^6.2.0`, `@vitejs/plugin-react`: `^5.0.0`
- `esbuild`: `^0.28.0`, `tsx`: `^4.22.4`
- `@types/express`: `^5.0.6`, `@types/node`: `^22.14.0`

---

## 3. Inventaris Tabel Legacy vs Tabel SaaS V2

| Domain | Tabel Legacy (V1) | Tabel Kanonikal SaaS V2 | Status Koeksistensi & Sinkronisasi |
|---|---|---|---|
| **Organisasi / Tenant** | `organizations` | `organizations` (diperluas dengan `slug`, `status`, `plan_tier`, `settings_json`, `updated_at`) | Satu tabel kanonikal yang diperluas secara in-place |
| **Identitas & Role Pengguna** | `profiles` | `user_profiles` + `access_grants` | Trigger dua arah `sync_profile_to_v2_grants` menyinkronkan `profiles` dengan `user_profiles` & `access_grants` |
| **Break-Glass Support** | *(Tidak ada)* | `support_access_sessions` | Tabel V2 murni dengan validasi fungsi `has_active_support_session` |
| **Jejak Audit** | *(Tidak ada)* | `audit_logs` | Tabel V2 murni (mendukung kolom `actor_id`/`actor_user_id`, `resource_type`/`entity_type`, `before_state`/`after_state`/`diff_json`) |
| **Secret Integrasi** | `app_settings` (menyimpan token plaintext di masa lalu) | `integration_secrets` (`REVOKE ALL` dari client, hanya diakses via `service_role`) | `app_settings` hanya menyimpan konfigurasi non-rahasia / masked; secret sensitif disimpan di `integration_secrets` |
| **Tahun Ajaran & Semester** | `academic_years` | `academic_years` (diperluas dengan `status`, `closed_at`, `closed_by`) + `semesters` | Sinkronisasi otomatis melalui `rpc_set_active_academic_year` dan `rpc_close_academic_year` |
| **Struktur Marhalah & Kelas** | `master_marhalah`, `master_kelas_relasi`, `wali_kelas`, `musyrif` | `marhalah_levels`, `class_groups` + tabel atribut administratif `wali_kelas`, `musyrif` | Backfill otomatis dari tabel legacy ke V2 |
| **Santri & Penempatan Tahunan** | `santri`, `student_classes` | `santri` + `student_enrollments` (dengan kompatibilitas `student_classes`) | Dual-write tervalidasi & trigger `normalize_student_enrollments_row` (`status` <-> `enrollment_status`) |
| **Musammi & Penugasan Halaqah** | `musammi`, `halaqah`, `halaqah_santri` | `musammi_staff`, `halaqah`, `halaqah_musammi_assignments`, `halaqah_student_memberships`, `halaqah_schedules` | Fungsi `is_halaqah_musammi` dan `rpc_open_halaqah_session` membaca gabungan V2 & legacy |
| **Sesi Halaqah & Absensi** | `attendance` | `halaqah_sessions` + `attendance_records` | `rpc_open_halaqah_session` membekukan roster; `rpc_save_attendance_batch` menyimpan ke `attendance_records` dan menyinkronkan ke `attendance` secara atomik di server |
| **Setoran & Revisi** | `setoran_harian` | `recitation_entries` + `recitation_revisions` | Sinkronisasi melalui `legacy_setoran_id`, trigger `normalize_recitation_entries_row`, dan trigger audit `trg_audit_recitation_entry_mutation` |
| **Target, Rubrik, Ujian & Raport** | `target_hafalan`, `evaluation_settings`, `student_progress`, `ujian_bulanan_periode`, `ujian_bulanan`, `ujian_semester` | `target_plans`, `rubric_versions`, `exam_attempts`, `report_cards` | `exam_attempts` merekam riwayat attempt & remedial; `report_cards` menyimpan snapshot raport immutable yang diverifikasi via `rpc_verify_report_card` |

---

## 4. Inventaris Seluruh RPC, Fungsi `SECURITY DEFINER`, Trigger, dan RLS Policy

### A. Daftar RPC & Fungsi `SECURITY DEFINER`
1. `public.get_my_org_id() RETURNS uuid` (`SECURITY DEFINER`, `STABLE`) — Mengambil `organization_id` aktif pemanggil (memperhitungkan sesi support aktif bagi `superadmin` atau grant aktif).
2. `public.get_canonical_role() RETURNS text` (`SECURITY DEFINER`, `STABLE`) — Mengembalikan role kanonikal (`superadmin`, `admin`, `musammi`).
3. `public.get_role_for_org(target_org_id uuid) RETURNS text` (`SECURITY DEFINER`, `STABLE`) — Mengembalikan role pemanggil pada organisasi tertentu.
4. `public.is_super_admin() RETURNS boolean` (`SECURITY DEFINER`, `STABLE`) — Mengecek apakah pemanggil memiliki hak `superadmin` aktif.
5. `public.has_active_support_session(target_org_id uuid, require_write boolean) RETURNS boolean` (`SECURITY DEFINER`, `STABLE`) — Memvalidasi apakah `superadmin` memiliki sesi support aktif yang belum kedaluwarsa (`expires_at > now() AND ended_at IS NULL`) pada organisasi target.
6. `public.is_admin_of_org(target_org_id uuid) RETURNS boolean` (`SECURITY DEFINER`, `STABLE`) — Mengecek apakah pemanggil adalah `admin` aktif di organisasi tersebut atau `superadmin` dengan sesi support `read_write`.
7. `public.is_halaqah_musammi(target_org_id uuid, target_halaqah_id bigint) RETURNS boolean` / `public.is_musammi_assigned_to_halaqah(...)` (`SECURITY DEFINER`, `STABLE`) — Mengecek apakah pengguna saat ini adalah Musammi yang ditugaskan ke halaqah tersebut.
8. `public.rpc_create_tenant_with_admin(p_org_name, p_org_slug, p_plan_tier, p_admin_email, p_admin_name)` (`SECURITY DEFINER`) — Provisioning organisasi baru oleh `superadmin`.
9. `public.rpc_start_support_session(p_organization_id, p_reason, p_mode, p_duration_minutes)` (`SECURITY DEFINER`) — Memulai sesi support lintas tenant oleh `superadmin` dan mencatat ke `audit_logs`.
10. `public.rpc_end_support_session(p_session_id uuid)` (`SECURITY DEFINER`) — Mengakhiri sesi support aktif dan mengembalikan `boolean` akurat (`v_updated > 0`).
11. `public.rpc_accept_invitation(p_organization_id uuid)` (`SECURITY DEFINER`) — Mengaktifkan grant undangan (`invited -> active`) dan profil pengguna secara atomik setelah ganti password.
12. `public.rpc_set_active_academic_year(p_academic_year_id bigint, p_semester text)` (`SECURITY DEFINER`) — Mengaktifkan satu tahun ajaran & semester secara atomik per organisasi.
13. `public.rpc_close_academic_year(p_academic_year_id bigint)` (`SECURITY DEFINER`) — Rekonsiliasi dan penutupan tahun ajaran (mengunci sesi terbuka, menonaktifkan enrollment aktif, mencatat audit log).
14. `public.rpc_open_halaqah_session(p_halaqah_id bigint, p_session_date date, p_session_slot text)` (`SECURITY DEFINER`) — Membuka sesi halaqah dan membekukan roster santri dari gabungan membership V2 & legacy beserta kelas historis.
15. `public.rpc_save_attendance_batch(p_session_id uuid, p_records jsonb, p_idempotency_key text, p_reason text)` (`SECURITY DEFINER`) — Menyimpan absensi batch dengan validasi keanggotaan roster sesi, idempotency key, alasan wajib jika sesi terkunci, dan sinkronisasi atomik ke tabel `attendance`.
16. `public.rpc_lock_halaqah_session(p_halaqah_id bigint, p_session_date date, p_session_slot text, p_reason text)` (`SECURITY DEFINER`) — Memvalidasi seluruh roster sesi sudah memiliki status kehadiran (`unmarked = 0`) sebelum mengunci sesi.
17. `public.rpc_review_recitation_entry(p_entry_id uuid, p_new_status text, p_reason text)` (`SECURITY DEFINER`) — Review Admin (`accepted`, `returned`, `voided`) atas setoran dengan pencatatan revisi dan audit log.
18. `public.rpc_publish_report_card(...)` (`SECURITY DEFINER`) — Penerbitan/amendment snapshot raport dengan `pg_advisory_xact_lock`, penomoran versi aman `COALESCE(MAX(version_no), 0) + 1`, dan pengarsipan versi lama menjadi `amended`.
19. `public.rpc_verify_report_card(p_verification_code text)` (`SECURITY DEFINER`) — Verifikasi publik kode QR raport (`valid = (status = 'published')` dan penyamaran NIS bagi pemanggil anonim).
20. `public.rpc_link_telegram_chat_id(p_identifier text, p_chat_id text, p_org_id uuid)` (`SECURITY DEFINER`) — Penautan Chat ID Telegram santri secara tenant-aware khusus untuk `service_role`.
21. `public.rpc_get_attendance_stats`, `public.rpc_get_attendance_trend`, `public.rpc_get_santri_attendance_percentages`, `public.rpc_get_waktu_stats` (`SECURITY DEFINER`) — RPC agregasi analitik kehadiran dengan validasi tenant.

### B. Daftar Trigger Database
1. `on_auth_user_created` (`AFTER INSERT ON auth.users`) -> `public.handle_new_user()`
2. `trg_prevent_profile_escalation` (`BEFORE UPDATE ON public.profiles`) -> `public.prevent_profile_privilege_escalation()`
3. `trg_sync_profile_to_v2_grants` (`AFTER INSERT OR UPDATE ON public.profiles`) -> `public.sync_profile_to_v2_grants()`
4. `trg_normalize_user_profiles` (`BEFORE INSERT OR UPDATE ON public.user_profiles`) -> `public.normalize_user_profiles_row()`
5. `trg_normalize_student_enrollments` (`BEFORE INSERT OR UPDATE ON public.student_enrollments`) -> `public.normalize_student_enrollments_row()`
6. `trg_normalize_hma_row` (`BEFORE INSERT OR UPDATE ON public.halaqah_musammi_assignments`) -> `public.normalize_hma_row()`
7. `trg_normalize_recitation_entries` (`BEFORE INSERT OR UPDATE ON public.recitation_entries`) -> `public.normalize_recitation_entries_row()`
8. `trg_audit_recitation_entry_mutation` (`BEFORE UPDATE ON public.recitation_entries`) -> `public.trg_audit_recitation_entry_mutation()`
9. `trg_normalize_recitation_revisions` (`BEFORE INSERT OR UPDATE ON public.recitation_revisions`) -> `public.normalize_recitation_revisions_row()`
10. `trg_enforce_report_card_immutability` (`BEFORE UPDATE OR DELETE ON public.report_cards`) -> `public.enforce_report_card_immutability()`
