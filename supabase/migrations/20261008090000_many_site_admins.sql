-- A subdomain site may have several admins (user, 2026-10-08); an admin still
-- runs one site (user_id stays unique). Super admins stay platform-wide with no
-- row here.
alter table public.landing_site_admins drop constraint landing_site_admins_pkey;
alter table public.landing_site_admins add primary key (site_slug, user_id);
create index if not exists landing_site_admins_site_idx on public.landing_site_admins(site_slug);
notify pgrst, 'reload schema';
