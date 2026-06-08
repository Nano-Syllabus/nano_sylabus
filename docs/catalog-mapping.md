# Catalog Mapping

This document translates the current Nano Syllabus database into the first locked academic structure we need next.

The purpose is simple:

- do not redesign blindly
- do not break the current app
- do create a clean path toward deterministic syllabus and chapter answers

## Core principle

We already have useful academic data in the current schema.

So Phase 1 should start with:

1. map what already exists
2. identify what is missing
3. route deterministic questions through the right structure

Not:

1. throw away the current schema
2. replace everything at once

## Current academic data sources

### `student_profiles`

Useful for:

- student board
- student grade
- selected subjects
- language preference

This table gives user context, but it is not the academic catalog itself.

### `knowledge_notebooks`

Current role:

- closest existing academic container
- already groups board, level, faculty, subject, curriculum

Current practical meaning:

- one notebook is roughly one academic subject container for a specific board/level/subject path

Useful fields already present:

- `board`
- `level`
- `faculty`
- `subject`
- `curriculum`
- `title`

### `knowledge_documents`

Current role:

- resource-level content container
- usually one chapter/unit/file/resource inside a notebook

Useful fields already present:

- `notebook_id`
- `board`
- `grade`
- `subject`
- `chapter`
- `title`
- `source_name`
- `source_type`
- page/source-related metadata

### `knowledge_chunks`

Current role:

- chunk-level retrieval evidence
- current AI retrieval layer depends on this

Useful fields already present:

- `document_id`
- `board`
- `grade`
- `subject`
- `chapter`
- `topic`
- `content`
- `chunk_index`
- `embedding`

## Target academic structure

The locked architecture wants this shape:

- board
- program
- grade/year
- subject
- chapter
- topic

## Practical mapping: current -> target

### Board

Target meaning:

- NEB, TU, KU, PU, CTEVT, Engineering, etc.

Current source:

- `knowledge_notebooks.board`
- `knowledge_documents.board`
- `student_profiles.board`

Phase 1 decision:

- treat `knowledge_notebooks.board` as the current source of truth for academic retrieval scope

### Program

Target meaning:

- Science, Management, BE Computer, BBS, Bachelor path, etc.

Current source:

- partially implicit in `knowledge_notebooks.faculty`
- partially implicit in notebook title / curriculum

Phase 1 decision:

- derive an initial `program` layer from `knowledge_notebooks.faculty` plus normalized title rules
- do not block progress waiting for a perfect dedicated `programs` table

### Grade / Year

Target meaning:

- Class 11, Class 12, Year 1, Semester 2, Bachelor year, etc.

Current source:

- `knowledge_notebooks.level`
- `knowledge_documents.grade`
- `student_profiles.grade`

Phase 1 decision:

- normalize around notebook/document academic level first
- student profile remains personalization input, not catalog source of truth

### Subject

Target meaning:

- Physics, Engineering Physics, Chemistry, English, etc.

Current source:

- `knowledge_notebooks.subject`
- `knowledge_documents.subject`
- `student_profiles.subjects[]`

Phase 1 decision:

- treat `knowledge_notebooks.subject` as current deterministic subject catalog key
- `student_profiles.subjects[]` should be used only for student preference and filtering

### Chapter

Target meaning:

- stable chapter/unit list per subject

Current source:

- `knowledge_documents.chapter`
- `knowledge_chunks.chapter`

Phase 1 decision:

- build deterministic chapter list from `knowledge_documents`
- not from top-k chunk retrieval

### Topic

Target meaning:

- topic/subtopic list inside a chapter

Current source:

- `knowledge_chunks.topic`

Phase 1 decision:

- build deterministic topic list from grouped `knowledge_chunks.topic`
- later replace with a cleaner dedicated topic catalog if needed

## What we can already answer deterministically

Using current tables, we should be able to support:

- subject-level notebook listing
- chapter list for a notebook/subject
- topic list for a chapter
- chapter/resource counts
- source-document-based chapter lookup

These should not require ordinary vector retrieval.

## What is still missing

The current schema is workable, but not yet clean enough in these areas:

- no dedicated normalized `programs` table
- no dedicated normalized `chapters` table
- no dedicated normalized `topics` table
- some academic structure still lives inside free-text fields
- topic naming can be inconsistent across chunks

## Phase 1 implementation decision

So the right move is:

### Now

- keep current tables
- create deterministic catalog queries from:
  - `knowledge_notebooks`
  - `knowledge_documents`
  - `knowledge_chunks`
- use those for syllabus/chapter/topic questions

### Later

- add cleaner normalized catalog tables
- backfill them from reviewed notebook/document/chunk data
- migrate routes gradually

## First concrete build outputs

Step 1 should produce these capabilities:

1. list all available subject containers from `knowledge_notebooks`
2. list all chapters for a selected notebook/subject from `knowledge_documents`
3. list all topics for a selected chapter from `knowledge_chunks`
4. log detected subject/chapter/topic scope before deeper retrieval

## What this unlocks

Once this mapping is in place:

- syllabus and chapter questions become deterministic
- deep retrieval can start from the correct academic scope
- answer quality becomes easier to improve
- admin debugging becomes easier

## Short version

- current schema is not perfect, but it is enough to start Phase 1
- `knowledge_notebooks` = current subject container
- `knowledge_documents` = current chapter/resource layer
- `knowledge_chunks` = current topic/evidence layer
- first build should route deterministic academic questions through these tables instead of blind retrieval
