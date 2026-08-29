-- Activate the official Nano Syllabus QR used by the manual payment flow.
-- The image is deployed with the web app at /qr-nano.jpg; receipt uploads and
-- admin approval continue to use the existing database-backed billing flow.

begin;

update public.payment_method_configs
set is_active = false
where payment_method = 'bank_transfer'
  and is_active = true
  and id <> '4fc24a5b-dcd4-4f38-a473-b82cdd66a7d4'::uuid;

insert into public.payment_method_configs (
  id,
  payment_method,
  display_name,
  bank_name,
  account_name,
  account_number,
  qr_image_url,
  instructions,
  is_active
)
values (
  '4fc24a5b-dcd4-4f38-a473-b82cdd66a7d4'::uuid,
  'bank_transfer',
  'Nano QR',
  null,
  'Nano Syllabus',
  null,
  '/qr-nano.jpg',
  'Scan the official QR, complete the payment, then submit the transaction reference and receipt for admin verification.',
  true
)
on conflict (id) do update
set payment_method = excluded.payment_method,
    display_name = excluded.display_name,
    bank_name = excluded.bank_name,
    account_name = excluded.account_name,
    account_number = excluded.account_number,
    qr_image_url = excluded.qr_image_url,
    instructions = excluded.instructions,
    is_active = excluded.is_active,
    updated_at = now();

commit;
