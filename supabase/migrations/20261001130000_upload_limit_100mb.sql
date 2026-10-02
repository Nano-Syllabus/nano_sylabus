-- Uploads up to 100 MB for now (2026-10-01). The app checks the same ceiling
-- (TEACHER_UPLOAD_MAX_BYTES in lib/teacher-upload.ts); the backend allows 200 MB
-- and nginx 220 MB, so the bucket was the 50 MB wall.
-- NOTE: the Supabase project's global "Upload file size limit" (Storage
-- settings) must also be at least 100 MB, or Storage refuses before the bucket
-- limit is consulted. The Free plan caps it at 50 MB.
update storage.buckets
set file_size_limit = 104857600
where id in ('teacher-documents');
