-- Keep payment remarks short and human-readable: 001, 002, ... 999, 1000, ...
-- Existing finalized invoices retain their original codes. Open invoices are
-- renumbered from 001 in creation order because they have not been submitted.

begin;

lock table public.invoices in share row exclusive mode;

create sequence if not exists public.invoice_code_seq;

create or replace function public.next_invoice_code()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_value bigint;
  next_code text;
begin
  loop
    next_value := nextval('public.invoice_code_seq');
    next_code := case
      when next_value < 1000 then lpad(next_value::text, 3, '0')
      else next_value::text
    end;

    exit when not exists (
      select 1
      from public.invoices
      where invoice_code = next_code
    );
  end loop;

  return next_code;
end;
$$;

-- Free every pending invoice's old code before assigning 001, 002, 003, ...
-- The UUID suffix keeps these temporary values unique during the conversion.
update public.invoices
set invoice_code = 'MIG-' || replace(id::text, '-', '')
where status = 'pending_payment';

select setval('public.invoice_code_seq', 1, false);

do $$
declare
  pending_invoice record;
begin
  for pending_invoice in
    select id
    from public.invoices
    where status = 'pending_payment'
    order by created_at asc, id asc
  loop
    update public.invoices
    set invoice_code = public.next_invoice_code()
    where id = pending_invoice.id;
  end loop;
end;
$$;

alter table public.invoices
  alter column invoice_code set default public.next_invoice_code();

commit;
