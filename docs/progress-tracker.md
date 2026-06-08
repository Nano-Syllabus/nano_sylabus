# Progress Tracker

This is the live execution board for Nano Syllabus.

Use it to answer three simple questions at any time:

1. What is already done?
2. What are we building right now?
3. What is the next locked step?

## Status key

- `[x]` done
- `[~]` in progress
- `[ ]` next
- `[-]` later / not started yet

## North star

We are building Nano Syllabus into a textbook-grounded, syllabus-aware, engineering-level AI study product that is:

- academically correct
- fast enough for chat
- explainable with citations
- measurable through logs and tests

## Big-picture progress

### Stage 0. Product shell

- [x] student app exists
- [x] admin app exists
- [x] auth, onboarding, notes, billing, and settings flows exist
- [x] Supabase persistence exists

### Stage 1. Knowledge baseline

- [x] knowledge documents exist
- [x] knowledge chunks exist
- [x] admin knowledge management baseline exists
- [x] retrieval-aware chat baseline exists

### Stage 2. Locked academic architecture

- [x] architecture direction is now locked
- [~] routing split is partially implemented
- [x] catalog-backed syllabus and chapter answers are now deterministic for the first important flows
- [~] topic-card path is now partially first-class
- [~] question-bank path is now partially first-class

### Stage 3. Quality hardening

- [x] grounded-context guard exists for key study routes and runtime fake fallback answers have been removed
- [~] stronger reranking is now partially live
- [~] citation builder is now partially formalized
- [~] chapter-mode answer quality is now partially hardened

### Stage 4. Speed hardening

- [~] cache stable catalog data
- [~] reduce broad retrieval search space
- [~] compress context before final answer
- [~] improve time-to-first-useful-token

### Stage 5. Observability

- [~] retrieval debugger (assistant route/scope/model trace now visible in admin answers)
- [x] golden test set
- [~] quality dashboard
- [ ] latency dashboard

## What is already done

### Product and platform

- [x] student-facing chat app is running
- [x] admin panel is running
- [x] Google OAuth and account flows are wired
- [x] billing and credits foundation exists
- [x] chat sessions and messages persist in Supabase
- [~] assistant answers now persist route/debug trace metadata for admin inspection when schema supports it

### Knowledge and AI baseline

- [x] textbook resources can be stored and managed
- [x] knowledge chunks are persisted
- [x] retrieval tests exist
- [x] chapter-mode retrieval path exists in the codebase
- [x] grounded-failure safeguards exist
- [x] runtime fake-answer path has been removed from the real study app

### Planning and architecture

- [x] current-state docs are written
- [x] implementation plan is written
- [x] roadmap is written
- [x] architecture direction is documented

## Current active focus

### Locked current mission

- [~] stop blind retrieval for syllabus, chapter, and topic questions
- [~] make academic scope resolution cleaner and more deterministic
- [~] separate list questions from deep textbook explanation questions

### Current first step

We are now starting with:

## Step 1. Lock syllabus catalog structure

- [x] define the exact catalog shape we will trust:
  - board
  - program
  - grade/year
  - subject
  - chapter
  - topic
- [x] map current database tables to this academic structure
- [x] convert this mapping into first deterministic app routes
- [x] identify the first answers that should come from SQL/catalog only
- [x] stop using ordinary retrieval for full syllabus/chapter/topic list questions
- [x] make chapter/topic answers deterministic where possible

### Why this is the first step

If the system cannot reliably answer:

- “my subject ko chapters deu”
- “chapter 2 ko topics deu”
- “this subject ko syllabus structure k ho”

then deeper AI quality will always stay unstable.

So the first real build step is not “better prompting”.

It is:

- correct academic structure
- correct scope resolution
- correct route selection

## After Step 1, what comes next?

### Step 2. Quality-first retrieval

- [ ] enrich chunk metadata
- [ ] finalize router intents
- [ ] strengthen hybrid retrieval
- [~] improve reranking
- [~] formalize grounding guard

### Step 3. Stable teaching layer

- [~] create topic cards for high-frequency topics
- [ ] add formula sheets
- [ ] add common-mistake support
- [ ] add exam-angle support
- [~] exam-style questions can now use deterministic question-bank-first routing before blind retrieval
- [~] persisted topic-card lookup has started, with stored academic cards preferred before derived chunk-only context
- [~] admin knowledge workspace can now generate, edit, review, publish, and delete topic cards for a processed resource

### Step 4. Observability and trust

- [~] retrieval debugger in admin now shows route/scope/model/timing trace for reviewed answers
- [x] golden test questions
- [~] answer quality measurement
- [ ] latency measurement

## Simple success checkpoints

We can say Step 1 is truly done when:

- [x] chapter list questions no longer rely on generic vector search
- [x] topic list questions no longer rely on generic vector search
- [x] syllabus structure answers are complete, not partial
- [x] subject/chapter/topic scope is explainable in logs
- [~] concept answers can now use topic-card teaching context, preferring stored academic cards before derived fallback
- [~] exam-style questions can now use deterministic question-bank lookup when grounded question-bank evidence exists
- [~] admin can now review and publish topic cards directly from the knowledge workspace after processing a resource

We can say quality hardening is working when:

- [ ] wrong chapter answers drop sharply
- [x] generic fake fallback answers have been removed from the real runtime
- [~] sources are becoming clearer and more trustworthy through grouped citations + placeholder cleanup
- [~] chapter-mode now forces a structured deep-answer path with ordered section guidance instead of using the same generic prompt as quick QA

We can say speed hardening is working when:

- [ ] simple academic questions feel instant
- [ ] deep answers are still grounded but noticeably faster
- [~] repeated subject/chapter/topic/question-bank lookups can now reuse short-lived in-memory catalog cache instead of always re-hitting Supabase
- [~] retrieval now uses chapter/unit hints earlier to narrow the candidate search space before ranking
- [~] final grounding context is now more compact and structured before it is sent to the answer model
- [~] new chats now skip DB history reload and existing chats use a smaller adaptive history window before streaming begins

## Very short version

- [x] foundation exists
- [x] architecture is now clear
- [~] current work is academic routing discipline
- [x] deterministic subject + chapter + topic handling is live for the first important flows
- [~] deterministic exam/question-bank handling is now partially live
- [~] admin answer review is beginning to expose route/scope/model trace, not just raw answer text
- [~] admin answers now include a first-pass health dashboard showing grounded rate, fallback rate, latency, and route/model mix for the current filtered sample
- [x] first-pass Engineering Physics golden benchmark is now green for chapter list, topic list, ordinal chapter lookup, exam-question path, persisted topic-card path, chapter-mode deep-answer path, and first numerical/derivation/comparison answer contracts
- [~] persisted topic-card infrastructure is now partially live
- [~] admin topic-card review/publish flow is now partially live
- [~] cleaner reranked evidence and grouped citations are now partially live
- [~] chapter-mode now uses structured deep-answer prompting with explicit section ordering guidance
- [~] first speed-pass now caches deterministic catalog data and compresses model grounding context
- [~] retrieval search now begins with chapter/unit narrowing when the question clearly carries that scope
- [~] stream startup now avoids unnecessary history fetches for new chats and trims DB history more aggressively for existing chats
- [~] runtime study answers now refuse to guess when grounded syllabus/textbook evidence is missing
- [ ] after that we harden engineering answer reliability, then latency visibility, then final polish

## Clean business view

If we explain this to ourselves or investors in simple language:

- [x] we have a real app
- [x] we have a real admin
- [x] we have real academic data storage
- [x] we have started replacing blind AI behavior with structured academic routing
- [~] we are now in the answer-quality hardening phase
- [~] speed is improving, but not yet fully optimized
- [ ] we are not yet at “fully reliable engineering tutor” level
