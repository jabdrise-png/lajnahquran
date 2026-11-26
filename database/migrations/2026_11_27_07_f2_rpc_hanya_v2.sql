-- =====================================================================
-- 2026_11_27_07_f2_rpc_hanya_v2.sql
-- Fase 2 · butir 6 dan 10 (sisi database)
--
-- Tujuan:
--   Semua fungsi database membaca/menulis tabel V2 saja. Tabel lama
--   (setoran_harian, attendance, halaqah_santri, student_classes) tidak lagi
--   disentuh oleh fungsi mana pun.
--     - rpc_submit_recitation_entry : tanpa salinan ke setoran_harian, jenis setoran
--       dari recitation_kinds; PERBAIKAN keamanan: pemeriksaan penugasan Musammi'
--       sebelumnya selalu terlewati (argumen lembaga salah).
--     - rpc_review_recitation_entry : tanpa sinkronisasi ke setoran_harian
--     - rpc_save_attendance_batch   : tanpa salinan ke attendance; status dari attendance_statuses
--     - rpc_open_halaqah_session    : roster dari keanggotaan V2; nama marhalah/kelas dari master (BUG-10)
--     - rpc_mutate_halaqah_student, is_musammi_assigned_to_student,
--       rpc_check_academic_year_closing_readiness : tanpa tabel lama
--     - rpc_get_attendance_stats/_trend, rpc_get_santri_attendance_percentages,
--       rpc_get_waktu_stats : dari attendance_records + musammi_attendance_records
--     - Baru: rpc_record_attendance, rpc_update_attendance_entry, rpc_delete_attendance_entries
--     - Dihapus: rpc_get_academic_reconciliation_report, rpc_reconcile_academic_v2_data
--       (halaman Rekonsiliasi dihapus) dan fungsi sinkronisasi lama <-> V2.
--
-- Prasyarat: 2026_11_27_02 s.d. 2026_11_27_06
-- Rollback: jalankan ulang definisi fungsi dari supabase_v2_1_production_hardening.sql
-- =====================================================================

begin;

CREATE OR REPLACE FUNCTION public.rpc_check_academic_year_closing_readiness(p_academic_year_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 2. Setoran yang belum direview (recitation_entries pada TA ini)
  SELECT COUNT(*) INTO v_unreviewed_recitations
  FROM public.recitation_entries
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status IN ('draft', 'submitted', 'returned');


  -- 3. Ujian yang belum lengkap/final
  SELECT COUNT(*) INTO v_incomplete_exams
  FROM public.exam_attempts ea
  WHERE ea.organization_id = v_year.organization_id
    AND ea.academic_year_id = p_academic_year_id
    AND (ea.final_score IS NULL OR ea.raw_score IS NULL);

  -- 4. Remedial yang belum selesai (attempt yang bernilai < 60 namun belum ada attempt lulus)
  SELECT COUNT(*) INTO v_unfinished_remedials
  FROM public.exam_attempts ea
  WHERE ea.organization_id = v_year.organization_id
    AND ea.academic_year_id = p_academic_year_id
    AND COALESCE(ea.final_score, 0) < 60
    AND NOT EXISTS (
      SELECT 1
      FROM public.exam_attempts r
      WHERE r.organization_id = ea.organization_id
        AND r.academic_year_id = ea.academic_year_id
        AND r.santri_id = ea.santri_id
        AND r.exam_type = ea.exam_type
        AND r.attempt_no > ea.attempt_no
        AND COALESCE(r.final_score, 0) >= 60
    );

  -- 5. Raport yang masih berstatus draft (belum diterbitkan/published)
  SELECT COUNT(*) INTO v_unpublished_reports
  FROM public.report_cards
  WHERE organization_id = v_year.organization_id
    AND academic_year_id = p_academic_year_id
    AND status = 'draft';

  -- 6. Santri di halaqah tanpa data kelas
  -- Fase 2: santri yang punya keanggotaan halaqah di TA ini tetapi belum punya enrollment kelas
  SELECT COUNT(DISTINCT m.student_id) INTO v_unreconciled_enrollments
  FROM public.halaqah_student_memberships m
  WHERE m.organization_id = v_year.organization_id
    AND m.academic_year_id = p_academic_year_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_enrollments se
      WHERE se.organization_id = m.organization_id
        AND se.academic_year_id = m.academic_year_id
        AND se.student_id = m.student_id
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
        'label', 'Setiap santri di halaqah tahun ini sudah punya data kelas (enrollment)',
        'count', v_unreconciled_enrollments,
        'passed', (v_unreconciled_enrollments = 0)
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_mutate_halaqah_student(p_student_id bigint, p_from_halaqah_id bigint, p_to_halaqah_id bigint DEFAULT NULL::bigint, p_effective_date date DEFAULT CURRENT_DATE, p_action text DEFAULT 'mutasi'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.is_musammi_assigned_to_student(target_org_id uuid, target_santri_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_open_halaqah_session(p_halaqah_id bigint, p_session_date date, p_session_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'santri_id', s.id,
    'nama', s.nama,
    'kode', s.kode,
    'marhalah', COALESCE(mm.nama, se.marhalah_name, s.marhalah),
    'kelas', COALESCE(mk.nama_kelas, se.class_name, s.kelas),
    'status', 'Belum diisi'
  ) ORDER BY s.nama), '[]'::jsonb)
  INTO v_roster
  FROM active_members am
  JOIN public.santri s ON s.id = am.santri_id AND s.organization_id = v_org_id
  LEFT JOIN public.student_enrollments se
    ON se.organization_id = v_org_id
   AND se.student_id = s.id
   AND se.academic_year_id = v_year_id
  -- BUG-10: nama marhalah/kelas dari data master
  LEFT JOIN public.master_marhalah mm
    ON mm.id = COALESCE(se.master_marhalah_id, se.marhalah_id, s.marhalah_id)
  LEFT JOIN public.master_kelas_relasi mk
    ON mk.id = COALESCE(se.master_kelas_id, se.kelas_id, s.kelas_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_review_recitation_entry(p_entry_id uuid, p_new_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_clean_status IN ('returned', 'voided') AND NOT public.fn_alasan_valid(p_reason, 5) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_save_attendance_batch(p_session_id uuid, p_records jsonb, p_idempotency_key text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.halaqah_sessions%ROWTYPE;
  v_role text;
  v_item jsonb;
  v_santri_id bigint;
  v_status text;
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
  IF v_session.status = 'locked' AND NOT public.fn_alasan_valid(p_reason, 5) THEN
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

    -- Fase 2: status dari tabel attendance_statuses lembaga
    v_status := public.fn_attendance_status_code(v_session.organization_id, v_status);
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Status kehadiran tidak valid untuk santri ID %: %', v_santri_id, COALESCE(v_item->>'status', 'kosong');
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
$function$;

-- ---------------------------------------------------------------------
-- Setoran: simpan ke recitation_entries saja (tanpa salinan ke setoran_harian)
-- ---------------------------------------------------------------------
create or replace function public.fn_recitation_kind_code(p_org uuid, p_kind text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select k.code from public.recitation_kinds k
  where k.organization_id = p_org
    and (k.code = public.fn_slug(p_kind)
         or lower(k.name) = lower(btrim(p_kind))
         or (public.fn_slug(p_kind) = 'murajaah' and k.code = 'murojaah'))
  order by (k.code = public.fn_slug(p_kind)) desc, k.sort_order
  limit 1;
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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_org_id uuid;
  v_is_admin boolean;
  v_kind text;
  v_status text;
  v_year_id bigint;
  v_existing public.recitation_entries%rowtype;
  v_entry_id uuid;
  v_revision_no integer;
  v_session_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Akses ditolak: Autentikasi diperlukan.';
  end if;

  select organization_id into v_org_id from public.santri where id = p_santri_id;
  if v_org_id is null then
    raise exception 'Santri dengan ID % tidak ditemukan.', p_santri_id;
  end if;

  if p_halaqah_id is not null and not exists (
    select 1 from public.halaqah h where h.id = p_halaqah_id and h.organization_id = v_org_id
  ) then
    raise exception 'Halaqah % tidak ditemukan di lembaga santri ini.', p_halaqah_id;
  end if;

  -- Hak akses: Admin lembaga (termasuk Superadmin dengan Support Access read_write)
  -- atau Musammi' yang ditugaskan di halaqah itu pada tanggal setoran.
  -- PERBAIKAN Fase 2: versi lama mengirim ID pengguna sebagai ID lembaga sehingga
  -- pemeriksaan penugasan selalu bernilai NULL dan terlewati.
  v_is_admin := coalesce(public.is_admin_of_org(v_org_id), false);
  if not v_is_admin then
    if p_halaqah_id is null or not coalesce(
      public.is_musammi_assigned_to_halaqah_on_date(v_org_id, p_halaqah_id, p_recitation_date)
      or public.is_musammi_assigned_to_halaqah(v_org_id, p_halaqah_id), false) then
      raise exception 'Akses ditolak: Anda tidak memiliki penugasan musammi aktif untuk halaqah ini pada tanggal %.', p_recitation_date;
    end if;
  end if;

  v_status := lower(btrim(coalesce(p_status, 'submitted')));
  if v_status not in ('draft', 'submitted') then
    raise exception 'Status penyerahan setoran tidak valid: hanya draft atau submitted yang diperbolehkan.';
  end if;

  v_kind := public.fn_recitation_kind_code(v_org_id, coalesce(nullif(btrim(p_kind), ''), 'ziyadah'));
  if v_kind is null then
    raise exception 'Jenis setoran "%" tidak dikenal. Tambahkan dulu di Pengaturan > Jenis Setoran.', p_kind using errcode = '22023';
  end if;

  if p_surah_start_no is null or p_surah_end_no is null or p_surah_start_no not between 1 and 114 or p_surah_end_no not between 1 and 114 then
    raise exception 'Nomor surat harus antara 1 dan 114.';
  end if;
  if coalesce(p_ayah_start, 0) < 1 or coalesce(p_ayah_end, 0) < 1 then
    raise exception 'Nomor ayat harus lebih besar dari 0.';
  end if;
  if p_surah_end_no < p_surah_start_no or (p_surah_end_no = p_surah_start_no and p_ayah_end < p_ayah_start) then
    raise exception 'Urutan surat/ayat selesai tidak boleh lebih kecil dari surat/ayat mulai.';
  end if;
  if coalesce(p_minor_mistakes, 0) < 0 or coalesce(p_major_mistakes, 0) < 0 then
    raise exception 'Jumlah kesalahan tidak boleh negatif.';
  end if;

  select id into v_year_id from public.academic_years
  where organization_id = v_org_id and is_active = true limit 1;

  v_session_id := p_session_id;
  if v_session_id is null and p_halaqah_id is not null then
    select id into v_session_id from public.halaqah_sessions
    where organization_id = v_org_id and halaqah_id = p_halaqah_id
      and session_date = p_recitation_date and session_slot = p_session_slot;
  end if;

  if p_idempotency_key is not null and p_existing_entry_id is null then
    select * into v_existing from public.recitation_entries
    where organization_id = v_org_id and idempotency_key = p_idempotency_key limit 1;
    if v_existing.id is not null then
      return jsonb_build_object('success', true, 'id', v_existing.id, 'legacy_id', v_existing.legacy_setoran_id,
        'status', v_existing.status, 'revision_no', v_existing.revision_no, 'is_duplicate_prevented', true);
    end if;
  end if;

  if p_existing_entry_id is not null then
    select * into v_existing from public.recitation_entries
    where id = p_existing_entry_id and organization_id = v_org_id;
    if v_existing.id is null then
      raise exception 'Catatan setoran dengan ID % tidak ditemukan.', p_existing_entry_id;
    end if;
    if v_existing.status = 'submitted' and not v_is_admin then
      raise exception 'Setoran yang berstatus submitted tidak dapat dimodifikasi langsung oleh Musammi tanpa proses return oleh Admin.';
    end if;
    if v_existing.status = 'voided' then
      raise exception 'Setoran yang telah dibatalkan (voided) bersifat final dan tidak dapat diubah.';
    end if;

    v_revision_no := coalesce(v_existing.revision_no, 1) + 1;

    update public.recitation_entries
    set academic_year_id = coalesce(v_year_id, v_existing.academic_year_id),
        session_id = coalesce(v_session_id, v_existing.session_id),
        halaqah_id = p_halaqah_id,
        recitation_date = p_recitation_date,
        session_slot = p_session_slot,
        kind = v_kind,
        surah_start_no = p_surah_start_no,
        ayah_start = p_ayah_start,
        surah_end_no = p_surah_end_no,
        ayah_end = p_ayah_end,
        calculated_pages = coalesce(p_calculated_pages, 0),
        minor_mistakes = coalesce(p_minor_mistakes, 0),
        major_mistakes = coalesce(p_major_mistakes, 0),
        predicate = p_predicate,
        notes = p_notes,
        -- Setoran yang sudah diterima tetap diterima saat Admin mengoreksi isinya
        status = case when v_existing.status = 'accepted' and v_is_admin then 'accepted' else v_status end,
        revision_no = v_revision_no,
        updated_at = now()
    where id = v_existing.id;

    insert into public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
    ) values (
      v_org_id, v_existing.id, v_existing.id, v_revision_no,
      case
        when v_existing.status = 'returned' and v_status = 'submitted' then 'resubmit'
        when v_status = 'draft' then 'update_draft'
        else 'update_submission'
      end,
      v_existing.status, v_status, coalesce(p_notes, 'Perubahan data setoran'),
      to_jsonb(v_existing),
      jsonb_build_object('status', v_status, 'revision_no', v_revision_no, 'kind', v_kind,
        'surah_start_no', p_surah_start_no, 'ayah_start', p_ayah_start,
        'surah_end_no', p_surah_end_no, 'ayah_end', p_ayah_end, 'calculated_pages', p_calculated_pages),
      v_caller_id, v_caller_id
    );
    v_entry_id := v_existing.id;
  else
    insert into public.recitation_entries (
      organization_id, academic_year_id, session_id, halaqah_id, santri_id,
      recitation_date, session_slot, kind,
      surah_start_no, ayah_start, surah_end_no, ayah_end,
      calculated_pages, minor_mistakes, major_mistakes, predicate, notes,
      status, revision_no, idempotency_key, created_by
    ) values (
      v_org_id, v_year_id, v_session_id, p_halaqah_id, p_santri_id,
      p_recitation_date, p_session_slot, v_kind,
      p_surah_start_no, p_ayah_start, p_surah_end_no, p_ayah_end,
      coalesce(p_calculated_pages, 0), coalesce(p_minor_mistakes, 0), coalesce(p_major_mistakes, 0), p_predicate, p_notes,
      v_status, 1, p_idempotency_key, v_caller_id
    )
    returning id into v_entry_id;

    v_revision_no := 1;
    insert into public.recitation_revisions (
      organization_id, entry_id, recitation_entry_id, revision_no, action,
      previous_status, new_status, reason, before_snapshot, after_snapshot, actor_id, changed_by
    ) values (
      v_org_id, v_entry_id, v_entry_id, 1,
      case when v_status = 'draft' then 'create_draft' else 'create_submission' end,
      null, v_status, 'Entri setoran baru dicatat', '{}'::jsonb,
      jsonb_build_object('status', v_status, 'revision_no', 1, 'kind', v_kind,
        'surah_start_no', p_surah_start_no, 'ayah_start', p_ayah_start,
        'surah_end_no', p_surah_end_no, 'ayah_end', p_ayah_end, 'calculated_pages', p_calculated_pages),
      v_caller_id, v_caller_id
    );
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, before_state, after_state)
  values (
    v_org_id, v_caller_id, case when v_is_admin then 'admin' else 'musammi' end,
    'submit_recitation_' || v_status, 'recitation_entries', v_entry_id::text,
    case when v_existing.id is not null then jsonb_build_object('status', v_existing.status) else '{}'::jsonb end,
    jsonb_build_object('status', v_status, 'revision_no', v_revision_no, 'kind', v_kind)
  );

  return jsonb_build_object(
    'success', true,
    'id', v_entry_id,
    'legacy_id', v_existing.legacy_setoran_id,
    'status', v_status,
    'kind', v_kind,
    'revision_no', v_revision_no
  );
end;
$$;

-- Versi lama review berdasarkan ID setoran_harian: tetap bisa dipakai lewat legacy_setoran_id
create or replace function public.rpc_review_recitation_entry(p_legacy_id bigint, p_new_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from public.recitation_entries where legacy_setoran_id = p_legacy_id limit 1;
  if v_id is null then
    raise exception 'Catatan setoran untuk ID lama % tidak ditemukan.', p_legacy_id;
  end if;
  return public.rpc_review_recitation_entry(v_id, p_new_status, p_reason);
end;
$$;

-- ---------------------------------------------------------------------
-- Absensi: satu pintu untuk santri & musammi' (dipakai layar absensi lama)
-- ---------------------------------------------------------------------
create or replace function public.fn_session_roster(p_org uuid, p_halaqah_id bigint, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'santri_id', s.id, 'nama', s.nama, 'kode', s.kode,
    'marhalah', coalesce(mm.nama, s.marhalah), 'kelas', coalesce(mk.nama_kelas, s.kelas),
    'status', 'Belum diisi') order by s.nama), '[]'::jsonb)
  from (
    select distinct m.student_id from public.halaqah_student_memberships m
    where m.organization_id = p_org and m.halaqah_id = p_halaqah_id and m.status = 'active'
      and (m.valid_from is null or m.valid_from <= p_date) and (m.valid_to is null or m.valid_to >= p_date)
  ) am
  join public.santri s on s.id = am.student_id and s.organization_id = p_org
  left join public.master_marhalah mm on mm.id = s.marhalah_id
  left join public.master_kelas_relasi mk on mk.id = s.kelas_id;
$$;

create or replace function public.fn_get_or_create_session(p_org uuid, p_halaqah_id bigint, p_date date, p_slot text)
returns public.halaqah_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.halaqah_sessions%rowtype;
begin
  select * into v_session from public.halaqah_sessions
  where organization_id = p_org and halaqah_id = p_halaqah_id and session_date = p_date and session_slot = p_slot;
  if v_session.id is null then
    insert into public.halaqah_sessions (organization_id, academic_year_id, halaqah_id, session_date, session_slot, status, opened_by, roster_snapshot)
    select p_org, h.academic_year_id, p_halaqah_id, p_date, p_slot, 'open', auth.uid(), public.fn_session_roster(p_org, p_halaqah_id, p_date)
    from public.halaqah h where h.id = p_halaqah_id
    on conflict (organization_id, halaqah_id, session_date, session_slot) do nothing;
    select * into v_session from public.halaqah_sessions
    where organization_id = p_org and halaqah_id = p_halaqah_id and session_date = p_date and session_slot = p_slot;
  end if;
  return v_session;
end;
$$;
revoke all on function public.fn_get_or_create_session(uuid, bigint, date, text) from public, anon, authenticated;
revoke all on function public.fn_session_roster(uuid, bigint, date) from public, anon;

create or replace function public.fn_assert_can_record(p_org uuid, p_halaqah_id bigint, p_date date)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.is_admin_of_org(p_org), false) then
    return;
  end if;
  if p_halaqah_id is not null and coalesce(
       public.is_musammi_assigned_to_halaqah_on_date(p_org, p_halaqah_id, p_date)
       or public.is_musammi_assigned_to_halaqah(p_org, p_halaqah_id), false) then
    return;
  end if;
  raise exception 'Akses ditolak: Anda tidak ditugaskan pada halaqah ini.' using errcode = '42501';
end;
$$;

-- p_records: [{ "peran": "Santri"|"Musammi", "person_id": 1, "date": "2026-11-20", "waktu": "Shubuh",
--               "status": "Hadir", "halaqah_id": 5, "is_badal": false, "badal_musammi_id": null }]
create or replace function public.rpc_record_attendance(p_records jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_peran text;
  v_person bigint;
  v_date date;
  v_slot text;
  v_halaqah bigint;
  v_org uuid;
  v_session public.halaqah_sessions%rowtype;
  v_status text;
  v_saved int := 0;
  v_sessions uuid[] := array[]::uuid[];
  v_ids uuid[] := array[]::uuid[];
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Daftar absensi kosong.';
  end if;

  for v_item in select * from jsonb_array_elements(p_records) loop
    v_peran := lower(coalesce(v_item->>'peran', 'santri'));
    v_person := nullif(v_item->>'person_id', '')::bigint;
    v_date := (v_item->>'date')::date;
    v_slot := nullif(btrim(coalesce(v_item->>'waktu', v_item->>'session_slot')), '');
    v_halaqah := nullif(v_item->>'halaqah_id', '')::bigint;
    if v_person is null or v_date is null or v_slot is null then
      raise exception 'Data absensi tidak lengkap (orang, tanggal, dan waktu wajib).';
    end if;

    if v_peran = 'santri' then
      select organization_id into v_org from public.santri where id = v_person;
      if v_org is null then raise exception 'Santri % tidak ditemukan.', v_person; end if;
      if v_halaqah is null then
        select m.halaqah_id into v_halaqah from public.halaqah_student_memberships m
        where m.organization_id = v_org and m.student_id = v_person and m.status = 'active'
          and m.valid_from <= v_date and (m.valid_to is null or m.valid_to >= v_date)
        order by m.valid_from desc limit 1;
      end if;
    else
      select organization_id into v_org from public.musammi where id = v_person;
      if v_org is null then raise exception 'Musammi'' % tidak ditemukan.', v_person; end if;
      if v_halaqah is null then
        select coalesce(
          (select a.halaqah_id from public.halaqah_musammi_assignments a
            where a.organization_id = v_org and a.musammi_id = v_person and a.is_active and a.status = 'active'
              and (a.valid_from is null or a.valid_from <= v_date) and (a.valid_to is null or a.valid_to >= v_date)
            order by a.is_primary desc limit 1),
          (select h.id from public.halaqah h where h.organization_id = v_org and h.musammi_id = v_person
            order by (v_slot = any(coalesce(h.waktu, array[]::text[]))) desc, h.id limit 1))
        into v_halaqah;
      end if;
    end if;

    if v_halaqah is null then
      raise exception 'Halaqah untuk % ID % pada % belum diketahui. Pilih halaqahnya dulu.', initcap(v_peran), v_person, v_date;
    end if;
    if not exists (select 1 from public.halaqah h where h.id = v_halaqah and h.organization_id = v_org) then
      raise exception 'Halaqah % bukan milik lembaga ini.', v_halaqah;
    end if;

    perform public.fn_assert_can_record(v_org, v_halaqah, v_date);

    v_status := public.fn_attendance_status_code(v_org, v_item->>'status');
    if v_status is null then
      raise exception 'Status kehadiran "%" tidak dikenal.', v_item->>'status' using errcode = '22023';
    end if;

    v_session := public.fn_get_or_create_session(v_org, v_halaqah, v_date, v_slot);

    if v_peran = 'santri' then
      -- Santri yang dicatat Admin di luar roster (mis. pindahan) ikut masuk roster sesi
      if not exists (select 1 from jsonb_array_elements(coalesce(v_session.roster_snapshot, '[]'::jsonb)) r
                     where (r->>'santri_id')::bigint = v_person) and v_session.status <> 'locked' then
        update public.halaqah_sessions
        set roster_snapshot = coalesce(roster_snapshot, '[]'::jsonb) || (
          select jsonb_build_array(jsonb_build_object('santri_id', s.id, 'nama', s.nama, 'kode', s.kode,
                   'marhalah', s.marhalah, 'kelas', s.kelas, 'status', 'Belum diisi'))
          from public.santri s where s.id = v_person)
        where id = v_session.id;
      end if;

      insert into public.attendance_records (
        organization_id, session_id, halaqah_id, santri_id, attendance_date, session_slot, status, marked_by, correction_reason
      ) values (
        v_org, v_session.id, v_halaqah, v_person, v_date, v_slot, v_status, auth.uid(), nullif(btrim(coalesce(p_reason, '')), '')
      )
      on conflict (session_id, santri_id) do update
      set status = excluded.status, marked_by = excluded.marked_by,
          correction_reason = coalesce(excluded.correction_reason, public.attendance_records.correction_reason),
          updated_at = now()
      returning id into v_id;
    else
      insert into public.musammi_attendance_records (
        organization_id, session_id, halaqah_id, musammi_id, attendance_date, session_slot, status,
        is_badal, badal_musammi_id, marked_by, correction_reason
      ) values (
        v_org, v_session.id, v_halaqah, v_person, v_date, v_slot, v_status,
        coalesce((v_item->>'is_badal')::boolean, false), nullif(v_item->>'badal_musammi_id', '')::bigint,
        auth.uid(), nullif(btrim(coalesce(p_reason, '')), '')
      )
      on conflict (session_id, musammi_id) do update
      set status = excluded.status, is_badal = excluded.is_badal, badal_musammi_id = excluded.badal_musammi_id,
          marked_by = excluded.marked_by,
          correction_reason = coalesce(excluded.correction_reason, public.musammi_attendance_records.correction_reason),
          updated_at = now()
      returning id into v_id;
    end if;

    v_ids := v_ids || v_id;
    if not (v_session.id = any(v_sessions)) then
      v_sessions := v_sessions || v_session.id;
    end if;
    v_saved := v_saved + 1;
  end loop;

  update public.halaqah_sessions
  set status = 'submitted', completed_by = coalesce(completed_by, auth.uid()), completed_at = coalesce(completed_at, now())
  where id = any(v_sessions) and status in ('scheduled', 'open');

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, after_state)
  select hs.organization_id, auth.uid(), public.get_role_for_org(hs.organization_id), 'record_attendance',
         'halaqah_sessions', hs.id::text, nullif(btrim(coalesce(p_reason, '')), ''),
         jsonb_build_object('session_date', hs.session_date, 'session_slot', hs.session_slot)
  from public.halaqah_sessions hs where hs.id = any(v_sessions);

  return jsonb_build_object('saved_count', v_saved, 'session_ids', to_jsonb(v_sessions), 'ids', to_jsonb(v_ids));
end;
$$;

-- Ubah status satu catatan absensi (p_kind: 'santri' | 'musammi')
create or replace function public.rpc_update_attendance_entry(p_kind text, p_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_halaqah bigint;
  v_date date;
  v_status text;
  v_old text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if lower(p_kind) = 'musammi' then
    select organization_id, halaqah_id, attendance_date, status into v_org, v_halaqah, v_date, v_old
    from public.musammi_attendance_records where id = p_id;
  else
    select organization_id, halaqah_id, attendance_date, status into v_org, v_halaqah, v_date, v_old
    from public.attendance_records where id = p_id;
  end if;
  if v_org is null then raise exception 'Catatan absensi tidak ditemukan.'; end if;
  perform public.fn_assert_can_record(v_org, v_halaqah, v_date);

  v_status := public.fn_attendance_status_code(v_org, p_status);
  if v_status is null then raise exception 'Status kehadiran "%" tidak dikenal.', p_status using errcode = '22023'; end if;

  if lower(p_kind) = 'musammi' then
    update public.musammi_attendance_records
    set status = v_status, marked_by = auth.uid(), correction_reason = coalesce(nullif(btrim(p_reason), ''), correction_reason)
    where id = p_id;
  else
    update public.attendance_records
    set status = v_status, marked_by = auth.uid(), correction_reason = coalesce(nullif(btrim(p_reason), ''), correction_reason)
    where id = p_id;
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state, after_state)
  values (v_org, auth.uid(), public.get_role_for_org(v_org), 'update_attendance',
          case when lower(p_kind) = 'musammi' then 'musammi_attendance_records' else 'attendance_records' end,
          p_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
          jsonb_build_object('status', v_old), jsonb_build_object('status', v_status));

  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

-- Hapus catatan absensi. p_items: [{ "kind": "santri"|"musammi", "id": "<uuid>" }]
create or replace function public.rpc_delete_attendance_entries(p_items jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_kind text;
  v_id uuid;
  v_row record;
  v_deleted int := 0;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Daftar absensi tidak valid.'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kind := lower(coalesce(v_item->>'kind', 'santri'));
    v_id := (v_item->>'id')::uuid;
    if v_kind = 'musammi' then
      select organization_id, halaqah_id, attendance_date, status into v_row
      from public.musammi_attendance_records where id = v_id;
    else
      select organization_id, halaqah_id, attendance_date, status into v_row
      from public.attendance_records where id = v_id;
    end if;
    continue when v_row.organization_id is null;
    perform public.fn_assert_can_record(v_row.organization_id, v_row.halaqah_id, v_row.attendance_date);

    if v_kind = 'musammi' then
      delete from public.musammi_attendance_records where id = v_id;
    else
      delete from public.attendance_records where id = v_id;
    end if;

    insert into public.audit_logs (organization_id, actor_id, actor_role, action, resource_type, resource_id, reason, before_state)
    values (v_row.organization_id, auth.uid(), public.get_role_for_org(v_row.organization_id), 'delete_attendance',
            case when v_kind = 'musammi' then 'musammi_attendance_records' else 'attendance_records' end,
            v_id::text, nullif(btrim(coalesce(p_reason, '')), ''),
            jsonb_build_object('status', v_row.status, 'date', v_row.attendance_date, 'halaqah_id', v_row.halaqah_id));
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object('deleted_count', v_deleted);
end;
$$;

-- ---------------------------------------------------------------------
-- Statistik absensi dari tabel V2 (bentuk keluaran sama dengan versi lama)
-- ---------------------------------------------------------------------
create or replace function public.fn_attendance_union(p_org uuid)
returns table (peran text, person_id bigint, halaqah_id bigint, attendance_date date, session_slot text,
               status_code text, status_name text, counts_as_present boolean, marhalah text, kelas text)
language sql
stable
security definer
set search_path = public
as $$
  select 'Santri', r.santri_id, r.halaqah_id, r.attendance_date, r.session_slot, r.status,
         coalesce(st.name, initcap(r.status)), coalesce(st.counts_as_present, r.status in ('hadir', 'terlambat')),
         s.marhalah, s.kelas
  from public.attendance_records r
  left join public.attendance_statuses st on st.organization_id = r.organization_id and st.code = r.status
  left join public.santri s on s.id = r.santri_id
  where r.organization_id = p_org
  union all
  select 'Musammi', r.musammi_id, r.halaqah_id, r.attendance_date, r.session_slot, r.status,
         coalesce(st.name, initcap(r.status)), coalesce(st.counts_as_present, r.status in ('hadir', 'terlambat')),
         m.marhalah, m.kelas
  from public.musammi_attendance_records r
  left join public.attendance_statuses st on st.organization_id = r.organization_id and st.code = r.status
  left join public.musammi m on m.id = r.musammi_id
  where r.organization_id = p_org;
$$;
revoke all on function public.fn_attendance_union(uuid) from public, anon, authenticated;

create or replace function public.rpc_get_attendance_stats(p_org_id uuid, p_start_date text, p_end_date text, p_waktu text,
  p_marhalah text default 'all', p_kelas text default 'all', p_halaqah text default 'all')
returns table (marhalah text, status text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (p_org_id <> public.get_my_org_id() and not public.is_super_admin()) then
    raise exception 'Unauthorized access to organization attendance statistics';
  end if;
  return query
  select a.marhalah, a.status_name, count(*)
  from public.fn_attendance_union(p_org_id) a
  where a.attendance_date >= p_start_date::date and a.attendance_date <= p_end_date::date
    and (p_waktu = 'all' or a.session_slot = p_waktu)
    and (p_marhalah = 'all' or a.marhalah = p_marhalah)
    and (p_kelas = 'all' or a.kelas = p_kelas)
    and (p_halaqah = 'all' or a.halaqah_id::text = p_halaqah)
  group by a.marhalah, a.status_name;
end;
$$;

create or replace function public.rpc_get_attendance_trend(p_org_id uuid, p_start_date text, p_end_date text, p_group_by text,
  p_marhalah text default 'all', p_kelas text default 'all', p_halaqah text default 'all')
returns table (period text, status text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (p_org_id <> public.get_my_org_id() and not public.is_super_admin()) then
    raise exception 'Unauthorized access to organization attendance trend';
  end if;
  return query
  select case when p_group_by = 'month' then to_char(a.attendance_date, 'YYYY-MM') else to_char(a.attendance_date, 'YYYY-MM-DD') end,
         a.status_name, count(*)
  from public.fn_attendance_union(p_org_id) a
  where a.attendance_date >= p_start_date::date and a.attendance_date <= p_end_date::date
    and (p_marhalah = 'all' or a.marhalah = p_marhalah)
    and (p_kelas = 'all' or a.kelas = p_kelas)
    and (p_halaqah = 'all' or a.halaqah_id::text = p_halaqah)
  group by 1, 2;
end;
$$;

create or replace function public.rpc_get_santri_attendance_percentages(p_org_id uuid, p_start_date text, p_end_date text)
returns table (person_id bigint, pct_kehadiran numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (p_org_id <> public.get_my_org_id() and not public.is_super_admin()) then
    raise exception 'Unauthorized access to organization attendance percentages';
  end if;
  return query
  with d as (
    select a.person_id as santri_id, a.counts_as_present
    from public.fn_attendance_union(p_org_id) a
    where a.peran = 'Santri' and a.attendance_date between p_start_date::date and p_end_date::date
    union all
    select m.santri_id, a.counts_as_present
    from public.fn_attendance_union(p_org_id) a
    join public.musammi m on m.id = a.person_id
    where a.peran = 'Musammi' and m.santri_id is not null and a.attendance_date between p_start_date::date and p_end_date::date
  )
  select d.santri_id, (count(*) filter (where d.counts_as_present))::numeric / count(*)::numeric * 100
  from d group by d.santri_id;
end;
$$;

create or replace function public.rpc_get_waktu_stats(p_org_id uuid, p_today text, p_academic_year_id bigint default null)
returns table (total bigint, today bigint, shubuh bigint, dhuha bigint, ashar bigint, maghrib bigint, isya bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or (p_org_id <> public.get_my_org_id() and not public.is_super_admin()) then
    raise exception 'Unauthorized access to organization waktu stats';
  end if;
  return query
  with s as (
    select distinct hs.session_date as d, hs.session_slot as w
    from public.halaqah_sessions hs
    where hs.organization_id = p_org_id
      and (p_academic_year_id is null or hs.academic_year_id = p_academic_year_id)
      and (exists (select 1 from public.attendance_records r where r.session_id = hs.id)
           or exists (select 1 from public.musammi_attendance_records r where r.session_id = hs.id))
  )
  select count(*),
         count(*) filter (where s.d::text = p_today),
         count(distinct s.d) filter (where s.w = 'Shubuh'),
         count(distinct s.d) filter (where s.w = 'Dhuha'),
         count(distinct s.d) filter (where s.w = 'Ashar'),
         count(distinct s.d) filter (where s.w = 'Maghrib'),
         count(distinct s.d) filter (where s.w = 'Isya')
  from s;
end;
$$;


-- ---------------------------------------------------------------------
-- Hapus fungsi rekonsiliasi & sinkronisasi lama
-- ---------------------------------------------------------------------
drop function if exists public.rpc_get_academic_reconciliation_report(bigint);
drop function if exists public.rpc_reconcile_academic_v2_data(bigint);
drop function if exists public.sync_v2_hsm_to_legacy_halaqah_santri() cascade;
drop function if exists public.sync_legacy_halaqah_santri_to_v2_hsm() cascade;
drop function if exists public.sync_v2_enrollment_to_legacy_student_classes() cascade;
drop function if exists public.sync_legacy_student_classes_to_v2_enrollment() cascade;

-- ---------------------------------------------------------------------
-- Hak eksekusi
-- ---------------------------------------------------------------------
revoke all on function public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.rpc_submit_recitation_entry(bigint, bigint, date, text, text, integer, integer, integer, integer, numeric, integer, integer, text, text, text, text, uuid, uuid) to authenticated, service_role;
revoke all on function public.rpc_review_recitation_entry(uuid, text, text) from public, anon;
grant execute on function public.rpc_review_recitation_entry(uuid, text, text) to authenticated, service_role;
revoke all on function public.rpc_review_recitation_entry(bigint, text, text) from public, anon;
grant execute on function public.rpc_review_recitation_entry(bigint, text, text) to authenticated, service_role;
revoke all on function public.rpc_record_attendance(jsonb, text) from public, anon;
grant execute on function public.rpc_record_attendance(jsonb, text) to authenticated, service_role;
revoke all on function public.rpc_update_attendance_entry(text, uuid, text, text) from public, anon;
grant execute on function public.rpc_update_attendance_entry(text, uuid, text, text) to authenticated, service_role;
revoke all on function public.rpc_delete_attendance_entries(jsonb, text) from public, anon;
grant execute on function public.rpc_delete_attendance_entries(jsonb, text) to authenticated, service_role;
revoke all on function public.fn_recitation_kind_code(uuid, text) from public, anon;
revoke all on function public.fn_assert_can_record(uuid, bigint, date) from public, anon;

notify pgrst, 'reload schema';

commit;
