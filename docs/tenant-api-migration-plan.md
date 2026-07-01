# Tenant API Migration

The migration direction is now complete at the app-runtime level: Nano Syllabus
uses the tenant API for subject metadata and answer generation.

## Active Tenant Endpoints

- `GET /tenant/subjects`
- `GET /tenant/source-tree`
- `GET /tenant/namespaces`
- `GET /tenant/collections`
- `POST /v1/prompt`

## App Contract

The frontend and `/api/chat` must pass the selected tenant subject metadata when
available. If metadata is missing, the server may look up the subject through the
tenant subject endpoint. It must not answer from a local corpus.
