# Golden Test Set

This file tracks the first-pass academic benchmark for Nano Syllabus.

The goal is simple:

- stop guessing
- lock core academic routes
- measure whether the app still answers the same important questions correctly

## First benchmark subject

The first locked benchmark subject is:

- `Engineering Physics`

We start with one subject because:

- it is already one of the most important test cases in the product
- it has been a real source of wrong/generic answers
- it is a good stress test for syllabus structure, topic teaching, and exam-question flows

## First-pass golden scenarios

The first benchmark currently covers six important question types:

1. chapter list
2. chapter topic list
3. ordinal chapter lookup
4. exam question-bank lookup
5. persisted topic-card concept answer
6. chapter-mode deep answer

These scenarios are intentionally small at first.

The point is not to create a giant benchmark immediately.
The point is to lock the highest-value academic behaviors first.

## What this benchmark checks

For each scenario, we verify:

- the correct route path was used
- the correct answer mode was used
- the answer still contains the required academic content
- the assistant response still persists correctly

This means we are no longer relying only on “it feels better”.

We can now say:

- this route stayed stable
- this answer class stayed grounded
- this academic behavior did not silently regress

## What this benchmark does not yet check

Not yet covered:

- answer scoring by rubric
- latency thresholds
- multi-subject confusion tests
- citation formatting precision
- chapter-mode long-answer completeness scoring
- failure-mode guardrail tests for every intent

Those will come in later benchmark phases.

## Files

- Golden scenarios:
  - [tests/fixtures/golden-engineering-physics.ts](/Users/sumangiri/Desktop/padhai/tests/fixtures/golden-engineering-physics.ts)
- Golden runtime test:
  - [tests/golden/engineering-physics-golden.test.ts](/Users/sumangiri/Desktop/padhai/tests/golden/engineering-physics-golden.test.ts)

## Why this matters

Without a golden set, quality work stays emotional.

With a golden set, we can tell:

- if the architecture is actually improving the app
- if a refactor broke a core academic route
- if engineering answers are becoming more reliable or not

This is the first real step from:

- “we think it is getting better”

to:

- “we can prove this route still works”
