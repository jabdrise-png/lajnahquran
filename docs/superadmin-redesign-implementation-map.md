# Peta Implementasi Redesign Superadmin Lajnah Quran (Fase 0 Audit & Blueprint)

**Dokumen Acuan:** Master Prompt — Redesign Superadmin Lajnah Quran (Fase 0 – Fase 8)  
**Target Repository Produksi:** `https://github.com/jabdrise-png/lajnahquran`  
**Status Baseline:** `npm test` (12/12 suite verifikasi LULUS), `npm run build` LULUS, TypeScript check LULUS.

---

## 1. Ringkasan Arsitektur Saat Ini

Aplikasi **Lajnah Quran** menggunakan arsitektur **Single-Page Application (React 19 + TypeScript + Vite + Tailwind CSS v4)** yang terhubung dengan **Supabase (PostgreSQL + Row Level Security + PostgREST RPC + Auth)** serta endpoint serverless `/api/invitations` dan `/api/health`.

### 1.1 Sistem Role & Isolasi Multi-Tenant
- **Tiga Role Kanonikal (`CanonicalRole`)**:
  1. `superadmin` — Pengelola platform global (`organization_id = NULL` pada `access_grants`). Memiliki akses penuh ke rute `/platform/*` dan dapat membuka akses sementara ke rute `/app/*` melalui mekanisme **Break-Glass Support Session** (`SupportSessionStore` + tabel `support_access_sessions`).
  2. `admin` — Pengelola lembaga/ma'had (`organization_id = <uuid>`). Mengelola operasional akademik di dalam satu tenant (`/app/*`).
  3. `musammi` — Pengampu halaqah (`organization_id = <uuid>`). Mengakses modul operasional halaqah yang ditugaskan (`/app/*`).
- **Resolusi Konteks (`resolveTenantContext` di `lib/permissions.ts`)**:
  - Membaca sesi autentikasi Supabase (`supabase.auth.getUser()`), memeriksa `access_grants` aktif sebagai sumber kebenaran otorisasi utama, menyinkronkan `user_profiles` & `profiles`, serta memvalidasi apakah Superadmin sedang menjalankan sesi Break-Glass (`SupportSessionStore.getSession()`).

### 1.2 Pemisahan Layout (`components/layouts/SaaSLayouts.tsx`)
- **`PlatformLayout`**: Membungkus seluruh rute `/platform/*`. Hanya mengizinkan `effectiveRole === 'superadmin'` (pengguna non-superadmin dialihkan otomatis ke `/app/dashboard`).
- **`TenantLayout`**: Membungkus seluruh rute `/app/*`. Mengizinkan `admin` dan `musammi` pada tenant aktif, atau `superadmin` yang memiliki sesi Break-Glass aktif (`isSupportSession === true`).

---

## 2. Inventaris Delapan Halaman Superadmin Produksi

Saat ini seluruh 8 halaman Superadmin telah terdefinisi di dalam router utama (`App.tsx`) dengan pemetaan berikut:

| No | Nama Halaman | Route Kanonikal Produksi | Komponen Produksi Saat Ini | Fungsi Utama |
|---:|---|---|---|---|
| 1 | **Dashboard Platform** | `/platform/dashboard` | `PlatformConsolePage` (`activeTab="dashboard"`) | Ringkasan KPI global (Tenant, Populasi Akademik, Support Session, Kesehatan Skema & API) dan matriks kesiapan onboarding tenant (`setupState`). |
| 2 | **Organisasi & Tenant** | `/platform/tenants` & `/platform/tenants/:tenantId` | `PlatformConsolePage` (`activeTab="tenants"`) | Provisioning tenant baru + undangan Admin pertama, manajemen status siklus hidup (`active`, `trial`, `read_only`, `suspended`, `archived`), perubahan paket, dan tampilan detail tenant (`/platform/tenants/:tenantId`). |
| 3 | **Akun Platform & Grants** | `/platform/accounts` | `PlatformConsolePage` (`activeTab="accounts"`) | Direktori akun lintas tenant & pemilik platform (`superadmin`, `admin`, `musammi`), form undangan akun baru, penangguhan (`suspend`), pengaktifan kembali, dan pencabutan (`revoke`) grant/undangan. |
| 4 | **Paket & Entitlements** | `/platform/plans` | `PlatformConsolePage` (`activeTab="plans"`) | Katalog kuota & fitur 3 paket langganan (`trial`, `standard`, `enterprise`) serta matriks perbandingan pemakaian kuota santri & musammi per lembaga. |
| 5 | **Support Access (Break-Glass)** | `/platform/support-sessions` | `PlatformConsolePage` (`activeTab="support"`) | Pembukaan sesi inspeksi lintas tenant (`read_only` atau `read_write`) dengan alasan wajib dan batas durasi otomatis, indikator sesi aktif, serta pencabutan sesi (`Revoke`). |
| 6 | **Audit & Health Monitor** | `/platform/audit` | `PlatformConsolePage` (`activeTab="audit"`) | Diagnostik real-time latensi PostgREST, kesiapan 5 tabel skema V2, validasi 3-role `access_grants`, endpoint `/api/health`, serta log jejak audit (`audit_logs`) dengan JSON inspector. |
| 7 | **Pengaturan Platform** | `/platform/settings` | `PlatformConsolePage` (`activeTab="settings"`) | Konfigurasi kebijakan global (durasi default support session, mode default support session, paket default tenant baru, zona waktu default, mode registrasi invite-only) dan pintasan ke CMS. |
| 8 | **Landing Page Platform (CMS)** | `/platform/cms` | `WebsiteEditorPage` (`pages/WebsiteEditorPage.tsx`) | Editor konten halaman depan publik & halaman login (`cms_landing_page`) dengan fitur Simpan Draft, Publish Sekarang, dan live preview Desktop/Mobile. |

---

## 3. Peta Screenshot & Referensi Prototype ke Halaman Produksi

Seluruh karakteristik visual dari 8 screenshot referensi dan spesifikasi Figma Make dipetakan ke rute produksi tanpa menyertakan toolbar/chrome editor Figma:

| Halaman | Target Route | Karakteristik Visual & Hierarki dari Screenshot Referensi |
|---|---|---|
| **1. Dashboard Platform** | `/platform/dashboard` | Header judul + aksi cepat (`Segarkan Data`, `Provision Tenant Baru`), 4 kartu KPI utama dengan ikon aksen biru/hijau/indigo, banner status Break-Glass (jika aktif), serta tabel **Tenant Onboarding & Readiness Matrix** dengan indikator checklist (`Tahun Ajaran`, `Admin`, `Musammi`, `Halaqah`), `QuotaBar` penggunaan santri, badge paket, dan tombol `Kelola` / `Support`. |
| **2. Organisasi & Tenant** | `/platform/tenants` & `/platform/tenants/:tenantId` | Filter bar terintegrasi URL (`q`, `status`, `plan`), form/panel provisioning tenant + Admin pertama, banner tautan aktivasi sekali pakai (`salin tautan`), kartu/tabel daftar tenant dengan `StatusBadge`, `QuotaBar`, dropdown ubah status/paket ber-audit (`ConfirmDialog`), dan tampilan **Detail Tenant** (`/platform/tenants/:tenantId`) yang memuat checklist kesiapan, kuota, dan tabel `access_grants` khusus tenant tersebut. |
| **3. Akun Platform & Grants** | `/platform/accounts` | Filter pencarian nama/email + filter role (`all`, `superadmin`, `admin`, `musammi`), panel undang akun baru (`POST /api/invitations`), tabel akun dengan avatar inisial, role badge, afiliasi organisasi, status grant (`active`, `invited`, `suspended`, `revoked`), dan aksi `Suspend`/`Aktifkan`/`Revoke` dengan `ConfirmDialog` wajib alasan. |
| **4. Paket & Entitlements** | `/platform/plans` | 3 kartu tier paket (`Trial`, `Standard`, `Enterprise`) dengan badge jumlah tenant aktif, batas kuota (`Max Santri`, `Max Musammi`, `Max Halaqah`, `Retensi Audit`), daftar fitur, serta tabel komparasi utilisasi kuota real-time per tenant menggunakan `QuotaBar` dan pemilih paket langsung. |
| **5. Support Access** | `/platform/support-sessions` | Banner peringatan keamanan Break-Glass, form inisiasi sesi baru (pilih tenant, mode `read_only`/`read_write`, durasi 15–120 menit, alasan wajib minimal 5 karakter), banner sesi aktif (dengan tombol `Masuk ke Konsol Tenant` & `Akhiri Sesi Sekarang`), serta tabel riwayat sesi (`support_access_sessions`). |
| **6. Audit & Health Monitor** | `/platform/audit` | Panel **System Health Monitor** dengan komponen `HealthRow` untuk 4 probe utama (PostgREST Latency, Skema V2 Core Tables, 3-Role Security Policy, Serverless API `/api/health`), diikuti filter bar log audit (`searchAudit`, `filterAuditRole`) dan tabel `audit_logs` dengan modal/drawer inspeksi payload JSON (`before_state` & `after_state`). |
| **7. Pengaturan Platform** | `/platform/settings` | Kartu kebijakan keamanan & operasional default platform (durasi & mode support session, paket & timezone default, toggle `Switch` Invite-Only Mode) dengan tombol simpan ber-audit, ditambah kartu pintasan menuju CMS Landing Page (`/platform/cms`). |
| **8. Landing Page Platform** | `/platform/cms` | Workspace editor 2-panel (panel kiri: navigasi tab `Tema`, `Hero`, `Fitur`, `Detail`, `Harga`, `Testimoni`, `CTA`, `Halaman Kustom`, `Halaman Login` beserta form editor; panel kanan: live preview interaktif dengan toggle viewport Desktop/Mobile dan tombol `Simpan Draft` & `Publish Sekarang`). |

---

## 4. Peta Komponen Prototype ke Komponen Produksi

| Komponen Design System (Fase 1) | Lokasi Implementasi Produksi | Kegunaan Utama |
|---|---|---|
| `Button`, `IconButton` | `components/ui/SaaSPrimitives.tsx` | Tombol aksi utama (`#1557D5`), sekunder, outline, ghost, danger, dan tombol ikon topbar/tabel. |
| `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `FormField` | `components/ui/SaaSPrimitives.tsx` | Kontrol form terstandarisasi dengan fokus ring `#2563EB` dan validasi aksesibilitas. |
| `Badge`, `StatusBadge` | `components/ui/SaaSPrimitives.tsx` | Pill status semantik (`active`, `trial`, `provisioning`, `provisioning_failed`, `read_only`, `suspended`, `archived`, `invited`, `revoked`, `expired`). |
| `Card`, `StatCard` | `components/ui/SaaSPrimitives.tsx` | Kontainer permukaan putih (`#FFFFFF`) dengan border `#E1E7EF`, radius `14px–16px`, dan kartu metrik KPI. |
| `PageHeader`, `SectionHeading`, `Breadcrumbs`, `PageShell` | `components/ui/SaaSPrimitives.tsx` | Struktur header halaman konsisten, breadcrumb kontekstual, dan pembungkus halaman. |
| `FilterBar`, `useUrlFilterParam` | `components/ui/SaaSPrimitives.tsx` | Bar pencarian & filter yang tersinkronisasi dengan query string URL. |
| `DataTable`, `EmptyState`, `LoadingState`, `ErrorState` | `components/ui/SaaSPrimitives.tsx` | Tabel data enterprise dengan sticky header, state kosong informatif, skeleton loading, dan panel pemulihan error. |
| `Modal`, `ConfirmDialog`, `Drawer` | `components/ui/SaaSPrimitives.tsx` | Dialog konfirmasi ber-audit (mendukung `role="dialog"`, `aria-modal="true"`, tombol `Escape`, dan input alasan wajib) serta panel samping untuk inspeksi detail. |
| `ProgressBar`, `QuotaBar`, `HealthRow` | `components/ui/SaaSPrimitives.tsx` | Visualisasi persentase utilisasi kuota tenant (`santri`/`musammi`) dan baris status diagnostik kesehatan sistem. |
| `PlatformLayout` (Sidebar + Topbar Superadmin) | `components/layouts/SaaSLayouts.tsx`, `components/Sidebar.tsx`, `components/Header.tsx` | App Shell khusus Superadmin dengan palet biru-putih (`#F3F6FB` canvas, `#1557D5` active state), sidebar collapsible + mobile drawer, serta topbar dengan pencarian cepat (`⌘K`). |

---

## 5. Peta Data Source, Tabel Supabase, RPC, dan Endpoint API

Seluruh aksi Superadmin wajib mempertahankan integrasi ke sumber data produksi berikut (tanpa menggunakan mock reducer):

| Modul / Fitur | Tabel Supabase | Fungsi RPC / Endpoint Server | Audit Log Action |
|---|---|---|---|
| **Ringkasan & Matriks Tenant** | `organizations`, `profiles`, `santri`, `musammi`, `halaqah`, `academic_years`, `access_grants` | Query paralel `supabase.from(...)` | - |
| **Provisioning Tenant & Admin Pertama** | `organizations`, `tenant_invitations`, `access_grants` | RPC `rpc_create_tenant_with_admin`, `POST /api/invitations`, RPC `rpc_mark_tenant_provisioning_status` (saat gagal) | `tenant.provisioned`, `invitation.created` |
| **Perubahan Status Lifecycle Tenant** | `organizations`, `audit_logs` | Update `organizations.status` + insert `audit_logs` | `tenant.status_changed.<status>` |
| **Perubahan Paket Langganan Tenant** | `organizations`, `audit_logs` | Update `organizations.plan_id` + insert `audit_logs` | `tenant.plan_changed.<plan_id>` |
| **Undangan Akun Platform / Tenant** | `profiles`, `user_profiles`, `access_grants`, `tenant_invitations` | `POST /api/invitations` (dengan header `Authorization: Bearer <token>`) | `account.invited.<role>` |
| **Suspend / Aktifkan / Revoke Akun** | `access_grants`, `tenant_invitations`, `profiles`, `audit_logs` | RPC `rpc_manage_access_grant`, RPC `rpc_revoke_invitation` | `account.status_changed.<status>`, `account.access_revoked` |
| **Break-Glass Support Session** | `support_access_sessions`, `audit_logs` | RPC `rpc_start_support_session`, RPC `rpc_end_support_session`, `SupportSessionStore` | `support_session.started`, `support_session.revoked` |
| **System Health & Audit Trail** | `audit_logs`, `user_profiles`, `access_grants`, `semesters`, `student_enrollments`, `attendance_records`, `recitation_entries` | `runHealthDiagnostics()`, `GET /api/health` | - |
| **Pengaturan Platform Global** | `app_settings`, `audit_logs` | Upsert `app_settings` / localStorage fallback + insert `audit_logs` | `platform.settings.updated` |
| **CMS Landing Page & Login** | `cms_landing_page` | `useLandingPageContent()` (`updateDraftConfig`, `publishConfig`) | - |

---

## 6. Peta Permission & Guard Keamanan

1. **Guard Level Router (`PlatformLayout` di `components/layouts/SaaSLayouts.tsx`)**:
   - Memeriksa `effectiveRole === 'superadmin'` (atau `userRole === 'super_admin'`).
   - Jika pengguna adalah `admin` atau `musammi`, mereka langsung di-redirect ke `/app/dashboard`.
2. **Guard Level Komponen (`PlatformConsolePage.tsx` & `WebsiteEditorPage.tsx`)**:
   - Memeriksa `normalizeRole(userRole) !== 'superadmin'`; menampilkan layar **Akses Ditolak (403 Forbidden)** jika bukan Superadmin.
3. **Guard Mutasi Sensitif (`ConfirmDialog`)**:
   - Perubahan lifecycle tenant (`suspended`, `archived`, `read_only`), perubahan paket tenant, penangguhan/pencabutan akun, dan pembukaan sesi Break-Glass wajib meminta alasan (`reason`) dan mencatat `actor_id`, `actor_role: 'superadmin'`, `before_state`, serta `after_state` ke tabel `audit_logs`.
4. **Isolasi Mode Support (`TenantContextBar`)**:
   - Saat Superadmin masuk ke `/app/*` melalui mode Support Session, `TenantLayout` menampilkan banner merah/amber `MODE SUPPORT SUPERADMIN` beserta tombol `Keluar dari Tenant` yang memanggil `SupportSessionStore.clearSession()` dan mengembalikan Superadmin ke `/platform/support-sessions`.

---

## 7. Risiko Integrasi & Mitigasi

| No | Risiko Integrasi | Dampak | Strategi Mitigasi |
|---:|---|---|---|
| 1 | Perubahan komponen UI (`SaaSPrimitives.tsx`) merusak halaman operasional Tenant (`Admin`/`Musammi`). | Regresi tampilan atau error kompilasi pada halaman `/app/*`. | Mempertahankan seluruh nama export dan signature props yang sudah dipakai oleh halaman `/app/*` (`PageShell`, `PageHeader`, `StatCard`, `StatusBadge`, `FilterBar`, `EmptyState`, `ConfirmDialog`, `TenantContextBar`, `Breadcrumbs`, `FormField`, `useUrlFilterParam`), sambil menambahkan primitif baru Fase 1 secara komplementer. |
| 2 | Kegagalan pengujian otomatis (`scripts/verify-fase*.ts`) akibat perubahan struktur kode. | `npm test` gagal pada CI/CD. | Memastikan invariant yang diperiksa skrip verifikasi tetap terjaga: `tab === 'tenants'` di `PlatformConsolePage.tsx` (`verify-fase8-e2e.ts`), serta `role="dialog"`, `aria-modal="true"`, dan `e.key === 'Escape'` di `SaaSPrimitives.tsx` (`verify-fase8-production-readiness.ts`). |
| 3 | Kebocoran state lokal prototype menggantikan RPC produksi. | Perubahan tidak tersimpan di Supabase atau melanggar alur undangan aman. | Semua tombol aksi di 8 halaman Superadmin tetap memanggil handler produksi (`handleProvisionTenant`, `handleUpdateTenantLifecycle`, `handleInvitePlatformOrTenantAccount`, `handleStartSupportSession`, dll.). |
| 4 | Perubahan Sidebar/Header Superadmin mengubah tampilan Sidebar/Header Tenant. | Tema hijau zamrud (`emerald`) milik tenant berubah tanpa sengaja. | Memisahkan cabang rendering tema & struktur di `Sidebar.tsx`, `Header.tsx`, dan `PlatformLayout` khusus ketika `isSuperAdmin` / berada di rute `/platform/*`, sehingga tampilan `TenantLayout` (`Admin` & `Musammi`) tetap 100% utuh. |

---

## 8. Daftar File yang Akan Diubah / Ditambahkan

1. `docs/superadmin-redesign-implementation-map.md` *(Baru — Dokumen peta implementasi Fase 0)*
2. `index.css` *(Penambahan CSS custom properties / design tokens `--sa-*` untuk palet biru-putih Superadmin dan dukungan `prefers-reduced-motion`)*
3. `components/ui/SaaSPrimitives.tsx` *(Ekspansi design system Fase 1: `Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Badge`, `StatusBadge`, `Card`, `StatCard`, `PageHeader`, `SectionHeading`, `FilterBar`, `DataTable`, `EmptyState`, `Modal`, `ConfirmDialog`, `Drawer`, `ProgressBar`, `QuotaBar`, `HealthRow`, `LoadingState`, `ErrorState`)*
4. `components/layouts/SaaSLayouts.tsx` *(Peningkatan `PlatformLayout` dengan canvas `#F3F6FB` dan isolasi shell Superadmin)*
5. `components/Sidebar.tsx` *(Redesign penuh Sidebar Superadmin sesuai palet biru-putih `#1557D5` / `#E7F0FF`, 8 menu kanonikal, mode collapsed desktop, dan mobile drawer tanpa menyentuh cabang Sidebar Tenant)*
6. `components/Header.tsx` *(Redesign Topbar Superadmin dengan breadcrumb kontekstual, pencarian cepat `⌘K`, notifikasi, profil Superadmin, dan indikator sesi Support tanpa mengubah Topbar Tenant)*
7. `pages/Platform/PlatformConsolePage.tsx` *(Integrasi komponen design system baru Fase 1–7 seperti `QuotaBar`, `HealthRow`, `Drawer`, `Card`, `Button`, dan penyempurnaan visual biru-putih pada 7 halaman konsol platform)*
8. `pages/WebsiteEditorPage.tsx` *(Penyelarasan header & shell editor CMS dengan palet Superadmin biru-putih pada Fase 8)*

---

## 9. Usulan Struktur Komponen Superadmin

```text
components/
├── layouts/
│   └── SaaSLayouts.tsx          # PlatformLayout (Superadmin Shell) vs TenantLayout (Tenant Shell)
├── ui/
│   └── SaaSPrimitives.tsx       # Design System Tokens & 24 Reusable Enterprise UI Primitives
├── Sidebar.tsx                  # Dedicated Superadmin Blue-White Sidebar + Tenant Sidebar
└── Header.tsx                   # Dedicated Superadmin Topbar (⌘K Search, Breadcrumb, Profile) + Tenant Header
pages/
├── Platform/
│   └── PlatformConsolePage.tsx  # 7 Modul Inti Superadmin (Dashboard, Tenants, Accounts, Plans, Support, Audit, Settings)
└── WebsiteEditorPage.tsx        # Modul ke-8 Superadmin: CMS Landing Page & Login Editor (/platform/cms)
```

---

## 10. Urutan Implementasi Bertahap (Fase 1 – Fase 8)

- **Fase 0 — Audit dan Persiapan Redesign Superadmin**: Audit menyeluruh codebase produksi, pemetaan 8 rute & RPC, dan pembuatan dokumen peta implementasi ini.
- **Fase 1 — Design System dan Superadmin App Shell**: Implementasi token warna biru-putih (`#1557D5`, `#2563EB`, `#E7F0FF`, `#F3F6FB`, `#FFFFFF`, `#101828`, `#667085`, `#E1E7EF`), 24 komponen UI primitif reusable di `SaaSPrimitives.tsx`, serta App Shell Superadmin (`PlatformLayout`, `Sidebar`, `Header`) yang responsif dan terisolasi dari tenant.
- **Fase 2 — Halaman Dashboard Platform (`/platform/dashboard`)**: Kartu KPI utama, banner status Break-Glass, dan matriks kesiapan onboarding tenant dengan `QuotaBar` & aksi cepat.
- **Fase 3 — Halaman Organisasi & Tenant (`/platform/tenants` & `/platform/tenants/:tenantId`)**: Filter bar URL-synced, panel provisioning tenant + Admin pertama, banner tautan undangan, manajemen lifecycle & paket ber-audit, dan halaman detail tenant.
- **Fase 4 — Halaman Akun Platform & Grants (`/platform/accounts`)**: Direktori akun lintas tenant, filter role, form undangan akun baru, dan manajemen status grant (`Suspend`/`Aktifkan`/`Revoke`).
- **Fase 5 — Halaman Paket & Entitlements (`/platform/plans`)**: Katalog 3 paket langganan (`Trial`, `Standard`, `Enterprise`) dan tabel komparasi utilisasi kuota real-time.
- **Fase 6 — Halaman Support Access (`/platform/support-sessions`)**: Form pembukaan sesi Break-Glass ber-alasan wajib, kontrol sesi aktif, dan tabel riwayat sesi.
- **Fase 7 — Halaman Audit & Health Monitor (`/platform/audit`)**: Diagnostik 4 probe kesehatan sistem dengan `HealthRow`, tabel log audit, dan modal/drawer inspeksi payload JSON.
- **Fase 8 — Halaman Pengaturan Platform (`/platform/settings`) & CMS Landing Page (`/platform/cms`)**: Form kebijakan global platform dan penyelarasan visual workspace CMS Landing Page.

---

## 11. Baseline Hasil Build dan Test Saat Ini

Sebelum perubahan Fase 1 dimulai, seluruh baseline kualitas pada repository telah diverifikasi:
- **Unit & Integration Verification (`npm test`)**: **LULUS 100%** (12 dari 12 suite verifikasi Fase 1 s.d. Fase 8 lulus tanpa error).
- **Production Build (`npm run build`)**: **LULUS**.
- **TypeScript & Linter (`npm run lint`)**: **LULUS (0 error)**.
