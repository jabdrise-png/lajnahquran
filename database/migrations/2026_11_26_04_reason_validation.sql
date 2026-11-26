-- =====================================================================
-- 2026_11_26_04_reason_validation.sql
-- Fase 1 · BUG-07 / BUG-08
--
-- Tujuan:
--   Validasi alasan dilakukan di server, bukan hanya di layar.
--   Dipasang sebagai trigger tabel sehingga berlaku walaupun fungsi RPC di
--   database berbeda versi dengan repositori (schema drift).
--
--   Aturan "alasan jelas" (fn_alasan_valid):
--     - minimal N karakter setelah spasi depan/belakang dibuang
--     - memuat minimal 3 huruf
--     - bukan satu karakter yang diulang (mis. "aaaaa", ".....")
--
--   Dipakai untuk:
--     - report_cards.amendment_reason saat amandemen (parent_report_card_id terisi): min 5
--     - support_access_sessions.reason: min 10 dan minimal 2 kata
--
-- Rollback:
--   drop trigger if exists trg_validate_report_card_reason on public.report_cards;
--   drop trigger if exists trg_validate_support_session_reason on public.support_access_sessions;
--   drop function if exists public.fn_validate_report_card_reason();
--   drop function if exists public.fn_validate_support_session_reason();
--   drop function if exists public.fn_alasan_valid(text, integer);
-- =====================================================================

begin;

create or replace function public.fn_alasan_valid(p_text text, p_min integer default 5)
returns boolean
language sql
immutable
as $$
  select
    coalesce(length(btrim(p_text)), 0) >= p_min
    and length(regexp_replace(coalesce(p_text, ''), '[^[:alpha:]]', '', 'g')) >= 3
    and btrim(p_text) !~ '^(.)\1*$';
$$;

-- ---------------------------------------------------------------------
-- Amandemen raport (BUG-07)
-- ---------------------------------------------------------------------
create or replace function public.fn_validate_report_card_reason()
returns trigger
language plpgsql
as $$
begin
  if new.parent_report_card_id is not null
     and not public.fn_alasan_valid(new.amendment_reason, 5) then
    raise exception 'Alasan revisi raport wajib diisi dengan jelas (minimal 5 karakter).'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.report_cards') is not null then
    execute 'drop trigger if exists trg_validate_report_card_reason on public.report_cards';
    execute 'create trigger trg_validate_report_card_reason
               before insert or update of amendment_reason, parent_report_card_id
               on public.report_cards
               for each row execute function public.fn_validate_report_card_reason()';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Support Access Session (BUG-08)
-- ---------------------------------------------------------------------
create or replace function public.fn_validate_support_session_reason()
returns trigger
language plpgsql
as $$
begin
  if not public.fn_alasan_valid(new.reason, 10)
     or array_length(regexp_split_to_array(btrim(new.reason), '\s+'), 1) < 2 then
    raise exception 'Alasan Support Access wajib jelas: minimal 10 karakter dan 2 kata (contoh: "Bantu admin cek absensi").'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.support_access_sessions') is not null then
    execute 'drop trigger if exists trg_validate_support_session_reason on public.support_access_sessions';
    execute 'create trigger trg_validate_support_session_reason
               before insert on public.support_access_sessions
               for each row execute function public.fn_validate_support_session_reason()';
  end if;
end;
$$;

commit;
