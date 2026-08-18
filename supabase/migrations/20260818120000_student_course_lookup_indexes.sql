-- Every render of /app/chat, /app/exams and /app/explore resolves a student's
-- enrolled courses. That fan-out filters teacher_course_subjects and
-- teacher_course_enrollments by course_id, but the only indexes on those tables
-- lead with teacher_id and student_id, so both filters fell back to a sequential
-- scan that grows with every course and enrollment on the platform.

create index if not exists teacher_course_subjects_course_idx
  on public.teacher_course_subjects (course_id);

create index if not exists teacher_course_enrollments_course_status_idx
  on public.teacher_course_enrollments (course_id, status);

-- The enrollment lookup that opens the same fan-out filters on student_id *and*
-- status; the existing student-only index makes Postgres re-check status on
-- every matching row.
create index if not exists teacher_course_enrollments_student_status_idx
  on public.teacher_course_enrollments (student_id, status);
