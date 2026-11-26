-- =====================================================================
-- 2026_11_28_03_f3_absensi_tanpa_kunci.sql
-- Fase 3 · butir 1, 2, 3, 4, 5 (BUG-11)
--
-- Tujuan:
--   1. Tidak ada kunci sesi. Sesi 'locked' dijadikan 'completed';
--      rpc_lock_halaqah_session & rpc_save_attendance_batch dihapus
--      (semua absensi lewat rpc_record_attendance).
--   2. Sesi tercatat saat absensi pertama disimpan: rpc_open_halaqah_session
--      hanya menampilkan roster, tidak lagi membuat sesi.
--   3. Aturan perubahan absensi:
--      - di HARI YANG SAMA (zona waktu lembaga) Admin dan Musammi' yang ditugaskan
--        boleh mengisi/memperbarui; tercatat siapa yang terakhir mengubah;
--      - mengubah atau menghapus catatan pada tanggal yang SUDAH LEWAT = koreksi:
--        hanya Admin dan wajib alasan >= 5 karakter (tercatat di log audit).
--   4. Badal: kehadiran musammi' bisa diisi "digantikan oleh" musammi' lain.
--      Musammi' badal boleh mencatat absensi & setoran halaqah itu pada tanggal itu.
--   5. Nama pengubah terakhir disimpan (marked_by_name) agar tampil di layar.
--   6. rpc_jadwal_bentrok(): musammi' atau santri yang terjadwal di dua halaqah
--      pada waktu yang sama.
--
-- Prasyarat: 2026_11_28_02
-- Rollback: jalankan ulang definisi fungsi dari 2026_11_27_05 dan 2026_11_27_07;
--   alter table ... drop column marked_by_name; kembalikan halaqah_sessions_status_check
--   dengan 'locked'.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Sesi tanpa kunci
-- ---------------------------------------------------------------------
do $$ begin perform set_config('app.legacy_migration', 'on', true); end $$;
update public.halaqah_sessions set status = 'completed' where status = 'locked';
do $$ begin perform set_config('app.legacy_migration', '', true); end $$;

alter table public.halaqah_sessions drop constraint if exists halaqah_sessions_status_check;
alter table public.halaqah_sessions
  add constraint halaqah_sessions_status_check check (status in ('scheduled', 'open', 'submitted', 'completed', 'cancelled'));

drop function if exists public.rpc_lock_halaqah_session(bigint, date, text, text);
drop function if exists public.rpc_lock_halaqah_session(uuid, text);
drop function if exists public.rpc_save_attendance_batch(uuid, jsonb, text, text);

create or replace function public.fn_validate_session_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_is_legacy_migration() and old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Sesi telah dibatalkan. Perubahan status tidak diizinkan.';
  end if;
  new.updated_at := now();
  return new;
end;
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
    raise exception 'Status kehadiran "%" tidak dikenal. Tambahkan dulu di Pengaturan > Referensi Data Dasar.', new.status
      using errcode = '22023';
  end if;
  new.status := v_code;
  if public.fn_is_legacy_migration() then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.status is distinct from old.status)
     and not exists (select 1 from public.attendance_statuses s
                     where s.organization_id = new.organization_id and s.code = v_code and s.is_active) then
    raise exception 'Status kehadiran "%" sudah dinonaktifkan.', v_code using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_session.roster_snapshot, '[]'::jsonb)) r
    where (r->>'santri_id')::bigint = new.santri_id
  ) then
    raise exception 'Santri ID % tidak terdaftar dalam roster sesi halaqah ini.', new.santri_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Nama pengubah terakhir
-- ---------------------------------------------------------------------
alter table public.attendance_records add column if not exists marked_by_name text;
alter table public.musammi_attendance_records add column if not exists marked_by_name text;

create or replace function public.fn_fill_marked_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marked_by is not null and (tg_op = 'INSERT' or new.marked_by is distinct from old.marked_by
                                    or new.status is distinct from old.status or new.marked_by_name is null) then
    select coalesce(nullif(up.full_name, ''), nullif(p.full_name, ''), p.email, up.email)
    into new.marked_by_name
    from (select new.marked_by as id) x
    left join public.user_profiles up on up.user_id = x.id
    left join public.profiles p on p.id = x.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_fill_marked_by_name on public.attendance_records;
create trigger trg_zz_fill_marked_by_name before insert or update on public.attendance_records
  for each row execute function public.fn_fill_marked_by_name();
drop trigger if exists trg_zz_fill_marked_by_name on public.musammi_attendance_records;
create trigger trg_zz_fill_marked_by_name before insert or update on public.musammi_attendance_records
  for each row execute function public.fn_fill_marked_by_name();

-- ---------------------------------------------------------------------
-- 3. Aturan hak mencatat & koreksi
-- ---------------------------------------------------------------------
create or replace function public.fn_hari_ini_lembaga(p_org uuid)
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone coalesce((select o.timezone from public.organizations o where o.id = p_org), 'Asia/Jakarta'))::date;
$$;

create or replace function public.fn_assert_can_record(p_org uuid, p_halaqah_id bigint, p_date date)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fn_bisa_mencatat(p_org, p_halaqah_id, p_date) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada halaqah ini.' using errcode = '42501';
  end if;
end;
$$;

-- Mengubah/menghapus catatan yang sudah ada pada tanggal yang sudah lewat = koreksi Admin beralasan
create or replace function public.fn_assert_can_correct(p_org uuid, p_halaqah_id bigint, p_date date, p_reason text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.fn_assert_can_record(p_org, p_halaqah_id, p_date);
  if p_date < public.fn_hari_ini_lembaga(p_org) then
    if not coalesce(public.is_admin_of_org(p_org), false) then
      raise exception 'Absensi tanggal % sudah lewat. Koreksi dilakukan oleh Admin.', p_date using errcode = '42501';
    end if;
    if not public.fn_alasan_valid(p_reason, 5) then
      raise exception 'Koreksi absensi tanggal % wajib menyertakan alasan yang jelas (minimal 5 karakter).', p_date
        using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function public.fn_assert_can_correct(uuid, bigint, date, text) from public, anon;
revoke all on function public.fn_hari_ini_lembaga(uuid) from public, anon;

-- ---------------------------------------------------------------------
-- 4. Roster tanpa membuat sesi
-- ---------------------------------------------------------------------
create or replace function public.rpc_open_halaqah_session(p_halaqah_id bigint, p_session_date date, p_session_slot text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_session public.halaqah_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  select organization_id into v_org from public.halaqah where id = p_halaqah_id;
  if v_org is null then
    raise exception 'Halaqah tidak ditemukan';
  end if;
  if not (public.fn_bisa_mencatat(v_org, p_halaqah_id, p_session_date)
          or coalesce(public.has_active_support_session(v_org, false), false)) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada halaqah ini.' using errcode = '42501';
  end if;

  select * into v_session from public.halaqah_sessions
  where organization_id = v_org and halaqah_id = p_halaqah_id
    and session_date = p_session_date and session_slot = p_session_slot;

  -- Fase 3: sesi baru tercatat saat absensi pertama disimpan (rpc_record_attendance)
  return jsonb_build_object(
    'session_id', v_session.id,
    'organization_id', v_org,
    'status', coalesce(v_session.status, 'belum_dibuka'),
    'roster', case when v_session.id is null then public.fn_session_roster(v_org, p_halaqah_id, p_session_date)
                   else v_session.roster_snapshot end,
    'is_existing', v_session.id is not null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Simpan absensi (santri & musammi', badal, aturan koreksi)
-- p_records: [{ "peran": "Santri"|"Musammi", "person_id": 1, "date": "2026-11-20", "waktu": "Shubuh",
--               "status": "Hadir", "halaqah_id": 5, "is_badal": false, "badal_musammi_id": null }]
-- ---------------------------------------------------------------------
create or replace function public.rpc_record_attendance(p_records jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_peran text;
  v_person bigint;
  v_date date;
  v_slot text;
  v_halaqah bigint;
  v_org uuid;
  v_session public.halaqah_sessions%rowtype;
  v_status text;
  v_old_status text;
  v_old_badal boolean;
  v_old_badal_id bigint;
  v_is_badal boolean;
  v_badal_id bigint;
  v_saved int := 0;
  v_unchanged int := 0;
  v_sessions uuid[] := array[]::uuid[];
  v_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Daftar absensi kosong.';
  end if;

  for v_item in select * from jsonb_array_elements(p_records) loop
    v_peran := lower(coalesce(v_item->>'peran', 'santri'));
    v_person := nullif(v_item->>'person_id', '')::bigint;
    v_date := (v_item->>'date')::date;
    v_slot := nullif(btrim(coalesce(v_item->>'waktu', v_item->>'session_slot')), '');
    v_halaqah := nullif(v_item->>'halaqah_id', '')::bigint;
    v_is_badal := coalesce((v_item->>'is_badal')::boolean, false);
    v_badal_id := nullif(v_item->>'badal_musammi_id', '')::bigint;
    if v_person is null or v_date is null or v_slot is null then
      raise exception 'Data absensi tidak lengkap (orang, tanggal, dan waktu wajib).';
    end if;

    if v_peran = 'santri' then
      select organization_id into v_org from public.santri where id = v_person;
      if v_org is null then raise exception 'Santri % tidak ditemukan.', v_person; end if;
      if v_halaqah is null then
        select m.halaqah_id into v_halaqah from public.halaqah_student_memberships m
        where m.organization_id = v_org and m.student_id = v_person and m.status = 'active'
          and m.valid_from <= v_date and (m.valid_to is null or m.valid_to >= v_date)
        order by m.valid_from desc limit 1;
      end if;
    else
      select organization_id into v_org from public.musammi where id = v_person;
      if v_org is null then raise exception 'Musammi'' % tidak ditemukan.', v_person; end if;
      if v_halaqah is null then
        select coalesce(
          (select a.halaqah_id from public.halaqah_musammi_assignments a
            where a.organization_id = v_org and a.musammi_id = v_person and a.is_active and a.status = 'active'
              and (a.valid_from is null or a.valid_from <= v_date) and (a.valid_to is null or a.valid_to >= v_date)
            order by a.is_primary desc limit 1),
          (select h.id from public.halaqah h where h.organization_id = v_org and h.musammi_id = v_person
            order by (v_slot = any(coalesce(h.waktu, array[]::text[]))) desc, h.id limit 1))
        into v_halaqah;
      end if;
      if v_is_badal and v_badal_id is null then
        raise exception 'Pilih musammi'' pengganti (badal).';
      end if;
      if v_badal_id = v_person then
        raise exception 'Musammi'' badal tidak boleh sama dengan musammi'' yang digantikan.';
      end if;
      if not v_is_badal then
        v_badal_id := null;
      end if;
    end if;

    if v_halaqah is null then
      raise exception 'Halaqah untuk % ID % pada % belum diketahui. Pilih halaqahnya dulu.', initcap(v_peran), v_person, v_date;
    end if;
    if not exists (select 1 from public.halaqah h where h.id = v_halaqah and h.organization_id = v_org) then
      raise exception 'Halaqah % bukan milik lembaga ini.', v_halaqah;
    end if;

    perform public.fn_assert_can_record(v_org, v_halaqah, v_date);

    v_status := public.fn_attendance_status_code(v_org, v_item->>'status');
    if v_status is null then
      raise exception 'Status kehadiran "%" tidak dikenal.', v_item->>'status' using errcode = '22023';
    end if;

    v_session := public.fn_get_or_create_session(v_org, v_halaqah, v_date, v_slot);

    if v_peran = 'santri' then
      select status into v_old_status from public.attendance_records
      where session_id = v_session.id and santri_id = v_person;
      if v_old_status is not null and v_old_status = v_status then
        v_unchanged := v_unchanged + 1;
        continue;
      end if;
      if v_old_status is not null then
        perform public.fn_assert_can_correct(v_org, v_halaqah, v_date, v_reason);
      end if;

      if not exists (select 1 from jsonb_array_elements(coalesce(v_session.roster_snapshot, '[]'::jsonb)) r
                     where (r->>'santri_id')::bigint = v_person) then
        update public.halaqah_sessions
        set roster_snapshot = coalesce(roster_snapshot, '[]'::jsonb) || (
          select jsonb_build_array(jsonb_build_object('santri_id', s.id, 'nama', s.nama, 'kode', s.kode,
                   'marhalah', s.marhalah, 'kelas', s.kelas, 'status', 'Belum diisi'))
          from public.santri s where s.id = v_person)
        where id = v_session.id;
      end if;

      insert into public.attendance_records (
        organization_id, session_id, halaqah_id, santri_id, attendance_date, session_slot, status, marked_by, correction_reason
      ) values (
        v_org, v_session.id, v_halaqah, v_person, v_date, v_slot, v_status, auth.uid(), v_reason
      )
      on conflict (session_id, santri_id) do update
      set status = excluded.status, marked_by = excluded.marked_by,
          correction_reason = coalesce(excluded.correction_reason, public.attendance_records.correction_reason)
      returning id into v_id;
    else
      select status, is_badal, badal_musammi_id into v_old_status, v_old_badal, v_old_badal_id
      from public.musammi_attendance_records where session_id = v_session.id and musammi_id = v_person;
      if v_old_status is not null and v_old_status = v_status
         and v_old_badal = v_is_badal and v_old_badal_id is not distinct from v_badal_id then
        v_unchanged := v_unchanged + 1;
        continue;
      end if;
      if v_old_status is not null then
        perform public.fn_assert_can_correct(v_org, v_halaqah, v_date, v_reason);
      end if;

      insert into public.musammi_attendance_records (
        organization_id, session_id, halaqah_id, musammi_id, attendance_date, session_slot, status,
        is_badal, badal_musammi_id, marked_by, correction_reason
      ) values (
        v_org, v_session.id, v_halaqah, v_person, v_date, v_slot, v_status, v_is_badal, v_badal_id, auth.uid(), v_reason
      )
      on conflict (session_id, musammi_id) do update
      set status = excluded.status, is_badal = excluded.is_badal, badal_musammi_id = excluded.badal_musammi_id,
          marked_by = excluded.marked_by,
          correction_reason = coalesce(excluded.correction_reason, public.musammi_attendance_records.correction_reason)
      returning id into v_id;
    end if;

    v_ids := v_ids || v_id;
    if not (v_session.id = any(v_sessions)) then
      v_sessions := v_sessions || v_session.id;
    end if;
    v_saved := v_saved + 1;
  end loop;

  update public.halaqah_sessions
  set status = 'submitted', completed_by = coalesce(completed_by, auth.uid()), completed_at = coalesce(completed_at, now())
  where id = any(v_sessions) and status in ('scheduled', 'open');

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  select hs.organization_id, auth.uid(), public.get_role_for_org(hs.organization_id),
         case when hs.session_date < public.fn_hari_ini_lembaga(hs.organization_id) then 'correct_attendance' else 'record_attendance' end,
         'halaqah_sessions', hs.id::text, v_reason,
         jsonb_build_object('session_date', hs.session_date, 'session_slot', hs.session_slot)
  from public.halaqah_sessions hs where hs.id = any(v_sessions);

  return jsonb_build_object('saved_count', v_saved, 'unchanged_count', v_unchanged,
                            'session_ids', to_jsonb(v_sessions), 'ids', to_jsonb(v_ids));
end;
$$;

create or replace function public.rpc_update_attendance_entry(p_kind text, p_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_halaqah bigint; v_date date; v_old text; v_status text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if lower(p_kind) = 'musammi' then
    select organization_id, halaqah_id, attendance_date, status into v_org, v_halaqah, v_date, v_old
    from public.musammi_attendance_records where id = p_id;
  else
    select organization_id, halaqah_id, attendance_date, status into v_org, v_halaqah, v_date, v_old
    from public.attendance_records where id = p_id;
  end if;
  if v_org is null then raise exception 'Catatan absensi tidak ditemukan.'; end if;
  v_status := public.fn_attendance_status_code(v_org, p_status);
  if v_status is null then raise exception 'Status kehadiran "%" tidak dikenal.', p_status using errcode = '22023'; end if;
  if v_status = v_old then
    return jsonb_build_object('id', p_id, 'status', v_status, 'unchanged', true);
  end if;
  perform public.fn_assert_can_correct(v_org, v_halaqah, v_date, p_reason);

  if lower(p_kind) = 'musammi' then
    update public.musammi_attendance_records
    set status = v_status, marked_by = auth.uid(), correction_reason = coalesce(nullif(btrim(p_reason), ''), correction_reason)
    where id = p_id;
  else
    update public.attendance_records
    set status = v_status, marked_by = auth.uid(), correction_reason = coalesce(nullif(btrim(p_reason), ''), correction_reason)
    where id = p_id;
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state)
  values (v_org, auth.uid(), public.get_role_for_org(v_org),
          case when v_date < public.fn_hari_ini_lembaga(v_org) then 'correct_attendance' else 'update_attendance' end,
          case when lower(p_kind) = 'musammi' then 'musammi_attendance_records' else 'attendance_records' end,
          p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
          jsonb_build_object('status', v_old), jsonb_build_object('status', v_status));
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

create or replace function public.rpc_delete_attendance_entries(p_items jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb; v_kind text; v_id uuid; v_row record; v_deleted int := 0;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Daftar absensi tidak valid.'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kind := lower(coalesce(v_item->>'kind', 'santri'));
    v_id := (v_item->>'id')::uuid;
    if v_kind = 'musammi' then
      select organization_id, halaqah_id, attendance_date, status into v_row from public.musammi_attendance_records where id = v_id;
    else
      select organization_id, halaqah_id, attendance_date, status into v_row from public.attendance_records where id = v_id;
    end if;
    continue when v_row.organization_id is null;
    perform public.fn_assert_can_correct(v_row.organization_id, v_row.halaqah_id, v_row.attendance_date, p_reason);
    if v_kind = 'musammi' then
      delete from public.musammi_attendance_records where id = v_id;
    else
      delete from public.attendance_records where id = v_id;
    end if;
    insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state)
    values (v_row.organization_id, auth.uid(), public.get_role_for_org(v_row.organization_id), 'delete_attendance',
            case when v_kind = 'musammi' then 'musammi_attendance_records' else 'attendance_records' end,
            v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
            jsonb_build_object('status', v_row.status, 'date', v_row.attendance_date, 'halaqah_id', v_row.halaqah_id));
    v_deleted := v_deleted + 1;
  end loop;
  return jsonb_build_object('deleted_count', v_deleted);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Jadwal bentrok
-- ---------------------------------------------------------------------
create or replace function public.rpc_jadwal_bentrok(p_org uuid default null)
returns table (jenis text, orang_id bigint, nama text, waktu text, halaqah_ids bigint[], halaqah_nama text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, public.get_my_org_id());
begin
  if auth.uid() is null or not (coalesce(public.is_admin_of_org(v_org), false) or public.is_super_admin()) then
    raise exception 'Akses ditolak: hanya Admin.' using errcode = '42501';
  end if;
  return query
  with jadwal as (
    select h.id, h.nama, unnest(coalesce(h.waktu, array[]::text[])) as w
    from public.halaqah h
    where h.organization_id = v_org and coalesce(h.is_active, true) and not coalesce(h.is_archived, false)
  ),
  pengampu as (
    select distinct h.id as halaqah_id, coalesce(a.musammi_id, h.musammi_id) as musammi_id
    from public.halaqah h
    left join public.halaqah_musammi_assignments a
      on a.halaqah_id = h.id and a.organization_id = h.organization_id and a.is_active and a.status = 'active'
     and a.assignment_type = 'primary' and (a.valid_to is null or a.valid_to >= current_date)
    where h.organization_id = v_org
  ),
  anggota as (
    select distinct m.halaqah_id, m.student_id
    from public.halaqah_student_memberships m
    where m.organization_id = v_org and m.status = 'active' and (m.valid_to is null or m.valid_to >= current_date)
  )
  select 'musammi'::text, p.musammi_id, ms.nama, j.w, array_agg(j.id order by j.id), array_agg(j.nama order by j.id)
  from jadwal j join pengampu p on p.halaqah_id = j.id join public.musammi ms on ms.id = p.musammi_id
  where p.musammi_id is not null
  group by p.musammi_id, ms.nama, j.w having count(distinct j.id) > 1
  union all
  select 'santri'::text, a.student_id, s.nama, j.w, array_agg(j.id order by j.id), array_agg(j.nama order by j.id)
  from jadwal j join anggota a on a.halaqah_id = j.id join public.santri s on s.id = a.student_id
  group by a.student_id, s.nama, j.w having count(distinct j.id) > 1;
end;
$$;

revoke all on function public.rpc_jadwal_bentrok(uuid) from public, anon;
grant execute on function public.rpc_jadwal_bentrok(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
