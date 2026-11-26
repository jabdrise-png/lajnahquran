-- =====================================================================
-- 2026_11_26_02_platform_tenant_stats_rpc.sql
-- Fase 1 · BUG-03
--
-- Tujuan:
--   Konsol Superadmin menampilkan 0 santri / 0 halaqah karena RLS tabel
--   tenant memblokir superadmin di luar Support Access. Fungsi ini
--   mengembalikan HANYA angka agregat per lembaga (tanpa data pribadi),
--   dan hanya bisa dipanggil oleh superadmin.
--
-- Rollback:
--   drop function if exists public.rpc_platform_tenant_stats();
-- =====================================================================

begin;

create or replace function public.rpc_platform_tenant_stats()
returns table (
  organization_id uuid,
  santri_total integer,
  santri_active integer,
  musammi_total integer,
  halaqah_total integer,
  halaqah_active integer,
  academic_year_count integer,
  active_academic_year_id bigint,
  active_academic_year_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Unauthorized: Sesi autentikasi diperlukan.';
  end if;

  if not public.is_super_admin() then
    raise exception 'Forbidden: Hanya Superadmin yang dapat melihat statistik platform.';
  end if;

  return query
  with ay as (
    select a.organization_id,
           count(*)::int as ay_count,
           (array_agg(a.id order by a.created_at desc) filter (where a.is_active))[1] as active_id,
           (array_agg(a.name order by a.created_at desc) filter (where a.is_active))[1] as active_name
    from public.academic_years a
    group by a.organization_id
  ),
  s as (
    select x.organization_id,
           count(*)::int as total,
           count(*) filter (where coalesce(lower(x.status), 'active') in ('active', 'aktif'))::int as active
    from public.santri x
    group by x.organization_id
  ),
  m as (
    -- Musammi' dihitung per tahun ajaran aktif bila ada; bila belum ada
    -- tahun ajaran aktif, hitung nama unik di semua tahun.
    select x.organization_id,
           count(distinct coalesce(x.user_id::text, lower(trim(x.nama))))::int as total
    from public.musammi x
    left join ay on ay.organization_id = x.organization_id
    where ay.active_id is null or x.academic_year_id = ay.active_id
    group by x.organization_id
  ),
  g as (
    select x.organization_id, count(*)::int as total
    from public.access_grants x
    where x.role = 'musammi' and x.status = 'active' and x.organization_id is not null
    group by x.organization_id
  ),
  h as (
    select x.organization_id,
           count(*)::int as total,
           count(*) filter (where coalesce(x.is_active, true))::int as active
    from public.halaqah x
    group by x.organization_id
  )
  select o.id,
         coalesce(s.total, 0),
         coalesce(s.active, 0),
         greatest(coalesce(m.total, 0), coalesce(g.total, 0)),
         coalesce(h.total, 0),
         coalesce(h.active, 0),
         coalesce(ay.ay_count, 0),
         ay.active_id,
         ay.active_name
  from public.organizations o
  left join s on s.organization_id = o.id
  left join m on m.organization_id = o.id
  left join g on g.organization_id = o.id
  left join h on h.organization_id = o.id
  left join ay on ay.organization_id = o.id;
end;
$$;

revoke all on function public.rpc_platform_tenant_stats() from public, anon;
grant execute on function public.rpc_platform_tenant_stats() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
