# Manual QR payment setup

The paid purchase flow uses a server-generated invoice, a private Supabase
Storage bucket for receipts, and admin verification.

## 1. Apply the migration

Run all pending Supabase migrations against the production project before
deploying the matching app code.

## 2. Configure the official QR

Do not add a placeholder record. Upload the official company QR to a stable
HTTPS URL (or serve it from this app's `public` directory), then run:

```sql
insert into public.payment_method_configs (
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
  'bank_transfer',
  'Official Nano Syllabus QR',
  'YOUR BANK OR FONEPAY NAME',
  'YOUR LEGAL ACCOUNT NAME',
  'OPTIONAL MASKED ACCOUNT NUMBER',
  'https://nanosyllabus.com/official-payment-qr.png',
  'Use the invoice code as the payment remark.',
  true
);
```

Only one active `bank_transfer` configuration is allowed. Until this row
exists, the frontend intentionally shows no QR and disables paid receipt
submission.

## 3. Verification flow

Paid receipts are uploaded to the private `payment-receipts` bucket. Admin
receipt links are signed for 15 minutes. Approve/reject actions lock the
submission row, write an audit log, and activate the subscription atomically.
