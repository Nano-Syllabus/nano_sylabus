-- The level a faculty prepares students for, chosen by its creator.
--
--   +2 | Bachelor | Master | Entrance | License
--
-- Until now Browse guessed it from the name ("MBA" → Master), which could not
-- tell an entrance or licence-prep faculty from a degree. Existing rows are
-- backfilled with that same guess once, below; creators set it from here on.
-- The app tolerates this column being absent, so the order of deploy and
-- migration does not matter.

alter table public.communities
  add column if not exists level text;

alter table public.communities
  drop constraint if exists communities_level_check;
alter table public.communities
  add constraint communities_level_check
  check (level is null or level in ('+2', 'Bachelor', 'Master', 'Entrance', 'License'));

update public.communities
set level = case
  when lower(name || ' ' || faculty) ~ '(licen[cs]e|liscen[cs]e)' then 'License'
  when lower(name || ' ' || faculty) like '%entrance%' then 'Entrance'
  when lower(name || ' ' || faculty) ~ '(\+2|plus two|\mneb\M|\m1[12]\M)' then '+2'
  when lower(name || ' ' || faculty) ~ '(master|\mmsc\M|\mmba\M)' then 'Master'
  else 'Bachelor'
end
where level is null;

comment on column public.communities.level is
  'What the faculty prepares students for: +2 | Bachelor | Master | Entrance | License.';

notify pgrst, 'reload schema';
