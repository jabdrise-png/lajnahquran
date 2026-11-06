# FASE 0 — QUALITY & TEST BASELINE (`TEST_BASELINE.md`)

Dokumen ini mencatat kondisi baseline kualitas kode, hasil pemeriksaan tipe statis (`tsc --noEmit`), hasil build produksi (`vite build` + `esbuild server.ts`), serta matriks verifikasi fungsional sebelum dan sesudah rangkaian perbaikan Fase 1–8.

---

## 1. Perintah Pemeriksaan Kualitas yang Tersedia di Repository

Berdasarkan `package.json`:
- **Install Dependency**: `npm install` (menggunakan `package-lock.json` yang tersedia di repository, tanpa mengubah versi paket).
- **Type Check / Lint**: `npm run lint` -> menjalankan `tsc --noEmit` menggunakan TypeScript `~5.8.2`.
- **Production Build**: `npm run build` -> menjalankan `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`.
- **Automated Test Runner**: Belum terdapat framework unit test terpisah (seperti Vitest/Jest) di `package.json` awal; sesuai instruksi Fase 0 Bagian 4 (*"Jangan mengubah dependency hanya agar test lulus"*), verifikasi dilakukan melalui `tsc --noEmit`, `vite build`, `esbuild`, serta skenario kontrak RPC/API/RLS terstruktur.

---

## 2. Catatan Error Baseline yang Ditemukan Sebelum Penyelesaian Perbaikan

Saat pemeriksaan menyeluruh dilakukan terhadap kode transisi V2 sebelum seluruh patch diselesaikan, ditemukan error kompilasi/tipe dan bug logika berikut:

1. **TypeScript / Build Error pada `pages/AcceptInvitePage.tsx`**:
   - Import modul `react-hot-toast` yang tidak ada di `package.json` menyebabkan `vite build` gagal pada tahap Rollup resolve (`[vite]: Rollup failed to resolve import "react-hot-toast"`).
   - Pemanggilan `supabase.rpc('rpc_accept_invitation', ...)` tanpa penyesuaian tipe RPC menyebabkan `TS2345` & `TS2339`.
2. **TypeScript Error pada `App.tsx`**:
   - Pemanggilan `SupportSessionStore.getActiveSession()` pada baris 128 memicu `TS2339: Property 'getActiveSession' does not exist` karena metode pada `SupportSessionStore` bernama `getSession()`.
3. **TypeScript Error pada `pages/DataMaster/TahunAjaranPage.tsx`**:
   - Referensi variabel `academicYears` pada `handleSetActive` memicu `TS2552: Cannot find name 'academicYears'` karena state lokal bernama `localAcademicYears`.
4. **Runtime Async Bug pada `pages/UjianRaport/UjianSemesterPage.tsx`**:
   - Pemanggilan `const orgId = getOrgId();` tanpa `await` pada `fetchExamAttempts` (baris 78) dan `handleSaveModal` (baris 240) menyebabkan `orgId` bernilai `Promise<string>`, yang menggagalkan filter dan insert tabel `exam_attempts`.
5. **Runtime SQL Bug pada `database/supabase_saas_v2_migration.sql`**:
   - Pada `rpc_publish_report_card`, ekspresi `v_next_version := v_existing.version_no + 1` menghasilkan `NULL` saat santri belum memiliki raport sebelumnya.

---

## 3. Hasil Eksekusi Baseline Setelah Sinkronisasi Perbaikan

### A. Type Check (`npm run lint` / `tsc --noEmit`)
```text
$ tsc --noEmit
Linting completed successfully (Exit code: 0, 0 errors)
```

### B. Production Build (`npm run build` / `compile_applet`)
```text
$ vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs
vite v6.4.1 building for production...
✓ 2105 modules transformed.
Build succeeded - the applet is compiled (Exit code: 0)
```

---

## 4. Matriks Verifikasi & Regression Test per Fase (Fase 1 s/d Fase 8)

| Fase | ID Temuan Terkait | Skenario Verifikasi / Test | Hasil yang Diharapkan |
|---|---|---|---|
| **Fase 1** | `ISS-P0-01`, `ISS-P0-02`, `ISS-P0-03`, `ISS-P0-05`, `ISS-P1-01` | 1. Non-superadmin mencoba mengubah `user_profiles.is_superadmin = true`.<br>2. Admin mencoba membuat grant `admin` di `access_grants`.<br>3. Update `profiles` pada user yang grant-nya `suspended`.<br>4. Manipulasi `sessionStorage` untuk Support Access tanpa baris aktif di `support_access_sessions`. | 1. Ditolak oleh trigger `normalize_user_profiles_row()`.<br>2. Ditolak oleh RLS `access_grants_manage` & API `/api/invitations` (`403`).<br>3. Status grant tetap `suspended`.<br>4. `App.tsx` membatalkan sesi lokal yang tidak valid di DB. |
| **Fase 2** | `ISS-P0-08`, `ISS-P1-02`, `ISS-P3-03` | 1. Admin mengundang Musammi baru via `/api/invitations`.<br>2. User yang diundang membuka `/invite` (baik saat sudah login maupun belum) dan mengganti password.<br>3. Coba gunakan password `'Mahad123!'`. | 1. Akun dibuat dengan status grant `'invited'` dan temporary password kriptografis.<br>2. `PublicLayout` tidak me-redirect `/invite`; `rpc_accept_invitation` mengubah grant menjadi `'active'`.<br>3. Password `'Mahad123!'` ditolak. |
| **Fase 3** | `ISS-P0-04`, `ISS-P0-06`, `ISS-P0-09`, `ISS-P1-03`, `ISS-P2-04` | 1. Client `authenticated` melakukan `SELECT` ke `integration_secrets`.<br>2. Webhook Telegram dipanggil tanpa `x-telegram-bot-api-secret-token` yang cocok.<br>3. `/api/notify/telegram` dipanggil dengan `chatId` milik tenant lain.<br>4. `/api/chat` dipanggil tanpa Bearer token. | 1. Ditolak oleh privilege & RLS.<br>2. Ditolak dengan `HTTP 401`.<br>3. Ditolak dengan `HTTP 403`.<br>4. Ditolak dengan `HTTP 401`. |
| **Fase 4** | `ISS-P1-04`, `ISS-P2-01`, `ISS-P2-02` | 1. Aktifkan Tahun Ajaran via `rpc_set_active_academic_year`.<br>2. Tutup Tahun Ajaran via `rpc_close_academic_year`.<br>3. Upsert `student_enrollments` dan `halaqah_musammi_assignments`. | 1. Hanya 1 tahun ajaran & 1 semester yang aktif.<br>2. Sesi terbuka dikunci otomatis, tidak ada fallback direct update jika RPC gagal.<br>3. Kolom `status`/`enrollment_status` dan `assignment_type`/`is_primary` tersinkronisasi otomatis. |
| **Fase 5** | `ISS-P1-05` | 1. Buka sesi halaqah via `rpc_open_halaqah_session`.<br>2. Simpan absensi santri via `rpc_save_attendance_batch`.<br>3. Kunci sesi via `rpc_lock_halaqah_session` saat masih ada santri `unmarked`. | 1. Roster sesi terbentuk dari membership V2 & legacy.<br>2. `attendance_records` dan `attendance` tersinkronisasi di server.<br>3. Penguncian ditolak oleh server hingga seluruh santri memiliki status kehadiran. |
| **Fase 6** | `ISS-P1-06`, `ISS-P2-03`, `ISS-P2-05`, `ISS-P2-06` | 1. Input setoran baru dan ubah setoran yang sudah `submitted`.<br>2. Admin melakukan review (`accepted`/`returned`/`voided`) via `rpc_review_recitation_entry`.<br>3. Pilih tanggal lampau di `SetoranHarianPage`. | 1. Trigger `trg_audit_recitation_entry_mutation` menaikkan `revision_no` dan mengisi `recitation_revisions`.<br>2. Status berubah secara atomik disertai audit log.<br>3. Query `recitation_entries` terfilter pada `recitation_date = selectedDate`. |
| **Fase 7** | `ISS-P0-07`, `ISS-P1-07`, `ISS-P1-08`, `ISS-P1-09` | 1. Simpan nilai Ujian Semester & Remedial di `UjianSemesterPage`.<br>2. Terbitkan raport perdana dan terbitkan amendment via `rpc_publish_report_card`.<br>3. Verifikasi kode QR publik di `/verify/:code`. | 1. `exam_attempts` mencatat Attempt #1 dan Attempt #2 dengan `organization_id` valid.<br>2. Raport perdana mendapat `version_no = 1`; saat amendment, versi 1 menjadi `amended` dan versi 2 menjadi `published`.<br>3. Hanya versi `published` yang `valid = true`, dan NIS disamarkan bagi publik anonim. |
| **Fase 8** | `ISS-P3-01`, `ISS-P3-02` | Jalankan `compile_applet` dan `lint_applet` pada seluruh codebase. | Build client & server sukses 100%, `tsc --noEmit` menghasilkan 0 error. |
