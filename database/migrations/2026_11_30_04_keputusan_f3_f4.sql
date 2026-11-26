-- =====================================================================
-- 2026_11_30_04_keputusan_f3_f4.sql
-- Keputusan pemilik (26-11-2026) untuk aturan Fase 3 & 4
--
-- Tujuan:
--   1. Arah hafalan bawaan santri BARU = 'maju'; nilai baru 'dua_arah' untuk santri yang menghafal
--      dari depan dan dari belakang sekaligus. Ziyadah santri dua arah otomatis menambah sisi yang
--      paling dekat dengan posisinya (fn_sisi_setoran). Santri yang sudah ada tidak diubah.
--   2. Kehadiran di Rekap Periode SELALU dari absensi (Mode Harian & Mode Rekap); tidak bisa diisi
--      manual. Isian manual lama dikembalikan ke hitungan absensi.
--   3. Koreksi setoran: musammi' yang boleh mencatat halaqah setoran itu juga bisa mengoreksi;
--      alasan opsional (riwayat revisi & log audit tetap tercatat). Pembatalan tetap Admin.
--      Setoran di periode yang formnya sudah dikirim tetap hanya Admin (trigger Fase 4).
--
-- Prasyarat: 2026_11_29_02_f4_hitung_rekap.sql
-- Rollback: jalankan ulang fungsi dari 2026_11_28_02 (rpc_submit_recitation_entry,
--   fn_validate_recitation_state_machine) dan 2026_11_29_02
--   (fn_hitung_rekap_santri, fn_terapkan_hitung, rpc_simpan_form_periode);
--   update public.santri set arah_hafalan = 'mundur' where arah_hafalan = 'dua_arah';
--   alter table public.santri alter column arah_hafalan set default 'mundur';
--   alter table public.santri drop constraint santri_arah_hafalan_check;
--   alter table public.santri add constraint santri_arah_hafalan_check check (arah_hafalan in ('maju', 'mundur'));
--   drop function if exists public.fn_sisi_setoran(int, int, int, int);
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Arah hafalan
-- ---------------------------------------------------------------------
alter table public.santri alter column arah_hafalan set default 'maju';
alter table public.santri drop constraint if exists santri_arah_hafalan_check;
alter table public.santri add constraint santri_arah_hafalan_check check (arah_hafalan in ('maju', 'mundur', 'dua_arah'));
comment on column public.santri.arah_hafalan is
  'maju = depan ke belakang (Al-Fatihah dulu); mundur = belakang ke depan (Juz 30 dulu); dua_arah = dari depan dan belakang, ziyadah menambah sisi terdekat.';

-- Sisi yang ditambah sebuah ziyadah santri dua arah: sisi depan (maju) bila awal setoran lebih
-- dekat ke ujung hafalan depan daripada akhir setoran ke ujung hafalan belakang; selain itu sisi
-- belakang (mundur). Sama dengan sisiSetoran() di lib/arahHafalan.ts.
-- p_ms = surat posisi depan (null = belum ada), p_us = surat posisi belakang (null = belum ada).
create or replace function public.fn_sisi_setoran(p_s1 int, p_s2 int, p_ms int, p_us int)
returns text
language sql
immutable
as $$
  select case
    when abs(coalesce(p_s1, 1) - coalesce(p_ms, 1)) <= abs(coalesce(p_us, 114) - coalesce(p_s2, p_s1, 114)) then 'maju'
    else 'mundur'
  end;
$$;
grant execute on function public.fn_sisi_setoran(int, int, int, int) to authenticated, service_role;

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
  v_z_row record;
  v_sisi text;
  v_hadir int; v_jml int;
begin
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then return null; end if;
  select coalesce(arah_hafalan, 'maju') into v_arah from public.santri
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

  if v_arah = 'dua_arah' then
    -- Dua arah: tiap ziyadah (urut tanggal) menambah sisi yang paling dekat (fn_sisi_setoran)
    for v_z_row in
      select r.surah_start_no, r.ayah_start, r.surah_end_no, r.ayah_end
      from public.recitation_entries r
      join public.recitation_kinds k on k.organization_id = r.organization_id and k.code = r.kind and k.adds_memorization
      where r.organization_id = v_per.organization_id and r.santri_id = p_santri and r.status = 'accepted'
        and not coalesce(r.is_repeat, false) and r.recitation_date <= v_per.end_date
        and (v_prev.end_date is null or r.recitation_date > v_prev.end_date)
        and r.surah_start_no is not null and r.surah_end_no is not null
      order by r.recitation_date, r.created_at
    loop
      v_sisi := public.fn_sisi_setoran(v_z_row.surah_start_no, v_z_row.surah_end_no, v_ms, v_us);
      v_pos := public.fn_posisi_dari_setoran(v_z_row.surah_start_no, v_z_row.ayah_start, v_z_row.surah_end_no, v_z_row.ayah_end, v_sisi);
      if v_sisi = 'maju' then v_ms := v_pos[1]; v_ma := v_pos[2];
      else v_us := v_pos[1]; v_ua := v_pos[2]; end if;
    end loop;
  elsif v_last.recitation_date is not null and (v_prev.end_date is null or v_last.recitation_date > v_prev.end_date) then
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


-- ---------------------------------------------------------------------
-- 2. Kehadiran rekap selalu dari absensi
-- ---------------------------------------------------------------------
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
      hadir_count = (v->>'hadir_count')::int,
      kehadiran_total = (v->>'kehadiran_total')::int,
      kehadiran_persen = (v->>'kehadiran_persen')::numeric,
      computed_at = now()
    where id = r.id;
  else
    -- Mode Rekap: kehadiran selalu dari absensi (tidak bisa diisi manual)
    update public.period_recaps set
      hadir_count = (v->>'hadir_count')::int,
      kehadiran_total = (v->>'kehadiran_total')::int,
      kehadiran_persen = (v->>'kehadiran_persen')::numeric,
      computed_at = now()
    where id = r.id;
  end if;
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
    -- Kehadiran selalu dihitung dari absensi (keputusan 26-11-2026): tidak bisa diisi manual
    if v_item ? 'kehadiran_persen' and nullif(v_item->>'kehadiran_persen', '') is not null
       and nullif(v_item->>'kehadiran_persen', '')::numeric is distinct from r.kehadiran_persen then
      raise exception 'Kehadiran dihitung otomatis dari absensi dan tidak bisa diisi manual. Perbaiki lewat menu Absensi.' using errcode = '22023';
    end if;

    if coalesce(n.ziyadah_pages, 0) < 0 or coalesce(n.murojaah_pages, 0) < 0 then
      raise exception 'Ziyadah dan murojaah tidak boleh negatif.' using errcode = '22023';
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
         or n.kelancaran is distinct from r.kelancaran then
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
      end if;
    else
      if v_koreksi and (n.ziyadah_pages is distinct from r.ziyadah_pages or n.murojaah_pages is distinct from r.murojaah_pages
         or n.kelancaran is distinct from r.kelancaran or n.posisi_maju_surah is distinct from r.posisi_maju_surah
         or n.posisi_maju_ayah is distinct from r.posisi_maju_ayah or n.posisi_mundur_surah is distinct from r.posisi_mundur_surah
         or n.posisi_mundur_ayah is distinct from r.posisi_mundur_ayah) then
        v_perlu_alasan := true;
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


-- Isian kehadiran manual lama dikembalikan ke hitungan absensi
do $$
declare v_id uuid;
begin
  for v_id in select id from public.period_recaps where overrides ? 'kehadiran' loop
    update public.period_recaps set overrides = overrides - 'kehadiran' where id = v_id;
    perform public.fn_terapkan_hitung(v_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Koreksi setoran oleh musammi'
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

  -- Pembatalan: hanya Admin + alasan
  if new.status = 'voided' and old.status is distinct from 'voided' then
    if not coalesce(public.is_admin_of_org(old.organization_id), false) then
      raise exception 'Pembatalan setoran hanya oleh Admin.' using errcode = '42501';
    end if;
    if not public.fn_alasan_valid(new.review_reason, 5) then
      raise exception 'Alasan pembatalan wajib diisi dengan jelas (minimal 5 karakter).';
    end if;
  elsif v_content_changed then
    -- Koreksi isi (keputusan 26-11-2026): Admin, atau musammi' yang boleh mencatat halaqah setoran
    -- itu pada tanggal lama DAN tanggal/halaqah barunya; alasan opsional.
    if not coalesce(public.is_admin_of_org(old.organization_id), false)
       and not (public.fn_bisa_mencatat(old.organization_id, old.halaqah_id, old.recitation_date)
                and public.fn_bisa_mencatat(new.organization_id, new.halaqah_id, new.recitation_date)) then
      raise exception 'Koreksi setoran hanya oleh Admin atau musammi'' halaqah tersebut.' using errcode = '42501';
    end if;
  end if;

  if new.status not in ('accepted', 'voided') then
    raise exception 'Status setoran tidak sah: %', new.status;
  end if;
  return new;
end;
$$;


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
    -- Koreksi (keputusan 26-11-2026): Admin atau musammi' yang boleh mencatat halaqah setoran itu
    -- pada tanggalnya; alasan opsional. Tetap tercatat di riwayat revisi & log audit.
    select * into v_existing from public.recitation_entries where id = p_existing_entry_id and organization_id = v_org;
    if v_existing.id is null then
      raise exception 'Catatan setoran dengan ID % tidak ditemukan.', p_existing_entry_id;
    end if;
    if not v_is_admin and not public.fn_bisa_mencatat(v_org, v_existing.halaqah_id, v_existing.recitation_date) then
      raise exception 'Akses ditolak: setoran ini bukan dari halaqah yang Anda pegang pada tanggal tersebut.' using errcode = '42501';
    end if;
    if v_existing.status = 'voided' then
      raise exception 'Setoran yang telah dibatalkan tidak dapat diubah.';
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
        review_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Koreksi setoran'),
        reviewed_by = v_caller,
        reviewed_at = now(),
        revision_no = v_rev
    where id = v_existing.id;

    insert into public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
    ) values (
      v_org, v_existing.id, v_existing.id, v_rev, 'correct', v_existing.status, v_existing.status, coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Koreksi setoran'),
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
revoke all on function public.fn_hitung_rekap_santri(uuid, bigint) from public, anon, authenticated;
revoke all on function public.fn_terapkan_hitung(uuid) from public, anon, authenticated;
revoke all on function public.rpc_simpan_form_periode(uuid, bigint, jsonb, jsonb, boolean, text) from public, anon;
grant execute on function public.rpc_simpan_form_periode(uuid, bigint, jsonb, jsonb, boolean, text) to authenticated, service_role;

commit;
