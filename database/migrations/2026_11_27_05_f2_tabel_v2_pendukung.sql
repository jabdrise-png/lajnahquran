-- =====================================================================
-- 2026_11_27_05_f2_tabel_v2_pendukung.sql
-- Fase 2 · butir 3, 4, 5 (persiapan)
--
-- Tujuan:
--   1. musammi_attendance_records: kehadiran Musammi' per sesi (dulu hanya di
--      tabel lama `attendance` dengan peran 'Musammi'). Kolom badal disiapkan untuk F3.
--   2. Kolom jejak migrasi: attendance_records.legacy_attendance_id,
--      musammi_attendance_records.legacy_attendance_id, recitation_entries.legacy_payload.
--   3. Validasi memakai tabel referensi:
--      - status kehadiran dari attendance_statuses (bukan daftar tetap),
--      - validator & audit setoran hanya memakai kolom kanonik
--        (santri_id, recitation_date, surah_*_no, ayah_*, calculated_pages,
--        major_mistakes, minor_mistakes).
--   4. Mode migrasi: set_config('app.legacy_migration', 'on', true) di dalam
--      transaksi migrasi data agar validasi alur kerja (roster/status) dilewati
--      untuk data lama. Hanya bisa dipakai oleh pemilik database (SQL Editor),
--      karena RPC aplikasi tidak pernah menyetelnya.
--   5. Kolom kembar recitation_entries diisi ke kolom kanonik (persiapan penghapusan
--      di 2026_11_27_08).
--
-- Rollback:
--   drop table if exists public.musammi_attendance_records;
--   alter table public.attendance_records drop column if exists legacy_attendance_id;
--   alter table public.recitation_entries drop column if exists legacy_payload;
--   jalankan ulang definisi fungsi validator dari supabase_v2_1_production_hardening.sql
-- =====================================================================

begin;

create or replace function public.fn_is_legacy_migration()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.legacy_migration', true), '') = 'on' and auth.uid() is null;
$$;

-- ---------------------------------------------------------------------
-- 1. Kehadiran Musammi'
-- ---------------------------------------------------------------------
create table if not exists public.musammi_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.halaqah_sessions(id) on delete cascade,
  halaqah_id bigint,
  musammi_id bigint not null,
  attendance_date date not null,
  session_slot text not null,
  status text not null default 'hadir',
  is_badal boolean not null default false,
  badal_musammi_id bigint,
  notes text,
  marked_by uuid,
  correction_reason text,
  legacy_attendance_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint musammi_attendance_session_musammi_key unique (session_id, musammi_id),
  constraint musammi_attendance_badal_check check (not is_badal or badal_musammi_id is not null)
);
comment on table public.musammi_attendance_records is 'Kehadiran musammi'' per sesi halaqah. is_badal = digantikan musammi'' lain (badal_musammi_id).';

create index if not exists idx_musammi_attendance_org_date
  on public.musammi_attendance_records (organization_id, attendance_date desc);

alter table public.musammi_attendance_records enable row level security;
drop policy if exists musammi_attendance_select on public.musammi_attendance_records;
create policy musammi_attendance_select on public.musammi_attendance_records for select to authenticated
  using (
    public.is_admin_of_org(organization_id)
    or public.has_active_support_session(organization_id, false)
    or public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );
drop policy if exists musammi_attendance_write on public.musammi_attendance_records;
create policy musammi_attendance_write on public.musammi_attendance_records for all to authenticated
  using (public.is_admin_of_org(organization_id))
  with check (public.is_admin_of_org(organization_id));
grant select, insert, update, delete on public.musammi_attendance_records to authenticated;

-- ---------------------------------------------------------------------
-- 2. Jejak migrasi
-- ---------------------------------------------------------------------
alter table public.attendance_records add column if not exists legacy_attendance_id bigint;
create unique index if not exists uq_attendance_records_legacy on public.attendance_records (legacy_attendance_id)
  where legacy_attendance_id is not null;
alter table public.recitation_entries add column if not exists legacy_payload jsonb;
comment on column public.recitation_entries.legacy_payload is 'Isi asli baris setoran_harian bila setoran ini hasil migrasi Fase 2.';

create index if not exists idx_attendance_records_org_date
  on public.attendance_records (organization_id, attendance_date desc);
create index if not exists idx_recitation_entries_santri
  on public.recitation_entries (organization_id, santri_id, recitation_date desc);

-- ---------------------------------------------------------------------
-- 3a. Validasi kehadiran santri: status dari attendance_statuses
-- ---------------------------------------------------------------------
create or replace function public.fn_attendance_status_code(p_org uuid, p_status text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.code from public.attendance_statuses s
  where s.organization_id = p_org
    and (s.code = public.fn_slug(p_status) or lower(s.name) = lower(btrim(p_status)))
  order by (s.code = public.fn_slug(p_status)) desc
  limit 1;
$$;

create or replace function public.fn_validate_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.halaqah_sessions%rowtype;
  v_code text;
begin
  select * into v_session from public.halaqah_sessions where id = new.session_id;
  if v_session.id is null then
    raise exception 'Sesi halaqah tidak ditemukan untuk presensi ini.';
  end if;

  v_code := public.fn_attendance_status_code(new.organization_id, new.status);
  if v_code is null then
    raise exception 'Status kehadiran "%" tidak dikenal. Tambahkan dulu di Pengaturan > Status Kehadiran.', new.status
      using errcode = '22023';
  end if;
  new.status := v_code;

  if public.fn_is_legacy_migration() then
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if not exists (select 1 from public.attendance_statuses s
                   where s.organization_id = new.organization_id and s.code = v_code and s.is_active) then
      raise exception 'Status kehadiran "%" sudah dinonaktifkan.', v_code using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_session.roster_snapshot, '[]'::jsonb)) r
    where (r->>'santri_id')::bigint = new.santri_id
  ) then
    raise exception 'Santri ID % tidak terdaftar dalam roster sesi halaqah ini.', new.santri_id;
  end if;

  if v_session.status = 'locked' then
    if not public.fn_alasan_valid(new.correction_reason, 5) then
      raise exception 'Sesi telah dikunci. Perubahan kehadiran wajib menyertakan alasan koreksi (minimal 5 karakter).';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Validasi kehadiran musammi'
create or replace function public.fn_validate_musammi_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.halaqah_sessions%rowtype;
  v_code text;
begin
  select * into v_session from public.halaqah_sessions where id = new.session_id;
  if v_session.id is null then
    raise exception 'Sesi halaqah tidak ditemukan.';
  end if;
  new.organization_id := v_session.organization_id;
  new.halaqah_id := coalesce(new.halaqah_id, v_session.halaqah_id);
  new.attendance_date := v_session.session_date;
  new.session_slot := v_session.session_slot;

  v_code := public.fn_attendance_status_code(new.organization_id, new.status);
  if v_code is null then
    raise exception 'Status kehadiran "%" tidak dikenal.', new.status using errcode = '22023';
  end if;
  new.status := v_code;

  if not exists (select 1 from public.musammi m where m.id = new.musammi_id and m.organization_id = new.organization_id) then
    raise exception 'Musammi'' ID % tidak terdaftar di lembaga ini.', new.musammi_id;
  end if;
  if new.badal_musammi_id is not null and not exists (
    select 1 from public.musammi m where m.id = new.badal_musammi_id and m.organization_id = new.organization_id
  ) then
    raise exception 'Musammi'' badal ID % tidak terdaftar di lembaga ini.', new.badal_musammi_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_musammi_attendance on public.musammi_attendance_records;
create trigger trg_validate_musammi_attendance
  before insert or update on public.musammi_attendance_records
  for each row execute function public.fn_validate_musammi_attendance();

-- ---------------------------------------------------------------------
-- 3b. Setoran: hanya kolom kanonik
-- ---------------------------------------------------------------------
-- Isi kolom kanonik dari kolom kembar (data lama), sebelum validator baru aktif.
-- Dilewati bila kolom kembar sudah dihapus (2026_11_27_08 sudah dijalankan).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'recitation_entries' and column_name = 'student_id') then
    execute $q$update public.recitation_entries set santri_id = student_id where santri_id is null and student_id is not null$q$;
    execute $q$update public.recitation_entries set recitation_date = entry_date where recitation_date is null and entry_date is not null$q$;
    execute $q$update public.recitation_entries set ayah_start = start_ayah where ayah_start is null and start_ayah is not null$q$;
    execute $q$update public.recitation_entries set ayah_end = end_ayah where ayah_end is null and end_ayah is not null$q$;
    execute $q$update public.recitation_entries set surah_start_no = public.fn_surah_no(start_surah) where surah_start_no is null and start_surah is not null$q$;
    execute $q$update public.recitation_entries set surah_end_no = public.fn_surah_no(end_surah) where surah_end_no is null and end_surah is not null$q$;
    execute $q$update public.recitation_entries set calculated_pages = pages where coalesce(calculated_pages, 0) = 0 and coalesce(pages, 0) <> 0$q$;
    execute $q$update public.recitation_entries set major_mistakes = mistakes_major where coalesce(major_mistakes, 0) = 0 and coalesce(mistakes_major, 0) <> 0$q$;
    execute $q$update public.recitation_entries set minor_mistakes = mistakes_minor where coalesce(minor_mistakes, 0) = 0 and coalesce(mistakes_minor, 0) <> 0$q$;
  end if;
end;
$$;

create or replace function public.normalize_recitation_entries_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.recitation_date := coalesce(new.recitation_date, current_date);
  new.calculated_pages := coalesce(new.calculated_pages, 0);
  new.major_mistakes := coalesce(new.major_mistakes, 0);
  new.minor_mistakes := coalesce(new.minor_mistakes, 0);
  new.kind := coalesce(public.fn_slug(new.kind), 'ziyadah');
  if new.santri_id is null then
    raise exception 'Setoran wajib memiliki santri.' using errcode = '23502';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.trg_audit_recitation_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' and not public.fn_is_legacy_migration() then
    if new.revision_no is not distinct from old.revision_no and (
      new.surah_start_no is distinct from old.surah_start_no
      or new.ayah_start is distinct from old.ayah_start
      or new.surah_end_no is distinct from old.surah_end_no
      or new.ayah_end is distinct from old.ayah_end
      or new.calculated_pages is distinct from old.calculated_pages
      or new.minor_mistakes is distinct from old.minor_mistakes
      or new.major_mistakes is distinct from old.major_mistakes
      or new.kind is distinct from old.kind
      or new.score is distinct from old.score
      or new.notes is distinct from old.notes
    ) then
      new.revision_no := coalesce(old.revision_no, 1) + 1;
      insert into public.recitation_revisions (
        organization_id, entry_id, recitation_entry_id, revision_no, action,
        previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
      ) values (
        new.organization_id, new.id, new.id, new.revision_no, 'edit_content',
        old.status, new.status, coalesce(new.review_reason, 'Koreksi data setoran'),
        to_jsonb(old), to_jsonb(new), auth.uid(), auth.uid()
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_validate_recitation_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_content_changed boolean;
begin
  if new.surah_start_no is not null and (new.surah_start_no < 1 or new.surah_start_no > 114) then
    raise exception 'Nomor surat mulai tidak valid (harus 1-114).';
  end if;
  if new.surah_end_no is not null and (new.surah_end_no < 1 or new.surah_end_no > 114) then
    raise exception 'Nomor surat selesai tidak valid (harus 1-114).';
  end if;
  if new.surah_start_no is not null and new.surah_end_no is not null then
    if new.surah_end_no < new.surah_start_no then
      raise exception 'Surat selesai tidak boleh mendahului surat mulai.';
    elsif new.surah_end_no = new.surah_start_no and new.ayah_end < new.ayah_start then
      raise exception 'Ayat selesai tidak boleh lebih kecil dari ayat mulai pada surat yang sama.';
    end if;
  end if;
  if new.ayah_start is not null and new.ayah_start < 1 then
    raise exception 'Ayat mulai harus lebih besar dari 0.';
  end if;
  if new.ayah_end is not null and new.ayah_end < 1 then
    raise exception 'Ayat selesai harus lebih besar dari 0.';
  end if;
  if coalesce(new.minor_mistakes, 0) < 0 then
    raise exception 'Jumlah kesalahan shoghir tidak boleh negatif.';
  end if;
  if coalesce(new.major_mistakes, 0) < 0 then
    raise exception 'Jumlah kesalahan kabir tidak boleh negatif.';
  end if;

  -- Data lama yang dipindahkan oleh migrasi Fase 2 boleh langsung berstatus apa pun
  if public.fn_is_legacy_migration() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'Setoran baru hanya dapat dibuat dengan status draft atau submitted.';
    end if;
    if not exists (select 1 from public.recitation_kinds k
                   where k.organization_id = new.organization_id and k.code = new.kind and k.is_active) then
      raise exception 'Jenis setoran "%" tidak aktif atau tidak dikenal.', new.kind using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'voided' then
    raise exception 'Catatan setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah.';
  end if;

  v_is_admin := public.is_admin_of_org(old.organization_id);
  v_content_changed := (
    new.surah_start_no is distinct from old.surah_start_no or
    new.ayah_start is distinct from old.ayah_start or
    new.surah_end_no is distinct from old.surah_end_no or
    new.ayah_end is distinct from old.ayah_end or
    new.calculated_pages is distinct from old.calculated_pages or
    new.kind is distinct from old.kind
  );

  if old.status = new.status then
    if old.status in ('submitted', 'accepted') and not v_is_admin and v_content_changed then
      raise exception 'Setoran yang sudah dikirim hanya dapat dikoreksi oleh Admin.';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    null;
  elsif old.status = 'returned' and new.status = 'submitted' then
    if new.revision_no <= old.revision_no then
      new.revision_no := old.revision_no + 1;
    end if;
  elsif old.status = 'submitted' and new.status = 'accepted' then
    if not v_is_admin then
      raise exception 'Hanya Admin yang dapat menerima (accept) setoran.';
    end if;
  elsif (old.status = 'submitted' and new.status = 'returned')
     or (old.status in ('draft', 'submitted', 'returned', 'accepted') and new.status = 'voided') then
    if not v_is_admin then
      raise exception 'Hanya Admin yang dapat mengembalikan atau membatalkan setoran.';
    end if;
    if not public.fn_alasan_valid(new.review_reason, 5) then
      raise exception 'Alasan wajib diisi dengan jelas (minimal 5 karakter).';
    end if;
  else
    raise exception 'Transisi status setoran tidak sah: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- Sesi: data lama boleh langsung berstatus completed
create or replace function public.fn_validate_session_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.fn_is_legacy_migration() then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'locked' and new.status <> 'locked' then
    raise exception 'Sesi telah dikunci (locked). Perubahan status tidak diizinkan.';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Sesi telah dibatalkan (cancelled). Perubahan status tidak diizinkan.';
  end if;
  if old.status = 'completed' and new.status not in ('completed', 'locked', 'submitted', 'cancelled') then
    raise exception 'Transisi status dari completed ke % tidak diizinkan.', new.status;
  end if;
  if old.status = 'submitted' and new.status not in ('submitted', 'open', 'completed', 'locked', 'cancelled') then
    raise exception 'Transisi status dari submitted ke % tidak diizinkan.', new.status;
  end if;
  if old.status = 'open' and new.status not in ('open', 'submitted', 'completed', 'cancelled') then
    raise exception 'Transisi status dari open ke % tidak diizinkan.', new.status;
  end if;
  if old.status = 'scheduled' and new.status not in ('scheduled', 'open', 'cancelled') then
    raise exception 'Transisi status dari scheduled ke % tidak diizinkan.', new.status;
  end if;
  if old.status = 'locked' and new.roster_snapshot is distinct from old.roster_snapshot then
    raise exception 'Roster snapshot pada sesi yang telah dikunci tidak dapat diubah.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
