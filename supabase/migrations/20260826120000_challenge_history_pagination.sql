-- Completed challenge history is paginated newest-first for each student.
create index if not exists student_challenges_user_completed_history_idx
  on public.student_challenges (user_id, completed_at desc, created_at desc)
  where status = 'completed';
