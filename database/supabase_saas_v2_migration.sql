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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_status_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('trial', 'active', 'suspended', 'archived'));
  END IF;
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
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, secret_key_name)
);

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

-- Trigger sinkronisasi otomatis profiles -> user_profiles & access_grants
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
      is_superadmin = EXCLUDED.is_superadmin,
      updated_at = now();

  IF LOWER(COALESCE(NEW.role, '')) IN ('super_admin', 'superadmin') THEN
    v_canonical_role := 'superadmin';
    INSERT INTO public.access_grants (user_id, organization_id, role, status, updated_at)
    VALUES (NEW.id, NULL, 'superadmin', 'active', now())
    ON CONFLICT (user_id) WHERE role = 'superadmin'
    DO UPDATE SET status = 'active', updated_at = now();
  ELSIF NEW.organization_id IS NOT NULL THEN
    IF LOWER(COALESCE(NEW.role, '')) = 'pending' THEN
      v_canonical_role := 'admin';
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
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_to_v2_grants ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_v2_grants
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_v2_grants();

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
  ADD COLUMN IF NOT EXISTS enrolled_at date NOT NULL DEFAULT CURRENT_DATE;

DROP INDEX IF EXISTS public.idx_student_enrollments_active_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_enrollments_org_student_year_uniq
  ON public.student_enrollments(organization_id, student_id, academic_year_id);

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
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hma_org_halaqah_musammi_type_uniq
  ON public.halaqah_musammi_assignments(organization_id, halaqah_id, musammi_id, assignment_type);

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
  NEW.mistakes_minor := COALESCE(NULLIF(NEW.mistakes_minor, 0), NEW.minor_mistakes, 0);
  NEW.minor_mistakes := COALESCE(NULLIF(NEW.minor_mistakes, 0), NEW.mistakes_minor, 0);
  NEW.mistakes_major := COALESCE(NULLIF(NEW.mistakes_major, 0), NEW.major_mistakes, 0);
  NEW.major_mistakes := COALESCE(NULLIF(NEW.major_mistakes, 0), NEW.mistakes_major, 0);
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

CREATE INDEX IF NOT EXISTS idx_report_cards_org_year_student
  ON public.report_cards(organization_id, academic_year_id, semester_name, santri_id, version_no DESC);

-- ---------------------------------------------------------------------------------
-- 9. FUNGSI HELPER OTORISASI 3-ROLE & SUPPORT ACCESS SESSION
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_canonical_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ag.role
      FROM public.access_grants ag
      WHERE ag.user_id = auth.uid()
        AND ag.status = 'active'
      ORDER BY CASE ag.role WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
      LIMIT 1
    ),
    (
      SELECT CASE
        WHEN LOWER(p.role) IN ('super_admin', 'superadmin') THEN 'superadmin'
        WHEN LOWER(p.role) IN ('admin', 'admin_mahad') THEN 'admin'
        WHEN LOWER(p.role) IN ('musammi', 'pengajar') THEN 'musammi'
        ELSE NULL
      END
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  );
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
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_of_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND LOWER(COALESCE(p.role, '')) IN ('admin', 'admin_mahad')
      AND p.organization_id = target_org_id
  ) OR EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND ag.organization_id = target_org_id
      AND ag.role = 'admin'
      AND ag.status = 'active'
  ) OR public.has_active_support_session(target_org_id, true);
$$;

CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_halaqah(target_org_id uuid, target_halaqah_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.halaqah_musammi_assignments hma
    JOIN public.musammi m ON m.id = hma.musammi_id AND m.organization_id = hma.organization_id
    WHERE hma.organization_id = target_org_id
      AND hma.halaqah_id = target_halaqah_id
      AND hma.status = 'active'
      AND (hma.valid_to IS NULL OR hma.valid_to >= CURRENT_DATE)
      AND (hma.user_id = auth.uid() OR m.user_id = auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.halaqah h
    JOIN public.musammi m ON m.id = h.musammi_id AND m.organization_id = h.organization_id
    WHERE h.organization_id = target_org_id
      AND h.id = target_halaqah_id
      AND m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------------
-- 10. RPC TRANSAKSIONAL SERVERLESS (UNTUK VERCEL / NETLIFY / CLIENT)
-- ---------------------------------------------------------------------------------

-- 10.1 Buka Sesi Halaqah + Snapshot Roster Aktif (Status Awal: Belum Diisi / unmarked)
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

  v_role := public.get_canonical_role();
  IF v_role = 'musammi' AND NOT public.is_musammi_assigned_to_halaqah(v_org_id, p_halaqah_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak ditugaskan pada halaqah ini';
  ELSIF v_role = 'superadmin' AND NOT public.has_active_support_session(v_org_id, true) THEN
    RAISE EXCEPTION 'Akses ditolak: Superadmin wajib membuka Support Access Session mode read_write';
  ELSIF v_role NOT IN ('admin', 'musammi', 'superadmin') THEN
    RAISE EXCEPTION 'Akses ditolak';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'santri_id', s.id,
    'nama', s.nama,
    'kode', s.kode,
    'marhalah', s.marhalah,
    'kelas', s.kelas,
    'status', 'Belum diisi'
  ) ORDER BY s.nama), '[]'::jsonb)
  INTO v_roster
  FROM public.halaqah_santri hs
  JOIN public.santri s ON s.id = hs.santri_id AND s.organization_id = hs.organization_id
  WHERE hs.organization_id = v_org_id
    AND hs.halaqah_id = p_halaqah_id
    AND (hs.start_date IS NULL OR hs.start_date <= p_session_date)
    AND (hs.end_date IS NULL OR hs.end_date >= p_session_date);

  INSERT INTO public.halaqah_sessions (
    organization_id, academic_year_id, halaqah_id, session_date, session_slot, status, opened_by, roster_snapshot
  )
  VALUES (
    v_org_id, v_year_id, p_halaqah_id, p_session_date, p_session_slot, 'open', auth.uid(), v_roster
  )
  ON CONFLICT (organization_id, halaqah_id, session_date, session_slot)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_session_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, after_state)
  VALUES (
    v_org_id, auth.uid(), v_role, 'open_session', 'halaqah_sessions', v_session_id::text,
    jsonb_build_object('halaqah_id', p_halaqah_id, 'date', p_session_date, 'slot', p_session_slot)
  );

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'organization_id', v_org_id,
    'roster', v_roster
  );
END;
$$;

-- 10.2 Simpan Batch Kehadiran Sesi Halaqah (Idempotent + Audit Trail)
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
  v_item jsonb;
  v_santri_id bigint;
  v_status text;
  v_saved_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_session FROM public.halaqah_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi halaqah tidak ditemukan';
  END IF;

  IF jsonb_typeof(p_records) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
      v_santri_id := (v_item->>'santri_id')::bigint;
      v_status := LOWER(COALESCE(v_item->>'status', 'hadir'));
      IF v_santri_id IS NOT NULL THEN
        INSERT INTO public.attendance_records (
          organization_id, session_id, halaqah_id, santri_id,
          attendance_date, session_slot, status, idempotency_key,
          marked_by, correction_reason, updated_at
        )
        VALUES (
          v_session.organization_id, v_session.id, v_session.halaqah_id, v_santri_id,
          v_session.session_date, v_session.session_slot, v_status,
          COALESCE(p_idempotency_key, 'batch') || '_' || v_santri_id::text,
          auth.uid(), p_reason, now()
        )
        ON CONFLICT (session_id, santri_id) DO UPDATE
        SET status = EXCLUDED.status,
            marked_by = EXCLUDED.marked_by,
            correction_reason = COALESCE(EXCLUDED.correction_reason, public.attendance_records.correction_reason),
            updated_at = now();
        v_saved_count := v_saved_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('session_id', v_session.id, 'saved_count', v_saved_count);
END;
$$;

-- 10.3 Review / Verifikasi Entri Setoran (Accepted / Returned / Voided) + Riwayat Revisi
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_entry FROM public.recitation_entries WHERE id = p_entry_id;
  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Data setoran tidak ditemukan';
  END IF;

  v_clean_status := LOWER(TRIM(COALESCE(p_new_status, 'accepted')));
  IF v_clean_status NOT IN ('draft', 'submitted', 'accepted', 'returned', 'voided') THEN
    RAISE EXCEPTION 'Status verifikasi tidak valid';
  END IF;

  UPDATE public.recitation_entries
  SET status = v_clean_status,
      revision_no = COALESCE(revision_no, 1) + 1,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_reason = p_reason,
      updated_at = now()
  WHERE id = p_entry_id;

  INSERT INTO public.recitation_revisions (
    organization_id, entry_id, recitation_entry_id, revision_no, action,
    previous_status, new_status, reason, before_snapshot, after_snapshot,
    actor_id, changed_by
  )
  VALUES (
    v_entry.organization_id, v_entry.id, v_entry.id, COALESCE(v_entry.revision_no, 1) + 1,
    CASE
      WHEN v_clean_status = 'accepted' THEN 'accept'
      WHEN v_clean_status = 'returned' THEN 'return'
      WHEN v_clean_status = 'voided' THEN 'void'
      ELSE 'update'
    END,
    v_entry.status, v_clean_status, p_reason,
    to_jsonb(v_entry),
    jsonb_build_object('status', v_clean_status, 'reason', p_reason, 'reviewed_at', now()),
    auth.uid(), auth.uid()
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state
  )
  VALUES (
    v_entry.organization_id, auth.uid(), public.get_canonical_role(),
    'review_recitation_' || v_clean_status, 'recitation_entries', v_entry.id::text, p_reason,
    jsonb_build_object('status', v_entry.status),
    jsonb_build_object('status', v_clean_status)
  );

  RETURN jsonb_build_object('id', v_entry.id, 'status', v_clean_status);
END;
$$;

-- 10.4 Rekonsiliasi & Penutupan Tahun Ajaran
CREATE OR REPLACE FUNCTION public.rpc_close_academic_year(
  p_academic_year_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_year FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_year.id IS NULL THEN
    RAISE EXCEPTION 'Tahun ajaran tidak ditemukan';
  END IF;

  IF NOT public.is_admin_of_org(v_year.organization_id) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya Admin Lembaga yang dapat menutup Tahun Ajaran';
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
      status = 'closed'
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id;

  UPDATE public.halaqah_sessions
  SET status = 'locked',
      locked_at = COALESCE(locked_at, now()),
      locked_by = COALESCE(locked_by, auth.uid()),
      updated_at = now()
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('scheduled', 'open', 'submitted');

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_year.organization_id, auth.uid(), public.get_canonical_role(),
    'close_academic_year', 'academic_years', p_academic_year_id::text,
    'Penutupan resmi Tahun Ajaran ' || v_year.name,
    jsonb_build_object('name', v_year.name, 'status', 'closed', 'closed_at', now())
  );

  RETURN jsonb_build_object('id', p_academic_year_id, 'status', 'closed');
END;
$$;

-- 10.5 Provision Tenant Baru & Mulai / Akhiri Support Access Session Superadmin
CREATE OR REPLACE FUNCTION public.rpc_create_tenant_with_admin(
  p_name text,
  p_slug text DEFAULT NULL,
  p_timezone text DEFAULT 'Asia/Jakarta',
  p_plan_id text DEFAULT 'standard',
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_slug text;
  v_clean_status text;
  v_clean_plan text;
BEGIN
  IF public.get_canonical_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Hanya Superadmin Platform yang dapat melakukan provisioning tenant baru.';
  END IF;

  IF COALESCE(LENGTH(TRIM(p_name)), 0) < 2 THEN
    RAISE EXCEPTION 'Nama organisasi/lembaga wajib diisi.';
  END IF;

  v_slug := COALESCE(
    NULLIF(TRIM(p_slug), ''),
    regexp_replace(lower(TRIM(p_name)), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(random()::text), 1, 5)
  );
  v_clean_status := CASE WHEN p_status IN ('trial', 'active', 'suspended', 'archived') THEN p_status ELSE 'active' END;
  v_clean_plan := CASE WHEN p_plan_id IN ('trial', 'standard', 'enterprise') THEN p_plan_id ELSE 'standard' END;

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
    'plan_id', v_clean_plan
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
BEGIN
  IF public.get_canonical_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Hanya Superadmin Platform yang dapat membuka Support Access Session.';
  END IF;

  IF COALESCE(LENGTH(TRIM(p_reason)), 0) < 5 THEN
    RAISE EXCEPTION 'Alasan akses support wajib diisi secara jelas (minimal 5 karakter).';
  END IF;

  v_expires_at := now() + make_interval(mins => LEAST(GREATEST(p_duration_minutes, 5), 240));

  INSERT INTO public.support_access_sessions (
    superadmin_user_id, organization_id, reason, mode, expires_at
  )
  VALUES (
    auth.uid(), p_organization_id, TRIM(p_reason),
    CASE WHEN p_mode = 'read_write' THEN 'read_write' ELSE 'read_only' END,
    v_expires_at
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    p_organization_id, auth.uid(), 'superadmin', 'start_support_session',
    'support_access_sessions', v_session_id::text, TRIM(p_reason),
    jsonb_build_object('mode', p_mode, 'expires_at', v_expires_at)
  );

  RETURN jsonb_build_object(
    'id', v_session_id,
    'organization_id', p_organization_id,
    'reason', TRIM(p_reason),
    'mode', p_mode,
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
  UPDATE public.support_access_sessions
  SET ended_at = now()
  WHERE id = p_session_id
    AND superadmin_user_id = auth.uid()
    AND ended_at IS NULL
  RETURNING organization_id INTO v_org_id;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      organization_id, actor_id, actor_role, action, resource_type, resource_id
    )
    VALUES (
      v_org_id, auth.uid(), 'superadmin', 'end_support_session', 'support_access_sessions', p_session_id::text
    );
  END IF;

  RETURN true;
END;
$$;

-- 10.6 Publish & Amend Raport Snapshot Immutable (Kompatibel penuh dengan RekapNilaiPage.tsx)
DROP FUNCTION IF EXISTS public.rpc_publish_report_card(uuid, text, bigint, jsonb, text);
DROP FUNCTION IF EXISTS public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text);

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
  v_prev_version integer := 0;
  v_new_id uuid;
BEGIN
  v_org_id := COALESCE(public.get_my_org_id(), p_org_id);
  IF v_org_id IS NULL OR (v_org_id <> public.get_my_org_id() AND NOT public.has_active_support_session(v_org_id, true)) THEN
    RAISE EXCEPTION 'Akses ditolak untuk organisasi ini';
  END IF;

  IF public.get_canonical_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Hanya Admin Lembaga yang dapat menerbitkan snapshot raport';
  END IF;

  SELECT id, version_no
  INTO v_prev_id, v_prev_version
  FROM public.report_cards
  WHERE organization_id = v_org_id
    AND academic_year_id = p_academic_year_id
    AND semester_name = p_semester
    AND santri_id = p_santri_id
    AND status = 'published'
  ORDER BY version_no DESC
  LIMIT 1;

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.report_cards SET status = 'amended', updated_at = now() WHERE id = v_prev_id;
  END IF;

  INSERT INTO public.report_cards (
    organization_id, academic_year_id, semester_name, santri_id,
    version_no, status, final_score, predikat, snapshot_json,
    parent_report_card_id, amendment_reason, published_by, published_at
  )
  VALUES (
    v_org_id, p_academic_year_id, p_semester, p_santri_id,
    v_prev_version + 1, 'published', p_final_score, p_predikat, p_snapshot_json,
    v_prev_id, NULLIF(TRIM(COALESCE(p_amendment_reason, 'Pembaruan snapshot raport')), ''),
    auth.uid(), now()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state
  )
  VALUES (
    v_org_id, auth.uid(), public.get_canonical_role(),
    CASE WHEN v_prev_id IS NULL THEN 'publish_report_card' ELSE 'amend_report_card' END,
    'report_cards', v_new_id::text, p_amendment_reason,
    jsonb_build_object('santri_id', p_santri_id, 'version_no', v_prev_version + 1, 'final_score', p_final_score)
  );

  RETURN jsonb_build_object('id', v_new_id, 'version_no', v_prev_version + 1, 'status', 'published');
END;
$$;

-- ---------------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) KETAT: 3-ROLE, SUPPORT SESSION & HAPUS FULL_NAME MATCH
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
    OR public.get_canonical_role() = 'superadmin'
    OR public.has_active_support_session(id, false)
  );

DROP POLICY IF EXISTS "Allow admins to update own organization" ON public.organizations;
CREATE POLICY "Allow admins to update own organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    public.get_canonical_role() = 'superadmin'
    OR (id = public.get_my_org_id() AND public.get_canonical_role() = 'admin')
    OR public.has_active_support_session(id, true)
  )
  WITH CHECK (
    public.get_canonical_role() = 'superadmin'
    OR (id = public.get_my_org_id() AND public.get_canonical_role() = 'admin')
    OR public.has_active_support_session(id, true)
  );

DROP POLICY IF EXISTS "Superadmin Insert Organizations" ON public.organizations;
CREATE POLICY "Superadmin Insert Organizations" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.get_canonical_role() = 'superadmin');

DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_canonical_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS user_profiles_write ON public.user_profiles;
CREATE POLICY user_profiles_write ON public.user_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.get_canonical_role() IN ('superadmin', 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.get_canonical_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS access_grants_select ON public.access_grants;
CREATE POLICY access_grants_select ON public.access_grants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_canonical_role() = 'superadmin'
    OR (organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin')
  );

DROP POLICY IF EXISTS access_grants_manage ON public.access_grants;
CREATE POLICY access_grants_manage ON public.access_grants
  FOR ALL TO authenticated
  USING (
    public.get_canonical_role() = 'superadmin'
    OR (organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin' AND role IN ('admin', 'musammi'))
  )
  WITH CHECK (
    public.get_canonical_role() = 'superadmin'
    OR (organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin' AND role IN ('admin', 'musammi'))
  );

DROP POLICY IF EXISTS support_sessions_policy ON public.support_access_sessions;
CREATE POLICY support_sessions_policy ON public.support_access_sessions
  FOR ALL TO authenticated
  USING (public.get_canonical_role() = 'superadmin' OR organization_id = public.get_my_org_id())
  WITH CHECK (public.get_canonical_role() = 'superadmin');

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.get_canonical_role() = 'superadmin'
    OR (organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin')
    OR actor_id = auth.uid()
    OR actor_user_id = auth.uid()
  );

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(actor_id, actor_user_id, auth.uid()) = auth.uid()
    OR public.get_canonical_role() IN ('superadmin', 'admin')
  );

DROP POLICY IF EXISTS integration_secrets_admin ON public.integration_secrets;
CREATE POLICY integration_secrets_admin ON public.integration_secrets
  FOR ALL TO authenticated
  USING (
    (organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin')
    OR public.has_active_support_session(organization_id, true)
  )
  WITH CHECK (
    (organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin')
    OR public.has_active_support_session(organization_id, true)
  );

-- Perbaiki Kebijakan RLS Tabel Eksisting: Hapus pencocokan Musammi berbasis full_name!
DROP POLICY IF EXISTS "Tenant Isolation Santri Select" ON public.santri;
CREATE POLICY "Tenant Isolation Santri Select" ON public.santri
  FOR SELECT TO authenticated
  USING (
    (
      organization_id = public.get_my_org_id()
      AND (
        public.get_canonical_role() = 'admin'
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
        public.get_canonical_role() = 'admin'
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
        public.get_canonical_role() = 'admin'
        OR public.is_musammi_assigned_to_halaqah(organization_id, halaqah_id)
      )
    )
    OR public.has_active_support_session(organization_id, false)
  );

-- Perketat mutasi tabel master (musammi, wali_kelas) dengan DROP POLICY IF EXISTS yang idempoten
DROP POLICY IF EXISTS "Tenant Isolation Musammi" ON public.musammi;
DROP POLICY IF EXISTS "Tenant Isolation Musammi Select" ON public.musammi;
DROP POLICY IF EXISTS "Tenant Isolation Musammi Modify" ON public.musammi;

CREATE POLICY "Tenant Isolation Musammi Select" ON public.musammi
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY "Tenant Isolation Musammi Modify" ON public.musammi
  FOR ALL TO authenticated
  USING ((organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin') OR public.has_active_support_session(organization_id, true))
  WITH CHECK ((organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin') OR public.has_active_support_session(organization_id, true));

DROP POLICY IF EXISTS "Tenant Isolation WaliKelas" ON public.wali_kelas;
DROP POLICY IF EXISTS "Tenant Isolation WaliKelas Select" ON public.wali_kelas;
DROP POLICY IF EXISTS "Tenant Isolation WaliKelas Modify" ON public.wali_kelas;

CREATE POLICY "Tenant Isolation WaliKelas Select" ON public.wali_kelas
  FOR SELECT TO authenticated
  USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false));
CREATE POLICY "Tenant Isolation WaliKelas Modify" ON public.wali_kelas
  FOR ALL TO authenticated
  USING ((organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin') OR public.has_active_support_session(organization_id, true))
  WITH CHECK ((organization_id = public.get_my_org_id() AND public.get_canonical_role() = 'admin') OR public.has_active_support_session(organization_id, true));

-- Kebijakan standar tenant-scoped untuk seluruh tabel akademik V2
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
    EXECUTE format(
      'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT TO authenticated USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, false))',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_write ON public.%I FOR ALL TO authenticated USING (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, true)) WITH CHECK (organization_id = public.get_my_org_id() OR public.has_active_support_session(organization_id, true))',
      t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------
-- 12. GRANTS, PRIVILEGES & RELOAD POSTGREST SCHEMA CACHE
-- ---------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_canonical_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_support_session(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_musammi_assigned_to_halaqah(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_open_halaqah_session(bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_attendance_batch(uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_review_recitation_entry(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_close_academic_year(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_tenant_with_admin(text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_start_support_session(uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_end_support_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) TO authenticated, service_role;

-- Nonaktifkan akses anon ke rpc_link_telegram_chat_id sesuai keputusan Blueprint (Portal Wali ditunda)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_link_telegram_chat_id'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_link_telegram_chat_id(text, text) FROM anon, PUBLIC;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
