// Self-contained HTML docs for the public API. No external scripts (the app CSP
// blocks third-party script-src), so this is static HTML + inline styles. The
// machine-readable spec lives at /openapi.yaml for import into Postman/Scalar.

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NoteDoctor Public API</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 820px; margin: 0 auto; padding: 2rem 1.25rem; }
  h1 { margin-bottom: .25rem; }
  h2 { margin-top: 2.25rem; border-bottom: 1px solid #8883; padding-bottom: .25rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: #1113; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  .endpoint { font-family: ui-monospace, monospace; background: #1113; padding: .15rem .4rem; border-radius: 4px; }
  .muted { opacity: .7; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #8882; }
</style>
</head>
<body>
<h1>NoteDoctor Public API</h1>
<p class="muted">Programmatic access to the medical pre-authorization research agent.</p>

<h2>Authentication</h2>
<p>Send your API key as a bearer token. Keys are <strong>server-side secrets</strong> —
never embed one in a browser or mobile app. Create and revoke keys on your
<a href="/agents/api-keys">API Keys</a> page; the full key is shown only once.</p>
<pre><code>Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxx</code></pre>

<h2>Run the agent</h2>
<p><span class="endpoint">POST /api/v1/agents</span> — streams <code>text/plain</code> by
default. Pass <code>"stream": false</code> for a single JSON response.</p>
<pre><code>curl -N https://app.notedoctor.ai/api/v1/agents \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Is a knee MRI covered for a Medicare patient with chronic knee pain?" }
    ]
  }'</code></pre>
<p class="muted">The response includes an <code>x-thread-id</code> header. Pass it back as
<code>"threadId"</code> to continue the conversation.</p>

<h2>Simple chat</h2>
<p><span class="endpoint">POST /api/v1/chat</span> — streams a <code>text/plain</code> completion.</p>
<pre><code>curl -N https://app.notedoctor.ai/api/v1/chat \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "messages": [ { "role": "user", "content": "Summarize the CMS rules for a sleep study." } ] }'</code></pre>

<h2>Rate limits</h2>
<p>Limits are enforced per organization with a finer per-key sub-limit. Each response
carries <code>X-RateLimit-Limit</code> and <code>X-RateLimit-Remaining</code>. A
<code>429</code> includes <code>Retry-After</code> (seconds).</p>

<h2>Errors</h2>
<p>Every error is a JSON envelope:</p>
<pre><code>{ "error": { "code": "rate_limited", "message": "Rate limit exceeded.", "requestId": null } }</code></pre>
<table>
  <tr><th>Status</th><th>code</th><th>Meaning</th></tr>
  <tr><td>400</td><td>invalid_json / invalid_request</td><td>Body was malformed or failed validation.</td></tr>
  <tr><td>401</td><td>unauthorized</td><td>Missing, malformed, revoked, or expired key.</td></tr>
  <tr><td>403</td><td>forbidden</td><td>Key is not scoped for this endpoint.</td></tr>
  <tr><td>429</td><td>rate_limited</td><td>Too many requests — retry after the given delay.</td></tr>
  <tr><td>502</td><td>upstream_error</td><td>The model could not complete the request.</td></tr>
</table>

<h2>OpenAPI spec</h2>
<p>Machine-readable spec: <a href="/openapi.yaml">/openapi.yaml</a> (import into Postman, Insomnia, or Scalar).</p>
</body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
