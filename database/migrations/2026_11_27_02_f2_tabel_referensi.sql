-- =====================================================================
-- 2026_11_27_02_f2_tabel_referensi.sql
-- Fase 2 · butir 2, 3, 7 (bagian tabel)
--
-- Tujuan:
--   Data referensi yang tadinya berupa CHECK atau JSON di app_settings menjadi
--   tabel yang bisa diatur Admin per lembaga:
--     - roles               : daftar peran login (menggantikan CHECK role IN ...)
--     - recitation_kinds    : jenis setoran + penanda menambah hafalan / dihitung murojaah
--     - attendance_statuses : status kehadiran
--     - session_slots       : waktu halaqah + jenis setoran bawaan per waktu
--     - halaqah_types       : jenis halaqah
--     - quran_surahs        : 114 surat (dipakai migrasi data & validasi)
--   Nilai awal diambil dari app_settings lembaga (GLOBAL_WAKTU_HALAQAH,
--   GLOBAL_ATTENDANCE_STATUS, GLOBAL_JENIS_HALAQAH, SETORAN_SKEMA_OPTIONS,
--   SETORAN_WAKTU_SKEMA_MAP) dan data yang sudah ada. Lembaga baru otomatis
--   mendapat nilai bawaan (trigger trg_seed_reference_data).
--
-- Rollback:
--   alter table public.recitation_entries drop constraint if exists recitation_entries_kind_fkey;
--   alter table public.access_grants drop constraint if exists access_grants_role_fkey;
--   alter table public.tenant_invitations drop constraint if exists tenant_invitations_role_fkey;
--   (pasang kembali CHECK lama dari supabase_v2_1_production_hardening.sql)
--   drop trigger if exists trg_seed_reference_data on public.organizations;
--   drop table public.halaqah_types, public.session_slots, public.attendance_statuses,
--              public.recitation_kinds, public.roles, public.quran_surahs;
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Helper: kode aman dari teks bebas ("Murojaah Sore" -> "murojaah_sore")
-- ---------------------------------------------------------------------
create or replace function public.fn_slug(p text)
returns text
language sql
immutable
as $$
  select nullif(trim(both '_' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '_', 'g')), '');
$$;

-- ---------------------------------------------------------------------
-- 1. Surat Al-Qur'an
-- ---------------------------------------------------------------------
create table if not exists public.quran_surahs (
  no smallint primary key check (no between 1 and 114),
  name text not null,
  ayah_count smallint not null,
  start_page smallint not null,
  end_page smallint not null,
  name_key text generated always as (lower(regexp_replace(name, '[^A-Za-z]', '', 'g'))) stored
);

insert into public.quran_surahs (no, name, ayah_count, start_page, end_page) values
  (1, 'Al-Fatihah', 7, 1, 1),
  (2, 'Al-Baqarah', 286, 2, 49),
  (3, 'Ali ''Imran', 200, 50, 76),
  (4, 'An-Nisa''', 176, 77, 106),
  (5, 'Al-Ma''idah', 120, 106, 127),
  (6, 'Al-An''am', 165, 128, 150),
  (7, 'Al-A''raf', 206, 151, 176),
  (8, 'Al-Anfal', 75, 177, 186),
  (9, 'At-Taubah', 129, 187, 207),
  (10, 'Yunus', 109, 208, 221),
  (11, 'Hud', 123, 221, 235),
  (12, 'Yusuf', 111, 235, 248),
  (13, 'Ar-Ra''d', 43, 249, 255),
  (14, 'Ibrahim', 52, 255, 261),
  (15, 'Al-Hijr', 99, 262, 267),
  (16, 'An-Nahl', 128, 267, 281),
  (17, 'Al-Isra''', 111, 282, 293),
  (18, 'Al-Kahf', 110, 293, 304),
  (19, 'Maryam', 98, 305, 312),
  (20, 'Ta Ha', 135, 312, 321),
  (21, 'Al-Anbiya''', 112, 322, 331),
  (22, 'Al-Hajj', 78, 332, 341),
  (23, 'Al-Mu''minun', 118, 342, 349),
  (24, 'An-Nur', 64, 350, 359),
  (25, 'Al-Furqan', 77, 359, 366),
  (26, 'Asy-Syu''ara''', 227, 367, 376),
  (27, 'An-Naml', 93, 377, 385),
  (28, 'Al-Qasas', 88, 385, 396),
  (29, 'Al-''Ankabut', 69, 396, 404),
  (30, 'Ar-Rum', 60, 404, 410),
  (31, 'Luqman', 34, 411, 414),
  (32, 'As-Sajdah', 30, 415, 417),
  (33, 'Al-Ahzab', 73, 418, 427),
  (34, 'Saba''', 54, 428, 434),
  (35, 'Fatir', 45, 434, 440),
  (36, 'Ya Sin', 83, 440, 445),
  (37, 'As-Saffat', 182, 446, 452),
  (38, 'Sad', 88, 453, 458),
  (39, 'Az-Zumar', 75, 458, 467),
  (40, 'Ghafir', 85, 467, 476),
  (41, 'Fussilat', 54, 477, 482),
  (42, 'Asy-Syura', 53, 483, 489),
  (43, 'Az-Zukhruf', 89, 489, 495),
  (44, 'Ad-Dukhan', 59, 496, 498),
  (45, 'Al-Jasiyah', 37, 499, 502),
  (46, 'Al-Ahqaf', 35, 502, 506),
  (47, 'Muhammad', 38, 507, 510),
  (48, 'Al-Fath', 29, 511, 515),
  (49, 'Al-Hujurat', 18, 515, 517),
  (50, 'Qaf', 45, 518, 520),
  (51, 'Az-Zariyat', 60, 520, 523),
  (52, 'At-Tur', 49, 523, 525),
  (53, 'An-Najm', 62, 526, 528),
  (54, 'Al-Qamar', 55, 528, 531),
  (55, 'Ar-Rahman', 78, 531, 534),
  (56, 'Al-Waqi''ah', 96, 534, 537),
  (57, 'Al-Hadid', 29, 537, 541),
  (58, 'Al-Mujadilah', 22, 542, 545),
  (59, 'Al-Hasyr', 24, 545, 548),
  (60, 'Al-Mumtahanah', 13, 549, 551),
  (61, 'As-Saff', 14, 551, 552),
  (62, 'Al-Jumu''ah', 11, 553, 554),
  (63, 'Al-Munafiqun', 11, 554, 555),
  (64, 'At-Tagabun', 18, 556, 557),
  (65, 'At-Talaq', 12, 558, 559),
  (66, 'At-Tahrim', 12, 560, 561),
  (67, 'Al-Mulk', 30, 562, 564),
  (68, 'Al-Qalam', 52, 564, 566),
  (69, 'Al-Haqqah', 52, 566, 568),
  (70, 'Al-Ma''arij', 44, 568, 570),
  (71, 'Nuh', 28, 570, 571),
  (72, 'Al-Jinn', 28, 572, 573),
  (73, 'Al-Muzzammil', 20, 574, 575),
  (74, 'Al-Muddassir', 56, 575, 577),
  (75, 'Al-Qiyamah', 40, 577, 578),
  (76, 'Al-Insan', 31, 578, 580),
  (77, 'Al-Mursalat', 50, 580, 581),
  (78, 'An-Naba''', 40, 582, 583),
  (79, 'An-Nazi''at', 46, 583, 584),
  (80, '''Abasa', 42, 585, 585),
  (81, 'At-Takwir', 29, 586, 586),
  (82, 'Al-Infitar', 19, 587, 587),
  (83, 'Al-Mutaffifin', 36, 587, 589),
  (84, 'Al-Insyiqaq', 25, 589, 589),
  (85, 'Al-Buruj', 22, 590, 590),
  (86, 'At-Tariq', 17, 591, 591),
  (87, 'Al-A''la', 19, 591, 592),
  (88, 'Al-Gasyiyah', 26, 592, 592),
  (89, 'Al-Fajr', 30, 593, 594),
  (90, 'Al-Balad', 20, 594, 594),
  (91, 'Asy-Syams', 15, 595, 595),
  (92, 'Al-Lail', 21, 595, 596),
  (93, 'Ad-Duha', 11, 596, 596),
  (94, 'Asy-Syarh', 8, 596, 596),
  (95, 'At-Tin', 8, 597, 597),
  (96, 'Al-''Alaq', 19, 597, 597),
  (97, 'Al-Qadr', 5, 598, 598),
  (98, 'Al-Bayyinah', 8, 598, 599),
  (99, 'Az-Zalzalah', 8, 599, 599),
  (100, 'Al-''Adiyat', 11, 599, 600),
  (101, 'Al-Qari''ah', 11, 600, 600),
  (102, 'At-Takasur', 8, 600, 600),
  (103, 'Al-''Asr', 3, 601, 601),
  (104, 'Al-Humazah', 9, 601, 601),
  (105, 'Al-Fil', 5, 601, 601),
  (106, 'Quraisy', 4, 602, 602),
  (107, 'Al-Ma''un', 7, 602, 602),
  (108, 'Al-Kausar', 3, 602, 602),
  (109, 'Al-Kafirun', 6, 603, 603),
  (110, 'An-Nasr', 3, 603, 603),
  (111, 'Al-Lahab', 5, 603, 603),
  (112, 'Al-Ikhlas', 4, 604, 604),
  (113, 'Al-Falaq', 5, 604, 604),
  (114, 'An-Nas', 6, 604, 604)

on conflict (no) do nothing;

alter table public.quran_surahs enable row level security;
drop policy if exists quran_surahs_select on public.quran_surahs;
create policy quran_surahs_select on public.quran_surahs for select to anon, authenticated using (true);

-- Cari nomor surat dari teks bebas: "Al-Baqarah", "al baqarah", "2", "Surat 2", "2. Al-Baqarah"
create or replace function public.fn_surah_no(p text)
returns smallint
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select s.no from public.quran_surahs s
      where substring(lower(trim(coalesce(p, ''))) from '^(?:surat|surah|qs\.?)?\s*(\d{1,3})\y') is not null
        and s.no = substring(lower(trim(p)) from '^(?:surat|surah|qs\.?)?\s*(\d{1,3})\y')::int),
    (select s.no from public.quran_surahs s
      where s.name_key = lower(regexp_replace(regexp_replace(coalesce(p, ''), '^\s*\d+\s*[.)-]?\s*', ''), '[^A-Za-z]', '', 'g'))
      limit 1)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Peran login
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  code text primary key check (code ~ '^[a-z_]+$'),
  label text not null,
  scope text not null check (scope in ('platform', 'tenant')),
  is_active boolean not null default true,
  sort_order smallint not null default 100,
  description text
);

insert into public.roles (code, label, scope, is_active, sort_order, description) values
  ('superadmin',  'Superadmin',     'platform', true,  1, 'Pengelola sistem/platform'),
  ('admin',       'Admin Lembaga',  'tenant',   true,  2, 'Mengelola seluruh data lembaga'),
  ('musammi',     'Musammi''',      'tenant',   true,  3, 'Mengabsen dan mencatat setoran halaqah yang ditugaskan'),
  ('wali_kelas',  'Wali Kelas',     'tenant',   false, 4, 'Disiapkan untuk rilis berikutnya'),
  ('wali_santri', 'Wali Santri',    'tenant',   false, 5, 'Disiapkan untuk rilis berikutnya')
on conflict (code) do nothing;

alter table public.roles enable row level security;
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (true);

-- Pengaman bila database berisi peran di luar daftar (beda dengan repo): catat sebagai peran nonaktif
insert into public.roles (code, label, scope, is_active, sort_order, description)
select distinct g.role, initcap(g.role), case when g.organization_id is null then 'platform' else 'tenant' end, false, 90,
       'Ditemukan di data lama saat migrasi Fase 2'
from public.access_grants g
where g.role is not null and g.role ~ '^[a-z_]+$' and not exists (select 1 from public.roles r where r.code = g.role)
on conflict (code) do nothing;

-- access_grants & tenant_invitations: CHECK daftar peran -> foreign key ke roles
alter table public.access_grants drop constraint if exists access_grants_role_canonical_check;
alter table public.access_grants drop constraint if exists access_grants_tenant_scope_check;
alter table public.access_grants drop constraint if exists access_grants_role_fkey;
alter table public.access_grants
  add constraint access_grants_role_fkey foreign key (role) references public.roles(code) on update cascade;
alter table public.access_grants
  add constraint access_grants_tenant_scope_check
  check ((role = 'superadmin' and organization_id is null) or (role <> 'superadmin' and organization_id is not null));

do $$
begin
  if to_regclass('public.tenant_invitations') is not null then
    alter table public.tenant_invitations drop constraint if exists tenant_invitations_role_check;
    alter table public.tenant_invitations drop constraint if exists tenant_invitations_scope_check;
    alter table public.tenant_invitations drop constraint if exists tenant_invitations_role_fkey;
    alter table public.tenant_invitations
      add constraint tenant_invitations_role_fkey foreign key (role) references public.roles(code) on update cascade;
    alter table public.tenant_invitations
      add constraint tenant_invitations_scope_check
      check ((role = 'superadmin' and organization_id is null) or (role <> 'superadmin' and organization_id is not null));
  end if;
end;
$$;

-- Peran yang belum aktif tidak boleh diberikan
create or replace function public.fn_check_role_active()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.roles r where r.code = new.role and r.is_active) then
    raise exception 'Peran % belum aktif dan tidak bisa diberikan.', new.role using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_role_active on public.access_grants;
create trigger trg_check_role_active
  before insert or update of role on public.access_grants
  for each row execute function public.fn_check_role_active();

-- ---------------------------------------------------------------------
-- 3. Tabel referensi per lembaga
-- ---------------------------------------------------------------------
create table if not exists public.recitation_kinds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  adds_memorization boolean not null default false,
  counts_as_murojaah boolean not null default false,
  sort_order smallint not null default 100,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recitation_kinds_org_code_key unique (organization_id, code)
);
comment on column public.recitation_kinds.adds_memorization is 'Ya = setoran jenis ini menambah total hafalan (bawaan: hanya Ziyadah).';
comment on column public.recitation_kinds.counts_as_murojaah is 'Ya = dihitung sebagai capaian murojaah.';

create table if not exists public.attendance_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  counts_as_present boolean not null default false,
  allows_recitation boolean not null default false,
  sort_order smallint not null default 100,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_statuses_org_code_key unique (organization_id, code)
);

create table if not exists public.session_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  start_time time,
  default_kind_code text,
  sort_order smallint not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_slots_org_code_key unique (organization_id, code),
  constraint session_slots_default_kind_fkey foreign key (organization_id, default_kind_code)
    references public.recitation_kinds (organization_id, code) on update cascade
);
comment on column public.session_slots.code is 'Nilai yang disimpan di halaqah.waktu / session_slot (mis. Shubuh). Jangan diubah; ganti name untuk label.';

create table if not exists public.halaqah_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order smallint not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint halaqah_types_org_name_key unique (organization_id, name)
);

-- RLS: semua anggota lembaga boleh membaca; hanya Admin yang mengubah
do $$
declare t text;
begin
  foreach t in array array['recitation_kinds', 'attendance_statuses', 'session_slots', 'halaqah_types'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.get_role_for_org(organization_id) is not null)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id))', t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_touch_' || t, t);
  end loop;
end;
$$;

-- Jenis setoran tidak boleh dihapus bila sudah dipakai; nonaktifkan saja
create or replace function public.fn_protect_used_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'recitation_kinds' and exists (
    select 1 from public.recitation_entries e where e.organization_id = old.organization_id and e.kind = old.code
  ) then
    raise exception 'Jenis setoran "%" sudah dipakai. Nonaktifkan saja, jangan dihapus.', old.name using errcode = '23503';
  end if;
  if tg_table_name = 'attendance_statuses' and exists (
    select 1 from public.attendance_records a where a.organization_id = old.organization_id and a.status = old.code
  ) then
    raise exception 'Status kehadiran "%" sudah dipakai. Nonaktifkan saja, jangan dihapus.', old.name using errcode = '23503';
  end if;
  if tg_table_name = 'session_slots' and exists (
    select 1 from public.halaqah_sessions s where s.organization_id = old.organization_id and s.session_slot = old.code
  ) then
    raise exception 'Waktu halaqah "%" sudah dipakai. Nonaktifkan saja, jangan dihapus.', old.name using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_used_kind on public.recitation_kinds;
create trigger trg_protect_used_kind before delete on public.recitation_kinds
  for each row execute function public.fn_protect_used_reference();
drop trigger if exists trg_protect_used_status on public.attendance_statuses;
create trigger trg_protect_used_status before delete on public.attendance_statuses
  for each row execute function public.fn_protect_used_reference();
drop trigger if exists trg_protect_used_slot on public.session_slots;
create trigger trg_protect_used_slot before delete on public.session_slots
  for each row execute function public.fn_protect_used_reference();

-- Kode sistem tidak boleh diganti (dipakai perhitungan)
create or replace function public.fn_lock_reference_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'Kode referensi tidak bisa diubah. Ubah namanya saja.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lock_kind_code on public.recitation_kinds;
create trigger trg_lock_kind_code before update on public.recitation_kinds
  for each row execute function public.fn_lock_reference_code();
drop trigger if exists trg_lock_status_code on public.attendance_statuses;
create trigger trg_lock_status_code before update on public.attendance_statuses
  for each row execute function public.fn_lock_reference_code();
drop trigger if exists trg_lock_slot_code on public.session_slots;
create trigger trg_lock_slot_code before update on public.session_slots
  for each row execute function public.fn_lock_reference_code();

-- ---------------------------------------------------------------------
-- 4. Isi nilai bawaan + nilai dari app_settings + nilai yang sudah dipakai
-- ---------------------------------------------------------------------
create or replace function public.fn_setting_list(p_org uuid, p_key text)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v text;
  r text[];
begin
  select value into v from public.app_settings where organization_id = p_org and key = p_key order by id desc limit 1;
  if v is null or btrim(v) = '' then
    return array[]::text[];
  end if;
  begin
    select array_agg(btrim(x)) into r from jsonb_array_elements_text(v::jsonb) x where btrim(x) <> '';
  exception when others then
    select array_agg(btrim(x)) into r from unnest(string_to_array(v, ',')) x where btrim(x) <> '';
  end;
  return coalesce(r, array[]::text[]);
end;
$$;

create or replace function public.fn_seed_reference_data(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_i int := 0;
  v_map jsonb;
  v_slot record;
  v_kind text;
begin
  if p_org is null then
    return;
  end if;

  -- Jenis setoran bawaan (spesifikasi bagian 5)
  insert into public.recitation_kinds (organization_id, code, name, adds_memorization, counts_as_murojaah, sort_order, is_system)
  values
    (p_org, 'ziyadah',  'Ziyadah',  true,  false, 1, true),
    (p_org, 'talqin',   'Talqin',   false, false, 2, false),
    (p_org, 'murojaah', 'Murojaah', false, true,  3, true),
    (p_org, 'tamkin',   'Tamkin',   false, true,  4, false),
    (p_org, 'sabqi',    'Sabqi',    false, true,  5, true),
    (p_org, 'manzil',   'Manzil',   false, true,  6, true)
  on conflict (organization_id, code) do nothing;

  v_i := 10;
  foreach v_name in array public.fn_setting_list(p_org, 'SETORAN_SKEMA_OPTIONS') loop
    v_i := v_i + 1;
    insert into public.recitation_kinds (organization_id, code, name, adds_memorization, counts_as_murojaah, sort_order)
    values (p_org, public.fn_slug(v_name), v_name, false, true, v_i)
    on conflict (organization_id, code) do nothing;
  end loop;

  -- Status kehadiran bawaan
  insert into public.attendance_statuses (organization_id, code, name, counts_as_present, allows_recitation, sort_order, is_system)
  values
    (p_org, 'hadir',     'Hadir',     true,  true,  1, true),
    (p_org, 'terlambat', 'Terlambat', true,  true,  2, true),
    (p_org, 'izin',      'Izin',      false, false, 3, true),
    (p_org, 'sakit',     'Sakit',     false, false, 4, true),
    (p_org, 'alpa',      'Alpa',      false, false, 5, true)
  on conflict (organization_id, code) do nothing;

  v_i := 10;
  foreach v_name in array public.fn_setting_list(p_org, 'GLOBAL_ATTENDANCE_STATUS') loop
    v_i := v_i + 1;
    insert into public.attendance_statuses (organization_id, code, name, counts_as_present, allows_recitation, sort_order)
    values (p_org, public.fn_slug(v_name), v_name, false, false, v_i)
    on conflict (organization_id, code) do nothing;
  end loop;

  -- Waktu halaqah: dari pengaturan, dari halaqah & data yang sudah ada, lalu bawaan
  begin
    select value::jsonb into v_map from public.app_settings
    where organization_id = p_org and key = 'SETORAN_WAKTU_SKEMA_MAP' order by id desc limit 1;
  exception when others then
    v_map := null;
  end;

  v_i := 0;
  for v_slot in
    select name, min(ord) as ord from (
      select x as name, 10 + o as ord from unnest(public.fn_setting_list(p_org, 'GLOBAL_WAKTU_HALAQAH')) with ordinality t(x, o)
      union all select unnest(h.waktu), 50 from public.halaqah h where h.organization_id = p_org
      union all select distinct s.session_slot, 60 from public.halaqah_sessions s where s.organization_id = p_org
      union all select distinct e.session_slot, 70 from public.recitation_entries e where e.organization_id = p_org
      union all select v, o from (values ('Shubuh', 1), ('Ashar', 3), ('Isya', 5)) d(v, o)
    ) src
    where name is not null and btrim(name) <> ''
    group by name
    order by min(ord), name
  loop
    v_i := v_i + 1;
    v_kind := public.fn_slug(coalesce(v_map ->> v_slot.name, ''));
    if v_kind is null or not exists (select 1 from public.recitation_kinds k where k.organization_id = p_org and k.code = v_kind) then
      v_kind := case when lower(v_slot.name) like 'sh%' or lower(v_slot.name) like 'sub%' then 'ziyadah' else 'murojaah' end;
    end if;
    insert into public.session_slots (organization_id, code, name, default_kind_code, sort_order)
    values (p_org, v_slot.name, v_slot.name, v_kind, v_i)
    on conflict (organization_id, code) do nothing;
  end loop;

  -- Jenis halaqah
  v_i := 0;
  for v_name in
    select name from (
      select x as name, o as ord from unnest(public.fn_setting_list(p_org, 'GLOBAL_JENIS_HALAQAH')) with ordinality t(x, o)
      union all select distinct h.jenis, 100 from public.halaqah h where h.organization_id = p_org
    ) src where name is not null and btrim(name) <> '' group by name order by min(ord), name
  loop
    v_i := v_i + 1;
    insert into public.halaqah_types (organization_id, name, sort_order)
    values (p_org, v_name, v_i)
    on conflict (organization_id, name) do nothing;
  end loop;
end;
$$;

revoke all on function public.fn_seed_reference_data(uuid) from public, anon, authenticated;

create or replace function public.fn_seed_reference_data_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_seed_reference_data(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_reference_data on public.organizations;
create trigger trg_seed_reference_data
  after insert on public.organizations
  for each row execute function public.fn_seed_reference_data_trigger();

do $$
declare o record;
begin
  for o in select id from public.organizations loop
    perform public.fn_seed_reference_data(o.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. recitation_entries.kind: CHECK -> foreign key ke recitation_kinds
-- ---------------------------------------------------------------------
-- Pengaman: nilai kind yang sudah ada di data harus terdaftar sebagai jenis setoran lembaga
insert into public.recitation_kinds (organization_id, code, name, adds_memorization, counts_as_murojaah, sort_order)
select distinct e.organization_id, e.kind, initcap(replace(e.kind, '_', ' ')), e.kind = 'ziyadah', e.kind <> 'ziyadah', 80
from public.recitation_entries e
where e.kind ~ '^[a-z0-9_]+$'
  and not exists (select 1 from public.recitation_kinds k where k.organization_id = e.organization_id and k.code = e.kind)
on conflict (organization_id, code) do nothing;

alter table public.recitation_entries drop constraint if exists recitation_entries_kind_check;
alter table public.recitation_entries drop constraint if exists recitation_entries_kind_fkey;
alter table public.recitation_entries
  add constraint recitation_entries_kind_fkey foreign key (organization_id, kind)
  references public.recitation_kinds (organization_id, code) on update cascade;

notify pgrst, 'reload schema';

commit;
