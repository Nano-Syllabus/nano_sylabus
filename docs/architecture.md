# Architecture

## Locked architecture goal

Nano Syllabus must behave like an academic system, not a blind PDF-search chatbot.

The AI should:

1. understand what kind of academic question the student is asking
2. resolve the correct scope
3. choose the correct retrieval path
4. gather clean evidence
5. generate a tutor-style answer with citations

## The main architectural mistake we are leaving behind

This is the old weak pattern:

`PDF -> chunks -> top-k vector search -> LLM guess`

Why it fails:

- syllabus/list questions are not chunk-search problems
- top-4 retrieval is too small and too random for broad academic questions
- the model gets noisy or incomplete evidence
- chapter/topic/source discipline becomes weak
- quality problems become hard to debug

## Locked architecture direction

### 1. Academic catalog layer

Use SQL-backed academic structure for:

- boards
- programs
- grades/years
- subjects
- chapters
- topics

Purpose:

- complete syllabus answers
- deterministic chapter/topic listing
- fast scope resolution
- no blind vector dependency for structural questions

### 2. Content layer

Store academic source material as:

- source documents
- document pages
- metadata-rich knowledge chunks
- topic cards
- question-bank items

Purpose:

- textbook-grounded retrieval
- page-aware citations
- chunk types by academic meaning

### 3. Retrieval layer

The system must not use one retrieval path for every question.

We should route questions into the right mode:

- `catalog_list`
- `topic_list`
- `concept`
- `numerical`
- `derivation`
- `exam_answer`
- `comparison`
- `chapter_mode`

### 4. AI orchestration layer

The orchestrator should do:

1. intent routing
2. scope resolution
3. route selection
4. evidence building
5. answer prompt construction

It should not behave like a generic open-domain bot.

### 5. Citation layer

Every strong answer should be able to say:

- which source was used
- which chapter/topic was matched
- which page or page range the content came from

### 6. Admin and evaluation layer

We need:

- retrieval debugger
- prompt testing
- golden benchmark questions
- quality and latency logs
- failure inspection

Without this, quality tuning becomes guesswork.

## Runtime routing model

### Route A. Catalog SQL

Use for:

- full syllabus
- chapter lists
- topic lists
- subject structure

Characteristics:

- no vector search
- no top-k
- deterministic rows from SQL

### Route B. Topic card

Use for:

- fast concept teaching
- stable formula summaries
- common mistakes
- exam angle

Characteristics:

- fast
- cached
- low-latency
- stable for repeated topics

### Route C. Hybrid retrieval

Use for:

- deep textbook explanations
- numericals
- derivations
- solved examples
- chapter-aware long answers

Pattern:

- metadata filter first
- vector + keyword search
- retrieve wide
- rerank narrow
- compress context
- send only clean evidence to the final model

## Grounding guard

This must be a hard rule.

If the system does not have good grounded evidence:

- it should not confidently hallucinate
- it should ask for clarification, narrow scope, or return a grounded failure state

This is especially important for:

- chapter identification
- exact syllabus questions
- textbook-derived engineering explanations

## Chunking philosophy

Do not chunk only by page size.

Chunk by academic meaning, such as:

- concept
- formula
- derivation
- solved example
- exam question
- summary
- common mistake

Each chunk should carry metadata such as:

- board
- program
- grade/year
- subject
- chapter
- topic
- page_start
- page_end
- source document
- chunk type

## Topic cards

Topic cards are a key quality + speed layer.

They should hold:

- core explanation
- simple explanation
- formula sheet
- key terms
- common mistakes
- exam angle
- example problem

They are useful because they:

- reduce retrieval cost
- improve consistency
- give the model cleaner teaching context

## Model role

The model is important, but it is not the main fix by itself.

Model responsibilities:

- routing help
- reranking help
- answer generation
- style control

Quality should come mainly from:

- correct scope
- correct evidence
- correct answer template

Not just “use a better model”.

## Speed principles

- use SQL for lists
- cache stable academic structures
- reduce search space before retrieval
- rerank only a small candidate set
- compress context before final generation
- stream first useful tokens quickly

## Current repository alignment

The current repo already has pieces of this architecture:

- student app
- admin app
- Supabase persistence
- knowledge documents/chunks
- chat route
- hybrid retrieval work
- chapter-mode retrieval work
- tests and build verification

But it is not fully aligned yet.

The main next step is to make the routing and academic data model explicit and deterministic.
