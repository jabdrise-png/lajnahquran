-- =================================================================================
-- LAJNAH QURAN - INCREMENTAL PRODUCTION HARDENING MIGRATION (V2.1)
-- Acuan: Master Prompt — Comprehensive System Repair & Production Hardening (Fase 1 - 7)
-- Idempoten 100%: Aman dijalankan di atas database yang sudah menjalankan
-- skema_lajnah.sql dan supabase_saas_v2_migration.sql.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- FASE 1: SECURITY, ROLE & TENANT ISOLATION HARDENING
-- ---------------------------------------------------------------------------------

-- 1.0 Perbaiki sync_user_email agar wajib memiliki SET search_path = public
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- 1.1 Otoritas Role & Tenant Context (access_grants sebagai single source of truth)
--     Jangan pernah fallback ke profiles apabila user sudah memiliki baris di access_grants
CREATE OR REPLACE FUNCTION public.get_canonical_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_active_role text;
  v_has_any_grant boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ag.role
  INTO v_active_role
  FROM public.access_grants ag
  WHERE ag.user_id = auth.uid()
    AND ag.status = 'active'
    AND (ag.expires_at IS NULL OR ag.expires_at > now())
  ORDER BY CASE ag.role WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_active_role IS NOT NULL THEN
    RETURN v_active_role;
  END IF;

  -- Jika user sudah memiliki baris di access_grants (invited/suspended/revoked/expired),
  -- blokir fallback ke profiles!
  SELECT EXISTS (
    SELECT 1 FROM public.access_grants ag WHERE ag.user_id = auth.uid()
  ) INTO v_has_any_grant;

  IF v_has_any_grant THEN
    RETURN NULL;
  END IF;

  -- Fallback kompatibilitas hanya jika akun lama belum memiliki baris sama sekali di access_grants
  RETURN (
    SELECT CASE
      WHEN LOWER(p.role) IN ('super_admin', 'superadmin') THEN 'superadmin'
      WHEN LOWER(p.role) IN ('admin', 'admin_mahad') THEN 'admin'
      WHEN LOWER(p.role) IN ('musammi', 'pengajar') THEN 'musammi'
      ELSE NULL
    END
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_role_for_org(target_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_grant_role text;
  v_has_any_grant boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Cek apakah superadmin aktif & tidak kedaluwarsa
  IF EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND ag.role = 'superadmin'
      AND ag.status = 'active'
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
  ) THEN
    RETURN 'superadmin';
  END IF;

  IF target_org_id IS NULL THEN
    RETURN public.get_canonical_role();
  END IF;

  -- Cek grant aktif & tidak kedaluwarsa spesifik pada organisasi target
  SELECT ag.role
  INTO v_grant_role
  FROM public.access_grants ag
  WHERE ag.user_id = auth.uid()
    AND ag.organization_id = target_org_id
    AND ag.status = 'active'
    AND (ag.expires_at IS NULL OR ag.expires_at > now())
  ORDER BY CASE ag.role WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_grant_role IS NOT NULL THEN
    RETURN v_grant_role;
  END IF;

  -- Apabila pengguna sudah memiliki baris di access_grants (baik di org ini maupun org lain,
  -- atau berstatus invited/suspended/revoked/expired), JANGAN PERNAH fallback ke profiles!
  SELECT EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
  ) INTO v_has_any_grant;

  IF v_has_any_grant THEN
    RETURN NULL;
  END IF;

  -- Fallback kompatibilitas hanya jika user belum punya baris sama sekali di access_grants
  RETURN (
    SELECT CASE
      WHEN LOWER(p.role) IN ('super_admin', 'superadmin') THEN 'superadmin'
      WHEN LOWER(p.role) IN ('admin', 'admin_mahad') THEN 'admin'
      WHEN LOWER(p.role) IN ('musammi', 'pengajar') THEN 'musammi'
      ELSE NULL
    END
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.organization_id = target_org_id OR LOWER(p.role) IN ('super_admin', 'superadmin'))
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.get_canonical_role() = 'superadmin';
$$;

CREATE OR REPLACE FUNCTION public.has_active_support_session(target_org_id uuid, require_write boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_access_sessions sas
    WHERE sas.superadmin_user_id = auth.uid()
      AND sas.organization_id = target_org_id
      AND sas.ended_at IS NULL
      AND sas.expires_at > now()
      AND (NOT require_write OR sas.mode = 'read_write')
  ) AND public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_of_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    target_org_id IS NOT NULL
    AND (
      public.get_role_for_org(target_org_id) = 'admin'
      OR public.has_active_support_session(target_org_id, true)
    )
  );
$$;

-- get_my_org_id() yang otoritatif terhadap access_grants & support_access_sessions
-- serta memblokir akses apabila grant berstatus invited/suspended/revoked/expired
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_support_org_id uuid;
  v_grant_org_id uuid;
  v_profile_org_id uuid;
  v_has_any_grant boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Jika Superadmin memiliki Support Access Session aktif, kembalikan organization_id sesi tersebut
  IF public.is_super_admin() THEN
    SELECT sas.organization_id
    INTO v_support_org_id
    FROM public.support_access_sessions sas
    WHERE sas.superadmin_user_id = auth.uid()
      AND sas.ended_at IS NULL
      AND sas.expires_at > now()
    ORDER BY sas.started_at DESC
    LIMIT 1;

    IF v_support_org_id IS NOT NULL THEN
      RETURN v_support_org_id;
    END IF;
  END IF;

  -- 2. Ambil preferensi organisasi dari profiles untuk pencocokan deterministik
  SELECT p.organization_id
  INTO v_profile_org_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  -- 3. Cari grant aktif & belum expired pada access_grants (utamakan yang cocok dengan profile_org_id)
  SELECT ag.organization_id
  INTO v_grant_org_id
  FROM public.access_grants ag
  WHERE ag.user_id = auth.uid()
    AND ag.organization_id IS NOT NULL
    AND ag.status = 'active'
    AND (ag.expires_at IS NULL OR ag.expires_at > now())
  ORDER BY
    CASE WHEN ag.organization_id = v_profile_org_id THEN 0 ELSE 1 END,
    CASE ag.role WHEN 'admin' THEN 1 ELSE 2 END,
    ag.created_at DESC
  LIMIT 1;

  IF v_grant_org_id IS NOT NULL THEN
    RETURN v_grant_org_id;
  END IF;

  -- 4. Jika pengguna memiliki baris di access_grants tetapi tidak ada yang active & valid,
  --    kembalikan NULL (blokir fallback ke profiles!)
  SELECT EXISTS (
    SELECT 1 FROM public.access_grants ag WHERE ag.user_id = auth.uid()
  ) INTO v_has_any_grant;

  IF v_has_any_grant THEN
    RETURN NULL;
  END IF;

  -- 5. Fallback legacy hanya jika user belum punya baris sama sekali di access_grants dan bukan pending
  RETURN (
    SELECT p.organization_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND LOWER(COALESCE(p.role, 'pending')) NOT IN ('pending')
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_halaqah(target_org_id uuid, target_halaqah_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    target_org_id IS NOT NULL
    AND target_halaqah_id IS NOT NULL
    AND public.get_role_for_org(target_org_id) IN ('musammi', 'admin')
    AND (
      EXISTS (
        SELECT 1
        FROM public.halaqah_musammi_assignments hma
        LEFT JOIN public.musammi m ON m.id = hma.musammi_id AND m.organization_id = hma.organization_id
        WHERE hma.organization_id = target_org_id
          AND hma.halaqah_id = target_halaqah_id
          AND hma.status = 'active'
          AND hma.is_active = true
          AND (hma.valid_to IS NULL OR hma.valid_to >= CURRENT_DATE)
          AND (hma.user_id = auth.uid() OR m.user_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.halaqah h
        JOIN public.musammi m ON m.id = h.musammi_id AND m.organization_id = h.organization_id
        WHERE h.organization_id = target_org_id
          AND h.id = target_halaqah_id
          AND m.user_id = auth.uid()
      )
    )
  );
$$;

-- Helper untuk memverifikasi apakah Musammi mengampu halaqah tempat santri berada
CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_student(target_org_id uuid, target_santri_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    target_org_id IS NOT NULL
    AND target_santri_id IS NOT NULL
    AND public.get_role_for_org(target_org_id) IN ('musammi', 'admin')
    AND (
      EXISTS (
        SELECT 1
        FROM public.halaqah_student_memberships hsm
        WHERE hsm.organization_id = target_org_id
          AND hsm.student_id = target_santri_id
          AND hsm.status = 'active'
          AND (hsm.valid_to IS NULL OR hsm.valid_to >= CURRENT_DATE)
          AND public.is_musammi_assigned_to_halaqah(target_org_id, hsm.halaqah_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.halaqah_santri hs
        WHERE hs.organization_id = target_org_id
          AND hs.santri_id = target_santri_id
          AND (hs.end_date IS NULL OR hs.end_date >= CURRENT_DATE)
          AND public.is_musammi_assigned_to_halaqah(target_org_id, hs.halaqah_id)
      )
    )
  );
$$;

-- 1.2 Proteksi eskalasi privilege is_superadmin pada user_profiles
CREATE OR REPLACE FUNCTION public.normalize_user_profiles_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := COALESCE(NEW.user_id, NEW.id);
  NEW.id := COALESCE(NEW.id, NEW.user_id);
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  IF current_setting('app.syncing_from_grant', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL
  THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.is_superadmin, false) = true THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.access_grants ag
        WHERE ag.user_id = auth.uid()
          AND ag.role = 'superadmin'
          AND ag.status = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
      ) THEN
        NEW.is_superadmin := false;
      END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.access_grants ag
        WHERE ag.user_id = auth.uid()
          AND ag.role = 'superadmin'
          AND ag.status = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
      ) THEN
        RAISE EXCEPTION 'Forbidden: Hanya Superadmin yang dapat mengubah atribut is_superadmin.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_user_profiles ON public.user_profiles;
CREATE TRIGGER trg_normalize_user_profiles
BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_user_profiles_row();

-- 1.3 Blokir Admin & User biasa dari mengubah role/organization_id pada profiles secara langsung
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.syncing_from_grant', true) = 'true'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR auth.uid() IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_of_org(OLD.organization_id) THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Forbidden: Cannot move user across organizations.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role AND LOWER(COALESCE(NEW.role, '')) IN ('super_admin', 'superadmin', 'admin', 'admin_mahad') THEN
      RAISE EXCEPTION 'Forbidden: Hanya Superadmin yang dapat menetapkan role Admin atau Superadmin.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Forbidden: You are not allowed to change your own role.';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Forbidden: You are not allowed to change your organization_id.';
  END IF;

  RETURN NEW;
END;
$$;

-- 1.4 Sinkronisasi Profil yang TIDAK mengubah otorisasi saat UPDATE!
--     UPDATE pada public.profiles hanya menyinkronkan identitas (full_name, email) ke user_profiles
--     dan TIDAK PERNAH mengaktifkan grant, mengganti role grant, mengganti organization_id grant,
--     ataupun menghapus status suspended/revoked/invited.
CREATE OR REPLACE FUNCTION public.sync_profile_to_v2_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical_role text;
  v_status text := 'active';
BEGIN
  -- Jika dipicu oleh sinkronisasi balik dari access_grants, hanya sinkronkan identitas user_profiles
  IF current_setting('app.syncing_from_grant', true) = 'true' THEN
    INSERT INTO public.user_profiles (user_id, id, full_name, email, is_superadmin, updated_at)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.full_name, ''),
      NEW.email,
      LOWER(COALESCE(NEW.role, '')) IN ('super_admin', 'superadmin'),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = COALESCE(EXCLUDED.email, public.user_profiles.email),
        updated_at = now();
    RETURN NEW;
  END IF;

  -- Pada UPDATE profil biasa: HANYA sinkronkan full_name dan email ke user_profiles.
  -- DILARANG mengubah is_superadmin atau memutasi tabel access_grants!
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.user_profiles (user_id, id, full_name, email, is_superadmin, updated_at)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.full_name, ''),
      NEW.email,
      false,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = COALESCE(EXCLUDED.email, public.user_profiles.email),
        updated_at = now();
    RETURN NEW;
  END IF;

  -- Pada INSERT profil awal (saat user baru dibuat oleh trigger auth.users):
  INSERT INTO public.user_profiles (user_id, id, full_name, email, is_superadmin, updated_at)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.full_name, ''),
    NEW.email,
    LOWER(COALESCE(NEW.role, '')) IN ('super_admin', 'superadmin'),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = COALESCE(EXCLUDED.email, public.user_profiles.email),
      updated_at = now();

  IF LOWER(COALESCE(NEW.role, '')) IN ('super_admin', 'superadmin') THEN
    INSERT INTO public.access_grants (user_id, organization_id, role, status, updated_at)
    VALUES (NEW.id, NULL, 'superadmin', 'active', now())
    ON CONFLICT DO NOTHING;
  ELSIF NEW.organization_id IS NOT NULL THEN
    IF LOWER(COALESCE(NEW.role, '')) = 'pending' THEN
      v_canonical_role := 'musammi';
      v_status := 'invited';
    ELSIF LOWER(COALESCE(NEW.role, '')) IN ('musammi', 'pengajar') THEN
      v_canonical_role := 'musammi';
      v_status := 'active';
    ELSE
      v_canonical_role := 'admin';
      v_status := 'active';
    END IF;

    INSERT INTO public.access_grants (user_id, organization_id, role, status, updated_at)
    VALUES (NEW.id, NEW.organization_id, v_canonical_role, v_status, now())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger satu arah dari otoritas access_grants -> profiles & user_profiles
CREATE OR REPLACE FUNCTION public.sync_v2_grant_to_legacy_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_legacy_role text;
  v_is_super boolean;
BEGIN
  PERFORM set_config('app.syncing_from_grant', 'true', true);

  SELECT EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = NEW.user_id
      AND ag.role = 'superadmin'
      AND ag.status = 'active'
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
  ) INTO v_is_super;

  UPDATE public.user_profiles
  SET is_superadmin = v_is_super,
      updated_at = now()
  WHERE user_id = NEW.user_id;

  IF NEW.status <> 'active' OR (NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()) THEN
    v_legacy_role := 'pending';
  ELSIF NEW.role = 'superadmin' THEN
    v_legacy_role := 'super_admin';
  ELSIF NEW.role = 'admin' THEN
    v_legacy_role := 'admin';
  ELSE
    v_legacy_role := 'musammi';
  END IF;

  UPDATE public.profiles
  SET role = v_legacy_role,
      organization_id = COALESCE(NEW.organization_id, organization_id)
  WHERE id = NEW.user_id
    AND (
      organization_id IS NULL
      OR organization_id = NEW.organization_id
      OR NEW.role = 'superadmin'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_grant_to_legacy_profile ON public.access_grants;
CREATE TRIGGER trg_sync_grant_to_legacy_profile
AFTER INSERT OR UPDATE ON public.access_grants
FOR EACH ROW
EXECUTE FUNCTION public.sync_v2_grant_to_legacy_profile();

-- 1.5 Fungsi Server Khusus Manajemen Grant yang Memverifikasi Aktor & Hierarki Role
CREATE OR REPLACE FUNCTION public.rpc_manage_access_grant(
  p_grant_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_role text DEFAULT 'musammi',
  p_status text DEFAULT 'active',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ELSE NULL
  END;

  IF v_clean_role IS NULL THEN
    RAISE EXCEPTION 'Role tidak valid. Gunakan superadmin, admin, atau musammi.';
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
      SELECT * INTO v_existing
      FROM public.access_grants
      WHERE user_id = v_target_user AND organization_id = v_target_org
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
    IF v_target_user = v_caller_id THEN
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

  IF v_clean_role IN ('admin', 'musammi') AND v_target_org IS NULL THEN
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
$$;

-- 1.6 Perketat kebijakan access_grants (Admin hanya boleh mengelola role 'musammi' milik user lain di lembaganya)
DROP POLICY IF EXISTS access_grants_manage ON public.access_grants;
DROP POLICY IF EXISTS access_grants_insert ON public.access_grants;
DROP POLICY IF EXISTS access_grants_update ON public.access_grants;
DROP POLICY IF EXISTS access_grants_delete ON public.access_grants;

CREATE POLICY access_grants_insert ON public.access_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_admin_of_org(organization_id)
      AND role = 'musammi'
      AND user_id <> auth.uid()
    )
  );

CREATE POLICY access_grants_update ON public.access_grants
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.is_admin_of_org(organization_id)
      AND role = 'musammi'
      AND user_id <> auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_admin_of_org(organization_id)
      AND role = 'musammi'
      AND user_id <> auth.uid()
    )
  );

CREATE POLICY access_grants_delete ON public.access_grants
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- 1.7 Perketat rpc_start_support_session & rpc_end_support_session + RLS support_access_sessions (Tanpa DELETE)
CREATE OR REPLACE FUNCTION public.rpc_start_support_session(
  p_organization_id uuid,
  p_reason text,
  p_duration_minutes integer DEFAULT 30,
  p_mode text DEFAULT 'read_only'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_expires_at timestamptz;
  v_clean_mode text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Superadmin Platform yang dapat membuka Support Access Session.';
  END IF;

  IF p_organization_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organisasi target tidak ditemukan.';
  END IF;

  IF COALESCE(LENGTH(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Alasan akses support wajib diisi secara jelas (minimal 5 karakter).';
  END IF;

  v_clean_mode := CASE WHEN p_mode = 'read_write' THEN 'read_write' ELSE 'read_only' END;
  v_expires_at := now() + make_interval(mins => LEAST(GREATEST(COALESCE(p_duration_minutes, 30), 5), 240));

  -- Tutup otomatis sesi support lama milik superadmin ini yang masih terbuka agar tidak ambigu
  UPDATE public.support_access_sessions
  SET ended_at = now()
  WHERE superadmin_user_id = auth.uid()
    AND ended_at IS NULL;

  INSERT INTO public.support_access_sessions (
    superadmin_user_id, organization_id, reason, mode, expires_at
  )
  VALUES (
    auth.uid(), p_organization_id, TRIM(p_reason), v_clean_mode, v_expires_at
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    p_organization_id, auth.uid(), 'superadmin', 'start_support_session',
    'support_access_sessions', v_session_id::text, TRIM(p_reason),
    jsonb_build_object('mode', v_clean_mode, 'expires_at', v_expires_at)
  );

  RETURN jsonb_build_object(
    'id', v_session_id,
    'organization_id', p_organization_id,
    'reason', TRIM(p_reason),
    'mode', v_clean_mode,
    'expires_at', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_end_support_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Hanya Superadmin yang dapat mengakhiri Support Access Session.';
  END IF;

  UPDATE public.support_access_sessions
  SET ended_at = now()
  WHERE id = p_session_id
    AND superadmin_user_id = auth.uid()
    AND ended_at IS NULL
  RETURNING organization_id INTO v_org_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id
  )
  VALUES (
    v_org_id, auth.uid(), 'superadmin', 'end_support_session', 'support_access_sessions', p_session_id::text
  );

  RETURN true;
END;
$$;

DROP POLICY IF EXISTS support_sessions_policy ON public.support_access_sessions;
DROP POLICY IF EXISTS support_sessions_select ON public.support_access_sessions;
DROP POLICY IF EXISTS support_sessions_insert ON public.support_access_sessions;
DROP POLICY IF EXISTS support_sessions_update ON public.support_access_sessions;

CREATE POLICY support_sessions_select ON public.support_access_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin_of_org(organization_id)
  );

CREATE POLICY support_sessions_insert ON public.support_access_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    AND superadmin_user_id = auth.uid()
  );

CREATE POLICY support_sessions_update ON public.support_access_sessions
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    AND superadmin_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin()
    AND superadmin_user_id = auth.uid()
  );

-- 1.8 Perbaikan Menyeluruh RLS Seluruh Tabel Legacy & V2 (Hapus Policy Permisif yang Memperluas Akses)
-- A. academic_years & student_classes (Hapus OR is_super_admin() pada policy WRITE agar Superadmin read_only tidak bisa menulis)
DROP POLICY IF EXISTS "Tenant Isolation Academic Years Select" ON public.academic_years;
DROP POLICY IF EXISTS "Tenant Isolation Academic Years Modify" ON public.academic_years;
CREATE POLICY "Tenant Isolation Academic Years Select" ON public.academic_years
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.is_super_admin()
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY "Tenant Isolation Academic Years Modify" ON public.academic_years
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Student Classes Select" ON public.student_classes;
DROP POLICY IF EXISTS "Tenant Isolation Student Classes Modify" ON public.student_classes;
CREATE POLICY "Tenant Isolation Student Classes Select" ON public.student_classes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY "Tenant Isolation Student Classes Modify" ON public.student_classes
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

-- B. master_kelas, master_kelas_relasi, master_marhalah, app_settings, musyrifs, class_targets, evaluation_settings, halaqah_evaluation_questions, informasi
DROP POLICY IF EXISTS "Pengguna dapat melihat master_kelas organisasi mereka" ON public.master_kelas;
DROP POLICY IF EXISTS "Admin dapat menambah master_kelas organisasi mereka" ON public.master_kelas;
DROP POLICY IF EXISTS "Admin dapat mengubah master_kelas organisasi mereka" ON public.master_kelas;
DROP POLICY IF EXISTS "Admin dapat menghapus master_kelas organisasi mereka" ON public.master_kelas;
DROP POLICY IF EXISTS master_kelas_select ON public.master_kelas;
DROP POLICY IF EXISTS master_kelas_admin_write ON public.master_kelas;
CREATE POLICY master_kelas_select ON public.master_kelas
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY master_kelas_admin_write ON public.master_kelas
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Akses Master Kelas Relasi" ON public.master_kelas_relasi;
DROP POLICY IF EXISTS master_kelas_relasi_select ON public.master_kelas_relasi;
DROP POLICY IF EXISTS master_kelas_relasi_admin_write ON public.master_kelas_relasi;
CREATE POLICY master_kelas_relasi_select ON public.master_kelas_relasi
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY master_kelas_relasi_admin_write ON public.master_kelas_relasi
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Akses Master Marhalah" ON public.master_marhalah;
DROP POLICY IF EXISTS master_marhalah_select ON public.master_marhalah;
DROP POLICY IF EXISTS master_marhalah_admin_write ON public.master_marhalah;
CREATE POLICY master_marhalah_select ON public.master_marhalah
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY master_marhalah_admin_write ON public.master_marhalah
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation App Settings" ON public.app_settings;
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY app_settings_admin_write ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Users can view musyrifs of their org" ON public.musyrifs;
DROP POLICY IF EXISTS "Users can insert musyrifs to their org" ON public.musyrifs;
DROP POLICY IF EXISTS "Users can update musyrifs of their org" ON public.musyrifs;
DROP POLICY IF EXISTS "Users can delete musyrifs of their org" ON public.musyrifs;
DROP POLICY IF EXISTS musyrifs_select ON public.musyrifs;
DROP POLICY IF EXISTS musyrifs_admin_write ON public.musyrifs;
CREATE POLICY musyrifs_select ON public.musyrifs
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY musyrifs_admin_write ON public.musyrifs
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Class Targets" ON public.class_targets;
DROP POLICY IF EXISTS class_targets_select ON public.class_targets;
DROP POLICY IF EXISTS class_targets_admin_write ON public.class_targets;
CREATE POLICY class_targets_select ON public.class_targets
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY class_targets_admin_write ON public.class_targets
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Evaluation Settings" ON public.evaluation_settings;
DROP POLICY IF EXISTS evaluation_settings_select ON public.evaluation_settings;
DROP POLICY IF EXISTS evaluation_settings_admin_write ON public.evaluation_settings;
CREATE POLICY evaluation_settings_select ON public.evaluation_settings
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY evaluation_settings_admin_write ON public.evaluation_settings
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Halaqah Eval Questions" ON public.halaqah_evaluation_questions;
DROP POLICY IF EXISTS halaqah_eval_questions_select ON public.halaqah_evaluation_questions;
DROP POLICY IF EXISTS halaqah_eval_questions_admin_write ON public.halaqah_evaluation_questions;
CREATE POLICY halaqah_eval_questions_select ON public.halaqah_evaluation_questions
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY halaqah_eval_questions_admin_write ON public.halaqah_evaluation_questions
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Informasi Select" ON public.informasi;
DROP POLICY IF EXISTS "Tenant Isolation Informasi Modify" ON public.informasi;
CREATE POLICY "Tenant Isolation Informasi Select" ON public.informasi
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY "Tenant Isolation Informasi Modify" ON public.informasi
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

-- C. santri, halaqah, halaqah_santri (Select untuk Admin atau Musammi sesuai assignment; Write khusus Admin)
DROP POLICY IF EXISTS "Tenant Isolation Santri Select" ON public.santri;
DROP POLICY IF EXISTS "Tenant Isolation Santri Insert" ON public.santri;
DROP POLICY IF EXISTS "Tenant Isolation Santri Update" ON public.santri;
DROP POLICY IF EXISTS "Tenant Isolation Santri Delete" ON public.santri;
DROP POLICY IF EXISTS "Tenant Isolation Santri Modify" ON public.santri;

CREATE POLICY "Tenant Isolation Santri Select" ON public.santri
  FOR SELECT TO authenticated
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        public.is_admin_of_org(organization_id)
        OR public.is_musammi_assigned_to_student(organization_id, id)
      )
    )
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY "Tenant Isolation Santri Modify" ON public.santri
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Halaqah Select" ON public.halaqah;
DROP POLICY IF EXISTS "Tenant Isolation Halaqah Insert" ON public.halaqah;
DROP POLICY IF EXISTS "Tenant Isolation Halaqah Update" ON public.halaqah;
DROP POLICY IF EXISTS "Tenant Isolation Halaqah Delete" ON public.halaqah;
DROP POLICY IF EXISTS "Tenant Isolation Halaqah Modify" ON public.halaqah;

CREATE POLICY "Tenant Isolation Halaqah Select" ON public.halaqah
  FOR SELECT TO authenticated
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        public.is_admin_of_org(organization_id)
        OR public.is_musammi_assigned_to_halaqah(organization_id, id)
      )
    )
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY "Tenant Isolation Halaqah Modify" ON public.halaqah
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation HalaqahSantri Select" ON public.halaqah_santri;
DROP POLICY IF EXISTS "Tenant Isolation HalaqahSantri Insert" ON public.halaqah_santri;
DROP POLICY IF EXISTS "Tenant Isolation HalaqahSantri Update" ON public.halaqah_santri;
DROP POLICY IF EXISTS "Tenant Isolation HalaqahSantri Delete" ON public.halaqah_santri;
DROP POLICY IF EXISTS "Tenant Isolation HalaqahSantri Modify" ON public.halaqah_santri;

CREATE POLICY "Tenant Isolation HalaqahSantri Select" ON public.halaqah_santri
  FOR SELECT TO authenticated
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        public.is_admin_of_org(organization_id)
        OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
      )
    )
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY "Tenant Isolation HalaqahSantri Modify" ON public.halaqah_santri
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

-- D. Tabel Operasional Legacy (attendance, setoran_harian, halaqah_evaluations, student_evaluation, student_progress, ujian_bulanan, ujian_semester)
DROP POLICY IF EXISTS "Tenant Isolation Attendance" ON public.attendance;
DROP POLICY IF EXISTS attendance_select ON public.attendance;
DROP POLICY IF EXISTS attendance_insert ON public.attendance;
DROP POLICY IF EXISTS attendance_update ON public.attendance;
DROP POLICY IF EXISTS attendance_delete ON public.attendance;

CREATE POLICY attendance_select ON public.attendance
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY attendance_insert ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
  );
CREATE POLICY attendance_update ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
  );
CREATE POLICY attendance_delete ON public.attendance
  FOR DELETE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
  );

DROP POLICY IF EXISTS "Users can view setoran harian in their organization" ON public.setoran_harian;
DROP POLICY IF EXISTS "Users can insert setoran harian in their organization" ON public.setoran_harian;
DROP POLICY IF EXISTS "Users can update setoran harian in their organization" ON public.setoran_harian;
DROP POLICY IF EXISTS "Users can delete setoran harian in their organization" ON public.setoran_harian;
DROP POLICY IF EXISTS setoran_harian_select ON public.setoran_harian;
DROP POLICY IF EXISTS setoran_harian_insert ON public.setoran_harian;
DROP POLICY IF EXISTS setoran_harian_update ON public.setoran_harian;
DROP POLICY IF EXISTS setoran_harian_delete ON public.setoran_harian;

CREATE POLICY setoran_harian_select ON public.setoran_harian
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.has_active_support_session(organization_id, false)
  );
CREATE POLICY setoran_harian_insert ON public.setoran_harian
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  );
CREATE POLICY setoran_harian_update ON public.setoran_harian
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR (halaqah_id IS NOT NULL AND public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id))
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  );
CREATE POLICY setoran_harian_delete ON public.setoran_harian
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation Halaqah Evaluations" ON public.halaqah_evaluations;
DROP POLICY IF EXISTS halaqah_evaluations_select ON public.halaqah_evaluations;
DROP POLICY IF EXISTS halaqah_evaluations_write ON public.halaqah_evaluations;
CREATE POLICY halaqah_evaluations_select ON public.halaqah_evaluations
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY halaqah_evaluations_write ON public.halaqah_evaluations
  FOR ALL TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );

DROP POLICY IF EXISTS "Tenant Isolation Student Evaluation" ON public.student_evaluation;
DROP POLICY IF EXISTS student_evaluation_select ON public.student_evaluation;
DROP POLICY IF EXISTS student_evaluation_write ON public.student_evaluation;
CREATE POLICY student_evaluation_select ON public.student_evaluation
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY student_evaluation_write ON public.student_evaluation
  FOR ALL TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  );

DROP POLICY IF EXISTS "Tenant Isolation Progress" ON public.student_progress;
DROP POLICY IF EXISTS student_progress_select ON public.student_progress;
DROP POLICY IF EXISTS student_progress_write ON public.student_progress;
CREATE POLICY student_progress_select ON public.student_progress
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY student_progress_write ON public.student_progress
  FOR ALL TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id)
  );

DROP POLICY IF EXISTS "Users can view ujian_bulanan in their org" ON public.ujian_bulanan;
DROP POLICY IF EXISTS "Users can insert ujian_bulanan in their org" ON public.ujian_bulanan;
DROP POLICY IF EXISTS "Users can update ujian_bulanan in their org" ON public.ujian_bulanan;
DROP POLICY IF EXISTS "Users can delete ujian_bulanan in their org" ON public.ujian_bulanan;
DROP POLICY IF EXISTS ujian_bulanan_select ON public.ujian_bulanan;
DROP POLICY IF EXISTS ujian_bulanan_write ON public.ujian_bulanan;
DROP POLICY IF EXISTS ujian_bulanan_delete ON public.ujian_bulanan;

CREATE POLICY ujian_bulanan_select ON public.ujian_bulanan
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY ujian_bulanan_write ON public.ujian_bulanan
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id::bigint)
  );
CREATE POLICY ujian_bulanan_update ON public.ujian_bulanan
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id::bigint)
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id::bigint)
  );
CREATE POLICY ujian_bulanan_delete ON public.ujian_bulanan
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Users can view ujian_semester in their org" ON public.ujian_semester;
DROP POLICY IF EXISTS "Users can insert ujian_semester in their org" ON public.ujian_semester;
DROP POLICY IF EXISTS "Users can update ujian_semester in their org" ON public.ujian_semester;
DROP POLICY IF EXISTS "Users can delete ujian_semester in their org" ON public.ujian_semester;
DROP POLICY IF EXISTS ujian_semester_select ON public.ujian_semester;
DROP POLICY IF EXISTS ujian_semester_write ON public.ujian_semester;
DROP POLICY IF EXISTS ujian_semester_update ON public.ujian_semester;
DROP POLICY IF EXISTS ujian_semester_delete ON public.ujian_semester;

CREATE POLICY ujian_semester_select ON public.ujian_semester
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY ujian_semester_write ON public.ujian_semester
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id::bigint)
  );
CREATE POLICY ujian_semester_update ON public.ujian_semester
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id::bigint)
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, santri_id::bigint)
  );
CREATE POLICY ujian_semester_delete ON public.ujian_semester
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id));

-- E. exam_attempts (Izinkan Musammi menginput/mengubah nilai santri binaan pada halaqah yang ditugaskan; hapus khusus Admin)
DROP POLICY IF EXISTS exam_attempts_admin_write ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_role_insert ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_role_update ON public.exam_attempts;
DROP POLICY IF EXISTS exam_attempts_role_delete ON public.exam_attempts;

CREATE POLICY exam_attempts_role_insert ON public.exam_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, COALESCE(santri_id, student_id))
  );
CREATE POLICY exam_attempts_role_update ON public.exam_attempts
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, COALESCE(santri_id, student_id))
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_student(organization_id, COALESCE(santri_id, student_id))
  );
CREATE POLICY exam_attempts_role_delete ON public.exam_attempts
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id));

-- ---------------------------------------------------------------------------------
-- FASE 2: PROVISIONING & USER LIFECYCLE HARDENING
-- ---------------------------------------------------------------------------------

-- 2.0 Perluas status siklus hidup organizations agar mendukung provisioning & provisioning_failed
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_status_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('provisioning', 'trial', 'active', 'provisioning_failed', 'suspended', 'archived'));

-- Perluas kolom lifecycle pada access_grants
ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_token_hash text,
  ADD COLUMN IF NOT EXISTS musammi_id bigint;

-- Tabel khusus siklus hidup undangan (One-Time Token, Expiry, Accepted/Revoked Timestamps)
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  access_grant_id uuid REFERENCES public.access_grants(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'musammi')),
  musammi_id bigint,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invitations_scope_check CHECK (
    (role = 'superadmin' AND organization_id IS NULL) OR
    (role IN ('admin', 'musammi') AND organization_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_org_status
  ON public.tenant_invitations(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email_status
  ON public.tenant_invitations(LOWER(email), status);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_user_id
  ON public.tenant_invitations(user_id);

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_invitations_select ON public.tenant_invitations;
DROP POLICY IF EXISTS tenant_invitations_insert ON public.tenant_invitations;
DROP POLICY IF EXISTS tenant_invitations_update ON public.tenant_invitations;

CREATE POLICY tenant_invitations_select ON public.tenant_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin_of_org(organization_id)
    OR user_id = auth.uid()
  );

CREATE POLICY tenant_invitations_insert ON public.tenant_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_admin_of_org(organization_id)
      AND role = 'musammi'
    )
  );

CREATE POLICY tenant_invitations_update ON public.tenant_invitations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.is_admin_of_org(organization_id)
      AND role = 'musammi'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_admin_of_org(organization_id)
      AND role = 'musammi'
    )
  );

-- 2.1 Hapus EXCEPTION WHEN OTHERS yang menelan error pada handle_new_user
--     Jangan pernah membuat akun langsung aktif sebelum access_grants & verifikasi undangan sah!
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  mahad_name text;
  raw_target_org_id text;
BEGIN
  mahad_name := COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'mahad_name'), ''), 'Ma''had Baru');
  raw_target_org_id := NULLIF(TRIM(new.raw_user_meta_data->>'target_organization_id'), '');

  IF raw_target_org_id IS NOT NULL AND length(raw_target_org_id) = 36 THEN
    SELECT id INTO new_org_id FROM public.organizations WHERE id = raw_target_org_id::uuid;
    IF new_org_id IS NULL THEN
      RAISE EXCEPTION 'Target organization (%) tidak ditemukan saat provisioning user baru.', raw_target_org_id;
    END IF;
  ELSIF COALESCE(new.raw_user_meta_data->>'role', '') NOT IN ('superadmin', 'super_admin') THEN
    INSERT INTO public.organizations (name, status)
    VALUES (mahad_name, 'provisioning')
    RETURNING id INTO new_org_id;
  END IF;

  -- Akun baru selalu dimulai dengan role legacy 'pending' sampai diaktifkan melalui grant / undangan sah
  INSERT INTO public.profiles (id, organization_id, full_name, role, email)
  VALUES (
    new.id,
    new_org_id,
    COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    'pending',
    new.email
  )
  ON CONFLICT (id) DO UPDATE
  SET organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id),
      full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
      email = COALESCE(EXCLUDED.email, public.profiles.email);

  RETURN new;
END;
$$;

-- 2.2 RPC Provisioning Tenant yang Idempoten terhadap Retry & Jujur terhadap Status Siklus Hidup
CREATE OR REPLACE FUNCTION public.rpc_create_tenant_with_admin(
  p_name text,
  p_slug text DEFAULT NULL,
  p_timezone text DEFAULT 'Asia/Jakarta',
  p_plan_id text DEFAULT 'standard',
  p_status text DEFAULT 'provisioning'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_org public.organizations%ROWTYPE;
  v_org_id uuid;
  v_slug text;
  v_clean_status text;
  v_clean_plan text;
  v_reused boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Hanya Superadmin Platform yang dapat melakukan provisioning tenant baru.';
  END IF;

  IF COALESCE(LENGTH(TRIM(p_name)), 0) < 3 THEN
    RAISE EXCEPTION 'Identitas tenant tidak valid: Nama organisasi/lembaga minimal 3 karakter.';
  END IF;

  v_clean_status := CASE
    WHEN p_status IN ('provisioning', 'trial', 'active', 'provisioning_failed', 'suspended', 'archived') THEN p_status
    ELSE 'provisioning'
  END;
  v_clean_plan := CASE
    WHEN p_plan_id IN ('trial', 'standard', 'enterprise') THEN p_plan_id
    ELSE 'standard'
  END;

  -- Cek apakah ini retry provisioning untuk organisasi yang sudah dibuat tetapi masih berstatus provisioning / provisioning_failed
  SELECT * INTO v_existing_org
  FROM public.organizations o
  WHERE (
      (NULLIF(TRIM(p_slug), '') IS NOT NULL AND LOWER(o.slug) = LOWER(TRIM(p_slug)))
      OR LOWER(TRIM(o.name)) = LOWER(TRIM(p_name))
    )
    AND o.status IN ('provisioning', 'provisioning_failed')
  ORDER BY o.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_org.id IS NOT NULL THEN
    v_org_id := v_existing_org.id;
    v_slug := v_existing_org.slug;
    v_reused := true;

    UPDATE public.organizations
    SET status = v_clean_status,
        timezone = COALESCE(NULLIF(TRIM(p_timezone), ''), timezone),
        plan_id = v_clean_plan,
        updated_at = now()
    WHERE id = v_org_id;
  ELSE
    -- Pastikan tidak membuat duplikat organisasi aktif dengan nama/slug yang sama persis
    IF NULLIF(TRIM(p_slug), '') IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organizations WHERE LOWER(slug) = LOWER(TRIM(p_slug))
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_TENANT_SLUG: Slug tenant "%" sudah digunakan oleh lembaga lain.', TRIM(p_slug);
    END IF;

    v_slug := COALESCE(
      NULLIF(LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, '')), '[^a-zA-Z0-9-]+', '-', 'g')), ''),
      LOWER(REGEXP_REPLACE(TRIM(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6)
    );

    INSERT INTO public.organizations (
      name, slug, status, timezone, locale, plan_id, setup_state
    )
    VALUES (
      TRIM(p_name),
      v_slug,
      v_clean_status,
      COALESCE(NULLIF(TRIM(p_timezone), ''), 'Asia/Jakarta'),
      'id-ID',
      v_clean_plan,
      jsonb_build_object(
        'identity', true,
        'hasActiveAcademicYear', false,
        'hasAdminAssigned', false,
        'hasMusammiRegistered', false,
        'hasHalaqahCreated', false,
        'provisioningState', v_clean_status
      )
    )
    RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), 'superadmin',
    CASE WHEN v_reused THEN 'tenant.provisioning_retried' ELSE 'tenant.provisioned' END,
    'organizations', v_org_id::text,
    'Provisioning identitas organisasi tenant (menunggu aktivasi Admin)',
    jsonb_build_object(
      'name', TRIM(p_name),
      'slug', v_slug,
      'plan_id', v_clean_plan,
      'status', v_clean_status,
      'reused_existing', v_reused
    )
  );

  RETURN jsonb_build_object(
    'id', v_org_id,
    'name', TRIM(p_name),
    'slug', v_slug,
    'status', v_clean_status,
    'plan_id', v_clean_plan,
    'reused_existing', v_reused
  );
END;
$$;

-- RPC untuk memperbarui status provisioning tenant (mis. ke provisioning_failed jika undangan Admin gagal)
CREATE OR REPLACE FUNCTION public.rpc_mark_tenant_provisioning_status(
  p_organization_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_clean_status text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_super_admin())
  THEN
    RAISE EXCEPTION 'Forbidden: Hanya Superadmin atau sistem provisioning yang dapat mengubah status provisioning tenant.';
  END IF;

  v_clean_status := LOWER(TRIM(COALESCE(p_status, '')));
  IF v_clean_status NOT IN ('provisioning', 'provisioning_failed', 'active', 'trial', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'Status organisasi tidak valid: %', v_clean_status;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan.';
  END IF;

  UPDATE public.organizations
  SET status = v_clean_status,
      setup_state = COALESCE(setup_state, '{}'::jsonb) || jsonb_build_object(
        'provisioningState', v_clean_status,
        'lastProvisioningReason', COALESCE(p_reason, '')
      ),
      updated_at = now()
  WHERE id = p_organization_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state
  )
  VALUES (
    p_organization_id, auth.uid(), 'superadmin',
    'tenant.status.' || v_clean_status, 'organizations', p_organization_id::text,
    COALESCE(p_reason, 'Perubahan status provisioning tenant'),
    jsonb_build_object('status', v_org.status),
    jsonb_build_object('status', v_clean_status)
  );

  RETURN jsonb_build_object('id', p_organization_id, 'status', v_clean_status);
END;
$$;

-- 2.3 RPC Inspeksi Token Undangan (Membedakan pending, accepted, expired, revoked, invalid)
CREATE OR REPLACE FUNCTION public.rpc_inspect_invitation_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_clean_token text;
  v_hash text;
  v_inv record;
BEGIN
  v_clean_token := TRIM(COALESCE(p_token, ''));
  IF LENGTH(v_clean_token) < 12 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'state', 'invalid',
      'error', 'Tautan atau token undangan tidak valid.'
    );
  END IF;

  v_hash := encode(digest(convert_to(v_clean_token, 'UTF8'), 'sha256'), 'hex');

  SELECT
    ti.id,
    ti.organization_id,
    ti.user_id,
    ti.access_grant_id,
    ti.email,
    ti.full_name,
    ti.role,
    ti.status,
    ti.expires_at,
    ti.accepted_at,
    ti.revoked_at,
    o.name AS organization_name,
    o.status AS organization_status
  INTO v_inv
  FROM public.tenant_invitations ti
  LEFT JOIN public.organizations o ON o.id = ti.organization_id
  WHERE ti.token_hash = v_hash
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'state', 'invalid',
      'error', 'Token undangan tidak ditemukan atau tidak terdaftar di sistem.'
    );
  END IF;

  IF v_inv.status = 'revoked' OR v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'state', 'revoked',
      'email', v_inv.email,
      'full_name', v_inv.full_name,
      'role', v_inv.role,
      'organization_id', v_inv.organization_id,
      'organization_name', COALESCE(v_inv.organization_name, 'Platform Global'),
      'error', 'Undangan ini telah dicabut (revoked) oleh Administrator.'
    );
  END IF;

  IF v_inv.status = 'accepted' OR v_inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'state', 'accepted',
      'email', v_inv.email,
      'full_name', v_inv.full_name,
      'role', v_inv.role,
      'organization_id', v_inv.organization_id,
      'organization_name', COALESCE(v_inv.organization_name, 'Platform Global'),
      'accepted_at', v_inv.accepted_at,
      'error', 'Token undangan sekali pakai ini sudah pernah digunakan dan akun telah aktif.'
    );
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'state', 'expired',
      'email', v_inv.email,
      'full_name', v_inv.full_name,
      'role', v_inv.role,
      'organization_id', v_inv.organization_id,
      'organization_name', COALESCE(v_inv.organization_name, 'Platform Global'),
      'expires_at', v_inv.expires_at,
      'error', 'Masa berlaku tautan undangan telah berakhir (expired). Silakan minta pengiriman ulang undangan.'
    );
  END IF;

  IF v_inv.organization_id IS NOT NULL AND v_inv.organization_status IN ('suspended', 'archived') THEN
    RETURN jsonb_build_object(
      'valid', false,
      'state', 'revoked',
      'email', v_inv.email,
      'organization_name', v_inv.organization_name,
      'error', 'Lembaga/tenant tujuan sedang ditangguhkan atau diarsipkan.'
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'state', 'pending',
    'invitation_id', v_inv.id,
    'email', v_inv.email,
    'full_name', v_inv.full_name,
    'role', v_inv.role,
    'organization_id', v_inv.organization_id,
    'organization_name', COALESCE(v_inv.organization_name, 'Platform Global'),
    'expires_at', v_inv.expires_at
  );
END;
$$;

-- 2.4 RPC Atomik Aktivasi Undangan Sekali Pakai (rpc_accept_invitation)
DROP FUNCTION IF EXISTS public.rpc_accept_invitation(uuid);
CREATE OR REPLACE FUNCTION public.rpc_accept_invitation(
  p_organization_id uuid DEFAULT NULL,
  p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_email text;
  v_clean_token text;
  v_hash text;
  v_inv public.tenant_invitations%ROWTYPE;
  v_grant public.access_grants%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_musammi_id bigint;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Silakan login terlebih dahulu untuk mengaktifkan undangan.';
  END IF;

  SELECT u.email INTO v_caller_email
  FROM auth.users u
  WHERE u.id = v_caller_id;

  v_clean_token := NULLIF(TRIM(COALESCE(p_token, '')), '');

  -- 1. Jika token diberikan (atau terdapat record di tenant_invitations), wajib validasi token sekali pakai!
  IF v_clean_token IS NOT NULL THEN
    v_hash := encode(digest(convert_to(v_clean_token, 'UTF8'), 'sha256'), 'hex');

    SELECT * INTO v_inv
    FROM public.tenant_invitations ti
    WHERE ti.token_hash = v_hash
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'INVITATION_INVALID: Token undangan tidak valid atau tidak ditemukan.';
    END IF;

    IF v_inv.status = 'accepted' OR v_inv.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVITATION_ALREADY_USED: Token undangan sekali pakai ini sudah digunakan dan tidak dapat dipakai ulang.';
    END IF;

    IF v_inv.status = 'revoked' OR v_inv.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVITATION_REVOKED: Undangan ini telah dicabut (revoked) oleh administrator.';
    END IF;

    IF v_inv.status = 'expired' OR v_inv.expires_at <= now() THEN
      UPDATE public.tenant_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = v_inv.id;
      RAISE EXCEPTION 'INVITATION_EXPIRED: Tautan undangan telah kedaluwarsa.';
    END IF;

    -- Pastikan email pengguna yang login sama persis dengan email tujuan undangan (cegah pertukaran email)
    IF LOWER(TRIM(COALESCE(v_caller_email, ''))) <> LOWER(TRIM(v_inv.email)) THEN
      RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH: Email sesi aktif (%) tidak sesuai dengan email undangan (%).', COALESCE(v_caller_email, '-'), v_inv.email;
    END IF;

    IF v_inv.user_id IS NOT NULL AND v_inv.user_id <> v_caller_id THEN
      RAISE EXCEPTION 'INVITATION_USER_MISMATCH: Undangan ini terikat pada akun pengguna yang berbeda.';
    END IF;

    IF v_inv.access_grant_id IS NOT NULL THEN
      SELECT * INTO v_grant
      FROM public.access_grants ag
      WHERE ag.id = v_inv.access_grant_id
      FOR UPDATE;
    ELSE
      SELECT * INTO v_grant
      FROM public.access_grants ag
      WHERE ag.user_id = v_caller_id
        AND (
          (v_inv.organization_id IS NULL AND ag.organization_id IS NULL)
          OR ag.organization_id = v_inv.organization_id
        )
      ORDER BY ag.created_at DESC
      LIMIT 1
      FOR UPDATE;
    END IF;
  ELSE
    -- Jika pemanggil tidak menyertakan p_token, periksa apakah akun ini memiliki undangan berbasis token
    IF EXISTS (
      SELECT 1 FROM public.tenant_invitations ti
      WHERE (ti.user_id = v_caller_id OR LOWER(ti.email) = LOWER(COALESCE(v_caller_email, '')))
        AND (p_organization_id IS NULL OR ti.organization_id = p_organization_id)
    ) THEN
      RAISE EXCEPTION 'INVITATION_TOKEN_REQUIRED: Aktivasi undangan wajib menyertakan token undangan yang sah.';
    END IF;

    SELECT * INTO v_grant
    FROM public.access_grants ag
    WHERE ag.user_id = v_caller_id
      AND (p_organization_id IS NULL OR ag.organization_id = p_organization_id)
    ORDER BY CASE WHEN ag.status = 'invited' THEN 1 ELSE 2 END, ag.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_grant.id IS NULL THEN
    RAISE EXCEPTION 'INVITATION_INVALID: Data grant undangan tidak ditemukan.';
  END IF;

  IF v_grant.status = 'revoked' THEN
    RAISE EXCEPTION 'INVITATION_REVOKED: Hak akses undangan ini telah dicabut.';
  END IF;

  IF v_grant.status = 'suspended' THEN
    RAISE EXCEPTION 'INVITATION_SUSPENDED: Akun Anda sedang ditangguhkan.';
  END IF;

  IF v_grant.status = 'active' THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_USED: Undangan ini telah diaktifkan sebelumnya dan tidak dapat digunakan ulang.';
  END IF;

  IF v_grant.expires_at IS NOT NULL AND v_grant.expires_at <= now() THEN
    RAISE EXCEPTION 'INVITATION_EXPIRED: Masa berlaku undangan telah kedaluwarsa.';
  END IF;

  IF v_grant.invited_email IS NOT NULL
     AND LOWER(TRIM(v_grant.invited_email)) <> LOWER(TRIM(COALESCE(v_caller_email, '')))
  THEN
    RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH: Email akun tidak cocok dengan email tujuan undangan.';
  END IF;

  -- 2. Validasi organisasi target (jika grant tenant)
  IF v_grant.organization_id IS NOT NULL THEN
    SELECT * INTO v_org
    FROM public.organizations o
    WHERE o.id = v_grant.organization_id
    FOR UPDATE;

    IF v_org.id IS NULL THEN
      RAISE EXCEPTION 'TENANT_NOT_FOUND: Organisasi/lembaga tujuan tidak ditemukan.';
    END IF;

    IF v_org.status IN ('suspended', 'archived') THEN
      RAISE EXCEPTION 'TENANT_INACTIVE: Lembaga "%" sedang berstatus % sehingga aktivasi akun tidak dapat dilanjutkan.', v_org.name, v_org.status;
    END IF;
  END IF;

  -- 3. Tandai token undangan sebagai accepted (sekali pakai)
  IF v_inv.id IS NOT NULL THEN
    UPDATE public.tenant_invitations
    SET status = 'accepted',
        user_id = v_caller_id,
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_inv.id;
  END IF;

  -- 4. Aktifkan grant pada access_grants (trigger trg_sync_grant_to_legacy_profile otomatis menyinkronkan profiles & user_profiles)
  UPDATE public.access_grants
  SET status = 'active',
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_grant.id;

  -- 5. Jika role yang diaktifkan adalah Admin dan tenant masih berstatus provisioning / provisioning_failed,
  --    ubah status tenant menjadi active secara operasional!
  IF v_grant.organization_id IS NOT NULL AND v_grant.role = 'admin' THEN
    UPDATE public.organizations
    SET status = CASE
          WHEN status IN ('provisioning', 'provisioning_failed') THEN 'active'
          ELSE status
        END,
        setup_state = COALESCE(setup_state, '{}'::jsonb) || jsonb_build_object(
          'hasAdminAssigned', true,
          'provisioningState', 'active',
          'adminActivatedAt', now()
        ),
        updated_at = now()
    WHERE id = v_grant.organization_id;
  END IF;

  -- 6. Jika undangan Musammi memiliki tautan ke master musammi, pastikan tertaut ke user_id
  v_musammi_id := COALESCE(v_inv.musammi_id, v_grant.musammi_id);
  IF v_musammi_id IS NOT NULL AND v_grant.organization_id IS NOT NULL THEN
    UPDATE public.musammi
    SET user_id = v_caller_id
    WHERE id = v_musammi_id
      AND organization_id = v_grant.organization_id
      AND (user_id IS NULL OR user_id = v_caller_id);

    UPDATE public.musammi_staff
    SET user_id = v_caller_id,
        updated_at = now()
    WHERE legacy_musammi_id = v_musammi_id
      AND organization_id = v_grant.organization_id
      AND (user_id IS NULL OR user_id = v_caller_id);
  END IF;

  -- 7. Catat ke audit_logs
  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, after_state
  )
  VALUES (
    v_grant.organization_id,
    v_caller_id,
    v_grant.role,
    'invitation.accepted',
    'access_grants',
    v_grant.id::text,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'role', v_grant.role,
      'status', 'active',
      'organization_id', v_grant.organization_id,
      'musammi_id', v_musammi_id,
      'accepted_at', now()
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant.id,
    'invitation_id', v_inv.id,
    'organization_id', v_grant.organization_id,
    'role', v_grant.role,
    'status', 'active',
    'accepted_at', now()
  );
END;
$$;

-- 2.5 RPC Pencabutan Undangan (Revoke Invitation) oleh Superadmin / Admin Lembaga
CREATE OR REPLACE FUNCTION public.rpc_revoke_invitation(
  p_invitation_id uuid DEFAULT NULL,
  p_grant_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_super boolean;
  v_inv public.tenant_invitations%ROWTYPE;
  v_grant public.access_grants%ROWTYPE;
  v_org_id uuid;
  v_target_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi autentikasi diperlukan.';
  END IF;

  v_is_super := public.is_super_admin();

  IF p_invitation_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.tenant_invitations WHERE id = p_invitation_id FOR UPDATE;
  END IF;

  IF p_grant_id IS NOT NULL THEN
    SELECT * INTO v_grant FROM public.access_grants WHERE id = p_grant_id FOR UPDATE;
  ELSIF v_inv.access_grant_id IS NOT NULL THEN
    SELECT * INTO v_grant FROM public.access_grants WHERE id = v_inv.access_grant_id FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL AND v_grant.id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM public.tenant_invitations
    WHERE access_grant_id = v_grant.id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL AND v_grant.id IS NULL THEN
    RAISE EXCEPTION 'Data undangan atau grant tidak ditemukan.';
  END IF;

  v_org_id := COALESCE(v_inv.organization_id, v_grant.organization_id);
  v_target_role := COALESCE(v_inv.role, v_grant.role);

  IF NOT v_is_super THEN
    IF v_org_id IS NULL OR NOT public.is_admin_of_org(v_org_id) THEN
      RAISE EXCEPTION 'Forbidden: Anda tidak memiliki otorisasi Admin pada lembaga ini.';
    END IF;
    IF v_target_role <> 'musammi' THEN
      RAISE EXCEPTION 'Forbidden: Admin Lembaga hanya dapat mencabut undangan untuk role Musammi.';
    END IF;
  END IF;

  IF v_inv.id IS NOT NULL THEN
    UPDATE public.tenant_invitations
    SET status = 'revoked',
        revoked_at = now(),
        updated_at = now()
    WHERE id = v_inv.id;
  END IF;

  IF v_grant.id IS NOT NULL THEN
    UPDATE public.access_grants
    SET status = 'revoked',
        revoked_at = now(),
        updated_at = now()
    WHERE id = v_grant.id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id,
    v_caller_id,
    CASE WHEN v_is_super THEN 'superadmin' ELSE 'admin' END,
    'invitation.revoked',
    'tenant_invitations',
    COALESCE(v_inv.id::text, v_grant.id::text),
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Pencabutan undangan akses'),
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'grant_id', v_grant.id,
      'email', COALESCE(v_inv.email, v_grant.invited_email),
      'role', v_target_role,
      'status', 'revoked'
    )
  );

  RETURN jsonb_build_object(
    'invitation_id', v_inv.id,
    'grant_id', v_grant.id,
    'status', 'revoked'
  );
END;
$$;

-- ---------------------------------------------------------------------------------
-- FASE 3: INTEGRASI & NOTIFIKASI HARDENING
-- ---------------------------------------------------------------------------------

-- 3.1 Perluas metadata integration_secrets (rotasi token & status penonaktifan)
ALTER TABLE public.integration_secrets
  ADD COLUMN IF NOT EXISTS rotation_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Cabut akses langsung client ke integration_secrets (hanya boleh lewat service_role API)
DROP POLICY IF EXISTS integration_secrets_admin ON public.integration_secrets;
DROP POLICY IF EXISTS integration_secrets_no_direct_client ON public.integration_secrets;
CREATE POLICY integration_secrets_no_direct_client ON public.integration_secrets
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.integration_secrets TO service_role;

-- 3.1b Trigger Pencegahan Penyimpanan Token Plaintext di app_settings
CREATE OR REPLACE FUNCTION public.sanitize_app_settings_secret_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
BEGIN
  IF UPPER(COALESCE(NEW.key, '')) IN ('TELEGRAM_BOT_TOKEN', 'FONNTE_API_TOKEN', 'TELEGRAM_WEBHOOK_SECRET')
     OR UPPER(COALESCE(NEW.key, '')) ~ '(BOT_TOKEN|API_TOKEN|WEBHOOK_SECRET|SECRET_KEY|API_KEY)' THEN
    v_clean := TRIM(COALESCE(NEW.value, ''));
    IF v_clean <> '' AND POSITION('••' IN v_clean) = 0 AND POSITION('**' IN v_clean) = 0 THEN
      IF LENGTH(v_clean) > 6 THEN
        NEW.value := LEFT(v_clean, 3) || '••••••' || RIGHT(v_clean, 3);
      ELSE
        NEW.value := '••••••••';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_app_settings_secrets ON public.app_settings;
CREATE TRIGGER trg_sanitize_app_settings_secrets
BEFORE INSERT OR UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_app_settings_secret_values();

-- Bersihkan sisa plaintext jika masih ada di app_settings
UPDATE public.app_settings
SET value = CASE
  WHEN LENGTH(TRIM(COALESCE(value, ''))) > 6
    THEN LEFT(TRIM(value), 3) || '••••••' || RIGHT(TRIM(value), 3)
  ELSE '••••••••'
END
WHERE UPPER(key) IN ('TELEGRAM_BOT_TOKEN', 'FONNTE_API_TOKEN', 'TELEGRAM_WEBHOOK_SECRET')
  AND COALESCE(TRIM(value), '') <> ''
  AND POSITION('••' IN value) = 0;

-- 3.1c RPC Metadata Secret (Memisahkan pembacaan metadata dari nilai secret mentah)
DROP FUNCTION IF EXISTS public.rpc_get_integration_secrets_metadata(uuid);
CREATE OR REPLACE FUNCTION public.rpc_get_integration_secrets_metadata(
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  provider text,
  secret_key_name text,
  masked_preview text,
  status text,
  rotation_count integer,
  last_rotated_at timestamptz,
  disabled_at timestamptz,
  updated_by uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_org uuid;
  v_can_read boolean := false;
BEGIN
  v_target_org := COALESCE(p_organization_id, public.get_my_org_id());
  IF v_target_org IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Konteks organisasi wajib disertakan.';
  END IF;

  IF public.is_super_admin() THEN
    v_can_read := public.has_active_support_session(v_target_org, false) OR (v_target_org = public.get_my_org_id());
  ELSE
    v_can_read := (public.get_role_for_org(v_target_org) = 'admin');
  END IF;

  IF NOT v_can_read THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga atau Superadmin dengan sesi support aktif yang dapat melihat metadata integrasi.';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.organization_id,
    s.provider,
    s.secret_key_name,
    s.masked_preview,
    s.status,
    s.rotation_count,
    s.last_rotated_at,
    s.disabled_at,
    s.updated_by,
    s.updated_at
  FROM public.integration_secrets s
  WHERE s.organization_id = v_target_org
  ORDER BY s.provider ASC, s.secret_key_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_integration_secrets_metadata(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_integration_secrets_metadata(uuid) TO authenticated, service_role;

-- 3.2 Tenant-aware rpc_link_telegram_chat_id (Penautan publik tanpa verifikasi Admin dinonaktifkan)
DROP FUNCTION IF EXISTS public.rpc_link_telegram_chat_id(text, text);
DROP FUNCTION IF EXISTS public.rpc_link_telegram_chat_id(text, text, uuid);
CREATE OR REPLACE FUNCTION public.rpc_link_telegram_chat_id(
    p_identifier text,
    p_chat_id text,
    p_org_id uuid DEFAULT NULL
)
RETURNS TABLE(id bigint, nama text, kelas text, organization_id uuid, already_linked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_santri RECORD;
    v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org_id());
    IF v_target_org IS NULL THEN
        RAISE EXCEPTION 'Organization context is required to link Telegram chat ID.';
    END IF;

    -- Karena portal Wali Santri ditunda, penautan publik tanpa verifikasi Admin dinonaktifkan.
    IF auth.uid() IS NULL OR NOT public.is_admin_of_org(v_target_org) THEN
        RAISE EXCEPTION 'Forbidden: Penautan Chat ID Telegram secara publik tanpa verifikasi Admin dinonaktifkan.';
    END IF;

    SELECT s.id, s.nama, s.kelas, s.organization_id, s.telegram_chat_id
    INTO v_santri
    FROM public.santri s
    WHERE s.organization_id = v_target_org
      AND (s.id::text = TRIM(p_identifier) OR LOWER(COALESCE(s.kode, '')) = LOWER(TRIM(p_identifier)))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_santri.telegram_chat_id = p_chat_id THEN
        RETURN QUERY SELECT v_santri.id, v_santri.nama, v_santri.kelas, v_santri.organization_id, true;
    ELSE
        UPDATE public.santri
        SET telegram_chat_id = p_chat_id
        WHERE public.santri.id = v_santri.id
          AND public.santri.organization_id = v_target_org;

        INSERT INTO public.audit_logs (
          organization_id, actor_user_id, actor_id, actor_role,
          action, entity_type, resource_type, entity_id, resource_id,
          reason, after_state
        ) VALUES (
          v_target_org, auth.uid(), auth.uid(), 'admin',
          'LINK_TELEGRAM_CHAT_ID', 'santri', 'santri', v_santri.id::text, v_santri.id::text,
          'Penautan Chat ID Telegram terverifikasi oleh Admin',
          jsonb_build_object('santri_id', v_santri.id, 'telegram_chat_id', p_chat_id)
        );

        RETURN QUERY SELECT v_santri.id, v_santri.nama, v_santri.kelas, v_santri.organization_id, false;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_link_telegram_chat_id(text, text, uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_link_telegram_chat_id(text, text, uuid) TO service_role;


-- ---------------------------------------------------------------------------------
-- FASE 4: FONDASI AKADEMIK & DATA MASTER HARDENING (CANONICAL V2 DATA)
-- ---------------------------------------------------------------------------------

-- 4.0 Jaminan Maksimal Satu Tahun Ajaran Aktif per Organisasi & Satu Semester Aktif per Tahun Ajaran
WITH ranked_active_ay AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY id DESC) AS rn
  FROM public.academic_years
  WHERE is_active = true
)
UPDATE public.academic_years ay
SET is_active = false,
    status = CASE WHEN ay.status = 'closed' OR ay.lifecycle_status = 'closed' THEN 'closed' ELSE 'setup' END,
    lifecycle_status = CASE WHEN ay.status = 'closed' OR ay.lifecycle_status = 'closed' THEN 'closed' ELSE 'setup' END
FROM ranked_active_ay r
WHERE ay.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_academic_year_per_org
  ON public.academic_years(organization_id)
  WHERE is_active = true;

WITH ranked_active_sem AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY organization_id, academic_year_id ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
  FROM public.semesters
  WHERE is_active = true
)
UPDATE public.semesters s
SET is_active = false
FROM ranked_active_sem r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_semester_per_ay
  ON public.semesters(organization_id, academic_year_id)
  WHERE is_active = true;

-- 4.1 Kompatibilitas & Integritas student_enrollments (Kanonikal V2 <-> student_classes)
ALTER TABLE public.student_enrollments
  ADD COLUMN IF NOT EXISTS santri_id bigint,
  ADD COLUMN IF NOT EXISTS marhalah_id uuid,
  ADD COLUMN IF NOT EXISTS kelas_id uuid,
  ADD COLUMN IF NOT EXISTS master_marhalah_id bigint REFERENCES public.master_marhalah(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS master_kelas_id bigint REFERENCES public.master_kelas_relasi(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marhalah text,
  ADD COLUMN IF NOT EXISTS kelas text,
  ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS enrolled_at date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS left_at date,
  ADD COLUMN IF NOT EXISTS notes text;

-- Perluas CHECK status pada student_enrollments agar mendukung 'promoted' dan 'inactive' selain 'active', 'transferred', 'graduated', 'withdrawn'
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.student_enrollments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.student_enrollments DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.student_enrollments
  ADD CONSTRAINT chk_student_enrollments_status_valid
  CHECK (status IN ('active', 'promoted', 'transferred', 'graduated', 'withdrawn', 'inactive'));

ALTER TABLE public.student_enrollments
  DROP CONSTRAINT IF EXISTS chk_student_enrollments_dates_valid;
ALTER TABLE public.student_enrollments
  ADD CONSTRAINT chk_student_enrollments_dates_valid
  CHECK (left_at IS NULL OR enrolled_at IS NULL OR left_at >= enrolled_at);

CREATE OR REPLACE FUNCTION public.normalize_student_enrollments_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_santri_org uuid;
  v_ay_org uuid;
BEGIN
  -- Sinkronisasi alias kolom student_id <-> santri_id
  NEW.student_id := COALESCE(NEW.student_id, NEW.santri_id);
  NEW.santri_id := COALESCE(NEW.santri_id, NEW.student_id);

  IF NEW.student_id IS NULL THEN
    RAISE EXCEPTION 'student_id wajib diisi pada student_enrollments';
  END IF;

  -- Validasi lintas-tenant: pastikan santri dan tahun ajaran milik organization_id yang sama
  SELECT organization_id INTO v_santri_org FROM public.santri WHERE id = NEW.student_id;
  IF v_santri_org IS NOT NULL AND NEW.organization_id IS NOT NULL AND v_santri_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Tenant isolation violation: santri % bukan milik organisasi %', NEW.student_id, NEW.organization_id;
  END IF;
  NEW.organization_id := COALESCE(NEW.organization_id, v_santri_org);

  IF NEW.academic_year_id IS NOT NULL THEN
    SELECT organization_id INTO v_ay_org FROM public.academic_years WHERE id = NEW.academic_year_id;
    IF v_ay_org IS NOT NULL AND NEW.organization_id IS NOT NULL AND v_ay_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Tenant isolation violation: academic_year % bukan milik organisasi %', NEW.academic_year_id, NEW.organization_id;
    END IF;
  END IF;

  NEW.class_id := COALESCE(NEW.class_id, NEW.kelas_id);
  NEW.kelas_id := COALESCE(NEW.kelas_id, NEW.class_id);

  -- Resolusi nama marhalah & kelas otomatis bila master_marhalah_id / master_kelas_id diberikan
  IF NEW.master_marhalah_id IS NOT NULL AND (NEW.marhalah IS NULL OR TRIM(NEW.marhalah) = '') THEN
    SELECT nama INTO NEW.marhalah
    FROM public.master_marhalah
    WHERE id = NEW.master_marhalah_id AND organization_id = NEW.organization_id;
  END IF;

  IF NEW.master_kelas_id IS NOT NULL AND (NEW.kelas IS NULL OR TRIM(NEW.kelas) = '') THEN
    SELECT nama_kelas INTO NEW.kelas
    FROM public.master_kelas_relasi
    WHERE id = NEW.master_kelas_id AND organization_id = NEW.organization_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := COALESCE(NULLIF(TRIM(NEW.status), ''), NULLIF(TRIM(NEW.enrollment_status), ''), 'active');
    NEW.enrollment_status := NEW.status;
  ELSE
    IF NEW.enrollment_status IS DISTINCT FROM OLD.enrollment_status AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      NEW.status := NEW.enrollment_status;
    ELSE
      NEW.enrollment_status := COALESCE(NEW.status, 'active');
    END IF;
  END IF;

  IF NEW.status NOT IN ('active', 'promoted', 'transferred', 'graduated', 'withdrawn', 'inactive') THEN
    NEW.status := 'active';
    NEW.enrollment_status := 'active';
  END IF;

  NEW.enrolled_at := COALESCE(NEW.enrolled_at, CURRENT_DATE);
  IF NEW.status IN ('promoted', 'transferred', 'graduated', 'withdrawn') AND NEW.left_at IS NULL THEN
    NEW.left_at := CURRENT_DATE;
  END IF;
  IF NEW.left_at IS NOT NULL AND NEW.left_at < NEW.enrolled_at THEN
    RAISE EXCEPTION 'Tanggal keluar enrollment (left_at) tidak boleh sebelum tanggal masuk (enrolled_at)';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_student_enrollments ON public.student_enrollments;
CREATE TRIGGER trg_normalize_student_enrollments
BEFORE INSERT OR UPDATE ON public.student_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_student_enrollments_row();

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_org_student_year_uniq
  ON public.student_enrollments(organization_id, student_id, academic_year_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_org_year_student_uniq
  ON public.student_enrollments(organization_id, academic_year_id, student_id);

-- Sinkronisasi dua arah atomik antara student_enrollments (V2) dan student_classes (Legacy)
CREATE OR REPLACE FUNCTION public.sync_v2_enrollment_to_legacy_student_classes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_marhalah public.marhalah_enum;
  v_marhalah_text text;
  v_kelas_text text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_marhalah_text := COALESCE(NULLIF(TRIM(NEW.marhalah), ''), 'Mutawassithah');
  v_kelas_text := COALESCE(NULLIF(TRIM(NEW.kelas), ''), '-');

  IF v_marhalah_text IN ('Mutawassithah', 'Aliyah', 'Jamiah') THEN
    v_safe_marhalah := v_marhalah_text::public.marhalah_enum;
  ELSE
    v_safe_marhalah := 'Mutawassithah'::public.marhalah_enum;
  END IF;

  IF v_kelas_text <> '-' THEN
    INSERT INTO public.student_classes (
      organization_id, santri_id, academic_year_id, marhalah, kelas, marhalah_id, kelas_id
    ) VALUES (
      NEW.organization_id, NEW.student_id, NEW.academic_year_id, v_safe_marhalah, v_kelas_text, NEW.master_marhalah_id, NEW.master_kelas_id
    )
    ON CONFLICT (santri_id, academic_year_id) DO UPDATE
    SET marhalah = EXCLUDED.marhalah,
        kelas = EXCLUDED.kelas,
        marhalah_id = COALESCE(EXCLUDED.marhalah_id, public.student_classes.marhalah_id),
        kelas_id = COALESCE(EXCLUDED.kelas_id, public.student_classes.kelas_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_v2_enrollment_to_legacy ON public.student_enrollments;
CREATE TRIGGER trg_sync_v2_enrollment_to_legacy
AFTER INSERT OR UPDATE ON public.student_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_v2_enrollment_to_legacy_student_classes();

CREATE OR REPLACE FUNCTION public.sync_legacy_student_classes_to_v2_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.student_enrollments (
    organization_id, student_id, santri_id, academic_year_id,
    master_marhalah_id, master_kelas_id, marhalah, kelas,
    status, enrollment_status, enrolled_at
  ) VALUES (
    NEW.organization_id, NEW.santri_id, NEW.santri_id, NEW.academic_year_id,
    NEW.marhalah_id, NEW.kelas_id, NEW.marhalah::text, NEW.kelas,
    'active', 'active', CURRENT_DATE
  )
  ON CONFLICT (organization_id, student_id, academic_year_id) DO UPDATE
  SET master_marhalah_id = COALESCE(EXCLUDED.master_marhalah_id, public.student_enrollments.master_marhalah_id),
      master_kelas_id = COALESCE(EXCLUDED.master_kelas_id, public.student_enrollments.master_kelas_id),
      marhalah = COALESCE(EXCLUDED.marhalah, public.student_enrollments.marhalah),
      kelas = COALESCE(EXCLUDED.kelas, public.student_enrollments.kelas),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_legacy_student_classes_to_v2 ON public.student_classes;
CREATE TRIGGER trg_sync_legacy_student_classes_to_v2
AFTER INSERT OR UPDATE ON public.student_classes
FOR EACH ROW
EXECUTE FUNCTION public.sync_legacy_student_classes_to_v2_enrollment();


-- 4.1b Integritas & Sinkronisasi halaqah_student_memberships (Kanonikal V2 <-> halaqah_santri)
ALTER TABLE public.halaqah_student_memberships
  DROP CONSTRAINT IF EXISTS chk_hsm_dates_valid;
ALTER TABLE public.halaqah_student_memberships
  ADD CONSTRAINT chk_hsm_dates_valid
  CHECK (valid_to IS NULL OR valid_to >= valid_from);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_halaqah_student_membership
  ON public.halaqah_student_memberships(organization_id, halaqah_id, student_id)
  WHERE valid_to IS NULL AND status = 'active';

CREATE OR REPLACE FUNCTION public.validate_and_normalize_hsm_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_halaqah_org uuid;
  v_halaqah_ay bigint;
  v_santri_org uuid;
BEGIN
  SELECT organization_id, academic_year_id INTO v_halaqah_org, v_halaqah_ay
  FROM public.halaqah
  WHERE id = NEW.halaqah_id;

  IF v_halaqah_org IS NULL THEN
    RAISE EXCEPTION 'Halaqah % tidak ditemukan', NEW.halaqah_id;
  END IF;

  SELECT organization_id INTO v_santri_org
  FROM public.santri
  WHERE id = NEW.student_id;

  IF v_santri_org IS NULL THEN
    RAISE EXCEPTION 'Santri % tidak ditemukan', NEW.student_id;
  END IF;

  IF v_halaqah_org <> v_santri_org THEN
    RAISE EXCEPTION 'Tenant isolation violation: santri % dan halaqah % berasal dari organisasi berbeda', NEW.student_id, NEW.halaqah_id;
  END IF;

  NEW.organization_id := COALESCE(NEW.organization_id, v_halaqah_org);
  NEW.academic_year_id := COALESCE(NEW.academic_year_id, v_halaqah_ay);
  NEW.valid_from := COALESCE(NEW.valid_from, CURRENT_DATE);

  IF NEW.valid_to IS NOT NULL AND NEW.valid_to < NEW.valid_from THEN
    RAISE EXCEPTION 'Masa berlaku membership halaqah tidak valid: valid_to (%) tidak boleh sebelum valid_from (%)', NEW.valid_to, NEW.valid_from;
  END IF;

  IF NEW.status IN ('transferred', 'removed', 'completed', 'graduated') AND NEW.valid_to IS NULL THEN
    NEW.valid_to := CURRENT_DATE;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_hsm_row ON public.halaqah_student_memberships;
CREATE TRIGGER trg_validate_hsm_row
BEFORE INSERT OR UPDATE ON public.halaqah_student_memberships
FOR EACH ROW
EXECUTE FUNCTION public.validate_and_normalize_hsm_row();

CREATE OR REPLACE FUNCTION public.sync_v2_hsm_to_legacy_halaqah_santri()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_legacy_status text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_legacy_status := CASE
    WHEN NEW.status = 'active' AND NEW.valid_to IS NULL THEN 'Aktif'
    WHEN NEW.status = 'transferred' THEN 'Mutasi'
    ELSE 'Dikeluarkan dari Grup'
  END;

  INSERT INTO public.halaqah_santri (
    organization_id, halaqah_id, santri_id, start_date, end_date, status
  ) VALUES (
    NEW.organization_id, NEW.halaqah_id, NEW.student_id, NEW.valid_from, NEW.valid_to, v_legacy_status
  )
  ON CONFLICT (halaqah_id, santri_id) DO UPDATE
  SET start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      status = EXCLUDED.status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_v2_hsm_to_legacy ON public.halaqah_student_memberships;
CREATE TRIGGER trg_sync_v2_hsm_to_legacy
AFTER INSERT OR UPDATE ON public.halaqah_student_memberships
FOR EACH ROW
EXECUTE FUNCTION public.sync_v2_hsm_to_legacy_halaqah_santri();

CREATE OR REPLACE FUNCTION public.sync_legacy_halaqah_santri_to_v2_hsm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v2_status text;
  v_existing_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_v2_status := CASE
    WHEN COALESCE(NEW.status, 'Aktif') = 'Aktif' AND NEW.end_date IS NULL THEN 'active'
    WHEN NEW.status ILIKE '%mutasi%' THEN 'transferred'
    ELSE 'removed'
  END;

  SELECT id INTO v_existing_id
  FROM public.halaqah_student_memberships
  WHERE organization_id = NEW.organization_id
    AND halaqah_id = NEW.halaqah_id
    AND student_id = NEW.santri_id
  ORDER BY (valid_to IS NULL) DESC, valid_from DESC, created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.halaqah_student_memberships
    SET valid_from = COALESCE(NEW.start_date, valid_from, CURRENT_DATE),
        valid_to = CASE
          WHEN NEW.end_date IS NOT NULL AND NEW.end_date < COALESCE(NEW.start_date, valid_from, CURRENT_DATE)
            THEN COALESCE(NEW.start_date, valid_from, CURRENT_DATE)
          ELSE NEW.end_date
        END,
        status = v_v2_status,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.halaqah_student_memberships (
      organization_id, halaqah_id, student_id, valid_from, valid_to, status
    ) VALUES (
      NEW.organization_id,
      NEW.halaqah_id,
      NEW.santri_id,
      COALESCE(NEW.start_date, CURRENT_DATE),
      CASE
        WHEN NEW.end_date IS NOT NULL AND NEW.end_date < COALESCE(NEW.start_date, CURRENT_DATE)
          THEN COALESCE(NEW.start_date, CURRENT_DATE)
        ELSE NEW.end_date
      END,
      v_v2_status
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_legacy_halaqah_santri_to_v2 ON public.halaqah_santri;
CREATE TRIGGER trg_sync_legacy_halaqah_santri_to_v2
AFTER INSERT OR UPDATE ON public.halaqah_santri
FOR EACH ROW
EXECUTE FUNCTION public.sync_legacy_halaqah_santri_to_v2_hsm();


-- 4.2 Kompatibilitas & Validasi halaqah_musammi_assignments (assignment_type <-> is_primary)
ALTER TABLE public.halaqah_musammi_assignments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.halaqah_musammi_assignments
  DROP CONSTRAINT IF EXISTS chk_hma_dates_valid;
ALTER TABLE public.halaqah_musammi_assignments
  ADD CONSTRAINT chk_hma_dates_valid
  CHECK (valid_to IS NULL OR valid_to >= valid_from);

DROP INDEX IF EXISTS public.idx_hma_org_halaqah_musammi_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_primary_musammi_per_halaqah
  ON public.halaqah_musammi_assignments(organization_id, halaqah_id)
  WHERE is_active = true AND assignment_type = 'primary' AND valid_to IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hma_org_halaqah_musammi_type_uniq
  ON public.halaqah_musammi_assignments(organization_id, halaqah_id, musammi_id, assignment_type);

CREATE OR REPLACE FUNCTION public.normalize_hma_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_halaqah_org uuid;
  v_halaqah_ay bigint;
  v_musammi_org uuid;
  v_musammi_uid uuid;
BEGIN
  SELECT organization_id, academic_year_id INTO v_halaqah_org, v_halaqah_ay
  FROM public.halaqah
  WHERE id = NEW.halaqah_id;

  IF v_halaqah_org IS NULL THEN
    RAISE EXCEPTION 'Halaqah % tidak ditemukan', NEW.halaqah_id;
  END IF;

  IF NEW.musammi_id IS NOT NULL THEN
    SELECT organization_id, user_id INTO v_musammi_org, v_musammi_uid
    FROM public.musammi
    WHERE id = NEW.musammi_id;

    IF v_musammi_org IS NULL THEN
      RAISE EXCEPTION 'Musammi % tidak ditemukan', NEW.musammi_id;
    END IF;

    IF v_musammi_org <> v_halaqah_org THEN
      RAISE EXCEPTION 'Tenant isolation violation: Musammi % bukan berasal dari organisasi yang sama dengan Halaqah %', NEW.musammi_id, NEW.halaqah_id;
    END IF;

    NEW.musammi_user_id := COALESCE(NEW.musammi_user_id, v_musammi_uid);
  END IF;

  NEW.organization_id := COALESCE(NEW.organization_id, v_halaqah_org);
  NEW.academic_year_id := COALESCE(NEW.academic_year_id, v_halaqah_ay);
  NEW.valid_from := COALESCE(NEW.valid_from, CURRENT_DATE);

  IF NEW.valid_to IS NOT NULL AND NEW.valid_to < NEW.valid_from THEN
    RAISE EXCEPTION 'Masa berlaku penugasan Musammi tidak valid: valid_to (%) tidak boleh sebelum valid_from (%)', NEW.valid_to, NEW.valid_from;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.assignment_type IS NULL OR TRIM(NEW.assignment_type) = '' THEN
      NEW.assignment_type := CASE WHEN COALESCE(NEW.is_primary, true) THEN 'primary' ELSE 'substitute' END;
    END IF;
    NEW.is_primary := (NEW.assignment_type = 'primary');
  ELSE
    IF NEW.is_primary IS DISTINCT FROM OLD.is_primary AND NEW.assignment_type IS NOT DISTINCT FROM OLD.assignment_type THEN
      NEW.assignment_type := CASE WHEN NEW.is_primary THEN 'primary' ELSE 'substitute' END;
    ELSE
      NEW.is_primary := (NEW.assignment_type = 'primary');
    END IF;
  END IF;

  IF NEW.assignment_type NOT IN ('primary', 'substitute') THEN
    RAISE EXCEPTION 'assignment_type harus bernilai primary atau substitute';
  END IF;

  IF NEW.status IN ('ended', 'revoked') OR (NEW.valid_to IS NOT NULL AND NEW.valid_to < CURRENT_DATE) THEN
    NEW.is_active := false;
    IF NEW.status = 'active' THEN
      NEW.status := 'ended';
    END IF;
  ELSIF NEW.is_active = false AND NEW.status = 'active' THEN
    NEW.status := 'ended';
    NEW.valid_to := COALESCE(NEW.valid_to, CURRENT_DATE);
  ELSE
    NEW.status := COALESCE(NEW.status, 'active');
    NEW.is_active := (NEW.status = 'active');
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_hma_row ON public.halaqah_musammi_assignments;
CREATE TRIGGER trg_normalize_hma_row
BEFORE INSERT OR UPDATE ON public.halaqah_musammi_assignments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_hma_row();


-- 4.3 RPC Atomik Siklus Tahun Ajaran & Semester (Create, Configure Dates, Activate, Switch Semester, Close Semester, Check Prerequisites & Close Academic Year)
CREATE OR REPLACE FUNCTION public.rpc_set_active_academic_year(
  p_academic_year_id bigint,
  p_semester text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_sem text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_year.organization_id) THEN
    RAISE EXCEPTION 'Hanya Admin Lembaga yang dapat mengaktifkan Tahun Ajaran';
  END IF;

  IF v_year.status = 'closed' OR v_year.lifecycle_status = 'closed' THEN
    RAISE EXCEPTION 'Tahun ajaran yang sudah ditutup (closed) bersifat arsip permanen dan tidak dapat diaktifkan kembali.';
  END IF;

  v_sem := CASE
    WHEN COALESCE(NULLIF(TRIM(p_semester), ''), v_year.active_semester, 'Ganjil') = 'Genap' THEN 'Genap'
    ELSE 'Ganjil'
  END;

  -- Nonaktifkan tahun ajaran lain pada organisasi ini terlebih dahulu agar memenuhi uq_one_active_academic_year_per_org
  UPDATE public.academic_years
  SET is_active = false,
      status = CASE WHEN status = 'closed' OR lifecycle_status = 'closed' THEN 'closed' ELSE 'setup' END,
      lifecycle_status = CASE WHEN status = 'closed' OR lifecycle_status = 'closed' THEN 'closed' ELSE 'setup' END
  WHERE organization_id = v_year.organization_id
    AND id <> p_academic_year_id
    AND is_active = true;

  UPDATE public.academic_years
  SET is_active = true,
      active_semester = v_sem,
      status = 'active',
      lifecycle_status = 'active'
  WHERE id = p_academic_year_id;

  UPDATE public.semesters
  SET is_active = false
  WHERE organization_id = v_year.organization_id
    AND is_active = true;

  INSERT INTO public.semesters (organization_id, academic_year_id, name, is_active, status)
  VALUES
    (v_year.organization_id, p_academic_year_id, 'Ganjil', false, 'active'),
    (v_year.organization_id, p_academic_year_id, 'Genap', false, 'active')
  ON CONFLICT (organization_id, academic_year_id, name) DO NOTHING;

  UPDATE public.semesters
  SET is_active = (name = v_sem),
      status = CASE WHEN status = 'closed' AND name <> v_sem THEN 'closed' ELSE 'active' END
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, actor_id, actor_role, action, entity_type, resource_type, entity_id, resource_id, after_state
  )
  VALUES (
    v_year.organization_id, auth.uid(), auth.uid(), COALESCE(public.get_role_for_org(v_year.organization_id), 'admin'),
    'activate_academic_year', 'academic_years', 'academic_years', p_academic_year_id::text, p_academic_year_id::text,
    jsonb_build_object('name', v_year.name, 'active_semester', v_sem, 'status', 'active')
  );

  RETURN jsonb_build_object('id', p_academic_year_id, 'name', v_year.name, 'active_semester', v_sem, 'status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_active_semester(
  p_academic_year_id bigint,
  p_semester text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_sem text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_year.organization_id) THEN
    RAISE EXCEPTION 'Hanya Admin Lembaga yang dapat mengubah semester aktif';
  END IF;

  IF v_year.status = 'closed' OR v_year.lifecycle_status = 'closed' THEN
    RAISE EXCEPTION 'Tahun ajaran yang sudah ditutup tidak dapat diubah semesternya';
  END IF;

  v_sem := CASE WHEN TRIM(COALESCE(p_semester, '')) = 'Genap' THEN 'Genap' ELSE 'Ganjil' END;

  UPDATE public.academic_years
  SET active_semester = v_sem
  WHERE id = p_academic_year_id;

  INSERT INTO public.semesters (organization_id, academic_year_id, name, is_active, status)
  VALUES
    (v_year.organization_id, p_academic_year_id, 'Ganjil', false, 'active'),
    (v_year.organization_id, p_academic_year_id, 'Genap', false, 'active')
  ON CONFLICT (organization_id, academic_year_id, name) DO NOTHING;

  UPDATE public.semesters
  SET is_active = false
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND is_active = true;

  UPDATE public.semesters
  SET is_active = true,
      status = 'active'
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND name = v_sem;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, actor_id, actor_role, action, entity_type, resource_type, entity_id, resource_id, after_state
  ) VALUES (
    v_year.organization_id, auth.uid(), auth.uid(), COALESCE(public.get_role_for_org(v_year.organization_id), 'admin'),
    'switch_active_semester', 'academic_years', 'academic_years', p_academic_year_id::text, p_academic_year_id::text,
    jsonb_build_object('academic_year_id', p_academic_year_id, 'active_semester', v_sem)
  );

  RETURN jsonb_build_object('id', p_academic_year_id, 'active_semester', v_sem);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_close_semester(
  p_academic_year_id bigint,
  p_semester text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_sem text;
  v_sem_id uuid;
  v_open_sessions integer := 0;
  v_unreviewed_recitations integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_year.organization_id) THEN
    RAISE EXCEPTION 'Hanya Admin Lembaga yang dapat menutup semester';
  END IF;

  v_sem := CASE WHEN TRIM(COALESCE(p_semester, '')) = 'Genap' THEN 'Genap' ELSE 'Ganjil' END;

  SELECT id INTO v_sem_id
  FROM public.semesters
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND name = v_sem
  LIMIT 1;

  IF v_sem_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_open_sessions
    FROM public.halaqah_sessions
    WHERE organization_id = v_year.organization_id
      AND academic_year_id = p_academic_year_id
      AND semester_id = v_sem_id
      AND status IN ('scheduled', 'open', 'submitted');

    SELECT COUNT(*) INTO v_unreviewed_recitations
    FROM public.recitation_entries
    WHERE organization_id = v_year.organization_id
      AND academic_year_id = p_academic_year_id
      AND semester_id = v_sem_id
      AND status IN ('draft', 'submitted', 'returned');
  END IF;

  IF v_open_sessions > 0 OR v_unreviewed_recitations > 0 THEN
    RAISE EXCEPTION 'Semester % belum dapat ditutup: masih terdapat % sesi terbuka dan % setoran yang belum direview.',
      v_sem, v_open_sessions, v_unreviewed_recitations;
  END IF;

  UPDATE public.semesters
  SET is_active = false,
      status = 'closed',
      updated_at = now()
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND name = v_sem;

  -- Bila yang ditutup adalah Semester Ganjil pada tahun ajaran aktif, alihkan semester aktif ke Genap
  IF v_sem = 'Ganjil' AND v_year.is_active THEN
    UPDATE public.academic_years
    SET active_semester = 'Genap'
    WHERE id = p_academic_year_id;

    UPDATE public.semesters
    SET is_active = true,
        status = 'active'
    WHERE organization_id = v_year.organization_id
      AND academic_year_id = p_academic_year_id
      AND name = 'Genap';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, actor_id, actor_role, action, entity_type, resource_type, entity_id, resource_id, reason, after_state
  ) VALUES (
    v_year.organization_id, auth.uid(), auth.uid(), COALESCE(public.get_role_for_org(v_year.organization_id), 'admin'),
    'close_semester', 'semesters', 'semesters', COALESCE(v_sem_id::text, p_academic_year_id::text), COALESCE(v_sem_id::text, p_academic_year_id::text),
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Penutupan Semester ' || v_sem || ' TA ' || v_year.name),
    jsonb_build_object('academic_year_id', p_academic_year_id, 'semester', v_sem, 'status', 'closed')
  );

  RETURN jsonb_build_object('academic_year_id', p_academic_year_id, 'closed_semester', v_sem, 'status', 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_academic_year(
  p_id bigint DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_active_semester text DEFAULT 'Ganjil',
  p_status text DEFAULT 'setup',
  p_ganjil_start date DEFAULT NULL,
  p_ganjil_end date DEFAULT NULL,
  p_genap_start date DEFAULT NULL,
  p_genap_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_ay_id bigint;
  v_sem text;
  v_status text;
  v_start_date date;
  v_end_date date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id FROM public.academic_years WHERE id = p_id;
  ELSE
    v_org_id := public.get_my_org_id();
  END IF;

  IF v_org_id IS NULL OR NOT public.is_admin_of_org(v_org_id) THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga yang dapat mengelola Tahun Ajaran';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Nama Tahun Ajaran wajib diisi';
  END IF;

  IF p_ganjil_start IS NOT NULL AND p_ganjil_end IS NOT NULL AND p_ganjil_end < p_ganjil_start THEN
    RAISE EXCEPTION 'Tanggal berakhir Semester Ganjil tidak boleh sebelum tanggal mulai';
  END IF;

  IF p_genap_start IS NOT NULL AND p_genap_end IS NOT NULL AND p_genap_end < p_genap_start THEN
    RAISE EXCEPTION 'Tanggal berakhir Semester Genap tidak boleh sebelum tanggal mulai';
  END IF;

  v_sem := CASE WHEN TRIM(COALESCE(p_active_semester, '')) = 'Genap' THEN 'Genap' ELSE 'Ganjil' END;
  v_status := CASE
    WHEN p_status IN ('draft', 'setup', 'active', 'closing') THEN p_status
    ELSE 'setup'
  END;
  v_start_date := COALESCE(p_ganjil_start, p_genap_start);
  v_end_date := COALESCE(p_genap_end, p_ganjil_end);

  IF p_id IS NOT NULL THEN
    UPDATE public.academic_years
    SET name = TRIM(p_name),
        active_semester = v_sem,
        status = CASE WHEN v_status = 'active' THEN status ELSE v_status END,
        lifecycle_status = CASE WHEN v_status = 'active' THEN lifecycle_status ELSE v_status END,
        start_date = COALESCE(v_start_date, start_date),
        end_date = COALESCE(v_end_date, end_date)
    WHERE id = p_id
      AND organization_id = v_org_id
    RETURNING id INTO v_ay_id;
  ELSE
    INSERT INTO public.academic_years (
      organization_id, name, active_semester, is_active, status, lifecycle_status, start_date, end_date
    ) VALUES (
      v_org_id, TRIM(p_name), v_sem, false,
      CASE WHEN v_status = 'active' THEN 'setup' ELSE v_status END,
      CASE WHEN v_status = 'active' THEN 'setup' ELSE v_status END,
      v_start_date, v_end_date
    )
    RETURNING id INTO v_ay_id;
  END IF;

  INSERT INTO public.semesters (organization_id, academic_year_id, name, start_date, end_date, is_active, status)
  VALUES
    (v_org_id, v_ay_id, 'Ganjil', p_ganjil_start, p_ganjil_end, false, 'active'),
    (v_org_id, v_ay_id, 'Genap', p_genap_start, p_genap_end, false, 'active')
  ON CONFLICT (organization_id, academic_year_id, name) DO UPDATE
  SET start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      updated_at = now();

  IF v_status = 'active' THEN
    PERFORM public.rpc_set_active_academic_year(v_ay_id, v_sem);
  END IF;

  RETURN jsonb_build_object(
    'id', v_ay_id,
    'organization_id', v_org_id,
    'name', TRIM(p_name),
    'active_semester', v_sem,
    'status', v_status
  );
END;
$$;

-- 4.3b Pemeriksaan Prasyarat Penutupan Tahun Ajaran (6 Prasyarat Wajib Fase 4)
CREATE OR REPLACE FUNCTION public.rpc_check_academic_year_closing_readiness(
  p_academic_year_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_unfinished_sessions integer := 0;
  v_unreviewed_recitations integer := 0;
  v_unreviewed_legacy_setoran integer := 0;
  v_incomplete_exams integer := 0;
  v_unfinished_remedials integer := 0;
  v_unpublished_reports integer := 0;
  v_unreconciled_enrollments integer := 0;
  v_total_blockers integer := 0;
BEGIN
  SELECT * INTO v_year FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran tidak ditemukan';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_admin_of_org(v_year.organization_id) THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga yang dapat memeriksa kesiapan penutupan Tahun Ajaran';
  END IF;

  -- 1. Sesi halaqah yang belum selesai/dikunci
  SELECT COUNT(*) INTO v_unfinished_sessions
  FROM public.halaqah_sessions
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('scheduled', 'open', 'submitted');

  -- 2. Setoran yang belum direview (V2 recitation_entries + legacy setoran_harian pada TA ini)
  SELECT COUNT(*) INTO v_unreviewed_recitations
  FROM public.recitation_entries
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('draft', 'submitted', 'returned');

  SELECT COUNT(*) INTO v_unreviewed_legacy_setoran
  FROM public.setoran_harian
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status_verifikasi IN ('draft', 'submitted', 'returned');

  v_unreviewed_recitations := v_unreviewed_recitations + v_unreviewed_legacy_setoran;

  -- 3. Ujian yang belum lengkap/final
  SELECT COUNT(*) INTO v_incomplete_exams
  FROM public.exams
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('draft', 'open');

  -- 4. Remedial yang belum selesai (attempt yang mewajibkan remedial namun belum ada attempt remedial lulus)
  SELECT COUNT(*) INTO v_unfinished_remedials
  FROM public.exam_attempts ea
  JOIN public.exams e ON e.id = ea.exam_id
  WHERE ea.organization_id = v_year.organization_id
    AND e.academic_year_id = p_academic_year_id
    AND ea.remedial_required = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_attempts r
      WHERE r.exam_id = ea.exam_id
        AND r.student_id = ea.student_id
        AND r.attempt_no > ea.attempt_no
        AND (r.passed = true OR r.remedial_required = false)
    );

  -- 5. Raport yang masih berstatus draft (belum diterbitkan/published)
  SELECT COUNT(*) INTO v_unpublished_reports
  FROM public.report_cards
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status = 'draft';

  -- 6. Enrollment santri yang belum direkonsiliasi (ada di student_classes tapi belum ada di student_enrollments, atau santri aktif tanpa enrollment bila tahun ajaran sedang aktif)
  SELECT COUNT(*) INTO v_unreconciled_enrollments
  FROM public.student_classes sc
  WHERE sc.organization_id = v_year.organization_id
    AND sc.academic_year_id = p_academic_year_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_enrollments se
      WHERE se.organization_id = sc.organization_id
        AND se.academic_year_id = sc.academic_year_id
        AND se.student_id = sc.santri_id
    );

  v_total_blockers :=
    v_unfinished_sessions +
    v_unreviewed_recitations +
    v_incomplete_exams +
    v_unfinished_remedials +
    v_unpublished_reports +
    v_unreconciled_enrollments;

  RETURN jsonb_build_object(
    'academic_year_id', p_academic_year_id,
    'academic_year_name', v_year.name,
    'can_close', (v_total_blockers = 0),
    'total_blockers', v_total_blockers,
    'counts', jsonb_build_object(
      'unfinished_sessions', v_unfinished_sessions,
      'unreviewed_recitations', v_unreviewed_recitations,
      'incomplete_exams', v_incomplete_exams,
      'unfinished_remedials', v_unfinished_remedials,
      'unpublished_report_cards', v_unpublished_reports,
      'unreconciled_enrollments', v_unreconciled_enrollments
    ),
    'prerequisites', jsonb_build_array(
      jsonb_build_object(
        'key', 'unfinished_sessions',
        'label', 'Seluruh sesi halaqah telah diselesaikan dan dikunci (locked)',
        'count', v_unfinished_sessions,
        'passed', (v_unfinished_sessions = 0)
      ),
      jsonb_build_object(
        'key', 'unreviewed_recitations',
        'label', 'Seluruh setoran hafalan telah direview (tidak ada draft/submitted/returned)',
        'count', v_unreviewed_recitations,
        'passed', (v_unreviewed_recitations = 0)
      ),
      jsonb_build_object(
        'key', 'incomplete_exams',
        'label', 'Seluruh pelaksanaan ujian telah difinalisasi',
        'count', v_incomplete_exams,
        'passed', (v_incomplete_exams = 0)
      ),
      jsonb_build_object(
        'key', 'unfinished_remedials',
        'label', 'Seluruh kewajiban remedial santri telah dituntaskan',
        'count', v_unfinished_remedials,
        'passed', (v_unfinished_remedials = 0)
      ),
      jsonb_build_object(
        'key', 'unpublished_report_cards',
        'label', 'Tidak ada draft raport yang belum diterbitkan (published)',
        'count', v_unpublished_reports,
        'passed', (v_unpublished_reports = 0)
      ),
      jsonb_build_object(
        'key', 'unreconciled_enrollments',
        'label', 'Data enrollment santri telah terekonsiliasi penuh pada tabel V2',
        'count', v_unreconciled_enrollments,
        'passed', (v_unreconciled_enrollments = 0)
      )
    )
  );
END;
$$;

-- 4.3c Penutupan Tahun Ajaran yang Menegakkan Prasyarat (Menolak jika masih ada blocker)
DROP FUNCTION IF EXISTS public.rpc_close_academic_year(bigint);
DROP FUNCTION IF EXISTS public.rpc_close_academic_year(bigint, text);
CREATE OR REPLACE FUNCTION public.rpc_close_academic_year(
  p_academic_year_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
  v_readiness jsonb;
  v_counts jsonb;
  v_blocker_details text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_year.organization_id) THEN
    RAISE EXCEPTION 'Hanya Admin Lembaga yang dapat menutup Tahun Ajaran';
  END IF;

  IF v_year.status = 'closed' OR v_year.lifecycle_status = 'closed' THEN
    RAISE EXCEPTION 'Tahun ajaran % sudah ditutup sebelumnya.', v_year.name;
  END IF;

  v_readiness := public.rpc_check_academic_year_closing_readiness(p_academic_year_id);

  IF COALESCE((v_readiness->>'can_close')::boolean, false) IS NOT TRUE THEN
    v_counts := v_readiness->'counts';
    v_blocker_details := ARRAY[]::text[];

    IF COALESCE((v_counts->>'unfinished_sessions')::integer, 0) > 0 THEN
      v_blocker_details := array_append(v_blocker_details, format('%s sesi belum selesai/dikunci', v_counts->>'unfinished_sessions'));
    END IF;
    IF COALESCE((v_counts->>'unreviewed_recitations')::integer, 0) > 0 THEN
      v_blocker_details := array_append(v_blocker_details, format('%s setoran belum direview', v_counts->>'unreviewed_recitations'));
    END IF;
    IF COALESCE((v_counts->>'incomplete_exams')::integer, 0) > 0 THEN
      v_blocker_details := array_append(v_blocker_details, format('%s ujian belum lengkap/final', v_counts->>'incomplete_exams'));
    END IF;
    IF COALESCE((v_counts->>'unfinished_remedials')::integer, 0) > 0 THEN
      v_blocker_details := array_append(v_blocker_details, format('%s remedial belum selesai', v_counts->>'unfinished_remedials'));
    END IF;
    IF COALESCE((v_counts->>'unpublished_report_cards')::integer, 0) > 0 THEN
      v_blocker_details := array_append(v_blocker_details, format('%s raport masih berstatus draft', v_counts->>'unpublished_report_cards'));
    END IF;
    IF COALESCE((v_counts->>'unreconciled_enrollments')::integer, 0) > 0 THEN
      v_blocker_details := array_append(v_blocker_details, format('%s enrollment belum direkonsiliasi', v_counts->>'unreconciled_enrollments'));
    END IF;

    RAISE EXCEPTION 'Penutupan Tahun Ajaran % ditolak karena prasyarat belum terpenuhi: %.',
      v_year.name, array_to_string(v_blocker_details, ', ');
  END IF;

  UPDATE public.academic_years
  SET is_active = false,
      status = 'closed',
      lifecycle_status = 'closed',
      closed_at = now(),
      closed_by = auth.uid()
  WHERE id = p_academic_year_id;

  UPDATE public.semesters
  SET is_active = false,
      status = 'closed',
      updated_at = now()
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id;

  -- Tutup masa berlaku keanggotaan halaqah & penugasan musammi pada tahun ajaran yang ditutup tanpa menghapus histori
  UPDATE public.halaqah_student_memberships
  SET valid_to = COALESCE(valid_to, CURRENT_DATE),
      status = CASE WHEN status = 'active' THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND valid_to IS NULL;

  UPDATE public.halaqah_musammi_assignments
  SET valid_to = COALESCE(valid_to, CURRENT_DATE),
      is_active = false,
      status = 'ended',
      updated_at = now()
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND is_active = true;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, actor_id, actor_role, action, entity_type, resource_type, entity_id, resource_id, reason, after_state
  )
  VALUES (
    v_year.organization_id, auth.uid(), auth.uid(), COALESCE(public.get_role_for_org(v_year.organization_id), 'admin'),
    'close_academic_year', 'academic_years', 'academic_years', p_academic_year_id::text, p_academic_year_id::text,
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Penutupan resmi Tahun Ajaran ' || v_year.name),
    jsonb_build_object(
      'name', v_year.name,
      'status', 'closed',
      'closed_at', now(),
      'readiness_verified', v_readiness
    )
  );

  RETURN jsonb_build_object(
    'id', p_academic_year_id,
    'name', v_year.name,
    'status', 'closed',
    'readiness', v_readiness
  );
END;
$$;


-- 4.4 RPC Atomik Promosi / Kelulusan / Mutasi Enrollment Santri (Tanpa Menimpa Histori Tahun Lama)
CREATE OR REPLACE FUNCTION public.rpc_promote_or_graduate_students(
  p_source_academic_year_id bigint,
  p_target_academic_year_id bigint DEFAULT NULL,
  p_student_ids bigint[] DEFAULT ARRAY[]::bigint[],
  p_action text DEFAULT 'promoted',
  p_target_marhalah text DEFAULT NULL,
  p_target_kelas text DEFAULT NULL,
  p_master_marhalah_id bigint DEFAULT NULL,
  p_master_kelas_id bigint DEFAULT NULL,
  p_effective_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_src_ay public.academic_years%ROWTYPE;
  v_tgt_ay public.academic_years%ROWTYPE;
  v_sid bigint;
  v_processed integer := 0;
  v_safe_marhalah public.marhalah_enum;
  v_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_src_ay FROM public.academic_years WHERE id = p_source_academic_year_id;
  IF v_src_ay.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran asal tidak ditemukan';
  END IF;

  v_org_id := v_src_ay.organization_id;
  IF NOT public.is_admin_of_org(v_org_id) THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga yang dapat memproses promosi/kelulusan santri';
  END IF;

  v_action := CASE
    WHEN p_action IN ('promoted', 'graduated', 'transferred', 'withdrawn') THEN p_action
    ELSE 'promoted'
  END;

  IF v_action = 'promoted' THEN
    IF p_target_academic_year_id IS NULL THEN
      RAISE EXCEPTION 'Tahun ajaran tujuan wajib dipilih untuk promosi kelas';
    END IF;
    SELECT * INTO v_tgt_ay FROM public.academic_years WHERE id = p_target_academic_year_id AND organization_id = v_org_id;
    IF v_tgt_ay.id IS NULL THEN
      RAISE EXCEPTION 'Tahun ajaran tujuan tidak valid atau berasal dari organisasi berbeda';
    END IF;
    IF p_target_marhalah IS NULL OR TRIM(p_target_marhalah) = '' OR p_target_kelas IS NULL OR TRIM(p_target_kelas) = '' THEN
      RAISE EXCEPTION 'Marhalah dan Kelas tujuan wajib diisi untuk promosi kelas';
    END IF;
  END IF;

  IF COALESCE(p_target_marhalah, '') IN ('Mutawassithah', 'Aliyah', 'Jamiah') THEN
    v_safe_marhalah := p_target_marhalah::public.marhalah_enum;
  ELSE
    v_safe_marhalah := 'Mutawassithah'::public.marhalah_enum;
  END IF;

  FOREACH v_sid IN ARRAY COALESCE(p_student_ids, ARRAY[]::bigint[])
  LOOP
    -- Pastikan santri milik organisasi ini
    IF NOT EXISTS (SELECT 1 FROM public.santri WHERE id = v_sid AND organization_id = v_org_id) THEN
      RAISE EXCEPTION 'Santri % bukan milik organisasi ini', v_sid;
    END IF;

    -- 1. Rekam / perbarui status akhir pada tahun ajaran asal TANPA menghapus kelas tahun asal
    IF p_source_academic_year_id IS DISTINCT FROM p_target_academic_year_id OR v_action <> 'promoted' THEN
      UPDATE public.student_enrollments
      SET status = v_action,
          enrollment_status = v_action,
          left_at = COALESCE(p_effective_date, CURRENT_DATE),
          notes = COALESCE(p_notes, notes),
          updated_at = now()
      WHERE organization_id = v_org_id
        AND student_id = v_sid
        AND academic_year_id = p_source_academic_year_id;
    END IF;

    -- 2. Bila dipromosikan (naik kelas / penempatan tahun baru), buat/update enrollment aktif pada tahun ajaran tujuan
    IF v_action = 'promoted' AND p_target_academic_year_id IS NOT NULL THEN
      INSERT INTO public.student_enrollments (
        organization_id, student_id, santri_id, academic_year_id,
        master_marhalah_id, master_kelas_id, marhalah, kelas,
        status, enrollment_status, enrolled_at, left_at, notes
      ) VALUES (
        v_org_id, v_sid, v_sid, p_target_academic_year_id,
        p_master_marhalah_id, p_master_kelas_id, TRIM(p_target_marhalah), TRIM(p_target_kelas),
        'active', 'active', COALESCE(p_effective_date, CURRENT_DATE), NULL, p_notes
      )
      ON CONFLICT (organization_id, student_id, academic_year_id) DO UPDATE
      SET master_marhalah_id = EXCLUDED.master_marhalah_id,
          master_kelas_id = EXCLUDED.master_kelas_id,
          marhalah = EXCLUDED.marhalah,
          kelas = EXCLUDED.kelas,
          status = 'active',
          enrollment_status = 'active',
          enrolled_at = EXCLUDED.enrolled_at,
          left_at = NULL,
          notes = COALESCE(EXCLUDED.notes, public.student_enrollments.notes),
          updated_at = now();

      -- Hanya sinkronkan snapshot pada tabel master santri bila tahun ajaran tujuan adalah tahun ajaran aktif
      IF v_tgt_ay.is_active THEN
        UPDATE public.santri
        SET marhalah = v_safe_marhalah,
            kelas = TRIM(p_target_kelas),
            marhalah_id = p_master_marhalah_id,
            kelas_id = p_master_kelas_id,
            status = 'active'
        WHERE id = v_sid AND organization_id = v_org_id;
      END IF;
    ELSIF v_action IN ('graduated', 'transferred', 'withdrawn') THEN
      UPDATE public.santri
      SET status = 'inactive'
      WHERE id = v_sid AND organization_id = v_org_id;
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, actor_id, actor_role, action, entity_type, resource_type, entity_id, resource_id, reason, after_state
  ) VALUES (
    v_org_id, auth.uid(), auth.uid(), COALESCE(public.get_role_for_org(v_org_id), 'admin'),
    'promote_or_graduate_students', 'student_enrollments', 'student_enrollments',
    COALESCE(p_target_academic_year_id, p_source_academic_year_id)::text,
    COALESCE(p_target_academic_year_id, p_source_academic_year_id)::text,
    COALESCE(p_notes, format('Proses %s untuk %s santri', v_action, v_processed)),
    jsonb_build_object(
      'source_academic_year_id', p_source_academic_year_id,
      'target_academic_year_id', p_target_academic_year_id,
      'action', v_action,
      'target_marhalah', p_target_marhalah,
      'target_kelas', p_target_kelas,
      'processed_count', v_processed
    )
  );

  RETURN jsonb_build_object(
    'processed_count', v_processed,
    'action', v_action,
    'source_academic_year_id', p_source_academic_year_id,
    'target_academic_year_id', p_target_academic_year_id
  );
END;
$$;


-- 4.5 RPC Atomik Mutasi / Keluar Anggota Halaqah & Rekonstruksi Roster Historis per Tanggal
CREATE OR REPLACE FUNCTION public.rpc_mutate_halaqah_student(
  p_student_id bigint,
  p_from_halaqah_id bigint,
  p_to_halaqah_id bigint DEFAULT NULL,
  p_effective_date date DEFAULT CURRENT_DATE,
  p_action text DEFAULT 'mutasi'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_halaqah public.halaqah%ROWTYPE;
  v_to_halaqah public.halaqah%ROWTYPE;
  v_eff_date date := COALESCE(p_effective_date, CURRENT_DATE);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_from_halaqah FROM public.halaqah WHERE id = p_from_halaqah_id;
  IF v_from_halaqah.id IS NULL THEN
    RAISE EXCEPTION 'Halaqah asal tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_from_halaqah.organization_id) THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga yang dapat memutasi anggota halaqah';
  END IF;

  IF p_action = 'mutasi' THEN
    IF p_to_halaqah_id IS NULL OR p_to_halaqah_id = p_from_halaqah_id THEN
      RAISE EXCEPTION 'Halaqah tujuan wajib dipilih dan berbeda dari halaqah asal';
    END IF;
    SELECT * INTO v_to_halaqah FROM public.halaqah WHERE id = p_to_halaqah_id AND organization_id = v_from_halaqah.organization_id;
    IF v_to_halaqah.id IS NULL THEN
      RAISE EXCEPTION 'Halaqah tujuan tidak ditemukan pada organisasi ini';
    END IF;
  END IF;

  -- 1. Tutup membership aktif di halaqah asal
  UPDATE public.halaqah_student_memberships
  SET valid_to = GREATEST(valid_from, v_eff_date),
      status = CASE WHEN p_action = 'mutasi' THEN 'transferred' ELSE 'removed' END,
      updated_at = now()
  WHERE organization_id = v_from_halaqah.organization_id
    AND halaqah_id = p_from_halaqah_id
    AND student_id = p_student_id
    AND valid_to IS NULL;

  UPDATE public.halaqah_santri
  SET end_date = v_eff_date,
      status = CASE WHEN p_action = 'mutasi' THEN 'Mutasi' ELSE 'Dikeluarkan dari Grup' END
  WHERE organization_id = v_from_halaqah.organization_id
    AND halaqah_id = p_from_halaqah_id
    AND santri_id = p_student_id
    AND end_date IS NULL;

  -- 2. Jika mutasi, buat membership aktif baru di halaqah tujuan
  IF p_action = 'mutasi' AND p_to_halaqah_id IS NOT NULL THEN
    INSERT INTO public.halaqah_student_memberships (
      organization_id, academic_year_id, halaqah_id, student_id, valid_from, valid_to, status
    ) VALUES (
      v_from_halaqah.organization_id, v_to_halaqah.academic_year_id, p_to_halaqah_id, p_student_id, v_eff_date, NULL, 'active'
    )
    ON CONFLICT (organization_id, halaqah_id, student_id) WHERE valid_to IS NULL AND status = 'active'
    DO UPDATE SET valid_from = EXCLUDED.valid_from, updated_at = now();
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, actor_id, actor_role, action, entity_type, resource_type, entity_id, resource_id, after_state
  ) VALUES (
    v_from_halaqah.organization_id, auth.uid(), auth.uid(), COALESCE(public.get_role_for_org(v_from_halaqah.organization_id), 'admin'),
    CASE WHEN p_action = 'mutasi' THEN 'transfer_halaqah_student' ELSE 'remove_halaqah_student' END,
    'halaqah_student_memberships', 'halaqah_student_memberships', p_student_id::text, p_student_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'from_halaqah_id', p_from_halaqah_id,
      'to_halaqah_id', p_to_halaqah_id,
      'effective_date', v_eff_date,
      'action', p_action
    )
  );

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'from_halaqah_id', p_from_halaqah_id,
    'to_halaqah_id', p_to_halaqah_id,
    'effective_date', v_eff_date,
    'action', p_action
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_halaqah_roster_as_of(
  p_halaqah_id bigint,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  student_id bigint,
  student_name text,
  marhalah text,
  kelas text,
  valid_from date,
  valid_to date,
  membership_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_halaqah public.halaqah%ROWTYPE;
  v_date date := COALESCE(p_as_of_date, CURRENT_DATE);
BEGIN
  SELECT * INTO v_halaqah FROM public.halaqah WHERE id = p_halaqah_id;
  IF v_halaqah.id IS NULL THEN
    RAISE EXCEPTION 'Halaqah tidak ditemukan';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.has_org_access(v_halaqah.organization_id) THEN
    RAISE EXCEPTION 'Forbidden: Akses lintas organisasi ditolak';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.nama AS student_name,
    COALESCE(se.marhalah, s.marhalah::text) AS marhalah,
    COALESCE(se.kelas, s.kelas) AS kelas,
    m.valid_from,
    m.valid_to,
    m.status AS membership_status
  FROM public.halaqah_student_memberships m
  JOIN public.santri s
    ON s.id = m.student_id
   AND s.organization_id = m.organization_id
  LEFT JOIN public.student_enrollments se
    ON se.organization_id = m.organization_id
   AND se.student_id = m.student_id
   AND se.academic_year_id = v_halaqah.academic_year_id
  WHERE m.organization_id = v_halaqah.organization_id
    AND m.halaqah_id = p_halaqah_id
    AND m.valid_from <= v_date
    AND (m.valid_to IS NULL OR m.valid_to >= v_date)
  ORDER BY s.nama ASC;
END;
$$;


-- 4.6 RPC Atomik Penugasan Musammi (Primary & Substitute + Deteksi Konflik Jadwal)
CREATE OR REPLACE FUNCTION public.rpc_assign_halaqah_musammi(
  p_halaqah_id bigint,
  p_musammi_id bigint,
  p_assignment_type text DEFAULT 'primary',
  p_valid_from date DEFAULT CURRENT_DATE,
  p_valid_to date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_halaqah public.halaqah%ROWTYPE;
  v_musammi public.musammi%ROWTYPE;
  v_type text := CASE WHEN TRIM(COALESCE(p_assignment_type, '')) = 'substitute' THEN 'substitute' ELSE 'primary' END;
  v_from date := COALESCE(p_valid_from, CURRENT_DATE);
  v_conflict_groups text[];
  v_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_halaqah FROM public.halaqah WHERE id = p_halaqah_id;
  IF v_halaqah.id IS NULL THEN
    RAISE EXCEPTION 'Halaqah tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_halaqah.organization_id) THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga yang dapat menetapkan penugasan Musammi';
  END IF;

  SELECT * INTO v_musammi
  FROM public.musammi
  WHERE id = p_musammi_id
    AND organization_id = v_halaqah.organization_id;

  IF v_musammi.id IS NULL THEN
    RAISE EXCEPTION 'Musammi tidak ditemukan pada organisasi ini';
  END IF;

  IF p_valid_to IS NOT NULL AND p_valid_to < v_from THEN
    RAISE EXCEPTION 'Masa berlaku penugasan tidak valid: valid_to (%) sebelum valid_from (%)', p_valid_to, v_from;
  END IF;

  -- Deteksi konflik jadwal pada waktu sesi yang sama di halaqah aktif lain
  SELECT ARRAY_AGG(DISTINCT h2.nama)
  INTO v_conflict_groups
  FROM public.halaqah_musammi_assignments hma
  JOIN public.halaqah h2 ON h2.id = hma.halaqah_id
  WHERE hma.organization_id = v_halaqah.organization_id
    AND hma.musammi_id = p_musammi_id
    AND hma.halaqah_id <> p_halaqah_id
    AND hma.is_active = true
    AND (hma.valid_to IS NULL OR hma.valid_to >= v_from)
    AND COALESCE(h2.is_active, true) = true
    AND h2.waktu && v_halaqah.waktu;

  IF v_type = 'primary' THEN
    -- Akhiri penugasan primary aktif sebelumnya pada halaqah ini bila berbeda Musammi
    UPDATE public.halaqah_musammi_assignments
    SET is_active = false,
        status = 'ended',
        valid_to = GREATEST(valid_from, v_from),
        updated_at = now()
    WHERE organization_id = v_halaqah.organization_id
      AND halaqah_id = p_halaqah_id
      AND assignment_type = 'primary'
      AND is_active = true
      AND musammi_id <> p_musammi_id;

    UPDATE public.halaqah
    SET musammi_id = p_musammi_id
    WHERE id = p_halaqah_id
      AND organization_id = v_halaqah.organization_id;
  END IF;

  INSERT INTO public.halaqah_musammi_assignments (
    organization_id, academic_year_id, halaqah_id, musammi_id, musammi_user_id,
    assignment_type, is_primary, valid_from, valid_to, is_active, status, notes
  ) VALUES (
    v_halaqah.organization_id, v_halaqah.academic_year_id, p_halaqah_id, p_musammi_id, v_musammi.user_id,
    v_type, (v_type = 'primary'), v_from, p_valid_to, true, 'active', p_notes
  )
  ON CONFLICT (organization_id, halaqah_id, musammi_id, assignment_type) DO UPDATE
  SET musammi_user_id = EXCLUDED.musammi_user_id,
      valid_from = EXCLUDED.valid_from,
      valid_to = EXCLUDED.valid_to,
      is_active = true,
      status = 'active',
      notes = COALESCE(EXCLUDED.notes, public.halaqah_musammi_assignments.notes),
      updated_at = now()
  RETURNING id INTO v_assignment_id;

  RETURN jsonb_build_object(
    'assignment_id', v_assignment_id,
    'halaqah_id', p_halaqah_id,
    'musammi_id', p_musammi_id,
    'assignment_type', v_type,
    'valid_from', v_from,
    'valid_to', p_valid_to,
    'schedule_conflicts', COALESCE(to_jsonb(v_conflict_groups), '[]'::jsonb)
  );
END;
$$;


-- 4.7 Laporan Rekonsiliasi Data Legacy vs V2 & Fungsi Rekonsiliasi Otomatis (5 Item Wajib Fase 4 Section 6)
CREATE OR REPLACE FUNCTION public.rpc_get_academic_reconciliation_report(
  p_academic_year_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_ay_id bigint := p_academic_year_id;
  v_active_santri integer := 0;
  v_legacy_classes integer := 0;
  v_v2_enrollments integer := 0;
  v_missing_v2_enrollments integer := 0;
  v_unenrolled_active_santri integer := 0;
  v_legacy_memberships integer := 0;
  v_v2_memberships integer := 0;
  v_missing_v2_memberships integer := 0;
  v_active_halaqah integer := 0;
  v_v2_primary_musammi integer := 0;
  v_missing_v2_musammi integer := 0;
  v_ay_without_semesters integer := 0;
  v_total_discrepancies integer := 0;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF v_ay_id IS NULL THEN
    SELECT id INTO v_ay_id
    FROM public.academic_years
    WHERE organization_id = v_org_id AND is_active = true
    LIMIT 1;
  END IF;

  SELECT COUNT(*) INTO v_active_santri
  FROM public.santri
  WHERE organization_id = v_org_id AND COALESCE(status, 'active') = 'active';

  IF v_ay_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_legacy_classes
    FROM public.student_classes
    WHERE organization_id = v_org_id AND academic_year_id = v_ay_id;

    SELECT COUNT(*) INTO v_v2_enrollments
    FROM public.student_enrollments
    WHERE organization_id = v_org_id AND academic_year_id = v_ay_id;

    -- 2. Santri di student_classes tetapi tidak ada di student_enrollments
    SELECT COUNT(*) INTO v_missing_v2_enrollments
    FROM public.student_classes sc
    WHERE sc.organization_id = v_org_id
      AND sc.academic_year_id = v_ay_id
      AND NOT EXISTS (
        SELECT 1 FROM public.student_enrollments se
        WHERE se.organization_id = sc.organization_id
          AND se.academic_year_id = sc.academic_year_id
          AND se.student_id = sc.santri_id
      );

    -- 1. Santri aktif tanpa enrollment pada tahun ajaran terpilih
    SELECT COUNT(*) INTO v_unenrolled_active_santri
    FROM public.santri s
    WHERE s.organization_id = v_org_id
      AND COALESCE(s.status, 'active') = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.student_enrollments se
        WHERE se.organization_id = s.organization_id
          AND se.academic_year_id = v_ay_id
          AND se.student_id = s.id
          AND se.status = 'active'
      );
  END IF;

  SELECT COUNT(*) INTO v_legacy_memberships
  FROM public.halaqah_santri
  WHERE organization_id = v_org_id AND end_date IS NULL AND COALESCE(status, 'Aktif') = 'Aktif';

  SELECT COUNT(*) INTO v_v2_memberships
  FROM public.halaqah_student_memberships
  WHERE organization_id = v_org_id AND valid_to IS NULL AND status = 'active';

  -- 3. Anggota di halaqah_santri tetapi tidak ada di halaqah_student_memberships
  SELECT COUNT(*) INTO v_missing_v2_memberships
  FROM public.halaqah_santri hs
  WHERE hs.organization_id = v_org_id
    AND hs.end_date IS NULL
    AND COALESCE(hs.status, 'Aktif') = 'Aktif'
    AND NOT EXISTS (
      SELECT 1 FROM public.halaqah_student_memberships hsm
      WHERE hsm.organization_id = hs.organization_id
        AND hsm.halaqah_id = hs.halaqah_id
        AND hsm.student_id = hs.santri_id
        AND hsm.valid_to IS NULL
        AND hsm.status = 'active'
    );

  SELECT COUNT(*) INTO v_active_halaqah
  FROM public.halaqah
  WHERE organization_id = v_org_id AND COALESCE(is_active, true) = true;

  SELECT COUNT(*) INTO v_v2_primary_musammi
  FROM public.halaqah_musammi_assignments
  WHERE organization_id = v_org_id AND is_active = true AND assignment_type = 'primary' AND valid_to IS NULL;

  -- 4. Musammi di halaqah.musammi_id tetapi tidak ada di halaqah_musammi_assignments
  SELECT COUNT(*) INTO v_missing_v2_musammi
  FROM public.halaqah h
  WHERE h.organization_id = v_org_id
    AND COALESCE(h.is_active, true) = true
    AND h.musammi_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.halaqah_musammi_assignments hma
      WHERE hma.organization_id = h.organization_id
        AND hma.halaqah_id = h.id
        AND hma.musammi_id = h.musammi_id
        AND hma.is_active = true
        AND hma.assignment_type = 'primary'
    );

  -- 5. Tahun ajaran tanpa record semesters (Ganjil & Genap)
  SELECT COUNT(*) INTO v_ay_without_semesters
  FROM public.academic_years ay
  WHERE ay.organization_id = v_org_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.semesters sm
        WHERE sm.organization_id = ay.organization_id
          AND sm.academic_year_id = ay.id
          AND sm.name = 'Ganjil'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.semesters sm
        WHERE sm.organization_id = ay.organization_id
          AND sm.academic_year_id = ay.id
          AND sm.name = 'Genap'
      )
    );

  v_total_discrepancies :=
    v_unenrolled_active_santri +
    v_missing_v2_enrollments +
    v_missing_v2_memberships +
    v_missing_v2_musammi +
    v_ay_without_semesters;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'academic_year_id', v_ay_id,
    'is_reconciled', (v_total_discrepancies = 0),
    'is_fully_reconciled', (v_total_discrepancies = 0),
    'total_discrepancies', v_total_discrepancies,
    'checked_at', now(),
    'findings', jsonb_build_array(
      jsonb_build_object(
        'code', 'ACTIVE_SANTRI_WITHOUT_ENROLLMENT',
        'label', 'Santri aktif tanpa record enrollment pada tahun ajaran terpilih',
        'count', v_unenrolled_active_santri,
        'status', CASE WHEN v_unenrolled_active_santri = 0 THEN 'OK' ELSE 'MISMATCH' END
      ),
      jsonb_build_object(
        'code', 'LEGACY_CLASS_MISSING_IN_V2_ENROLLMENTS',
        'label', 'Santri di student_classes (legacy) tetapi belum ada di student_enrollments (V2)',
        'count', v_missing_v2_enrollments,
        'status', CASE WHEN v_missing_v2_enrollments = 0 THEN 'OK' ELSE 'MISMATCH' END
      ),
      jsonb_build_object(
        'code', 'LEGACY_HALAQAH_SANTRI_MISSING_IN_V2_MEMBERSHIPS',
        'label', 'Anggota di halaqah_santri (legacy) tetapi belum ada di halaqah_student_memberships (V2)',
        'count', v_missing_v2_memberships,
        'status', CASE WHEN v_missing_v2_memberships = 0 THEN 'OK' ELSE 'MISMATCH' END
      ),
      jsonb_build_object(
        'code', 'LEGACY_HALAQAH_MUSAMMI_MISSING_IN_V2_ASSIGNMENTS',
        'label', 'Musammi di halaqah.musammi_id (legacy) tetapi belum ada di halaqah_musammi_assignments (V2)',
        'count', v_missing_v2_musammi,
        'status', CASE WHEN v_missing_v2_musammi = 0 THEN 'OK' ELSE 'MISMATCH' END
      ),
      jsonb_build_object(
        'code', 'ACADEMIC_YEAR_WITHOUT_SEMESTERS',
        'label', 'Tahun ajaran tanpa kelengkapan record tabel semesters (Ganjil/Genap)',
        'count', v_ay_without_semesters,
        'status', CASE WHEN v_ay_without_semesters = 0 THEN 'OK' ELSE 'MISMATCH' END
      )
    ),
    'enrollments', jsonb_build_object(
      'active_master_students', v_active_santri,
      'legacy_student_classes', v_legacy_classes,
      'v2_student_enrollments', v_v2_enrollments,
      'missing_v2_enrollments', v_missing_v2_enrollments,
      'unenrolled_active_students', v_unenrolled_active_santri
    ),
    'halaqah_memberships', jsonb_build_object(
      'legacy_active_memberships', v_legacy_memberships,
      'v2_active_memberships', v_v2_memberships,
      'missing_v2_memberships', v_missing_v2_memberships
    ),
    'musammi_assignments', jsonb_build_object(
      'active_halaqah_groups', v_active_halaqah,
      'v2_primary_assignments', v_v2_primary_musammi,
      'missing_v2_primary_assignments', v_missing_v2_musammi
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reconcile_academic_v2_data(
  p_academic_year_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_synced_enrollments integer := 0;
  v_synced_memberships integer := 0;
  v_synced_assignments integer := 0;
  v_synced_semesters integer := 0;
BEGIN
  v_org_id := public.get_my_org_id();
  IF v_org_id IS NULL OR NOT public.is_admin_of_org(v_org_id) THEN
    RAISE EXCEPTION 'Forbidden: Hanya Admin Lembaga yang dapat menjalankan rekonsiliasi data V2';
  END IF;

  -- 1. Sinkronkan student_classes -> student_enrollments
  WITH ins_enr AS (
    INSERT INTO public.student_enrollments (
      organization_id, student_id, santri_id, academic_year_id,
      master_marhalah_id, master_kelas_id, marhalah, kelas,
      status, enrollment_status, enrolled_at
    )
    SELECT
      sc.organization_id, sc.santri_id, sc.santri_id, sc.academic_year_id,
      sc.marhalah_id, sc.kelas_id, sc.marhalah::text, sc.kelas,
      'active', 'active', CURRENT_DATE
    FROM public.student_classes sc
    WHERE sc.organization_id = v_org_id
      AND (p_academic_year_id IS NULL OR sc.academic_year_id = p_academic_year_id)
    ON CONFLICT (organization_id, student_id, academic_year_id) DO UPDATE
    SET master_marhalah_id = COALESCE(EXCLUDED.master_marhalah_id, public.student_enrollments.master_marhalah_id),
        master_kelas_id = COALESCE(EXCLUDED.master_kelas_id, public.student_enrollments.master_kelas_id),
        marhalah = COALESCE(EXCLUDED.marhalah, public.student_enrollments.marhalah),
        kelas = COALESCE(EXCLUDED.kelas, public.student_enrollments.kelas),
        updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_synced_enrollments FROM ins_enr;

  -- 2. Sinkronkan halaqah_santri -> halaqah_student_memberships
  WITH ins_hsm AS (
    INSERT INTO public.halaqah_student_memberships (
      organization_id, academic_year_id, halaqah_id, student_id, valid_from, valid_to, status
    )
    SELECT
      hs.organization_id,
      h.academic_year_id,
      hs.halaqah_id,
      hs.santri_id,
      COALESCE(hs.start_date, CURRENT_DATE),
      CASE
        WHEN hs.end_date IS NOT NULL AND hs.end_date < COALESCE(hs.start_date, CURRENT_DATE)
          THEN COALESCE(hs.start_date, CURRENT_DATE)
        ELSE hs.end_date
      END,
      CASE
        WHEN COALESCE(hs.status, 'Aktif') = 'Aktif' AND hs.end_date IS NULL THEN 'active'
        WHEN hs.status ILIKE '%mutasi%' THEN 'transferred'
        ELSE 'removed'
      END
    FROM public.halaqah_santri hs
    JOIN public.halaqah h ON h.id = hs.halaqah_id AND h.organization_id = hs.organization_id
    WHERE hs.organization_id = v_org_id
      AND NOT EXISTS (
        SELECT 1 FROM public.halaqah_student_memberships m
        WHERE m.organization_id = hs.organization_id
          AND m.halaqah_id = hs.halaqah_id
          AND m.student_id = hs.santri_id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_synced_memberships FROM ins_hsm;

  -- 3. Sinkronkan halaqah.musammi_id -> halaqah_musammi_assignments
  WITH ins_hma AS (
    INSERT INTO public.halaqah_musammi_assignments (
      organization_id, academic_year_id, halaqah_id, musammi_id, musammi_user_id,
      assignment_type, is_primary, valid_from, is_active, status
    )
    SELECT
      h.organization_id,
      h.academic_year_id,
      h.id,
      h.musammi_id,
      m.user_id,
      'primary',
      true,
      CURRENT_DATE,
      COALESCE(h.is_active, true),
      CASE WHEN COALESCE(h.is_active, true) THEN 'active' ELSE 'ended' END
    FROM public.halaqah h
    JOIN public.musammi m ON m.id = h.musammi_id AND m.organization_id = h.organization_id
    WHERE h.organization_id = v_org_id
      AND h.musammi_id IS NOT NULL
    ON CONFLICT (organization_id, halaqah_id, musammi_id, assignment_type) DO UPDATE
    SET musammi_user_id = COALESCE(EXCLUDED.musammi_user_id, public.halaqah_musammi_assignments.musammi_user_id),
        updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_synced_assignments FROM ins_hma;

  -- 4. Lengkapi record semesters (Ganjil & Genap) untuk seluruh academic_years organisasi
  WITH ins_sem AS (
    INSERT INTO public.semesters (organization_id, academic_year_id, name, is_active, status)
    SELECT
      ay.organization_id,
      ay.id,
      sem_name,
      (ay.is_active = true AND COALESCE(ay.active_semester, 'Ganjil') = sem_name),
      CASE WHEN ay.status = 'closed' THEN 'closed' ELSE 'active' END
    FROM public.academic_years ay
    CROSS JOIN (VALUES ('Ganjil'), ('Genap')) AS s(sem_name)
    WHERE ay.organization_id = v_org_id
    ON CONFLICT (organization_id, academic_year_id, name) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_synced_semesters FROM ins_sem;

  RETURN jsonb_build_object(
    'synced', jsonb_build_object(
      'enrollments_synced', v_synced_enrollments,
      'memberships_synced', v_synced_memberships,
      'assignments_synced', v_synced_assignments,
      'semesters_synced', v_synced_semesters
    ),
    'synced_enrollments', v_synced_enrollments,
    'synced_memberships', v_synced_memberships,
    'synced_assignments', v_synced_assignments,
    'synced_semesters', v_synced_semesters,
    'report', public.rpc_get_academic_reconciliation_report(p_academic_year_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------------
-- FASE 5: SESI HALAQAH & ABSENSI HARDENING
-- ---------------------------------------------------------------------------------

-- 5.1 Helper Validasi Penugasan Musammi pada Tanggal Tertentu (Date-Aware Assignment)
CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_halaqah_on_date(
  target_org_id uuid,
  target_halaqah_id bigint,
  target_date date
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    target_org_id IS NOT NULL
    AND target_halaqah_id IS NOT NULL
    AND public.get_role_for_org(target_org_id) IN ('musammi', 'admin')
    AND (
      public.get_role_for_org(target_org_id) = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.halaqah_musammi_assignments hma
        LEFT JOIN public.musammi m ON m.id = hma.musammi_id AND m.organization_id = hma.organization_id
        WHERE hma.organization_id = target_org_id
          AND hma.halaqah_id = target_halaqah_id
          AND hma.status = 'active'
          AND hma.is_active = true
          AND (hma.valid_from IS NULL OR hma.valid_from <= target_date)
          AND (hma.valid_to IS NULL OR hma.valid_to >= target_date)
          AND (hma.musammi_user_id = auth.uid() OR hma.user_id = auth.uid() OR m.user_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.halaqah h
        JOIN public.musammi m ON m.id = h.musammi_id AND m.organization_id = h.organization_id
        WHERE h.organization_id = target_org_id
          AND h.id = target_halaqah_id
          AND m.user_id = auth.uid()
      )
    )
  );
$$;

-- 5.2 Trigger State Machine Sesi Halaqah (scheduled -> open -> submitted -> completed -> locked)
CREATE OR REPLACE FUNCTION public.fn_validate_session_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Sesi locked tidak boleh diubah statusnya menjadi status lain (mutlak terkunci)
  IF OLD.status = 'locked' AND NEW.status <> 'locked' THEN
    RAISE EXCEPTION 'Sesi telah dikunci (locked). Perubahan status tidak diizinkan.';
  END IF;

  -- 2. Sesi cancelled tidak boleh diaktifkan kembali
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Sesi telah dibatalkan (cancelled). Perubahan status tidak diizinkan.';
  END IF;

  -- 3. Transisi dari completed hanya boleh ke locked, submitted, atau cancelled
  IF OLD.status = 'completed' AND NEW.status NOT IN ('completed', 'locked', 'submitted', 'cancelled') THEN
    RAISE EXCEPTION 'Transisi status dari completed ke % tidak diizinkan.', NEW.status;
  END IF;

  -- 4. Transisi dari submitted hanya boleh ke open (koreksi sebelum kunci), completed, locked, atau cancelled
  IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'open', 'completed', 'locked', 'cancelled') THEN
    RAISE EXCEPTION 'Transisi status dari submitted ke % tidak diizinkan.', NEW.status;
  END IF;

  -- 5. Transisi dari open hanya boleh ke submitted, completed, atau cancelled
  IF OLD.status = 'open' AND NEW.status NOT IN ('open', 'submitted', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Transisi status dari open ke % tidak diizinkan.', NEW.status;
  END IF;

  -- 6. Transisi dari scheduled hanya boleh ke open atau cancelled
  IF OLD.status = 'scheduled' AND NEW.status NOT IN ('scheduled', 'open', 'cancelled') THEN
    RAISE EXCEPTION 'Transisi status dari scheduled ke % tidak diizinkan.', NEW.status;
  END IF;

  -- 7. Roster snapshot tidak boleh diubah jika sesi sudah locked
  IF OLD.status = 'locked' AND NEW.roster_snapshot IS DISTINCT FROM OLD.roster_snapshot THEN
    RAISE EXCEPTION 'Roster snapshot pada sesi yang telah dikunci tidak dapat diubah.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_session_state_machine ON public.halaqah_sessions;
CREATE TRIGGER trg_validate_session_state_machine
  BEFORE UPDATE ON public.halaqah_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_session_state_machine();

-- 5.3 Trigger Validasi Integritas Catatan Presensi (Roster & Locked Gating)
CREATE OR REPLACE FUNCTION public.fn_validate_attendance_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.halaqah_sessions%ROWTYPE;
  v_in_roster boolean := false;
BEGIN
  -- Ambil data sesi
  SELECT * INTO v_session
  FROM public.halaqah_sessions
  WHERE id = NEW.session_id;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi halaqah tidak ditemukan untuk presensi ini.';
  END IF;

  -- Validasi status kehadiran
  NEW.status := LOWER(TRIM(NEW.status));
  IF NEW.status NOT IN ('hadir', 'izin', 'sakit', 'alpa', 'terlambat') THEN
    RAISE EXCEPTION 'Status kehadiran % tidak valid.', NEW.status;
  END IF;

  -- Validasi santri terdaftar dalam roster_snapshot sesi
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_session.roster_snapshot, '[]'::jsonb)) r
    WHERE (r->>'santri_id')::bigint = NEW.santri_id
  ) INTO v_in_roster;

  IF NOT COALESCE(v_in_roster, false) THEN
    RAISE EXCEPTION 'Santri ID % tidak terdaftar dalam roster sesi halaqah ini.', NEW.santri_id;
  END IF;

  -- Jika sesi sudah locked, wajib ada correction_reason minimal 5 karakter
  IF v_session.status = 'locked' THEN
    IF NEW.correction_reason IS NULL OR LENGTH(TRIM(NEW.correction_reason)) < 5 THEN
      RAISE EXCEPTION 'Sesi telah dikunci. Perubahan kehadiran wajib menyertakan alasan koreksi (minimal 5 karakter).';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_attendance_record ON public.attendance_records;
CREATE TRIGGER trg_validate_attendance_record
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_attendance_record();

-- 5.4 RPC Buka Sesi Halaqah
CREATE OR REPLACE FUNCTION public.rpc_open_halaqah_session(
  p_halaqah_id bigint,
  p_session_date date,
  p_session_slot text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_year_id bigint;
  v_session_id uuid;
  v_role text;
  v_roster jsonb;
  v_existing_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT h.organization_id, h.academic_year_id
  INTO v_org_id, v_year_id
  FROM public.halaqah h
  WHERE h.id = p_halaqah_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Halaqah tidak ditemukan';
  END IF;

  v_role := public.get_role_for_org(v_org_id);
  IF v_role = 'musammi' THEN
    IF NOT (
      public.is_musammi_assigned_to_halaqah_on_date(v_org_id, p_halaqah_id, p_session_date)
      OR public.is_musammi_assigned_to_halaqah(v_org_id, p_halaqah_id)
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: Anda tidak ditugaskan pada halaqah ini untuk tanggal %', p_session_date;
    END IF;
  ELSIF v_role = 'superadmin' THEN
    IF NOT public.has_active_support_session(v_org_id, true) THEN
      RAISE EXCEPTION 'Akses ditolak: Superadmin wajib membuka Support Access Session mode read_write';
    END IF;
  ELSIF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Akses ditolak untuk membuka sesi pada lembaga ini';
  END IF;

  -- Periksa apakah sesi sudah ada
  SELECT id, status, roster_snapshot INTO v_session_id, v_existing_status, v_roster
  FROM public.halaqah_sessions
  WHERE organization_id = v_org_id
    AND halaqah_id = p_halaqah_id
    AND session_date = p_session_date
    AND session_slot = p_session_slot;

  IF v_session_id IS NOT NULL THEN
    -- Jika sesi sudah terkunci atau sudah disubmit/completed, jangan hitung ulang roster
    IF v_existing_status IN ('locked', 'submitted', 'completed') THEN
      RETURN jsonb_build_object(
        'session_id', v_session_id,
        'organization_id', v_org_id,
        'status', v_existing_status,
        'roster', v_roster,
        'is_existing', true
      );
    END IF;
  END IF;

  -- Susun roster dari membership yang aktif pada tanggal p_session_date
  WITH active_members AS (
    SELECT DISTINCT m.student_id AS santri_id
    FROM public.halaqah_student_memberships m
    WHERE m.organization_id = v_org_id
      AND m.halaqah_id = p_halaqah_id
      AND m.status = 'active'
      AND (m.valid_from IS NULL OR m.valid_from <= p_session_date)
      AND (m.valid_to IS NULL OR m.valid_to >= p_session_date)
    UNION
    SELECT DISTINCT hs.santri_id
    FROM public.halaqah_santri hs
    WHERE hs.organization_id = v_org_id
      AND hs.halaqah_id = p_halaqah_id
      AND (hs.start_date IS NULL OR hs.start_date <= p_session_date)
      AND (hs.end_date IS NULL OR hs.end_date >= p_session_date)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'santri_id', s.id,
    'nama', s.nama,
    'kode', s.kode,
    'marhalah', COALESCE(se.marhalah_name, sc.marhalah, s.marhalah),
    'kelas', COALESCE(se.class_name, sc.kelas, s.kelas),
    'status', 'Belum diisi'
  ) ORDER BY s.nama), '[]'::jsonb)
  INTO v_roster
  FROM active_members am
  JOIN public.santri s ON s.id = am.santri_id AND s.organization_id = v_org_id
  LEFT JOIN public.student_enrollments se
    ON se.organization_id = v_org_id
   AND se.student_id = s.id
   AND se.academic_year_id = v_year_id
  LEFT JOIN public.student_classes sc
    ON sc.organization_id = v_org_id
   AND sc.santri_id = s.id
   AND sc.academic_year_id = v_year_id;

  INSERT INTO public.halaqah_sessions (
    organization_id, academic_year_id, halaqah_id, session_date, session_slot, status, opened_by, roster_snapshot
  )
  VALUES (
    v_org_id, v_year_id, p_halaqah_id, p_session_date, p_session_slot, 'open', auth.uid(), v_roster
  )
  ON CONFLICT (organization_id, halaqah_id, session_date, session_slot)
  DO UPDATE SET
    roster_snapshot = CASE
      WHEN public.halaqah_sessions.status IN ('locked', 'submitted', 'completed') THEN public.halaqah_sessions.roster_snapshot
      ELSE EXCLUDED.roster_snapshot
    END,
    updated_at = now()
  RETURNING id, roster_snapshot, status INTO v_session_id, v_roster, v_existing_status;

  INSERT INTO public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, after_state)
  VALUES (
    v_org_id, auth.uid(), v_role, 'open_session', 'halaqah_sessions', v_session_id::text,
    jsonb_build_object('halaqah_id', p_halaqah_id, 'date', p_session_date, 'slot', p_session_slot, 'status', v_existing_status)
  );

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'organization_id', v_org_id,
    'status', v_existing_status,
    'roster', v_roster
  );
END;
$$;

-- 5.5 RPC Simpan Batch Kehadiran Sesi Halaqah (Atomic + Idempotent + Gated)
CREATE OR REPLACE FUNCTION public.rpc_save_attendance_batch(
  p_session_id uuid,
  p_records jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.halaqah_sessions%ROWTYPE;
  v_role text;
  v_item jsonb;
  v_santri_id bigint;
  v_status text;
  v_legacy_status text;
  v_saved_count integer := 0;
  v_in_roster boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_session FROM public.halaqah_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi halaqah tidak ditemukan';
  END IF;

  -- Validasi hak akses tenant dan penugasan halaqah
  v_role := public.get_role_for_org(v_session.organization_id);
  IF v_role = 'musammi' THEN
    IF NOT (
      public.is_musammi_assigned_to_halaqah_on_date(v_session.organization_id, v_session.halaqah_id, v_session.session_date)
      OR public.is_musammi_assigned_to_halaqah(v_session.organization_id, v_session.halaqah_id)
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: Anda bukan pengampu halaqah pada sesi ini';
    END IF;
  ELSIF v_role = 'superadmin' THEN
    IF NOT public.has_active_support_session(v_session.organization_id, true) THEN
      RAISE EXCEPTION 'Akses ditolak: Superadmin memerlukan Support Session read_write aktif';
    END IF;
  ELSIF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Akses ditolak untuk menyimpan kehadiran sesi ini';
  END IF;

  -- Jika sesi sudah dikunci, wajib menyertakan alasan koreksi minimal 5 karakter
  IF v_session.status = 'locked' AND COALESCE(LENGTH(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Sesi telah dikunci. Perubahan kehadiran wajib menyertakan alasan koreksi (minimal 5 karakter).';
  END IF;

  IF jsonb_typeof(p_records) <> 'array' OR jsonb_array_length(p_records) = 0 THEN
    RAISE EXCEPTION 'Daftar presensi kosong. Minimal 1 status kehadiran santri harus dikirim.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    v_santri_id := (v_item->>'santri_id')::bigint;
    v_status := LOWER(TRIM(COALESCE(v_item->>'status', '')));

    IF v_santri_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Validasi status kehadiran kanonikal
    IF v_status NOT IN ('hadir', 'izin', 'sakit', 'alpa', 'terlambat') THEN
      RAISE EXCEPTION 'Status kehadiran tidak valid untuk santri ID %: %', v_santri_id, COALESCE(v_status, 'kosong');
    END IF;

    -- Pastikan santri berada di organisasi yang sama
    IF NOT EXISTS (
      SELECT 1 FROM public.santri s
      WHERE s.id = v_santri_id AND s.organization_id = v_session.organization_id
    ) THEN
      RAISE EXCEPTION 'Santri ID % tidak terdaftar pada organisasi ini', v_santri_id;
    END IF;

    -- Validasi santri mutlak harus berada di roster snapshot sesi
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_session.roster_snapshot, '[]'::jsonb)) r
      WHERE (r->>'santri_id')::bigint = v_santri_id
    ) INTO v_in_roster;

    IF NOT COALESCE(v_in_roster, false) THEN
      RAISE EXCEPTION 'Santri ID % tidak termasuk dalam roster halaqah pada sesi ini.', v_santri_id;
    END IF;

    -- Simpan ke attendance_records (V2) dengan idempotency key
    INSERT INTO public.attendance_records (
      organization_id, session_id, halaqah_id, santri_id,
      attendance_date, session_slot, status, idempotency_key,
      marked_by, correction_reason, updated_at
    )
    VALUES (
      v_session.organization_id, v_session.id, v_session.halaqah_id, v_santri_id,
      v_session.session_date, v_session.session_slot, v_status,
      COALESCE(p_idempotency_key, 'batch') || '_' || v_santri_id::text,
      auth.uid(), NULLIF(TRIM(COALESCE(p_reason, '')), ''), now()
    )
    ON CONFLICT (session_id, santri_id) DO UPDATE
    SET status = EXCLUDED.status,
        marked_by = EXCLUDED.marked_by,
        correction_reason = COALESCE(EXCLUDED.correction_reason, public.attendance_records.correction_reason),
        updated_at = now();

    -- Sinkronisasi atomik ke tabel attendance (legacy compatibility)
    v_legacy_status := CASE v_status
      WHEN 'hadir' THEN 'Hadir'
      WHEN 'izin' THEN 'Izin'
      WHEN 'sakit' THEN 'Sakit'
      WHEN 'alpa' THEN 'Alpa'
      WHEN 'terlambat' THEN 'Terlambat'
      ELSE 'Hadir'
    END;

    DELETE FROM public.attendance
    WHERE organization_id = v_session.organization_id
      AND date = v_session.session_date::text
      AND waktu = v_session.session_slot
      AND peran = 'Santri'
      AND person_id = v_santri_id;

    INSERT INTO public.attendance (
      organization_id, academic_year_id, date, waktu, peran, person_id, status, halaqah_id
    )
    VALUES (
      v_session.organization_id, v_session.academic_year_id, v_session.session_date::text,
      v_session.session_slot, 'Santri', v_santri_id, v_legacy_status, v_session.halaqah_id
    );

    v_saved_count := v_saved_count + 1;
  END LOOP;

  -- Update status sesi menjadi 'submitted' jika sebelumnya 'scheduled' atau 'open'
  IF v_session.status IN ('scheduled', 'open') AND v_saved_count > 0 THEN
    UPDATE public.halaqah_sessions
    SET status = 'submitted',
        completed_by = COALESCE(completed_by, auth.uid()),
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_session.id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_session.organization_id, auth.uid(), v_role,
    CASE WHEN v_session.status = 'locked' THEN 'post_lock_attendance_correction' ELSE 'save_attendance_batch' END,
    'halaqah_sessions', v_session.id::text, NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    jsonb_build_object(
      'saved_count', v_saved_count,
      'session_date', v_session.session_date,
      'session_slot', v_session.session_slot,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'saved_count', v_saved_count,
    'status', CASE WHEN v_session.status = 'locked' THEN 'locked' ELSE 'submitted' END,
    'idempotency_key', p_idempotency_key
  );
END;
$$;

-- 5.6 RPC Kunci Sesi Halaqah (Lock Halaqah Session)
CREATE OR REPLACE FUNCTION public.rpc_lock_halaqah_session(
  p_halaqah_id bigint,
  p_session_date date,
  p_session_slot text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_year_id bigint;
  v_role text;
  v_session public.halaqah_sessions%ROWTYPE;
  v_roster_count integer := 0;
  v_recorded_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT h.organization_id, h.academic_year_id
  INTO v_org_id, v_year_id
  FROM public.halaqah h
  WHERE h.id = p_halaqah_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Halaqah tidak ditemukan';
  END IF;

  v_role := public.get_role_for_org(v_org_id);
  IF v_role = 'musammi' THEN
    IF NOT (
      public.is_musammi_assigned_to_halaqah_on_date(v_org_id, p_halaqah_id, p_session_date)
      OR public.is_musammi_assigned_to_halaqah(v_org_id, p_halaqah_id)
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: Anda bukan pengampu halaqah ini';
    END IF;
  ELSIF v_role = 'superadmin' THEN
    IF NOT public.has_active_support_session(v_org_id, true) THEN
      RAISE EXCEPTION 'Akses ditolak: Superadmin memerlukan Support Session read_write aktif';
    END IF;
  ELSIF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Akses ditolak untuk mengunci sesi halaqah';
  END IF;

  SELECT * INTO v_session
  FROM public.halaqah_sessions
  WHERE organization_id = v_org_id
    AND halaqah_id = p_halaqah_id
    AND session_date = p_session_date
    AND session_slot = p_session_slot;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi halaqah belum dibuka atau belum memiliki presensi tersimpan.';
  END IF;

  -- Jika sesi sudah terkunci, kembalikan status idempoten
  IF v_session.status = 'locked' THEN
    RETURN jsonb_build_object(
      'session_id', v_session.id,
      'status', 'locked',
      'message', 'Sesi sudah dalam status terkunci'
    );
  END IF;

  -- Hitung roster
  IF jsonb_typeof(v_session.roster_snapshot) = 'array' THEN
    v_roster_count := jsonb_array_length(v_session.roster_snapshot);
  END IF;

  IF v_roster_count = 0 THEN
    RAISE EXCEPTION 'Sesi tidak dapat dikunci: Tidak ada santri dalam roster halaqah.';
  END IF;

  -- Hitung santri yang sudah memiliki catatan kehadiran
  SELECT COUNT(*) INTO v_recorded_count
  FROM public.attendance_records ar
  WHERE ar.session_id = v_session.id
    AND ar.status IN ('hadir', 'izin', 'sakit', 'alpa', 'terlambat');

  -- Validasi ketuntasan: Tidak boleh mengunci jika masih ada santri dalam roster yang belum diisi
  IF v_recorded_count < v_roster_count THEN
    RAISE EXCEPTION 'Sesi belum dapat dikunci: Masih ada % dari % santri dalam roster yang belum memiliki status kehadiran.', (v_roster_count - v_recorded_count), v_roster_count;
  END IF;

  UPDATE public.halaqah_sessions
  SET status = 'locked',
      locked_by = auth.uid(),
      locked_at = now(),
      updated_at = now()
  WHERE id = v_session.id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), v_role, 'lock_halaqah_session', 'halaqah_sessions', v_session.id::text,
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Penguncian sesi operasional halaqah'),
    jsonb_build_object(
      'halaqah_id', p_halaqah_id,
      'session_date', p_session_date,
      'session_slot', p_session_slot,
      'status', 'locked',
      'recorded_count', v_recorded_count
    )
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'status', 'locked',
    'recorded_count', v_recorded_count
  );
END;
$$;

-- Overload rpc_lock_halaqah_session dengan parameter p_session_id (UUID)
CREATE OR REPLACE FUNCTION public.rpc_lock_halaqah_session(
  p_session_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.halaqah_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.halaqah_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi halaqah tidak ditemukan.';
  END IF;

  RETURN public.rpc_lock_halaqah_session(
    v_session.halaqah_id,
    v_session.session_date,
    v_session.session_slot,
    p_reason
  );
END;
$$;

-- 5.7 Perketat RLS halaqah_sessions & attendance_records
DROP POLICY IF EXISTS halaqah_sessions_role_update ON public.halaqah_sessions;
CREATE POLICY halaqah_sessions_role_update ON public.halaqah_sessions
  FOR UPDATE TO authenticated
  USING (
    status <> 'locked'
    AND (
      public.is_admin_of_org(organization_id)
      OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
    )
  )
  WITH CHECK (
    status IN ('scheduled', 'open', 'submitted', 'completed', 'cancelled')
    AND (
      public.is_admin_of_org(organization_id)
      OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
    )
  );

DROP POLICY IF EXISTS halaqah_sessions_role_delete ON public.halaqah_sessions;
CREATE POLICY halaqah_sessions_role_delete ON public.halaqah_sessions
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id) AND status <> 'locked');

DROP POLICY IF EXISTS attendance_records_role_insert ON public.attendance_records;
CREATE POLICY attendance_records_role_insert ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin_of_org(organization_id)
      OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.halaqah_sessions hs
      WHERE hs.id = public.attendance_records.session_id
        AND hs.status = 'locked'
    )
  );

DROP POLICY IF EXISTS attendance_records_role_update ON public.attendance_records;
CREATE POLICY attendance_records_role_update ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (
    (
      public.is_admin_of_org(organization_id)
      OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.halaqah_sessions hs
      WHERE hs.id = public.attendance_records.session_id
        AND hs.status = 'locked'
    )
  )
  WITH CHECK (
    (
      public.is_admin_of_org(organization_id)
      OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.halaqah_sessions hs
      WHERE hs.id = public.attendance_records.session_id
        AND hs.status = 'locked'
    )
  );

GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_halaqah_on_date(uuid, bigint, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_validate_session_state_machine() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_validate_attendance_record() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_open_halaqah_session(bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_attendance_batch(uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_lock_halaqah_session(bigint, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_lock_halaqah_session(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- FASE 6: SETORAN & MURAJAAH HARDENING
-- ---------------------------------------------------------------------------------

ALTER TABLE public.recitation_entries
  ADD COLUMN IF NOT EXISTS santri_id bigint,
  ADD COLUMN IF NOT EXISTS entry_date date,
  ADD COLUMN IF NOT EXISTS start_surah text,
  ADD COLUMN IF NOT EXISTS end_surah text,
  ADD COLUMN IF NOT EXISTS start_ayah integer,
  ADD COLUMN IF NOT EXISTS end_ayah integer,
  ADD COLUMN IF NOT EXISTS pages numeric(6,2),
  ADD COLUMN IF NOT EXISTS legacy_setoran_id bigint,
  ADD COLUMN IF NOT EXISTS major_mistakes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minor_mistakes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.normalize_recitation_entries_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.student_id := COALESCE(NEW.student_id, NEW.santri_id);
  NEW.santri_id := COALESCE(NEW.santri_id, NEW.student_id);
  NEW.recitation_date := COALESCE(NEW.recitation_date, NEW.entry_date, CURRENT_DATE);
  NEW.entry_date := COALESCE(NEW.entry_date, NEW.recitation_date);
  NEW.ayah_start := COALESCE(NEW.ayah_start, NEW.start_ayah);
  NEW.start_ayah := COALESCE(NEW.start_ayah, NEW.ayah_start);
  NEW.ayah_end := COALESCE(NEW.ayah_end, NEW.end_ayah);
  NEW.end_ayah := COALESCE(NEW.end_ayah, NEW.ayah_end);
  NEW.calculated_pages := COALESCE(NULLIF(NEW.calculated_pages, 0), NEW.pages, 0);
  NEW.pages := COALESCE(NULLIF(NEW.pages, 0), NEW.calculated_pages, 0);
  NEW.mistakes_minor := COALESCE(NULLIF(NEW.mistakes_minor, 0), NEW.minor_mistakes, 0);
  NEW.minor_mistakes := COALESCE(NULLIF(NEW.minor_mistakes, 0), NEW.mistakes_minor, 0);
  NEW.mistakes_major := COALESCE(NULLIF(NEW.mistakes_major, 0), NEW.major_mistakes, 0);
  NEW.major_mistakes := COALESCE(NULLIF(NEW.major_mistakes, 0), NEW.mistakes_major, 0);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_recitation_entries ON public.recitation_entries;
CREATE TRIGGER trg_normalize_recitation_entries
BEFORE INSERT OR UPDATE ON public.recitation_entries
FOR EACH ROW
EXECUTE FUNCTION public.normalize_recitation_entries_row();

-- 6.1 State Machine Validation Trigger
CREATE OR REPLACE FUNCTION public.fn_validate_recitation_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Validasi batasan Qur'an
  IF NEW.surah_start_no IS NOT NULL AND (NEW.surah_start_no < 1 OR NEW.surah_start_no > 114) THEN
    RAISE EXCEPTION 'Nomor surat mulai tidak valid (harus 1-114).';
  END IF;
  IF NEW.surah_end_no IS NOT NULL AND (NEW.surah_end_no < 1 OR NEW.surah_end_no > 114) THEN
    RAISE EXCEPTION 'Nomor surat selesai tidak valid (harus 1-114).';
  END IF;
  IF NEW.surah_start_no IS NOT NULL AND NEW.surah_end_no IS NOT NULL THEN
    IF NEW.surah_end_no < NEW.surah_start_no THEN
      RAISE EXCEPTION 'Surat selesai tidak boleh mendahului surat mulai.';
    ELSIF NEW.surah_end_no = NEW.surah_start_no AND NEW.ayah_end < NEW.ayah_start THEN
      RAISE EXCEPTION 'Ayat selesai tidak boleh lebih kecil dari ayat mulai pada surat yang sama.';
    END IF;
  END IF;
  IF NEW.ayah_start IS NOT NULL AND NEW.ayah_start < 1 THEN
    RAISE EXCEPTION 'Ayat mulai harus lebih besar dari 0.';
  END IF;
  IF NEW.ayah_end IS NOT NULL AND NEW.ayah_end < 1 THEN
    RAISE EXCEPTION 'Ayat selesai harus lebih besar dari 0.';
  END IF;
  IF COALESCE(NEW.mistakes_minor, 0) < 0 OR COALESCE(NEW.minor_mistakes, 0) < 0 THEN
    RAISE EXCEPTION 'Jumlah kesalahan shoghir tidak boleh negatif.';
  END IF;
  IF COALESCE(NEW.mistakes_major, 0) < 0 OR COALESCE(NEW.major_mistakes, 0) < 0 THEN
    RAISE EXCEPTION 'Jumlah kesalahan kabir tidak boleh negatif.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'submitted') THEN
      RAISE EXCEPTION 'Setoran baru hanya dapat dibuat dengan status draft atau submitted.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Catatan voided bersifat terminal dan immutable
    IF OLD.status = 'voided' THEN
      RAISE EXCEPTION 'Catatan setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah.';
    END IF;

    v_is_admin := public.is_admin_of_org(OLD.organization_id);

    IF OLD.status = NEW.status THEN
      -- Saat status submitted, Musammi dilarang mengubah langsung konten tanpa proses return
      IF OLD.status = 'submitted' AND NOT v_is_admin THEN
        IF (
          NEW.surah_start_no IS DISTINCT FROM OLD.surah_start_no OR
          NEW.ayah_start IS DISTINCT FROM OLD.ayah_start OR
          NEW.surah_end_no IS DISTINCT FROM OLD.surah_end_no OR
          NEW.ayah_end IS DISTINCT FROM OLD.ayah_end OR
          NEW.calculated_pages IS DISTINCT FROM OLD.calculated_pages OR
          NEW.kind IS DISTINCT FROM OLD.kind
        ) THEN
          RAISE EXCEPTION 'Setoran yang berstatus submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return oleh Admin.';
        END IF;
      ELSIF OLD.status = 'accepted' AND NOT v_is_admin THEN
        IF (
          NEW.surah_start_no IS DISTINCT FROM OLD.surah_start_no OR
          NEW.ayah_start IS DISTINCT FROM OLD.ayah_start OR
          NEW.surah_end_no IS DISTINCT FROM OLD.surah_end_no OR
          NEW.ayah_end IS DISTINCT FROM OLD.ayah_end
        ) THEN
          RAISE EXCEPTION 'Setoran yang telah diterima (accepted) tidak dapat diubah langsung.';
        END IF;
      END IF;
    ELSE
      -- Validasi transisi status
      IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
        NULL;
      ELSIF OLD.status = 'draft' AND NEW.status = 'voided' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Hanya Admin yang dapat membatalkan (void) setoran.';
        END IF;
        IF COALESCE(LENGTH(TRIM(NEW.review_reason)), 0) < 5 THEN
          RAISE EXCEPTION 'Alasan pembatalan setoran wajib minimal 5 karakter.';
        END IF;
      ELSIF OLD.status = 'submitted' AND NEW.status = 'accepted' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Hanya Admin yang dapat menerima (accept) setoran.';
        END IF;
      ELSIF OLD.status = 'submitted' AND NEW.status = 'returned' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Hanya Admin yang dapat mengembalikan (return) setoran.';
        END IF;
        IF COALESCE(LENGTH(TRIM(NEW.review_reason)), 0) < 5 THEN
          RAISE EXCEPTION 'Alasan pengembalian setoran wajib minimal 5 karakter.';
        END IF;
      ELSIF OLD.status = 'submitted' AND NEW.status = 'voided' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Hanya Admin yang dapat membatalkan (void) setoran.';
        END IF;
        IF COALESCE(LENGTH(TRIM(NEW.review_reason)), 0) < 5 THEN
          RAISE EXCEPTION 'Alasan pembatalan setoran wajib minimal 5 karakter.';
        END IF;
      ELSIF OLD.status = 'returned' AND NEW.status = 'submitted' THEN
        IF NEW.revision_no <= OLD.revision_no THEN
          NEW.revision_no := OLD.revision_no + 1;
        END IF;
      ELSIF OLD.status = 'returned' AND NEW.status = 'voided' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Hanya Admin yang dapat membatalkan (void) setoran.';
        END IF;
        IF COALESCE(LENGTH(TRIM(NEW.review_reason)), 0) < 5 THEN
          RAISE EXCEPTION 'Alasan pembatalan setoran wajib minimal 5 karakter.';
        END IF;
      ELSIF OLD.status = 'accepted' AND NEW.status = 'voided' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Hanya Admin yang dapat membatalkan (void) setoran yang telah diterima.';
        END IF;
        IF COALESCE(LENGTH(TRIM(NEW.review_reason)), 0) < 5 THEN
          RAISE EXCEPTION 'Alasan pembatalan setoran wajib minimal 5 karakter.';
        END IF;
      ELSE
        RAISE EXCEPTION 'Transisi status setoran tidak sah: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_recitation_state_machine ON public.recitation_entries;
CREATE TRIGGER trg_validate_recitation_state_machine
BEFORE INSERT OR UPDATE ON public.recitation_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_recitation_state_machine();

-- 6.2 Pencegahan Tampering Riwayat Revisi (Append-Only)
CREATE OR REPLACE FUNCTION public.trg_prevent_recitation_revision_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Riwayat revisi setoran (recitation_revisions) bersifat immutable append-only dan tidak dapat diubah atau dihapus.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_recitation_revision_tampering ON public.recitation_revisions;
CREATE TRIGGER trg_prevent_recitation_revision_tampering
BEFORE UPDATE OR DELETE ON public.recitation_revisions
FOR EACH ROW
EXECUTE FUNCTION public.trg_prevent_recitation_revision_tampering();

-- 6.3 RPC Penyerahan Setoran Kanonikal (Mendukung Draft, Submitted, Resubmit Returned, dan Idempotency)
CREATE OR REPLACE FUNCTION public.rpc_submit_recitation_entry(
  p_santri_id bigint,
  p_halaqah_id bigint,
  p_recitation_date date,
  p_session_slot text,
  p_kind text,
  p_surah_start_no integer,
  p_ayah_start integer,
  p_surah_end_no integer,
  p_ayah_end integer,
  p_calculated_pages numeric DEFAULT 0,
  p_minor_mistakes integer DEFAULT 0,
  p_major_mistakes integer DEFAULT 0,
  p_predicate text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_status text DEFAULT 'submitted',
  p_idempotency_key text DEFAULT NULL,
  p_existing_entry_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_org_id uuid;
  v_is_admin boolean;
  v_clean_kind text;
  v_clean_status text;
  v_academic_year_id bigint;
  v_existing_entry public.recitation_entries%ROWTYPE;
  v_entry_id uuid;
  v_legacy_id bigint;
  v_revision_no integer;
  v_surah_start_name text;
  v_surah_end_name text;
  v_surat_label text;
  v_ayat_label text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Autentikasi diperlukan.';
  END IF;

  -- 1. Identifikasi tenant dari santri
  SELECT organization_id INTO v_org_id
  FROM public.santri
  WHERE id = p_santri_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Santri dengan ID % tidak ditemukan.', p_santri_id;
  END IF;

  v_is_admin := public.is_admin_of_org(v_org_id);

  -- 2. Hak akses: Admin Lembaga atau Musammi tertugas pada tanggal sesi
  IF NOT v_is_admin THEN
    IF NOT public.is_musammi_assigned_to_halaqah_on_date(v_caller_id, p_halaqah_id, p_recitation_date) THEN
      RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki penugasan musammi aktif untuk halaqah ini pada tanggal %.', p_recitation_date;
    END IF;
  END IF;

  -- 3. Normalisasi status dan jenis
  v_clean_status := LOWER(TRIM(COALESCE(p_status, 'submitted')));
  IF v_clean_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Status penyerahan setoran tidak valid: hanya draft atau submitted yang diperbolehkan.';
  END IF;

  v_clean_kind := LOWER(TRIM(COALESCE(p_kind, 'ziyadah')));
  IF v_clean_kind LIKE '%sabqi%' THEN
    v_clean_kind := 'sabqi';
  ELSIF v_clean_kind LIKE '%manzil%' OR v_clean_kind LIKE '%murojaah%' OR v_clean_kind LIKE '%murajaah%' THEN
    v_clean_kind := 'manzil';
  ELSE
    v_clean_kind := 'ziyadah';
  END IF;

  -- 4. Validasi Qur'an
  IF p_surah_start_no < 1 OR p_surah_start_no > 114 THEN
    RAISE EXCEPTION 'Nomor surat mulai (%) tidak valid. Harus antara 1 dan 114.', p_surah_start_no;
  END IF;
  IF p_surah_end_no < 1 OR p_surah_end_no > 114 THEN
    RAISE EXCEPTION 'Nomor surat selesai (%) tidak valid. Harus antara 1 dan 114.', p_surah_end_no;
  END IF;
  IF p_ayah_start < 1 THEN
    RAISE EXCEPTION 'Ayat mulai (%) harus lebih besar dari 0.', p_ayah_start;
  END IF;
  IF p_ayah_end < 1 THEN
    RAISE EXCEPTION 'Ayat selesai (%) harus lebih besar dari 0.', p_ayah_end;
  END IF;
  IF p_surah_end_no < p_surah_start_no OR (p_surah_end_no = p_surah_start_no AND p_ayah_end < p_ayah_start) THEN
    RAISE EXCEPTION 'Urutan surat/ayat selesai tidak boleh lebih kecil dari surat/ayat mulai.';
  END IF;
  IF COALESCE(p_minor_mistakes, 0) < 0 THEN
    RAISE EXCEPTION 'Jumlah kesalahan shoghir tidak boleh negatif.';
  END IF;
  IF COALESCE(p_major_mistakes, 0) < 0 THEN
    RAISE EXCEPTION 'Jumlah kesalahan kabir tidak boleh negatif.';
  END IF;

  -- 5. Ambil Tahun Ajaran Aktif untuk Org
  SELECT id INTO v_academic_year_id
  FROM public.academic_years
  WHERE organization_id = v_org_id AND is_active = true
  LIMIT 1;

  -- 6. Pencegahan duplikasi submit ulang dengan idempotency_key
  IF p_idempotency_key IS NOT NULL AND p_existing_entry_id IS NULL THEN
    SELECT * INTO v_existing_entry
    FROM public.recitation_entries
    WHERE organization_id = v_org_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing_entry.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'id', v_existing_entry.id,
        'legacy_id', v_existing_entry.legacy_setoran_id,
        'status', v_existing_entry.status,
        'revision_no', v_existing_entry.revision_no,
        'is_duplicate_prevented', true
      );
    END IF;
  END IF;

  -- 7. Persiapan label legacy
  v_surah_start_name := 'Surat ' || p_surah_start_no::text;
  v_surah_end_name := 'Surat ' || p_surah_end_no::text;
  IF p_surah_start_no = p_surah_end_no THEN
    v_surat_label := v_surah_start_name;
    v_ayat_label := p_ayah_start::text || '-' || p_ayah_end::text;
  ELSE
    v_surat_label := v_surah_start_name || ' - ' || v_surah_end_name;
    v_ayat_label := p_ayah_start::text || ' - ' || p_ayah_end::text;
  END IF;

  -- 8. Cabang Update / Resubmit Entry yang Ada
  IF p_existing_entry_id IS NOT NULL THEN
    SELECT * INTO v_existing_entry
    FROM public.recitation_entries
    WHERE id = p_existing_entry_id
      AND organization_id = v_org_id;

    IF v_existing_entry.id IS NULL THEN
      RAISE EXCEPTION 'Catatan setoran dengan ID % tidak ditemukan.', p_existing_entry_id;
    END IF;

    IF v_existing_entry.status = 'submitted' AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Setoran yang berstatus submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return oleh Admin.';
    END IF;

    IF v_existing_entry.status = 'voided' THEN
      RAISE EXCEPTION 'Setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah.';
    END IF;

    v_revision_no := COALESCE(v_existing_entry.revision_no, 1) + 1;

    UPDATE public.recitation_entries
    SET academic_year_id = COALESCE(v_academic_year_id, v_existing_entry.academic_year_id),
        session_id = COALESCE(p_session_id, v_existing_entry.session_id),
        halaqah_id = p_halaqah_id,
        recitation_date = p_recitation_date,
        session_slot = p_session_slot,
        kind = v_clean_kind,
        surah_start_no = p_surah_start_no,
        ayah_start = p_ayah_start,
        surah_end_no = p_surah_end_no,
        ayah_end = p_ayah_end,
        calculated_pages = COALESCE(p_calculated_pages, 0),
        minor_mistakes = COALESCE(p_minor_mistakes, 0),
        major_mistakes = COALESCE(p_major_mistakes, 0),
        mistakes_minor = COALESCE(p_minor_mistakes, 0),
        mistakes_major = COALESCE(p_major_mistakes, 0),
        predicate = p_predicate,
        notes = p_notes,
        status = v_clean_status,
        revision_no = v_revision_no,
        updated_at = now()
    WHERE id = v_existing_entry.id;

    IF v_existing_entry.legacy_setoran_id IS NOT NULL THEN
      UPDATE public.setoran_harian
      SET halaqah_id = p_halaqah_id,
          tanggal = p_recitation_date,
          waktu = p_session_slot,
          skema = v_clean_kind,
          surat_mulai = v_surah_start_name,
          ayat_mulai = p_ayah_start::text,
          surat_selesai = v_surah_end_name,
          ayat_selesai = p_ayah_end::text,
          surat = v_surat_label,
          ayat = v_ayat_label,
          jumlah_halaman = COALESCE(p_calculated_pages, 0),
          kesalahan_shoghir = COALESCE(p_minor_mistakes, 0),
          kesalahan_kabir = COALESCE(p_major_mistakes, 0),
          nilai = p_predicate,
          keterangan = p_notes,
          status_verifikasi = v_clean_status,
          updated_at = now()
      WHERE id = v_existing_entry.legacy_setoran_id
        AND organization_id = v_org_id;
    END IF;

    INSERT INTO public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot,
      actor_id, changed_by
    )
    VALUES (
      v_org_id, v_existing_entry.id, v_existing_entry.id, v_revision_no,
      CASE
        WHEN v_existing_entry.status = 'returned' AND v_clean_status = 'submitted' THEN 'resubmit'
        WHEN v_clean_status = 'draft' THEN 'update_draft'
        ELSE 'update_submission'
      END,
      v_existing_entry.status, v_clean_status,
      COALESCE(p_notes, 'Perubahan data setoran oleh pengajar'),
      to_jsonb(v_existing_entry),
      jsonb_build_object(
        'status', v_clean_status,
        'revision_no', v_revision_no,
        'surah_start_no', p_surah_start_no,
        'ayah_start', p_ayah_start,
        'surah_end_no', p_surah_end_no,
        'ayah_end', p_ayah_end,
        'calculated_pages', p_calculated_pages
      ),
      v_caller_id, v_caller_id
    );

    v_entry_id := v_existing_entry.id;

  ELSE
    -- 9. Pembuatan Baru Secara Atomik
    INSERT INTO public.setoran_harian (
      organization_id, santri_id, halaqah_id, tanggal, waktu,
      skema, surat_mulai, ayat_mulai, surat_selesai, ayat_selesai,
      surat, ayat, jumlah_halaman, kesalahan_shoghir, kesalahan_kabir,
      nilai, keterangan, status_verifikasi, created_at, updated_at
    )
    VALUES (
      v_org_id, p_santri_id, p_halaqah_id, p_recitation_date, p_session_slot,
      v_clean_kind, v_surah_start_name, p_ayah_start::text, v_surah_end_name, p_ayah_end::text,
      v_surat_label, v_ayat_label, COALESCE(p_calculated_pages, 0),
      COALESCE(p_minor_mistakes, 0), COALESCE(p_major_mistakes, 0),
      p_predicate, p_notes, v_clean_status, now(), now()
    )
    RETURNING id INTO v_legacy_id;

    INSERT INTO public.recitation_entries (
      organization_id, academic_year_id, session_id, halaqah_id,
      student_id, santri_id, recitation_date, session_slot,
      kind, surah_start_no, ayah_start, surah_end_no, ayah_end,
      calculated_pages, minor_mistakes, major_mistakes,
      mistakes_minor, mistakes_major, predicate, notes,
      status, revision_no, idempotency_key, legacy_setoran_id,
      created_by, created_at, updated_at
    )
    VALUES (
      v_org_id, v_academic_year_id, p_session_id, p_halaqah_id,
      p_santri_id, p_santri_id, p_recitation_date, p_session_slot,
      v_clean_kind, p_surah_start_no, p_ayah_start, p_surah_end_no, p_ayah_end,
      COALESCE(p_calculated_pages, 0), COALESCE(p_minor_mistakes, 0), COALESCE(p_major_mistakes, 0),
      COALESCE(p_minor_mistakes, 0), COALESCE(p_major_mistakes, 0), p_predicate, p_notes,
      v_clean_status, 1, p_idempotency_key, v_legacy_id,
      v_caller_id, now(), now()
    )
    RETURNING id INTO v_entry_id;

    v_revision_no := 1;

    INSERT INTO public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot,
      actor_id, changed_by
    )
    VALUES (
      v_org_id, v_entry_id, v_entry_id, 1,
      CASE WHEN v_clean_status = 'draft' THEN 'create_draft' ELSE 'create_submission' END,
      NULL, v_clean_status, 'Entri setoran baru dicatat',
      '{}'::jsonb,
      jsonb_build_object(
        'status', v_clean_status,
        'revision_no', 1,
        'surah_start_no', p_surah_start_no,
        'ayah_start', p_ayah_start,
        'surah_end_no', p_surah_end_no,
        'ayah_end', p_ayah_end,
        'calculated_pages', p_calculated_pages
      ),
      v_caller_id, v_caller_id
    );
  END IF;

  -- 10. Audit Log
  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id,
    before_state, after_state
  )
  VALUES (
    v_org_id, v_caller_id,
    CASE WHEN v_is_admin THEN 'admin' ELSE 'musammi' END,
    'submit_recitation_' || v_clean_status,
    'recitation_entries', v_entry_id::text,
    CASE WHEN v_existing_entry.id IS NOT NULL THEN jsonb_build_object('status', v_existing_entry.status) ELSE '{}'::jsonb END,
    jsonb_build_object('status', v_clean_status, 'revision_no', v_revision_no, 'legacy_id', v_legacy_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_entry_id,
    'legacy_id', COALESCE(v_legacy_id, v_existing_entry.legacy_setoran_id),
    'status', v_clean_status,
    'revision_no', v_revision_no
  );
END;
$$;

-- 6.4 RPC Review / Verifikasi Entri Setoran (Accepted / Returned / Voided)
CREATE OR REPLACE FUNCTION public.rpc_review_recitation_entry(
  p_entry_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.recitation_entries%ROWTYPE;
  v_clean_status text;
  v_role text;
  v_new_revision_no integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Akses ditolak: Autentikasi diperlukan.';
  END IF;

  SELECT * INTO v_entry FROM public.recitation_entries WHERE id = p_entry_id;
  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Data setoran tidak ditemukan';
  END IF;

  -- Hanya Admin Lembaga pemilik organisasi atau Superadmin yang dapat mereview setoran
  IF NOT public.is_admin_of_org(v_entry.organization_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Admin Lembaga yang dapat memvalidasi atau membatalkan catatan setoran.';
  END IF;

  IF v_entry.status = 'voided' THEN
    RAISE EXCEPTION 'Catatan setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat ditinjau ulang.';
  END IF;

  v_role := COALESCE(public.get_role_for_org(v_entry.organization_id), 'admin');

  v_clean_status := LOWER(TRIM(COALESCE(p_new_status, 'accepted')));
  IF v_clean_status NOT IN ('accepted', 'returned', 'voided') THEN
    RAISE EXCEPTION 'Status verifikasi tidak valid: hanya accepted, returned, atau voided.';
  END IF;

  -- Validasi panjang alasan: minimal 5 karakter untuk returned dan voided
  IF v_clean_status IN ('returned', 'voided') AND COALESCE(LENGTH(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Alasan wajib diisi minimal 5 karakter saat mengembalikan atau membatalkan catatan setoran.';
  END IF;

  v_new_revision_no := COALESCE(v_entry.revision_no, 1) + 1;

  UPDATE public.recitation_entries
  SET status = v_clean_status,
      revision_no = v_new_revision_no,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_reason = p_reason,
      updated_at = now()
  WHERE id = p_entry_id;

  -- Sinkronisasi status verifikasi ke setoran_harian legacy jika terhubung
  IF v_entry.legacy_setoran_id IS NOT NULL THEN
    UPDATE public.setoran_harian
    SET status_verifikasi = v_clean_status,
        reviewed_by = auth.uid(),
        review_reason = p_reason,
        updated_at = now()
    WHERE id = v_entry.legacy_setoran_id
      AND organization_id = v_entry.organization_id;
  END IF;

  INSERT INTO public.recitation_revisions (
    organization_id, entry_id, recitation_entry_id, revision_no, action,
    previous_status, new_status, reason, before_snapshot, after_snapshot,
    actor_id, changed_by
  )
  VALUES (
    v_entry.organization_id, v_entry.id, v_entry.id, v_new_revision_no,
    CASE
      WHEN v_clean_status = 'accepted' THEN 'accept'
      WHEN v_clean_status = 'returned' THEN 'return'
      WHEN v_clean_status = 'voided' THEN 'void'
      ELSE 'review'
    END,
    v_entry.status, v_clean_status, p_reason,
    to_jsonb(v_entry),
    jsonb_build_object('status', v_clean_status, 'reason', p_reason, 'reviewed_at', now(), 'revision_no', v_new_revision_no),
    auth.uid(), auth.uid()
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state
  )
  VALUES (
    v_entry.organization_id, auth.uid(), v_role,
    'review_recitation_' || v_clean_status, 'recitation_entries', v_entry.id::text, p_reason,
    jsonb_build_object('status', v_entry.status, 'revision_no', v_entry.revision_no),
    jsonb_build_object('status', v_clean_status, 'revision_no', v_new_revision_no)
  );

  RETURN jsonb_build_object('success', true, 'id', v_entry.id, 'status', v_clean_status, 'revision_no', v_new_revision_no);
END;
$$;

-- Overload review dengan ID legacy
CREATE OR REPLACE FUNCTION public.rpc_review_recitation_entry(
  p_legacy_id bigint,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_v2_id uuid;
BEGIN
  SELECT id INTO v_v2_id
  FROM public.recitation_entries
  WHERE legacy_setoran_id = p_legacy_id
  LIMIT 1;

  IF v_v2_id IS NULL THEN
    RAISE EXCEPTION 'Catatan setoran V2 untuk ID legacy % tidak ditemukan.', p_legacy_id;
  END IF;

  RETURN public.rpc_review_recitation_entry(v_v2_id, p_new_status, p_reason);
END;
$$;

-- 6.5 Indeks Performa Ledger dan Filter
CREATE INDEX IF NOT EXISTS idx_recitation_entries_org_filter
  ON public.recitation_entries(organization_id, academic_year_id, recitation_date DESC, halaqah_id, status);

CREATE INDEX IF NOT EXISTS idx_recitation_entries_idempotency
  ON public.recitation_entries(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------------
-- FASE 7: UJIAN, RUBRIK & RAPORT IMMUTABILITY HARDENING
-- ---------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_cards_org_year_sem_santri_ver_uniq
  ON public.report_cards(organization_id, academic_year_id, semester_name, santri_id, version_no);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_cards_one_published_uniq
  ON public.report_cards(organization_id, academic_year_id, semester_name, santri_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_cards_verification_code_uniq
  ON public.report_cards(verification_code)
  WHERE verification_code IS NOT NULL;

-- Trigger Immutability pada report_cards yang sudah berstatus published / amended / archived
CREATE OR REPLACE FUNCTION public.enforce_report_card_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'amended', 'archived') THEN
      RAISE EXCEPTION 'Snapshot raport yang telah diterbitkan bersifat immutable dan tidak dapat dihapus.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('published', 'amended', 'archived') THEN
      -- Validasi transisi status:
      -- published -> amended atau archived (diizinkan)
      -- amended / archived -> status apa pun yang berbeda (DITOLAK)
      IF OLD.status = 'published' AND NEW.status NOT IN ('published', 'amended', 'archived') THEN
        RAISE EXCEPTION 'Transisi status raport tidak valid: Raport published hanya dapat diubah menjadi amended atau archived.';
      END IF;
      IF OLD.status IN ('amended', 'archived') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Snapshot raport berstatus % bersifat final dan statusnya tidak dapat diubah kembali.', OLD.status;
      END IF;

      -- Lindungi seluruh kolom metadata & isi snapshot dari mutasi
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
         OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
         OR NEW.semester_name IS DISTINCT FROM OLD.semester_name
         OR NEW.santri_id IS DISTINCT FROM OLD.santri_id
         OR NEW.version_no IS DISTINCT FROM OLD.version_no
         OR NEW.final_score IS DISTINCT FROM OLD.final_score
         OR NEW.predikat IS DISTINCT FROM OLD.predikat
         OR NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json
         OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
         OR NEW.verification_code IS DISTINCT FROM OLD.verification_code
         OR NEW.parent_report_card_id IS DISTINCT FROM OLD.parent_report_card_id
         OR NEW.amendment_reason IS DISTINCT FROM OLD.amendment_reason
         OR NEW.published_by IS DISTINCT FROM OLD.published_by
         OR NEW.published_at IS DISTINCT FROM OLD.published_at
      THEN
        RAISE EXCEPTION 'Snapshot raport yang telah diterbitkan bersifat immutable. Gunakan fitur Amendment untuk menerbitkan versi revisi baru.';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.snapshot_hash IS NULL AND NEW.snapshot_json IS NOT NULL THEN
      NEW.snapshot_hash := encode(digest(convert_to(NEW.snapshot_json::text, 'UTF8'), 'sha256'), 'hex');
    END IF;
    IF NEW.verification_code IS NULL AND NEW.snapshot_hash IS NOT NULL THEN
      NEW.verification_code := 'LQ-' || UPPER(SUBSTRING(NEW.snapshot_hash FROM 1 FOR 6)) || '-' || UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 4));
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_report_card_immutability ON public.report_cards;
CREATE TRIGGER trg_enforce_report_card_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.report_cards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_report_card_immutability();

-- 7.1 RPC Pencatatan Hasil Ujian & Remedial (Atomik, Tidak Menimpa Attempt Lama)
CREATE OR REPLACE FUNCTION public.rpc_record_exam_attempt(
  p_org_id uuid,
  p_academic_year_id bigint,
  p_semester text,
  p_exam_type text,
  p_santri_id bigint,
  p_materi_juz text,
  p_raw_score numeric,
  p_final_score numeric,
  p_predikat text,
  p_detail_json jsonb,
  p_is_remedial boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_max_attempt integer := 0;
  v_next_attempt integer := 1;
  v_is_remedial boolean;
  v_attempt_id uuid;
  v_safe_raw numeric(5,2);
  v_safe_final numeric(5,2);
  v_safe_predikat text;
  v_exam_type text;
BEGIN
  v_org_id := COALESCE(p_org_id, public.get_my_org_id());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Konteks tenant/organisasi tidak ditemukan.';
  END IF;

  v_role := public.get_role_for_org(v_org_id);
  IF v_role NOT IN ('superadmin', 'admin', 'musammi') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya pengajar/admin berwenang yang dapat mencatat hasil ujian.';
  END IF;

  v_exam_type := LOWER(TRIM(COALESCE(p_exam_type, 'semester')));
  IF v_exam_type NOT IN ('semester', 'monthly') THEN
    RAISE EXCEPTION 'Tipe ujian tidak valid. Harus "semester" atau "monthly".';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.santri s WHERE s.id = p_santri_id AND s.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada organisasi ini.';
  END IF;

  -- Kunci advisory xact untuk serialisasi penomoran attempt per santri/ujian
  PERFORM pg_advisory_xact_lock(
    hashtext(v_org_id::text || ':exam:' || p_academic_year_id::text || ':' || COALESCE(p_semester, 'Ganjil') || ':' || v_exam_type || ':' || p_santri_id::text)
  );

  SELECT COALESCE(MAX(attempt_no), 0)
  INTO v_max_attempt
  FROM public.exam_attempts
  WHERE organization_id = v_org_id
    AND academic_year_id = p_academic_year_id
    AND semester_name = p_semester
    AND exam_type = v_exam_type
    AND santri_id = p_santri_id;

  v_next_attempt := v_max_attempt + 1;
  v_is_remedial := (p_is_remedial IS TRUE) OR (v_next_attempt > 1);

  v_safe_final := LEAST(GREATEST(COALESCE(p_final_score, p_raw_score, 0), 0), 100);
  v_safe_raw := LEAST(GREATEST(COALESCE(p_raw_score, p_final_score, 0), 0), 100);
  v_safe_predikat := COALESCE(
    NULLIF(TRIM(p_predikat), ''),
    CASE
      WHEN v_safe_final >= 90 THEN 'Mumtaz'
      WHEN v_safe_final >= 80 THEN 'Jayyid Jiddan'
      WHEN v_safe_final >= 70 THEN 'Jayyid'
      WHEN v_safe_final >= 60 THEN 'Maqbul'
      ELSE 'Rasib'
    END
  );

  INSERT INTO public.exam_attempts (
    organization_id, academic_year_id, semester_name, exam_type, santri_id,
    attempt_no, is_remedial, materi_juz, detail_json, raw_score,
    final_score, predikat, notes, examiner_id, created_at
  )
  VALUES (
    v_org_id, p_academic_year_id, p_semester, v_exam_type, p_santri_id,
    v_next_attempt, v_is_remedial, p_materi_juz, COALESCE(p_detail_json, '{}'::jsonb), v_safe_raw,
    v_safe_final, v_safe_predikat, p_notes, auth.uid(), now()
  )
  RETURNING id INTO v_attempt_id;

  -- Sinkronisasi kompatibilitas tabel legacy
  IF v_exam_type = 'semester' THEN
    INSERT INTO public.ujian_semester (
      organization_id, santri_id, academic_year_id, semester, materi_juz,
      khoto_shogir, khoto_kabir, is_custom_nilai, custom_nilai, nilai_akhir, catatan, updated_at
    )
    VALUES (
      v_org_id, p_santri_id, p_academic_year_id, p_semester, p_materi_juz,
      COALESCE(p_detail_json->'khoto_shogir', '{}'::jsonb),
      COALESCE(p_detail_json->'khoto_kabir', '{}'::jsonb),
      COALESCE(p_detail_json->'is_custom_nilai', '{}'::jsonb),
      COALESCE(p_detail_json->'custom_nilai', '{}'::jsonb),
      v_safe_final, p_notes, now()
    )
    ON CONFLICT (santri_id, academic_year_id, semester)
    DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      materi_juz = EXCLUDED.materi_juz,
      khoto_shogir = EXCLUDED.khoto_shogir,
      khoto_kabir = EXCLUDED.khoto_kabir,
      is_custom_nilai = EXCLUDED.is_custom_nilai,
      custom_nilai = EXCLUDED.custom_nilai,
      nilai_akhir = EXCLUDED.nilai_akhir,
      catatan = EXCLUDED.catatan,
      updated_at = now();
  ELSIF v_exam_type = 'monthly' THEN
    INSERT INTO public.ujian_bulanan (
      organization_id, santri_id, periode, semester, materi_juz, nilai, updated_at
    )
    VALUES (
      v_org_id, p_santri_id, COALESCE(p_detail_json->>'periode', 'Periode ' || p_semester),
      p_semester, p_materi_juz, v_safe_final, now()
    )
    ON CONFLICT (santri_id, periode)
    DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      semester = EXCLUDED.semester,
      materi_juz = EXCLUDED.materi_juz,
      nilai = EXCLUDED.nilai,
      updated_at = now();
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), v_role,
    CASE WHEN v_is_remedial THEN 'RECORD_REMEDIAL_EXAM_ATTEMPT' ELSE 'RECORD_EXAM_ATTEMPT' END,
    'exam_attempts', v_attempt_id::text,
    COALESCE(p_notes, 'Pencatatan hasil ujian attempt #' || v_next_attempt),
    jsonb_build_object(
      'santri_id', p_santri_id,
      'exam_type', v_exam_type,
      'attempt_no', v_next_attempt,
      'is_remedial', v_is_remedial,
      'raw_score', v_safe_raw,
      'final_score', v_safe_final,
      'predikat', v_safe_predikat
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_attempt_id,
    'attempt_no', v_next_attempt,
    'is_remedial', v_is_remedial,
    'raw_score', v_safe_raw,
    'final_score', v_safe_final,
    'predikat', v_safe_predikat
  );
END;
$$;

-- 7.2 RPC Pengelolaan Versi Rubrik Penilaian (Membuat Versi Baru Bila Sudah Dipakai)
CREATE OR REPLACE FUNCTION public.rpc_save_rubric_version(
  p_org_id uuid,
  p_academic_year_id bigint,
  p_semester text,
  p_name text,
  p_initial_score numeric DEFAULT 100,
  p_deduction_minor numeric DEFAULT 1.25,
  p_deduction_major numeric DEFAULT 5.0,
  p_min_score numeric DEFAULT 50.0,
  p_passing_score numeric DEFAULT 70.0,
  p_predicates jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_is_used boolean := false;
  v_active_id uuid;
  v_max_version integer := 0;
  v_next_version integer := 1;
  v_rubric_id uuid;
  v_predicates jsonb;
BEGIN
  v_org_id := COALESCE(p_org_id, public.get_my_org_id());
  IF v_org_id IS NULL OR NOT public.is_admin_of_org(v_org_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Admin Lembaga yang dapat mengonfigurasi rubrik penilaian.';
  END IF;

  v_predicates := COALESCE(
    p_predicates,
    '[{"label":"Mumtaz","minScore":90},{"label":"Jayyid Jiddan","minScore":80},{"label":"Jayyid","minScore":70},{"label":"Maqbul","minScore":60},{"label":"Rasib","minScore":0}]'::jsonb
  );

  SELECT id INTO v_active_id
  FROM public.rubric_versions
  WHERE organization_id = v_org_id
    AND is_active = true
  ORDER BY version_no DESC
  LIMIT 1;

  -- Periksa apakah sudah ada ujian atau raport yang diterbitkan dengan acuan ini
  SELECT (
    EXISTS (
      SELECT 1 FROM public.exam_attempts
      WHERE organization_id = v_org_id
        AND (academic_year_id = p_academic_year_id OR p_academic_year_id IS NULL)
    ) OR EXISTS (
      SELECT 1 FROM public.report_cards
      WHERE organization_id = v_org_id
        AND (academic_year_id = p_academic_year_id OR p_academic_year_id IS NULL)
    )
  ) INTO v_is_used;

  SELECT COALESCE(MAX(version_no), 0) INTO v_max_version
  FROM public.rubric_versions
  WHERE organization_id = v_org_id;

  IF v_is_used OR v_active_id IS NULL THEN
    v_next_version := v_max_version + 1;
    -- Nonaktifkan versi sebelumnya
    UPDATE public.rubric_versions
    SET is_active = false
    WHERE organization_id = v_org_id AND is_active = true;

    INSERT INTO public.rubric_versions (
      organization_id, academic_year_id, semester_name, version_no,
      name, initial_score, deduction_minor, deduction_major, min_score,
      passing_score, predicates, is_active, created_by, created_at
    )
    VALUES (
      v_org_id, p_academic_year_id, COALESCE(p_semester, 'Ganjil'), v_next_version,
      COALESCE(NULLIF(TRIM(p_name), ''), 'Rubrik Penilaian v' || v_next_version),
      COALESCE(p_initial_score, 100), COALESCE(p_deduction_minor, 1.25),
      COALESCE(p_deduction_major, 5.0), COALESCE(p_min_score, 50.0),
      COALESCE(p_passing_score, 70.0), v_predicates, true, auth.uid(), now()
    )
    RETURNING id INTO v_rubric_id;
  ELSE
    -- Jika belum pernah dipakai ujian/raport, perbarui baris yang ada
    v_next_version := v_max_version;
    UPDATE public.rubric_versions
    SET
      academic_year_id = p_academic_year_id,
      semester_name = COALESCE(p_semester, 'Ganjil'),
      name = COALESCE(NULLIF(TRIM(p_name), ''), name),
      initial_score = COALESCE(p_initial_score, initial_score),
      deduction_minor = COALESCE(p_deduction_minor, deduction_minor),
      deduction_major = COALESCE(p_deduction_major, deduction_major),
      min_score = COALESCE(p_min_score, min_score),
      passing_score = COALESCE(p_passing_score, passing_score),
      predicates = v_predicates
    WHERE id = v_active_id
    RETURNING id INTO v_rubric_id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), COALESCE(public.get_role_for_org(v_org_id), 'admin'),
    'PUBLISH_RUBRIC_VERSION', 'rubric_versions', v_rubric_id::text,
    COALESCE(p_reason, 'Pembaruan rubrik penilaian v' || v_next_version),
    jsonb_build_object(
      'version_no', v_next_version,
      'is_new_version', (v_is_used OR v_active_id IS NULL),
      'initial_score', p_initial_score,
      'deduction_minor', p_deduction_minor,
      'deduction_major', p_deduction_major
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_rubric_id,
    'version_no', v_next_version,
    'is_new_version', (v_is_used OR v_active_id IS NULL)
  );
END;
$$;

-- 7.3 RPC Publikasi Snapshot Raport & Amendment Atomik
CREATE OR REPLACE FUNCTION public.rpc_publish_report_card(
  p_org_id uuid,
  p_academic_year_id bigint,
  p_semester text,
  p_santri_id bigint,
  p_final_score numeric,
  p_predikat text,
  p_snapshot_json jsonb,
  p_amendment_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_prev_id uuid;
  v_existing_hash text;
  v_max_version integer := 0;
  v_next_version integer := 1;
  v_new_id uuid;
  v_hash text;
  v_code text;
  v_safe_score numeric(5,2);
  v_safe_predikat text;
BEGIN
  v_org_id := COALESCE(p_org_id, public.get_my_org_id());
  IF v_org_id IS NULL OR NOT public.is_admin_of_org(v_org_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Admin Lembaga yang dapat menerbitkan snapshot raport.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.santri s WHERE s.id = p_santri_id AND s.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada organisasi ini.';
  END IF;

  -- Kunci advisory lock per santri & periode untuk serialisasi publikasi paralel/bulk
  PERFORM pg_advisory_xact_lock(
    hashtext(v_org_id::text || ':' || p_academic_year_id::text || ':' || COALESCE(p_semester, 'Ganjil') || ':' || p_santri_id::text)
  );

  SELECT COALESCE(MAX(version_no), 0)
  INTO v_max_version
  FROM public.report_cards
  WHERE organization_id = v_org_id
    AND academic_year_id = p_academic_year_id
    AND semester_name = p_semester
    AND santri_id = p_santri_id;

  v_next_version := COALESCE(v_max_version, 0) + 1;

  SELECT id
  INTO v_prev_id
  FROM public.report_cards
  WHERE organization_id = v_org_id
    AND academic_year_id = p_academic_year_id
    AND semester_name = p_semester
    AND santri_id = p_santri_id
    AND status = 'published'
  ORDER BY version_no DESC
  LIMIT 1
  FOR UPDATE;

  v_hash := encode(digest(convert_to(COALESCE(p_snapshot_json, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');

  -- Cek idempotensi jika snapshot yang sama sudah pernah diterbitkan dan bukan permintaan amendment
  IF v_prev_id IS NOT NULL THEN
    SELECT rc.snapshot_hash, rc.verification_code, rc.version_no
    INTO v_existing_hash, v_code, v_next_version
    FROM public.report_cards rc
    WHERE rc.id = v_prev_id;

    IF v_existing_hash = v_hash AND (p_amendment_reason IS NULL OR TRIM(p_amendment_reason) = '') THEN
      RETURN jsonb_build_object(
        'id', v_prev_id,
        'version_no', v_next_version,
        'status', 'published',
        'snapshot_hash', v_hash,
        'verification_code', v_code,
        'is_duplicate_prevented', true
      );
    END IF;

    IF COALESCE(LENGTH(TRIM(p_amendment_reason)), 0) < 5 THEN
      RAISE EXCEPTION 'Penerbitan Amendment Raport wajib menyertakan alasan revisi yang jelas (minimal 5 karakter).';
    END IF;

    UPDATE public.report_cards SET status = 'amended', updated_at = now() WHERE id = v_prev_id;
  END IF;

  v_safe_score := LEAST(GREATEST(COALESCE(p_final_score, (p_snapshot_json->>'nilaiAkhir')::numeric, 0), 0), 100);
  v_safe_predikat := COALESCE(
    NULLIF(TRIM(p_predikat), ''),
    CASE
      WHEN v_safe_score >= 90 THEN 'Mumtaz'
      WHEN v_safe_score >= 80 THEN 'Jayyid Jiddan'
      WHEN v_safe_score >= 70 THEN 'Jayyid'
      WHEN v_safe_score >= 60 THEN 'Maqbul'
      ELSE 'Rasib'
    END
  );

  INSERT INTO public.report_cards (
    organization_id, academic_year_id, semester_name, santri_id,
    version_no, status, final_score, predikat, snapshot_json,
    snapshot_hash, parent_report_card_id, amendment_reason, published_by, published_at
  )
  VALUES (
    v_org_id, p_academic_year_id, p_semester, p_santri_id,
    v_next_version, 'published', v_safe_score, v_safe_predikat, COALESCE(p_snapshot_json, '{}'::jsonb),
    v_hash, v_prev_id, NULLIF(TRIM(COALESCE(p_amendment_reason, 'Publikasi awal v1')), ''),
    auth.uid(), now()
  )
  RETURNING id, verification_code INTO v_new_id, v_code;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), COALESCE(public.get_role_for_org(v_org_id), 'admin'),
    CASE WHEN v_prev_id IS NULL THEN 'publish_report_card' ELSE 'amend_report_card' END,
    'report_cards', v_new_id::text, p_amendment_reason,
    jsonb_build_object(
      'santri_id', p_santri_id,
      'version_no', v_next_version,
      'final_score', v_safe_score,
      'snapshot_hash', v_hash,
      'verification_code', v_code
    )
  );

  RETURN jsonb_build_object(
    'id', v_new_id,
    'version_no', v_next_version,
    'status', 'published',
    'snapshot_hash', v_hash,
    'verification_code', v_code,
    'is_duplicate_prevented', false
  );
END;
$$;

-- 7.4 RPC Verifikasi Publik Dokumen Raport (Minimal PII & Status Aware)
CREATE OR REPLACE FUNCTION public.rpc_verify_report_card(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_rc record;
  v_masked_name text;
BEGIN
  v_clean := UPPER(TRIM(COALESCE(p_code, '')));
  IF LENGTH(v_clean) < 6 THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Kode verifikasi tidak valid.');
  END IF;

  SELECT
    rc.id,
    rc.version_no,
    rc.status,
    rc.semester_name,
    rc.final_score,
    rc.predikat,
    rc.snapshot_hash,
    rc.verification_code,
    rc.published_at,
    rc.amendment_reason,
    o.name AS organization_name,
    s.nama AS santri_nama,
    s.kode AS santri_kode,
    s.marhalah,
    s.kelas,
    ay.name AS academic_year_name
  INTO v_rc
  FROM public.report_cards rc
  JOIN public.organizations o ON o.id = rc.organization_id
  JOIN public.santri s ON s.id = rc.santri_id AND s.organization_id = rc.organization_id
  LEFT JOIN public.academic_years ay ON ay.id = rc.academic_year_id AND ay.organization_id = rc.organization_id
  WHERE UPPER(COALESCE(rc.verification_code, '')) = v_clean
     OR UPPER(COALESCE(rc.snapshot_hash, '')) = v_clean
  ORDER BY rc.version_no DESC
  LIMIT 1;

  IF v_rc.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Dokumen raport tidak ditemukan.');
  END IF;

  -- Sensor/masking nama santri untuk akses publik tanpa autentikasi
  IF auth.uid() IS NULL AND LENGTH(COALESCE(v_rc.santri_nama, '')) > 3 THEN
    v_masked_name := SUBSTRING(v_rc.santri_nama FROM 1 FOR 3) || '***';
  ELSE
    v_masked_name := v_rc.santri_nama;
  END IF;

  RETURN jsonb_build_object(
    'valid', (v_rc.status = 'published'),
    'is_superseded', (v_rc.status IN ('amended', 'archived')),
    'version_no', v_rc.version_no,
    'status', v_rc.status,
    'organization_name', v_rc.organization_name,
    'santri_nama', v_masked_name,
    'santri_kode', v_rc.santri_kode,
    'marhalah', v_rc.marhalah,
    'kelas', v_rc.kelas,
    'academic_year_name', v_rc.academic_year_name,
    'semester_name', v_rc.semester_name,
    'final_score', v_rc.final_score,
    'predikat', v_rc.predikat,
    'snapshot_hash', v_rc.snapshot_hash,
    'verification_code', v_rc.verification_code,
    'published_at', v_rc.published_at,
    'amendment_reason', v_rc.amendment_reason,
    'error', CASE
      WHEN v_rc.status = 'amended' THEN 'Versi raport ini telah digantikan (amended) oleh versi revisi yang lebih baru.'
      WHEN v_rc.status <> 'published' THEN 'Dokumen raport ini tidak berstatus published aktif.'
      ELSE NULL
    END
  );
END;
$$;

-- ---------------------------------------------------------------------------------
-- FASE 1.9: EFFECTIVE PRIVILEGES HARDENING (REVOKE EXECUTE FROM PUBLIC, anon)
-- ---------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON TABLE public.landing_images, public.cms_landing_page, public.landing_page_content TO anon;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_secrets_no_browser_read ON public.integration_secrets;
DROP POLICY IF EXISTS integration_secrets_deny_all ON public.integration_secrets;
CREATE POLICY integration_secrets_no_browser_read ON public.integration_secrets
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated;
GRANT ALL ON TABLE public.integration_secrets TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.recitation_revisions FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.support_access_sessions FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.tenant_invitations FROM anon, authenticated;

-- Cabut EXECUTE dari PUBLIC dan anon untuk seluruh fungsi SECURITY DEFINER non-publik
REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_canonical_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_role_for_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_of_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_support_session(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_musammi_assigned_to_halaqah(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_musammi_assigned_to_student(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_manage_access_grant(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_set_active_academic_year(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_set_active_semester(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_close_semester(bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_upsert_academic_year(bigint, text, text, text, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_check_academic_year_closing_readiness(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_close_academic_year(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_promote_or_graduate_students(bigint, bigint, bigint[], text, text, text, bigint, bigint, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_mutate_halaqah_student(bigint, bigint, bigint, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_get_halaqah_roster_as_of(bigint, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_assign_halaqah_musammi(bigint, bigint, text, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_get_academic_reconciliation_report(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reconcile_academic_v2_data(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_accept_invitation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_revoke_invitation(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_create_tenant_with_admin(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_mark_tenant_provisioning_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_start_support_session(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_end_support_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_open_halaqah_session(bigint, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_save_attendance_batch(uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_lock_halaqah_session(bigint, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_review_recitation_entry(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_review_recitation_entry(bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_record_exam_attempt(uuid, bigint, text, text, bigint, text, numeric, numeric, text, jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_link_telegram_chat_id(text, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_canonical_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_role_for_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_of_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_support_session(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_halaqah(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_student(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_manage_access_grant(uuid, uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_set_active_academic_year(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_set_active_semester(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_close_semester(bigint, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_academic_year(bigint, text, text, text, date, date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_check_academic_year_closing_readiness(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_close_academic_year(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_promote_or_graduate_students(bigint, bigint, bigint[], text, text, text, bigint, bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_mutate_halaqah_student(bigint, bigint, bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_halaqah_roster_as_of(bigint, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_assign_halaqah_musammi(bigint, bigint, text, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_academic_reconciliation_report(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_academic_v2_data(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_accept_invitation(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_invitation(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_tenant_with_admin(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_mark_tenant_provisioning_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_start_support_session(uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_end_support_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_open_halaqah_session(bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_attendance_batch(uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_lock_halaqah_session(bigint, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_review_recitation_entry(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_review_recitation_entry(bigint, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_record_exam_attempt(uuid, bigint, text, text, bigint, text, numeric, numeric, text, jsonb, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_link_telegram_chat_id(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_inspect_invitation_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_verify_report_card(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
