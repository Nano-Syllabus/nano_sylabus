-- Discount codes are no longer part of the product. Keep historical rows for
-- billing auditability, but make every coupon inactive and remove redemption.

update public.billing_coupons
set is_active = false
where is_active = true;

revoke all on function public.redeem_billing_coupon(uuid, text) from public;
drop function if exists public.redeem_billing_coupon(uuid, text);

revoke all on table public.billing_coupons from anon, authenticated;
revoke all on table public.billing_coupon_redemptions from anon, authenticated;

-- Invoice activation is now exclusively an admin payment-verification action.
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
  if not public.is_admin() then
    raise exception 'Only an admin can activate a paid invoice.';
  end if;

  select * into invoice_record from public.invoices where id = target_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;

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
  values (invoice_record.id, coalesce(target_actor_id, auth.uid()), 'invoice_activated');
end;
$$;

revoke all on function public.activate_paid_invoice(uuid, uuid) from public;
grant execute on function public.activate_paid_invoice(uuid, uuid) to authenticated;
