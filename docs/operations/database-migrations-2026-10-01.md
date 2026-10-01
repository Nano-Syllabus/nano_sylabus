# Database migration run — 2026-10-01

Target: Supabase project `qaqemdonnbgztebgvmzv`, database `postgres`.

The existing database had no `supabase_migrations.schema_migrations` ledger.
Schema inspection identified missing changes; historical migrations were not
blindly replayed. In particular, retired RAG tables and intentionally removed
indexes were left retired.

Applied together in one successful transaction:

- `20260619013000_add_pinned_chats` (column already existed; index was missing)
- `20260921200000_challenge_topic_pool`
- `20260922130000_community_subject_topic_unit_title`
- `20260924150000_community_challenge_mcq_settings`
- `20260924180000_community_level`
- `20260928090000_challenge_completed_topic_unique`
- `20260929120000_single_track_communities`
- `20261001120000_indexing_queue_recovery`

Created the standard migration ledger and recorded these eight executions with
their SQL. Older migrations remain untracked; reconcile their history before
using an automatic migration push. Do not interpret an absent ledger entry as
proof that a historical migration has never run.

After migration, ran `expire_teacher_drive_imports` for existing queue owners.
Eight activities older than 24 hours became `expired`; ten completed activities
remained `done`. All 18 rows remained, all expired rows retained their Drive
source identifiers and links, and no active rows remained past expiry. No
uploaded files or storage objects were deleted by this operation.

Verified RLS on both new job tables, service-role table access, and service-role
only execution of the queue claim/expiry RPCs. Verified no Entrance/License
community retained multiple years or semesters. Requested PostgREST schema
reload after committing.

This run applies database changes only. Deployment of the updated app/backend
and the indexing sweep timer is separate; see [indexing recovery](indexing-recovery.md).
