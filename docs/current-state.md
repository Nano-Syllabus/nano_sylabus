# Current State

## Executive summary

Nano Syllabus already has a real product shell.

We are not at “idea only” stage anymore.

We already have:

- a running student app
- a running admin surface
- real auth
- real persistence
- billing and credits
- textbook ingestion
- grounded answer infrastructure

The product is functional.

The main weakness is that the AI system is still only partially academic-aware.

## What is real right now

### Student product

- landing and marketing pages
- signup, login, logout
- Google OAuth
- password reset flow
- onboarding flow
- chat sessions and chat history
- notes and revision flows
- billing page
- settings page

### Admin product

- auth users and student profiles
- chat sessions and chat messages views
- revision notes and revision logs views
- knowledge notebooks
- knowledge documents
- knowledge chunks
- payment submissions
- invoices
- subscription plans
- user subscriptions
- credits ledger
- prompt templates

### Data and platform

- Supabase Auth
- Supabase Postgres
- storage-backed academic document handling
- knowledge chunk persistence
- retrieval logs and test coverage

### AI layer

- Gemini-powered answers
- retrieval-aware chat route
- chapter-mode retrieval path
- grounded-context guard for key study routes
- retrieval mode in chat UI
- deterministic subject/chapter/topic/full-syllabus answer paths
- first-pass topic-card and question-bank routing

## Where the quality problem still is

The product shell is real, but answer quality is still uneven.

Main causes:

- not all question types are routed differently yet
- catalog/syllabus logic is not fully separated from deep retrieval
- topic-card layer is not fully mature
- question-bank route is not fully mature
- engineering-level answers still need stronger real-world hardening

So the problem is not:

- “we do not have an app”

The problem is:

- “the AI brain is not fully structured yet”

## Current strengths

- real end-to-end user loop exists
- admin already manages many tables
- knowledge-base operations are present
- retrieval architecture is improving
- tests and builds are running
- the repo is capable of evolving into a proper academic system

## Current weaknesses

### AI and retrieval

- broad academic questions can still retrieve too narrowly
- list/syllabus questions should be more deterministic
- deep textbook answers still need stronger chapter/topic control
- grounding failures still need better UX and stricter handling

### Content operations

- ingestion quality review needs to be stronger
- topic-card generation/review is still incomplete
- question-bank path is not fully first-class

### Observability

- quality dashboard has started, but is not fully operational yet
- golden benchmark evaluation loop has started, but is not fully operational yet
- admin retrieval debugging can grow more powerful

### UX

- chat space still needs polishing
- citation/source presentation can become clearer
- long-answer mode and chapter-mode UX can become more explicit

## Honest status label

If we describe the project honestly:

- product shell: strong
- admin operations: good baseline
- knowledge system: promising but unfinished
- AI quality consistency: improving, but not locked yet
- architecture direction: now much clearer

## What “done enough for current stage” means

At this stage, success is:

- correct syllabus lists from SQL
- stronger chapter/topic scoping
- cleaner evidence retrieval
- grounded answers for textbook questions
- safer fallback behavior
- measurable quality logs

That is the next true checkpoint.
