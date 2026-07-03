# Public API — Launch Runbook

Steps to take the public API (`/api/v1/*`) live. Most of this needs account
access (Upstash, Vercel, Supabase, Stripe), so it's a checklist for an operator,
not something the codebase can do for you.

## 1. Provision Upstash Redis

1. Create a Redis database at [upstash.com](https://upstash.com) in the **same
   region** as the Vercel deployment and the Supabase project (minimizes the
   per-request hop).
2. Copy the **REST URL** and **REST token** (not the native Redis URL).

## 2. Set environment variables (Vercel → Project → Settings → Environment Variables)

Add for **Production** and **Preview**:

| Variable | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | from step 1 |
| `UPSTASH_REDIS_REST_TOKEN` | from step 1 |

Confirm these already exist (the API reuses them):
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY` (+ live key),
`STRIPE_METER_EVENT_NAME`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, SerpAPI key.

> Without the Upstash vars the rate limiter **fails open** (no limiting) — fine
> for a first smoke test, but set them before real traffic.

## 3. Verify the schema (before migrating)

Run `supabase/verify_schema.sql` against the live DB (Supabase SQL editor or
`psql`). Reconcile any mismatch — especially: the new tables must not already
exist, and `usage_logs` must not already have `org_id` / `api_key_id` / `source`.

## 4. Apply the migration

1. **Staging / branch DB first:** apply
   `supabase/migrations/20260620120000_orgs_and_api_keys.sql`.
2. Verify the backfill:
   - every existing user has exactly one org + an `owner` membership;
   - creating a brand-new user auto-provisions an org (the `on_auth_user_created_create_org` trigger).
3. Confirm `subscriptions` still resolve per org (`getSubscriptionByOrgId`).
4. Then apply to **production**.

## 5. Stripe plan tiers

Create metered prices for **Standard / Pro / Enterprise** and decide the mapping
to `api_keys.rate_limit_tier` (the limiter reads the tier; pricing is your call).
A key with no active metered subscription still authenticates but its usage won't
meter — confirm the billing path for each tier.

## 6. Deploy + smoke test

1. Deploy the branch to a **Vercel preview**.
2. Create a key (dashboard at `/agents/api-keys`, or `POST /api/keys` with a session).
3. Exercise the surface:
   ```bash
   BASE=https://<preview-url>
   KEY=sk_test_xxx

   # agent (stream)
   curl -N $BASE/api/v1/agents -H "Authorization: Bearer $KEY" \
     -H "content-type: application/json" \
     -d '{"messages":[{"role":"user","content":"Is a knee MRI covered for Medicare?"}]}'

   # introspection + usage
   curl $BASE/api/v1/me    -H "Authorization: Bearer $KEY"
   curl $BASE/api/v1/usage -H "Authorization: Bearer $KEY"

   # negative paths
   curl -i $BASE/api/v1/agents                         # 401 (no key)
   curl -i $BASE/api/v1/agents -H "Authorization: Bearer sk_test_bad"  # 401
   ```
4. Confirm in the DB / Stripe:
   - a `usage_logs` row with `org_id` + `api_key_id` + `source='api'`;
   - a Stripe meter event on the org's customer;
   - **no `chat_messages` row** for the API call (stateless), while a web/mobile call still writes one.
5. Merge to `dev` → promote to production once the verification matrix passes.

## 7. Post-launch monitoring (the ongoing API operations)

- Vercel: function **duration** + **concurrency** (the scale ceiling).
- Upstash health; Stripe meter delivery.
- OpenAI / SerpAPI error + rate-limit rates.
- Per-org cost; a runaway-usage alert per org.

## Open decisions still to confirm

- Stripe tier pricing (§5).
- BAAs + public API ToS / DPA before any real PHI traffic (legal).
- Optional: pull the Redis auth-lookup cache forward, or containerize the agent
  — both are data-driven scale triggers, not launch blockers.
