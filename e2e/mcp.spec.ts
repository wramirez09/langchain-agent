import { test, expect } from '@playwright/test'

/**
 * MCP endpoint smoke test against a running deployment.
 *
 * Unit tests drive the SDK in process; this is the thing they cannot prove —
 * that a real HTTP request with a real API key, through the real auth chain,
 * gets a real tool list back. It is the acceptance gate for a preview deploy.
 *
 * Needs a key, so it no-ops on a normal `yarn e2e` run. Use a `sk_test_…` key:
 * nothing here calls a tool, so nothing is metered either way.
 */
test.skip(!process.env.MCP_SMOKE_KEY, 'MCP_SMOKE_KEY not set.')

const KEY = process.env.MCP_SMOKE_KEY as string

// Both media types are required: a tool that reports progress mid-call answers
// over SSE, and the 2025-era path answers that way for everything.
const ACCEPT = 'application/json, text/event-stream'

/** The published tools a correctly-scoped key must see. */
const EXPECTED_TOOLS = [
  'medicare_multi_search',
  'ncd_coverage_search',
  'local_lcd_search',
  'local_coverage_article_search',
  'medicare_policy_detail',
  'commercial_guidelines_search',
  'policy_content_extractor',
  'whoami',
  'usage',
]

test('rejects an unauthenticated request and asks for a token', async ({ request }) => {
  const res = await request.post('/api/mcp', {
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    failOnStatusCode: false,
  })

  expect(res.status()).toBe(401)
  expect(res.headers()['www-authenticate']).toContain('notedoctor-mcp')
  expect((await res.json()).error.code).toBe('unauthorized')
})

test('lists tools for a valid key, with rate-limit headers', async ({ request }) => {
  const started = Date.now()
  const res = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      accept: ACCEPT,
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })

  expect(res.status()).toBe(200)

  const headers = res.headers()
  expect(headers['x-ratelimit-limit']).toBeDefined()
  expect(headers['x-ratelimit-remaining']).toBeDefined()
  expect(headers['x-ratelimit-reset']).toBeDefined()
  expect(headers['cache-control']).toBe('no-store')

  const body = await res.text()
  const payload = body.startsWith('event:')
    ? JSON.parse(body.split('\n').find((l) => l.startsWith('data:'))!.slice(5).trim())
    : JSON.parse(body)

  const names: string[] = payload.result.tools.map((t: { name: string }) => t.name)
  for (const tool of EXPECTED_TOOLS) expect(names).toContain(tool)

  // Every tool implementation is lazily imported, so a handshake-free
  // `tools/list` should not be touching CMS or loading an embedding index. If
  // this is slow, a static import has crept back in.
  expect(Date.now() - started).toBeLessThan(2_000)
})
