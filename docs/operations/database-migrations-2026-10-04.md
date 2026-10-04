# Database migration and quota recovery check — 2026-10-04

Target: Supabase project `qaqemdonnbgztebgvmzv`, database `postgres`.

Later the same day, the database was transferred to a new organization without
Supabase Storage. See the [project migration report](supabase-project-migration-2026-10-04.md)
for the completed transfer, local environment switch and remaining Auth setup.

Direct `psql` access works against PostgreSQL 17.6. The database reports
`default_transaction_read_only = off`. A temporary-table create and insert
succeeded in a transaction that was rolled back.

## Backup

Before applying migrations, created a private custom-format archive at
`../../../.rollback/supabase-database-2026-10-04.dump` (6,098,617 bytes).
The file has mode `0600` and contains schema and data from `public`, `auth`,
`storage`, and `supabase_migrations`. Ownership and privileges were omitted;
roles, other schemas, and actual Storage file contents are not included.
Keep this archive private: Auth data and application records are sensitive.

SHA-256:
`3cd1644d4bb65770945eb71b1d1e087e1f0d12ba8e22daadaf076eb9691182cd`

Both `pg_restore --list` and a full archive read with
`pg_restore --file=/dev/null` succeeded. This checks archive readability, not
a restore into another database. A destination needs compatible Supabase
schemas, roles, extensions, and grants.

## Audit and applied changes

Compared locally declared public tables, added columns, indexes, and the
latest bodies of 41 retained functions with the live schema. Missing legacy
RAG objects and two superseded indexes were accounted for by later drop
migrations. They were not recreated. The eight entries documented in the
October 1 migration ledger were already present. Historical ledger gaps
remain; an absent entry is not evidence that a migration needs replaying.

Applied these two confirmed pending changes together in one transaction:

- `20260903153000_community_leave_access`: replaces the older function with
  creator and active-community checks and cancels both active and completed
  course enrollments when a member leaves. Installing the function does not
  change existing memberships or enrollments.
- `20261001130000_upload_limit_100mb`: sets the `teacher-documents` bucket's
  `file_size_limit` to 104,857,600 bytes. This is bucket configuration only;
  the Free plan's global 50 MB upload limit still applies to Supabase uploads.
  The separate VPS object store uses its own configuration.

Recorded both executions and their source SQL in
`supabase_migrations.schema_migrations`. Requested a PostgREST schema reload.
Verified the bucket setting, exact function body, service-role execution,
and denied execution for `anon` and `authenticated`. Rejection-path function
checks ran in a rolled-back transaction.

After committing, all 67 public-table row counts, the 64 Auth users, the 549
Storage objects, and total object bytes matched the pre-migration baseline.
No Storage objects were removed and no app/backend deployment was performed.

## Unresolved organization restriction

After migration, read checks against all of the following still returned
HTTP 402 with `exceed_storage_size_quota`:

- `/storage/v1/bucket`
- `/rest/v1/student_profiles?select=id&limit=0`
- `/auth/v1/settings`

Earlier attempts to empty `teacher-documents`, delete its objects through
both Storage hostnames, and list S3 buckets also returned HTTP 402.
The 549 objects total about 3.45 GiB (3532 MB in PostgreSQL's binary units).

The user's Supabase restriction email states that the quota refills on
**October 29, 2026** and that dashboard database access remains available.
Database migrations cannot lift this organization-level restriction.
Deleting rows from `storage.objects` would orphan the actual files, so this
was not attempted and deletion protection was not disabled.

Without a payment card, request temporary deletion access or provider-side
cleanup through [Supabase Support](https://supabase.com/support). Approval is
not guaranteed. Suggested request:

> Project `qaqemdonnbgztebgvmzv` is restricted with
> `exceed_storage_size_quota`. I cannot add a payment card. I want to delete
> all Storage objects while preserving my database and Auth users. Storage
> REST deletion and S3 requests return HTTP 402. Could you temporarily enable
> deletion or clear the Storage objects for me?

No support message has been sent. If access returns at the billing-cycle
reset, clear the unneeded files using the supported Storage API promptly;
the existing file volume remains over the quota.

References: [Supabase deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects)
and [restriction recovery](https://supabase.com/docs/guides/platform/billing-faq#how-can-i-remove-restrictions-applied-from-the-fair-use-policy).
