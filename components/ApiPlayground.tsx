"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    summary: "Introspect the calling key — org, environment, scopes, tier.",
    scope: null,
    billable: false,
  },
  {
    key: "usage",
    method: "GET",
    path: "/api/v1/usage",
    summary: "This calendar month's request totals, by endpoint.",
    scope: null,
    billable: false,
  },
  {
    key: "chat",
    method: "POST",
    path: "/api/v1/chat",
    summary: "A simple chat completion.",
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
    summary: "The prior-auth research agent. Runs a real 45–65s tool-using request.",
    scope: "agents",
    billable: true,
    defaultBody: JSON.stringify(
      { messages: [{ role: "user", content: "Is a knee MRI covered for Medicare?" }] },
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

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status >= 400 && status < 500) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-red-500/15 text-red-700 dark:text-red-300";
}

export default function ApiPlayground() {
  const [apiAccess, setApiAccess] = useState<boolean | null>(null);

  const [active, setActive] = useState<EndpointKey>("me");
  const [body, setBody] = useState<string>("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(() => ENDPOINTS.find((e) => e.key === active)!, [active]);

  useEffect(() => {
    fetch("/api/org", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => setApiAccess(o ? o.apiAccess !== false : false))
      .catch(() => setApiAccess(false));
  }, []);

  // Reset the editor to the selected endpoint's example whenever it changes.
  useEffect(() => {
    setBody(endpoint.defaultBody ?? "");
    setResult(null);
    setError(null);
  }, [endpoint]);

  const send = useCallback(async () => {
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
      setResult(data as PlaygroundResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [endpoint, body, idempotencyKey]);

  if (apiAccess === false) {
    return (
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
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[200px_1fr]">
      {/* Endpoint rail */}
      <nav className="flex flex-row flex-wrap gap-1.5 md:flex-col" aria-label="Endpoints">
        {ENDPOINTS.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => setActive(e.key)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
              active === e.key
                ? "border-primary/40 bg-primary/5"
                : "border-transparent hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                e.method === "GET"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {e.method}
            </span>
            <span className="font-mono text-xs">{e.path.replace("/api/v1", "")}</span>
          </button>
        ))}
      </nav>

      {/* Request + response */}
      <div className="min-w-0 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                endpoint.method === "GET"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {endpoint.method}
            </span>
            <code className="text-sm font-semibold">{endpoint.path}</code>
            {endpoint.scope && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                scope: {endpoint.scope}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{endpoint.summary}</p>
        </div>

        {endpoint.method === "POST" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pg-body">Request body (JSON)</Label>
              <textarea
                id="pg-body"
                value={body}
                onChange={(ev) => setBody(ev.target.value)}
                spellCheck={false}
                rows={8}
                className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-idem">
                Idempotency-Key <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="pg-idem"
                value={idempotencyKey}
                onChange={(ev) => setIdempotencyKey(ev.target.value)}
                placeholder="e.g. run-42 — resend to replay the same response"
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
          {endpoint.billable && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Runs a real request and meters usage to your account.
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "rounded px-2 py-0.5 font-mono font-bold",
                  statusClass(result.response.status),
                )}
              >
                {result.response.status}
              </span>
              <span className="text-muted-foreground">{result.response.durationMs} ms</span>
              {Object.entries(result.response.headers)
                .filter(([k]) => k.startsWith("x-ratelimit") || k === "retry-after" || k === "idempotency-replayed")
                .map(([k, v]) => (
                  <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
                    {k}: {v}
                  </span>
                ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Response
              </div>
              <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(result.response.body, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
