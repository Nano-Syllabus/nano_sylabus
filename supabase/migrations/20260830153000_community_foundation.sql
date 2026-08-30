-- Community-first academic structure. This is intentionally additive: the
-- existing teacher course system remains available while community discovery
-- and enrollment move to this model.

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 3 and 120),
  university text not null check (char_length(trim(university)) between 2 and 160),
  faculty text not null check (char_length(trim(faculty)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 1200),
  total_years smallint not null check (total_years between 1 and 10),
  total_semesters smallint not null check (total_semesters between total_years and total_years * 4),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  status text not null default 'active' check (status in ('active', 'archived')),
  contribution_threshold smallint not null default 10 check (contribution_threshold between 1 and 100),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists communities_public_idx
  on public.communities (created_at desc)
  where status = 'active' and visibility = 'public';

create index if not exists communities_creator_idx
  on public.communities (creator_id, updated_at desc);

create table if not exists public.community_terms (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  year_number smallint not null check (year_number > 0),
  semester_number smallint not null check (semester_number > 0),
  semester_in_year smallint not null check (semester_in_year > 0),
  position smallint not null check (position >= 0),
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (id, community_id),
  unique (community_id, semester_number),
  unique (community_id, position)
);

create index if not exists community_terms_structure_idx
  on public.community_terms (community_id, year_number, semester_number);

create table if not exists public.community_subjects (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  term_id uuid not null references public.community_terms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  code text not null default '' check (char_length(code) <= 40),
  description text not null default '' check (char_length(description) <= 800),
  position integer not null default 0 check (position >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (term_id, slug),
  unique (id, community_id),
  constraint community_subject_term_scope_fk foreign key (term_id, community_id)
    references public.community_terms(id, community_id) on delete cascade
);

create index if not exists community_subjects_term_idx
  on public.community_subjects (term_id, position, created_at);

create table if not exists public.community_memberships (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('creator', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default timezone('utc'::text, now()),
  left_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (community_id, user_id)
);

create index if not exists community_memberships_user_idx
  on public.community_memberships (user_id, status, joined_at desc);

create index if not exists community_memberships_count_idx
  on public.community_memberships (community_id)
  where status = 'active';

create or replace function public.set_community_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists communities_set_updated_at on public.communities;
create trigger communities_set_updated_at
before update on public.communities
for each row execute function public.set_community_updated_at();

drop trigger if exists community_subjects_set_updated_at on public.community_subjects;
create trigger community_subjects_set_updated_at
before update on public.community_subjects
for each row execute function public.set_community_updated_at();

drop trigger if exists community_memberships_set_updated_at on public.community_memberships;
create trigger community_memberships_set_updated_at
before update on public.community_memberships
for each row execute function public.set_community_updated_at();

-- Creates the community, its generated terms, and the creator membership in a
-- single transaction. Any failure rolls the whole operation back.
create or replace function public.create_community_with_terms(
  target_creator_id uuid,
  target_slug text,
  target_name text,
  target_university text,
  target_faculty text,
  target_description text,
  target_total_years integer,
  target_total_semesters integer,
  target_visibility text default 'public'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_community_id uuid;
begin
  if target_creator_id is null then
    raise exception 'A creator is required.' using errcode = '22023';
  end if;
  if target_total_years < 1 or target_total_years > 10 then
    raise exception 'Total years must be between 1 and 10.' using errcode = '22023';
  end if;
  if target_total_semesters < target_total_years
    or target_total_semesters > target_total_years * 4 then
    raise exception 'Total semesters must be between the year count and four per year.'
      using errcode = '22023';
  end if;

  insert into public.communities (
    creator_id,
    slug,
    name,
    university,
    faculty,
    description,
    total_years,
    total_semesters,
    visibility
  ) values (
    target_creator_id,
    target_slug,
    trim(target_name),
    trim(target_university),
    trim(target_faculty),
    trim(coalesce(target_description, '')),
    target_total_years,
    target_total_semesters,
    target_visibility
  )
  returning id into created_community_id;

  with generated as (
    select
      semester_number,
      floor((semester_number - 1)::numeric * target_total_years / target_total_semesters)::integer + 1
        as year_number
    from generate_series(1, target_total_semesters) as semester_number
  ), numbered as (
    select
      semester_number,
      year_number,
      row_number() over (partition by year_number order by semester_number)::integer as semester_in_year
    from generated
  )
  insert into public.community_terms (
    community_id,
    year_number,
    semester_number,
    semester_in_year,
    position
  )
  select
    created_community_id,
    year_number,
    semester_number,
    semester_in_year,
    semester_number - 1
  from numbered
  order by semester_number;

  insert into public.community_memberships (community_id, user_id, role, status)
  values (created_community_id, target_creator_id, 'creator', 'active');

  return created_community_id;
end;
$$;

-- Joining is idempotent and reactivates a membership that was previously left.
create or replace function public.join_community(
  target_user_id uuid,
  target_community_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_community public.communities%rowtype;
begin
  select * into matched_community
  from public.communities
  where slug = target_community_slug;

  if matched_community.id is null then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if matched_community.status <> 'active' or matched_community.visibility <> 'public' then
    raise exception 'This community is not open to new members.' using errcode = '42501';
  end if;

  insert into public.community_memberships (
    community_id,
    user_id,
    role,
    status,
    joined_at,
    left_at
  ) values (
    matched_community.id,
    target_user_id,
    case when matched_community.creator_id = target_user_id then 'creator' else 'member' end,
    'active',
    timezone('utc'::text, now()),
    null
  )
  on conflict (community_id, user_id) do update
  set
    role = case
      when matched_community.creator_id = excluded.user_id then 'creator'
      else community_memberships.role
    end,
    status = 'active',
    left_at = null,
    updated_at = timezone('utc'::text, now());

  return matched_community.id;
end;
$$;

revoke all on function public.create_community_with_terms(uuid, text, text, text, text, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.join_community(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_community_with_terms(uuid, text, text, text, text, text, integer, integer, text)
  to service_role;
grant execute on function public.join_community(uuid, text)
  to service_role;

alter table public.communities enable row level security;
alter table public.community_terms enable row level security;
alter table public.community_subjects enable row level security;
alter table public.community_memberships enable row level security;

drop policy if exists communities_select_accessible on public.communities;
create policy communities_select_accessible
  on public.communities for select
  using (
    (status = 'active' and visibility = 'public')
    or creator_id = auth.uid()
  );

drop policy if exists community_terms_select_accessible on public.community_terms;
create policy community_terms_select_accessible
  on public.community_terms for select
  using (
    exists (
      select 1 from public.communities community
      where community.id = community_id
        and (
          (community.status = 'active' and community.visibility = 'public')
          or community.creator_id = auth.uid()
        )
    )
  );

drop policy if exists community_subjects_select_accessible on public.community_subjects;
create policy community_subjects_select_accessible
  on public.community_subjects for select
  using (
    exists (
      select 1 from public.communities community
      where community.id = community_id
        and (
          (community.status = 'active' and community.visibility = 'public')
          or community.creator_id = auth.uid()
        )
    )
  );

drop policy if exists community_memberships_select_own on public.community_memberships;
create policy community_memberships_select_own
  on public.community_memberships for select
  using (user_id = auth.uid());
