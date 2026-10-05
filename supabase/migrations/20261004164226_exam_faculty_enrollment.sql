-- An exam owns one website/checkout and many existing faculties (communities).
alter table public.landing_sites add column exam_config jsonb not null default '{}'::jsonb
  check (jsonb_typeof(exam_config) = 'object');

create table public.landing_exam_faculties (
  exam_slug text not null references public.landing_sites(slug) on delete cascade,
  community_id uuid not null references public.communities(id) on delete restrict,
  position integer not null default 0 check (position >= 0),
  is_active boolean not null default true,
  primary key (exam_slug, community_id)
);
create index landing_exam_faculties_community_idx on public.landing_exam_faculties(community_id);

create table public.student_exam_enrollments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exam_slug text not null references public.landing_sites(slug) on delete restrict,
  community_id uuid not null references public.communities(id) on delete restrict,
  preparation_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(preparation_answers) = 'object'),
  selected_at timestamptz not null default now(),
  foreign key (exam_slug, community_id) references public.landing_exam_faculties(exam_slug, community_id) on delete restrict
);
create index student_exam_enrollments_exam_faculty_idx on public.student_exam_enrollments(exam_slug, community_id);
create index student_exam_enrollments_community_idx on public.student_exam_enrollments(community_id);

alter table public.landing_exam_faculties enable row level security;
alter table public.student_exam_enrollments enable row level security;
revoke all on public.landing_exam_faculties, public.student_exam_enrollments from public, anon, authenticated;
grant all on public.landing_exam_faculties, public.student_exam_enrollments to service_role;
grant select on public.student_exam_enrollments to authenticated;
create policy student_exam_enrollments_read_own on public.student_exam_enrollments
  for select to authenticated using ((select auth.uid()) = user_id);

alter table public.invoices add column exam_slug text references public.landing_sites(slug) on delete restrict;
alter table public.invoices add column exam_faculty_id uuid references public.communities(id) on delete restrict;
create index invoices_exam_slug_idx on public.invoices(exam_slug);
create index invoices_exam_faculty_idx on public.invoices(exam_faculty_id);

-- Exam setup and the faculty mapping change together. Removed faculties remain
-- as inactive historical links so existing students/invoices keep their scope.
create function public.configure_landing_exam(target_exam_slug text, configuration jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare faculty_slug text; faculty_id uuid; faculty_position integer := 0;
begin
  perform 1 from public.landing_sites where slug = target_exam_slug for update;
  if not found then raise exception 'Exam not found.' using errcode = 'P0002'; end if;
  if jsonb_typeof(configuration) <> 'object' or jsonb_typeof(configuration->'facultySlugs') <> 'array' then
    raise exception 'Invalid exam configuration.' using errcode = '22023';
  end if;
  update public.landing_exam_faculties set is_active = false where exam_slug = target_exam_slug;
  for faculty_slug in select jsonb_array_elements_text(configuration->'facultySlugs') loop
    select id into faculty_id from public.communities where slug = faculty_slug and status = 'active' and visibility = 'public';
    if not found then raise exception 'Choose an active public faculty.' using errcode = '22023'; end if;
    insert into public.landing_exam_faculties(exam_slug, community_id, position, is_active)
    values(target_exam_slug, faculty_id, faculty_position, true)
    on conflict(exam_slug, community_id) do update set position = excluded.position, is_active = true;
    faculty_position := faculty_position + 1;
  end loop;
  if coalesce((configuration->>'enabled')::boolean, false) and faculty_position = 0 then
    raise exception 'Choose at least one faculty.' using errcode = '22023';
  end if;
  update public.landing_sites set exam_config = configuration, updated_at = now() where slug = target_exam_slug;
end;
$$;

-- Serialized per student: choosing the faculty, ending prior membership access,
-- and joining the new faculty are a single transaction. Only the admin route
-- supplies allow_change; student clients cannot execute this function directly.
create function public.select_exam_faculty(target_user_id uuid, target_exam_slug text, target_community_id uuid,
  preparation_answers jsonb, allow_change boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare previous public.student_exam_enrollments%rowtype; previous_membership record; selected_course_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text, 731));
  select * into previous from public.student_exam_enrollments where user_id = target_user_id for update;
  if found then
    if previous.exam_slug = target_exam_slug and previous.community_id = target_community_id then return; end if;
    if not allow_change then raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001'; end if;
  end if;
  perform 1 from public.landing_exam_faculties f
    join public.landing_sites s on s.slug = f.exam_slug
    join public.communities c on c.id = f.community_id
    where f.exam_slug = target_exam_slug and f.community_id = target_community_id and f.is_active
      and s.status = 'live' and coalesce((s.exam_config->>'enabled')::boolean, false)
      and c.status = 'active' and c.visibility = 'public' for share of f, s, c;
  if not found then raise exception 'Unsupported faculty.' using errcode = '22023'; end if;
  if jsonb_typeof(preparation_answers) <> 'object' then raise exception 'Invalid answers.' using errcode = '22023'; end if;
  delete from public.student_exam_enrollments where user_id = target_user_id;
  for previous_membership in select m.community_id, c.study_course_id from public.community_memberships m
      join public.communities c on c.id = m.community_id
      where m.user_id = target_user_id and m.role = 'member' and m.status = 'active' and m.community_id <> target_community_id loop
    update public.community_memberships set status = 'left', left_at = now(), current_term_id = null where community_id = previous_membership.community_id and user_id = target_user_id;
    update public.teacher_course_enrollments set status = 'cancelled' where student_id = target_user_id
      and teacher_course_enrollments.course_id = previous_membership.study_course_id and status in ('active','completed');
  end loop;
  perform public.join_community(target_user_id, (select slug from public.communities where id = target_community_id));
  select study_course_id into selected_course_id from public.communities where id = target_community_id;
  if selected_course_id is not null then
    insert into public.teacher_course_enrollments(course_id,student_id,status) values(selected_course_id,target_user_id,'active')
      on conflict(course_id,student_id) do update set status = 'active';
  end if;
  insert into public.student_exam_enrollments(user_id,exam_slug,community_id,preparation_answers)
    values(target_user_id,target_exam_slug,target_community_id,preparation_answers);
end;
$$;

-- Existing join/leave RPCs and direct membership writes must honor the lock.
create function public.guard_exam_faculty_membership()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare locked_faculty uuid; member_user uuid;
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.community_id <> old.community_id) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.user_id::text, 731));
    if exists(select 1 from public.student_exam_enrollments where user_id = old.user_id and community_id = old.community_id) then
      raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001';
    end if;
  end if;
  member_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member_user::text, 731));
  select community_id into locked_faculty from public.student_exam_enrollments where user_id = member_user;
  if locked_faculty is not null then
    if tg_op = 'DELETE' and old.community_id = locked_faculty then
      -- Deleting the auth account must still be able to cascade its records.
      if not exists(select 1 from auth.users where id = old.user_id) then return old; end if;
      raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001';
    elsif tg_op <> 'DELETE' then
      if (new.role = 'member' and new.status = 'active' and new.community_id <> locked_faculty)
         or (new.community_id = locked_faculty and new.status <> 'active')
         or (tg_op = 'UPDATE' and old.community_id = locked_faculty and (new.community_id <> old.community_id or new.user_id <> old.user_id)) then
        raise exception 'Your faculty is locked. Contact an admin.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_exam_faculty_membership before insert or update or delete on public.community_memberships
  for each row execute function public.guard_exam_faculty_membership();

revoke all on function public.configure_landing_exam(text,jsonb), public.select_exam_faculty(uuid,text,uuid,jsonb,boolean), public.guard_exam_faculty_membership() from public,anon,authenticated;
grant execute on function public.configure_landing_exam(text,jsonb), public.select_exam_faculty(uuid,text,uuid,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';
