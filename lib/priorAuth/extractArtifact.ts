import { type Message } from "ai";
import { parsePartialJson } from "@/lib/priorAuth/partialJson";
import {
  ARTIFACT_KIND,
  priorAuthArtifactSchema,
  type PartialPriorAuthArtifact,
} from "@/lib/priorAuth/artifactSchema";
import {
  backfillArtifactCodes,
  splitCodePatch,
} from "@/lib/priorAuth/backfillCodes";
import { stripControlFrames } from "@/lib/priorAuth/streamFrames";

/**
 * Cheap heuristic to decide whether an assistant message is (or is becoming) a
 * PriorAuthArtifact JSON object vs. a plain text/markdown message.
 *
 * Strips control frames first. The server emits progress frames *ahead* of the
 * answer, so a live message starts with `␞…` rather than `{`, and every caller
 * that skipped this step would conclude a perfectly good report was plain
 * markdown. Doing it here rather than at each call site is what keeps that from
 * being a mistake anyone can make again.
 */
export function looksLikeArtifact(content: string): boolean {
  if (typeof content !== "string") return false;
  const t = stripControlFrames(content).body.trimStart();
  if (!t) return false;
  if (!t.startsWith("{") && !t.startsWith("```")) return false;
  return (
    t.includes(ARTIFACT_KIND) ||
    t.includes('"kind"') ||
    t.includes('"requestOverview"') ||
    t.includes('"medicalNecessityCriteria"')
  );
}

/**
 * AI SDK 3 spreads streamed text across `message.content` (often only the
 * first chunk) and `message.parts` (the full accumulated stream as one or
 * more text parts). Take the longer of the two so we always pick up the
 * complete text regardless of which field the SDK populated fully.
 */
export function messageText(message: Message): string {
  const contentText =
    typeof message.content === "string" ? message.content : "";

  const parts = (
    message as Message & { parts?: Array<{ type: string; text?: string }> }
  ).parts;
  const partsText = Array.isArray(parts)
    ? parts
        .filter((p) => p && p.type === "text" && typeof p.text === "string")
        .map((p) => p.text!)
        .join("\n")
    : "";

  return partsText.length > contentText.length ? partsText : contentText;
}

/**
 * The single text → artifact parse. Every surface goes through it — streaming
 * renderer, PDF export, saved queries, history replay — so they cannot disagree
 * about what a stored message means. Use this instead of `parsePartialJson`
 * wherever an assistant message is turned into an artifact.
 *
 * Four steps, in an order that matters:
 *
 *  1. strip control frames — must be first, because `parsePartialJson` slices
 *     to the first `{` and would otherwise parse a progress frame *as* the
 *     artifact, and because `splitCodePatch` looks for the last sentinel and
 *     cannot cope with several.
 *  2. split the legacy code-patch frame — no longer emitted, but present on
 *     every message persisted before the server started buffering. Removing
 *     this would silently corrupt history.
 *  3. parse, tolerating a truncated tail mid-stream.
 *  4. merge the legacy patch when there was one.
 *
 * Stays synchronous and pure: this runs inside a React render.
 */
export function parseArtifactText(
  raw: string | undefined | null,
): PartialPriorAuthArtifact | null {
  if (!raw) return null;
  const { body: framed } = stripControlFrames(raw);
  const { body, codes } = splitCodePatch(framed);
  const parsed = parsePartialJson<PartialPriorAuthArtifact>(body);
  if (!parsed || typeof parsed !== "object") return null;
  return codes ? backfillArtifactCodes(parsed, codes).artifact : parsed;
}

export interface ExtractedArtifact {
  artifact: PartialPriorAuthArtifact;
  /** id of the assistant message the artifact was parsed from */
  messageId: string;
  /** true when the full zod schema validates (stream finished cleanly) */
  complete: boolean;
}

/**
 * Pull the prior-auth artifact out of a conversation, if the latest assistant
 * message is one. Tolerates partial/truncated JSON (the PDF renders whatever
 * sections are present, same as the streaming web renderer) — `complete`
 * reports whether the full schema validated.
 */
export function extractArtifact(
  messages: Message[],
): ExtractedArtifact | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;

    const text = messageText(m);
    if (!text || !looksLikeArtifact(text)) return null;

    const parsed = parseArtifactText(text);
    if (!parsed) return null;

    // Accept once the discriminator (or a signature section) has streamed in.
    const isArtifact =
      parsed.kind === ARTIFACT_KIND ||
      "requestOverview" in parsed ||
      "medicalNecessityCriteria" in parsed;
    if (!isArtifact) return null;

    return {
      artifact: parsed,
      messageId: m.id,
      complete: priorAuthArtifactSchema.safeParse(parsed).success,
    };
  }
  return null;
}
