alter table public.knowledge_documents
  add column if not exists faculty text not null default '',
  add column if not exists curriculum text not null default '',
  add column if not exists document_type text not null default 'textbook',
  add column if not exists raw_content text not null default '',
  add column if not exists chunk_count integer not null default 0,
  add column if not exists processing_status text not null default 'draft',
  add column if not exists processing_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_document_type_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_document_type_check
  check (document_type in ('micro_syllabus', 'question_bank', 'textbook', 'notes', 'curriculum', 'syllabus', 'other'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_processing_status_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_processing_status_check
  check (processing_status in ('draft', 'processing', 'ready', 'failed'));

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_chunk_count_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_chunk_count_check
  check (chunk_count >= 0);

drop trigger if exists set_knowledge_documents_updated_at on public.knowledge_documents;
create trigger set_knowledge_documents_updated_at
before update on public.knowledge_documents
for each row
execute procedure public.set_current_timestamp_updated_at();

create index if not exists knowledge_documents_board_grade_subject_idx
  on public.knowledge_documents(board, grade, subject);

create index if not exists knowledge_documents_faculty_curriculum_idx
  on public.knowledge_documents(faculty, curriculum);

drop policy if exists "knowledge_documents_insert_admin" on public.knowledge_documents;
create policy "knowledge_documents_insert_admin"
on public.knowledge_documents
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "knowledge_documents_update_admin" on public.knowledge_documents;
create policy "knowledge_documents_update_admin"
on public.knowledge_documents
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "knowledge_documents_delete_admin" on public.knowledge_documents;
create policy "knowledge_documents_delete_admin"
on public.knowledge_documents
for delete
to authenticated
using (public.is_admin());

drop policy if exists "knowledge_chunks_insert_admin" on public.knowledge_chunks;
create policy "knowledge_chunks_insert_admin"
on public.knowledge_chunks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "knowledge_chunks_update_admin" on public.knowledge_chunks;
create policy "knowledge_chunks_update_admin"
on public.knowledge_chunks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "knowledge_chunks_delete_admin" on public.knowledge_chunks;
create policy "knowledge_chunks_delete_admin"
on public.knowledge_chunks
for delete
to authenticated
using (public.is_admin());

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  purpose text not null,
  language text not null default 'EN',
  description text,
  content text not null,
  is_active boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prompt_templates
  drop constraint if exists prompt_templates_purpose_check;

alter table public.prompt_templates
  add constraint prompt_templates_purpose_check
  check (purpose in ('system', 'followup', 'rewrite'));

alter table public.prompt_templates
  drop constraint if exists prompt_templates_language_check;

alter table public.prompt_templates
  add constraint prompt_templates_language_check
  check (language in ('EN', 'RN'));

drop trigger if exists set_prompt_templates_updated_at on public.prompt_templates;
create trigger set_prompt_templates_updated_at
before update on public.prompt_templates
for each row
execute procedure public.set_current_timestamp_updated_at();

create unique index if not exists prompt_templates_active_unique_idx
  on public.prompt_templates(purpose, language)
  where is_active = true;

alter table public.prompt_templates enable row level security;

drop policy if exists "prompt_templates_select_active_or_admin" on public.prompt_templates;
create policy "prompt_templates_select_active_or_admin"
on public.prompt_templates
for select
to authenticated
using (is_active = true or public.is_admin());

drop policy if exists "prompt_templates_insert_admin" on public.prompt_templates;
create policy "prompt_templates_insert_admin"
on public.prompt_templates
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "prompt_templates_update_admin" on public.prompt_templates;
create policy "prompt_templates_update_admin"
on public.prompt_templates
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "prompt_templates_delete_admin" on public.prompt_templates;
create policy "prompt_templates_delete_admin"
on public.prompt_templates
for delete
to authenticated
using (public.is_admin());
