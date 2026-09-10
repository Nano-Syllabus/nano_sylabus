-- A referral is valid only while its owner has an active, paid Individual Pro
-- subscription. Rewards are issued only after the referred account's paid
-- Individual Pro subscription is activated by an approved invoice.

create or replace function public.has_active_paid_pro_subscription(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_subscriptions subscription
    join public.subscription_plans plan on plan.id = subscription.plan_id
    join public.invoices invoice on invoice.id = subscription.invoice_id
    where subscription.user_id = target_user_id
      and subscription.status = 'active'
      and subscription.ends_at is not null
      and subscription.ends_at > now()
      and invoice.status = 'paid'
      and plan.product_type = 'individual'
      and plan.is_unlimited = true
      and plan.billing_type = 'monthly'
  );
$$;

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

  if not public.has_active_paid_pro_subscription(target_user_id) then
    raise exception 'An active paid Pro subscription is required to create a referral link.' using errcode = 'P0001';
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
  if not public.has_active_paid_pro_subscription(link_record.referrer_id) then
    raise exception 'This referral is unavailable because its owner does not have an active paid Pro subscription.' using errcode = 'P0001';
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
  active_subscription public.user_subscriptions%rowtype;
  prior_subscription_id uuid;
begin
  select subscription_id into prior_subscription_id
  from public.billing_referral_rewards
  where claim_id = target_claim_id and recipient_id = target_recipient_id;
  if found then
    return prior_subscription_id;
  end if;

  -- Referral time is an extension of real paid Pro access. Never create a
  -- synthetic free subscription when the recipient is not eligible.
  select subscription.* into active_subscription
  from public.user_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  join public.invoices invoice on invoice.id = subscription.invoice_id
  where subscription.user_id = target_recipient_id
    and subscription.status = 'active'
    and subscription.ends_at is not null
    and subscription.ends_at > now()
    and invoice.status = 'paid'
    and plan.product_type = 'individual'
    and plan.is_unlimited = true
    and plan.billing_type = 'monthly'
  order by subscription.ends_at desc
  limit 1
  for update of subscription;

  if not found then
    return null;
  end if;

  update public.user_subscriptions
  set ends_at = ends_at + make_interval(days => target_reward_days)
  where id = active_subscription.id;

  insert into public.billing_referral_rewards (
    claim_id, recipient_id, subscription_id, reward_days
  ) values (
    target_claim_id, target_recipient_id, active_subscription.id, target_reward_days
  ) on conflict (claim_id, recipient_id) do nothing;

  return active_subscription.id;
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
  invoice_record public.invoices%rowtype;
  claim_record public.billing_referral_claims%rowtype;
  link_record public.billing_referral_links%rowtype;
  referrer_subscription_id uuid;
  referred_subscription_id uuid;
begin
  if new.status <> 'active' or new.invoice_id is null then
    return new;
  end if;

  select * into plan_record from public.subscription_plans where id = new.plan_id;
  if not found then
    return new;
  end if;

  select * into invoice_record from public.invoices where id = new.invoice_id;
  if not found
    or invoice_record.status <> 'paid'
    or plan_record.product_type <> 'individual'
    or not plan_record.is_unlimited
    or plan_record.billing_type <> 'monthly'
  then
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

  select * into link_record
  from public.billing_referral_links
  where id = claim_record.link_id
  for update;

  if not found
    or not link_record.active
    or not public.has_active_paid_pro_subscription(link_record.referrer_id)
  then
    update public.billing_referral_claims
    set status = 'void', qualified_invoice_id = new.invoice_id
    where id = claim_record.id;
    return new;
  end if;

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
  else
    update public.billing_referral_claims set status = 'void' where id = claim_record.id;
  end if;

  return new;
end;
$$;

revoke all on function public.has_active_paid_pro_subscription(uuid) from public;
revoke all on function public.issue_billing_referral_reward(uuid, uuid, integer) from public;
revoke all on function public.qualify_billing_referral_from_subscription() from public;
revoke all on function public.create_billing_referral_link(uuid) from public;
grant execute on function public.create_billing_referral_link(uuid) to authenticated;
revoke all on function public.claim_billing_referral(text, uuid) from public;
grant execute on function public.claim_billing_referral(text, uuid) to authenticated;

notify pgrst, 'reload schema';
