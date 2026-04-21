# Current State

## Summary

This repository now contains a **real Next.js student app plus the first monetization and admin backbone**.

The app now supports:

- real auth and onboarding
- Google OAuth plus password recovery basics
- grounded chat with citations
- saved notes and revision logging
- ledger-backed credits
- manual invoice and payment submission
- admin payment approval and rejection
- account export and account deletion
- a cleaned Next.js-only runtime after legacy prototype removal

It is no longer just a learning loop prototype. It now begins to prove the **business and operations loop**, though live-environment validation is still incomplete.

## Where we are against the goal

Against the current product goal, we are roughly here:

- real student foundation: implemented
- real auth and onboarding: implemented
- real persistent grounded chat: implemented
- notes and revision persistence: implemented
- credits enforcement: implemented
- manual billing workflow: implemented
- finance-focused admin surface: implemented
- live production validation: partially complete
- broader admin operations: not started
- automated payment gateway integration: not started

## What is already present

### Student app

- Next.js App Router app structure
- protected routes through middleware
- landing, auth, onboarding, chat, notes, revision, billing, and settings pages
- no remaining Vite or TanStack runtime path in the active application

### Authentication and onboarding

- Supabase Auth integration
- signup, login, logout
- Google OAuth callback flow
- forgot-password and reset-password flow
- onboarding gate
- profile persistence in `student_profiles`
- role support through `student_profiles.role`

### Chat and learning loop

- persistent `chat_sessions` and `chat_messages`
- OpenAI streaming responses
- syllabus-grounded retrieval with fallback
- chat history search
- chat rename and delete
- lazy loading for older sessions
- simple source labels in chat and notes
- note save/edit/delete
- revision logging

### Monetization backbone

- `credits_ledger`
- `subscription_plans`
- `user_subscriptions`
- `invoices`
- `payment_submissions`
- starter credits for newly onboarded users
- credit deduction only after successful assistant persistence
- student billing page with manual payment submission flow

### Admin finance surface

- admin role checks
- protected `/admin/*` routes
- pending payment list
- payment detail view
- approve/reject actions through server-side interfaces

### Test and hardening baseline

- focused automated tests for access rules, credits helpers, and core API behaviors
- stricter note API ownership handling
- middleware-based route gating for guest, onboarded, and admin flows
- account export and account deletion flows in settings
- `npm run lint`, `npm test`, and `npm run build` as the default verification baseline

## What is still missing

### Live validation and operational hardening

- full end-to-end validation against a live Supabase project and real OpenAI credentials
- production QA for invoice approval and credit grants
- observability and alerting
- deeper failure-state polish

### Broader business system

- automated payment gateway integration
- richer subscription lifecycle behavior
- invoice exports or PDF generation
- support tooling for finance exceptions and refunds

### Broader admin operations

- knowledge upload and curation UI
- user management
- prompt and quality controls
- analytics dashboard

### Product surface still deferred

- subject explorer
- advanced citation inspection UI
- deeper study analytics
- moderation and answer quality review loops
- broader knowledge operations UI

## Reality check

The product now proves an initial end-to-end loop:

- student signs up
- asks grounded questions
- saves notes
- revises later
- runs down credits
- creates an invoice
- submits payment proof
- admin reviews and grants credits

The biggest remaining gap is not feature breadth. It is **runtime confidence** and **broader operator tooling**.

## Repo reality

- the active product code lives in `app/`, `components/`, `lib/`, `supabase/`, and `tests/`
- the old prototype tree is no longer part of the repository
- current progress is best described as a launch-readiness baseline rather than a prototype

## Recommended build focus

### Keep and strengthen

- grounded chat architecture
- note and revision workflow
- credit ledger model
- manual payment verification baseline

### Build next

- live-environment validation and fixes
- richer finance/admin tooling
- payment gateway automation only after the manual flow is trusted
- knowledge/admin operations beyond finance
