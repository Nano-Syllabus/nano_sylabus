create table if not exists public.topic_cards (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.knowledge_documents(id) on delete cascade,
  board text not null default '',
  grade text not null default '',
  subject text not null default '',
  chapter text,
  topic text not null,
  title text not null,
  key_terms jsonb not null default '[]'::jsonb,
  core_explanation jsonb not null default '[]'::jsonb,
  formula_sheet jsonb not null default '[]'::jsonb,
  example_line text,
  common_mistake text,
  exam_angle text,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'published')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists topic_cards_subject_scope_idx
  on public.topic_cards (subject, board, grade);

create index if not exists topic_cards_chapter_topic_idx
  on public.topic_cards (chapter, topic);

create index if not exists topic_cards_status_idx
  on public.topic_cards (status);

create or replace function public.set_topic_cards_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists topic_cards_set_updated_at on public.topic_cards;

create trigger topic_cards_set_updated_at
before update on public.topic_cards
for each row
execute function public.set_topic_cards_updated_at();
