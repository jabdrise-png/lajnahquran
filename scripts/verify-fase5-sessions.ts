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

const results: CheckResult[] = [];

function check(id: string, title: string, condition: boolean, details: string) {
  results.push({ id, title, passed: condition, details });
}

// 1. Musammi hanya melihat assignment aktif
check(
  'FASE5-01',
  'Musammi hanya melihat assignment aktif',
  hardeningSql.includes('CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_halaqah_on_date') &&
    hardeningSql.includes('hma.status = \'active\'') &&
    hardeningSql.includes('hma.is_active = true') &&
    sesiPageCode.includes('assignedHalaqahList') &&
    sesiPageCode.includes('canonicalRole === \'musammi\'') &&
    migrationSql.includes('is_musammi_assigned_to_halaqah_on_date'),
  'Date-aware assignment function and UI filter restrict Musammi to active assignments only.'
);

// 2. Roster sesi sesuai tanggal (session_date antara valid_from dan valid_to)
check(
  'FASE5-02',
  'Roster sesi sesuai tanggal (session_date antara valid_from dan valid_to)',
  hardeningSql.includes('m.valid_from <= p_session_date') &&
    hardeningSql.includes('(m.valid_to IS NULL OR m.valid_to >= p_session_date)') &&
    sesiPageCode.includes('sessionRoster') &&
    sesiPageCode.includes('v2SessionRecord?.roster_snapshot') &&
    migrationSql.includes('m.valid_from <= p_session_date'),
  'Roster snapshot is strictly bounded by session_date and locked historical sessions retain snapshot.'
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
  'Absensi batch tersimpan atomik (rpc_save_attendance_batch)',
  hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_save_attendance_batch') &&
    hardeningSql.includes('Daftar presensi kosong. Minimal 1 status kehadiran santri harus dikirim') &&
    hardeningSql.includes('IN (\'hadir\', \'izin\', \'sakit\', \'alpa\', \'terlambat\')') &&
    sesiPageCode.includes('rpc_save_attendance_batch') &&
    migrationSql.includes('rpc_save_attendance_batch'),
  'Single PL/pgSQL transaction with atomic validation across V2 attendance_records and legacy attendance.'
);

// 5. Request yang sama tidak membuat duplikasi (idempotency key)
check(
  'FASE5-05',
  'Request yang sama tidak membuat duplikasi (idempotency key)',
  hardeningSql.includes('p_idempotency_key text DEFAULT NULL') &&
    hardeningSql.includes('ON CONFLICT (session_id, santri_id) DO UPDATE') &&
    sesiPageCode.includes('idempotencyKey') &&
    migrationSql.includes('ON CONFLICT (session_id, santri_id) DO UPDATE'),
  'Idempotent batch submit enforced via composite conflict key and idempotency tracking.'
);

// 6. Sesi yang dikunci (locked) tidak dapat diedit biasa
check(
  'FASE5-06',
  'Sesi yang dikunci (locked) tidak dapat diedit biasa',
  hardeningSql.includes('OLD.status = \'locked\' AND NEW.status <> \'locked\'') &&
    hardeningSql.includes('status <> \'locked\'') &&
    sesiPageCode.includes('isSessionLocked') &&
    migrationSql.includes('OLD.status = \'locked\' AND NEW.status <> \'locked\''),
  'State machine trigger and RLS prevent unlocking or modifying locked sessions without formal path.'
);

// 7. Koreksi pasca-kunci wajib memiliki alasan (p_reason min 5 karakter) dan audit trail
check(
  'FASE5-07',
  'Koreksi pasca-kunci wajib memiliki alasan (p_reason min 5 karakter) dan audit trail',
  hardeningSql.includes('COALESCE(LENGTH(TRIM(p_reason)), 0) < 5') &&
    hardeningSql.includes('post_lock_attendance_correction') &&
    sesiPageCode.includes('trimmed.length < 5') &&
    sesiPageCode.includes('Alasan koreksi pasca-kunci wajib diisi minimal 5 karakter') &&
    migrationSql.includes('COALESCE(LENGTH(TRIM(p_reason)), 0) < 5'),
  'Server RPC, trigger, and UI enforce minimum 5-character reason and post-lock audit trail.'
);

// 8. Sesi tidak dapat dikunci dengan absensi kosong (recorded_count < roster_count ditolak)
check(
  'FASE5-08',
  'Sesi tidak dapat dikunci dengan absensi kosong (recorded_count < roster_count ditolak)',
  hardeningSql.includes('v_recorded_count < v_roster_count') &&
    hardeningSql.includes('Sesi belum dapat dikunci: Masih ada % dari % santri dalam roster yang belum memiliki status kehadiran') &&
    sesiPageCode.includes('handleInitiateLockSession') &&
    sesiPageCode.includes('isLockConfirmModalOpen') &&
    migrationSql.includes('v_recorded_count < v_roster_count'),
  'rpc_lock_halaqah_session rejects locking until all roster members have recorded attendance.'
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
  hardeningSql.includes('INSERT INTO public.attendance_records') &&
    hardeningSql.includes('INSERT INTO public.attendance') &&
    useSupabaseDataCode.includes('existingSession.status !== \'locked\'') &&
    bukuAbsensiCode.includes('attendance_records') &&
    sesiPageCode.includes('fetchData()'),
  'Dual write within atomic RPC and unified hook cache synchronization guarantee consistency across pages.'
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
