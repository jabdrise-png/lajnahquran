-- =====================================================================
-- 2026_11_28_02_f3_setoran_langsung_sah.sql
-- Fase 3 · butir 7, 8, 9, 10, 12 (BUG-12, BUG-13)
--
-- Tujuan:
--   1. Alur validasi dihapus: setoran langsung sah (status 'accepted').
--      Status yang tersisa hanya 'accepted' dan 'voided' (dibatalkan Admin).
--      Data lama berstatus draft/submitted/returned dijadikan 'accepted'.
--   2. rpc_submit_recitation_entry (versi baru, tambah p_reason):
--      - halaman dihitung server dari mushaf (fn_hitung_halaman), angka dari layar diabaikan;
--      - predikat & penanda ulang (Rasib) dihitung server dari Tabel Kelancaran
--        (fn_predikat_kelancaran), predikat dari layar diabaikan (BUG-13);
--      - ayat dicek terhadap jumlah ayat surat;
--      - santri yang sudah diabsen dengan status yang tidak boleh setor
--        (mis. Izin, Sakit, Alpa) ditolak (BUG-12);
--      - koreksi setoran yang sudah tersimpan hanya oleh Admin, wajib alasan >= 5 karakter.
--   3. rpc_review_recitation_entry hanya untuk membatalkan (voided) oleh Admin dengan alasan.
--   4. Tulis langsung ke recitation_entries hanya Admin (aplikasi memakai RPC).
--
-- Prasyarat: 2026_11_28_01
-- Rollback: jalankan ulang definisi dari 2026_11_27_05 dan 2026_11_27_07; kembalikan
--   recitation_entries_status_check ke (draft, submitted, accepted, returned, voided).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Siapa boleh mencatat untuk halaqah & tanggal tertentu:
--    Admin lembaga, Musammi' yang ditugaskan (utama/pengganti), atau Musammi'
--    yang tercatat sebagai BADAL di halaqah itu pada tanggal itu.
-- ---------------------------------------------------------------------
create or replace function public.fn_bisa_mencatat(p_org uuid, p_halaqah_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin_of_org(p_org), false)
    or (p_halaqah_id is not null and (
         coalesce(public.is_musammi_assigned_to_halaqah_on_date(p_org, p_halaqah_id, p_date), false)
      or coalesce(public.is_musammi_assigned_to_halaqah(p_org, p_halaqah_id), false)
      or exists (
           select 1 from public.musammi_attendance_records r
           join public.musammi m on m.id = r.badal_musammi_id and m.organization_id = r.organization_id
           where r.organization_id = p_org and r.halaqah_id = p_halaqah_id and r.attendance_date = p_date
             and r.is_badal and m.user_id = auth.uid()
         )
    ));
$$;
revoke all on function public.fn_bisa_mencatat(uuid, bigint, date) from public, anon;

-- ---------------------------------------------------------------------
-- 1. Status: setoran langsung sah
-- ---------------------------------------------------------------------
do $$ begin perform set_config('app.legacy_migration', 'on', true); end $$;

update public.recitation_entries
set status = 'accepted', updated_at = now()
where status in ('draft', 'submitted', 'returned');

alter table public.recitation_entries drop constraint if exists recitation_entries_status_check;
alter table public.recitation_entries
  add constraint recitation_entries_status_check check (status in ('accepted', 'voided'));
alter table public.recitation_entries alter column status set default 'accepted';

do $$ begin perform set_config('app.legacy_migration', '', true); end $$;

-- Aksi riwayat baru: 'correct' (koreksi Admin)
do $$
declare
  v_list text;
begin
  select string_agg(quote_literal(a), ', ' order by a) into v_list
  from (
    select distinct action as a from public.recitation_revisions where action is not null
    union
    select unnest(array['create', 'update', 'delete', 'create_draft', 'create_submission', 'update_draft',
                        'update_submission', 'resubmit', 'edit_content', 'accept', 'return', 'void', 'review',
                        'correct'])
  ) x;
  execute 'alter table public.recitation_revisions drop constraint if exists recitation_revisions_action_check';
  execute format('alter table public.recitation_revisions add constraint recitation_revisions_action_check check (action in (%s))', v_list);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Validator status
-- ---------------------------------------------------------------------
create or replace function public.fn_validate_recitation_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
  if coalesce(new.minor_mistakes, 0) < 0 or coalesce(new.major_mistakes, 0) < 0 then
    raise exception 'Jumlah kesalahan tidak boleh negatif.';
  end if;

  if public.fn_is_legacy_migration() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'accepted' then
      raise exception 'Setoran baru langsung sah (status accepted).';
    end if;
    if not exists (select 1 from public.recitation_kinds k
                   where k.organization_id = new.organization_id and k.code = new.kind and k.is_active) then
      raise exception 'Jenis setoran "%" tidak aktif atau tidak dikenal.', new.kind using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'voided' then
    raise exception 'Setoran yang telah dibatalkan bersifat final dan tidak dapat diubah.';
  end if;

  v_content_changed := (
    new.surah_start_no is distinct from old.surah_start_no or new.ayah_start is distinct from old.ayah_start or
    new.surah_end_no is distinct from old.surah_end_no or new.ayah_end is distinct from old.ayah_end or
    new.calculated_pages is distinct from old.calculated_pages or new.kind is distinct from old.kind or
    new.major_mistakes is distinct from old.major_mistakes or new.minor_mistakes is distinct from old.minor_mistakes or
    new.santri_id is distinct from old.santri_id or new.recitation_date is distinct from old.recitation_date
  );

  if new.status = 'voided' or v_content_changed then
    if not coalesce(public.is_admin_of_org(old.organization_id), false) then
      raise exception 'Koreksi dan pembatalan setoran hanya oleh Admin.' using errcode = '42501';
    end if;
    if not public.fn_alasan_valid(new.review_reason, 5) then
      raise exception 'Alasan koreksi/pembatalan wajib diisi dengan jelas (minimal 5 karakter).';
    end if;
  end if;

  if new.status not in ('accepted', 'voided') then
    raise exception 'Status setoran tidak sah: %', new.status;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Simpan setoran (versi Fase 3)
-- ---------------------------------------------------------------------
drop function if exists public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid);

create or replace function public.rpc_submit_recitation_entry(
  p_santri_id bigint,
  p_halaqah_id bigint,
  p_recitation_date date,
  p_session_slot text,
  p_kind text,
  p_surah_start_no integer,
  p_ayah_start integer,
  p_surah_end_no integer,
  p_ayah_end integer,
  p_calculated_pages numeric default null,
  p_minor_mistakes integer default 0,
  p_major_mistakes integer default 0,
  p_predicate text default null,
  p_notes text default null,
  p_status text default null,
  p_idempotency_key text default null,
  p_existing_entry_id uuid default null,
  p_session_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid;
  v_is_admin boolean;
  v_kind text;
  v_year bigint;
  v_existing public.recitation_entries%rowtype;
  v_id uuid;
  v_rev int;
  v_session uuid;
  v_pages numeric;
  v_pred record;
  v_att_status text;
  v_att_name text;
  v_max_a1 int;
  v_max_a2 int;
  v_s1 int; v_a1 int; v_s2 int; v_a2 int;
begin
  if v_caller is null then
    raise exception 'Akses ditolak: Autentikasi diperlukan.';
  end if;

  select organization_id into v_org from public.santri where id = p_santri_id;
  if v_org is null then
    raise exception 'Santri dengan ID % tidak ditemukan.', p_santri_id;
  end if;
  if p_halaqah_id is not null and not exists (
    select 1 from public.halaqah h where h.id = p_halaqah_id and h.organization_id = v_org
  ) then
    raise exception 'Halaqah % tidak ditemukan di lembaga santri ini.', p_halaqah_id;
  end if;

  v_is_admin := coalesce(public.is_admin_of_org(v_org), false);
  if not v_is_admin then
    if not public.fn_bisa_mencatat(v_org, p_halaqah_id, p_recitation_date) then
      raise exception 'Akses ditolak: Anda tidak memiliki penugasan musammi aktif untuk halaqah ini pada tanggal %.', p_recitation_date;
    end if;
  end if;

  v_kind := public.fn_recitation_kind_code(v_org, coalesce(nullif(btrim(p_kind), ''), 'ziyadah'));
  if v_kind is null then
    raise exception 'Jenis setoran "%" tidak dikenal. Tambahkan dulu di Pengaturan > Referensi Data Dasar.', p_kind using errcode = '22023';
  end if;

  -- Rentang ayat (disimpan naik; arah mundur dibalik)
  if p_surah_start_no is null or p_surah_end_no is null
     or p_surah_start_no not between 1 and 114 or p_surah_end_no not between 1 and 114 then
    raise exception 'Nomor surat harus antara 1 dan 114.';
  end if;
  if coalesce(p_ayah_start, 0) < 1 or coalesce(p_ayah_end, 0) < 1 then
    raise exception 'Nomor ayat harus lebih besar dari 0.';
  end if;
  if p_surah_end_no < p_surah_start_no or (p_surah_end_no = p_surah_start_no and p_ayah_end < p_ayah_start) then
    v_s1 := p_surah_end_no; v_a1 := p_ayah_end; v_s2 := p_surah_start_no; v_a2 := p_ayah_start;
  else
    v_s1 := p_surah_start_no; v_a1 := p_ayah_start; v_s2 := p_surah_end_no; v_a2 := p_ayah_end;
  end if;
  select ayah_count into v_max_a1 from public.quran_surahs where no = v_s1;
  select ayah_count into v_max_a2 from public.quran_surahs where no = v_s2;
  if v_a1 > v_max_a1 then
    raise exception 'Ayat % melebihi jumlah ayat surat % (% ayat).', v_a1, v_s1, v_max_a1;
  end if;
  if v_a2 > v_max_a2 then
    raise exception 'Ayat % melebihi jumlah ayat surat % (% ayat).', v_a2, v_s2, v_max_a2;
  end if;
  if coalesce(p_minor_mistakes, 0) < 0 or coalesce(p_major_mistakes, 0) < 0 then
    raise exception 'Jumlah kesalahan tidak boleh negatif.';
  end if;

  -- Halaman & predikat dihitung server
  v_pages := public.fn_hitung_halaman(v_s1, v_a1, v_s2, v_a2);
  select * into v_pred from public.fn_predikat_kelancaran(v_org, coalesce(p_major_mistakes, 0), coalesce(p_minor_mistakes, 0));

  -- BUG-12: hanya santri dengan status "boleh setor" bila sudah diabsen di waktu itu
  select r.status, coalesce(st.name, r.status) into v_att_status, v_att_name
  from public.attendance_records r
  left join public.attendance_statuses st on st.organization_id = r.organization_id and st.code = r.status
  where r.organization_id = v_org and r.santri_id = p_santri_id
    and r.attendance_date = p_recitation_date and r.session_slot = p_session_slot
    and coalesce(st.allows_recitation, r.status in ('hadir', 'terlambat')) = false
  limit 1;
  if v_att_status is not null and p_existing_entry_id is null then
    raise exception 'Santri tercatat "%" pada % %, sehingga tidak bisa setor. Ubah absensinya dulu bila keliru.',
      v_att_name, p_recitation_date, p_session_slot using errcode = '22023';
  end if;

  select id into v_year from public.academic_years where organization_id = v_org and is_active = true limit 1;

  v_session := p_session_id;
  if v_session is null and p_halaqah_id is not null then
    select id into v_session from public.halaqah_sessions
    where organization_id = v_org and halaqah_id = p_halaqah_id
      and session_date = p_recitation_date and session_slot = p_session_slot;
  end if;

  if p_idempotency_key is not null and p_existing_entry_id is null then
    select * into v_existing from public.recitation_entries
    where organization_id = v_org and idempotency_key = p_idempotency_key limit 1;
    if v_existing.id is not null then
      return jsonb_build_object('success', true, 'id', v_existing.id, 'status', v_existing.status,
        'predicate', v_existing.predicate, 'is_repeat', v_existing.is_repeat,
        'calculated_pages', v_existing.calculated_pages, 'is_duplicate_prevented', true);
    end if;
  end if;

  if p_existing_entry_id is not null then
    -- Koreksi: hanya Admin, dengan alasan
    select * into v_existing from public.recitation_entries where id = p_existing_entry_id and organization_id = v_org;
    if v_existing.id is null then
      raise exception 'Catatan setoran dengan ID % tidak ditemukan.', p_existing_entry_id;
    end if;
    if not v_is_admin then
      raise exception 'Koreksi setoran yang sudah tersimpan dilakukan oleh Admin.' using errcode = '42501';
    end if;
    if v_existing.status = 'voided' then
      raise exception 'Setoran yang telah dibatalkan tidak dapat diubah.';
    end if;
    if not public.fn_alasan_valid(p_reason, 5) then
      raise exception 'Alasan koreksi wajib diisi dengan jelas (minimal 5 karakter).';
    end if;
    v_rev := coalesce(v_existing.revision_no, 1) + 1;

    update public.recitation_entries
    set session_id = coalesce(v_session, v_existing.session_id),
        halaqah_id = p_halaqah_id,
        santri_id = p_santri_id,
        recitation_date = p_recitation_date,
        session_slot = p_session_slot,
        kind = v_kind,
        surah_start_no = v_s1, ayah_start = v_a1, surah_end_no = v_s2, ayah_end = v_a2,
        calculated_pages = v_pages,
        minor_mistakes = coalesce(p_minor_mistakes, 0),
        major_mistakes = coalesce(p_major_mistakes, 0),
        predicate = v_pred.predicate,
        is_repeat = v_pred.is_repeat,
        notes = p_notes,
        review_reason = btrim(p_reason),
        reviewed_by = v_caller,
        reviewed_at = now(),
        revision_no = v_rev
    where id = v_existing.id;

    insert into public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
    ) values (
      v_org, v_existing.id, v_existing.id, v_rev, 'correct', v_existing.status, v_existing.status, btrim(p_reason),
      to_jsonb(v_existing),
      jsonb_build_object('kind', v_kind, 'surah_start_no', v_s1, 'ayah_start', v_a1, 'surah_end_no', v_s2, 'ayah_end', v_a2,
        'calculated_pages', v_pages, 'major_mistakes', p_major_mistakes, 'minor_mistakes', p_minor_mistakes,
        'predicate', v_pred.predicate, 'is_repeat', v_pred.is_repeat),
      v_caller, v_caller
    );
    v_id := v_existing.id;
  else
    insert into public.recitation_entries (
      organization_id, academic_year_id, session_id, halaqah_id, santri_id,
      recitation_date, session_slot, kind,
      surah_start_no, ayah_start, surah_end_no, ayah_end,
      calculated_pages, minor_mistakes, major_mistakes, predicate, is_repeat, notes,
      status, revision_no, idempotency_key, created_by
    ) values (
      v_org, v_year, v_session, p_halaqah_id, p_santri_id,
      p_recitation_date, p_session_slot, v_kind,
      v_s1, v_a1, v_s2, v_a2,
      v_pages, coalesce(p_minor_mistakes, 0), coalesce(p_major_mistakes, 0), v_pred.predicate, v_pred.is_repeat, p_notes,
      'accepted', 1, p_idempotency_key, v_caller
    ) returning id into v_id;
    v_rev := 1;

    insert into public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
    ) values (
      v_org, v_id, v_id, 1, 'create', null, 'accepted', 'Setoran dicatat', '{}'::jsonb,
      jsonb_build_object('kind', v_kind, 'surah_start_no', v_s1, 'ayah_start', v_a1, 'surah_end_no', v_s2, 'ayah_end', v_a2,
        'calculated_pages', v_pages, 'predicate', v_pred.predicate, 'is_repeat', v_pred.is_repeat),
      v_caller, v_caller
    );
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state)
  values (
    v_org, v_caller, case when v_is_admin then 'admin' else 'musammi' end,
    case when v_existing.id is not null then 'correct_recitation' else 'create_recitation' end,
    'recitation_entries', v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
    case when v_existing.id is not null then jsonb_build_object('predicate', v_existing.predicate, 'pages', v_existing.calculated_pages) else '{}'::jsonb end,
    jsonb_build_object('kind', v_kind, 'predicate', v_pred.predicate, 'is_repeat', v_pred.is_repeat, 'pages', v_pages)
  );

  return jsonb_build_object(
    'success', true, 'id', v_id, 'status', 'accepted', 'kind', v_kind, 'revision_no', v_rev,
    'calculated_pages', v_pages, 'predicate', v_pred.predicate, 'is_repeat', v_pred.is_repeat
  );
end;
$$;

revoke all on function public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Pembatalan setoran (validasi dihapus)
-- ---------------------------------------------------------------------
create or replace function public.rpc_review_recitation_entry(p_entry_id uuid, p_new_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.recitation_entries%rowtype;
  v_rev int;
begin
  if auth.uid() is null then
    raise exception 'Akses ditolak: Autentikasi diperlukan.';
  end if;
  select * into v_entry from public.recitation_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'Data setoran tidak ditemukan.';
  end if;
  if lower(btrim(coalesce(p_new_status, ''))) <> 'voided' then
    raise exception 'Validasi setoran sudah dihapus: setoran langsung sah. Gunakan koreksi atau pembatalan.' using errcode = '22023';
  end if;
  if not coalesce(public.is_admin_of_org(v_entry.organization_id), false) then
    raise exception 'Akses ditolak: hanya Admin yang dapat membatalkan setoran.' using errcode = '42501';
  end if;
  if v_entry.status = 'voided' then
    raise exception 'Setoran ini sudah dibatalkan.';
  end if;
  if not public.fn_alasan_valid(p_reason, 5) then
    raise exception 'Alasan pembatalan wajib diisi dengan jelas (minimal 5 karakter).';
  end if;

  v_rev := coalesce(v_entry.revision_no, 1) + 1;
  update public.recitation_entries
  set status = 'voided', revision_no = v_rev, reviewed_by = auth.uid(), reviewed_at = now(), review_reason = btrim(p_reason)
  where id = p_entry_id;

  insert into public.recitation_revisions (
    organization_id, entry_id, recitation_entry_id, revision_no, action,
    previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
  ) values (
    v_entry.organization_id, v_entry.id, v_entry.id, v_rev, 'void', v_entry.status, 'voided', btrim(p_reason),
    to_jsonb(v_entry), jsonb_build_object('status', 'voided'), auth.uid(), auth.uid()
  );

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state)
  values (v_entry.organization_id, auth.uid(), 'admin', 'void_recitation', 'recitation_entries', v_entry.id::text, btrim(p_reason),
          jsonb_build_object('status', v_entry.status), jsonb_build_object('status', 'voided'));

  return jsonb_build_object('success', true, 'id', v_entry.id, 'status', 'voided', 'revision_no', v_rev);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Tulis langsung: hanya Admin (aplikasi memakai RPC)
-- ---------------------------------------------------------------------
drop policy if exists recitation_entries_role_insert on public.recitation_entries;
create policy recitation_entries_role_insert on public.recitation_entries for insert to authenticated
  with check (public.is_admin_of_org(organization_id));
drop policy if exists recitation_entries_role_update on public.recitation_entries;
create policy recitation_entries_role_update on public.recitation_entries for update to authenticated
  using (public.is_admin_of_org(organization_id)) with check (public.is_admin_of_org(organization_id));
drop policy if exists recitation_entries_role_delete on public.recitation_entries;

notify pgrst, 'reload schema';

commit;
