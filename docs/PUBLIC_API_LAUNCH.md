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

Upstash backs three things, each of which degrades independently if Redis is
missing or unreachable:

| Layer | Without Redis |
|---|---|
| Rate limiting (`lib/rateLimit.ts`) | **Fails open** — no limiting at all. |
| API-key auth cache (`lib/auth/apiKeyCache.ts`) | Every request pays a Supabase round-trip. Auth stays correct. |
| Idempotency (`lib/api/idempotency.ts`) | `Idempotency-Key` is ignored; retries re-run and re-bill. |

> Fine for a first smoke test, but set the vars before real traffic — the
> fail-open rate limiter is the one that leaves you exposed.

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

## 5. Entitlement — every subscriber gets the API

The pricing model is flat: **an active or trialing subscription grants both the
API endpoints and the key-management UI.** There is no API add-on, no per-tier
entitlement, and no environment switch — `userHasApiAccess()` reads exactly one
thing, `subscriptions.status`.

Consequences to verify before launch:

- A user with **no** `subscriptions` row, or one that isn't `active`/`trialing`,
  gets **402** from `/api/v1/*` and cannot create keys at `/agents/api-keys`
  (the page still renders with an upgrade prompt).
- A lapsed subscription revokes access on the next request; existing keys stay
  in the DB and start working again when the subscription is restored.
- `subscriptions.api_access` and `.tier` are still written by the Stripe webhook
  from plan metadata, but **nothing reads them for entitlement**. Leave them or
  drop them; just don't reintroduce them as a gate.

**Billing follows the same subject as entitlement.** `reportUsage()` meters to
`userId`'s own subscription — for the public API that's the key's `created_by`,
exactly who `userHasApiAccess()` gated. `orgId` is recorded on `usage_logs` for
per-org rollups but never selects the customer. This matters for orgs with
members: previously the meter resolved via the org *owner*, so a subscribing
member passed the gate while their usage billed someone else (or nobody).

Rate-limit tiers are a separate axis: `api_keys.rate_limit_tier` defaults to
`standard` for everyone. Map it off the purchased plan only if you later want
paid tiers to buy *more throughput* — that is a limits decision, not an
entitlement one.

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

   # idempotency — the second call must NOT re-run the agent
   curl -i $BASE/api/v1/chat -H "Authorization: Bearer $KEY" \
     -H "content-type: application/json" -H "Idempotency-Key: smoke-1" \
     -d '{"messages":[{"role":"user","content":"hello"}]}'
   # repeat verbatim → same body + `Idempotency-Replayed: true`
   # repeat with a different body → 422 idempotency_key_reuse

   # negative paths
   curl -i $BASE/api/v1/agents                         # 401 (no key)
   curl -i $BASE/api/v1/agents -H "Authorization: Bearer sk_test_bad"  # 401
   ```
4. Confirm in the DB / Stripe:
   - revoking a key at `/agents/api-keys` makes it 401 **typically on the next
     call** (the revoke path invalidates the auth cache), and **within 60s at
     the latest** — invalidation is best-effort, so if that Redis `del` fails
     the entry still lapses via its TTL;
   - a `usage_logs` row with `org_id` + `api_key_id` + `source='api'`;
   - a Stripe meter event on **the calling key's creator** as customer — not
     the org owner. Billing follows the same subject as entitlement;
   - **no `chat_messages` row** for the API call (stateless), while a web/mobile call still writes one.
5. Merge to `dev` → promote to production once the verification matrix passes.

## 7. Post-launch monitoring (the ongoing API operations)

- Vercel: function **duration** + **concurrency** (the scale ceiling).
- Upstash health; Stripe meter delivery. Watch for the `⚠️ Upstash not
  configured` / fail-open warnings in the function logs — they mean limits,
  auth caching, and idempotency are all silently off.
- OpenAI / SerpAPI error + rate-limit rates.
- Per-org cost; a runaway-usage alert per org.

## Open decisions still to confirm

- BAAs + public API ToS / DPA before any real PHI traffic (legal).
- Optional: whether paid tiers should buy extra throughput via
  `api_keys.rate_limit_tier` (§5). Entitlement itself is settled — all
  subscribers have the API.
- Optional: containerize the agent — a data-driven scale trigger, not a launch
  blocker. (The Redis auth-lookup cache that used to sit here is now shipped.)
