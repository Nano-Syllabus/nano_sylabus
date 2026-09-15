# Nano Syllabus

Nano Syllabus is a Nepal-focused AI study companion. The student app owns auth,
onboarding, chat UX, notes, billing, settings, and persistence. Academic subject
catalogs and answer generation come from the external tenant API.

## Current Architecture

- Users authenticate and keep profiles in Supabase.
- Onboarding and subject selectors read semester-aware subject metadata through
  the tenant API proxy routes.
- Chat sends the raw student question to the tenant `/v1/prompt` endpoint with
  the selected subject metadata.
- The app does not run local retrieval, local embeddings, local question-bank routing,
  local model answering, or local knowledge chunk retrieval.
- Chat history, notes, feedback, credits, and admin review still persist in
  Supabase.

## Repository Structure

```text
app/         Next.js pages and API routes
components/  UI and client interaction layers
lib/         Supabase, billing, tenant API, and app data helpers
supabase/    SQL migrations
tests/       Vitest and tenant API integration coverage
docs/        Product and operations notes
```

## Required Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TENANT_API_BASE_URL`
- `TENANT_API_TOKEN`
- `TEACHER_APP_API_TOKEN` required for creating teacher workspaces
- `TENANT_API_REJECT_UNAUTHORIZED` optional, defaults to `0`
- `TENANT_API_TIMEOUT_MS` optional, minimum enforced timeout is `30000`
- `GOOGLE_DRIVE_API_KEY` optional. A Google Cloud API key with the Drive API
  enabled. Without it a creator can import a link to a single file shared as
  "Anyone with the link"; with it, folder links work too and filenames, sizes
  and file types are known before anything is downloaded. It is an API key and
  deliberately not OAuth — reading a private Drive needs the restricted
  `drive.readonly` scope, which Google gates behind a security assessment.

## Common Commands

```bash
npm install
npm run dev
npm test
npm run test:integration
npm run test:tenant-prompt
npm run build
```

## Important Boundary

Do not reintroduce app-side answer generation. If the tenant API fails, the app
should surface a debuggable tenant/API error instead of answering from a local
corpus or model.
