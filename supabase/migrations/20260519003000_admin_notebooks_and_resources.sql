create table if not exists public.knowledge_notebooks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  board text not null,
  level text not null,
  faculty text not null default '',
  subject text not null,
  curriculum text not null default '',
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_knowledge_notebooks_updated_at on public.knowledge_notebooks;
create trigger set_knowledge_notebooks_updated_at
before update on public.knowledge_notebooks
for each row
execute procedure public.set_current_timestamp_updated_at();

create index if not exists knowledge_notebooks_board_level_subject_idx
  on public.knowledge_notebooks(board, level, subject);

create index if not exists knowledge_notebooks_faculty_curriculum_idx
  on public.knowledge_notebooks(faculty, curriculum);

alter table public.knowledge_notebooks enable row level security;

drop policy if exists "knowledge_notebooks_select_admin" on public.knowledge_notebooks;
create policy "knowledge_notebooks_select_admin"
on public.knowledge_notebooks
for select
to authenticated
using (public.is_admin());

drop policy if exists "knowledge_notebooks_insert_admin" on public.knowledge_notebooks;
create policy "knowledge_notebooks_insert_admin"
on public.knowledge_notebooks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "knowledge_notebooks_update_admin" on public.knowledge_notebooks;
create policy "knowledge_notebooks_update_admin"
on public.knowledge_notebooks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "knowledge_notebooks_delete_admin" on public.knowledge_notebooks;
create policy "knowledge_notebooks_delete_admin"
on public.knowledge_notebooks
for delete
to authenticated
using (public.is_admin());

alter table public.knowledge_documents
  add column if not exists notebook_id uuid references public.knowledge_notebooks(id) on delete cascade,
  add column if not exists resource_kind text not null default 'study_material',
  add column if not exists resource_subtype text not null default 'textbook',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_document_type_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_document_type_check
  check (
    document_type in (
      'micro_syllabus',
      'curriculum',
      'syllabus',
      'learning_outcomes',
      'textbook',
      'notes',
      'solutions',
      'guides',
      'question_bank',
      'past_questions',
      'example_questions',
      'other'
    )
  );

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_resource_kind_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_resource_kind_check
  check (resource_kind in ('syllabus', 'study_material', 'question_bank'));

create index if not exists knowledge_documents_notebook_id_idx
  on public.knowledge_documents(notebook_id);

update public.knowledge_documents
set resource_kind = case
  when document_type in ('curriculum', 'syllabus', 'micro_syllabus') then 'syllabus'
  when document_type in ('question_bank') then 'question_bank'
  else 'study_material'
end,
resource_subtype = document_type
where notebook_id is null
   or resource_subtype is distinct from document_type
   or resource_kind is null;

insert into public.knowledge_notebooks (
  title,
  board,
  level,
  faculty,
  subject,
  curriculum,
  description
)
select distinct
  trim(concat_ws(' - ', kd.board, kd.grade, kd.subject, nullif(kd.curriculum, ''))) as title,
  kd.board,
  kd.grade as level,
  kd.faculty,
  kd.subject,
  kd.curriculum,
  '' as description
from public.knowledge_documents kd
where kd.notebook_id is null
  and not exists (
    select 1
    from public.knowledge_notebooks kn
    where kn.board = kd.board
      and kn.level = kd.grade
      and kn.faculty = kd.faculty
      and kn.subject = kd.subject
      and kn.curriculum = kd.curriculum
  );

update public.knowledge_documents kd
set notebook_id = kn.id
from public.knowledge_notebooks kn
where kd.notebook_id is null
  and kn.board = kd.board
  and kn.level = kd.grade
  and kn.faculty = kd.faculty
  and kn.subject = kd.subject
  and kn.curriculum = kd.curriculum;
