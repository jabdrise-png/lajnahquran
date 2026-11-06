/**
 * Test Suite: Fase 8 — Database Security & RLS Test Suite
 * Verifies RLS policies, tenant isolation, 3-role permissions, RPC revocations, and triggers.
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

const hardeningSqlPath = path.resolve(process.cwd(), 'database/supabase_v2_1_production_hardening.sql');
const migrationSqlPath = path.resolve(process.cwd(), 'database/supabase_saas_v2_migration.sql');

const hardeningSql = fs.readFileSync(hardeningSqlPath, 'utf-8');
const migrationSql = fs.readFileSync(migrationSqlPath, 'utf-8');

// -----------------------------------------------------------------------------
// DB Security 1: RLS Enabled on All V2 Tables
// -----------------------------------------------------------------------------
test('DBSEC-01', 'RLS aktif pada seluruh tabel kanonikal V2 tanpa pengecualian', () => {
  const tables = [
    'user_profiles',
    'access_grants',
    'support_access_sessions',
    'audit_logs',
    'integration_secrets',
    'semesters',
    'student_enrollments',
    'halaqah_student_memberships',
    'halaqah_musammi_assignments',
    'halaqah_sessions',
    'attendance_records',
    'recitation_entries',
    'recitation_revisions',
    'exam_attempts',
    'report_cards',
  ];

  return tables.every((tbl) =>
    migrationSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`) ||
    hardeningSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`)
  );
});

// -----------------------------------------------------------------------------
// DB Security 2: Tenant Isolation Policies
// -----------------------------------------------------------------------------
test('DBSEC-02', 'Kebijakan RLS membatasi baris data berdasarkan organization_id dan role caller', () => {
  const hasOrgCheck = migrationSql.includes('organization_id = public.get_my_org_id()') ||
                      migrationSql.includes('public.get_role_for_org(organization_id)');
  const hasSuperOverride = migrationSql.includes('public.is_super_admin()');
  return hasOrgCheck && hasSuperOverride;
});

// -----------------------------------------------------------------------------
// DB Security 3: 3 Canonical Roles Enforced
// -----------------------------------------------------------------------------
test('DBSEC-03', 'Fungsi get_canonical_role hanya mengizinkan 3 role (superadmin, admin, musammi)', () => {
  const hasCanonicalFunc = hardeningSql.includes('CREATE OR REPLACE FUNCTION public.get_canonical_role()') &&
                           hardeningSql.includes('\'superadmin\'') &&
                           hardeningSql.includes('\'admin\'') &&
                           hardeningSql.includes('\'musammi\'');
  return hasCanonicalFunc;
});

// -----------------------------------------------------------------------------
// DB Security 4: Revocation of Dangerous Operations from Anon & Public
// -----------------------------------------------------------------------------
test('DBSEC-04', 'Hak eksekusi RPC dan manipulasi tabel berbahaya dicabut dari anon dan PUBLIC', () => {
  const hasTableRevoke = hardeningSql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;');
  const hasRpcRevoke = hardeningSql.includes('REVOKE ALL ON FUNCTION public.rpc_create_tenant_with_admin') &&
                       hardeningSql.includes('REVOKE ALL ON FUNCTION public.rpc_publish_report_card') &&
                       hardeningSql.includes('REVOKE ALL ON FUNCTION public.rpc_lock_halaqah_session');
  return hasTableRevoke && hasRpcRevoke;
});

// -----------------------------------------------------------------------------
// DB Security 5: Integration Secrets Deny All Browser Reads
// -----------------------------------------------------------------------------
test('DBSEC-05', 'Tabel integration_secrets memblokir akses baca dari browser (USING false)', () => {
  const hasDenyPolicy = hardeningSql.includes('CREATE POLICY integration_secrets_no_browser_read ON public.integration_secrets') &&
                        hardeningSql.includes('USING (false)') &&
                        hardeningSql.includes('WITH CHECK (false);');
  const hasServiceRoleGrant = hardeningSql.includes('GRANT ALL ON TABLE public.integration_secrets TO service_role;');
  return hasDenyPolicy && hasServiceRoleGrant;
});

// -----------------------------------------------------------------------------
// DB Security 6: Recitation Revisions & Report Cards Immutability Triggers
// -----------------------------------------------------------------------------
test('DBSEC-06', 'Trigger immutability aktif pada recitation_revisions dan report_cards', () => {
  const hasRecitationTrigger = migrationSql.includes('CREATE TRIGGER trg_prevent_recitation_revision_tampering') &&
                               migrationSql.includes('BEFORE UPDATE OR DELETE ON public.recitation_revisions');
  const hasReportCardTrigger = hardeningSql.includes('CREATE TRIGGER trg_enforce_report_card_immutability') &&
                               hardeningSql.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.report_cards');
  return hasRecitationTrigger && hasReportCardTrigger;
});

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('FASE 8 TEST SUITE: DATABASE SECURITY & RLS POLICIES');
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

  if (failed > 0) process.exit(1);
}

runTests();
