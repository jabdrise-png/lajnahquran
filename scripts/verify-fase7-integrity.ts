/**
 * Test Suite: Fase 7 — Exam, Gradebook & Report Card Integrity Verification
 * Verifies all 13 criteria from Prompt Fase 7 Section 8.
 */
import fs from 'fs';
import path from 'path';

interface TestCase {
  id: string;
  name: string;
  fn: () => boolean | Promise<boolean>;
}

const tests: TestCase[] = [];

function test(id: string, name: string, fn: () => boolean | Promise<boolean>) {
  tests.push({ id, name, fn });
}

// -----------------------------------------------------------------------------
// Load Files for Verification
// -----------------------------------------------------------------------------
const hardeningSqlPath = path.resolve(process.cwd(), 'database/supabase_v2_1_production_hardening.sql');
const migrationSqlPath = path.resolve(process.cwd(), 'database/supabase_saas_v2_migration.sql');
const ujianSemesterPagePath = path.resolve(process.cwd(), 'pages/UjianRaport/UjianSemesterPage.tsx');
const ujianBulananPagePath = path.resolve(process.cwd(), 'pages/UjianRaport/UjianBulananPage.tsx');
const pengaturanNilaiPagePath = path.resolve(process.cwd(), 'pages/UjianRaport/PengaturanNilaiPage.tsx');
const rekapNilaiPagePath = path.resolve(process.cwd(), 'pages/UjianRaport/RekapNilaiPage.tsx');
const verifyReportPagePath = path.resolve(process.cwd(), 'pages/VerifyReportPage.tsx');

const hardeningSql = fs.readFileSync(hardeningSqlPath, 'utf-8');
const migrationSql = fs.readFileSync(migrationSqlPath, 'utf-8');
const ujianSemesterPage = fs.readFileSync(ujianSemesterPagePath, 'utf-8');
const ujianBulananPage = fs.readFileSync(ujianBulananPagePath, 'utf-8');
const pengaturanNilaiPage = fs.readFileSync(pengaturanNilaiPagePath, 'utf-8');
const rekapNilaiPage = fs.readFileSync(rekapNilaiPagePath, 'utf-8');
const verifyReportPage = fs.readFileSync(verifyReportPagePath, 'utf-8');
// Fase 5 v2 (30-11-2026): exam_attempts = satu sumber nilai ujian (tabel ujian lama diarsipkan),
// nilai & raport dihitung server. Perilaku diuji nyata di tests/v2/f5-database.test.ts.
const f5Rpc = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/2026_11_30_02_f5_rpc_ujian_raport.sql'), 'utf-8');
const f5Migrasi = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/2026_11_30_03_f5_migrasi_ujian_lama.sql'), 'utf-8');
const hookCode = fs.readFileSync(path.resolve(process.cwd(), 'hooks/useSupabaseData.tsx'), 'utf-8');

// -----------------------------------------------------------------------------
// Test Case 1: Ujian Bulanan (exam_attempts + ujian_bulanan sync)
// -----------------------------------------------------------------------------
test('FASE7-01', 'Ujian Bulanan tersimpan di exam_attempts (satu sumber) per ujian bulanan ke-n', () => {
  return f5Rpc.includes('create or replace function public.rpc_simpan_ujian(') &&
         f5Rpc.includes('Pilih ujian bulanan (ke-berapa) pada semester ini.') &&
         f5Migrasi.includes('revoke select, insert, update, delete on public.ujian_bulanan from anon, authenticated;') &&
         ujianBulananPage.includes("jenis: 'bulanan'") && hookCode.includes("rpcUjian('rpc_simpan_ujian'") &&
         !ujianBulananPage.includes('saveUjianBulanan');
});

// -----------------------------------------------------------------------------
// Test Case 2: Ujian Semester (exam_attempts + ujian_semester sync)
// -----------------------------------------------------------------------------
test('FASE7-02', 'Ujian Semester: khoto per juz, nilai dihitung server dari rubrik, tersimpan di exam_attempts', () => {
  return f5Rpc.includes('public.fn_nilai_juz(v_rubric, v_k, v_s)') &&
         f5Rpc.includes("Isi khoto kabir & shoghir minimal untuk satu juz.") &&
         f5Migrasi.includes('revoke select, insert, update, delete on public.ujian_semester from anon, authenticated;') &&
         ujianSemesterPage.includes("jenis: 'semester'");
});

// -----------------------------------------------------------------------------
// Test Case 3: Remedial (attempt bertambah, attempt lama TIDAK DITIMPA)
// -----------------------------------------------------------------------------
test('FASE7-03', 'Remedial = percobaan baru (attempt_no naik), percobaan lama tidak ditimpa; koreksi Admin membatalkan, tidak menghapus', () => {
  return f5Rpc.includes("Remedial hanya untuk santri yang sudah punya nilai.") &&
         f5Rpc.includes("update public.exam_attempts set status = 'voided'") &&
         !f5Rpc.includes('delete from public.exam_attempts') &&
         ujianSemesterPage.includes("buka(s, 'remedial')");
});

// -----------------------------------------------------------------------------
// Test Case 4: Riwayat Attempt Lengkap
// -----------------------------------------------------------------------------
test('FASE7-04', 'Setiap exam attempt memiliki identitas, skor mentah, skor akhir, predikat, evaluator, dan waktu', () => {
  const hasCompleteColumns = hardeningSql.includes('attempt_no, is_remedial, materi_juz, detail_json, raw_score,') &&
                             hardeningSql.includes('final_score, predikat, notes, examiner_id, created_at') &&
                             hardeningSql.includes('v_safe_raw') &&
                             hardeningSql.includes('v_safe_final') &&
                             hardeningSql.includes('auth.uid()');
  return hasCompleteColumns;
});

// -----------------------------------------------------------------------------
// Test Case 5: Perubahan Rubrik (versi baru dibuat jika versi sebelumnya sudah digunakan)
// -----------------------------------------------------------------------------
test('FASE7-05', 'Rubrik penilaian membuat versi baru (version bump) jika versi sebelumnya sudah digunakan ujian/raport', () => {
  const hasUsageCheck = hardeningSql.includes('SELECT 1 FROM public.exam_attempts') &&
                        hardeningSql.includes('SELECT 1 FROM public.report_cards') &&
                        hardeningSql.includes('INTO v_is_used;');
  const hasVersionBump = hardeningSql.includes('IF v_is_used OR v_active_id IS NULL THEN') &&
                         hardeningSql.includes('v_next_version := v_max_version + 1;');
  const hasFrontendCall = pengaturanNilaiPage.includes('rpc_save_rubric_version');
  return hasUsageCheck && hasVersionBump && hasFrontendCall;
});

// -----------------------------------------------------------------------------
// Test Case 6: Perhitungan Nilai (bobot, nilai kosong, konsistensi)
// -----------------------------------------------------------------------------
test('FASE7-06', 'Nilai akhir raport dihitung server: 3 komponen berbobot (total 100%), predikat dari rubrik', () => {
  return f5Rpc.includes('create or replace function public.fn_komponen_raport(') &&
         f5Rpc.includes('v_bs * v_semester.final_score') &&
         f5Rpc.includes('public.fn_predikat_nilai(v_rubric, v_akhir)') &&
         rekapNilaiPage.includes('komponenRaport(') && !rekapNilaiPage.includes('pctSilabus');
});

// -----------------------------------------------------------------------------
// Test Case 7: Publikasi Pertama Raport (version_no = 1, status published)
// -----------------------------------------------------------------------------
test('FASE7-07', 'Publikasi pertama raport menjamin version_no = 1 dan berstatus published', () => {
  const hasVersionOne = hardeningSql.includes('SELECT COALESCE(MAX(version_no), 0)') &&
                        hardeningSql.includes('v_next_version := COALESCE(v_max_version, 0) + 1;');
  const hasStatusPublished = hardeningSql.includes('v_next_version, \'published\', v_safe_score, v_safe_predikat');
  return hasVersionOne && hasStatusPublished;
});

// -----------------------------------------------------------------------------
// Test Case 8: Amendment (version_no bertambah, versi lama jadi amended, alasan >= 5 chars)
// -----------------------------------------------------------------------------
test('FASE7-08', 'Amendment menaikkan version_no secara atomik, menandai raport lama amended, dan memvalidasi alasan min 5 karakter', () => {
  const hasReasonCheck = hardeningSql.includes('IF COALESCE(LENGTH(TRIM(p_amendment_reason)), 0) < 5 THEN') &&
                         hardeningSql.includes('Penerbitan Amendment Raport wajib menyertakan alasan revisi yang jelas (minimal 5 karakter).');
  const hasStatusUpdate = hardeningSql.includes('UPDATE public.report_cards SET status = \'amended\', updated_at = now() WHERE id = v_prev_id;');
  const hasParentLink = hardeningSql.includes('parent_report_card_id, amendment_reason') &&
                        hardeningSql.includes('v_prev_id, NULLIF(TRIM(COALESCE(p_amendment_reason');
  return hasReasonCheck && hasStatusUpdate && hasParentLink;
});

// -----------------------------------------------------------------------------
// Test Case 9: Publikasi Paralel (pg_advisory_xact_lock protection)
// -----------------------------------------------------------------------------
test('FASE7-09', 'Publikasi paralel/bulk diproteksi dengan pg_advisory_xact_lock untuk mencegah race conditions', () => {
  const hasAdvisoryLock = hardeningSql.includes('PERFORM pg_advisory_xact_lock(') &&
                          hardeningSql.includes('p_santri_id::text');
  const hasIdempotencyCheck = hardeningSql.includes('IF v_existing_hash = v_hash AND (p_amendment_reason IS NULL OR TRIM(p_amendment_reason) = \'\') THEN') &&
                              hardeningSql.includes('\'is_duplicate_prevented\', true');
  return hasAdvisoryLock && hasIdempotencyCheck;
});

// -----------------------------------------------------------------------------
// Test Case 10: Perubahan Snapshot Published Ditolak (Trigger Immutability)
// -----------------------------------------------------------------------------
test('FASE7-10', 'Trigger enforce_report_card_immutability menolak mutasi atau penghapusan snapshot terbit', () => {
  const hasDeleteBlock = hardeningSql.includes('IF OLD.status IN (\'published\', \'amended\', \'archived\') THEN') &&
                         hardeningSql.includes('RAISE EXCEPTION \'Snapshot raport yang telah diterbitkan bersifat immutable dan tidak dapat dihapus.\'');
  const hasUpdateBlock = hardeningSql.includes('RAISE EXCEPTION \'Snapshot raport yang telah diterbitkan bersifat immutable. Gunakan fitur Amendment untuk menerbitkan versi revisi baru.\'');
  const hasTriggerBinding = hardeningSql.includes('CREATE TRIGGER trg_enforce_report_card_immutability') &&
                            hardeningSql.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.report_cards');
  return hasDeleteBlock && hasUpdateBlock && hasTriggerBinding;
});

// -----------------------------------------------------------------------------
// Test Case 11: Status Raport Lama Ditangani dengan Benar
// -----------------------------------------------------------------------------
test('FASE7-11', 'Status raport lama (amended/archived) dibedakan dengan jelas dan tidak dilaporkan sebagai dokumen aktif', () => {
  const hasSupersededDetection = hardeningSql.includes('\'is_superseded\', (v_rc.status IN (\'amended\', \'archived\'))') &&
                                 hardeningSql.includes('Versi raport ini telah digantikan (amended) oleh versi revisi yang lebih baru.');
  const hasFrontendWarning = verifyReportPage.includes('verificationResult.is_superseded') &&
                             verifyReportPage.includes('Dokumen Raport Versi v');
  return hasSupersededDetection && hasFrontendWarning;
});

// -----------------------------------------------------------------------------
// Test Case 12: Verifikasi Publik Tidak Membuka Data Sensitif (Masking PII)
// -----------------------------------------------------------------------------
test('FASE7-12', 'Verifikasi publik menyensor nama santri untuk pengguna anonim dan kode verifikasi kriptografis LQ-***', () => {
  const hasMasking = hardeningSql.includes('IF auth.uid() IS NULL AND LENGTH(COALESCE(v_rc.santri_nama, \'\')) > 3 THEN') &&
                     hardeningSql.includes('v_masked_name := SUBSTRING(v_rc.santri_nama FROM 1 FOR 3) || \'***\';');
  const hasCodeFormat = hardeningSql.includes('\'LQ-\' || UPPER(SUBSTRING(NEW.snapshot_hash FROM 1 FOR 6))');
  const hasPublicGrant = hardeningSql.includes('GRANT EXECUTE ON FUNCTION public.rpc_verify_report_card(text) TO anon, authenticated, service_role;');
  return hasMasking && hasCodeFormat && hasPublicGrant;
});

// -----------------------------------------------------------------------------
// Test Case 13: Laporan dan Export Konsisten
// -----------------------------------------------------------------------------
test('FASE7-13', 'Export Excel dan tampilan layar memakai komponen raport yang sama dari server', () => {
  return rekapNilaiPage.includes('const ekspor = () => exportToExcel(baris.map(') &&
         rekapNilaiPage.includes("'Nilai Akhir': k.nilai_akhir") && rekapNilaiPage.includes('Predikat: k.predikat');
});

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('FASE 7 TEST SUITE: EXAM, GRADEBOOK & REPORT CARD INTEGRITY');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const res = await t.fn();
      if (res) {
        console.log(`  [PASSED] ${t.id}: ${t.name}`);
        passed++;
      } else {
        console.error(`  [FAILED] ${t.id}: ${t.name}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  [ERROR]  ${t.id}: ${t.name} -> ${err.message}`);
      failed++;
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: ${tests.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
