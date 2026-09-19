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
  IconTag,
  IconLock,
  IconClock,
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
  {
    id: "agents",
    endpoint: "POST /api/v1/agents",
    desc: "Create and manage prior-auth agent runs, and read their results.",
  },
  {
    id: "chat",
    endpoint: "POST /api/v1/chat",
    desc: "Send chat completions and read transcripts.",
  },
] as const;

const NAME_SUGGESTIONS = ["Production server", "CI pipeline"] as const;

const EXPIRY_CHOICES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: 0, label: "No expiry" },
] as const;

const DAY_MS = 86_400_000;
/** A key unused for this long is flagged "Consider rotating". */
const STALE_DAYS = 90;
/** Per-key limit on the standard tier — same for live and test keys. */
const RATE_LIMIT_LABEL = "30 req / min";

const fmtDate = (d: string | number) =>
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
      ? "bg-success/5 text-success dark:bg-success/10 dark:text-success"
      : kind === "test"
        ? "bg-warning/5 text-warning dark:bg-warning/10 dark:text-warning"
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

/** Blue icon + bold title row that heads each section of the create form. */
function SectionHead({
  icon,
  title,
  aside,
  labelFor,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  labelFor?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="shrink-0 text-primary">{icon}</span>
      {labelFor ? (
        <Label
          htmlFor={labelFor}
          className="text-[15px] font-bold tracking-[-0.008em] text-foreground"
        >
          {title}
        </Label>
      ) : (
        <span className="text-[15px] font-bold tracking-[-0.008em] text-foreground">{title}</span>
      )}
      {aside}
    </div>
  );
}

type CreateValues = {
  name: string;
  environment: "live" | "test";
  scopes: string[];
  expiresAt?: string;
};

/** Inline create form + live summary sidebar. Lives above the list. */
function CreatePanel({
  onCreate,
  creating,
  error,
}: {
  onCreate: (v: CreateValues) => void;
  creating: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>(["agents", "chat"]);
  const [expiry, setExpiry] = useState<number>(90);

  const toggle = (id: string) =>
    setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const reset = () => {
    setName("");
    setEnvironment("live");
    setScopes(["agents", "chat"]);
    setExpiry(90);
  };

  const valid = name.trim().length > 0 && scopes.length > 0;
  const submit = () => {
    if (!valid || creating) return;
    onCreate({
      name: name.trim(),
      environment,
      scopes,
      ...(expiry > 0
        ? { expiresAt: new Date(Date.now() + expiry * DAY_MS).toISOString() }
        : {}),
    });
  };

  // Relative, not a calendar date: the clock starts at creation (submit time),
  // not while the form sits open — and Date.now() is banned during render.
  const expiryChoice = EXPIRY_CHOICES.find((c) => c.days === expiry)!;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,1fr)]">
      {/* Form card */}
      <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <div className="flex items-start gap-3 border-b px-6 py-[18px]">
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

        {/* Name */}
        <div className="border-b px-6 py-[22px]">
          <SectionHead icon={<IconTag className="size-[18px]" />} title="Name" labelFor="key-name" />
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Production server"
            className="h-[46px] rounded-[10px] text-[15px]"
          />
          <div className="mt-2 flex flex-col gap-2.5">
            <p className="m-0 text-xs leading-normal text-muted-foreground">
              Shown in this list and in request logs. Name it after the system that will hold it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {NAME_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setName(s)}
                  className="h-[26px] rounded-full border bg-card px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Environment */}
        <div className="border-b px-6 py-[22px]">
          <SectionHead icon={<IconKey className="size-[18px]" />} title="Environment" />
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
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {env}
              </button>
            ))}
          </div>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            The environment labels usage rows — both kinds of key call the same API.
          </p>
        </div>

        {/* Scopes */}
        <div className="border-b px-6 py-[22px]">
          <SectionHead
            icon={<IconLock className="size-[18px]" />}
            title="Scopes"
            aside={
              <span className="ml-auto text-xs font-semibold text-muted-foreground">
                Grant the minimum needed
              </span>
            }
          />
          <p className="m-0 mb-3.5 text-xs text-muted-foreground">
            A scope is a set of endpoints this key may call. You can&apos;t widen a key later —
            create a new one.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {SCOPES.map((s) => {
              const on = scopes.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-label={s.id}
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border-[1.5px] px-[15px] py-[13px] text-left transition-colors",
                    on ? "border-primary bg-primary/5" : "border-input bg-card hover:bg-accent/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-md border-[1.5px] transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card",
                    )}
                  >
                    <IconCheck className={cn("size-3", on ? "opacity-100" : "opacity-0")} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13.5px] font-bold text-foreground">
                        {s.id}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {s.endpoint}
                      </span>
                    </span>
                    <span className="text-xs leading-normal text-muted-foreground">{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p
            className={cn(
              "m-0 mt-3 text-xs",
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

        {/* Expiry */}
        <div className="px-6 py-[22px]">
          <SectionHead
            icon={<IconClock className="size-[18px]" />}
            title="Expiry"
            aside={<span className="text-xs text-muted-foreground">optional</span>}
          />
          <div className="flex flex-wrap gap-2">
            {EXPIRY_CHOICES.map((c) => {
              const on = expiry === c.days;
              return (
                <button
                  key={c.days}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setExpiry(c.days)}
                  className={cn(
                    "h-[34px] rounded-full border px-3.5 text-[13px] transition-colors",
                    on
                      ? "border-[1.5px] border-primary bg-primary/10 font-semibold text-primary"
                      : "font-medium text-muted-foreground hover:bg-accent",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="m-0 mt-2.5 text-xs text-muted-foreground">
            {expiry === 0
              ? "This key stays valid until it is revoked. Best reserved for keys you rotate on your own schedule."
              : `Stops working ${expiryChoice.label} after creation.`}
          </p>
          {error && (
            <p className="m-0 mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t bg-muted/40 px-6 py-3.5">
          <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <IconInfoCircle className="size-3.5 shrink-0" />
            The secret is shown once, right after you create it.
          </span>
          <Button variant="outline" onClick={reset} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || creating}>
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>
      </div>

      {/* Live summary */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-[18px] py-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Summary
            </span>
            <span className="ml-auto font-mono text-[11.5px] text-muted-foreground">
              {environment === "live" ? "sk_live_" : "sk_test_"}
              ••••••••
            </span>
          </div>
          <div className="px-[18px] pb-3.5 pt-1.5">
            {[
              {
                label: "Name",
                value: (
                  <span className="break-words text-right text-xs font-semibold">
                    {name.trim() || "Untitled key"}
                  </span>
                ),
              },
              { label: "Environment", value: <Tag kind={environment} /> },
              {
                label: "Scopes",
                value: (
                  <span className="text-right font-mono text-xs font-semibold text-primary">
                    {scopes.length ? scopes.join(", ") : "none"}
                  </span>
                ),
              },
              {
                label: "Rate limit",
                value: <span className="font-mono text-xs font-semibold">{RATE_LIMIT_LABEL}</span>,
              },
              {
                label: "Expires",
                value: (
                  <span className="text-xs font-semibold">
                    {expiry === 0 ? "Never" : `In ${expiryChoice.label}`}
                  </span>
                ),
              },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                className={cn(
                  "flex items-center justify-between gap-3 py-[9px]",
                  i < arr.length - 1 && "border-b border-border/50",
                )}
              >
                <span className="text-xs text-muted-foreground">{row.label}</span>
                {row.value}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5 rounded-xl border bg-primary/[0.04] px-4 py-3.5">
          <IconShieldLock className="mt-px size-4 shrink-0 text-muted-foreground" />
          <span className="text-xs leading-relaxed text-muted-foreground">
            Rotate by creating a replacement key, deploying it, then revoking the old one. Expired
            and revoked keys stop authenticating immediately.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Post-create reveal. Replaces the create panel until the user confirms storage. */
function SecretPanel({
  name,
  secret,
  scopes,
  onDone,
}: {
  name: string;
  secret: string;
  scopes: string[];
  onDone: () => void;
}) {
  const [stored, setStored] = useState(false);
  const [copied, setCopied] = useState<"" | "secret" | "env" | "curl">("");

  const curlPath = scopes.includes("agents") ? "/api/v1/agents" : "/api/v1/chat";
  const curl = `curl https://app.notedoctor.ai${curlPath} \\\n  -H "Authorization: Bearer $ND_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"messages":[{"role":"user","content":"..."}]}'`;

  const copy = async (text: string, tag: "secret" | "env" | "curl", message: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("Couldn't access the clipboard — select and copy it manually.");
      return;
    }
    setCopied(tag);
    setTimeout(() => setCopied(""), 2000);
    toast.success(message);
  };

  return (
    <div className="max-w-[760px] overflow-hidden rounded-[14px] border border-primary/25 bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b bg-gradient-to-b from-primary/[0.04] to-transparent px-6 py-5">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-success/15 text-success dark:text-success">
          <IconCheck className="size-[18px]" />
        </span>
        <div>
          <h3 className="m-0 text-[17px] font-bold tracking-[-0.012em] text-foreground">
            Key created — copy the secret now
          </h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            This is the only time we&apos;ll show the full key for{" "}
            <b className="font-semibold text-foreground">{name}</b>.
          </p>
        </div>
      </div>

      <div className="px-6 py-[22px]">
        <div className="mb-[18px] flex items-start gap-2.5 rounded-[10px] border border-warning/60 bg-warning/5 px-3.5 py-3 text-xs leading-relaxed text-warning dark:bg-warning/10 dark:text-warning">
          <IconAlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            NoteDoctorAi doesn&apos;t store the secret. If you lose it, revoke this key and create a
            new one.
          </span>
        </div>

        <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Secret key
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-foreground dark:bg-black/40 px-3.5 py-3.5 ring-1 ring-inset ring-white/10">
          <code className="flex-1 break-all font-mono text-[13.5px] tracking-[-0.02em] text-background dark:text-accent-foreground">
            {secret}
          </code>
          <Button
            size="sm"
            onClick={() => copy(secret, "secret", "Secret key copied")}
            aria-label="Copy secret key"
          >
            {copied === "secret" ? <IconCheck /> : <IconCopy />} Copy
          </Button>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copy(`ND_API_KEY=${secret}`, "env", ".env line copied")}
            className="h-[30px] rounded-[7px] border bg-card px-3 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            {copied === "env" ? "Copied .env line" : "Copy as .env line"}
          </button>
          <button
            type="button"
            onClick={() => copy(curl, "curl", "cURL example copied")}
            className="h-[30px] rounded-[7px] border bg-card px-3 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            {copied === "curl" ? "Copied cURL" : "Copy cURL"}
          </button>
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-[13.5px]">
          <Checkbox
            checked={stored}
            onCheckedChange={(v) => setStored(v === true)}
            aria-label="I've stored this key in a safe place"
          />
          I&apos;ve stored this key in a safe place
        </label>
      </div>

      <div className="flex items-center gap-3 border-t bg-muted/40 px-6 py-3.5">
        <a
          href="/agents/api-playground"
          className="text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Try it in the API Playground →
        </a>
        <div className="flex-1" />
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
          className="grid size-[30px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconDotsVertical className="size-[17px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[190px] p-1.5">
        <button
          type="button"
          className={cn(item, "text-foreground hover:bg-accent")}
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
  const [fresh, setFresh] = useState<{ name: string; secret: string; scopes: string[] } | null>(
    null,
  );
  // The just-created key's row is highlighted for the rest of the session.
  const [freshId, setFreshId] = useState<string | null>(null);
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
    void load();
  }, [load]);

  const createKey = async ({ name, environment, scopes, expiresAt }: CreateValues) => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          environment,
          scopes,
          ...(expiresAt ? { expiresAt } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to create key (${res.status})`);
      setFresh({ name, secret: data.key, scopes });
      // Insert the new key in place (newest first). If the response somehow
      // didn't carry the row, fall back to a silent refetch so the list still
      // reflects the new key.
      if (data.apiKey) {
        setKeys((prev) => [data.apiKey as ApiKey, ...prev]);
        setFreshId((data.apiKey as ApiKey).id);
      } else void refetchKeys();
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
    try {
      await navigator.clipboard.writeText(k.key_prefix);
    } catch {
      toast.error("Couldn't access the clipboard.");
      return;
    }
    toast.success("Key ID copied");
  };

  const activeCount = keys.filter((k) => !k.revoked_at).length;
  const revokedCount = keys.length - activeCount;
  const canManage = role === "owner" || role === "admin";
  const canCreate = canManage && apiAccess;

  return (
    <div>
      {!apiAccess && !loading && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warning/60 bg-warning/5 px-3 py-2.5 text-sm dark:bg-warning/10">
          <span className="flex items-center gap-2 text-warning dark:text-warning">
            <IconShieldLock className="size-4 shrink-0" />
            An active subscription is required to create API keys — every plan includes the API.
          </span>
          <a
            href="/agents/org"
            className="shrink-0 font-medium text-warning underline dark:text-warning"
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
        <div className="mt-7">
          {fresh ? (
            <SecretPanel
              name={fresh.name}
              secret={fresh.secret}
              scopes={fresh.scopes}
              onDone={() => setFresh(null)}
            />
          ) : (
            <CreatePanel onCreate={createKey} creating={creating} error={createError} />
          )}
        </div>
      ) : !canManage && !loading ? (
        <p className="mt-8 text-xs text-muted-foreground">
          Read-only · members can&apos;t create or revoke keys.
        </p>
      ) : null}

      <div className="mb-3.5 mt-10 flex items-baseline gap-3">
        <h2 className="m-0 text-[17px] font-bold tracking-[-0.012em] text-foreground">Your keys</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {loading
            ? " "
            : `${activeCount} active${revokedCount > 0 ? ` · ${revokedCount} revoked` : ""}`}
        </span>
        <div className="flex-1" />
        <a
          href="/agents/org"
          className="text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Usage →
        </a>
      </div>

      {/* Keys list */}
      <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
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
              const isNew = k.id === freshId;
              return (
                <div
                  key={k.id}
                  data-testid="api-key-row"
                  className={cn(
                    GRID,
                    "relative flex flex-col gap-2.5 border-b px-4 py-4 transition-colors last:border-b-0 md:px-[18px]",
                    revoked
                      ? "bg-muted/40"
                      : isNew
                        ? "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]"
                        : "hover:bg-accent/25",
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
                        ? "text-warning dark:text-warning"
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
