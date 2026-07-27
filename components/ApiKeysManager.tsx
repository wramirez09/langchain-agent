"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconKey,
  IconCopy,
  IconCheck,
  IconTrash,
  IconBan,
  IconAlertTriangle,
  IconShieldLock,
  IconInfoCircle,
  IconDotsVertical,
} from "@tabler/icons-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  created_by_email: string | null;
};

const SCOPES = [
  { id: "agents", desc: "Create and manage agent runs" },
  { id: "chat", desc: "Send chat completions and read transcripts" },
] as const;

const DAY_MS = 86_400_000;
/** A key unused for this long is flagged "Consider rotating". */
const STALE_DAYS = 90;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** "10 minutes ago" / "Yesterday" / "4 months ago" — the list's Last used column. */
function fmtRelative(iso: string | null) {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

const isStale = (k: ApiKey) =>
  !!k.last_used_at && Date.now() - new Date(k.last_used_at).getTime() > STALE_DAYS * DAY_MS;

/** Masked identifier — the plaintext is never retrievable after creation. */
const maskedId = (k: ApiKey) => `${k.key_prefix}${"•".repeat(8)}`;

function Tag({ kind }: { kind: "live" | "test" | "revoked" }) {
  const tone =
    kind === "live"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      : kind === "test"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em]",
        tone,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {kind}
    </span>
  );
}

/** Section heading + sub-line, used above the list and above the create panel. */
function SectionRow({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3.5 mt-8 flex flex-col gap-0.5">
      <h2 className="text-[15px] font-bold tracking-[-0.005em] text-foreground">{title}</h2>
      <span className="text-xs tabular-nums text-muted-foreground">{note}</span>
    </div>
  );
}

/** Inline "Create API key" form. Lives below the list, not in a modal. */
function CreatePanel({
  onCreate,
  creating,
  error,
}: {
  onCreate: (v: { name: string; environment: "live" | "test"; scopes: string[] }) => void;
  creating: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(["agents", "chat"]);

  const toggle = (id: string) =>
    setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const valid = name.trim().length > 0 && scopes.length > 0;
  const submit = () => {
    if (!valid || creating) return;
    onCreate({ name: name.trim(), environment, scopes });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-[18px]">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-primary/10 text-primary">
          <IconKey className="size-[17px]" />
        </span>
        <div>
          <h3 className="m-0 text-[15.5px] font-bold tracking-[-0.012em] text-foreground">
            Create API key
          </h3>
          <p className="m-0 text-xs text-muted-foreground">
            Keys are server-side secrets scoped to your organization.
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 p-5 md:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)] md:gap-x-[22px]">
        <div>
          <Label htmlFor="key-name" className="mb-2 block text-[13px] font-bold text-foreground">
            Name
          </Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Production server"
            className="h-11"
          />
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            Shown in this list and in request logs.
          </p>
        </div>

        <div>
          <span className="mb-2 block text-[13px] font-bold text-foreground">Environment</span>
          <div className="grid grid-flow-col auto-cols-fr overflow-hidden rounded-lg border">
            {(["live", "test"] as const).map((env, i) => (
              <button
                key={env}
                type="button"
                aria-pressed={environment === env}
                onClick={() => setEnvironment(env)}
                className={cn(
                  "h-[42px] text-sm font-bold capitalize transition-colors",
                  i > 0 && "border-l",
                  environment === env
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {env}
              </button>
            ))}
          </div>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            {environment === "live"
              ? "Requests are metered and billed to your subscription."
              : "Requests are never billed. Same production data, models, and rate limits — only metering is skipped."}
          </p>
        </div>

        <div className="md:col-span-2">
          <span className="mb-2 flex items-baseline justify-between gap-3 text-[13px] font-bold text-foreground">
            Scopes
            <span className="text-xs font-semibold text-muted-foreground">
              Grant the minimum needed
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => {
              const on = scopes.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-lg border py-0 pl-3 pr-4 font-mono text-[13.5px] font-bold transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    <IconCheck className={cn("size-3", on ? "opacity-100" : "opacity-0")} />
                  </span>
                  {s.id}
                </button>
              );
            })}
          </div>
          <p
            className={cn(
              "m-0 mt-2.5 text-xs",
              scopes.length === 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {scopes.length === 0
              ? "Select at least one scope."
              : SCOPES.filter((s) => scopes.includes(s.id))
                .map((s) => s.desc)
                .join(" · ")}
          </p>
        </div>

        {error && (
          <p className="m-0 text-sm text-destructive md:col-span-2" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2.5 border-t bg-muted/40 px-5 py-3.5">
        <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
          <IconInfoCircle className="size-3.5 shrink-0" />
          The secret is shown once, right after you create it.
        </span>
        <Button onClick={submit} disabled={!valid || creating}>
          {creating ? "Creating…" : "Create key"}
        </Button>
      </div>
    </div>
  );
}

/** Post-create reveal. Replaces the create panel until the user confirms storage. */
function SecretPanel({
  name,
  secret,
  onDone,
}: {
  name: string;
  secret: string;
  onDone: () => void;
}) {
  const [stored, setStored] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Secret key copied");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-[18px]">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-primary/10 text-primary">
          <IconKey className="size-[17px]" />
        </span>
        <div>
          <h3 className="m-0 text-[15.5px] font-bold tracking-[-0.012em] text-foreground">
            Copy your secret key
          </h3>
          <p className="m-0 text-xs text-muted-foreground">
            This is the only time we&apos;ll show the full key for{" "}
            <b className="font-semibold text-foreground">{name}</b>.
          </p>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-300/60 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <IconAlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            NoteDoctorAi doesn&apos;t store the secret. If you lose it, revoke this key and create a
            new one.
          </span>
        </div>

        <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Secret key
        </div>
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-[#16212e] px-3 py-3 pl-3.5 ring-1 ring-inset ring-white/10">
          <code className="flex-1 break-all font-mono text-[13px] tracking-[-0.02em] text-[#cfe4f5] dark:text-[#cfe4f5]">
            {secret}
          </code>
          <Button size="sm" onClick={copy} aria-label="Copy secret key">
            {copied ? <IconCheck /> : <IconCopy />} Copy
          </Button>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13.5px]">
          <Checkbox
            checked={stored}
            onCheckedChange={(v) => setStored(v === true)}
            aria-label="I've stored this key in a safe place"
          />
          I&apos;ve stored this key in a safe place
        </label>
      </div>

      <div className="flex justify-end border-t bg-muted/40 px-5 py-3.5">
        <Button onClick={onDone} disabled={!stored}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Per-row ⋮ menu: copy the masked id, revoke, delete. */
function RowMenu({
  k,
  onCopyId,
  onRevoke,
  onDelete,
}: {
  k: ApiKey;
  onCopyId: () => void;
  onRevoke: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const revoked = !!k.revoked_at;
  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold transition-colors";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${k.name || "Untitled key"}`}
          className="grid size-[30px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <IconDotsVertical className="size-[17px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[190px] p-1.5">
        <button
          type="button"
          className={cn(item, "text-foreground hover:bg-muted")}
          onClick={() => {
            setOpen(false);
            onCopyId();
          }}
        >
          <IconCopy className="size-4" /> Copy key ID
        </button>
        <div className="my-1 h-px bg-border" />
        {!revoked && (
          <button
            type="button"
            className={cn(item, "text-destructive hover:bg-destructive/10")}
            onClick={() => {
              setOpen(false);
              onRevoke();
            }}
          >
            <IconBan className="size-4" /> Revoke key
          </button>
        )}
        <button
          type="button"
          className={cn(item, "text-destructive hover:bg-destructive/10")}
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
        >
          <IconTrash className="size-4" /> Delete key
        </button>
      </PopoverContent>
    </Popover>
  );
}

const GRID = "md:grid md:grid-cols-[1.5fr_1.1fr_0.82fr_0.74fr_40px] md:items-center md:gap-3.5";

export default function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [apiAccess, setApiAccess] = useState(true);

  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ name: string; secret: string } | null>(null);
  // Pending destructive action, confirmed in a modal (never window.confirm).
  const [confirming, setConfirming] = useState<{
    action: "revoke" | "delete";
    key: ApiKey;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [keysRes, orgRes] = await Promise.all([
        fetch("/api/keys", { cache: "no-store" }),
        fetch("/api/org", { cache: "no-store" }),
      ]);
      if (!keysRes.ok) throw new Error(`Failed to load keys (${keysRes.status})`);
      const data = await keysRes.json();
      setKeys(data.keys ?? []);
      if (orgRes.ok) {
        const o = await orgRes.json();
        setRole(o.role ?? null);
        setApiAccess(o.apiAccess !== false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh just the key list without the loading skeleton (used as a fallback
  // if a mutation response doesn't carry the row to insert locally).
  const refetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys", { cache: "no-store" });
      if (res.ok) setKeys((await res.json()).keys ?? []);
    } catch {
      /* leave the current list in place */
    }
  }, []);

  useEffect(() => {
    // Mount-time fetch; `load` flips the loading flag before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const createKey = async ({
    name,
    environment,
    scopes,
  }: {
    name: string;
    environment: "live" | "test";
    scopes: string[];
  }) => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, environment, scopes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to create key (${res.status})`);
      setFresh({ name, secret: data.key });
      // Insert the new key in place (newest first). If the response somehow
      // didn't carry the row, fall back to a silent refetch so the list still
      // reflects the new key.
      if (data.apiKey) setKeys((prev) => [data.apiKey as ApiKey, ...prev]);
      else void refetchKeys();
      toast.success("API key created");
    } catch (e) {
      const msg = (e as Error).message;
      setCreateError(msg); // inline in the create panel
      toast.error(msg); // prominent, in case the panel scrolled out of view
    } finally {
      setCreating(false);
    }
  };

  // Soft-revoke: the key stops working but stays listed as "revoked".
  const revokeKey = async (id: string) => {
    setError(null);
    const prev = keys;
    const revoked_at = new Date().toISOString();
    setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, revoked_at } : k)));
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to revoke key (${res.status})`);
      }
      toast.success("Key revoked");
    } catch (e) {
      setKeys(prev);
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    }
  };

  // Hard-delete: permanently removes the key.
  const deleteKey = async (id: string) => {
    setError(null);
    const prev = keys;
    setKeys((ks) => ks.filter((k) => k.id !== id));
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to delete key (${res.status})`);
      }
      toast.success("Key deleted");
    } catch (e) {
      setKeys(prev);
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    }
  };

  const copyId = async (k: ApiKey) => {
    await navigator.clipboard.writeText(k.key_prefix);
    toast.success("Key ID copied");
  };

  const activeCount = keys.filter((k) => !k.revoked_at).length;
  const revokedCount = keys.length - activeCount;
  const canManage = role === "owner" || role === "admin";
  const canCreate = canManage && apiAccess;

  return (
    <div>
      {!apiAccess && !loading && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm dark:bg-amber-500/10">
          <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <IconShieldLock className="size-4 shrink-0" />
            An active subscription is required to create API keys — every plan includes the API.
          </span>
          <a
            href="/agents/org"
            className="shrink-0 font-medium text-amber-900 underline dark:text-amber-200"
          >
            Subscribe
          </a>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <IconAlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Create / reveal — above the list, so the primary action is first. */}
      {canCreate ? (
        <>
          <SectionRow
            title={fresh ? "Your new key" : "Create a key"}
            note={
              fresh
                ? "Copy the secret before you dismiss it"
                : "Name it, pick an environment, choose scopes"
            }
          />
          {fresh ? (
            <SecretPanel name={fresh.name} secret={fresh.secret} onDone={() => setFresh(null)} />
          ) : (
            <CreatePanel onCreate={createKey} creating={creating} error={createError} />
          )}
        </>
      ) : !canManage && !loading ? (
        <p className="mt-8 text-xs text-muted-foreground">
          Read-only · members can&apos;t create or revoke keys.
        </p>
      ) : null}

      <SectionRow
        title="Your keys"
        note={
          loading
            ? " "
            : `${activeCount} active${revokedCount > 0 ? ` · ${revokedCount} revoked` : ""}`
        }
      />

      {/* Keys list */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? (
          <div className="divide-y">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-4 px-[18px] py-4">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-64 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-[62px] text-center">
            <span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconKey className="size-5" />
            </span>
            <h3 className="m-0 mb-1.5 text-[16.5px] font-bold text-foreground">No API keys yet</h3>
            <p className="mx-auto m-0 max-w-[44ch] text-[13.5px] text-muted-foreground">
              {canCreate
                ? "Use the form above to create your first key. You'll see the secret once, right after it's generated."
                : "No keys have been created for this organization yet."}
            </p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                GRID,
                "hidden border-b bg-muted/40 px-[18px] py-[11px] text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground",
              )}
            >
              <span>Name</span>
              <span>Key</span>
              <span>Scopes</span>
              <span>Last used</span>
              <span />
            </div>

            {keys.map((k) => {
              const revoked = !!k.revoked_at;
              const stale = isStale(k);
              return (
                <div
                  key={k.id}
                  data-testid="api-key-row"
                  className={cn(
                    GRID,
                    "relative flex flex-col gap-2.5 border-b px-4 py-4 transition-colors last:border-b-0 md:px-[18px]",
                    revoked ? "bg-muted/40" : "hover:bg-muted/25",
                  )}
                >
                  <div className="pr-10 md:pr-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[14.5px] font-bold tracking-[-0.008em]",
                          revoked ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {k.name || "Untitled key"}
                      </span>
                      <Tag kind={revoked ? "revoked" : k.environment} />
                    </div>
                    <div className="mt-[3px] text-xs text-muted-foreground">
                      Created <b className="font-semibold">{fmtDate(k.created_at)}</b>
                      {k.created_by_email ? (
                        <>
                          {" by "}
                          <b className="font-semibold">{k.created_by_email}</b>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md border bg-muted/50 py-1 pl-2.5 pr-1 font-mono text-[12.5px] tracking-[-0.02em]",
                        revoked ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      <span className="whitespace-nowrap">{maskedId(k)}</span>
                      <button
                        type="button"
                        title="Copy key ID"
                        aria-label={`Copy key ID for ${k.name || "Untitled key"}`}
                        onClick={() => copyId(k)}
                        className="grid size-[25px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                      >
                        <IconCopy className="size-3.5" />
                      </button>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {k.scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-primary/10 px-2 py-[3px] font-mono text-[11px] font-semibold text-primary"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div
                    className={cn(
                      "text-[12.5px] font-semibold",
                      stale && !revoked
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground md:text-foreground",
                    )}
                  >
                    {fmtRelative(k.last_used_at)}
                    {stale && !revoked && (
                      <div className="mt-[3px] text-xs font-normal">Consider rotating</div>
                    )}
                  </div>

                  <div className="absolute right-3 top-3.5 md:static md:justify-self-end">
                    {canManage && (
                      <RowMenu
                        k={k}
                        onCopyId={() => copyId(k)}
                        onRevoke={() => setConfirming({ action: "revoke", key: k })}
                        onDelete={() => setConfirming({ action: "delete", key: k })}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="mt-[18px] flex max-w-[80ch] items-start gap-2.5 px-1 text-xs leading-relaxed text-muted-foreground">
        <IconShieldLock className="mt-px size-4 shrink-0" />
        <span>
          Store them in a secrets manager, never in
          source control, and rotate them regularly.
        </span>
      </div>

      {/* Destructive confirmations */}
      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="sm:max-w-lg">
          {confirming && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-destructive/10 text-destructive">
                    {confirming.action === "revoke" ? (
                      <IconBan className="size-[18px]" />
                    ) : (
                      <IconTrash className="size-[18px]" />
                    )}
                  </span>
                  {confirming.action === "revoke" ? "Revoke this key?" : "Delete this key?"}
                </DialogTitle>
                <DialogDescription>
                  {confirming.action === "revoke"
                    ? "Any system using it will immediately lose access. This can't be undone."
                    : "The key is permanently removed from this list. This can't be undone."}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-[13px] leading-relaxed text-destructive">
                <b className="font-semibold">{confirming.key.name || "Untitled key"}</b>
                {" — "}
                <span className="font-mono font-semibold">{maskedId(confirming.key)}</span>
                <br />
                {confirming.action === "revoke"
                  ? "Requests made with this key will start failing right away. Create a replacement key first if a live integration depends on it."
                  : "Usage already logged against this key is kept for billing, but the key itself is gone."}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirming(null)}>
                  {confirming.action === "revoke" ? "Keep key" : "Cancel"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const { action, key } = confirming;
                    setConfirming(null);
                    void (action === "revoke" ? revokeKey(key.id) : deleteKey(key.id));
                  }}
                >
                  {confirming.action === "revoke" ? "Revoke key" : "Delete key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
