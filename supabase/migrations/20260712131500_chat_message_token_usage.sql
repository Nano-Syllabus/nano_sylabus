alter table if exists public.chat_messages
  add column if not exists input_tokens integer not null default 0,
  add column if not exists output_tokens integer not null default 0,
  add column if not exists total_tokens integer not null default 0;

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_input_tokens_nonnegative,
  add constraint chat_messages_input_tokens_nonnegative check (input_tokens >= 0);

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_output_tokens_nonnegative,
  add constraint chat_messages_output_tokens_nonnegative check (output_tokens >= 0);

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_total_tokens_nonnegative,
  add constraint chat_messages_total_tokens_nonnegative check (total_tokens >= 0);
