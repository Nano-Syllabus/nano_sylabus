begin;

-- Plus includes practice, not AI credits.  The original billing schema only
-- allowed positive credits; the new tier must be able to grant zero safely.
alter table public.subscription_plans
  drop constraint if exists subscription_plans_credits_check;

alter table public.subscription_plans
  add constraint subscription_plans_credits_check check (credits >= 0);

-- The Figma pricing model has two individual paid tiers.  Keep the existing
-- unlimited plan identity for Pro so active subscriptions and referral rewards
-- continue to point at the same plan, and add Plus as its own lower tier.
insert into public.subscription_plans (
  name, slug, credits, price, currency, billing_type, product_type,
  seat_limit, is_unlimited, features, is_active
)
values (
  'Plus',
  'plus-monthly',
  0,
  450,
  'NPR',
  'monthly',
  'individual',
  1,
  false,
  '["Unlimited challenges","Exam calendar & study plan","Romanized Nepali"]'::jsonb,
  true
)
on conflict (slug) do update
set name = excluded.name,
    credits = excluded.credits,
    price = excluded.price,
    currency = excluded.currency,
    billing_type = excluded.billing_type,
    product_type = excluded.product_type,
    seat_limit = excluded.seat_limit,
    is_unlimited = excluded.is_unlimited,
    features = excluded.features,
    is_active = true;

update public.subscription_plans
set name = 'Pro',
    price = 1500,
    currency = 'NPR',
    billing_type = 'monthly',
    product_type = 'individual',
    seat_limit = 1,
    is_unlimited = true,
    features = '["AI tutor","AI concept videos & animations","English & Nepali"]'::jsonb,
    is_active = true,
    updated_at = now()
where slug = 'individual-unlimited';

notify pgrst, 'reload schema';

commit;
