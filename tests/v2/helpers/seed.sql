-- Data uji standar: 1 lembaga, 1 superadmin, 1 admin, 1 musammi', 1 halaqah, 2 santri.
-- ID tetap supaya mudah dipakai di test.
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'super@uji.test', '{"role":"superadmin","full_name":"Super Uji"}'),
  ('00000000-0000-0000-0000-00000000b001', 'admin@uji.test', '{"target_organization_id":"11111111-1111-1111-1111-111111111111","full_name":"Admin Uji"}'),
  ('00000000-0000-0000-0000-00000000c001', 'musammi@uji.test', '{"target_organization_id":"11111111-1111-1111-1111-111111111111","full_name":"Ustadz Uji"}'),
  ('00000000-0000-0000-0000-00000000b002', 'admin2@uji.test', '{"target_organization_id":"11111111-1111-1111-1111-111111111111","full_name":"Admin Dua"}')
on conflict do nothing;

insert into public.profiles(id, organization_id, full_name, role, email) values
  ('00000000-0000-0000-0000-00000000a001', null, 'Super Uji', 'super_admin', 'super@uji.test'),
  ('00000000-0000-0000-0000-00000000b001', '11111111-1111-1111-1111-111111111111', 'Admin Uji', 'admin', 'admin@uji.test'),
  ('00000000-0000-0000-0000-00000000c001', '11111111-1111-1111-1111-111111111111', 'Ustadz Uji', 'musammi', 'musammi@uji.test'),
  ('00000000-0000-0000-0000-00000000b002', '11111111-1111-1111-1111-111111111111', 'Admin Dua', 'admin', 'admin2@uji.test')
on conflict (id) do nothing;

insert into public.access_grants(id, user_id, organization_id, role, status) values
  ('a0000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001', null, 'superadmin', 'active'),
  ('a0000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b001', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('a0000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c001', '11111111-1111-1111-1111-111111111111', 'musammi', 'active')
on conflict do nothing;

-- Trigger trg_sync_profile_to_v2_grants sudah membuat grant saat profil dibuat; samakan ID-nya
-- supaya test bisa memakai ID tetap.
update public.access_grants set id = 'a0000000-0000-0000-0000-00000000a001'
  where user_id = '00000000-0000-0000-0000-00000000a001' and role = 'superadmin';
update public.access_grants set id = 'a0000000-0000-0000-0000-00000000b001'
  where user_id = '00000000-0000-0000-0000-00000000b001' and role = 'admin';
update public.access_grants set id = 'a0000000-0000-0000-0000-00000000c001'
  where user_id = '00000000-0000-0000-0000-00000000c001' and role = 'musammi';
-- Admin Dua hanya punya profil (tanpa grant aktif) sampai test membutuhkannya.
delete from public.access_grants where user_id = '00000000-0000-0000-0000-00000000b002';

insert into public.academic_years(id, organization_id, name, active_semester, is_active) values
  (9001, '11111111-1111-1111-1111-111111111111', '2026/2027', 'Ganjil', true)
on conflict do nothing;

insert into public.master_marhalah(id, organization_id, nama, urutan) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'Mutawassithah', 1)
on conflict do nothing;

insert into public.musammi(id, organization_id, nama, academic_year_id, user_id) values
  (9101, '11111111-1111-1111-1111-111111111111', 'Ustadz Uji', 9001, '00000000-0000-0000-0000-00000000c001')
on conflict do nothing;

insert into public.halaqah(id, organization_id, nama, musammi_id, marhalah, jenis, waktu, academic_year_id, marhalah_id) values
  (9201, '11111111-1111-1111-1111-111111111111', 'Halaqah Uji', 9101, 'MTW', 'Reguler', array['Shubuh','Ashar'], 9001, '33333333-3333-3333-3333-333333333301')
on conflict do nothing;

insert into public.santri(id, organization_id, nama, marhalah, kelas, kode, status, marhalah_id) values
  (9301, '11111111-1111-1111-1111-111111111111', 'Santri Satu', 'MTW', '7A', 'S-001', 'active', '33333333-3333-3333-3333-333333333301'),
  (9302, '11111111-1111-1111-1111-111111111111', 'Santri Dua',  'MTW', '7A', 'S-002', 'active', '33333333-3333-3333-3333-333333333301')
on conflict do nothing;

insert into public.halaqah_musammi_assignments(organization_id, academic_year_id, halaqah_id, musammi_id, user_id, musammi_user_id, valid_from) values
  ('11111111-1111-1111-1111-111111111111', 9001, 9201, 9101, '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c001', date '2026-01-01');

insert into public.halaqah_student_memberships(organization_id, academic_year_id, halaqah_id, student_id, valid_from) values
  ('11111111-1111-1111-1111-111111111111', 9001, 9201, 9301, date '2026-01-01'),
  ('11111111-1111-1111-1111-111111111111', 9001, 9201, 9302, date '2026-01-01');
