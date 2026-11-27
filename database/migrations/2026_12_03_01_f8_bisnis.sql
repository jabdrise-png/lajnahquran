-- =====================================================================
-- 2026_12_03_01_f8_bisnis.sql
-- Fase 8 · butir 1–3: paket (batas santri & harga) diatur Superadmin, pencatatan pembayaran
-- transfer manual + status langganan, antrean pendaftaran lembaga (setujui / tolak).
--
-- Isi:
--   platform_plans            paket: nama, batas santri (null = tanpa batas), harga bulanan/tahunan
--   organizations             + langganan_sampai, no_hp, kota
--   pembayaran_lembaga        catatan transfer manual (sah / batal), hanya lewat RPC Superadmin
--   pendaftaran_lembaga       antrean pendaftaran mandiri (menunggu / disetujui / ditolak)
--   fn_status_langganan()     aktif | segera_habis (≤ 7 hari) | lewat | belum_bayar
--   RPC Superadmin: rpc_simpan_paket, rpc_catat_pembayaran, rpc_batalkan_pembayaran,
--                   rpc_ringkasan_langganan, rpc_setujui_pendaftaran, rpc_tolak_pendaftaran
--   RPC Admin:      rpc_langganan_saya (paket, kuota santri, status langganan lembaganya)
--   handle_new_user: pendaftaran email dengan nama ma'had → lembaga 'provisioning' + baris antrean
--
-- Tidak ada penangguhan otomatis: lembaga yang lewat masa langganan hanya ditandai.
-- Prasyarat: 2026_12_02_02_f7_login_google.sql
-- Rollback:
--   drop function public.rpc_simpan_paket, rpc_catat_pembayaran, rpc_batalkan_pembayaran, rpc_ringkasan_langganan,
--     rpc_setujui_pendaftaran, rpc_tolak_pendaftaran, rpc_langganan_saya, fn_status_langganan, fn_hitung_langganan_sampai;
--   drop table public.pembayaran_lembaga, public.pendaftaran_lembaga;
--   alter table public.organizations drop constraint organizations_plan_fk, drop column langganan_sampai, drop column no_hp, drop column kota;
--   drop table public.platform_plans;
--   jalankan ulang handle_new_user dari 2026_12_02_02_f7_login_google.sql
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Paket
-- ---------------------------------------------------------------------
create table if not exists public.platform_plans (
  id text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  nama text not null,
  batas_santri integer check (batas_santri is null or batas_santri > 0),
  harga_bulanan bigint not null default 0 check (harga_bulanan >= 0),
  harga_tahunan bigint not null default 0 check (harga_tahunan >= 0),
  keterangan text not null default '',
  aktif boolean not null default true,
  urutan integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.platform_plans (id, nama, batas_santri, keterangan, aktif, urutan) values
  ('standard', 'Standar', 300, 'Untuk lembaga sampai 300 santri.', true, 1),
  ('enterprise', 'Lembaga Besar', null, 'Tanpa batas jumlah santri.', true, 2),
  ('trial', 'Uji Coba (lama)', 50, 'Paket lama; tidak ditawarkan (tanpa masa uji coba).', false, 9)
on conflict (id) do nothing;

-- paket lain yang terlanjur dipakai lembaga
insert into public.platform_plans (id, nama, aktif, urutan)
select distinct o.plan_id, initcap(o.plan_id), false, 50
from public.organizations o
where o.plan_id is not null and not exists (select 1 from public.platform_plans p where p.id = o.plan_id)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_plan_fk') then
    alter table public.organizations
      add constraint organizations_plan_fk foreign key (plan_id) references public.platform_plans(id) on update cascade;
  end if;
end $$;

alter table public.platform_plans enable row level security;
drop policy if exists platform_plans_baca on public.platform_plans;
create policy platform_plans_baca on public.platform_plans for select to anon, authenticated using (true);
drop policy if exists platform_plans_tulis on public.platform_plans;
create policy platform_plans_tulis on public.platform_plans for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select on public.platform_plans to anon, authenticated;
grant insert, update, delete on public.platform_plans to authenticated;

-- ---------------------------------------------------------------------
-- 2. Lembaga: masa langganan & kontak
-- ---------------------------------------------------------------------
alter table public.organizations add column if not exists langganan_sampai date;
alter table public.organizations add column if not exists no_hp text;
alter table public.organizations add column if not exists kota text;

create or replace function public.fn_status_langganan(p_sampai date, p_hari_ini date default (now() at time zone 'Asia/Jakarta')::date)
returns text
language sql
immutable
as $$
  select case
    when p_sampai is null then 'belum_bayar'
    when p_sampai < p_hari_ini then 'lewat'
    when p_sampai <= p_hari_ini + 7 then 'segera_habis'
    else 'aktif'
  end
$$;

-- ---------------------------------------------------------------------
-- 3. Pembayaran (transfer manual)
-- ---------------------------------------------------------------------
create table if not exists public.pembayaran_lembaga (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id text references public.platform_plans(id) on update cascade,
  tanggal_bayar date not null,
  jumlah bigint not null check (jumlah >= 0),
  periode_mulai date not null,
  periode_selesai date not null,
  metode text not null default 'transfer',
  catatan text not null default '',
  status text not null default 'sah' check (status in ('sah', 'batal')),
  alasan_batal text,
  dicatat_oleh uuid,
  created_at timestamptz not null default now(),
  check (periode_selesai >= periode_mulai)
);
create index if not exists idx_pembayaran_lembaga_org on public.pembayaran_lembaga (organization_id, periode_selesai desc);

alter table public.pembayaran_lembaga enable row level security;
drop policy if exists pembayaran_lembaga_baca on public.pembayaran_lembaga;
create policy pembayaran_lembaga_baca on public.pembayaran_lembaga for select to authenticated
  using (public.is_super_admin() or public.is_admin_of_org(organization_id));
grant select on public.pembayaran_lembaga to authenticated;

create or replace function public.fn_hitung_langganan_sampai(p_org uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select max(periode_selesai) from public.pembayaran_lembaga where organization_id = p_org and status = 'sah'
$$;
revoke all on function public.fn_hitung_langganan_sampai(uuid) from public, anon;

create or replace function public.rpc_catat_pembayaran(
  p_org uuid, p_tanggal date, p_jumlah bigint, p_mulai date, p_selesai date,
  p_plan text default null, p_catatan text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_sampai date;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Superadmin yang dapat mencatat pembayaran.' using errcode = '42501';
  end if;
  if p_jumlah is null or p_jumlah < 0 then raise exception 'Jumlah pembayaran tidak valid.'; end if;
  if p_mulai is null or p_selesai is null or p_selesai < p_mulai then
    raise exception 'Periode langganan tidak valid (tanggal selesai harus setelah tanggal mulai).';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'Lembaga tidak ditemukan.'; end if;
  if p_plan is not null and not exists (select 1 from public.platform_plans where id = p_plan) then
    raise exception 'Paket % tidak ditemukan.', p_plan;
  end if;

  insert into public.pembayaran_lembaga (organization_id, plan_id, tanggal_bayar, jumlah, periode_mulai, periode_selesai, catatan, dicatat_oleh)
  values (p_org, coalesce(p_plan, (select plan_id from public.organizations where id = p_org)), coalesce(p_tanggal, current_date),
          p_jumlah, p_mulai, p_selesai, coalesce(trim(p_catatan), ''), auth.uid())
  returning id into v_id;

  v_sampai := public.fn_hitung_langganan_sampai(p_org);
  update public.organizations
  set langganan_sampai = v_sampai,
      plan_id = coalesce(p_plan, plan_id),
      updated_at = now()
  where id = p_org;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, after_state)
  values (p_org, auth.uid(), 'superadmin', 'pembayaran.catat', 'pembayaran_lembaga', v_id::text,
          jsonb_build_object('jumlah', p_jumlah, 'mulai', p_mulai, 'selesai', p_selesai, 'plan_id', p_plan, 'langganan_sampai', v_sampai));

  return jsonb_build_object('id', v_id, 'langganan_sampai', v_sampai, 'status_langganan', public.fn_status_langganan(v_sampai));
end;
$$;

create or replace function public.rpc_batalkan_pembayaran(p_id uuid, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pembayaran_lembaga%rowtype;
  v_sampai date;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Superadmin yang dapat membatalkan pembayaran.' using errcode = '42501';
  end if;
  if coalesce(trim(p_alasan), '') = '' then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  select * into v_row from public.pembayaran_lembaga where id = p_id for update;
  if v_row.id is null then raise exception 'Pembayaran tidak ditemukan.'; end if;
  if v_row.status = 'batal' then raise exception 'Pembayaran ini sudah dibatalkan.'; end if;

  update public.pembayaran_lembaga set status = 'batal', alasan_batal = trim(p_alasan) where id = p_id;
  v_sampai := public.fn_hitung_langganan_sampai(v_row.organization_id);
  update public.organizations set langganan_sampai = v_sampai, updated_at = now() where id = v_row.organization_id;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state)
  values (v_row.organization_id, auth.uid(), 'superadmin', 'pembayaran.batal', 'pembayaran_lembaga', p_id::text, trim(p_alasan),
          jsonb_build_object('jumlah', v_row.jumlah, 'selesai', v_row.periode_selesai), jsonb_build_object('langganan_sampai', v_sampai));

  return jsonb_build_object('id', p_id, 'langganan_sampai', v_sampai, 'status_langganan', public.fn_status_langganan(v_sampai));
end;
$$;

create or replace function public.rpc_simpan_paket(
  p_id text, p_nama text, p_batas_santri integer, p_harga_bulanan bigint, p_harga_tahunan bigint,
  p_keterangan text default '', p_aktif boolean default true, p_urutan integer default 0
)
returns public.platform_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lama public.platform_plans%rowtype;
  v_baru public.platform_plans%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Superadmin yang dapat mengatur paket.' using errcode = '42501';
  end if;
  if coalesce(trim(p_nama), '') = '' then raise exception 'Nama paket wajib diisi.'; end if;
  select * into v_lama from public.platform_plans where id = lower(trim(p_id));
  insert into public.platform_plans (id, nama, batas_santri, harga_bulanan, harga_tahunan, keterangan, aktif, urutan, updated_at)
  values (lower(trim(p_id)), trim(p_nama), p_batas_santri, coalesce(p_harga_bulanan, 0), coalesce(p_harga_tahunan, 0),
          coalesce(p_keterangan, ''), coalesce(p_aktif, true), coalesce(p_urutan, 0), now())
  on conflict (id) do update set
    nama = excluded.nama, batas_santri = excluded.batas_santri, harga_bulanan = excluded.harga_bulanan,
    harga_tahunan = excluded.harga_tahunan, keterangan = excluded.keterangan, aktif = excluded.aktif,
    urutan = excluded.urutan, updated_at = now()
  returning * into v_baru;
  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, before_state, after_state)
  values (null, auth.uid(), 'superadmin', 'paket.simpan', 'platform_plans', v_baru.id,
          case when v_lama.id is null then null else to_jsonb(v_lama) end, to_jsonb(v_baru));
  return v_baru;
end;
$$;

-- Ringkasan untuk konsol Superadmin
create or replace function public.rpc_ringkasan_langganan()
returns table (
  organization_id uuid, nama text, status text, plan_id text, nama_paket text, batas_santri integer,
  santri_aktif bigint, langganan_sampai date, status_langganan text, bayar_terakhir date, jumlah_terakhir bigint,
  no_hp text, kota text, contact_email text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Superadmin.' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.status, o.plan_id, p.nama, p.batas_santri,
         (select count(*) from public.santri s where s.organization_id = o.id and coalesce(s.status, 'active') in ('active', 'aktif')),
         o.langganan_sampai, public.fn_status_langganan(o.langganan_sampai),
         b.tanggal_bayar, b.jumlah, o.no_hp, o.kota, o.contact_email, o.created_at
  from public.organizations o
  left join public.platform_plans p on p.id = o.plan_id
  left join lateral (
    select pb.tanggal_bayar, pb.jumlah from public.pembayaran_lembaga pb
    where pb.organization_id = o.id and pb.status = 'sah'
    order by pb.tanggal_bayar desc, pb.created_at desc limit 1
  ) b on true
  order by o.name;
end;
$$;

-- Untuk Admin lembaga (kartu Langganan di Pengaturan & peringatan kuota santri)
create or replace function public.rpc_langganan_saya(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org public.organizations%rowtype;
  v_plan public.platform_plans%rowtype;
  v_santri bigint;
begin
  if not (public.is_super_admin() or public.is_admin_of_org(p_org)
          or exists (select 1 from public.access_grants g where g.user_id = auth.uid() and g.organization_id = p_org and g.status = 'active')) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org;
  select * into v_plan from public.platform_plans where id = v_org.plan_id;
  select count(*) into v_santri from public.santri s where s.organization_id = p_org and coalesce(s.status, 'active') in ('active', 'aktif');
  return jsonb_build_object(
    'plan_id', v_org.plan_id, 'nama_paket', v_plan.nama, 'batas_santri', v_plan.batas_santri,
    'harga_bulanan', v_plan.harga_bulanan, 'harga_tahunan', v_plan.harga_tahunan,
    'santri_aktif', v_santri, 'langganan_sampai', v_org.langganan_sampai,
    'status_langganan', public.fn_status_langganan(v_org.langganan_sampai),
    'melebihi_kuota', v_plan.batas_santri is not null and v_santri > v_plan.batas_santri
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Antrean pendaftaran lembaga
-- ---------------------------------------------------------------------
create table if not exists public.pendaftaran_lembaga (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text,
  nama_pendaftar text not null default '',
  nama_lembaga text not null,
  no_hp text,
  kota text,
  perkiraan_santri integer,
  organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  alasan text,
  diputuskan_oleh uuid,
  diputuskan_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_pendaftaran_lembaga_status on public.pendaftaran_lembaga (status, created_at);

alter table public.pendaftaran_lembaga enable row level security;
drop policy if exists pendaftaran_lembaga_baca on public.pendaftaran_lembaga;
create policy pendaftaran_lembaga_baca on public.pendaftaran_lembaga for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid());
grant select on public.pendaftaran_lembaga to authenticated;

-- Pendaftar lama (sebelum fase ini): lembaga 'provisioning' dengan pendaftar 'pending'
insert into public.pendaftaran_lembaga (user_id, email, nama_pendaftar, nama_lembaga, organization_id, created_at)
select distinct on (p.id) p.id, p.email, coalesce(p.full_name, ''), o.name, o.id, o.created_at
from public.organizations o
join public.profiles p on p.organization_id = o.id and p.role = 'pending'
where o.status = 'provisioning'
  and not exists (select 1 from public.access_grants g where g.organization_id = o.id and g.status = 'active')
order by p.id, o.created_at
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  v_mahad text;
  raw_target_org_id text;
  v_provider text;
  v_santri integer;
begin
  v_mahad := nullif(trim(new.raw_user_meta_data->>'mahad_name'), '');
  raw_target_org_id := nullif(trim(new.raw_user_meta_data->>'target_organization_id'), '');
  v_provider := coalesce(nullif(to_jsonb(new)->'raw_app_meta_data'->>'provider', ''), 'email');

  if raw_target_org_id is not null and length(raw_target_org_id) = 36 then
    select id into new_org_id from public.organizations where id = raw_target_org_id::uuid;
    if new_org_id is null then
      raise exception 'Target organization (%) tidak ditemukan saat provisioning user baru.', raw_target_org_id;
    end if;
  elsif v_provider = 'email'
        and v_mahad is not null
        and coalesce(new.raw_user_meta_data->>'role', '') not in ('superadmin', 'super_admin') then
    insert into public.organizations (name, status, no_hp, kota, contact_email)
    values (v_mahad, 'provisioning',
            nullif(trim(new.raw_user_meta_data->>'no_hp'), ''), nullif(trim(new.raw_user_meta_data->>'kota'), ''), new.email)
    returning id into new_org_id;

    begin
      v_santri := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'perkiraan_santri', ''), '\D', '', 'g'), '')::integer;
    exception when others then
      v_santri := null;
    end;
    insert into public.pendaftaran_lembaga (user_id, email, nama_pendaftar, nama_lembaga, no_hp, kota, perkiraan_santri, organization_id)
    values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
            v_mahad, nullif(trim(new.raw_user_meta_data->>'no_hp'), ''), nullif(trim(new.raw_user_meta_data->>'kota'), ''), v_santri, new_org_id)
    on conflict (user_id) do nothing;
  end if;

  -- Akun baru selalu dimulai 'pending' sampai diaktifkan lewat grant / undangan / persetujuan pendaftaran.
  insert into public.profiles (id, organization_id, full_name, role, email)
  values (
    new.id,
    new_org_id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    'pending',
    new.email
  )
  on conflict (id) do update
  set organization_id = coalesce(excluded.organization_id, public.profiles.organization_id),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      email = coalesce(excluded.email, public.profiles.email);

  return new;
end;
$$;

create or replace function public.rpc_setujui_pendaftaran(p_id uuid, p_plan text default 'standard', p_catatan text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pendaftaran_lembaga%rowtype;
  v_org uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Superadmin yang dapat menyetujui pendaftaran.' using errcode = '42501';
  end if;
  select * into v_row from public.pendaftaran_lembaga where id = p_id for update;
  if v_row.id is null then raise exception 'Pendaftaran tidak ditemukan.'; end if;
  if v_row.status <> 'menunggu' then raise exception 'Pendaftaran ini sudah diputuskan (%).', v_row.status; end if;
  if not exists (select 1 from public.platform_plans where id = p_plan) then raise exception 'Paket % tidak ditemukan.', p_plan; end if;

  v_org := v_row.organization_id;
  if v_org is null then
    insert into public.organizations (name, status, plan_id, no_hp, kota, contact_email)
    values (v_row.nama_lembaga, 'active', p_plan, v_row.no_hp, v_row.kota, v_row.email)
    returning id into v_org;
  else
    update public.organizations set status = 'active', plan_id = p_plan, updated_at = now() where id = v_org;
  end if;

  insert into public.access_grants (user_id, organization_id, role, status, invited_by, updated_at)
  values (v_row.user_id, v_org, 'admin', 'active', auth.uid(), now())
  on conflict (user_id, organization_id, role) do update set status = 'active', updated_at = now();

  update public.profiles set organization_id = v_org where id = v_row.user_id and organization_id is null;

  update public.pendaftaran_lembaga
  set status = 'disetujui', organization_id = v_org, alasan = nullif(trim(coalesce(p_catatan, '')), ''),
      diputuskan_oleh = auth.uid(), diputuskan_at = now()
  where id = p_id;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_org, auth.uid(), 'superadmin', 'pendaftaran.setujui', 'pendaftaran_lembaga', p_id::text, p_catatan,
          jsonb_build_object('user_id', v_row.user_id, 'nama_lembaga', v_row.nama_lembaga, 'plan_id', p_plan));

  return jsonb_build_object('organization_id', v_org, 'status', 'disetujui');
end;
$$;

create or replace function public.rpc_tolak_pendaftaran(p_id uuid, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pendaftaran_lembaga%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya Superadmin yang dapat menolak pendaftaran.' using errcode = '42501';
  end if;
  if coalesce(trim(p_alasan), '') = '' then raise exception 'Alasan penolakan wajib diisi.'; end if;
  select * into v_row from public.pendaftaran_lembaga where id = p_id for update;
  if v_row.id is null then raise exception 'Pendaftaran tidak ditemukan.'; end if;
  if v_row.status <> 'menunggu' then raise exception 'Pendaftaran ini sudah diputuskan (%).', v_row.status; end if;

  update public.pendaftaran_lembaga
  set status = 'ditolak', alasan = trim(p_alasan), diputuskan_oleh = auth.uid(), diputuskan_at = now()
  where id = p_id;
  if v_row.organization_id is not null then
    update public.organizations set status = 'archived', updated_at = now()
    where id = v_row.organization_id and status = 'provisioning';
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_row.organization_id, auth.uid(), 'superadmin', 'pendaftaran.tolak', 'pendaftaran_lembaga', p_id::text, trim(p_alasan),
          jsonb_build_object('user_id', v_row.user_id, 'nama_lembaga', v_row.nama_lembaga));
  return jsonb_build_object('status', 'ditolak');
end;
$$;

revoke all on function public.rpc_catat_pembayaran(uuid, date, bigint, date, date, text, text) from public, anon;
revoke all on function public.rpc_batalkan_pembayaran(uuid, text) from public, anon;
revoke all on function public.rpc_simpan_paket(text, text, integer, bigint, bigint, text, boolean, integer) from public, anon;
revoke all on function public.rpc_ringkasan_langganan() from public, anon;
revoke all on function public.rpc_langganan_saya(uuid) from public, anon;
revoke all on function public.rpc_setujui_pendaftaran(uuid, text, text) from public, anon;
revoke all on function public.rpc_tolak_pendaftaran(uuid, text) from public, anon;
grant execute on function public.rpc_catat_pembayaran(uuid, date, bigint, date, date, text, text) to authenticated, service_role;
grant execute on function public.rpc_batalkan_pembayaran(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_simpan_paket(text, text, integer, bigint, bigint, text, boolean, integer) to authenticated, service_role;
grant execute on function public.rpc_ringkasan_langganan() to authenticated, service_role;
grant execute on function public.rpc_langganan_saya(uuid) to authenticated, service_role;
grant execute on function public.rpc_setujui_pendaftaran(uuid, text, text) to authenticated, service_role;
grant execute on function public.rpc_tolak_pendaftaran(uuid, text) to authenticated, service_role;
grant execute on function public.fn_status_langganan(date, date) to anon, authenticated, service_role;

commit;
