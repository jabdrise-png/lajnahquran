# FASE 0 — SYSTEM & DATA DEPENDENCY MAP (`DEPENDENCY_MAP.md`)

Dokumen ini memetakan hubungan end-to-end antara **Frontend (React/TypeScript)**, **Serverless/Backend API (`/api/*` & `server.ts`)**, **RPC / Trigger PostgreSQL**, dan **Tabel Database (Kanonikal V2 & Kompatibilitas Legacy)** untuk 10 alur kritis aplikasi **Lajnah Quran**.

---

## 1. Authentication → Profile → Access Grant

```
[Supabase Auth (auth.users)]
   │ (Trigger: on_auth_user_created -> handle_new_user())
   ▼
[public.user_profiles] ◄──(Trigger: trg_normalize_user_profiles)
   │
   ├──► [public.access_grants] (status: invited | active | suspended | revoked, role: superadmin | admin | musammi)
   │       ▲ (RLS: access_grants_select, access_grants_manage)
   │       │ (RPC Aktivasi: rpc_accept_invitation(p_organization_id))
   └──► [public.profiles (Legacy Compatibility)] ◄──(Trigger: trg_prevent_profile_escalation & trg_sync_profile_to_v2_grants)
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/Login.tsx`, `pages/AcceptInvitePage.tsx`, `App.tsx`, `hooks/useSupabaseData.tsx`, `lib/permissions.ts`, `pages/Users.tsx`, `pages/Platform/PlatformConsolePage.tsx` |
| **Backend API** | `api/invitations.ts`, `api/invite-user.ts`, `server.ts` (`POST /api/invitations`) |
| **Database Trigger & RPC** | `public.handle_new_user()`, `public.normalize_user_profiles_row()`, `public.prevent_profile_privilege_escalation()`, `public.sync_profile_to_v2_grants()`, `public.rpc_accept_invitation(uuid)` |
| **Tabel & RLS** | `auth.users`, `public.user_profiles`, `public.access_grants`, `public.profiles` |

---

## 2. Organization → Tenant Context

```
[Login Session / JWT]
   │
   ├──► Normal User (admin / musammi):
   │      access_grants (status = 'active' AND organization_id = profile.organization_id)
   │
   └──► Superadmin Break-Glass:
          SupportSessionStore + DB verification on public.support_access_sessions
          (expires_at > now() AND ended_at IS NULL)
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `App.tsx`, `components/layouts/SaaSLayouts.tsx` (`PlatformShell`, `TenantShell`), `hooks/useSupabaseData.tsx` (`getOrgId()`), `lib/AcademicYearContext.tsx` |
| **Backend API** | Validasi `callerOrgId` dan `matchingGrant` di `api/invitations.ts`, `api/integrations.ts`, `api/notify/telegram.ts`, `api/notify/whatsapp.ts`, `api/telegram-webhook/register.ts` |
| **Database Helper** | `public.get_my_org_id()`, `public.get_role_for_org(uuid)`, `public.is_admin_of_org(uuid)`, `public.has_active_support_session(uuid, boolean)` |
| **Tabel & RLS** | `public.organizations`, `public.access_grants`, `public.support_access_sessions` |

---

## 3. Santri → Enrollment → Kelas (Per Tahun Ajaran)

```
[public.academic_years] ──(1:N)──► [public.semesters]
   │ (RPC: rpc_set_active_academic_year / rpc_close_academic_year)
   ▼
[public.santri] ──(1:N per Tahun Ajaran)──► [public.student_enrollments] (status <-> enrollment_status)
                                                   │
                                                   └──► [public.student_classes] & [public.class_groups / marhalah_levels]
                                                        (+ atribut administratif: public.wali_kelas & public.musyrif)
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `lib/AcademicYearContext.tsx`, `pages/DataMaster/TahunAjaranPage.tsx`, `pages/DataMaster/SantriPage.tsx`, `pages/DataMaster/KenaikanKelasPage.tsx`, `pages/DataMaster/WaliKelasPage.tsx`, `pages/DataMaster/MusyrifDataPage.tsx`, `hooks/useSupabaseData.tsx` |
| **Database Trigger & RPC** | `public.rpc_set_active_academic_year(bigint, text)`, `public.rpc_close_academic_year(bigint)`, `public.normalize_student_enrollments_row()` |
| **Tabel & Index** | `public.academic_years`, `public.semesters`, `public.santri`, `public.student_enrollments` (`idx_student_enrollments_org_year_student_uniq`), `public.student_classes`, `public.marhalah_levels`, `public.class_groups`, `public.wali_kelas`, `public.musyrif` |

---

## 4. Halaqah → Membership → Assignment Musammi

```
[public.halaqah]
   ├──(Penugasan Musammi)──► [public.halaqah_musammi_assignments] (assignment_type <-> is_primary) ◄── [public.musammi / musammi_staff]
   ├──(Anggota Santri)─────► [public.halaqah_student_memberships] + [public.halaqah_santri] ◄── [public.santri]
   └──(Jadwal Sesi)────────► [public.halaqah_schedules]
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/DataMaster/HalaqahPage.tsx`, `pages/DataMaster/MusammiPage.tsx`, `hooks/useSupabaseData.tsx` |
| **Database Trigger & Helper** | `public.normalize_hma_row()`, `public.is_halaqah_musammi(uuid, bigint)`, `public.is_musammi_assigned_to_halaqah(uuid, bigint)` |
| **Tabel & Index** | `public.halaqah`, `public.musammi`, `public.musammi_staff`, `public.halaqah_musammi_assignments` (`idx_hma_org_halaqah_musammi_uniq`), `public.halaqah_student_memberships`, `public.halaqah_santri`, `public.halaqah_schedules` |

---

## 5. Halaqah → Session → Attendance

```
[Musammi / Admin membuka sesi]
   │
   ▼
rpc_open_halaqah_session(p_halaqah_id, p_session_date, p_session_slot)
   ├──► Membuat/membuka baris di [public.halaqah_sessions] (status = 'open')
   └──► Membekukan roster sesi ke [public.attendance_records] (status awal = 'unmarked')
          │
          ▼
rpc_save_attendance_batch(p_session_id, p_records, p_idempotency_key, p_reason)
   ├──► Validasi santri wajib anggota roster sesi + idempotency key + alasan jika sesi locked
   ├──► Update [public.attendance_records]
   └──► Sync atomik ke [public.attendance] (kompatibilitas buku absensi & analitik)
          │
          ▼
rpc_lock_halaqah_session(p_halaqah_id, p_session_date, p_session_slot, p_reason)
   └──► Validasi server: COUNT(status = 'unmarked') == 0 ──► Set status = 'locked' + tulis [public.audit_logs]
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/Operasional/SesiHalaqahPage.tsx`, `pages/Attendance.tsx`, `pages/BukuAbsensiPage.tsx`, `pages/AttendanceBook.tsx`, `hooks/useSupabaseData.tsx` |
| **Database RPC & RLS** | `public.rpc_open_halaqah_session`, `public.rpc_save_attendance_batch`, `public.rpc_lock_halaqah_session`, policy `halaqah_sessions_role_*`, `attendance_records_role_*` |
| **Tabel** | `public.halaqah_sessions`, `public.attendance_records`, `public.attendance`, `public.audit_logs` |

---

## 6. Session → Recitation Entry → Revision

```
[Input Setoran Harian (Ziyadah / Sabqi / Manzil)]
   │
   ▼
[public.setoran_harian] ◄──(legacy_setoran_id)──► [public.recitation_entries]
                                                     │
   ┌─────────────────────────────────────────────────┴──────────────────────────────────────────┐
   ▼ (Mutasi Entri Non-Draft)                                                                   ▼ (Review Admin)
Trigger: trg_audit_recitation_entry_mutation()                                 RPC: rpc_review_recitation_entry(id, status, reason)
   └──► Increment revision_no & INSERT [public.recitation_revisions]              └──► Update status (accepted|returned|voided) +
                                                                                       INSERT [public.recitation_revisions] & [public.audit_logs]
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/Operasional/SesiHalaqahPage.tsx`, `pages/SetoranHarianPage.tsx`, `components/QuranHafalanInput.tsx`, `hooks/useSupabaseData.tsx`, `lib/quranUtils.ts` |
| **Database Trigger & RPC** | `public.normalize_recitation_entries_row()`, `public.trg_audit_recitation_entry_mutation()`, `public.normalize_recitation_revisions_row()`, `public.rpc_review_recitation_entry(uuid, text, text)` |
| **Tabel** | `public.recitation_entries`, `public.recitation_revisions`, `public.setoran_harian`, `public.audit_logs` |

---

## 7. Exam → Exam Attempt → Gradebook

```
[Konfigurasi Target & Rubrik Berversi]
   ├──► [public.target_plans] & [public.target_hafalan]
   └──► [public.rubric_versions] & [public.app_settings]
          │
          ▼
[Pelaksanaan Ujian Bulanan & Semester]
   ├──► [public.ujian_bulanan] & [public.ujian_semester] (nilai aktif terkini)
   └──► [public.exam_attempts] (histori Attempt #1, Attempt #2 Remedial, dst. + detail_json)
          │
          ▼
[Gradebook / Buku Nilai Terpadu (RekapNilaiPage.tsx)]
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/PengaturanEvaluasiPage.tsx`, `pages/UjianRaport/PengaturanNilaiPage.tsx`, `pages/UjianRaport/UjianBulananPage.tsx`, `pages/UjianRaport/UjianSemesterPage.tsx`, `pages/UjianRaport/RekapNilaiPage.tsx` |
| **Tabel** | `public.target_plans`, `public.rubric_versions`, `public.ujian_bulanan_periode`, `public.ujian_bulanan`, `public.ujian_semester`, `public.exam_attempts`, `public.audit_logs` |

---

## 8. Gradebook → Report Snapshot → Public Verification

```
[RekapNilaiPage.tsx: Terbitkan Raport / Amendment]
   │
   ▼
rpc_publish_report_card(p_org_id, p_year_id, p_semester, p_santri_id, p_final_score, p_predikat, p_snapshot_json, p_reason)
   ├──► pg_advisory_xact_lock (mencegah race condition versi)
   ├──► Arsipkan versi 'published' sebelumnya menjadi 'amended'
   ├──► Hitung versi baru: COALESCE(MAX(version_no), 0) + 1
   └──► INSERT [public.report_cards] (status = 'published', verification_code = 'LQ-...')
          │ (Dilindungi oleh Trigger: trg_enforce_report_card_immutability)
          ▼
[Publik / QR Scanner mengakses /verify/:code (VerifyReportPage.tsx)]
   └──► rpc_verify_report_card(p_verification_code)
          └──► Mengembalikan valid = (status = 'published'), is_superseded, & NIS ter-masking untuk anon
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/UjianRaport/RekapNilaiPage.tsx`, `components/RaportDocument.tsx`, `pages/Akademik/AuditLembagaPage.tsx`, `pages/VerifyReportPage.tsx` |
| **Database Trigger & RPC** | `public.rpc_publish_report_card(...)`, `public.enforce_report_card_immutability()`, `public.rpc_verify_report_card(text)` |
| **Tabel & Index** | `public.report_cards` (`idx_report_cards_org_year_sem_santri_ver_uniq`, `idx_report_cards_one_published_uniq`, `idx_report_cards_verification_code_uniq`) |

---

## 9. Tenant → Integration Secret → Notification API & Webhook

```
[Admin Lembaga: SettingsPage.tsx]
   │ (Bearer JWT)
   ▼
[POST /api/integrations] ──(service_role)──► [public.integration_secrets] (REVOKE ALL dari anon/authenticated)
   │
   ├──► [POST /api/telegram-webhook/register] ──► Set Webhook Telegram (?org_id=<uuid> + secret_token)
   │                                                    │
   │                                                    ▼
   │                                          [POST /api/telegram-webhook]
   │                                             ├── Validasi x-telegram-bot-api-secret-token
   │                                             └── rpc_link_telegram_chat_id(p_identifier, p_chat_id, p_org_id)
   │
   └──► [POST /api/notify/telegram & /api/notify/whatsapp]
          ├── Validasi JWT & keanggotaan organisasi pengirim
          ├── Validasi penerima (chatId / nomor HP milik santri/musammi organisasi tersebut)
          └── Kirim via Telegram Bot API / Fonnte API menggunakan token dari integration_secrets
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/SettingsPage.tsx`, `lib/telegram.ts`, `lib/whatsapp.ts`, `pages/SetoranHarianPage.tsx`, `pages/UjianRaport/UjianBulananPage.tsx`, `pages/BukuAbsensiPage.tsx` |
| **Backend API** | `api/integrations.ts`, `api/telegram-webhook/register.ts`, `api/telegram-webhook.ts`, `api/notify/telegram.ts`, `api/notify/whatsapp.ts`, `server.ts` |
| **Database RPC & RLS** | `public.integration_secrets` (`integration_secrets_no_direct_client`), `public.rpc_link_telegram_chat_id(text, text, uuid)` |

---

## 10. Superadmin → Support Session → Tenant Access (Break-Glass)

```
[Superadmin di /platform/support-sessions (PlatformConsolePage.tsx)]
   │
   ▼
rpc_start_support_session(p_organization_id, p_reason, p_mode, p_duration_minutes)
   ├──► INSERT [public.support_access_sessions] + INSERT [public.audit_logs]
   └──► Simpan metadata sesi di SupportSessionStore (sessionStorage)
          │
          ├──► Setiap muat halaman (App.tsx): verifikasi sesi ke DB (ended_at IS NULL AND expires_at > now())
          ├──► Setiap query DB: RLS memeriksa public.has_active_support_session(organization_id, require_write)
          └──► Akhiri sesi: rpc_end_support_session(p_session_id) ──► Jika sukses (true), bersihkan SupportSessionStore
```

| Lapisan | File / Objek yang Bertanggung Jawab |
|---|---|
| **Frontend** | `pages/Platform/PlatformConsolePage.tsx`, `lib/permissions.ts` (`SupportSessionStore`), `components/layouts/SaaSLayouts.tsx` (Banner Break-Glass), `App.tsx` |
| **Database RPC & Helper** | `public.rpc_start_support_session`, `public.rpc_end_support_session`, `public.has_active_support_session`, `public.get_my_org_id`, `public.is_admin_of_org` |
| **Tabel** | `public.support_access_sessions`, `public.audit_logs` |
