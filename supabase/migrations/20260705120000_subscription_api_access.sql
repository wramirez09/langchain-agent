-- Tier-gated API access. Additive + safe: adds columns the Stripe webhook can
-- populate from the purchased plan. `api_access` gates whether the org may use
-- the public API; `tier` names the plan (also usable to drive rate_limit_tier).
-- Enforcement is off by default (API_ACCESS_MODE=open) until pricing tiers exist.

alter table public.subscriptions
  add column if not exists api_access boolean not null default false,
  add column if not exists tier       text;
