# Implementation Plan

## Purpose

This document answers:

What should we build next, in what order, so the AI quality becomes trustworthy without breaking the product?

## North star

We are building toward:

- textbook-grounded answers
- syllabus-aware routing
- engineering-level explanations
- fast enough chat latency
- clear citations
- measurable quality

## First build sequence

This is the practical order we should follow.

### Step 1. Lock syllabus catalog structure

Build or normalize catalog data for:

- boards
- programs
- grades/years
- subjects
- chapters
- topics

Reason:

- full syllabus and chapter questions should come from SQL, not vector search

### Step 2. Seed one subject completely

Preferably start with one academically important path such as:

- Engineering Physics

Reason:

- better to make one subject excellent than many subjects weak

### Step 3. Route catalog/list questions to SQL

Question examples:

- Physics ko chapters deu
- chapter 2 ko topics deu
- full syllabus deu

These should not hit ordinary RAG.

### Step 4. Enrich chunk metadata

Every chunk should become more explicit about:

- subject
- chapter
- topic
- page range
- source document
- chunk type

### Step 5. Implement router and scope resolver fully

Required question classes:

- catalog_list
- topic_list
- concept
- numerical
- derivation
- exam_answer
- comparison
- chapter_mode

### Step 6. Implement stronger hybrid retrieval and reranking

Pattern:

- metadata filter first
- vector + keyword retrieval
- retrieve wide
- rerank narrow
- compress context

### Step 7. Add citation builder

Every strong answer should resolve to:

- source document
- chapter
- topic
- page range

### Step 8. Add topic cards

For repeated high-frequency topics, use precomputed:

- core explanation
- formula sheet
- common mistakes
- exam angle

### Step 9. Add admin retrieval debugger

Admin should be able to see:

- detected route
- detected scope
- retrieved chunks
- reranked chunks
- final evidence
- latency
- quality outcome

### Step 10. Add golden test questions and evaluation dashboard

We need a benchmark set for:

- accuracy
- clarity
- citation trust
- latency

## Immediate execution phases

### Phase 1. Deterministic academic structure

Goal:

- stop blind retrieval for syllabus and chapter list questions

Deliverables:

- catalog tables or equivalent normalized structure
- SQL-backed syllabus endpoints
- chapter/topic deterministic answers

### Phase 2. Quality-first retrieval

Goal:

- improve grounded answer quality for deep academic questions

Deliverables:

- richer metadata
- reranking
- chapter-aware retrieval
- grounding guard

### Phase 3. Speed without collapse

Goal:

- keep quality while reducing wait time

Deliverables:

- cache stable academic data
- smaller search spaces
- context compressor
- better streaming timing

### Phase 4. Observability and operator control

Goal:

- make AI quality debuggable and measurable

Deliverables:

- retrieval debugger
- benchmark suite
- quality logs
- admin test flows

## Do not do

- Do not use top-4 vector search for full chapter or full syllabus answers.
- Do not send the full textbook to the model.
- Do not rely on model upgrade as the main quality strategy.
- Do not publish unreviewed academic content directly to students.
- Do not mix every question type into one retrieval path.

## What success looks like

We should be able to say:

- chapter and topic questions are deterministic
- deep answers are grounded in the right textbook area
- sources are explainable
- answers are clearer and less generic
- latency is acceptable for chat
- admins can debug failures without guessing

## Repository-level next work

In this repo, the next practical work should be:

1. finish the academic routing split
2. strengthen catalog-backed answers
3. formalize topic-card usage
4. improve admin retrieval debugging
5. add benchmark-quality checks

That is the shortest path to a meaningfully better Nano Syllabus.
