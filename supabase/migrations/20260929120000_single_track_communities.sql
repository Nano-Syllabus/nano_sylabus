-- Entrance and License faculties are ONE track: no years, no semesters.
--
-- The create form has enforced that since 2026-09-28 (1 year, 1 term), but
-- faculties created before it still carry a degree's layout — "4 years · 8
-- semesters" — so their students were asked to pick a "Running Semester" that
-- means nothing for an entrance exam, and saw only one term's subjects.
--
-- This folds each such faculty into its first term: every subject moves there,
-- members point there, the other terms go, and the counts become 1 and 1.
-- A subject whose slug is already taken in the first term gets the old term's
-- number appended, so nothing is lost to the (term_id, slug) unique key.
-- Idempotent: a faculty already at one term is left alone.

do $$
declare
  faculty record;
  keep_term uuid;
begin
  for faculty in
    select c.id
    from public.communities c
    where c.level in ('Entrance', 'License')
      and (c.total_semesters > 1 or c.total_years > 1
           or (select count(*) from public.community_terms t where t.community_id = c.id) > 1)
  loop
    select t.id into keep_term
    from public.community_terms t
    where t.community_id = faculty.id
    order by t.position
    limit 1;

    if keep_term is null then
      continue;
    end if;

    -- Subjects: keep their order (term first, then their own position).
    with moving as (
      select s.id,
             t.semester_number,
             row_number() over (order by t.position, s.position, s.created_at) - 1 as new_position,
             -- 1 for the subject that keeps its slug: the first term's own, else the earliest.
             row_number() over (
               partition by s.slug order by (s.term_id = keep_term) desc, t.position, s.created_at
             ) as slug_rank
      from public.community_subjects s
      join public.community_terms t on t.id = s.term_id
      where s.community_id = faculty.id
    )
    update public.community_subjects s
    set term_id = keep_term,
        position = moving.new_position,
        slug = case
          when moving.slug_rank > 1 then left(s.slug, 64) || '-' || moving.semester_number
          else s.slug
        end
    from moving
    where s.id = moving.id;

    update public.community_memberships
    set current_term_id = keep_term
    where community_id = faculty.id
      and current_term_id is distinct from keep_term;

    delete from public.community_terms
    where community_id = faculty.id and id <> keep_term;

    update public.community_terms
    set year_number = 1, semester_number = 1, semester_in_year = 1, position = 0
    where id = keep_term;

    update public.communities
    set total_years = 1, total_semesters = 1, updated_at = now()
    where id = faculty.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
