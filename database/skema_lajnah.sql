-- =================================================================================
-- MASTER DATABASE SCHEMA - SISTEM INFORMASI LAJNAH AL-QUR'AN (MULTI-TENANT)
-- =================================================================================
-- Struktur file ini telah dirapikan dan diorganisir ke dalam 8 bagian:
-- 1. Konfigurasi & Extensions
-- 2. Custom Types (Enums)
-- 3. Fungsi Helper, Trigger & RPC
-- 4. Definisi Tabel & Sequence
-- 5. Primary Keys, Unique Constraints & Indexes
-- 6. Foreign Keys (Relasi Antar Tabel)
-- 7. Row Level Security (RLS) & Policies
-- 8. Realtime Publication & Privileges
-- =================================================================================

-- =================================================================================
-- 1. KONFIGURASI & EXTENSIONS
-- =================================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

COMMENT ON SCHEMA "public" IS 'standard public schema';


-- =================================================================================
-- 2. CUSTOM TYPES (ENUMS)
-- =================================================================================

DO $$ BEGIN
    CREATE TYPE "public"."attendance_status_enum" AS ENUM ('Hadir', 'Izin', 'Sakit', 'Alpa', 'Terlambat');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."halaqah_type_enum" AS ENUM ('Halaqah Utama', 'Halaqah Pagi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."marhalah_enum" AS ENUM ('Mutawassithah', 'Aliyah', 'Jamiah');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."peran_enum" AS ENUM ('Santri', 'Musammi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =================================================================================
-- 3. FUNGSI HELPER, TRIGGER & RPC
-- =================================================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
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
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'admin_mahad')
      AND organization_id = target_org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  mahad_name text;
  requested_role text;
  safe_role text;
  raw_target_org_id text;
BEGIN
  mahad_name := COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'mahad_name'), ''), 'Ma''had Baru');
  requested_role := LOWER(COALESCE(new.raw_user_meta_data->>'role', 'pending'));
  raw_target_org_id := NULLIF(TRIM(new.raw_user_meta_data->>'target_organization_id'), '');

  IF requested_role = 'super_admin' THEN
    safe_role := 'pending';
  ELSIF requested_role IN ('musammi', 'pengajar', 'pending') THEN
    safe_role := requested_role;
  ELSE
    safe_role := 'pending';
  END IF;

  IF raw_target_org_id IS NOT NULL AND length(raw_target_org_id) = 36 THEN
    BEGIN
      SELECT id INTO new_org_id FROM public.organizations WHERE id = raw_target_org_id::uuid;
      IF new_org_id IS NULL THEN
        INSERT INTO public.organizations (name) VALUES (mahad_name) RETURNING id INTO new_org_id;
        safe_role := 'pending';
      ELSE
        IF auth.uid() IS NOT NULL AND (public.is_super_admin() OR public.is_admin_of_org(new_org_id)) THEN
          IF requested_role IN ('admin', 'musammi', 'pengajar', 'pending') THEN
            safe_role := requested_role;
          END IF;
        ELSE
          safe_role := 'pending';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.organizations (name) VALUES (mahad_name) RETURNING id INTO new_org_id;
      safe_role := 'pending';
    END;
  ELSE
    INSERT INTO public.organizations (name) VALUES (mahad_name) RETURNING id INTO new_org_id;
  END IF;

  INSERT INTO public.profiles (id, organization_id, full_name, role, email)
  VALUES (
    new.id,
    new_org_id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    safe_role,
    new.email
  );

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF public.is_admin_of_org(OLD.organization_id) THEN
    IF NEW.role = 'super_admin' AND OLD.role <> 'super_admin' THEN
      RAISE EXCEPTION 'Forbidden: Only Super Admin can assign super_admin role.';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Forbidden: Cannot move user across organizations.';
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

CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_get_attendance_stats(uuid, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.rpc_get_attendance_stats(
    p_org_id uuid,
    p_start_date text,
    p_end_date text,
    p_waktu text,
    p_marhalah text DEFAULT 'all'::text,
    p_kelas text DEFAULT 'all'::text,
    p_halaqah text DEFAULT 'all'::text
)
RETURNS TABLE(marhalah text, status text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (p_org_id <> public.get_my_org_id() AND NOT public.is_super_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to organization attendance statistics';
    END IF;

    RETURN QUERY
    SELECT 
        COALESCE(s.marhalah, m.marhalah) AS marhalah,
        a.status,
        COUNT(*) AS count
    FROM public.attendance a
    LEFT JOIN public.santri s ON a.person_id = s.id AND a.peran = 'Santri'
    LEFT JOIN public.musammi m ON a.person_id = m.id AND a.peran = 'Musammi'
    WHERE a.organization_id = p_org_id
      AND a.date >= p_start_date
      AND a.date <= p_end_date
      AND (p_waktu = 'all' OR a.waktu = p_waktu)
      AND (p_marhalah = 'all' OR COALESCE(s.marhalah, m.marhalah) = p_marhalah)
      AND (p_kelas = 'all' OR COALESCE(s.kelas, m.kelas) = p_kelas)
      AND (p_halaqah = 'all' OR a.halaqah_id::TEXT = p_halaqah)
    GROUP BY COALESCE(s.marhalah, m.marhalah), a.status;
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_get_attendance_trend(uuid, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.rpc_get_attendance_trend(
    p_org_id uuid,
    p_start_date text,
    p_end_date text,
    p_group_by text,
    p_marhalah text DEFAULT 'all'::text,
    p_kelas text DEFAULT 'all'::text,
    p_halaqah text DEFAULT 'all'::text
)
RETURNS TABLE(period text, status text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (p_org_id <> public.get_my_org_id() AND NOT public.is_super_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to organization attendance trend';
    END IF;

    RETURN QUERY
    SELECT 
        CASE 
            WHEN p_group_by = 'month' THEN substring(a.date from 1 for 7)
            ELSE a.date
        END AS period,
        a.status,
        COUNT(*) AS count
    FROM public.attendance a
    LEFT JOIN public.santri s ON a.person_id = s.id AND a.peran = 'Santri'
    LEFT JOIN public.musammi m ON a.person_id = m.id AND a.peran = 'Musammi'
    WHERE a.organization_id = p_org_id
      AND a.date >= p_start_date
      AND a.date <= p_end_date
      AND (p_marhalah = 'all' OR COALESCE(s.marhalah, m.marhalah) = p_marhalah)
      AND (p_kelas = 'all' OR COALESCE(s.kelas, m.kelas) = p_kelas)
      AND (p_halaqah = 'all' OR a.halaqah_id::TEXT = p_halaqah)
    GROUP BY period, a.status;
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_get_santri_attendance_percentages(uuid, text, text);
CREATE OR REPLACE FUNCTION public.rpc_get_santri_attendance_percentages(
    p_org_id uuid,
    p_start_date text,
    p_end_date text
)
RETURNS TABLE(person_id bigint, pct_kehadiran numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (p_org_id <> public.get_my_org_id() AND NOT public.is_super_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to organization attendance percentages';
    END IF;

    RETURN QUERY
    WITH attendance_data AS (
        SELECT 
            a.person_id AS santri_id,
            a.status
        FROM public.attendance a
        WHERE a.organization_id = p_org_id
          AND a.peran = 'Santri'
          AND a.date >= p_start_date
          AND a.date <= p_end_date

        UNION ALL

        SELECT 
            m.santri_id AS santri_id,
            a.status
        FROM public.attendance a
        JOIN public.musammi m ON a.person_id = m.id
        WHERE a.organization_id = p_org_id
          AND a.peran = 'Musammi'
          AND m.santri_id IS NOT NULL
          AND a.date >= p_start_date
          AND a.date <= p_end_date
    )
    SELECT 
        ad.santri_id AS person_id,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (SUM(CASE WHEN LOWER(TRIM(ad.status)) IN ('hadir', 'terlambat', 'hadir telat') THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC) * 100
            ELSE 0
        END AS pct_kehadiran
    FROM attendance_data ad
    GROUP BY ad.santri_id;
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_get_waktu_stats(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_get_waktu_stats(uuid, text, bigint);
CREATE OR REPLACE FUNCTION public.rpc_get_waktu_stats(
    p_org_id uuid,
    p_today text,
    p_academic_year_id bigint DEFAULT NULL::bigint
)
RETURNS TABLE(total bigint, today bigint, shubuh bigint, dhuha bigint, ashar bigint, maghrib bigint, isya bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (p_org_id <> public.get_my_org_id() AND NOT public.is_super_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to organization waktu stats';
    END IF;

    RETURN QUERY
    SELECT 
        COUNT(DISTINCT date || '_' || waktu) AS total,
        COUNT(DISTINCT CASE WHEN date = p_today THEN date || '_' || waktu ELSE NULL END) AS today,
        COUNT(DISTINCT CASE WHEN waktu = 'Shubuh' THEN date ELSE NULL END) AS shubuh,
        COUNT(DISTINCT CASE WHEN waktu = 'Dhuha' THEN date ELSE NULL END) AS dhuha,
        COUNT(DISTINCT CASE WHEN waktu = 'Ashar' THEN date ELSE NULL END) AS ashar,
        COUNT(DISTINCT CASE WHEN waktu = 'Maghrib' THEN date ELSE NULL END) AS maghrib,
        COUNT(DISTINCT CASE WHEN waktu = 'Isya' THEN date ELSE NULL END) AS isya
    FROM public.attendance
    WHERE organization_id = p_org_id
      AND (p_academic_year_id IS NULL OR academic_year_id = p_academic_year_id);
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_link_telegram_chat_id(text, text);
CREATE OR REPLACE FUNCTION public.rpc_link_telegram_chat_id(
    p_identifier text,
    p_chat_id text
)
RETURNS TABLE(id bigint, nama text, kelas text, already_linked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_santri RECORD;
BEGIN
    SELECT s.id, s.nama, s.kelas, s.telegram_chat_id
    INTO v_santri
    FROM public.santri s
    WHERE s.id::text = TRIM(p_identifier) OR s.kode = TRIM(p_identifier)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_santri.telegram_chat_id = p_chat_id THEN
        RETURN QUERY SELECT v_santri.id, v_santri.nama, v_santri.kelas, true;
    ELSE
        UPDATE public.santri
        SET telegram_chat_id = p_chat_id
        WHERE public.santri.id = v_santri.id;

        RETURN QUERY SELECT v_santri.id, v_santri.nama, v_santri.kelas, false;
    END IF;
END;
$$;


-- =================================================================================
-- 4. DEFINISI TABEL & SEQUENCE
-- =================================================================================

SET default_tablespace = '';
SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" DEFAULT 'Ma''had Al Faruq'::"text" NOT NULL,
    "logo_url" "text" DEFAULT 'https://i.ibb.co.com/KcYyzZRz/Tanpa-judul-1080-x-1080-piksel-20260116-084021-0000.png'::"text",
    "address" "text"
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "full_name" "text",
    "role" "text" DEFAULT 'admin'::"text",
    "email" "text"
);

CREATE TABLE IF NOT EXISTS "public"."academic_years" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "active_semester" "text" NOT NULL,
    "is_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "organization_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."master_marhalah" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "nama" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."master_kelas_relasi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "marhalah_id" "uuid",
    "nama_kelas" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."master_kelas" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "marhalah" "text" NOT NULL,
    "nama_kelas" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."santri" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nama" "text" NOT NULL,
    "marhalah" "text" NOT NULL,
    "kelas" "text" NOT NULL,
    "kode" "text",
    "nama_wali" "text",
    "no_hp_wali" "text",
    "telegram_chat_id" "text",
    "status" "text" DEFAULT 'active'::"text",
    "marhalah_id" "uuid",
    "kelas_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."student_classes" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "academic_year_id" bigint NOT NULL,
    "santri_id" bigint NOT NULL,
    "marhalah" "text" NOT NULL,
    "kelas" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "marhalah_id" "uuid",
    "kelas_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."musammi" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nama" "text" NOT NULL,
    "marhalah" "text",
    "kelas" "text",
    "kode" "text",
    "no_hp" "text",
    "academic_year_id" bigint NOT NULL,
    "user_id" "uuid",
    "marhalah_id" "uuid",
    "kelas_id" "uuid",
    "santri_id" bigint
);

CREATE TABLE IF NOT EXISTS "public"."musyrifs" (
    "id" integer NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "academic_year_id" integer,
    "nama" "text" NOT NULL,
    "marhalah" "text" NOT NULL,
    "no_hp" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS "public"."musyrifs_id_seq" AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."musyrifs_id_seq" OWNED BY "public"."musyrifs"."id";
ALTER TABLE ONLY "public"."musyrifs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."musyrifs_id_seq"'::"regclass");

CREATE TABLE IF NOT EXISTS "public"."wali_kelas" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nama" "text" NOT NULL,
    "marhalah" "text" NOT NULL,
    "kelas" "text" NOT NULL,
    "no_hp" "text",
    "academic_year_id" bigint NOT NULL,
    "user_id" "uuid",
    "marhalah_id" "uuid",
    "kelas_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."halaqah" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nama" "text" NOT NULL,
    "musammi_id" bigint,
    "marhalah" "text" NOT NULL,
    "jenis" "text" NOT NULL,
    "waktu" "text"[],
    "no_urut" integer DEFAULT 999,
    "academic_year_id" bigint,
    "is_active" boolean DEFAULT true,
    "updated_at" timestamp with time zone,
    "marhalah_id" "uuid",
    "kelas_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."halaqah_santri" (
    "organization_id" "uuid" NOT NULL,
    "halaqah_id" bigint NOT NULL,
    "santri_id" bigint NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE,
    "end_date" "date",
    "status" character varying(50) DEFAULT 'Aktif'::character varying
);

CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date" "text" NOT NULL,
    "waktu" "text" NOT NULL,
    "person_id" bigint NOT NULL,
    "peran" "public"."peran_enum" NOT NULL,
    "status" "text" NOT NULL,
    "halaqah_id" bigint,
    "academic_year_id" bigint,
    "kelas_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."setoran_harian" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "santri_id" bigint NOT NULL,
    "halaqah_id" bigint,
    "tanggal" "date" DEFAULT CURRENT_DATE NOT NULL,
    "waktu" "text",
    "surat" "text",
    "ayat" "text",
    "skema" "text",
    "nilai" "text",
    "keterangan" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "jumlah_halaman" numeric,
    "kesalahan_kabir" integer DEFAULT 0,
    "kesalahan_shoghir" integer DEFAULT 0,
    "surat_mulai" "text",
    "ayat_mulai" "text",
    "surat_selesai" "text",
    "ayat_selesai" "text"
);

CREATE TABLE IF NOT EXISTS "public"."class_targets" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "marhalah" "text",
    "kelas" "text",
    "target_ziyadah" numeric DEFAULT 0,
    "target_murojaah" numeric DEFAULT 0,
    "target_hafalan" numeric DEFAULT 0,
    "academic_year_id" bigint,
    "marhalah_id" "uuid",
    "kelas_id" "uuid",
    "semester" character varying(10) DEFAULT 'Ganjil'::character varying
);

CREATE TABLE IF NOT EXISTS "public"."evaluation_settings" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" NOT NULL,
    "label" "text" NOT NULL,
    "score" integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "public"."halaqah_evaluation_questions" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "options" "jsonb"
);

CREATE TABLE IF NOT EXISTS "public"."halaqah_evaluations" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "halaqah_id" bigint NOT NULL,
    "month_key" "text" NOT NULL,
    "answers" "jsonb" NOT NULL,
    "academic_year_id" bigint
);

CREATE TABLE IF NOT EXISTS "public"."student_evaluation" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "santri_id" bigint NOT NULL,
    "month_key" "text" NOT NULL,
    "kualitas_hafalan" "text",
    "kualitas_bacaan" "text",
    "sikap_prilaku" "text",
    "catatan_musammi" "text",
    "catatan_muroqib" "text",
    "catatan_lajnah" "text",
    "academic_year_id" bigint
);

CREATE TABLE IF NOT EXISTS "public"."student_progress" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "santri_id" bigint NOT NULL,
    "month_key" "text" NOT NULL,
    "progress_type" "text" NOT NULL,
    "value" "text" NOT NULL,
    "academic_year_id" bigint
);

CREATE TABLE IF NOT EXISTS "public"."ujian_bulanan" (
    "id" integer NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "santri_id" integer NOT NULL,
    "periode" "text" NOT NULL,
    "materi_juz" "text",
    "nilai" numeric,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "academic_year_id" bigint,
    "semester" "text"
);

CREATE SEQUENCE IF NOT EXISTS "public"."ujian_bulanan_id_seq" AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."ujian_bulanan_id_seq" OWNED BY "public"."ujian_bulanan"."id";
ALTER TABLE ONLY "public"."ujian_bulanan" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ujian_bulanan_id_seq"'::"regclass");

CREATE TABLE IF NOT EXISTS "public"."ujian_semester" (
    "id" integer NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "santri_id" integer NOT NULL,
    "academic_year_id" integer NOT NULL,
    "semester" "text" NOT NULL,
    "materi_juz" "text",
    "khoto_shogir" "jsonb" DEFAULT '{}'::"jsonb",
    "khoto_kabir" "jsonb" DEFAULT '{}'::"jsonb",
    "nilai_akhir" double precision,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_custom_nilai" "jsonb" DEFAULT '{}'::"jsonb",
    "custom_nilai" "jsonb" DEFAULT '{}'::"jsonb",
    "catatan" "text"
);

CREATE SEQUENCE IF NOT EXISTS "public"."ujian_semester_id_seq" AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "public"."ujian_semester_id_seq" OWNED BY "public"."ujian_semester"."id";
ALTER TABLE ONLY "public"."ujian_semester" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ujian_semester_id_seq"'::"regclass");

CREATE TABLE IF NOT EXISTS "public"."informasi" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "author_email" "text",
    "is_pinned" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS "public"."chat" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content" "text" NOT NULL,
    "sender_email" "text" NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "sender_name" "text",
    "reply_to" "jsonb"
);

CREATE TABLE IF NOT EXISTS "public"."cms_landing_page" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."landing_page_content" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tenant_id" "uuid",
    "section" character varying(50) NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."landing_images" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "image_url" "text" NOT NULL,
    "title" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


-- =================================================================================
-- 5. PRIMARY KEYS, UNIQUE CONSTRAINTS & INDEXES
-- =================================================================================

ALTER TABLE ONLY "public"."organizations" ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."academic_years" ADD CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."app_settings" ADD CONSTRAINT "app_settings_org_key_unique" UNIQUE ("organization_id", "key");
ALTER TABLE ONLY "public"."master_marhalah" ADD CONSTRAINT "master_marhalah_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."master_kelas_relasi" ADD CONSTRAINT "master_kelas_relasi_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."master_kelas" ADD CONSTRAINT "master_kelas_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."master_kelas" ADD CONSTRAINT "master_kelas_organization_id_marhalah_nama_kelas_key" UNIQUE ("organization_id", "marhalah", "nama_kelas");
ALTER TABLE ONLY "public"."santri" ADD CONSTRAINT "santri_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."student_classes" ADD CONSTRAINT "student_classes_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."student_classes" ADD CONSTRAINT "student_classes_academic_year_id_santri_id_key" UNIQUE ("academic_year_id", "santri_id");
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."musyrifs" ADD CONSTRAINT "musyrifs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."wali_kelas" ADD CONSTRAINT "wali_kelas_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."halaqah" ADD CONSTRAINT "halaqah_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."halaqah_santri" ADD CONSTRAINT "halaqah_santri_pkey" PRIMARY KEY ("halaqah_id", "santri_id");
ALTER TABLE ONLY "public"."attendance" ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."setoran_harian" ADD CONSTRAINT "setoran_harian_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."class_targets" ADD CONSTRAINT "class_targets_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."evaluation_settings" ADD CONSTRAINT "evaluation_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."halaqah_evaluation_questions" ADD CONSTRAINT "halaqah_evaluation_questions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."halaqah_evaluations" ADD CONSTRAINT "halaqah_evaluations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."halaqah_evaluations" ADD CONSTRAINT "unique_halaqah_evaluation" UNIQUE ("halaqah_id", "month_key");
ALTER TABLE ONLY "public"."student_evaluation" ADD CONSTRAINT "student_evaluation_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."student_evaluation" ADD CONSTRAINT "unique_evaluation_entry" UNIQUE ("santri_id", "academic_year_id", "month_key");
ALTER TABLE ONLY "public"."student_progress" ADD CONSTRAINT "student_progress_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."student_progress" ADD CONSTRAINT "unique_progress_entry" UNIQUE ("santri_id", "academic_year_id", "month_key", "progress_type");
ALTER TABLE ONLY "public"."ujian_bulanan" ADD CONSTRAINT "ujian_bulanan_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."ujian_bulanan" ADD CONSTRAINT "ujian_bulanan_unique_record" UNIQUE ("organization_id", "santri_id", "academic_year_id", "semester", "periode");
ALTER TABLE ONLY "public"."ujian_semester" ADD CONSTRAINT "ujian_semester_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."ujian_semester" ADD CONSTRAINT "ujian_semester_unique_record" UNIQUE ("organization_id", "santri_id", "academic_year_id", "semester");
ALTER TABLE ONLY "public"."informasi" ADD CONSTRAINT "informasi_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."chat" ADD CONSTRAINT "chat_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."cms_landing_page" ADD CONSTRAINT "cms_landing_page_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."landing_page_content" ADD CONSTRAINT "landing_page_content_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."landing_images" ADD CONSTRAINT "landing_images_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX IF NOT EXISTS "unique_class_target_v4" ON "public"."class_targets" USING "btree" ("organization_id", "academic_year_id", "semester", "marhalah_id", COALESCE("kelas_id", '00000000-0000-0000-0000-000000000000'::"uuid"));
CREATE UNIQUE INDEX IF NOT EXISTS "unique_class_target_v4_legacy" ON "public"."class_targets" USING "btree" ("organization_id", "academic_year_id", "semester", "marhalah", "kelas") WHERE ("marhalah_id" IS NULL);


-- =================================================================================
-- 6. FOREIGN KEYS (RELASI ANTAR TABEL)
-- =================================================================================

ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."academic_years" ADD CONSTRAINT "academic_years_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."app_settings" ADD CONSTRAINT "app_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."master_marhalah" ADD CONSTRAINT "master_marhalah_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."master_kelas_relasi" ADD CONSTRAINT "master_kelas_relasi_marhalah_id_fkey" FOREIGN KEY ("marhalah_id") REFERENCES "public"."master_marhalah"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."master_kelas_relasi" ADD CONSTRAINT "master_kelas_relasi_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."master_kelas" ADD CONSTRAINT "master_kelas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."santri" ADD CONSTRAINT "santri_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "public"."master_kelas_relasi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."santri" ADD CONSTRAINT "santri_marhalah_id_fkey" FOREIGN KEY ("marhalah_id") REFERENCES "public"."master_marhalah"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."santri" ADD CONSTRAINT "santri_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."student_classes" ADD CONSTRAINT "student_classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_classes" ADD CONSTRAINT "student_classes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_classes" ADD CONSTRAINT "student_classes_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id");
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "public"."master_kelas_relasi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_marhalah_id_fkey" FOREIGN KEY ("marhalah_id") REFERENCES "public"."master_marhalah"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."musammi" ADD CONSTRAINT "musammi_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."musyrifs" ADD CONSTRAINT "musyrifs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id");
ALTER TABLE ONLY "public"."musyrifs" ADD CONSTRAINT "musyrifs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."wali_kelas" ADD CONSTRAINT "wali_kelas_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id");
ALTER TABLE ONLY "public"."wali_kelas" ADD CONSTRAINT "wali_kelas_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "public"."master_kelas_relasi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."wali_kelas" ADD CONSTRAINT "wali_kelas_marhalah_id_fkey" FOREIGN KEY ("marhalah_id") REFERENCES "public"."master_marhalah"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."wali_kelas" ADD CONSTRAINT "wali_kelas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."wali_kelas" ADD CONSTRAINT "wali_kelas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."halaqah" ADD CONSTRAINT "halaqah_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."halaqah" ADD CONSTRAINT "halaqah_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "public"."master_kelas_relasi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."halaqah" ADD CONSTRAINT "halaqah_marhalah_id_fkey" FOREIGN KEY ("marhalah_id") REFERENCES "public"."master_marhalah"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."halaqah" ADD CONSTRAINT "halaqah_musammi_id_fkey" FOREIGN KEY ("musammi_id") REFERENCES "public"."musammi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."halaqah" ADD CONSTRAINT "halaqah_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."halaqah_santri" ADD CONSTRAINT "halaqah_santri_halaqah_id_fkey" FOREIGN KEY ("halaqah_id") REFERENCES "public"."halaqah"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."halaqah_santri" ADD CONSTRAINT "halaqah_santri_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."halaqah_santri" ADD CONSTRAINT "halaqah_santri_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."attendance" ADD CONSTRAINT "attendance_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."attendance" ADD CONSTRAINT "attendance_halaqah_id_fkey" FOREIGN KEY ("halaqah_id") REFERENCES "public"."halaqah"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."attendance" ADD CONSTRAINT "attendance_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "public"."master_kelas_relasi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."attendance" ADD CONSTRAINT "attendance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."setoran_harian" ADD CONSTRAINT "setoran_harian_halaqah_id_fkey" FOREIGN KEY ("halaqah_id") REFERENCES "public"."halaqah"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."setoran_harian" ADD CONSTRAINT "setoran_harian_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."setoran_harian" ADD CONSTRAINT "setoran_harian_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_targets" ADD CONSTRAINT "class_targets_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."class_targets" ADD CONSTRAINT "class_targets_kelas_id_fkey" FOREIGN KEY ("kelas_id") REFERENCES "public"."master_kelas_relasi"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_targets" ADD CONSTRAINT "class_targets_marhalah_id_fkey" FOREIGN KEY ("marhalah_id") REFERENCES "public"."master_marhalah"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."class_targets" ADD CONSTRAINT "class_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."evaluation_settings" ADD CONSTRAINT "evaluation_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."halaqah_evaluation_questions" ADD CONSTRAINT "halaqah_evaluation_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."halaqah_evaluations" ADD CONSTRAINT "halaqah_evaluations_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."halaqah_evaluations" ADD CONSTRAINT "halaqah_evaluations_halaqah_id_fkey" FOREIGN KEY ("halaqah_id") REFERENCES "public"."halaqah"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."halaqah_evaluations" ADD CONSTRAINT "halaqah_evaluations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."student_evaluation" ADD CONSTRAINT "student_evaluation_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_evaluation" ADD CONSTRAINT "student_evaluation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."student_evaluation" ADD CONSTRAINT "student_evaluation_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress" ADD CONSTRAINT "student_progress_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."student_progress" ADD CONSTRAINT "student_progress_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."student_progress" ADD CONSTRAINT "student_progress_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."ujian_bulanan" ADD CONSTRAINT "ujian_bulanan_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."ujian_bulanan" ADD CONSTRAINT "ujian_bulanan_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."ujian_bulanan" ADD CONSTRAINT "ujian_bulanan_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."ujian_semester" ADD CONSTRAINT "ujian_semester_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."ujian_semester" ADD CONSTRAINT "ujian_semester_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."ujian_semester" ADD CONSTRAINT "ujian_semester_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."informasi" ADD CONSTRAINT "informasi_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");
ALTER TABLE ONLY "public"."chat" ADD CONSTRAINT "chat_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");


-- =================================================================================
-- 7. ROW LEVEL SECURITY (RLS) & POLICIES
-- =================================================================================

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

ALTER TABLE "public"."academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."class_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cms_landing_page" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."evaluation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."halaqah" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."halaqah_evaluation_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."halaqah_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."halaqah_santri" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."informasi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."landing_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."landing_page_content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."master_kelas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."master_kelas_relasi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."master_marhalah" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."musammi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."musyrifs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."santri" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."setoran_harian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_evaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ujian_bulanan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ujian_semester" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wali_kelas" ENABLE ROW LEVEL SECURITY;

-- Organizations & Profiles
CREATE POLICY "View Organizations" ON "public"."organizations" FOR SELECT USING ((("id" IN ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"()))) OR "public"."is_super_admin"()));
CREATE POLICY "Allow admins to update own organization" ON "public"."organizations" FOR UPDATE USING (("id" = ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK (("id" = ( SELECT "profiles"."organization_id" FROM "public"."profiles" WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));
CREATE POLICY "View Profiles" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"() OR "public"."is_admin_of_org"("organization_id")));
CREATE POLICY "Update Profiles" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"() OR "public"."is_admin_of_org"("organization_id"))) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."is_super_admin"() OR "public"."is_admin_of_org"("organization_id")));
CREATE POLICY "Delete Profiles" ON "public"."profiles" FOR DELETE USING (("public"."is_super_admin"() OR ("public"."is_admin_of_org"("organization_id") AND ("id" <> "auth"."uid"()))));

-- Academic Years & Student Classes
CREATE POLICY "Tenant Isolation Academic Years Select" ON "public"."academic_years" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_my_org_id"()) OR "public"."is_super_admin"());
CREATE POLICY "Tenant Isolation Academic Years Modify" ON "public"."academic_years" FOR ALL TO "authenticated" USING ((("organization_id" = "public"."get_my_org_id"()) AND "public"."is_admin_of_org"("organization_id")) OR "public"."is_super_admin"()) WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND "public"."is_admin_of_org"("organization_id")) OR "public"."is_super_admin"());
CREATE POLICY "Tenant Isolation Student Classes Select" ON "public"."student_classes" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_my_org_id"()) OR "public"."is_super_admin"());
CREATE POLICY "Tenant Isolation Student Classes Modify" ON "public"."student_classes" FOR ALL TO "authenticated" USING ((("organization_id" = "public"."get_my_org_id"()) AND "public"."is_admin_of_org"("organization_id")) OR "public"."is_super_admin"()) WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND "public"."is_admin_of_org"("organization_id")) OR "public"."is_super_admin"());

-- Master Kelas & Marhalah
CREATE POLICY "Pengguna dapat melihat master_kelas organisasi mereka" ON "public"."master_kelas" FOR SELECT USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Admin dapat menambah master_kelas organisasi mereka" ON "public"."master_kelas" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))));
CREATE POLICY "Admin dapat mengubah master_kelas organisasi mereka" ON "public"."master_kelas" FOR UPDATE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))));
CREATE POLICY "Admin dapat menghapus master_kelas organisasi mereka" ON "public"."master_kelas" FOR DELETE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))));
CREATE POLICY "Akses Master Kelas Relasi" ON "public"."master_kelas_relasi" USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Akses Master Marhalah" ON "public"."master_marhalah" USING (("organization_id" = "public"."get_my_org_id"()));

-- Santri, Halaqah, Staf & Pengaturan
CREATE POLICY "Tenant Isolation App Settings" ON "public"."app_settings" TO "authenticated" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Santri Select" ON "public"."santri" FOR SELECT USING ((("organization_id" = "public"."get_my_org_id"()) AND ((( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text") OR ("id" IN ( SELECT "hs"."santri_id" FROM (("public"."halaqah_santri" "hs" JOIN "public"."halaqah" "h" ON (("hs"."halaqah_id" = "h"."id"))) JOIN "public"."musammi" "m" ON (("h"."musammi_id" = "m"."id"))) WHERE (("m"."user_id" = "auth"."uid"()) OR ("lower"(TRIM(BOTH FROM "m"."nama")) = "lower"(TRIM(BOTH FROM ( SELECT "profiles"."full_name" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())))))))))));
CREATE POLICY "Tenant Isolation Santri Insert" ON "public"."santri" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));
CREATE POLICY "Tenant Isolation Santri Update" ON "public"."santri" FOR UPDATE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));
CREATE POLICY "Tenant Isolation Santri Delete" ON "public"."santri" FOR DELETE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));

CREATE POLICY "Tenant Isolation Halaqah Select" ON "public"."halaqah" FOR SELECT USING ((("organization_id" = "public"."get_my_org_id"()) AND ((( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text") OR ("musammi_id" IN ( SELECT "musammi"."id" FROM "public"."musammi" WHERE (("musammi"."user_id" = "auth"."uid"()) OR ("lower"(TRIM(BOTH FROM "musammi"."nama")) = "lower"(TRIM(BOTH FROM ( SELECT "profiles"."full_name" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())))))))))));
CREATE POLICY "Tenant Isolation Halaqah Insert" ON "public"."halaqah" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));
CREATE POLICY "Tenant Isolation Halaqah Update" ON "public"."halaqah" FOR UPDATE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));
CREATE POLICY "Tenant Isolation Halaqah Delete" ON "public"."halaqah" FOR DELETE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));

CREATE POLICY "Tenant Isolation HalaqahSantri Select" ON "public"."halaqah_santri" FOR SELECT USING ((("organization_id" = "public"."get_my_org_id"()) AND ((( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text") OR ("halaqah_id" IN ( SELECT "halaqah"."id" FROM "public"."halaqah" WHERE ("halaqah"."musammi_id" IN ( SELECT "musammi"."id" FROM "public"."musammi" WHERE (("musammi"."user_id" = "auth"."uid"()) OR ("lower"(TRIM(BOTH FROM "musammi"."nama")) = "lower"(TRIM(BOTH FROM ( SELECT "profiles"."full_name" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())))))))))))));
CREATE POLICY "Tenant Isolation HalaqahSantri Insert" ON "public"."halaqah_santri" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));
CREATE POLICY "Tenant Isolation HalaqahSantri Update" ON "public"."halaqah_santri" FOR UPDATE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));
CREATE POLICY "Tenant Isolation HalaqahSantri Delete" ON "public"."halaqah_santri" FOR DELETE USING ((("organization_id" = "public"."get_my_org_id"()) AND (( SELECT "profiles"."role" FROM "public"."profiles" WHERE ("profiles"."id" = "auth"."uid"())) <> 'musammi'::"text")));

CREATE POLICY "Tenant Isolation Musammi" ON "public"."musammi" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation WaliKelas" ON "public"."wali_kelas" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can view musyrifs of their org" ON "public"."musyrifs" FOR SELECT USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can insert musyrifs to their org" ON "public"."musyrifs" FOR INSERT WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can update musyrifs of their org" ON "public"."musyrifs" FOR UPDATE USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can delete musyrifs of their org" ON "public"."musyrifs" FOR DELETE USING (("organization_id" = "public"."get_my_org_id"()));

-- Akademik, Evaluasi, Ujian & Kesantrian
CREATE POLICY "Tenant Isolation Attendance" ON "public"."attendance" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can view setoran harian in their organization" ON "public"."setoran_harian" FOR SELECT USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can insert setoran harian in their organization" ON "public"."setoran_harian" FOR INSERT WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can update setoran harian in their organization" ON "public"."setoran_harian" FOR UPDATE USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can delete setoran harian in their organization" ON "public"."setoran_harian" FOR DELETE USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Class Targets" ON "public"."class_targets" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Evaluation Settings" ON "public"."evaluation_settings" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Halaqah Eval Questions" ON "public"."halaqah_evaluation_questions" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Halaqah Evaluations" ON "public"."halaqah_evaluations" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Student Evaluation" ON "public"."student_evaluation" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Tenant Isolation Progress" ON "public"."student_progress" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));

CREATE POLICY "Users can view ujian_bulanan in their org" ON "public"."ujian_bulanan" FOR SELECT USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can insert ujian_bulanan in their org" ON "public"."ujian_bulanan" FOR INSERT WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can update ujian_bulanan in their org" ON "public"."ujian_bulanan" FOR UPDATE USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can delete ujian_bulanan in their org" ON "public"."ujian_bulanan" FOR DELETE USING (("organization_id" = "public"."get_my_org_id"()));

CREATE POLICY "Users can view ujian_semester in their org" ON "public"."ujian_semester" FOR SELECT USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can insert ujian_semester in their org" ON "public"."ujian_semester" FOR INSERT WITH CHECK (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can update ujian_semester in their org" ON "public"."ujian_semester" FOR UPDATE USING (("organization_id" = "public"."get_my_org_id"()));
CREATE POLICY "Users can delete ujian_semester in their org" ON "public"."ujian_semester" FOR DELETE USING (("organization_id" = "public"."get_my_org_id"()));

-- Informasi, Chat & CMS Landing Page
CREATE POLICY "Tenant Isolation Informasi Select" ON "public"."informasi" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_my_org_id"()) OR "public"."is_super_admin"());
CREATE POLICY "Tenant Isolation Informasi Modify" ON "public"."informasi" FOR ALL TO "authenticated" USING ((("organization_id" = "public"."get_my_org_id"()) AND "public"."is_admin_of_org"("organization_id")) OR "public"."is_super_admin"()) WITH CHECK ((("organization_id" = "public"."get_my_org_id"()) AND "public"."is_admin_of_org"("organization_id")) OR "public"."is_super_admin"());
CREATE POLICY "Tenant Isolation Chat" ON "public"."chat" USING (("organization_id" = "public"."get_my_org_id"())) WITH CHECK (("organization_id" = "public"."get_my_org_id"()));

CREATE POLICY "Enable read access for all users" ON "public"."landing_images" FOR SELECT USING (true);
CREATE POLICY "Super Admin Modify Landing Images" ON "public"."landing_images" FOR ALL TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());
CREATE POLICY "Enable read access for all users" ON "public"."cms_landing_page" FOR SELECT USING (true);
CREATE POLICY "Super Admin Modify CMS Landing Page" ON "public"."cms_landing_page" FOR ALL TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());
CREATE POLICY "Enable read access for all users" ON "public"."landing_page_content" FOR SELECT USING (true);
CREATE POLICY "Super Admin Modify Landing Page Content" ON "public"."landing_page_content" FOR ALL TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());


-- =================================================================================
-- 8. REALTIME PUBLICATION & PRIVILEGES
-- =================================================================================

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."attendance";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."musyrifs";

GRANT USAGE ON SCHEMA "public" TO "postgres", "anon", "authenticated", "service_role";
GRANT ALL ON ALL TABLES IN SCHEMA "public" TO "anon", "authenticated", "service_role";
GRANT ALL ON ALL SEQUENCES IN SCHEMA "public" TO "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION public.rpc_get_attendance_stats(uuid, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_attendance_trend(uuid, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_santri_attendance_percentages(uuid, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_waktu_stats(uuid, text, bigint) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_get_attendance_stats(uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_attendance_trend(uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_santri_attendance_percentages(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_waktu_stats(uuid, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_link_telegram_chat_id(text, text) TO anon, authenticated, service_role;
