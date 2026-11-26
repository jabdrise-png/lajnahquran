-- =====================================================================
-- 2026_11_27_08_f2_hapus_kolom_kembar.sql
-- Fase 2 · butir 4
--
-- Tujuan:
--   recitation_entries punya pasangan kolom dengan arti sama. Yang dipertahankan:
--     santri_id, recitation_date, surah_start_no, ayah_start, surah_end_no, ayah_end,
--     calculated_pages, major_mistakes, minor_mistakes
--   Yang dihapus (isinya sudah dipindah di 2026_11_27_05):
--     student_id, entry_date, start_surah, end_surah, start_ayah, end_ayah,
--     pages, mistakes_major, mistakes_minor
--
-- Prasyarat: 2026_11_27_05 dan 2026_11_27_07 (tidak ada fungsi yang memakai kolom ini lagi)
-- Rollback:
--   alter table public.recitation_entries
--     add column student_id bigint, add column entry_date date, add column start_surah text,
--     add column end_surah text, add column start_ayah int, add column end_ayah int,
--     add column pages numeric, add column mistakes_major int not null default 0,
--     add column mistakes_minor int not null default 0;
--   update public.recitation_entries set student_id = santri_id, entry_date = recitation_date,
--     start_ayah = ayah_start, end_ayah = ayah_end, pages = calculated_pages,
--     mistakes_major = major_mistakes, mistakes_minor = minor_mistakes;
-- =====================================================================

begin;

-- Isi terakhir kali (bila ada baris baru di sela migrasi)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'recitation_entries' and column_name = 'student_id') then
    execute 'update public.recitation_entries set santri_id = student_id where santri_id is null and student_id is not null';
    execute 'update public.recitation_entries set major_mistakes = mistakes_major where coalesce(major_mistakes, 0) = 0 and coalesce(mistakes_major, 0) <> 0';
    execute 'update public.recitation_entries set minor_mistakes = mistakes_minor where coalesce(minor_mistakes, 0) = 0 and coalesce(mistakes_minor, 0) <> 0';
    execute 'update public.recitation_entries set calculated_pages = pages where coalesce(calculated_pages, 0) = 0 and coalesce(pages, 0) <> 0';
  end if;
end;
$$;

drop index if exists public.idx_recitation_entries_student;

alter table public.recitation_entries
  drop column if exists student_id,
  drop column if exists entry_date,
  drop column if exists start_surah,
  drop column if exists end_surah,
  drop column if exists start_ayah,
  drop column if exists end_ayah,
  drop column if exists pages,
  drop column if exists mistakes_major,
  drop column if exists mistakes_minor;

alter table public.recitation_entries alter column santri_id set not null;

-- Indeks unik ganda untuk legacy_setoran_id: cukup satu
drop index if exists public.idx_recitation_entries_legacy_setoran_uniq;

notify pgrst, 'reload schema';

commit;
