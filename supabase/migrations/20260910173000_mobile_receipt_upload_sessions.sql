-- A short-lived bearer-token handoff lets a student select a receipt on their
-- phone while finishing the payment form on desktop. Only server routes use
-- this table; the raw QR token is never stored in Postgres.

create table if not exists public.billing_receipt_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'consumed', 'expired')),
  proof_storage_path text,
  original_file_name text,
  mime_type text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  uploaded_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_receipt_upload_sessions_user_invoice_idx
  on public.billing_receipt_upload_sessions(user_id, invoice_id, created_at desc);

create index if not exists billing_receipt_upload_sessions_expiry_idx
  on public.billing_receipt_upload_sessions(expires_at)
  where status in ('pending', 'uploaded');

drop trigger if exists set_billing_receipt_upload_sessions_updated_at
  on public.billing_receipt_upload_sessions;
create trigger set_billing_receipt_upload_sessions_updated_at
before update on public.billing_receipt_upload_sessions
for each row execute procedure public.set_current_timestamp_updated_at();

alter table public.billing_receipt_upload_sessions enable row level security;

-- Deliberately no browser-facing policies. The authenticated desktop API and
-- token-authenticated mobile API validate access and use the service role.
revoke all on public.billing_receipt_upload_sessions from anon, authenticated;
