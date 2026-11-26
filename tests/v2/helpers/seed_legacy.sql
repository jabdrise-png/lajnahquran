-- Data LAMA (sebelum Fase 2) untuk menguji migrasi 2026_11_27_06.
-- Dijalankan sebelum migrasi (opsi beforeMigrations di helper).
insert into public.app_settings (organization_id, key, value) values
  ('11111111-1111-1111-1111-111111111111', 'GLOBAL_ATTENDANCE_STATUS', '["Hadir","Izin","Sakit","Alpa","Terlambat","Dispensasi"]'),
  ('11111111-1111-1111-1111-111111111111', 'GLOBAL_WAKTU_HALAQAH', '["Shubuh","Ashar","Isya"]'),
  ('11111111-1111-1111-1111-111111111111', 'SETORAN_SKEMA_OPTIONS', 'Ziyadah,Murojaah,Sabqi,Manzil,Tasmi'''),
  ('11111111-1111-1111-1111-111111111111', 'SETORAN_WAKTU_SKEMA_MAP', '{"Shubuh":"Ziyadah","Ashar":"Murojaah","Isya":"Tasmi''"}');

-- Santri ketiga hanya ada di data lama (kelas & halaqah lama)
insert into public.santri(id, organization_id, nama, marhalah, kelas, kode, status) values
  (9303, '11111111-1111-1111-1111-111111111111', 'Santri Tiga', 'MTW LAMA', '7B', 'S-003', 'active');

insert into public.student_classes(organization_id, academic_year_id, santri_id, marhalah, kelas, marhalah_id) values
  ('11111111-1111-1111-1111-111111111111', 9001, 9303, 'MTW LAMA', '7B', '33333333-3333-3333-3333-333333333301');

insert into public.halaqah_santri(organization_id, halaqah_id, santri_id, start_date, end_date, status) values
  ('11111111-1111-1111-1111-111111111111', 9201, 9303, date '2026-07-01', null, 'Aktif');

-- Absensi lama: santri (dengan & tanpa halaqah_id), musammi', status kustom, tanggal rusak
insert into public.attendance(id, organization_id, date, waktu, person_id, peran, status, halaqah_id, academic_year_id) values
  (70001, '11111111-1111-1111-1111-111111111111', '2026-10-01', 'Shubuh', 9301, 'Santri', 'Hadir', 9201, 9001),
  (70002, '11111111-1111-1111-1111-111111111111', '2026-10-01', 'Shubuh', 9302, 'Santri', 'Izin', 9201, 9001),
  (70003, '11111111-1111-1111-1111-111111111111', '2026-10-01', 'Shubuh', 9303, 'Santri', 'Dispensasi', null, 9001),
  (70004, '11111111-1111-1111-1111-111111111111', '2026-10-01', 'Shubuh', 9101, 'Musammi', 'Hadir', null, 9001),
  (70005, '11111111-1111-1111-1111-111111111111', '2026-10-02', 'Ashar', 9301, 'Santri', 'Terlambat', 9201, 9001),
  (70006, '11111111-1111-1111-1111-111111111111', '01/10/2026', 'Shubuh', 9302, 'Santri', 'Hadir', 9201, 9001);

-- Setoran lama: nama surat teks, jenis bebas, arah mundur, format "Surat N"
insert into public.setoran_harian(id, organization_id, santri_id, halaqah_id, tanggal, waktu, surat, ayat, skema, nilai,
  keterangan, jumlah_halaman, kesalahan_kabir, kesalahan_shoghir, surat_mulai, ayat_mulai, surat_selesai, ayat_selesai,
  academic_year_id, status_verifikasi) values
  (80001, '11111111-1111-1111-1111-111111111111', 9301, 9201, date '2026-10-01', 'Shubuh', 'An-Naba''', '1-20', 'Ziyadah', 'Mumtaz',
   'lancar', 1, 0, 1, 'An-Naba''', '1', 'An-Naba''', '20', 9001, 'accepted'),
  (80002, '11111111-1111-1111-1111-111111111111', 9301, 9201, date '2026-10-02', 'Ashar', 'Al-Mulk', '1-30', 'Murojaah', 'Jayyid',
   null, 2.5, 1, 2, null, null, null, null, 9001, 'pending'),
  (80003, '11111111-1111-1111-1111-111111111111', 9302, 9201, date '2026-10-02', 'Isya', 'An-Nas - An-Naba''', '6 - 1', 'Tasmi''', null,
   null, 23, 0, 0, null, null, null, null, 9001, 'submitted'),
  (80004, '11111111-1111-1111-1111-111111111111', 9302, null, date '2026-10-03', 'Shubuh', 'Surat 2', '1-5', 'ziyadah', 'Maqbul',
   null, 0.5, 2, 5, null, null, null, null, null, 'ditolak');
