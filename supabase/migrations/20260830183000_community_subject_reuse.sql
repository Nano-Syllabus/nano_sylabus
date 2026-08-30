-- A community semester references the creator's existing subject workspace.
-- The same source subject may be organized into more than one community, but
-- it can appear only once inside any single community.

drop index if exists public.community_subjects_external_owner_unique;

create unique index if not exists community_subjects_external_community_unique
  on public.community_subjects (community_id, teacher_id, external_subject_slug)
  where teacher_id is not null and external_subject_slug is not null;

comment on table public.community_subjects is
  'Semester placement records that reference existing Creator Workspace subjects; source files and generated learning content remain owned by the teacher subject workspace.';
