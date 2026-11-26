-- =====================================================================
-- 2026_11_29_03_f4_migrasi_evaluasi_lama.sql
-- Fase 4 · pemindahan data evaluasi lama ke Rekap Periode
--
-- Tujuan (bisa dijalankan berulang; hanya data yang belum pindah yang diproses):
--     app_settings.EVALUATION_PERIODS  -> evaluation_periods (legacy_key = id lama)
--     evaluation_settings (kategori)   -> period_form_fields isian bebas "pilihan"
--     halaqah_evaluation_questions     -> period_form_fields scope 'kegiatan'
--     student_progress + student_evaluation -> period_recaps (sumber 'migrasi')
--         Ziyadah (halaman) -> ziyadah_pages
--         Murojaah (juz)    -> murojaah_pages (x 20)
--         Total Hafalan / Hafalan Depan + Belakang (juz) -> total_juz
--         Surat Ayat Depan "Al-Fatihah 1 - X a"     -> posisi maju (X, a)
--         Surat Ayat Belakang "X 1 - An-Nas 6"      -> posisi mundur (X, ayat terakhir X)
--         kategori evaluasi / kolom kualitas & catatan -> isian bebas
--     halaqah_evaluations -> period_forms (status terkirim, jawaban evaluasi kegiatan)
--     student_progress 'Silabus Hafalan' (month_key SEM-*) -> silabus_scores (nilai raport per semester)
--   Lalu akses aplikasi ke tabel lama (student_progress, student_evaluation,
--   halaqah_evaluations, halaqah_evaluation_questions) dicabut.
--
--   Periode lama tanpa tanggal sah, atau yang tumpang tindih dengan periode lain,
--   ditandai needs_review = true: tampil di Pengaturan Evaluasi agar Admin
--   memperbaiki tanggalnya (form periode itu belum bisa dibuka sebelum diperbaiki).
--
--   Menjalankan ulang / memeriksa:
--     select public.f4_migrate_legacy_evaluations();
--     select * from public.f4_legacy_reconciliation();
--
-- Prasyarat: 2026_11_29_01, 2026_11_29_02
-- Rollback:
--   drop table if exists public.silabus_scores;
--   delete from public.period_recaps where sumber = 'migrasi';
--   delete from public.period_forms where source = 'migrasi';
--   delete from public.period_form_fields where legacy_ref is not null;
--   delete from public.evaluation_periods where legacy_key is not null;
--   grant select, insert, update, delete on public.student_progress, public.student_evaluation,
--     public.halaqah_evaluations, public.halaqah_evaluation_questions to authenticated;
-- =====================================================================

begin;

create or replace function public.f4_angka(p text)
returns numeric
language sql
immutable
as $$
  select case when btrim(coalesce(p, '')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(btrim(p), ',', '.')::numeric end;
$$;

-- "Al-Mulk 1 - An-Nas 6" -> {s1, a1, s2, a2}
create or replace function public.f4_parse_rentang(p text)
returns int[]
language plpgsql
stable
set search_path = public
as $$
declare
  m text[];
  s1 int; s2 int;
begin
  m := regexp_match(coalesce(p, ''), '^\s*(.+?)\s*:?\s*([0-9]+)\s*(?:-|–|—|s\.?d\.?|sampai)\s*(.+?)\s*:?\s*([0-9]+)\s*$', 'i');
  if m is null then return null; end if;
  select no into s1 from public.quran_surahs where name_key = lower(regexp_replace(m[1], '[^A-Za-z]', '', 'g'));
  select no into s2 from public.quran_surahs where name_key = lower(regexp_replace(m[3], '[^A-Za-z]', '', 'g'));
  if s1 is null or s2 is null then return null; end if;
  return array[s1, m[2]::int, s2, m[4]::int];
end;
$$;

create or replace function public.f4_migrate_legacy_evaluations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org record;
  v_item jsonb;
  v_key text;
  v_name text;
  v_start date;
  v_end date;
  v_ay bigint;
  v_review boolean;
  v_txt text;
  v_periods int := 0;
  v_fields int := 0;
  v_recaps int := 0;
  v_forms int := 0;
  r record;
  v_map jsonb;
  v_eval jsonb;
  v_free jsonb;
  v_rng int[];
  v_ms int; v_ma int; v_us int; v_ua int;
  v_total numeric;
  v_kel text;
  v_halaqah bigint;
  v_form uuid;
  v_hit jsonb;
  v_period uuid;
  v_answers jsonb;
  v_list jsonb;
begin
  perform set_config('app.legacy_migration', 'on', true);

  for v_org in select id from public.organizations loop
    -- ---------------- 1. Periode ----------------
    v_txt := null;
    select value into v_txt from public.app_settings where organization_id = v_org.id and key = 'EVALUATION_PERIODS';
    begin
      if btrim(coalesce(v_txt, '')) like '[%' then
        v_list := v_txt::jsonb;
        if jsonb_typeof(v_list) <> 'array' then v_list := '[]'::jsonb; end if;
      else
        v_list := coalesce((select jsonb_agg(jsonb_build_object('id', btrim(x)))
                            from unnest(string_to_array(coalesce(v_txt, ''), ',')) x where btrim(x) <> ''), '[]'::jsonb);
      end if;
    exception when others then
      raise notice 'EVALUATION_PERIODS lembaga % tidak bisa dibaca (%); periode diambil dari data evaluasi saja.', v_org.id, sqlerrm;
      v_list := '[]'::jsonb;
    end;
    for v_item in
      select e from jsonb_array_elements(v_list) e where jsonb_typeof(e) = 'object'
      union all
      -- month_key yang dipakai data lama tetapi tidak ada di daftar periode
      select jsonb_build_object('id', k.month_key) from (
        select month_key from public.student_progress where organization_id = v_org.id and month_key not like 'SEM-%'
        union select month_key from public.student_evaluation where organization_id = v_org.id and month_key not like 'SEM-%'
        union select month_key from public.halaqah_evaluations where organization_id = v_org.id and month_key not like 'SEM-%'
      ) k
    loop
      v_key := nullif(btrim(v_item->>'id'), '');
      continue when v_key is null or v_key like 'SEM-%';
      continue when exists (select 1 from public.evaluation_periods where organization_id = v_org.id and legacy_key = v_key);
      v_name := coalesce(nullif(btrim(coalesce(v_item->>'name', v_item->>'nama')), ''), v_key);
      v_start := case when coalesce(v_item->>'startDate', '') ~ '^\d{4}-\d{2}-\d{2}' then left(v_item->>'startDate', 10)::date end;
      v_end := case when coalesce(v_item->>'endDate', '') ~ '^\d{4}-\d{2}-\d{2}' then left(v_item->>'endDate', 10)::date end;
      v_review := false;
      if v_start is null or v_end is null or v_end < v_start then
        if v_key ~ '^\d{4}-\d{2}$' then
          v_start := (v_key || '-01')::date;
          v_end := (v_start + interval '1 month' - interval '1 day')::date;
        elsif v_key ~ '^\d{4}-\d{2}-\d{2}$' then
          v_start := v_key::date;
          v_end := (v_start + interval '1 month' - interval '1 day')::date;
          v_review := true;
        else
          v_start := current_date; v_end := current_date; v_review := true;
        end if;
      end if;
      v_ay := coalesce(public.f4_angka(v_item->>'academic_year_id')::bigint,
        (select sp.academic_year_id from public.student_progress sp where sp.organization_id = v_org.id and sp.month_key = v_key
         group by sp.academic_year_id order by count(*) desc limit 1));
      if v_ay is not null and not exists (select 1 from public.academic_years where id = v_ay) then v_ay := null; end if;
      if not v_review and exists (
          select 1 from public.evaluation_periods p where p.organization_id = v_org.id and not p.needs_review
            and daterange(p.start_date, p.end_date, '[]') && daterange(v_start, v_end, '[]')) then
        v_review := true;
      end if;
      insert into public.evaluation_periods (organization_id, academic_year_id, name, start_date, end_date, legacy_key, needs_review)
      values (v_org.id, v_ay, v_name, v_start, v_end, v_key, v_review)
      on conflict (organization_id, legacy_key) do nothing;
      v_periods := v_periods + 1;
    end loop;

    -- ---------------- 2. Isian ----------------
    insert into public.period_form_fields (organization_id, scope, label, field_type, options, sort_order, legacy_ref)
    select v_org.id, 'santri', c.category, 'choice',
           (select jsonb_agg(jsonb_build_object('label', es.label, 'score', es.score) order by es.score desc nulls last, es.id)
            from public.evaluation_settings es where es.organization_id = v_org.id and es.category = c.category),
           20 + row_number() over (order by c.category), 'evaluation_settings:' || c.category
    from (select distinct category from public.evaluation_settings where organization_id = v_org.id and btrim(category) <> '') c
    on conflict (organization_id, legacy_ref) do nothing;

    insert into public.period_form_fields (organization_id, scope, label, field_type, sort_order, legacy_ref)
    select v_org.id, 'santri', x.label, 'text', x.ord, 'student_evaluation:' || x.col
    from (values ('kualitas_hafalan', 'Kualitas Hafalan', 60), ('kualitas_bacaan', 'Kualitas Bacaan', 61),
                 ('sikap_prilaku', 'Sikap & Perilaku', 62), ('catatan_musammi', 'Catatan Musammi''', 63),
                 ('catatan_muroqib', 'Catatan Muroqib', 64), ('catatan_lajnah', 'Catatan Lajnah', 65)) x(col, label, ord)
    where exists (select 1 from public.student_evaluation se where se.organization_id = v_org.id
                  and nullif(btrim(coalesce(to_jsonb(se)->>x.col, '')), '') is not null)
    on conflict (organization_id, legacy_ref) do nothing;

    -- Jenis progres lain yang bukan isian sistem & bukan kategori evaluasi
    insert into public.period_form_fields (organization_id, scope, label, field_type, sort_order, legacy_ref)
    select v_org.id, 'santri', t.progress_type, 'text', 80, 'student_progress:' || t.progress_type
    from (select distinct progress_type from public.student_progress where organization_id = v_org.id) t
    where t.progress_type not in ('Ziyadah', 'Murojaah', 'Total Hafalan', 'Hafalan Depan', 'Hafalan Belakang',
                                  'Surat Ayat Depan', 'Surat Ayat Belakang', 'Penambahan Hafalan', 'Hafalan', 'Silabus Hafalan')
      and not exists (select 1 from public.evaluation_settings es where es.organization_id = v_org.id and es.category = t.progress_type)
      and btrim(t.progress_type) <> ''
    on conflict (organization_id, legacy_ref) do nothing;

    insert into public.period_form_fields (organization_id, scope, label, field_type, options, description, sort_order, legacy_ref)
    select v_org.id, 'kegiatan', btrim(q.question),
           case when q.type = 'dropdown' and jsonb_typeof(q.options) = 'array' and jsonb_array_length(q.options) > 0 then 'choice' else 'text' end,
           case when q.type = 'dropdown' and jsonb_typeof(q.options) = 'array' and jsonb_array_length(q.options) > 0
                then (select jsonb_agg(jsonb_build_object('label', coalesce(o->>'label', o #>> '{}'), 'color', o->>'color'))
                      from jsonb_array_elements(q.options) o)
                else '[]'::jsonb end,
           q.description, row_number() over (order by q.id), 'halaqah_evaluation_questions:' || q.id
    from public.halaqah_evaluation_questions q
    where q.organization_id = v_org.id and btrim(coalesce(q.question, '')) <> ''
    on conflict (organization_id, legacy_ref) do nothing;
    get diagnostics v_fields = row_count;

    -- ---------------- 3. Rekap santri ----------------
    for r in
      select k.month_key, k.santri_id,
             (select jsonb_object_agg(sp.progress_type, sp.value) from public.student_progress sp
              where sp.organization_id = v_org.id and sp.month_key = k.month_key and sp.santri_id = k.santri_id) as prog,
             (select to_jsonb(se) from public.student_evaluation se
              where se.organization_id = v_org.id and se.month_key = k.month_key and se.santri_id = k.santri_id
              order by se.academic_year_id desc nulls last, se.id desc limit 1) as eval
      from (
        select month_key, santri_id from public.student_progress
        where organization_id = v_org.id and month_key not like 'SEM-%' and progress_type <> 'Silabus Hafalan'
        union select month_key, santri_id from public.student_evaluation where organization_id = v_org.id and month_key not like 'SEM-%'
      ) k
      join public.santri s on s.id = k.santri_id and s.organization_id = v_org.id
    loop
      select id into v_period from public.evaluation_periods where organization_id = v_org.id and legacy_key = r.month_key;
      continue when v_period is null;
      continue when exists (select 1 from public.period_recaps where period_id = v_period and santri_id = r.santri_id);
      v_map := coalesce(r.prog, '{}'::jsonb);
      v_eval := r.eval;

      v_ms := null; v_ma := null; v_us := null; v_ua := null;
      v_rng := public.f4_parse_rentang(v_map->>'Surat Ayat Depan');
      if v_rng is not null and v_rng[1] = 1 and v_rng[2] = 1 then v_ms := v_rng[3]; v_ma := v_rng[4]; end if;
      v_rng := public.f4_parse_rentang(v_map->>'Surat Ayat Belakang');
      if v_rng is not null and v_rng[3] = 114 and v_rng[2] = 1 then
        v_us := v_rng[1]; select ayah_count into v_ua from public.quran_surahs where no = v_rng[1];
      end if;
      v_total := coalesce(public.f4_angka(v_map->>'Total Hafalan'),
        case when v_map ? 'Hafalan Depan' or v_map ? 'Hafalan Belakang'
             then coalesce(public.f4_angka(v_map->>'Hafalan Depan'), 0) + coalesce(public.f4_angka(v_map->>'Hafalan Belakang'), 0) end);

      select f.predicate into v_kel from public.fluency_rules f
      where f.organization_id = v_org.id and f.predicate in (v_map->>'Kelancaran', v_map->>'Hafalan')
      order by case when f.predicate = v_map->>'Kelancaran' then 0 else 1 end limit 1;

      select coalesce(jsonb_object_agg(ff.id::text, case when ff.field_type = 'choice' or ff.field_type = 'text' then to_jsonb(e.value) end), '{}'::jsonb)
      into v_free
      from public.period_form_fields ff
      join lateral (
        select v_map->>substr(ff.legacy_ref, length('evaluation_settings:') + 1) as value
        where ff.legacy_ref like 'evaluation_settings:%'
        union all
        select v_map->>substr(ff.legacy_ref, length('student_progress:') + 1) where ff.legacy_ref like 'student_progress:%'
        union all
        select v_eval->>substr(ff.legacy_ref, length('student_evaluation:') + 1) where ff.legacy_ref like 'student_evaluation:%'
      ) e on nullif(btrim(coalesce(e.value, '')), '') is not null
      where ff.organization_id = v_org.id and ff.scope = 'santri' and ff.legacy_ref is not null;
      -- Nilai pilihan yang tidak ada di daftar pilihan tetap disimpan apa adanya (data lama)

      v_halaqah := public.fn_halaqah_pemilik(v_org.id, r.santri_id, v_period);
      v_form := null;
      if v_halaqah is not null then
        insert into public.period_forms (organization_id, period_id, halaqah_id, recording_mode, status, source, submitted_at)
        values (v_org.id, v_period, v_halaqah, 'rekap', 'submitted', 'migrasi', now())
        on conflict (period_id, halaqah_id) do nothing;
        select id into v_form from public.period_forms where period_id = v_period and halaqah_id = v_halaqah;
      end if;

      v_hit := public.fn_hitung_rekap_santri(v_period, r.santri_id);
      insert into public.period_recaps (organization_id, period_id, santri_id, halaqah_id, form_id, sumber,
        ziyadah_pages, murojaah_pages, posisi_maju_surah, posisi_maju_ayah, posisi_mundur_surah, posisi_mundur_ayah,
        total_pages, total_juz, kelancaran, hadir_count, kehadiran_total, kehadiran_persen,
        free_answers, notes, legacy_payload, computed_at)
      values (v_org.id, v_period, r.santri_id, v_halaqah, v_form, 'migrasi',
        public.f4_angka(v_map->>'Ziyadah'),
        round(public.f4_angka(v_map->>'Murojaah') * 20, 2),
        v_ms, v_ma, v_us, v_ua,
        case when v_total is not null then round(v_total * 20, 2) end, round(v_total, 2), v_kel,
        (v_hit->>'hadir_count')::int, (v_hit->>'kehadiran_total')::int, (v_hit->>'kehadiran_persen')::numeric,
        v_free, null,
        jsonb_build_object('month_key', r.month_key, 'student_progress', v_map, 'student_evaluation', v_eval), now())
      on conflict (period_id, santri_id) do nothing;
      v_recaps := v_recaps + 1;
    end loop;

    -- ---------------- 4. Evaluasi kegiatan halaqah ----------------
    for r in select he.* from public.halaqah_evaluations he
             join public.halaqah h on h.id = he.halaqah_id and h.organization_id = he.organization_id
             where he.organization_id = v_org.id loop
      select id into v_period from public.evaluation_periods where organization_id = v_org.id and legacy_key = r.month_key;
      continue when v_period is null;
      select coalesce(jsonb_object_agg(ff.id::text, a.value), '{}'::jsonb) into v_answers
      from jsonb_each(case when jsonb_typeof(r.answers) = 'object' then r.answers else '{}'::jsonb end) a
      join public.period_form_fields ff on ff.organization_id = v_org.id and ff.legacy_ref = 'halaqah_evaluation_questions:' || a.key
      where nullif(btrim(coalesce(a.value #>> '{}', '')), '') is not null;
      insert into public.period_forms (organization_id, period_id, halaqah_id, recording_mode, status, source, submitted_at, activity_answers)
      values (v_org.id, v_period, r.halaqah_id, 'rekap', 'submitted', 'migrasi', coalesce(r.created_at, now()), v_answers)
      on conflict (period_id, halaqah_id) do update
        set activity_answers = case when public.period_forms.activity_answers = '{}'::jsonb
                                    then excluded.activity_answers else public.period_forms.activity_answers end
        where public.period_forms.source = 'migrasi';
      v_forms := v_forms + 1;
    end loop;
  end loop;

  return jsonb_build_object('periode', v_periods, 'rekap', v_recaps, 'form_kegiatan', v_forms);
end;
$$;
revoke all on function public.f4_migrate_legacy_evaluations() from public, anon, authenticated;

create or replace function public.f4_legacy_reconciliation()
returns table (organization_id uuid, pemeriksaan text, data_lama bigint, data_baru bigint, status text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, 'Rekap santri per periode', l.n, b.n, case when l.n = b.n then 'OK' else 'PERIKSA' end
  from public.organizations o
  cross join lateral (select count(*) as n from (
      select month_key, santri_id from public.student_progress sp
      where sp.organization_id = o.id and sp.month_key not like 'SEM-%' and sp.progress_type <> 'Silabus Hafalan'
      union select month_key, santri_id from public.student_evaluation se where se.organization_id = o.id and se.month_key not like 'SEM-%') k
      join public.santri s on s.id = k.santri_id and s.organization_id = o.id) l
  cross join lateral (select count(*) as n from public.period_recaps pr where pr.organization_id = o.id and pr.sumber = 'migrasi') b
  union all
  select o.id, 'Evaluasi kegiatan halaqah', l.n, b.n, case when l.n <= b.n then 'OK' else 'PERIKSA' end
  from public.organizations o
  cross join lateral (select count(*) as n from public.halaqah_evaluations he where he.organization_id = o.id) l
  cross join lateral (select count(*) as n from public.period_forms pf where pf.organization_id = o.id and pf.source = 'migrasi'
                      and pf.activity_answers <> '{}'::jsonb) b
  union all
  select o.id, 'Periode perlu dicek tanggalnya', 0, count(p.id),
         case when count(p.id) = 0 then 'OK' else 'PERIKSA' end
  from public.organizations o left join public.evaluation_periods p on p.organization_id = o.id and p.needs_review
  group by o.id;
$$;
revoke all on function public.f4_legacy_reconciliation() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Nilai Silabus Hafalan per semester (komponen raport). Dulu disimpan di
-- student_progress dengan month_key sintetis 'SEM-{tahun ajaran}-{semester}'.
-- ---------------------------------------------------------------------
create table if not exists public.silabus_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  santri_id bigint not null,
  academic_year_id bigint not null references public.academic_years(id) on delete cascade,
  semester text not null,
  score numeric(6,2) not null check (score >= 0 and score <= 100),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint silabus_scores_unique unique (organization_id, santri_id, academic_year_id, semester),
  constraint silabus_scores_santri_tenant foreign key (organization_id, santri_id)
    references public.santri(organization_id, id) on delete cascade
);
comment on table public.silabus_scores is 'Fase 4: nilai Silabus Hafalan per santri per semester (raport). Pengganti student_progress month_key SEM-*.';
alter table public.silabus_scores enable row level security;
drop policy if exists silabus_scores_select on public.silabus_scores;
create policy silabus_scores_select on public.silabus_scores for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
drop policy if exists silabus_scores_write on public.silabus_scores;
create policy silabus_scores_write on public.silabus_scores for all to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
grant select, insert, update, delete on public.silabus_scores to authenticated;

insert into public.silabus_scores (organization_id, santri_id, academic_year_id, semester, score)
select sp.organization_id, sp.santri_id, m[1]::bigint, m[2], least(100, greatest(0, public.f4_angka(sp.value)))
from public.student_progress sp
cross join lateral regexp_match(sp.month_key, '^SEM-([0-9]+)-(.+)$') m
join public.santri s on s.id = sp.santri_id and s.organization_id = sp.organization_id
join public.academic_years ay on ay.id = m[1]::bigint
where sp.progress_type = 'Silabus Hafalan' and m is not null and public.f4_angka(sp.value) is not null
on conflict (organization_id, santri_id, academic_year_id, semester) do nothing;

do $$ begin perform public.f4_migrate_legacy_evaluations(); end $$;

-- Aplikasi tidak lagi memakai tabel evaluasi lama
revoke select, insert, update, delete on public.student_progress from anon, authenticated;
revoke select, insert, update, delete on public.student_evaluation from anon, authenticated;
revoke select, insert, update, delete on public.halaqah_evaluations from anon, authenticated;
revoke select, insert, update, delete on public.halaqah_evaluation_questions from anon, authenticated;

commit;
