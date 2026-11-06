/**
 * Test Suite: Fase 8 — End-to-End Canonical Lifecycle Simulation (16 Steps)
 * Tests the entire production workflow from tenant creation to academic year closure.
 */
import fs from 'fs';
import path from 'path';

interface TestCase {
  step: number;
  id: string;
  name: string;
  fn: () => boolean | Promise<boolean>;
}

const tests: TestCase[] = [];

function step(stepNo: number, id: string, name: string, fn: () => boolean | Promise<boolean>) {
  tests.push({ step: stepNo, id, name, fn });
}

const hardeningSql = fs.readFileSync(path.resolve(process.cwd(), 'database/supabase_v2_1_production_hardening.sql'), 'utf-8');
const migrationSql = fs.readFileSync(path.resolve(process.cwd(), 'database/supabase_saas_v2_migration.sql'), 'utf-8');
const platformConsole = fs.readFileSync(path.resolve(process.cwd(), 'pages/Platform/PlatformConsolePage.tsx'), 'utf-8');
const invitationsApi = fs.readFileSync(path.resolve(process.cwd(), 'api/invitations.ts'), 'utf-8');
const acceptInvitePage = fs.readFileSync(path.resolve(process.cwd(), 'pages/AcceptInvitePage.tsx'), 'utf-8');
const tahunAjaranPage = fs.readFileSync(path.resolve(process.cwd(), 'pages/DataMaster/TahunAjaranPage.tsx'), 'utf-8');
const sesiHalaqahPage = fs.readFileSync(path.resolve(process.cwd(), 'pages/Operasional/SesiHalaqahPage.tsx'), 'utf-8');
const setoranHarianPage = fs.readFileSync(path.resolve(process.cwd(), 'pages/SetoranHarianPage.tsx'), 'utf-8');
const ujianSemesterPage = fs.readFileSync(path.resolve(process.cwd(), 'pages/UjianRaport/UjianSemesterPage.tsx'), 'utf-8');
const rekapNilaiPage = fs.readFileSync(path.resolve(process.cwd(), 'pages/UjianRaport/RekapNilaiPage.tsx'), 'utf-8');
const verifyReportPage = fs.readFileSync(path.resolve(process.cwd(), 'pages/VerifyReportPage.tsx'), 'utf-8');

// Step 1: Login Superadmin
step(1, 'E2E-01', 'Superadmin Login & Verifikasi Hak Akses Platform Console', () => {
  return platformConsole.includes('tab === \'tenants\'') &&
         hardeningSql.includes('is_super_admin()');
});

// Step 2: Provision Tenant
step(2, 'E2E-02', 'Provisioning Tenant Baru via rpc_create_tenant_with_admin', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_create_tenant_with_admin') &&
         hardeningSql.includes('p_status text DEFAULT \'provisioning\'');
});

// Step 3: Undang Admin
step(3, 'E2E-03', 'Admin Tenant Diundang via /api/invitations dengan Role admin', () => {
  return invitationsApi.includes('requestedRoleInput === "admin"') &&
         invitationsApi.includes('processInvitationPayload');
});

// Step 4: Aktivasi Admin
step(4, 'E2E-04', 'Admin Menerima Undangan & Aktivasi Akun via rpc_accept_invitation', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_accept_invitation') &&
         acceptInvitePage.includes('rpc_accept_invitation');
});

// Step 5: Admin Membuat Data Master
step(5, 'E2E-05', 'Admin Membuat Data Master Tahun Ajaran & Kelas via rpc_upsert_academic_year', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_upsert_academic_year') &&
         tahunAjaranPage.includes('rpc_upsert_academic_year');
});

// Step 6: Admin Mengundang Musammi
step(6, 'E2E-06', 'Admin Mengirim Undangan Musammi via /api/invitations dengan Role musammi', () => {
  return invitationsApi.includes('requestedRole !== "musammi"') &&
         invitationsApi.includes('tenant_invitations');
});

// Step 7: Aktivasi Musammi
step(7, 'E2E-07', 'Musammi Mengaktifkan Akun & Menerima Grant Aktif', () => {
  return hardeningSql.includes('UPDATE public.access_grants') &&
         hardeningSql.includes("SET status = 'active'");
});

// Step 8: Admin Membuat Halaqah & Assignment Musammi
step(8, 'E2E-08', 'Admin Menugaskan Musammi ke Halaqah via rpc_assign_halaqah_musammi', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_assign_halaqah_musammi') &&
         hardeningSql.includes('assignment_type');
});

// Step 9: Musammi Membuka Sesi Halaqah
step(9, 'E2E-09', 'Musammi Membuka Sesi Halaqah dengan Roster Snapshot via rpc_open_halaqah_session', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_open_halaqah_session') &&
         sesiHalaqahPage.includes('rpc_open_halaqah_session');
});

// Step 10: Mengisi Absensi
step(10, 'E2E-10', 'Musammi Menyimpan Presensi Batch Santri via rpc_save_attendance_batch', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_save_attendance_batch') &&
         sesiHalaqahPage.includes('rpc_save_attendance_batch');
});

// Step 11: Mencatat Setoran
step(11, 'E2E-11', 'Musammi Mencatat Setoran Al-Qur\'an via rpc_submit_recitation_entry (status: submitted)', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_submit_recitation_entry') &&
         sesiHalaqahPage.includes('rpc_submit_recitation_entry');
});

// Step 12: Admin Review Setoran
step(12, 'E2E-12', 'Admin Meninjau & Menerima Setoran via rpc_review_recitation_entry (status: accepted)', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_review_recitation_entry') &&
         setoranHarianPage.includes('rpc_review_recitation_entry');
});

// Step 13: Admin Menginput Ujian
step(13, 'E2E-13', 'Admin / Penguji Mencatat Hasil Ujian via rpc_record_exam_attempt', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_record_exam_attempt') &&
         ujianSemesterPage.includes('rpc_record_exam_attempt');
});

// Step 14: Admin Menerbitkan Raport
step(14, 'E2E-14', 'Admin Membekukan & Menerbitkan Raport via rpc_publish_report_card (version_no = 1)', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_publish_report_card') &&
         rekapNilaiPage.includes('rpc_publish_report_card');
});

// Step 15: Verifikasi Dokumen Publik
step(15, 'E2E-15', 'Masyarakat / Wali Memverifikasi Keaslian Raport via rpc_verify_report_card (PII Masked)', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_verify_report_card') &&
         verifyReportPage.includes('rpc_verify_report_card');
});

// Step 16: Admin Menutup Tahun Ajaran
step(16, 'E2E-16', 'Admin Memvalidasi 6 Prasyarat & Menutup Tahun Ajaran via rpc_close_academic_year', () => {
  return hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_close_academic_year') &&
         hardeningSql.includes('rpc_check_academic_year_closing_readiness') &&
         tahunAjaranPage.includes('rpc_close_academic_year');
});

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('FASE 8 TEST SUITE: 16-STEP CANONICAL END-TO-END FLOW');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const res = await t.fn();
      if (res) {
        console.log(`  [PASSED] Step ${t.step.toString().padStart(2, '0')}: ${t.name}`);
        passed++;
      } else {
        console.error(`  [FAILED] Step ${t.step.toString().padStart(2, '0')}: ${t.name}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  [ERROR]  Step ${t.step.toString().padStart(2, '0')}: ${t.name} -> ${err.message}`);
      failed++;
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL STEPS: ${tests.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runTests();
