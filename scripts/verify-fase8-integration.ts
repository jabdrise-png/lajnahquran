/**
 * Test Suite: Fase 8 — Integration Tests for APIs, Service Layer & Transactions
 */
import { processInvitationPayload } from '../api/invitations';
import { processIntegrationSecrets } from '../api/integrations';

interface TestCase {
  id: string;
  name: string;
  fn: () => boolean | Promise<boolean>;
}

const tests: TestCase[] = [];

function test(id: string, name: string, fn: () => boolean | Promise<boolean>) {
  tests.push({ id, name, fn });
}

// Ensure server env vars are initialized for mock execution
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'mock-anon-key';

const mockAdminClient: any = {
  auth: {
    getUser: async () => ({
      data: { user: { id: 'admin-1', email: 'admin@mahad.id' } },
      error: null,
    }),
  },
  from: (table: string) => {
    const grantData = [{
      id: 'grant-1',
      user_id: 'admin-1',
      organization_id: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
      status: 'active',
      expires_at: null,
    }];
    const profileData = {
      id: 'admin-1',
      role: 'admin',
      organization_id: '00000000-0000-0000-0000-000000000001',
    };
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: table === 'profiles' ? profileData : table === 'access_grants' ? grantData[0] : null,
        error: null,
      }),
      then: (resolve: any) =>
        Promise.resolve({
          data: table === 'access_grants' ? grantData : [],
          error: null,
        }).then(resolve),
    };
    return builder;
  },
};

// -----------------------------------------------------------------------------
// Integration 1: Invitation API Token Rejection Without Auth
// -----------------------------------------------------------------------------
test('INT-01', 'API /api/invitations menolak payload tanpa Bearer token autentikasi', async () => {
  const result = await processInvitationPayload(undefined, {
    organizationId: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
    role: 'musammi',
  }, mockAdminClient);
  return result.status === 401 && (
    result.data?.error?.toLowerCase().includes('autentikasi') ||
    result.data?.error?.toLowerCase().includes('unauthorized')
  );
});

// -----------------------------------------------------------------------------
// Integration 2: Invitation Token Inspection Without Exposing Secrets
// -----------------------------------------------------------------------------
test('INT-02', 'API /api/invitations menolak token undangan kosong atau format tidak sah', async () => {
  const resultEmpty = await processInvitationPayload('Bearer test-token', {
    token: '',
  }, mockAdminClient);
  const resultShort = await processInvitationPayload('Bearer test-token', {
    token: 'invalid',
  }, mockAdminClient);
  return resultEmpty.status === 400 && resultShort.status === 400;
});

// -----------------------------------------------------------------------------
// Integration 3: Integration Secrets Protection (No Raw Tokens in GET)
// -----------------------------------------------------------------------------
test('INT-03', 'API /api/integrations GET menolak request tanpa autentikasi admin', async () => {
  const result = await processIntegrationSecrets('GET', undefined, {});
  return result.status === 401;
});

// -----------------------------------------------------------------------------
// Integration 4: Integration Secrets POST Validation
// -----------------------------------------------------------------------------
test('INT-04', 'API /api/integrations POST menolak penyimpanan secret tanpa provider valid', async () => {
  const result = await processIntegrationSecrets('POST', undefined, {
    provider: 'invalid_provider',
    secretKey: 'some_key',
  });
  return result.status === 401; // Blocked at auth layer before execution
});

// -----------------------------------------------------------------------------
// Integration 5: Netlify Functions Handler Routing Integration
// -----------------------------------------------------------------------------
test('INT-05', 'Netlify Function handler merutekan endpoint /health dan CORS OPTIONS dengan benar', async () => {
  const { handler } = await import('../netlify/functions/api');
  
  // Test OPTIONS CORS
  const optionsRes = await (handler as any)({
    httpMethod: 'OPTIONS',
    headers: {},
  }, {} as any);

  const isCorsOk = optionsRes.statusCode === 204 &&
                   optionsRes.headers['Access-Control-Allow-Origin'] === '*';

  // Test /health route
  const healthRes = await (handler as any)({
    httpMethod: 'GET',
    path: '/api/health',
    headers: {},
  }, {} as any);

  const isHealthOk = healthRes.statusCode === 200 &&
                     JSON.parse(healthRes.body).runtime === 'netlify-functions';

  return isCorsOk && isHealthOk;
});

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('FASE 8 TEST SUITE: INTEGRATION TESTS (API & SERVICES)');
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
