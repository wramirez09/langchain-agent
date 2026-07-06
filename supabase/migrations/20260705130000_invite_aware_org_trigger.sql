-- Make the auto-org trigger invite-aware.
--
-- When a member is invited to an existing org (via Supabase Auth
-- inviteUserByEmail with `invited_org_id`/`invited_role` in user metadata), the
-- new auth.users row should JOIN that org — not get a throwaway solo org.
-- Normal self-signups (no metadata) keep getting their own org as before.

create or replace function public.handle_new_user_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id   uuid;
  invited_org  uuid;
  invited_role text;
begin
  begin
    invited_org := (new.raw_user_meta_data ->> 'invited_org_id')::uuid;
  exception when others then
    invited_org := null;  -- malformed metadata -> treat as a normal signup
  end;

  invited_role := coalesce(new.raw_user_meta_data ->> 'invited_role', 'member');
  if invited_role not in ('owner', 'admin', 'member') then
    invited_role := 'member';
  end if;

  if invited_org is not null
     and exists (select 1 from public.organizations where id = invited_org) then
    -- Invited into an existing org: join it, no solo org.
    insert into public.organization_members (org_id, user_id, role)
    values (invited_org, new.id, invited_role)
    on conflict (org_id, user_id) do nothing;
  else
    -- Normal signup: create the user's own org.
    insert into public.organizations (name)
    values (coalesce(new.email, 'Organization'))
    returning id into new_org_id;

    insert into public.organization_members (org_id, user_id, role)
    values (new_org_id, new.id, 'owner');
  end if;

  return new;
end;
$$;
