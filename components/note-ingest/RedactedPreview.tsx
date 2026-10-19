import React from "react";
import type { PhiSpan, RedactionResult } from "@/lib/phi/types";

/**
 * Renders the de-identified note with every removed span called out.
 *
 * It renders from the SPANS, not by scanning the output for "[NAME]" — the
 * spans already carry the category and the exact range, so there is no second
 * parse to drift out of sync with the first. Note the spans are offsets into
 * the ORIGINAL text, so walking them means slicing the original and emitting a
 * chip wherever one lands.
 *
 * What it must never do is render `span.original`. That is the identifier.
 */

const CATEGORY_LABEL: Record<string, string> = {
  name: "name",
  date: "date",
  age90: "age 90+",
  phone: "phone",
  email: "email",
  ssn: "SSN",
  mrn: "MRN",
  account: "ID",
  address: "address",
  geo: "location",
  zip: "ZIP",
  facility: "facility",
  url: "URL",
  ip: "IP",
  device: "device",
};

function Chip({ span }: { span: PhiSpan }) {
  return (
    <mark
      data-testid="redaction-chip"
      data-category={span.category}
      title={`${CATEGORY_LABEL[span.category] ?? span.category} removed`}
      className="rounded border border-warning/40 bg-warning/15 px-1 py-[1px] font-medium text-warning [font-variant:small-caps]"
    >
      {CATEGORY_LABEL[span.category] ?? "removed"}
    </mark>
  );
}

export function RedactedPreview({
  original,
  result,
}: {
  /** The normalized text the spans are offsets into. */
  original: string;
  result: RedactionResult;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  result.spans.forEach((span, i) => {
    if (span.start > cursor) {
      parts.push(
        <React.Fragment key={`t${i}`}>
          {original.slice(cursor, span.start)}
        </React.Fragment>,
      );
    }
    parts.push(<Chip key={`s${i}`} span={span} />);
    cursor = span.end;
  });
  if (cursor < original.length) {
    parts.push(
      <React.Fragment key="tail">{original.slice(cursor)}</React.Fragment>,
    );
  }

  return (
    <div
      data-testid="redacted-preview"
      className="max-h-[38vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-3 text-[13px] leading-[1.6] text-foreground [overflow-wrap:anywhere]"
    >
      {parts.length > 0 ? parts : original}
    </div>
  );
}

/** "14 identifiers removed — 3 names, 2 dates, 1 MRN". */
export function RedactionSummary({ result }: { result: RedactionResult }) {
  const entries = Object.entries(result.counts).filter(([, n]) => n > 0);
  const noun = result.total === 1 ? "identifier" : "identifiers";

  return (
    <p className="text-[13px] text-muted-foreground">
      <strong className="font-semibold text-foreground">
        {result.total} {noun} removed
      </strong>
      {entries.length > 0 ? (
        <>
          {" — "}
          {entries.map(([c, n]) => `${n} ${CATEGORY_LABEL[c] ?? c}`).join(", ")}
        </>
      ) : null}
    </p>
  );
}
