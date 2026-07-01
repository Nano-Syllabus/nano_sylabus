drop table if exists public.topic_cards cascade;
drop table if exists public.prompt_templates cascade;
drop table if exists public.knowledge_chunks cascade;
drop table if exists public.knowledge_documents cascade;
drop table if exists public.knowledge_notebooks cascade;

drop function if exists public.set_topic_cards_updated_at() cascade;
