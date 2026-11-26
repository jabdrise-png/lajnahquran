-- =====================================================================
-- 2026_11_30_03_f5_migrasi_ujian_lama.sql
-- Fase 5 · pemindahan nilai ujian lama ke exam_attempts (satu sumber nilai)
--
-- Tujuan (bisa dijalankan berulang; hanya data yang belum pindah yang diproses):
--   ujian_semester  -> exam_attempts 'semester' (percobaan 1, source 'migrasi') bila santri belum
--                      punya percobaan semester pada tahun ajaran & semester itu. Khoto per juz
--                      dipindah ke juz_scores; nilai akhir lama DIPERTAHANKAN apa adanya
--                      (termasuk nilai juz "custom" aplikasi lama).
--                      catatan -> raport_catatan.
--   ujian_bulanan   -> exam_attempts 'monthly' per ujian bulanan (periode dibuat bila belum ada).
--   Lalu akses aplikasi ke ujian_bulanan & ujian_semester dicabut.
--
--   Menjalankan ulang / memeriksa:
--     select public.f5_migrate_legacy_exams();
--     select * from public.f5_legacy_reconciliation();
--
-- Prasyarat: 2026_11_30_01, 2026_11_30_02
-- Rollback:
--   delete from public.exam_attempts where source = 'migrasi';
--   grant select, insert, update, delete on public.ujian_bulanan, public.ujian_semester to authenticated;
-- =====================================================================

begin;

create or replace function public.f5_migrate_legacy_exams()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_juz jsonb;
  v_rubric public.rubric_versions;
  v_period uuid;
  v_year bigint;
  v_sem text;
  v_ke int;
  v_sem_n int := 0;
  v_bln_n int := 0;
  v_cat_n int := 0;
begin
  perform set_config('app.legacy_migration', 'on', true);

  -- ---------------- Ujian semester ----------------
  for r in
    select us.*, public.f5_semester(us.semester) as sem
    from public.ujian_semester us
    join public.santri s on s.id = us.santri_id and s.organization_id = us.organization_id
    join public.academic_years y on y.id = us.academic_year_id
  loop
    if nullif(btrim(coalesce(r.catatan, '')), '') is not null then
      insert into public.raport_catatan (organization_id, academic_year_id, semester, santri_id, catatan)
      values (r.organization_id, r.academic_year_id, r.sem, r.santri_id, left(btrim(r.catatan), 2000))
      on conflict do nothing;
      if found then v_cat_n := v_cat_n + 1; end if;
    end if;
    continue when r.nilai_akhir is null;
    continue when exists (select 1 from public.exam_attempts a where a.organization_id = r.organization_id
      and a.academic_year_id = r.academic_year_id and a.semester_name = r.sem and a.exam_type = 'semester' and a.santri_id = r.santri_id);
    v_rubric := public.fn_rubrik_aktif(r.organization_id);
    select coalesce(jsonb_agg(jsonb_build_object(
             'juz', j.juz,
             'kabir', coalesce(public.f5_angka(r.khoto_kabir->>j.juz::text), 0),
             'shoghir', coalesce(public.f5_angka(r.khoto_shogir->>j.juz::text), 0),
             'nilai', case when lower(coalesce(r.is_custom_nilai->>j.juz::text, 'false')) = 'true'
                           then public.f5_angka(r.custom_nilai->>j.juz::text)
                           else public.fn_nilai_juz(v_rubric, public.f5_angka(r.khoto_kabir->>j.juz::text), public.f5_angka(r.khoto_shogir->>j.juz::text)) end)
           order by j.juz), '[]'::jsonb)
    into v_juz
    from (
      select distinct k::int as juz
      from (select jsonb_object_keys(coalesce(r.khoto_kabir, '{}'::jsonb)) k
            union select jsonb_object_keys(coalesce(r.khoto_shogir, '{}'::jsonb))
            union select jsonb_object_keys(coalesce(r.custom_nilai, '{}'::jsonb))) x
      where k ~ '^[0-9]+$' and k::int between 1 and 30
    ) j;
    insert into public.exam_attempts (organization_id, academic_year_id, semester_name, exam_type, santri_id, student_id,
      attempt_no, is_remedial, materi_juz, detail_json, juz_scores, raw_score, final_score, predikat, rubric_version_id,
      passed, remedial_required, status, source, created_at)
    values (r.organization_id, r.academic_year_id, r.sem, 'semester', r.santri_id, r.santri_id, 1, false, r.materi_juz,
      jsonb_build_object('legacy_ujian_semester_id', r.id, 'khoto_kabir', r.khoto_kabir, 'khoto_shogir', r.khoto_shogir,
                         'is_custom_nilai', r.is_custom_nilai, 'custom_nilai', r.custom_nilai),
      v_juz, round(r.nilai_akhir::numeric, 2), round(r.nilai_akhir::numeric, 2),
      public.fn_predikat_nilai(v_rubric, r.nilai_akhir::numeric), v_rubric.id,
      r.nilai_akhir >= coalesce(v_rubric.passing_score, 70), r.nilai_akhir < coalesce(v_rubric.passing_score, 70),
      'valid', 'migrasi', coalesce(r.updated_at, r.created_at, now()));
    v_sem_n := v_sem_n + 1;
  end loop;

  -- ---------------- Ujian bulanan ----------------
  for r in
    select ub.*, s.organization_id as org
    from public.ujian_bulanan ub
    join public.santri s on s.id = ub.santri_id and s.organization_id = ub.organization_id
    where ub.nilai is not null
  loop
    select p.id, p.academic_year_id, p.semester into v_period, v_year, v_sem
    from public.monthly_exam_periods p where p.organization_id = r.org and p.legacy_key = r.periode;
    if v_period is null then
      v_year := r.academic_year_id;
      if v_year is null or not exists (select 1 from public.academic_years y where y.id = v_year) then
        select y.id into v_year from public.academic_years y where y.organization_id = r.org
        order by coalesce(y.is_active, false) desc, y.id desc limit 1;
      end if;
      continue when v_year is null;
      v_sem := public.f5_semester(r.semester);
      select coalesce(max(ke), 0) + 1 into v_ke from public.monthly_exam_periods
      where organization_id = r.org and academic_year_id = v_year and semester = v_sem;
      continue when v_ke > 24;
      insert into public.monthly_exam_periods (organization_id, academic_year_id, semester, ke, label, legacy_key)
      values (r.org, v_year, v_sem, v_ke, coalesce(nullif(btrim(r.periode), ''), 'Ujian Bulanan ke-' || v_ke), r.periode)
      returning id into v_period;
    end if;
    -- Percobaan dari aplikasi lama (rpc_record_exam_attempt) yang belum tertaut ke periode
    update public.exam_attempts a set period_id = v_period, academic_year_id = coalesce(a.academic_year_id, v_year),
      attempt_no = coalesce((select max(x.attempt_no) from public.exam_attempts x where x.period_id = v_period and x.santri_id = r.santri_id), 0)
                   + a.attempt_no
    where a.organization_id = r.org and a.exam_type = 'monthly' and a.period_id is null and a.santri_id = r.santri_id
      and a.detail_json->>'periode' = r.periode;
    continue when exists (select 1 from public.exam_attempts a where a.period_id = v_period and a.santri_id = r.santri_id);
    v_rubric := public.fn_rubrik_aktif(r.org);
    insert into public.exam_attempts (organization_id, academic_year_id, semester_name, exam_type, santri_id, student_id,
      attempt_no, is_remedial, materi_juz, detail_json, raw_score, final_score, predikat, rubric_version_id, period_id,
      passed, remedial_required, status, source, created_at)
    values (r.org, v_year, v_sem, 'monthly', r.santri_id, r.santri_id, 1, false, r.materi_juz,
      jsonb_build_object('legacy_ujian_bulanan_id', r.id, 'periode', r.periode),
      least(greatest(r.nilai, 0), 100), least(greatest(r.nilai, 0), 100),
      public.fn_predikat_nilai(v_rubric, least(greatest(r.nilai, 0), 100)), v_rubric.id, v_period,
      r.nilai >= coalesce(v_rubric.passing_score, 70), r.nilai < coalesce(v_rubric.passing_score, 70),
      'valid', 'migrasi', coalesce(r.updated_at, r.created_at, now()));
    v_bln_n := v_bln_n + 1;
  end loop;

  return jsonb_build_object('ujian_semester', v_sem_n, 'ujian_bulanan', v_bln_n, 'catatan', v_cat_n);
end;
$$;
revoke all on function public.f5_migrate_legacy_exams() from public, anon, authenticated;

create or replace function public.f5_legacy_reconciliation()
returns table (organization_id uuid, pemeriksaan text, data_lama bigint, data_baru bigint, status text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, 'Ujian semester berisi nilai', l.n, b.n, case when b.n >= l.n then 'OK' else 'PERIKSA' end
  from public.organizations o
  cross join lateral (select count(*) as n from public.ujian_semester u join public.santri s on s.id = u.santri_id and s.organization_id = u.organization_id
                      where u.organization_id = o.id and u.nilai_akhir is not null) l
  cross join lateral (select count(distinct (a.santri_id, a.academic_year_id, a.semester_name)) as n from public.exam_attempts a
                      where a.organization_id = o.id and a.exam_type = 'semester') b
  union all
  select o.id, 'Ujian bulanan berisi nilai', l.n, b.n, case when b.n >= l.n then 'OK' else 'PERIKSA' end
  from public.organizations o
  cross join lateral (select count(*) as n from public.ujian_bulanan u join public.santri s on s.id = u.santri_id and s.organization_id = u.organization_id
                      where u.organization_id = o.id and u.nilai is not null) l
  cross join lateral (select count(distinct (a.santri_id, a.period_id)) as n from public.exam_attempts a
                      where a.organization_id = o.id and a.exam_type = 'monthly' and a.period_id is not null) b
  union all
  select o.id, 'Percobaan ujian bulanan tanpa periode', 0,
         (select count(*) from public.exam_attempts a where a.organization_id = o.id and a.exam_type = 'monthly' and a.period_id is null),
         case when exists (select 1 from public.exam_attempts a where a.organization_id = o.id and a.exam_type = 'monthly' and a.period_id is null)
              then 'PERIKSA' else 'OK' end
  from public.organizations o;
$$;
revoke all on function public.f5_legacy_reconciliation() from public, anon, authenticated;

do $$ begin perform public.f5_migrate_legacy_exams(); end $$;

-- Aplikasi tidak lagi memakai tabel ujian lama
revoke select, insert, update, delete on public.ujian_bulanan from anon, authenticated;
revoke select, insert, update, delete on public.ujian_semester from anon, authenticated;

commit;
