# Data Model

Supabase stores product state, not the academic answer corpus.

## Kept Locally

- `student_profiles`
- `chat_sessions`
- `chat_messages`
- `saved_notes`
- billing plans, invoices, subscriptions, and credit ledger rows
- admin review metadata

## Not Used For Answers

The app no longer uses local academic document/chunk tables for chat answers.
Subject metadata and indexed source coverage are read from the tenant API.

## Chat Trace

Assistant message metadata may keep timing, selected subject, tenant route, and
citation-count fields for debugging and admin review.
