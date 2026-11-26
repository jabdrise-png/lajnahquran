-- =====================================================================
-- 2026_11_29_02_f4_hitung_rekap.sql
-- Fase 4 · butir 6–9 (Rekap Periode — logika & RPC)
--
-- Tujuan:
--   1. fn_hitung_rekap_santri(): isian sistem dari data harian —
--        ziyadah  = jumlah halaman setoran jenis "menambah hafalan" (Rasib tidak dihitung)
--        murojaah = jumlah halaman setoran jenis "dihitung murojaah"
--        posisi   = dari ziyadah terakhir s.d. akhir periode (sesuai arah hafalan santri),
--                   atau dari rekap periode sebelumnya bila lebih baru
--        total    = fn_total_hafalan(posisi)
--        kelancaran = rata-rata peringkat predikat setoran (Tabel Kelancaran)
--        kehadiran  = dari absensi sesi
--   2. fn_siapkan_form(): membuat form halaqah (mode dibekukan) & baris rekap santri.
--      Rekap milik halaqah tempat santri di akhir periode; setoran dari halaqah lama
--      tetap dijumlah.
--   3. RPC: rpc_buka_form_periode, rpc_simpan_form_periode (Simpan Draft / Kirim,
--      koreksi Admin beralasan), rpc_buka_kembali_form_periode, rpc_hitung_rekap_harian,
--      rpc_status_periode (Pemantauan), rpc_hapus_periode, rpc_set_mode_halaqah.
--   4. Trigger: rekap Mode Harian ikut berubah saat setoran/absensi berubah;
--      Musammi'' tidak bisa menambah setoran ke periode yang formnya sudah dikirim.
--   5. Mode halaqah diubah → mode periode berjalan dibekukan (berlaku periode berikutnya).
--
-- Prasyarat: 2026_11_29_01_f4_periode_dan_rekap.sql
-- Rollback:
--   drop trigger if exists trg_rekap_dari_setoran on public.recitation_entries;
--   drop trigger if exists trg_rekap_dari_absensi on public.attendance_records;
--   drop trigger if exists trg_jaga_setoran_periode_terkirim on public.recitation_entries;
--   drop trigger if exists trg_bekukan_mode_halaqah on public.halaqah;
--   drop function if exists public.rpc_buka_form_periode(uuid, bigint),
--     public.rpc_simpan_form_periode(uuid, bigint, jsonb, jsonb, boolean, text),
--     public.rpc_buka_kembali_form_periode(uuid, text), public.rpc_hitung_rekap_harian(uuid, bigint),
--     public.rpc_status_periode(uuid), public.rpc_hapus_periode(uuid, text),
--     public.rpc_set_mode_halaqah(bigint, text), public.fn_siapkan_form(uuid, bigint),
--     public.fn_terapkan_hitung(uuid), public.fn_hitung_rekap_santri(uuid, bigint),
--     public.fn_halaqah_pemilik(uuid, bigint, uuid), public.fn_posisi_dari_setoran(int, int, int, int, text),
--     public.fn_bersihkan_jawaban(uuid, text, jsonb, jsonb);
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Fungsi bantu
-- ---------------------------------------------------------------------

-- Posisi hafalan setelah setoran ziyadah (rentang disimpan naik). Sama dengan
-- posisiDariSetoran() di lib/totalHafalan.ts.
create or replace function public.fn_posisi_dari_setoran(p_s1 int, p_a1 int, p_s2 int, p_a2 int, p_arah text)
returns int[]
language sql
stable
set search_path = public
as $$
  select case
    when p_s1 is null or p_s2 is null then null
    when coalesce(p_arah, 'mundur') = 'maju' or p_s1 = p_s2 then array[p_s2, greatest(coalesce(p_a2, 1), 1)]
    when coalesce(p_a1, 1) = 1 then array[p_s1, (select s.ayah_count::int from public.quran_surahs s where s.no = p_s1)]
    else array[p_s2, greatest(coalesce(p_a2, 1), 1)]
  end;
$$;

-- Halaqah pemilik rekap = halaqah santri pada akhir periode (atau hari ini bila periode berjalan).
-- Bila santri sudah keluar sebelum itu: halaqah terakhirnya dalam periode.
create or replace function public.fn_halaqah_pemilik(p_org uuid, p_santri bigint, p_period uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select start_date, end_date,
           least(end_date, greatest(start_date, public.fn_hari_ini_lembaga(p_org))) as ref
    from public.evaluation_periods where id = p_period and organization_id = p_org
  )
  select coalesce(
    (select m.halaqah_id from public.halaqah_student_memberships m, p
     where m.organization_id = p_org and m.student_id = p_santri
       and m.valid_from <= p.ref and (m.valid_to is null or m.valid_to >= p.ref)
     order by m.valid_from desc, (m.status = 'active') desc, m.created_at desc limit 1),
    (select m.halaqah_id from public.halaqah_student_memberships m, p
     where m.organization_id = p_org and m.student_id = p_santri
       and m.valid_from <= p.end_date and (m.valid_to is null or m.valid_to >= p.start_date)
     order by coalesce(m.valid_to, 'infinity'::date) desc, m.valid_from desc limit 1)
  );
$$;

-- Isian sistem dihitung dari data harian
create or replace function public.fn_hitung_rekap_santri(p_period uuid, p_santri bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_arah text;
  v_z numeric; v_m numeric;
  v_last record;
  v_prev record;
  v_pos int[];
  v_ms int; v_ma int; v_us int; v_ua int;
  v_total numeric; v_juz numeric;
  v_kel text;
  v_hadir int; v_jml int;
begin
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then return null; end if;
  select coalesce(arah_hafalan, 'mundur') into v_arah from public.santri
  where id = p_santri and organization_id = v_per.organization_id;

  select
    coalesce(sum(case when k.adds_memorization and not coalesce(r.is_repeat, false) then r.calculated_pages end), 0),
    coalesce(sum(case when k.counts_as_murojaah and not coalesce(k.adds_memorization, false) then r.calculated_pages end), 0)
  into v_z, v_m
  from public.recitation_entries r
  left join public.recitation_kinds k on k.organization_id = r.organization_id and k.code = r.kind
  where r.organization_id = v_per.organization_id and r.santri_id = p_santri and r.status = 'accepted'
    and r.recitation_date between v_per.start_date and v_per.end_date;

  -- Rekap periode sebelumnya (untuk posisi yang belum berubah)
  select pr.posisi_maju_surah, pr.posisi_maju_ayah, pr.posisi_mundur_surah, pr.posisi_mundur_ayah,
         pr.total_pages, pr.total_juz, p.end_date
  into v_prev
  from public.period_recaps pr
  join public.evaluation_periods p on p.id = pr.period_id
  where pr.organization_id = v_per.organization_id and pr.santri_id = p_santri
    and p.end_date < v_per.start_date and not p.needs_review
  order by p.end_date desc limit 1;

  v_ms := v_prev.posisi_maju_surah; v_ma := v_prev.posisi_maju_ayah;
  v_us := v_prev.posisi_mundur_surah; v_ua := v_prev.posisi_mundur_ayah;

  -- Ziyadah terakhir s.d. akhir periode (setoran Rasib tidak menggeser posisi)
  select r.surah_start_no, r.ayah_start, r.surah_end_no, r.ayah_end, r.recitation_date
  into v_last
  from public.recitation_entries r
  join public.recitation_kinds k on k.organization_id = r.organization_id and k.code = r.kind and k.adds_memorization
  where r.organization_id = v_per.organization_id and r.santri_id = p_santri and r.status = 'accepted'
    and not coalesce(r.is_repeat, false) and r.recitation_date <= v_per.end_date
    and r.surah_start_no is not null and r.surah_end_no is not null
  order by r.recitation_date desc, r.created_at desc limit 1;

  if v_last.recitation_date is not null and (v_prev.end_date is null or v_last.recitation_date > v_prev.end_date) then
    v_pos := public.fn_posisi_dari_setoran(v_last.surah_start_no, v_last.ayah_start, v_last.surah_end_no, v_last.ayah_end, v_arah);
    if v_arah = 'maju' then v_ms := v_pos[1]; v_ma := v_pos[2];
    else v_us := v_pos[1]; v_ua := v_pos[2]; end if;
  end if;

  if v_ms is not null or v_us is not null then
    select t.halaman, t.juz into v_total, v_juz from public.fn_total_hafalan(v_ms, v_ma, v_us, v_ua) t;
  elsif v_prev.total_pages is not null then
    -- Rekap lama tanpa posisi: total sebelumnya + ziyadah periode ini
    v_total := v_prev.total_pages + v_z;
    v_juz := round(coalesce(v_prev.total_juz, v_prev.total_pages / 20) + v_z / 20, 2);
  end if;

  -- Kelancaran: rata-rata peringkat predikat (0 = terbaik) dibulatkan ke predikat terdekat
  with rules as (
    select f.predicate, (row_number() over (order by f.is_repeat, f.sort_order, f.predicate) - 1)::numeric as rk
    from public.fluency_rules f where f.organization_id = v_per.organization_id and f.is_active
  ), vals as (
    select rl.rk from public.recitation_entries r join rules rl on rl.predicate = r.predicate
    where r.organization_id = v_per.organization_id and r.santri_id = p_santri and r.status = 'accepted'
      and r.recitation_date between v_per.start_date and v_per.end_date
  )
  select (select rules.predicate from rules where rules.rk = (select round(avg(vals.rk)) from vals)) into v_kel;

  select count(*) filter (where st.counts_as_present), count(*)
  into v_hadir, v_jml
  from public.attendance_records a
  left join public.attendance_statuses st on st.organization_id = a.organization_id and st.code = a.status
  where a.organization_id = v_per.organization_id and a.santri_id = p_santri
    and a.attendance_date between v_per.start_date and v_per.end_date;

  return jsonb_build_object(
    'ziyadah_pages', round(v_z, 2), 'murojaah_pages', round(v_m, 2),
    'posisi_maju_surah', v_ms, 'posisi_maju_ayah', v_ma,
    'posisi_mundur_surah', v_us, 'posisi_mundur_ayah', v_ua,
    'total_pages', v_total, 'total_juz', v_juz,
    'kelancaran', v_kel,
    'hadir_count', v_hadir, 'kehadiran_total', v_jml,
    'kehadiran_persen', case when v_jml > 0 then round(100.0 * v_hadir / v_jml, 2) end
  );
end;
$$;

-- Terapkan hasil hitung ke satu baris rekap (menghormati koreksi Admin di "overrides")
create or replace function public.fn_terapkan_hitung(p_recap uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.period_recaps%rowtype;
  v jsonb;
begin
  select * into r from public.period_recaps where id = p_recap;
  if r.id is null or r.sumber = 'migrasi' then return; end if;
  v := public.fn_hitung_rekap_santri(r.period_id, r.santri_id);
  if v is null then return; end if;
  if r.sumber = 'harian' then
    update public.period_recaps set
      ziyadah_pages = case when overrides ? 'ziyadah' then ziyadah_pages else (v->>'ziyadah_pages')::numeric end,
      murojaah_pages = case when overrides ? 'murojaah' then murojaah_pages else (v->>'murojaah_pages')::numeric end,
      posisi_maju_surah = case when overrides ? 'posisi' then posisi_maju_surah else (v->>'posisi_maju_surah')::smallint end,
      posisi_maju_ayah = case when overrides ? 'posisi' then posisi_maju_ayah else (v->>'posisi_maju_ayah')::smallint end,
      posisi_mundur_surah = case when overrides ? 'posisi' then posisi_mundur_surah else (v->>'posisi_mundur_surah')::smallint end,
      posisi_mundur_ayah = case when overrides ? 'posisi' then posisi_mundur_ayah else (v->>'posisi_mundur_ayah')::smallint end,
      total_pages = case when overrides ? 'posisi' then total_pages else (v->>'total_pages')::numeric end,
      total_juz = case when overrides ? 'posisi' then total_juz else (v->>'total_juz')::numeric end,
      kelancaran = case when overrides ? 'kelancaran' then kelancaran else v->>'kelancaran' end,
      hadir_count = case when overrides ? 'kehadiran' then hadir_count else (v->>'hadir_count')::int end,
      kehadiran_total = case when overrides ? 'kehadiran' then kehadiran_total else (v->>'kehadiran_total')::int end,
      kehadiran_persen = case when overrides ? 'kehadiran' then kehadiran_persen else (v->>'kehadiran_persen')::numeric end,
      computed_at = now()
    where id = r.id;
  else
    -- Mode Rekap: hanya kehadiran yang otomatis (kecuali diisi manual)
    update public.period_recaps set
      hadir_count = case when overrides ? 'kehadiran' then hadir_count else (v->>'hadir_count')::int end,
      kehadiran_total = case when overrides ? 'kehadiran' then kehadiran_total else (v->>'kehadiran_total')::int end,
      kehadiran_persen = case when overrides ? 'kehadiran' then kehadiran_persen else (v->>'kehadiran_persen')::numeric end,
      computed_at = now()
    where id = r.id;
  end if;
end;
$$;

-- Form halaqah + baris rekap untuk santri pemiliknya
create or replace function public.fn_siapkan_form(p_period uuid, p_halaqah bigint)
returns public.period_forms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_form public.period_forms%rowtype;
  v_sid bigint;
  v_rec public.period_recaps%rowtype;
  v_prev record;
  v_cur_status text;
begin
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;

  insert into public.period_forms (organization_id, period_id, halaqah_id, recording_mode)
  select v_per.organization_id, v_per.id, h.id, h.recording_mode
  from public.halaqah h where h.id = p_halaqah and h.organization_id = v_per.organization_id
  on conflict (period_id, halaqah_id) do nothing;

  select * into v_form from public.period_forms where period_id = p_period and halaqah_id = p_halaqah;
  if v_form.id is null then raise exception 'Halaqah % tidak ditemukan di lembaga ini.', p_halaqah; end if;

  for v_sid in
    select m.student_id from public.halaqah_student_memberships m
    where m.organization_id = v_per.organization_id and m.halaqah_id = p_halaqah
      and m.valid_from <= v_per.end_date and (m.valid_to is null or m.valid_to >= v_per.start_date)
    union
    select pr.santri_id from public.period_recaps pr where pr.form_id = v_form.id
  loop
    if public.fn_halaqah_pemilik(v_per.organization_id, v_sid, v_per.id) is distinct from p_halaqah then
      continue;
    end if;
    select * into v_rec from public.period_recaps where period_id = v_per.id and santri_id = v_sid;
    if v_rec.id is null then
      select pr.posisi_maju_surah, pr.posisi_maju_ayah, pr.posisi_mundur_surah, pr.posisi_mundur_ayah, pr.total_pages, pr.total_juz
      into v_prev
      from public.period_recaps pr join public.evaluation_periods p on p.id = pr.period_id
      where pr.organization_id = v_per.organization_id and pr.santri_id = v_sid and p.end_date < v_per.start_date and not p.needs_review
      order by p.end_date desc limit 1;
      insert into public.period_recaps (organization_id, period_id, santri_id, halaqah_id, form_id, sumber,
        posisi_maju_surah, posisi_maju_ayah, posisi_mundur_surah, posisi_mundur_ayah, total_pages, total_juz)
      values (v_per.organization_id, v_per.id, v_sid, p_halaqah, v_form.id, v_form.recording_mode,
        case when v_form.recording_mode = 'rekap' then v_prev.posisi_maju_surah end,
        case when v_form.recording_mode = 'rekap' then v_prev.posisi_maju_ayah end,
        case when v_form.recording_mode = 'rekap' then v_prev.posisi_mundur_surah end,
        case when v_form.recording_mode = 'rekap' then v_prev.posisi_mundur_ayah end,
        case when v_form.recording_mode = 'rekap' then v_prev.total_pages end,
        case when v_form.recording_mode = 'rekap' then v_prev.total_juz end)
      returning * into v_rec;
    elsif v_rec.form_id is distinct from v_form.id then
      select f.status into v_cur_status from public.period_forms f where f.id = v_rec.form_id;
      -- Santri pindah halaqah: rekap ikut halaqah baru selama form lama belum dikirim
      if coalesce(v_cur_status, 'belum_diisi') <> 'submitted' then
        update public.period_recaps
        set halaqah_id = p_halaqah, form_id = v_form.id,
            sumber = case when sumber = 'migrasi' then 'migrasi' else v_form.recording_mode end,
            updated_at = now()
        where id = v_rec.id;
      else
        continue;
      end if;
    end if;
    perform public.fn_terapkan_hitung(v_rec.id);
  end loop;
  return v_form;
end;
$$;
revoke all on function public.fn_posisi_dari_setoran(int, int, int, int, text) from public, anon;
grant execute on function public.fn_posisi_dari_setoran(int, int, int, int, text) to authenticated, service_role;
revoke all on function public.fn_halaqah_pemilik(uuid, bigint, uuid) from public, anon, authenticated;
revoke all on function public.fn_hitung_rekap_santri(uuid, bigint) from public, anon, authenticated;
revoke all on function public.fn_terapkan_hitung(uuid) from public, anon, authenticated;
revoke all on function public.fn_siapkan_form(uuid, bigint) from public, anon, authenticated;

-- Validasi jawaban isian bebas / evaluasi kegiatan
create or replace function public.fn_bersihkan_jawaban(p_org uuid, p_scope text, p_new jsonb, p_old jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb := coalesce(p_old, '{}'::jsonb);
  v_key text;
  v_val jsonb;
  v_field public.period_form_fields%rowtype;
  v_txt text;
begin
  if p_new is null or jsonb_typeof(p_new) <> 'object' then return v_out; end if;
  for v_key, v_val in select * from jsonb_each(p_new) loop
    select * into v_field from public.period_form_fields
    where organization_id = p_org and id::text = v_key and scope = p_scope and system_key is null;
    if v_field.id is null then
      raise exception 'Isian "%" tidak dikenal. Muat ulang halaman.', v_key using errcode = '22023';
    end if;
    v_txt := case when jsonb_typeof(v_val) = 'string' then btrim(v_val #>> '{}') when jsonb_typeof(v_val) = 'null' then null else v_val::text end;
    if v_txt is null or v_txt = '' then
      v_out := v_out - v_key;
      continue;
    end if;
    if v_field.field_type = 'number' then
      if v_txt !~ '^-?[0-9]+([.,][0-9]+)?$' then
        raise exception 'Isian "%" harus berupa angka.', v_field.label using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_object(v_key, replace(v_txt, ',', '.')::numeric);
    elsif v_field.field_type = 'boolean' then
      if lower(v_txt) not in ('true', 'false', 'ya', 'tidak') then
        raise exception 'Isian "%" harus Ya atau Tidak.', v_field.label using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_object(v_key, lower(v_txt) in ('true', 'ya'));
    elsif v_field.field_type = 'choice' then
      if not exists (select 1 from jsonb_array_elements(v_field.options) o
                     where coalesce(o->>'label', o #>> '{}') = v_txt) then
        raise exception 'Pilihan "%" tidak tersedia untuk isian "%".', v_txt, v_field.label using errcode = '22023';
      end if;
      v_out := v_out || jsonb_build_object(v_key, v_txt);
    else
      v_out := v_out || jsonb_build_object(v_key, left(v_txt, 2000));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.fn_bersihkan_jawaban(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. RPC form evaluasi periode
-- ---------------------------------------------------------------------
create or replace function public.rpc_buka_form_periode(p_period uuid, p_halaqah bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_form public.period_forms%rowtype;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;
  if not public.fn_pegang_halaqah_periode(v_per.organization_id, p_halaqah, v_per.id) then
    raise exception 'Akses ditolak: Anda tidak memegang halaqah ini pada periode tersebut.' using errcode = '42501';
  end if;
  if v_per.needs_review then
    raise exception 'Tanggal periode "%" perlu dicek Admin dulu (hasil pemindahan data lama).', v_per.name using errcode = '22023';
  end if;
  v_form := public.fn_siapkan_form(v_per.id, p_halaqah);

  return jsonb_build_object(
    'period', to_jsonb(v_per),
    'form', to_jsonb(v_form),
    'recaps', coalesce((
      select jsonb_agg(to_jsonb(pr) || jsonb_build_object(
          'nama', s.nama, 'kode', s.kode, 'arah_hafalan', coalesce(s.arah_hafalan, 'mundur'),
          'sebelumnya', (
            select jsonb_build_object('period_id', pp.id, 'nama_periode', pp.name,
              'posisi_maju_surah', x.posisi_maju_surah, 'posisi_maju_ayah', x.posisi_maju_ayah,
              'posisi_mundur_surah', x.posisi_mundur_surah, 'posisi_mundur_ayah', x.posisi_mundur_ayah,
              'total_pages', x.total_pages, 'total_juz', x.total_juz)
            from public.period_recaps x join public.evaluation_periods pp on pp.id = x.period_id
            where x.organization_id = pr.organization_id and x.santri_id = pr.santri_id
              and pp.end_date < v_per.start_date and not pp.needs_review
            order by pp.end_date desc limit 1)
        ) order by s.nama)
      from public.period_recaps pr
      join public.santri s on s.id = pr.santri_id and s.organization_id = pr.organization_id
      where pr.form_id = v_form.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_simpan_form_periode(
  p_period uuid,
  p_halaqah bigint,
  p_rows jsonb,
  p_activity jsonb default null,
  p_kirim boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_form public.period_forms%rowtype;
  v_admin boolean;
  v_koreksi boolean;
  v_perlu_alasan boolean := false;
  v_item jsonb;
  v_sid bigint;
  r public.period_recaps%rowtype;
  n public.period_recaps%rowtype;
  v_over jsonb;
  v_count int := 0;
  v_kurang int;
  v_status text;
  v_max int;
  v_key text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;
  if not public.fn_pegang_halaqah_periode(v_per.organization_id, p_halaqah, v_per.id) then
    raise exception 'Akses ditolak: Anda tidak memegang halaqah ini pada periode tersebut.' using errcode = '42501';
  end if;
  if v_per.needs_review then
    raise exception 'Tanggal periode "%" perlu dicek Admin dulu.', v_per.name using errcode = '22023';
  end if;
  if p_rows is not null and jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Data rekap tidak valid.';
  end if;
  v_admin := coalesce(public.is_admin_of_org(v_per.organization_id), false);
  v_form := public.fn_siapkan_form(v_per.id, p_halaqah);
  if v_form.status = 'submitted' and not v_admin then
    raise exception 'Form periode ini sudah dikirim. Perbaikan dilakukan oleh Admin.' using errcode = '42501';
  end if;
  v_koreksi := v_form.status = 'submitted';

  for v_item in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_sid := nullif(v_item->>'santri_id', '')::bigint;
    select * into r from public.period_recaps where period_id = v_per.id and santri_id = v_sid and form_id = v_form.id;
    if r.id is null then
      raise exception 'Santri % tidak termasuk rekap halaqah ini pada periode tersebut.', coalesce(v_sid::text, '?');
    end if;
    n := r;
    v_over := r.overrides;
    if v_item ? 'reset_overrides' and (v_item->>'reset_overrides')::boolean then
      if not v_admin then raise exception 'Hanya Admin yang bisa mengembalikan isian ke hitungan otomatis.' using errcode = '42501'; end if;
      v_over := '{}'::jsonb;
      v_perlu_alasan := true;
    end if;

    -- Nilai isian sistem dari kiriman (hanya kunci yang dikirim)
    if v_item ? 'ziyadah_pages' then n.ziyadah_pages := nullif(v_item->>'ziyadah_pages', '')::numeric; end if;
    if v_item ? 'murojaah_pages' then n.murojaah_pages := nullif(v_item->>'murojaah_pages', '')::numeric; end if;
    if v_item ? 'posisi_maju_surah' or v_item ? 'posisi_mundur_surah' then
      n.posisi_maju_surah := nullif(v_item->>'posisi_maju_surah', '')::smallint;
      n.posisi_maju_ayah := nullif(v_item->>'posisi_maju_ayah', '')::smallint;
      n.posisi_mundur_surah := nullif(v_item->>'posisi_mundur_surah', '')::smallint;
      n.posisi_mundur_ayah := nullif(v_item->>'posisi_mundur_ayah', '')::smallint;
    end if;
    if v_item ? 'total_juz' then n.total_juz := nullif(v_item->>'total_juz', '')::numeric; n.total_pages := round(n.total_juz * 20, 2); end if;
    if v_item ? 'kelancaran' then n.kelancaran := nullif(btrim(v_item->>'kelancaran'), ''); end if;
    if v_item ? 'kehadiran_persen' then n.kehadiran_persen := nullif(v_item->>'kehadiran_persen', '')::numeric; end if;

    if coalesce(n.ziyadah_pages, 0) < 0 or coalesce(n.murojaah_pages, 0) < 0 then
      raise exception 'Ziyadah dan murojaah tidak boleh negatif.' using errcode = '22023';
    end if;
    if n.kehadiran_persen is not null and (n.kehadiran_persen < 0 or n.kehadiran_persen > 100) then
      raise exception 'Persentase kehadiran harus 0–100.' using errcode = '22023';
    end if;
    foreach v_key in array array['maju', 'mundur'] loop
      if (v_key = 'maju' and n.posisi_maju_surah is not null) or (v_key = 'mundur' and n.posisi_mundur_surah is not null) then
        select s.ayah_count into v_max from public.quran_surahs s
        where s.no = case when v_key = 'maju' then n.posisi_maju_surah else n.posisi_mundur_surah end;
        if v_max is null then raise exception 'Nomor surat posisi hafalan tidak valid.' using errcode = '22023'; end if;
        if coalesce(case when v_key = 'maju' then n.posisi_maju_ayah else n.posisi_mundur_ayah end, 0) < 1
           or coalesce(case when v_key = 'maju' then n.posisi_maju_ayah else n.posisi_mundur_ayah end, 0) > v_max then
          raise exception 'Ayat posisi hafalan harus 1–% untuk surat %.', v_max,
            case when v_key = 'maju' then n.posisi_maju_surah else n.posisi_mundur_surah end using errcode = '22023';
        end if;
      end if;
    end loop;
    if n.kelancaran is not null and not exists (
         select 1 from public.fluency_rules f where f.organization_id = v_per.organization_id and f.predicate = n.kelancaran) then
      raise exception 'Kelancaran "%" tidak ada di Tabel Kelancaran.', n.kelancaran using errcode = '22023';
    end if;

    if r.sumber = 'harian' then
      -- Mode Harian: isian sistem otomatis; hanya Admin yang boleh mengoreksi (beralasan)
      if n.ziyadah_pages is distinct from r.ziyadah_pages
         or n.murojaah_pages is distinct from r.murojaah_pages
         or n.posisi_maju_surah is distinct from r.posisi_maju_surah or n.posisi_maju_ayah is distinct from r.posisi_maju_ayah
         or n.posisi_mundur_surah is distinct from r.posisi_mundur_surah or n.posisi_mundur_ayah is distinct from r.posisi_mundur_ayah
         or (v_item ? 'total_juz' and n.total_juz is distinct from r.total_juz)
         or n.kelancaran is distinct from r.kelancaran
         or n.kehadiran_persen is distinct from r.kehadiran_persen then
        if not v_admin then
          raise exception 'Isian sistem Mode Harian terisi otomatis dari setoran & absensi harian. Perbaiki lewat setoran harian, atau minta Admin.' using errcode = '42501';
        end if;
        v_perlu_alasan := true;
        if n.ziyadah_pages is distinct from r.ziyadah_pages then v_over := v_over || '{"ziyadah": true}'; end if;
        if n.murojaah_pages is distinct from r.murojaah_pages then v_over := v_over || '{"murojaah": true}'; end if;
        if n.posisi_maju_surah is distinct from r.posisi_maju_surah or n.posisi_maju_ayah is distinct from r.posisi_maju_ayah
           or n.posisi_mundur_surah is distinct from r.posisi_mundur_surah or n.posisi_mundur_ayah is distinct from r.posisi_mundur_ayah
           or (v_item ? 'total_juz' and n.total_juz is distinct from r.total_juz) then
          v_over := v_over || '{"posisi": true}';
        end if;
        if n.kelancaran is distinct from r.kelancaran then v_over := v_over || '{"kelancaran": true}'; end if;
        if n.kehadiran_persen is distinct from r.kehadiran_persen then v_over := v_over || '{"kehadiran": true}'; end if;
      end if;
    else
      -- Kehadiran Mode Rekap dikosongkan = pakai hitungan otomatis (nilai otomatis tidak ikut terhapus)
      if v_item ? 'kehadiran_persen' and n.kehadiran_persen is null and not (r.overrides ? 'kehadiran') then
        n.kehadiran_persen := r.kehadiran_persen;
      end if;
      if v_koreksi and (n.ziyadah_pages is distinct from r.ziyadah_pages or n.murojaah_pages is distinct from r.murojaah_pages
         or n.kelancaran is distinct from r.kelancaran or n.posisi_maju_surah is distinct from r.posisi_maju_surah
         or n.posisi_maju_ayah is distinct from r.posisi_maju_ayah or n.posisi_mundur_surah is distinct from r.posisi_mundur_surah
         or n.posisi_mundur_ayah is distinct from r.posisi_mundur_ayah or n.kehadiran_persen is distinct from r.kehadiran_persen) then
        v_perlu_alasan := true;
      end if;
      -- Kehadiran Mode Rekap: kosongkan = otomatis dari absensi, isi = manual
      if v_item ? 'kehadiran_persen' then
        if n.kehadiran_persen is null then
          v_over := v_over - 'kehadiran';
        elsif n.kehadiran_persen is distinct from r.kehadiran_persen then
          v_over := v_over || '{"kehadiran": true}';
          n.hadir_count := null; n.kehadiran_total := null;
        end if;
      end if;
    end if;

    -- Total hafalan dari posisi
    if (n.posisi_maju_surah is not null or n.posisi_mundur_surah is not null)
       and (n.posisi_maju_surah is distinct from r.posisi_maju_surah or n.posisi_maju_ayah is distinct from r.posisi_maju_ayah
            or n.posisi_mundur_surah is distinct from r.posisi_mundur_surah or n.posisi_mundur_ayah is distinct from r.posisi_mundur_ayah
            or r.total_pages is null) then
      select t.halaman, t.juz into n.total_pages, n.total_juz
      from public.fn_total_hafalan(n.posisi_maju_surah, n.posisi_maju_ayah, n.posisi_mundur_surah, n.posisi_mundur_ayah) t;
    end if;

    if v_item ? 'free_answers' then
      n.free_answers := public.fn_bersihkan_jawaban(v_per.organization_id, 'santri', v_item->'free_answers', r.free_answers);
      if v_koreksi and n.free_answers is distinct from r.free_answers then v_perlu_alasan := true; end if;
    end if;
    if v_item ? 'notes' then
      n.notes := nullif(btrim(v_item->>'notes'), '');
      if v_koreksi and n.notes is distinct from r.notes then v_perlu_alasan := true; end if;
    end if;

    update public.period_recaps set
      ziyadah_pages = n.ziyadah_pages, murojaah_pages = n.murojaah_pages,
      posisi_maju_surah = n.posisi_maju_surah, posisi_maju_ayah = n.posisi_maju_ayah,
      posisi_mundur_surah = n.posisi_mundur_surah, posisi_mundur_ayah = n.posisi_mundur_ayah,
      total_pages = n.total_pages, total_juz = n.total_juz,
      kelancaran = n.kelancaran,
      hadir_count = n.hadir_count, kehadiran_total = n.kehadiran_total, kehadiran_persen = n.kehadiran_persen,
      free_answers = n.free_answers, notes = n.notes, overrides = v_over,
      updated_by = auth.uid(), updated_at = now()
    where id = r.id;
    -- Kunci override dicabut → isi lagi dari hitungan otomatis
    if v_over is distinct from r.overrides then
      perform public.fn_terapkan_hitung(r.id);
    end if;
    v_count := v_count + 1;
  end loop;

  if p_activity is not null then
    update public.period_forms
    set activity_answers = public.fn_bersihkan_jawaban(v_per.organization_id, 'kegiatan', p_activity, activity_answers)
    where id = v_form.id and activity_answers is distinct from
      public.fn_bersihkan_jawaban(v_per.organization_id, 'kegiatan', p_activity, activity_answers);
    if found and v_koreksi then v_perlu_alasan := true; end if;
  end if;

  if v_perlu_alasan and not public.fn_alasan_valid(p_reason) then
    raise exception 'Koreksi rekap periode wajib menyertakan alasan yang jelas (minimal 5 karakter).' using errcode = '22023';
  end if;

  if p_kirim and v_form.status <> 'submitted' then
    select count(*) into v_kurang from public.period_recaps
    where form_id = v_form.id and sumber <> 'harian'
      and (ziyadah_pages is null or murojaah_pages is null or kelancaran is null
           or (posisi_maju_surah is null and posisi_mundur_surah is null and total_pages is null));
    if v_kurang > 0 then
      raise exception 'Belum bisa dikirim: % santri belum lengkap isian sistemnya (ziyadah, murojaah, posisi hafalan, kelancaran).', v_kurang
        using errcode = '22023';
    end if;
    v_status := 'submitted';
  elsif v_form.status = 'belum_diisi' then
    v_status := 'draft';
  else
    v_status := v_form.status;
  end if;

  update public.period_forms set
    status = v_status,
    submitted_at = case when v_status = 'submitted' and v_form.status <> 'submitted' then now() else submitted_at end,
    submitted_by = case when v_status = 'submitted' and v_form.status <> 'submitted' then auth.uid() else submitted_by end,
    updated_by = auth.uid(), updated_at = now()
  where id = v_form.id;

  if v_perlu_alasan or v_koreksi or (v_status = 'submitted' and v_form.status <> 'submitted') then
    insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
    values (v_per.organization_id, auth.uid(), public.get_role_for_org(v_per.organization_id),
      case when v_koreksi or v_perlu_alasan then 'correct_period_form' else 'submit_period_form' end,
      'period_forms', v_form.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
      jsonb_build_object('period_id', v_per.id, 'halaqah_id', p_halaqah, 'status', v_status, 'rows', v_count));
  end if;

  return jsonb_build_object('form_id', v_form.id, 'status', v_status, 'updated_count', v_count);
end;
$$;

create or replace function public.rpc_buka_kembali_form_periode(p_form uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.period_forms%rowtype;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_form from public.period_forms where id = p_form;
  if v_form.id is null then raise exception 'Form periode tidak ditemukan.'; end if;
  if not public.is_admin_of_org(v_form.organization_id) then
    raise exception 'Akses ditolak: hanya Admin yang bisa membuka kembali form.' using errcode = '42501';
  end if;
  if not public.fn_alasan_valid(p_reason) then
    raise exception 'Membuka kembali form wajib menyertakan alasan yang jelas (minimal 5 karakter).' using errcode = '22023';
  end if;
  if v_form.status <> 'submitted' then
    return jsonb_build_object('form_id', v_form.id, 'status', v_form.status);
  end if;
  update public.period_forms set status = 'draft', updated_by = auth.uid(), updated_at = now() where id = p_form;
  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_form.organization_id, auth.uid(), public.get_role_for_org(v_form.organization_id), 'reopen_period_form',
          'period_forms', v_form.id::text, btrim(p_reason),
          jsonb_build_object('period_id', v_form.period_id, 'halaqah_id', v_form.halaqah_id));
  return jsonb_build_object('form_id', v_form.id, 'status', 'draft');
end;
$$;

create or replace function public.rpc_hitung_rekap_harian(p_period uuid, p_halaqah bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_h bigint;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;
  if v_per.needs_review then
    raise exception 'Tanggal periode "%" perlu dicek Admin dulu.', v_per.name using errcode = '22023';
  end if;
  if p_halaqah is null then
    if not public.is_admin_of_org(v_per.organization_id) then
      raise exception 'Akses ditolak: hanya Admin yang bisa menghitung semua halaqah.' using errcode = '42501';
    end if;
    for v_h in
      select h.id from public.halaqah h
      where h.organization_id = v_per.organization_id and coalesce(h.is_active, true) and not coalesce(h.is_archived, false)
      union select f.halaqah_id from public.period_forms f where f.period_id = v_per.id
    loop
      perform public.fn_siapkan_form(v_per.id, v_h);
      v_n := v_n + 1;
    end loop;
  else
    if not public.fn_pegang_halaqah_periode(v_per.organization_id, p_halaqah, v_per.id) then
      raise exception 'Akses ditolak: Anda tidak memegang halaqah ini pada periode tersebut.' using errcode = '42501';
    end if;
    perform public.fn_siapkan_form(v_per.id, p_halaqah);
    v_n := 1;
  end if;
  return jsonb_build_object('halaqah_count', v_n,
    'recap_count', (select count(*) from public.period_recaps where period_id = v_per.id));
end;
$$;

-- Pemantauan Periode: status pengisian semua halaqah (Admin) / halaqah sendiri (Musammi'')
create or replace function public.rpc_status_periode(p_period uuid)
returns table (
  halaqah_id bigint, halaqah_nama text, marhalah text, musammi_nama text,
  recording_mode text, status text, form_id uuid,
  jumlah_santri integer, terisi integer, submitted_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_per public.evaluation_periods%rowtype;
  v_admin boolean;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;
  if public.get_role_for_org(v_per.organization_id) is null then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  v_admin := coalesce(public.is_admin_of_org(v_per.organization_id), false);
  return query
  with hs as (
    select h.* from public.halaqah h
    where h.organization_id = v_per.organization_id
      and ((coalesce(h.is_active, true) and not coalesce(h.is_archived, false))
           or exists (select 1 from public.period_forms f where f.period_id = v_per.id and f.halaqah_id = h.id))
  )
  select hs.id, hs.nama,
         coalesce(mm.nama, hs.marhalah),
         ms.nama,
         coalesce(f.recording_mode, hs.recording_mode),
         coalesce(f.status, 'belum_diisi'),
         f.id,
         case when f.id is not null then (select count(*)::int from public.period_recaps pr where pr.form_id = f.id)
              else (select count(distinct m.student_id)::int from public.halaqah_student_memberships m
                    where m.organization_id = v_per.organization_id and m.halaqah_id = hs.id
                      and m.valid_from <= least(v_per.end_date, greatest(v_per.start_date, public.fn_hari_ini_lembaga(v_per.organization_id)))
                      and (m.valid_to is null or m.valid_to >= least(v_per.end_date, greatest(v_per.start_date, public.fn_hari_ini_lembaga(v_per.organization_id))))) end,
         case when f.id is null then 0
              else (select count(*)::int from public.period_recaps pr where pr.form_id = f.id
                    and (pr.sumber = 'harian' or (pr.ziyadah_pages is not null and pr.murojaah_pages is not null and pr.kelancaran is not null
                         and (pr.posisi_maju_surah is not null or pr.posisi_mundur_surah is not null or pr.total_pages is not null)))) end,
         f.submitted_at, f.updated_at
  from hs
  left join public.period_forms f on f.period_id = v_per.id and f.halaqah_id = hs.id
  left join public.master_marhalah mm on mm.id = hs.marhalah_id
  left join public.musammi ms on ms.id = hs.musammi_id and ms.organization_id = hs.organization_id
  where v_admin or public.fn_pegang_halaqah_periode(v_per.organization_id, hs.id, v_per.id)
  order by coalesce(hs.no_urut, 999), hs.nama;
end;
$$;

create or replace function public.rpc_hapus_periode(p_period uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_n int;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;
  if not public.is_admin_of_org(v_per.organization_id) then
    raise exception 'Akses ditolak: hanya Admin.' using errcode = '42501';
  end if;
  select count(*) into v_n from public.period_recaps where period_id = p_period;
  if v_n > 0 and not public.fn_alasan_valid(p_reason) then
    raise exception 'Periode ini sudah berisi % rekap santri. Menghapusnya wajib menyertakan alasan (minimal 5 karakter).', v_n
      using errcode = '22023';
  end if;
  perform set_config('app.hapus_periode', p_period::text, true);
  delete from public.evaluation_periods where id = p_period;
  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state)
  values (v_per.organization_id, auth.uid(), public.get_role_for_org(v_per.organization_id), 'delete_evaluation_period',
          'evaluation_periods', v_per.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
          to_jsonb(v_per) || jsonb_build_object('recap_count', v_n));
end;
$$;

-- Hapus periode langsung dari tabel hanya bila belum berisi rekap (selain lewat rpc_hapus_periode)
create or replace function public.fn_jaga_hapus_periode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.hapus_periode', true), '') = old.id::text or public.fn_is_legacy_migration()
     or pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.period_recaps where period_id = old.id) then
    raise exception 'Periode "%" sudah berisi rekap santri. Hapus lewat Pengaturan Evaluasi dengan alasan.', old.name
      using errcode = '22023';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_jaga_hapus_periode on public.evaluation_periods;
create trigger trg_jaga_hapus_periode before delete on public.evaluation_periods
  for each row execute function public.fn_jaga_hapus_periode();

-- Mode pencatatan halaqah (Admin). Mode periode yang sedang berjalan dibekukan lebih dulu.
create or replace function public.fn_bekukan_mode_halaqah()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recording_mode is distinct from old.recording_mode then
    insert into public.period_forms (organization_id, period_id, halaqah_id, recording_mode)
    select old.organization_id, p.id, old.id, old.recording_mode
    from public.evaluation_periods p
    where p.organization_id = old.organization_id and not p.needs_review
      and p.start_date <= public.fn_hari_ini_lembaga(old.organization_id)
      and p.end_date >= public.fn_hari_ini_lembaga(old.organization_id)
    on conflict (period_id, halaqah_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bekukan_mode_halaqah on public.halaqah;
create trigger trg_bekukan_mode_halaqah before update of recording_mode on public.halaqah
  for each row execute function public.fn_bekukan_mode_halaqah();

create or replace function public.rpc_set_mode_halaqah(p_halaqah bigint, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h public.halaqah%rowtype;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_h from public.halaqah where id = p_halaqah;
  if v_h.id is null then raise exception 'Halaqah tidak ditemukan.'; end if;
  if not public.is_admin_of_org(v_h.organization_id) then
    raise exception 'Akses ditolak: hanya Admin yang bisa mengubah mode pencatatan.' using errcode = '42501';
  end if;
  if p_mode not in ('harian', 'rekap') then
    raise exception 'Mode pencatatan harus "harian" atau "rekap".' using errcode = '22023';
  end if;
  update public.halaqah set recording_mode = p_mode where id = p_halaqah;
  if v_h.recording_mode is distinct from p_mode then
    insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, before_state, after_state)
    values (v_h.organization_id, auth.uid(), public.get_role_for_org(v_h.organization_id), 'set_recording_mode',
            'halaqah', v_h.id::text, jsonb_build_object('recording_mode', v_h.recording_mode), jsonb_build_object('recording_mode', p_mode));
  end if;
  return jsonb_build_object('halaqah_id', p_halaqah, 'recording_mode', p_mode,
    'berlaku', 'mulai periode berikutnya (periode berjalan tetap memakai mode sebelumnya)');
end;
$$;

revoke all on function public.rpc_buka_form_periode(uuid, bigint) from public, anon;
revoke all on function public.rpc_simpan_form_periode(uuid, bigint, jsonb, jsonb, boolean, text) from public, anon;
revoke all on function public.rpc_buka_kembali_form_periode(uuid, text) from public, anon;
revoke all on function public.rpc_hitung_rekap_harian(uuid, bigint) from public, anon;
revoke all on function public.rpc_status_periode(uuid) from public, anon;
revoke all on function public.rpc_hapus_periode(uuid, text) from public, anon;
revoke all on function public.rpc_set_mode_halaqah(bigint, text) from public, anon;
grant execute on function public.rpc_buka_form_periode(uuid, bigint) to authenticated, service_role;
grant execute on function public.rpc_simpan_form_periode(uuid, bigint, jsonb, jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.rpc_buka_kembali_form_periode(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_hitung_rekap_harian(uuid, bigint) to authenticated, service_role;
grant execute on function public.rpc_status_periode(uuid) to authenticated, service_role;
grant execute on function public.rpc_hapus_periode(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_set_mode_halaqah(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Trigger: rekap ikut data harian; setoran ke periode terkirim dijaga
-- ---------------------------------------------------------------------
create or replace function public.fn_rekap_ikut_setoran()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_santri bigint; v_date date; v_id uuid;
begin
  if public.fn_is_legacy_migration() then return null; end if;
  for v_org, v_santri, v_date in
    select new.organization_id, new.santri_id, new.recitation_date where tg_op <> 'DELETE'
    union
    select old.organization_id, old.santri_id, old.recitation_date where tg_op <> 'INSERT'
  loop
    -- Periode tanggal itu dan sesudahnya (posisi hafalan terbawa ke periode berikutnya)
    for v_id in
      select pr.id from public.period_recaps pr join public.evaluation_periods p on p.id = pr.period_id
      where pr.organization_id = v_org and pr.santri_id = v_santri and pr.sumber = 'harian' and p.end_date >= v_date
    loop
      perform public.fn_terapkan_hitung(v_id);
    end loop;
  end loop;
  return null;
end;
$$;
drop trigger if exists trg_rekap_dari_setoran on public.recitation_entries;
create trigger trg_rekap_dari_setoran after insert or update or delete on public.recitation_entries
  for each row execute function public.fn_rekap_ikut_setoran();

create or replace function public.fn_rekap_ikut_absensi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_santri bigint; v_date date; v_id uuid;
begin
  if public.fn_is_legacy_migration() then return null; end if;
  for v_org, v_santri, v_date in
    select new.organization_id, new.santri_id, new.attendance_date where tg_op <> 'DELETE'
    union
    select old.organization_id, old.santri_id, old.attendance_date where tg_op <> 'INSERT'
  loop
    for v_id in
      select pr.id from public.period_recaps pr join public.evaluation_periods p on p.id = pr.period_id
      where pr.organization_id = v_org and pr.santri_id = v_santri and pr.sumber in ('harian', 'rekap')
        and v_date between p.start_date and p.end_date and not (pr.overrides ? 'kehadiran')
    loop
      perform public.fn_terapkan_hitung(v_id);
    end loop;
  end loop;
  return null;
end;
$$;
drop trigger if exists trg_rekap_dari_absensi on public.attendance_records;
create trigger trg_rekap_dari_absensi after insert or update or delete on public.attendance_records
  for each row execute function public.fn_rekap_ikut_absensi();

-- Setoran bertanggal mundur boleh ditambah selama periode belum dikirim (Admin tetap boleh)
create or replace function public.fn_jaga_setoran_periode_terkirim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null or public.fn_is_legacy_migration() or public.is_admin_of_org(new.organization_id) then
    return new;
  end if;
  select p.name into v_name
  from public.evaluation_periods p
  join public.period_forms f on f.period_id = p.id and f.halaqah_id = new.halaqah_id and f.status = 'submitted'
  where p.organization_id = new.organization_id and not p.needs_review
    and new.recitation_date between p.start_date and p.end_date
  limit 1;
  if v_name is not null then
    raise exception 'Rekap periode "%" untuk halaqah ini sudah dikirim. Setoran tanggal % hanya bisa ditambah atau diubah oleh Admin.',
      v_name, to_char(new.recitation_date, 'DD-MM-YYYY') using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_jaga_setoran_periode_terkirim on public.recitation_entries;
create trigger trg_jaga_setoran_periode_terkirim before insert or update on public.recitation_entries
  for each row execute function public.fn_jaga_setoran_periode_terkirim();

revoke all on function public.fn_rekap_ikut_setoran() from public, anon, authenticated;
revoke all on function public.fn_rekap_ikut_absensi() from public, anon, authenticated;
revoke all on function public.fn_jaga_setoran_periode_terkirim() from public, anon, authenticated;

commit;
