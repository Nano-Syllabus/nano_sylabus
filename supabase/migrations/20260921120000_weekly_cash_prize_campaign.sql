-- The weekly streak campaign, which replaces the daily lottery on the student's
-- Cash Prize page.
--
-- THE RULES, AS THE PAGE STATES THEM
--   * A 7-day challenge streak qualifies a student for that week's Friday draw.
--   * The student confirms participation; the entry is registered here.
--   * Every 5 verified referrals puts their name on the wheel once more.
--   * This week's draw is for BCT students only.
--
-- NOTHING HERE IS DECIDED BY THE BROWSER. Rows are written only by the server
-- (`lib/data/cash-prize-weekly.ts`, service role), which recomputes eligibility
-- from `student_challenges`, community membership and referral claims at the
-- moment of confirmation. Authenticated users have no insert or update policy,
-- so a crafted request cannot award itself entries. Admins read the rows to run
-- the draw, weighting each student by `entries`.
--
-- The daily table (`cash_prize_daily_entries`) and its trigger are left as they
-- are: harmless, and reversible if the daily lottery is ever wanted back.

create table if not exists public.cash_prize_weekly_entries (
  id uuid primary key default gen_random_uuid(),
  -- The Nepal-calendar Friday whose draw this entry is for.
  draw_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  student_email text not null,
  -- Snapshots at confirmation, so the draw can be audited against what
  -- qualified the student at the time, not what their profile says later.
  streak_days integer not null check (streak_days >= 7),
  referral_count integer not null default 0 check (referral_count >= 0),
  entries integer not null check (entries >= 1),
  -- The community that made them eligible. Not a foreign key: a community
  -- deleted after the draw must not take its winners' entries with it.
  community_id uuid,
  confirmed_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draw_date, user_id),
  check (extract(isodow from draw_date) = 5)
);

create index if not exists cash_prize_weekly_entries_draw_idx
  on public.cash_prize_weekly_entries (draw_date desc, confirmed_at asc);

alter table public.cash_prize_weekly_entries enable row level security;

drop policy if exists cash_prize_weekly_entries_admin_select
  on public.cash_prize_weekly_entries;
create policy cash_prize_weekly_entries_admin_select
  on public.cash_prize_weekly_entries
  for select
  to authenticated
  using (public.is_admin());

revoke all on public.cash_prize_weekly_entries from anon, authenticated;
grant select on public.cash_prize_weekly_entries to authenticated;

-- REFERRAL LINKS FOR EVERY STUDENT
--
-- Until now a referral link could only be created, or claimed, while its owner
-- held an active paid Pro subscription. The campaign counts referrals for every
-- student, so both gates come off here.
--
-- The BILLING reward is untouched: `qualify_billing_referral_from_subscription`
-- still checks the referrer's paid Pro status when the referred account pays,
-- and voids the claim otherwise. A free student's link therefore counts toward
-- their campaign entries and never mints free Pro time.

create or replace function public.create_billing_referral_link(target_user_id uuid)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  link_record public.billing_referral_links%rowtype;
begin
  if auth.uid() is null or auth.uid() <> target_user_id then
    raise exception 'You can only create your own referral link.' using errcode = '42501';
  end if;

  insert into public.billing_referral_links (referrer_id)
  values (target_user_id)
  on conflict (referrer_id) do update set active = true
  returning * into link_record;

  return query select link_record.id, link_record.code;
end;
$$;

create or replace function public.claim_billing_referral(target_code text, target_user_id uuid)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  link_record public.billing_referral_links%rowtype;
  claim_record public.billing_referral_claims%rowtype;
begin
  if auth.uid() is null or auth.uid() <> target_user_id then
    raise exception 'You can only claim a referral for your own account.' using errcode = '42501';
  end if;

  select * into link_record
  from public.billing_referral_links
  where code = upper(trim(target_code)) and active = true
  for update;

  if not found then
    raise exception 'Referral link not found or inactive.' using errcode = 'P0002';
  end if;
  if link_record.referrer_id = target_user_id then
    raise exception 'You cannot claim your own referral link.' using errcode = 'P0001';
  end if;

  select * into claim_record
  from public.billing_referral_claims
  where referred_user_id = target_user_id
  for update;

  if found then
    if claim_record.link_id <> link_record.id then
      raise exception 'This account has already claimed a referral link.' using errcode = '23505';
    end if;
    return query select claim_record.id, claim_record.status;
    return;
  end if;

  insert into public.billing_referral_claims (link_id, referred_user_id)
  values (link_record.id, target_user_id)
  returning * into claim_record;

  return query select claim_record.id, claim_record.status;
end;
$$;

revoke all on function public.create_billing_referral_link(uuid) from public;
grant execute on function public.create_billing_referral_link(uuid) to authenticated;
revoke all on function public.claim_billing_referral(text, uuid) from public;
grant execute on function public.claim_billing_referral(text, uuid) to authenticated;

notify pgrst, 'reload schema';
