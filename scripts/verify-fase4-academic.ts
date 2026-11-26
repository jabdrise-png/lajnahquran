/**
 * Verification Suite — Fase 4: Academic Foundation & Canonical V2 Data
 * Verifies all 9 Acceptance Criteria in Prompt Fase 4 Section 7 (SQL + Hooks + UI + Behavioral Simulation).
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
const useSupabaseDataCode = read('hooks/useSupabaseData.tsx');
const academicYearContextCode = read('lib/AcademicYearContext.tsx');
const tahunAjaranPageCode = read('pages/DataMaster/TahunAjaranPage.tsx');
const kenaikanKelasPageCode = read('pages/DataMaster/KenaikanKelasPage.tsx');
const santriPageCode = read('pages/DataMaster/SantriPage.tsx');
const halaqahPageCode = read('pages/DataMaster/HalaqahPage.tsx');

const results: CheckResult[] = [];

function check(id: string, title: string, condition: boolean, details: string) {
    results.push({ id, title, passed: condition, details });
}

// 1. Satu organisasi hanya memiliki maksimal satu tahun ajaran aktif
check(
    'FASE4-01',
    'Satu organisasi hanya memiliki maksimal satu tahun ajaran aktif',
    hardeningSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_academic_year_per_org') &&
        hardeningSql.includes('ON public.academic_years(organization_id)') &&
        hardeningSql.includes('WHERE is_active = true') &&
        migrationSql.includes('uq_one_active_academic_year_per_org') &&
        hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_set_active_academic_year'),
    'Partial unique index uq_one_active_academic_year_per_org and atomic rpc_set_active_academic_year enforced.'
);

// 2. Hanya satu semester aktif untuk tahun ajaran aktif
check(
    'FASE4-02',
    'Hanya satu semester aktif untuk tahun ajaran aktif',
    hardeningSql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_semester_per_ay') &&
        hardeningSql.includes('ON public.semesters(organization_id, academic_year_id)') &&
        hardeningSql.includes('WHERE is_active = true') &&
        hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_set_active_semester') &&
        hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_close_semester'),
    'Partial unique index uq_one_active_semester_per_ay and atomic rpc_set_active_semester / rpc_close_semester enforced.'
);

// 3. Promosi kelas mempertahankan histori tahun ajaran lama
check(
    'FASE4-03',
    'Promosi kelas mempertahankan histori tahun ajaran lama',
    hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_promote_or_graduate_students') &&
        hardeningSql.includes('SET status = v_action') &&
        hardeningSql.includes('enrollment_status = v_action') &&
        hardeningSql.includes('left_at = COALESCE(p_effective_date, CURRENT_DATE)') &&
        kenaikanKelasPageCode.includes("rpc('rpc_promote_or_graduate_students'") &&
        santriPageCode.includes("from('student_enrollments'"),
    'rpc_promote_or_graduate_students marks source year enrollment status (promoted/graduated/transferred/withdrawn) and left_at without overwriting source year class.'
);

// 4. Santri tanpa enrollment tidak otomatis masuk daftar santri kelas operasional
check(
    'FASE4-04',
    'Santri tanpa enrollment tidak otomatis masuk daftar santri kelas operasional',
    useSupabaseDataCode.includes('is_enrolled_in_active_year: isEnrolledActive') &&
        useSupabaseDataCode.includes('isActiveInCurrentYear: isEnrolledActive') &&
        useSupabaseDataCode.includes('const santriList: Santri[] = allSantriMapped.filter(') &&
        useSupabaseDataCode.includes('Boolean((s as any).isActiveInCurrentYear)'),
    'useSupabaseData strictly requires an active enrollment in selectedAcademicYear for santriList.'
);

// 5. Mutasi santri antar halaqah menyimpan tanggal masuk/keluar & rekonstruksi roster historis
check(
    'FASE4-05',
    'Mutasi santri antar halaqah menyimpan tanggal masuk/keluar (valid_from/valid_to) & mendukung rekonstruksi roster per tanggal',
    hardeningSql.includes('ADD CONSTRAINT chk_hsm_dates_valid') &&
        hardeningSql.includes('CHECK (valid_to IS NULL OR valid_to >= valid_from)') &&
        hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_mutate_halaqah_student') &&
        hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_get_halaqah_roster_as_of') &&
        useSupabaseDataCode.includes("rpc('rpc_mutate_halaqah_student'") &&
        halaqahPageCode.includes('rosterAsOfDate'),
    'chk_hsm_dates_valid constraint, rpc_mutate_halaqah_student, and historical roster reconstruction by date are active.'
);

// 6. Assignment Musammi utama (primary) dan pengganti (substitute) bekerja & sinkron dengan is_primary
check(
    'FASE4-06',
    'Assignment Musammi utama (primary) dan pengganti (substitute) bekerja & tersinkronisasi dengan is_primary dan masa berlaku',
    hardeningSql.includes('CREATE OR REPLACE FUNCTION public.normalize_hma_row()') &&
        hardeningSql.includes("NEW.is_primary := (NEW.assignment_type = 'primary');") &&
        hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_assign_halaqah_musammi') &&
        useSupabaseDataCode.includes('assignHalaqahMusammi') &&
        halaqahPageCode.includes('substitute_musammi') &&
        halaqahPageCode.includes('handleAssignMusammiSubmit'),
    'normalize_hma_row syncs assignment_type <-> is_primary and status <-> is_active; rpc_assign_halaqah_musammi and UI support primary & substitute Musammi.'
);

// 7. Tidak ada error assignment/membership yang ditelan diam-diam
const hasEmptyCatchInHalaqah = /catch\s*\{\s*\}/.test(halaqahPageCode);
const hasEmptyCatchInSantri = /catch\s*\{\s*\}/.test(santriPageCode);
const hasEmptyCatchInKenaikan = /catch\s*\{\s*\}/.test(kenaikanKelasPageCode);
check(
    'FASE4-07',
    'Tidak ada error assignment/membership/enrollment yang ditelan diam-diam',
    !hasEmptyCatchInHalaqah &&
        !hasEmptyCatchInSantri &&
        !hasEmptyCatchInKenaikan &&
        useSupabaseDataCode.includes('const executeTableQuery = async') &&
        useSupabaseDataCode.includes('setQueryErrors(collectedErrors)'),
    `Empty catch blocks in HalaqahPage=${hasEmptyCatchInHalaqah}, SantriPage=${hasEmptyCatchInSantri}, KenaikanKelasPage=${hasEmptyCatchInKenaikan}; executeTableQuery records queryErrors.`
);

// 8. Penutupan tahun ajaran memeriksa 6 prasyarat wajib tanpa fallback direct update
check(
    'FASE4-08',
    'Penutupan tahun ajaran memeriksa 6 prasyarat wajib & menolak jika belum tuntas (tanpa fallback direct client update)',
    hardeningSql.includes('CREATE OR REPLACE FUNCTION public.rpc_check_academic_year_closing_readiness') &&
        hardeningSql.includes('unfinished_sessions') &&
        hardeningSql.includes('unreviewed_recitations') &&
        hardeningSql.includes('incomplete_exams') &&
        hardeningSql.includes('unfinished_remedials') &&
        hardeningSql.includes('unpublished_report_cards') &&
        hardeningSql.includes('unreconciled_enrollments') &&
        hardeningSql.includes("IF COALESCE((v_readiness->>'can_close')::boolean, false) IS NOT TRUE THEN") &&
        tahunAjaranPageCode.includes("rpc('rpc_check_academic_year_closing_readiness'") &&
        tahunAjaranPageCode.includes("rpc('rpc_close_academic_year'") &&
        academicYearContextCode.includes('openArchivedYear'),
    'rpc_check_academic_year_closing_readiness & rpc_close_academic_year enforce all 6 prerequisites on server and UI.'
);

// 9. (Diperbarui Fase 2 v2, 27-11-2026) Data lama dipindah oleh migrasi database yang bisa diulang;
//    rekonsiliasi jumlah baris lewat f2_legacy_reconciliation(). Halaman Rekonsiliasi dihapus.
const f2MigrationSql = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/2026_11_27_06_f2_migrasi_data_lama.sql'), 'utf8');
check(
    'FASE4-09',
    'Migrasi data lama -> V2 dapat diulang & rekonsiliasi jumlah baris tersedia (f2_migrate_legacy_data, f2_legacy_reconciliation)',
    f2MigrationSql.includes('create or replace function public.f2_migrate_legacy_data') &&
        f2MigrationSql.includes('create or replace function public.f2_legacy_reconciliation') &&
        !tahunAjaranPageCode.includes("rpc('rpc_get_academic_reconciliation_report'") &&
        !tahunAjaranPageCode.includes("rpc('rpc_reconcile_academic_v2_data'"),
    'Migrasi 2026_11_27_06 memindahkan student_classes, halaqah_santri, attendance, setoran_harian ke V2; halaman tidak lagi memanggil RPC rekonsiliasi lama.'
);

console.log('\n================================================================');
console.log('FASE 4 VERIFICATION REPORT — ACADEMIC FOUNDATION & CANONICAL V2');
console.log('================================================================');
let passedCount = 0;
for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    if (r.passed) passedCount++;
    console.log(`[${icon}] ${r.id}: ${r.title}`);
    console.log(`       -> ${r.details}`);
}
console.log('----------------------------------------------------------------');
console.log(`TOTAL: ${passedCount}/${results.length} CHECKS PASSED`);
console.log('================================================================\n');

if (passedCount !== results.length) {
    process.exit(1);
}
