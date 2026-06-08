# Nano Syllabus

Nano Syllabus is a bilingual AI study companion for Nepal-focused academics. The product goal is simple:

- students ask in English or Roman Nepali
- the system understands the academic scope correctly
- it retrieves the right syllabus/textbook evidence
- it answers with clear tutor-style explanations and citations

This repository contains the active `padhai` product: student app, admin surface, backend routes, Supabase data layer, and the evolving AI retrieval system.

## Current position

The project is no longer just a prototype. We already have:

- real auth and onboarding
- student chat, notes, billing, and settings flows
- admin knowledge, billing, auth, chat, revision, and prompt surfaces
- Supabase-backed persistence
- Gemini-backed answering
- textbook ingestion and chunk storage
- retrieval logs, tests, and evolving grounded-answer safeguards

The main gap is not “do we have an app?”  
The main gap is:

- can the AI answer with reliable academic quality?
- can it route different question types correctly?
- can it stay fast while staying grounded?

## Where We Are Now

This is the honest app-level status right now.

### Already real

- [x] student app shell is running
- [x] admin app shell is running
- [x] auth, onboarding, notes, billing, and settings flows are real
- [x] chat sessions and messages persist in Supabase
- [x] knowledge notebooks, documents, and chunks are manageable from admin
- [x] deterministic subject, chapter, topic, and full syllabus answers are live
- [x] fake runtime fallback answers have been removed from the real app
- [x] first-pass golden academic quality tests exist and are green

### Partially built

- [~] topic cards are now part of the runtime and admin flow, but the academic corpus is still being matured
- [~] question-bank / exam-answer routing is now real, but not yet deep enough across all subjects
- [~] hybrid retrieval is real, but still being tuned for stronger chapter/topic control
- [~] reranking and grouped citations are now partially live
- [~] chapter-mode answers are stronger, but not yet fully reliable for all hard engineering questions
- [~] speed hardening has started: cache, search narrowing, compact grounding, and adaptive history are in place
- [~] admin answer observability has started: route, scope, model, timing, and quality dashboard are visible

### Still left

- [ ] fully reliable engineering-grade answers across difficult question types
- [ ] final citation discipline everywhere
- [ ] stronger retrieval debugger and latency dashboard
- [ ] full ingestion review/publish discipline
- [ ] final production-grade AI polish

## Locked goal

We are locking the product around one standard:

> Nano Syllabus must produce textbook-grounded, syllabus-aware, engineering-level answers fast enough for a chat product.

That means quality should come from:

1. correct intent detection
2. correct academic scope resolution
3. correct retrieval path
4. correct evidence selection
5. correct answer template
6. clear citations and reviewability

Not from blindly sending top-4 chunks to a model.

## Locked architecture direction

The AI system should not search blindly. We are moving toward this split:

### 1. Catalog SQL path

Use SQL for:

- syllabus lists
- chapter lists
- topic lists
- board/program/year/subject structure

These questions should not rely on vector retrieval.

### 2. Topic-card path

Use topic cards for:

- fast teaching context
- stable concept explanations
- formula summaries
- common mistakes
- quick exam-angle support

### 3. Hybrid retrieval path

Use metadata filter + vector + keyword + rerank for:

- deep textbook explanations
- derivations
- numericals
- solved examples
- chapter-aware long-form answers

### 4. Grounding guard

If the system does not have strong grounded evidence, it should not bluff confidently.

### 5. Citation layer

Answers should resolve back to:

- textbook/source
- chapter
- topic
- page or page range

## Repository structure

```text
app/         Next.js pages and API routes
components/  UI and client/server interaction layers
lib/         Data, auth, billing, AI, retrieval, Supabase helpers
scripts/     Ingestion and developer utilities
supabase/    SQL migrations
tests/       Vitest and E2E coverage
docs/        Product, architecture, roadmap, and implementation docs
data/        Prepared syllabus/textbook assets used in ingestion
```

## Source-of-truth docs

Start here:

- [Docs Index](./docs/README.md)
- [Progress Tracker](./docs/progress-tracker.md)
- [Locked Architecture](./docs/architecture.md)
- [Current State](./docs/current-state.md)
- [Implementation Plan](./docs/implementation-plan.md)
- [Roadmap](./docs/roadmap.md)

Supporting docs:

- [Product Overview](./docs/product-overview.md)
- [Goals and Metrics](./docs/goals-and-metrics.md)
- [Scope and Requirements](./docs/scope-and-requirements.md)
- [Data Model](./docs/data-model.md)
- [Admin Panel](./docs/admin-panel.md)
- [Local Setup](./docs/local-setup.md)
- [Syllabus Ingest Format](./docs/syllabus-ingest-format.md)

## What is already real

### Student app

- auth
- onboarding
- chat sessions and messages
- note save and revision flow
- billing and credit awareness
- settings and account actions

### Admin app

- auth users and student profiles views
- chat sessions and message inspection
- knowledge notebooks/documents/chunks operations
- prompt templates
- subscription, invoice, payment, and credits views
- revision and note admin views

### AI and data layer

- Supabase/Postgres persistence
- Gemini-based answer generation
- chunked knowledge storage
- hybrid retrieval primitives
- chapter-mode retrieval path
- retrieval tests and grounded-context safeguards

## What is still not fully solved

- answer quality consistency for hard academic questions
- strict separation between syllabus lookup and deep textbook reasoning
- richer topic-card system
- question-bank/exam-answer routing
- stronger live retrieval debugging
- stronger quality observability and benchmark runs
- cleaner long-answer UX in student chat

## Practical next plan

### Phase 1. Lock academic structure

- make catalog routes deterministic
- stop using vector search for syllabus/chapter/topic lists
- normalize scope resolution around subject/chapter/topic

### Phase 2. Improve answer quality

- strengthen retrieval routing by intent
- use topic cards for stable teaching answers
- use chapter-aware hybrid retrieval for deep answers
- enforce grounding guard when evidence is weak

### Phase 3. Improve speed without losing quality

- cache subject/chapter/topic data
- narrow search space before vector retrieval
- rerank only a small candidate set
- compress context before final answer generation

### Phase 4. Improve observability and trust

- retrieval debugger for admin
- golden test set
- quality and latency tracking
- answer evaluation loop

## Immediate next steps

These are the next locked steps from the current point:

1. harden engineering-grade answers against real subject questions
2. make topic cards richer and more review-driven
3. deepen question-bank / exam-answer quality
4. improve citation trust and latency visibility
5. keep reducing broad blind retrieval paths

## Working rules

- Do not use top-4 vector retrieval for full syllabus or chapter lists.
- Do not send whole textbooks blindly to the final model.
- Do not depend on model upgrade alone as the quality fix.
- Do not publish auto-ingested content directly to students without review.

## Runtime requirements

To run the current app end to end, configure:

- Supabase project
- Supabase migrations
- env variables from `.env.example`
- Gemini API key(s)
- `SUPABASE_SERVICE_ROLE_KEY`

Useful commands:

- `npm run dev`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run ingest:syllabus -- <path-to-documents.json>`

## Developer note

This repo should now be treated as an evolving academic AI system, not a generic chatbot app.

Every major change should answer three questions:

1. does this improve scope correctness?
2. does this improve evidence quality?
3. does this improve answer trust without making speed unacceptable?
