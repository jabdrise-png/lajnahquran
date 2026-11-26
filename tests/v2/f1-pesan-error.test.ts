/**
 * Fase 1 · BUG-16 (pesan error ramah) dan aturan alasan di layar (BUG-07/08).
 * Checklist FASE_1_UJI no. 14.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ramahkanTeks, pesanErrorRamah, cekAlasan } from '../../lib/ramahkanError';
import { NotificationStore } from '../../lib/NotificationStore';

test('error constraint setoran diterjemahkan dan awalan "Gagal" dipertahankan', () => {
  const raw = 'Gagal: new row for relation "recitation_revisions" violates check constraint "recitation_revisions_action_check"';
  const out = ramahkanTeks(raw);
  assert.match(out, /^Gagal: Setoran belum bisa disimpan/);
  assert.doesNotMatch(out, /recitation_revisions/);
});

test('pola error umum menjadi kalimat Indonesia', () => {
  const kasus: Array<[string, RegExp]> = [
    ['Failed to fetch', /Koneksi internet terputus/],
    ['TypeError: NetworkError when attempting to fetch resource.', /Koneksi internet terputus/],
    ['new row violates row-level security policy for table "santri"', /tidak memiliki izin/],
    ['permission denied for table halaqah', /tidak memiliki izin/],
    ['duplicate key value violates unique constraint "santri_kode_key"', /sudah ada/],
    ['null value in column "nama" of relation "santri" violates not-null constraint', /Kolom "nama" wajib diisi/],
    ['insert or update on table "x" violates foreign key constraint "y"', /terhubung dengan data lain/],
    ['new row for relation "x" violates check constraint "y"', /tidak sesuai aturan/],
    ['invalid input syntax for type uuid: "abc"', /Format isian tidak valid/],
    ['Could not find the function public.rpc_x without parameters in the schema cache', /belum aktif/],
    ['JWT expired', /Sesi login Anda sudah berakhir/],
    ['Invalid login credentials', /Email atau kata sandi salah/],
    ['canceling statement due to statement timeout', /terlalu lama/],
  ];
  for (const [raw, harapan] of kasus) assert.match(ramahkanTeks(raw), harapan, raw);
});

test('pesan yang sudah ramah tidak diubah, awalan Forbidden dibuang', () => {
  assert.equal(ramahkanTeks('Nama santri wajib diisi.'), 'Nama santri wajib diisi.');
  assert.equal(
    ramahkanTeks('Forbidden: Admin Lembaga hanya dapat menetapkan atau mengelola role Musammi.'),
    'Admin Lembaga hanya dapat menetapkan atau mengelola role Musammi.'
  );
  assert.equal(ramahkanTeks(''), 'Terjadi kesalahan. Coba lagi.');
});

test('pesanErrorRamah menerima objek PostgrestError dan konteks', () => {
  const err = { message: 'permission denied for table santri', code: '42501', details: null, hint: null };
  assert.equal(pesanErrorRamah(err, 'Gagal memuat santri'), 'Gagal memuat santri: Anda tidak memiliki izin untuk melakukan tindakan ini.');
  assert.match(pesanErrorRamah({ message: 'something', code: '23505' }), /sudah ada/);
  assert.match(pesanErrorRamah(new Error('Failed to fetch')), /Koneksi internet/);
});

test('NotificationStore otomatis meramahkan notifikasi error, tidak menyentuh success/info', () => {
  NotificationStore.clearAll();
  NotificationStore.addNotification('Gagal: permission denied for table santri', 'error');
  NotificationStore.addNotification('permission denied (contoh teks info)', 'info');
  const [info, error] = NotificationStore.getNotifications();
  assert.equal(error.message, 'Gagal: Anda tidak memiliki izin untuk melakukan tindakan ini.');
  assert.equal(info.message, 'permission denied (contoh teks info)');
});

test('cekAlasan: sama dengan fn_alasan_valid di database', () => {
  assert.ok(cekAlasan('tes'));
  assert.ok(cekAlasan('     '));
  assert.ok(cekAlasan('aaaaaaa'));
  assert.ok(cekAlasan('12345678'));
  assert.equal(cekAlasan('Salah input'), null);
  // Support Access: min 10 karakter & 2 kata
  assert.ok(cekAlasan('asdfasdfasdf', 10, 2));
  assert.ok(cekAlasan('cek', 10, 2));
  assert.equal(cekAlasan('Bantu admin cek absensi', 10, 2), null);
});
