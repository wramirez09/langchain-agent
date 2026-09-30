"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/client";

type Props = {
  authorizationId: string;
  clientName: string;
  redirectHost: string;
  email: string;
};

export function ConsentForm({
  authorizationId,
  clientName,
  redirectHost,
  email,
}: Props) {
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "deny") => {
    setPending(decision);
    setError(null);
    const { oauth } = createClient().auth;
    // `skipBrowserRedirect` so a failure can be shown here instead of the
    // browser leaving mid-request.
    const { data, error } =
      decision === "approve"
        ? await oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });
    if (error || !data?.redirect_url) {
      setError(
        error?.message ??
          "Something went wrong. Try again from your AI assistant.",
      );
      setPending(null);
      return;
    }
    window.location.assign(data.redirect_url);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-light px-4 py-6">
      <div className="w-full max-w-md bg-card rounded-xl shadow-md p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Connect {clientName} to NoteDoctorAi
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <div className="text-sm space-y-2">
          <p>{clientName} will be able to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Search Medicare and commercial payer coverage policy</li>
            <li>Run prior authorization readiness screenings</li>
            <li>See your account&apos;s usage</li>
          </ul>
          <p className="text-muted-foreground">
            Calls are billed to your subscription as MCP usage. Don&apos;t send
            patient names, dates of birth or member IDs through the assistant.
          </p>
          <p className="text-muted-foreground break-all">
            You&apos;ll be returned to{" "}
            <span className="font-medium">{redirectHost}</span>.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-11"
            onClick={() => decide("approve")}
            disabled={pending !== null}
          >
            {pending === "approve" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Allow
          </Button>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => decide("deny")}
            disabled={pending !== null}
          >
            {pending === "deny" && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}
