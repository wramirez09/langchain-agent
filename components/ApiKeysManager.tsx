"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

const SCOPES = ["agents", "chat"] as const;

export default function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(["agents", "chat"]);
  const [creating, setCreating] = useState(false);

  // one-time plaintext reveal
  const [newKey, setNewKey] = useState<string | null>(null);
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

  const toggleScope = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const createKey = async () => {
    if (scopes.length === 0) {
      setError("Select at least one scope.");
      return;
    }
    setCreating(true);
    setError(null);
    setNewKey(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, environment, scopes }),
      });
      if (!res.ok) throw new Error(`Failed to create key (${res.status})`);
      const data = await res.json();
      setNewKey(data.key);
      setName("");
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

  const copyNewKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
          <CardDescription>
            Keys are <strong>server-side secrets</strong> — never embed one in a browser or mobile
            app. The full key is shown only once, at creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="Production server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Environment</Label>
            <div className="flex gap-2">
              {(["live", "test"] as const).map((env) => (
                <Button
                  key={env}
                  type="button"
                  variant={environment === env ? "default" : "outline"}
                  onClick={() => setEnvironment(env)}
                >
                  {env}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Scopes</Label>
            <div className="flex gap-2">
              {SCOPES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={scopes.includes(s) ? "default" : "outline"}
                  onClick={() => toggleScope(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Button onClick={createKey} disabled={creating}>
              {creating ? "Creating…" : "Create key"}
            </Button>
          </div>

          {newKey && (
            <div className="rounded-md border border-green-600/40 bg-green-50 p-3 text-sm dark:bg-green-950/30">
              <p className="mb-2 font-medium text-green-800 dark:text-green-300">
                Copy your key now — it won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="block flex-1 overflow-x-auto rounded bg-black/80 p-2 font-mono text-xs text-green-200">
                  {newKey}
                </code>
                <Button type="button" variant="outline" onClick={copyNewKey}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your API keys</CardTitle>
          <CardDescription>Keys belonging to your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {keys.map((k) => {
                const revoked = !!k.revoked_at;
                return (
                  <div key={k.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.name || "Untitled key"}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase">
                          {k.environment}
                        </span>
                        {revoked && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                            revoked
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {k.key_prefix}…··· · {k.scopes.join(", ")}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {k.last_used_at
                          ? `Last used ${new Date(k.last_used_at).toLocaleString()}`
                          : "Never used"}
                      </div>
                    </div>
                    {!revoked && (
                      <Button variant="destructive" onClick={() => revokeKey(k.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
