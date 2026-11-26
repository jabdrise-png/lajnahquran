/**
 * Fase 2 · adaptor V2 <-> bentuk lama (lib/v2Adapter.ts).
 * Aturan harus sama dengan fungsi database fn_slug, fn_surah_no, fn_recitation_kind_code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slug, surahNo, surahName, findKind, findStatus, DEFAULT_KINDS, DEFAULT_STATUSES,
  recitationToSetoranRow, setoranInputToRpcArgs, attendanceToLegacy, attendanceInputToRpcRecords,
  bolehSetor, isUuid,
} from '../../lib/v2Adapter';

test('slug sama dengan fn_slug', () => {
  assert.equal(slug('Murojaah Sore'), 'murojaah_sore');
  assert.equal(slug("Tasmi'"), 'tasmi');
  assert.equal(slug('  '), '');
});

test('surahNo sama dengan fn_surah_no', () => {
  assert.equal(surahNo('Al-Baqarah'), 2);
  assert.equal(surahNo('al baqarah'), 2);
  assert.equal(surahNo('Surat 78'), 78);
  assert.equal(surahNo('2. Al-Baqarah'), 2);
  assert.equal(surahNo("An-Naba'"), 78);
  assert.equal(surahNo('Ya Sin'), 36);
  assert.equal(surahNo('115'), null);
  assert.equal(surahNo('bukan surat'), null);
  assert.equal(surahName(114), 'An-Nas');
});

test('findKind & findStatus menerima kode atau nama', () => {
  assert.equal(findKind(DEFAULT_KINDS, 'Murojaah')?.code, 'murojaah');
  assert.equal(findKind(DEFAULT_KINDS, 'murajaah')?.code, 'murojaah');
  assert.equal(findKind(DEFAULT_KINDS, 'ZIYADAH')?.adds_memorization, true);
  assert.equal(findKind(DEFAULT_KINDS, 'xyz'), undefined);
  assert.equal(findStatus(DEFAULT_STATUSES, 'Terlambat')?.counts_as_present, true);
  assert.equal(findStatus(DEFAULT_STATUSES, 'izin')?.allows_recitation, false);
});

test('recitationToSetoranRow menghasilkan bentuk setoran_harian lama', () => {
  const row = recitationToSetoranRow(
    {
      id: '6f1c1c4e-1111-4a4a-8888-000000000001', organization_id: 'o', santri_id: '9301', halaqah_id: 9201,
      recitation_date: '2026-10-01', session_slot: 'Shubuh', kind: 'murojaah',
      surah_start_no: 78, ayah_start: 1, surah_end_no: 79, ayah_end: 10,
      calculated_pages: '2.5', major_mistakes: 1, minor_mistakes: 2, predicate: 'Jayyid', notes: null,
      status: 'accepted', legacy_setoran_id: 80001, created_at: 'x', updated_at: 'y',
    },
    DEFAULT_KINDS
  );
  assert.equal(row.skema, 'Murojaah');
  assert.equal(row.adds_memorization, false);
  assert.equal(row.counts_as_murojaah, true);
  assert.equal(row.surat_mulai, "An-Naba'");
  assert.equal(row.surat_selesai, "An-Nazi'at");
  assert.equal(row.surat, "An-Naba' - An-Nazi'at");
  assert.equal(row.ayat, '1 - 10');
  assert.equal(row.jumlah_halaman, 2.5);
  assert.equal(row.santri_id, 9301);
  assert.equal(row.v2_id, row.id);
  assert.ok(isUuid(row.id));
});

test('setoranInputToRpcArgs: nama surat -> nomor, arah mundur dibalik, jenis apa adanya', () => {
  const a = setoranInputToRpcArgs({
    santri_id: '9301', halaqah_id: 9201, tanggal: '2026-11-20', waktu: 'Isya', skema: 'Tamkin',
    surat_mulai: 'An-Nas', ayat_mulai: '6', surat_selesai: "An-Naba'", ayat_selesai: '1',
    jumlah_halaman: '23', kesalahan_kabir: '0', kesalahan_shoghir: '1', nilai: 'Mumtaz',
  });
  assert.deepEqual(
    [a.p_surah_start_no, a.p_ayah_start, a.p_surah_end_no, a.p_ayah_end],
    [78, 1, 114, 6]
  );
  assert.equal(a.p_kind, 'Tamkin');
  assert.equal(a.p_calculated_pages, 23);
  assert.equal(a.p_minor_mistakes, 1);
  const b = setoranInputToRpcArgs({ santri_id: 1, halaqah_id: 2, tanggal: '2026-11-20', surat: 'Al-Mulk', ayat: '1-30' });
  assert.deepEqual([b.p_surah_start_no, b.p_ayah_start, b.p_surah_end_no, b.p_ayah_end], [67, 1, 67, 30]);
  assert.equal(b.p_kind, 'ziyadah');
  assert.throws(() => setoranInputToRpcArgs({ santri_id: 1, tanggal: '2026-11-20', surat_mulai: 'xx' }), /Surat mulai/);
});

test('absensi: baris V2 -> bentuk lama dan sebaliknya', () => {
  const legacy = attendanceToLegacy(
    { id: 'u1', session_id: 's1', attendance_date: '2026-11-22', session_slot: 'Shubuh', santri_id: 9301, status: 'terlambat', halaqah_id: 9201 },
    'santri',
    DEFAULT_STATUSES
  );
  assert.equal(legacy.status, 'Terlambat');
  assert.equal(legacy.peran, 'Santri');
  assert.equal(legacy.personId, 9301);
  const m = attendanceToLegacy({ id: 'u2', attendance_date: '2026-11-22', session_slot: 'Ashar', musammi_id: 5, status: 'dispensasi' }, 'musammi', DEFAULT_STATUSES);
  assert.equal(m.status, 'Dispensasi');
  assert.equal(m.peran, 'Musammi');
  const rpc = attendanceInputToRpcRecords([{ peran: 'Musammi', personId: 5, date: '2026-11-22', waktu: 'Ashar', status: 'Hadir', halaqahId: 3 }]);
  assert.deepEqual(rpc[0], { peran: 'Musammi', person_id: 5, date: '2026-11-22', waktu: 'Ashar', status: 'Hadir', halaqah_id: 3, is_badal: false, badal_musammi_id: null });
});

test('bolehSetor: hanya Hadir/Terlambat (allows_recitation) bila sudah diabsen', () => {
  assert.equal(bolehSetor('Hadir', DEFAULT_STATUSES), true);
  assert.equal(bolehSetor('terlambat', DEFAULT_STATUSES), true);
  assert.equal(bolehSetor('Izin', DEFAULT_STATUSES), false);
  assert.equal(bolehSetor(null, DEFAULT_STATUSES), true);
});
