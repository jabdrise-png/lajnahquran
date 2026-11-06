# Panduan Pengujian & QA — Lajnah Quran SaaS

Dokumen ini memuat arsitektur pengujian piramida (Test Pyramid), daftar suite pengujian otomatis, petunjuk eksekusi lokal, dan integrasi Continuous Integration (CI/CD).

---

## 1. Piramida Pengujian (Test Pyramid)

Sistem pengujian Lajnah Quran dirancang berlapis untuk menjamin zero-regression pada seluruh fase pengembangan:

```
                  / \
                 /   \       End-to-End Simulation (16 Steps)
                / E2E \      scripts/verify-fase8-e2e.ts
               /-------\
              /         \     Integration & API Tests (5 Tests)
             /   INTEG   \    scripts/verify-fase8-integration.ts
            /-------------\
           /   DB SECURITY \  Database Security & RLS (6 Tests)
          /     POLICIES    \ scripts/verify-fase8-db-security.ts
         /-------------------\
        /      UNIT TESTS     \ Business Logic, Calculations & Roles (6 Tests)
       /                       \ scripts/verify-fase8-unit.ts
      +-------------------------+
```

---

## 2. Inventaris Suite Pengujian

### A. Pengujian Fase 8 (Rilis Produksi & QA)
| Test Suite File | Fokus Pengujian | Jumlah Test | Status |
|---|---|:---:|:---:|
| `scripts/verify-fase8-unit.ts` | Normalisasi role, kadaluarsa token grant, isolasi rute RBAC, kalkulasi Al-Qur'an 1..114, skala predikat nilai, dan pembobotan gradebook 0..100 | 6 | **100% PASS** |
| `scripts/verify-fase8-integration.ts` | Validasi Bearer auth token pada `/api/invitations`, proteksi secret integrasi `/api/integrations`, dan routing adapter Netlify Functions | 5 | **100% PASS** |
| `scripts/verify-fase8-db-security.ts` | RLS aktif pada 100% tabel V2, fungsi `get_canonical_role()`, pencabutan hak eksekusi anon/PUBLIC, dan trigger immutability report card | 6 | **100% PASS** |
| `scripts/verify-fase8-e2e.ts` | Simulasi 16-step canonical lifecycle dari pembuatan tenant, aktivasi admin, pembukaan sesi, absensi, setoran, ujian, raport, hingga penutupan tahun ajaran | 16 | **100% PASS** |
| `scripts/verify-fase8-production-readiness.ts` | Audit 10 kriteria kesiapan produksi (Security, RLS, Secrets, Observability, WCAG 2.2 AA, CI/CD, dsb.) | 10 | **100% PASS** |

### B. Pengujian Regresi Fase 1–7 (Historical Regressions)
| Fase | File Skrip | Cakupan Verifikasi | Jumlah Test |
|---|---|---|:---:|
| **Fase 1** | `scripts/verify-fase1-security.ts` | Keamanan Role, Otoritas access_grants, RLS Isolation, Break-Glass support | 15 PASS |
| **Fase 2** | `scripts/verify-fase2-lifecycle.ts` | Lifecycle Tenant & Akun, Invitation tokens, Idempotency retry | 12 PASS |
| **Fase 3** | `scripts/verify-fase3-integrations.ts`| Secret Vault, Telegram Webhook HMAC, WhatsApp Fonnte, AI Chatbot Rate Limit | 11 PASS |
| **Fase 4** | `scripts/verify-fase4-academic.ts` | Fondasi Akademik V2, Student Enrollment, Halaqah Assignment, Mutasi Santri | 9 PASS |
| **Fase 5** | `scripts/verify-fase5-sessions.ts` | State Machine Sesi Halaqah, Roster Snapshot, Batch Absensi, Penguncian Sesi | 10 PASS |
| **Fase 6** | `scripts/verify-fase6-recitations.ts`| Recitation Ledger, Review Workflow (Submit/Return/Void), Idempotency Key | 11 PASS |
| **Fase 7** | `scripts/verify-fase7-integrity.ts` | Ujian Bulanan/Semester, Remedial Attempts, Rubrik Nilai, Raport Immutability | 13 PASS |

**Total Akumulasi Seluruh Pengujian**: **123/123 CHECKS PASSED (100% PASS RATE)**.

---

## 3. Cara Menjalankan Pengujian Lokal

### Menjalankan Pengujian Tertentu:
```bash
# Unit tests
npx tsx scripts/verify-fase8-unit.ts

# Integration tests
npx tsx scripts/verify-fase8-integration.ts

# Database security & RLS tests
npx tsx scripts/verify-fase8-db-security.ts

# Canonical 16-step End-to-End simulation
npx tsx scripts/verify-fase8-e2e.ts

# Production readiness audit
npx tsx scripts/verify-fase8-production-readiness.ts
```

### Menjalankan Seluruh Suite Pengujian (Full Sweep):
```bash
npm test
```

---

## 4. Pipeline Continuous Integration (CI/CD)

Pipeline CI dikonfigurasi melalui GitHub Actions pada file `.github/workflows/ci.yml`. Setiap pull request atau push ke branch `main` akan mengeksekusi tahapan berikut:

1. **Setup Environment**: Node.js 20.x dengan caching npm.
2. **Typecheck & Linting**: `npm run lint` & `tsc --noEmit`.
3. **Database Security Audit**: `npx tsx scripts/verify-fase8-db-security.ts`.
4. **Unit & Integration Tests**: `verify-fase8-unit.ts` & `verify-fase8-integration.ts`.
5. **Full Regression Suite**: Verifikasi Fase 1 sampai 7 secara sekuensial.
6. **End-to-End Simulation**: `npx tsx scripts/verify-fase8-e2e.ts`.
7. **Production Readiness Sign-Off**: `npx tsx scripts/verify-fase8-production-readiness.ts`.
8. **Production Build**: `npm run build` untuk memvalidasi output bundling Vite tanpa error.
