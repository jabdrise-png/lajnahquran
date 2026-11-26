-- =====================================================================
-- f5_preflight.sql — pemeriksaan SEBELUM migrasi Fase 5 (hanya membaca).
-- Jalankan di SQL Editor, kirim hasilnya bila ada baris berstatus PERIKSA.
-- =====================================================================

with org as (select id, name from public.organizations)
select o.name as lembaga, x.pemeriksaan, x.nilai, x.status
from org o
cross join lateral (
  select 'Nilai ujian semester lama (ujian_semester berisi nilai)' as pemeriksaan,
         (select count(*)::text from public.ujian_semester u where u.organization_id = o.id and u.nilai_akhir is not null) as nilai,
         'INFO' as status
  union all
  select 'Nilai ujian bulanan lama (ujian_bulanan berisi nilai)',
         (select count(*)::text from public.ujian_bulanan u where u.organization_id = o.id and u.nilai is not null), 'INFO'
  union all
  select 'Nilai ujian lama milik santri yang sudah tidak ada (tidak ikut dipindah)',
         n::text, case when n > 0 then 'PERIKSA' else 'OK' end
  from (select (select count(*) from public.ujian_semester u where u.organization_id = o.id and u.nilai_akhir is not null
                 and not exists (select 1 from public.santri s where s.id = u.santri_id and s.organization_id = o.id))
             + (select count(*) from public.ujian_bulanan u where u.organization_id = o.id and u.nilai is not null
                 and not exists (select 1 from public.santri s where s.id = u.santri_id and s.organization_id = o.id)) as n) z
  union all
  select 'Ujian semester lama tanpa tahun ajaran yang sah (tidak ikut dipindah)',
         n::text, case when n > 0 then 'PERIKSA' else 'OK' end
  from (select count(*) n from public.ujian_semester u where u.organization_id = o.id and u.nilai_akhir is not null
          and not exists (select 1 from public.academic_years y where y.id = u.academic_year_id)) z
  union all
  select 'Ujian semester memakai nilai juz custom (nilai lama dipertahankan)',
         (select count(*)::text from public.ujian_semester u where u.organization_id = o.id and exists (select 1 from jsonb_each_text(case when jsonb_typeof(u.is_custom_nilai) = 'object' then u.is_custom_nilai else '{}'::jsonb end) e where lower(e.value) = 'true')), 'INFO'
  union all
  select 'Daftar ujian bulanan di pengaturan (UB_PERIODS_*)',
         (select count(*)::text from public.app_settings a where a.organization_id = o.id and a.key ~ '^UB_PERIODS_'), 'INFO'
  union all
  select 'UB_PERIODS_* yang bukan JSON daftar (tidak ikut dipindah)',
         n::text, case when n > 0 then 'PERIKSA' else 'OK' end
  from (select count(*) n from public.app_settings a where a.organization_id = o.id and a.key ~ '^UB_PERIODS_'
          and btrim(coalesce(a.value, '')) not like '[%') z
  union all
  select 'Bobot raport lama (PCT_UJIAN_SEMESTER / BULANAN / SILABUS / KEHADIRAN)',
         coalesce((select string_agg(a.key || '=' || coalesce(a.value, ''), ', ' order by a.key) from public.app_settings a
                   where a.organization_id = o.id and a.key like 'PCT\_%'), 'tidak ada (pakai 60/40/0)'), 'INFO'
  union all
  select 'Percobaan ujian dari aplikasi lama (exam_attempts)',
         (select count(*)::text from public.exam_attempts a where a.organization_id = o.id), 'INFO'
  union all
  select 'Raport sudah terbit (report_cards published)',
         (select count(*)::text from public.report_cards r where r.organization_id = o.id and r.status = 'published'), 'INFO'
) x
order by o.name, x.pemeriksaan;
