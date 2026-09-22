begin;

-- Marketing contact data is kept outside the general student profile. It is
-- only reachable with the service role, never by a browser session.
create table if not exists public.marketing_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  marketing_opt_in boolean not null default true,
  marketing_opted_in_at timestamptz not null default now(),
  marketing_opted_out_at timestamptz,
  consent_version text not null default 'signup-marketing-v1',
  source text not null default 'signup' check (source in ('signup', 'account-settings')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_contacts_consent_state_check check (
    (marketing_opt_in and marketing_opted_out_at is null)
    or (not marketing_opt_in and marketing_opted_out_at is not null)
  )
);

create index if not exists marketing_contacts_opted_in_idx
  on public.marketing_contacts (marketing_opted_in_at desc)
  where marketing_opt_in;

alter table public.marketing_contacts enable row level security;
revoke all on table public.marketing_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.marketing_contacts to service_role;

drop trigger if exists set_marketing_contacts_updated_at on public.marketing_contacts;
create trigger set_marketing_contacts_updated_at
before update on public.marketing_contacts
for each row execute procedure public.set_current_timestamp_updated_at();

-- Supabase creates auth users even when email confirmation is enabled. Keeping
-- this at the database boundary means an opted-in contact is not lost while
-- the account is waiting for its confirmation email.
create or replace function public.sync_signup_marketing_contact()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  submitted_phone text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'marketing_phone', '')), '');
  marketing_opt_in boolean := lower(coalesce(new.raw_user_meta_data ->> 'marketing_phone_marketing_opt_in', 'false'))
    in ('true', 't', '1', 'yes', 'on');
begin
  if tg_op = 'UPDATE' then
    if (old.raw_user_meta_data ->> 'marketing_phone') is not distinct from (new.raw_user_meta_data ->> 'marketing_phone')
      and (old.raw_user_meta_data ->> 'marketing_phone_marketing_opt_in') is not distinct from (new.raw_user_meta_data ->> 'marketing_phone_marketing_opt_in') then
      return new;
    end if;
  end if;

  if submitted_phone is not null and submitted_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'Marketing phone numbers must use E.164 format.';
  end if;

  if submitted_phone is null or not marketing_opt_in then
    update public.marketing_contacts
    set marketing_opt_in = false,
        marketing_opted_out_at = coalesce(marketing_opted_out_at, now())
    where user_id = new.id
      and public.marketing_contacts.marketing_opt_in;
    return new;
  end if;

  insert into public.marketing_contacts (
    user_id,
    phone_e164,
    marketing_opt_in,
    marketing_opted_in_at,
    marketing_opted_out_at,
    consent_version,
    source
  )
  values (
    new.id,
    submitted_phone,
    true,
    now(),
    null,
    'signup-marketing-v1',
    'signup'
  )
  on conflict (user_id) do update
  set phone_e164 = excluded.phone_e164,
      marketing_opt_in = true,
      marketing_opted_in_at = case
        when public.marketing_contacts.marketing_opt_in
          and public.marketing_contacts.phone_e164 = excluded.phone_e164
          then public.marketing_contacts.marketing_opted_in_at
        else excluded.marketing_opted_in_at
      end,
      marketing_opted_out_at = null,
      consent_version = excluded.consent_version,
      source = excluded.source;

  return new;
end;
$$;

revoke all on function public.sync_signup_marketing_contact() from public, anon, authenticated;

drop trigger if exists sync_signup_marketing_contact on auth.users;
create trigger sync_signup_marketing_contact
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_signup_marketing_contact();

comment on table public.marketing_contacts is
  'Opted-in phone contacts for marketing. Query only with service_role and filter marketing_opt_in = true.';

notify pgrst, 'reload schema';

commit;
