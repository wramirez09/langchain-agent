-- Schema verification for the public-API migration (READ-ONLY).
-- Run this against the LIVE database BEFORE applying
-- migrations/20260620120000_orgs_and_api_keys.sql.
--
-- The migration was authored from the application code, not an introspected
-- schema, so confirm these assumptions hold before applying.

-- 1) Tables the migration / code depend on must exist with the expected columns.
--    Eyeball that usage_logs, subscriptions, profiles, chat_messages all appear
--    with the columns referenced below.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('usage_logs', 'subscriptions', 'profiles', 'chat_messages')
order by table_name, ordinal_position;

-- Expected (minimum) columns:
--   usage_logs     : user_id, usage_type, quantity, stripe_reported, created_at
--                    (migration ADDS org_id, api_key_id, source — they must NOT exist yet)
--   subscriptions  : user_id, stripe_customer_id, stripe_subscription_id, metered_item_id
--   profiles       : id, email, stripe_customer_id

-- 2) The new tables must NOT already exist (the migration creates them).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('organizations', 'organization_members', 'api_keys');
-- Expect: 0 rows. Any row = name collision — reconcile before applying.

-- 3) The columns the migration ADDS to usage_logs must NOT exist yet.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'usage_logs'
  and column_name in ('org_id', 'api_key_id', 'source');
-- Expect: 0 rows. Any row = re-applying / partial state — reconcile.

-- 4) The migration's updated_at trigger reuses public.set_updated_at()
--    (created by the chat_messages migration). It must already exist.
select proname
from pg_proc
where proname = 'set_updated_at';
-- Expect: 1 row. If 0, ensure the chat_messages migration ran first.

-- 5) Sanity: how many users will the backfill create orgs for?
select count(*) as users_to_backfill
from auth.users;
-- Informational — every one of these gets exactly one org + owner membership.
