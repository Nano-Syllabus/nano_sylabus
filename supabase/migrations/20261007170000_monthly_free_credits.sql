-- Regular students get their credits topped back up to 20 at the start of each
-- month (user, 2026-10-07). The refill is a ledger row keyed per user per month
-- (`<user id>:<YYYY-MM>`, Nepal time), so the unique reference index makes it
-- happen once even when several requests race.
alter table public.credits_ledger drop constraint if exists credits_ledger_reference_type_check;
alter table public.credits_ledger add constraint credits_ledger_reference_type_check
  check (reference_type in ('starter_grant', 'chat_message', 'invoice', 'manual_adjustment', 'monthly_refresh'));
