-- =====================================================================
-- 2026_11_27_01_fix_publish_report_card_version.sql
-- Fase 1 (temuan test otomatis) · BUG-07 lanjutan
--
-- Tujuan:
--   Test otomatis Fase 1 menemukan bahwa rpc_publish_report_card versi repo
--   tidak pernah bisa menerbitkan amandemen: nomor versi amandemen sama dengan
--   versi sebelumnya sehingga melanggar idx_report_cards_org_year_sem_santri_ver_uniq.
--   Fungsi dipasang ulang dari supabase_v2_1_production_hardening.sql dengan:
--     - nomor versi amandemen = versi tertinggi + 1
--     - alasan memakai fn_alasan_valid() (migrasi 2026_11_26_04)
--   Fungsi lain tidak berubah.
--
-- Prasyarat: 2026_11_26_04_reason_validation.sql
-- Rollback: jalankan ulang definisi fungsi di supabase_v2_1_production_hardening.sql
-- =====================================================================

begin;

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
  v_prev_version integer;
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
    -- PERBAIKAN: dulu kolom version_no dimasukkan ke v_next_version sehingga versi amandemen
    -- sama dengan versi sebelumnya (duplicate key idx_report_cards_org_year_sem_santri_ver_uniq).
    SELECT rc.snapshot_hash, rc.verification_code, rc.version_no
    INTO v_existing_hash, v_code, v_prev_version
    FROM public.report_cards rc
    WHERE rc.id = v_prev_id;

    IF v_existing_hash = v_hash AND (p_amendment_reason IS NULL OR TRIM(p_amendment_reason) = '') THEN
      RETURN jsonb_build_object(
        'id', v_prev_id,
        'version_no', v_prev_version,
        'status', 'published',
        'snapshot_hash', v_hash,
        'verification_code', v_code,
        'is_duplicate_prevented', true
      );
    END IF;

    IF NOT public.fn_alasan_valid(p_amendment_reason, 5) THEN
      RAISE EXCEPTION 'Alasan revisi raport wajib diisi dengan jelas (minimal 5 karakter).';
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

revoke all on function public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) from public, anon;
grant execute on function public.rpc_publish_report_card(uuid, bigint, text, bigint, numeric, text, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
