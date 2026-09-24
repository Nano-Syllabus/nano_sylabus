-- Allow a community creator to update the display name without changing the
-- stable URL slug used by existing links, invites, and memberships.
create or replace function public.update_owned_community_name(
  target_user_id uuid,
  target_community_slug text,
  target_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.communities%rowtype;
  normalized_name text := trim(coalesce(target_name, ''));
begin
  select * into matched
  from public.communities
  where slug = target_community_slug
  for update;

  if matched.id is null then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if matched.status <> 'active' then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if target_user_id is null or matched.creator_id <> target_user_id then
    raise exception 'Only the community creator can rename this community.' using errcode = '42501';
  end if;
  if char_length(normalized_name) < 3 or char_length(normalized_name) > 120 then
    raise exception 'Community name must be between 3 and 120 characters.' using errcode = '22023';
  end if;

  update public.communities
  set name = normalized_name
  where id = matched.id;

  return matched.id;
end;
$$;

revoke all on function public.update_owned_community_name(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_owned_community_name(uuid, text, text)
  to service_role;
