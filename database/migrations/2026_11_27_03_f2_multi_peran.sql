-- =====================================================================
-- 2026_11_27_03_f2_multi_peran.sql
-- Fase 2 · butir 7
--
-- Tujuan:
--   Satu akun boleh memegang beberapa peran di lembaga yang sama
--   (contoh: Admin yang juga Musammi'). Peran aktif dipilih setelah login.
--     - Hapus indeks unik (organization_id, user_id); yang tersisa unik per
--       (user_id, organization_id, role).
--     - rpc_manage_access_grant: tanpa p_grant_id, grant dicari per peran
--       sehingga menambah peran tidak menimpa peran lain; Admin boleh menambah
--       peran Musammi' untuk dirinya sendiri.
--     - Sinkronisasi profiles.role memakai peran tertinggi yang masih aktif.
--     - rpc_my_roles(): daftar peran aktif pengguna yang sedang login.
--
-- Prasyarat: 2026_11_27_02_f2_tabel_referensi.sql
-- Rollback:
--   create unique index idx_access_grants_tenant_user_uniq on public.access_grants (organization_id, user_id);
--     (gagal bila sudah ada pengguna dengan dua peran; cabut salah satunya dulu)
--   jalankan ulang definisi fungsi dari supabase_v2_1_production_hardening.sql
-- =====================================================================

begin;

drop index if exists public.idx_access_grants_tenant_user_uniq;
create unique index if not exists idx_access_grants_user_org_role_uniq
  on public.access_grants (user_id, organization_id, role);

CREATE OR REPLACE FUNCTION public.rpc_manage_access_grant(p_grant_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_role text DEFAULT 'musammi'::text, p_status text DEFAULT 'active'::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid;
  v_is_super boolean;
  v_clean_role text;
  v_clean_status text;
  v_target_user uuid;
  v_target_org uuid;
  v_existing public.access_grants%ROWTYPE;
  v_result public.access_grants%ROWTYPE;
  v_actor_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi autentikasi diperlukan.';
  END IF;

  v_is_super := public.is_super_admin();
  v_clean_role := CASE
    WHEN LOWER(TRIM(COALESCE(p_role, ''))) IN ('superadmin', 'super_admin') THEN 'superadmin'
    WHEN LOWER(TRIM(COALESCE(p_role, ''))) IN ('admin', 'admin_mahad') THEN 'admin'
    WHEN LOWER(TRIM(COALESCE(p_role, ''))) IN ('musammi', 'pengajar') THEN 'musammi'
    ELSE LOWER(TRIM(COALESCE(p_role, '')))
  END;

  -- Fase 2: daftar peran dari tabel roles (bukan CHECK)
  IF NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.code = v_clean_role AND r.is_active) THEN
    RAISE EXCEPTION 'Peran tidak valid atau belum aktif: %', v_clean_role;
  END IF;

  v_clean_status := LOWER(TRIM(COALESCE(p_status, 'active')));
  IF v_clean_status NOT IN ('invited', 'active', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'Status grant tidak valid: %', v_clean_status;
  END IF;

  -- Jika p_grant_id diberikan, muat grant eksisting
  IF p_grant_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.access_grants WHERE id = p_grant_id FOR UPDATE;
    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Grant tidak ditemukan.';
    END IF;
    v_target_user := COALESCE(p_target_user_id, v_existing.user_id);
    v_target_org := COALESCE(p_organization_id, v_existing.organization_id);
  ELSE
    v_target_user := p_target_user_id;
    v_target_org := CASE WHEN v_clean_role = 'superadmin' THEN NULL ELSE p_organization_id END;
    IF v_target_user IS NULL THEN
      RAISE EXCEPTION 'Target user_id wajib diisi.';
    END IF;

    IF v_clean_role = 'superadmin' THEN
      SELECT * INTO v_existing
      FROM public.access_grants
      WHERE user_id = v_target_user AND role = 'superadmin'
      LIMIT 1
      FOR UPDATE;
    ELSE
      -- Fase 2: satu pengguna boleh punya beberapa peran di lembaga yang sama.
      -- Tanpa p_grant_id, grant dicari per (pengguna, lembaga, PERAN): peran lain tidak tertimpa.
      SELECT * INTO v_existing
      FROM public.access_grants
      WHERE user_id = v_target_user AND organization_id = v_target_org AND role = v_clean_role
      LIMIT 1
      FOR UPDATE;
    END IF;
  END IF;

  -- Tegakkan Hierarki Role Ketat:
  -- 1. Superadmin: boleh mengelola grant platform & tenant.
  -- 2. Admin: HANYA boleh mengelola role 'musammi' di tenant sendiri; tidak boleh membuat/mengubah Admin atau Superadmin; tidak boleh mengubah grant milik diri sendiri.
  -- 3. Musammi: tidak boleh mengelola akun atau grant.
  IF v_is_super THEN
    v_actor_role := 'superadmin';
  ELSE
    IF v_target_org IS NULL OR NOT public.is_admin_of_org(v_target_org) THEN
      RAISE EXCEPTION 'Forbidden: Anda tidak memiliki otorisasi Admin pada organisasi target.';
    END IF;
    -- Pengecualian Fase 2: Admin boleh MENAMBAH peran Musammi' untuk dirinya sendiri
    -- (Admin yang juga mengajar). Mengubah/menangguhkan grant sendiri tetap dilarang.
    IF v_target_user = v_caller_id
       AND NOT (v_clean_role = 'musammi' AND v_clean_status = 'active' AND v_existing.id IS NULL AND p_grant_id IS NULL) THEN
      RAISE EXCEPTION 'Forbidden: Admin tidak diperbolehkan memodifikasi grant miliknya sendiri.';
    END IF;
    IF v_clean_role <> 'musammi' THEN
      RAISE EXCEPTION 'Forbidden: Admin Lembaga hanya dapat menetapkan atau mengelola role Musammi.';
    END IF;
    IF v_existing.id IS NOT NULL AND v_existing.role <> 'musammi' THEN
      RAISE EXCEPTION 'Forbidden: Admin Lembaga tidak dapat mengubah atau menangguhkan akun Admin/Superadmin.';
    END IF;
    v_actor_role := 'admin';
  END IF;

  IF v_clean_role <> 'superadmin' AND v_target_org IS NULL THEN
    RAISE EXCEPTION 'Organization ID wajib diisi untuk role %.', v_clean_role;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.access_grants
    SET role = v_clean_role,
        status = v_clean_status,
        expires_at = CASE
          WHEN v_clean_status = 'active' AND (expires_at IS NOT NULL AND expires_at <= now()) THEN NULL
          ELSE expires_at
        END,
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO public.access_grants (
      user_id, organization_id, role, status, invited_by, updated_at
    )
    VALUES (
      v_target_user,
      CASE WHEN v_clean_role = 'superadmin' THEN NULL ELSE v_target_org END,
      v_clean_role,
      v_clean_status,
      v_caller_id,
      now()
    )
    RETURNING * INTO v_result;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state
  )
  VALUES (
    v_result.organization_id,
    v_caller_id,
    v_actor_role,
    'access_grant.' || v_clean_status,
    'access_grants',
    v_result.id::text,
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Perubahan hak akses melalui rpc_manage_access_grant'),
    CASE WHEN v_existing.id IS NOT NULL THEN jsonb_build_object('role', v_existing.role, 'status', v_existing.status) ELSE NULL END,
    jsonb_build_object('role', v_result.role, 'status', v_result.status, 'user_id', v_result.user_id, 'organization_id', v_result.organization_id)
  );

  RETURN jsonb_build_object(
    'id', v_result.id,
    'user_id', v_result.user_id,
    'organization_id', v_result.organization_id,
    'role', v_result.role,
    'status', v_result.status
  );
END;
$function$;

revoke all on function public.rpc_manage_access_grant(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.rpc_manage_access_grant(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

-- profiles.role (kompatibilitas) = peran aktif tertinggi pengguna di lembaga itu
create or replace function public.sync_v2_grant_to_legacy_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legacy_role text;
  v_is_super boolean;
  v_best text;
begin
  perform set_config('app.syncing_from_grant', 'true', true);

  select exists (
    select 1 from public.access_grants ag
    where ag.user_id = new.user_id and ag.role = 'superadmin' and ag.status = 'active'
      and (ag.expires_at is null or ag.expires_at > now())
  ) into v_is_super;

  update public.user_profiles set is_superadmin = v_is_super, updated_at = now() where user_id = new.user_id;

  if v_is_super then
    v_best := 'superadmin';
  else
    select ag.role into v_best
    from public.access_grants ag
    join public.roles r on r.code = ag.role
    where ag.user_id = new.user_id
      and ag.organization_id is not distinct from new.organization_id
      and ag.status = 'active'
      and (ag.expires_at is null or ag.expires_at > now())
    order by r.sort_order
    limit 1;
  end if;

  v_legacy_role := case
    when v_best is null then 'pending'
    when v_best = 'superadmin' then 'super_admin'
    else v_best
  end;

  update public.profiles
  set role = v_legacy_role,
      organization_id = coalesce(new.organization_id, organization_id)
  where id = new.user_id
    and (organization_id is null or organization_id = new.organization_id or new.role = 'superadmin');

  return new;
end;
$$;

-- Peran aktif milik pengguna yang sedang login (untuk layar "Masuk sebagai")
create or replace function public.rpc_my_roles()
returns table (organization_id uuid, organization_name text, role text, role_label text, sort_order smallint)
language sql
stable
security definer
set search_path = public
as $$
  select ag.organization_id, o.name, ag.role, r.label, r.sort_order
  from public.access_grants ag
  join public.roles r on r.code = ag.role and r.is_active
  left join public.organizations o on o.id = ag.organization_id
  where ag.user_id = auth.uid()
    and ag.status = 'active'
    and (ag.expires_at is null or ag.expires_at > now())
  order by r.sort_order;
$$;

revoke all on function public.rpc_my_roles() from public, anon;
grant execute on function public.rpc_my_roles() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
