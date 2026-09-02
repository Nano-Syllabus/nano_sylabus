# NanoSyllabus Community Flow — Execution Plan

> Branch: `codex/community-semester-flow`
> Started: 2026-08-30
> Status: In progress
> Rule: Check an item only after the implementation and its verification both pass.

## Product outcome

Anyone with a NanoSyllabus account can create a public learning community by entering its university, faculty/programme, total years, and total semesters. NanoSyllabus creates the academic structure automatically. Students can browse and join communities, then open the familiar app dashboard and navigate community → year → semester → subject.

The first deliverable intentionally keeps the existing chat, practice, grading, challenge, notes, and mastery engines. This project changes how academic content is organized and discovered; it does not rewrite the working study tools.

## Confirmed user flow

1. A signed-in user chooses **Create community**.
2. They enter community name, university, faculty/programme, number of years, and number of semesters.
3. NanoSyllabus generates every year and semester slot automatically.
4. The creator opens a semester and attaches an existing Creator Workspace subject. If needed,
   they create the subject and upload its source material through the existing workspace first.
5. Any student can browse public communities and join one.
6. After joining, the student lands in the existing app experience.
7. **My communities** shows joined communities; opening one reveals years, semesters, and subjects.
8. Opening a subject continues into the existing subject study flow.

## Architecture decisions

- [x] Use the dedicated feature branch `codex/community-semester-flow`.
- [x] Keep existing `teacher_courses` and enrollment flows intact during migration.
- [x] Keep Creator Workspace subjects as the only source of truth. Community semesters store
      placement links; they do not create a second subject repository or upload flow.
- [x] Add community tables instead of renaming teacher tables. Existing courses require a teacher profile and store a flat subject list, while communities can be created by any authenticated user and require nested academic terms.
- [x] Use additive Supabase migrations only; never edit an already-applied migration.
- [x] Keep subject study URLs compatible where possible so chat, practice, grading, challenges, and mastery can be connected incrementally.
- [x] Use server-side authorization for create, join, and subject management.
- [x] Make join idempotent: joining twice must not create duplicate memberships.

## Phase 0 — Existing-system audit

- [x] Confirm current branch and working-tree state.
- [x] Inspect public course discovery and enrollment.
- [x] Inspect student dashboard and subject explorer.
- [x] Inspect teacher course ownership and subject attachment.
- [x] Inspect existing challenge/mastery/material capabilities.
- [x] Identify compatibility boundary: community discovery and structure are new; study engines are reusable.

## Phase 1 — Community foundation

- [x] Add `communities` with creator, slug, name, university, faculty, visibility, and status.
- [x] Add generated `community_terms` for year/semester slots.
- [x] Add `community_subjects` scoped to one generated term.
- [x] Add `community_memberships` with creator/member roles and active/left status.
- [x] Add indexes, constraints, RLS, and an atomic community-creation database function.
- [x] Add an atomic, idempotent community-join database function.
- [x] Add validation schemas and stable TypeScript domain types.
- [x] Add a server data layer for browse, detail, joined communities, creation, joining, and subject attachment.

### Phase 1 acceptance criteria

- Creating a 4-year, 8-semester community produces exactly 8 ordered terms.
- Semester 1–2 belong to Year 1, 3–4 to Year 2, 5–6 to Year 3, and 7–8 to Year 4.
- The creator automatically becomes an active creator member.
- A public, active community is visible to everyone.
- A signed-in user can join once; repeating join remains safe.
- Only the creator can attach their Creator Workspace subjects during the first release.

## Phase 2 — APIs

- [x] `GET /api/communities` lists public communities and the current user's membership state.
- [x] `POST /api/communities` creates a community and generated terms.
- [x] `GET /api/communities/[slug]` returns community structure and subjects.
- [x] `POST /api/communities/[slug]/join` joins the signed-in user.
- [x] `GET /api/communities/[slug]/subjects` lists the creator's reusable workspace subjects.
- [x] `POST /api/communities/[slug]/subjects` attaches an existing subject to an owned term.
- [x] Return human, actionable 400/401/403/404/409/502 errors.
- [x] Add API tests for authentication, validation, happy paths, idempotency, and creator authorization.

## Phase 3 — Community UI

- [x] Add `/communities` as the public **Browse communities** catalog.
- [x] Add search and clear empty/no-results states.
- [x] Add accessible create-community form with inline validation and submission state.
- [x] Add `/communities/[slug]` public detail and join flow.
- [x] Add `/app/communities` as the signed-in **My communities** dashboard.
- [x] Add `/app/communities/[slug]` with year/semester navigation and subject cards.
- [x] Let the creator attach an existing Creator Workspace subject inside a selected semester.
- [x] Deep-link new subject creation and source management to Creator Workspace, then return and
      attach the newly created subject automatically.
- [x] After joining, route the student to `/app/communities/[slug]`.
- [x] Include loading, empty, error, and success states for every data-driven screen.

## Phase 4 — Replace course-facing language safely

- [x] Change public navigation and calls-to-action from **Browse courses** to **Browse communities**.
- [x] Change signed-in navigation from **My Subjects/My courses** to **My communities**.
- [x] Keep legacy `/exams` and `/app/explore` routes working until data migration is complete.
- [ ] Add redirects only after all callers and tests use community routes.
- [x] Do not delete teacher course creation in this phase; it remains a separate legacy/teacher capability.

## Phase 5 — Existing study-engine bridge

- [x] Define community subjects as semester links to the existing tenant/indexed subject namespace.
- [x] Reuse existing syllabus, notes, and question-bank upload storage.
- [x] Trigger topic extraction after indexed material is ready.
- [x] Feed extracted topics into existing subject explorer and mastery.
- [x] Generate the three-step challenge: explanation, model answer, student attempt.
- [x] Reuse handwritten upload grading and persist the result against the challenge.
- [x] Add an append-only XP ledger and award XP once per qualifying completion.
- [x] Show XP and topic completion on the student profile/dashboard.

## Phase 6 — Community forum and auto-merge

- [x] Add subject-scoped forum posts and contribution attachments.
- [x] Add one vote per member per post.
- [x] Store the merge threshold on the community, defaulting to 10.
- [x] Use a database transaction/function to cross the threshold exactly once.
- [x] Queue approved contributions for indexing without admin approval.
- [x] Record immutable moderation/merge audit events.
- [x] Add abuse controls: file validation, rate limits, reports, and creator moderation.

## Phase 7 — Verification and release

- [x] Unit-test academic term generation and validation edge cases.
- [ ] Test at 375 px, 768 px, and 1280 px.
- [ ] Verify keyboard order, visible focus, labels, errors, and 40 px touch targets.
- [ ] Verify light and dark themes.
- [x] Run `npm run lint`.
- [ ] Run `npm test`.
- [x] Run `npm run build`.
- [ ] Apply the migration to a non-production Supabase project and run a smoke test.
- [ ] Seed the Ram/Aarav story and walk through it end-to-end.
- [ ] Review the branch diff before merge.
- [ ] Merge only after the checklist and staging smoke test are green.

## Seed scenario for final acceptance

- Community: **SEC BEI**
- University: configurable example value
- Faculty/programme: **BEI**
- Duration: **4 years / 8 semesters**
- Creator: **Ram Bahadur Thapa**
- Student: **Aarav Shrestha**
- Subject: **Computer Networks**, Year 2, Semester 3
- Materials: syllabus, lecture notes, question bank
- Extracted topics: OSI Model, TCP/IP, Routing Algorithms, Network Security
- Challenge result: 82/100, feedback mentions missing fragmentation, +50 XP
- Forum acceptance: a contribution crosses 10 votes and merges exactly once

## Progress log

- 2026-08-30 — Created feature branch and completed existing-system audit.
- 2026-08-30 — Converted the Discord/user-story discussion into this execution checklist.
- 2026-08-30 — Completed the additive community schema, atomic 4-year/8-semester generation, membership model, and server data layer.
- 2026-08-30 — Completed community APIs and the first browse/create/join/semester/subject UI slice.
- 2026-08-30 — Community tests pass (17 tests across domain, API, authorization, and real SQL migration checks).
- 2026-08-30 — Production build passes. Lint passes with two pre-existing warnings outside this feature.
- 2026-08-30 — Full suite: 266/270 tests pass; four pre-existing onboarding/access expectation failures remain and are not caused by community files.
- 2026-08-30 — Added the hidden community learning-space bridge, creator provisioning, subject repository mapping, and enrollment compatibility with existing study engines.
- 2026-08-30 — Added material upload → indexing → topic extraction → immediate member challenge assignment.
- 2026-08-30 — Added handwritten challenge scan grading, idempotent +50 XP awards, and the learning profile.
- 2026-08-30 — Added subject forums, one-member-one-vote threshold crossing, automatic repository indexing, retryable merges, and immutable merge events.
- 2026-08-30 — New SQL migration tests pass, including exactly-once threshold crossing and exactly-once XP. Production build and lint pass; full suite is 272/276 with the same four pre-existing onboarding/access failures.
- 2026-08-30 — Completed forum hardening with a private 20 MB attachment cap, MIME validation, hourly posting limit, member reports, creator hide controls, and audit events.
- 2026-08-30 — Removed the duplicate community subject/upload flow. Semesters now attach existing
  Creator Workspace subjects, and creators deep-link back to the original syllabus/material workspace.
- 2026-08-30 — Fixed community challenge access so active membership resolves the linked Creator
  Workspace subject even though mastery uses the hidden compatibility course.
- 2026-08-30 — Scoped **Open challenges** to the selected community subject, filtered inaccessible
  stale challenge rows, and preserved that scope through completed-challenge pagination.
- 2026-08-30 — Challenge regressions pass (14 targeted tests); production build passes. Full suite is
  282/286 with the same four pre-existing onboarding/access expectation failures.
- 2026-08-30 — Matched the public community catalog and community detail pages to the existing
  dark navy exam-prep visual system, including responsive hero, search, cards, forms, and CTAs.
