# Architecture

## Request Flow

1. User selects faculty, level, branch, semester, and subject during onboarding.
2. The frontend hydrates available subjects from tenant metadata.
3. Chat sends the selected subject metadata and raw question to `/api/chat`.
4. `/api/chat` validates auth/profile/credits, resolves the tenant subject, and
   calls the tenant `/v1/prompt` endpoint.
5. The tenant answer is streamed back to the UI.
6. User message, assistant answer, credits, and trace metadata are persisted
   after the response path.

## Runtime Boundary

The app is not an answer engine. It is the product shell, session layer, billing
layer, and tenant API proxy. Academic answer generation belongs to the tenant
API.

No app-side answer generation path should be added.
