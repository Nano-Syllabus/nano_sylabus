begin;

-- The payment API runs with the service-role key. Allow that trusted server
-- path to activate an invoice while keeping direct student RPC calls blocked.
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
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only an admin or the billing service can activate a paid invoice.';
  end if;

  select * into invoice_record
  from public.invoices
  where id = target_invoice_id
  for update;

  if not found then raise exception 'Invoice not found.'; end if;

  select * into plan_record
  from public.subscription_plans
  where id = invoice_record.plan_id;

  if not found then raise exception 'Plan not found.'; end if;

  if plan_record.billing_type = 'monthly' then
    computed_end := coalesce(invoice_record.billing_period_end, now() + interval '30 days');
  else
    computed_end := null;
  end if;

  update public.invoices
  set status = 'paid'
  where id = invoice_record.id;

  insert into public.user_subscriptions (
    user_id, plan_id, invoice_id, status, starts_at, ends_at
  )
  values (
    invoice_record.user_id, plan_record.id, invoice_record.id, 'active', now(), computed_end
  )
  on conflict do nothing
  returning id into activated_subscription_id;

  if activated_subscription_id is null then
    select id into activated_subscription_id
    from public.user_subscriptions
    where invoice_id = invoice_record.id;
  end if;

  if plan_record.product_type = 'group' and activated_subscription_id is not null then
    for seat_email in
      select jsonb_array_elements_text(
        coalesce(invoice_record.purchase_meta->'studentEmails', '[]'::jsonb)
      )
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
    order by created_at desc
    limit 1;

    current_balance := coalesce(current_balance, 0);
    insert into public.credits_ledger (
      user_id, type, amount, balance_after, reference_type, reference_id, description
    )
    values (
      invoice_record.user_id,
      'grant',
      plan_record.credits,
      current_balance + plan_record.credits,
      'invoice',
      invoice_record.id::text,
      'Credits granted from paid invoice'
    )
    on conflict (reference_type, reference_id) do nothing;
  end if;

  insert into public.billing_audit_logs (invoice_id, actor_id, action, metadata)
  values (
    invoice_record.id,
    coalesce(target_actor_id, auth.uid()),
    'invoice_activated',
    jsonb_build_object(
      'activation_mode',
      case when coalesce(auth.role(), '') = 'service_role' then 'automatic' else 'admin' end
    )
  );
end;
$$;

revoke all on function public.activate_paid_invoice(uuid, uuid) from public, anon;
grant execute on function public.activate_paid_invoice(uuid, uuid) to authenticated, service_role;

-- Receipt submissions are auto-approved by the trusted billing API. The
-- receipt stays attached for later admin review, and the resulting
-- subscription can be cancelled independently if access must be revoked.
create or replace function public.auto_approve_payment_submission(target_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.payment_submissions%rowtype;
  subscription_record public.user_subscriptions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the billing service can auto-activate payments.';
  end if;

  select * into submission_record
  from public.payment_submissions
  where id = target_submission_id
  for update;

  if not found then raise exception 'Payment submission not found.'; end if;
  if submission_record.status = 'rejected' then
    raise exception 'Rejected payments cannot be activated.';
  end if;

  if submission_record.status = 'submitted' then
    update public.payment_submissions
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = null,
        review_note = 'Automatically activated after receipt submission.'
    where id = submission_record.id;

    perform public.activate_paid_invoice(submission_record.invoice_id, null);

    insert into public.billing_audit_logs (
      invoice_id, submission_id, actor_id, action, metadata
    )
    values (
      submission_record.invoice_id,
      submission_record.id,
      null,
      'payment_auto_approved',
      jsonb_build_object('access', 'active', 'receipt_review', 'available')
    );
  end if;

  select * into subscription_record
  from public.user_subscriptions
  where invoice_id = submission_record.invoice_id;

  if not found then raise exception 'Subscription activation failed.'; end if;

  return jsonb_build_object(
    'submissionId', submission_record.id,
    'invoiceId', submission_record.invoice_id,
    'subscriptionId', subscription_record.id,
    'subscriptionStatus', subscription_record.status,
    'accessEndsAt', subscription_record.ends_at
  );
end;
$$;

revoke all on function public.auto_approve_payment_submission(uuid)
  from public, anon, authenticated;
grant execute on function public.auto_approve_payment_submission(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
