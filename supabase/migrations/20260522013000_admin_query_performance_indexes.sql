create extension if not exists pg_trgm;

-- Notebooks list: order + search paths
create index if not exists knowledge_notebooks_updated_at_idx
  on public.knowledge_notebooks(updated_at desc);

create index if not exists knowledge_notebooks_title_trgm_idx
  on public.knowledge_notebooks using gin (title gin_trgm_ops);

create index if not exists knowledge_notebooks_subject_trgm_idx
  on public.knowledge_notebooks using gin (subject gin_trgm_ops);

create index if not exists knowledge_notebooks_faculty_trgm_idx
  on public.knowledge_notebooks using gin (faculty gin_trgm_ops);

create index if not exists knowledge_notebooks_curriculum_trgm_idx
  on public.knowledge_notebooks using gin (curriculum gin_trgm_ops);

create index if not exists knowledge_notebooks_board_trgm_idx
  on public.knowledge_notebooks using gin (board gin_trgm_ops);

create index if not exists knowledge_notebooks_level_trgm_idx
  on public.knowledge_notebooks using gin (level gin_trgm_ops);

-- Resource list inside notebook: eq(notebook_id) + order(updated_at)
create index if not exists knowledge_documents_notebook_updated_idx
  on public.knowledge_documents(notebook_id, updated_at desc);

-- Resource search fields
create index if not exists knowledge_documents_title_trgm_idx
  on public.knowledge_documents using gin (title gin_trgm_ops);

create index if not exists knowledge_documents_subject_trgm_idx
  on public.knowledge_documents using gin (subject gin_trgm_ops);

create index if not exists knowledge_documents_chapter_trgm_idx
  on public.knowledge_documents using gin (chapter gin_trgm_ops);

create index if not exists knowledge_documents_curriculum_trgm_idx
  on public.knowledge_documents using gin (curriculum gin_trgm_ops);

create index if not exists knowledge_documents_faculty_trgm_idx
  on public.knowledge_documents using gin (faculty gin_trgm_ops);

create index if not exists knowledge_documents_resource_subtype_trgm_idx
  on public.knowledge_documents using gin (resource_subtype gin_trgm_ops);

-- AI answer admin queue: role/status filter + recent-first listing
create index if not exists chat_messages_assistant_created_idx
  on public.chat_messages(role, created_at desc);

create index if not exists chat_messages_assistant_feedback_review_idx
  on public.chat_messages(role, feedback, admin_reviewed_at, created_at desc);

create index if not exists chat_messages_assistant_content_trgm_idx
  on public.chat_messages using gin (content gin_trgm_ops)
  where role = 'assistant';

-- User admin detail / billing quick lookups
create index if not exists credits_ledger_user_created_idx
  on public.credits_ledger(user_id, created_at desc);

create index if not exists user_subscriptions_user_status_created_idx
  on public.user_subscriptions(user_id, status, created_at desc);

create index if not exists invoices_user_created_idx
  on public.invoices(user_id, created_at desc);

create index if not exists revision_notes_user_idx
  on public.revision_notes(user_id);
