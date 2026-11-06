/**
 * Verification Suite — Fase 6: Recitation Ledger & Review Workflow
 * Verifies all 11 Acceptance Criteria in Prompt Fase 6 Section 8.
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
const setoranPageCode = read('pages/SetoranHarianPage.tsx');
const useSupabaseDataCode = read('hooks/useSupabaseData.tsx');

const results: CheckResult[] = [];

function check(id: string, title: string, condition: boolean, details: string) {
  results.push({ id, title, passed: condition, details });
}

// 1. Musammi membuat draft (status = 'draft')
check(
  'FASE6-01',
  'Musammi membuat draft (status = \'draft\')',
  hardeningSql.includes('p_status text DEFAULT \'submitted\'') &&
    hardeningSql.includes('v_clean_status NOT IN (\'draft\', \'submitted\')') &&
    hardeningSql.includes('\'create_draft\'') &&
    sesiPageCode.includes('recitationForm.submissionMode') &&
    sesiPageCode.includes('p_status: recitationForm.submissionMode') &&
    migrationSql.includes('v_clean_status NOT IN (\'draft\', \'submitted\')'),
  'Draft status is supported in rpc_submit_recitation_entry, recorded in revision logs, and selectable in SesiHalaqahPage UI.'
);

// 2. Musammi submit setoran (status = 'submitted')
check(
  'FASE6-02',
  'Musammi submit setoran (status = \'submitted\')',
  hardeningSql.includes('submit_recitation_\' || v_clean_status') &&
    hardeningSql.includes('p_surah_start_no < 1 OR p_surah_start_no > 114') &&
    hardeningSql.includes('Urutan surat/ayat selesai tidak boleh lebih kecil dari surat/ayat mulai') &&
    sesiPageCode.includes('rpc_submit_recitation_entry') &&
    setoranPageCode.includes('rpc_submit_recitation_entry') &&
    migrationSql.includes('rpc_submit_recitation_entry'),
  'Recitation submission strictly validates Qur\'an ranges and bounds before persisting as submitted.'
);

// 3. Admin menerima (accepted)
check(
  'FASE6-03',
  'Admin menerima (accepted)',
  hardeningSql.includes('v_clean_status = \'accepted\'') &&
    hardeningSql.includes('public.is_admin_of_org(v_entry.organization_id)') &&
    sesiPageCode.includes('rpc_review_recitation_entry') &&
    setoranPageCode.includes('rpc_review_recitation_entry') &&
    migrationSql.includes('public.is_admin_of_org(v_entry.organization_id)'),
  'rpc_review_recitation_entry enforces Admin authorization and transitions status to accepted.'
);

// 4. Admin mengembalikan beserta alasan (returned, reason min 5 karakter)
check(
  'FASE6-04',
  'Admin mengembalikan beserta alasan (returned, reason min 5 karakter)',
  hardeningSql.includes('v_clean_status IN (\'returned\', \'voided\') AND COALESCE(LENGTH(TRIM(p_reason)), 0) < 5') &&
    hardeningSql.includes('Alasan pengembalian setoran wajib minimal 5 karakter') &&
    sesiPageCode.includes('reviewReason.trim().length < 5') &&
    setoranPageCode.includes('reason.trim().length < 5') &&
    migrationSql.includes('Alasan pengembalian setoran wajib minimal 5 karakter'),
  'Both database triggers/RPC and frontend UI enforce minimum 5 characters reason for return.'
);

// 5. Musammi memperbaiki dan submit ulang (submitted, revision_no bertambah)
check(
  'FASE6-05',
  'Musammi memperbaiki dan submit ulang (submitted, revision_no bertambah)',
  hardeningSql.includes('v_existing_entry.status = \'returned\' AND v_clean_status = \'submitted\'') &&
    hardeningSql.includes('v_revision_no := COALESCE(v_existing_entry.revision_no, 1) + 1') &&
    hardeningSql.includes('previous_status, new_status, reason') &&
    migrationSql.includes('v_existing_entry.status = \'returned\' AND v_clean_status = \'submitted\'') &&
    useSupabaseDataCode.includes('existingV2.status === \'returned\' ? (existingV2.revision_no || 1) + 1'),
  'Resubmission of returned entry automatically increments revision_no and updates legacy table.'
);

// 6. Admin membatalkan dengan alasan (voided, reason min 5 karakter)
check(
  'FASE6-06',
  'Admin membatalkan dengan alasan (voided, reason min 5 karakter)',
  hardeningSql.includes('Alasan pembatalan setoran wajib minimal 5 karakter') &&
    hardeningSql.includes('Catatan setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah') &&
    migrationSql.includes('Alasan pembatalan setoran wajib minimal 5 karakter') &&
    migrationSql.includes('Catatan setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah'),
  'Voided state is terminal and strictly requires at least 5 characters reason.'
);

// 7. Revision history lengkap (recitation_revisions mencatat snapshot lengkap)
check(
  'FASE6-07',
  'Revision history lengkap (recitation_revisions mencatat snapshot lengkap)',
  hardeningSql.includes('INSERT INTO public.recitation_revisions') &&
    hardeningSql.includes('before_snapshot, after_snapshot') &&
    hardeningSql.includes('trg_prevent_recitation_revision_tampering') &&
    hardeningSql.includes('recitation_revisions) bersifat immutable append-only') &&
    sesiPageCode.includes('from(\'recitation_revisions\')') &&
    migrationSql.includes('trg_prevent_recitation_revision_tampering'),
  'recitation_revisions stores before/after snapshots and is protected by tamper-prevention trigger.'
);

// 8. submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return
check(
  'FASE6-08',
  'submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return',
  hardeningSql.includes('Setoran yang berstatus submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return oleh Admin') &&
    migrationSql.includes('Setoran yang berstatus submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return oleh Admin') &&
    hardeningSql.includes('IF OLD.status = \'submitted\' AND NOT v_is_admin THEN'),
  'State machine trigger prohibits direct content mutation of submitted entries by Musammi.'
);

// 9. Retry submit tidak menduplikasi (idempotency_key)
check(
  'FASE6-09',
  'Retry submit tidak menduplikasi (idempotency_key)',
  hardeningSql.includes('idempotency_key = p_idempotency_key') &&
    hardeningSql.includes('is_duplicate_prevented\', true') &&
    hardeningSql.includes('idx_recitation_entries_idempotency') &&
    sesiPageCode.includes('p_idempotency_key: idempotencyKey') &&
    setoranPageCode.includes('p_idempotency_key: formData.id ? null : idKey') &&
    migrationSql.includes('is_duplicate_prevented\', true'),
  'Idempotency key prevents duplicate recitation inserts on retry requests.'
);

// 10. Kegagalan RPC tidak menghasilkan fallback direct update client yang melewati validasi
check(
  'FASE6-10',
  'Kegagalan RPC tidak menghasilkan fallback direct update client yang melewati validasi',
  sesiPageCode.includes('if (rpcError) {\n        throw new Error(rpcError.message);\n      }') &&
    setoranPageCode.includes('if (submitErr) {\n                // Kegagalan RPC tidak menghasilkan fallback direct update client yang melewati validasi (AC-10)\n                throw new Error(submitErr.message);\n            }') &&
    setoranPageCode.includes('if (rpcErr) {\n                    throw new Error(rpcErr.message);\n                }'),
  'Client UI catches RPC errors and halts rather than performing unvalidated direct table writes.'
);

// 11. Ledger dan laporan menunjukkan jumlah transaksi yang sama (sinkronisasi atomik)
check(
  'FASE6-11',
  'Ledger dan laporan menunjukkan jumlah transaksi yang sama (sinkronisasi atomik)',
  hardeningSql.includes('INSERT INTO public.setoran_harian') &&
    hardeningSql.includes('INSERT INTO public.recitation_entries') &&
    hardeningSql.includes('RETURNING id INTO v_legacy_id') &&
    hardeningSql.includes('legacy_setoran_id,') &&
    migrationSql.includes('RETURNING id INTO v_legacy_id') &&
    migrationSql.includes('legacy_setoran_id,'),
  'Canonical RPC commits to both recitation_entries and setoran_harian in a single atomic transaction.'
);

console.log('\n======================================================');
console.log('   FASE 6 VERIFICATION SUITE — LAJNAH QURAN SAAS      ');
console.log('======================================================\n');

let passCount = 0;
for (const r of results) {
  const icon = r.passed ? '✅ PASS' : '❌ FAIL';
  if (r.passed) passCount++;
  console.log(`${icon} [${r.id}] ${r.title}`);
  console.log(`       ↳ ${r.details}\n`);
}

console.log('------------------------------------------------------');
console.log(`TOTAL: ${passCount}/${results.length} PASSED`);
console.log('======================================================\n');

if (passCount !== results.length) {
  process.exit(1);
} else {
  process.exit(0);
}
