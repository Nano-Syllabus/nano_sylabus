# Architecture

## Target architecture

The BRD recommends a multi-part platform:

| Layer | Recommended role |
| --- | --- |
| Student frontend | PWA for chat, profile, notes, billing |
| Admin frontend | Separate admin web app |
| Backend API | auth, chat orchestration, credits, billing, persistence |
| AI gateway | LLM inference with profile-aware prompting |
| Knowledge base | RAG retrieval over syllabus content |
| Database | users, chat, credits, plans, invoices, notes |
| Auth service | JWT and OAuth handling |
| Payments | eSewa, Khalti, Stripe |
| Storage | documents, invoices, uploads |
| Email | OTP, receipts, system emails |
| Analytics | product and revenue instrumentation |

## Recommended stack from the BRD

- student frontend: Next.js PWA + Tailwind CSS
- admin panel: web admin surface built inside the same Next.js repo for now
- backend: Node.js with Express or Fastify
- AI: Anthropic Claude or OpenAI GPT family
- vector store: Pinecone or pgvector
- database: PostgreSQL
- auth: Supabase Auth or Auth0
- payments: eSewa, Khalti, Stripe
- object storage: S3 or Cloudflare R2
- email: Resend or SendGrid
- CDN/security: Cloudflare

## AI response flow

The intended production flow is:

1. Student sends a question.
2. Backend loads student profile context.
3. System prompt is composed using academic context.
4. Relevant syllabus chunks are retrieved from the knowledge base.
5. Prompt, retrieval context, chat history, and user message are assembled.
6. LLM generates the answer in the requested language.
7. Response streams back to the frontend.
8. Credit is deducted after successful completion.
9. Conversation is persisted.

## Key data entities

The product will need durable storage for:

- users
- student profiles
- chat sessions
- chat messages
- credits ledger
- subscriptions
- invoices
- knowledge chunks
- prompt templates
- revision notes
- subject tags
- note revision logs

## Current state in this repository

The repository has moved beyond the earlier prototype state. Right now:

- the student product runs as a Next.js App Router app
- server route handlers live inside the same repo under `app/api`
- auth is wired to Supabase Auth
- data persistence uses Postgres tables through Supabase
- chat uses OpenAI plus retrieval grounding
- notes, billing, and admin payment review are real product flows
- the admin surface is still thin and finance-focused
- live-environment validation and broader operator tooling are still incomplete

## Architecture gap we need to close

### Current

- single Next.js application repo
- real student product loop
- thin finance admin surface
- manual operations for ingestion and payment verification

### Target

- production-hardened student app
- broader admin operations
- auditable finance tooling
- scalable knowledge operations
- observability, analytics, and support workflows

## Practical implementation direction

Given the current codebase, the best path is:

1. keep the current Next.js repo as the active product shell
2. harden live environment behavior before adding more major student features
3. expand admin operations around finance and knowledge management
4. automate payment and operational workflows only after manual flows are trusted
5. split into multiple apps only if product scope or team size makes the single repo a bottleneck

## Suggested repo-level architecture direction

If this repo keeps growing, a clean future structure could become:

```text
apps/
  student-web/
  admin-web/
packages/
  ui/
  config/
  types/
  prompting/
  syllabus-ingestion/
services/
  api/
  workers/
docs/
```

This is not mandatory today. The current repo is already valid as a single-product Next.js codebase, and splitting should happen only when it reduces operational friction.
