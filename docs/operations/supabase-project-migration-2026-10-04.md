# Supabase project migration — 2026-10-04

The database was copied from `qaqemdonnbgztebgvmzv` to
`sokccxwfbyavlmijrvml` (`nano-syllabus-backend-db`). The destination restore
committed successfully, and the local app environment now uses the destination.
The source database and its Storage files remain untouched by this transfer.
No production deployment or hosted environment update was performed.

Follow-up: [Google Auth and separate environments](google-auth-and-environments-2026-10-04.md)
now documents local development, hosted staging, VPS-only uploads and prepared
Google configuration commands. Google buttons have since been disabled until
the provider is configured and verified.

## Copied and verified

| Item | Result |
| --- | --- |
| Application tables | 67 tables, 52,772 rows |
| Auth users and identities | 64 users, 65 identities |
| Migration ledger | 10 records |
| Table content verification | All 94 copied tables matched source counts and content hashes |
| Database structure | Function definitions, policies, indexes, RLS settings and sequence state matched |
| Object permissions | Function, table, sequence, enum/domain and schema grants matched |
| Supabase Storage | Excluded; destination has zero buckets and zero objects |

The content comparison ran immediately after restore, before the password-login
smoke test updated the test account's sign-in/session state. Auth's managed
`schema_migrations` table was retained from the destination, rather than copied.
Both custom `auth.users` triggers were transferred. Historical application
migrations were represented by the current schema and ledger, not replayed.

The destination runs PostgreSQL 17.11; the source runs 17.6. The restore kept
the destination's managed roles and Auth schema, created the source's `pg_trgm`
extension, and copied public schema/data, application migration history and
compatible Auth data. A fresh destination backup preceded the restore.

An audit found that destination defaults had added grants to 23 functions and
seven tables. A separate transaction reconciled those grants with the source.
The final complete object-permissions comparison passed. For example,
`leave_community(uuid,uuid)` is executable by `service_role` and denied to
`anon` and `authenticated`.

## Local application and VPS storage

`nano_sylabus/.env` now contains the destination URL, the supplied publishable
key and the destination service-role key. Existing tenant/VPS credentials and
the `/vps-storage` rewrite were preserved. Storage metadata and paths in public
tables were copied; no binary files were transferred. A file present only in
the old Supabase Storage will not become available on the VPS through this
database transfer.

Before replacing the service-role key, the previous effective
`CHALLENGE_ANSWER_SECRET` and `CHALLENGE_POOL_SWEEP_SECRET` were preserved as
explicit environment variables. This keeps existing sealed answers readable
and preserves the shared VPS timer credential. Keep these same values when
updating a hosted deployment or rotating Supabase keys. `.env.example` now
documents this requirement.

The destination database password was reset through the supported Management
API because its previous password was unavailable. The generated credentials
are stored privately in the backup directory's `destination-db.json`.

## Verification and remaining setup

- Supabase MCP is enabled, project-scoped and authenticated with OAuth.
- Direct `psql` access and the restore succeeded.
- Destination REST reads, Auth admin access and Storage bucket listing returned
  HTTP 200; the bucket listing was empty.
- An existing account signed in with its existing password, read exactly its
  own profile through RLS, and logged out successfully.
- All 970 historical sealed MCQ answer checks validated: zero unreadable.
- Focused Vitest verification passed: two files, 22 tests. Command:
  `node node_modules/vitest/vitest.mjs run tests/lib/challenge-exam-format.test.ts tests/api/challenge-pool-sweep.route.test.ts --maxWorkers=1`.
- The broader test run failed 12 tests and exhausted a worker's Node heap. It
  also generated a system core dump and temporarily exhausted disk space.
  These suite failures remain unresolved; they do not establish a passing
  full application test suite.
- The final security advisor retained the source schema's warnings: two
  mutable function search paths, `pg_trgm` in `public`, ten anon-executable and
  twelve authenticated-executable security-definer functions. Twenty-four
  tables have RLS enabled with no client policies. Leaked-password protection
  is disabled on the destination. These were recorded without redesigning
  application access policies as part of the transfer.

**Google sign-in is not ready on the destination.** Provider settings, Site
URL, redirect allowlists and SMTP configuration were not transferred. Reading
Auth configuration returned HTTP 403 because the MCP OAuth token lacks
`auth_config_read`; the MCP OAuth registration rejected additional Auth scopes.
The destination's public settings report Google disabled. The local app's
Google feature flag was initially retained. The follow-up environment setup
disables it until the provider is configured and verified.

Configure Google in the [destination Auth provider settings](https://supabase.com/dashboard/project/sokccxwfbyavlmijrvml/auth/providers).
Add `https://sokccxwfbyavlmijrvml.supabase.co/auth/v1/callback` to the Google
OAuth client's authorized redirect URIs, then provide its client ID and secret
to the destination provider. Set the app's Site URL and callback allowlist in
the destination's [URL configuration](https://supabase.com/dashboard/project/sokccxwfbyavlmijrvml/auth/url-configuration).
See [Supabase's Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
Users must sign in again when the app switches projects.

## Private backup and recovery material

Files are under `../../../.rollback/supabase-project-migration-2026-10-04/`
relative to this document (directory mode `0700`; files mode `0600`). They
include fresh source archives, the destination-before-restore archive,
restore SQL/logs, the original local environment, destination database
credentials, table hashes, structure snapshots and advisor results. These
files contain sensitive account data and credentials and must stay private.

Archive SHA-256 checksums:

- `public-and-history.dump`:
  `62f3f9149d20d58fc1bf50070f21e54fdddac62a0be2008e4e5bc99490f24f8c`
- `auth-data.dump`:
  `306127e3e40139fe4a621d11eddc7d41adb1c48eb72b616b354be207393aff35`

The restore script now includes the source-grant reconciliation SQL. It was
prepared for the initially empty destination; do not replay it against the
populated database. The original local environment is `app.env.before` for
configuration recovery, but the old organization remains restricted.

Reference: [Supabase backup and restore migration guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
