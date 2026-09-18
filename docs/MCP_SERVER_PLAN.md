# MCP Server — Implementation Plan

*Branch: `feat/mcp` · Drafted 2026-08-09 · Implemented 2026-09-17 · Status: **built, all three phases, not yet deployed***

> **Implementation notes — where the build differed from this plan.** Kept here
> because each one was a real finding, not a preference.
>
> - **The phase-1 TS gate passed as-is.** `typescript@5.1.6` + `zod@4.3.6` +
>   `@modelcontextprotocol/server@2.0.0` typecheck and build with no annotations
>   and no TypeScript bump (R3 retired). Every other verified fact in the
>   architecture table held.
> - **The two schemas moved rather than being exported.** Exporting
>   `inputSchema` from `medicarePolicyDetailTool.ts` and `toolInputSchema` from
>   `policyContentExtractorTool.ts` would have forced a *static* import of those
>   modules to read them — and the extractor imports `@/lib/llm` at module
>   scope, which is exactly what the lazy-import rule exists to avoid. They now
>   live in `tools/utils/policyDetailTypes.ts` as
>   `MedicarePolicyDetailInputSchema` / `PolicyContentExtractorInputSchema`,
>   beside the shape they produce and next to the two schemas already in
>   `utils/`.
> - **Three more static imports had to go lazy for the same reason the tools
>   did.** `lib/supabaseAdmin` *throws* at import time without a service-role
>   key, and it is reachable from `buildMcpServer` three ways: the guideline
>   resources, `usage.repo` (the `usage` tool) and `lib/usage` (metering). A
>   static import turned a missing key into a dead `initialize` for the whole
>   surface, not one failing tool. Caught by `server.test.ts` on its first run.
> - **`isPriorAuthArtifact` is not sufficient to gate `structuredContent`.** It
>   is a discriminator check (`kind` + `schemaVersion`), so it passes for a
>   payload `priorAuthArtifactSchema` would reject — and the SDK validates
>   `structuredContent` against `outputSchema`. The screening tool runs a real
>   `safeParse` and degrades to `text` on failure, so a partial artifact cannot
>   fail a run the caller was already billed for.
> - **`lib/cache` kept Jest alive.** Its janitor `setInterval` is created at
>   module scope and was never `unref`'d, which is invisible under `jsdom` but
>   hangs any Node-environment suite that imports it. Fixed at the source
>   (`cleanupInterval.unref?.()`) rather than worked around per suite.
> - **The client test uses `InMemoryTransport`, not `StreamableHTTPClientTransport`.**
>   The HTTP client transport leaves timers behind that outlive the suite. The
>   HTTP entry is covered instead by `app/api/mcp/__tests__/handler.test.ts`,
>   which POSTs raw JSON-RPC at `getHandler()` — and which also asserts the
>   lazy-import rule directly, by failing if a `tools/list` loads `runAgent` or
>   any tool module.
> - **Legacy-era responses are SSE-framed.** A claim-less (2025-era) POST comes
>   back as `event: message` / `data: …` rather than a bare JSON body, so
>   `Accept` must include `text/event-stream` — that is now in the smoke-test
>   commands.
> - **The log-redaction blocker is fixed, and slightly wider than specified.**
>   `app/api/chat/agents/tools/utils/logSafe.ts` redacts `query` / `treatment` /
>   `diagnosis` to their length and keeps the structural fields. Applied to the
>   three lines named below **plus** the two `Cache hit for query:` lines in the
>   LCD and LCA tools, which echoed the same free text.
> - **Not done:** `truncateForClient`'s hard cap had an off-by-one (the marker's
>   own digits), fixed; `FileUploadTool` (R8) is still dead code awaiting its own
>   deletion PR.

## Context

NoteDoctorAi already exposes a public, API-key-authenticated REST surface (`/api/v1/agents`, `/chat`, `/me`, `/usage`) with orgs, scoped keys, Redis-backed rate limiting, idempotency and Stripe metering. That surface only helps integrators who write code against it.

MCP (Model Context Protocol) reaches the other audience: a provider working inside Claude Code, Claude Desktop or Cursor should be able to ask coverage questions and get NoteDoctorAi's Medicare + commercial-payer research back without building anything. The branch `feature/add-mcp` was created for this and is currently empty of MCP work — there is no MCP code, dependency, or commit anywhere in the repo.

The groundwork is unusually favorable: `resolveApiAuth(req: Request)` is transport-agnostic, all seven retrieval tools are `StructuredTool` classes carrying zod schemas, and `runAgent`/`runChat` were deliberately factored so auth/rate-limiting/validation stay in the route. This is mostly a new route plus an adapter layer — not new business logic.

**Decisions locked:** expose a server (not consume); publish retrieval tools + full screening + account tools + guideline resources; Bearer API-key auth (`sk_live_…`), no OAuth this phase.

---

## Architecture decision: `@modelcontextprotocol/server@2.0.0`

Verified against the npm registry and the SDK docs while planning:

| Fact | Evidence |
|---|---|
| `@modelcontextprotocol/server@2.0.0` published 2026-07-27 | registry; **2 deps** (`@modelcontextprotocol/core@2.0.0`, `zod@^4.2.0`), `engines.node >=20` |
| `createMcpHandler(factory)` returns `{ fetch, close, notify, bus }`; `fetch` is web-standard `(Request, { authInfo }) => Promise<Response>` | `docs/serving/http.md` |
| Factory runs **once per request**; no instance state; scales horizontally as-is | `docs/serving/http.md` |
| `inputSchema` takes a **zod v4 schema directly** (Standard Schema); SDK derives JSON Schema itself | `README.md` |
| **Default `legacy: 'stateless'` serves 2025-era clients from the same factory** — Claude Code/Desktop/Cursor work with no extra config | `docs/serving/legacy-clients.md` |
| Dual ESM/CJS (`require` → `./dist/index.cjs`), types `.d.mts`/`.d.cts` | registry `exports` |
| `handler.fetch` can be passed straight to `StreamableHTTPClientTransport` for in-process tests | `docs/testing.md` |

**Why not the alternatives.** v1 (`@modelcontextprotocol/sdk@1.30.0`) carries **17 dependencies** including express@5, hono, jose and `zod-to-json-schema@^3.25.1`, and its transports are Node `req`/`res` — an impedance mismatch with App Router's Web `Request`/`Response`. `mcp-handler@2.1.0` now merely peer-deps on `@modelcontextprotocol/server@^2.0.0`, adding a second release cadence and an OAuth-flavored `withMcpAuth` that would fight our `apiError` envelope. Hand-rolling JSON-RPC means permanently owning version negotiation across the `2024-10-07` → `2026-07-28` revision span.

Auth stays entirely **in front of** the handler, so every existing contract is preserved byte-for-byte. Confine the SDK to `lib/mcp/handler.ts` + `lib/mcp/server.ts` so a hand-rolled fallback stays a live escape hatch.

### Gate this in hour one

`@modelcontextprotocol/server` devDeps `typescript@^5.9.3`; this repo pins **5.1.6**, and zod 4 officially requires TS ≥5.5. Add the dep, write a 20-line route with one hello tool, run `yarn typecheck && yarn build`. If generic inference through `registerTool` fails, either annotate handler args (`async (args: z.infer<typeof S>) => …`) or bump `typescript` to `^5.9` in the same PR (independently justified). **Pin the exact version** `"@modelcontextprotocol/server": "2.0.0"` — do not repeat the `"zod": "latest"` pattern. Do **not** add it to `serverExternalPackages`.

---

## Phase 1 — connect + retrieval tools (shippable PR)

### `app/api/mcp/route.ts` — transport edge

Deliberately outside `lib/` because `jest.config.js:20-22` collects `lib/**/*.ts` at 80% thresholds; untestable glue lives here, logic lives in `lib/mcp/**`.

```ts
export const maxDuration = 300;
export const dynamic = "force-dynamic";
// no `runtime` export — Node.js default, like every other route (crypto/fs/LangChain)
export { handle as POST, handle as GET, handle as DELETE };
```

`handle(req)` mirrors `app/api/v1/agents/route.ts:32-89` **stage for stage**:

1. `resolveApiAuth(req)` → `apiError(...)`, plus `WWW-Authenticate: Bearer realm="notedoctor-mcp"` so clients prompt for a token instead of failing opaquely (also the OAuth seam).
2. `hasAnyMcpScope(auth)` → 403.
3. `userHasApiAccess(auth.createdBy)` → 402.
4. `checkRateLimit(auth.orgId, auth.apiKeyId, auth.tier)` → `rateLimitHeaders` / `rateLimitedResponse`.
5. `waitUntil(touchApiKey(auth.apiKeyId))`.
6. `await getHandler().fetch(req, { authInfo: toAuthInfo(auth) })`.
7. Re-wrap to merge headers — a returned `Response`'s headers are immutable, and `res.body` may be an SSE stream, so pass the `ReadableStream` through untouched:
   `new Response(res.body, { status: res.status, headers: new Headers([...res.headers, ...Object.entries({ ...NO_STORE, ...rlHeaders })]) })`

No CORS, matching the `/api/v1/*` comment at `app/api/v1/agents/route.ts:22-27` — the key is a secret and must never ship to a browser. `proxy.ts`'s matcher already excludes `/api`, so no middleware change.

### New `lib/mcp/` modules

| File | Responsibility |
|---|---|
| `handler.ts` | `getHandler()` — module-scope memoized `createMcpHandler(factory)`. Do **not** set `responseMode`; the default (JSON, upgrading to SSE when a notification precedes the result) is exactly right. |
| `server.ts` | `buildMcpServer(ctx)` — name/version from `package.json`, calls the register functions |
| `context.ts` | `McpCallContext = { auth: ApiAuthContext; meter(usageType: string): void }` |
| `auth.ts` | `resolveMcpAuth(req)` — today a delegate to `lib/auth/resolveApiAuth.ts:44`; tomorrow branches on token shape. **The documented OAuth seam.** |
| `policy.ts` | `hasAnyMcpScope`, `TOOL_SCOPES`, `canUse(auth, toolName)`, `RESOURCES_ENABLED` |
| `adapt.ts` | the `StructuredTool` bridge |
| `limits.ts` | `MAX_TOOL_TEXT_CHARS = 60_000`, `truncateForClient(text)` |
| `tools/retrieval.ts` | the 7 tools |
| `tools/account.ts` | `whoami` / `usage` — trivial, and the fastest end-to-end proof against a real client |

### Tool definition layer

**Hand-author a static registry; do not iterate `createAgentTools()`.** Three concrete reasons:

1. **The existing descriptions are wrong-or-harmful over MCP.** `CommercialGuidelineSearchTool.ts:180-196` says *"NEVER call this tool when Guidelines is 'Medicare'"* and *"CRITICAL CONFIDENTIALITY: Never mention specific data sources, tool names, URLs, file names…"* — shipping that verbatim injects our internal orchestration policy into a third party's model. **Rewrite every description for an external audience.**
2. `policyContentExtractorTool.ts:147` has a broken generic papered over by `schema = toolInputSchema as any` at :153; reading `.schema` off the instance inherits the `any`. Importing the constant does not.
3. It makes the surface a reviewed contract rather than "whatever `createAgentTools()` returns" — which today includes `new SerpAPI()` (`lib/handlers/runAgent.ts:71`), correctly excluded.

**Schemas:** pass zod straight to `registerTool({ inputSchema })`. `MedicareSearchInputSchema` (`tools/utils/medicareSearchTypes.ts:7`) and `CommercialGuidelineSearchInputSchema` (`tools/utils/commercialGuidelineTypes.ts:46`) are already exported and `.describe()`-annotated, so JSON Schema descriptions come free. Two need exporting: `medicarePolicyDetailTool.ts:6` (`inputSchema`) and `policyContentExtractorTool.ts:68` (`toolInputSchema`).

**Lazy-import every tool implementation** (`await import(...)` inside the handler); only pure zod schema modules get static imports. Precedent: `lib/priorAuth/reviewArtifact.ts:138`. This is not only about `CommercialGuidelineSearchTool.ts:2` throwing at import time without `SUPABASE_SERVICE_ROLE_KEY` — `lib/handlers/runAgent.ts:44` calls `startCmsWarmup()` at module scope, so a static import would fire CMS fetches + embedding preload on **every** `initialize`/`tools/list`, i.e. every client's first request. Wrap each in try/catch → `isError: true` with "not configured on this deployment".

**Call and normalize:**

```ts
const mod = await import("@/app/api/chat/agents/tools/medicareMultiSearchTool");
const raw = await mod.medicareMultiSearchTool.invoke(args);   // returns a JSON string
return { content: [{ type: "text", text: truncateForClient(normalize(raw)) }] };
```

`normalize` handles the one irregular shape: `policy_content_extractor` returns an array-of-JSON-strings for >1 URL — re-parse each and emit a single JSON array.

**Errors:** schema violations are caught by the SDK before the handler runs. Tool/upstream failures, missing scope, and the missing-`state` case on LCD/LCA → `isError: true` with a readable message so the model can retry. Reserve JSON-RPC errors for protocol-level failures (unknown resource URI); auth/quota/rate-limit never get there — they are HTTP responses from the route.

**Budgets:** `truncateForClient` — passthrough under 60k chars; else drop `relatedMatches`, then trim `topMatches`, re-serialize; else hard-truncate **with an explicit marker** (`[truncated: N of M chars omitted — narrow the query]`). Never truncate mid-JSON.

**Naming:** keep wire names identical to the LangChain names. MCP clients namespace by server (`mcp__notedoctor__medicare_multi_search`), so a prefix would double up.

### Scope decision: map MCP onto existing scopes — do not add an `mcp` scope

`supabase/migrations/20260620120000_orgs_and_api_keys.sql:42-59` has `scopes text[] default '{agents,chat}'` with **no CHECK constraint**, and `app/api/keys/route.ts:18-23` restricts creation to `z.enum(["agents","chat"])`. A strict `scopes.includes("mcp")` would **403 every key ever issued**.

- Endpoint gate: require at least one of `agents` | `chat`.
- `run_prior_auth_screening` → `agents` (it *is* `/api/v1/agents`).
- The 7 retrieval tools → `agents` **or** `chat`.
- `whoami` / `usage` → no scope, mirroring `app/api/v1/me/route.ts`.
- **A tool the caller lacks scope for is simply not registered on that request's instance** — the factory receives `authInfo`, so callers never see tools they can't call. Better than a runtime 403.

Adding an `mcp` scope would force a migration, a `CreateKeySchema` change, a `components/ApiKeysManager.tsx:50-61` change, a docs change and a "regenerate your key" support burden — for zero security gain, since it maps onto identical capabilities. Add it when MCP grows a capability REST lacks.

---

## Phase 2 — `run_prior_auth_screening`

**Call `runAgent` and parse the `Response`. Do not refactor `runAgent` in this PR** — it is ~400 lines with subtle watchdog/persistence/truncation semantics, depended on by two routes and pinned by `lib/handlers/__tests__`. A JSON round-trip of a ~50 KB artifact costs microseconds against a 50-second run. Extract `runAgentCore()` later, once the MCP path is green.

```ts
let handled: {code,message,status,requestId} | null = null;
const respondError: ErrorResponder = (e) => { handled = e; return new Response(null, { status: e.status }); };

const res = await commit(await runAgent({
  messages: args.messages, threadId: args.threadId ?? null,
  clientType: "mobile",                        // → the non-streaming NextResponse.json branch
  identity: { userId: auth.createdBy, orgId: auth.orgId, apiKeyId: auth.apiKeyId,
              source: "api", environment: auth.environment },
  respondError,
}));
```

**`source: "api"` is load-bearing.** `lib/handlers/runAgent.ts:115` — `const persistMessages = identity.source !== "api"` — is what keeps MCP traffic out of `chat_messages` and out of PHI custody. Never change it here.

**Add no metering.** `runAgent` already reports `usageType: "orchestrator"`; a second `reportUsage` would double-bill. Say so in a comment.

**Structured output** — shaped so it is always satisfiable, since the review gate returns a plain string for non-artifact answers:

```ts
outputSchema: z.object({
  threadId: z.string(),
  artifact: priorAuthArtifactSchema.nullable(),   // lib/priorAuth/artifactSchema.ts:212
  text: z.string().nullable(),
})
```

Set `artifact` when `isPriorAuthArtifact(payload)` (`artifactSchema.ts:285`), else `text`. Always emit a `content` text block alongside for era-compat.

**Latency (45–65s; watchdog 270s; `maxDuration` 300).** Client timeouts are the predicted #1 support issue — document `MCP_TOOL_TIMEOUT=300000` in the setup snippet. Emit `notifications/progress` on a ~10s interval cleared in `finally`; this upgrades the response to SSE automatically and resets most clients' idle timers.

**Idempotency — do this in phase 2, not later.** MCP has no `Idempotency-Key`, but a client that times out at 60s *will* retry, and each retry is a real billed run. Derive a key and reuse `lib/api/idempotency.ts` unchanged:

```ts
const key = sha256(`${auth.orgId}:run_prior_auth_screening:${JSON.stringify(args)}`);
```

`kind === "conflict"` (in-flight, 6-min TTL) → `isError: true`, *"a screening with identical inputs is already running"* — exactly right for a retrying client. Note `commit()` reads the body, so order is `commit(await runAgent(...))` **before** `.json()`.

### Metering

Bill per `tools/call`, not per HTTP request.

| Surface | `usageType` |
|---|---|
| `run_prior_auth_screening` | `orchestrator` — **already metered inside `runAgent`; add nothing** |
| 6 cheap retrieval tools | `mcp_tool` |
| `policy_content_extractor` | `mcp_extract` — it makes a real `llmSummarizer()` call, ~10× the others; a separate string now avoids a data migration when you price it |
| `resources/read` | `mcp_resource` |
| `whoami` / `usage` | unmetered, mirroring `/api/v1/me` |

Billing subject stays `auth.createdBy`.

**`getUsageSummaryByOrgId` must be extended** (`lib/db/repositories/usage.repo.ts:62-66`) or `/api/v1/usage` silently under-reports: its `total` is an unfiltered count, so `total` will include MCP rows while `agents + chat` won't sum to it. Add an `mcp` bucket over `["mcp_tool","mcp_extract","mcp_resource"]`. `lib/db/**` is coverage-excluded, but `app/api/v1/usage/route.ts`'s response shape changes — check tests asserting that body.

---

## Phase 3 — guideline resources (flag-gated, needs sign-off)

**URI scheme `notedoctor://guideline/{corpusId}`**, where `corpusId` is `commercial_guidelines.id` — the same id search results already carry. That is the affordance: *search → get `corpusId` → `resources/read` the full text.*

Reject path-shaped URIs (`.../cardio/afib`): `CommercialGuidelineSearchTool.ts:34 redactResult` exists precisely to keep folder and file names out of output. Also reject `generateDocId` (`commercialGuidelineMetadataIndex.ts:34`) as identity — it is `md5(absolutePath).slice(0,12)`, so it is `process.cwd()`-dependent and **not stable between local and Vercel**.

**Read from Supabase, not disk:** ids match search results 1:1; `loadDocumentContent` (`commercialGuidelineMetadataIndex.ts:157`) does a dynamic `fs.readFileSync` under `process.cwd()` that Next's static file tracing cannot see, so bundling the 96 files isn't guaranteed; and `lib/priorAuth/review/sourceBodies.ts` `fetchCommercialBodies` already reads `commercial_guidelines.body` with `TTL.VERY_LONG` caching. Use `app/api/data/corpus-manifest.json` only as a test cross-check.

One `registerResource` with a `ResourceTemplate` + `list` callback gives both `resources/list` (96 entries, ~12 KB, one page) and `resources/templates/list`. Add a static `notedoctor://corpus/manifest` (`application/json`, `{count, domains[]}`) so a client can orient without listing 96 docs. Unknown `corpusId` → throw (JSON-RPC error); never fall through to a filesystem read.

> **Concern, stated once:** exposing full bodies reverses `redactResult`'s deliberate stripping of `body` on proprietary commercial-payer criteria, and MCP resources are trivially bulk-exfiltrated. Build it as specified, but ship **default-OFF behind `MCP_EXPOSE_GUIDELINE_RESOURCES`**, metered per read, so the flip is a named product decision rather than a side effect.

---

## Required pre-launch fix: log redaction

Three exposed tools echo caller-supplied free text into Vercel logs. Under MCP that text is **third-party input that may contain PHI**:

- `CommercialGuidelineSearchTool.ts:200` — `console.log("...Received input:", input)`
- `localLcdSearchTool.ts:74` — `console.log("...Searching LCDs:", JSON.stringify(normalized))`
- `localArticleSearchTool.ts:76` — same for LCAs

`normalized` carries `query`, `treatment`, `diagnosis`. Add a redaction wrapper (or drop the payload, keeping timings) **before** enabling MCP. This is a blocker, not a nice-to-have.

SSRF is in better shape than expected: `policyContentExtractorTool.ts:216-227` uses `redirect: "manual"` and **re-validates the allowlist on the redirect target** — confirmed. It follows a single hop, and the 30s timeout is per-URL with `.max(3)` enforced by zod.

---

## Files touched

**New:** `app/api/mcp/route.ts`; `lib/mcp/{handler,server,context,auth,policy,adapt,limits}.ts`; `lib/mcp/tools/{retrieval,screening,account}.ts`; `lib/mcp/resources/{guidelines,corpus}.ts`; tests under `lib/mcp/__tests__/` and `app/api/mcp/__tests__/`.

**Edited:** `medicarePolicyDetailTool.ts:6` + `policyContentExtractorTool.ts:68` (export schemas); `lib/db/repositories/usage.repo.ts:62-66` (+`mcp` bucket); `app/api/debug/route.ts` (see trap below); `package.json`; the three log lines above; docs (below).

**Not touched:** `proxy.ts` (matcher already excludes `/api`), `next.config.js` (its `/api/:path*` no-store + security headers are correct), `vercel.json` (`/api/v1/*` is already absent and relies on route-level `maxDuration`; adding only `/api/mcp` would create an inconsistency — verify 300s on the first preview instead).

**Docs:** `public/openapi.yaml` (one `POST /api/mcp` path documented as JSON-RPC with a spec link — do **not** model `tools/call` in OpenAPI); `app/api/v1/docs/route.ts` (MCP section: install line, `MCP_TOOL_TIMEOUT`, tool + scope tables); `.env.example` (`MCP_EXPOSE_GUIDELINE_RESOURCES=false`); `public/llms.txt`; `README.md`; `docs/PUBLIC_API_LAUNCH.md` (scope rationale, `usageType` values, the JSON-RPC-batch rate-limit gap, smoke commands); `CLAUDE.md` (MCP section — and while there, fix the stale "no semicolons, single quotes" claim: `.prettierrc.json` is `{}` and resolves *before* `prettier.config.js`, so Prettier defaults apply).

> **`/api/debug` trap:** `publicApiReady = Object.values(checks).every(Boolean)`, so putting a deliberately-false flag inside `checks` would make a healthy deployment report unready. Report it as a sibling: `flags: { mcpGuidelineResources }`.

---

## Verification

**Two Jest gotchas to plan for.** `testEnvironment: "jsdom"` (`jest.config.js:9`) will resolve the SDK's `_shims` **browser** condition — put `/** @jest-environment node */` docblocks on every `lib/mcp/__tests__/*` file. If you hit `Cannot use import statement outside a module`, add `@modelcontextprotocol/.*` to `transformIgnorePatterns` (`jest.config.js:17-19`); precedent is the `uncrypto` mapper at :14.

`lib/mcp/**` must ship with its tests in the same PR or it drags the global 80% below threshold and breaks the husky hooks.

- `adapt.test.ts` — truncation passthrough / marker / JSON-shaped shrink order; the array-of-strings normalization.
- `policy.test.ts` — scope→visible-tool matrix over `{agents}`, `{chat}`, `{agents,chat}`, `{}`; assert `run_prior_auth_screening` is **absent** for a chat-only key.
- `server.test.ts` — the high-value one. Per `docs/testing.md`, add `@modelcontextprotocol/client@2.0.0` as a devDependency and drive the real client in-process:

  ```ts
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"),
    { fetch: (url, init) => handler.fetch(new Request(url, init)) });
  const client = new Client({ name: "test-harness", version: "1.0.0" },
                            { versionNegotiation: { mode: "auto" } });
  ```

  Assert the `tools/list` name set, that `medicare_multi_search`'s derived `inputSchema` has `required: ["query"]` and carries the `.describe()` text, and that a schema-violating call returns `isError: true` **without invoking the underlying tool**. Close client then handler in `afterEach`.
- `screening.test.ts` — mock `@/lib/handlers/runAgent`; assert `structuredContent.artifact`, the `respondError` path → `isError` carrying `requestId`, and idempotency `conflict` → `isError`.
- `resources.test.ts` — every URI matches `notedoctor://guideline/<id>` with no `/` and no `.md`; unknown id throws; flag-off registers nothing.
- `app/api/mcp/__tests__/route.test.ts` — stage order 401 → 403 → 402 → 429; `X-RateLimit-*` on 200; `handler.fetch` never reached on rejection.

**End-to-end (the real acceptance gate — do this on a preview deploy before merge):**

```bash
npx @modelcontextprotocol/inspector     # point at https://<preview>/api/mcp, Bearer sk_test_…

claude mcp add --transport http notedoctor https://app.notedoctor.ai/api/mcp \
  --header "Authorization: Bearer sk_live_…"
export MCP_TOOL_TIMEOUT=300000          # before exercising screening

curl -sS https://<host>/api/mcp -H 'Authorization: Bearer sk_test_…' \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Add the three curl assertions (401 unauth; tools list with a valid key; `X-RateLimit-*` present) as an `e2e/` Playwright spec guarded on `process.env.MCP_SMOKE_KEY` so it no-ops in normal runs. Verify a cold `tools/list` is **< 1s** — if not, a static import crept past the lazy-import rule.

---

## Risks

- **R1 — SDK is ~2 weeks old.** Pin exact. `@modelcontextprotocol/sdk@1.30.0` gets fixes for ≥6 months, and confining v2 to two files keeps a hand-rolled fallback viable.
- **R2 — client compatibility.** Largely retired by verification: `legacy: 'stateless'` is the default and serves 2025-era clients from the same factory. Still confirm against a real client on preview before merge.
- **R3 — TypeScript 5.1.6 vs the SDK's 5.9 / zod 4's 5.5.** The phase-1 gate.
- **R4 — cold start.** Lazy imports keep `initialize`/`tools/list` off the LangChain and `startCmsWarmup` path.
- **R5 — PHI.** `runAgent.ts:115` already refuses to persist for `source: "api"`, and MCP inherits that. The residual exposure is the log echo — see the required fix above. SerpAPI stays unexposed (a generic web search would be the worst PHI egress); every tool description should say "do not include patient identifiers".
- **R6 — corpus exfiltration.** Phase 3, flag-gated, default off, named sign-off.
- **R7 — rate-limit granularity.** One HTTP request = one token. The 2025 spec permits JSON-RPC batch arrays, which could smuggle N calls for 1 token; Claude Code/Desktop/Cursor don't batch, and the org limiter plus `maxDuration` bound it. Document rather than over-engineer.
- **R8 — `FileUploadTool`** (`fileUploadTool.ts:113`) is dead code with two latent bugs (relative fetch URL; parses a Gemini response shape off an OpenAI endpoint). Stays unexposed; worth a separate deletion PR.

**Sequencing rationale:** screening is not phase 1 because it is the only piece whose failure mode is *a 60-second hang inside someone else's editor*, and the only one that costs real money per call. Prove connect + list + cheap-call against Claude Code first.
