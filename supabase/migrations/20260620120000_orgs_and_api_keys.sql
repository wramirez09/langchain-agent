-- Multi-tenancy + public API keys.
--
-- Introduces organizations as the tenant boundary. API keys, usage
-- attribution, rate limiting, and billing all scope to an org rather than a
-- bare user. Each existing user is backfilled into their own org (as owner),
-- and a trigger ensures every future auth.users row gets an org automatically
-- — so web signup, mobile, and the Stripe webhook user-creation path all keep
-- working without code changes.

/* ============================================================
 * 1. TENANT TABLES
 * ============================================================ */

create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.organization_members (
  org_id              uuid not null references public.organizations(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  role                text not null default 'member'
                        check (role in ('owner', 'admin', 'member')),
  created_at          timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- One membership row per user for the fast getOrgIdForUser() lookup.
create index organization_members_user_idx
  on public.organization_members (user_id);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

/* ============================================================
 * 2. API KEYS  (hashed secrets, scoped to an org)
 * ============================================================ */

create table public.api_keys (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  created_by          uuid not null references auth.users(id),
  key_hash            text not null unique,   -- SHA-256 hex of the full secret; plaintext is never stored
  key_prefix          text not null,          -- e.g. "sk_live_a1b2" for display/listing
  name                text,
  environment         text not null default 'live'
                        check (environment in ('live', 'test')),
  scopes              text[] not null default '{agents,chat}',
  rate_limit_tier     text not null default 'standard',
  created_at          timestamptz not null default now(),
  last_used_at        timestamptz,
  revoked_at          timestamptz,
  expires_at          timestamptz
);

create index api_keys_org_idx on public.api_keys (org_id);

comment on table public.api_keys is
  'Public API credentials, scoped to an organization. key_hash is SHA-256 of the full secret; the plaintext is shown to the user exactly once at creation.';

/* ============================================================
 * 3. USAGE ATTRIBUTION  (extend existing usage_logs)
 * ============================================================ */

alter table public.usage_logs
  add column if not exists org_id     uuid references public.organizations(id) on delete set null,
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null,
  add column if not exists source     text not null default 'web'
    check (source in ('web', 'mobile', 'api'));

create index if not exists usage_logs_org_idx on public.usage_logs (org_id, created_at desc);

/* ============================================================
 * 4. AUTO-ORG FOR NEW USERS
 * ============================================================ */

-- Every new auth.users row gets its own org + an owner membership. Covers all
-- signup paths (web, mobile, Stripe-webhook createUser) with no app changes.
create or replace function public.handle_new_user_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name)
  values (coalesce(new.email, 'Organization'))
  returning id into new_org_id;

  insert into public.organization_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created_create_org
  after insert on auth.users
  for each row execute function public.handle_new_user_org();

/* ============================================================
 * 5. BACKFILL EXISTING USERS
 * ============================================================ */

-- One org per existing user, named from their profile email when available.
with new_orgs as (
  insert into public.organizations (name)
  select coalesce(p.email, u.email, 'Organization')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where not exists (
    select 1 from public.organization_members m where m.user_id = u.id
  )
  returning id
),
-- Pair each freshly-created org with a user that still needs one. Both sets are
-- ordered the same way so the row_number join is stable.
ranked_orgs as (
  select id, row_number() over (order by id) as rn from new_orgs
),
ranked_users as (
  select u.id as user_id, row_number() over (order by u.id) as rn
  from auth.users u
  where not exists (
    select 1 from public.organization_members m where m.user_id = u.id
  )
)
insert into public.organization_members (org_id, user_id, role)
select o.id, ru.user_id, 'owner'
from ranked_orgs o
join ranked_users ru on ru.rn = o.rn;

-- Attribute historical usage to each user's org.
update public.usage_logs ul
set org_id = m.org_id
from public.organization_members m
where m.user_id = ul.user_id
  and ul.org_id is null;

/* ============================================================
 * 6. ROW-LEVEL SECURITY
 * ============================================================ */

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.api_keys              enable row level security;

-- Members can see their own orgs / membership rows.
create policy "members read their orgs" on public.organizations
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = organizations.id and m.user_id = auth.uid()
    )
  );

create policy "members read their memberships" on public.organization_members
  for select using (user_id = auth.uid());

-- Members manage API keys belonging to their org. Validation in the request
-- path uses the service-role client, which bypasses RLS to look up by hash.
create policy "members read org keys" on public.api_keys
  for select using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = api_keys.org_id and m.user_id = auth.uid()
    )
  );

create policy "members create org keys" on public.api_keys
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.organization_members m
      where m.org_id = api_keys.org_id and m.user_id = auth.uid()
    )
  );

create policy "members update org keys" on public.api_keys
  for update using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = api_keys.org_id and m.user_id = auth.uid()
    )
  );
