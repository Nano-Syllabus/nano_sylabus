# Teacher React parity tracker

Source design: `public/nanoenjoy-teacher.html`
Active implementation: `/teachers`
Compatibility route: `/teachers-v2` redirects to the active React workspace.

## Complete with real data

- [x] Teacher auth/onboarding and collection-scoped workspace
- [x] Today summary: classrooms, students, papers, submissions, review queue, needs-attention students
- [x] Subjects: create, archive, required collection folders, real empty states
- [x] Syllabus upload, saved editable units/topics, re-extraction
- [x] Notes and question-bank uploads with indexing state
- [x] File details, preview/download when mirrored, re-index, delete
- [x] Subject-safe chat/answer through `/v1/collection/ask`, with sources and saved teacher response preferences
- [x] Raw semantic source search through `/v1/query`, pinned to the selected teacher subject
- [x] Subject intelligence from collection capture, readiness, syllabus topics/chapters and measured question-bank weightage
- [x] Collection source tree, indexing controls, usage totals, key rotation and destructive collection controls
- [x] Classrooms: create, current/earlier term lists, search, rename, archive and real join/member counts
- [x] Classroom invite code, link and QR; student deep-link join flow
- [x] Classroom roster search, status filtering, lowest/highest/A–Z sorting, incremental pagination, student detail and real exam history
- [x] Classroom notice post/edit/remove and meeting schedule
- [x] Classroom co-teachers with lead/helper labels and lead-only management controls
- [x] Classroom performance summaries, per-exam averages and syllabus topic/chapter map
- [x] Topic-wise struggling students and student chapter-by-chapter detail from real question-level grades
- [x] Asked-but-not-tested, losing-marks-but-never-asked and weak-on-both insights using subject-scoped study-chat evidence
- [x] Classroom material view using the subject's real indexed files
- [x] Export classroom marks to CSV
- [x] Subject-safe `/v1/collection/generate` paper generation with optional chapter scope and question-bank style/weightage
- [x] Backend collection paper history/detail merged with app-owned classroom metadata and safe title/pass-mark/kind/time-limit editing
- [x] Paper questions and private reference answers
- [x] Publish the same paper to matching classrooms with independent dates
- [x] Change assignment dates or remove an exam from a classroom while preserving submissions
- [x] External shareable paper link and dedicated institution-style print/save-PDF layout
- [x] Used-marks counter and printable-paper return link to the exact React paper workspace
- [x] Student joins classroom, sees assigned paper and submits typed answers
- [x] Student exam uses the saved paper kind and time limit; expiry blocks further work and requires submission
- [x] Teacher grades typed answers or uploaded PDF/image answer sheets
- [x] Practice API chapter evaluation, strong topics and weak topics in submission review
- [x] Real classroom/group score distribution and per-student “ahead of” comparison
- [x] Original uploaded answer sheet is stored privately and available to the teacher through a short-lived preview link
- [x] Saved submissions list, per-question score/feedback correction and teacher note
- [x] Pending/reviewed/published result states, individual publish and publish-all
- [x] Bulk-adjust one question across every saved submission
- [x] Multiple attempts per student with assignment limits, teacher attempt history and student attempt history
- [x] Student sees no marks before publish and real marks/feedback after publish
- [x] Teacher name, answer language and answer-style settings

## Requires an additional backend/API contract

- [ ] Add/rewrite/remove/retype individual generated questions. The current Practice API treats generated papers as immutable so its cached grading/reference-answer contract remains correct.
- [ ] Exact paper duplication. The external API has no clone/create-from-question-list endpoint.

## Verification

- ESLint: pass
- Vitest: 127 tests pass after the complete teacher workflow and collection-intelligence wiring
- Next.js production build: pass
- Auth guard: unauthenticated `/teachers` redirects to `/login?next=/teachers`
- Canonical route: `/teachers` renders the real React workspace; `/teachers-v2` redirects to it
- Production Supabase verified with classroom parity, co-teacher, multiple-attempt and classroom-activity schema applied
- Active collection-key smoke check: `/me`, `/subjects`, `/source-tree`, `/usage`, and `/papers` return 200
