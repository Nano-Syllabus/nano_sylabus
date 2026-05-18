alter table public.knowledge_documents
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists source_mime_type text,
  add column if not exists source_size_bytes bigint;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_size_bytes_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_source_size_bytes_check
  check (source_size_bytes is null or source_size_bytes >= 0);
