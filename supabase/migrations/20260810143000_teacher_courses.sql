create table if not exists public.teacher_courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  slug text not null unique,
  name text not null,
  short_name text not null default '',
  category text not null,
  authority text not null,
  tagline text not null,
  description text not null,
  duration_weeks integer not null default 12 check (duration_weeks between 1 and 104),
  level text not null default 'Intermediate' check (level in ('Beginner', 'Intermediate', 'Advanced')),
  language_modes text[] not null default array['English']::text[],
  access_model text not null default 'free' check (access_model in ('free', 'paid')),
  price_paisa integer not null default 0 check (price_paisa >= 0),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  diagnostic_question_count integer not null default 10 check (diagnostic_question_count between 5 and 100),
  daily_minutes integer not null default 20 check (daily_minutes between 5 and 240),
  pass_percentage numeric(5,2) not null default 40 check (pass_percentage between 0 and 100),
  negative_marking numeric(6,3) not null default 0 check (negative_marking between 0 and 100),
  exam_date date,
  outcomes text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  published_at timestamptz,
  archived_at timestamptz,
  constraint teacher_courses_id_teacher_unique unique (id, teacher_id)
);

create index if not exists teacher_courses_teacher_status_idx
  on public.teacher_courses (teacher_id, status, updated_at desc);

create index if not exists teacher_courses_public_idx
  on public.teacher_courses (status, visibility, published_at desc)
  where status = 'published' and archived_at is null;

create table if not exists public.teacher_course_subjects (
  course_id uuid not null,
  teacher_id uuid not null,
  subject_slug text not null,
  subject_name text not null,
  folder_path text not null default '',
  position integer not null default 0,
  weight_percentage numeric(5,2),
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (course_id, subject_slug),
  constraint teacher_course_subjects_course_teacher_fk foreign key (course_id, teacher_id)
    references public.teacher_courses(id, teacher_id) on delete cascade
);

create unique index if not exists teacher_course_subjects_teacher_slug_unique
  on public.teacher_course_subjects (teacher_id, subject_slug);

create table if not exists public.teacher_course_enrollments (
  course_id uuid not null references public.teacher_courses(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  primary key (course_id, student_id)
);

create index if not exists teacher_course_enrollments_student_idx
  on public.teacher_course_enrollments (student_id, enrolled_at desc);

alter table public.teacher_classrooms
  add column if not exists course_id uuid references public.teacher_courses(id) on delete set null;

create index if not exists teacher_classrooms_course_idx
  on public.teacher_classrooms (course_id, created_at desc)
  where course_id is not null;

alter table public.teacher_courses enable row level security;
alter table public.teacher_course_subjects enable row level security;
alter table public.teacher_course_enrollments enable row level security;

-- Course authoring remains server-only. Authenticated API routes use the
-- service role and verify the teacher plus their collection-scoped subjects.
