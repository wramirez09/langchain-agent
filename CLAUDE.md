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

NoteDoctor.ai is a healthcare prior authorization (PA) readiness screening platform. An AI agent helps providers determine PA requirements from Medicare and commercial payers.

### Application Flow

1. Public landing (`/`) → Supabase signup → `/auth/accept-terms` → Stripe checkout → password setup
2. Authenticated users land at `/agents` — the main protected dashboard

### Key Directories

- `app/agents/` — Main protected dashboard. `AppSidebar` controls a three-view layout (`auth` / `upload` / `export`) toggled via CSS display, not routing.
- `app/api/chat/agents/` — LangChain agent streaming endpoint (180s Vercel timeout).
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

### Auth Pattern

`getUserFromRequest()` in `lib/auth` validates requests server-side:
- Web: reads Supabase session from cookies
- Mobile: reads Bearer token from `Authorization` header

All `/agents/*` and `/protected/*` routes require authentication. Terms acceptance is stored as `term_of_agreement` boolean on the `profiles` table.

## Environment Variables

Requires `.env.development.local` / `.env.production.local` with:
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `LANGCHAIN_*` tracing keys (optional)
- `NEXT_PUBLIC_DEMO` — set to enable demo mode

## Code Conventions

- Prettier: no semicolons, single quotes, 2-space indent, 80-char line width, trailing commas ES5
- Client components must have `"use client"` at the top
- Path alias `@/*` maps to repo root
- New shadcn components: `npx shadcn-ui@latest add <component>`
