# Roadmap

## Roadmap principle

We are not trying to become a generic AI app.

We are building a curriculum-aware academic AI system.

So the roadmap should follow this order:

1. academic correctness
2. grounded answer quality
3. speed and stability
4. operator control
5. automation and scale

## Stage 0. Product shell and foundation

### Outcome

- working Next.js student app
- working admin baseline
- auth, persistence, notes, billing, admin operations

### Status

- done

## Stage 1. Initial knowledge and grounding baseline

### Outcome

- knowledge documents and chunks
- first retrieval-based answers
- student chat grounded in some source context

### Status

- done, but quality not fully mature

## Stage 2. Locked academic architecture

### Outcome

- clear split between catalog SQL, topic cards, and hybrid retrieval
- proper intent routing
- chapter/topic-aware retrieval discipline

### Status

- current main focus

## Stage 3. Quality hardening

### Outcome

- stronger reranking
- citation builder
- grounding guard
- cleaner deep-answer generation
- chapter-mode reliability

### Status

- next active build area

## Stage 4. Speed hardening

### Outcome

- cached catalog data
- smaller search spaces
- better context compression
- faster first useful token

### Status

- after routing and quality hardening

## Stage 5. Observability and admin intelligence

### Outcome

- retrieval debugger
- golden test questions
- quality dashboard
- latency dashboard
- failure analytics

### Status

- upcoming

## Stage 6. Full academic operations

### Outcome

- reviewed topic-card workflow
- question-bank operations
- content publishing pipeline
- stronger admin knowledge QA

### Status

- later, after core routing is trusted

## Stage 7. Automation and scale

### Outcome

- more automation
- more resilient pipelines
- stronger support tooling
- performance and scaling improvements

### Status

- later

## What “next” means right now

Right now, next does not mean “add random features”.

It means:

1. make syllabus and chapter answers deterministic
2. make deep textbook retrieval more accurate
3. make grounded failures safer
4. make answer quality measurable

If we do those four well, the rest of the roadmap becomes much easier.
