/**
 * Test Suite: Fase 8 — Unit Tests for Business Logic, Roles, Routing & Calculations
 */
import { normalizeServerRole, isTimestampExpired, evaluateGrantStatus } from '../api/_tenantContext';
import { isRouteAllowed, normalizeRole } from '../lib/permissions';
import { getPredikat } from '../lib/utils';

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
// Unit 1: Role Normalization (3 Canonical Roles: superadmin, admin, musammi)
// -----------------------------------------------------------------------------
test('UNIT-01', 'Normalisasi role hanya memetakan ke 3 role kanonikal', () => {
  const isSuper = normalizeServerRole('superadmin') === 'superadmin' &&
                  normalizeRole('super_admin') === 'superadmin';
  const isAdmin = normalizeServerRole('admin') === 'admin' &&
                  normalizeRole('admin_mahad') === 'admin';
  const isMusammi = normalizeServerRole('musammi') === 'musammi' &&
                    normalizeRole('pengajar') === 'musammi';
  const isUnknown = normalizeServerRole('random_role') === 'unknown' &&
                    normalizeRole(null) === 'unknown' &&
                    normalizeRole('') === 'unknown';
  return isSuper && isAdmin && isMusammi && isUnknown;
});

// -----------------------------------------------------------------------------
// Unit 2: Grant Membership & Expiration Logic
// -----------------------------------------------------------------------------
test('UNIT-02', 'Evaluasi status grant menolak token kedaluwarsa & invalid', () => {
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const futureDate = new Date(Date.now() + 3600000).toISOString();

  const isExpired = isTimestampExpired(pastDate) === true &&
                    isTimestampExpired(futureDate) === false &&
                    isTimestampExpired(null) === false;

  const expiredGrant = evaluateGrantStatus({ status: 'active', expires_at: pastDate });
  const activeGrant = evaluateGrantStatus({ status: 'active', expires_at: futureDate });
  const suspendedGrant = evaluateGrantStatus({ status: 'suspended', expires_at: futureDate });

  return isExpired && expiredGrant === 'expired' && activeGrant === 'active' && suspendedGrant === 'suspended';
});

// -----------------------------------------------------------------------------
// Unit 3: Route Permission Resolver (RBAC Routing)
// -----------------------------------------------------------------------------
test('UNIT-03', 'Route resolver membatasi akses sesuai role kanonikal', () => {
  // Superadmin
  const superPlatform = isRouteAllowed('/platform/tenants', 'superadmin');

  // Admin
  const adminApp = isRouteAllowed('/app/dashboard', 'admin');
  const adminSantri = isRouteAllowed('/app/students', 'admin');
  const adminPlatformBlocked = isRouteAllowed('/platform/tenants', 'admin') === false;

  // Musammi
  const musammiSessions = isRouteAllowed('/app/sessions', 'musammi');
  const musammiPlatformBlocked = isRouteAllowed('/platform/tenants', 'musammi') === false;
  const musammiTargetsBlocked = isRouteAllowed('/app/targets', 'musammi') === false;
  const musammiRubricsBlocked = isRouteAllowed('/app/settings/rubrics', 'musammi') === false;

  return superPlatform && adminApp && adminSantri && adminPlatformBlocked &&
         musammiSessions && musammiPlatformBlocked && musammiTargetsBlocked && musammiRubricsBlocked;
});

// -----------------------------------------------------------------------------
// Unit 4: Qur'an Calculations & Boundaries (Surah 1..114, Ayah Validation)
// -----------------------------------------------------------------------------
test('UNIT-04', 'Kalkulasi batas surat & ayat Al-Qur\'an valid (1–114)', () => {
  const isValidSurah = (no: number) => Number.isInteger(no) && no >= 1 && no <= 114;
  const validSurahs = [1, 2, 18, 36, 114].every(isValidSurah);
  const invalidSurahs = [0, 115, -1, 999].every((n) => !isValidSurah(n));

  // Estimasi halaman (mis. 20 halaman per juz rata-rata)
  const calcEstimatedPages = (startJuz: number, endJuz: number) => {
    if (startJuz <= 0 || endJuz < startJuz || endJuz > 30) return 0;
    return (endJuz - startJuz + 1) * 20;
  };

  const pagesJuz1 = calcEstimatedPages(1, 1) === 20;
  const pagesJuz1to3 = calcEstimatedPages(1, 3) === 60;
  const invalidJuz = calcEstimatedPages(31, 32) === 0;

  return validSurahs && invalidSurahs && pagesJuz1 && pagesJuz1to3 && invalidJuz;
});

// -----------------------------------------------------------------------------
// Unit 5: Predikat Penilaian Akademik
// -----------------------------------------------------------------------------
test('UNIT-05', 'Kalkulasi predikat nilai akurat sesuai standar tahfidz', () => {
  const predicatesConfig = [
    { label: 'Mumtaz', minScore: 90 },
    { label: 'Jayyid Jiddan', minScore: 80 },
    { label: 'Jayyid', minScore: 70 },
    { label: 'Maqbul', minScore: 60 },
    { label: 'Rasib', minScore: 0 },
  ];

  const p95 = getPredikat(95, predicatesConfig) === 'Mumtaz';
  const p90 = getPredikat(90, predicatesConfig) === 'Mumtaz';
  const p85 = getPredikat(85, predicatesConfig) === 'Jayyid Jiddan';
  const p75 = getPredikat(75, predicatesConfig) === 'Jayyid';
  const p65 = getPredikat(65, predicatesConfig) === 'Maqbul';
  const p50 = getPredikat(50, predicatesConfig) === 'Rasib';

  return p95 && p90 && p85 && p75 && p65 && p50;
});

// -----------------------------------------------------------------------------
// Unit 6: Gradebook Weighted Formula & Clamping
// -----------------------------------------------------------------------------
test('UNIT-06', 'Formula bobot raport menghitung skor akhir proporsional & di-clamp 0..100', () => {
  const weights = {
    pctBulanan: 20,
    pctSemester: 50,
    pctSilabus: 20,
    pctKehadiran: 10,
  };

  const calculateFinalScore = (avgBln: number, valSem: number, silabus: number, kehadiran: number) => {
    const raw =
      avgBln * (weights.pctBulanan / 100) +
      valSem * (weights.pctSemester / 100) +
      silabus * (weights.pctSilabus / 100) +
      kehadiran * (weights.pctKehadiran / 100);
    return Math.min(100, Math.max(0, Math.round(raw * 100) / 100));
  };

  const perfect = calculateFinalScore(100, 100, 100, 100) === 100;
  const zero = calculateFinalScore(0, 0, 0, 0) === 0;
  const sample = calculateFinalScore(80, 90, 85, 100); // 16 + 45 + 17 + 10 = 88
  const clampedHigh = calculateFinalScore(150, 100, 100, 100) === 100;

  return perfect && zero && sample === 88 && clampedHigh;
});

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('FASE 8 TEST SUITE: UNIT TESTS (LOGIC, ROLES & CALCULATIONS)');
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
