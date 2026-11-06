-- =================================================================================
-- LAJNAH QURAN - ENTERPRISE SAAS MULTI-TENANT V2 MIGRATION & AUTO-DATA MIGRATION
-- Acuan: Blueprint Perbaikan Aplikasi Lajnah Quran SaaS 3 Role (Fase 1 - Fase 8)
-- Standar: ISO/IEC 25010, ISO 27001/27017/27018, OWASP ASVS 5.0, AWS SaaS Lens
-- Kompatibel 100% dengan struktur skema_lajnah.sql (academic_years.id = bigint, dll.)
-- Idempoten 100%: Aman dijalankan berulang kali di Supabase SQL Editor tanpa error.
--
-- Fitur Utama Skrip Ini:
-- 1. Tiga Role Kanonikal (superadmin, admin, musammi) + Pemisahan user_profiles & access_grants
-- 2. Sinkronisasi Trigger Otomatis antara auth.users -> profiles -> user_profiles & access_grants
-- 3. Composite Tenant Foreign Keys (organization_id, id) untuk mencegah relasi lintas tenant
-- 4. Struktur Akademik Ternormalisasi: semesters, student_enrollments, halaqah_student_memberships,
--    halaqah_musammi_assignments, musammi_staff, halaqah_sessions, attendance_records,
--    recitation_entries, recitation_revisions, target_plans, rubric_versions, exam_attempts,
--    report_cards (immutable snapshot + amendment), support_access_sessions, audit_logs,
--    dan integration_secrets.
-- 5. Migrasi Data Otomatis & Idempoten dari tabel eksisting (profiles, santri, student_classes,
--    musammi, wali_kelas, musyrifs, halaqah, halaqah_santri, app_settings) tanpa kehilangan histori.
-- 6. Penutupan Celah RLS: Menghapus pencocokan Musammi berbasis full_name, menerapkan
--    Support Access Session untuk Superadmin, dan membatasi mutasi tabel master hanya untuk Admin.
-- =================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------
-- 0. EKSTENSI DASAR
-- ---------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------------
-- 1. PERLUASAN TABEL ORGANIZATIONS & PROFILES (TENANT ROOT)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'id-ID',
  ADD COLUMN IF NOT EXISTS plan_id text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS setup_state jsonb NOT NULL DEFAULT '{"identity":true,"academic_year":true,"structure":true,"students":true,"musammi":true,"halaqah":true,"targets":true,"ready":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.organizations
SET slug = LOWER(REGEXP_REPLACE(COALESCE(name, 'mahad'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(id::text FROM 1 FOR 8)
WHERE slug IS NULL OR TRIM(slug) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique ON public.organizations(slug);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_status_check'
  ) THEN
    ALTER TABLE public.organizations DROP CONSTRAINT organizations_status_check;
  END IF;
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_status_check
    CHECK (status IN ('provisioning', 'trial', 'active', 'provisioning_failed', 'suspended', 'archived'));
END $$;

-- Pastikan tabel profiles memiliki kolom created_at & updated_at untuk Platform Console
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------------
-- 2. TABEL USER_PROFILES & ACCESS_GRANTS (3 ROLE KANONIKAL)
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid UNIQUE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  avatar_url text,
  locale text NOT NULL DEFAULT 'id-ID',
  is_superadmin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

UPDATE public.user_profiles SET id = user_id WHERE id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_id_uniq ON public.user_profiles(id);

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

  -- Proteksi eskalasi privilege is_superadmin oleh pengguna non-superadmin
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL
  THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.is_superadmin, false) = true THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.access_grants ag
        WHERE ag.user_id = auth.uid() AND ag.role = 'superadmin' AND ag.status = 'active'
      ) THEN
        NEW.is_superadmin := false;
      END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.access_grants ag
        WHERE ag.user_id = auth.uid() AND ag.role = 'superadmin' AND ag.status = 'active'
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

CREATE TABLE IF NOT EXISTS public.access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invitation_token_hash text,
  musammi_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_grants_role_canonical_check CHECK (role IN ('superadmin', 'admin', 'musammi')),
  CONSTRAINT access_grants_status_canonical_check CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  CONSTRAINT access_grants_tenant_scope_check CHECK (
    (role = 'superadmin' AND organization_id IS NULL) OR
    (role IN ('admin', 'musammi') AND organization_id IS NOT NULL)
  )
);

ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_token_hash text,
  ADD COLUMN IF NOT EXISTS musammi_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_grants_superadmin_uniq
  ON public.access_grants(user_id) WHERE role = 'superadmin';

-- Non-partial unique indexes agar PostgREST upsert (onConflict: 'organization_id,user_id' maupun 'user_id,organization_id,role') berjalan mulus
DROP INDEX IF EXISTS public.idx_access_grants_tenant_user_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_grants_tenant_user_uniq
  ON public.access_grants(organization_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_grants_user_org_role_uniq
  ON public.access_grants(user_id, organization_id, role);

CREATE INDEX IF NOT EXISTS idx_access_grants_user_status ON public.access_grants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_access_grants_org_role ON public.access_grants(organization_id, role, status);

-- Tabel Undangan Tenant & Akun Sekali Pakai (One-Time Cryptographic Invitation Token Lifecycle)
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'musammi')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  musammi_id bigint,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
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
  user_id = auth.uid()
  OR public.is_super_admin()
  OR (organization_id IS NOT NULL AND public.is_admin_of_org(organization_id))
);

CREATE POLICY tenant_invitations_insert ON public.tenant_invitations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    organization_id IS NOT NULL
    AND public.is_admin_of_org(organization_id)
    AND role = 'musammi'
  )
);

CREATE POLICY tenant_invitations_update ON public.tenant_invitations
FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (organization_id IS NOT NULL AND public.is_admin_of_org(organization_id))
)
WITH CHECK (
  public.is_super_admin()
  OR (
    organization_id IS NOT NULL
    AND public.is_admin_of_org(organization_id)
    AND role = 'musammi'
  )
);

-- ---------------------------------------------------------------------------------
-- 3. SUPPORT ACCESS SESSIONS, AUDIT LOGS & INTEGRATION SECRETS
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  mode text NOT NULL DEFAULT 'read_only' CHECK (mode IN ('read_only', 'read_write')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_active
  ON public.support_access_sessions(superadmin_user_id, organization_id, expires_at)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  resource_type text NOT NULL DEFAULT 'general',
  resource_id text,
  entity_type text,
  entity_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  diff_json jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS diff_json jsonb;

ALTER TABLE public.audit_logs
  ALTER COLUMN resource_type SET DEFAULT 'general';

CREATE OR REPLACE FUNCTION public.normalize_audit_logs_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.actor_id := COALESCE(NEW.actor_id, NEW.actor_user_id, auth.uid());
  NEW.actor_user_id := COALESCE(NEW.actor_user_id, NEW.actor_id, auth.uid());
  NEW.resource_type := COALESCE(NULLIF(TRIM(NEW.resource_type), ''), NULLIF(TRIM(NEW.entity_type), ''), 'general');
  NEW.entity_type := COALESCE(NULLIF(TRIM(NEW.entity_type), ''), NEW.resource_type);
  NEW.resource_id := COALESCE(NEW.resource_id, NEW.entity_id);
  NEW.entity_id := COALESCE(NEW.entity_id, NEW.resource_id);
  NEW.after_state := COALESCE(NEW.after_state, NEW.diff_json);
  NEW.diff_json := COALESCE(NEW.diff_json, NEW.after_state);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_normalize_audit_logs
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.normalize_audit_logs_row();

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON public.audit_logs(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('telegram', 'whatsapp', 'webhook')),
  secret_key_name text NOT NULL,
  secret_value text NOT NULL,
  masked_preview text NOT NULL DEFAULT '********',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  rotation_count integer NOT NULL DEFAULT 1,
  last_rotated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, secret_key_name)
);

ALTER TABLE public.integration_secrets
  ADD COLUMN IF NOT EXISTS rotation_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------
-- 4. MIGRASI OTOMATIS DARI PROFILES & APP_SETTINGS KE SKEMA V2
-- ---------------------------------------------------------------------------------
INSERT INTO public.user_profiles (user_id, id, full_name, email, is_superadmin)
SELECT
  p.id,
  p.id,
  COALESCE(p.full_name, ''),
  p.email,
  LOWER(COALESCE(p.role, '')) IN ('super_admin', 'superadmin')
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT (user_id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    email = COALESCE(EXCLUDED.email, public.user_profiles.email),
    is_superadmin = EXCLUDED.is_superadmin,
    updated_at = now();

-- Migrasi Superadmin
INSERT INTO public.access_grants (user_id, organization_id, role, status)
SELECT p.id, NULL, 'superadmin', 'active'
FROM public.profiles p
WHERE LOWER(COALESCE(p.role, '')) IN ('super_admin', 'superadmin')
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT DO NOTHING;

-- Migrasi Admin Lembaga
INSERT INTO public.access_grants (user_id, organization_id, role, status)
SELECT p.id, p.organization_id, 'admin', 'active'
FROM public.profiles p
WHERE LOWER(COALESCE(p.role, '')) IN ('admin', 'admin_mahad')
  AND p.organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT DO NOTHING;

-- Migrasi Musammi (serta eks-pengajar yang dimigrasikan ke role kanonikal musammi)
INSERT INTO public.access_grants (user_id, organization_id, role, status)
SELECT p.id, p.organization_id, 'musammi', 'active'
FROM public.profiles p
WHERE LOWER(COALESCE(p.role, '')) IN ('musammi', 'pengajar')
  AND p.organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT DO NOTHING;

-- Migrasi Pending menjadi status 'invited' dengan role 'admin'
INSERT INTO public.access_grants (user_id, organization_id, role, status)
SELECT p.id, p.organization_id, 'admin', 'invited'
FROM public.profiles p
WHERE LOWER(COALESCE(p.role, '')) = 'pending'
  AND p.organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT DO NOTHING;

-- Perbarui juga handle_new_user dan prevent_profile_privilege_escalation agar konsisten
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
    -- Admin hanya boleh menetapkan role musammi/pending pada user lain di lembaganya, tidak boleh mengangkat admin/superadmin baru
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

-- Trigger sinkronisasi otomatis profiles -> user_profiles & access_grants
-- HARDENED: UPDATE pada profiles HANYA menyinkronkan full_name dan email ke user_profiles
-- dan TIDAK PERNAH mengubah otorisasi atau memutasi access_grants!
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

DROP TRIGGER IF EXISTS trg_sync_profile_to_v2_grants ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_v2_grants
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_v2_grants();

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

-- Migrasi Secret Token dari app_settings ke integration_secrets & hapus plaintext dari app_settings
INSERT INTO public.integration_secrets (organization_id, provider, secret_key_name, secret_value, masked_preview)
SELECT
  s.organization_id,
  CASE WHEN s.key LIKE 'TELEGRAM%' THEN 'telegram' ELSE 'whatsapp' END,
  s.key,
  s.value,
  CASE WHEN LENGTH(COALESCE(s.value, '')) > 6
       THEN SUBSTRING(s.value FROM 1 FOR 3) || '••••••' || RIGHT(s.value, 3)
       ELSE '••••••••'
  END
FROM public.app_settings s
WHERE s.organization_id IS NOT NULL
  AND s.key IN ('TELEGRAM_BOT_TOKEN', 'FONNTE_API_TOKEN')
  AND COALESCE(TRIM(s.value), '') <> ''
  AND s.value NOT LIKE '%••••%'
ON CONFLICT (organization_id, provider, secret_key_name) DO UPDATE
SET secret_value = EXCLUDED.secret_value,
    masked_preview = EXCLUDED.masked_preview,
    updated_at = now();

-- Masking nilai token di app_settings agar tidak terekspos plaintext ke client
UPDATE public.app_settings
SET value = CASE
  WHEN LENGTH(COALESCE(value, '')) > 6
    THEN SUBSTRING(value FROM 1 FOR 3) || '••••••' || RIGHT(value, 3)
  ELSE '••••••••'
END
WHERE key IN ('TELEGRAM_BOT_TOKEN', 'FONNTE_API_TOKEN')
  AND COALESCE(TRIM(value), '') <> ''
  AND value NOT LIKE '%••••%';

-- ---------------------------------------------------------------------------------
-- 5. STRUKTUR AKADEMIK, COMPOSITE UNIQUE KEYS & ATRIBUT ADMINISTRATIF KELAS
--    (academic_years.id adalah BIGINT sesuai skema_lajnah.sql)
-- ---------------------------------------------------------------------------------
ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS ganjil_start_date date,
  ADD COLUMN IF NOT EXISTS ganjil_end_date date,
  ADD COLUMN IF NOT EXISTS genap_start_date date,
  ADD COLUMN IF NOT EXISTS genap_end_date date,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.academic_years
SET lifecycle_status = CASE WHEN is_active THEN 'active' ELSE 'closed' END,
    status = CASE WHEN is_active THEN 'active' ELSE 'closed' END
WHERE lifecycle_status IS NULL OR lifecycle_status NOT IN ('draft', 'setup', 'active', 'closing', 'closed');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'academic_years_lifecycle_status_check'
  ) THEN
    ALTER TABLE public.academic_years
      ADD CONSTRAINT academic_years_lifecycle_status_check
      CHECK (lifecycle_status IN ('draft', 'setup', 'active', 'closing', 'closed'));
  END IF;
END $$;

-- Composite Unique Constraints untuk Composite Tenant Foreign Keys
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_org_id_uniq
  ON public.academic_years(organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_marhalah_org_id_uniq
  ON public.master_marhalah(organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_kelas_relasi_org_id_uniq
  ON public.master_kelas_relasi(organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_kelas_org_id_uniq
  ON public.master_kelas(organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_santri_org_id_uniq
  ON public.santri(organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_musammi_org_id_uniq
  ON public.musammi(organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_halaqah_org_id_uniq
  ON public.halaqah(organization_id, id);

-- Tabel Semesters (academic_year_id BIGINT sesuai academic_years.id)
CREATE TABLE IF NOT EXISTS public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint NOT NULL,
  name text NOT NULL CHECK (name IN ('Ganjil', 'Genap')),
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, academic_year_id, name),
  UNIQUE (organization_id, id),
  CONSTRAINT fk_semesters_academic_year_tenant
    FOREIGN KEY (organization_id, academic_year_id)
    REFERENCES public.academic_years(organization_id, id) ON DELETE CASCADE
);

INSERT INTO public.semesters (organization_id, academic_year_id, name, start_date, end_date, is_active, status)
SELECT
  ay.organization_id,
  ay.id,
  'Ganjil',
  ay.ganjil_start_date,
  ay.ganjil_end_date,
  (COALESCE(ay.active_semester, 'Ganjil') IN ('Ganjil', 'Gasal')),
  CASE WHEN ay.is_active THEN 'active' ELSE 'closed' END
FROM public.academic_years ay
WHERE ay.organization_id IS NOT NULL
ON CONFLICT (organization_id, academic_year_id, name) DO NOTHING;

INSERT INTO public.semesters (organization_id, academic_year_id, name, start_date, end_date, is_active, status)
SELECT
  ay.organization_id,
  ay.id,
  'Genap',
  ay.genap_start_date,
  ay.genap_end_date,
  (COALESCE(ay.active_semester, 'Ganjil') = 'Genap'),
  CASE WHEN ay.is_active THEN 'active' ELSE 'closed' END
FROM public.academic_years ay
WHERE ay.organization_id IS NOT NULL
ON CONFLICT (organization_id, academic_year_id, name) DO NOTHING;

-- Tambahkan atribut administratif Wali Kelas & Musyrif pada master_kelas_relasi, master_kelas, dan santri
ALTER TABLE public.master_kelas_relasi
  ADD COLUMN IF NOT EXISTS wali_kelas_name text,
  ADD COLUMN IF NOT EXISTS wali_kelas_phone text,
  ADD COLUMN IF NOT EXISTS musyrif_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.master_kelas
  ADD COLUMN IF NOT EXISTS wali_kelas_name text,
  ADD COLUMN IF NOT EXISTS wali_kelas_phone text,
  ADD COLUMN IF NOT EXISTS musyrif_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Migrasikan nama Wali Kelas dari tabel wali_kelas ke master_kelas_relasi & master_kelas
UPDATE public.master_kelas_relasi c
SET wali_kelas_name = wk.nama,
    wali_kelas_phone = wk.no_hp
FROM public.wali_kelas wk
WHERE c.organization_id = wk.organization_id
  AND (c.id = wk.kelas_id OR LOWER(TRIM(c.nama_kelas)) = LOWER(TRIM(wk.kelas)))
  AND c.wali_kelas_name IS NULL;

UPDATE public.master_kelas c
SET wali_kelas_name = wk.nama,
    wali_kelas_phone = wk.no_hp
FROM public.wali_kelas wk
WHERE c.organization_id = wk.organization_id
  AND LOWER(TRIM(c.marhalah)) = LOWER(TRIM(wk.marhalah))
  AND LOWER(TRIM(c.nama_kelas)) = LOWER(TRIM(wk.kelas))
  AND c.wali_kelas_name IS NULL;

-- Tambahkan atribut administratif musyrif_nama & wali_kelas_nama pada santri
ALTER TABLE public.santri
  ADD COLUMN IF NOT EXISTS musyrif_nama text,
  ADD COLUMN IF NOT EXISTS wali_kelas_nama text,
  ADD COLUMN IF NOT EXISTS status_aktif text NOT NULL DEFAULT 'aktif';

-- Migrasikan nama Musyrif dari tabel musyrifs ke santri & master_kelas berdasarkan marhalah
UPDATE public.santri s
SET musyrif_nama = ms.nama
FROM public.musyrifs ms
WHERE s.organization_id = ms.organization_id
  AND LOWER(TRIM(s.marhalah)) = LOWER(TRIM(ms.marhalah))
  AND s.musyrif_nama IS NULL;

UPDATE public.santri s
SET wali_kelas_nama = wk.nama
FROM public.wali_kelas wk
WHERE s.organization_id = wk.organization_id
  AND LOWER(TRIM(s.marhalah)) = LOWER(TRIM(wk.marhalah))
  AND LOWER(TRIM(s.kelas)) = LOWER(TRIM(wk.kelas))
  AND s.wali_kelas_nama IS NULL;

-- ---------------------------------------------------------------------------------
-- 6. STUDENT ENROLLMENTS, HALAQAH MEMBERSHIPS / ASSIGNMENTS & MUSAMMI STAFF
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id bigint NOT NULL,
  academic_year_id bigint NOT NULL,
  class_id uuid,
  marhalah_id uuid,
  kelas_id uuid,
  marhalah_name text,
  class_name text,
  wali_kelas_name text,
  musyrif_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'graduated', 'withdrawn', 'inactive')),
  enrolled_at date NOT NULL DEFAULT CURRENT_DATE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_enrollments_student_tenant
    FOREIGN KEY (organization_id, student_id)
    REFERENCES public.santri(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_enrollments_year_tenant
    FOREIGN KEY (organization_id, academic_year_id)
    REFERENCES public.academic_years(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.student_enrollments
  ADD COLUMN IF NOT EXISTS marhalah_id uuid,
  ADD COLUMN IF NOT EXISTS kelas_id uuid,
  ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS enrolled_at date NOT NULL DEFAULT CURRENT_DATE;

CREATE OR REPLACE FUNCTION public.normalize_student_enrollments_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.class_id := COALESCE(NEW.class_id, NEW.kelas_id);
  NEW.kelas_id := COALESCE(NEW.kelas_id, NEW.class_id);
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
  IF NEW.status NOT IN ('active', 'transferred', 'graduated', 'withdrawn', 'inactive') THEN
    NEW.status := 'active';
    NEW.enrollment_status := 'active';
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

DROP INDEX IF EXISTS public.idx_student_enrollments_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_org_student_year_uniq
  ON public.student_enrollments(organization_id, student_id, academic_year_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_org_year_student_uniq
  ON public.student_enrollments(organization_id, academic_year_id, student_id);

-- Migrasi otomatis dari student_classes ke student_enrollments
INSERT INTO public.student_enrollments (
  organization_id, student_id, academic_year_id, class_id, marhalah_id, kelas_id, marhalah_name, class_name, wali_kelas_name, musyrif_name, status
)
SELECT
  sc.organization_id,
  sc.santri_id,
  sc.academic_year_id,
  sc.kelas_id,
  sc.marhalah_id,
  sc.kelas_id,
  COALESCE(sc.marhalah, s.marhalah, 'Mutawassithah'),
  sc.kelas,
  s.wali_kelas_nama,
  s.musyrif_nama,
  'active'
FROM public.student_classes sc
JOIN public.santri s ON s.id = sc.santri_id AND s.organization_id = sc.organization_id
WHERE sc.organization_id IS NOT NULL
  AND sc.academic_year_id IS NOT NULL
ON CONFLICT (organization_id, student_id, academic_year_id) DO NOTHING;

-- Fallback migrasi enrollment untuk tahun ajaran aktif jika santri belum punya baris di student_classes
INSERT INTO public.student_enrollments (
  organization_id, student_id, academic_year_id, class_id, marhalah_id, kelas_id, marhalah_name, class_name, wali_kelas_name, musyrif_name, status
)
SELECT
  s.organization_id,
  s.id,
  ay.id,
  s.kelas_id,
  s.marhalah_id,
  s.kelas_id,
  s.marhalah,
  s.kelas,
  s.wali_kelas_nama,
  s.musyrif_nama,
  'active'
FROM public.santri s
JOIN public.academic_years ay
  ON ay.organization_id = s.organization_id AND ay.is_active = true
WHERE s.organization_id IS NOT NULL
  AND COALESCE(s.kelas, '-') <> '-'
ON CONFLICT (organization_id, student_id, academic_year_id) DO NOTHING;

-- Tabel Halaqah Student Memberships (UUID PK menggantikan PK komposit halaqah_id+santri_id)
CREATE TABLE IF NOT EXISTS public.halaqah_student_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  halaqah_id bigint NOT NULL,
  student_id bigint NOT NULL,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hsm_halaqah_tenant
    FOREIGN KEY (organization_id, halaqah_id)
    REFERENCES public.halaqah(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_hsm_student_tenant
    FOREIGN KEY (organization_id, student_id)
    REFERENCES public.santri(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.halaqah_student_memberships
  DROP CONSTRAINT IF EXISTS halaqah_student_memberships_status_check;
ALTER TABLE public.halaqah_student_memberships
  ADD CONSTRAINT halaqah_student_memberships_status_check
  CHECK (status IN ('active', 'ended', 'transferred', 'removed'));

CREATE INDEX IF NOT EXISTS idx_hsm_org_halaqah_active
  ON public.halaqah_student_memberships(organization_id, halaqah_id, status)
  WHERE valid_to IS NULL;

-- Migrasi otomatis dari halaqah_santri ke halaqah_student_memberships
INSERT INTO public.halaqah_student_memberships (
  organization_id, academic_year_id, halaqah_id, student_id, valid_from, valid_to, status
)
SELECT
  hs.organization_id,
  h.academic_year_id,
  hs.halaqah_id,
  hs.santri_id,
  COALESCE(hs.start_date, CURRENT_DATE),
  hs.end_date,
  CASE WHEN hs.end_date IS NULL THEN 'active' ELSE 'ended' END
FROM public.halaqah_santri hs
JOIN public.halaqah h ON h.id = hs.halaqah_id AND h.organization_id = hs.organization_id
WHERE hs.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.halaqah_student_memberships m
    WHERE m.organization_id = hs.organization_id
      AND m.halaqah_id = hs.halaqah_id
      AND m.student_id = hs.santri_id
      AND m.valid_from = COALESCE(hs.start_date, CURRENT_DATE)
  );

-- Tabel Halaqah Musammi Assignments (Penugasan Musammi Utama & Pengganti)
CREATE TABLE IF NOT EXISTS public.halaqah_musammi_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  halaqah_id bigint NOT NULL,
  musammi_id bigint NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignment_type text NOT NULL DEFAULT 'primary' CHECK (assignment_type IN ('primary', 'substitute')),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hma_halaqah_tenant
    FOREIGN KEY (organization_id, halaqah_id)
    REFERENCES public.halaqah(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_hma_musammi_tenant
    FOREIGN KEY (organization_id, musammi_id)
    REFERENCES public.musammi(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.halaqah_musammi_assignments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.normalize_hma_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  IF NEW.status = 'ended' THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_hma_row ON public.halaqah_musammi_assignments;
CREATE TRIGGER trg_normalize_hma_row
BEFORE INSERT OR UPDATE ON public.halaqah_musammi_assignments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_hma_row();

CREATE UNIQUE INDEX IF NOT EXISTS idx_hma_org_halaqah_musammi_type_uniq
  ON public.halaqah_musammi_assignments(organization_id, halaqah_id, musammi_id, assignment_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hma_org_halaqah_musammi_uniq
  ON public.halaqah_musammi_assignments(organization_id, halaqah_id, musammi_id);

CREATE INDEX IF NOT EXISTS idx_hma_org_user_active
  ON public.halaqah_musammi_assignments(organization_id, user_id, status)
  WHERE valid_to IS NULL;

INSERT INTO public.halaqah_musammi_assignments (
  organization_id, academic_year_id, halaqah_id, musammi_id, user_id, assignment_type, is_active, status
)
SELECT
  h.organization_id,
  h.academic_year_id,
  h.id,
  h.musammi_id,
  m.user_id,
  'primary',
  true,
  'active'
FROM public.halaqah h
JOIN public.musammi m ON m.id = h.musammi_id AND m.organization_id = h.organization_id
WHERE h.organization_id IS NOT NULL
  AND h.musammi_id IS NOT NULL
ON CONFLICT (organization_id, halaqah_id, musammi_id, assignment_type) DO NOTHING;

-- Tabel Musammi Staff Kanonikal V2 (Dual-write dari MusammiPage)
CREATE TABLE IF NOT EXISTS public.musammi_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_musammi_id bigint NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  santri_id bigint,
  nama text NOT NULL,
  kode text,
  no_hp text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, legacy_musammi_id)
);

INSERT INTO public.musammi_staff (organization_id, legacy_musammi_id, user_id, santri_id, nama, kode, no_hp, status)
SELECT
  m.organization_id,
  m.id,
  m.user_id,
  m.santri_id,
  m.nama,
  m.kode,
  m.no_hp,
  'active'
FROM public.musammi m
WHERE m.organization_id IS NOT NULL
ON CONFLICT (organization_id, legacy_musammi_id) DO UPDATE
SET user_id = COALESCE(EXCLUDED.user_id, public.musammi_staff.user_id),
    nama = EXCLUDED.nama,
    kode = EXCLUDED.kode,
    no_hp = EXCLUDED.no_hp,
    updated_at = now();

-- ---------------------------------------------------------------------------------
-- 7. OPERASIONAL SESI HALAQAH, ABSENSI & TRANSAKSI SETORAN TERSTRUKTUR
-- ---------------------------------------------------------------------------------
-- Hentikan ON DELETE CASCADE pada setoran_harian.halaqah_id & ganti dengan ON DELETE SET NULL
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'setoran_harian'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'halaqah_id'
  LOOP
    EXECUTE format('ALTER TABLE public.setoran_harian DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.setoran_harian DROP CONSTRAINT IF EXISTS setoran_harian_halaqah_id_fkey;
ALTER TABLE public.setoran_harian DROP CONSTRAINT IF EXISTS setoran_harian_halaqah_id_safe_fkey;
ALTER TABLE public.setoran_harian
  ADD CONSTRAINT setoran_harian_halaqah_id_safe_fkey
  FOREIGN KEY (halaqah_id) REFERENCES public.halaqah(id) ON DELETE SET NULL;

ALTER TABLE public.setoran_harian
  ADD COLUMN IF NOT EXISTS academic_year_id bigint REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status_verifikasi text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_reason text;

ALTER TABLE public.halaqah
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.halaqah_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  halaqah_id bigint NOT NULL,
  session_date date NOT NULL,
  session_slot text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz,
  cancel_reason text,
  roster_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, halaqah_id, session_date, session_slot),
  UNIQUE (organization_id, id),
  CONSTRAINT fk_sessions_halaqah_tenant
    FOREIGN KEY (organization_id, halaqah_id)
    REFERENCES public.halaqah(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.halaqah_sessions
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

ALTER TABLE public.halaqah_sessions
  DROP CONSTRAINT IF EXISTS halaqah_sessions_status_check;
ALTER TABLE public.halaqah_sessions
  ADD CONSTRAINT halaqah_sessions_status_check
  CHECK (status IN ('scheduled', 'open', 'submitted', 'completed', 'locked', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.halaqah_sessions(id) ON DELETE CASCADE,
  halaqah_id bigint,
  santri_id bigint NOT NULL,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  session_slot text NOT NULL DEFAULT 'Shubuh',
  status text NOT NULL DEFAULT 'hadir',
  idempotency_key text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, santri_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_org_date
  ON public.attendance_records(organization_id, attendance_date DESC);

CREATE TABLE IF NOT EXISTS public.recitation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  session_id uuid,
  halaqah_id bigint,
  student_id bigint,
  santri_id bigint,
  musammi_id bigint,
  legacy_setoran_id bigint UNIQUE,
  recitation_date date NOT NULL DEFAULT CURRENT_DATE,
  session_slot text NOT NULL DEFAULT 'Shubuh',
  kind text NOT NULL DEFAULT 'ziyadah' CHECK (kind IN ('ziyadah', 'sabqi', 'manzil')),
  mushaf_version text NOT NULL DEFAULT 'Madinah 15 Baris',
  juz_no integer,
  surah_start_no integer CHECK (surah_start_no IS NULL OR (surah_start_no BETWEEN 1 AND 114)),
  ayah_start integer CHECK (ayah_start IS NULL OR ayah_start >= 1),
  surah_end_no integer CHECK (surah_end_no IS NULL OR (surah_end_no BETWEEN 1 AND 114)),
  ayah_end integer CHECK (ayah_end IS NULL OR ayah_end >= 1),
  calculated_pages numeric(6,2) NOT NULL DEFAULT 0,
  mistakes_major integer NOT NULL DEFAULT 0,
  mistakes_minor integer NOT NULL DEFAULT 0,
  major_mistakes integer NOT NULL DEFAULT 0,
  minor_mistakes integer NOT NULL DEFAULT 0,
  score numeric(5,2),
  predicate text,
  notes text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'accepted', 'returned', 'voided')),
  revision_no integer NOT NULL DEFAULT 1,
  idempotency_key text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recitation_entries
  ALTER COLUMN student_id DROP NOT NULL;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_recitation_entries_legacy_setoran_uniq
  ON public.recitation_entries(legacy_setoran_id);

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

CREATE INDEX IF NOT EXISTS idx_recitation_entries_org_date
  ON public.recitation_entries(organization_id, recitation_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_recitation_entries_student
  ON public.recitation_entries(organization_id, student_id, recitation_date DESC);

CREATE TABLE IF NOT EXISTS public.recitation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.recitation_entries(id) ON DELETE CASCADE,
  recitation_entry_id uuid REFERENCES public.recitation_entries(id) ON DELETE CASCADE,
  revision_no integer NOT NULL DEFAULT 1,
  action text NOT NULL DEFAULT 'update',
  previous_status text,
  new_status text,
  reason text,
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_payload jsonb,
  new_payload jsonb,
  before_json jsonb,
  after_json jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recitation_revisions
  ALTER COLUMN entry_id DROP NOT NULL,
  ALTER COLUMN revision_no SET DEFAULT 1,
  ALTER COLUMN action SET DEFAULT 'update',
  ALTER COLUMN after_snapshot SET DEFAULT '{}'::jsonb;

ALTER TABLE public.recitation_revisions
  ADD COLUMN IF NOT EXISTS recitation_entry_id uuid REFERENCES public.recitation_entries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  ADD COLUMN IF NOT EXISTS previous_payload jsonb,
  ADD COLUMN IF NOT EXISTS new_payload jsonb,
  ADD COLUMN IF NOT EXISTS before_json jsonb,
  ADD COLUMN IF NOT EXISTS after_json jsonb,
  ADD COLUMN IF NOT EXISTS changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.normalize_recitation_revisions_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.entry_id := COALESCE(NEW.entry_id, NEW.recitation_entry_id);
  NEW.recitation_entry_id := COALESCE(NEW.recitation_entry_id, NEW.entry_id);
  NEW.actor_id := COALESCE(NEW.actor_id, NEW.changed_by, auth.uid());
  NEW.changed_by := COALESCE(NEW.changed_by, NEW.actor_id, auth.uid());
  NEW.before_snapshot := COALESCE(NEW.before_snapshot, NEW.previous_payload, NEW.before_json);
  NEW.after_snapshot := COALESCE(NEW.after_snapshot, NEW.new_payload, NEW.after_json, '{}'::jsonb);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_recitation_revisions ON public.recitation_revisions;
CREATE TRIGGER trg_normalize_recitation_revisions
BEFORE INSERT ON public.recitation_revisions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_recitation_revisions_row();

-- ---------------------------------------------------------------------------------
-- 8. TARGET BERVERSI, RUBRIK, EXAM ATTEMPTS & RAPORT SNAPSHOT IMMUTABLE
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.target_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  semester_name text NOT NULL DEFAULT 'Ganjil',
  version_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  targets_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  murojaah_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_target_plans_org_year_sem
  ON public.target_plans(organization_id, academic_year_id, semester_name, version_no DESC);

CREATE TABLE IF NOT EXISTS public.rubric_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  semester_name text NOT NULL DEFAULT 'Ganjil',
  version_no integer NOT NULL DEFAULT 1,
  name text NOT NULL DEFAULT 'Standar Penilaian Tahfidz',
  initial_score numeric(5,2) NOT NULL DEFAULT 100,
  deduction_minor numeric(5,2) NOT NULL DEFAULT 1.25,
  deduction_major numeric(5,2) NOT NULL DEFAULT 5.00,
  min_score numeric(5,2) NOT NULL DEFAULT 50.00,
  passing_score numeric(5,2) NOT NULL DEFAULT 70.00,
  predicates jsonb NOT NULL DEFAULT '[{"label":"Mumtaz","minScore":90},{"label":"Jayyid Jiddan","minScore":80},{"label":"Jayyid","minScore":70},{"label":"Maqbul","minScore":60},{"label":"Rasib","minScore":0}]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint,
  semester_name text NOT NULL DEFAULT 'Ganjil',
  exam_type text NOT NULL DEFAULT 'semester' CHECK (exam_type IN ('monthly', 'semester')),
  santri_id bigint NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  is_remedial boolean NOT NULL DEFAULT false,
  materi_juz text,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_score numeric(5,2),
  final_score numeric(5,2),
  predikat text,
  notes text,
  examiner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_exam_attempts_student_tenant
    FOREIGN KEY (organization_id, santri_id)
    REFERENCES public.santri(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS raw_score numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_org_student
  ON public.exam_attempts(organization_id, academic_year_id, semester_name, santri_id, attempt_no DESC);

CREATE TABLE IF NOT EXISTS public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  academic_year_id bigint NOT NULL,
  semester_name text NOT NULL DEFAULT 'Ganjil',
  santri_id bigint NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'reviewed', 'published', 'archived', 'amended')),
  final_score numeric(5,2) DEFAULT 0,
  predikat text,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash text,
  verification_code text,
  parent_report_card_id uuid REFERENCES public.report_cards(id) ON DELETE SET NULL,
  amendment_reason text,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_report_cards_student_tenant
    FOREIGN KEY (organization_id, santri_id)
    REFERENCES public.santri(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS snapshot_hash text,
  ADD COLUMN IF NOT EXISTS verification_code text;

CREATE INDEX IF NOT EXISTS idx_report_cards_org_year_student
  ON public.report_cards(organization_id, academic_year_id, semester_name, santri_id, version_no DESC);

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
      NEW.verification_code := UPPER(SUBSTRING(NEW.snapshot_hash FROM 1 FOR 8) || '-' || SUBSTRING(NEW.id::text FROM 1 FOR 4));
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

-- ---------------------------------------------------------------------------------
-- 9. FUNGSI HELPER OTORISASI 3-ROLE & SUPPORT ACCESS SESSION (HARDENED)
-- ---------------------------------------------------------------------------------
-- Penting: Jika user memiliki baris di access_grants yang berstatus 'suspended' atau 'revoked'
-- dan tidak memiliki grant 'active', jangan pernah fallback ke profiles.role!
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

  -- Cek apakah user sudah memiliki record di access_grants (mis. invited / suspended / revoked).
  -- Bila sudah ada tetapi tidak active, blokir fallback ke profiles!
  SELECT EXISTS (
    SELECT 1 FROM public.access_grants ag WHERE ag.user_id = auth.uid()
  ) INTO v_has_any_grant;

  IF v_has_any_grant THEN
    RETURN NULL;
  END IF;

  -- Fallback kompatibilitas hanya untuk akun lama yang belum memiliki baris sama sekali di access_grants
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
  v_has_org_grant boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Cek apakah superadmin aktif
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

  -- Cek grant aktif spesifik pada organisasi target
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

  -- Jika user sudah memiliki baris di access_grants, blokir fallback ke profiles!
  SELECT EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
  ) INTO v_has_org_grant;

  IF v_has_org_grant THEN
    RETURN NULL;
  END IF;

  -- Fallback kompatibilitas ke profiles jika belum ada baris di access_grants
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

  SELECT p.organization_id
  INTO v_profile_org_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

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

  SELECT EXISTS (
    SELECT 1 FROM public.access_grants ag WHERE ag.user_id = auth.uid()
  ) INTO v_has_any_grant;

  IF v_has_any_grant THEN
    RETURN NULL;
  END IF;

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

-- ---------------------------------------------------------------------------------
-- 10. RPC TRANSAKSIONAL SERVERLESS (SECURITY DEFINER HARDENED)
-- ---------------------------------------------------------------------------------

-- 10.0 Helper Validasi Penugasan Musammi pada Tanggal Tertentu (Date-Aware Assignment)
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

-- 10.0b Trigger State Machine Sesi Halaqah (scheduled -> open -> submitted -> completed -> locked)
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

-- 10.0c Trigger Validasi Integritas Catatan Presensi (Roster & Locked Gating)
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

-- 10.1 Buka Sesi Halaqah + Snapshot Roster Aktif (Mengutamakan V2 halaqah_student_memberships + Enrollment Historis)
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

  -- Bangun roster dari union halaqah_student_memberships (V2) dan halaqah_santri (legacy)
  -- dengan mengambil kelas & marhalah historis dari student_enrollments / student_classes pada tahun ajaran terkait
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

-- 10.2 Simpan Batch Kehadiran Sesi Halaqah (Idempotent + Validasi Tenant, Roster Membership, Lock & Sinkronisasi Atomik)
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

    -- Jangan pernah diam-diam mengubah status kosong/tidak valid menjadi 'hadir'
    IF v_status NOT IN ('hadir', 'izin', 'sakit', 'alpa', 'terlambat') THEN
      RAISE EXCEPTION 'Status kehadiran tidak valid untuk santri ID %: %', v_santri_id, COALESCE(v_status, 'kosong');
    END IF;

    -- Pastikan santri berada di dalam organisasi yang sama
    IF NOT EXISTS (
      SELECT 1 FROM public.santri s
      WHERE s.id = v_santri_id AND s.organization_id = v_session.organization_id
    ) THEN
      RAISE EXCEPTION 'Santri ID % tidak terdaftar pada organisasi ini', v_santri_id;
    END IF;

    -- Pastikan santri mutlak terdaftar dalam roster snapshot sesi
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_session.roster_snapshot, '[]'::jsonb)) r
      WHERE (r->>'santri_id')::bigint = v_santri_id
    ) INTO v_in_roster;

    IF NOT COALESCE(v_in_roster, false) THEN
      RAISE EXCEPTION 'Santri ID % tidak termasuk dalam roster halaqah pada sesi ini.', v_santri_id;
    END IF;

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

    -- Sinkronisasi atomik ke tabel attendance untuk menjaga konsistensi laporan analitik
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

  IF v_session.status IN ('scheduled', 'open') AND v_saved_count > 0 THEN
    UPDATE public.halaqah_sessions
    SET status = 'submitted',
        completed_by = COALESCE(completed_by, auth.uid()),
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_session.id;
  END IF;

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

-- 10.2b Kunci Sesi Halaqah Secara Transaksional (Dengan Pemeriksaan Kelengkapan Roster di Server)
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

  IF jsonb_typeof(v_session.roster_snapshot) = 'array' THEN
    v_roster_count := jsonb_array_length(v_session.roster_snapshot);
  END IF;

  IF v_roster_count = 0 THEN
    RAISE EXCEPTION 'Sesi tidak dapat dikunci: Tidak ada santri dalam roster halaqah.';
  END IF;

  SELECT COUNT(*) INTO v_recorded_count
  FROM public.attendance_records ar
  WHERE ar.session_id = v_session.id
    AND ar.status IN ('hadir', 'izin', 'sakit', 'alpa', 'terlambat');

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

  RETURN jsonb_build_object('session_id', v_session.id, 'status', 'locked', 'recorded_count', v_recorded_count);
END;
$$;

-- Overload rpc_lock_halaqah_session dengan p_session_id
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

-- 10.3 Trigger Validasi State Machine & Immutability Setoran
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
    IF OLD.status = 'voided' THEN
      RAISE EXCEPTION 'Catatan setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah.';
    END IF;

    v_is_admin := public.is_admin_of_org(OLD.organization_id);

    IF OLD.status = NEW.status THEN
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

-- Pencegahan tampering riwayat revisi
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

-- 10.3a RPC Submit Setoran Kanonikal
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

  SELECT organization_id INTO v_org_id
  FROM public.santri
  WHERE id = p_santri_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Santri dengan ID % tidak ditemukan.', p_santri_id;
  END IF;

  v_is_admin := public.is_admin_of_org(v_org_id);

  IF NOT v_is_admin THEN
    IF NOT public.is_musammi_assigned_to_halaqah_on_date(v_caller_id, p_halaqah_id, p_recitation_date) THEN
      RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki penugasan musammi aktif untuk halaqah ini pada tanggal %.', p_recitation_date;
    END IF;
  END IF;

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

  SELECT id INTO v_academic_year_id
  FROM public.academic_years
  WHERE organization_id = v_org_id AND is_active = true
  LIMIT 1;

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

  v_surah_start_name := 'Surat ' || p_surah_start_no::text;
  v_surah_end_name := 'Surat ' || p_surah_end_no::text;
  IF p_surah_start_no = p_surah_end_no THEN
    v_surat_label := v_surah_start_name;
    v_ayat_label := p_ayah_start::text || '-' || p_ayah_end::text;
  ELSE
    v_surat_label := v_surah_start_name || ' - ' || v_surah_end_name;
    v_ayat_label := p_ayah_start::text || ' - ' || p_ayah_end::text;
  END IF;

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

-- 10.3b Review / Verifikasi Entri Setoran (Accepted / Returned / Voided)
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

-- 10.3b Aktifkan Tahun Ajaran Secara Atomik (Mencegah 2 Tahun Ajaran Aktif Bersamaan)
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_academic_year_per_org
  ON public.academic_years(organization_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_semester_per_ay
  ON public.semesters(organization_id, academic_year_id)
  WHERE is_active = true;

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

-- 10.4 Pemeriksaan Prasyarat & Penutupan Tahun Ajaran (Menegakkan 6 Prasyarat Fase 4)
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

  SELECT COUNT(*) INTO v_unfinished_sessions
  FROM public.halaqah_sessions
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('scheduled', 'open', 'submitted');

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

  SELECT COUNT(*) INTO v_incomplete_exams
  FROM public.exams
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('draft', 'open');

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

  SELECT COUNT(*) INTO v_unpublished_reports
  FROM public.report_cards
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status = 'draft';

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
    )
  );
END;
$$;

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

-- 10.5 Provision Tenant Baru & Mulai / Akhiri Support Access Session Superadmin + Aktivasi Undangan Atomik
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
  v_org_id uuid;
  v_slug text;
  v_base_slug text;
  v_clean_status text;
  v_clean_plan text;
  v_existing_org public.organizations%ROWTYPE;
BEGIN
  IF public.get_canonical_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Hanya Superadmin Platform yang dapat melakukan provisioning tenant baru.';
  END IF;

  IF COALESCE(LENGTH(TRIM(p_name)), 0) < 2 THEN
    RAISE EXCEPTION 'Nama organisasi/lembaga wajib diisi.';
  END IF;

  v_base_slug := COALESCE(
    NULLIF(TRIM(p_slug), ''),
    regexp_replace(lower(TRIM(p_name)), '[^a-z0-9]+', '-', 'g')
  );
  v_clean_status := CASE
    WHEN p_status IN ('provisioning', 'trial', 'active', 'provisioning_failed', 'suspended', 'archived')
    THEN p_status
    ELSE 'provisioning'
  END;
  v_clean_plan := CASE
    WHEN p_plan_id IN ('trial', 'standard', 'enterprise')
    THEN p_plan_id
    ELSE 'standard'
  END;

  -- Idempotensi / Retry Provisioning:
  -- Jika terdapat tenant dengan nama atau slug yang sama dalam status 'provisioning' atau 'provisioning_failed',
  -- lanjutkan/rekonsiliasi organisasi tersebut tanpa membuat duplikasi organisasi baru.
  SELECT * INTO v_existing_org
  FROM public.organizations o
  WHERE (LOWER(TRIM(o.name)) = LOWER(TRIM(p_name)) OR o.slug = v_base_slug)
    AND o.status IN ('provisioning', 'provisioning_failed')
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_existing_org.id IS NOT NULL THEN
    UPDATE public.organizations
    SET status = v_clean_status,
        timezone = COALESCE(NULLIF(TRIM(p_timezone), ''), v_existing_org.timezone, 'Asia/Jakarta'),
        plan_id = v_clean_plan,
        updated_at = now()
    WHERE id = v_existing_org.id
    RETURNING id, slug INTO v_org_id, v_slug;

    INSERT INTO public.audit_logs (
      organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
    )
    VALUES (
      v_org_id, auth.uid(), 'superadmin', 'tenant.provisioning_retried', 'organizations', v_org_id::text,
      'Melanjutkan / mengulang provisioning tenant yang belum selesai',
      jsonb_build_object('name', TRIM(p_name), 'slug', v_slug, 'plan_id', v_clean_plan, 'status', v_clean_status)
    );

    RETURN jsonb_build_object(
      'id', v_org_id,
      'name', TRIM(p_name),
      'slug', v_slug,
      'status', v_clean_status,
      'plan_id', v_clean_plan,
      'retried', true
    );
  END IF;

  -- Pastikan slug unik untuk tenant baru
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_base_slug) THEN
    v_slug := v_base_slug || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);
  ELSE
    v_slug := v_base_slug;
  END IF;

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
      'hasActiveAcademicYear', false,
      'hasAdminAssigned', false,
      'hasMusammiRegistered', false,
      'hasHalaqahCreated', false
    )
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), 'superadmin', 'tenant.provisioned', 'organizations', v_org_id::text,
    'Provisioning tenant baru melalui rpc_create_tenant_with_admin',
    jsonb_build_object('name', TRIM(p_name), 'slug', v_slug, 'plan_id', v_clean_plan, 'status', v_clean_status)
  );

  RETURN jsonb_build_object(
    'id', v_org_id,
    'name', TRIM(p_name),
    'slug', v_slug,
    'status', v_clean_status,
    'plan_id', v_clean_plan,
    'retried', false
  );
END;
$$;

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
BEGIN
  IF public.get_canonical_role() <> 'superadmin'
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'Forbidden: Hanya Superadmin yang dapat mengubah status provisioning tenant.';
  END IF;

  IF p_status NOT IN ('provisioning', 'provisioning_failed', 'trial', 'active', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'Status organisasi tidak valid: %', p_status;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan.';
  END IF;

  UPDATE public.organizations
  SET status = p_status,
      updated_at = now()
  WHERE id = p_organization_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state
  )
  VALUES (
    p_organization_id, auth.uid(), 'superadmin', 'tenant.status_changed.' || p_status,
    'organizations', p_organization_id::text,
    COALESCE(p_reason, 'Perubahan status provisioning tenant'),
    jsonb_build_object('status', v_org.status),
    jsonb_build_object('status', p_status)
  );

  RETURN jsonb_build_object(
    'id', p_organization_id,
    'status', p_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_inspect_invitation_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_inv public.tenant_invitations%ROWTYPE;
  v_org_name text;
  v_effective_status text;
BEGIN
  IF COALESCE(LENGTH(TRIM(p_token)), 0) < 8 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'invalid',
      'message', 'Token undangan tidak valid atau kosong.'
    );
  END IF;

  v_hash := encode(digest(TRIM(p_token), 'sha256'), 'hex');

  SELECT * INTO v_inv
  FROM public.tenant_invitations ti
  WHERE ti.token_hash = v_hash
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'invalid',
      'message', 'Tautan undangan tidak ditemukan atau tidak sah.'
    );
  END IF;

  IF v_inv.organization_id IS NOT NULL THEN
    SELECT name INTO v_org_name FROM public.organizations WHERE id = v_inv.organization_id;
  ELSE
    v_org_name := 'Platform Global';
  END IF;

  IF v_inv.status = 'revoked' THEN
    v_effective_status := 'revoked';
  ELSIF v_inv.status = 'accepted' THEN
    v_effective_status := 'accepted';
  ELSIF v_inv.expires_at < now() OR v_inv.status = 'expired' THEN
    v_effective_status := 'expired';
  ELSE
    v_effective_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'valid', v_effective_status = 'pending',
    'invitation_id', v_inv.id,
    'status', v_effective_status,
    'email', v_inv.email,
    'full_name', v_inv.full_name,
    'role', v_inv.role,
    'organization_id', v_inv.organization_id,
    'organization_name', COALESCE(v_org_name, 'Lembaga'),
    'expires_at', v_inv.expires_at,
    'accepted_at', v_inv.accepted_at,
    'revoked_at', v_inv.revoked_at,
    'message', CASE v_effective_status
      WHEN 'pending' THEN 'Undangan aktif dan siap dikonfirmasi.'
      WHEN 'accepted' THEN 'Tautan undangan ini sudah pernah digunakan (sekali pakai).'
      WHEN 'expired' THEN 'Masa berlaku tautan undangan telah habis (kedaluwarsa).'
      WHEN 'revoked' THEN 'Undangan ini telah dibatalkan (revoked) oleh Administrator.'
      ELSE 'Undangan tidak valid.'
    END
  );
END;
$$;

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
  v_grant public.access_grants%ROWTYPE;
  v_inv public.tenant_invitations%ROWTYPE;
  v_hash text;
  v_caller_email text;
  v_org public.organizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Silakan login terlebih dahulu untuk mengaktifkan undangan.';
  END IF;

  SELECT LOWER(email) INTO v_caller_email FROM auth.users WHERE id = auth.uid();

  -- 1. Jika token diberikan (atau terdapat record di tenant_invitations), wajib validasi token sekali pakai!
  IF p_token IS NOT NULL AND LENGTH(TRIM(p_token)) > 0 THEN
    v_hash := encode(digest(TRIM(p_token), 'sha256'), 'hex');

    SELECT * INTO v_inv
    FROM public.tenant_invitations ti
    WHERE ti.token_hash = v_hash
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'Token undangan tidak sah atau tidak ditemukan.';
    END IF;

    IF v_inv.status = 'revoked' THEN
      RAISE EXCEPTION 'Undangan ini telah dibatalkan (revoked) oleh Administrator.';
    END IF;

    IF v_inv.status = 'accepted' THEN
      RAISE EXCEPTION 'Token undangan ini sudah pernah digunakan (sekali pakai).';
    END IF;

    IF v_inv.expires_at < now() OR v_inv.status = 'expired' THEN
      UPDATE public.tenant_invitations
      SET status = 'expired', updated_at = now()
      WHERE id = v_inv.id AND status = 'pending';
      RAISE EXCEPTION 'Tautan undangan telah kedaluwarsa. Hubungi Admin untuk mengirim ulang undangan.';
    END IF;

    IF v_inv.user_id IS NOT NULL AND v_inv.user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: Token undangan ini terikat pada akun pengguna lain.';
    END IF;

    IF v_caller_email IS NOT NULL AND LOWER(TRIM(v_inv.email)) <> v_caller_email THEN
      RAISE EXCEPTION 'Forbidden: Email akun yang login (%) tidak sesuai dengan email tujuan undangan (%).', v_caller_email, v_inv.email;
    END IF;

    SELECT * INTO v_grant
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND (
        (v_inv.organization_id IS NULL AND ag.organization_id IS NULL AND ag.role = 'superadmin')
        OR ag.organization_id = v_inv.organization_id
      )
    ORDER BY ag.created_at DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO v_grant
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND (p_organization_id IS NULL OR ag.organization_id = p_organization_id)
    ORDER BY CASE WHEN ag.status = 'invited' THEN 1 ELSE 2 END, ag.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_grant.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_invitations ti
      WHERE ti.user_id = auth.uid()
        AND (ti.organization_id IS NOT DISTINCT FROM v_grant.organization_id)
    ) THEN
      SELECT * INTO v_inv
      FROM public.tenant_invitations ti
      WHERE ti.user_id = auth.uid()
        AND (ti.organization_id IS NOT DISTINCT FROM v_grant.organization_id)
      ORDER BY ti.created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF v_inv.status = 'revoked' THEN
        RAISE EXCEPTION 'Undangan ini telah dibatalkan (revoked) oleh Administrator.';
      ELSIF v_inv.status = 'accepted' AND v_grant.status = 'active' THEN
        RAISE EXCEPTION 'Token undangan ini sudah pernah digunakan (sekali pakai).';
      ELSIF v_inv.expires_at < now() OR v_inv.status = 'expired' THEN
        RAISE EXCEPTION 'Tautan undangan telah kedaluwarsa. Hubungi Admin untuk mengirim ulang undangan.';
      END IF;
    END IF;
  END IF;

  IF v_grant.id IS NULL THEN
    RAISE EXCEPTION 'Undangan akses tidak ditemukan untuk akun ini.';
  END IF;

  IF v_grant.status = 'revoked' THEN
    RAISE EXCEPTION 'Undangan atau hak akses Anda telah dicabut (revoked).';
  END IF;

  IF v_grant.status = 'suspended' THEN
    RAISE EXCEPTION 'Hak akses akun Anda sedang ditangguhkan (suspended).';
  END IF;

  IF v_grant.invited_email IS NOT NULL AND v_caller_email IS NOT NULL AND LOWER(TRIM(v_grant.invited_email)) <> v_caller_email THEN
    RAISE EXCEPTION 'Forbidden: Email akun tidak cocok dengan email tujuan undangan.';
  END IF;

  IF v_grant.expires_at IS NOT NULL AND v_grant.expires_at < now() THEN
    RAISE EXCEPTION 'Tautan undangan telah kedaluwarsa. Hubungi Admin Lembaga untuk mengirim ulang undangan.';
  END IF;

  IF v_grant.organization_id IS NOT NULL THEN
    SELECT * INTO v_org FROM public.organizations WHERE id = v_grant.organization_id FOR UPDATE;
    IF v_org.id IS NULL THEN
      RAISE EXCEPTION 'Organisasi tujuan tidak ditemukan.';
    END IF;
    IF v_org.status IN ('suspended', 'archived') THEN
      RAISE EXCEPTION 'Organisasi sedang ditangguhkan atau diarsipkan. Aktivasi tidak dapat dilanjutkan.';
    END IF;
  END IF;

  UPDATE public.access_grants
  SET status = 'active',
      accepted_at = COALESCE(accepted_at, now()),
      expires_at = NULL,
      updated_at = now()
  WHERE id = v_grant.id;

  IF v_inv.id IS NOT NULL THEN
    UPDATE public.tenant_invitations
    SET status = 'accepted',
        user_id = auth.uid(),
        accepted_at = now(),
        updated_at = now()
    WHERE id = v_inv.id;
  END IF;

  IF v_grant.organization_id IS NOT NULL AND v_grant.role = 'admin' THEN
    UPDATE public.organizations
    SET status = CASE
          WHEN status IN ('provisioning', 'provisioning_failed') THEN 'active'
          ELSE status
        END,
        setup_state = COALESCE(setup_state, '{}'::jsonb) || jsonb_build_object('hasAdminAssigned', true),
        updated_at = now()
    WHERE id = v_grant.organization_id;
  END IF;

  IF v_grant.organization_id IS NOT NULL AND v_grant.role = 'musammi' AND COALESCE(v_inv.musammi_id, v_grant.musammi_id) IS NOT NULL THEN
    UPDATE public.musammi
    SET user_id = auth.uid()
    WHERE id = COALESCE(v_inv.musammi_id, v_grant.musammi_id)
      AND organization_id = v_grant.organization_id
      AND (user_id IS NULL OR user_id = auth.uid());

    BEGIN
      UPDATE public.musammi_staff
      SET user_id = auth.uid(), updated_at = now()
      WHERE legacy_musammi_id = COALESCE(v_inv.musammi_id, v_grant.musammi_id)
        AND organization_id = v_grant.organization_id
        AND (user_id IS NULL OR user_id = auth.uid());
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END IF;

  PERFORM set_config('app.syncing_from_grant', 'true', true);
  UPDATE public.profiles
  SET organization_id = COALESCE(v_grant.organization_id, organization_id),
      role = CASE
        WHEN v_grant.role = 'superadmin' THEN 'super_admin'
        WHEN v_grant.role = 'admin' THEN 'admin'
        ELSE 'musammi'
      END,
      updated_at = now()
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, after_state
  )
  VALUES (
    v_grant.organization_id, auth.uid(), v_grant.role, 'invitation.accepted',
    'access_grants', v_grant.id::text,
    jsonb_build_object(
      'role', v_grant.role,
      'status', 'active',
      'organization_id', v_grant.organization_id,
      'invitation_id', v_inv.id
    )
  );

  RETURN jsonb_build_object(
    'grant_id', v_grant.id,
    'invitation_id', v_inv.id,
    'organization_id', v_grant.organization_id,
    'role', v_grant.role,
    'status', 'active'
  );
END;
$$;

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
  v_inv public.tenant_invitations%ROWTYPE;
  v_grant public.access_grants%ROWTYPE;
  v_org_id uuid;
  v_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi pengguna tidak ditemukan.';
  END IF;

  v_is_super := public.is_super_admin();

  IF p_invitation_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.tenant_invitations WHERE id = p_invitation_id FOR UPDATE;
  END IF;

  IF p_grant_id IS NOT NULL THEN
    SELECT * INTO v_grant FROM public.access_grants WHERE id = p_grant_id FOR UPDATE;
  ELSIF v_inv.user_id IS NOT NULL THEN
    SELECT * INTO v_grant
    FROM public.access_grants
    WHERE user_id = v_inv.user_id
      AND (organization_id IS NOT DISTINCT FROM v_inv.organization_id)
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_inv.id IS NULL AND v_grant.user_id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM public.tenant_invitations
    WHERE user_id = v_grant.user_id
      AND (organization_id IS NOT DISTINCT FROM v_grant.organization_id)
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_org_id := COALESCE(v_inv.organization_id, v_grant.organization_id);

  IF NOT v_is_super THEN
    IF v_org_id IS NULL OR NOT public.is_admin_of_org(v_org_id) THEN
      RAISE EXCEPTION 'Forbidden: Anda tidak berwenang membatalkan undangan di organisasi ini.';
    END IF;
    IF COALESCE(v_inv.role, v_grant.role) <> 'musammi' THEN
      RAISE EXCEPTION 'Forbidden: Admin Lembaga hanya dapat membatalkan undangan Musammi.';
    END IF;
  END IF;

  IF v_inv.id IS NOT NULL THEN
    UPDATE public.tenant_invitations
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = auth.uid(),
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
    auth.uid(),
    CASE WHEN v_is_super THEN 'superadmin' ELSE 'admin' END,
    'invitation.revoked',
    'tenant_invitations',
    COALESCE(v_inv.id::text, v_grant.id::text),
    COALESCE(p_reason, 'Pembatalan undangan pengguna'),
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'grant_id', v_grant.id,
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

-- 10.6 Publish & Amend Raport Snapshot Immutable + SHA-256 Verification Hash (Anti-Race Condition & Anti-NULL Version)
DROP FUNCTION IF EXISTS public.rpc_publish_report_card(uuid, text, bigint, jsonb, text);
DROP FUNCTION IF EXISTS public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text);
DROP FUNCTION IF EXISTS public.rpc_record_exam_attempt(uuid, bigint, text, text, bigint, text, numeric, numeric, text, jsonb, boolean, text);
DROP FUNCTION IF EXISTS public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text);

-- 10.7a Pencatatan Hasil Ujian & Remedial V2 (Atomik, Tidak Menimpa Attempt Sebelumnya)
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

-- 10.7b Pengelolaan Versi Rubrik Penilaian
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

-- 10.7c Publikasi Snapshot Raport & Amendment Atomik
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

  -- Kunci transaksional per santri/semester untuk mencegah race condition saat publikasi bersamaan
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

  -- Validasi nilai akhir dan predikat di sisi server (clamp 0..100)
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

-- 10.7d Verifikasi Publik Dokumen Raport Berdasarkan Verification Code / Hash (Minimal PII & Validasi Status)
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
-- 11. ROW LEVEL SECURITY (RLS) KETAT: 3-ROLE, SUPPORT SESSION & SEPARASI ROLE
-- ---------------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.halaqah_student_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.halaqah_musammi_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musammi_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.halaqah_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

-- Kebijakan Organizations untuk Superadmin Platform Console & Admin Lembaga
DROP POLICY IF EXISTS "View Organizations" ON public.organizations;
CREATE POLICY "View Organizations" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id = public.get_my_org_id()
    OR public.is_super_admin()
    OR public.has_active_support_session(id, false)
  );

DROP POLICY IF EXISTS "Allow admins to update own organization" ON public.organizations;
CREATE POLICY "Allow admins to update own organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin_of_org(id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin_of_org(id)
  );

DROP POLICY IF EXISTS "Superadmin Insert Organizations" ON public.organizations;
CREATE POLICY "Superadmin Insert Organizations" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- Kebijakan user_profiles: Admin hanya boleh melihat/mengubah profil user di dalam organisasinya sendiri
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.access_grants ag
      WHERE ag.user_id = public.user_profiles.user_id
        AND ag.organization_id = public.get_my_org_id()
        AND public.is_admin_of_org(ag.organization_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_profiles.user_id
        AND p.organization_id = public.get_my_org_id()
        AND public.is_admin_of_org(p.organization_id)
    )
  );

DROP POLICY IF EXISTS user_profiles_write ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;

CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_admin_of_org(public.get_my_org_id())
  );

CREATE POLICY user_profiles_update ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.access_grants ag
      WHERE ag.user_id = public.user_profiles.user_id
        AND ag.organization_id = public.get_my_org_id()
        AND public.is_admin_of_org(ag.organization_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_profiles.user_id
        AND p.organization_id = public.get_my_org_id()
        AND public.is_admin_of_org(p.organization_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_admin_of_org(public.get_my_org_id())
  );

-- Kebijakan access_grants
DROP POLICY IF EXISTS access_grants_select ON public.access_grants;
CREATE POLICY access_grants_select ON public.access_grants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_admin_of_org(organization_id)
  );

-- Kebijakan access_grants: Admin hanya boleh mengelola grant musammi di lembaganya; hanya Superadmin yang boleh menetapkan admin/superadmin
DROP POLICY IF EXISTS access_grants_manage ON public.access_grants;
CREATE POLICY access_grants_manage ON public.access_grants
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_of_org(organization_id) AND role = 'musammi')
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_of_org(organization_id) AND role = 'musammi')
  );

-- Kebijakan support_access_sessions
DROP POLICY IF EXISTS support_sessions_policy ON public.support_access_sessions;
CREATE POLICY support_sessions_policy ON public.support_access_sessions
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_super_admin());

-- Kebijakan audit_logs: Murni Append-Only (Hanya SELECT & INSERT, tanpa UPDATE/DELETE)
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_update ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_delete ON public.audit_logs;

CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin_of_org(organization_id)
    OR (organization_id = public.get_my_org_id() AND (actor_id = auth.uid() OR actor_user_id = auth.uid()))
  );

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(actor_id, actor_user_id, auth.uid()) = auth.uid()
    AND (
      organization_id = public.get_my_org_id()
      OR public.is_super_admin()
      OR public.has_active_support_session(organization_id, true)
    )
  );

-- Kebijakan integration_secrets: Blokir SELECT langsung secret_value dari browser; hanya service_role atau RPC termasking yang boleh mengakses
DROP POLICY IF EXISTS integration_secrets_admin ON public.integration_secrets;
DROP POLICY IF EXISTS integration_secrets_no_direct_client ON public.integration_secrets;
CREATE POLICY integration_secrets_no_direct_client ON public.integration_secrets
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Perbaiki Kebijakan RLS Tabel Eksisting: Hapus pencocokan Musammi berbasis full_name!
DROP POLICY IF EXISTS "Tenant Isolation Santri Select" ON public.santri;
CREATE POLICY "Tenant Isolation Santri Select" ON public.santri
  FOR SELECT TO authenticated
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        public.is_admin_of_org(organization_id)
        OR id IN (
          SELECT hs.santri_id
          FROM public.halaqah_santri hs
          WHERE hs.organization_id = public.santri.organization_id
            AND public.is_musammi_assigned_to_halaqah(hs.organization_id, hs.halaqah_id)
        )
      )
    )
    OR public.has_active_support_session(organization_id, false)
  );

DROP POLICY IF EXISTS "Tenant Isolation Halaqah Select" ON public.halaqah;
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

DROP POLICY IF EXISTS "Tenant Isolation HalaqahSantri Select" ON public.halaqah_santri;
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

-- Perketat mutasi tabel master (musammi, wali_kelas)
DROP POLICY IF EXISTS "Tenant Isolation Musammi" ON public.musammi;
DROP POLICY IF EXISTS "Tenant Isolation Musammi Select" ON public.musammi;
DROP POLICY IF EXISTS "Tenant Isolation Musammi Modify" ON public.musammi;

CREATE POLICY "Tenant Isolation Musammi Select" ON public.musammi
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY "Tenant Isolation Musammi Modify" ON public.musammi
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS "Tenant Isolation WaliKelas" ON public.wali_kelas;
DROP POLICY IF EXISTS "Tenant Isolation WaliKelas Select" ON public.wali_kelas;
DROP POLICY IF EXISTS "Tenant Isolation WaliKelas Modify" ON public.wali_kelas;

CREATE POLICY "Tenant Isolation WaliKelas Select" ON public.wali_kelas
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY "Tenant Isolation WaliKelas Modify" ON public.wali_kelas
  FOR ALL TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

-- 11.A Bersihkan kebijakan lama generik (%I_tenant_write / %I_tenant_select) pada seluruh tabel V2
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'semesters', 'student_enrollments', 'halaqah_student_memberships',
    'halaqah_musammi_assignments', 'musammi_staff', 'halaqah_sessions',
    'attendance_records', 'recitation_entries', 'recitation_revisions',
    'target_plans', 'rubric_versions', 'exam_attempts', 'report_cards'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_select ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_write ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_write ON public.%I', t, t);
  END LOOP;
END $$;

-- 11.B Tabel Master & Akademik V2 (SELECT untuk anggota tenant, WRITE khusus Admin Lembaga)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'semesters', 'student_enrollments', 'halaqah_student_memberships',
    'halaqah_musammi_assignments', 'musammi_staff',
    'target_plans', 'rubric_versions', 'exam_attempts'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT TO authenticated USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false))',
      t, t
    );

    EXECUTE format(
      'CREATE POLICY %I_admin_write ON public.%I FOR ALL TO authenticated USING (public.is_admin_of_org(organization_id)) WITH CHECK (public.is_admin_of_org(organization_id))',
      t, t
    );
  END LOOP;
END $$;

-- 11.C Tabel Operasional Halaqah V2 (halaqah_sessions, attendance_records, recitation_entries)
-- Hanya Admin Lembaga atau Musammi yang ditugaskan aktif pada halaqah_id terkait yang boleh SELECT / INSERT / UPDATE
DROP POLICY IF EXISTS halaqah_sessions_role_select ON public.halaqah_sessions;
CREATE POLICY halaqah_sessions_role_select ON public.halaqah_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.has_active_support_session(organization_id, false)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );

DROP POLICY IF EXISTS halaqah_sessions_role_insert ON public.halaqah_sessions;
CREATE POLICY halaqah_sessions_role_insert ON public.halaqah_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );

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

-- attendance_records (Koreksi pasca-lock wajib melalui rpc_save_attendance_batch agar terekam alasan & audit)
DROP POLICY IF EXISTS attendance_records_role_select ON public.attendance_records;
CREATE POLICY attendance_records_role_select ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.has_active_support_session(organization_id, false)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );

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

DROP POLICY IF EXISTS attendance_records_role_delete ON public.attendance_records;
CREATE POLICY attendance_records_role_delete ON public.attendance_records
  FOR DELETE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.halaqah_sessions hs
      WHERE hs.id = public.attendance_records.session_id
        AND hs.status = 'locked'
    )
  );

-- recitation_entries
DROP POLICY IF EXISTS recitation_entries_role_select ON public.recitation_entries;
CREATE POLICY recitation_entries_role_select ON public.recitation_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR public.has_active_support_session(organization_id, false)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );

DROP POLICY IF EXISTS recitation_entries_role_insert ON public.recitation_entries;
CREATE POLICY recitation_entries_role_insert ON public.recitation_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
  );

DROP POLICY IF EXISTS recitation_entries_role_update ON public.recitation_entries;
CREATE POLICY recitation_entries_role_update ON public.recitation_entries
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_org(organization_id)
    OR (
      public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
      AND status IN ('draft', 'submitted', 'returned')
    )
  )
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR (
      public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
      AND status IN ('draft', 'submitted')
    )
  );

DROP POLICY IF EXISTS recitation_entries_role_delete ON public.recitation_entries;
CREATE POLICY recitation_entries_role_delete ON public.recitation_entries
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id) AND status = 'draft');

-- recitation_revisions (Append-Only: SELECT & INSERT saja, tanpa UPDATE/DELETE)
DROP POLICY IF EXISTS recitation_revisions_role_select ON public.recitation_revisions;
CREATE POLICY recitation_revisions_role_select ON public.recitation_revisions
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.has_active_support_session(organization_id, false)
  );

DROP POLICY IF EXISTS recitation_revisions_role_insert ON public.recitation_revisions;
CREATE POLICY recitation_revisions_role_insert ON public.recitation_revisions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_org(organization_id)
    OR (
      organization_id = public.get_my_org_id()
      AND public.get_role_for_org(organization_id) = 'musammi'
      AND COALESCE(actor_id, changed_by, auth.uid()) = auth.uid()
    )
  );

-- 11.D report_cards (Immutable Snapshot: SELECT untuk tenant, INSERT/UPDATE terkontrol hanya untuk Admin Lembaga)
DROP POLICY IF EXISTS report_cards_role_select ON public.report_cards;
CREATE POLICY report_cards_role_select ON public.report_cards
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_my_org_id()
    OR public.has_active_support_session(organization_id, false)
  );

DROP POLICY IF EXISTS report_cards_role_insert ON public.report_cards;
CREATE POLICY report_cards_role_insert ON public.report_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS report_cards_role_update ON public.report_cards;
CREATE POLICY report_cards_role_update ON public.report_cards
  FOR UPDATE TO authenticated
  USING (public.is_admin_of_org(organization_id))
  WITH CHECK (public.is_admin_of_org(organization_id));

DROP POLICY IF EXISTS report_cards_role_delete ON public.report_cards;
CREATE POLICY report_cards_role_delete ON public.report_cards
  FOR DELETE TO authenticated
  USING (public.is_admin_of_org(organization_id) AND status = 'draft');

-- ---------------------------------------------------------------------------------
-- 12. GRANTS, PRIVILEGES & RELOAD POSTGREST SCHEMA CACHE
-- ---------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Cabut seluruh akses tabel langsung ke integration_secrets dari anon & authenticated (hanya via service_role API)
REVOKE ALL ON TABLE public.integration_secrets FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.integration_secrets TO service_role;

-- Cabut INSERT, UPDATE, DELETE, TRUNCATE dari anon pada semua tabel public
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON TABLE public.landing_images, public.cms_landing_page, public.landing_page_content TO anon;

-- Cabut UPDATE & DELETE pada tabel append-only audit_logs dan recitation_revisions dari authenticated, serta DELETE pada support_access_sessions & tenant_invitations
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.recitation_revisions FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.support_access_sessions FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.tenant_invitations FROM anon, authenticated;

-- Cabut EXECUTE dari PUBLIC & anon untuk seluruh fungsi SECURITY DEFINER non-publik
REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_canonical_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_role_for_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_of_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_support_session(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_musammi_assigned_to_halaqah(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_musammi_assigned_to_student(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_manage_access_grant(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_open_halaqah_session(bigint, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_save_attendance_batch(uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_lock_halaqah_session(bigint, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_review_recitation_entry(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_review_recitation_entry(bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_set_active_academic_year(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_check_academic_year_closing_readiness(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_close_academic_year(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_accept_invitation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_inspect_invitation_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_revoke_invitation(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_create_tenant_with_admin(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_mark_tenant_provisioning_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_start_support_session(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_end_support_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_record_exam_attempt(uuid, bigint, text, text, bigint, text, numeric, numeric, text, jsonb, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_canonical_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_role_for_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_of_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_support_session(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_halaqah(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_halaqah_on_date(uuid, bigint, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_student(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_manage_access_grant(uuid, uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_open_halaqah_session(bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_attendance_batch(uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_lock_halaqah_session(bigint, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_lock_halaqah_session(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_review_recitation_entry(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_review_recitation_entry(bigint, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_record_exam_attempt(uuid, bigint, text, text, bigint, text, numeric, numeric, text, jsonb, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_rubric_version(uuid, bigint, text, text, numeric, numeric, numeric, numeric, numeric, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_set_active_academic_year(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_check_academic_year_closing_readiness(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_close_academic_year(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_accept_invitation(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_inspect_invitation_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_invitation(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_tenant_with_admin(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_mark_tenant_provisioning_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_start_support_session(uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_end_support_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_verify_report_card(text) TO anon, authenticated, service_role;

-- Trigger otomatis pencatatan histori revisi apabila recitation_entries yang berstatus non-draft dimutasi
CREATE OR REPLACE FUNCTION public.trg_audit_recitation_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    -- Jika perubahan dilakukan langsung (bukan dari rpc_review_recitation_entry yang sudah menaikkan revision_no)
    IF NEW.revision_no IS NOT DISTINCT FROM OLD.revision_no AND (
      NEW.surah_start_no IS DISTINCT FROM OLD.surah_start_no
      OR NEW.ayah_start IS DISTINCT FROM OLD.ayah_start
      OR NEW.surah_end_no IS DISTINCT FROM OLD.surah_end_no
      OR NEW.ayah_end IS DISTINCT FROM OLD.ayah_end
      OR NEW.calculated_pages IS DISTINCT FROM OLD.calculated_pages
      OR NEW.mistakes_minor IS DISTINCT FROM OLD.mistakes_minor
      OR NEW.mistakes_major IS DISTINCT FROM OLD.mistakes_major
      OR NEW.score IS DISTINCT FROM OLD.score
      OR NEW.notes IS DISTINCT FROM OLD.notes
    ) THEN
      NEW.revision_no := COALESCE(OLD.revision_no, 1) + 1;
      INSERT INTO public.recitation_revisions (
        organization_id, entry_id, recitation_entry_id, revision_no, action,
        previous_status, new_status, reason, before_snapshot, after_snapshot,
        actor_id, changed_by
      )
      VALUES (
        NEW.organization_id, NEW.id, NEW.id, NEW.revision_no, 'edit_content',
        OLD.status, NEW.status, COALESCE(NEW.review_reason, 'Koreksi data setoran'),
        to_jsonb(OLD), to_jsonb(NEW),
        auth.uid(), auth.uid()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_recitation_entry_mutation ON public.recitation_entries;
CREATE TRIGGER trg_audit_recitation_entry_mutation
BEFORE UPDATE ON public.recitation_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_audit_recitation_entry_mutation();

-- Trigger Pencegahan Penyimpanan Token Plaintext di app_settings
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

-- RPC Metadata Secret (Memisahkan pembacaan metadata dari nilai secret mentah)
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

-- Tenant-aware rpc_link_telegram_chat_id (Penautan publik tanpa verifikasi Admin dinonaktifkan)
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

NOTIFY pgrst, 'reload schema';

COMMIT;

