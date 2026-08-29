begin;

-- Admin authority must survive an auth account being deleted and recreated.
-- The allowlist is database-owned and is never readable or writable from a
-- browser session; an email in user metadata is deliberately not trusted.
create table if not exists public.platform_admin_identities (
  email text primary key check (email = lower(btrim(email))),
  created_at timestamptz not null default now()
);

alter table public.platform_admin_identities enable row level security;
revoke all on public.platform_admin_identities from public, anon, authenticated;
grant select on public.platform_admin_identities to service_role;

insert into public.platform_admin_identities (email)
values ('theshumanhere@gmail.com')
on conflict (email) do nothing;

create or replace function public.sync_platform_admin_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized_email text := lower(btrim(coalesce(new.email, '')));
begin
  if exists (
    select 1
    from public.platform_admin_identities trusted
    where trusted.email = normalized_email
  ) then
    insert into public.student_profiles (user_id, full_name, role)
    values (
      new.id,
      coalesce(
        nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data->>'name'), ''),
        nullif(split_part(normalized_email, '@', 1), ''),
        'Admin'
      ),
      'super_admin'
    )
    on conflict (user_id) do update
      set role = 'super_admin';
  elsif tg_op = 'UPDATE'
    and lower(btrim(coalesce(old.email, ''))) <> normalized_email
    and exists (
      select 1
      from public.platform_admin_identities trusted
      where trusted.email = lower(btrim(coalesce(old.email, '')))
    ) then
    update public.student_profiles
    set role = 'student'
    where user_id = new.id
      and role = 'super_admin';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_platform_admin_identity() from public, anon, authenticated;

drop trigger if exists sync_platform_admin_identity on auth.users;
create trigger sync_platform_admin_identity
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_platform_admin_identity();

-- Repair existing accounts as part of the same migration, including an admin
-- account that was recreated before this migration was installed.
insert into public.student_profiles (user_id, full_name, role)
select
  account.id,
  coalesce(
    nullif(btrim(account.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(account.raw_user_meta_data->>'name'), ''),
    nullif(split_part(lower(account.email), '@', 1), ''),
    'Admin'
  ),
  'super_admin'
from auth.users account
join public.platform_admin_identities trusted
  on trusted.email = lower(btrim(account.email))
on conflict (user_id) do update
  set role = 'super_admin';

notify pgrst, 'reload schema';

commit;
