# Implementation Plan

## Active Direction

1. Keep onboarding aligned with tenant source-tree metadata.
2. Keep chat subject selection semester-scoped.
3. Send raw user questions to tenant `/v1/prompt`.
4. Persist chat history and credits after the response path where possible.
5. Improve latency and error visibility without adding app-side answer generation.

## Next Useful Work

- Rename remaining internal trace field names from legacy naming to tenant naming.
- Add browser-level tests for the tenant-backed chat path.
- Improve admin answer observability around tenant latency and timeout reasons.
