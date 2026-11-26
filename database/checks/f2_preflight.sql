-- =====================================================================
-- database/checks/f2_preflight.sql
-- Pemeriksaan SEBELUM menjalankan migrasi Fase 2 (hanya membaca, tidak mengubah apa pun).
--
-- Cara pakai: Supabase > SQL Editor > tempel seluruh isi file ini > Run.
-- Semua baris berstatus "OK" = aman lanjut. Baris "PERIKSA" = kirim hasilnya
-- ke pengembang dulu (database Anda berbeda dari repo, seperti kasus BUG-01).
-- =====================================================================

with
req_tables(t) as (values
  ('organizations'), ('academic_years'), ('santri'), ('musammi'), ('halaqah'),
  ('master_marhalah'), ('master_kelas_relasi'), ('app_settings'), ('profiles'),
  ('access_grants'), ('tenant_invitations'), ('user_profiles'), ('audit_logs'),
  ('halaqah_sessions'), ('attendance_records'), ('recitation_entries'), ('recitation_revisions'),
  ('halaqah_student_memberships'), ('student_enrollments'), ('halaqah_musammi_assignments'),
  ('report_cards'), ('support_access_sessions'),
  ('setoran_harian'), ('attendance'), ('halaqah_santri'), ('student_classes')
),
req_cols(t, c) as (values
  ('recitation_entries', 'legacy_setoran_id'), ('recitation_entries', 'santri_id'), ('recitation_entries', 'kind'),
  ('recitation_entries', 'surah_start_no'), ('recitation_entries', 'calculated_pages'),
  ('recitation_entries', 'major_mistakes'), ('recitation_entries', 'minor_mistakes'),
  ('attendance_records', 'session_id'), ('attendance_records', 'santri_id'), ('attendance_records', 'status'),
  ('halaqah_sessions', 'roster_snapshot'), ('halaqah_student_memberships', 'student_id'),
  ('student_enrollments', 'student_id'), ('student_enrollments', 'master_marhalah_id'),
  ('santri', 'kode'), ('santri', 'marhalah_id'), ('santri', 'kelas_id'), ('halaqah', 'marhalah_id'),
  ('setoran_harian', 'skema'), ('setoran_harian', 'surat_mulai'), ('setoran_harian', 'status_verifikasi'),
  ('attendance', 'peran'), ('attendance', 'person_id'), ('attendance', 'date'), ('attendance', 'waktu'),
  ('access_grants', 'role'), ('access_grants', 'organization_id')
),
req_fns(f) as (values
  ('is_super_admin'), ('is_admin_of_org'), ('get_role_for_org'), ('get_my_org_id'),
  ('is_musammi_assigned_to_halaqah'), ('is_musammi_assigned_to_halaqah_on_date'), ('has_active_support_session'),
  ('rpc_submit_recitation_entry'), ('rpc_review_recitation_entry'), ('rpc_save_attendance_batch'),
  ('rpc_open_halaqah_session'), ('rpc_manage_access_grant'), ('fn_alasan_valid')
)
select * from (
  select 1 as urut, 'Tabel ' || t as pemeriksaan,
         case when to_regclass('public.' || t) is not null then 'OK' else 'PERIKSA: tabel tidak ada' end as hasil
  from req_tables
  union all
  select 2, 'Kolom ' || t || '.' || c,
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c)
              then 'OK' else 'PERIKSA: kolom tidak ada' end
  from req_cols
  union all
  select 3, 'Fungsi ' || f || '()',
         case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f)
              then 'OK' else 'PERIKSA: fungsi tidak ada' || case when f = 'fn_alasan_valid' then ' (jalankan migrasi Fase 1 dulu)' else '' end end
  from req_fns
  union all
  select 4, 'Migrasi Fase 1 sudah dijalankan',
         case when exists (select 1 from pg_trigger where tgname = 'trg_guard_access_grants') then 'OK'
              else 'PERIKSA: jalankan 2026_11_26_01 s.d. 2026_11_27_01 dulu' end
  union all
  select 5, 'NIS (santri.kode) ganda',
         coalesce((select 'PERIKSA: ' || count(*) || ' NIS ganda (indeks unik NIS akan ditunda)'
                   from (select organization_id, lower(btrim(kode)) from public.santri
                         where nullif(btrim(kode), '') is not null group by 1, 2 having count(*) > 1) d
                   having count(*) > 0), 'OK')
  union all
  select 6, 'Santri tanpa NIS (boleh, tetapi santri BARU wajib NIS)',
         'INFO: ' || (select count(*) from public.santri where nullif(btrim(kode), '') is null) || ' santri'
  union all
  select 7, 'Absensi lama bertanggal tidak valid (tidak bisa dipindah)',
         'INFO: ' || (select count(*) from public.attendance where date !~ '^\d{4}-\d{2}-\d{2}$') || ' baris'
  union all
  select 8, 'Status kehadiran lama yang dipakai',
         'INFO: ' || coalesce((select string_agg(distinct status, ', ') from public.attendance), '-')
  union all
  select 9, 'Jenis setoran lama (setoran_harian.skema) yang dipakai',
         'INFO: ' || coalesce((select string_agg(distinct coalesce(skema, '(kosong)'), ', ') from public.setoran_harian), '-')
  union all
  select 10, 'Nilai recitation_entries.kind yang dipakai',
         'INFO: ' || coalesce((select string_agg(distinct kind, ', ') from public.recitation_entries), '-')
  union all
  select 11, 'Jumlah baris tabel lama (setoran / absensi / halaqah_santri / student_classes)',
         'INFO: ' || (select count(*) from public.setoran_harian) || ' / ' || (select count(*) from public.attendance)
         || ' / ' || (select count(*) from public.halaqah_santri) || ' / ' || (select count(*) from public.student_classes)
  union all
  select 12, 'Pengguna dengan >1 grant di lembaga sama (sebelum F2 seharusnya 0)',
         'INFO: ' || (select count(*) from (select user_id, organization_id from public.access_grants
                                             where organization_id is not null group by 1, 2 having count(*) > 1) d)
) x
order by urut, pemeriksaan;
