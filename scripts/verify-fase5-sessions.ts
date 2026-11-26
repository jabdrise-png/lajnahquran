/**
 * Verification Suite — Fase 5: Halaqah Session & Attendance State Machine
 * Verifies all 10 Acceptance Criteria in Prompt Fase 5 Section 8.
 */
import fs from 'fs';
import path from 'path';

interface CheckResult {
  id: string;
  title: string;
  passed: boolean;
  details: string;
}

const rootDir = process.cwd();
const read = (relPath: string) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

const hardeningSql = read('database/supabase_v2_1_production_hardening.sql');
const migrationSql = read('database/supabase_saas_v2_migration.sql');
const sesiPageCode = read('pages/Operasional/SesiHalaqahPage.tsx');
const useSupabaseDataCode = read('hooks/useSupabaseData.tsx');
const bukuAbsensiCode = read('pages/BukuAbsensiPage.tsx');
// Fase 3 v2 (28-11-2026): kunci sesi & simpan-batch lama dihapus; absensi lewat rpc_record_attendance
// (koreksi tanggal lampau = Admin + alasan). Perilaku diuji nyata di tests/v2/f3-database.test.ts.
const f3AbsensiSql = read('database/migrations/2026_11_28_03_f3_absensi_tanpa_kunci.sql');
const f3SetoranSql = read('database/migrations/2026_11_28_02_f3_setoran_langsung_sah.sql');
const absensiPageCode = read('pages/Operasional/AbsensiPage.tsx');
const absensiCardCode = read('components/absensi/AbsensiHalaqahCard.tsx');
const sesiLibCode = read('lib/sesiHalaqah.ts');

const results: CheckResult[] = [];

function check(id: string, title: string, condition: boolean, details: string) {
  results.push({ id, title, passed: condition, details });
}

// 1. Musammi hanya melihat assignment aktif
check(
  'FASE5-01',
  'Musammi hanya melihat assignment aktif',
  hardeningSql.includes('CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_halaqah_on_date') &&
    f3SetoranSql.includes('create or replace function public.fn_bisa_mencatat') &&
    f3AbsensiSql.includes('Akses ditolak: Anda tidak ditugaskan pada halaqah ini.') &&
    sesiLibCode.includes('export function halaqahSaya') &&
    sesiLibCode.includes("opts.role !== 'musammi'") &&
    absensiPageCode.includes('halaqahSaya(') && sesiPageCode.includes('halaqahSaya('),
  'Server (fn_bisa_mencatat: penugasan aktif atau badal pada tanggal itu) dan layar (halaqahSaya) membatasi Musammi ke halaqahnya.'
);

// 2. Roster sesi sesuai tanggal (session_date antara valid_from dan valid_to)
check(
  'FASE5-02',
  'Roster sesi sesuai tanggal (session_date antara valid_from dan valid_to)',
  hardeningSql.includes('m.valid_from <= p_session_date') &&
    hardeningSql.includes('(m.valid_to IS NULL OR m.valid_to >= p_session_date)') &&
    f3AbsensiSql.includes('fn_session_roster') &&
    sesiLibCode.includes('export function rosterPadaTanggal') &&
    absensiCardCode.includes('rosterPadaTanggal(') && sesiPageCode.includes('rosterPadaTanggal('),
  'Roster mengikuti riwayat keanggotaan pada tanggal sesi, di server maupun layar.'
);

// 3. Santri di luar roster ditolak saat pencatatan presensi
check(
  'FASE5-03',
  'Santri di luar roster ditolak saat pencatatan presensi',
  hardeningSql.includes('Santri ID % tidak termasuk dalam roster halaqah pada sesi ini') &&
    hardeningSql.includes('fn_validate_attendance_record()') &&
    hardeningSql.includes('trg_validate_attendance_record') &&
    migrationSql.includes('Santri ID % tidak termasuk dalam roster halaqah pada sesi ini') &&
    migrationSql.includes('trg_validate_attendance_record'),
  'Both RPC rpc_save_attendance_batch and trigger trg_validate_attendance_record reject non-roster students.'
);

// 4. Absensi batch tersimpan atomik (rpc_save_attendance_batch)
check(
  'FASE5-04',
  'Absensi tersimpan atomik dalam satu panggilan (rpc_record_attendance)',
  f3AbsensiSql.includes('create or replace function public.rpc_record_attendance(p_records jsonb, p_reason text default null)') &&
    f3AbsensiSql.includes('drop function if exists public.rpc_save_attendance_batch') &&
    f3AbsensiSql.includes('Daftar absensi kosong.') &&
    useSupabaseDataCode.includes("rpcOrThrow('rpc_record_attendance'") &&
    !sesiPageCode.includes('rpc_save_attendance_batch'),
  'Satu fungsi PL/pgSQL per kiriman (gagal satu = batal semua); simpan-batch lama dihapus.'
);

// 5. Request yang sama tidak membuat duplikasi (idempotency key)
check(
  'FASE5-05',
  'Request yang sama tidak membuat duplikasi',
  f3AbsensiSql.includes('on conflict (session_id, santri_id) do update') &&
    f3AbsensiSql.includes('on conflict (session_id, musammi_id) do update') &&
    f3AbsensiSql.includes('unchanged_count'),
  'Kunci unik (sesi, santri) / (sesi, musammi); kiriman ulang tanpa perubahan dilewati (unchanged_count).'
);

// 6. Sesi yang dikunci (locked) tidak dapat diedit biasa
check(
  'FASE5-06',
  'Tidak ada kunci sesi: absensi hari ini bebas diperbarui, tanggal lampau = koreksi',
  f3AbsensiSql.includes("drop function if exists public.rpc_lock_halaqah_session") &&
    f3AbsensiSql.includes('create or replace function public.fn_assert_can_correct') &&
    f3AbsensiSql.includes('sudah lewat. Koreksi dilakukan oleh Admin.') &&
    !sesiPageCode.includes('isSessionLocked') && !absensiCardCode.includes('locked'),
  'Fase 3: status locked dihapus; perubahan tanggal lampau hanya oleh Admin.'
);

// 7. Koreksi pasca-kunci wajib memiliki alasan (p_reason min 5 karakter) dan audit trail
check(
  'FASE5-07',
  'Koreksi absensi tanggal lampau wajib alasan (min 5 karakter) dan audit trail',
  f3AbsensiSql.includes('wajib menyertakan alasan yang jelas (minimal 5 karakter)') &&
    f3AbsensiSql.includes('correct_attendance') &&
    absensiCardCode.includes('AlasanDialog') &&
    bukuAbsensiCode.includes('correctionTarget.reason.trim()'),
  'Server menolak koreksi tanpa alasan; layar meminta alasan; Audit Log dicatat server.'
);

// 8. Sesi tidak dapat dikunci dengan absensi kosong (recorded_count < roster_count ditolak)
check(
  'FASE5-08',
  'Sesi tercatat otomatis saat absensi pertama disimpan (tanpa sesi kosong)',
  f3AbsensiSql.includes("'belum_dibuka'") &&
    f3AbsensiSql.includes('create or replace function public.rpc_open_halaqah_session') &&
    !sesiPageCode.includes('handleInitiateLockSession'),
  'Membuka layar sesi tidak membuat baris sesi; sesi dibuat oleh rpc_record_attendance.'
);

// 9. Direct table write Musammi tidak dapat melewati aturan / state machine (trg_validate_session_state_machine & RLS)
check(
  'FASE5-09',
  'Direct table write Musammi tidak dapat melewati aturan / state machine (trg_validate_session_state_machine & RLS)',
  hardeningSql.includes('trg_validate_session_state_machine') &&
    hardeningSql.includes('BEFORE UPDATE ON public.halaqah_sessions') &&
    hardeningSql.includes('halaqah_sessions_role_update') &&
    hardeningSql.includes('attendance_records_role_insert') &&
    migrationSql.includes('trg_validate_session_state_machine'),
  'Database BEFORE triggers and RLS policies prevent direct write bypasses.'
);

// 10. Data absensi konsisten di halaman input, buku absensi, dan laporan terpadu
check(
  'FASE5-10',
  'Data absensi konsisten di halaman input, buku absensi, dan laporan terpadu',
  f3AbsensiSql.includes('create or replace function public.rpc_record_attendance') &&
    useSupabaseDataCode.includes("rpc_record_attendance") &&
    !useSupabaseDataCode.includes("from('attendance')") &&
    bukuAbsensiCode.includes('addAttendanceRecords') &&
    absensiPageCode.includes('addAttendanceRecords') && sesiPageCode.includes('addAttendanceRecords'),
  'Satu sumber data V2 dan satu jalur tulis (rpc_record_attendance) untuk semua halaman.'
);

// Summary Output
console.log('\n======================================================');
console.log('   FASE 5 VERIFICATION SUITE — HALAQAH SESSIONS & ATTENDANCE');
console.log('======================================================\n');

let passCount = 0;
for (const r of results) {
  const icon = r.passed ? '✅ PASS' : '❌ FAIL';
  if (r.passed) passCount++;
  console.log(`${icon} [${r.id}] ${r.title}`);
  console.log(`   ${r.details}\n`);
}

console.log('------------------------------------------------------');
console.log(`Total Passed: ${passCount} / ${results.length}`);
console.log('======================================================\n');

if (passCount !== results.length) {
  process.exit(1);
} else {
  process.exit(0);
}
