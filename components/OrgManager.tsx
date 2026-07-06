"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IconBuilding,
  IconPencil,
  IconCheck,
  IconX,
  IconUserPlus,
  IconTrash,
  IconCreditCard,
  IconAlertTriangle,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

type Role = "owner" | "admin" | "member";
type Member = { user_id: string; email: string | null; role: Role; created_at: string };
type Usage = { total: number; agents: number; chat: number };

const roleBadge = (r: Role) =>
  cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset capitalize",
    r === "owner"
      ? "bg-primary/10 text-primary ring-primary/20"
      : r === "admin"
        ? "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400"
        : "bg-muted text-muted-foreground ring-border",
  );

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function OrgManager() {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // name editing
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  // invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = role === "owner" || role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, memRes, useRes] = await Promise.all([
        fetch("/api/org"),
        fetch("/api/org/members"),
        fetch("/api/org/usage"),
      ]);
      if (orgRes.ok) {
        const d = await orgRes.json();
        setOrg(d.org);
        setRole(d.role);
        setMe(d.userId ?? null);
      }
      if (memRes.ok) setMembers((await memRes.json()).members ?? []);
      if (useRes.ok) setUsage(await useRes.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveName = async () => {
    const name = draftName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename organization");
      setEditingName(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to add member (${res.status})`);
      const invitedEmail = inviteEmail.trim();
      setInviteEmail("");
      if (data.invited) {
        setNotice(`Invitation emailed to ${invitedEmail}. They'll appear here once they accept.`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, newRole: Role) => {
    setError(null);
    try {
      const res = await fetch(`/api/org/members/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to change role");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeMember = async (userId: string, email: string | null) => {
    if (!confirm(`Remove ${email || "this member"} from the organization?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/org/members/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openBilling = async () => {
    try {
      const res = await fetch("/api/stripe/billing", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setError(data.error || "Unable to open billing portal.");
    } catch {
      setError("Unable to open billing portal.");
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <IconAlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Profile */}
      <Card
        title="Organization"
        action={role ? <span className={roleBadge(role)}>{role}</span> : null}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <IconBuilding className="size-5" />
          </div>
          {editingName ? (
            <div className="flex flex-1 items-center gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                className="max-w-xs"
              />
              <Button size="icon" variant="outline" onClick={saveName} aria-label="Save">
                <IconCheck />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(false)} aria-label="Cancel">
                <IconX />
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <span className="text-base font-medium">{org?.name ?? "Organization"}</span>
              {canManage && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setDraftName(org?.name ?? "");
                    setEditingName(true);
                  }}
                  aria-label="Rename organization"
                >
                  <IconPencil className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Usage */}
      <Card title="Usage this month">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total requests", value: usage?.total ?? 0 },
            { label: "Agent", value: usage?.agents ?? 0 },
            { label: "Chat", value: usage?.chat ?? 0 },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-semibold">{s.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Members */}
      <Card title={`Members (${members.length})`}>
        {canManage && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              className="h-9 rounded-lg border bg-background px-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button onClick={invite} disabled={inviting}>
              <IconUserPlus /> {inviting ? "Adding…" : "Add"}
            </Button>
          </div>
        )}

        {notice && (
          <div className="mb-3 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <div className="divide-y">
          {members.map((m) => {
            const isMe = me === m.user_id;
            return (
              <div key={m.user_id} className="flex items-center gap-3 py-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {(m.email?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{m.email ?? m.user_id}</span>
                    {isMe && <span className="text-[11px] text-muted-foreground">you</span>}
                  </div>
                </div>

                {role === "owner" && !isMe ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value as Role)}
                    className="h-8 rounded-lg border bg-background px-2 text-xs capitalize"
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                  </select>
                ) : (
                  <span className={roleBadge(m.role)}>{m.role}</span>
                )}

                {canManage && !isMe && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember(m.user_id, m.email)}
                    aria-label="Remove member"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {!canManage && (
          <p className="mt-3 text-xs text-muted-foreground">
            Only owners and admins can invite or manage members.
          </p>
        )}
      </Card>

      {/* Billing */}
      {role === "owner" && (
        <Card title="Billing">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Manage your organization&apos;s subscription and payment method.
            </p>
            <Button variant="outline" onClick={openBilling}>
              <IconCreditCard /> Manage billing
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
