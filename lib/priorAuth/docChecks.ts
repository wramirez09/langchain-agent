import type { PartialPriorAuthArtifact } from "@/lib/priorAuth/artifactSchema";

/**
 * Reviewer overrides for the Required Documentation checklist.
 *
 * The artifact's `provided` flags only reflect what the agent inferred from
 * the submitted record; the reviewer can toggle checkboxes in the web render
 * as they gather documents. Overrides are keyed by item content (not index)
 * so the web renderer and the PDF exporter — which parse the same JSON
 * independently — always agree, even while the artifact is still streaming.
 */

/** itemKey → checked. One map per artifact message. */
export type DocCheckMap = Record<string, boolean>;

export function docItemKey(groupTitle?: string, item?: string): string {
  return `${groupTitle ?? ""}::${item ?? ""}`;
}

/**
 * Return a copy of the artifact with reviewer checkbox overrides applied to
 * `requiredDocumentation[].items[].provided`. Items without an override keep
 * the agent-supplied value. No-ops (returns the same reference) when there is
 * nothing to apply.
 */
export function applyDocChecks(
  artifact: PartialPriorAuthArtifact,
  checks?: DocCheckMap | null,
): PartialPriorAuthArtifact {
  if (!checks || Object.keys(checks).length === 0) return artifact;
  const groups = artifact.requiredDocumentation;
  if (!groups || groups.length === 0) return artifact;

  return {
    ...artifact,
    requiredDocumentation: groups.map((g) => {
      if (!g?.items) return g;
      return {
        ...g,
        items: g.items.map((d) => {
          if (!d) return d;
          const key = docItemKey(g.title, d.item);
          return key in checks ? { ...d, provided: checks[key] } : d;
        }),
      };
    }),
  };
}
