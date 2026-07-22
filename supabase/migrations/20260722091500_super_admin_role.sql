alter table public.student_profiles
  drop constraint if exists student_profiles_role_check;

alter table public.student_profiles
  add constraint student_profiles_role_check
  check (role in ('student', 'admin', 'super_admin'));

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1
    from public.student_profiles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
end;
$$;

insert into public.student_profiles (user_id, full_name, role)
select id, coalesce(raw_user_meta_data->>'full_name', email), 'super_admin'
from auth.users
where email = 'theshumanhere@gmail.com'
on conflict (user_id) do update
set role = 'super_admin';
