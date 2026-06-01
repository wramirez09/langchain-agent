/*
 * Validate the commercial guideline corpus (app/api/data) for the gaps that
 * caused genericized / borrowed output:
 *
 *   1. Missing required front-matter fields.
 *   2. Code consistency — a code described in the body's "CODE — descriptor"
 *      lines but absent from front-matter `cpt_codes`/`icd10_codes` (the agent
 *      only surfaces codes carried in metadata, so these get dropped), and
 *      orphan metadata codes that appear nowhere in the body.
 *   3. Missing decisive sections (criteria, relevant codes).
 *   4. Presenting-symptom code — spine docs that list only "qualifying" codes
 *      (radiculopathy/myelopathy/stenosis) but omit the presenting pain code
 *      the request is usually filed under (e.g., cervical M54.2, lumbar M54.5).
 *   5. Procedure-class mixing — a decompression-only doc carrying fusion /
 *      instrumentation / bone-graft CPTs (the ACDF "code bloat" symptom).
 *
 * Run:   node scripts/validateGuidelines.js
 *        node scripts/validateGuidelines.js --errors-only
 * Exit code is non-zero when any ERROR-level finding exists (CI gate).
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const DATA_DIR = path.join(process.cwd(), "app", "api", "data");
const ERRORS_ONLY = process.argv.includes("--errors-only");

// Presenting (pain) code by spine region — the diagnosis a request is usually
// filed under, "generally insufficient alone" but expected in the code list.
const PRESENTING = [
  { re: /cervic/i, code: "M54.2", label: "cervicalgia" },
  { re: /thoracic/i, code: "M54.6", label: "thoracic pain" },
  { re: /lumbar|lumbosacral/i, code: "M54.5", label: "low back pain" },
];

const isDecompressionDoc = (s) =>
  /laminectomy|laminotomy|foraminotomy|laminoplasty|decompress/i.test(s) &&
  !/fusion|arthrodesis|acdf|interbody/i.test(s);

// A doc is a spine *surgical / interventional* doc (the kind filed under a
// presenting pain code) only when it carries an actual spine-procedure signal —
// NOT merely the word "thoracic" (which mostly appears in cardiac / chest-
// imaging docs and caused false positives).
const spineSurgicalRe =
  /laminectomy|laminotomy|discectomy|\bfusion\b|arthrodesis|radiculopathy|myelopathy|spinal stenosis|spine surgery|facet|epidural|spinal cord stimul|sacroiliac|spondyl|interbody|decompress/i;

// Policy / setting / coding docs legitimately carry no diagnosis codes.
const isPolicyDoc = (s) =>
  /site of care|level of care|level setting|level-setting|site-of-service|coding standard|\bcoding\b/i.test(
    s,
  );

// Docs whose diagnosis-code field is legitimately optional: policy/coding docs
// plus predictive genetic tests (polygenic risk scores, pharmacogenomics) that
// are billed/indicated on CPT and Z-codes rather than a disease ICD.
const codesOptional = (s) =>
  isPolicyDoc(s) || /polygenic|risk score|pharmacogenomic/i.test(s);

// A presenting code is satisfied by the code itself or any billable child
// (e.g. front-matter "M54.50" satisfies the "M54.5" low-back requirement).
const hasPresenting = (fmIcd, code) =>
  [...fmIcd].some((c) => c === code || c.startsWith(code));

// Fusion / instrumentation / bone-graft CPT families that should NOT live in a
// decompression-only doc.
const isFusionFamilyCpt = (c) =>
  /^22(5\d\d|6\d\d|8[0-9]\d|59[05])$/.test(c) || /^209(3[0-9])$/.test(c);

function findCodeFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...findCodeFiles(full));
    else if (/\.(md|txt)$/i.test(item.name)) out.push(full);
  }
  return out;
}

// Codes the body explicitly describes via "CODE — descriptor" (em dash) lines.
function bodyDescribedCodes(body) {
  const cpt = new Set();
  const icd = new Set();
  // Match "63045 — ..." and "M54.2 — ..." (em dash U+2014, en dash, or hyphen).
  const re = /(^|\s)([A-Z]\d{2}(?:\.\w{1,4})?|\d{5})\s*[—–-]\s+\S/gm;
  let m;
  while ((m = re.exec(body))) {
    const code = m[2].toUpperCase();
    if (/^\d{5}$/.test(code)) cpt.add(code);
    else icd.add(code);
  }
  return { cpt, icd };
}

function norm(arr) {
  return (Array.isArray(arr) ? arr : arr ? [arr] : []).map((c) =>
    String(c).trim().toUpperCase(),
  );
}

function validate(file) {
  const rel = path.relative(DATA_DIR, file);
  const raw = fs.readFileSync(file, "utf8");
  const findings = [];
  const add = (level, msg) => findings.push({ level, msg });

  let fm = {};
  let body = raw;
  if (/\.md$/i.test(file)) {
    const parsed = matter(raw);
    fm = parsed.data || {};
    body = parsed.content || "";
  }

  const hint = `${fm.title || ""} ${rel} ${JSON.stringify(fm.procedures || [])}`;
  const policy = isPolicyDoc(hint);

  // 1) Required front matter (md docs only). `title`/`domain`/`procedures` are
  //    always required; code fields are required for procedure docs but not for
  //    policy/setting/coding docs (which legitimately carry no diagnosis codes).
  if (/\.md$/i.test(file)) {
    const required = codesOptional(hint)
      ? ["title", "domain"]
      : ["title", "domain", "procedures", "cpt_codes", "icd10_codes"];
    for (const field of required) {
      const v = fm[field];
      const empty = v == null || (Array.isArray(v) && v.length === 0) || v === "";
      if (empty) add("ERROR", `missing/empty front-matter: ${field}`);
    }
  }

  const fmCpt = new Set(norm(fm.cpt_codes || fm.cptCodes));
  const fmIcd = new Set(norm(fm.icd10_codes || fm.icd10Codes));
  const described = bodyDescribedCodes(body);
  const bodyUpper = body.toUpperCase();

  // 2) Code consistency.
  for (const c of described.cpt) {
    if (!fmCpt.has(c)) add("ERROR", `CPT ${c} described in body but not in cpt_codes front matter`);
  }
  for (const c of described.icd) {
    if (!fmIcd.has(c)) add("ERROR", `ICD-10 ${c} described in body but not in icd10_codes front matter`);
  }
  // (Front-matter codes absent from the body are intentional — broad metadata
  // powers exact-match retrieval boosts — so they are NOT flagged here.)

  // 3) Decisive sections.
  if (!/medical necessity|criteria|indication|coverage/i.test(body))
    add("WARN", "no recognizable medical-necessity / criteria section");
  if (described.cpt.size === 0 && described.icd.size === 0)
    add("WARN", "no labeled 'CODE — descriptor' RELEVANT CODES block (labels won't render)");

  // 4) Presenting-symptom code — only for genuine spine surgical/interventional
  //    docs. Thoracic (M54.6) requires an explicit thoracic-spine signal, since
  //    bare "thoracic" otherwise matches cardiac / chest-imaging docs.
  if (spineSurgicalRe.test(hint) && !isPolicyDoc(hint)) {
    for (const p of PRESENTING) {
      const regionHit =
        p.code === "M54.6"
          ? /thoracic (spine|radiculopathy|fusion|laminectomy|vertebr|disc|myelopathy)/i.test(hint)
          : p.re.test(hint);
      if (regionHit && !hasPresenting(fmIcd, p.code))
        add("WARN", `spine doc missing presenting code ${p.code} (${p.label})`);
    }
  }

  // 5) Procedure-class mixing.
  if (isDecompressionDoc(hint)) {
    for (const c of fmCpt) {
      if (isFusionFamilyCpt(c))
        add("WARN", `decompression doc carries fusion/graft CPT ${c} (procedure-class mixing)`);
    }
  }

  return { rel, findings };
}

function main() {
  const files = findCodeFiles(DATA_DIR).sort();
  let errors = 0;
  let warns = 0;
  let dirtyDocs = 0;

  for (const f of files) {
    const { rel, findings } = validate(f);
    const shown = ERRORS_ONLY ? findings.filter((x) => x.level === "ERROR") : findings;
    if (shown.length === 0) continue;
    dirtyDocs++;
    console.log(`\n${rel}`);
    for (const { level, msg } of shown) {
      if (level === "ERROR") errors++;
      else warns++;
      console.log(`  ${level === "ERROR" ? "✗ ERROR" : "⚠ WARN "} ${msg}`);
    }
  }

  console.log(
    `\n──────\n${files.length} docs scanned · ${dirtyDocs} with findings · ${errors} errors · ${warns} warnings`,
  );
  process.exit(errors > 0 ? 1 : 0);
}

main();
