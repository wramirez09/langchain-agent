import type {
  CriterionStatus,
  PartialPriorAuthArtifact,
} from "./artifactSchema";

/**
 * The model sometimes writes its own wording for a criterion's status
 * ("Met", "partially_met", "covered"), which the schema rejects and the review
 * flags as "Not one of the allowed values." Map near-misses to the nearest
 * allowed value and anything else to "unknown" — an unrecognised label must
 * never be read as "met".
 */
const ALIASES: Record<string, CriterionStatus> = {
  met: "met",
  yes: "met",
  satisfied: "met",
  covered: "met",
  not_met: "not_met",
  notmet: "not_met",
  unmet: "not_met",
  no: "not_met",
  not_satisfied: "not_met",
  not_covered: "not_met",
  unknown: "unknown",
};

export function normalizeStatus(value: unknown): CriterionStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return "unknown";
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ALIASES[key] ?? "unknown";
}

type CriterionLike = { status?: unknown; subCriteria?: unknown };

function normalizeList(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const c of list as CriterionLike[]) {
    if (!c || typeof c !== "object") continue;
    if (c.status !== undefined) {
      const next = normalizeStatus(c.status);
      if (next !== c.status) {
        console.warn("[Review] normalized criterion status", {
          from: String(c.status).slice(0, 40),
          to: next,
        });
        c.status = next;
      }
    }
    normalizeList(c.subCriteria);
  }
}

/** Returns a copy; the input is not mutated. */
export function normalizeCriterionStatuses<T extends PartialPriorAuthArtifact>(
  artifact: T,
): T {
  // JSON round-trip, not structuredClone: the artifact is parsed JSON, and
  // jsdom test environments have no structuredClone.
  const copy = JSON.parse(JSON.stringify(artifact)) as T;
  normalizeList(copy.medicalNecessityCriteria);
  if (Array.isArray(copy.medicarePolicies)) {
    for (const p of copy.medicarePolicies) normalizeList(p?.criteria);
  }
  return copy;
}
