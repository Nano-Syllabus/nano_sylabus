# Local Setup

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Tenant API base URL and token

## 1. Install Dependencies

```bash
npm install
```

## 2. Create `.env.local`

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TENANT_API_BASE_URL`
- `TENANT_API_TOKEN`
- `TENANT_API_REJECT_UNAUTHORIZED=0` for the current self-signed tenant host
- `TENANT_API_TIMEOUT_MS=30000`

The app no longer needs any local model provider keys for chat answers.

## 3. Apply Database Migrations

Run SQL files in `supabase/migrations/` in order inside the Supabase SQL Editor.
Supabase still stores users, profiles, chat sessions, notes, credits, billing,
and admin review data.

## 4. Configure Supabase Auth

In Supabase Authentication settings:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`
- Redirect URL: `http://localhost:3000/reset-password`

Enable email auth. Enable Google auth only after the OAuth app is configured and
`NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` is set.

## 5. Run The App

```bash
npm run dev
```

## 6. Verification Checklist

Before pushing or deploying, verify:

- `npm test`
- `npm run test:tenant-prompt`
- `npm run build`
- signup and login
- onboarding subject flow
- chat answer from the tenant API
- note save and revision pages
- billing page load
- admin payment/review access
