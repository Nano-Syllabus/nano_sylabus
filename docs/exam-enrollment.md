# Exam → faculty → subject enrollment

An exam is an existing website in **Platform analytics → Websites**. Faculties
are public, active communities managed in **Faculties & subjects**, and subjects remain attached to their
faculty. An exam can group several faculties without copying their subjects.

## Set up an exam

1. Open or create its website in Websites.
2. Expand **Exam, faculties & checkout** and enable exam enrollment.
3. Use the faculty dropdown to select several faculties, such as BCT License,
   BEI License and BCE License. Subjects must be published to appear publicly.
   **Add a faculty** creates one directly in this editor and selects it for the
   exam. **Edit** opens its faculty and subject controls. Move faculties up/down
   to set the public display order, or remove them from this exam.
4. Choose active individual monthly plans, or leave plans unchecked to use all
   active individual monthly plans. Prices and the official QR come from Billing.
5. Add, edit, remove or reorder preparation questions and answer options. Select
   the available payment durations (one and/or three months). Under **Student
   journey text & buttons**, customize headings, descriptions and button labels;
   `{exam}` inserts the exam's name. Then **Save exam setup**.
6. Edit the website's landing content and publish/show the website as usual.
   Saving exam setup takes effect immediately on an already live website;
   a hidden website stays hidden.

Each exam has one landing page at `/sites/<exam>` (or its existing subdomain)
and one checkout at `/payment/<exam>`. The main website can also be an exam.
Public `/exams` discovery includes configured exams and their supported faculties.

## Manage faculties and subjects

Open **Platform analytics → Faculties & subjects** (`/admin/faculties`). Create
faculties with a name, programme/code, university or examining body, level,
description, visibility and challenge format. License and Entrance use one
subject track; other levels use the existing year/semester structure.

Select a faculty to edit its details. URLs remain stable when names change.
Inactive faculties can be restored. An exam's active mappings and locked students
must be reassigned before its faculty can be archived or made non-public.

Within a faculty, create a new subject or attach an existing subject from its
creator's workspace. Newly created subjects are drafts. Source files and syllabus
content stay in the existing Creator Workspace; **Publish & sync** uses its
existing extraction/publishing process, and refuses to publish without topics.
Edit the subject display name, code, description, group and display order. Set it
back to draft to unpublish, or archive and restore it without deleting learning
history. Only active, published subjects appear in the public faculty preview
and student study scope.

Prices, plan features and the official payment QR remain editable in **Payments**
(`/admin/billing`), linked from each exam's settings. The configured durations are
checked again by the intent and invoice APIs; changing browser fields cannot
purchase a disabled duration.

## Student journey

Landing → preparation questions → supported faculty preview → payment plan →
existing sign-in → faculty confirmation → official payment QR → receipt submission
→ app.

Preparation answers and the selected plan/duration survive sign-in using an
HTTP-only, same-site cookie. Students can explore faculties and published subjects
without an account. Both checkout and the app show the mandatory faculty dialog
when an authenticated student has not chosen a faculty.

The student has one locked exam/faculty. The database makes selection, membership
replacement and course enrollment a transaction, and refuses later faculty switches
or leaving the locked membership. Student study scopes, subject authorization,
course lists and invoices use the selected faculty. Existing Google login and the
existing QR/receipt activation process are reused.

An administrator can load **Student faculty locks** in the website editor and
use **Change & lock** to correct a selection. The correction ends access to the
previous faculty's course and retains existing payment history. Removing a faculty
from exam setup stops new selections but preserves historical enrollment.

## Database rollout

Apply `supabase/migrations/20261004164226_exam_faculty_enrollment.sql` to the target
Supabase database **before deploying this code**. Use the project's normal
migration deployment workflow; the migration adds exam configuration, faculty
mapping, locked enrollments, invoice scope, RLS and service-only enrollment RPCs.
It does not regroup or enroll existing students automatically.

The migration was applied and browser-tested against the separate local
development database, and has now also been applied to the configured hosted
staging database. Any separate production database needs the migration before
release. Configure the real exam and faculties in Websites; test fixtures are
not part of the migration.

## Verification

Focused tests cover preparation validation, sign-in intent, authenticated student
selection, rejection of override/impersonation attempts, faculty locks, database
rollback, own-record RLS, admin correction, direct subject/course URL protection,
and exam-scoped invoice pricing/reuse.
Admin tests also cover verified roles, request origins, creator/URL protection,
faculty/subject boundaries, protected archiving, publication transitions, and
backward-compatible checkout configuration.
