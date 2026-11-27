-- =====================================================================
-- 2026_12_01_02_f6_telegram_fungsi.sql
-- Fase 6 · Telegram & laporan otomatis — penautan, antrian, pemicu, jadwal
--
-- Tujuan:
--   1. Penautan wali (dipanggil webhook dengan service role): fn_tautkan_telegram (kode acak →
--      chat tertaut, balasan berisi nama ananda; maks. 5 kode salah per jam per chat),
--      fn_telegram_anak (/anak), fn_telegram_berhenti (/berhenti).
--   2. Antrian: fn_antrikan (hanya bila santri tertaut & token bot aktif; dedup), fn_antrian_ambil
--      (kunci baris, aman dijalankan bersamaan), fn_antrian_selesai (retry 1–2–4–8 menit, maks. 5x).
--   3. Pemicu otomatis:
--        setoran baru (Mode Harian)              → pesan setoran;
--        form periode berubah menjadi Terkirim   → pesan progres per santri;
--        rpc_proses_jadwal_telegram (tiap menit) → kehadiran mingguan pada hari & jam lembaga.
--   4. RPC Admin: buat ulang kode, putuskan tautan, kirim kehadiran minggu ini, kirim progres
--      periode (ulang), pesan uji, ulangi/batalkan antrian.
--
-- Prasyarat: 2026_12_01_01_f6_telegram_struktur.sql
-- Rollback: drop trigger trg_antrian_setoran on public.recitation_entries;
--   drop trigger trg_antrian_progres_periode on public.period_forms; drop fungsi-fungsi di file ini.
-- =====================================================================

begin;

-- Pengaman urutan: file ini butuh tabel dari 2026_12_01_01
do $$
begin
  if to_regclass('public.telegram_settings') is null or to_regclass('public.notification_queue') is null then
    raise exception 'Jalankan dulu 2026_12_01_01_f6_telegram_struktur.sql, lalu jalankan ulang file ini.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Fungsi bantu teks
-- ---------------------------------------------------------------------
create or replace function public.fn_tanggal_id(p date)
returns text
language sql
immutable
as $$
  select case when p is null then '-' else
    extract(day from p)::int || ' ' ||
    (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])[extract(month from p)::int]
    || ' ' || extract(year from p)::int end;
$$;

-- 12.50 → "12,5"; 2.00 → "2"
create or replace function public.fn_angka_id(p numeric)
returns text
language sql
immutable
as $$
  select case when p is null then '-' else
    replace(rtrim(rtrim(to_char(round(p, 2), 'FM9999999990.00'), '0'), '.'), '.', ',') end;
$$;

create or replace function public.fn_teks_surat(p_s1 int, p_a1 int, p_s2 int, p_a2 int)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_s1 is null then '-'
    when p_s1 = coalesce(p_s2, p_s1) then
      (select name from public.quran_surahs where no = p_s1) || ' ' || coalesce(p_a1, 1) || '–' || coalesce(p_a2, p_a1, 1)
    else (select name from public.quran_surahs where no = p_s1) || ' ' || coalesce(p_a1, 1) || ' – '
      || (select name from public.quran_surahs where no = p_s2) || ' ' || coalesce(p_a2, 1)
  end;
$$;

create or replace function public.fn_teks_posisi(p_ms int, p_ma int, p_us int, p_ua int)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(concat_ws('; ',
    case when p_ms is not null then 'depan sampai ' || (select name from public.quran_surahs where no = p_ms) || ' ' || coalesce(p_ma, 1) end,
    case when p_us is not null then 'belakang sampai ' || (select name from public.quran_surahs where no = p_us) || ' ' || coalesce(p_ua, 1) end
  ), ''), '-');
$$;

-- Bot Telegram lembaga siap (token aktif tersimpan di server)
create or replace function public.fn_telegram_siap(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.integration_secrets s
    where s.organization_id = p_org and s.secret_key_name = 'TELEGRAM_BOT_TOKEN' and s.status = 'active'
      and coalesce(btrim(s.secret_value), '') <> '' and s.secret_value not like '%••%' and s.secret_value not like '%**%');
$$;
revoke all on function public.fn_telegram_siap(uuid) from public, anon, authenticated;
grant execute on function public.fn_telegram_siap(uuid) to service_role;

-- Status untuk layar (anggota lembaga): bot siap & jumlah wali tertaut
create or replace function public.rpc_status_telegram()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_my_org_id();
begin
  if auth.uid() is null or v_org is null or public.get_role_for_org(v_org) is null then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return jsonb_build_object('siap', public.fn_telegram_siap(v_org),
    'tertaut', (select count(*) from public.santri where organization_id = v_org and telegram_chat_id is not null),
    'santri_aktif', (select count(*) from public.santri where organization_id = v_org and coalesce(status, 'active') = 'active'));
end;
$$;
revoke all on function public.rpc_status_telegram() from public, anon;
grant execute on function public.rpc_status_telegram() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Masuk antrian
-- ---------------------------------------------------------------------
create or replace function public.fn_antrikan(p_org uuid, p_santri bigint, p_jenis text, p_pesan text, p_dedup text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat text;
begin
  select nullif(btrim(coalesce(s.telegram_chat_id, '')), '') into v_chat
  from public.santri s where s.id = p_santri and s.organization_id = p_org;
  if v_chat is null or not public.fn_telegram_siap(p_org) or nullif(btrim(coalesce(p_pesan, '')), '') is null then
    return false;
  end if;
  insert into public.notification_queue (organization_id, santri_id, chat_id, jenis, pesan, dedup_key)
  values (p_org, p_santri, v_chat, p_jenis, left(btrim(p_pesan), 4000), p_dedup)
  on conflict (organization_id, dedup_key) do nothing;
  return found;
end;
$$;
revoke all on function public.fn_antrikan(uuid, bigint, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Pesan setoran (Mode Harian)
-- ---------------------------------------------------------------------
create or replace function public.fn_antrian_setoran()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.telegram_settings%rowtype;
  v_mode text;
  v_hnama text;
  v_jenis text;
  v_vars jsonb;
  v_lembaga text;
  v_nama text;
begin
  if new.status <> 'accepted' or public.fn_is_legacy_migration() then return new; end if;
  begin
    select * into v_set from public.telegram_settings where organization_id = new.organization_id;
    if not coalesce(v_set.setoran_aktif, false) then return new; end if;
    select h.recording_mode, h.nama into v_mode, v_hnama from public.halaqah h where h.id = new.halaqah_id;
    if coalesce(v_mode, 'harian') = 'rekap' then return new; end if;   -- Mode Rekap: tidak per setoran
    select k.name into v_jenis from public.recitation_kinds k where k.organization_id = new.organization_id and k.code = new.kind;
    select o.name into v_lembaga from public.organizations o where o.id = new.organization_id;
    select s.nama into v_nama from public.santri s where s.id = new.santri_id;
    v_vars := jsonb_build_object(
      'nama_santri', v_nama, 'halaqah', coalesce(v_hnama, '-'), 'lembaga', coalesce(v_lembaga, ''),
      'tanggal', public.fn_tanggal_id(new.recitation_date), 'waktu', new.session_slot,
      'jenis', coalesce(v_jenis, new.kind), 'surat', public.fn_teks_surat(new.surah_start_no, new.ayah_start, new.surah_end_no, new.ayah_end),
      'ayat', coalesce(new.ayah_start::text, '-') || '–' || coalesce(new.ayah_end::text, '-'),
      'halaman', public.fn_angka_id(new.calculated_pages), 'kabir', coalesce(new.major_mistakes, 0)::text,
      'shoghir', coalesce(new.minor_mistakes, 0)::text, 'predikat', coalesce(new.predicate, '-'),
      'ulang', case when coalesce(new.is_repeat, false) then ' (diulang)' else '' end,
      'catatan', coalesce(nullif(btrim(coalesce(new.notes, '')), ''), '-'));
    -- Nama variabel template lama (aplikasi sebelum Fase 6) tetap didukung
    v_vars := v_vars || jsonb_build_object('skema', v_vars->>'jenis', 'jumlah_halaman', v_vars->>'halaman',
      'khoto_kabir', v_vars->>'kabir', 'khoto_shoghir', v_vars->>'shoghir', 'nilai', v_vars->>'predikat',
      'keterangan', v_vars->>'catatan');
    perform public.fn_antrikan(new.organization_id, new.santri_id, 'setoran',
      public.fn_render_template(v_set.setoran_template, v_vars), 'setoran:' || new.id);
  exception when others then
    -- Pesan wali tidak boleh menggagalkan penyimpanan setoran
    raise warning 'Antrian pesan setoran gagal: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_antrian_setoran on public.recitation_entries;
create trigger trg_antrian_setoran after insert on public.recitation_entries
  for each row execute function public.fn_antrian_setoran();

-- ---------------------------------------------------------------------
-- 4. Kehadiran mingguan (7 hari s.d. p_selesai)
-- ---------------------------------------------------------------------
create or replace function public.fn_antrikan_kehadiran_mingguan(p_org uuid, p_selesai date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.telegram_settings%rowtype;
  v_lembaga text;
  v_mulai date := p_selesai - 6;
  r record;
  v_n int := 0;
begin
  select * into v_set from public.telegram_settings where organization_id = p_org;
  if v_set.organization_id is null or not public.fn_telegram_siap(p_org) then return 0; end if;
  select name into v_lembaga from public.organizations where id = p_org;
  for r in
    with rek as (
      select a.santri_id, a.status, count(*) as n, bool_or(coalesce(st.counts_as_present, false)) as hadir,
             min(coalesce(st.name, a.status)) as nama_status, min(coalesce(st.sort_order, 100)) as urut
      from public.attendance_records a
      left join public.attendance_statuses st on st.organization_id = a.organization_id and st.code = a.status
      where a.organization_id = p_org and a.attendance_date between v_mulai and p_selesai
      group by a.santri_id, a.status
    )
    select s.id, s.nama,
           sum(rek.n) filter (where rek.hadir) as hadir, sum(rek.n) as total,
           string_agg(rek.nama_status || ' ' || rek.n, ', ' order by rek.urut, rek.nama_status) as rincian,
           (select h.nama from public.halaqah h where h.id = public.fn_halaqah_santri_pada(p_org, s.id, p_selesai)) as halaqah
    from public.santri s
    join rek on rek.santri_id = s.id
    where s.organization_id = p_org and nullif(btrim(coalesce(s.telegram_chat_id, '')), '') is not null
      and coalesce(s.status, 'active') = 'active'
    group by s.id, s.nama
  loop
    if public.fn_antrikan(p_org, r.id, 'kehadiran_mingguan',
         public.fn_render_template(v_set.mingguan_template, jsonb_build_object(
           'nama_santri', r.nama, 'halaqah', coalesce(r.halaqah, '-'), 'lembaga', coalesce(v_lembaga, ''),
           'mulai', public.fn_tanggal_id(v_mulai), 'selesai', public.fn_tanggal_id(p_selesai),
           'hadir', coalesce(r.hadir, 0)::text, 'total', r.total::text,
           'kehadiran', public.fn_angka_id(round(100.0 * coalesce(r.hadir, 0) / nullif(r.total, 0), 1)) || '%',
           'rincian', coalesce(r.rincian, '-'))),
         'mingguan:' || r.id || ':' || p_selesai) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.fn_antrikan_kehadiran_mingguan(uuid, date) from public, anon, authenticated;

-- Jadwal: dipanggil pemroses antrian (service role) tiap menit. Kirim kehadiran mingguan pada hari
-- & jam lembaga (zona waktu organizations.timezone, bawaan Asia/Jakarta), sekali per hari.
create or replace function public.rpc_proses_jadwal_telegram(p_sekarang timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_lokal timestamp;
  v_n int;
  v_hasil jsonb := '[]'::jsonb;
begin
  for r in
    select t.*, coalesce(nullif(o.timezone, ''), 'Asia/Jakarta') as tz
    from public.telegram_settings t
    join public.organizations o on o.id = t.organization_id
    where t.mingguan_aktif and coalesce(lower(o.status), 'active') in ('active', 'trial')
  loop
    begin
      v_lokal := p_sekarang at time zone r.tz;
    exception when others then
      v_lokal := p_sekarang at time zone 'Asia/Jakarta';
    end;
    continue when extract(dow from v_lokal)::int <> r.mingguan_hari or extract(hour from v_lokal)::int < r.mingguan_jam;
    continue when r.mingguan_terakhir is not null and r.mingguan_terakhir >= v_lokal::date;
    continue when not public.fn_telegram_siap(r.organization_id);
    v_n := public.fn_antrikan_kehadiran_mingguan(r.organization_id, v_lokal::date);
    update public.telegram_settings set mingguan_terakhir = v_lokal::date where organization_id = r.organization_id;
    v_hasil := v_hasil || jsonb_build_object('organization_id', r.organization_id, 'kehadiran_mingguan', v_n);
  end loop;
  return jsonb_build_object('diproses', v_hasil);
end;
$$;
revoke all on function public.rpc_proses_jadwal_telegram(timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_proses_jadwal_telegram(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 5. Progres periode (per form)
-- ---------------------------------------------------------------------
create or replace function public.fn_antrikan_progres_form(p_form uuid, p_akhiran text default '')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.period_forms%rowtype;
  v_set public.telegram_settings%rowtype;
  v_per public.evaluation_periods%rowtype;
  v_hnama text;
  v_lembaga text;
  r record;
  v_n int := 0;
begin
  select * into v_form from public.period_forms where id = p_form;
  if v_form.id is null then return 0; end if;
  select * into v_set from public.telegram_settings where organization_id = v_form.organization_id;
  select * into v_per from public.evaluation_periods where id = v_form.period_id;
  select nama into v_hnama from public.halaqah where id = v_form.halaqah_id;
  select name into v_lembaga from public.organizations where id = v_form.organization_id;
  if v_set.organization_id is null or not public.fn_telegram_siap(v_form.organization_id) then return 0; end if;
  for r in
    select pr.*, s.nama from public.period_recaps pr join public.santri s on s.id = pr.santri_id
    where pr.form_id = v_form.id
  loop
    if public.fn_antrikan(v_form.organization_id, r.santri_id, 'progres_periode',
         public.fn_render_template(v_set.periode_template, jsonb_build_object(
           'nama_santri', r.nama, 'halaqah', coalesce(v_hnama, '-'), 'lembaga', coalesce(v_lembaga, ''),
           'periode', v_per.name, 'mulai', public.fn_tanggal_id(v_per.start_date), 'selesai', public.fn_tanggal_id(v_per.end_date),
           'ziyadah', public.fn_angka_id(r.ziyadah_pages), 'murojaah', public.fn_angka_id(r.murojaah_pages),
           'posisi', public.fn_teks_posisi(r.posisi_maju_surah, r.posisi_maju_ayah, r.posisi_mundur_surah, r.posisi_mundur_ayah),
           'total_hafalan', public.fn_angka_id(r.total_juz), 'kelancaran', coalesce(r.kelancaran, '-'),
           'kehadiran', case when r.kehadiran_persen is null then '-' else public.fn_angka_id(r.kehadiran_persen) || '%' end,
           'catatan', coalesce(nullif(btrim(coalesce(r.notes, '')), ''), '-'))),
         'periode:' || v_form.period_id || ':' || r.santri_id || p_akhiran) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.fn_antrikan_progres_form(uuid, text) from public, anon, authenticated;

create or replace function public.fn_antrian_progres_periode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' and not public.fn_is_legacy_migration() then
    begin
      if exists (select 1 from public.telegram_settings t where t.organization_id = new.organization_id and t.periode_aktif) then
        perform public.fn_antrikan_progres_form(new.id);
      end if;
    exception when others then
      raise warning 'Antrian pesan progres periode gagal: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_antrian_progres_periode on public.period_forms;
create trigger trg_antrian_progres_periode after update on public.period_forms
  for each row execute function public.fn_antrian_progres_periode();

-- ---------------------------------------------------------------------
-- 6. Penautan wali (webhook, service role)
-- ---------------------------------------------------------------------
create or replace function public.fn_telegram_anak(p_org uuid, p_chat text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(s.nama order by s.nama), '[]'::jsonb) from public.santri s
  where s.organization_id = p_org and s.telegram_chat_id = btrim(p_chat);
$$;

create or replace function public.fn_tautkan_telegram(p_org uuid, p_chat text, p_kode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kode text := upper(regexp_replace(coalesce(p_kode, ''), '[^A-Za-z0-9]', '', 'g'));
  v_chat text := btrim(coalesce(p_chat, ''));
  v_salah int;
  v_s public.santri%rowtype;
  v_sudah boolean;
  v_hnama text;
  v_lembaga text;
begin
  if v_chat !~ '^-?[0-9]{1,20}$' then
    return jsonb_build_object('ok', false, 'alasan', 'chat_tidak_valid');
  end if;
  select count(*) into v_salah from public.telegram_link_attempts
  where organization_id = p_org and chat_id = v_chat and not berhasil and created_at > now() - interval '1 hour';
  if v_salah >= 5 then
    return jsonb_build_object('ok', false, 'alasan', 'terlalu_banyak');
  end if;
  if v_kode !~ '^[A-Z0-9]{8}$' then
    insert into public.telegram_link_attempts (organization_id, chat_id, kode, berhasil) values (p_org, v_chat, left(v_kode, 16), false);
    return jsonb_build_object('ok', false, 'alasan', 'kode_salah', 'sisa', greatest(0, 4 - v_salah));
  end if;
  select * into v_s from public.santri where organization_id = p_org and kode_telegram = v_kode;
  if v_s.id is null then
    insert into public.telegram_link_attempts (organization_id, chat_id, kode, berhasil) values (p_org, v_chat, v_kode, false);
    return jsonb_build_object('ok', false, 'alasan', 'kode_salah', 'sisa', greatest(0, 4 - v_salah));
  end if;
  v_sudah := v_s.telegram_chat_id is not distinct from v_chat;
  if not v_sudah then
    update public.santri set telegram_chat_id = v_chat where id = v_s.id;
    insert into public.audit_logs (organization_id, actor_role, action, resource_type, resource_id, entity_type, entity_id, reason, after_state)
    values (p_org, 'system', 'TELEGRAM_LINKED', 'santri', v_s.id::text, 'santri', v_s.id::text,
      'Wali menautkan Telegram dengan kode santri',
      jsonb_build_object('chat_id', v_chat, 'chat_lama', v_s.telegram_chat_id));
  end if;
  insert into public.telegram_link_attempts (organization_id, chat_id, kode, berhasil) values (p_org, v_chat, v_kode, true);
  select h.nama into v_hnama from public.halaqah h where h.id = public.fn_halaqah_santri_pada(p_org, v_s.id, current_date);
  select name into v_lembaga from public.organizations where id = p_org;
  return jsonb_build_object('ok', true, 'sudah', v_sudah, 'santri_id', v_s.id, 'nama', v_s.nama,
    'halaqah', v_hnama, 'lembaga', v_lembaga, 'anak', public.fn_telegram_anak(p_org, v_chat));
end;
$$;

create or replace function public.fn_telegram_berhenti(p_org uuid, p_chat text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.santri set telegram_chat_id = null
  where organization_id = p_org and telegram_chat_id = btrim(coalesce(p_chat, ''));
  get diagnostics v_n = row_count;
  update public.notification_queue set status = 'batal', last_error = 'Wali berhenti berlangganan'
  where organization_id = p_org and chat_id = btrim(coalesce(p_chat, '')) and status in ('antri', 'proses');
  if v_n > 0 then
    insert into public.audit_logs (organization_id, actor_role, action, resource_type, reason, after_state)
    values (p_org, 'system', 'TELEGRAM_UNLINKED', 'santri', 'Wali mengirim /berhenti ke bot',
      jsonb_build_object('chat_id', btrim(p_chat), 'jumlah_santri', v_n));
  end if;
  return v_n;
end;
$$;
revoke all on function public.fn_telegram_anak(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_tautkan_telegram(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fn_telegram_berhenti(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_telegram_anak(uuid, text) to service_role;
grant execute on function public.fn_tautkan_telegram(uuid, text, text) to service_role;
grant execute on function public.fn_telegram_berhenti(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 7. Ambil & selesaikan antrian (pemroses, service role)
-- ---------------------------------------------------------------------
create or replace function public.fn_antrian_ambil(p_batas int default 25, p_org uuid default null)
returns setof public.notification_queue
language sql
security definer
set search_path = public
as $$
  with c as (
    select q.id from public.notification_queue q
    where q.status in ('antri', 'proses') and q.next_attempt_at <= now()
      and (q.locked_until is null or q.locked_until < now())
      and (p_org is null or q.organization_id = p_org)
    order by q.created_at
    limit greatest(1, least(coalesce(p_batas, 25), 100))
    for update skip locked
  )
  update public.notification_queue q
  set status = 'proses', attempts = q.attempts + 1, locked_until = now() + interval '2 minutes'
  from c where q.id = c.id
  returning q.*;
$$;

create or replace function public.fn_antrian_selesai(p_id uuid, p_ok boolean, p_error text default null, p_permanen boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q public.notification_queue%rowtype;
  v_status text;
begin
  select * into v_q from public.notification_queue where id = p_id for update;
  if v_q.id is null then return null; end if;
  if p_ok then
    v_status := 'terkirim';
    update public.notification_queue set status = v_status, sent_at = now(), locked_until = null, last_error = null where id = p_id;
  elsif p_permanen or v_q.attempts >= 5 then
    v_status := 'gagal';
    update public.notification_queue set status = v_status, locked_until = null, last_error = left(coalesce(p_error, 'Gagal'), 500) where id = p_id;
  else
    v_status := 'antri';
    update public.notification_queue set status = v_status, locked_until = null, last_error = left(coalesce(p_error, 'Gagal'), 500),
      next_attempt_at = now() + make_interval(mins => power(2, greatest(v_q.attempts, 1) - 1)::int)
    where id = p_id;
  end if;
  return v_status;
end;
$$;
revoke all on function public.fn_antrian_ambil(int, uuid) from public, anon, authenticated;
revoke all on function public.fn_antrian_selesai(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_antrian_ambil(int, uuid) to service_role;
grant execute on function public.fn_antrian_selesai(uuid, boolean, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 8. RPC Admin
-- ---------------------------------------------------------------------
create or replace function public.fn_admin_org_santri(p_santri bigint)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select organization_id into v_org from public.santri where id = p_santri;
  if v_org is null then raise exception 'Santri tidak ditemukan.'; end if;
  if not public.is_admin_of_org(v_org) then
    raise exception 'Akses ditolak: hanya Admin lembaga.' using errcode = '42501';
  end if;
  return v_org;
end;
$$;
revoke all on function public.fn_admin_org_santri(bigint) from public, anon, authenticated;

create or replace function public.rpc_buat_ulang_kode_telegram(p_santri_id bigint, p_putuskan boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.fn_admin_org_santri(p_santri_id);
  v_kode text := public.fn_kode_telegram_baru();
begin
  perform set_config('app.kode_telegram_rpc', 'on', true);
  update public.santri set kode_telegram = v_kode,
    telegram_chat_id = case when p_putuskan then null else telegram_chat_id end
  where id = p_santri_id;
  perform set_config('app.kode_telegram_rpc', '', true);
  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  values (v_org, auth.uid(), 'admin', 'TELEGRAM_CODE_REGENERATED', 'santri', p_santri_id::text,
    'Kode Telegram santri dibuat ulang', jsonb_build_object('putuskan', p_putuskan));
  return jsonb_build_object('kode_telegram', v_kode);
end;
$$;

create or replace function public.rpc_putus_telegram(p_santri_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.fn_admin_org_santri(p_santri_id);
begin
  update public.santri set telegram_chat_id = null where id = p_santri_id;
  update public.notification_queue set status = 'batal', last_error = 'Tautan Telegram diputus Admin'
  where santri_id = p_santri_id and status in ('antri', 'proses');
  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason)
  values (v_org, auth.uid(), 'admin', 'TELEGRAM_UNLINKED', 'santri', p_santri_id::text, 'Tautan Telegram wali diputus Admin');
end;
$$;

create or replace function public.rpc_uji_telegram(p_santri_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.fn_admin_org_santri(p_santri_id);
  v_nama text;
  v_lembaga text;
  v_ok boolean;
begin
  if not public.fn_telegram_siap(v_org) then
    raise exception 'Token Bot Telegram lembaga belum diatur atau dinonaktifkan (Pengaturan > Integrasi).';
  end if;
  select nama into v_nama from public.santri where id = p_santri_id;
  if (select nullif(btrim(coalesce(telegram_chat_id, '')), '') from public.santri where id = p_santri_id) is null then
    raise exception 'Wali santri ini belum menautkan Telegram.';
  end if;
  select name into v_lembaga from public.organizations where id = v_org;
  v_ok := public.fn_antrikan(v_org, p_santri_id, 'uji',
    'Pesan uji dari ' || coalesce(v_lembaga, 'lembaga') || E'.\nTelegram Anda sudah tertaut untuk ananda ' || v_nama || '.',
    'uji:' || p_santri_id || ':' || extract(epoch from clock_timestamp())::bigint);
  return jsonb_build_object('antri', v_ok);
end;
$$;

create or replace function public.rpc_kirim_kehadiran_mingguan(p_selesai date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.get_my_org_id();
  v_tz text;
  v_akhir date;
begin
  if auth.uid() is null or v_org is null or not public.is_admin_of_org(v_org) then
    raise exception 'Akses ditolak: hanya Admin lembaga.' using errcode = '42501';
  end if;
  if not public.fn_telegram_siap(v_org) then
    raise exception 'Token Bot Telegram lembaga belum diatur atau dinonaktifkan (Pengaturan > Integrasi).';
  end if;
  select coalesce(nullif(timezone, ''), 'Asia/Jakarta') into v_tz from public.organizations where id = v_org;
  v_akhir := coalesce(p_selesai, (now() at time zone v_tz)::date);
  return jsonb_build_object('antri', public.fn_antrikan_kehadiran_mingguan(v_org, v_akhir), 'mulai', v_akhir - 6, 'selesai', v_akhir);
end;
$$;

create or replace function public.rpc_kirim_progres_periode(p_period uuid, p_halaqah bigint default null, p_ulang boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per public.evaluation_periods%rowtype;
  v_form record;
  v_n int := 0;
  v_forms int := 0;
  v_akhiran text := case when p_ulang then ':ulang:' || extract(epoch from clock_timestamp())::bigint else '' end;
begin
  select * into v_per from public.evaluation_periods where id = p_period;
  if v_per.id is null then raise exception 'Periode tidak ditemukan.'; end if;
  if auth.uid() is null or not public.is_admin_of_org(v_per.organization_id) then
    raise exception 'Akses ditolak: hanya Admin lembaga.' using errcode = '42501';
  end if;
  if not public.fn_telegram_siap(v_per.organization_id) then
    raise exception 'Token Bot Telegram lembaga belum diatur atau dinonaktifkan (Pengaturan > Integrasi).';
  end if;
  for v_form in select id from public.period_forms
    where period_id = p_period and status = 'submitted' and (p_halaqah is null or halaqah_id = p_halaqah)
  loop
    v_forms := v_forms + 1;
    v_n := v_n + public.fn_antrikan_progres_form(v_form.id, v_akhiran);
  end loop;
  return jsonb_build_object('antri', v_n, 'form_terkirim', v_forms);
end;
$$;

create or replace function public.rpc_antrian_ulangi(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.notification_queue where id = p_id;
  if v_org is null or auth.uid() is null or not public.is_admin_of_org(v_org) then
    raise exception 'Akses ditolak: hanya Admin lembaga.' using errcode = '42501';
  end if;
  update public.notification_queue set status = 'antri', attempts = 0, next_attempt_at = now(), locked_until = null, last_error = null
  where id = p_id and status in ('gagal', 'batal');
end;
$$;

create or replace function public.rpc_antrian_batal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.notification_queue where id = p_id;
  if v_org is null or auth.uid() is null or not public.is_admin_of_org(v_org) then
    raise exception 'Akses ditolak: hanya Admin lembaga.' using errcode = '42501';
  end if;
  update public.notification_queue set status = 'batal', locked_until = null
  where id = p_id and status in ('antri', 'proses', 'gagal');
end;
$$;

revoke all on function public.rpc_buat_ulang_kode_telegram(bigint, boolean) from public, anon;
revoke all on function public.rpc_putus_telegram(bigint) from public, anon;
revoke all on function public.rpc_uji_telegram(bigint) from public, anon;
revoke all on function public.rpc_kirim_kehadiran_mingguan(date) from public, anon;
revoke all on function public.rpc_kirim_progres_periode(uuid, bigint, boolean) from public, anon;
revoke all on function public.rpc_antrian_ulangi(uuid) from public, anon;
revoke all on function public.rpc_antrian_batal(uuid) from public, anon;
grant execute on function public.rpc_buat_ulang_kode_telegram(bigint, boolean) to authenticated, service_role;
grant execute on function public.rpc_putus_telegram(bigint) to authenticated, service_role;
grant execute on function public.rpc_uji_telegram(bigint) to authenticated, service_role;
grant execute on function public.rpc_kirim_kehadiran_mingguan(date) to authenticated, service_role;
grant execute on function public.rpc_kirim_progres_periode(uuid, bigint, boolean) to authenticated, service_role;
grant execute on function public.rpc_antrian_ulangi(uuid) to authenticated, service_role;
grant execute on function public.rpc_antrian_batal(uuid) to authenticated, service_role;

commit;
