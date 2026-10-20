/**
 * De-identify a request the user typed before it leaves the browser.
 *
 * The note-ingest path redacts an uploaded note, but the PA form and the chat
 * box used to send their text verbatim -- only the "Your request" card was
 * redacted, so a name typed into History was hidden on screen and still
 * reached the model. This is the same `redactPhi` pass, applied at the last
 * point before `chat.append`.
 *
 * It uses the model-bound rules, not `redactPhiForDisplay`: a soft-flagged
 * capitalised word may be "Parkinson" the diagnosis, and removing it from the
 * request changes the determination.
 */

import { normalizeNoteText } from "./normalize";
import { redactPhi } from "./redact";
import type { PhiCategory, RedactionResult } from "./types";

export interface OutgoingRedaction {
  /** The text to send. Unchanged (not even normalised) when nothing matched. */
  text: string;
  result: RedactionResult;
}

export function redactOutgoing(text: string): OutgoingRedaction {
  const result = redactPhi(normalizeNoteText(text));
  return { text: result.total > 0 ? result.redacted : text, result };
}

/** The message shape `runAgent` accepts: Vercel `content` or `parts`. */
interface IncomingMessage {
  role: string;
  content?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
}

export interface ServerRedaction<M> {
  messages: M[];
  /** Identifiers removed, by category. Counts only -- safe to log. */
  counts: Partial<Record<PhiCategory, number>>;
  total: number;
}

function messageText(m: IncomingMessage): string {
  if (typeof m.content === "string" && m.content !== "") return m.content;
  if (!Array.isArray(m.parts)) return "";
  return m.parts
    .filter((p) => p?.type === "text")
    .map((p) => p?.text ?? "")
    .join("\n");
}

/**
 * Server-side counterpart to the browser pass. The web client already
 * redacts, but the public API, MCP, and anything that bypasses the client
 * arrive raw, so `runAgent` runs every USER turn through the same rules
 * before the history reaches the model or `chat_messages`. It never rejects:
 * the request continues with the redacted text.
 *
 * Assistant turns are left alone. They are the model's own earlier output,
 * full of guideline dates and eponyms the date and name rules would mangle.
 */
export function redactUserMessages<M extends IncomingMessage>(
  messages: M[],
): ServerRedaction<M> {
  const counts: Partial<Record<PhiCategory, number>> = {};
  let total = 0;
  const out = messages.map((m) => {
    if (m.role !== "user") return m;
    const { text, result } = redactOutgoing(messageText(m));
    if (result.total === 0) return m;
    total += result.total;
    for (const [k, n] of Object.entries(result.counts)) {
      const c = k as PhiCategory;
      counts[c] = (counts[c] ?? 0) + (n ?? 0);
    }
    // `content` wins over `parts` downstream; drop parts so no raw copy rides along.
    return { ...m, content: text, parts: undefined };
  });
  return { messages: out, counts, total };
}
