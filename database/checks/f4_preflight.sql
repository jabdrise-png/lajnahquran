-- =====================================================================
-- f4_preflight.sql — pemeriksaan SEBELUM migrasi Fase 4 (hanya membaca).
-- Jalankan di SQL Editor, kirim hasilnya bila ada baris berstatus PERIKSA.
-- =====================================================================

with org as (select id, name from public.organizations),
periode_json as (
  select a.organization_id, a.value from public.app_settings a where a.key = 'EVALUATION_PERIODS'
),
kunci as (
  select organization_id, month_key, count(*) n from public.student_progress group by 1, 2
  union all
  select organization_id, month_key, count(*) from public.student_evaluation group by 1, 2
)
select o.name as lembaga, x.pemeriksaan, x.nilai, x.status
from org o
cross join lateral (
  select 'Format EVALUATION_PERIODS' as pemeriksaan,
         coalesce((select case when btrim(value) like '[%' then 'JSON' when value is null or btrim(value) = '' then 'kosong' else 'daftar koma' end
                   from periode_json p where p.organization_id = o.id), 'tidak ada') as nilai,
         'INFO' as status
  union all
  select 'Periode di EVALUATION_PERIODS',
         coalesce((select case when btrim(value) like '[%' then jsonb_array_length(value::jsonb)::text end from periode_json p where p.organization_id = o.id), '0'),
         'INFO'
  union all
  select 'Kunci periode dipakai data lama (tanpa SEM-*)',
         (select count(distinct month_key)::text from kunci k where k.organization_id = o.id and month_key not like 'SEM-%'), 'INFO'
  union all
  select 'Kunci tanpa tanggal & bukan YYYY-MM (akan ditandai perlu dicek)',
         (select count(distinct k.month_key)::text from kunci k
          where k.organization_id = o.id and k.month_key not like 'SEM-%' and k.month_key !~ '^\d{4}-\d{2}$'
            and not exists (select 1 from periode_json p, jsonb_array_elements(case when btrim(p.value) like '[%' then p.value::jsonb else '[]'::jsonb end) e
                            where p.organization_id = o.id and e->>'id' = k.month_key
                              and coalesce(e->>'startDate', '') ~ '^\d{4}-\d{2}-\d{2}' and coalesce(e->>'endDate', '') ~ '^\d{4}-\d{2}-\d{2}')),
         'INFO'
  union all
  select 'Baris student_progress', (select count(*)::text from public.student_progress sp where sp.organization_id = o.id), 'INFO'
  union all
  select 'Nilai Silabus Hafalan (SEM-*)', (select count(*)::text from public.student_progress sp
          where sp.organization_id = o.id and sp.progress_type = 'Silabus Hafalan'), 'INFO'
  union all
  select 'student_progress santri tidak ditemukan', (select count(*)::text from public.student_progress sp
          where sp.organization_id = o.id and not exists (select 1 from public.santri s where s.id = sp.santri_id and s.organization_id = o.id)),
         case when exists (select 1 from public.student_progress sp where sp.organization_id = o.id
                           and not exists (select 1 from public.santri s where s.id = sp.santri_id and s.organization_id = o.id))
              then 'PERIKSA' else 'OK' end
  union all
  select 'Jenis progres (progress_type)', (select string_agg(distinct sp.progress_type, ', ') from public.student_progress sp where sp.organization_id = o.id), 'INFO'
  union all
  select 'Halaqah aktif', (select count(*)::text from public.halaqah h where h.organization_id = o.id and coalesce(h.is_active, true)), 'INFO'
) x
order by 1, 2;
