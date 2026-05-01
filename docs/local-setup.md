# Local Setup

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Gemini API key

## 1. Install dependencies

```bash
npm install
```

## 2. Create local environment file

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

The repository already provides default model values for:

- `GEMINI_MODEL`
- `GEMINI_EMBEDDING_MODEL`

## 3. Apply database migrations

Run the SQL files in `supabase/migrations/` in order inside the Supabase SQL Editor:

1. `20260420170000_phase1.sql`
2. `20260420193000_phase2_grounding_and_notes.sql`
3. `20260420213000_phase3_billing_and_admin.sql`
4. `20260422145640_deactivate_seeded_subscription_plans.sql`
5. `20260422161000_subject_explorer_core.sql`
6. `20260422173500_chat_feedback_and_followups.sql`

After the billing migrations, create your real plans directly in `subscription_plans`. The repo no longer ships active sample plans to students by default.

## 4. Configure Supabase Auth

In Supabase Authentication settings:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`
- Redirect URL: `http://localhost:3000/reset-password`

Enable:

- Email auth
- Google auth when the OAuth app is ready

Only set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` after Google is enabled in Supabase and the OAuth client is configured.

## 5. Seed knowledge content

Use the ingestion script after the database and API keys are ready:

```bash
npm run ingest:syllabus -- <path-to-documents.json>
```

Each document should include at least:

- `board`
- `grade`
- `subject`
- `title`
- `sourceName`
- `sourceType`
- `content`

For the exact JSON structure, see:

- [docs/syllabus-ingest-format.md](/Users/sumangiri/Desktop/padhai/docs/syllabus-ingest-format.md)

## 6. Run the app

```bash
npm run dev
```

## 7. Verification checklist

Before pushing or deploying, verify:

- `npm run lint`
- `npm test`
- `npm run build`
- signup and login
- onboarding save
- grounded chat response
- note save and revision
- billing page load
- admin payment review access
