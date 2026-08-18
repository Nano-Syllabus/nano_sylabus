-- Subject visibility is a creator-library property, not the sharing switch.
-- A subject is always private on its own. The course visibility determines
-- whether an attached subject is exposed to enrolled students.
update public.teacher_subject_profiles
set visibility = 'private',
    updated_at = timezone('utc'::text, now())
where visibility is distinct from 'private';
