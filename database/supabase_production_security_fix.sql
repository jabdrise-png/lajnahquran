-- =================================================================================
-- SUPABASE PRODUCTION SECURITY & MULTI-TENANT ISOLATION MIGRATION
-- =================================================================================
-- Mencakup perbaikan menyeluruh untuk:
-- 1. Fungsi Helper Otorisasi Multi-Tenant (get_my_org_id, is_super_admin, is_admin_of_org)
-- 2. [CRITICAL-01] Trigger handle_new_user (Anti Privilege Escalation & Org Hijacking)
-- 3. [CRITICAL-02] Proteksi Kolom role & organization_id pada Tabel profiles
-- 4. [NEW-CRITICAL-01] Isolasi Multi-Tenant pada academic_years & student_classes
-- 5. [NEW-CRITICAL-02] & [HIGH-01] Proteksi Tabel landing_images, cms_landing_page, landing_page_content
-- 6. [NEW-CRITICAL-03] & [HIGH-02] Isolasi Multi-Tenant & Role Check pada Tabel informasi
-- 7. [CRITICAL-03] & [NEW-CRITICAL-04] Keamanan Fungsi RPC Statistik & Webhook Telegram
--    (Dilengkapi DROP FUNCTION IF EXISTS terlebih dahulu untuk mencegah ERROR 42P13)
-- 8. Pembersihan Constraint Duplikat pada ujian_bulanan & ujian_semester
-- =================================================================================

BEGIN;

-- =================================================================================
-- 1. FUNGSI HELPER OTORISASI MULTI-TENANT
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


-- =================================================================================
-- 2. [CRITICAL-01] AMANKAN TRIGGER REGISTRASI USER BARU (handle_new_user)
-- =================================================================================

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

  -- Blokir mutlak eskalasi ke super_admin dari registrasi client
  IF requested_role = 'super_admin' THEN
    safe_role := 'pending';
  ELSIF requested_role IN ('musammi', 'pengajar', 'pending') THEN
    safe_role := requested_role;
  ELSE
    -- Permintaan role 'admin' dari publik masuk ke antrean 'pending' terlebih dahulu
    safe_role := 'pending';
  END IF;

  IF raw_target_org_id IS NOT NULL AND length(raw_target_org_id) = 36 THEN
    BEGIN
      SELECT id INTO new_org_id FROM public.organizations WHERE id = raw_target_org_id::uuid;
      IF new_org_id IS NULL THEN
        INSERT INTO public.organizations (name) VALUES (mahad_name) RETURNING id INTO new_org_id;
        safe_role := 'pending';
      ELSE
        -- Jika mendaftar ke organisasi yang sudah ada tanpa sesi admin sah, wajibkan status 'pending'
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


-- =================================================================================
-- 3. [CRITICAL-02] PROTEKSI ESKALASI HAK AKSES MANDIRI PADA TABEL profiles
-- =================================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Izinkan jika dieksekusi oleh service_role / postgres (SQL Editor / Trigger internal)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Izinkan penuh jika pemanggil adalah super_admin
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Jika pemanggil adalah admin organisasi tersebut:
  IF public.is_admin_of_org(OLD.organization_id) THEN
    IF NEW.role = 'super_admin' AND OLD.role <> 'super_admin' THEN
      RAISE EXCEPTION 'Forbidden: Only Super Admin can assign super_admin role.';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Forbidden: Cannot move user across organizations.';
    END IF;
    RETURN NEW;
  END IF;

  -- Pengguna biasa dilarang mengubah role atau organization_id miliknya sendiri
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Forbidden: You are not allowed to change your own role.';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Forbidden: You are not allowed to change your organization_id.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

DROP POLICY IF EXISTS "Update Profiles" ON public.profiles;
CREATE POLICY "Update Profiles" ON public.profiles
FOR UPDATE
USING (
  id = auth.uid()
  OR public.is_super_admin()
  OR public.is_admin_of_org(organization_id)
)
WITH CHECK (
  id = auth.uid()
  OR public.is_super_admin()
  OR public.is_admin_of_org(organization_id)
);


-- =================================================================================
-- 4. [NEW-CRITICAL-01] ISOLASI TENANT PADA academic_years & student_classes
-- =================================================================================

DROP POLICY IF EXISTS "Enable read access for all users" ON public.academic_years;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.academic_years;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.academic_years;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.academic_years;
DROP POLICY IF EXISTS "Tenant Isolation Academic Years Select" ON public.academic_years;
DROP POLICY IF EXISTS "Tenant Isolation Academic Years Modify" ON public.academic_years;

CREATE POLICY "Tenant Isolation Academic Years Select" ON public.academic_years
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "Tenant Isolation Academic Years Modify" ON public.academic_years
FOR ALL TO authenticated
USING (
  (organization_id = public.get_my_org_id() AND public.is_admin_of_org(organization_id))
  OR public.is_super_admin()
)
WITH CHECK (
  (organization_id = public.get_my_org_id() AND public.is_admin_of_org(organization_id))
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.student_classes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.student_classes;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.student_classes;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.student_classes;
DROP POLICY IF EXISTS "Tenant Isolation Student Classes Select" ON public.student_classes;
DROP POLICY IF EXISTS "Tenant Isolation Student Classes Modify" ON public.student_classes;

CREATE POLICY "Tenant Isolation Student Classes Select" ON public.student_classes
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "Tenant Isolation Student Classes Modify" ON public.student_classes
FOR ALL TO authenticated
USING (
  (organization_id = public.get_my_org_id() AND public.is_admin_of_org(organization_id))
  OR public.is_super_admin()
)
WITH CHECK (
  (organization_id = public.get_my_org_id() AND public.is_admin_of_org(organization_id))
  OR public.is_super_admin()
);


-- =================================================================================
-- 5. [NEW-CRITICAL-02] & [HIGH-01] PROTEKSI TABEL CMS LANDING PAGE & GALERI
-- =================================================================================

DROP POLICY IF EXISTS "Enable all access for all users" ON public.landing_images;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.landing_images;
DROP POLICY IF EXISTS "Super Admin Modify Landing Images" ON public.landing_images;

CREATE POLICY "Enable read access for all users" ON public.landing_images
FOR SELECT USING (true);

CREATE POLICY "Super Admin Modify Landing Images" ON public.landing_images
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Enable all actions for authenticated users" ON public.cms_landing_page;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.cms_landing_page;
DROP POLICY IF EXISTS "Super Admin Modify CMS Landing Page" ON public.cms_landing_page;

CREATE POLICY "Enable read access for all users" ON public.cms_landing_page
FOR SELECT USING (true);

CREATE POLICY "Super Admin Modify CMS Landing Page" ON public.cms_landing_page
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Enable all actions for authenticated users" ON public.landing_page_content;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.landing_page_content;
DROP POLICY IF EXISTS "Super Admin Modify Landing Page Content" ON public.landing_page_content;

CREATE POLICY "Enable read access for all users" ON public.landing_page_content
FOR SELECT USING (true);

CREATE POLICY "Super Admin Modify Landing Page Content" ON public.landing_page_content
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());


-- =================================================================================
-- 6. [HIGH-02] & [NEW-CRITICAL-03] PERKETAT RLS TABEL informasi
-- =================================================================================

DROP POLICY IF EXISTS "Tenant Isolation Informasi" ON public.informasi;
DROP POLICY IF EXISTS "Tenant Isolation Informasi Select" ON public.informasi;
DROP POLICY IF EXISTS "Tenant Isolation Informasi Modify" ON public.informasi;

CREATE POLICY "Tenant Isolation Informasi Select" ON public.informasi
FOR SELECT TO authenticated
USING (organization_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY "Tenant Isolation Informasi Modify" ON public.informasi
FOR ALL TO authenticated
USING (
  (organization_id = public.get_my_org_id() AND public.is_admin_of_org(organization_id))
  OR public.is_super_admin()
)
WITH CHECK (
  (organization_id = public.get_my_org_id() AND public.is_admin_of_org(organization_id))
  OR public.is_super_admin()
);


-- =================================================================================
-- 7. [CRITICAL-03] & [NEW-CRITICAL-04] AMANKAN FUNGSI RPC STATISTIK & WEBHOOK
--    PENTING: DROP FUNCTION terlebih dahulu agar tidak memicu ERROR 42P13
--    ketika terdapat perubahan kolom OUT / RETURNS TABLE.
-- =================================================================================

DROP FUNCTION IF EXISTS public.rpc_get_attendance_stats(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_get_attendance_trend(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_get_santri_attendance_percentages(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_get_waktu_stats(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_get_waktu_stats(uuid, text, bigint);
DROP FUNCTION IF EXISTS public.rpc_link_telegram_chat_id(text, text);

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

-- Fungsi RPC terbatas khusus untuk menautkan Chat ID Telegram Wali Santri dari Webhook Server
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

-- Atur izin eksekusi RPC Statistik & Webhook
REVOKE ALL ON FUNCTION public.rpc_get_attendance_stats(uuid, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_attendance_trend(uuid, text, text, text, text, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_santri_attendance_percentages(uuid, text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_waktu_stats(uuid, text, bigint) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_get_attendance_stats(uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_attendance_trend(uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_santri_attendance_percentages(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_waktu_stats(uuid, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_link_telegram_chat_id(text, text) TO anon, authenticated, service_role;


-- =================================================================================
-- 8. HAPUS CONSTRAINT DUPLIKAT LAMA PADA ujian_bulanan & ujian_semester
-- =================================================================================

ALTER TABLE public.ujian_bulanan DROP CONSTRAINT IF EXISTS ujian_bulanan_organization_id_santri_id_academic_year_id_p_key1;
ALTER TABLE public.ujian_bulanan DROP CONSTRAINT IF EXISTS ujian_bulanan_organization_id_santri_id_academic_year_id_pe_key;
ALTER TABLE public.ujian_semester DROP CONSTRAINT IF EXISTS ujian_semester_organization_id_santri_id_academic_year_id_s_key;

-- =================================================================================
-- 9. HAPUS TABEL MODUL KESANTRIAN YANG SUDAH TIDAK DIGUNAKAN
-- =================================================================================

DROP TABLE IF EXISTS public.sholat_attendance CASCADE;
DROP TABLE IF EXISTS public.student_violations CASCADE;
DROP TABLE IF EXISTS public.student_warnings CASCADE;
DROP TABLE IF EXISTS public.violation_types CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
