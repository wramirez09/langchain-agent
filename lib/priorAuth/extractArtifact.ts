import { type Message } from "ai";
import { parsePartialJson } from "@/lib/priorAuth/partialJson";
import {
  ARTIFACT_KIND,
  priorAuthArtifactSchema,
  type PartialPriorAuthArtifact,
} from "@/lib/priorAuth/artifactSchema";

/**
 * Cheap heuristic to decide whether an assistant message is (or is becoming) a
 * PriorAuthArtifact JSON object vs. a plain text/markdown message.
 */
export function looksLikeArtifact(content: string): boolean {
  const t = content.trimStart();
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

    const parsed = parsePartialJson<PartialPriorAuthArtifact>(text);
    if (!parsed || typeof parsed !== "object") return null;

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
