# Global challenge reserves and UI responsiveness — 2026-10-07

Application identities, courses, catalogue and student progress live in Supabase.
Local development uses localhost Supabase; hosted staging uses the destination
project documented in `supabase-project-migration-2026-10-04.md`. Teaching material,
prepared readings and question reserves live in the RAG service's tenant SQLite
indexes on the VPS. Secrets remain in private environment files.

## Challenge preparation

The VPS timer calls the authenticated `/api/internal/challenge-pool/sweep` route.
Each tick discovers up to 200 missing published micro-topics through
`enqueue_global_challenge_catalogue`, then claims up to 12 jobs from the existing
leased queue. Discovery resumes from database state across restarts and concurrent
workers. Draft subjects and source-document containers are excluded. Student
requests retain higher priority than untouched catalogue topics.

The backend prepares the reading, answers and unseen exam reserves before a
student opens a topic. MCQ/hybrid settings determine the additional MCQ reserve.
Written and MCQ questions are claimed under SQLite write transactions and marked
served when issued. A question already issued from this course/topic's reserve
is excluded from future claims. Generated questions also pass through the reserve
before issue; repeated model output cannot reset their served state. Fundamentals
remain shared learning material, separate from the exam reserve.

Every exam issues its paper first, then queues replenishment toward three unseen
sittings (`CHALLENGE_VARIANTS`, configurable). The bounded background queue deduplicates
per tenant, subject, topic and question format, and notices demand arriving during
a refill. The preparation worker pauses during indexing. Its manifest counts only
unseen questions. Up to four ready topics are audited per sweep in order of their
last reserve check; audits request counts without downloading lessons. This
recovers reserves after restarts or failed background jobs without replacing the
cached reading. First-time catalogue preparation is progressive; model and index
availability still determine how quickly the backlog becomes ready.

## UI

Challenge starts and progress saves use TanStack mutations and update the shared
challenge cache. Content polling uses a cancellable query, stops on readiness or
access denial, backs off, pauses in hidden tabs and limits polling attempts.
Exam payloads are excluded from browser persistence.

The Learn-to-Practice button advances immediately and saves both progress flags in
one request, returning to Learn if the save fails. Submission waits for that save.
The root query provider stays mounted during cache restoration. Persistence batches
writes and serializes during browser idle time when supported; deferred writes are
cancelled after sign-out or an account change. The previous account's cache is
cleared before the new account is recorded.

## Activation on the VPS

1. Apply `supabase/migrations/20261007091355_global_challenge_catalogue.sql` to the
   intended database through the normal migration process. The new RPC is
   `SECURITY INVOKER`, executable only by `service_role`; existing RLS is retained.
2. Deploy the updated RAG/API service and application together. SQLite reserve
   tables and indexes are initialized by the backend, without deleting existing
   questions or student attempts.
3. Install/update `scripts/ops/challenge-pool-sweep.sh`, `.service`, and `.timer`
   using the instructions in the script. Keep the existing private sweep URL and
   secret. Reload systemd and enable/restart the timer. It now runs about 30 seconds
   after the previous sweep finishes, with no overlapping systemd runs.
4. Inspect the sweep's JSON outcomes and backend preparation logs while the
   catalogue fills. A `building` response is polled again after 15 seconds rather
   than being parked for two minutes. Existing failure backoff and leases remain.

Code publication alone does not run a migration, install the timer, deploy the
backend or generate the complete catalogue. No Vercel deployment is part of this
change.

## Verification

The SQL discovery and service-role boundary are tested against PGlite/Postgres.
Backend tests exercise parallel written/MCQ claims, issued question consumption,
refill after issue, and preparation/replenishment of previously untouched MCQ topics.
Frontend tests cover the combined progress save, ready-reserve auditing, deferred
cache cancellation and sweep authentication. Lint, TypeScript and the production
build are checked separately from the full frontend suite. The full suite retains
older failures in material-route fixtures, catalogue recovery and UI assertions;
these do not constitute a passing full frontend suite.

Final verification: the backend challenge and MCQ suites passed 323 tests. The
focused frontend run passed 52 tests; the full frontend run passed 1,521 and
failed 17 tests across 11 files. The production build and TypeScript check passed.
A headless browser opened the mobile landing page and login page with HTTP 200
and no uncaught JavaScript errors; password visibility and theme toggles worked.
This was a smoke check, not a before/after performance benchmark.
