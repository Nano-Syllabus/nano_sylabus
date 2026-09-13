begin;

-- A cancellation is scheduled for the end of the already-paid period.  We do
-- not flip `status` to cancelled here: entitlement checks continue to honour
-- the paid period through `ends_at` and the user never loses purchased access.
alter table public.user_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_cancellation_reason_length_check;

alter table public.user_subscriptions
  add constraint user_subscriptions_cancellation_reason_length_check
  check (
    cancellation_reason is null
    or char_length(cancellation_reason) <= 500
  );

create index if not exists user_subscriptions_active_cancellation_idx
  on public.user_subscriptions (user_id, cancel_at_period_end, ends_at)
  where status = 'active';

notify pgrst, 'reload schema';

commit;
