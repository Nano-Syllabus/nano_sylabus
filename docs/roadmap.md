# Roadmap

## Practical roadmap for this repository

This roadmap reflects the codebase as it exists now.

| Stage | Outcome | Status |
| --- | --- | --- |
| Stage 0 | Product docs and build alignment | Done |
| Stage 1 | Real auth, onboarding, persistence, and chat foundation | Done |
| Stage 2 | Syllabus grounding plus notes and revision persistence | Done |
| Stage 3 | Hardening, credits, billing backbone, and admin payment review | Implemented in code |
| Stage 4 | Live validation, finance hardening, and broader admin tools | Next |
| Stage 5 | Knowledge operations, analytics, and workflow expansion | Upcoming |
| Stage 6 | Gateway automation, moderation, and scale improvements | Later |

## Stage 3: Delivered backbone

### Delivered

- credits ledger
- plan catalog
- invoice creation
- manual payment submission
- admin approve/reject flow
- finance-focused admin routes
- focused automated tests

## Stage 4: Live validation and finance hardening

### Goal

Make the new backbone reliable in a real environment.

### Scope

- validate live Supabase migrations and RLS
- validate grounded chat plus billing flows end to end
- fix production blockers
- improve finance UX and auditability

## Stage 5: Broader admin and knowledge operations

### Goal

Expand internal tooling beyond payment review.

### Scope

- knowledge upload and curation UI
- ingestion quality controls
- user support views
- analytics and operations visibility

## Stage 6: Automation and scale

### Goal

Reduce manual work and improve resilience.

### Scope

- automated payment gateway integration
- richer subscription lifecycle automation
- moderation and quality review loops
- observability and alerting
- performance and scaling improvements

## Immediate next priorities

1. test the current app against a live Supabase project and real Gemini credentials
2. verify the finance workflow end to end, including credit grants after approval
3. fix any live-environment issues
4. improve finance/admin UX where validation reveals friction
5. start broader admin and knowledge tooling only after the finance flow is stable
