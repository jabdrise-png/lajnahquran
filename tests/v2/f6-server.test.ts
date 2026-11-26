/**
 * Fase 6 · server Telegram: template layar = database, pengurai pesan wali, webhook penautan,
 * pemroses antrian (klien Supabase palsu, tanpa jaringan).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { buildTestDb, one, ID } from './helpers/db';
import {
  renderTemplate, TEMPLATE_BAWAAN, uraiPesanWali, normalisasiKode, tampilKode, tautanBot, pesanUndangan,
  variabelTakDikenal, contohVariabel, galatPermanen, balasanTautan,
} from '../../lib/telegramPesan';
import { processTelegramWebhook, resetWebhookReplayCacheForTesting } from '../../api/telegram-webhook';
import { prosesAntrian } from '../../api/notify/antrian';

let db: PGlite;
before(async () => { db = await buildTestDb(); });

test('renderTemplate (layar) = fn_render_template (database)', async () => {
  const kasus: [string, Record<string, any>][] = [
    ['A {x}{y} {z} {w}', { x: '{y}', y: '', z: null }],
    ['{nama_santri} ({halaqah}) {ulang}!', { nama_santri: "Abdullah bin Mas'ud", halaqah: 'H_1*', ulang: '' }],
    ['tanpa variabel', {}],
    ['{a}{a}{A}{a_b}', { a: '1', a_b: '2' }],
  ];
  for (const [tpl, vars] of kasus) {
    assert.equal(renderTemplate(tpl, vars), await one(db, `select public.fn_render_template($1, $2::jsonb)`, [tpl, JSON.stringify(vars)]), tpl);
  }
});

test('template bawaan layar = nilai bawaan telegram_settings; contoh variabel terisi semua', async () => {
  const r = await one<any>(db, `select row_to_json(t) from public.telegram_settings t where organization_id = $1`, [ID.org]);
  assert.equal(TEMPLATE_BAWAAN.setoran, r.setoran_template);
  assert.equal(TEMPLATE_BAWAAN.mingguan, r.mingguan_template);
  assert.equal(TEMPLATE_BAWAAN.periode, r.periode_template);
  for (const j of ['setoran', 'mingguan', 'periode'] as const) {
    assert.doesNotMatch(renderTemplate(TEMPLATE_BAWAAN[j], contohVariabel(j)), /\{[a-z_]+\}/, j);
    assert.deepEqual(variabelTakDikenal(TEMPLATE_BAWAAN[j], j), []);
  }
  assert.deepEqual(variabelTakDikenal('Halo {nama_santri} {nilai_ujian}', 'mingguan'), ['nilai_ujian']);
  assert.deepEqual(variabelTakDikenal('{skema} {nilai}', 'setoran'), [], 'variabel lama setoran tetap dikenal');
});

test('pesan wali: /start KODE, kode saja (huruf kecil/berspasi/strip), /anak, /berhenti; ID/NIS bukan kode', () => {
  assert.deepEqual(uraiPesanWali('/start ABCD2345'), { jenis: 'kode', kode: 'ABCD2345' });
  assert.deepEqual(uraiPesanWali('abcd-2345'), { jenis: 'kode', kode: 'ABCD2345' });
  assert.deepEqual(uraiPesanWali(' Abcd 2345 '), { jenis: 'kode', kode: 'ABCD2345' });
  assert.deepEqual(uraiPesanWali('/start'), { jenis: 'sambutan' });
  assert.deepEqual(uraiPesanWali('/start 1001'), { jenis: 'kode_salah_bentuk' });
  assert.deepEqual(uraiPesanWali('S-001A9'), { jenis: 'kode_salah_bentuk' });
  assert.deepEqual(uraiPesanWali('ABCD1OI0'), { jenis: 'kode_salah_bentuk' }, 'huruf mirip (O, I, 0, 1) bukan kode');
  assert.deepEqual(uraiPesanWali('/anak@MahadBot'), { jenis: 'anak' });
  assert.deepEqual(uraiPesanWali('/berhenti'), { jenis: 'berhenti' });
  assert.deepEqual(uraiPesanWali('assalamualaikum'), { jenis: 'bantuan' });
  assert.equal(normalisasiKode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(tampilKode('ABCDEFGH'), 'ABCD-EFGH');
  assert.equal(tautanBot('@Mahad_Bot', 'ABCDEFGH'), 'https://t.me/Mahad_Bot?start=ABCDEFGH');
  assert.equal(tautanBot('bukan bot!', 'ABCDEFGH'), null);
  assert.match(pesanUndangan({ nama: 'Ahmad', kode: 'ABCDEFGH', lembaga: 'Lajnah', username: 'MahadBot' }), /t\.me\/MahadBot\?start=ABCDEFGH[\s\S]*ABCD-EFGH/);
  assert.equal(galatPermanen(403, 'Forbidden: bot was blocked by the user'), true);
  assert.equal(galatPermanen(400, 'Bad Request: chat not found'), true);
  assert.equal(galatPermanen(429, 'Too Many Requests'), false);
  assert.equal(galatPermanen(500, ''), false);
  assert.match(balasanTautan({ ok: true, nama: 'Ahmad', halaqah: 'H1', lembaga: 'Lajnah', anak: ['Ahmad', 'Fatimah'] }), /ananda Ahmad \(H1\)[\s\S]*Ahmad, Fatimah/);
});

// ---------------------------------------------------------------- klien Supabase palsu
function klienPalsu(opts: { rpc?: Record<string, (a: any) => any>; tabel?: Record<string, any[]> }) {
  const panggilan: { rpc: string; args: any }[] = [];
  const sisipan: { tabel: string; baris: any }[] = [];
  const client: any = {
    panggilan, sisipan,
    rpc: async (nama: string, args: any) => {
      panggilan.push({ rpc: nama, args });
      const f = opts.rpc?.[nama];
      return f ? { data: f(args), error: null } : { data: null, error: { message: `rpc ${nama} tidak ada` } };
    },
    from: (tabel: string) => {
      let baris = [...(opts.tabel?.[tabel] || [])];
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { baris = baris.filter((b) => String(b[k]) === String(v)); return q; },
        in: (k: string, vs: any[]) => { baris = baris.filter((b) => vs.map(String).includes(String(b[k]))); return q; },
        maybeSingle: async () => ({ data: baris[0] ?? null, error: null }),
        insert: async (b: any) => { sisipan.push({ tabel, baris: b }); return { error: null }; },
        then: (ok: any, gagal: any) => Promise.resolve({ data: baris, error: null }).then(ok, gagal),
      };
      return q;
    },
  };
  return client;
}

const ORG = '11111111-1111-4111-8111-111111111111';
const SECRET = 'rahasia-webhook-1234567890';
const tabelWebhook = () => ({
  integration_secrets: [
    { organization_id: ORG, secret_key_name: 'TELEGRAM_WEBHOOK_SECRET', secret_value: SECRET, status: 'active' },
    { organization_id: ORG, secret_key_name: 'TELEGRAM_BOT_TOKEN', secret_value: '123456:TOKEN_ASLI', status: 'active' },
  ],
  organizations: [{ id: ORG, status: 'active', name: 'Lajnah Uji' }],
});
const kirimWebhook = async (client: any, text: string, updateId: number, chatType = 'private') => {
  let balasan: any = null;
  const r = await processTelegramWebhook({
    method: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': SECRET },
    query: { org_id: ORG },
    body: { update_id: updateId, message: { date: Math.floor(Date.now() / 1000), chat: { id: 4242, type: chatType }, text } },
    injectedClient: client,
    injectedFetch: (async (_u: any, init: any) => { balasan = JSON.parse(init.body); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any,
  });
  return { r, balasan };
};

test('webhook: kode santri menautkan lewat fn_tautkan_telegram & membalas nama ananda; /anak; /berhenti; grup diabaikan', async () => {
  resetWebhookReplayCacheForTesting();
  const client = klienPalsu({
    tabel: tabelWebhook(),
    rpc: {
      fn_tautkan_telegram: (a) => (a.p_kode === 'ABCD2345'
        ? { ok: true, sudah: false, nama: 'Santri Satu', halaqah: 'Halaqah Uji', lembaga: 'Lajnah Uji', anak: ['Santri Satu'] }
        : { ok: false, alasan: 'kode_salah', sisa: 3 }),
      fn_telegram_anak: () => ['Santri Satu', 'Santri Dua'],
      fn_telegram_berhenti: () => 2,
    },
  });
  let k = await kirimWebhook(client, '/start ABCD2345', 501);
  assert.equal(k.r.status, 200);
  assert.deepEqual(client.panggilan.at(-1), { rpc: 'fn_tautkan_telegram', args: { p_org: ORG, p_chat: '4242', p_kode: 'ABCD2345' } });
  assert.match(k.balasan.text, /berhasil tertaut untuk ananda Santri Satu \(Halaqah Uji\) di Lajnah Uji/);
  assert.equal(k.balasan.parse_mode, undefined, 'tanpa Markdown');
  k = await kirimWebhook(client, 'zzzz-zzzz', 502);
  assert.match(k.balasan.text, /Kode tidak dikenali.*Sisa percobaan: 3/s);
  k = await kirimWebhook(client, '/anak', 503);
  assert.match(k.balasan.text, /• Santri Satu\n• Santri Dua/);
  k = await kirimWebhook(client, '/berhenti', 504);
  assert.match(k.balasan.text, /tidak lagi menerima pesan untuk 2 ananda/);
  const nRpc = client.panggilan.length;
  k = await kirimWebhook(client, 'ABCD2345', 505, 'group');
  assert.equal(k.r.status, 200);
  assert.equal(k.balasan, null, 'grup tidak dibalas');
  assert.equal(client.panggilan.length, nRpc, 'grup tidak memicu penautan');
});

test('pemroses antrian: kirim dengan token lembaga, tandai terkirim / coba lagi / gagal permanen; tanpa token → coba lagi', async () => {
  const ORG2 = '22222222-2222-4222-8222-222222222222';
  const antri = [
    { id: 'q1', organization_id: ORG, chat_id: '1', pesan: 'satu' },
    { id: 'q2', organization_id: ORG, chat_id: '2', pesan: 'dua' },
    { id: 'q3', organization_id: ORG, chat_id: '3', pesan: 'tiga' },
    { id: 'q4', organization_id: ORG2, chat_id: '4', pesan: 'empat' },
  ];
  const selesai: any[] = [];
  const client = klienPalsu({
    tabel: { integration_secrets: [
      { organization_id: ORG, secret_key_name: 'TELEGRAM_BOT_TOKEN', secret_value: '123456:TOKEN_ORG1', status: 'active' },
      { organization_id: ORG2, secret_key_name: 'TELEGRAM_BOT_TOKEN', secret_value: '999••••', status: 'active' },
    ] },
    rpc: {
      rpc_proses_jadwal_telegram: () => ({ diproses: [] }),
      fn_antrian_ambil: () => antri,
      fn_antrian_selesai: (a) => { selesai.push(a); return a.p_ok ? 'terkirim' : a.p_permanen ? 'gagal' : 'antri'; },
    },
  });
  const url: string[] = [];
  const fetchFn = (async (u: any, init: any) => {
    url.push(String(u));
    const chat = JSON.parse(init.body).chat_id;
    if (chat === '1') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (chat === '2') return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), { status: 403 });
    return new Response(JSON.stringify({ ok: false, description: 'Too Many Requests' }), { status: 429 });
  }) as any;
  const h = await prosesAntrian({ client, jalankanJadwal: true, fetchFn });
  assert.deepEqual([h.diambil, h.terkirim, h.gagal, h.dicobaLagi], [4, 1, 1, 2]);
  assert.equal(client.panggilan[0].rpc, 'rpc_proses_jadwal_telegram');
  assert.ok(url.every((u) => u.includes('TOKEN_ORG1')), 'token lembaga sendiri; token tersamar tidak dipakai');
  assert.equal(url.length, 3, 'lembaga tanpa token aktif tidak mengirim');
  assert.deepEqual(selesai.map((s) => [s.p_id, s.p_ok, s.p_permanen]), [['q1', true, false], ['q2', false, true], ['q3', false, false], ['q4', false, false]]);
});
