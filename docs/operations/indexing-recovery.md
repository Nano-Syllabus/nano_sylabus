# Document indexing recovery

Deploy the backend and app together. Apply
`supabase/migrations/20261001120000_indexing_queue_recovery.sql` before serving the updated app.
This adds activity states/checkpoints and a durable student contribution queue. Existing Drive
activities older than a day expire on the next sweep; no source files or saved previews are deleted.

## Backend

Index jobs live in `data/platform_registry/index_jobs.sqlite3` (WAL). Keep this directory on
persistent storage and include the database in backups. Run one API process per data directory,
as before: admission, file locks and worker counts are process scoped. A restart restores queued,
interrupted and delayed jobs. Configure:

- `INDEX_JOB_WORKERS=4`: orchestration threads; default 4.
- `INDEX_FILE_WORKERS=2`: useful for a four-core server. Default scales from 1 to 3 with CPU count.
- `INDEX_ATTEMPT_SECONDS=600`: maximum per-file attempt; capped at 600 seconds.

Each file runs in a child process. A hung OCR/provider attempt is terminated, including its child
processes, before another attempt can write the same path. Sources and committed chunks remain.
Timeouts/provider outages retry with exponential delay (30 seconds to 15 minutes). Activity expires
24 hours after admission. Retry creates a new activity; it does not require uploading the source again.
A complex document may need more than ten minutes overall; ten minutes is the limit on one attempt,
not a guarantee that every file can be indexed in that time. Empty/unreadable results never count as indexed.

## App worker (required even when no browser is open)

Set `INDEXING_SWEEP_SECRET` to a random secret in the app environment. Call
`POST /api/internal/indexing/sweep` with `Authorization: Bearer <secret>` every minute from a
scheduler. The endpoint denies access when the secret is missing or incorrect. It expires/reclaims
Drive activities, polls backend job outcomes, drains saved imports and processes contributed PDFs.
Drive download/import concurrency is capped at three across overlapping invocations; backend extraction has its own bounded pool.
The browser also nudges recovery using Next.js `after`, but is not the scheduler.

For a Linux host:

```sh
sudo install -m 0755 scripts/ops/indexing-sweep.sh /usr/local/bin/indexing-sweep
sudo install -m 0644 scripts/ops/indexing-sweep.service /etc/systemd/system/
sudo install -m 0644 scripts/ops/indexing-sweep.timer /etc/systemd/system/
sudo install -d -m 0755 /etc/nano-syllabus
# Create /etc/nano-syllabus/indexing-sweep.env, mode 0600, containing:
# INDEXING_SWEEP_URL=https://<app-host>/api/internal/indexing/sweep
# INDEXING_SWEEP_SECRET=<same secret as the app>
sudo systemctl daemon-reload
sudo systemctl enable --now indexing-sweep.timer
```

Inspect runs with `journalctl -u indexing-sweep.service`. Check backend `/healthz` and job responses
at `/v1/jobs/{id}` with the owning collection credential. The job response exposes queue/start/finish
and next retry times. The Activity page distinguishes saving, queued for indexing, indexing, waiting
to retry, indexed, failed and expired. Only a backend result with positive searchable chunks is indexed.

Uploaded files are checkpointed before index admission. Drive retries reuse that path; if a worker
stopped before the checkpoint, the original Drive link is retained. Student uploads are staged in
private storage and survive transient triage failures; genuine subject rejection still removes the
staged copy. Queue records remain available for retry after expiry.

Deploying app code alone against an older database is unsupported. No migration or production timer
is installed merely by changing these files.
