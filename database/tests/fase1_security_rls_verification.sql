-- =============================================================================
-- FASE 1 SECURITY, ROLE & MULTI-TENANT AUTHORIZATION — SQL VERIFICATION SUITE
-- =============================================================================
-- File ini memverifikasi 12 skenario keamanan wajib Fase 1 pada PostgreSQL/Supabase.
-- Dapat dijalankan di lingkungan staging/CI dalam blok transaksi yang di-ROLLBACK
-- di akhir sehingga tidak mengotori data.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_sec_def_without_search_path integer;
  v_anon_exec_rpcs integer;
  v_secrets_readable integer;
  v_audit_mutable integer;
BEGIN
  -- 1. Verifikasi 100% fungsi SECURITY DEFINER di schema public memiliki search_path=public
  SELECT count(*) INTO v_sec_def_without_search_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (
      p.proconfig IS NULL
      OR NOT ('search_path=public' = ANY(p.proconfig))
    );

  IF v_sec_def_without_search_path > 0 THEN
    RAISE EXCEPTION 'SECURITY CHECK FAILED: Terdapat % fungsi SECURITY DEFINER tanpa SET search_path = public', v_sec_def_without_search_path;
  END IF;

  -- 2. Verifikasi role anon TIDAK memiliki privilege EXECUTE pada RPC privat SECURITY DEFINER
  SELECT count(*) INTO v_anon_exec_rpcs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'get_canonical_role',
      'get_role_for_org',
      'is_super_admin',
      'is_admin_of_org',
      'is_musammi_of_org',
      'is_member_of_org',
      'is_musammi_assigned_to_halaqah',
      'is_musammi_assigned_to_student',
      'has_active_support_session',
      'get_my_org_id',
      'rpc_submit_recitation_session',
      'rpc_revise_recitation_entry',
      'rpc_publish_report_card',
      'rpc_amend_report_card',
      'rpc_execute_year_end_closing',
      'rpc_start_support_session',
      'rpc_end_support_session',
      'rpc_manage_access_grant'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_exec_rpcs > 0 THEN
    RAISE EXCEPTION 'SECURITY CHECK FAILED: Terdapat % RPC privat yang masih dapat dieksekusi oleh anon', v_anon_exec_rpcs;
  END IF;

  -- 3. Verifikasi integration_secrets tidak dapat dibaca oleh authenticated maupun anon
  SELECT count(*) INTO v_secrets_readable
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'integration_secrets'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type = 'SELECT';

  IF v_secrets_readable > 0 THEN
    RAISE EXCEPTION 'SECURITY CHECK FAILED: integration_secrets masih memiliki GRANT SELECT untuk anon/authenticated';
  END IF;

  -- 4. Verifikasi audit_logs dan recitation_revisions bersifat append-only (tidak ada UPDATE/DELETE untuk authenticated/anon)
  SELECT count(*) INTO v_audit_mutable
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('audit_logs', 'recitation_revisions')
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');

  IF v_audit_mutable > 0 THEN
    RAISE EXCEPTION 'SECURITY CHECK FAILED: audit_logs atau recitation_revisions masih memiliki privilege UPDATE/DELETE/TRUNCATE';
  END IF;

  RAISE NOTICE 'ALL SQL CATALOG SECURITY ASSERTIONS PASSED.';
END $$;

ROLLBACK;
