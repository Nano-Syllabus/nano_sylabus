# Docs Index

This folder keeps the current operating notes for Nano Syllabus.

## Start Here

1. [Product Overview](./product-overview.md)
2. [Current State](./current-state.md)
3. [Architecture](./architecture.md)
4. [Local Setup](./local-setup.md)
5. [Tenant API Use Cases](./tenant-api-use-cases.md)

## Current System Boundary

- The app owns auth, onboarding UI, chat UX, notes, billing, settings, and admin
  review workflows.
- The tenant API owns academic subject metadata and answer generation.
- Local retrieval, local embeddings, local ingestion, and local model answers
  are not part of the active runtime.

## Supporting Docs

- [Goals and Metrics](./goals-and-metrics.md)
- [Scope and Requirements](./scope-and-requirements.md)
- [Data Model](./data-model.md)
- [Admin Panel](./admin-panel.md)
- [Roadmap](./roadmap.md)
- [Tenant API Migration Plan](./tenant-api-migration-plan.md)

When architecture changes, update this index and the setup docs in the same
change so the repo stays explainable.
