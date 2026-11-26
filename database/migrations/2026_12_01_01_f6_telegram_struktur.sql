-- =====================================================================
-- 2026_12_01_01_f6_telegram_struktur.sql
-- Fase 6 · Telegram & laporan otomatis — struktur
--
-- Tujuan:
--   1. santri.kode_telegram: kode unik ACAK 8 karakter (tanpa huruf/angka mirip: I, O, 0, 1) untuk
--      penautan Telegram wali. Dibuat otomatis untuk santri baru & santri lama; bisa dibuat ulang
--      Admin. Tidak bisa diubah langsung dari aplikasi (hanya lewat RPC).
--      santri.telegram_linked_at: kapan wali menautkan. Satu chat wali boleh untuk beberapa anak.
--   2. telegram_settings: pengaturan pesan per lembaga (setoran, kehadiran mingguan, progres periode):
--      aktif/tidak, template dengan variabel {nama_santri} dll., jadwal mingguan (hari & jam lokal).
--      Nilai awal: semua aktif, kehadiran mingguan Jumat 20.00. Pengaturan lama
--      SETORAN_TELEGRAM_NOTIF_ENABLE / _TEMPLATE dipindahkan.
--   3. notification_queue: antrian pesan Telegram (satu sumber pengiriman, dikirim server).
--      dedup_key mencegah pesan ganda. Aplikasi hanya bisa membaca (Admin), tidak menulis.
--   4. telegram_link_attempts: catatan percobaan penautan (batas tebakan kode).
--   5. fn_render_template: isi {variabel} (sama dengan renderTemplate() di lib/telegramPesan.ts).
--
-- Prasyarat: Fase 5 (2026_11_30_04)
-- Rollback:
--   drop table if exists public.notification_queue, public.telegram_link_attempts, public.telegram_settings;
--   drop trigger if exists trg_kode_telegram on public.santri;
--   alter table public.santri drop column if exists kode_telegram, drop column if exists telegram_linked_at;
--   drop function if exists public.fn_kode_telegram_baru(), public.fn_jaga_kode_telegram(),
--     public.fn_render_template(text, jsonb), public.fn_seed_telegram_settings();
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Kode Telegram santri
-- ---------------------------------------------------------------------
alter table public.santri add column if not exists kode_telegram text;
alter table public.santri add column if not exists telegram_linked_at timestamptz;
create unique index if not exists uq_santri_kode_telegram on public.santri (kode_telegram) where kode_telegram is not null;
comment on column public.santri.kode_telegram is
  'F6: kode acak 8 karakter untuk penautan Telegram wali (kirim kode ke bot). Dibuat ulang lewat rpc_buat_ulang_kode_telegram.';

create or replace function public.fn_kode_telegram_baru()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_abjad constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 simbol, tanpa I O 0 1
  v_b bytea;
  v text;
  i int;
begin
  loop
    v_b := gen_random_bytes(8);
    v := '';
    for i in 0..7 loop
      v := v || substr(v_abjad, (get_byte(v_b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.santri s where s.kode_telegram = v);
  end loop;
  return v;
end;
$$;
revoke all on function public.fn_kode_telegram_baru() from public, anon, authenticated;

-- Isi otomatis untuk santri baru; kode & tautan tidak bisa diganti langsung (hanya lewat RPC)
create or replace function public.fn_jaga_kode_telegram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('app.kode_telegram_rpc', true), '') <> 'on' or new.kode_telegram is null then
      new.kode_telegram := public.fn_kode_telegram_baru();
    end if;
    if new.telegram_chat_id is not null and new.telegram_linked_at is null then
      new.telegram_linked_at := now();
    end if;
    return new;
  end if;
  if new.kode_telegram is distinct from old.kode_telegram
     and coalesce(current_setting('app.kode_telegram_rpc', true), '') <> 'on' then
    new.kode_telegram := old.kode_telegram;
  end if;
  if new.kode_telegram is null then
    new.kode_telegram := public.fn_kode_telegram_baru();
  end if;
  if new.telegram_chat_id is distinct from old.telegram_chat_id then
    new.telegram_chat_id := nullif(btrim(coalesce(new.telegram_chat_id, '')), '');
    new.telegram_linked_at := case when new.telegram_chat_id is null then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_kode_telegram on public.santri;
create trigger trg_kode_telegram before insert or update on public.santri
  for each row execute function public.fn_jaga_kode_telegram();

-- Santri lama: buat kode satu per satu (unik)
do $$
declare v_id bigint;
begin
  perform set_config('app.kode_telegram_rpc', 'on', true);
  for v_id in select id from public.santri where kode_telegram is null order by id loop
    update public.santri set kode_telegram = public.fn_kode_telegram_baru() where id = v_id;
  end loop;
  update public.santri set telegram_linked_at = coalesce(created_at, now())
  where telegram_chat_id is not null and btrim(telegram_chat_id) <> '' and telegram_linked_at is null;
  perform set_config('app.kode_telegram_rpc', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 2. Pengaturan pesan Telegram per lembaga
-- ---------------------------------------------------------------------
create table if not exists public.telegram_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  setoran_aktif boolean not null default true,
  setoran_template text not null default
    E'Assalamu''alaikum. Setoran {jenis} ananda {nama_santri} ({halaqah})\n{tanggal}, {waktu}\nSurat: {surat}\nHalaman: {halaman}\nKhoto kabir/shoghir: {kabir}/{shoghir}\nPredikat: {predikat}{ulang}\nCatatan: {catatan}\n— {lembaga}',
  mingguan_aktif boolean not null default true,
  mingguan_hari smallint not null default 5,   -- 0 = Ahad … 5 = Jumat, 6 = Sabtu (waktu lembaga)
  mingguan_jam smallint not null default 20,   -- 0–23
  mingguan_template text not null default
    E'Assalamu''alaikum. Rekap kehadiran ananda {nama_santri} ({halaqah})\n{mulai} s.d. {selesai}\nHadir: {hadir} dari {total} sesi ({kehadiran})\nRincian: {rincian}\n— {lembaga}',
  mingguan_terakhir date,
  periode_aktif boolean not null default true,
  periode_template text not null default
    E'Assalamu''alaikum. Capaian ananda {nama_santri} ({halaqah}) — {periode}\nZiyadah: {ziyadah} halaman\nMurojaah: {murojaah} halaman\nPosisi hafalan: {posisi}\nTotal hafalan: {total_hafalan} juz\nKelancaran: {kelancaran}\nKehadiran: {kehadiran}\nCatatan: {catatan}\n— {lembaga}',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint telegram_settings_hari check (mingguan_hari between 0 and 6),
  constraint telegram_settings_jam check (mingguan_jam between 0 and 23),
  constraint telegram_settings_template check (
    length(btrim(setoran_template)) between 5 and 2000 and length(btrim(mingguan_template)) between 5 and 2000
    and length(btrim(periode_template)) between 5 and 2000)
);
comment on table public.telegram_settings is 'F6: pengaturan pesan Telegram wali per lembaga (setoran, kehadiran mingguan, progres periode).';

alter table public.telegram_settings enable row level security;
drop policy if exists telegram_settings_admin_select on public.telegram_settings;
create policy telegram_settings_admin_select on public.telegram_settings for select to authenticated
  using (public.is_admin_of_org(organization_id));
drop policy if exists telegram_settings_admin_update on public.telegram_settings;
create policy telegram_settings_admin_update on public.telegram_settings for update to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
revoke insert, delete on public.telegram_settings from anon, authenticated;
grant select, update on public.telegram_settings to authenticated;

create or replace function public.fn_touch_telegram_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.setoran_template := btrim(new.setoran_template);
  new.mingguan_template := btrim(new.mingguan_template);
  new.periode_template := btrim(new.periode_template);
  return new;
end;
$$;
drop trigger if exists trg_touch_telegram_settings on public.telegram_settings;
create trigger trg_touch_telegram_settings before insert or update on public.telegram_settings
  for each row execute function public.fn_touch_telegram_settings();

-- Semua lembaga; pengaturan lama setoran ikut dipindah
insert into public.telegram_settings (organization_id) select id from public.organizations
on conflict (organization_id) do nothing;
update public.telegram_settings t set setoran_aktif = false
from public.app_settings a
where a.organization_id = t.organization_id and a.key = 'SETORAN_TELEGRAM_NOTIF_ENABLE'
  and lower(btrim(coalesce(a.value, ''))) = 'false'
  and t.updated_by is null;
update public.telegram_settings t set setoran_template = left(btrim(a.value), 2000)
from public.app_settings a
where a.organization_id = t.organization_id and a.key = 'SETORAN_TELEGRAM_NOTIF_TEMPLATE'
  and length(btrim(coalesce(a.value, ''))) >= 5
  and t.updated_by is null;

create or replace function public.fn_seed_telegram_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.telegram_settings (organization_id) values (new.id) on conflict (organization_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_seed_telegram_settings on public.organizations;
create trigger trg_seed_telegram_settings after insert on public.organizations
  for each row execute function public.fn_seed_telegram_settings();

-- ---------------------------------------------------------------------
-- 3. Antrian pesan
-- ---------------------------------------------------------------------
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  santri_id bigint references public.santri(id) on delete cascade,
  chat_id text not null,
  jenis text not null,
  pesan text not null,
  dedup_key text not null,
  status text not null default 'antri',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint notification_queue_jenis check (jenis in ('setoran', 'kehadiran_mingguan', 'progres_periode', 'uji')),
  constraint notification_queue_status check (status in ('antri', 'proses', 'terkirim', 'gagal', 'batal')),
  constraint notification_queue_pesan check (length(pesan) between 1 and 4000),
  constraint notification_queue_dedup unique (organization_id, dedup_key)
);
create index if not exists idx_notification_queue_siap on public.notification_queue (next_attempt_at)
  where status in ('antri', 'proses');
create index if not exists idx_notification_queue_org on public.notification_queue (organization_id, created_at desc);
comment on table public.notification_queue is
  'F6: antrian pesan Telegram ke wali. Diisi fungsi server (setoran, kehadiran mingguan, progres periode), dikirim pemroses antrian (Netlify).';

alter table public.notification_queue enable row level security;
drop policy if exists notification_queue_admin_select on public.notification_queue;
create policy notification_queue_admin_select on public.notification_queue for select to authenticated
  using (public.is_admin_of_org(organization_id));
revoke insert, update, delete on public.notification_queue from anon, authenticated;
grant select on public.notification_queue to authenticated;

-- ---------------------------------------------------------------------
-- 4. Percobaan penautan (hanya server)
-- ---------------------------------------------------------------------
create table if not exists public.telegram_link_attempts (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chat_id text not null,
  kode text,
  berhasil boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_telegram_link_attempts on public.telegram_link_attempts (organization_id, chat_id, created_at desc);
alter table public.telegram_link_attempts enable row level security;
revoke all on public.telegram_link_attempts from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Render template: {variabel} diganti nilai; variabel tak dikenal dibiarkan; nilai null = "-".
--    Satu kali lintas (nilai yang berisi "{x}" tidak diganti lagi). Sama dengan renderTemplate() di layar.
-- ---------------------------------------------------------------------
create or replace function public.fn_render_template(p_tpl text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_out text := '';
  v_rest text := coalesce(p_tpl, '');
  v_m text[];
  v_pos int;
begin
  loop
    v_m := regexp_match(v_rest, '\{([a-z_]+)\}');
    exit when v_m is null;
    v_pos := strpos(v_rest, '{' || v_m[1] || '}');
    v_out := v_out || left(v_rest, v_pos - 1)
      || case when p_vars ? v_m[1] then coalesce(p_vars->>v_m[1], '-') else '{' || v_m[1] || '}' end;
    v_rest := substr(v_rest, v_pos + length(v_m[1]) + 2);
  end loop;
  return v_out || v_rest;
end;
$$;
grant execute on function public.fn_render_template(text, jsonb) to authenticated, service_role;

commit;
