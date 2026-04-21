# Local Setup

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- OpenAI API key

## 1. Install dependencies

```bash
npm install
```

## 2. Create local environment file

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

The repository already provides default model values for:

- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`

## 3. Apply database migrations

Run the SQL files in `supabase/migrations/` in order inside the Supabase SQL Editor:

1. `20260420170000_phase1.sql`
2. `20260420193000_phase2_grounding_and_notes.sql`
3. `20260420213000_phase3_billing_and_admin.sql`

## 4. Configure Supabase Auth

In Supabase Authentication settings:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`
- Redirect URL: `http://localhost:3000/reset-password`

Enable:

- Email auth
- Google auth when the OAuth app is ready

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
