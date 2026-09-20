import React from "react";
import { cn } from "@/utils/cn";

// The PA form serializes its inputs into a single labeled string (see
// PriorAuthView.handleGenerateAuth):
//   "Guidelines: X. State: Y. Treatment: Z. CPT/HCPCS : .... Diagnosis: ...
//    History: ... Relevant Medical History: ..."
// with any free-text question appended after " | ". We reverse that here so the
// user's request renders as separated, labeled fields mirroring the agent's
// Request Overview card — instead of one opaque run-on sentence.

type FieldDef = { key: string; label: string; re: RegExp; full?: boolean };

// Order doesn't matter for matching (each regex is matched independently), but
// `full` controls whether a field spans both grid columns.
const FIELD_DEFS: FieldDef[] = [
  { key: "guidelines", label: "Guidelines", re: /Guidelines\s*:/ },
  { key: "state", label: "State", re: /State\s*:/ },
  { key: "treatment", label: "Treatment", re: /Treatment\s*:/, full: true },
  { key: "diagnosis", label: "Diagnosis", re: /Diagnosis\s*:/, full: true },
  { key: "cpt", label: "CPT / HCPCS", re: /CPT\s*\/\s*HCPCS\s*:/ },
  // Negative lookbehind so the "History:" inside "Relevant Medical History:" is
  // not mistaken for the standalone History field.
  {
    key: "relevantHistory",
    label: "Relevant Medical History",
    re: /Relevant Medical History\s*:/,
    full: true,
  },
  {
    key: "history",
    label: "History",
    re: /(?<!Relevant Medical )History\s*:/,
    full: true,
  },
  // Emitted by the de-identified-note intake (lib/phi + /api/notes/extract),
  // never by the form. Rendering it here is what makes the attestation
  // durable: it rides along into the saved query and the PDF export rather
  // than living only on the upload screen the clinician already left.
  {
    key: "deidentification",
    label: "De-identification",
    re: /De-identification\s*:/,
    full: true,
  },
];

type ParsedField = { label: string; value: string; full?: boolean };

function parseRequest(raw: string): {
  fields: ParsedField[];
  notes: string | null;
} {
  const content = (raw ?? "").trim();
  if (!content) return { fields: [], notes: null };

  // Split the serialized form part from any trailing free-text question.
  const sepIdx = content.indexOf(" | ");
  const formPart = sepIdx >= 0 ? content.slice(0, sepIdx) : content;
  const notes: string | null =
    sepIdx >= 0 ? content.slice(sepIdx + 3).trim() || null : null;

  // Locate each known label within the form part.
  const markers = FIELD_DEFS.map((def) => {
    const m = def.re.exec(formPart);
    return m ? { def, start: m.index, end: m.index + m[0].length } : null;
  }).filter(Boolean) as { def: FieldDef; start: number; end: number }[];

  // No recognizable labels → this is a plain free-text message; surface it whole.
  if (markers.length === 0) {
    return { fields: [], notes: content };
  }

  markers.sort((a, b) => a.start - b.start);

  const fields = markers
    .map((mk, i) => {
      const valueEnd =
        i + 1 < markers.length ? markers[i + 1].start : formPart.length;
      // Strip the trailing ". " separator that joined entries.
      const value = formPart
        .slice(mk.end, valueEnd)
        .trim()
        .replace(/[.\s]+$/, "")
        .trim();
      return { label: mk.def.label, value, full: mk.def.full };
    })
    .filter((f) => f.value);

  return { fields, notes };
}

/** Shimmer stand-in for a value that is still being checked. */
function ValueBar({ w }: { w: string }) {
  return (
    <div
      className="h-[15px] animate-pulse rounded bg-gradient-to-r from-muted via-border to-muted bg-[length:200%_100%]"
      style={{ width: w }}
    />
  );
}

function Field({
  k,
  v,
  full,
}: {
  k: string;
  v: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("min-w-0", full && "sm:col-span-2")}>
      <div className="mb-1 text-[12.5px] font-semibold text-muted-foreground">
        {k}
      </div>
      <div className="text-[15px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
        {v}
      </div>
    </div>
  );
}

export function UserRequestFields({
  content,
  pending = false,
}: {
  content: string;
  /**
   * True while the request is being screened for identifiers.
   *
   * This card echoes back exactly what the user typed, and what they type is
   * the highest-risk text in the product -- the Diagnosis and History fields
   * invite free text, and people put patient names in them. Holding the values
   * behind a shimmer until the check has run means the one surface that
   * reliably displays PHI is not doing so while we are still deciding whether
   * it is PHI. The labels stay visible, so the card keeps its shape and the
   * user can see their request was received.
   */
  pending?: boolean;
}) {
  const { fields, notes } = parseRequest(content);

  if (pending && fields.length > 0) {
    return (
      <div
        data-testid="request-phi-check"
        className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2"
      >
        {fields.map((f, i) => (
          <Field
            key={f.label}
            k={f.label}
            full={f.full}
            v={<ValueBar w={`${[72, 58, 84, 64][i % 4]}%`} />}
          />
        ))}
      </div>
    );
  }

  // Fallback: a message with no structured fields (e.g. a typed follow-up
  // question) renders as plain text rather than an empty grid.
  if (fields.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-[15px] leading-[1.55] text-foreground-soft [overflow-wrap:anywhere]">
        {notes ?? content}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
      {fields.map((f) => (
        <Field key={f.label} k={f.label} v={f.value} full={f.full} />
      ))}
      {notes ? <Field full k="Additional Notes" v={notes} /> : null}
    </div>
  );
}
