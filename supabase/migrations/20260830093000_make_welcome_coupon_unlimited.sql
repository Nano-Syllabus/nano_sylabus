begin;

-- WELCOME100 is a launch/testing coupon for now: keep every redemption auditable,
-- but do not block the same student from using it again on a new invoice.
alter table public.billing_coupons
  drop constraint if exists billing_coupons_per_user_limit_check;

alter table public.billing_coupons
  alter column per_user_limit drop not null;

alter table public.billing_coupons
  add constraint billing_coupons_per_user_limit_check
  check (per_user_limit is null or per_user_limit > 0);

alter table public.billing_coupon_redemptions
  drop constraint if exists billing_coupon_redemptions_coupon_id_user_id_key;

create index if not exists billing_coupon_redemptions_coupon_user_idx
  on public.billing_coupon_redemptions(coupon_id, user_id);

update public.billing_coupons
set per_user_limit = null,
    max_redemptions = null,
    ends_at = null,
    is_active = true,
    updated_at = now()
where upper(code) = 'WELCOME100';

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

revoke all on function public.redeem_billing_coupon(uuid, text)
  from public, anon, authenticated;

grant execute on function public.redeem_billing_coupon(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
