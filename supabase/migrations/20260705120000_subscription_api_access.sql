-- Plan metadata mirrored from Stripe. The webhook populates these from the
-- purchased plan's product metadata (`api_access`, `api_tier`).
--
-- SUPERSEDED as an entitlement gate: API access is no longer tier-based. Every
-- active/trialing subscriber gets the API, and `userHasApiAccess()` reads only
-- `subscriptions.status`. These columns are retained as a record of the plan —
-- `tier` is still useful if rate-limit tiers are ever driven off the purchased
-- plan — but nothing reads them to decide access. Don't reintroduce them as a
-- gate without revisiting the pricing decision in docs/PUBLIC_API_LAUNCH.md §5.

alter table public.subscriptions
  add column if not exists api_access boolean not null default false,
  add column if not exists tier       text;
