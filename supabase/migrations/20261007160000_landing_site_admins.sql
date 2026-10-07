-- An admin runs exactly one subdomain site, and a site has at most one admin
-- (user, 2026-10-07). The admin may move between that site's supported
-- faculties (landing_exam_faculties); a super admin may go anywhere and has no
-- row here. The primary key makes a site's admin unique, the unique user_id
-- makes an admin's site unique. Only the service role touches this table.
create table public.landing_site_admins (
  site_slug text primary key references public.landing_sites(slug) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);

alter table public.landing_site_admins enable row level security;
revoke all on public.landing_site_admins from public, anon, authenticated;
grant all on public.landing_site_admins to service_role;

-- Only an `admin` can hold a site.
create function public.guard_landing_site_admin()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.student_profiles where user_id = new.user_id and role = 'admin') then
    raise exception 'Only an admin can run a subdomain site.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger guard_landing_site_admin before insert or update on public.landing_site_admins
  for each row execute function public.guard_landing_site_admin();

-- Leaving the admin role (to student or super admin) frees the site.
create function public.release_landing_site_on_role_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.role is distinct from 'admin' then
    delete from public.landing_site_admins where user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger release_landing_site_on_role_change after update of role on public.student_profiles
  for each row when (old.role is distinct from new.role)
  execute function public.release_landing_site_on_role_change();

revoke all on function public.guard_landing_site_admin(), public.release_landing_site_on_role_change()
  from public, anon, authenticated;
notify pgrst, 'reload schema';
