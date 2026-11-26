-- =====================================================================
-- 2026_11_30_01_f5_ujian_struktur.sql
-- Fase 5 · Ujian & Raport — struktur data
--
-- Tujuan:
--   1. raport_settings: bobot raport 3 komponen (ujian semester, rata-rata ujian bulanan,
--      kehadiran; total 100%), identitas & tanda tangan digital Ketua Lajnah.
--      Nilai awal diambil dari app_settings PCT_* (bobot Silabus dipindah ke ujian semester).
--   2. Rubrik penilaian aktif per lembaga (rubric_versions) dipastikan ada; nilai awal dari
--      app_settings NILAI_AWAL_JUZ, PENGURANG_KHOTO_*, MIN_NILAI_JUZ, GLOBAL_PREDIKAT_NILAI.
--   3. monthly_exam_periods: daftar ujian bulanan per semester (pengganti JSON
--      app_settings UB_PERIODS_*).
--   4. exam_attempts menjadi SATU sumber nilai ujian: kolom period_id, halaqah_id,
--      rubric_version_id, juz_scores, status valid/voided (nilai lama tidak pernah ditimpa).
--   5. exam_assignments: musammi' penguji per halaqah per semester ("halaqah ujian").
--   6. raport_catatan: catatan raport per santri per semester.
--
-- Prasyarat: Fase 4 (2026_11_29_01 .. 03)
-- Rollback:
--   drop table if exists public.raport_catatan, public.exam_assignments, public.raport_settings;
--   alter table public.exam_attempts drop column if exists period_id, drop column if exists halaqah_id,
--     drop column if exists rubric_version_id, drop column if exists juz_scores, drop column if exists status,
--     drop column if exists void_reason, drop column if exists voided_by, drop column if exists voided_at,
--     drop column if exists source;
--   drop table if exists public.monthly_exam_periods;
-- =====================================================================

begin;

create or replace function public.f5_angka(p text)
returns numeric
language sql
immutable
as $$
  select case when btrim(coalesce(p, '')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(btrim(p), ',', '.')::numeric end;
$$;

create or replace function public.f5_semester(p text)
returns text
language sql
immutable
as $$
  select case when lower(btrim(coalesce(p, ''))) in ('genap') then 'Genap' else 'Ganjil' end;
$$;

-- ---------------------------------------------------------------------
-- 1. Pengaturan raport
-- ---------------------------------------------------------------------
create table if not exists public.raport_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  bobot_semester numeric(5,2) not null default 60,
  bobot_bulanan numeric(5,2) not null default 40,
  bobot_kehadiran numeric(5,2) not null default 0,
  ketua_lajnah_nama text,
  ketua_lajnah_jabatan text not null default 'Ketua Lajnah',
  ttd_image text,
  kota_terbit text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint raport_settings_bobot_rentang check (
    bobot_semester > 0 and bobot_semester <= 100 and bobot_bulanan between 0 and 100 and bobot_kehadiran between 0 and 100),
  constraint raport_settings_bobot_total check (bobot_semester + bobot_bulanan + bobot_kehadiran = 100),
  constraint raport_settings_ttd check (ttd_image is null or (ttd_image ~ '^data:image/(png|jpeg|jpg|webp);base64,' and length(ttd_image) <= 400000))
);
comment on table public.raport_settings is 'F5: bobot raport (ujian semester + rata-rata ujian bulanan + kehadiran = 100%) dan tanda tangan digital Ketua Lajnah.';

alter table public.raport_settings enable row level security;
drop policy if exists raport_settings_select on public.raport_settings;
create policy raport_settings_select on public.raport_settings for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
drop policy if exists raport_settings_write on public.raport_settings;
create policy raport_settings_write on public.raport_settings for all to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
grant select, insert, update on public.raport_settings to authenticated;

create or replace function public.fn_touch_raport_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.ketua_lajnah_nama := nullif(btrim(coalesce(new.ketua_lajnah_nama, '')), '');
  new.ketua_lajnah_jabatan := coalesce(nullif(btrim(coalesce(new.ketua_lajnah_jabatan, '')), ''), 'Ketua Lajnah');
  return new;
end;
$$;
drop trigger if exists trg_touch_raport_settings on public.raport_settings;
create trigger trg_touch_raport_settings before insert or update on public.raport_settings
  for each row execute function public.fn_touch_raport_settings();

-- Nilai awal dari app_settings (bobot Silabus Hafalan dipindah ke ujian semester)
do $$
declare
  o record;
  v_s numeric; v_b numeric; v_k numeric; v_sil numeric; v_tot numeric;
begin
  for o in select id from public.organizations loop
    continue when exists (select 1 from public.raport_settings where organization_id = o.id);
    select public.f5_angka(value) into v_s from public.app_settings where organization_id = o.id and key = 'PCT_UJIAN_SEMESTER';
    select public.f5_angka(value) into v_b from public.app_settings where organization_id = o.id and key = 'PCT_UJIAN_BULANAN';
    select public.f5_angka(value) into v_k from public.app_settings where organization_id = o.id and key = 'PCT_KEHADIRAN';
    select public.f5_angka(value) into v_sil from public.app_settings where organization_id = o.id and key = 'PCT_SILABUS';
    -- Bawaan aplikasi lama: semester 50, bulanan 40, silabus 10, kehadiran 0
    v_s := greatest(coalesce(v_s, 50), 0) + greatest(coalesce(v_sil, 10), 0);
    v_b := greatest(coalesce(v_b, 40), 0);
    v_k := greatest(coalesce(v_k, 0), 0);
    v_tot := v_s + v_b + v_k;
    if v_s <= 0 or v_tot <= 0 then
      v_s := 60; v_b := 40; v_k := 0;
    elsif v_tot <> 100 then
      v_b := round(v_b * 100 / v_tot, 2);
      v_k := round(v_k * 100 / v_tot, 2);
      v_s := 100 - v_b - v_k;
    end if;
    insert into public.raport_settings (organization_id, bobot_semester, bobot_bulanan, bobot_kehadiran)
    values (o.id, v_s, v_b, v_k);
  end loop;
end $$;

create or replace function public.fn_seed_raport_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.raport_settings (organization_id) values (new.id) on conflict (organization_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_seed_raport_settings on public.organizations;
create trigger trg_seed_raport_settings after insert on public.organizations
  for each row execute function public.fn_seed_raport_settings();

-- ---------------------------------------------------------------------
-- 2. Rubrik penilaian aktif
-- ---------------------------------------------------------------------
do $$
declare
  o record;
  v_pred jsonb;
  v_txt text;
begin
  for o in select id from public.organizations loop
    continue when exists (select 1 from public.rubric_versions where organization_id = o.id and is_active);
    v_pred := null;
    select value into v_txt from public.app_settings where organization_id = o.id and key = 'GLOBAL_PREDIKAT_NILAI';
    begin
      if btrim(coalesce(v_txt, '')) like '[%' then
        select jsonb_agg(jsonb_build_object('label', e->>'label', 'minScore', coalesce(public.f5_angka(e->>'minScore'), 0))
                         order by coalesce(public.f5_angka(e->>'minScore'), 0) desc)
        into v_pred
        from jsonb_array_elements(v_txt::jsonb) e
        where nullif(btrim(coalesce(e->>'label', '')), '') is not null;
      end if;
    exception when others then
      v_pred := null;
    end;
    insert into public.rubric_versions (organization_id, version_no, name, initial_score, deduction_minor, deduction_major,
      min_score, passing_score, predicates, is_active)
    values (o.id,
      coalesce((select max(version_no) from public.rubric_versions where organization_id = o.id), 0) + 1,
      'Rubrik Penilaian (dari pengaturan lama)',
      coalesce((select public.f5_angka(value) from public.app_settings where organization_id = o.id and key = 'NILAI_AWAL_JUZ'), 100),
      coalesce((select public.f5_angka(value) from public.app_settings where organization_id = o.id and key = 'PENGURANG_KHOTO_SHOGIR'), 1.25),
      coalesce((select public.f5_angka(value) from public.app_settings where organization_id = o.id and key = 'PENGURANG_KHOTO_KABIR'), 5),
      coalesce((select public.f5_angka(value) from public.app_settings where organization_id = o.id and key = 'MIN_NILAI_JUZ'), 50),
      70,
      coalesce(v_pred, '[{"label":"Mumtaz","minScore":90},{"label":"Jayyid Jiddan","minScore":80},{"label":"Jayyid","minScore":70},{"label":"Maqbul","minScore":60},{"label":"Rasib","minScore":0}]'::jsonb),
      true);
  end loop;
end $$;

alter table public.rubric_versions enable row level security;
drop policy if exists rubric_versions_select_f5 on public.rubric_versions;
create policy rubric_versions_select_f5 on public.rubric_versions for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);

-- Rubrik aktif lembaga (versi tertinggi yang aktif)
create or replace function public.fn_rubrik_aktif(p_org uuid)
returns public.rubric_versions
language sql
stable
security definer
set search_path = public
as $$
  select r.* from public.rubric_versions r
  where r.organization_id = p_org and r.is_active
  order by r.version_no desc, r.created_at desc limit 1;
$$;
revoke all on function public.fn_rubrik_aktif(uuid) from public, anon;
grant execute on function public.fn_rubrik_aktif(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Daftar ujian bulanan per semester
-- ---------------------------------------------------------------------
create table if not exists public.monthly_exam_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id bigint not null references public.academic_years(id) on delete cascade,
  semester text not null check (semester in ('Ganjil', 'Genap')),
  ke smallint not null check (ke between 1 and 24),
  label text not null,
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_exam_periods_ke unique (organization_id, academic_year_id, semester, ke),
  constraint monthly_exam_periods_legacy unique (organization_id, legacy_key)
);
comment on table public.monthly_exam_periods is 'F5: ujian bulanan ke-1, ke-2, … per tahun ajaran & semester (pengganti app_settings UB_PERIODS_*).';

alter table public.monthly_exam_periods enable row level security;
drop policy if exists monthly_exam_periods_select on public.monthly_exam_periods;
create policy monthly_exam_periods_select on public.monthly_exam_periods for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
drop policy if exists monthly_exam_periods_write on public.monthly_exam_periods;
create policy monthly_exam_periods_write on public.monthly_exam_periods for all to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
grant select, insert, update, delete on public.monthly_exam_periods to authenticated;

create or replace function public.fn_validate_monthly_exam_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.exam_attempts a where a.period_id = old.id and a.status = 'valid') then
      raise exception 'Ujian bulanan ke-% sudah berisi nilai, tidak bisa dihapus.', old.ke using errcode = '22023';
    end if;
    return old;
  end if;
  new.label := btrim(coalesce(new.label, ''));
  if new.label = '' then new.label := 'Ujian Bulanan ke-' || new.ke; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Pindahkan UB_PERIODS_* (JSON [{id, ke, bulan}]) dari app_settings
do $$
declare
  r record;
  e jsonb;
  v_ke int;
  v_sem text;
  v_year bigint;
begin
  for r in
    select a.organization_id, a.key, a.value from public.app_settings a
    where a.key ~ '^UB_PERIODS_[0-9]+(_[A-Za-z]+)?$'
    order by length(a.key) desc
  loop
    v_year := (regexp_match(r.key, '^UB_PERIODS_([0-9]+)'))[1]::bigint;
    v_sem := public.f5_semester(coalesce((regexp_match(r.key, '^UB_PERIODS_[0-9]+_([A-Za-z]+)$'))[1], 'Ganjil'));
    continue when not exists (select 1 from public.academic_years y where y.id = v_year);
    begin
      for e in select x from jsonb_array_elements(case when btrim(coalesce(r.value, '')) like '[%' then r.value::jsonb else '[]'::jsonb end) x loop
        continue when nullif(btrim(coalesce(e->>'id', '')), '') is null;
        continue when exists (select 1 from public.monthly_exam_periods p where p.organization_id = r.organization_id and p.legacy_key = e->>'id');
        v_ke := coalesce(public.f5_angka(e->>'ke')::int, 0);
        if v_ke < 1 or v_ke > 24 or exists (select 1 from public.monthly_exam_periods p
             where p.organization_id = r.organization_id and p.academic_year_id = v_year and p.semester = v_sem and p.ke = v_ke) then
          select coalesce(max(ke), 0) + 1 into v_ke from public.monthly_exam_periods p
          where p.organization_id = r.organization_id and p.academic_year_id = v_year and p.semester = v_sem;
        end if;
        continue when v_ke > 24;
        insert into public.monthly_exam_periods (organization_id, academic_year_id, semester, ke, label, legacy_key)
        values (r.organization_id, v_year, v_sem, v_ke, coalesce(nullif(btrim(coalesce(e->>'bulan', '')), ''), 'Ujian Bulanan ke-' || v_ke), e->>'id');
      end loop;
    exception when others then
      raise notice 'Pengaturan % tidak bisa dibaca (%), dilewati.', r.key, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. exam_attempts: satu sumber nilai ujian
-- ---------------------------------------------------------------------
alter table public.exam_attempts
  add column if not exists period_id uuid references public.monthly_exam_periods(id) on delete restrict,
  add column if not exists halaqah_id bigint,
  add column if not exists rubric_version_id uuid references public.rubric_versions(id) on delete set null,
  add column if not exists juz_scores jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'valid',
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists source text not null default 'aplikasi';

alter table public.exam_attempts drop constraint if exists exam_attempts_status_check;
alter table public.exam_attempts add constraint exam_attempts_status_check check (status in ('valid', 'voided'));
alter table public.exam_attempts drop constraint if exists exam_attempts_source_check;
alter table public.exam_attempts add constraint exam_attempts_source_check check (source in ('aplikasi', 'migrasi'));

update public.exam_attempts set semester_name = public.f5_semester(semester_name)
where semester_name is distinct from public.f5_semester(semester_name);

-- Ujian bulanan: tautkan ke periode lewat kunci lama di detail_json->>'periode'
update public.exam_attempts a set period_id = p.id
from public.monthly_exam_periods p
where a.exam_type = 'monthly' and a.period_id is null and p.organization_id = a.organization_id
  and p.legacy_key = a.detail_json->>'periode';

-- Penomoran percobaan per santri per ujian (per periode untuk ujian bulanan)
with n as (
  select id, row_number() over (
           partition by organization_id, academic_year_id, semester_name, exam_type, santri_id, period_id
           order by attempt_no, created_at, id) as rn
  from public.exam_attempts
)
update public.exam_attempts a set attempt_no = n.rn, is_remedial = (n.rn > 1)
from n where n.id = a.id and (a.attempt_no is distinct from n.rn or a.is_remedial is distinct from (n.rn > 1));

create unique index if not exists idx_exam_attempts_attempt_uniq
  on public.exam_attempts (organization_id, academic_year_id, semester_name, exam_type, santri_id,
                           coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid), attempt_no);
create index if not exists idx_exam_attempts_period on public.exam_attempts (period_id);

-- Nilai ujian hanya ditulis lewat RPC (2026_11_30_02); semua anggota lembaga boleh membaca
alter table public.exam_attempts enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'exam_attempts' loop
    execute format('drop policy if exists %I on public.exam_attempts', p.policyname);
  end loop;
end $$;
create policy exam_attempts_select on public.exam_attempts for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
revoke insert, update, delete on public.exam_attempts from anon, authenticated;
grant select on public.exam_attempts to authenticated;

-- Hapus periode bulanan berisi nilai ditolak (trigger dipasang setelah kolom period_id ada)
drop trigger if exists trg_validate_monthly_exam_period on public.monthly_exam_periods;
create trigger trg_validate_monthly_exam_period before insert or update or delete on public.monthly_exam_periods
  for each row execute function public.fn_validate_monthly_exam_period();

-- ---------------------------------------------------------------------
-- 5. Penguji per halaqah per semester
-- ---------------------------------------------------------------------
create table if not exists public.exam_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id bigint not null references public.academic_years(id) on delete cascade,
  semester text not null check (semester in ('Ganjil', 'Genap')),
  halaqah_id bigint not null,
  musammi_id bigint not null,
  exam_type text not null default 'semua' check (exam_type in ('semua', 'bulanan', 'semester')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint exam_assignments_unique unique (organization_id, academic_year_id, semester, halaqah_id, musammi_id, exam_type),
  constraint exam_assignments_halaqah_tenant foreign key (organization_id, halaqah_id)
    references public.halaqah(organization_id, id) on delete cascade
);
comment on table public.exam_assignments is 'F5: musammi'' penguji untuk santri satu halaqah pada satu semester (selain musammi'' halaqah itu sendiri).';

alter table public.exam_assignments enable row level security;
drop policy if exists exam_assignments_select on public.exam_assignments;
create policy exam_assignments_select on public.exam_assignments for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
drop policy if exists exam_assignments_write on public.exam_assignments;
create policy exam_assignments_write on public.exam_assignments for all to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
grant select, insert, delete on public.exam_assignments to authenticated;

create or replace function public.fn_validate_exam_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.musammi m where m.id = new.musammi_id and m.organization_id = new.organization_id) then
    raise exception 'Musammi'' penguji tidak ditemukan di lembaga ini.' using errcode = '22023';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;
drop trigger if exists trg_validate_exam_assignment on public.exam_assignments;
create trigger trg_validate_exam_assignment before insert or update on public.exam_assignments
  for each row execute function public.fn_validate_exam_assignment();

-- ---------------------------------------------------------------------
-- 6. Catatan raport per santri per semester
-- ---------------------------------------------------------------------
create table if not exists public.raport_catatan (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id bigint not null references public.academic_years(id) on delete cascade,
  semester text not null check (semester in ('Ganjil', 'Genap')),
  santri_id bigint not null,
  catatan text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, academic_year_id, semester, santri_id),
  constraint raport_catatan_santri_tenant foreign key (organization_id, santri_id)
    references public.santri(organization_id, id) on delete cascade
);
alter table public.raport_catatan enable row level security;
drop policy if exists raport_catatan_select on public.raport_catatan;
create policy raport_catatan_select on public.raport_catatan for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
grant select on public.raport_catatan to authenticated;
-- Penulisan lewat rpc_simpan_catatan_raport

commit;
