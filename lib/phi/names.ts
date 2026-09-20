/**
 * Person names -- the hardest category, and the one where over-redaction is
 * as damaging as under-redaction.
 *
 * Two tiers, on purpose:
 *
 *   HARD  -- names we can prove are names from surrounding syntax: an
 *            honorific ("Dr. Reyes"), a credential suffix ("R. Nguyen, MD"),
 *            or a label ("Patient:", "cc:" -- handled in `rules.ts`). These
 *            are redacted outright because the anchor makes them unambiguous.
 *
 *   SOFT  -- a capitalized token in prose that no anchor confirms. NOT
 *            redacted. Reported as a `SoftFlag` for the preview to highlight
 *            and the reviewer to tap.
 *
 * The rejected third option was a census-surname gazetteer sweep. It is
 * untunable in this corpus: the same list that catches "Nguyen" catches
 * Kellgren-Lawrence, Pfirrmann, Meyerding, Goutallier, Risser and Lenke --
 * the grading scales a prior-auth determination is actually made on. Silently
 * deleting those yields a confident wrong answer, which is worse than the
 * privacy risk it was meant to fix. So the gap is closed by a human looking at
 * a highlight, and stated openly rather than papered over.
 */

import type { PhiRule, RawSpan, SoftFlag } from "./types";
import { isClinicalEponym } from "./eponyms";
import { GIVEN_NAMES, SURNAMES } from "./gazetteer";

/**
 * A capitalized name-ish token. Has to cover more than "Firstname":
 *   O'Brien          -- apostrophe immediately after the leading capital
 *   McMurray         -- internal capital
 *   Rodriguez-Lopez  -- hyphenated compound
 * Getting this wrong is not cosmetic: a leading-capital-then-lowercase-only
 * pattern silently fails to redact a whole class of common surnames.
 */
const NAME_TOKEN =
  "[A-Z](?:'[A-Z])?[a-z]+(?:[A-Z][a-z]+)*(?:['-][A-Z]?[a-z]+)*";

/** An initial, with or without the period: "J.", "R". */
const INITIAL = "[A-Z]\\.?";

const HONORIFICS = "Dr|Doctor|Mr|Mrs|Ms|Miss|Prof|Professor";

const HONORIFIC_SET = new Set(
  HONORIFICS.split("|").map((h) => h.toLowerCase()),
);

const CREDENTIALS =
  "M\\.?D\\.?|D\\.?O\\.?|R\\.?N\\.?|N\\.?P\\.?|P\\.?A\\.?-?C?|D\\.?P\\.?M\\.?|D\\.?C\\.?|Ph\\.?D\\.?|L\\.?P\\.?T\\.?|P\\.?T\\.?|O\\.?T\\.?|M\\.?P\\.?H\\.?|F\\.?A\\.?C\\.?S\\.?";

function scanAnchored(text: string, re: RegExp, ruleId: string): RawSpan[] {
  const out: RawSpan[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const prefix = m[1] ?? "";
    const value = m[2] ?? "";
    if (!value.trim()) continue;
    const start = m.index + prefix.length;
    out.push({ start, end: start + value.length, category: "name", ruleId });
  }
  return out;
}

/**
 * "Dr. Reyes", "Dr Anita Reyes", "Mrs. O'Brien". The honorific itself is kept
 * -- it is not an identifier, and dropping it makes the sentence unreadable.
 */
const honorificRule: PhiRule = {
  id: "name-honorific",
  category: "name",
  placeholder: "[NAME]",
  priority: 95,
  find: (t) =>
    scanAnchored(
      t,
      new RegExp(
        "(\\b(?:" +
          HONORIFICS +
          ")\\.?\\s+)((?:" +
          INITIAL +
          "\\s+)?" +
          NAME_TOKEN +
          "(?:\\s+" +
          NAME_TOKEN +
          ")?)",
        "g",
      ),
      "name-honorific",
    ),
};

/**
 * "Robert Nguyen, MD" / "A. Reyes, PA-C". Matched right-to-left from the
 * credential, which is the reliable anchor.
 */
const credentialRule: PhiRule = {
  id: "name-credential",
  category: "name",
  placeholder: "[NAME]",
  priority: 95,
  find: (t) => {
    const re = new RegExp(
      "(^|[\\s(\\[,;:])((?:" +
        INITIAL +
        "\\s+)?" +
        NAME_TOKEN +
        "(?:\\s+(?:" +
        INITIAL +
        "\\s+)?" +
        NAME_TOKEN +
        "){0,2})(?=,\\s*(?:" +
        CREDENTIALS +
        ")\\b)",
      "g",
    );
    return scanAnchored(t, re, "name-credential");
  },
};

/**
 * A given name immediately followed by a surname: "john smith", "Maria
 * Rodriguez", "J. Smith" is handled too via the optional middle initial.
 *
 * This is NOT the bare-token gazetteer sweep rejected above, and the
 * difference is the whole point. A single gazetteer hit is unusable here --
 * Parkinson, Graves, Baker and Smith are all diagnoses. TWO adjacent hits,
 * first name then surname, is a shape that essentially never occurs in
 * clinical prose and is exactly what someone types into a Diagnosis box when
 * they mean the patient. It is also case-insensitive, because a person typing
 * a name into a form types "john smith", and the anchored rules above all
 * assume capitalisation.
 *
 * Either half being a clinical term in context still suppresses the match, so
 * "Graves disease" and "Smith fracture" survive.
 */

/** True when the token, or either half of a hyphenated compound, is a surname. */
function isSurname(token: string): boolean {
  const lower = token.toLowerCase();
  if (SURNAMES.has(lower)) return true;
  const parts = lower.split("-");
  return parts.length > 1 && parts.some((p) => SURNAMES.has(p));
}

const fullNameRule: PhiRule = {
  id: "name-full",
  category: "name",
  placeholder: "[NAME]",
  priority: 94,
  find: (text) => {
    // Tokenise rather than matching pairs with one regex. A pair regex
    // consumes its match and resumes after it, so in "call john smith back"
    // the engine takes "call john", fails, and never tests "john smith" --
    // candidates overlap, and only a token walk sees all of them.
    const tokens: Array<{ text: string; start: number; end: number }> = [];
    for (const m of text.matchAll(/[A-Za-z][A-Za-z'-]*\.?/g)) {
      if (m.index === undefined) continue;
      tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }

    /** Only whitespace between two tokens -- no comma, no newline, no words. */
    const adjacent = (a: { end: number }, b: { start: number }) =>
      /^[ \t]*$/.test(text.slice(a.end, b.start));

    const out: RawSpan[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      const first = tokens[i];
      if (!GIVEN_NAMES.has(first.text.toLowerCase())) continue;

      // Optionally skip a middle initial: "John A. Smith".
      let j = i + 1;
      const isInitial = /^[A-Za-z]\.?$/.test(tokens[j].text);
      if (isInitial && j + 1 < tokens.length) j += 1;
      const last = tokens[j];
      if (!last || last === first) continue;

      // Every step has to be whitespace-separated or this is not one name.
      let contiguous = true;
      for (let k = i; k < j; k++) {
        if (!adjacent(tokens[k], tokens[k + 1])) contiguous = false;
      }
      if (!contiguous) continue;

      const bare = last.text.replace(/\.$/, "");
      if (!isSurname(bare)) continue;

      const after = text.slice(last.end, last.end + 40);
      // "Graves disease", "Smith fracture" -- a clinical qualifier means this
      // is a medical term, not a person.
      if (isClinicalEponym(bare, after)) continue;
      if (isClinicalEponym(first.text, " " + bare)) continue;

      out.push({
        start: first.start,
        end: last.end,
        category: "name",
        ruleId: "name-full",
      });
      i = j; // consume the name so its surname cannot start another pair
    }
    return out;
  },
};

export const NAME_RULES: PhiRule[] = [
  honorificRule,
  credentialRule,
  fullNameRule,
];

/* ------------------------------------------------------------------ */
/* soft flags                                                          */
/* ------------------------------------------------------------------ */

/**
 * Capitalized words that are ordinary clinical vocabulary, section headings,
 * or units -- never a person. Keeps the soft-flag list short enough that the
 * highlights mean something instead of lighting up the whole note.
 */
const CLINICAL_CAPS = new Set(
  [
    "Patient",
    "Pt",
    "History",
    "Exam",
    "Assessment",
    "Plan",
    "Impression",
    "Diagnosis",
    "Dx",
    "Treatment",
    "Medications",
    "Meds",
    "Allergies",
    "Subjective",
    "Objective",
    "Review",
    "Systems",
    "Vitals",
    "Labs",
    "Imaging",
    "Findings",
    "Procedure",
    "Indication",
    "Technique",
    "Complications",
    "Disposition",
    "Recommendation",
    "Recommendations",
    "Chief",
    "Complaint",
    "Present",
    "Illness",
    "Social",
    "Family",
    "Surgical",
    "Past",
    "Medical",
    "Physical",
    "Therapy",
    "Right",
    "Left",
    "Bilateral",
    "Negative",
    "Positive",
    "Normal",
    "Abnormal",
    "Mild",
    "Moderate",
    "Severe",
    "Acute",
    "Chronic",
    "Stable",
    "Improved",
    "Worsening",
    "Denies",
    "Reports",
    "Continue",
    "Discontinue",
    "Start",
    "Refer",
    "Referral",
    "Follow",
    "Return",
    "None",
    "Yes",
    "No",
    "Not",
    "The",
    "This",
    "There",
    "She",
    "He",
    "They",
    "His",
    "Her",
    "Their",
    "MRI",
    "CT",
    "XR",
    "EMG",
    "NCS",
    "PT",
    "OT",
    "NSAIDs",
    "ROM",
    "DJD",
    "DDD",
    "HNP",
    "ACDF",
    "TKA",
    "THA",
    "ORIF",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "Medicare",
    "Medicaid",
    "Aetna",
    "Cigna",
    "Humana",
    "UnitedHealthcare",
    "Anthem",
    "BlueCross",
    "BlueShield",
    "Evolent",
    "Commercial",
    "Coverage",
    "Insurance",
    "Insurer",
    "Payer",
    "Authorization",
    "Auth",
    "Prior",
    "Precert",
    "Precertification",
    "Preauthorization",
    "Group",
    "Policy",
    "Member",
    "Subscriber",
    "Employer",
    "Network",
    "Benefit",
    "Benefits",
    "InterQual",
    "MCG",
  ].map((w) => w.toLowerCase()),
);

/** Grading scales and other eponymous proper nouns worth naming explicitly. */
const GRADING_CAPS = new Set(
  [
    "Kellgren",
    "Lawrence",
    "Pfirrmann",
    "Meyerding",
    "Goutallier",
    "Risser",
    "Lenke",
    "Modic",
    "Schmorl",
    "Garden",
    "Pauwels",
    "Weber",
    "Gustilo",
    "Tonnis",
    "Outerbridge",
    "Hawkins",
    "Neer",
    "Codman",
    "Bankart",
    "Oswestry",
    "Karnofsky",
    "Glasgow",
    "Braden",
    "Morse",
    "Barthel",
  ].map((w) => w.toLowerCase()),
);

/**
 * True when the token is known-safe vocabulary. A hyphenated compound counts
 * as safe only when EVERY part is safe, which is what lets
 * "Kellgren-Lawrence" through as one token while leaving a genuine
 * hyphenated surname alone.
 */
function isAllowedCap(token: string): boolean {
  const lower = token.toLowerCase();
  if (CLINICAL_CAPS.has(lower) || GRADING_CAPS.has(lower)) return true;
  if (HONORIFIC_SET.has(lower)) return true;
  const parts = lower.split("-");
  if (parts.length < 2) return false;
  return parts.every((p) => CLINICAL_CAPS.has(p) || GRADING_CAPS.has(p));
}

/**
 * Report capitalized tokens in prose that might be a person and that no
 * anchored rule already covered. Callers pass the spans already redacted so a
 * token inside one is not flagged twice.
 */
export function findSuspectNames(
  text: string,
  alreadyRedacted: RawSpan[] = [],
): SoftFlag[] {
  const covered = (i: number, j: number) =>
    alreadyRedacted.some((s) => i < s.end && s.start < j);

  const out: SoftFlag[] = [];
  const re = new RegExp("\\b" + NAME_TOKEN + "\\b", "g");

  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const token = m[0];
    const start = m.index;
    const end = start + token.length;
    if (covered(start, end)) continue;

    // Known vocabulary, and the honorific itself, are structure not people.
    if (isAllowedCap(token)) continue;
    // A word acting as a field label ("Email:") is structure too.
    if (/^\s*[:#]/.test(text.slice(end, end + 3))) continue;
    // Sentence-initial words are overwhelmingly not names, and flagging every
    // one of them would make the highlights useless.
    if (
      start === 0 ||
      /[.!?]\s+$/.test(text.slice(Math.max(0, start - 3), start))
    )
      continue;
    if (/^\n/.test(text.slice(Math.max(0, start - 1), start))) continue;
    if (isClinicalEponym(token, text.slice(end, end + 40))) continue;

    out.push({ start, end, text: token, reason: "suspect-name" });
  }
  return out;
}
