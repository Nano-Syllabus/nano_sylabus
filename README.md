# Nano Syllabus

Nano Syllabus is a bilingual AI study companion built for Nepal's curriculum. It is intended to help students from Class 9 through bachelor's level ask questions in English or Roman Nepali, receive syllabus-grounded answers, save useful explanations as revision notes, and prepare for exams with a guided study workflow.

This repository now contains the **real student app through the Phase 4 launch-readiness baseline**. The app is no longer a prototype shell. It now has real auth, real persistence, syllabus grounding, lightweight citations, note-based revision flows, credit enforcement, manual invoice/payment workflows, a minimal admin finance surface, and launch-readiness basics like Google OAuth, password recovery, and chat history management.

## Source of truth

The project direction in this repo is based on:

- BRD: `/Users/sumangiri/Desktop/Nano_syllabus_BRD_v1.1.pdf`
- current product app: `app/`, `components/`, `lib/`
- product and planning docs: `docs/`

## Repository structure

```text
app/         Next.js App Router pages and API routes
components/  Client and server UI building blocks
lib/         Auth, data, billing, AI, and Supabase helpers
scripts/     Developer ingestion utilities
supabase/    SQL migrations
tests/       Focused Vitest coverage
docs/        Product and engineering source-of-truth docs
```

## Documentation map

- [Project Overview](./docs/product-overview.md)
- [Goals and Metrics](./docs/goals-and-metrics.md)
- [Scope and Requirements](./docs/scope-and-requirements.md)
- [Architecture](./docs/architecture.md)
- [Data Model](./docs/data-model.md)
- [Admin Panel](./docs/admin-panel.md)
- [Roadmap](./docs/roadmap.md)
- [Implementation Plan](./docs/implementation-plan.md)
- [Current State](./docs/current-state.md)
- [Local Setup](./docs/local-setup.md)

## Product summary

- Target users: Nepali students from Class 9 to bachelor's level
- Core promise: curriculum-aligned AI help in English and Roman Nepali
- Current implemented product features:
  - onboarding by college, grade, score, subjects, target grade, language
  - real signup/login flow via Supabase Auth
  - Google OAuth callback flow
  - forgot-password and reset-password flow
  - protected app routes with onboarding gate
  - real persistent chat sessions/messages in Postgres
  - real OpenAI-powered streaming chat
  - developer-operated syllabus ingestion
  - retrieval-grounded answers with simple citations
  - save-as-note flow from assistant answers
  - notes library, note detail, and revision mode with persistence
  - credits ledger with chat usage enforcement
  - billing page with plan purchase, invoice creation, and manual payment submission
  - admin payment review pages for approve/reject flow
  - chat history search, rename, delete, and lazy loading
  - account export and account deletion actions in settings
- Current repo state:
  - Next.js-only application runtime
  - App Router pages plus server route handlers
  - npm-based local workflow (`dev`, `lint`, `test`, `build`)
- Deferred product areas:
  - payment gateway automation
  - richer knowledge operations and admin upload tooling
  - subject explorer
  - broader admin operations
- Planned platform components:
  - student web app / PWA
  - admin panel
  - backend API
  - RAG-powered syllabus knowledge base

## Working principle

From this point onward, we should use the docs in `docs/` as the operating guide for product, design, engineering, and prioritization. Whenever the build direction changes, update the relevant Markdown file first or alongside the code change.

## Runtime requirements

To run the current app end-to-end, the following still need to be configured:

- Supabase project and auth setup
- Supabase migration from `supabase/migrations/`
- environment variables from `.env.example`
- OpenAI API key
- `SUPABASE_SERVICE_ROLE_KEY` for developer ingestion

Useful local commands:

- `npm run dev`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run ingest:syllabus -- <path-to-documents.json>`

## Developer ingestion

Phase 2 uses a developer-operated syllabus import flow rather than an admin UI.

- Prepare a JSON file containing syllabus documents.
- Run `npm run ingest:syllabus -- <path-to-documents.json>`.
- The script will create knowledge documents, chunk content, generate embeddings, and insert knowledge chunks.

Minimum required fields per document:

- `board`
- `grade`
- `subject`
- `title`
- `sourceName`
- `sourceType`
- `content`

Optional metadata:

- `chapter`
- `topic`
