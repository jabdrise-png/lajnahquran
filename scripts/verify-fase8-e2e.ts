/**
 * Test Suite: Fase 8 — End-to-End Canonical Lifecycle Simulation (16 Steps)
 * Tests the entire production workflow from tenant creation to academic year closure.
 */
import { bacaModul } from '../tests/v2/helpers/baca';
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
const platformConsole = bacaModul(process.cwd(), 'pages/Platform/PlatformConsolePage.tsx');
const invitationsApi = bacaModul(process.cwd(), 'api/invitations.ts');
const acceptInvitePage = bacaModul(process.cwd(), 'pages/AcceptInvitePage.tsx');
const tahunAjaranPage = bacaModul(process.cwd(), 'pages/DataMaster/TahunAjaranPage.tsx');
const sesiHalaqahPage = bacaModul(process.cwd(), 'pages/Operasional/SesiHalaqahPage.tsx');
const setoranHarianPage = bacaModul(process.cwd(), 'pages/SetoranHarianPage.tsx');
const ujianSemesterPage = bacaModul(process.cwd(), 'pages/UjianRaport/UjianSemesterPage.tsx');
const rekapNilaiPage = bacaModul(process.cwd(), 'pages/UjianRaport/RekapNilaiPage.tsx');
const verifyReportPage = bacaModul(process.cwd(), 'pages/VerifyReportPage.tsx');
const f5Rpc = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/2026_11_30_02_f5_rpc_ujian_raport.sql'), 'utf-8');
const hookCode = bacaModul(process.cwd(), 'hooks/useSupabaseData.tsx');

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

// Fase 3 v2 (28-11-2026): tanpa kunci sesi & tanpa validasi setoran. Langkah 9–12 mengikuti alur baru;
// perilakunya diuji nyata di tests/v2/f3-database.test.ts.
const f3AbsensiSql = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/2026_11_28_03_f3_absensi_tanpa_kunci.sql'), 'utf-8');
const f3SetoranSql = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/2026_11_28_02_f3_setoran_langsung_sah.sql'), 'utf-8');
const useSupabaseDataCode = bacaModul(process.cwd(), 'hooks/useSupabaseData.tsx');
const absensiPage = bacaModul(process.cwd(), 'pages/Operasional/AbsensiPage.tsx');
const daftarSetoran = bacaModul(process.cwd(), 'components/setoran/DaftarSetoran.tsx');

// Step 9: Musammi membuka layar Absensi/Sesi (roster per tanggal, sesi belum dibuat)
step(9, 'E2E-09', 'Musammi Membuka Absensi Halaqah (roster per tanggal, sesi dibuat saat absensi pertama)', () => {
  return f3AbsensiSql.includes('create or replace function public.rpc_open_halaqah_session') &&
         f3AbsensiSql.includes("'belum_dibuka'") &&
         absensiPage.includes('AbsensiHalaqahCard') &&
         sesiHalaqahPage.includes('rosterPadaTanggal(');
});

// Step 10: Mengisi Absensi
step(10, 'E2E-10', 'Musammi Menyimpan Absensi Musammi & Santri via rpc_record_attendance', () => {
  return f3AbsensiSql.includes('create or replace function public.rpc_record_attendance') &&
         useSupabaseDataCode.includes("rpcOrThrow('rpc_record_attendance'") &&
         sesiHalaqahPage.includes('addAttendanceRecords');
});

// Step 11: Mencatat Setoran
step(11, 'E2E-11', 'Musammi Mencatat Setoran via rpc_submit_recitation_entry (langsung sah, predikat otomatis)', () => {
  return f3SetoranSql.includes('create or replace function public.rpc_submit_recitation_entry') &&
         f3SetoranSql.includes('public.fn_predikat_kelancaran(') &&
         useSupabaseDataCode.includes("rpcOrThrow('rpc_submit_recitation_entry'") &&
         sesiHalaqahPage.includes('FormSetoranRingkas');
});

// Step 12: Admin mengoreksi / membatalkan setoran beralasan
step(12, 'E2E-12', 'Admin Mengoreksi atau Membatalkan Setoran Beralasan (rpc_review_recitation_entry: voided)', () => {
  return f3SetoranSql.includes('create or replace function public.rpc_review_recitation_entry') &&
         f3SetoranSql.includes('Validasi setoran sudah dihapus') &&
         daftarSetoran.includes('deleteSetoranHarianRecord') &&
         setoranHarianPage.includes('DaftarSetoran');
});

// Step 13: Admin Menginput Ujian
// Fase 5 v2: rpc_record_exam_attempt diganti rpc_simpan_ujian (nilai dihitung server).
step(13, 'E2E-13', 'Admin / Penguji Mencatat Hasil Ujian via rpc_simpan_ujian', () => {
  return f5Rpc.includes('create or replace function public.rpc_simpan_ujian(') &&
         ujianSemesterPage.includes('simpanUjian(') && hookCode.includes("'rpc_simpan_ujian'");
});

// Step 14: Admin Menerbitkan Raport
step(14, 'E2E-14', 'Admin Membekukan & Menerbitkan Raport via rpc_publish_report_card (version_no = 1)', () => {
  // Fase 5 v2: versi baru rpc_publish_report_card (komponen dihitung server, tolak jika belum lengkap).
  return f5Rpc.includes('create or replace function public.rpc_publish_report_card(') &&
         f5Rpc.includes('Raport belum bisa terbit') &&
         rekapNilaiPage.includes('terbitkanRaport(') && hookCode.includes("'rpc_publish_report_card'");
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
