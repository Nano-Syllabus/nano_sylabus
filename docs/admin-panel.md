# Admin Panel

## Platform analytics

`/admin` is the platform dashboard. Its page and `/api/admin/analytics` independently
verify the signed-in user and the `student_profiles.role` database value. Only
`admin` and `super_admin` are allowed. A user-supplied metadata role is not trusted.
The profile menu exposes **Platform analytics** only to administrators.

All metrics come from one database snapshot, via the service-role-only
`get_platform_admin_analytics()` function. The browser never receives a service key.
Responses are private and uncached. Refresh fetches a new snapshot; there is no
automatic polling. Missing schema, invalid responses, and query failures display
an unavailable state, not sample data or replacement zeroes.

### Database setup

1. Open the SQL editor for the Supabase project configured by this app.
2. Run the entire file
   `supabase/migrations/20260828120000_platform_admin_analytics.sql`.
3. Run `node scripts/verify-admin-analytics.mjs` locally for a read-only check.
4. Sign in with an existing administrator and open `/admin`.

The migration adds an API-call ledger, the aggregate function, and a trigger
preventing browser users from changing their profile role or ownership. It does
not delete student progress, create demo records, or promote any account to admin.
It requires the existing billing, course, practice, and challenge migrations.
Use the existing server-side `SUPABASE_SERVICE_ROLE_KEY`; never make it public.

### Metric definitions

All calendar boundaries use **Asia/Kathmandu (UTC+05:45)**. The snapshot time is
shown in the dashboard. A genuine empty count is zero; an undefined average or
growth percentage is a dash.

| Metric | Source and calculation |
| --- | --- |
| Total users | Retained, non-anonymous `auth.users` accounts. |
| Daily / weekly / monthly growth | New accounts in the last 1 / 7 / 30 calendar days including today, compared with the preceding equal window. Percentage = `(current - previous) / previous × 100`; no percentage when previous is zero. These are signups, not daily active users. |
| Subjects / courses | `teacher_subject_profiles` / `teacher_courses` rows; published courses shown separately. Enrollment does not create an extra subject in this count. |
| Subjects per user | Registered subjects divided by registered users. |
| Recorded API calls | Rows in `platform_api_requests`, written when an outbound tenant/collection call settles. Failed calls are shown separately. Saved user-role `chat_messages` are a separate metric. |
| Challenges passed | `student_challenges` with `status = completed` and a completion timestamp, once per challenge. Reading or failing an exam is not completion. |
| Platform passes/day | Distinct challenge completions in the last 7 calendar days divided by 7. |
| Top student passes/day | Largest individual student's 7-day completion count divided by 7. |
| Best platform day | Highest platform-wide challenge completion count on any retained Nepal calendar day. |
| Challenge attempt pass rate | Passed challenge attempts divided by all graded challenge attempts in the last 30 days. Retries are separate attempts, not extra challenge completions. |
| Total / daily exams completed | Practice-source `student_practice_attempts` plus successfully graded `teacher_exam_submissions`. Challenge sittings and duplicate teacher-exam mastery mirrors are excluded. |
| Exams per user | Counted exam submissions linked to current registered users divided by all registered users, including those with no exams. |
| Average exam performance | Mean of each valid submission's `score / marks × 100`. Invalid/missing scores are excluded and their count is disclosed. A real zero score stays zero. |
| Total / daily revenue | Positive paid `invoices` joined to approved `payment_submissions` with `reviewed_at`. Receipt day is approval day, not invoice creation day. Amounts are stored in major currency units and are not divided by 100. Each currency is reported separately. |

### Dashboard workspace

The sidebar separates Overview, Users & growth, Learning activity, Revenue,
API usage, and Data & definitions. Mobile uses a horizontally scrollable navigation
row; it does not hide sections behind an unavailable control.

The **Charts & ledger** selector switches real daily records between the latest
7 and 30 calendar days. It does not relabel lifetime KPIs or fixed growth windows.
Both bar charts use a zero-based count axis, with no smoothing or invented points.
Hover to inspect a day, or use the date select beneath each chart with a keyboard
or touch screen. A genuine all-zero period displays an empty-activity state.

The daily ledger is paginated and can filter to days with recorded activity.
**Export daily CSV** downloads every day in the selected 7/30-day window, including
zero-activity days, independent of the table's activity-only filter. Exports include
the database snapshot time, timezone, and separate currency columns. Revenue
without receipts shows an empty state, not an assumed currency or income.

Section, period, ledger page/filter, and revenue currency use URL parameters, so
refreshing or sharing an admin URL retains the view without bypassing access checks.

### Honest coverage limits

- Totals describe **currently retained records**, not an immutable all-time audit.
  Deletions and cascading deletions can reduce them. Admin/test accounts are
  included because there is no verified test-account flag.
- A subject only present in the external AI service, without a local subject
  profile, is not counted as a locally registered subject.
- API tracking starts with this release. There is no trustworthy historic total
  to backfill. Retries and background calls count separately; cache hits do not.
  Server crashes and logging outages can omit calls. The ledger stores only
  service, timestamps, duration, and success, not prompts, keys, or student IDs.
- Revenue is **gross confirmed receipts**, not profit or refund-adjusted net
  revenue. Free invoices, pending/rejected proofs, and credit grants are excluded.
  Paid invoices without a matching approved, dated payment are disclosed as
  unreconciled instead of silently treated as confirmed revenue.
- Admin and student metrics use the same underlying challenge and attempt
  records. This dashboard does not replace the student's personalized readiness
  calculation with a platform-wide average.

### Manual browser verification

1. Logged out: `/admin` must redirect to login; `/api/admin/analytics` must return
   `401`. A normal student must not see the admin link and must receive `403` from
   the API even if they type its URL directly.
2. Administrator: open **Platform analytics**, inspect the snapshot timestamp,
   and click **Refresh**. In Network, the analytics response should be `200`
   with `Cache-Control: private, no-store, max-age=0`.
3. Compare counts with the corresponding database records and the definitions
   above. Perform ordinary app activity and refresh: a passing challenge changes
   completion metrics; a failed sitting changes attempt metrics only.
4. Payment tests must use genuinely approved payments. Do not insert fake revenue
   or learner activity into the production database to populate the dashboard.
5. Switch the chart period, inspect a date, and compare it to Data & definitions.
   Test the ledger's activity filter and pagination; export the CSV and compare
   its daily counts. Check both desktop and narrow/mobile widths and both themes.

### Automated checks

The analytics SQL tests run in isolated PGlite PostgreSQL, never the live database.
They cover empty results, Nepal midnight boundaries, challenge completion versus
attempts, duplicate exam exclusion, percentage calculations, approved payments,
currency separation, and database privileges. API and access tests cover guests,
students, administrators, unavailable schema, safe errors, and uncached responses.

## Existing product operations

Existing admin APIs also cover:

- student/admin user management
- credit adjustments
- billing plans and payment review
- answer review and feedback inspection

Academic source upload, local indexing, and prompt-template editing are not part
of the active app admin surface.
