# Lajnah Quran — Multi-Tenant Tahfidz Management SaaS Platform

Sistem Manajemen Tahfidz Al-Qur'an Multi-Tenant berbasis cloud yang dirancang untuk pondok pesantren, madrasah, dan lembaga tahfidz Al-Qur'an. Sistem ini menyediakan isolasi data yang ketat antar lembaga (multi-tenant), model hak akses berbasis peran (RBAC), siklus sesi halaqah presisi, pencatatan setoran hafalan (recitation ledger), penilaian terstandarisasi, dan penerbitan raport digital dengan verifikasi publik anti-pemalsuan.

---

## 1. Gambaran Umum Sistem

Lajnah Quran mengelola seluruh alur akademik dan operasional tahfidz:
- **Platform Superadmin**: Konsol pengawasan kesehatan tenant, provisioning lembaga baru, paket kuota, dan audit log sesi bantuan teknis (Break-Glass Support Access).
- **Admin Lembaga**: Pengelolaan tahun ajaran, struktur marhalah & kelas, kelompok halaqah, data santri, staf Musammi, rubrik penilaian, buku nilai, dan penerbitan raport resmi.
- **Musammi Workspace**: Alur operasional harian yang ringkas dan fokus: Pilih Halaqah → Pilih Tanggal/Waktu → Buka Sesi → Isi Absensi Santri → Catat Setoran Hafalan (Ziyadah/Sabqi/Manzil) → Selesaikan dan Kunci Sesi.
- **Verifikasi Publik Dokumen**: QR code dan kode kriptografis `LQ-***` untuk verifikasi keaslian raport oleh wali santri dengan penyensoran data pribadi (PII masking).

---

## 2. Arsitektur Sistem

Aplikasi dibangun menggunakan arsitektur modern yang memisahkan frontend reaktif, serverless/server API, dan basis data PostgreSQL:
- **Frontend**: React 18 SPA, Vite, Tailwind CSS, Heroicons / Lucide.
- **Backend / API**: Node.js, Express (`server.ts`), Netlify Functions (`netlify/functions/api.ts`), Vercel Serverless (`/api/*`).
- **Database & Security**: PostgreSQL / Supabase, Row Level Security (RLS) aktif 100% pada tabel kanonikal V2, Trigger State Machine, dan RPC `SECURITY DEFINER` dengan verifikasi aktor server-side.
- **Integrasi**: Bot Notifikasi Telegram Webhook aman (HMAC/Secret verification), WhatsApp Gateway (Fonnte API dengan deduplikasi idempotency), dan AI Chatbot Terpandu (Gemini API server-side).

```
+---------------------------------------------------------------------------------+
|                                 CLIENT BROWSERS                                 |
|   Platform Console (/platform/*)   |   Tenant App (/app/*)   |   Verify (/v/*)  |
+---------------------------------------------------------------------------------+
                                       | HTTPS (Bearer JWT / Requests)
                                       v
+---------------------------------------------------------------------------------+
|                          EDGE & REVERSE PROXY LAYER                             |
|          Vercel Serverless Functions  /  Netlify Functions  /  Express          |
|      - X-Request-ID Correlation ID                                              |
|      - Sanitized HTTP Logging (Sensor Password/Token)                            |
|      - /api/health (DB Connection Probe & Latency Check)                        |
|      - Server-Side Secret Storage (integration_secrets, AES/Vault)              |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                               DATABASE ENGINE                                   |
|                          PostgreSQL + Supabase RLS                              |
|   - access_grants (Single Source of Truth untuk Role & Membership)              |
|   - recitation_entries (Kanonikal Ledger Setoran & Murajaah)                    |
|   - halaqah_sessions & attendance_records (Finite State Machine)                 |
|   - exam_attempts & report_cards (Raport Immutability Trigger)                  |
+---------------------------------------------------------------------------------+
```

---

## 3. Model Peran (3 Canonical Roles)

Sistem memberlakukan **3 Role Kanonikal** yang tegas. `access_grants` adalah satu-satunya sumber otoritatif hak akses:

| Role Kanonikal | Lingkup Hak Akses | Fitur Utama |
|---|---|---|
| **`superadmin`** | Platform Global (`/platform/*`) | Provisioning tenant baru, monitoring kesehatan infrastruktur, paket langganan, dan sesi bantuan teknis (Break-Glass Support) dengan alasan wajib & audit trail. |
| **`admin`** | Tenant Lembaga (`/app/*`) | Pengaturan lembaga, tahun ajaran, kelas, pendaftaran santri, penugasan musammi, review setoran, ujian semester, dan penerbitan raport. |
| **`musammi`** | Halaqah Operasional (`/app/sessions`, `/app/recitations`, `/app/attendance`) | Pembukaan sesi halaqah aktif, presensi santri roster, input setoran harian (ziyadah/sabqi/manzil), dan penguncian sesi. |

*Catatan Keamanan: Wali Kelas dan Musyrif adalah penanggung jawab administratif (atribut santri/kelas), BUKAN akun login dengan privilege mandiri.*

---

## 4. Panduan Quickstart

### Prasyarat
- Node.js versi 18 atau lebih baru.
- npm versi 9 atau lebih baru.

### Langkah Instalasi
```bash
# 1. Clone repository
git clone https://github.com/jabdrise-png/lajnahquran.git
cd lajnahquran

# 2. Salin environment configuration
cp .env.example .env

# 3. Sesuaikan isi .env (SUPABASE_URL, SUPABASE_ANON_KEY, dsb.)

# 4. Jalankan development server
npm run dev
```

Aplikasi dapat diakses pada browser di: `http://localhost:3000`

---

## 5. Daftar Perintah Penting

| Perintah | Deskripsi |
|---|---|
| `npm run dev` | Menjalankan Express dev server terpadu dengan Vite middleware di port 3000 |
| `npm run build` | Menjalankan kompilasi TypeScript dan bundler Vite untuk produksi |
| `npm run lint` | Menjalankan linter ESLint untuk mendeteksi error sintaksis dan import |
| `npx tsx scripts/verify-fase8-unit.ts` | Menjalankan 6 unit test logika bisnis, role, rute, dan kalkulasi |
| `npx tsx scripts/verify-fase8-integration.ts` | Menjalankan 5 integration test API, auth bearer, dan routing adapter |
| `npx tsx scripts/verify-fase8-db-security.ts` | Menjalankan 6 test keamanan database, RLS, dan pencabutan hak anon |
| `npx tsx scripts/verify-fase8-e2e.ts` | Menjalankan simulasi 16-step canonical End-to-End flow lengkap |
| `npx tsx scripts/verify-fase8-production-readiness.ts` | Menjalankan audit checklist kesiapan produksi (10 kriteria) |
| `npm test` | Menjalankan seluruh test suite verifikasi regresi (Fase 1 sampai Fase 8) |

---

## 6. Dokumentasi Lengkap

Untuk panduan mendalam, silakan baca dokumentasi teknis di folder `docs/`:
- [Arsitektur Sistem (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- [Matriks Hak Akses & Peran (docs/ROLE_PERMISSION_MATRIX.md)](docs/ROLE_PERMISSION_MATRIX.md)
- [Panduan Deployment Vercel & Netlify (docs/DEPLOYMENT_GUIDE.md)](docs/DEPLOYMENT_GUIDE.md)
- [Manual Operasional Lembaga & Superadmin (docs/OPERATIONAL_MANUAL.md)](docs/OPERATIONAL_MANUAL.md)
- [Panduan Pengujian & QA (docs/TESTING_GUIDE.md)](docs/TESTING_GUIDE.md)
- [Checklist Kesiapan Produksi (docs/PRODUCTION_CHECKLIST.md)](docs/PRODUCTION_CHECKLIST.md)
