create table if not exists public.student_exam_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_date date not null,
  title text not null default 'Exam'
    check (char_length(trim(title)) between 1 and 120),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint student_exam_dates_user_date_unique unique (user_id, exam_date)
);

create index if not exists student_exam_dates_user_date_idx
  on public.student_exam_dates (user_id, exam_date);

alter table public.student_exam_dates enable row level security;

drop policy if exists "student_exam_dates_select_own" on public.student_exam_dates;
create policy "student_exam_dates_select_own"
  on public.student_exam_dates for select
  using (auth.uid() = user_id);

drop policy if exists "student_exam_dates_insert_own" on public.student_exam_dates;
create policy "student_exam_dates_insert_own"
  on public.student_exam_dates for insert
  with check (auth.uid() = user_id);

drop policy if exists "student_exam_dates_update_own" on public.student_exam_dates;
create policy "student_exam_dates_update_own"
  on public.student_exam_dates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "student_exam_dates_delete_own" on public.student_exam_dates;
create policy "student_exam_dates_delete_own"
  on public.student_exam_dates for delete
  using (auth.uid() = user_id);
