"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Says out loud that the request is being screened before it is used.
 *
 * Pairs with `PhiNoticeToast`: this one fires at the start of every run, and
 * the warning one fires afterwards only if something was actually removed. On
 * a clean request the user sees the reassurance and nothing else, which is the
 * right ratio -- a warning on every run would train people to dismiss it.
 *
 * Dedupe is module-level for the same reason as `PhiNoticeToast`: the chat
 * transcript and the Output tab can both be mounted, and a per-component ref
 * would announce one run twice.
 */
const announced = new Set<string>();

/** Test-only: the Set outlives a render tree, so suites must clear it. */
export function __resetHipaaCheckToasts() {
  announced.clear();
}

export function HipaaCheckToast({
  active,
  runKey,
}: {
  /** True while the request is being checked. */
  active: boolean;
  /** Identifies the run, so one screening announces once. */
  runKey?: string;
}) {
  useEffect(() => {
    if (!active) return;
    const key = runKey ?? "pending-run";
    if (announced.has(key)) return;
    announced.add(key);

    toast.info("Checking for HIPAA compliance", {
      description:
        "Scanning your request for patient identifiers before it is used.",
      duration: 4000,
    });
  }, [active, runKey]);

  return null;
}
