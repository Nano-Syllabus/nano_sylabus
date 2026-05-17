# Nano Syllabus Core Functionality Status

Date: 2026-05-15  
Commit: `5eb90e5`

## Core goal (student-side first)
Build a Nepal-focused bilingual study app where a student can:
1. Sign up/login and finish onboarding
2. Ask syllabus-grounded questions
3. Save answers as notes and revise later
4. Use credits and basic billing flow
5. Navigate study chats by subject

---

## Status snapshot (codebase audit)

| Area | Status | Evidence in repo |
|---|---|---|
| Auth (email + Google OAuth callback + reset) | Done | `app/login`, `app/signup`, `app/auth/callback`, `app/forgot-password`, `app/reset-password` |
| Onboarding + profile persistence | Done | `app/onboarding`, `student_profiles` usage in APIs |
| Core chat persistence + streaming | Done | `app/api/chat/route.ts`, `chat_sessions`, `chat_messages` flows |
| Bilingual response mode (EN/RN) | Done | request schema + prompt language controls in `app/api/chat/route.ts` |
| Grounded retrieval (RAG plumbing) | Done (pipeline), Needs continuous content expansion | `lib/ai/retrieval.ts`, `scripts/ingest-syllabus.mjs` |
| Chat history (search, rename, delete, lazy load) | Done | `app/api/chat/sessions*`, `components/chat-page-client.tsx` |
| Chat UI core extras (copy, thumbs feedback, follow-ups) | Done | feedback API + UI actions in `app/api/chat/messages/[messageId]/feedback`, `components/chat-page-client.tsx` |
| Subject Explorer (list + subject detail + start chat with subject context) | Done (core) | `app/app/explore`, `components/subject-explorer-client.tsx`, `components/subject-detail-client.tsx` |
| Save as Note + revision flow | Done (core) | `app/api/notes*`, `app/app/notes*`, `app/app/notes/revision` |
| Credits deduction and visibility | Done (core) | `lib/billing.ts`, `app/api/billing/credits`, chat debit flow |
| Billing manual workflow (invoice + payment submission + admin review) | Done (manual baseline) | `app/app/billing`, `app/api/billing/*`, `app/admin/payments*`, `app/api/admin/payments` |

---

## Still partial / remaining for BRD completeness

| Area | Current state |
|---|---|
| RAG content breadth | Only a subset is ingested (Class 11 English strongly prepared). Need full subject coverage (Physics/Chemistry/etc, Class 11/12 and beyond). |
| Admin breadth | Finance review exists, but full admin suite (knowledge curation UI, full user ops, prompt mgmt, analytics) is not complete. |
| Payment automation | Manual billing/payment proof flow exists; full gateway automation is pending. |
| Explorer depth | Core explorer exists; advanced BRD filters/sorting/tagging analytics still partial. |
| Notes depth | Core notes/revision exists; advanced limits/export variants can still be expanded. |

---

## Test confidence (local)

- Unit/API tests present and passing: `npm test` (10 files, 21 tests)
- Verification scripts available:
  - `npm run test:rag:class11:english`
  - `npm run test:e2e` (Playwright baseline present)

---

## Detailed BRD core review

| BRD core item | Current status | Review note |
|---|---|---|
| Login / signup / Google OAuth / reset password | Implemented | Present in routes and active app flows. |
| Onboarding with academic context | Implemented, but simplified | Full name, institution, grade, score, subjects, target, language exist. Board/institution taxonomy is still simplified. |
| Bilingual chat | Implemented | EN/RN controls exist and Roman Nepali rewrite guard is present. |
| Streaming answer UX | Implemented | Streaming plus visible thinking states exist. |
| Grounded answer retrieval | Implemented, but content coverage incomplete | Retrieval pipeline works; real syllabus breadth is still narrow. |
| Chat history | Implemented | Search, rename, delete, grouping, lazy load present. |
| Subject Explorer | Implemented (core), partial against BRD | Open subject, start chat, subject detail exist. Advanced filters/sorts are still missing. |
| Save as Note | Implemented | Save, edit, delete, note detail, follow-up link all present. |
| Revision mode | Implemented (core) | Review loop and logging exist. |
| Credits | Implemented (core) | Starter credits, usage deduction, warning, balance APIs exist. |
| Billing | Implemented (manual baseline) | Invoice generation + payment proof submission + admin review exist. Full payment automation not done. |
| Settings | Partial | Profile editing exists, but full BRD breadth is not complete yet. |

---

## Practical current completion view

- Student core loop: **~80% complete**
- Student core loop with BRD-level polish: **~70% complete**
- Full BRD product including broader admin + payment automation: **~60-65% complete**

---

## Biggest code-level risks found during review

1. Board-aware routing is not implemented end to end. Retrieval and explorer are grade-based, but not truly board-scoped yet.
2. Retrieval failures currently degrade silently into ungrounded answers instead of surfacing a clear failure state.
3. Settings and explorer cover the core path, but still miss some BRD-required controls and filters.

---

## Recommended next lock-in order

1. Add board as a first-class student profile field and use it in onboarding, settings, retrieval, and explorer queries.
2. Replace silent retrieval failure fallback with explicit error or explicit "ungrounded answer" UX.
3. Expand official syllabus ingest (Class 11/12 + major subjects) and verify grounded answers per subject.
4. Run one strict live E2E checklist and freeze pass criteria for release.
5. Finish remaining explorer/settings polish before broad admin expansion.
