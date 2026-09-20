/**
 * The clinical-eponym problem.
 *
 * Person-name detection has to lean on a gazetteer of common US given names
 * and surnames, because no regex finds names reliably. But clinical language is
 * full of people's names used as medical terms -- "Parkinson's disease",
 * "Baker's cyst", "Smith fracture" -- and a gazetteer that redacts those
 * destroys the diagnosis, which is the single most important field in a prior
 * auth screening. Over-redaction is not "safe" here: it produces a confidently
 * wrong determination instead of a private one.
 *
 * So suppression is decided by CONTEXT, not by the token alone, in two tiers:
 *
 *   ALWAYS  -- tokens that are essentially never a patient's surname in a US
 *              clinical note (Dupuytren, Osgood, Colles, Raynaud). Allowed
 *              wherever they appear, including bare ("h/o Dupuytren").
 *
 *   IN_USE  -- tokens that are common surnames AND eponyms (Smith, Baker,
 *              Bell, Jones, Hunter). Allowed only when followed by a clinical
 *              qualifier, so "Smith fracture" survives while "Jane Smith" is
 *              still redacted.
 *
 * Anything not in either list is left to the name rules. Source stays pure
 * ASCII and lookups are diacritic-folded, so "Sjogren" and the accented
 * spelling both resolve.
 */

// Combining diacritical marks (U+0300..U+036F), built numerically so this file
// needs no non-ASCII characters. See the same note in `normalize.ts`.
const COMBINING = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g",
);

/** Lowercase, strip accents, drop trailing possessive. */
export function foldToken(token: string): string {
  return token
    .normalize("NFD")
    .replace(COMBINING, "")
    .toLowerCase()
    .replace(/'s$/, "")
    .replace(/[^a-z-]/g, "");
}

/**
 * Eponyms that are not realistically a patient or provider surname in this
 * corpus. Allowed unconditionally.
 */
const ALWAYS = new Set(
  [
    "alzheimer",
    "parkinson",
    "huntington",
    "creutzfeldt",
    "guillain",
    "barre",
    "charcot",
    "raynaud",
    "sjogren",
    "behcet",
    "takayasu",
    "wegener",
    "churg",
    "ehlers",
    "danlos",
    "marfan",
    "hodgkin",
    "crohn",
    "hirschsprung",
    "dupuytren",
    "peyronie",
    "ledderhose",
    "osgood",
    "schlatter",
    "scheuermann",
    "perthes",
    "kienbock",
    "freiberg",
    "kohler",
    "panner",
    "sever",
    "haglund",
    "bunnell",
    "lisfranc",
    "chopart",
    "monteggia",
    "galeazzi",
    "bankart",
    "hillsachs",
    "salter",
    "colles",
    "rolando",
    "maisonneuve",
    "tillaux",
    "segond",
    "pilon",
    "hangman",
    "odontoid",
    "spondylolisthesis",
    "schmorl",
    "modic",
    "pfirrmann",
    "tinel",
    "phalen",
    "finkelstein",
    "froment",
    "lachman",
    "mcmurray",
    "spurling",
    "hoffmann",
    "babinski",
    "romberg",
    "brudzinski",
    "kernig",
    "trendelenburg",
    "homans",
    "neer",
    "yergason",
    "speed",
    "apley",
    "thessaly",
    "ober",
    "gaenslen",
    "faber",
    "fadir",
    "adson",
    "roos",
    "tinels",
    "achilles",
    "eustachian",
    "fallopian",
    "langerhans",
    "purkinje",
    "schwann",
    "wernicke",
    "broca",
    "haversian",
    "volkmann",
    "sharpey",
    "gerdy",
    "hill-sachs",
  ].map(foldToken),
);

/**
 * Common surnames that are also eponyms. Allowed only in clinical use.
 */
const IN_USE = new Set(
  [
    "smith",
    "baker",
    "bell",
    "jones",
    "hunter",
    "ross",
    "graves",
    "paget",
    "whipple",
    "mallory",
    "weiss",
    "wilson",
    "barrett",
    "cushing",
    "addison",
    "gilbert",
    "barton",
    "pott",
    "hill",
    "sachs",
    "harris",
    "allen",
    "moore",
    "boxer",
    "burton",
    "dupuy",
    "stevens",
    "johnson",
    "reiter",
    "still",
    "little",
    "west",
    "brown",
    "sequard",
    "horner",
    "bishop",
    "murphy",
    "mcburney",
    "rovsing",
    "cullen",
    "grey",
    "turner",
    "battle",
    "hutchinson",
    "russell",
    "bryant",
    "buck",
    "denis",
    "meyerding",
    "garden",
    "pauwels",
    "weber",
    "danis",
    "mason",
    "goutallier",
    "neviaser",
    "codman",
    "neumann",
    "king",
    "lenke",
    "risser",
    "jakob",
    "marie",
    "tooth",
    "strauss",
    "morton",
    "bennett",
    "jefferson",
    "chance",
    "hawkins",
    "obrien",
    "thomas",
    "patrick",
    "willis",
    "cooper",
    "lister",
    "listers",
  ].map(foldToken),
);

/**
 * Words that mark a name as a medical term rather than a person. Matched
 * against the text immediately following the candidate token, after an
 * optional possessive.
 */
const QUALIFIERS = [
  "disease",
  "diseases",
  "syndrome",
  "syndromes",
  "sign",
  "signs",
  "test",
  "tests",
  "testing",
  "maneuver",
  "manoeuvre",
  "procedure",
  "operation",
  "classification",
  "criteria",
  "criterion",
  "grade",
  "grading",
  "stage",
  "staging",
  "score",
  "scoring",
  "index",
  "scale",
  "type",
  "fracture",
  "fractures",
  "dislocation",
  "lesion",
  "lesions",
  "deformity",
  "deformities",
  "contracture",
  "contractures",
  "cyst",
  "cysts",
  "node",
  "nodes",
  "nodule",
  "palsy",
  "paralysis",
  "neuroma",
  "bursitis",
  "tendinitis",
  "tendinopathy",
  "exostosis",
  "spur",
  "ligament",
  "tendon",
  "canal",
  "angle",
  "line",
  "view",
  "position",
  "approach",
  "incision",
  "repair",
  "technique",
  "reflex",
  "phenomenon",
  "variant",
  "tumor",
  "tumour",
  "lymphoma",
  "carcinoma",
  "sarcoma",
  "anemia",
  "anaemia",
  "arthritis",
  "fasciitis",
  "tear",
  "tears",
  "notch",
  "tubercle",
  "fossa",
  "plate",
  "band",
];

const QUALIFIER_RE = new RegExp(
  "^\\s*(?:'s|s')?\\s*(?:" + QUALIFIERS.join("|") + ")\\b",
  "i",
);

/**
 * True when `token` at this position is a medical term and must NOT be
 * redacted as a person's name.
 *
 * @param token     the candidate name token, e.g. "Smith"
 * @param following the text immediately after it; only the first few words
 *                  matter, so callers may pass a short slice
 */
export function isClinicalEponym(token: string, following: string): boolean {
  const folded = foldToken(token);
  if (!folded) return false;
  if (ALWAYS.has(folded)) return true;
  if (IN_USE.has(folded)) return QUALIFIER_RE.test(following);
  return false;
}

/** Exposed for tests and for the preview UI's "why was this kept?" tooltip. */
export const __eponymSets = { ALWAYS, IN_USE, QUALIFIERS };
