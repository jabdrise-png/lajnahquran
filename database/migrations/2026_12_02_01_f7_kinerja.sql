-- =====================================================================
-- 2026_12_02_01_f7_kinerja.sql
-- Fase 7 · HP & performa — data per halaman
--
-- Tujuan:
--   1. rpc_setoran_terakhir(org): setoran sah TERAKHIR per santri per jenis setoran. Aplikasi
--      cukup memuat absensi & setoran 14 hari terakhir saat dibuka (cepat di HP); titik awal
--      setoran berikutnya & posisi terakhir tetap benar walau setoran terakhir sudah lama.
--      SECURITY INVOKER: hak baca mengikuti RLS recitation_entries (musammi' hanya halaqahnya).
--   2. Indeks pendukung: setoran terakhir per santri/jenis, keanggotaan halaqah per santri
--      (fn_halaqah_santri_pada).
--
-- Prasyarat: Fase 6 (2026_12_01_02)
-- Rollback:
--   drop function if exists public.rpc_setoran_terakhir(uuid);
--   drop index if exists public.idx_recitation_entries_terakhir, public.idx_hsm_org_student_from;
-- =====================================================================

begin;

create index if not exists idx_recitation_entries_terakhir
  on public.recitation_entries (organization_id, santri_id, kind, recitation_date desc, created_at desc)
  where status = 'accepted';

create index if not exists idx_hsm_org_student_from
  on public.halaqah_student_memberships (organization_id, student_id, valid_from desc);

create or replace function public.rpc_setoran_terakhir(p_org uuid)
returns setof public.recitation_entries
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (r.santri_id, r.kind) r.*
  from public.recitation_entries r
  where r.organization_id = p_org and r.status = 'accepted'
  order by r.santri_id, r.kind, r.recitation_date desc, r.created_at desc;
$$;
revoke all on function public.rpc_setoran_terakhir(uuid) from public, anon;
grant execute on function public.rpc_setoran_terakhir(uuid) to authenticated, service_role;

commit;
