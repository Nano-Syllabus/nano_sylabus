# Implementation Plan

## Purpose

This document answers the practical question:

What should we build next, now that the real Next.js student app, billing backbone, minimal admin finance flow, and launch-readiness basics exist?

## Status snapshot

The following are now implemented in the Next.js app:

- real auth and onboarding persistence
- grounded chat with retrieval fallback
- notes and revision persistence
- focused automated tests
- ledger-backed credits
- billing page with invoice creation and manual payment submission
- admin payment review and approval actions

The next implementation phase should therefore move away from “can we monetize at all?” and toward “can we run this safely in a real environment, broaden operator capability, and finish launch-critical gaps?”

## Phase A: Live validation and runtime hardening

### Goal

Make the current Phase 3 backbone trustworthy in a real deployment.

### Deliverables

- validate all flows against a live Supabase project and real OpenAI credentials
- apply all migrations cleanly in the target environment
- confirm RLS for student and admin flows
- verify that credit deduction, invoice creation, payment submission, and admin approval behave correctly
- verify Google OAuth and password recovery in the real auth project
- fix production blockers and silent failures found during validation

## Phase B: Finance operations expansion

### Goal

Turn the finance backbone into an actually operable internal system.

### Deliverables

- richer invoice and payment status handling
- admin support for refunds or manual adjustments
- better payment evidence handling
- clearer student billing history and status explanations
- audit-friendly finance event views

## Phase C: Knowledge and content operations

### Goal

Expand admin capability beyond finance.

### Deliverables

- admin auth and navigation refinement
- knowledge upload and curation UI
- source management and ingestion QA
- basic user support views

## Phase D: Product completeness gaps

### Goal

Finish the highest-value deferred product surface only after runtime confidence improves.

### Deliverables

- subject explorer
- richer citation inspection UX
- stronger billing visibility for students
- clearer subscription state and usage messaging
## Phase E: Automation and scale

### Goal

Reduce manual work only after the baseline is trusted.

### Deliverables

- payment gateway automation
- richer subscription lifecycle behavior
- observability and alerts
- broader analytics

## Suggested immediate backlog

1. run the app against a live Supabase project and real OpenAI key
2. fix any runtime issues uncovered in auth, chat, notes, billing, or admin approval
3. verify that admin approval grants credits exactly once in the real database
4. add more focused tests around billing and admin actions if runtime issues reveal weak spots
5. improve the student billing history and admin finance review UX
6. address launch-critical product gaps that block user confidence
7. start knowledge/admin tooling after finance validation is stable

## What we should not do first

- rebuild the student app foundation again
- add more learning features before the live payment flow is validated
- automate payment gateways before the manual verification flow is trusted
- build a huge admin surface before finance and knowledge workflows are clearer

## Definition of done for the next phase

- the current Phase 3 flows work in a real environment
- finance and credit actions are explainable and auditable
- admin approval is safe against accidental double-grants
- docs stay in sync with implementation changes

## Next implementation focus

If we choose one next objective, it should be:

### Live validation + finance hardening

That moves the product from:

- implemented in code

to:

- reliable in operation
