-- Real peer referrals. A link is reusable by a referrer, while each referred
-- account can claim only one link and each claim can issue each reward once.

create table if not exists public.billing_referral_links (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_referral_claims (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.billing_referral_links(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'claimed'
    check (status in ('claimed', 'qualified', 'rewarded', 'void')),
  claimed_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualified_invoice_id uuid references public.invoices(id) on delete set null,
  reward_days integer not null default 30 check (reward_days > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists billing_referral_claims_link_user_idx
  on public.billing_referral_claims(link_id, referred_user_id);

create table if not exists public.billing_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.billing_referral_claims(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  reward_days integer not null check (reward_days > 0),
  created_at timestamptz not null default now(),
  unique (claim_id, recipient_id)
);

create index if not exists billing_referral_claims_status_idx
  on public.billing_referral_claims(status, claimed_at desc);

alter table public.billing_referral_links enable row level security;
alter table public.billing_referral_claims enable row level security;
alter table public.billing_referral_rewards enable row level security;

drop policy if exists billing_referral_links_select_own on public.billing_referral_links;
create policy billing_referral_links_select_own
on public.billing_referral_links for select to authenticated
using (referrer_id = auth.uid() or public.is_admin());

drop policy if exists billing_referral_claims_select_participant on public.billing_referral_claims;
create policy billing_referral_claims_select_participant
on public.billing_referral_claims for select to authenticated
using (
  referred_user_id = auth.uid()
  or exists (
    select 1 from public.billing_referral_links link
    where link.id = link_id and link.referrer_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists billing_referral_rewards_select_recipient on public.billing_referral_rewards;
create policy billing_referral_rewards_select_recipient
on public.billing_referral_rewards for select to authenticated
using (recipient_id = auth.uid() or public.is_admin());

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

create or replace function public.issue_billing_referral_reward(
  target_claim_id uuid,
  target_recipient_id uuid,
  target_reward_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reward_plan public.subscription_plans%rowtype;
  active_subscription public.user_subscriptions%rowtype;
  reward_subscription_id uuid;
  prior_subscription_id uuid;
begin
  select subscription_id into prior_subscription_id
  from public.billing_referral_rewards
  where claim_id = target_claim_id and recipient_id = target_recipient_id;
  if found then
    return prior_subscription_id;
  end if;

  -- Rewards are real access: use the active monthly unlimited plan already
  -- configured by billing, never a synthetic plan or a UI-only entitlement.
  select * into reward_plan
  from public.subscription_plans
  where is_active = true
    and is_unlimited = true
    and billing_type = 'monthly'
  order by case when product_type = 'individual' then 0 else 1 end, price asc
  limit 1;

  if not found then
    return null;
  end if;

  select * into active_subscription
  from public.user_subscriptions
  where user_id = target_recipient_id
    and plan_id = reward_plan.id
    and status = 'active'
    and (ends_at is null or ends_at > now())
  order by ends_at desc nulls last
  limit 1
  for update;

  if found then
    reward_subscription_id := active_subscription.id;
    update public.user_subscriptions
    set ends_at = case
      when ends_at is null then null
      else ends_at + make_interval(days => target_reward_days)
    end
    where id = active_subscription.id;
  else
    insert into public.user_subscriptions (user_id, plan_id, invoice_id, status, starts_at, ends_at)
    values (
      target_recipient_id,
      reward_plan.id,
      null,
      'active',
      now(),
      now() + make_interval(days => target_reward_days)
    )
    returning id into reward_subscription_id;
  end if;

  insert into public.billing_referral_rewards (
    claim_id, recipient_id, subscription_id, reward_days
  ) values (
    target_claim_id, target_recipient_id, reward_subscription_id, target_reward_days
  ) on conflict (claim_id, recipient_id) do nothing;

  return reward_subscription_id;
end;
$$;

create or replace function public.qualify_billing_referral_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_record public.subscription_plans%rowtype;
  claim_record public.billing_referral_claims%rowtype;
  link_record public.billing_referral_links%rowtype;
  referrer_subscription_id uuid;
  referred_subscription_id uuid;
begin
  if new.status <> 'active' or new.invoice_id is null then
    return new;
  end if;

  select * into plan_record from public.subscription_plans where id = new.plan_id;
  if not found or not plan_record.is_unlimited or plan_record.billing_type <> 'monthly' then
    return new;
  end if;

  select claim.* into claim_record
  from public.billing_referral_claims claim
  where claim.referred_user_id = new.user_id
    and claim.status = 'claimed'
  order by claim.claimed_at asc
  limit 1
  for update;

  if not found then
    return new;
  end if;

  select * into link_record from public.billing_referral_links where id = claim_record.link_id;

  update public.billing_referral_claims
  set status = 'qualified', qualified_at = now(), qualified_invoice_id = new.invoice_id
  where id = claim_record.id;

  referred_subscription_id := public.issue_billing_referral_reward(
    claim_record.id, claim_record.referred_user_id, claim_record.reward_days
  );
  referrer_subscription_id := public.issue_billing_referral_reward(
    claim_record.id, link_record.referrer_id, claim_record.reward_days
  );

  if referred_subscription_id is not null and referrer_subscription_id is not null then
    update public.billing_referral_claims set status = 'rewarded' where id = claim_record.id;
  end if;

  return new;
end;
$$;

drop trigger if exists billing_referral_paid_subscription_trigger on public.user_subscriptions;
create trigger billing_referral_paid_subscription_trigger
after insert on public.user_subscriptions
for each row execute function public.qualify_billing_referral_from_subscription();

revoke all on function public.create_billing_referral_link(uuid) from public;
grant execute on function public.create_billing_referral_link(uuid) to authenticated;
revoke all on function public.claim_billing_referral(text, uuid) from public;
grant execute on function public.claim_billing_referral(text, uuid) to authenticated;
revoke all on function public.issue_billing_referral_reward(uuid, uuid, integer) from public;
revoke all on function public.qualify_billing_referral_from_subscription() from public;

notify pgrst, 'reload schema';
