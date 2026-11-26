-- =====================================================================
-- 2026_11_27_06_f2_migrasi_data_lama.sql
-- Fase 2 · butir 1 dan 5
--
-- Tujuan:
--   Memindahkan data dari tabel lama ke tabel V2. Bisa dijalankan berulang
--   (hanya baris yang belum pindah yang diproses).
--
--     tabel lama          -> tabel V2
--     student_classes     -> student_enrollments
--     halaqah_santri      -> halaqah_student_memberships
--     attendance (Santri) -> halaqah_sessions + attendance_records
--     attendance (Musammi)-> halaqah_sessions + musammi_attendance_records
--     setoran_harian      -> recitation_entries (isi asli disimpan di legacy_payload)
--
--   Juga:
--     - mematikan trigger sinkronisasi dua arah lama <-> V2 (sumber data kini hanya V2);
--     - memperbaiki jenis setoran yang dulu diringkas ('murojaah' -> 'manzil') dari
--       isi asli kolom setoran_harian.skema;
--     - f2_legacy_reconciliation(): mencocokkan jumlah baris lama vs V2.
--
--   Cara menjalankan ulang setelah aplikasi baru dipasang (menangkap data yang
--   masih ditulis aplikasi lama di sela waktu deploy):
--     select public.f2_migrate_legacy_data();
--     select * from public.f2_legacy_reconciliation();
--
-- Prasyarat: 2026_11_27_02 s.d. 2026_11_27_05
-- Rollback:
--   delete from public.recitation_entries where legacy_payload is not null;
--   delete from public.musammi_attendance_records where legacy_attendance_id is not null;
--   delete from public.attendance_records where legacy_attendance_id is not null;
--   (sesi, keanggotaan, dan enrollment hasil migrasi bisa dibiarkan; data lama tidak diubah)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Matikan sinkronisasi dua arah lama <-> V2
-- ---------------------------------------------------------------------
drop trigger if exists trg_sync_legacy_halaqah_santri_to_v2 on public.halaqah_santri;
drop trigger if exists trg_sync_legacy_student_classes_to_v2 on public.student_classes;
drop trigger if exists trg_sync_v2_enrollment_to_legacy on public.student_enrollments;
drop trigger if exists trg_sync_v2_hsm_to_legacy on public.halaqah_student_memberships;

-- Ambil angka bulat pertama/kedua dari teks ("1-10", "1 - 10", "ayat 5")
create or replace function public.fn_int_part(p text, p_index int default 1)
returns int
language sql
immutable
as $$
  select (regexp_matches(coalesce(p, ''), '(\d+)', 'g'))[1]::int
  offset greatest(p_index, 1) - 1 limit 1;
$$;

-- ---------------------------------------------------------------------
-- 1. Fungsi migrasi
-- ---------------------------------------------------------------------
create or replace function public.f2_migrate_legacy_data(p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_n int;
  v_org record;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Hanya pemilik database atau Superadmin yang dapat menjalankan migrasi data lama.';
  end if;
  perform set_config('app.legacy_migration', 'on', true);

  -- Pastikan referensi tiap lembaga ada
  for v_org in select id from public.organizations where p_org is null or id = p_org loop
    perform public.fn_seed_reference_data(v_org.id);
  end loop;

  -- 1a. student_classes -> student_enrollments
  insert into public.student_enrollments (
    organization_id, student_id, santri_id, academic_year_id,
    marhalah_id, master_marhalah_id, kelas_id, master_kelas_id, class_id,
    marhalah, marhalah_name, kelas, class_name,
    status, enrollment_status, enrolled_at, effective_from
  )
  select sc.organization_id, sc.santri_id, sc.santri_id, sc.academic_year_id,
         mm.id, mm.id, mk.id, mk.id, mk.id,
         sc.marhalah, sc.marhalah, sc.kelas, sc.kelas,
         'active', 'active', coalesce(sc.created_at::date, current_date), coalesce(sc.created_at::date, current_date)
  from public.student_classes sc
  join public.santri s on s.id = sc.santri_id and s.organization_id = sc.organization_id
  join public.academic_years ay on ay.id = sc.academic_year_id and ay.organization_id = sc.organization_id
  left join public.master_marhalah mm on mm.id = sc.marhalah_id
  left join public.master_kelas_relasi mk on mk.id = sc.kelas_id
  where (p_org is null or sc.organization_id = p_org)
    and not exists (
      select 1 from public.student_enrollments e
      where e.organization_id = sc.organization_id and e.student_id = sc.santri_id and e.academic_year_id = sc.academic_year_id
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('student_enrollments', v_n);

  -- 1b. halaqah_santri -> halaqah_student_memberships
  insert into public.halaqah_student_memberships (
    organization_id, academic_year_id, halaqah_id, student_id, valid_from, valid_to, status
  )
  select hs.organization_id, h.academic_year_id, hs.halaqah_id, hs.santri_id,
         coalesce(hs.start_date, h.created_at::date, current_date),
         case when hs.end_date is not null and hs.end_date >= coalesce(hs.start_date, h.created_at::date, current_date)
              then hs.end_date end,
         case
           when hs.end_date is null and coalesce(lower(hs.status), 'aktif') in ('aktif', 'active') then 'active'
           when lower(coalesce(hs.status, '')) like 'mutasi%' or lower(coalesce(hs.status, '')) like 'pindah%' then 'transferred'
           when lower(coalesce(hs.status, '')) like 'keluar%' or lower(coalesce(hs.status, '')) like 'dikeluarkan%' then 'removed'
           else 'ended'
         end
  from public.halaqah_santri hs
  join public.halaqah h on h.id = hs.halaqah_id and h.organization_id = hs.organization_id
  join public.santri s on s.id = hs.santri_id and s.organization_id = hs.organization_id
  where (p_org is null or hs.organization_id = p_org)
    and not exists (
      select 1 from public.halaqah_student_memberships m
      where m.organization_id = hs.organization_id and m.halaqah_id = hs.halaqah_id and m.student_id = hs.santri_id
        and (m.valid_from = coalesce(hs.start_date, h.created_at::date, current_date)
             or (hs.end_date is null and m.status = 'active' and m.valid_to is null))
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('halaqah_student_memberships', v_n);

  -- 1c. Status kehadiran lama yang belum dikenal -> tambahkan ke attendance_statuses
  insert into public.attendance_statuses (organization_id, code, name, counts_as_present, allows_recitation, sort_order)
  select distinct on (a.organization_id, public.fn_slug(a.status))
         a.organization_id, public.fn_slug(a.status), btrim(a.status),
         lower(a.status) like 'hadir%' or lower(a.status) like '%telat%' or lower(a.status) like '%lambat%',
         lower(a.status) like 'hadir%' or lower(a.status) like '%telat%' or lower(a.status) like '%lambat%',
         50
  from public.attendance a
  where (p_org is null or a.organization_id = p_org)
    and public.fn_slug(a.status) is not null
    and public.fn_attendance_status_code(a.organization_id, a.status) is null
  on conflict (organization_id, code) do nothing;

  -- 1d. Siapkan baris absensi lama yang belum pindah
  create temp table if not exists _f2_att (
    id bigint primary key, organization_id uuid, peran text, person_id bigint, d date, slot text,
    status_code text, halaqah_id bigint, academic_year_id bigint
  ) on commit drop;
  truncate _f2_att;

  insert into _f2_att
  select a.id, a.organization_id, a.peran::text, a.person_id, a.date::date, btrim(a.waktu),
         public.fn_attendance_status_code(a.organization_id, a.status),
         a.halaqah_id, a.academic_year_id
  from public.attendance a
  where (p_org is null or a.organization_id = p_org)
    and a.date ~ '^\d{4}-\d{2}-\d{2}$'
    and nullif(btrim(a.waktu), '') is not null
    and not exists (select 1 from public.attendance_records r where r.legacy_attendance_id = a.id)
    and not exists (select 1 from public.musammi_attendance_records r where r.legacy_attendance_id = a.id);

  -- Halaqah santri yang kosong: dari keanggotaan pada tanggal itu
  update _f2_att t set halaqah_id = (
    select m.halaqah_id from public.halaqah_student_memberships m
    where m.organization_id = t.organization_id and m.student_id = t.person_id
      and m.valid_from <= t.d and (m.valid_to is null or m.valid_to >= t.d)
    order by m.valid_from desc limit 1
  )
  where t.halaqah_id is null and t.peran = 'Santri';

  -- Halaqah musammi' yang kosong: halaqah yang dipegang (penugasan atau musammi_id halaqah)
  update _f2_att t set halaqah_id = coalesce(
    (select a.halaqah_id from public.halaqah_musammi_assignments a
      where a.organization_id = t.organization_id and a.musammi_id = t.person_id
        and (a.valid_from is null or a.valid_from <= t.d) and (a.valid_to is null or a.valid_to >= t.d)
      order by a.is_primary desc, a.valid_from desc limit 1),
    (select h.id from public.halaqah h
      where h.organization_id = t.organization_id and h.musammi_id = t.person_id
      order by (t.slot = any(coalesce(h.waktu, array[]::text[]))) desc, h.id limit 1)
  )
  where t.halaqah_id is null and t.peran = 'Musammi';

  -- Halaqah harus milik lembaga yang sama
  update _f2_att t set halaqah_id = null
  where t.halaqah_id is not null
    and not exists (select 1 from public.halaqah h where h.id = t.halaqah_id and h.organization_id = t.organization_id);

  -- 1e. Sesi untuk setiap (halaqah, tanggal, waktu)
  insert into public.halaqah_sessions (
    organization_id, academic_year_id, halaqah_id, session_date, session_slot, status, roster_snapshot
  )
  select t.organization_id, coalesce(max(t.academic_year_id), max(h.academic_year_id)), t.halaqah_id, t.d, t.slot, 'completed',
         coalesce(jsonb_agg(distinct jsonb_build_object('santri_id', s.id, 'nama', s.nama, 'kode', s.kode,
                                                        'marhalah', s.marhalah, 'kelas', s.kelas, 'status', 'Belum diisi'))
                  filter (where s.id is not null), '[]'::jsonb)
  from _f2_att t
  join public.halaqah h on h.id = t.halaqah_id
  left join public.santri s on t.peran = 'Santri' and s.id = t.person_id and s.organization_id = t.organization_id
  where t.halaqah_id is not null
  group by t.organization_id, t.halaqah_id, t.d, t.slot
  on conflict (organization_id, halaqah_id, session_date, session_slot) do nothing;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('halaqah_sessions', v_n);

  -- Sesi yang sudah ada: tambahkan santri lama yang belum masuk roster
  update public.halaqah_sessions hs
  set roster_snapshot = coalesce(hs.roster_snapshot, '[]'::jsonb) || add.items
  from (
    select ss.id as session_id,
           jsonb_agg(distinct jsonb_build_object('santri_id', s.id, 'nama', s.nama, 'kode', s.kode,
                                                 'marhalah', s.marhalah, 'kelas', s.kelas, 'status', 'Belum diisi')) as items
    from _f2_att t
    join public.halaqah_sessions ss
      on ss.organization_id = t.organization_id and ss.halaqah_id = t.halaqah_id
     and ss.session_date = t.d and ss.session_slot = t.slot
    join public.santri s on s.id = t.person_id and s.organization_id = t.organization_id
    where t.peran = 'Santri'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(ss.roster_snapshot, '[]'::jsonb)) r
        where (r->>'santri_id')::bigint = t.person_id
      )
    group by ss.id
  ) add
  where hs.id = add.session_id;

  -- 1f. Kehadiran santri
  insert into public.attendance_records (
    organization_id, session_id, halaqah_id, santri_id, attendance_date, session_slot, status, legacy_attendance_id
  )
  select distinct on (ss.id, t.person_id)
         t.organization_id, ss.id, t.halaqah_id, t.person_id, t.d, t.slot, t.status_code, t.id
  from _f2_att t
  join public.santri s on s.id = t.person_id and s.organization_id = t.organization_id
  join public.halaqah_sessions ss
    on ss.organization_id = t.organization_id and ss.halaqah_id = t.halaqah_id
   and ss.session_date = t.d and ss.session_slot = t.slot
  where t.peran = 'Santri' and t.status_code is not null
  order by ss.id, t.person_id, t.id desc
  on conflict (session_id, santri_id) do nothing;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('attendance_records', v_n);

  -- 1g. Kehadiran musammi'
  insert into public.musammi_attendance_records (
    organization_id, session_id, halaqah_id, musammi_id, attendance_date, session_slot, status, legacy_attendance_id
  )
  select distinct on (ss.id, t.person_id)
         t.organization_id, ss.id, t.halaqah_id, t.person_id, t.d, t.slot, t.status_code, t.id
  from _f2_att t
  join public.musammi m on m.id = t.person_id and m.organization_id = t.organization_id
  join public.halaqah_sessions ss
    on ss.organization_id = t.organization_id and ss.halaqah_id = t.halaqah_id
   and ss.session_date = t.d and ss.session_slot = t.slot
  where t.peran = 'Musammi' and t.status_code is not null
  order by ss.id, t.person_id, t.id desc
  on conflict (session_id, musammi_id) do nothing;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('musammi_attendance_records', v_n);

  -- 1h. Jenis setoran lama yang belum dikenal -> tambahkan (dihitung murojaah, tidak menambah hafalan)
  insert into public.recitation_kinds (organization_id, code, name, adds_memorization, counts_as_murojaah, sort_order)
  select distinct on (sh.organization_id, public.fn_slug(sh.skema))
         sh.organization_id, public.fn_slug(sh.skema), initcap(btrim(sh.skema)), false, true, 60
  from public.setoran_harian sh
  where (p_org is null or sh.organization_id = p_org)
    and public.fn_slug(sh.skema) is not null
    and not exists (
      select 1 from public.recitation_kinds k
      where k.organization_id = sh.organization_id
        and (k.code = public.fn_slug(sh.skema) or lower(k.name) = lower(btrim(sh.skema)))
    )
  on conflict (organization_id, code) do nothing;

  -- 1i. setoran_harian -> recitation_entries
  insert into public.recitation_entries (
    organization_id, academic_year_id, session_id, halaqah_id, santri_id,
    recitation_date, session_slot, kind,
    surah_start_no, ayah_start, surah_end_no, ayah_end,
    calculated_pages, major_mistakes, minor_mistakes, predicate, notes,
    status, revision_no, created_by, reviewed_by, review_reason, created_at, updated_at,
    legacy_setoran_id, legacy_payload
  )
  select x.organization_id, x.academic_year_id, ss.id, x.halaqah_id, x.santri_id,
         x.tanggal, x.slot, x.kind,
         least(x.s1, x.s2), case when x.s1 <= x.s2 then x.a1 else x.a2 end,
         greatest(x.s1, x.s2), case when x.s1 <= x.s2 then x.a2 else x.a1 end,
         x.jumlah_halaman, x.kesalahan_kabir, x.kesalahan_shoghir, x.nilai, x.keterangan,
         x.status, 1, x.created_by, x.reviewed_by, x.review_reason, x.created_at, x.updated_at,
         x.id, x.payload
  from (
    select sh.id, sh.organization_id, sh.santri_id, sh.tanggal,
           coalesce(nullif(btrim(sh.waktu), ''), 'Shubuh') as slot,
           h.id as halaqah_id,
           coalesce(sh.academic_year_id, h.academic_year_id,
                    (select ay.id from public.academic_years ay where ay.organization_id = sh.organization_id and ay.is_active limit 1)) as academic_year_id,
           coalesce(
             (select k.code from public.recitation_kinds k
               where k.organization_id = sh.organization_id
                 and (k.code = public.fn_slug(sh.skema) or lower(k.name) = lower(btrim(sh.skema)))
               order by (k.code = public.fn_slug(sh.skema)) desc limit 1),
             (select sl.default_kind_code from public.session_slots sl
               where sl.organization_id = sh.organization_id and sl.code = btrim(sh.waktu)),
             'ziyadah') as kind,
           public.fn_surah_no(coalesce(nullif(btrim(sh.surat_mulai), ''), nullif(split_part(sh.surat, ' - ', 1), ''), sh.surat)) as s1,
           public.fn_surah_no(coalesce(nullif(btrim(sh.surat_selesai), ''), nullif(split_part(sh.surat, ' - ', 2), ''),
                                       nullif(btrim(sh.surat_mulai), ''), sh.surat)) as s2,
           coalesce(public.fn_int_part(sh.ayat_mulai), public.fn_int_part(sh.ayat, 1)) as a1,
           coalesce(public.fn_int_part(sh.ayat_selesai), public.fn_int_part(sh.ayat, 2),
                    public.fn_int_part(sh.ayat_mulai), public.fn_int_part(sh.ayat, 1)) as a2,
           coalesce(sh.jumlah_halaman, 0) as jumlah_halaman,
           greatest(coalesce(sh.kesalahan_kabir, 0), 0) as kesalahan_kabir,
           greatest(coalesce(sh.kesalahan_shoghir, 0), 0) as kesalahan_shoghir,
           nullif(btrim(sh.nilai), '') as nilai,
           nullif(btrim(sh.keterangan), '') as keterangan,
           case
             when lower(coalesce(sh.status_verifikasi, '')) in ('voided', 'void', 'batal', 'dibatalkan', 'ditolak', 'rejected') then 'voided'
             when lower(coalesce(sh.status_verifikasi, '')) in ('returned', 'dikembalikan', 'revisi') then 'returned'
             when lower(coalesce(sh.status_verifikasi, '')) = 'draft' then 'draft'
             when lower(coalesce(sh.status_verifikasi, '')) in ('submitted', 'pending', 'menunggu') then 'submitted'
             else 'accepted'
           end as status,
           (select u.id from auth.users u where u.id = sh.created_by) as created_by,
           (select u.id from auth.users u where u.id = sh.reviewed_by) as reviewed_by,
           sh.review_reason,
           coalesce(sh.created_at, now()) as created_at,
           coalesce(sh.updated_at, sh.created_at, now()) as updated_at,
           to_jsonb(sh) as payload
    from public.setoran_harian sh
    join public.santri s on s.id = sh.santri_id and s.organization_id = sh.organization_id
    left join public.halaqah h on h.id = sh.halaqah_id and h.organization_id = sh.organization_id
    where (p_org is null or sh.organization_id = p_org)
      and sh.tanggal is not null
      and not exists (select 1 from public.recitation_entries re where re.legacy_setoran_id = sh.id)
  ) x
  left join public.halaqah_sessions ss
    on ss.organization_id = x.organization_id and ss.halaqah_id = x.halaqah_id
   and ss.session_date = x.tanggal and ss.session_slot = x.slot;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('recitation_entries', v_n);

  -- 1j. Pulihkan jenis setoran yang dulu diringkas ke 3 nilai
  update public.recitation_entries re
  set kind = k.code
  from public.setoran_harian sh
  join public.recitation_kinds k
    on k.organization_id = sh.organization_id
   and (k.code = public.fn_slug(sh.skema) or lower(k.name) = lower(btrim(sh.skema)))
  where re.legacy_setoran_id = sh.id
    and re.organization_id = sh.organization_id
    and (p_org is null or re.organization_id = p_org)
    and re.kind is distinct from k.code
    and re.legacy_payload is null;
  get diagnostics v_n = row_count;
  v_result := v_result || jsonb_build_object('recitation_kind_dipulihkan', v_n);

  return v_result;
end;
$$;

revoke all on function public.f2_migrate_legacy_data(uuid) from public, anon, authenticated;
grant execute on function public.f2_migrate_legacy_data(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 2. Rekonsiliasi jumlah baris
-- ---------------------------------------------------------------------
create or replace function public.f2_legacy_reconciliation(p_org uuid default null)
returns table (
  organization_id uuid,
  tabel_lama text,
  tabel_v2 text,
  jumlah_lama bigint,
  sudah_di_v2 bigint,
  belum_pindah bigint,
  keterangan text
)
language sql
stable
security definer
set search_path = public
as $$
  with orgs as (
    select o.id from public.organizations o where p_org is null or o.id = p_org
  ),
  sh as (
    select sh.organization_id,
           count(*) as total,
           count(*) filter (where exists (select 1 from public.recitation_entries re where re.legacy_setoran_id = sh.id)) as moved,
           count(*) filter (where not exists (select 1 from public.santri s where s.id = sh.santri_id and s.organization_id = sh.organization_id)) as no_santri,
           count(*) filter (where sh.tanggal is null) as no_date
    from public.setoran_harian sh group by sh.organization_id
  ),
  att as (
    select a.organization_id, a.peran::text as peran,
           count(*) as total,
           count(*) filter (where
             exists (select 1 from public.attendance_records r where r.legacy_attendance_id = a.id)
             or exists (select 1 from public.musammi_attendance_records r where r.legacy_attendance_id = a.id)
             or (a.peran::text = 'Santri' and exists (
                   select 1 from public.attendance_records r
                   where r.organization_id = a.organization_id and r.santri_id = a.person_id
                     and r.attendance_date::text = a.date and r.session_slot = a.waktu))
             or (a.peran::text = 'Musammi' and exists (
                   select 1 from public.musammi_attendance_records r
                   where r.organization_id = a.organization_id and r.musammi_id = a.person_id
                     and r.attendance_date::text = a.date and r.session_slot = a.waktu))
           ) as moved,
           count(*) filter (where a.date !~ '^\d{4}-\d{2}-\d{2}$') as bad_date
    from public.attendance a group by a.organization_id, a.peran::text
  ),
  hs as (
    select hs.organization_id, count(*) as total,
           count(*) filter (where exists (
             select 1 from public.halaqah_student_memberships m
             where m.organization_id = hs.organization_id and m.halaqah_id = hs.halaqah_id and m.student_id = hs.santri_id)) as moved
    from public.halaqah_santri hs group by hs.organization_id
  ),
  sc as (
    select sc.organization_id, count(*) as total,
           count(*) filter (where exists (
             select 1 from public.student_enrollments e
             where e.organization_id = sc.organization_id and e.student_id = sc.santri_id
               and e.academic_year_id = sc.academic_year_id)) as moved
    from public.student_classes sc group by sc.organization_id
  )
  select o.id, 'setoran_harian', 'recitation_entries', coalesce(sh.total, 0), coalesce(sh.moved, 0),
         coalesce(sh.total - sh.moved, 0),
         case when coalesce(sh.total - sh.moved, 0) = 0 then 'cocok'
              else format('%s tanpa santri valid, %s tanpa tanggal', coalesce(sh.no_santri, 0), coalesce(sh.no_date, 0)) end
  from orgs o left join sh on sh.organization_id = o.id
  union all
  select o.id, 'attendance (' || p.peran || ')',
         case when p.peran = 'Santri' then 'attendance_records' else 'musammi_attendance_records' end,
         coalesce(att.total, 0), coalesce(att.moved, 0), coalesce(att.total - att.moved, 0),
         case when coalesce(att.total - att.moved, 0) = 0 then 'cocok'
              else format('%s tanggal tidak valid; sisanya tanpa halaqah/orang yang valid', coalesce(att.bad_date, 0)) end
  from orgs o cross join (values ('Santri'), ('Musammi')) p(peran)
  left join att on att.organization_id = o.id and att.peran = p.peran
  union all
  select o.id, 'halaqah_santri', 'halaqah_student_memberships', coalesce(hs.total, 0), coalesce(hs.moved, 0),
         coalesce(hs.total - hs.moved, 0),
         case when coalesce(hs.total - hs.moved, 0) = 0 then 'cocok' else 'santri/halaqah tidak valid' end
  from orgs o left join hs on hs.organization_id = o.id
  union all
  select o.id, 'student_classes', 'student_enrollments', coalesce(sc.total, 0), coalesce(sc.moved, 0),
         coalesce(sc.total - sc.moved, 0),
         case when coalesce(sc.total - sc.moved, 0) = 0 then 'cocok' else 'santri/tahun ajaran tidak valid' end
  from orgs o left join sc on sc.organization_id = o.id;
$$;

revoke all on function public.f2_legacy_reconciliation(uuid) from public, anon, authenticated;
grant execute on function public.f2_legacy_reconciliation(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3. Jalankan sekarang untuk semua lembaga
-- ---------------------------------------------------------------------
do $$
declare v jsonb;
begin
  v := public.f2_migrate_legacy_data(null);
  raise notice 'Hasil migrasi data lama: %', v;
end;
$$;

commit;
