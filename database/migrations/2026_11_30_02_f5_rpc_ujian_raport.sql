-- =====================================================================
-- 2026_11_30_02_f5_rpc_ujian_raport.sql
-- Fase 5 · Ujian & Raport — aturan & RPC
--
-- Tujuan:
--   1. Siapa boleh menguji (fn_bisa_menguji): Admin, musammi' halaqah santri, atau musammi'
--      penguji yang ditugaskan untuk halaqah itu pada semester itu (exam_assignments).
--   2. rpc_simpan_ujian: satu pintu simpan nilai ujian.
--        bulanan  : nilai akhir 0–100 + materi juz, per ujian bulanan ke-n
--        semester : khoto kabir & shoghir PER JUZ; nilai dihitung server dari rubrik aktif
--                   (nilai awal − khoto, tidak di bawah nilai minimum)
--        mode     : 'baru' (belum ada nilai), 'remedial' (percobaan baru, nilai lama tetap),
--                   'koreksi' (Admin + alasan: percobaan terakhir dibatalkan, diganti)
--      Predikat dari skala rubrik; lulus = nilai ≥ KKM rubrik.
--   3. rpc_batal_ujian (Admin + alasan), rpc_simpan_catatan_raport.
--   4. fn_komponen_raport: 3 komponen raport (ujian semester = percobaan terakhir,
--      rata-rata ujian bulanan, kehadiran semester) + bobot + daftar kekurangan.
--   5. rpc_publish_report_card (versi baru): nilai & snapshot dihitung server; DITOLAK bila
--      ada komponen kurang; amandemen wajib alasan (fn_alasan_valid) — dijaga server.
--      Tulis langsung ke report_cards dari aplikasi dicabut.
--   6. rpc_komponen_raport: daftar komponen & kekurangan untuk layar Buku Nilai.
--   7. rpc_save_rubric_version (pengganti): rubrik yang sudah dipakai ujian/raport selalu jadi
--      versi baru (tidak diubah di tempat); nilai awal, pengurang, minimum, KKM, predikat divalidasi.
--
-- Prasyarat: 2026_11_30_01_f5_ujian_struktur.sql
-- Rollback: jalankan ulang rpc_record_exam_attempt dari supabase_v2_1_production_hardening.sql dan
--   rpc_publish_report_card dari 2026_11_27_01, rpc_save_rubric_version dari supabase_v2_1_production_hardening.sql;
--   drop fungsi-fungsi baru di file ini.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Fungsi bantu
-- ---------------------------------------------------------------------
create or replace function public.fn_nilai_juz(p_rubric public.rubric_versions, p_kabir numeric, p_shoghir numeric)
returns numeric
language sql
immutable
as $$
  select round(greatest(coalesce(p_rubric.min_score, 50),
           coalesce(p_rubric.initial_score, 100)
           - greatest(coalesce(p_kabir, 0), 0) * coalesce(p_rubric.deduction_major, 5)
           - greatest(coalesce(p_shoghir, 0), 0) * coalesce(p_rubric.deduction_minor, 1.25)), 2);
$$;

create or replace function public.fn_predikat_nilai(p_rubric public.rubric_versions, p_score numeric)
returns text
language sql
immutable
as $$
  select coalesce(
    (select e->>'label' from jsonb_array_elements(coalesce(p_rubric.predicates, '[]'::jsonb)) e
     where p_score >= coalesce(public.f5_angka(e->>'minScore'), 0)
     order by coalesce(public.f5_angka(e->>'minScore'), 0) desc limit 1),
    case when p_score >= 90 then 'Mumtaz' when p_score >= 80 then 'Jayyid Jiddan' when p_score >= 70 then 'Jayyid'
         when p_score >= 60 then 'Maqbul' else 'Rasib' end);
$$;

-- Halaqah santri pada tanggal (keanggotaan terbaru yang berlaku)
create or replace function public.fn_halaqah_santri_pada(p_org uuid, p_santri bigint, p_date date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select m.halaqah_id from public.halaqah_student_memberships m
  where m.organization_id = p_org and m.student_id = p_santri
    and m.valid_from <= p_date and (m.valid_to is null or m.valid_to >= p_date)
  order by m.valid_from desc, (m.status = 'active') desc, m.created_at desc limit 1;
$$;
revoke all on function public.fn_halaqah_santri_pada(uuid, bigint, date) from public, anon;

create or replace function public.fn_bisa_menguji(p_org uuid, p_santri bigint, p_year bigint, p_sem text, p_type text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h bigint;
begin
  if coalesce(public.is_admin_of_org(p_org), false) then return true; end if;
  v_h := public.fn_halaqah_santri_pada(p_org, p_santri, public.fn_hari_ini_lembaga(p_org));
  if v_h is null then return false; end if;
  if public.fn_bisa_mencatat(p_org, v_h, public.fn_hari_ini_lembaga(p_org)) then return true; end if;
  return exists (
    select 1 from public.exam_assignments ea
    join public.musammi m on m.id = ea.musammi_id and m.organization_id = ea.organization_id
    where ea.organization_id = p_org and ea.academic_year_id = p_year and ea.semester = public.f5_semester(p_sem)
      and ea.halaqah_id = v_h and m.user_id = auth.uid()
      and (ea.exam_type = 'semua' or ea.exam_type = case when p_type in ('monthly', 'bulanan') then 'bulanan' else 'semester' end)
  );
end;
$$;
revoke all on function public.fn_bisa_menguji(uuid, bigint, bigint, text, text) from public, anon;
grant execute on function public.fn_bisa_menguji(uuid, bigint, bigint, text, text) to authenticated, service_role;

create or replace function public.fn_tanggal_semester(p_org uuid, p_year bigint, p_sem text)
returns table (start_date date, end_date date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s date; v_e date; v_txt text; v_j jsonb;
begin
  select s.start_date, s.end_date into v_s, v_e from public.semesters s
  where s.organization_id = p_org and s.academic_year_id = p_year and s.name = public.f5_semester(p_sem) limit 1;
  if v_s is null or v_e is null then
    select value into v_txt from public.app_settings where organization_id = p_org and key = 'SEMESTER_DATES_' || p_year;
    begin
      v_j := case when btrim(coalesce(v_txt, '')) like '{%' then v_txt::jsonb end;
      v_j := coalesce(v_j->public.f5_semester(p_sem), case when public.f5_semester(p_sem) = 'Ganjil' then v_j->'Gasal' end);
      if coalesce(v_j->>'startDate', '') ~ '^\d{4}-\d{2}-\d{2}' and coalesce(v_j->>'endDate', '') ~ '^\d{4}-\d{2}-\d{2}' then
        v_s := coalesce(v_s, left(v_j->>'startDate', 10)::date);
        v_e := coalesce(v_e, left(v_j->>'endDate', 10)::date);
      end if;
    exception when others then null;
    end;
  end if;
  return query select v_s, v_e;
end;
$$;
revoke all on function public.fn_tanggal_semester(uuid, bigint, text) from public, anon;

-- ---------------------------------------------------------------------
-- 2. Simpan nilai ujian
-- ---------------------------------------------------------------------
drop function if exists public.rpc_record_exam_attempt(uuid, bigint, text, text, bigint, text, numeric, numeric, text, jsonb, boolean, text);

create or replace function public.rpc_simpan_ujian(
  p_santri_id bigint,
  p_exam_type text,
  p_academic_year_id bigint,
  p_semester text,
  p_period_id uuid default null,
  p_materi_juz text default null,
  p_juz jsonb default null,
  p_nilai numeric default null,
  p_mode text default 'baru',
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_type text;
  v_sem text := public.f5_semester(p_semester);
  v_rubric public.rubric_versions;
  v_period public.monthly_exam_periods%rowtype;
  v_last public.exam_attempts%rowtype;
  v_admin boolean;
  v_juz jsonb := '[]'::jsonb;
  v_item jsonb;
  v_no int;
  v_k numeric; v_s numeric;
  v_seen int[] := '{}';
  v_score numeric;
  v_next int;
  v_remedial boolean;
  v_id uuid;
  v_pred text;
  v_materi text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select organization_id into v_org from public.santri where id = p_santri_id;
  if v_org is null then raise exception 'Santri tidak ditemukan.'; end if;
  if not exists (select 1 from public.academic_years y where y.id = p_academic_year_id) then
    raise exception 'Tahun ajaran tidak ditemukan.';
  end if;
  v_type := case lower(btrim(coalesce(p_exam_type, ''))) when 'bulanan' then 'monthly' when 'monthly' then 'monthly'
                 when 'semester' then 'semester' end;
  if v_type is null then raise exception 'Jenis ujian harus "bulanan" atau "semester".' using errcode = '22023'; end if;
  if coalesce(p_mode, 'baru') not in ('baru', 'remedial', 'koreksi') then
    raise exception 'Mode simpan tidak dikenal.' using errcode = '22023';
  end if;
  if not public.fn_bisa_menguji(v_org, p_santri_id, p_academic_year_id, v_sem, v_type) then
    raise exception 'Akses ditolak: Anda bukan penguji santri ini.' using errcode = '42501';
  end if;
  v_admin := coalesce(public.is_admin_of_org(v_org), false);

  if v_type = 'monthly' then
    select * into v_period from public.monthly_exam_periods
    where id = p_period_id and organization_id = v_org and academic_year_id = p_academic_year_id and semester = v_sem;
    if v_period.id is null then raise exception 'Pilih ujian bulanan (ke-berapa) pada semester ini.' using errcode = '22023'; end if;
    if p_nilai is null or p_nilai < 0 or p_nilai > 100 then
      raise exception 'Nilai ujian bulanan harus 0–100.' using errcode = '22023';
    end if;
  else
    if p_period_id is not null then raise exception 'Ujian semester tidak memakai periode bulanan.' using errcode = '22023'; end if;
  end if;

  -- Raport yang sudah terbit hanya bisa diubah nilainya oleh Admin (lalu amandemen raport)
  if not v_admin and exists (select 1 from public.report_cards rc where rc.organization_id = v_org and rc.santri_id = p_santri_id
      and rc.academic_year_id = p_academic_year_id and rc.semester_name = v_sem and rc.status = 'published') then
    raise exception 'Raport santri ini sudah terbit. Perubahan nilai dilakukan Admin lalu raport diamandemen.' using errcode = '42501';
  end if;

  v_rubric := public.fn_rubrik_aktif(v_org);
  if v_rubric.id is null then raise exception 'Rubrik penilaian lembaga belum diatur.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext(v_org::text || ':ujian:' || p_academic_year_id || ':' || v_sem || ':' || v_type || ':'
    || p_santri_id || ':' || coalesce(p_period_id::text, '-')));

  select * into v_last from public.exam_attempts
  where organization_id = v_org and academic_year_id = p_academic_year_id and semester_name = v_sem and exam_type = v_type
    and santri_id = p_santri_id and period_id is not distinct from p_period_id
  order by attempt_no desc limit 1;
  select coalesce(max(attempt_no), 0) + 1 into v_next from public.exam_attempts
  where organization_id = v_org and academic_year_id = p_academic_year_id and semester_name = v_sem and exam_type = v_type
    and santri_id = p_santri_id and period_id is not distinct from p_period_id;
  -- percobaan terakhir yang masih sah
  select * into v_last from public.exam_attempts
  where organization_id = v_org and academic_year_id = p_academic_year_id and semester_name = v_sem and exam_type = v_type
    and santri_id = p_santri_id and period_id is not distinct from p_period_id and status = 'valid'
  order by attempt_no desc limit 1;

  if coalesce(p_mode, 'baru') = 'baru' and v_last.id is not null then
    raise exception 'Santri ini sudah punya nilai untuk ujian tersebut. Gunakan Remedial (percobaan baru) atau Koreksi (Admin).'
      using errcode = '22023';
  elsif p_mode = 'remedial' and v_last.id is null then
    raise exception 'Remedial hanya untuk santri yang sudah punya nilai.' using errcode = '22023';
  elsif p_mode = 'koreksi' then
    if not v_admin then raise exception 'Koreksi nilai ujian hanya oleh Admin.' using errcode = '42501'; end if;
    if v_last.id is null then raise exception 'Belum ada nilai yang bisa dikoreksi.' using errcode = '22023'; end if;
    if not public.fn_alasan_valid(p_reason) then
      raise exception 'Koreksi nilai ujian wajib menyertakan alasan yang jelas (minimal 5 karakter).' using errcode = '22023';
    end if;
  end if;

  if v_type = 'semester' then
    if p_juz is null or jsonb_typeof(p_juz) <> 'array' or jsonb_array_length(p_juz) = 0 then
      raise exception 'Isi khoto kabir & shoghir minimal untuk satu juz.' using errcode = '22023';
    end if;
    for v_item in select * from jsonb_array_elements(p_juz) loop
      v_no := public.f5_angka(v_item->>'juz')::int;
      v_k := coalesce(public.f5_angka(v_item->>'kabir'), 0);
      v_s := coalesce(public.f5_angka(v_item->>'shoghir'), 0);
      if v_no is null or v_no < 1 or v_no > 30 then raise exception 'Nomor juz harus 1–30.' using errcode = '22023'; end if;
      if v_no = any(v_seen) then raise exception 'Juz % tercantum lebih dari sekali.', v_no using errcode = '22023'; end if;
      if v_k < 0 or v_s < 0 or v_k <> trunc(v_k) or v_s <> trunc(v_s) then
        raise exception 'Jumlah khoto juz % harus bilangan bulat ≥ 0.', v_no using errcode = '22023';
      end if;
      v_seen := v_seen || v_no;
      v_juz := v_juz || jsonb_build_object('juz', v_no, 'kabir', v_k, 'shoghir', v_s, 'nilai', public.fn_nilai_juz(v_rubric, v_k, v_s));
    end loop;
    select coalesce(jsonb_agg(e order by (e->>'juz')::int), '[]'::jsonb) into v_juz from jsonb_array_elements(v_juz) e;
    select round(avg((e->>'nilai')::numeric), 2) into v_score from jsonb_array_elements(v_juz) e;
    select string_agg(e->>'juz', ',' order by (e->>'juz')::int) into v_materi from jsonb_array_elements(v_juz) e;
    v_materi := coalesce(nullif(btrim(coalesce(p_materi_juz, '')), ''), v_materi);
  else
    v_score := round(p_nilai, 2);
    v_materi := nullif(btrim(coalesce(p_materi_juz, '')), '');
  end if;

  if p_mode = 'koreksi' then
    update public.exam_attempts set status = 'voided', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now(),
      updated_at = now()
    where id = v_last.id;
    v_remedial := v_last.is_remedial;
  else
    v_remedial := (p_mode = 'remedial');
  end if;

  v_pred := public.fn_predikat_nilai(v_rubric, v_score);
  insert into public.exam_attempts (organization_id, academic_year_id, semester_name, exam_type, santri_id, student_id,
    attempt_no, is_remedial, materi_juz, detail_json, juz_scores, raw_score, final_score, predikat, notes, examiner_id,
    period_id, halaqah_id, rubric_version_id, passed, remedial_required, status, source)
  values (v_org, p_academic_year_id, v_sem, v_type, p_santri_id, p_santri_id,
    v_next, v_remedial, v_materi,
    jsonb_build_object('mode', coalesce(p_mode, 'baru'), 'periode', v_period.legacy_key, 'ke', v_period.ke),
    v_juz, v_score, v_score, v_pred, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(),
    p_period_id, public.fn_halaqah_santri_pada(v_org, p_santri_id, public.fn_hari_ini_lembaga(v_org)), v_rubric.id,
    v_score >= coalesce(v_rubric.passing_score, 70), v_score < coalesce(v_rubric.passing_score, 70), 'valid', 'aplikasi')
  returning id into v_id;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_org, auth.uid(), public.get_role_for_org(v_org),
    case p_mode when 'koreksi' then 'correct_exam_attempt' when 'remedial' then 'record_remedial_exam' else 'record_exam_attempt' end,
    'exam_attempts', v_id::text, case when p_mode = 'koreksi' then btrim(p_reason) end,
    jsonb_build_object('santri_id', p_santri_id, 'exam_type', v_type, 'period_id', p_period_id, 'attempt_no', v_next,
      'final_score', v_score, 'predikat', v_pred, 'replaces', case when p_mode = 'koreksi' then v_last.id end));

  return jsonb_build_object('id', v_id, 'attempt_no', v_next, 'is_remedial', v_remedial, 'final_score', v_score,
    'predikat', v_pred, 'passed', v_score >= coalesce(v_rubric.passing_score, 70), 'juz_scores', v_juz);
end;
$$;
revoke all on function public.rpc_simpan_ujian(bigint, text, bigint, text, uuid, text, jsonb, numeric, text, text, text) from public, anon;
grant execute on function public.rpc_simpan_ujian(bigint, text, bigint, text, uuid, text, jsonb, numeric, text, text, text) to authenticated, service_role;

create or replace function public.rpc_batal_ujian(p_attempt_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.exam_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into a from public.exam_attempts where id = p_attempt_id;
  if a.id is null then raise exception 'Nilai ujian tidak ditemukan.'; end if;
  if not public.is_admin_of_org(a.organization_id) then
    raise exception 'Membatalkan nilai ujian hanya oleh Admin.' using errcode = '42501';
  end if;
  if not public.fn_alasan_valid(p_reason) then
    raise exception 'Pembatalan nilai ujian wajib menyertakan alasan yang jelas (minimal 5 karakter).' using errcode = '22023';
  end if;
  if a.status = 'voided' then return; end if;
  update public.exam_attempts set status = 'voided', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now(), updated_at = now()
  where id = a.id;
  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state)
  values (a.organization_id, auth.uid(), public.get_role_for_org(a.organization_id), 'void_exam_attempt', 'exam_attempts', a.id::text,
          btrim(p_reason), jsonb_build_object('santri_id', a.santri_id, 'exam_type', a.exam_type, 'final_score', a.final_score));
end;
$$;
revoke all on function public.rpc_batal_ujian(uuid, text) from public, anon;
grant execute on function public.rpc_batal_ujian(uuid, text) to authenticated, service_role;

create or replace function public.rpc_simpan_catatan_raport(p_santri_id bigint, p_academic_year_id bigint, p_semester text, p_catatan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_sem text := public.f5_semester(p_semester);
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select organization_id into v_org from public.santri where id = p_santri_id;
  if v_org is null then raise exception 'Santri tidak ditemukan.'; end if;
  if not public.fn_bisa_menguji(v_org, p_santri_id, p_academic_year_id, v_sem, 'semester') then
    raise exception 'Akses ditolak: Anda bukan penguji santri ini.' using errcode = '42501';
  end if;
  if not coalesce(public.is_admin_of_org(v_org), false) and exists (select 1 from public.report_cards rc where rc.organization_id = v_org
      and rc.santri_id = p_santri_id and rc.academic_year_id = p_academic_year_id and rc.semester_name = v_sem and rc.status = 'published') then
    raise exception 'Raport santri ini sudah terbit. Perubahan catatan dilakukan Admin.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_catatan, '')), '') is null then
    delete from public.raport_catatan where organization_id = v_org and academic_year_id = p_academic_year_id and semester = v_sem and santri_id = p_santri_id;
  else
    insert into public.raport_catatan (organization_id, academic_year_id, semester, santri_id, catatan, updated_by, updated_at)
    values (v_org, p_academic_year_id, v_sem, p_santri_id, left(btrim(p_catatan), 2000), auth.uid(), now())
    on conflict (organization_id, academic_year_id, semester, santri_id)
    do update set catatan = excluded.catatan, updated_by = excluded.updated_by, updated_at = now();
  end if;
end;
$$;
revoke all on function public.rpc_simpan_catatan_raport(bigint, bigint, text, text) from public, anon;
grant execute on function public.rpc_simpan_catatan_raport(bigint, bigint, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Komponen raport
-- ---------------------------------------------------------------------
create or replace function public.fn_komponen_raport(p_org uuid, p_year bigint, p_sem text, p_santri bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sem text := public.f5_semester(p_sem);
  v_set public.raport_settings%rowtype;
  v_rubric public.rubric_versions;
  v_semester public.exam_attempts%rowtype;
  v_bulanan jsonb;
  v_avg numeric;
  v_n_periode int;
  v_n_nilai int;
  v_start date; v_end date;
  v_hadir int; v_total int; v_persen numeric;
  v_kurang text[] := '{}';
  v_peringatan text[] := '{}';
  v_akhir numeric;
  v_bs numeric; v_bb numeric; v_bk numeric;
begin
  select * into v_set from public.raport_settings where organization_id = p_org;
  v_bs := coalesce(v_set.bobot_semester, 60);
  v_bb := coalesce(v_set.bobot_bulanan, 40);
  v_bk := coalesce(v_set.bobot_kehadiran, 0);
  v_rubric := public.fn_rubrik_aktif(p_org);

  -- Ujian semester: percobaan terakhir yang sah (remedial menggantikan nilai di raport, nilai lama tetap tercatat)
  select * into v_semester from public.exam_attempts
  where organization_id = p_org and academic_year_id = p_year and semester_name = v_sem and exam_type = 'semester'
    and santri_id = p_santri and status = 'valid'
  order by attempt_no desc limit 1;
  if v_semester.id is null then
    v_kurang := v_kurang || 'Nilai ujian semester belum ada'::text;
  end if;

  -- Ujian bulanan: nilai percobaan terakhir per ujian bulanan pada semester ini
  select count(*) into v_n_periode from public.monthly_exam_periods
  where organization_id = p_org and academic_year_id = p_year and semester = v_sem;
  select coalesce(jsonb_agg(jsonb_build_object('period_id', p.id, 'ke', p.ke, 'label', p.label, 'nilai', a.final_score,
           'attempt_no', a.attempt_no, 'is_remedial', a.is_remedial) order by p.ke), '[]'::jsonb),
         round(avg(a.final_score), 2), count(a.id)
  into v_bulanan, v_avg, v_n_nilai
  from public.monthly_exam_periods p
  left join lateral (
    select x.* from public.exam_attempts x
    where x.organization_id = p_org and x.period_id = p.id and x.santri_id = p_santri and x.status = 'valid'
    order by x.attempt_no desc limit 1
  ) a on true
  where p.organization_id = p_org and p.academic_year_id = p_year and p.semester = v_sem;
  if v_bb > 0 then
    if v_n_periode = 0 then
      v_kurang := v_kurang || 'Ujian bulanan semester ini belum dibuat'::text;
    elsif v_n_nilai = 0 then
      v_kurang := v_kurang || 'Nilai ujian bulanan belum ada'::text;
    elsif v_n_nilai < v_n_periode then
      select v_peringatan || array_agg('Ujian bulanan ke-' || (e->>'ke') || ' belum ada nilai' order by (e->>'ke')::int)
      into v_peringatan from jsonb_array_elements(v_bulanan) e where e->>'nilai' is null;
    end if;
  end if;

  -- Kehadiran semester (status "dihitung hadir")
  select t.start_date, t.end_date into v_start, v_end from public.fn_tanggal_semester(p_org, p_year, v_sem) t;
  if v_start is not null and v_end is not null then
    select count(*) filter (where st.counts_as_present), count(*)
    into v_hadir, v_total
    from public.attendance_records r
    left join public.attendance_statuses st on st.organization_id = r.organization_id and st.code = r.status
    where r.organization_id = p_org and r.santri_id = p_santri and r.attendance_date between v_start and v_end;
    v_persen := case when v_total > 0 then round(100.0 * v_hadir / v_total, 2) end;
  end if;
  if v_bk > 0 then
    if v_start is null or v_end is null then
      v_kurang := v_kurang || 'Tanggal semester belum diatur (dibutuhkan untuk kehadiran)'::text;
    elsif v_persen is null then
      v_kurang := v_kurang || 'Belum ada absensi pada semester ini'::text;
    end if;
  end if;

  if cardinality(v_kurang) = 0 then
    v_akhir := round((v_bs * v_semester.final_score
      + case when v_bb > 0 then v_bb * v_avg else 0 end
      + case when v_bk > 0 then v_bk * v_persen else 0 end) / 100, 2);
  end if;

  return jsonb_build_object(
    'santri_id', p_santri,
    'bobot', jsonb_build_object('semester', v_bs, 'bulanan', v_bb, 'kehadiran', v_bk),
    'semester', case when v_semester.id is not null then jsonb_build_object(
        'attempt_id', v_semester.id, 'attempt_no', v_semester.attempt_no, 'is_remedial', v_semester.is_remedial,
        'nilai', v_semester.final_score, 'predikat', v_semester.predikat, 'materi_juz', v_semester.materi_juz,
        'juz', v_semester.juz_scores, 'detail', v_semester.detail_json) end,
    'bulanan', jsonb_build_object('rata_rata', v_avg, 'jumlah_ujian', v_n_periode, 'jumlah_nilai', v_n_nilai, 'daftar', v_bulanan),
    'kehadiran', jsonb_build_object('persen', v_persen, 'hadir', v_hadir, 'total', v_total, 'mulai', v_start, 'selesai', v_end),
    'catatan', (select c.catatan from public.raport_catatan c where c.organization_id = p_org and c.academic_year_id = p_year
                  and c.semester = v_sem and c.santri_id = p_santri),
    'nilai_akhir', v_akhir,
    'predikat', case when v_akhir is not null then public.fn_predikat_nilai(v_rubric, v_akhir) end,
    'kekurangan', to_jsonb(v_kurang),
    'peringatan', to_jsonb(v_peringatan),
    'lengkap', cardinality(v_kurang) = 0
  );
end;
$$;
revoke all on function public.fn_komponen_raport(uuid, bigint, text, bigint) from public, anon, authenticated;

create or replace function public.rpc_komponen_raport(p_academic_year_id bigint, p_semester text, p_santri_ids bigint[] default null)
returns table (santri_id bigint, komponen jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select y.organization_id into v_org from public.academic_years y where y.id = p_academic_year_id;
  if v_org is null or public.get_role_for_org(v_org) is null then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return query
  select s.id, public.fn_komponen_raport(v_org, p_academic_year_id, p_semester, s.id)
  from public.santri s
  where s.organization_id = v_org
    and (p_santri_ids is null or s.id = any(p_santri_ids))
    and (p_santri_ids is not null or coalesce(s.status, 'active') = 'active')
    and public.fn_bisa_menguji(v_org, s.id, p_academic_year_id, p_semester, 'semester');
end;
$$;
revoke all on function public.rpc_komponen_raport(bigint, text, bigint[]) from public, anon;
grant execute on function public.rpc_komponen_raport(bigint, text, bigint[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Terbitkan raport (nilai dihitung server, ditolak bila komponen kurang)
-- ---------------------------------------------------------------------
drop function if exists public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text);

create or replace function public.rpc_publish_report_card(
  p_academic_year_id bigint,
  p_semester text,
  p_santri_id bigint,
  p_info jsonb default '{}'::jsonb,
  p_amendment_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_sem text := public.f5_semester(p_semester);
  v_k jsonb;
  v_prev public.report_cards%rowtype;
  v_max int;
  v_snapshot jsonb;
  v_hash text;
  v_new_id uuid;
  v_code text;
  v_set public.raport_settings%rowtype;
  v_info jsonb := '{}'::jsonb;
  s record;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select organization_id into v_org from public.santri where id = p_santri_id;
  if v_org is null then raise exception 'Santri tidak ditemukan.'; end if;
  if not public.is_admin_of_org(v_org) then
    raise exception 'Akses ditolak: Hanya Admin Lembaga yang dapat menerbitkan raport.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years y where y.id = p_academic_year_id and y.organization_id = v_org) then
    raise exception 'Tahun ajaran tidak ditemukan.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_org::text || ':' || p_academic_year_id::text || ':' || v_sem || ':' || p_santri_id::text));

  v_k := public.fn_komponen_raport(v_org, p_academic_year_id, v_sem, p_santri_id);
  if not (v_k->>'lengkap')::boolean then
    raise exception 'Raport belum bisa terbit: %.',
      (select string_agg(x, '; ') from jsonb_array_elements_text(v_k->'kekurangan') x) using errcode = '22023';
  end if;

  -- Info tampilan dari aplikasi (hafalan & target) — hanya kunci yang dikenal
  if p_info is not null and jsonb_typeof(p_info) = 'object' then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_info from jsonb_each(p_info)
    where key in ('target_hafalan', 'hafalan_depan', 'hafalan_belakang', 'total_hafalan');
  end if;

  select s2.nama, s2.kode, s2.marhalah, s2.kelas, s2.marhalah_id, s2.kelas_id, o.name as org_name, y.name as year_name
  into s
  from public.santri s2 join public.organizations o on o.id = s2.organization_id
  join public.academic_years y on y.id = p_academic_year_id
  where s2.id = p_santri_id;
  select * into v_set from public.raport_settings where organization_id = v_org;

  v_snapshot := jsonb_build_object(
    'versi_format', 'f5',
    'santri_nama', s.nama, 'santri_kode', s.kode, 'marhalah', s.marhalah, 'kelas', s.kelas,
    'lembaga', s.org_name, 'academic_year', s.year_name, 'semester', v_sem,
    'komponen', v_k - 'santri_id' - 'lengkap' - 'kekurangan',
    'nilai_akhir', (v_k->>'nilai_akhir')::numeric, 'predikat', v_k->>'predikat',
    'info', v_info,
    'tanda_tangan', jsonb_build_object(
      'nama', v_set.ketua_lajnah_nama, 'jabatan', coalesce(v_set.ketua_lajnah_jabatan, 'Ketua Lajnah'),
      'kota', v_set.kota_terbit,
      'ttd_sha256', case when v_set.ttd_image is not null then encode(digest(convert_to(v_set.ttd_image, 'UTF8'), 'sha256'), 'hex') end)
  );
  v_hash := encode(digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_prev from public.report_cards
  where organization_id = v_org and academic_year_id = p_academic_year_id and semester_name = v_sem
    and santri_id = p_santri_id and status = 'published'
  order by version_no desc limit 1 for update;

  if v_prev.id is not null then
    if v_prev.snapshot_hash = v_hash and nullif(btrim(coalesce(p_amendment_reason, '')), '') is null then
      return jsonb_build_object('id', v_prev.id, 'version_no', v_prev.version_no, 'status', 'published',
        'snapshot_hash', v_hash, 'verification_code', v_prev.verification_code, 'is_duplicate_prevented', true,
        'nilai_akhir', v_prev.final_score, 'predikat', v_prev.predikat);
    end if;
    if not public.fn_alasan_valid(p_amendment_reason, 5) then
      raise exception 'Alasan amandemen raport wajib diisi dengan jelas (minimal 5 karakter).' using errcode = '22023';
    end if;
    update public.report_cards set status = 'amended', updated_at = now() where id = v_prev.id;
  end if;

  select coalesce(max(version_no), 0) into v_max from public.report_cards
  where organization_id = v_org and academic_year_id = p_academic_year_id and semester_name = v_sem and santri_id = p_santri_id;

  insert into public.report_cards (organization_id, academic_year_id, semester_name, santri_id, version_no, status,
    final_score, predikat, snapshot_json, snapshot_hash, parent_report_card_id, amendment_reason, published_by, published_at)
  values (v_org, p_academic_year_id, v_sem, p_santri_id, v_max + 1, 'published',
    (v_k->>'nilai_akhir')::numeric, v_k->>'predikat', v_snapshot, v_hash, v_prev.id,
    case when v_prev.id is not null then btrim(p_amendment_reason) else 'Publikasi awal v1' end, auth.uid(), now())
  returning id, verification_code into v_new_id, v_code;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_org, auth.uid(), public.get_role_for_org(v_org),
    case when v_prev.id is null then 'publish_report_card' else 'amend_report_card' end,
    'report_cards', v_new_id::text, case when v_prev.id is not null then btrim(p_amendment_reason) end,
    jsonb_build_object('santri_id', p_santri_id, 'version_no', v_max + 1, 'final_score', v_k->>'nilai_akhir',
      'snapshot_hash', v_hash, 'verification_code', v_code));

  return jsonb_build_object('id', v_new_id, 'version_no', v_max + 1, 'status', 'published', 'snapshot_hash', v_hash,
    'verification_code', v_code, 'is_duplicate_prevented', false,
    'nilai_akhir', (v_k->>'nilai_akhir')::numeric, 'predikat', v_k->>'predikat');
end;
$$;
revoke all on function public.rpc_publish_report_card(bigint, text, bigint, jsonb, text) from public, anon;
grant execute on function public.rpc_publish_report_card(bigint, text, bigint, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Rubrik: simpan versi (pengganti versi arsip). Rubrik yang SUDAH dipakai percobaan ujian /
-- raport lembaga tidak pernah diubah di tempat — selalu versi baru. Isi divalidasi server.
-- ---------------------------------------------------------------------
create or replace function public.rpc_save_rubric_version(
  p_org_id uuid,
  p_academic_year_id bigint,
  p_semester text,
  p_name text,
  p_initial_score numeric default 100,
  p_deduction_minor numeric default 1.25,
  p_deduction_major numeric default 5.0,
  p_min_score numeric default 50.0,
  p_passing_score numeric default 70.0,
  p_predicates jsonb default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org_id, public.get_my_org_id());
  v_active public.rubric_versions;
  v_used boolean;
  v_next int;
  v_id uuid;
  v_pred jsonb;
  v_baru boolean;
begin
  if v_org is null or not public.is_admin_of_org(v_org) then
    raise exception 'Akses ditolak: Hanya Admin Lembaga yang dapat mengatur rubrik penilaian.';
  end if;
  if p_initial_score is null or p_initial_score <= 0 or p_initial_score > 100 then
    raise exception 'Nilai awal per juz harus 1–100.';
  end if;
  if coalesce(p_deduction_major, -1) < 0 or coalesce(p_deduction_minor, -1) < 0 then
    raise exception 'Pengurang kabir & shoghir tidak boleh negatif.';
  end if;
  if p_min_score is null or p_min_score < 0 or p_min_score > p_initial_score then
    raise exception 'Nilai minimum harus 0 sampai nilai awal.';
  end if;
  if p_passing_score is null or p_passing_score < 0 or p_passing_score > 100 then
    raise exception 'KKM harus 0–100.';
  end if;
  v_pred := coalesce(p_predicates, (public.fn_rubrik_aktif(v_org)).predicates);
  if v_pred is null or jsonb_typeof(v_pred) <> 'array' or jsonb_array_length(v_pred) = 0 then
    raise exception 'Skala predikat minimal satu.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_pred) e
             where nullif(btrim(coalesce(e->>'label', '')), '') is null
                or coalesce(e->>'minScore', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
                or (e->>'minScore')::numeric < 0 or (e->>'minScore')::numeric > 100) then
    raise exception 'Setiap predikat wajib punya nama dan nilai minimum 0–100.';
  end if;
  if (select count(distinct lower(btrim(e->>'label'))) from jsonb_array_elements(v_pred) e) <> jsonb_array_length(v_pred) then
    raise exception 'Nama predikat tidak boleh sama.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('label', btrim(e->>'label'), 'minScore', (e->>'minScore')::numeric)
                            order by (e->>'minScore')::numeric desc), '[]'::jsonb)
  into v_pred from jsonb_array_elements(v_pred) e;

  v_active := public.fn_rubrik_aktif(v_org);
  v_used := v_active.id is null
    or exists (select 1 from public.exam_attempts a where a.organization_id = v_org
               and (a.rubric_version_id = v_active.id or a.rubric_version_id is null))
    or exists (select 1 from public.report_cards r where r.organization_id = v_org);
  v_baru := v_used;

  if v_baru then
    select coalesce(max(version_no), 0) + 1 into v_next from public.rubric_versions where organization_id = v_org;
    update public.rubric_versions set is_active = false where organization_id = v_org and is_active;
    insert into public.rubric_versions (organization_id, academic_year_id, semester_name, version_no, name,
      initial_score, deduction_minor, deduction_major, min_score, passing_score, predicates, is_active, created_by)
    values (v_org, p_academic_year_id, public.f5_semester(p_semester), v_next,
      coalesce(nullif(btrim(p_name), ''), 'Rubrik Penilaian v' || v_next),
      p_initial_score, p_deduction_minor, p_deduction_major, p_min_score, p_passing_score, v_pred, true, auth.uid())
    returning id into v_id;
  else
    v_next := v_active.version_no;
    update public.rubric_versions set academic_year_id = p_academic_year_id, semester_name = public.f5_semester(p_semester),
      name = coalesce(nullif(btrim(p_name), ''), name), initial_score = p_initial_score, deduction_minor = p_deduction_minor,
      deduction_major = p_deduction_major, min_score = p_min_score, passing_score = p_passing_score, predicates = v_pred
    where id = v_active.id
    returning id into v_id;
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_org, auth.uid(), coalesce(public.get_role_for_org(v_org), 'admin'), 'PUBLISH_RUBRIC_VERSION', 'rubric_versions',
    v_id::text, coalesce(nullif(btrim(p_reason), ''), 'Pembaruan rubrik penilaian v' || v_next),
    jsonb_build_object('version_no', v_next, 'is_new_version', v_baru, 'initial_score', p_initial_score,
      'deduction_major', p_deduction_major, 'deduction_minor', p_deduction_minor, 'min_score', p_min_score,
      'passing_score', p_passing_score, 'predicates', v_pred));

  return jsonb_build_object('success', true, 'id', v_id, 'version_no', v_next, 'is_new_version', v_baru);
end;
$$;
revoke all on function public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text) from public, anon;
grant execute on function public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text) to authenticated, service_role;

-- Raport hanya diterbitkan lewat RPC: cabut tulis langsung dari aplikasi
do $$
declare p record;
begin
  for p in select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'report_cards' and cmd <> 'SELECT' loop
    execute format('drop policy if exists %I on public.report_cards', p.policyname);
  end loop;
end $$;
revoke insert, update, delete on public.report_cards from anon, authenticated;

commit;
