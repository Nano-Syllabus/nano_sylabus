# Tenant API Use Cases

This note maps the working tenant APIs to places we can use them inside Nano Syllabus.

## Endpoints

### `GET /tenant/namespaces`

Use this when the app needs the top-level academic scope.

- Onboarding: load the list of available universities or boards.
- Explore: filter subjects by namespace.
- Admin health: show which namespaces are queryable and how many files are indexed.

### `GET /tenant/subjects`

Use this when the app needs real subject cards and scoped metadata.

- Onboarding: populate the final "Which subjects do you want to focus on?" step.
- Explore: show every available subject instead of only the user-selected ones.
- Chat bootstrap: start a chat with the correct `subject`, `namespace`, and `folder_path`.

Important fields:

- `slug`: stable subject identifier for prompt calls.
- `namespace_slug`: collection scope for prompt calls.
- `folder_path`: exact source folder for retrieval calls.

### `GET /tenant/source-tree`

Use this when the app needs document-level provenance and ingest visibility.

- Admin/source browser: inspect uploaded folders and files.
- Debugging: verify whether a specific PDF or folder was indexed.
- Future citations UI: connect answers back to their source documents.

### `GET /tenant/collections`

Use this when the app needs coverage and indexing totals.

- Admin dashboard: show total files vs indexed files.
- Readiness banner: warn when a namespace has files but is not fully indexed.
- Internal monitoring: confirm tenant ingestion status after uploads.

### `POST /v1/prompt`

Use this when the app needs an answer from the tenant prompt service.

- Subject chat: ask questions inside one scoped subject.
- Syllabus mode: answer from the selected subject's indexed material.
- Web search mode: can still use the same backend flow if the backend supports a less constrained path.

Required request fields:

- `subject`
- `namespace`
- `folder_path`
- `prompt`
- `user_id`

## Current Live Status

As of 2026-06-28:

- `GET /tenant/namespaces` works.
- `GET /tenant/subjects` works.
- `GET /tenant/source-tree` works.
- `GET /tenant/collections` works.
- `POST /v1/prompt` reaches the backend but fails upstream because the linked LLM billing credits are depleted.

## Test Coverage

The smoke test for these endpoints lives at `tests/integration/tenant-api.smoke.test.ts`.

- Without credentials, it skips safely.
- With `TENANT_API_BASE_URL` and `TENANT_API_TOKEN`, it validates the tenant API end to end.
- It dynamically picks a real subject from `GET /tenant/subjects` before calling `POST /v1/prompt`, so it avoids stale hardcoded metadata.
