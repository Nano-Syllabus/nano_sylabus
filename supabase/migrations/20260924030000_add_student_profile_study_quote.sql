begin;

alter table public.student_profiles
  add column if not exists study_quote text;

alter table public.student_profiles
  drop constraint if exists student_profiles_study_quote_length;

alter table public.student_profiles
  add constraint student_profiles_study_quote_length
  check (study_quote is null or char_length(study_quote) between 1 and 140);

notify pgrst, 'reload schema';

commit;
