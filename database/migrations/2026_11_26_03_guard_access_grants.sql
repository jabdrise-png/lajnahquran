-- =====================================================================
-- 2026_11_26_03_guard_access_grants.sql
-- Fase 1 · BUG-04 / BUG-05
--
-- Tujuan:
--   Penjaga di tingkat database untuk tabel access_grants, berlaku untuk
--   SEMUA jalur (RPC maupun update langsung):
--     1. Selain Superadmin, tidak ada yang boleh membuat, mengubah, atau
--        menghapus grant Superadmin.
--     2. Tidak ada pengguna yang boleh mengubah role/status grant miliknya
--        sendiri (kecuali menerima undangan: invited -> active).
--     3. Superadmin aktif terakhir di platform tidak boleh dinonaktifkan.
--     4. Admin aktif terakhir di sebuah lembaga tidak boleh dinonaktifkan.
--   Perubahan dari SQL Editor / service_role (auth.uid() kosong) tetap
--   diizinkan agar pemilik sistem bisa memperbaiki data darurat.
--
-- Rollback:
--   drop trigger if exists trg_guard_access_grants on public.access_grants;
--   drop function if exists public.fn_guard_access_grants();
-- =====================================================================

begin;

create or replace function public.fn_guard_access_grants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_super boolean;
  v_old_active boolean;
  v_new_active boolean;
begin
  -- SQL Editor / service_role / proses sistem
  if v_actor is null then
    return coalesce(new, old);
  end if;

  v_is_super := public.is_super_admin();

  -- 1. Grant Superadmin hanya boleh disentuh Superadmin
  if not v_is_super then
    if (tg_op in ('UPDATE', 'DELETE') and old.role = 'superadmin')
       or (tg_op in ('INSERT', 'UPDATE') and new.role = 'superadmin') then
      raise exception 'Forbidden: Hanya Superadmin yang dapat mengelola akun Superadmin.'
        using errcode = '42501';
    end if;
  end if;

  -- 2. Tidak boleh mengubah akses milik sendiri
  if tg_op = 'DELETE' and old.user_id = v_actor then
    raise exception 'Forbidden: Anda tidak dapat menghapus akses milik sendiri.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.user_id = v_actor then
    if new.role is distinct from old.role then
      raise exception 'Forbidden: Anda tidak dapat mengubah peran akun sendiri.'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'invited' and new.status = 'active') then
      raise exception 'Forbidden: Anda tidak dapat menangguhkan atau mencabut akses akun sendiri.'
        using errcode = '42501';
    end if;
  end if;

  -- 3 & 4. Jangan sampai platform/lembaga kehilangan pengelola terakhir
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'active' then
    v_old_active := true;
    v_new_active := tg_op = 'UPDATE'
                    and new.status = 'active'
                    and new.role = old.role
                    and new.organization_id is not distinct from old.organization_id;

    if v_old_active and not v_new_active then
      if old.role = 'superadmin' and not exists (
        select 1 from public.access_grants g
        where g.role = 'superadmin' and g.status = 'active' and g.id <> old.id
      ) then
        raise exception 'Ditolak: ini Superadmin aktif terakhir. Tambahkan Superadmin lain terlebih dahulu.'
          using errcode = '42501';
      end if;

      if old.role = 'admin' and old.organization_id is not null and not exists (
        select 1 from public.access_grants g
        where g.role = 'admin' and g.status = 'active'
          and g.organization_id = old.organization_id and g.id <> old.id
      ) then
        raise exception 'Ditolak: ini Admin aktif terakhir di lembaga ini. Tambahkan Admin lain terlebih dahulu.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_guard_access_grants on public.access_grants;
create trigger trg_guard_access_grants
  before insert or update or delete on public.access_grants
  for each row execute function public.fn_guard_access_grants();

commit;
