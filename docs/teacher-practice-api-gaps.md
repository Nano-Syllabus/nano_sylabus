# Teacher Practice API gaps

The React teacher workspace is ready to expose question editing and exact paper cloning, but the collection-scoped Practice API currently returns immutable generated papers. The following server contract is required so edits remain teacher-scoped and grading never uses stale cached reference answers.

Paper kind, time limit, and attempts are not Practice API gaps: they are app-owned metadata. The submission identity is versioned by assignment, student, and attempt number, with the assignment enforcing a 1–10 attempt limit.

## Required capability discovery

`GET /api/v1/practice/capabilities`

```json
{
  "paper_question_mutation": true,
  "paper_clone": true,
  "paper_revision": true
}
```

The UI must keep mutation controls hidden unless the collection key receives these capabilities.

## Add a question

`POST /api/v1/practice/papers/{paper_id}/questions`

```json
{
  "question_type": "short",
  "text": "State Lenz's law.",
  "marks": 3,
  "chapter": "Electromagnetic induction",
  "options": [],
  "reference_answer": "The induced current opposes the change producing it."
}
```

Returns the complete updated paper with a new monotonic `revision`.

## Rewrite, retype, or edit a question

`PATCH /api/v1/practice/papers/{paper_id}/questions/{question_id}`

```json
{
  "expected_revision": 4,
  "question_type": "long",
  "text": "Explain Lenz's law with one example.",
  "marks": 6,
  "options": [],
  "reference_answer": "..."
}
```

- Return `409` when `expected_revision` is stale.
- Rebuild the reference answer and grading cache before returning success.
- Preserve the question ID when rewriting/retyping so saved drafts can reconcile safely.

## Remove a question

`DELETE /api/v1/practice/papers/{paper_id}/questions/{question_id}`

```json
{ "expected_revision": 5 }
```

Return the updated paper and total marks. Reject removal when submissions already exist unless the caller explicitly creates a new revision; historical submissions must continue pointing to their original paper revision.

## Exact paper clone

`POST /api/v1/practice/papers/{paper_id}/clone`

```json
{
  "title": "Midterm exam — copy",
  "include_reference_answers": true
}
```

The response must contain a new `paper_id`, `share_url`, question IDs, and revision. The clone belongs to the same collection implied by the collection key; accepting a namespace or collection argument would weaken tenant isolation.

## Security invariants

- Accept collection keys only; never the tenant operator key.
- Resolve the collection from the key and never from request data.
- A paper from another teacher must return `404`, not `403`.
- Never expose reference answers through student-facing paper responses.
- Existing submissions and published results remain attached to the exact paper revision they were graded against.

## Multiple attempts — implemented in the app database

`teacher_exam_submissions` now stores `attempt_no` and is unique by `(assignment_id, student_id, attempt_no)`. `teacher_exam_assignments.max_attempts` enforces the server-side limit, while teacher and student routes preserve the complete attempt and review history.
