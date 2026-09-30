-- Public bucket for landing-site logos (Admin → Websites → Brand).
-- Uploads go through the app's admin API with the service role; the public
-- flag only lets visitors' browsers load the images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-assets',
  'landing-assets',
  true,
  1048576,
  array['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg']
)
on conflict (id) do nothing;
