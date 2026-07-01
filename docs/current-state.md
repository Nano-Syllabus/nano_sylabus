# Current State

Nano Syllabus is now tenant-API backed for academic data and answers.

## What The App Owns

- Supabase auth and user profiles
- Engineering-focused onboarding
- Semester-aware subject selection through tenant API metadata
- Chat UI, chat sessions, and message persistence
- Notes, revision pages, billing, credits, and admin review

## What The Tenant API Owns

- Academic source tree and subject metadata
- Indexed syllabus/source coverage
- Prompt answering through `/v1/prompt`

## Removed From Active Runtime

- Local knowledge document/chunk retrieval
- Local embeddings
- Local ingestion scripts
- Local deterministic answer branches
- Local model answer generation
- Local subject catalog as chat-answer scope

If the tenant answer API fails, the app should show a clear API error instead of
answering from local code or local data.
