-- =====================================================================
-- 2026_11_26_01_fix_recitation_revisions_action_check.sql
-- Fase 1 · BUG-01 / BUG-02
--
-- Tujuan:
--   Setoran gagal disimpan dengan error
--   `violates check constraint "recitation_revisions_action_check"`.
--   Constraint itu ada di database, tetapi daftar aksinya tidak memuat aksi
--   yang dipakai RPC (create_draft, create_submission, update_draft,
--   update_submission, resubmit, accept, return, void, review, edit_content).
--
--   Migrasi ini mengganti constraint dengan daftar lengkap. Nilai `action`
--   yang SUDAH ADA di tabel ikut dimasukkan supaya constraint baru tidak
--   gagal karena data lama.
--
-- Rollback:
--   alter table public.recitation_revisions
--     drop constraint if exists recitation_revisions_action_check;
--   (lalu pasang kembali definisi lama bila masih diperlukan)
-- =====================================================================

begin;

do $$
declare
  v_known text[] := array[
    'create', 'update', 'delete',
    'create_draft', 'create_submission',
    'update_draft', 'update_submission',
    'resubmit', 'edit_content',
    'accept', 'return', 'void', 'review'
  ];
  v_existing text[];
  v_all text[];
  v_list text;
begin
  if to_regclass('public.recitation_revisions') is null then
    raise notice 'Tabel recitation_revisions tidak ada, migrasi dilewati.';
    return;
  end if;

  select coalesce(array_agg(distinct action), array[]::text[])
    into v_existing
  from public.recitation_revisions
  where action is not null;

  select array_agg(distinct a order by a)
    into v_all
  from unnest(v_known || v_existing) as a;

  select string_agg(quote_literal(a), ', ')
    into v_list
  from unnest(v_all) as a;

  execute 'alter table public.recitation_revisions drop constraint if exists recitation_revisions_action_check';
  execute format(
    'alter table public.recitation_revisions add constraint recitation_revisions_action_check check (action in (%s))',
    v_list
  );

  raise notice 'recitation_revisions_action_check sekarang: %', v_list;
end;
$$;

commit;
