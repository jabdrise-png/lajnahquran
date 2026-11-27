-- Fase 7 · Login Google & lupa sandi.
-- Masalah: handle_new_user membuat organisasi "Ma'had Baru" untuk SETIAP pengguna baru tanpa target lembaga.
-- Bila seseorang yang belum diundang menekan "Masuk dengan Google", Supabase membuat pengguna baru
-- (provider google) dan trigger ini akan membuat lembaga sampah. Mulai sekarang lembaga baru hanya dibuat
-- untuk pendaftaran email biasa yang memang mengisi nama ma'had (alur "Daftar sekarang").
-- Pengguna Google yang belum diundang tetap 'pending' tanpa lembaga, dan bisa ditautkan lewat undangan.
-- Rollback: jalankan ulang definisi handle_new_user dari database/supabase_v2_1_production_hardening.sql (bagian 2.1).
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  v_mahad text;
  raw_target_org_id text;
  v_provider text;
begin
  v_mahad := nullif(trim(new.raw_user_meta_data->>'mahad_name'), '');
  raw_target_org_id := nullif(trim(new.raw_user_meta_data->>'target_organization_id'), '');
  v_provider := coalesce(nullif(to_jsonb(new)->'raw_app_meta_data'->>'provider', ''), 'email');

  if raw_target_org_id is not null and length(raw_target_org_id) = 36 then
    select id into new_org_id from public.organizations where id = raw_target_org_id::uuid;
    if new_org_id is null then
      raise exception 'Target organization (%) tidak ditemukan saat provisioning user baru.', raw_target_org_id;
    end if;
  elsif v_provider = 'email'
        and v_mahad is not null
        and coalesce(new.raw_user_meta_data->>'role', '') not in ('superadmin', 'super_admin') then
    insert into public.organizations (name, status)
    values (v_mahad, 'provisioning')
    returning id into new_org_id;
  end if;

  -- Akun baru selalu dimulai 'pending' sampai diaktifkan lewat grant / undangan sah.
  insert into public.profiles (id, organization_id, full_name, role, email)
  values (
    new.id,
    new_org_id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    'pending',
    new.email
  )
  on conflict (id) do update
  set organization_id = coalesce(excluded.organization_id, public.profiles.organization_id),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      email = coalesce(excluded.email, public.profiles.email);

  return new;
end;
$$;

commit;
