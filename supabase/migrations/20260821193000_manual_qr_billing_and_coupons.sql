-- Production-shaped manual QR billing for the onboarding purchase flow.
-- Payment receipts stay in a private Storage bucket. A zero-total coupon is
-- redeemed atomically and never needs a fake payment submission.

alter table public.subscription_plans
  add column if not exists product_type text not null default 'credit_pack',
  add column if not exists seat_limit integer not null default 1,
  add column if not exists is_unlimited boolean not null default false,
  add column if not exists features jsonb not null default '[]'::jsonb;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_product_type_check;

alter table public.subscription_plans
  add constraint subscription_plans_product_type_check
  check (product_type in ('credit_pack', 'individual', 'group'));

alter table public.subscription_plans
  drop constraint if exists subscription_plans_seat_limit_check;

alter table public.subscription_plans
  add constraint subscription_plans_seat_limit_check
  check (seat_limit > 0);

alter table public.invoices
  add column if not exists invoice_code text,
  add column if not exists subtotal integer,
  add column if not exists discount_amount integer not null default 0,
  add column if not exists coupon_id uuid,
  add column if not exists expires_at timestamptz,
  add column if not exists billing_period_start timestamptz,
  add column if not exists billing_period_end timestamptz,
  add column if not exists purchase_meta jsonb not null default '{}'::jsonb;

update public.invoices
set invoice_code = 'NS-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where invoice_code is null;

update public.invoices
set subtotal = amount
where subtotal is null;

update public.invoices
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.invoices
  alter column invoice_code set not null,
  alter column invoice_code set default ('NS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  alter column subtotal set not null,
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '24 hours');

create unique index if not exists invoices_invoice_code_idx
  on public.invoices(invoice_code);

alter table public.payment_submissions
  add column if not exists payer_name text,
  add column if not exists proof_storage_path text,
  add column if not exists note text,
  add column if not exists review_note text;

create unique index if not exists payment_submissions_reference_unique_idx
  on public.payment_submissions(lower(reference));

create table if not exists public.payment_method_configs (
  id uuid primary key default gen_random_uuid(),
  payment_method text not null check (payment_method in ('bank_transfer')),
  display_name text not null,
  bank_name text,
  account_name text not null,
  account_number text,
  qr_image_url text not null,
  instructions text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_method_configs_one_active_method_idx
  on public.payment_method_configs(payment_method)
  where is_active = true;

drop trigger if exists set_payment_method_configs_updated_at on public.payment_method_configs;
create trigger set_payment_method_configs_updated_at
before update on public.payment_method_configs
for each row execute procedure public.set_current_timestamp_updated_at();

create table if not exists public.billing_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  percent_off integer not null check (percent_off between 1 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  eligible_plan_slugs text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_coupons_code_unique_idx
  on public.billing_coupons(upper(code));

drop trigger if exists set_billing_coupons_updated_at on public.billing_coupons;
create trigger set_billing_coupons_updated_at
before update on public.billing_coupons
for each row execute procedure public.set_current_timestamp_updated_at();

create table if not exists public.billing_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.billing_coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  discount_amount integer not null check (discount_amount >= 0),
  redeemed_at timestamptz not null default now()
  -- Keep one redemption per invoice, but allow the same launch coupon to be
  -- reused by the same user when its per_user_limit is null.
  -- Historical per-user limits are enforced inside redeem_billing_coupon().
);

alter table public.invoices
  drop constraint if exists invoices_coupon_id_fkey;

alter table public.invoices
  add constraint invoices_coupon_id_fkey
  foreign key (coupon_id) references public.billing_coupons(id) on delete set null;

create table if not exists public.billing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  submission_id uuid references public.payment_submissions(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_seats (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  invited_email text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create unique index if not exists subscription_seats_subscription_email_idx
  on public.subscription_seats(subscription_id, lower(invited_email));

create index if not exists billing_audit_logs_invoice_created_idx
  on public.billing_audit_logs(invoice_id, created_at desc);

alter table public.payment_method_configs enable row level security;
alter table public.billing_coupons enable row level security;
alter table public.billing_coupon_redemptions enable row level security;
alter table public.billing_audit_logs enable row level security;
alter table public.subscription_seats enable row level security;

drop policy if exists "payment_method_configs_select_active" on public.payment_method_configs;
create policy "payment_method_configs_select_active"
on public.payment_method_configs for select to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "payment_method_configs_admin_all" on public.payment_method_configs;
create policy "payment_method_configs_admin_all"
on public.payment_method_configs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "billing_coupons_admin_select" on public.billing_coupons;
create policy "billing_coupons_admin_select"
on public.billing_coupons for select to authenticated
using (public.is_admin());

drop policy if exists "billing_coupon_redemptions_select_own" on public.billing_coupon_redemptions;
create policy "billing_coupon_redemptions_select_own"
on public.billing_coupon_redemptions for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "billing_audit_logs_admin_select" on public.billing_audit_logs;
create policy "billing_audit_logs_admin_select"
on public.billing_audit_logs for select to authenticated
using (public.is_admin());

drop policy if exists "subscription_seats_owner_select" on public.subscription_seats;
create policy "subscription_seats_owner_select"
on public.subscription_seats for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.user_subscriptions subscription
    where subscription.id = subscription_id and subscription.user_id = auth.uid()
  )
  or user_id = auth.uid()
);

-- Service-role-only uploads keep user-controlled receipt files out of public
-- buckets. API routes validate ownership, MIME type, and size before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.activate_paid_invoice(target_invoice_id uuid, target_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record public.invoices%rowtype;
  plan_record public.subscription_plans%rowtype;
  current_balance integer := 0;
  computed_end timestamptz;
  activated_subscription_id uuid;
  seat_email text;
begin
  select * into invoice_record from public.invoices where id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;

  -- This helper is reached from either the admin approval RPC or the coupon
  -- redemption RPC. A student may only activate their own zero-total invoice
  -- after a real coupon has been attached.
  if not public.is_admin() and (
    auth.uid() is null
    or invoice_record.user_id <> auth.uid()
    or invoice_record.amount <> 0
    or invoice_record.coupon_id is null
  ) then
    raise exception 'Invoice cannot be activated by this user.';
  end if;

  select * into plan_record from public.subscription_plans where id = invoice_record.plan_id;
  if not found then raise exception 'Plan not found.'; end if;

  if plan_record.billing_type = 'monthly' then
    computed_end := coalesce(invoice_record.billing_period_end, now() + interval '30 days');
  else
    computed_end := null;
  end if;

  update public.invoices set status = 'paid' where id = invoice_record.id;

  insert into public.user_subscriptions (user_id, plan_id, invoice_id, status, starts_at, ends_at)
  values (invoice_record.user_id, plan_record.id, invoice_record.id, 'active', now(), computed_end)
  on conflict do nothing
  returning id into activated_subscription_id;

  if activated_subscription_id is null then
    select id into activated_subscription_id
    from public.user_subscriptions where invoice_id = invoice_record.id;
  end if;

  if plan_record.product_type = 'group' and activated_subscription_id is not null then
    for seat_email in
      select jsonb_array_elements_text(coalesce(invoice_record.purchase_meta->'studentEmails', '[]'::jsonb))
    loop
      insert into public.subscription_seats (subscription_id, invited_email)
      values (activated_subscription_id, lower(trim(seat_email)))
      on conflict do nothing;
    end loop;
  end if;

  if not plan_record.is_unlimited then
    select balance_after into current_balance
    from public.credits_ledger
    where user_id = invoice_record.user_id
    order by created_at desc limit 1;

    current_balance := coalesce(current_balance, 0);
    insert into public.credits_ledger (
      user_id, type, amount, balance_after, reference_type, reference_id, description
    ) values (
      invoice_record.user_id,
      'grant',
      plan_record.credits,
      current_balance + plan_record.credits,
      'invoice',
      invoice_record.id::text,
      'Credits granted from paid invoice'
    ) on conflict (reference_type, reference_id) do nothing;
  end if;

  insert into public.billing_audit_logs (invoice_id, actor_id, action)
  values (invoice_record.id, auth.uid(), 'invoice_activated');
end;
$$;

revoke all on function public.activate_paid_invoice(uuid, uuid) from public;
grant execute on function public.activate_paid_invoice(uuid, uuid) to authenticated;

create unique index if not exists user_subscriptions_invoice_unique_idx
  on public.user_subscriptions(invoice_id)
  where invoice_id is not null;

create or replace function public.redeem_billing_coupon(
  target_invoice_id uuid,
  target_coupon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record public.invoices%rowtype;
  plan_record public.subscription_plans%rowtype;
  coupon_record public.billing_coupons%rowtype;
  prior_redemptions integer;
  computed_discount integer;
  final_amount integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select * into invoice_record
  from public.invoices
  where id = target_invoice_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'Invoice not found.'; end if;
  if invoice_record.status <> 'pending_payment' then raise exception 'Invoice is not eligible for a coupon.'; end if;
  if invoice_record.expires_at <= now() then raise exception 'Invoice has expired.'; end if;

  select * into plan_record from public.subscription_plans where id = invoice_record.plan_id;

  select * into coupon_record
  from public.billing_coupons
  where upper(code) = upper(trim(target_coupon_code))
  for update;

  if not found or not coupon_record.is_active then raise exception 'Coupon is invalid.'; end if;
  if coupon_record.starts_at > now() or (coupon_record.ends_at is not null and coupon_record.ends_at < now()) then
    raise exception 'Coupon is not active.';
  end if;
  if coupon_record.max_redemptions is not null and coupon_record.redemption_count >= coupon_record.max_redemptions then
    raise exception 'Coupon redemption limit has been reached.';
  end if;
  if cardinality(coupon_record.eligible_plan_slugs) > 0 and not (plan_record.slug = any(coupon_record.eligible_plan_slugs)) then
    raise exception 'Coupon does not apply to this plan.';
  end if;

  select count(*) into prior_redemptions
  from public.billing_coupon_redemptions
  where coupon_id = coupon_record.id and user_id = auth.uid();

  if coupon_record.per_user_limit is not null and prior_redemptions >= coupon_record.per_user_limit then
    raise exception 'You have already used this coupon.';
  end if;

  computed_discount := least(
    invoice_record.subtotal,
    round(invoice_record.subtotal * coupon_record.percent_off / 100.0)::integer
  );
  final_amount := invoice_record.subtotal - computed_discount;

  update public.invoices
  set amount = final_amount,
      discount_amount = computed_discount,
      coupon_id = coupon_record.id
  where id = invoice_record.id;

  insert into public.billing_coupon_redemptions (
    coupon_id, user_id, invoice_id, discount_amount
  ) values (
    coupon_record.id, auth.uid(), invoice_record.id, computed_discount
  );

  update public.billing_coupons
  set redemption_count = redemption_count + 1
  where id = coupon_record.id;

  insert into public.billing_audit_logs (invoice_id, actor_id, action, metadata)
  values (
    invoice_record.id,
    auth.uid(),
    'coupon_redeemed',
    jsonb_build_object('coupon_code', coupon_record.code, 'discount_amount', computed_discount)
  );

  if final_amount = 0 then
    perform public.activate_paid_invoice(invoice_record.id, auth.uid());
  end if;

  return jsonb_build_object(
    'invoiceId', invoice_record.id,
    'invoiceCode', invoice_record.invoice_code,
    'subtotal', invoice_record.subtotal,
    'discountAmount', computed_discount,
    'amount', final_amount,
    'couponCode', coupon_record.code,
    'status', case when final_amount = 0 then 'paid' else 'pending_payment' end
  );
end;
$$;

-- Make approval/rejection concurrency-safe and keep an audit trail.
create or replace function public.approve_payment_submission(target_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.payment_submissions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only admins can approve payments.'; end if;

  select * into submission_record
  from public.payment_submissions where id = target_submission_id for update;

  if not found then raise exception 'Payment submission not found.'; end if;
  if submission_record.status <> 'submitted' then raise exception 'Payment submission is already finalized.'; end if;

  update public.payment_submissions
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = target_submission_id;

  perform public.activate_paid_invoice(submission_record.invoice_id, auth.uid());

  insert into public.billing_audit_logs (invoice_id, submission_id, actor_id, action)
  values (submission_record.invoice_id, target_submission_id, auth.uid(), 'payment_approved');
end;
$$;

create or replace function public.reject_payment_submission(target_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.payment_submissions%rowtype;
begin
  if not public.is_admin() then raise exception 'Only admins can reject payments.'; end if;

  select * into submission_record
  from public.payment_submissions where id = target_submission_id for update;

  if not found then raise exception 'Payment submission not found.'; end if;
  if submission_record.status <> 'submitted' then raise exception 'Payment submission is already finalized.'; end if;

  update public.payment_submissions
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where id = target_submission_id;

  update public.invoices set status = 'rejected' where id = submission_record.invoice_id;

  insert into public.billing_audit_logs (invoice_id, submission_id, actor_id, action)
  values (submission_record.invoice_id, target_submission_id, auth.uid(), 'payment_rejected');
end;
$$;

insert into public.subscription_plans (
  name, slug, credits, price, currency, billing_type, product_type,
  seat_limit, is_unlimited, features, is_active
)
values
  (
    'Individual Unlimited',
    'individual-unlimited',
    1,
    1500,
    'NPR',
    'monthly',
    'individual',
    1,
    true,
    '["Unlimited AI Tutor","Unlimited mock exams","Handwritten answer feedback","Knowledge graph and exam readiness"]'::jsonb,
    true
  ),
  (
    'Group Unlimited',
    'group-unlimited',
    1,
    5000,
    'NPR',
    'monthly',
    'group',
    5,
    true,
    '["Five student seats","Unlimited AI Tutor","Unlimited mock exams","Individual readiness and progress"]'::jsonb,
    true
  )
on conflict (slug) do update
set name = excluded.name,
    price = excluded.price,
    currency = excluded.currency,
    billing_type = excluded.billing_type,
    product_type = excluded.product_type,
    seat_limit = excluded.seat_limit,
    is_unlimited = excluded.is_unlimited,
    features = excluded.features,
    is_active = true;

insert into public.billing_coupons (
  code, description, percent_off, starts_at, ends_at,
  per_user_limit, eligible_plan_slugs, is_active
)
values (
  'WELCOME100',
  '100% off the first Individual Unlimited month',
  100,
  '2026-01-01T00:00:00Z',
  null,
  null,
  array['individual-unlimited'],
  true
)
on conflict do nothing;
