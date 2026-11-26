-- =====================================================================
-- 2026_11_27_04_f2_santri_dan_nama_marhalah.sql
-- Fase 2 · butir 8 (BUG-10) dan butir 9
--
-- Tujuan:
--   1. Santri: kolom tanggal_lahir dan asal; NIS (kolom `kode`) wajib untuk
--      santri baru dan unik per lembaga.
--   2. BUG-10: nama marhalah/kelas di semua tabel selalu mengikuti data master
--      (master_marhalah, master_kelas_relasi). Kolom teks lama (marhalah, kelas,
--      marhalah_name, class_name) diisi otomatis dari master saat ID diisi, dan
--      ikut berubah bila nama di master diganti.
--
-- Rollback:
--   drop trigger if exists trg_zz_master_names on public.santri; (dst. untuk halaqah,
--     musammi, wali_kelas, class_targets, student_enrollments)
--   drop trigger if exists trg_cascade_master_marhalah_name on public.master_marhalah;
--   drop trigger if exists trg_cascade_master_kelas_name on public.master_kelas_relasi;
--   drop trigger if exists trg_require_santri_nis on public.santri;
--   drop index if exists public.uq_santri_org_nis;
--   alter table public.santri drop column if exists tanggal_lahir, drop column if exists asal;
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Kolom baru santri
-- ---------------------------------------------------------------------
alter table public.santri add column if not exists tanggal_lahir date;
alter table public.santri add column if not exists asal text;
comment on column public.santri.kode is 'NIS (Nomor Induk Santri). Wajib untuk santri baru, unik per lembaga.';
comment on column public.santri.asal is 'Asal santri (kota/kabupaten atau sekolah asal).';

create or replace function public.fn_require_santri_nis()
returns trigger
language plpgsql
as $$
begin
  new.kode := nullif(btrim(new.kode), '');
  if tg_op = 'INSERT' and new.kode is null then
    raise exception 'NIS santri wajib diisi.' using errcode = '23502';
  end if;
  if tg_op = 'UPDATE' and new.kode is null and old.kode is not null then
    raise exception 'NIS santri tidak boleh dikosongkan.' using errcode = '23502';
  end if;
  if new.tanggal_lahir is not null and (new.tanggal_lahir > current_date or new.tanggal_lahir < date '1940-01-01') then
    raise exception 'Tanggal lahir santri tidak masuk akal: %', new.tanggal_lahir using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_santri_nis on public.santri;
create trigger trg_require_santri_nis
  before insert or update of kode, tanggal_lahir on public.santri
  for each row execute function public.fn_require_santri_nis();

do $$
declare v_dupes int;
begin
  select count(*) into v_dupes from (
    select organization_id, lower(btrim(kode))
    from public.santri
    where nullif(btrim(kode), '') is not null
    group by 1, 2 having count(*) > 1
  ) d;
  if v_dupes = 0 then
    execute 'create unique index if not exists uq_santri_org_nis on public.santri (organization_id, lower(btrim(kode))) where nullif(btrim(kode), '''') is not null';
  else
    raise notice 'PERHATIAN: % NIS ganda ditemukan. Indeks unik NIS belum dibuat. Rapikan lalu jalankan ulang migrasi ini. Cek: select organization_id, kode, count(*) from santri group by 1,2 having count(*) > 1;', v_dupes;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Nama marhalah & kelas selalu dari master (BUG-10)
-- ---------------------------------------------------------------------
create or replace function public.fn_fill_master_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marhalah_id uuid;
  v_kelas_id uuid;
  v_marhalah text;
  v_kelas text;
begin
  if tg_table_name = 'student_enrollments' then
    v_marhalah_id := coalesce(new.master_marhalah_id, new.marhalah_id);
    v_kelas_id := coalesce(new.master_kelas_id, new.kelas_id);
  else
    v_marhalah_id := new.marhalah_id;
    if tg_table_name <> 'halaqah' then
      v_kelas_id := new.kelas_id;
    end if;
  end if;

  -- Kelas menentukan marhalah bila marhalah_id kosong
  if v_kelas_id is not null and v_marhalah_id is null then
    select k.marhalah_id into v_marhalah_id from public.master_kelas_relasi k where k.id = v_kelas_id;
    if tg_table_name = 'student_enrollments' then
      new.master_marhalah_id := coalesce(new.master_marhalah_id, v_marhalah_id);
      new.marhalah_id := coalesce(new.marhalah_id, v_marhalah_id);
    else
      new.marhalah_id := v_marhalah_id;
    end if;
  end if;

  if v_marhalah_id is not null then
    select m.nama into v_marhalah from public.master_marhalah m where m.id = v_marhalah_id;
  end if;
  if v_kelas_id is not null then
    select k.nama_kelas into v_kelas from public.master_kelas_relasi k where k.id = v_kelas_id;
  end if;

  if v_marhalah is not null then
    new.marhalah := v_marhalah;
    if tg_table_name = 'student_enrollments' then
      new.marhalah_name := v_marhalah;
    end if;
  end if;
  if v_kelas is not null and tg_table_name <> 'halaqah' then
    new.kelas := v_kelas;
    if tg_table_name = 'student_enrollments' then
      new.class_name := v_kelas;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['santri', 'halaqah', 'musammi', 'wali_kelas', 'class_targets', 'student_enrollments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_zz_master_names on public.%I', t);
      execute format('create trigger trg_zz_master_names before insert or update on public.%I for each row execute function public.fn_fill_master_names()', t);
    end if;
  end loop;
end;
$$;

-- Ganti nama di master -> semua teks turunan ikut berubah
create or replace function public.fn_cascade_master_marhalah_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nama is distinct from old.nama then
    update public.santri set marhalah = new.nama where marhalah_id = new.id and marhalah is distinct from new.nama;
    update public.halaqah set marhalah = new.nama where marhalah_id = new.id and marhalah is distinct from new.nama;
    update public.musammi set marhalah = new.nama where marhalah_id = new.id and marhalah is distinct from new.nama;
    update public.wali_kelas set marhalah = new.nama where marhalah_id = new.id and marhalah is distinct from new.nama;
    update public.class_targets set marhalah = new.nama where marhalah_id = new.id and marhalah is distinct from new.nama;
    update public.student_enrollments set marhalah = new.nama, marhalah_name = new.nama
      where coalesce(master_marhalah_id, marhalah_id) = new.id
        and (marhalah is distinct from new.nama or marhalah_name is distinct from new.nama);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cascade_master_marhalah_name on public.master_marhalah;
create trigger trg_cascade_master_marhalah_name
  after update of nama on public.master_marhalah
  for each row execute function public.fn_cascade_master_marhalah_name();

create or replace function public.fn_cascade_master_kelas_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nama_kelas is distinct from old.nama_kelas or new.marhalah_id is distinct from old.marhalah_id then
    update public.santri set kelas = new.nama_kelas where kelas_id = new.id;
    update public.musammi set kelas = new.nama_kelas where kelas_id = new.id;
    update public.wali_kelas set kelas = new.nama_kelas where kelas_id = new.id;
    update public.class_targets set kelas = new.nama_kelas where kelas_id = new.id;
    update public.student_enrollments set kelas = new.nama_kelas, class_name = new.nama_kelas
      where coalesce(master_kelas_id, kelas_id) = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cascade_master_kelas_name on public.master_kelas_relasi;
create trigger trg_cascade_master_kelas_name
  after update of nama_kelas, marhalah_id on public.master_kelas_relasi
  for each row execute function public.fn_cascade_master_kelas_name();

-- Samakan data yang sudah ada (trigger trg_zz_master_names mengisi nama dari master).
-- Hanya baris yang namanya berbeda dari master yang disentuh.
update public.santri s set marhalah = m.nama
  from public.master_marhalah m where m.id = s.marhalah_id and s.marhalah is distinct from m.nama;
update public.santri s set kelas = k.nama_kelas
  from public.master_kelas_relasi k where k.id = s.kelas_id and s.kelas is distinct from k.nama_kelas;
update public.halaqah h set marhalah = m.nama
  from public.master_marhalah m where m.id = h.marhalah_id and h.marhalah is distinct from m.nama;
update public.musammi x set marhalah = m.nama
  from public.master_marhalah m where m.id = x.marhalah_id and x.marhalah is distinct from m.nama;
update public.wali_kelas x set marhalah = m.nama
  from public.master_marhalah m where m.id = x.marhalah_id and x.marhalah is distinct from m.nama;
update public.class_targets x set marhalah = m.nama
  from public.master_marhalah m where m.id = x.marhalah_id and x.marhalah is distinct from m.nama;
update public.student_enrollments e set marhalah = m.nama, marhalah_name = m.nama
  from public.master_marhalah m
  where m.id = coalesce(e.master_marhalah_id, e.marhalah_id)
    and (e.marhalah is distinct from m.nama or e.marhalah_name is distinct from m.nama);
update public.student_enrollments e set kelas = k.nama_kelas, class_name = k.nama_kelas
  from public.master_kelas_relasi k
  where k.id = coalesce(e.master_kelas_id, e.kelas_id)
    and (e.kelas is distinct from k.nama_kelas or e.class_name is distinct from k.nama_kelas);

notify pgrst, 'reload schema';

commit;
