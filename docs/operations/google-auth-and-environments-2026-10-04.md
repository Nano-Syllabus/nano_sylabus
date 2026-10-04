# Google sign-in, VPS files and separate databases — 2026-10-04

Development now uses local Supabase. The migrated hosted project is treated as
staging. Google sign-in remains pending real OAuth credentials and access to
staging Auth configuration; neither provider has been enabled with placeholder
credentials. Google buttons are disabled until configuration is verified.

## Environment selection

| Environment | Database/API | Private config | App command |
| --- | --- | --- | --- |
| Development | PostgreSQL on `127.0.0.1:54322`; API `http://127.0.0.1:54321` | `.env.development.local` | `npm run dev` (port 3000) |
| Staging | `https://sokccxwfbyavlmijrvml.supabase.co` | `.env.staging.local` | `npm run dev:staging` (port 3001) |

The development database is running in Docker, with PostgreSQL 17.11, Auth,
PostgREST and Kong. It contains the 67 application tables with RLS and source
function permissions. Staging users and application records were not copied
into development. A temporary test account and profile were removed after
verification; development now has zero users and zero application rows.

`NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_DEVELOPMENT_SUPABASE_URL` and
`NEXT_PUBLIC_STAGING_SUPABASE_URL` enforce selection for public and admin
clients. The app rejects identical environment URLs or a URL that does not
match the selected environment. Development launch commands require the
development config, so a missing file cannot fall back to the staging `.env`.
Staging and development compilers use separate Next.js output directories.

Run `npm run db:dev:start` to start development services and refresh local API
keys in the private development config. `npm run db:dev:stop` retains Docker
volumes. The CLI is pinned to `2.119.0`; Node 20.12 or newer, Docker, `psql`
and `pg_restore` are required. The initial schema comes from the private
October 4 migration archive. To bootstrap another machine, provide that
schema archive and its companion permission/trigger files securely. The
bootstrap restores schema only into an empty local database, never staging.
Historical migrations are not replayed automatically. New schema changes
still need to be applied deliberately to each environment.

Hosted builds can use `npm run build:staging` and `npm run start:staging`.
The existing `.env` retains staging settings for existing build workflows.
No production deployment or Vercel environment change was performed. Before
deploying staging, set that deployment's actual origin in the Google config
and use the staging environment variables in the hosting dashboard.

## VPS storage only

Server Storage operations use the VPS adapter; all browser signed uploads
require a `/vps-storage/signed-upload/` URL. The teacher/library Supabase
upload fallbacks were removed. Answer-sheet uploads use the same VPS-only
helper. Missing or non-VPS URLs fail without sending the file elsewhere.

The local Supabase Storage service and S3 interface are disabled. Staging
has zero Supabase Storage buckets. Neither this setup nor its file-access
verification uploaded an object to Supabase Storage.

Development uses `VPS_STORAGE_PATH_PREFIX=development`, so uploads, reads,
signed URLs, lookups, public assets and deletions use
`<bucket>/development/<logical-path>`. Staging leaves the prefix empty to
preserve existing VPS paths. Both prefix and object paths reject traversal.
The VPS backend/tenant API itself is shared; this is database separation and
file-path separation, not a second independent backend deployment.

The frontend needs `VPS_STORAGE_URL`, `VPS_STORAGE_TOKEN` and
`VPS_STORAGE_SIGNING_SECRET`, or their existing tenant API defaults. The VPS
must use the matching `OBJECT_STORAGE_TOKEN` and
`OBJECT_STORAGE_SIGNING_SECRET`, with persistent `OBJECT_STORAGE_ROOT`.
`VPS_STORAGE_PROXY_ORIGIN` or the existing tenant origin supplies the
same-origin `/vps-storage` rewrite. Existing values passed a real upload,
signed read and deletion test. Files that existed only in the old Supabase
Storage must be uploaded to the VPS again if they are needed.

An audit of all staging public-table fields found zero saved URLs referencing
`*.supabase.co/storage/v1/`; no URL-rewrite database mutation was necessary.

## Google credentials and callback setup still required

Fill private `.env.google.local` from `.env.google.local.example`:

- `GOOGLE_OAUTH_CLIENT_ID`: a Google OAuth **Web application** client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET`: its client secret.
- `SUPABASE_ACCESS_TOKEN`: a Supabase Management API token scoped to staging
  with Auth configuration read/write access.
- `GOOGLE_AUTH_SITE_URL`: the actual staging app origin; currently
  `http://localhost:3001` for local staging.
- `GOOGLE_AUTH_REDIRECT_URLS`: exact app callback URLs, comma-separated;
  include `<staging-origin>/auth/callback`.

Keep this file private and out of Git. The Google Drive API key is unrelated
to OAuth sign-in. The current MCP OAuth login lacks Auth configuration
permissions, so a publishable key or service-role key cannot replace the
Management API token for configuring the provider.

In Google Auth Platform, add these authorized redirect URIs to the OAuth
client (one per database's Auth service):

```text
http://127.0.0.1:54321/auth/v1/callback
https://sokccxwfbyavlmijrvml.supabase.co/auth/v1/callback
```

Register the development/staging app origins, including
`http://localhost:3000` and `http://localhost:3001` for the current local
setup. Configure the consent screen's audience and scopes as described in
[Supabase's Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
The provider callback above and the app's `/auth/callback` are separate:
Google returns to Supabase, which returns to the same app origin where
sign-in started. The existing PKCE code exchange and host-only return cookie
are retained.

After supplying credentials and registering the redirect URIs, run:

```sh
npm run auth:google:dev
npm run auth:google:staging
```

Development configuration enables the local provider, restarts its services
without deleting database volumes, verifies public provider settings, then
enables the development button. Staging configuration checks Management API
access, saves a private Auth configuration recovery copy, patches only Google
and Site URL/redirect fields, verifies them, and enables the staging button.
The secret never enters a `NEXT_PUBLIC_` variable. Restart or rebuild the app
after enabling its button. Complete one interactive Google consent/login test
in each environment to verify the Google-console configuration end to end.

For hosted password recovery or verification emails, custom SMTP and email
redirect settings also need configuration if required; they were not part
of the database transfer and Google OAuth does not require SMTP.

## Verification

- 42 focused tests passed across seven files: VPS transport/signatures/path
  isolation, rejection of non-VPS browser uploads, environment selection,
  OAuth return origins, post-auth destinations and teacher/library uploads.
- Changed files passed ESLint and script syntax checks; `git diff --check`
  passed.
- Application source type-check passed with tests excluded. The full project
  type-check still reports existing errors in untouched test fixtures; those
  errors were not resolved by this configuration task.
- Development Auth creation, password login, profile write/RLS read and logout
  worked. The temporary account and its profile were deleted.
- Both environment Auth settings endpoints returned HTTP 200; both report
  Google disabled while real credentials are missing.
- A unique development VPS probe uploaded and read back through a signed URL;
  it was deleted afterward. Staging's Supabase bucket listing remained empty.
- Development function grants match the source; every application table has
  RLS enabled. No staging data was modified by these probes.

Private JSON verification records are in the existing October 4 rollback
directory. Google Management API application and browser consent have not
been tested because the required credentials have not been supplied.
