"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/utils/cn";

type EndpointKey = "me" | "usage" | "chat" | "agents";

type EndpointDef = {
  key: EndpointKey;
  method: "GET" | "POST";
  path: string;
  summary: string;
  scope: string | null;
  billable: boolean;
  defaultBody?: string;
};

const ENDPOINTS: EndpointDef[] = [
  {
    key: "me",
    method: "GET",
    path: "/api/v1/me",
    summary: "Introspect the calling key",
    scope: null,
    billable: false,
  },
  {
    key: "usage",
    method: "GET",
    path: "/api/v1/usage",
    summary: "This month's totals, by endpoint",
    scope: null,
    billable: false,
  },
  {
    key: "chat",
    method: "POST",
    path: "/api/v1/chat",
    summary: "A simple chat completion",
    scope: "chat",
    billable: true,
    defaultBody: JSON.stringify(
      { messages: [{ role: "user", content: "In one sentence, what is prior authorization?" }] },
      null,
      2,
    ),
  },
  {
    key: "agents",
    method: "POST",
    path: "/api/v1/agents",
    summary: "Prior-auth research agent · 45–65s",
    scope: "agents",
    billable: true,
    defaultBody: JSON.stringify(
      { messages: [{ role: "user", content: "mri, IL, medicare, knee pain for over four weeks" }] },
      null,
      2,
    ),
  },
];

type PlaygroundResult = {
  request: { method: string; path: string; headers: Record<string, string>; body: unknown };
  response: {
    status: number;
    durationMs: number;
    headers: Record<string, string>;
    body: unknown;
  };
};

type HistoryEntry = {
  id: number;
  key: EndpointKey;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  note: string;
  body: string;
  idempotencyKey: string;
  result: PlaygroundResult;
};

type Lang = "curl" | "js" | "py";
type ResponseView = "pretty" | "raw" | "headers";

// Docs and the OpenAPI spec both present this as the API's base URL, so the
// copyable snippets do too — they're for use outside the dashboard.
const SNIPPET_BASE_URL = "https://app.notedoctor.ai";

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  409: "Conflict",
  422: "Unprocessable",
  429: "Rate Limited",
  500: "Server Error",
  502: "Bad Gateway",
};

function statusTone(status: number): string {
  if (status >= 200 && status < 300)
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status >= 400 && status < 500) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-red-500/15 text-red-700 dark:text-red-300";
}

function statusTextTone(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-700 dark:text-emerald-400";
  if (status >= 400 && status < 500) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

function methodTone(method: string): string {
  return method === "GET"
    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function fmtDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

function compactJson(src: string): string {
  try {
    return JSON.stringify(JSON.parse(src));
  } catch {
    return src.trim();
  }
}

function buildSnippet(endpoint: EndpointDef, lang: Lang, bodySrc: string): string {
  const url = SNIPPET_BASE_URL + endpoint.path;
  const body = compactJson(bodySrc);
  if (lang === "curl") {
    return endpoint.method === "GET"
      ? `curl ${url} \\\n  -H "Authorization: Bearer $ND_API_KEY"`
      : `curl ${url} \\\n  -H "Authorization: Bearer $ND_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  }
  if (lang === "js") {
    return `const res = await fetch("${url}", {\n  method: "${endpoint.method}",\n  headers: {\n    Authorization: \`Bearer \${process.env.ND_API_KEY}\`,\n    "Content-Type": "application/json",\n  },${endpoint.method === "POST" ? `\n  body: JSON.stringify(${body}),` : ""}\n});\nconst data = await res.json();`;
  }
  return `import os, requests\n\nres = requests.${endpoint.method.toLowerCase()}(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['ND_API_KEY']}"},${endpoint.method === "POST" ? `\n    json=${body},` : ""}\n)\ndata = res.json()`;
}

/** Recursive JSON renderer with the docs' token colors. Safe: builds React nodes. */
function JsonPretty({ value, indent = 0 }: { value: unknown; indent?: number }) {
  const pad = "  ".repeat(indent);
  const childPad = "  ".repeat(indent + 1);

  if (value === null) return <span className="text-violet-600 dark:text-violet-400">null</span>;
  if (typeof value === "boolean" || typeof value === "number")
    return <span className="text-violet-600 dark:text-violet-400">{String(value)}</span>;
  if (typeof value === "string")
    return <span className="text-amber-700 dark:text-amber-400">{JSON.stringify(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <>
        {"[\n"}
        {value.map((v, i) => (
          <span key={i}>
            {childPad}
            <JsonPretty value={v} indent={indent + 1} />
            {i < value.length - 1 ? "," : ""}
            {"\n"}
          </span>
        ))}
        {pad}
        {"]"}
      </>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span>{"{}"}</span>;
  return (
    <>
      {"{\n"}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {childPad}
          <span className="text-teal-700 dark:text-teal-400">{JSON.stringify(k)}</span>
          {": "}
          <JsonPretty value={v} indent={indent + 1} />
          {i < entries.length - 1 ? "," : ""}
          {"\n"}
        </span>
      ))}
      {pad}
      {"}"}
    </>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-[26px] rounded-md border px-2.5 text-xs transition-colors",
        active
          ? "border-blue-500/35 bg-blue-500/10 font-semibold text-blue-700 dark:text-blue-300"
          : "border-transparent text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export default function ApiPlayground() {
  const [apiAccess, setApiAccess] = useState<boolean | null>(null);

  const [active, setActive] = useState<EndpointKey>("agents");
  const [body, setBody] = useState<string>(
    ENDPOINTS.find((e) => e.key === "agents")!.defaultBody ?? "",
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<ResponseView>("pretty");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [rate, setRate] = useState<{ limit: number; remaining: number } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const restoringRef = useRef(false);
  const historyIdRef = useRef(0);

  const endpoint = useMemo(() => ENDPOINTS.find((e) => e.key === active)!, [active]);

  useEffect(() => {
    fetch("/api/org", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => setApiAccess(o ? o.apiAccess !== false : false))
      .catch(() => setApiAccess(false));
  }, []);

  // Reset the editor to the selected endpoint's example whenever it changes —
  // unless the change came from restoring a history entry, which supplies its
  // own body and result.
  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    setBody(endpoint.defaultBody ?? "");
    setResult(null);
    setError(null);
  }, [endpoint]);

  // Elapsed-time ticker for in-flight requests (the agent runs 45–65s).
  useEffect(() => {
    if (!sending) return;
    const started = Date.now();
    setElapsedMs(0);
    const t = setInterval(() => setElapsedMs(Date.now() - started), 250);
    return () => clearInterval(t);
  }, [sending]);

  const bodyCheck = useMemo(() => {
    if (endpoint.method === "GET") return null;
    if (!body.trim()) return { ok: false as const, note: "Empty body" };
    try {
      const parsed = JSON.parse(body);
      const messages = Array.isArray((parsed as { messages?: unknown[] })?.messages)
        ? (parsed as { messages: unknown[] }).messages.length
        : null;
      const tokens = Math.ceil(body.replace(/\s/g, "").length / 4);
      return {
        ok: true as const,
        note: `Valid JSON${messages !== null ? ` · ${messages} message${messages === 1 ? "" : "s"}` : ""} · ~${tokens} tokens est.`,
      };
    } catch {
      return { ok: false as const, note: "Not valid JSON" };
    }
  }, [endpoint.method, body]);

  const snippet = useMemo(() => buildSnippet(endpoint, lang, body), [endpoint, lang, body]);

  const send = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      let payload: unknown = undefined;
      if (endpoint.method === "POST") {
        if (!body.trim()) throw new Error("Add a request body.");
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Error("Request body is not valid JSON.");
        }
      }

      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: endpoint.key,
          payload,
          idempotencyKey: idempotencyKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Playground error (${res.status})`);
      }
      const r = data as PlaygroundResult;
      setResult(r);

      const limit = Number(r.response.headers["x-ratelimit-limit"]);
      const remaining = Number(r.response.headers["x-ratelimit-remaining"]);
      if (Number.isFinite(limit) && Number.isFinite(remaining)) {
        setRate({ limit, remaining });
      }

      let note = endpoint.summary;
      if (endpoint.method === "POST") {
        try {
          const first = (JSON.parse(body) as { messages?: { content?: string }[] })
            ?.messages?.[0]?.content;
          if (typeof first === "string" && first) note = `"${first}"`;
        } catch {
          /* keep summary */
        }
      }
      if (r.response.status === 429) {
        const retry = r.response.headers["retry-after"];
        note = retry ? `rate limited · retry-after ${retry}` : "rate limited";
      }
      setHistory((prev) =>
        [
          {
            id: ++historyIdRef.current,
            key: endpoint.key,
            method: endpoint.method,
            path: endpoint.path.replace("/api/v1", ""),
            status: r.response.status,
            durationMs: r.response.durationMs,
            note,
            body,
            idempotencyKey: idempotencyKey.trim(),
            result: r,
          },
          ...prev,
        ].slice(0, 20),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [sending, endpoint, body, idempotencyKey]);

  // ⌘↵ / Ctrl+↵ sends from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);

  const restore = (h: HistoryEntry) => {
    // Suppress the reset-on-endpoint-change effect only when the endpoint
    // actually changes; the entry supplies its own body and result.
    if (h.key !== active) restoringRef.current = true;
    setActive(h.key);
    setBody(h.body || (ENDPOINTS.find((e) => e.key === h.key)?.defaultBody ?? ""));
    setIdempotencyKey(h.idempotencyKey);
    setResult(h.result);
    setError(null);
  };

  const copySnippet = useCallback(() => {
    try {
      void navigator.clipboard.writeText(snippet);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [snippet]);

  const lineCount = body.split("\n").length;
  const responseBytes = result
    ? new Blob([
        typeof result.response.body === "string"
          ? result.response.body
          : JSON.stringify(result.response.body),
      ]).size
    : 0;

  if (apiAccess === false) {
    return (
      <div className="mx-auto mt-8 w-full max-w-3xl px-4">
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-4 text-sm dark:bg-amber-500/10">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            The API playground requires an active subscription.
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Every plan includes the API.{" "}
            <a href="/agents/org" className="font-medium underline">
              Subscribe
            </a>{" "}
            to try it here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Toolbar */}
      <div className="flex min-h-[60px] flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2 sm:px-6">
        <h1 className="text-[17px] font-semibold tracking-tight">API Playground</h1>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <div className="flex h-8 items-center gap-2 rounded-lg border bg-card px-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground/80">
            Key
          </span>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-blue-500/10 px-2 font-mono text-xs font-medium text-blue-700 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            test · ephemeral (5 min)
          </span>
        </div>
        <span className="hidden text-xs text-muted-foreground md:block">
          Server-side; no secret touches your browser.
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="hidden flex-col gap-1 sm:flex" aria-label="Rate limit">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xs font-semibold">
                {rate ? rate.remaining : "–"}
                <span className="font-normal text-muted-foreground">/{rate ? rate.limit : 30}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">req left this minute</span>
            </div>
            <div className="h-1 w-[150px] overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width]"
                style={{ width: rate ? `${(rate.remaining / rate.limit) * 100}%` : "0%" }}
              />
            </div>
          </div>
          <a
            href="/api/v1/docs"
            className="text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            API docs ↗
          </a>
        </div>
      </div>

      {/* Three panes */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[264px_minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
        {/* Endpoints + history rail */}
        <aside className="flex min-h-0 flex-col border-b bg-card lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="px-4 pb-2 pt-4">
            <SectionLabel>Endpoints</SectionLabel>
          </div>
          <nav className="flex flex-col gap-0.5 px-2.5" aria-label="Endpoints">
            {ENDPOINTS.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => setActive(e.key)}
                className={cn(
                  "flex flex-col gap-1 rounded-[9px] border px-2.5 py-2 text-left transition-colors",
                  active === e.key
                    ? "border-blue-500/35 bg-blue-500/5 shadow-[inset_2px_0_0_theme(colors.blue.500)]"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                      methodTone(e.method),
                    )}
                  >
                    {e.method}
                  </span>
                  <span className="font-mono text-[13px]">
                    {e.path.replace("/api/v1", "")}
                  </span>
                  {e.billable && (
                    <span className="ml-auto rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      billed
                    </span>
                  )}
                </span>
                <span className="text-[11.5px] leading-snug text-muted-foreground">
                  {e.summary}
                </span>
              </button>
            ))}
          </nav>

          <div className="mt-5 flex items-center justify-between px-4 pb-2">
            <SectionLabel>History</SectionLabel>
            <span className="text-[11px] text-muted-foreground/60">this session</span>
          </div>
          <div className="flex min-h-0 flex-col gap-0.5 px-2.5 pb-4 lg:flex-1 lg:overflow-y-auto">
            {history.length === 0 && (
              <p className="px-2.5 py-1 text-[11.5px] text-muted-foreground/70">
                Requests you send here will appear for quick replay.
              </p>
            )}
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => restore(h)}
                className="flex flex-col gap-1 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="flex items-center gap-1.5">
                  <span className={cn("font-mono text-[11px] font-bold", statusTextTone(h.status))}>
                    {h.status}
                  </span>
                  <span className="font-mono text-xs text-foreground/80">
                    {h.method} {h.path}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {fmtDuration(h.durationMs)}
                  </span>
                </span>
                <span className="max-w-[210px] truncate text-[11.5px] text-muted-foreground">
                  {h.note}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Request pane */}
        <section className="flex min-w-0 flex-col border-b bg-card lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex h-[52px] flex-shrink-0 items-center gap-2.5 border-b px-5">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                methodTone(endpoint.method),
              )}
            >
              {endpoint.method}
            </span>
            <code className="font-mono text-sm font-semibold">{endpoint.path}</code>
            {endpoint.scope && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                scope: {endpoint.scope}
              </span>
            )}
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">Request</span>
          </div>

          {endpoint.method === "POST" ? (
            <>
              <div className="flex items-center justify-between px-5 pt-4">
                <SectionLabel>Body · JSON</SectionLabel>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setBody(JSON.stringify(JSON.parse(body), null, 2));
                      } catch {
                        /* leave as-is; footer already flags invalid JSON */
                      }
                    }}
                    className="h-[26px] rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Format
                  </button>
                  <button
                    type="button"
                    onClick={() => setBody(endpoint.defaultBody ?? "")}
                    className="h-[26px] rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Reset example
                  </button>
                </div>
              </div>

              <div className="mx-5 mt-2.5 overflow-hidden rounded-[10px] border bg-muted/20">
                <div className="flex max-h-72 overflow-auto font-mono text-xs leading-[22px]">
                  <div
                    aria-hidden
                    className="select-none border-r bg-muted/40 px-2.5 py-3 text-right text-muted-foreground/40"
                  >
                    {Array.from({ length: lineCount }, (_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    id="pg-body"
                    aria-label="Request body (JSON)"
                    value={body}
                    onChange={(ev) => setBody(ev.target.value)}
                    spellCheck={false}
                    rows={lineCount}
                    wrap="off"
                    className="flex-1 resize-none overflow-hidden bg-transparent px-3.5 py-3 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 border-t bg-muted/40 px-3.5 py-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      bodyCheck?.ok ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  <span className="text-[11.5px] text-muted-foreground">{bodyCheck?.note}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 px-5 pt-4">
                <label htmlFor="pg-idem">
                  <SectionLabel>Idempotency-Key</SectionLabel>{" "}
                  <span className="text-[11px] text-muted-foreground/60">optional</span>
                </label>
                <input
                  id="pg-idem"
                  value={idempotencyKey}
                  onChange={(ev) => setIdempotencyKey(ev.target.value)}
                  placeholder="run-42 — resend to replay the same response"
                  className="h-9 w-full rounded-lg border bg-card px-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </>
          ) : (
            <p className="px-5 pt-4 text-sm text-muted-foreground">
              {endpoint.summary}. No request body.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="inline-flex h-[38px] items-center gap-2 rounded-[9px] bg-blue-500 px-[18px] text-sm font-semibold text-white shadow-[0_6px_14px_-6px_rgba(35,141,210,.7)] transition-colors hover:bg-blue-600 disabled:opacity-70"
            >
              {sending ? "Running…" : "Send request"}
            </button>
            <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              ⌘↵
            </span>
            {endpoint.billable && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Runs a real request and meters usage.
              </span>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mx-5 mb-5 flex min-h-0 flex-col gap-2 border-t pt-3.5">
            <div className="flex items-center gap-2">
              <SectionLabel>Code</SectionLabel>
              <div className="ml-1 flex gap-1">
                <TabButton active={lang === "curl"} onClick={() => setLang("curl")}>
                  cURL
                </TabButton>
                <TabButton active={lang === "js"} onClick={() => setLang("js")}>
                  JavaScript
                </TabButton>
                <TabButton active={lang === "py"} onClick={() => setLang("py")}>
                  Python
                </TabButton>
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={copySnippet}
                className="h-[26px] rounded-md border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="max-h-[180px] overflow-auto rounded-[10px] bg-slate-900 p-3.5 font-mono text-xs leading-[1.7] text-slate-300">
              {snippet}
            </pre>
          </div>
        </section>

        {/* Response pane */}
        <section className="flex min-h-0 min-w-0 flex-col bg-card">
          <div className="flex h-[52px] flex-shrink-0 items-center gap-2.5 border-b px-5">
            {result ? (
              <>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-xs font-bold",
                    statusTone(result.response.status),
                  )}
                >
                  {result.response.status} {STATUS_TEXT[result.response.status] ?? ""}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {result.response.durationMs.toLocaleString()} ms
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {fmtBytes(responseBytes)}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Response</span>
            )}
            <div className="flex-1" />
            <div className="flex gap-1">
              <TabButton active={view === "pretty"} onClick={() => setView("pretty")}>
                Pretty
              </TabButton>
              <TabButton active={view === "raw"} onClick={() => setView("raw")}>
                Raw
              </TabButton>
              <TabButton active={view === "headers"} onClick={() => setView("headers")}>
                Headers
              </TabButton>
            </div>
          </div>

          {sending && (
            <div className="px-5 pt-3.5">
              <div className="flex flex-col gap-2.5 rounded-[10px] border bg-muted/20 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <SectionLabel>
                    {endpoint.key === "agents" ? "Agent run" : "Request"}
                  </SectionLabel>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {(elapsedMs / 1000).toFixed(1)}s elapsed
                    {endpoint.key === "agents" ? " · typically 45–65s" : ""}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 animate-pulse rounded-full bg-blue-500/70"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {!result && !sending && (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="max-w-[260px] text-center text-sm text-muted-foreground">
                Pick an endpoint and hit{" "}
                <span className="font-medium text-foreground">Send request</span> — the live
                response lands here.
              </p>
            </div>
          )}

          {result && view === "pretty" && (
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3.5">
              <pre className="font-mono text-xs leading-[1.75] text-foreground/80">
                {typeof result.response.body === "string" ? (
                  result.response.body
                ) : (
                  <JsonPretty value={result.response.body} />
                )}
              </pre>
            </div>
          )}

          {result && view === "raw" && (
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3.5">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-[1.75] text-foreground/70">
                {typeof result.response.body === "string"
                  ? result.response.body
                  : JSON.stringify(result.response.body)}
              </pre>
            </div>
          )}

          {result && view === "headers" && (
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3.5">
              {Object.entries(result.response.headers).map(([k, v], i, arr) => (
                <div
                  key={k}
                  className={cn(
                    "flex flex-wrap py-2 font-mono text-xs",
                    i < arr.length - 1 && "border-b border-border/60",
                  )}
                >
                  <span className="w-[230px] text-muted-foreground">{k}</span>
                  <span className="break-all">{v}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
