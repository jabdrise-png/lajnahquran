# FASE 0 — REGISTER TEMUAN & INVENTARIS MASALAH (`ISSUE_REGISTER.md`)

Dokumen ini mendokumentasikan seluruh temuan hasil audit menyeluruh pada repository **Lajnah Quran** beserta klasifikasi prioritas (**P0, P1, P2, P3**), lokasi file/fungsi, akar penyebab, dampak, dependensi antar-modul, spesifikasi perbaikan, dan skenario pengujian pembuktiannya.

---

## Ringkasan Klasifikasi Severity
- **P0 (Critical Security & Data Corruption Blockers)**: 9 Temuan (`ISS-P0-01` s/d `ISS-P0-09`)
- **P1 (High Priority Transactional & Business Logic Integrity)**: 9 Temuan (`ISS-P1-01` s/d `ISS-P1-09`)
- **P2 (Medium Priority Schema Alignment & Operational Consistency)**: 6 Temuan (`ISS-P2-01` s/d `ISS-P2-06`)
- **P3 (Low Priority UX, Query Efficiency & Deployment Hygiene)**: 3 Temuan (`ISS-P3-01` s/d `ISS-P3-03`)

---

## DAFTAR TEMUAN P0 (CRITICAL)

### `ISS-P0-01` — Eskalasi Mandiri Kolom `is_superadmin` pada `user_profiles`
- **Severity**: P0
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`normalize_user_profiles_row()`, policy `user_profiles_update`).
- **Penyebab**: Policy `user_profiles_update` mengizinkan `id = auth.uid()` memperbarui baris profilnya sendiri, sementara trigger `normalize_user_profiles_row()` belum menolak perubahan nilai `NEW.is_superadmin` oleh non-superadmin.
- **Dampak**: Pengguna terautentikasi biasa dapat mengeksekusi query client ` supabase.from('user_profiles').update({ is_superadmin: true }).eq('id', uid)` dan mengambil alih platform (`superadmin`).
- **Dependensi**: Fungsi `public.is_super_admin()` dan trigger `trg_normalize_user_profiles`.
- **Perbaikan yang Diperlukan**: Pada `normalize_user_profiles_row()`, blokir `INSERT` dengan `is_superadmin = true` dan blokir `UPDATE` ketika `NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin` kecuali pemanggil adalah `service_role` atau `public.is_super_admin()`. Selain itu kunci klausa `WITH CHECK` pada policy `user_profiles_update`.
- **Test Pembuktian**: Login sebagai `musammi` atau `admin`, jalankan update `is_superadmin = true` pada `user_profiles`, pastikan PostgreSQL menolak dengan `RAISE EXCEPTION 'Forbidden: Only Superadmin can modify is_superadmin privilege.'`.

### `ISS-P0-02` — Eskalasi Role oleh Admin Lembaga (Admin Membuat Admin / Superadmin)
- **Severity**: P0
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (policy `access_grants_manage`), `database/skema_lajnah.sql` (`prevent_profile_privilege_escalation()`), `api/invitations.ts`, `pages/Users.tsx`.
- **Penyebab**: Kebijakan `access_grants_manage` sebelumnya menggunakan `USING (is_admin_of_org(organization_id))` tanpa membatasi kolom `role`, dan `/api/invitations` mengizinkan Admin mengundang role `admin`.
- **Dampak**: Admin satu lembaga dapat membuat Admin baru atau mempromosikan pengguna menjadi Admin tanpa otorisasi Superadmin Platform.
- **Dependensi**: RLS `access_grants`, trigger `profiles`, `/api/invitations`, dan `pages/Users.tsx`.
- **Perbaikan yang Diperlukan**:
  1. Batasi `access_grants_manage` sehingga `admin` hanya memenuhi syarat apabila `role = 'musammi'` baik pada `USING` maupun `WITH CHECK`.
  2. Pada `prevent_profile_privilege_escalation()`, larang `admin` mengubah `profiles.role` menjadi `admin` atau `super_admin`.
  3. Pada `/api/invitations.ts` dan `pages/Users.tsx`, batasi Admin agar hanya dapat mengundang/menyetujui role `musammi`.
- **Test Pembuktian**: Panggil `POST /api/invitations` dengan role `admin` menggunakan JWT Admin Lembaga; pastikan server menolak dengan `HTTP 403` dan RLS menolak direct `INSERT` ke `access_grants` dengan `role = 'admin'`.

### `ISS-P0-03` — Reaktivasi Tidak Sengaja Grant `suspended` / `revoked` oleh Trigger `sync_profile_to_v2_grants()`
- **Severity**: P0
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`sync_profile_to_v2_grants()`).
- **Penyebab**: Saat baris `profiles` diperbarui (misalnya perubahan nama lengkap), trigger melakukan `ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active'` apabila `NEW.role <> 'pending'`.
- **Dampak**: Akun yang telah di-`suspended` atau `revoked` di `access_grants` dapat aktif kembali secara otomatis ketika profilnya tersentuh update.
- **Dependensi**: `public.profiles`, `public.access_grants`.
- **Perbaikan yang Diperlukan**: Periksa status grant eksisting di `access_grants`; apabila status saat ini adalah `suspended`, `revoked`, atau `invited`, pertahankan status tersebut kecuali pemutakhiran eksplisit dilakukan pada tabel `access_grants`.
- **Test Pembuktian**: Set status grant pengguna menjadi `suspended`, lalu lakukan `UPDATE public.profiles SET full_name = 'Nama Baru'`; pastikan `access_grants.status` tetap `suspended`.

### `ISS-P0-04` — Eksposur Tabel `integration_secrets` ke Role `authenticated` / `anon`
- **Severity**: P0
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`public.integration_secrets`), `api/integrations.ts`.
- **Penyebab**: Grant default skema (`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`) dan policy baca yang mengizinkan pembacaan baris `integration_secrets`.
- **Dampak**: Token Bot Telegram (`TELEGRAM_BOT_TOKEN`) dan API Key WhatsApp (`WA_API_KEY`) berpotensi dibaca langsung dari browser menggunakan Supabase client.
- **Dependensi**: `api/integrations.ts`, `api/notify/telegram.ts`, `api/notify/whatsapp.ts`, `api/telegram-webhook.ts`.
- **Perbaikan yang Diperlukan**: Jalankan `REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated, PUBLIC; GRANT ALL ON TABLE public.integration_secrets TO service_role;` dan pasang policy `USING (false) WITH CHECK (false)` untuk `authenticated`. Seluruh akses wajib melalui backend `service_role`.
- **Test Pembuktian**: Jalankan `supabase.from('integration_secrets').select('*')` dari client terautentikasi; pastikan query ditolak (`permission denied`) atau mengembalikan 0 baris.

### `ISS-P0-05` — Pemalsuan Support Access Session via `sessionStorage` dan Silent Failure saat Mengakhiri Sesi
- **Severity**: P0
- **File & Fungsi**: `lib/permissions.ts` (`SupportSessionStore`), `App.tsx`, `pages/Platform/PlatformConsolePage.tsx`, `database/supabase_saas_v2_migration.sql` (`rpc_end_support_session`).
- **Penyebab**:
  1. `PlatformConsolePage.tsx` memiliki fallback pembuatan sesi lokal (`id: 'local-...'`) jika RPC gagal.
  2. `App.tsx` membaca `SupportSessionStore` dari `sessionStorage` tanpa memverifikasi ke tabel `support_access_sessions`.
  3. `rpc_end_support_session` selalu mengembalikan `true` meskipun `UPDATE` tidak mengubah baris apa pun.
- **Dampak**: Status sesi support di UI dapat tidak sinkron dengan database atau tetap terbuka ketika penghentian sesi gagal.
- **Dependensi**: `public.support_access_sessions`, `App.tsx`, `PlatformConsolePage.tsx`.
- **Perbaikan yang Diperlukan**:
  1. Hapus fallback `local-...` di `PlatformConsolePage.tsx`.
  2. Verifikasi keaktifan sesi support terhadap tabel `support_access_sessions` di `App.tsx`.
  3. Perbaiki `rpc_end_support_session` agar mengembalikan `v_updated > 0` dan periksa error/return value sebelum memanggil `SupportSessionStore.endSession()`.
- **Test Pembuktian**: Masukkan objek palsu ke `sessionStorage` dengan key `lajnah_active_support_session_v2`; pastikan `App.tsx` langsung menghapusnya karena tidak valid di `support_access_sessions`.

### `ISS-P0-06` — Webhook Telegram Tanpa Verifikasi `secret_token` Wajib & Tanpa Konteks Organisasi (`tenant-aware`)
- **Severity**: P0
- **File & Fungsi**: `api/telegram-webhook.ts`, `api/telegram-webhook/register.ts`, `database/skema_lajnah.sql` (`rpc_link_telegram_chat_id`).
- **Penyebab**:
  1. Webhook menerima request meskipun header `x-telegram-bot-api-secret-token` kosong apabila env global tidak diset.
  2. `rpc_link_telegram_chat_id(p_identifier, p_chat_id)` mencari santri lintas seluruh tenant (`WHERE s.id::text = p_identifier OR s.kode = p_identifier LIMIT 1`) tanpa filter `organization_id`.
- **Dampak**: Penautan Chat ID Telegram dapat mengenai santri dari lembaga (tenant) lain yang kebetulan memiliki kode/NIS serupa, dan endpoint webhook rentan terhadap spoofing payload.
- **Dependensi**: `api/telegram-webhook/register.ts`, `api/telegram-webhook.ts`, `public.integration_secrets`, `public.rpc_link_telegram_chat_id`.
- **Perbaikan yang Diperlukan**:
  1. Sertakan `?org_id=<organization_id>` dan `secret_token` per organisasi saat `setWebhook`.
  2. Wajibkan kecocokan `x-telegram-bot-api-secret-token` di `api/telegram-webhook.ts` (tolak dengan `HTTP 401` bila kosong atau tidak cocok).
  3. Tambahkan parameter `p_org_id uuid` pada `rpc_link_telegram_chat_id` dan batasi eksekusinya hanya untuk `service_role`.
- **Test Pembuktian**: Kirim `POST /api/telegram-webhook?org_id=<uuid>` tanpa header `x-telegram-bot-api-secret-token`; pastikan ditolak dengan `HTTP 401 Unauthorized`.

### `ISS-P0-07` — Bug `NULL` Version & Race Condition pada `rpc_publish_report_card`
- **Severity**: P0
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`rpc_publish_report_card`).
- **Penyebab**: Ketika santri belum memiliki raport sebelumnya (`v_existing IS NULL`), ekspresi `v_next_version := v_existing.version_no + 1` menghasilkan `NULL` (karena di PL/pgSQL `NULL + 1 = NULL`), serta tidak ada penguncian konkuren saat dua request publikasi berjalan bersamaan.
- **Dampak**: Publikasi raport pertama menghasilkan `version_no = NULL` atau gagal karena constraint `NOT NULL`, dan publikasi bersamaan berisiko menghasilkan duplikasi versi `published`.
- **Dependensi**: `public.report_cards`, `pages/UjianRaport/RekapNilaiPage.tsx`.
- **Perbaikan yang Diperlukan**: Gunakan `pg_advisory_xact_lock`, hitung versi dengan `SELECT COALESCE(MAX(version_no), 0) + 1 FROM public.report_cards WHERE ...`, dan pasang partial unique index `idx_report_cards_one_published_uniq` (`WHERE status = 'published'`) serta `idx_report_cards_org_year_sem_santri_ver_uniq`.
- **Test Pembuktian**: Panggil `rpc_publish_report_card` untuk santri yang belum pernah memiliki raport; pastikan baris baru memiliki `version_no = 1` dan `status = 'published'`. Panggil lagi untuk amendment; pastikan versi pertama berubah menjadi `amended` dan versi baru memiliki `version_no = 2`.

### `ISS-P0-08` — Trigger `handle_new_user()` Menelan Error (`EXCEPTION WHEN OTHERS`) & Membuat Tenant Liar `'Ma''had Baru'`
- **Severity**: P0
- **File & Fungsi**: `database/skema_lajnah.sql`, `database/supabase_production_security_fix.sql` (`handle_new_user()`).
- **Penyebab**: Blok `EXCEPTION WHEN OTHERS THEN RETURN new;` menyembunyikan kegagalan insert `profiles`/`access_grants` sehingga user terbuat di `auth.users` tanpa profil/grant, dan fallback membuat baris baru di `organizations` bernama `'Ma''had Baru'` untuk akun undangan.
- **Dampak**: Akun yatim (orphan auth user) dan polusi data tabel `organizations`.
- **Dependensi**: `auth.users`, `api/invitations.ts`.
- **Perbaikan yang Diperlukan**: Hapus `EXCEPTION WHEN OTHERS` yang menelan error pada `handle_new_user()`, hormati metadata `is_invited_account` agar tidak membuat organisasi `'Ma''had Baru'`, dan tambahkan rollback `deleteUser` di `api/invitations.ts` bila upsert profil/grant gagal.
- **Test Pembuktian**: Buat undangan user melalui `/api/invitations`; pastikan tidak ada organisasi baru `'Ma''had Baru'` yang terbuat dan user memiliki `user_profiles` + `access_grants` yang lengkap.

### `ISS-P0-09` — Endpoint AI `/api/chat` Terbuka Tanpa Autentikasi & Rate Limit
- **Severity**: P0
- **File & Fungsi**: `api/chat.ts`, `server.ts`, `components/ChatWidget.tsx`.
- **Penyebab**: Endpoint `/api/chat` tidak memeriksa token sesi pengguna dan tidak membatasi frekuensi maupun ukuran input.
- **Dampak**: Kuota `GEMINI_API_KEY` dapat disalahgunakan oleh pihak eksternal tanpa login.
- **Dependensi**: `api/chat.ts`, `components/ChatWidget.tsx`.
- **Perbaikan yang Diperlukan**: Wajibkan header `Authorization: Bearer <access_token>` yang diverifikasi via `supabase.auth.getUser(token)`, terapkan rate limit per user (15 req/menit), batasi panjang pesan, gunakan model `"gemini-2.5-flash"`, dan sesuaikan system instruction dengan 3 role kanonikal.
- **Test Pembuktian**: Panggil `POST /api/chat` tanpa Bearer token; pastikan server merespons `HTTP 401`.

---

## DAFTAR TEMUAN P1 (HIGH)

### `ISS-P1-01` — Pemilihan Grant Aktif Tanpa Konteks `organization_id` Eksplisit
- **Severity**: P1
- **File & Fungsi**: `App.tsx`, `hooks/useSupabaseData.tsx`, `api/invitations.ts`, `api/integrations.ts`, `api/notify/telegram.ts`, `api/notify/whatsapp.ts`.
- **Penyebab**: Kode menggunakan `grants.find(g => g.status === 'active')` tanpa mencocokkan `g.organization_id === profile.organization_id`.
- **Dampak**: Apabila seorang pengguna pernah memiliki grant di lebih dari satu organisasi, konteks role dan organisasi dapat tertukar.
- **Perbaikan yang Diperlukan**: Selalu prioritaskan grant yang cocok dengan `organization_id` aktif pengguna (`grants.find(g => g.status === 'active' && g.organization_id === targetOrgId)`).
- **Test Pembuktian**: Verifikasi pemuatan profil di `App.tsx` dan validasi organisasi di seluruh endpoint `/api/*`.

### `ISS-P1-02` — Penggunaan Sandi Default Lemah `'Mahad123!'` & Redirect `/invite` oleh `PublicLayout`
- **Severity**: P1
- **File & Fungsi**: `api/invitations.ts`, `pages/Platform/PlatformConsolePage.tsx`, `pages/AcceptInvitePage.tsx`, `components/layouts/SaaSLayouts.tsx`.
- **Penyebab**: Fallback password menggunakan `'Mahad123!'` dan `PublicLayout` me-redirect pengguna yang sedang login dari `/invite` ke dashboard sebelum sempat mengaktifkan undangan.
- **Dampak**: Kelemahan kredensial awal dan kegagalan alur aktivasi undangan.
- **Perbaikan yang Diperlukan**: Tolak `'Mahad123!'`, hasilkan temporary password acak kriptografis di `/api/invitations`, izinkan rute `/invite` dan `/verify` di `PublicLayout`, serta gunakan `rpc_accept_invitation` di `AcceptInvitePage.tsx`.
- **Test Pembuktian**: Buka `/invite?email=...&org=...` saat sudah login maupun belum login; pastikan halaman aktivasi tampil dan `rpc_accept_invitation` mengubah grant dari `invited` menjadi `active`.

### `ISS-P1-03` — Endpoint Notifikasi (`/api/notify/telegram` & `/api/notify/whatsapp`) Belum Memverifikasi Kepemilikan Penerima
- **Severity**: P1
- **File & Fungsi**: `api/notify/telegram.ts`, `api/notify/whatsapp.ts`.
- **Penyebab**: Endpoint langsung meneruskan `chatId` atau nomor telepon `target` dari request body ke API eksternal.
- **Dampak**: Pengguna terautentikasi dapat menyalahgunakan bot/kuota WhatsApp lembaga untuk mengirim pesan ke nomor/chatId sembarang di luar lembaganya.
- **Perbaikan yang Diperlukan**: Verifikasi di server bahwa `chatId`/`santriId` atau nomor `target` terdaftar pada `santri`, `musammi`, `profiles`, atau `app_settings` milik `organization_id` pengirim.
- **Test Pembuktian**: Kirim request ke `/api/notify/telegram` dengan `chatId` asing yang tidak terdaftar di organisasi; pastikan ditolak dengan `HTTP 403`.

### `ISS-P1-04` — Aktivasi Tahun Ajaran Non-Atomik & Fallback Direct Update saat Penutupan Tahun Ajaran Gagal
- **Severity**: P1
- **File & Fungsi**: `pages/DataMaster/TahunAjaranPage.tsx` (`handleSetActive`, `handleToggleSemester`, `handleConfirmCloseAcademicYear`).
- **Penyebab**: Aktivasi tahun ajaran menjalankan beberapa query `.update()` terpisah dari client, dan penutupan tahun ajaran melakukan fallback `.update({ status: 'closed' })` ketika `rpc_close_academic_year` gagal.
- **Dampak**: Risiko dua tahun ajaran aktif bersamaan atau tahun ajaran tertutup paksa padahal masih ada sesi/rekonsiliasi yang belum valid.
- **Perbaikan yang Diperlukan**: Buat dan gunakan `rpc_set_active_academic_year(p_academic_year_id, p_semester)` serta hapus fallback direct update pada `handleConfirmCloseAcademicYear`.
- **Test Pembuktian**: Aktifkan tahun ajaran via `rpc_set_active_academic_year`; pastikan tepat 1 tahun ajaran dan 1 semester berstatus `is_active = true`.

### `ISS-P1-05` — Penguncian Sesi Halaqah & Simpan Absensi Melewati Validasi Roster Server
- **Severity**: P1
- **File & Fungsi**: `pages/Operasional/SesiHalaqahPage.tsx`, `database/supabase_saas_v2_migration.sql` (`rpc_open_halaqah_session`, `rpc_save_attendance_batch`, `rpc_lock_halaqah_session`, RLS `halaqah_sessions`).
- **Penyebab**:
  1. `rpc_lock_halaqah_session` belum memeriksa apakah masih ada santri roster berstatus `unmarked` di server.
  2. `SesiHalaqahPage.tsx` memiliki fallback direct `.upsert({ status: 'locked' })` ketika RPC gagal.
  3. `rpc_save_attendance_batch` belum memvalidasi bahwa santri yang diabsen merupakan anggota roster sesi tersebut.
- **Dampak**: Sesi dapat terkunci meskipun absensi belum lengkap, atau absensi santri di luar halaqah dapat masuk ke sesi.
- **Perbaikan yang Diperlukan**:
  1. Perkuat `rpc_open_halaqah_session` (gabungan membership V2 & legacy + kelas historis).
  2. Validasi keanggotaan roster & sinkronisasi atomik `attendance` di `rpc_save_attendance_batch`.
  3. Tolak penguncian di `rpc_lock_halaqah_session` bila masih ada `unmarked`.
  4. Hapus fallback direct `.upsert()` di `SesiHalaqahPage.tsx` dan blokir update status `locked` langsung via RLS.
- **Test Pembuktian**: Panggil `rpc_lock_halaqah_session` saat masih ada santri `unmarked`; pastikan RPC menolak dengan error dan status sesi tetap `open`.

### `ISS-P1-06` — Mutasi Setoran Tanpa Histori Revisi Otomatis & Fallback Direct Update saat Review Gagal
- **Severity**: P1
- **File & Fungsi**: `pages/SetoranHarianPage.tsx`, `pages/Operasional/SesiHalaqahPage.tsx`, `hooks/useSupabaseData.tsx`, `database/supabase_saas_v2_migration.sql`.
- **Penyebab**:
  1. `SetoranHarianPage.tsx` dan `SesiHalaqahPage.tsx` melakukan direct `.update()` ke `recitation_entries` jika `rpc_review_recitation_entry` error.
  2. Belum ada trigger database yang otomatis mencatat `recitation_revisions` dan menaikkan `revision_no` saat entri setoran yang sudah `submitted`/`accepted` diedit.
- **Dampak**: Perubahan nilai/ayat setoran dapat terjadi tanpa jejak revisi yang utuh.
- **Perbaikan yang Diperlukan**: Tambahkan trigger `trg_audit_recitation_entry_mutation` pada `recitation_entries` dan hapus seluruh fallback direct update pada handler review setoran.
- **Test Pembuktian**: Ubah nilai atau ayat pada baris `recitation_entries` berstatus `submitted`; pastikan `revision_no` bertambah 1 dan baris baru tercatat di `recitation_revisions`.

### `ISS-P1-07` — Pemanggilan `getOrgId()` Tanpa `await` pada `UjianSemesterPage.tsx`
- **Severity**: P1
- **File & Fungsi**: `pages/UjianRaport/UjianSemesterPage.tsx` (`fetchExamAttempts` baris 78, `handleSaveModal` baris 240).
- **Penyebab**: `getOrgId()` adalah fungsi `async` yang mengembalikan `Promise<string>`, namun dipanggil tanpa `await`.
- **Dampak**: Query `.eq('organization_id', orgId)` dan insert ke `exam_attempts` menerima objek `Promise`, sehingga histori attempt ujian semester dan remedial gagal tersimpan/termuat.
- **Perbaikan yang Diperlukan**: Tambahkan `await getOrgId()` pada `fetchExamAttempts` dan `handleSaveModal`.
- **Test Pembuktian**: Simpan nilai ujian semester dan remedial di `UjianSemesterPage.tsx`; pastikan baris `exam_attempts` tersimpan dengan `organization_id` UUID yang valid dan tampil di daftar histori attempt.

### `ISS-P1-08` — Immutability Raport Belum Melindungi Metadata & Transisi Status
- **Severity**: P1
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`enforce_report_card_immutability()`).
- **Penyebab**: Trigger sebelumnya hanya memeriksa perubahan pada `snapshot_json` dan `verification_code`, belum memblokir perubahan pada `santri_id`, `academic_year_id`, `semester`, `version_no`, `final_score`, `predikat`, maupun transisi status tidak sah (mis. `archived -> published`).
- **Dampak**: Metadata utama raport yang sudah terbit masih dapat diubah secara langsung.
- **Perbaikan yang Diperlukan**: Perkuat `enforce_report_card_immutability()` agar mengunci seluruh kolom metadata pada raport non-draft dan hanya mengizinkan transisi status ke `amended` atau `archived`.
- **Test Pembuktian**: Coba lakukan `UPDATE public.report_cards SET final_score = 99 WHERE status = 'published'`; pastikan ditolak oleh trigger `trg_enforce_report_card_immutability`.

### `ISS-P1-09` — Verifikasi Publik Raport (`rpc_verify_report_card`) Membuka NIS Penuh & Menganggap Raport `archived`/`amended` Masih Aktif
- **Severity**: P1
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`rpc_verify_report_card`), `pages/VerifyReportPage.tsx`.
- **Penyebab**: Fungsi mengembalikan `valid: true` untuk semua baris yang ditemukan tanpa memeriksa `status = 'published'` dan menampilkan NIS santri secara utuh kepada pengunjung publik (`anon`).
- **Dampak**: Raport versi lama yang sudah di-amendment tetap terlihat sebagai raport aktif terbaru, dan NIS santri terekspos ke publik.
- **Perbaikan yang Diperlukan**: Tetapkan `valid = (v_card.status = 'published')`, sertakan flag `is_superseded`, dan samarkan (masking) NIS santri apabila `auth.uid() IS NULL`.
- **Test Pembuktian**: Panggil `rpc_verify_report_card` untuk raport berstatus `amended` sebagai `anon`; pastikan `valid = false`, `is_superseded = true`, dan NIS ter-masking.

---

## DAFTAR TEMUAN P2 (MEDIUM)

### `ISS-P2-01` — Ketidaksesuaian Kolom `student_enrollments` (`status` vs `enrollment_status`)
- **Severity**: P2
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql`, `hooks/useSupabaseData.tsx`, `pages/DataMaster/SantriPage.tsx`, `pages/DataMaster/KenaikanKelasPage.tsx`.
- **Penyebab**: Sebagian query frontend menulis/membaca `enrollment_status` sementara definisi tabel awal menggunakan `status`.
- **Perbaikan yang Diperlukan**: Sediakan kedua kolom pada `student_enrollments` dan pasang trigger `normalize_student_enrollments_row()` untuk menyinkronkan keduanya secara otomatis.
- **Test Pembuktian**: Insert baris ke `student_enrollments` hanya dengan `enrollment_status = 'graduated'`; pastikan `status` otomatis bernilai `'graduated'`.

### `ISS-P2-02` — Ketidaksesuaian Kolom `halaqah_musammi_assignments` (`assignment_type` vs `is_primary`)
- **Severity**: P2
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql`, `pages/DataMaster/HalaqahPage.tsx`, `hooks/useSupabaseData.tsx`.
- **Penyebab**: Frontend mengirimkan `is_primary: boolean`, sedangkan tabel V2 awal mendefinisikan `assignment_type: text` (`'primary' | 'assistant'`).
- **Perbaikan yang Diperlukan**: Sediakan kedua kolom pada `halaqah_musammi_assignments` dan pasang trigger `normalize_hma_row()` beserta unique index `(organization_id, halaqah_id, musammi_id)`.
- **Test Pembuktian**: Upsert ke `halaqah_musammi_assignments` dengan `is_primary = true`; pastikan `assignment_type` otomatis bernilai `'primary'`.

### `ISS-P2-03` — Ketidaksesuaian Kolom `recitation_entries` & `recitation_revisions`
- **Severity**: P2
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql`, `hooks/useSupabaseData.tsx`, `pages/SetoranHarianPage.tsx`, `pages/Operasional/SesiHalaqahPage.tsx`.
- **Penyebab**: Variasi nama kolom (`santri_id` vs `student_id`, `recitation_date` vs `entry_date`, `calculated_pages` vs `pages`, `entry_id` vs `recitation_entry_id`, `before_snapshot` vs `before_json`).
- **Perbaikan yang Diperlukan**: Sediakan kolom alias pada `recitation_entries` dan `recitation_revisions` dengan trigger normalisasi `normalize_recitation_entries_row()` dan `normalize_recitation_revisions_row()`.
- **Test Pembuktian**: Insert ke `recitation_entries` dengan `santri_id` dan `recitation_date`; pastikan `student_id` dan `entry_date` otomatis terisi nilai yang sama.

### `ISS-P2-04` — Pengecekan Client-Side `TELEGRAM_BOT_TOKEN` di `app_settings` Menghambat Notifikasi Server-Side
- **Severity**: P2
- **File & Fungsi**: `pages/SetoranHarianPage.tsx` (baris 1063), `pages/UjianRaport/UjianBulananPage.tsx` (baris 230).
- **Penyebab**: Kode frontend mengecek `const botToken = appSettings.find(s => s.key === 'TELEGRAM_BOT_TOKEN')?.value` sebelum memanggil `sendCustomTelegramMessage`. Setelah token dipindahkan ke `integration_secrets`, `app_settings` tidak lagi mengekspos token mentah.
- **Perbaikan yang Diperlukan**: Hapus pengecekan `botToken` di frontend dan serahkan resolusi token sepenuhnya ke endpoint `/api/notify/telegram`.
- **Test Pembuktian**: Kirim notifikasi Telegram dari `SetoranHarianPage` dan `UjianBulananPage` tanpa `TELEGRAM_BOT_TOKEN` di `app_settings` client; pastikan request tetap terkirim ke `/api/notify/telegram`.

### `ISS-P2-05` — Query `fetchV2EntriesForDate` di `SetoranHarianPage.tsx` Tanpa Filter Tanggal
- **Severity**: P2
- **File & Fungsi**: `pages/SetoranHarianPage.tsx` (`fetchV2EntriesForDate` baris 514).
- **Penyebab**: Query mengambil `.limit(500)` baris terbaru dari `recitation_entries` tanpa `.eq('recitation_date', selectedDate)`.
- **Dampak**: Pada lembaga dengan ribuan setoran, melihat tanggal lampau tidak menemukan entri V2 yang sesuai karena tergeser oleh 500 entri terbaru.
- **Perbaikan yang Diperlukan**: Tambahkan `.eq('recitation_date', selectedDate)` pada `fetchV2EntriesForDate`.
- **Test Pembuktian**: Pilih tanggal setoran lampau di `SetoranHarianPage.tsx`; pastikan query `recitation_entries` memfilter berdasarkan `recitation_date = selectedDate`.

### `ISS-P2-06` — Resolusi Pasangan `setoran_harian` dan `recitation_entries` Belum Memprioritaskan `legacy_setoran_id`
- **Severity**: P2
- **File & Fungsi**: `pages/SetoranHarianPage.tsx` (`resolveV2EntryForRecord` baris 865).
- **Penyebab**: Pencocokan hanya menggunakan `student_id` dan `halaqah_id` tanpa memeriksa `e.legacy_setoran_id === r.id`.
- **Perbaikan yang Diperlukan**: Prioritaskan pencocokan `Number(e.legacy_setoran_id) === Number(r.id)` sebelum fallback ke atribut santri/halaqah/surah.
- **Test Pembuktian**: Ketika seorang santri menyetor dua kali di hari dan halaqah yang sama, pastikan masing-masing baris terhubung ke `recitation_entries` yang tepat.

---

## DAFTAR TEMUAN P3 (LOW)

### `ISS-P3-01` — Konsistensi Route Express (`server.ts`) dan Serverless Functions (`/api/*`)
- **Severity**: P3
- **File & Fungsi**: `server.ts`, `api/*.ts`, `vercel.json`, `netlify.toml`.
- **Penyebab**: Beberapa route di `server.ts` sebelumnya memiliki implementasi inline yang terpisah dari handler di folder `/api/`.
- **Perbaikan yang Diperlukan**: Gunakan handler modular yang sama antara `server.ts` dan `/api/*.ts` agar perilaku di development, Node server, dan serverless identik.
- **Test Pembuktian**: Jalankan `npm run build` (`vite build` + `esbuild server.ts`); pastikan bundle client dan server terkompilasi bersih.

### `ISS-P3-02` — Kompatibilitas Kolom `audit_logs` Antara Skema Awal dan Modul Frontend
- **Severity**: P3
- **File & Fungsi**: `database/supabase_saas_v2_migration.sql` (`public.audit_logs`).
- **Penyebab**: Sebagian halaman menulis `actor_id`/`resource_type`/`resource_id` sementara sebagian lainnya menulis `actor_user_id`/`entity_type`/`entity_id`.
- **Perbaikan yang Diperlukan**: Pastikan tabel `audit_logs` memiliki kedua pasangan kolom tersebut agar seluruh pencatatan audit dari halaman mana pun berhasil.
- **Test Pembuktian**: Insert ke `audit_logs` menggunakan kedua variasi kolom; pastikan tidak ada error kolom tidak ditemukan.

### `ISS-P3-03` — Ketergantungan Import `react-hot-toast` yang Tidak Terdaftar di `package.json`
- **Severity**: P3
- **File & Fungsi**: `pages/AcceptInvitePage.tsx`.
- **Penyebab**: Penggunaan `import toast from 'react-hot-toast'` padahal proyek menggunakan `NotificationStore` internal (`lib/NotificationStore.ts`).
- **Perbaikan yang Diperlukan**: Gunakan `NotificationStore.addNotification(...)` secara konsisten di seluruh halaman.
- **Test Pembuktian**: Jalankan `npm run build` dan `npm run lint`; pastikan tidak ada error resolusi modul.
