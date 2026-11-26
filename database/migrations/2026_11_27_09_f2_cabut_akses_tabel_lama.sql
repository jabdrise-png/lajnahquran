-- =====================================================================
-- 2026_11_27_09_f2_cabut_akses_tabel_lama.sql
-- Fase 2 · butir 10
--
-- Tujuan:
--   Aplikasi tidak boleh lagi membaca/menulis tabel lama. Akses role API
--   (anon, authenticated) dicabut; data tetap disimpan sebagai arsip dan masih
--   bisa dibaca pemilik database (SQL Editor) serta fungsi f2_migrate_legacy_data.
--     setoran_harian, attendance, halaqah_santri, student_classes
--
-- Prasyarat: 2026_11_27_06 (data sudah dipindah) dan aplikasi versi Fase 2 sudah terpasang.
-- Rollback:
--   grant select, insert, update, delete on public.setoran_harian, public.attendance,
--     public.halaqah_santri, public.student_classes to authenticated;
-- =====================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array['setoran_harian', 'attendance', 'halaqah_santri', 'student_classes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('comment on table public.%I is %L', t,
        'ARSIP sejak Fase 2 (27-11-2026). Data sudah dipindah ke tabel V2; aplikasi tidak memakai tabel ini lagi.');
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
