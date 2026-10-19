"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Announces that the agent stripped identifiers out of the request.
 *
 * `phiNotice` has been on the artifact schema all along
 * (`lib/priorAuth/artifactSchema.ts:141`) and has been rendered all along --
 * as 12.5px faint text under the header chips, which is where a notice goes to
 * be missed. The model only sets it when it actually removed something, so
 * when it is set it is the most important line on the page and it looked like
 * the least important one.
 *
 * Dedupe is module-level, not a ref, because the same artifact is rendered
 * twice concurrently: once in the chat transcript and once in the Output tab.
 * A per-component ref would fire two identical toasts for one run.
 */
const announced = new Set<string>();

/** Test-only: the Set outlives a render tree, so suites must clear it. */
export function __resetPhiNoticeToasts() {
  announced.clear();
}

export function PhiNoticeToast({
  notice,
  messageId,
}: {
  notice?: string;
  messageId?: string;
}) {
  useEffect(() => {
    const text = notice?.trim();
    if (!text) return;

    // Key on the message when we have one. Falling back to the notice text
    // keeps a streaming artifact with no id yet from toasting on every chunk.
    const key = messageId ?? text;
    if (announced.has(key)) return;
    announced.add(key);

    toast.warning("Our agents found and removed PHI", {
      description:
        "Identifiers were stripped from your request before any search ran. Your report is based on de-identified data.",
      duration: 10000,
    });
  }, [notice, messageId]);

  return null;
}
