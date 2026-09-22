-- The unit's name beside its number, so the revision docs can list
-- "Unit 1 · Basic Circuit Concepts" rather than a bare "Unit 1".
--
-- Written by the topic sync from the backend catalogue's `unit_title`. Rows
-- synced before this stay '' until their subject's topics are synced again (or
-- `scripts/backfill-topic-unit-titles.mjs` is run), and the app reads '' as
-- "no name" — it also keeps working, without names, before this is applied.
alter table public.community_subject_topics
  add column if not exists unit_title text not null default '';
