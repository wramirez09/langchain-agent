-- Two tenancy defects from the orgs rollout.
--
-- Neither historical migration is edited: 20260620120000 and 20260705130000 are
-- already applied, so this file corrects forward. On a fresh database the old
-- backfill still runs first and this migration cleans up after it.

/* ============================================================
 * 1. ORG JOIN NO LONGER TRUSTS CLIENT-SUPPLIED METADATA
 *
 * handle_new_user_org() read `invited_org_id` / `invited_role` straight out of
 * raw_user_meta_data and only checked that the org existed. But that column is
 * populated verbatim from `options.data` on supabase.auth.signUp(), which any
 * client can call with the public anon key. So anyone could self-register with
 *
 *   { invited_org_id: '<someone-elses-org>', invited_role: 'owner' }
 *
 * and be inserted into that org as its owner — full cross-tenant takeover of
 * API keys, usage and membership.
 *
 * The gate is `invited_at`: GoTrue sets it only for admin inviteUserByEmail and
 * never for self-signup, so it cannot be forged through the public API. The
 * metadata is still *read* for org and role, but it is only honoured on a row
 * the auth server itself marked as invited.
 * ============================================================ */

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
  -- Only an admin-issued invite may carry org/role. Self-signup metadata is
  -- attacker-controlled and is ignored entirely.
  if new.invited_at is not null then
    begin
      invited_org := (new.raw_user_meta_data ->> 'invited_org_id')::uuid;
    exception when others then
      invited_org := null;  -- malformed metadata -> treat as a normal signup
    end;

    invited_role := coalesce(new.raw_user_meta_data ->> 'invited_role', 'member');
    if invited_role not in ('owner', 'admin', 'member') then
      invited_role := 'member';
    end if;
  else
    invited_org := null;
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

/* ============================================================
 * 2. API KEY RLS MATCHES THE ROUTE HANDLERS
 *
 * The insert/update policies required only org membership, while every route
 * requires owner/admin (canManage). Because browsers hold a real JWT and the
 * anon key, a plain member could bypass the routes entirely — most sharply by
 * running `update api_keys set revoked_at = null`, undoing an admin's
 * revocation. Roles now match, and the update policy gets a with-check so a row
 * cannot be rewritten into a state the policy would not have allowed.
 * ============================================================ */

drop policy if exists "members create org keys" on public.api_keys;
drop policy if exists "members update org keys" on public.api_keys;

create policy "managers create org keys" on public.api_keys
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = api_keys.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "managers update org keys" on public.api_keys
  for update
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = api_keys.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.org_id = api_keys.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

/* ============================================================
 * 3. REPAIR ORG NAMES LEAKED ACROSS TENANTS
 *
 * The backfill in 20260620120000 built each org's name from one user's email,
 * then paired orgs to users by row_number() over two unrelated orderings
 * (organizations.id, a random uuid, vs auth.users.id). Names therefore landed
 * on the wrong orgs, and since GET /api/org returns the name to every member,
 * each tenant was shown another customer's email address.
 *
 * Only rows that are demonstrably mispaired are touched: the current name is
 * some *other* user's email address. Orgs renamed by hand (e.g. 'test') and
 * orgs already named after their own owner are left exactly as they are.
 * ============================================================ */

update public.organizations o
set name = owner_email.email,
    updated_at = now()
from (
  select m.org_id, u.email
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.role = 'owner'
) as owner_email
where owner_email.org_id = o.id
  and owner_email.email is not null
  and o.name is distinct from owner_email.email
  -- Mispaired means the name is a *different real user's* address. Anything
  -- else is a deliberate rename and must survive this migration.
  and exists (
    select 1 from auth.users other
    where lower(other.email) = lower(o.name)
      and other.id <> (
        select m2.user_id from public.organization_members m2
        where m2.org_id = o.id and m2.role = 'owner'
        limit 1
      )
  );
