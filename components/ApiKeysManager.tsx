"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconKey,
  IconPlus,
  IconCopy,
  IconCheck,
  IconTrash,
  IconAlertTriangle,
  IconShieldLock,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

type ApiKey = {
  id: string;
  name: string | null;
  key_prefix: string;
  environment: "live" | "test";
  scopes: string[];
  rate_limit_tier: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
};

const ALL_SCOPES = ["agents", "chat"] as const;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function EnvBadge({ env }: { env: "live" | "test" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        env === "live"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30"
          : "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30",
      )}
    >
      {env}
    </span>
  );
}

export default function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create dialog
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(["agents", "chat"]);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error(`Failed to load keys (${res.status})`);
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setName("");
    setEnvironment("live");
    setScopes(["agents", "chat"]);
    setCreatedKey(null);
    setCopied(false);
    setError(null);
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) resetForm();
  };

  const toggleScope = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const createKey = async () => {
    if (scopes.length === 0) {
      setError("Select at least one scope.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, environment, scopes }),
      });
      if (!res.ok) throw new Error(`Failed to create key (${res.status})`);
      const data = await res.json();
      setCreatedKey(data.key);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this key? Applications using it will immediately lose access.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to revoke key (${res.status})`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeCount = keys.filter((k) => !k.revoked_at).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Your keys</h2>
          <p className="text-xs text-muted-foreground">{loading ? " " : `${activeCount} active`}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <IconPlus /> Create key
        </Button>
      </div>

      {error && !open && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <IconAlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Keys list */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <div className="divide-y">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-64 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <IconKey className="size-5" />
            </div>
            <div>
              <p className="font-medium">No API keys yet</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Create a key to start calling the NoteDoctor public API.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <IconPlus /> Create your first key
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {keys.map((k) => {
              const revoked = !!k.revoked_at;
              return (
                <div
                  key={k.id}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40",
                    revoked && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{k.name || "Untitled key"}</span>
                      <EnvBadge env={k.environment} />
                      {revoked && (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-400">
                          revoked
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {k.key_prefix}
                        {"•".repeat(8)}
                      </code>
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Created {fmtDate(k.created_at)}
                      {" · "}
                      {k.last_used_at ? `last used ${fmtDate(k.last_used_at)}` : "never used"}
                    </div>
                  </div>
                  {!revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => revokeKey(k.id)}
                    >
                      <IconTrash /> Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / reveal dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <IconCheck className="size-5 text-emerald-600" /> Key created
                </DialogTitle>
                <DialogDescription>
                  Copy it now — for your security, it won&apos;t be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
                  {createdKey}
                </code>
                <Button variant="outline" size="icon" onClick={copyKey} aria-label="Copy key">
                  {copied ? <IconCheck className="text-emerald-600" /> : <IconCopy />}
                </Button>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <IconShieldLock className="mt-px size-4 shrink-0" />
                Treat this like a password. Store it server-side; never ship it to a browser or mobile app.
              </div>
              <DialogFooter>
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Keys are server-side secrets scoped to your organization.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 py-1">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="key-name">Name</Label>
                  <Input
                    id="key-name"
                    placeholder="Production server"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Environment</Label>
                  <div className="inline-flex w-full rounded-lg border p-0.5">
                    {(["live", "test"] as const).map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => setEnvironment(env)}
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                          environment === env
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {env}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Scopes</Label>
                  <div className="flex gap-2">
                    {ALL_SCOPES.map((s) => {
                      const on = scopes.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleScope(s)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                            on
                              ? "border-primary bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {on ? <IconCheck className="mr-1 inline size-3.5" /> : null}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={createKey} disabled={creating}>
                  {creating ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
