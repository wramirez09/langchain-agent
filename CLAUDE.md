# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn dev          # Start development server
yarn build        # Production build
yarn start        # Start production server
yarn lint         # Run ESLint
yarn format       # Prettier-format the app/ directory
```

```bash
yarn test         # Jest
yarn test:coverage
yarn typecheck    # tsc --noEmit
yarn e2e          # Playwright
```

Tests are gated, not optional. `.husky/pre-commit` runs jest; `.husky/pre-push`
runs jest, then `yarn typecheck`, then `yarn lint`, plus `yarn build` when the
target is `main` or `dev`. `jest.config.js` collects coverage from `lib/**`,
`app/api/chat/agents/tools/**`, `utils/**` and an explicit component allowlist
at 80% lines/functions/statements and 60% branches -- anything new under `lib/`
is covered by that gate automatically.

## Tech Stack

- **Framework**: Next.js (App Router), React, TypeScript strict mode
- **AI**: LangChain/LangGraph (`createReactAgent`) + OpenAI (gpt-5 for agents, gpt-4o for summarization)
- **Auth**: Supabase SSR (cookie-based for web, Bearer token for mobile)
- **Database**: Supabase PostgreSQL — direct client queries, no ORM
- **Payments**: Stripe metered billing
- **UI**: shadcn/ui + Radix UI primitives, Tailwind CSS, Framer Motion
- **PDF**: `pdf-parse` (server-side parsing), `@react-pdf/renderer` (generation)

## Architecture

NoteDoctorAiis a healthcare prior authorization (PA) readiness screening platform. An AI agent helps providers determine PA requirements from Medicare and commercial payers.

### Application Flow

1. Public landing (`/`) → Supabase signup → `/auth/accept-terms` → Stripe checkout → password setup
2. Authenticated users land at `/agents` — the main protected dashboard

### Key Directories

- `app/agents/` — Main protected dashboard. `AppSidebar` controls a three-view layout (`auth` / `upload` / `export`) toggled via CSS display, not routing.
- `app/api/chat/agents/` — LangChain agent streaming endpoint (180s Vercel timeout).
- `app/api/mcp/` — MCP (Model Context Protocol) endpoint; transport edge only, logic in `lib/mcp/`.
- `app/api/stripe/` — Checkout, webhooks, billing portal, usage reporting.
- `components/` — All reusable UI. State for the PA flow lives in `PriorAuthProvider` (context).
- `lib/` — Auth utilities (`getUserFromRequest`), LLM config, error tracking, caching, retry logic (exponential backoff), PDF generation, usage reporting.
- `data/` — Static Medicare NCD options (pre-fetched from CMS API), commercial guidelines loaded at module scope.
- `documents/` — Implementation guides and legal documents (not served by Next.js directly).

### LangChain Agent (`app/api/chat/agents/`)

Uses `createReactAgent` (LangGraph) with these tools:
- `NCDCoverageSearchTool` — queries Medicare NCD data
- `CommercialGuidelineSearchTool` — searches commercial payer guidelines
- `PolicyContentExtractorTool` — extracts content from uploaded policy documents
- `localLcdSearchTool` — LCD (Local Coverage Determination) lookup
- SerpAPI — web search fallback

Responses stream via Vercel AI SDK `StreamingTextResponse`.

`createAgentTools()` in `lib/handlers/runAgent.ts` is the registry. `FileUploadTool`
exists in the tools directory but is **not** registered and does not work
(relative fetch URL, wrong response key, and it parses a Gemini-shaped response
from an OpenAI call).

**PHI.** The system prompt asks the model to strip identifiers, but an
instruction inside the request cannot protect the request — the text has
already reached OpenAI by the time it is read. The actual control is `lib/phi`,
which runs in the browser:

- `lib/phi/redact.ts` de-identifies text before it crosses the network. Rules
  report spans against the original string and one pass applies them, so
  offsets stay stable and the UI can highlight exactly what was removed.
- `lib/phi/detect.ts` re-scans the result. It backs the confirm gate in the UI
  and the tripwire in `POST /api/notes/extract`, and reports categories and
  counts only — never matched text.
- Names are two-tier on purpose: anchored forms (honorific, credential, label)
  and a given-name-plus-surname pair are redacted; a lone capitalised token is
  soft-flagged for a human, because a bare-token gazetteer cannot tell
  "Parkinson" the diagnosis from "Parkinson" the patient.
- `components/prior-auth/UserRequestFields.tsx` scrubs the echoed request too;
  that card is the surface most likely to be displaying PHI at any moment.

This does not make the product a Business Associate.
`documents/privacy-policy.md` still disclaims that, and raw note text is never
sent — but anything a user types into the chat box is.

### Note ingest (`lib/phi`, `lib/noteIngest`, `app/api/notes/extract`)

A clinician attaches a clinical note from the paperclip in the chat input and
gets a screening. The whole design follows from one constraint:
`documents/privacy-policy.md` disclaims Business Associate status, so the raw
note must never cross the network.

```
 browser                                        server
 file -> extractTextFromFile   (txt/md/pdf, all lazily imported)
      -> redactPhi             (lib/phi)
      -> confirm gate          (NoteIngestDialog; the user ticks a box)
      -> POST redacted text ----> /api/notes/extract
                                    auth -> detectPhi tripwire (422)
                                    -> deterministic fields (codes/state/payer)
                                    -> llmExtractor() for the narrative
                                    -> serializeQuery()
      <- query string <--------------'
      -> chat.append -> screening runs
```

- `lib/noteIngest/codes.ts` has its own cue-gated CPT/ICD extractors. The ones
  in `commercialGuidelineTypes.ts` are tuned for a curated corpus where every
  five-digit number is a CPT code; on note prose they read `T12` (a vertebra)
  as ICD-10 T12.
- `lib/priorAuth/serializeQuery.ts` is the only place a request becomes a
  string. The form path and the note path both call it, because
  `UserRequestFields` parses that string back by regex and the two must not
  drift. The `"CPT/HCPCS : "` spacing is load-bearing.
- `.docx` and images are recognised and rejected by name; neither is
  implemented. Images need OCR, which would run in the browser and brings a
  real risk of its own: OCR errors can mangle an identifier past the point
  where a regex still matches it.

### MCP Server (`app/api/mcp` + `lib/mcp/`)

`POST /api/mcp` publishes the retrieval tools, the full screening, and key/usage
introspection to MCP clients (Claude Code, Claude Desktop, Cursor) over
`@modelcontextprotocol/server` (pinned exactly at `2.0.0`).

- `app/api/mcp/route.ts` is **transport edge only** — it runs the same
  auth → scope → plan → rate-limit → `touchApiKey` stages as
  `app/api/v1/agents/route.ts`, in the same order, then calls
  `getHandler().fetch(req, { authInfo })`. Auth sits entirely in front of the
  SDK, so every public-API contract is unchanged. Logic lives in `lib/mcp/**`
  because `jest.config.js` collects coverage from `lib/**` at 80%.
- **Tool definitions are a hand-written static registry** (`lib/mcp/tools/`),
  not `createAgentTools()`. The LangChain descriptions encode our internal
  orchestration policy and would be wrong — and leaky — published to a third
  party, and the iterated list includes `SerpAPI`, which stays unexposed.
- **Every tool implementation is lazily imported** inside its handler. Static
  imports would fire `startCmsWarmup()` and construct LLM/Supabase clients on
  every `initialize` and `tools/list`, and several modules throw at import time
  without their env vars. Only pure zod schema modules are imported statically.
  `app/api/mcp/__tests__/handler.test.ts` asserts this.
- **Scopes reuse `agents`/`chat`; there is no `mcp` scope** (see `lib/mcp/policy.ts`
  for why). A tool the caller lacks scope for is not registered at all.
- **Metering:** `mcp_tool` / `mcp_extract` / `mcp_resource`, rolled up as `mcp`
  by `getUsageSummaryByOrgId`. `run_prior_auth_screening` adds nothing —
  `runAgent` already meters `orchestrator`.
- Guideline resources (`notedoctor://guideline/{corpusId}`) are gated behind
  `MCP_EXPOSE_GUIDELINE_RESOURCES` and **off by default**.
- Client timeouts are the known sharp edge: a screening takes 45-65s, so
  document `MCP_TOOL_TIMEOUT=300000`.

`lib/mcp/__tests__/*` must carry `/** @jest-environment node */` — the default
`jsdom` environment resolves the SDK's `_shims` browser condition.

### Auth Pattern

`getUserFromRequest()` in `lib/auth` validates requests server-side:
- Web: reads Supabase session from cookies
- Mobile: reads Bearer token from `Authorization` header

All `/agents/*` and `/protected/*` routes require authentication. Terms acceptance is stored as `term_of_agreement` boolean on the `profiles` table.

## Environment Variables

See `.env.example` for the full contract — every variable with a one-line
purpose. Copy it to `.env.development.local` / `.env.production.local`.

The deployed source of truth is Vercel (Production / Preview / Development);
keep `.env.example` in sync when adding or removing a variable.

`EXTRACTOR_MODEL` (note -> PA fields, defaults to `gpt-4o-mini`) and
`NOTE_EXTRACT_RATE_LIMIT_PER_DAY` (defaults to 200) belong to the note-ingest
path.

Five that fail quietly and are worth knowing:
- `STRIPE_SECRET_KEY` — one key per environment, the environment decides live
  vs test. A test key in production resolves customers but never matches
  webhooks, so no subscription is ever provisioned.
- `STRIPE_METER_EVENT_NAME` — unset means requests are served and logged but
  never billed.
- `UPSTASH_REDIS_REST_URL` / `_TOKEN` — unset means the rate limiter fails
  OPEN, the API-key cache is bypassed, and `Idempotency-Key` is ignored. On the
  MCP surface it also disables the derived idempotency key, so a client that
  times out on a screening retries into a second billed run.
- `MCP_EXPOSE_GUIDELINE_RESOURCES` — `true` publishes full commercial-payer
  guideline bodies as MCP resources. Default off; reported by `/api/debug` as
  `flags.mcpGuidelineResources` (a sibling of `checks`, deliberately — a
  false-by-default flag inside `checks` would make `publicApiReady` false).
- `NEXT_PUBLIC_SITE_URL` — needed in *every* environment, not just production:
  it is the Stripe portal `return_url` and the org invite-email redirect base.

Verify a deployment with `GET /api/debug` (admin session required): it returns
per-dependency booleans plus `publicApiReady` and `stripeKeyMode`, and a
separate `flags` object for feature switches whose healthy value is `false`.

## Code Conventions

- Prettier: **defaults** — semicolons, double quotes, 2-space indent, 80-char
  line width, `trailingComma: "all"`. Two configs exist and the one that wins is
  the surprising one: `.prettierrc.json` is `{}` and takes precedence over
  `prettier.config.js` (which asks for no semicolons and single quotes and is
  never applied). Verify with `npx prettier --find-config-path <file>`.
- Client components must have `"use client"` at the top
- Path alias `@/*` maps to repo root
- New shadcn components: `npx shadcn-ui@latest add <component>`
