# Tenant API Migration Plan

This plan switches Nano Syllabus from the current in-house RAG answer path to the external tenant API while keeping the app's auth, onboarding, and chat UX intact.

## Decision

We will stop using the local knowledge-retrieval and answer-generation pipeline for student chat.

We will use the external tenant API as the source of truth for:

- academic scope
- available subjects
- answer generation
- tenant indexing status

We will keep Supabase only for app product state such as:

- authentication
- student profile
- onboarding completion
- chat session history
- saved notes
- billing and credits, if we still want product-side usage control

## Important Rule

Do not call the tenant API directly from the browser.

Reasons:

- the tenant bearer token would be exposed
- the current endpoint uses a self-signed certificate
- we may need request shaping, retries, caching, and error normalization

The frontend should call internal Next.js API routes, and those routes should call the tenant API server-side.

## Current Areas To Replace

### Onboarding subject catalog

Current source:

- `components/onboarding-form.tsx`
- `app/api/knowledge/options/route.ts`
- `lib/data/knowledge-catalog.ts`

Change:

- replace local knowledge catalog reads with tenant-backed catalog data
- use tenant subjects as the source for the subject selection step

### Explore page

Current source:

- `app/app/explore/page.tsx`
- `lib/data/explorer.ts`

Change:

- stop deriving subjects from local knowledge catalog
- stop relying on only profile-selected subjects
- show all tenant subjects for the relevant engineering scope

### Chat answer generation

Current source:

- `app/api/chat/route.ts`
- `lib/ai/retrieval.ts`
- prompt/runtime/topic-card deterministic branches

Change:

- replace the answer pipeline with a tenant prompt proxy
- pass the chosen subject, namespace, folder path, prompt, and user id to the tenant API
- keep session creation and message persistence in our app if we still want chat history

## New Internal API Layer

### `GET /api/tenant/catalog`

Purpose:

- return normalized engineering onboarding and explore data from tenant APIs

Suggested response shape:

- `faculties`
- `levels`
- `branches`
- `semesters`
- `subjects`
- `subjectsByBranchSemester`

Tenant sources:

- `GET /tenant/namespaces`
- `GET /tenant/subjects`

### `POST /api/tenant/prompt`

Purpose:

- secure proxy for answer generation

Request from frontend:

- `sessionId`
- `subjectSlug`
- `namespaceSlug`
- `folderPath`
- `prompt`
- `mode`

Server-side behavior:

- attach bearer token
- call tenant `POST /v1/prompt`
- normalize errors
- optionally persist user and assistant messages to our own chat tables

### `GET /api/tenant/status`

Purpose:

- expose safe ingest health to admin or debugging UI

Tenant sources:

- `GET /tenant/collections`
- `GET /tenant/source-tree`

## What To Keep vs What To Bypass

### Keep

- Supabase auth
- `student_profiles`
- route protection
- onboarding completion logic
- chat session and message history
- notes
- billing if desired

### Bypass or remove from student answer path

- `lib/ai/retrieval.ts`
- local knowledge chunk retrieval
- deterministic catalog answer branches
- topic-card hybrid answer routing
- local syllabus-grounding headers and metrics
- `app/api/knowledge/options` in its current local-catalog form

### Keep only if admin still needs it

- admin knowledge upload and processing screens
- local knowledge notebooks
- topic-card seeding tools

These can stay temporarily, but they should no longer power the student answer path.

## Recommended Migration Order

### Phase 1

- add tenant env helpers
- add a reusable server-side tenant client
- add `GET /api/tenant/catalog`
- switch onboarding subject step to tenant catalog

### Phase 2

- switch explore page to tenant subjects
- stop limiting explore to only selected profile subjects

### Phase 3

- add `POST /api/tenant/prompt`
- switch chat composer from `/api/chat` local RAG answering to tenant-backed answering
- keep chat session persistence in our own database

### Phase 4

- hide or remove local RAG-specific UI wording like grounded chunk traces
- simplify retrieval mode labels to match tenant-backed behavior

### Phase 5

- remove unused local retrieval code after the new path is stable

## Key Product Choice

There are two valid approaches for chat history:

### Option A: keep our chat sessions database

Best if we want:

- chat history
- pinned sessions
- notes linked to messages
- analytics
- credit tracking

### Option B: make the app stateless

Best if we want:

- the simplest architecture
- no message persistence

This would remove a lot of product features, so Option A is the safer recommendation.

## Main Recommendation

Use the tenant API for content and answers, but keep Supabase for product state.

That means:

- external API for subject catalog and answering
- internal database for auth, profile, session history, and notes

This gives the frontend the same UX, without exposing the tenant key and without depending on the old local RAG stack.
