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

No test suite is configured. Use `yarn lint` for static checks.

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
- `FileUploadTool` — handles user-uploaded documents
- SerpAPI — web search fallback

Responses stream via Vercel AI SDK `StreamingTextResponse`. The system prompt enforces HIPAA compliance (strips PHI).

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
