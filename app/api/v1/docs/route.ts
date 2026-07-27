// Self-contained HTML docs for the public API. No external scripts (the app CSP
// blocks third-party script-src), so this is static HTML + inline styles. The
// machine-readable spec lives at /openapi.yaml for import into Postman/Scalar.

// Mirrors the app's global TopBar + Footer so the docs sit inside the same
// chrome. Rendered inline (this route returns raw HTML, not the React layout).
const YEAR = new Date().getFullYear();

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NoteDoctor Public API</title>
<style>
  :root {
    color-scheme: light dark;
    --brand: #238DD2;
    --brand-600: #1f7bbb;
    --brand-700: #1a659c;
    --ink: #101828;
    --ink-soft: #475467;
    --bg: #ffffff;
    --card: #ffffff;
    --line: #e7ebf0;
    --code-bg: #0d1526;
    --code-fg: #e6edf6;
    --code-line: #223052;
    --chip: #eef4fb;
    --green: #12a150;
    --amber: #c07800;
    --red: #d64550;
    --violet: #7c5cff;
    --orange: #e07a1a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #eef2f8;
      --ink-soft: #a6b0c0;
      --bg: #0b1120;
      --card: #111a2e;
      --line: #223049;
      --chip: #17233d;
      --code-bg: #060b17;
      --code-line: #1c2947;
    }
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }

  /* ---------- global header (mirrors app TopBar) ---------- */
  .site-header {
    height: 64px; display: flex; align-items: center; justify-content: center;
    background: var(--card); border-bottom: 1px solid var(--line);
    position: sticky; top: 0; z-index: 60; margin: 0 -1.25rem;
  }
  .site-header a { display: inline-flex; align-items: center; gap: .55rem; text-decoration: none; }
  .site-header img { height: 30px; width: auto; }
  .site-header .wordmark { font-size: 15px; font-weight: 800; letter-spacing: -.01em; color: var(--ink); }

  /* ---------- global footer (mirrors app Footer) ---------- */
  .site-footer {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;
    background: var(--card); border-top: 1px solid var(--line);
    padding: 1rem 2.5rem; margin: 4rem -1.25rem 0;
  }
  .site-footer .copy { font-size: 13px; color: var(--ink-soft); }
  .site-footer nav { display: flex; gap: 1.75rem; }
  .site-footer nav a { font-size: 13px; color: var(--brand); text-decoration: none; }
  .site-footer nav a:hover { text-decoration: underline; }
  @media (max-width: 860px) { .site-footer { justify-content: center; padding: 1rem; text-align: center; } }
  body {
    font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(1200px 600px at 100% -10%, rgba(35,141,210,.14), transparent 60%),
      radial-gradient(900px 500px at -10% 0%, rgba(124,92,255,.10), transparent 55%),
      var(--bg);
    margin: 0;
    padding: 0 1.25rem 5rem;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 880px; margin: 0 auto; }

  /* ---------- hero ---------- */
  header.hero {
    margin: 0 -1.25rem 2.5rem;
    padding: 3.25rem 1.25rem 2.5rem;
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-700) 55%, #164e7a 100%);
    color: #fff;
    text-align: center;
    box-shadow: inset 0 -1px 0 rgba(255,255,255,.15);
  }
  header.hero .badge-pill {
    display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; padding: .3rem .7rem; border-radius: 999px;
    background: rgba(255,255,255,.18); color: #fff; margin-bottom: 1rem;
    backdrop-filter: blur(4px);
  }
  header.hero h1 { margin: 0; font-size: 2.4rem; letter-spacing: -.02em; }
  header.hero p { margin: .6rem auto 0; max-width: 40ch; color: rgba(255,255,255,.9); }
  .base-url {
    display: inline-flex; align-items: center; gap: .5rem; margin-top: 1.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
    background: rgba(0,0,0,.22); color: #eaf4fd; padding: .5rem .85rem; border-radius: 10px;
    border: 1px solid rgba(255,255,255,.22);
  }
  .base-url b { color: #bfe0f7; font-weight: 700; }

  /* ---------- quick nav ---------- */
  nav.toc {
    display: flex; flex-wrap: wrap; gap: .5rem; justify-content: center;
    margin: -1.2rem 0 2.75rem;
  }
  nav.toc a {
    font-size: 13px; font-weight: 600; text-decoration: none; color: var(--brand-600);
    background: var(--card); border: 1px solid var(--line); padding: .4rem .8rem;
    border-radius: 999px; transition: all .15s ease;
  }
  nav.toc a:hover { border-color: var(--brand); color: var(--brand); transform: translateY(-1px); }

  /* ---------- sections ---------- */
  section { margin: 0 0 1.5rem; }
  h2 {
    display: flex; align-items: center; gap: .6rem;
    font-size: 1.35rem; letter-spacing: -.01em; margin: 2.5rem 0 1rem; scroll-margin-top: 1rem;
  }
  h2 .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--brand); box-shadow: 0 0 0 4px rgba(35,141,210,.18); }
  p { color: var(--ink-soft); }
  p.lead { color: var(--ink); }
  a { color: var(--brand-600); }
  strong { color: var(--ink); }

  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 16px;
    padding: 1.25rem 1.35rem; box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 12px 30px -18px rgba(16,24,40,.25);
  }

  /* ---------- method + endpoint ---------- */
  .route { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .5rem; }
  .method {
    font: 700 12px/1 ui-monospace, monospace; letter-spacing: .05em; color: #fff;
    padding: .38rem .55rem; border-radius: 7px; text-transform: uppercase;
  }
  .method.post { background: var(--green); }
  .method.get  { background: var(--brand); }
  .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; font-weight: 600; color: var(--ink); }
  .tag {
    font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    padding: .25rem .5rem; border-radius: 6px; background: var(--chip); color: var(--brand-600);
  }

  /* ---------- code ---------- */
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em;
    background: var(--chip); color: var(--brand-700); padding: .1rem .35rem; border-radius: 5px;
  }
  @media (prefers-color-scheme: dark) { code { color: #7fc4f0; } }
  figure.code { margin: 1rem 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--code-line); }
  figure.code figcaption {
    display: flex; align-items: center; gap: .55rem;
    background: #0a1220; color: #8aa0c4; font: 700 11px/1 ui-monospace, monospace;
    letter-spacing: .08em; text-transform: uppercase; padding: .6rem .9rem;
    border-bottom: 1px solid var(--code-line);
  }
  figure.code figcaption .lang { color: var(--brand); }
  figure.code figcaption .dots { display: inline-flex; gap: 5px; margin-left: auto; }
  figure.code figcaption .dots i { width: 9px; height: 9px; border-radius: 50%; opacity: .55; }
  figure.code figcaption .dots i:nth-child(1){ background:#ff5f57; }
  figure.code figcaption .dots i:nth-child(2){ background:#febc2e; }
  figure.code figcaption .dots i:nth-child(3){ background:#28c840; }
  pre { margin: 0; background: var(--code-bg); color: var(--code-fg); padding: 1rem 1.1rem; overflow-x: auto; }
  pre code { background: none; color: inherit; padding: 0; font-size: 13px; line-height: 1.6; }

  /* ---------- errors table ---------- */
  table { border-collapse: separate; border-spacing: 0; width: 100%; margin-top: 1rem;
          border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th { text-align: left; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-soft);
       background: var(--chip); padding: .6rem .8rem; }
  td { padding: .65rem .8rem; border-top: 1px solid var(--line); vertical-align: top; }
  td code { font-size: 12px; }
  .status {
    display: inline-block; min-width: 2.6rem; text-align: center; font: 700 12px/1 ui-monospace, monospace;
    color: #fff; padding: .32rem .45rem; border-radius: 6px;
  }
  .s-4xx { background: var(--amber); }
  .s-401 { background: var(--red); }
  .s-402 { background: var(--violet); }
  .s-403 { background: var(--red); }
  .s-429 { background: var(--orange); }
  .s-5xx { background: #64748b; }

  .callout {
    border-left: 3px solid var(--brand); background: linear-gradient(90deg, rgba(35,141,210,.08), transparent);
    padding: .7rem 1rem; border-radius: 0 10px 10px 0; margin: 1rem 0; color: var(--ink-soft); font-size: 14px;
  }
  .scopes { display: flex; gap: .5rem; flex-wrap: wrap; margin: .5rem 0; }
  .scopes .tag { background: var(--chip); }
  footer { text-align: center; color: var(--ink-soft); font-size: 13px; margin-top: 3rem; }
  footer a { font-weight: 600; }
</style>
</head>
<body>

<div class="site-header">
  <a href="/agents" aria-label="Go to NoteDoctorAi">
    <img src="/images/ndLogo.png" alt="NoteDoctorAi logo" />
    <span class="wordmark">NoteDoctorAi</span>
  </a>
</div>

<header class="hero">
  <div class="wrap">
    <span class="badge-pill">Public API · v1</span>
    <h1>NoteDoctor API</h1>
    <p>Programmatic access to the medical pre-authorization research agent.</p>
    <div class="base-url"><b>BASE</b>&nbsp;https://app.notedoctor.ai</div>
  </div>
</header>

<div class="wrap">
  <nav class="toc">
    <a href="#auth">Authentication</a>
    <a href="#agents">Run the agent</a>
    <a href="#chat">Simple chat</a>
    <a href="#account">Account &amp; usage</a>
    <a href="#limits">Rate limits</a>
    <a href="#idempotency">Idempotency</a>
    <a href="#errors">Errors</a>
    <a href="#spec">OpenAPI</a>
  </nav>

  <section id="auth">
    <h2><span class="dot"></span>Authentication</h2>
    <p class="lead">Send your API key as a bearer token. Keys are <strong>server-side secrets</strong> —
    never embed one in a browser or mobile app. Create and revoke keys on your
    <a href="/agents/api-keys">API Keys</a> page; the full key is shown only once.</p>
    <figure class="code">
      <figcaption><span class="lang">HTTP</span> header<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxx</code></pre>
    </figure>
    <div class="scopes"><span class="tag">scope: agents</span><span class="tag">scope: chat</span></div>
    <div class="callout">Each key is scoped. Calling an endpoint a key isn't scoped for returns
    <code>403</code>. API access also depends on your plan — see <code>402</code> under Errors.</div>
    <p>Each key belongs to one environment, fixed at creation and visible in its prefix:
    <code>sk_live_…</code> bills your subscription per request, while <code>sk_test_…</code>
    is <strong>never metered</strong> — use test keys for integration tests and CI so a test
    suite can't run up your invoice.</p>
    <div class="scopes"><span class="tag">sk_live_ · metered</span><span class="tag">sk_test_ · not metered</span></div>
    <div class="callout">A test key is <strong>not a sandbox</strong>: it reads and writes the
    same production data, runs the same models, shares the same rate limits, and still requires
    an active subscription. Only the billing meter is skipped — usage is still recorded and
    still counts in <code>/v1/usage</code>.</div>
  </section>

  <section id="agents">
    <h2><span class="dot"></span>Run the agent</h2>
    <div class="card">
      <div class="route">
        <span class="method post">POST</span>
        <span class="path">/api/v1/agents</span>
        <span class="tag">JSON by default</span>
      </div>
      <p>Runs the tool-using LangGraph agent (Medicare NCD/LCD/LCA + commercial guideline
      search + web search). Returns a single JSON response by default; streaming is optional.</p>
    </div>
    <figure class="code">
      <figcaption><span class="lang">cURL</span> request<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>curl https://app.notedoctor.ai/api/v1/agents \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "Is a knee MRI covered for a Medicare patient with chronic knee pain?" }
    ]
  }'</code></pre>
    </figure>
    <div class="callout">The response carries an <code>x-thread-id</code> header (also in the body).
    Pass <code>threadId</code> back on the next call to continue the conversation.</div>
    <p class="lead">Default — a single JSON response echoing the last user turn and the agent's reply.
    The assistant turn's <code>content</code> is the structured <code>PriorAuthArtifact</code> object
    (a plain string for a text-only reply):</p>
    <figure class="code">
      <figcaption><span class="lang">JSON</span> 200 response<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>{
  "threadId": "b1d9f0c2-7e4a-4a1b-9c3e-2f6d5a8b1c0d",
  "messages": [
    { "role": "user", "content": "Is a knee MRI covered for a Medicare patient with chronic knee pain?" },
    {
      "role": "assistant",
      "content": {
        "kind": "prior-auth-summary",
        "schemaVersion": 1,
        "title": "Prior Authorization Summary for MRI of the Knee",
        "guidelineBasis": "medicare",
        "requestOverview": { "treatment": "MRI of the knee", "cpt": [], "icd10": [], "medicalHistory": "...", "keyFindings": ["..."] },
        "priorAuthRequired": "CONDITIONAL",
        "medicalNecessityCriteria": [ { "title": "Failed conservative management", "status": "unknown", "detail": "..." } ],
        "relevantCodes": { "icd10": [ { "code": "M25.561", "label": "Pain in right knee" } ], "cpt": [ { "code": "73721", "label": "MRI lower extremity joint without contrast" } ] },
        "requiredDocumentation": [ { "title": "Clinical Evaluation", "items": [ { "item": "History and duration of knee pain" } ] } ],
        "limitations": ["..."],
        "summary": { "determination": "more_info_needed", "determinationLabel": "Conditional — additional documentation needed", "rationale": "...", "missingItems": ["..."] },
        "disclaimer": "This information is guidance only ..."
      }
    }
  ]
}</code></pre>
    </figure>
    <div class="callout">See the full artifact shape (<code>PriorAuthArtifact</code>) in the
    <a href="/openapi.yaml">OpenAPI spec</a>. Prefer streaming? It's optional — add
    <code>"stream": true</code> to the request body (defaults to <code>false</code>) and the answer
    arrives as a <code>text/plain</code> token stream instead. Only a boolean
    <code>true</code> streams; any other value is treated as <code>false</code>, never an error.</div>
  </section>

  <section id="chat">
    <h2><span class="dot"></span>Simple chat</h2>
    <div class="card">
      <div class="route">
        <span class="method post">POST</span>
        <span class="path">/api/v1/chat</span>
        <span class="tag">JSON by default</span>
      </div>
      <p>A plain-text completion from the pre-auth assistant. Returns a single JSON
      reply by default; add <code>"stream": true</code> for a <code>text/plain</code> token stream.</p>
    </div>
    <figure class="code">
      <figcaption><span class="lang">cURL</span> request<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>curl https://app.notedoctor.ai/api/v1/chat \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "messages": [ { "role": "user", "content": "Summarize the CMS rules for a sleep study." } ] }'</code></pre>
    </figure>
    <figure class="code">
      <figcaption><span class="lang">JSON</span> 200 response<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>{ "message": { "role": "assistant", "content": "CMS covers attended in-lab polysomnography when..." } }</code></pre>
    </figure>
    <div class="callout">Prefer streaming? Add <code>"stream": true</code> to the body and pass
    <code>-N</code> to curl — the reply arrives as a <code>text/plain</code> token stream instead.</div>
  </section>

  <section id="account">
    <h2><span class="dot"></span>Account &amp; usage</h2>
    <div class="card">
      <div class="route">
        <span class="method get">GET</span>
        <span class="path">/api/v1/me</span>
      </div>
      <p>The calling key's org, environment, scopes, and tier.</p>
    </div>
    <figure class="code">
      <figcaption><span class="lang">JSON</span> GET /api/v1/me<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>curl https://app.notedoctor.ai/api/v1/me -H "Authorization: Bearer sk_live_xxx"

{ "org_id": "…uuid…", "environment": "live", "scopes": ["agents","chat"], "rate_limit_tier": "standard" }</code></pre>
    </figure>
    <div class="card">
      <div class="route">
        <span class="method get">GET</span>
        <span class="path">/api/v1/usage</span>
      </div>
      <p>Request totals for your org for the current calendar month (UTC).</p>
    </div>
    <figure class="code">
      <figcaption><span class="lang">JSON</span> GET /api/v1/usage<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>curl https://app.notedoctor.ai/api/v1/usage -H "Authorization: Bearer sk_live_xxx"

{ "period_start": "2026-07-01T00:00:00.000Z", "total": 128, "agents": 90, "chat": 38 }</code></pre>
    </figure>
  </section>

  <section id="limits">
    <h2><span class="dot"></span>Rate limits</h2>
    <p class="lead">Limits are enforced per organization with a finer per-key sub-limit. Any response
    that reached the limiter — every success and every <code>429</code> — carries
    <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, and
    <code>X-RateLimit-Reset</code> (unix seconds at which the window resets). A
    <code>429</code> also includes <code>Retry-After</code> (seconds). Requests rejected earlier
    (<code>401</code>, <code>402</code>, <code>403</code>) don't consume budget and carry no
    rate-limit headers.</p>
  </section>

  <section id="idempotency">
    <h2><span class="dot"></span>Idempotency</h2>
    <p class="lead">Send an <code>Idempotency-Key</code> header on any <code>POST</code> so a retry
    after a network timeout can't run — or bill for — the same request twice. Use any unique string
    up to 255 characters.</p>
    <figure class="code">
      <figcaption><span class="lang">cURL</span> retry-safe request<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>curl https://app.notedoctor.ai/api/v1/agents \\
  -H "Authorization: Bearer $NOTEDOCTOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 2f8a1c0e-run-42" \\
  -d '{"messages":[{"role":"user","content":"Is a knee MRI covered for Medicare?"}]}'</code></pre>
    </figure>
    <table>
      <tr><th>Repeat with…</th><th>Result</th></tr>
      <tr><td>the same body</td><td>The original response, plus <code>Idempotency-Replayed: true</code>. The request is not re-run.</td></tr>
      <tr><td>a different body</td><td><span class="status s-4xx">422</span> <code>idempotency_key_reuse</code> — a key identifies one request.</td></tr>
      <tr><td>the first still running</td><td><span class="status s-4xx">409</span> <code>idempotency_in_progress</code> — retry shortly.</td></tr>
      <tr><td>a key over 255 characters</td><td><span class="status s-4xx">400</span> <code>invalid_request</code> — rejected before the request runs.</td></tr>
    </table>
    <p class="lead">Failed requests are not stored, so the same key can be retried after an error.
    Stored responses expire after 24 hours. Idempotency does not apply when
    <code>"stream": true</code> — a token stream can't be replayed.</p>
  </section>

  <section id="errors">
    <h2><span class="dot"></span>Errors</h2>
    <p class="lead">Every error is a JSON envelope with a stable <code>code</code>:</p>
    <figure class="code">
      <figcaption><span class="lang">JSON</span> error envelope<span class="dots"><i></i><i></i><i></i></span></figcaption>
      <pre><code>{ "error": { "code": "rate_limited", "message": "Rate limit exceeded.", "requestId": null } }</code></pre>
    </figure>
    <table>
      <tr><th>Status</th><th>code</th><th>Meaning</th></tr>
      <tr><td><span class="status s-4xx">400</span></td><td><code>invalid_json</code> / <code>invalid_request</code></td><td>Body was malformed or failed validation, or the <code>Idempotency-Key</code> exceeded 255 characters.</td></tr>
      <tr><td><span class="status s-401">401</span></td><td><code>unauthorized</code></td><td>Missing, malformed, revoked, or expired key.</td></tr>
      <tr><td><span class="status s-402">402</span></td><td><code>payment_required</code></td><td>The API requires an active subscription — every plan includes it.</td></tr>
      <tr><td><span class="status s-403">403</span></td><td><code>forbidden</code></td><td>Key is not scoped for this endpoint.</td></tr>
      <tr><td><span class="status s-4xx">409</span></td><td><code>idempotency_in_progress</code></td><td>A request with this Idempotency-Key is still running.</td></tr>
      <tr><td><span class="status s-4xx">422</span></td><td><code>idempotency_key_reuse</code></td><td>This Idempotency-Key was already used with a different body.</td></tr>
      <tr><td><span class="status s-429">429</span></td><td><code>rate_limited</code></td><td>Too many requests — retry after the given delay.</td></tr>
      <tr><td><span class="status s-5xx">502</span></td><td><code>upstream_error</code></td><td>The model could not complete the request.</td></tr>
    </table>
  </section>

  <section id="spec">
    <h2><span class="dot"></span>OpenAPI spec</h2>
    <p class="lead">Machine-readable spec: <a href="/openapi.yaml">/openapi.yaml</a> — import into
    Postman, Insomnia, or Scalar.</p>
  </section>

  <p class="muted" style="text-align:center;font-size:13px;margin-top:2.5rem;">
    Need a key? Visit your <a href="/agents/api-keys">API Keys</a> page.
  </p>
</div>

<footer class="site-footer">
  <div class="copy">© ${YEAR} NoteDoctorAi. All rights reserved.</div>
  <nav>
    <a href="/legal/terms-of-service">Terms of Service</a>
    <a href="/legal/privacy-policy">Privacy Policy</a>
    <a href="mailto:sales@notedoctor.ai">Contact</a>
  </nav>
</footer>

</body>
</html>`;

export async function GET() {
  return new Response(HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
