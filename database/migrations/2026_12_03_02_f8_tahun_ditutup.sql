-- =====================================================================
-- 2026_12_03_02_f8_tahun_ditutup.sql
-- Fase 8 · butir 6: siklus tahun ajaran cukup dua keadaan bagi pengguna — Aktif / Ditutup.
--
-- - Data operasional milik tahun ajaran yang DITUTUP tidak bisa ditambah/diubah/dihapus lagi
--   (sesi & absensi, setoran, ujian, catatan raport, periode & rekap/form periode).
--   Raport (report_cards) tetap boleh diterbitkan/diamandemen.
-- - Admin bisa membuka kembali tahun ajaran yang ditutup dengan alasan (tercatat di audit).
-- - Tahun ajaran lama ber-status draft/setup/closing dianggap "Aktif" (tidak dikunci).
-- - Proses sistem tanpa login (SQL Editor, migrasi, service role) tidak dikunci.
--
-- Prasyarat: 2026_12_03_01_f8_bisnis.sql
-- Rollback: drop trigger trg_kunci_tahun_ditutup on (tabel di bawah); drop function public.fn_kunci_tahun_ditutup,
--           public.fn_tahun_ditutup, public.rpc_buka_kembali_tahun_ajaran;
-- =====================================================================
begin;

create or replace function public.fn_tahun_ditutup(p_tahun bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select a.status = 'closed' or a.lifecycle_status = 'closed' from public.academic_years a where a.id = p_tahun), false)
$$;

create or replace function public.fn_kunci_tahun_ditutup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baris jsonb := to_jsonb(coalesce(new, old));
  v_lama jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_tahun bigint;
  v_tahun_lama bigint;
  v_cara text := coalesce(tg_argv[0], 'langsung');
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if v_cara = 'langsung' then
    v_tahun := nullif(v_baris->>'academic_year_id', '')::bigint;
    v_tahun_lama := nullif(v_lama->>'academic_year_id', '')::bigint;
  elsif v_cara = 'sesi' then
    select s.academic_year_id into v_tahun from public.halaqah_sessions s where s.id = nullif(v_baris->>'session_id', '')::uuid;
  elsif v_cara = 'periode' then
    select p.academic_year_id into v_tahun from public.evaluation_periods p where p.id = nullif(v_baris->>'period_id', '')::uuid;
  end if;

  if (v_tahun is not null and public.fn_tahun_ditutup(v_tahun))
     or (v_tahun_lama is not null and public.fn_tahun_ditutup(v_tahun_lama)) then
    raise exception 'Tahun ajaran ini sudah ditutup. Data tidak bisa diubah. Admin dapat membuka kembali tahun ajaran di menu Tahun Ajaran bila perlu koreksi.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('halaqah_sessions', 'langsung'), ('recitation_entries', 'langsung'), ('exam_attempts', 'langsung'),
      ('raport_catatan', 'langsung'), ('monthly_exam_periods', 'langsung'), ('exam_assignments', 'langsung'),
      ('evaluation_periods', 'langsung'),
      ('attendance_records', 'sesi'), ('musammi_attendance_records', 'sesi'),
      ('period_recaps', 'periode'), ('period_forms', 'periode')
    ) as x(tabel, cara)
  loop
    if to_regclass('public.' || t.tabel) is not null then
      execute format('drop trigger if exists trg_kunci_tahun_ditutup on public.%I', t.tabel);
      execute format('create trigger trg_kunci_tahun_ditutup before insert or update or delete on public.%I
                      for each row execute function public.fn_kunci_tahun_ditutup(%L)', t.tabel, t.cara);
    end if;
  end loop;
end $$;

create or replace function public.rpc_buka_kembali_tahun_ajaran(p_tahun bigint, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year public.academic_years%rowtype;
begin
  select * into v_year from public.academic_years where id = p_tahun for update;
  if v_year.id is null then raise exception 'Tahun ajaran tidak ditemukan.'; end if;
  if not (public.is_super_admin() or public.is_admin_of_org(v_year.organization_id)) then
    raise exception 'Hanya Admin Lembaga yang dapat membuka kembali tahun ajaran.' using errcode = '42501';
  end if;
  if coalesce(trim(p_alasan), '') = '' then raise exception 'Alasan wajib diisi.'; end if;
  if not public.fn_tahun_ditutup(p_tahun) then raise exception 'Tahun ajaran % belum ditutup.', v_year.name; end if;

  update public.academic_years
  set status = 'active', lifecycle_status = 'active', closed_at = null, closed_by = null, updated_at = now()
  where id = p_tahun;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state)
  values (v_year.organization_id, auth.uid(), case when public.is_super_admin() then 'superadmin' else 'admin' end,
          'tahun_ajaran.buka_kembali', 'academic_years', p_tahun::text, trim(p_alasan),
          jsonb_build_object('status', v_year.status, 'closed_at', v_year.closed_at), jsonb_build_object('status', 'active'));
  return jsonb_build_object('id', p_tahun, 'status', 'active');
end;
$$;

revoke all on function public.rpc_buka_kembali_tahun_ajaran(bigint, text) from public, anon;
grant execute on function public.rpc_buka_kembali_tahun_ajaran(bigint, text) to authenticated, service_role;
grant execute on function public.fn_tahun_ditutup(bigint) to authenticated, service_role;

commit;
