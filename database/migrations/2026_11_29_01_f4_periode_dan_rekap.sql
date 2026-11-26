-- =====================================================================
-- 2026_11_29_01_f4_periode_dan_rekap.sql
-- Fase 4 · butir 1–5 & 7 (Rekap Periode — struktur data)
--
-- Tujuan:
--   1. evaluation_periods: periode evaluasi per lembaga (menggantikan JSON
--      app_settings.EVALUATION_PERIODS). Periode tidak boleh tumpang tindih.
--   2. halaqah.recording_mode ('harian' / 'rekap'): mode pencatatan per halaqah.
--      Perubahan berlaku mulai periode berikutnya (mode periode berjalan dibekukan
--      di period_forms).
--   3. period_form_fields: isian form evaluasi periode.
--        scope 'santri'  : isian sistem (ziyadah, murojaah, posisi, kelancaran,
--                          kehadiran — boleh ganti nama, tidak boleh dihapus) dan
--                          isian bebas buatan Admin (angka, pilihan, ya/tidak, teks).
--        scope 'kegiatan': pertanyaan evaluasi kegiatan halaqah.
--   4. period_forms: satu baris per halaqah per periode (status belum diisi /
--      draft / terkirim, mode yang berlaku, jawaban evaluasi kegiatan).
--   5. period_recaps: SATU angka resmi per santri per periode (Rekap Periode).
--   6. quran_juz + fn_total_hafalan(): total hafalan (halaman & juz) dari posisi
--      hafalan maju/mundur, sama dengan lib/totalHafalan.ts.
--
-- Prasyarat: Fase 3 (2026_11_28_01 .. 03)
-- Rollback:
--   drop table if exists public.period_recaps, public.period_forms,
--     public.period_form_fields, public.evaluation_periods, public.quran_juz;
--   alter table public.halaqah drop column if exists recording_mode;
--   drop function if exists public.fn_total_hafalan(int, int, int, int);
--   drop function if exists public.fn_seed_period_fields(uuid);
--   drop trigger if exists trg_seed_period_fields on public.organizations;
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Data juz (Mushaf Madinah 15 baris) & total hafalan dari posisi
-- ---------------------------------------------------------------------
create table if not exists public.quran_juz (
  juz smallint primary key check (juz between 1 and 30),
  start_page smallint not null,
  end_page smallint not null,
  total_pages smallint not null
);
insert into public.quran_juz (juz, start_page, end_page, total_pages) values
(1,1,21,21),(2,22,41,20),(3,42,62,21),(4,62,81,20),(5,82,101,20),(6,102,121,20),(7,121,141,21),(8,142,161,20),
(9,162,181,20),(10,182,201,20),(11,201,221,21),(12,222,241,20),(13,242,261,20),(14,262,281,20),(15,282,301,20),
(16,302,321,20),(17,322,341,20),(18,342,361,20),(19,362,381,20),(20,382,401,20),(21,402,421,20),(22,422,441,20),
(23,442,461,20),(24,462,481,20),(25,482,502,21),(26,502,521,20),(27,522,541,20),(28,542,561,20),(29,562,581,20),
(30,582,604,23)
on conflict (juz) do nothing;
grant select on public.quran_juz to anon, authenticated;

-- Posisi maju (s,a)  : hafal 1:1 s.d. s:a.
-- Posisi mundur (s,a): hafal surat 114 s.d. s+1 penuh + surat s ayat 1..a.
-- Bobot halaman = baris mushaf yang tercover / 15 (min 0.05), halaman penuh = 1.
create or replace function public.fn_total_hafalan(p_maju_surah int, p_maju_ayah int, p_mundur_surah int, p_mundur_ayah int)
returns table (halaman numeric, juz numeric)
language sql
stable
set search_path = public
as $$
  with pos as (
    select
      case when p_maju_surah between 1 and 114 then p_maju_surah end as ms,
      (select least(greatest(coalesce(p_maju_ayah, 1), 1), s.ayah_count) from public.quran_surahs s where s.no = p_maju_surah) as ma,
      case when p_mundur_surah between 1 and 114 then p_mundur_surah end as us,
      (select least(greatest(coalesce(p_mundur_ayah, 1), 1), s.ayah_count) from public.quran_surahs s where s.no = p_mundur_surah) as ua
  ),
  hafal as (
    select q.* from public.quran_ayahs q cross join pos
    where (pos.ms is not null and (q.surah < pos.ms or (q.surah = pos.ms and q.ayah <= pos.ma)))
       or (pos.us is not null and (q.surah > pos.us or (q.surah = pos.us and q.ayah <= pos.ua)))
  ),
  hal as (select page, count(*) as n from hafal group by page),
  semua as (
    select q.page, count(*) as n from public.quran_ayahs q where q.page in (select page from hal) group by q.page
  ),
  baris as (
    select h.page, gs.l from hafal h cross join lateral generate_series(h.start_line::int, h.end_line::int) gs(l)
    union
    select s.start_page, gs.l
    from public.quran_surahs s
    join hafal h1 on h1.surah = s.no and h1.ayah = 1 and h1.page = s.start_page
    cross join lateral (
      select coalesce(max(o.end_line), 0)::int as mx from public.quran_ayahs o where o.page = s.start_page and o.surah <> s.no
    ) prev
    cross join lateral generate_series(prev.mx + 1, h1.start_line::int - 1) gs(l)
    where h1.start_line > 1
  ),
  bobot as (
    select hal.page,
      case when hal.n = semua.n then 1::numeric
           else least(1::numeric, greatest(0.05, round((select count(distinct b.l) from baris b where b.page = hal.page)::numeric / 15, 3)))
      end as w
    from hal join semua on semua.page = hal.page
  )
  select
    coalesce((select round(sum(w), 2) from bobot), 0),
    coalesce((
      select round(sum(least(1::numeric, x.isi / j.total_pages)), 2)
      from public.quran_juz j
      cross join lateral (select coalesce(sum(b.w), 0) as isi from bobot b where b.page between j.start_page and j.end_page) x
    ), 0);
$$;
grant execute on function public.fn_total_hafalan(int, int, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Periode evaluasi
-- ---------------------------------------------------------------------
create table if not exists public.evaluation_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  academic_year_id bigint references public.academic_years(id) on delete set null,
  name text not null,
  start_date date not null,
  end_date date not null,
  legacy_key text,
  needs_review boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_periods_dates_check check (end_date >= start_date),
  constraint evaluation_periods_legacy_key unique (organization_id, legacy_key)
);
create index if not exists idx_evaluation_periods_org_dates on public.evaluation_periods (organization_id, start_date, end_date);
comment on table public.evaluation_periods is 'Fase 4: periode evaluasi per lembaga, tidak boleh tumpang tindih. needs_review = hasil migrasi yang tanggalnya perlu dicek Admin.';

create or replace function public.fn_validate_evaluation_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other public.evaluation_periods%rowtype;
begin
  new.name := btrim(coalesce(new.name, ''));
  if new.name = '' then
    raise exception 'Nama periode wajib diisi.' using errcode = '22023';
  end if;
  if new.end_date < new.start_date then
    raise exception 'Tanggal selesai periode tidak boleh sebelum tanggal mulai.' using errcode = '22023';
  end if;
  -- Periode hasil migrasi yang diperbaiki Admin: tanggal baru wajib lolos aturan tumpang tindih
  if tg_op = 'UPDATE' and old.needs_review and new.needs_review and not public.fn_is_legacy_migration()
     and (new.start_date <> old.start_date or new.end_date <> old.end_date) then
    new.needs_review := false;
  end if;
  if not new.needs_review then
    perform pg_advisory_xact_lock(hashtext('evaluation_periods:' || new.organization_id::text));
    select * into v_other from public.evaluation_periods p
    where p.organization_id = new.organization_id and p.id <> new.id and not p.needs_review
      and daterange(p.start_date, p.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    order by p.start_date limit 1;
    if v_other.id is not null then
      raise exception 'Periode "%" (% s.d. %) tumpang tindih dengan periode "%" (% s.d. %).',
        new.name, to_char(new.start_date, 'DD-MM-YYYY'), to_char(new.end_date, 'DD-MM-YYYY'),
        v_other.name, to_char(v_other.start_date, 'DD-MM-YYYY'), to_char(v_other.end_date, 'DD-MM-YYYY')
        using errcode = '23P01';
    end if;
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_evaluation_period on public.evaluation_periods;
create trigger trg_validate_evaluation_period before insert or update on public.evaluation_periods
  for each row execute function public.fn_validate_evaluation_period();

alter table public.evaluation_periods enable row level security;
drop policy if exists evaluation_periods_select on public.evaluation_periods;
create policy evaluation_periods_select on public.evaluation_periods for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
drop policy if exists evaluation_periods_write on public.evaluation_periods;
create policy evaluation_periods_write on public.evaluation_periods for all to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
grant select, insert, update, delete on public.evaluation_periods to authenticated;

-- Periode yang memuat tanggal tertentu (periode needs_review diabaikan)
create or replace function public.fn_periode_pada(p_org uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.evaluation_periods p
  where p.organization_id = p_org and not p.needs_review and p_date between p.start_date and p.end_date
  order by p.start_date desc limit 1;
$$;
revoke all on function public.fn_periode_pada(uuid, date) from public, anon;
grant execute on function public.fn_periode_pada(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Mode pencatatan per halaqah
-- ---------------------------------------------------------------------
alter table public.halaqah add column if not exists recording_mode text;
do $$
begin
  -- Nilai awal: 'harian' bila halaqah punya setoran harian 60 hari terakhir, selain itu 'rekap'
  update public.halaqah h
  set recording_mode = case when exists (
        select 1 from public.recitation_entries r
        where r.organization_id = h.organization_id and r.halaqah_id = h.id
          and r.recitation_date >= current_date - 60 and r.status = 'accepted'
      ) then 'harian' else 'rekap' end
  where h.recording_mode is null;
end $$;
alter table public.halaqah alter column recording_mode set default 'harian';
alter table public.halaqah alter column recording_mode set not null;
alter table public.halaqah drop constraint if exists halaqah_recording_mode_check;
alter table public.halaqah add constraint halaqah_recording_mode_check check (recording_mode in ('harian', 'rekap'));
comment on column public.halaqah.recording_mode is 'Fase 4: harian = rekap dijumlah dari setoran; rekap = diisi musammi'' di akhir periode. Berlaku mulai periode berikutnya.';

-- ---------------------------------------------------------------------
-- 4. Isian form evaluasi periode
-- ---------------------------------------------------------------------
create table if not exists public.period_form_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (scope in ('santri', 'kegiatan')),
  system_key text check (system_key in ('ziyadah', 'murojaah', 'posisi', 'kelancaran', 'kehadiran')),
  label text not null,
  field_type text not null check (field_type in ('system', 'number', 'choice', 'boolean', 'text')),
  options jsonb not null default '[]'::jsonb,
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  legacy_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_form_fields_system_key unique (organization_id, system_key),
  constraint period_form_fields_legacy_ref unique (organization_id, legacy_ref),
  constraint period_form_fields_system_scope check (system_key is null or (scope = 'santri' and field_type = 'system')),
  constraint period_form_fields_type_scope check (field_type <> 'system' or system_key is not null)
);
comment on table public.period_form_fields is 'Fase 4: isian sistem (system_key, tidak bisa dihapus) dan isian bebas / pertanyaan evaluasi kegiatan buatan Admin.';

create or replace function public.fn_validate_period_form_field()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- pg_trigger_depth() > 1: terhapus berantai karena lembaganya dihapus
    if old.system_key is not null and pg_trigger_depth() <= 1 then
      raise exception 'Isian sistem "%" tidak bisa dihapus. Ganti namanya saja.', old.label using errcode = '22023';
    end if;
    return old;
  end if;
  new.label := btrim(coalesce(new.label, ''));
  if new.label = '' then
    raise exception 'Nama isian wajib diisi.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.system_key is not null then
    if new.system_key is distinct from old.system_key or new.field_type <> old.field_type or new.scope <> old.scope then
      raise exception 'Jenis isian sistem tidak bisa diubah. Ganti namanya saja.' using errcode = '22023';
    end if;
    new.is_active := true;
  end if;
  if tg_op = 'UPDATE' and old.system_key is null and new.system_key is not null then
    raise exception 'Isian bebas tidak bisa dijadikan isian sistem.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.options) <> 'array' then
    raise exception 'Pilihan isian harus berupa daftar.' using errcode = '22023';
  end if;
  if new.field_type = 'choice' and jsonb_array_length(new.options) = 0 then
    raise exception 'Isian pilihan "%" wajib punya minimal satu pilihan.', new.label using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_validate_period_form_field on public.period_form_fields;
create trigger trg_validate_period_form_field before insert or update or delete on public.period_form_fields
  for each row execute function public.fn_validate_period_form_field();

alter table public.period_form_fields enable row level security;
drop policy if exists period_form_fields_select on public.period_form_fields;
create policy period_form_fields_select on public.period_form_fields for select to authenticated
  using (public.get_role_for_org(organization_id) is not null);
drop policy if exists period_form_fields_write on public.period_form_fields;
create policy period_form_fields_write on public.period_form_fields for all to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
grant select, insert, update, delete on public.period_form_fields to authenticated;

create or replace function public.fn_seed_period_fields(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.period_form_fields (organization_id, scope, system_key, label, field_type, description, sort_order)
  values
    (p_org, 'santri', 'ziyadah', 'Ziyadah (halaman)', 'system', 'Hafalan baru dalam periode', 1),
    (p_org, 'santri', 'murojaah', 'Murojaah (halaman)', 'system', 'Jumlah murojaah dalam periode', 2),
    (p_org, 'santri', 'posisi', 'Posisi Hafalan', 'system', 'Sampai surat … ayat …; total hafalan dihitung dari posisi ini', 3),
    (p_org, 'santri', 'kelancaran', 'Kelancaran', 'system', 'Predikat kelancaran periode', 4),
    (p_org, 'santri', 'kehadiran', 'Kehadiran', 'system', 'Persentase hadir dari absensi sesi', 5)
  on conflict (organization_id, system_key) do nothing;
$$;
revoke all on function public.fn_seed_period_fields(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_seed_period_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_seed_period_fields(new.id);
  return new;
end;
$$;
drop trigger if exists trg_seed_period_fields on public.organizations;
create trigger trg_seed_period_fields after insert on public.organizations
  for each row execute function public.fn_trg_seed_period_fields();

do $$
declare r record;
begin
  for r in select id from public.organizations loop
    perform public.fn_seed_period_fields(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Form evaluasi periode (satu per halaqah per periode)
-- ---------------------------------------------------------------------
create table if not exists public.period_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  halaqah_id bigint not null,
  recording_mode text not null check (recording_mode in ('harian', 'rekap')),
  status text not null default 'belum_diisi' check (status in ('belum_diisi', 'draft', 'submitted')),
  activity_answers jsonb not null default '{}'::jsonb,
  source text not null default 'aplikasi' check (source in ('aplikasi', 'migrasi')),
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_forms_period_halaqah unique (period_id, halaqah_id),
  constraint period_forms_halaqah_tenant foreign key (organization_id, halaqah_id)
    references public.halaqah(organization_id, id) on delete cascade
);
create index if not exists idx_period_forms_org_period on public.period_forms (organization_id, period_id);

-- ---------------------------------------------------------------------
-- 6. Rekap Periode (satu baris per santri per periode)
-- ---------------------------------------------------------------------
create table if not exists public.period_recaps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  santri_id bigint not null,
  halaqah_id bigint,
  form_id uuid references public.period_forms(id) on delete set null,
  ziyadah_pages numeric(8,2),
  murojaah_pages numeric(8,2),
  posisi_maju_surah smallint check (posisi_maju_surah between 1 and 114),
  posisi_maju_ayah smallint check (posisi_maju_ayah >= 1),
  posisi_mundur_surah smallint check (posisi_mundur_surah between 1 and 114),
  posisi_mundur_ayah smallint check (posisi_mundur_ayah >= 1),
  total_pages numeric(6,2),
  total_juz numeric(5,2),
  kelancaran text,
  hadir_count integer check (hadir_count >= 0),
  kehadiran_total integer check (kehadiran_total >= 0),
  kehadiran_persen numeric(5,2) check (kehadiran_persen between 0 and 100),
  sumber text not null check (sumber in ('harian', 'rekap', 'migrasi')),
  overrides jsonb not null default '{}'::jsonb,
  free_answers jsonb not null default '{}'::jsonb,
  notes text,
  legacy_payload jsonb,
  computed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_recaps_period_santri unique (period_id, santri_id),
  constraint period_recaps_santri_tenant foreign key (organization_id, santri_id)
    references public.santri(organization_id, id) on delete cascade
);
create index if not exists idx_period_recaps_org_period on public.period_recaps (organization_id, period_id);
create index if not exists idx_period_recaps_santri on public.period_recaps (organization_id, santri_id);
create index if not exists idx_period_recaps_form on public.period_recaps (form_id);
comment on table public.period_recaps is 'Fase 4: Rekap Periode — satu angka resmi per santri per periode. Laporan, target, raport, dan pesan wali membaca tabel ini. overrides = isian sistem Mode Harian yang dikoreksi Admin (tidak ditimpa hitung ulang).';

-- Musammi'' yang memegang halaqah pada periode (atau Admin)
create or replace function public.fn_pegang_halaqah_periode(p_org uuid, p_halaqah_id bigint, p_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin_of_org(p_org), false)
    or coalesce(public.is_musammi_assigned_to_halaqah(p_org, p_halaqah_id), false)
    or exists (
      select 1 from public.evaluation_periods p
      where p.id = p_period_id and p.organization_id = p_org
        and coalesce(public.is_musammi_assigned_to_halaqah_on_date(p_org, p_halaqah_id,
              least(p.end_date, greatest(p.start_date, public.fn_hari_ini_lembaga(p_org)))), false)
    );
$$;
revoke all on function public.fn_pegang_halaqah_periode(uuid, bigint, uuid) from public, anon;
grant execute on function public.fn_pegang_halaqah_periode(uuid, bigint, uuid) to authenticated, service_role;

alter table public.period_forms enable row level security;
drop policy if exists period_forms_select on public.period_forms;
create policy period_forms_select on public.period_forms for select to authenticated
  using (public.fn_pegang_halaqah_periode(organization_id, halaqah_id, period_id));
grant select on public.period_forms to authenticated;

alter table public.period_recaps enable row level security;
drop policy if exists period_recaps_select on public.period_recaps;
create policy period_recaps_select on public.period_recaps for select to authenticated
  using (public.is_admin_of_org(organization_id)
         or (halaqah_id is not null and public.fn_pegang_halaqah_periode(organization_id, halaqah_id, period_id)));
grant select on public.period_recaps to authenticated;
-- Penulisan form & rekap hanya lewat RPC (2026_11_29_02).

commit;
