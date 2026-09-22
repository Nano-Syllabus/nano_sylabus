begin;

alter table public.student_profiles
  add column if not exists phone_number text;

create or replace function public.sync_signup_phone_number()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  submitted_phone text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
begin
  if submitted_phone is null then
    return new;
  end if;

  if submitted_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Phone numbers must use E.164 format.';
  end if;

  insert into public.student_profiles (user_id, full_name, phone_number)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(lower(new.email), '@', 1), ''),
      'Student'
    ),
    submitted_phone
  )
  on conflict (user_id) do update
  set phone_number = excluded.phone_number;

  return new;
end;
$$;

revoke all on function public.sync_signup_phone_number() from public, anon, authenticated;

drop trigger if exists sync_signup_phone_number on auth.users;
create trigger sync_signup_phone_number
after insert or update of raw_user_meta_data on auth.users
for each row
execute function public.sync_signup_phone_number();

notify pgrst, 'reload schema';

commit;
