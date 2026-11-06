# Dokumen Arsitektur Sistem — Lajnah Quran SaaS V2

Dokumen ini menjelaskan rancangan arsitektur teknis, model data kanonikal V2, state machine, mekanisme keamanan multi-tenant, serta strategi transisi dari skema legacy ke skema V2 pada platform Lajnah Quran.

---

## 1. Arsitektur Tingkat Tinggi (System Topology)

Lajnah Quran dirancang sebagai platform SaaS multi-tenant dengan isolasi data tingkat baris (Row-Level Security) yang dipadukan dengan gateway serverless terstandarisasi.

```
+-------------------------------------------------------------------------------+
|                                CLIENT TIER                                    |
|   +--------------------------+  +-------------------+  +-------------------+  |
|   | Platform Superadmin UI   |  | Tenant Admin UI   |  | Musammi Mobile UI |  |
|   | (/platform/*)            |  | (/app/*)          |  | (/app/sessions)   |  |
|   +--------------------------+  +-------------------+  +-------------------+  |
+-------------------------------------------------------------------------------+
                                        | HTTPS / REST / WebSockets
                                        v
+-------------------------------------------------------------------------------+
|                           EDGE & SERVERLESS APIS                              |
|   - Express Server (server.ts) with X-Request-ID and Sanitized Logging        |
|   - Netlify Serverless Functions (netlify/functions/api.ts)                   |
|   - Vercel Serverless Function Endpoints (/api/*.ts)                          |
|   - Dynamic Health Monitor (/api/health)                                      |
+-------------------------------------------------------------------------------+
                                        | Secure Bearer JWT / Service Role
                                        v
+-------------------------------------------------------------------------------+
|                          PERSISTENCE & SECURITY TIER                          |
|   PostgreSQL 15+ (Supabase)                                                   |
|   - 100% RLS Enabled on Canonical V2 Tables                                   |
|   - Authoritative Single Source of Truth: access_grants                       |
|   - RPC Gateway: SECURITY DEFINER with Actor-Verification                     |
|   - Audit Ledger: audit_logs, recitation_revisions, report_card_snapshots     |
+-------------------------------------------------------------------------------+
```

---

## 2. Model Data Kanonikal V2 (Canonical Entities)

Skema V2 menggantikan penyimpanan flat/denormalized legacy dengan struktur relasional yang menjaga integritas historis:

### A. Fondasi Akademik & Master Data
1. **`academic_years`**:
   - Periode akademik tahun ajaran (`start_date`, `end_date`, `is_active`).
   - Dijamin tepat 1 tahun ajaran aktif per organisasi via constraint dan trigger.
2. **`academic_semesters`**:
   - Semester ganjil/genap terkait tahun ajaran tertentu (`is_active`).
3. **`student_enrollments`**:
   - Menghubungkan identitas santri (`santri_id`) dengan rombel/kelas pada tahun ajaran tertentu.
   - Status enrollment (`active`, `promoted`, `graduated`, `transferred`, `withdrawn`). Riwayat kelas santri tidak lagi ditimpa langsung pada kolom `santri.kelas`.
4. **`halaqah_assignments`**:
   - Penugasan staf Musammi (`primary` atau `substitute`) dengan masa berlaku `valid_from` dan `valid_to`.
5. **`halaqah_memberships`**:
   - Keanggotaan santri dalam kelompok halaqah dengan `valid_from` dan `valid_to` sehingga roster historis dapat direkonstruksi akurat per tanggal.

### B. Transaksi Operasional & Setoran
1. **`halaqah_sessions`**:
   - Sesi tatap muka halaqah dengan snapshot roster santri pada saat sesi dibuka.
2. **`attendance_records`**:
   - Presensi santri per sesi (`hadir`, `izin`, `sakit`, `alpa`, `takhassus`).
3. **`recitation_entries`**:
   - Ledger transaksi kanonikal setoran Al-Qur'an (Ziyadah, Sabqi, Manzil).
   - Menyimpan surah awal-akhir, ayat awal-akhir, kesalahan tajwid, kelancaran, skor, status persetujuan, dan nomor revisi (`revision_no`).
4. **`recitation_revisions`**:
   - Catatan snapshot sebelum & sesudah ketika setoran dikembalikan oleh Admin untuk diperbaiki oleh Musammi.

### C. Penilaian & Raport
1. **`exam_attempts`**:
   - Percobaan ujian bulanan atau semester. Setiap attempt remedial mendapatkan nomor attempt terpisah (`attempt_no = 2, 3...`) tanpa menimpa nilai attempt lama.
2. **`rubric_versions`**:
   - Skema bobot dan pemotongan nilai kesalahan hafalan berversi. Perubahan rubrik menghasilkan versi baru agar tidak mengubah penilaian historis.
3. **`report_cards` & `report_card_revisions`**:
   - Snapshot nilai raport resmi terbitan. Diproteksi trigger kekebalan mutasi (`enforce_report_card_immutability`). Setiap koreksi nilai (amendment) menghasilkan nomor versi baru dengan alasan teraudit.

---

## 3. Finite State Machines (State Transisi)

### A. Siklus Sesi Halaqah (`halaqah_sessions`)
```
+-------------+      Buka Sesi       +----------+     Isi Absensi & Setoran    +-------------+
|  scheduled  | -------------------> |   open   | ---------------------------> |  submitted  |
+-------------+                      +----------+                              +-------------+
                                          |                                           |
                                          | Batalkan                                  | Verifikasi Lengkap
                                          v                                           v
                                    +-----------+     Kunci Sesi Selesai       +-------------+
                                    | cancelled | <--------------------------- |  completed  |
                                    +-----------+                              +-------------+
                                                                                      |
                                                                                      | Tutup & Kunci Permanen
                                                                                      v
                                                                               +-------------+
                                                                               |   locked    |
                                                                               +-------------+
```
- Transisi mundur yang dilarang: `locked -> open`, `completed -> draft`, `cancelled -> submitted`.
- Koreksi kehadiran pasca-kunci hanya diizinkan melalui RPC khusus `rpc_correct_locked_session_attendance` dengan alasan minimal 5 karakter dan pencatatan ke `audit_logs`.

### B. Siklus Setoran Hafalan (`recitation_entries`)
```
+-----------+      Submit Setoran      +-------------+        Admin Setuju        +------------+
|   draft   | -----------------------> |  submitted  | -------------------------> |  accepted  |
+-----------+                          +-------------+                            +------------+
                                              |                                          |
                                              | Admin Kembalikan                         | Admin Batalkan
                                              v                                          v
                                       +-------------+                            +------------+
                                       |  returned   |                            |   voided   |
                                       +-------------+                            +------------+
                                              |
                                              | Musammi Perbaiki & Re-submit (revision_no + 1)
                                              v
                                       +-------------+
                                       |  submitted  |
                                       +-------------+
```

---

## 4. Keamanan Multi-Tenant & Otorisasi RBAC

1. **`access_grants` Single Source of Truth**:
   - Kolom `role` dan `status` pada `access_grants` adalah otoritas tertinggi.
   - Status non-aktif (`invited`, `suspended`, `revoked`, `expired`) langsung memutus otorisasi tanpa pernah fallback ke data lama di tabel `profiles`.
2. **Isolasi RLS Komprehensif**:
   - Seluruh tabel kanonikal mengaktifkan RLS dengan predikat `organization_id = public.get_my_org_id()`.
   - RPC `public.is_super_admin()` hanya mengizinkan Superadmin mengakses konsol platform `/platform/*`.
3. **Break-Glass Support Access**:
   - Superadmin tidak dapat langsung mengakses data tenant tanpa sesi support aktif di `support_access_sessions`.
   - Setiap sesi memiliki batasan waktu (maksimal 2 jam), mode (`read_only` vs `read_write`), alasan wajib, dan tercatat di audit log.
4. **Pencegahan Kebocoran Secret**:
   - Tabel `integration_secrets` memblokir akses baca dari browser (`USING (false)`).
   - Akses secret hanya melalui backend server (`/api/integrations`) atau RPC metadata ter-masking (`999••••••XYZ`).
