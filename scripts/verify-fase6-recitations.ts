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
// Fase 3 v2 (28-11-2026): validasi setoran dihapus — setoran langsung sah (accepted), koreksi/batal oleh Admin
// beralasan. Perilaku diuji nyata di tests/v2/f3-database.test.ts.
const f3SetoranSql = read('database/migrations/2026_11_28_02_f3_setoran_langsung_sah.sql');
const formSetoranCode = read('components/setoran/FormSetoranRingkas.tsx');
const daftarSetoranCode = read('components/setoran/DaftarSetoran.tsx');

const results: CheckResult[] = [];

function check(id: string, title: string, condition: boolean, details: string) {
  results.push({ id, title, passed: condition, details });
}

// 1. Musammi membuat draft (status = 'draft')
check(
  'FASE6-01',
  'Setoran baru langsung sah (accepted), tanpa draft',
  f3SetoranSql.includes("check (status in ('accepted', 'voided'))") &&
    f3SetoranSql.includes('Setoran baru langsung sah (status accepted).') &&
    formSetoranCode.includes('p_status: null'),
  'Fase 3: status draft/submitted/returned dihapus; setoran tersimpan langsung sah.'
);

// 2. Musammi submit setoran (status = 'submitted')
check(
  'FASE6-02',
  'Setoran divalidasi rentang surat/ayat dan dihitung server',
  f3SetoranSql.includes('Surat selesai tidak boleh mendahului surat mulai.') &&
    f3SetoranSql.includes('melebihi jumlah ayat surat') &&
    f3SetoranSql.includes('v_pages := public.fn_hitung_halaman(') &&
    f3SetoranSql.includes('public.fn_predikat_kelancaran(') &&
    useSupabaseDataCode.includes("rpcOrThrow('rpc_submit_recitation_entry'") &&
    formSetoranCode.includes('simpanSetoran('),
  'Server memeriksa batas surat/ayat, menghitung halaman (mushaf) dan predikat (Tabel Kelancaran).'
);

// 3. Admin menerima (accepted)
check(
  'FASE6-03',
  'Tidak ada langkah "terima" Admin; koreksi hanya oleh Admin',
  f3SetoranSql.includes('Validasi setoran sudah dihapus') &&
    f3SetoranSql.includes('Koreksi setoran yang sudah tersimpan dilakukan oleh Admin.') &&
    !setoranPageCode.includes("'submitted'") && !sesiPageCode.includes("'submitted'"),
  'rpc_review_recitation_entry hanya untuk pembatalan; tombol Terima/Kembalikan dihapus.'
);

// 4. Admin mengembalikan beserta alasan (returned, reason min 5 karakter)
check(
  'FASE6-04',
  'Koreksi setoran wajib alasan (min 5 karakter)',
  f3SetoranSql.includes('Alasan koreksi/pembatalan wajib diisi dengan jelas (minimal 5 karakter).') &&
    formSetoranCode.includes('AlasanDialog') &&
    daftarSetoranCode.includes('AlasanDialog'),
  'Server dan layar mewajibkan alasan untuk koreksi maupun pembatalan.'
);

// 5. Musammi memperbaiki dan submit ulang (submitted, revision_no bertambah)
check(
  'FASE6-05',
  'Musammi memperbaiki dan submit ulang (submitted, revision_no bertambah)',
  hardeningSql.includes('v_existing_entry.status = \'returned\' AND v_clean_status = \'submitted\'') &&
    hardeningSql.includes('v_revision_no := COALESCE(v_existing_entry.revision_no, 1) + 1') &&
    hardeningSql.includes('previous_status, new_status, reason') &&
    migrationSql.includes('v_existing_entry.status = \'returned\' AND v_clean_status = \'submitted\'') &&
    // Diperbarui Fase 2 v2: perubahan dari hook lewat rpc_submit_recitation_entry (p_existing_entry_id),
    // revision_no dinaikkan server; tidak ada lagi salinan ke tabel lama.
    read('database/migrations/2026_11_27_07_f2_rpc_hanya_v2.sql').includes("when v_existing.status = 'returned' and v_status = 'submitted' then 'resubmit'") &&
    useSupabaseDataCode.includes('existingEntryId'),
  'Resubmission of returned entry automatically increments revision_no (server-side, V2 only).'
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
  hardeningSql.includes('trg_prevent_recitation_revision_tampering') &&
    hardeningSql.includes('recitation_revisions) bersifat immutable append-only') &&
    f3SetoranSql.includes('insert into public.recitation_revisions') &&
    f3SetoranSql.includes('before_snapshot, after_snapshot') &&
    daftarSetoranCode.includes("from('recitation_revisions')"),
  'Setiap simpan/koreksi/batal menulis snapshot sebelum-sesudah; riwayat tampil di daftar setoran.'
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
  hardeningSql.includes('idx_recitation_entries_idempotency') &&
    f3SetoranSql.includes('idempotency_key = p_idempotency_key') &&
    f3SetoranSql.includes("'is_duplicate_prevented', true") &&
    formSetoranCode.includes('idemKey.current ||='),
  'Kunci idempotensi dipakai ulang saat mengirim ulang; server mengembalikan setoran yang sudah ada.'
);

// 10. Kegagalan RPC tidak menghasilkan fallback direct update client yang melewati validasi
check(
  'FASE6-10',
  'Kegagalan RPC tidak menghasilkan fallback direct update client yang melewati validasi',
  useSupabaseDataCode.includes('if (error) throw error;') &&
    !formSetoranCode.includes("from('recitation_entries')") &&
    !daftarSetoranCode.includes("from('recitation_entries')") &&
    !setoranPageCode.includes("from('recitation_entries')") &&
    !sesiPageCode.includes("from('recitation_entries')"),
  'Semua tulis setoran lewat RPC (rpcOrThrow); error ditampilkan, tidak ada tulis langsung ke tabel.'
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
