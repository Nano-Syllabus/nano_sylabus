# Teacher workspace product review

Reviewed surfaces: `public/nanoenjoy-teacher.html`, active `/teachers`, `/api/teacher/*`, student classroom/exam routes, and the collection-scoped Teacher/Practice APIs.

## Product snapshot

- User: a teacher who owns one isolated collection.
- Core job: index trusted course material, generate and publish exams, review AI grading, and release results.
- Stage: active feature-complete teacher workspace with two explicit external Practice API gaps.

## Scorecard

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Value proposition | 9/10 | The workspace joins material, grounded generation, classrooms, grading, and result publishing in one teacher-owned scope. |
| Onboarding | 8/10 | Login activates the teacher collection and real empty states guide subject → material → classroom → exam. Operator onboarding remains an admin-side flow. |
| Core workflow | 9/10 | The primary loop is wired end to end with persisted papers, assignments, submissions, corrections, and publish states. |
| Information architecture | 9/10 | Today, Subjects, Classrooms, Exams, and Settings match the HTML mental model; subject source search and test chat are separated by intent. |
| Interaction design | 8/10 | Loading/error/empty/success states and destructive confirmations exist. Authenticated desktop/mobile browser QA is still required. |
| Feature completeness | 9/10 | All features supported by current contracts are wired, including multiple attempts. Question mutation and exact clone still need external Practice API contracts. |
| Trust and polish | 9/10 | Collection keys stay server-side, reference answers are stripped from student payloads, marks stay hidden until publish, and uploaded sheets use private signed access. |

Overall: 61/70. The product is functionally coherent, uses real persisted/API data, and is active on `/teachers`. `/teachers-v2` remains only as a compatibility redirect.

## Explicit non-fake boundary

- Generated question content comes from the teacher-scoped Practice API.
- Paper kind and time limit are persisted app metadata and are consumed by the student attempt UI.
- Source search calls the collection-scoped `/v1/query`; test chat calls `/v1/answer`.
- Multiple attempts are real: assignments persist a 1–10 attempt limit and every submission keeps its own attempt number and review history.
- Question rewrite/remove/retype and exact clone controls are not shown because the external Practice API does not expose safe mutation/revision endpoints.
- Classroom topic insights are evidence-based: scores require saved per-question grades and “asked” requires a real subject-scoped student chat message that mentions the syllabus topic. Missing evidence stays empty instead of being fabricated.
