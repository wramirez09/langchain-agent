/*
 * Retrieval accuracy over a fixed set of known-item queries.
 *
 * Each case is a realistic request plus the document that should answer it.
 * The ranking is what decides whether an answer can be right at all: the agent
 * reproduces criteria from what it is handed, so a request that retrieves the
 * lumbar document cannot produce cervical thresholds no matter how good the
 * prompt is. That is the failure this set is built to catch — several cases are
 * deliberately paired against a confusable sibling (cervical vs lumbar
 * laminectomy, decompression vs fusion, knee vs hip arthroplasty, calcium
 * scoring vs general cardiac imaging).
 *
 * `accept` lists every document that would be a defensible top hit; the first
 * entry is the ideal one. Cases where two documents genuinely both apply carry
 * more than one.
 *
 * Run: yarn eval:retrieval
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.development.local" });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedQuery } from "../lib/embeddings";

interface Case {
  /** How a provider would phrase it, in the form the agent passes to the tool. */
  query: string;
  /** Acceptable top hits, best first. */
  accept: string[];
}

const CASES: Case[] = [
  // --- spine: the family that regressed --------------------------------
  { query: "cervical laminectomy C3 to C5 for cervical spinal stenosis with myelopathy", accept: ["muscle-cervical-laminectomy"] },
  { query: "C2-C5 laminectomy neck pain", accept: ["muscle-cervical-laminectomy"] },
  { query: "lumbar laminectomy L4-L5 for lumbar spinal stenosis with neurogenic claudication", accept: ["muscle-lumbar-laminectomy"] },
  { query: "anterior cervical discectomy and fusion C5-C6 for cervical radiculopathy", accept: ["muscle-anterior-cervical-discectomy-fusion"] },
  { query: "lumbar microdiscectomy for herniated disc with radiculopathy", accept: ["muscle-lumbar-discectomy"] },
  { query: "lumbar fusion L4-L5 for degenerative spondylolisthesis", accept: ["muscle-lumbar-fusion"] },
  // --- interventional pain ---------------------------------------------
  { query: "lumbar epidural steroid injection for radicular pain", accept: ["muscle-epidural-steroid-injection"] },
  { query: "cervical facet joint injection for axial neck pain", accept: ["muscle-facet-joint-injection"] },
  { query: "radiofrequency ablation of lumbar facet medial branch nerves", accept: ["muscle-facet-radiofrequency-ablation"] },
  { query: "sacroiliac joint injection for SI joint pain", accept: ["muscle-sacroiliac-joint-injection"] },
  { query: "spinal cord stimulator trial for failed back surgery syndrome", accept: ["muscle-spinal-cord-stimulation"] },
  // --- large joints ------------------------------------------------------
  { query: "total knee arthroplasty for end-stage knee osteoarthritis", accept: ["muscle-total-knee-arthroplasty", "muscle-msk-large-joint-surgery"] },
  { query: "total hip arthroplasty for severe hip osteoarthritis", accept: ["muscle-total-hip-arthroplasty", "muscle-msk-large-joint-surgery"] },
  { query: "total shoulder arthroplasty for glenohumeral osteoarthritis", accept: ["muscle-total-shoulder-arthroplasty", "muscle-msk-large-joint-surgery"] },
  // --- cardiology --------------------------------------------------------
  { query: "coronary artery calcium score for hyperlipidemia risk stratification", accept: ["cardio-coronary-calcium-scoring"] },
  { query: "transcatheter aortic valve replacement for severe aortic stenosis", accept: ["cardio-transcatheter-aortic-valve-replacement"] },
  { query: "carotid endarterectomy for symptomatic 70 percent carotid stenosis", accept: ["cardio-carotid-endarterectomy"] },
  { query: "carotid artery stenting for carotid stenosis", accept: ["cardio-carotid-artery-stenting", "cardio-carotid-endarterectomy"] },
  { query: "implantable cardioverter defibrillator for primary prevention with ejection fraction 30 percent", accept: ["cardio-cardio-defibrillators"] },
  { query: "myocardial perfusion imaging stress test for chest pain", accept: ["cardio-myocardial-perfusion-imaging"] },
  { query: "catheter ablation for symptomatic atrial fibrillation", accept: ["cardio-afib", "cardio-electrophysiology"] },
  { query: "permanent pacemaker implantation for symptomatic bradycardia", accept: ["cardio-pacemaker"] },
  // --- imaging -----------------------------------------------------------
  { query: "MRI lumbar spine for low back pain with radiculopathy", accept: ["imaging-spine", "ev-advanced-imaging-guidelines-2025"] },
  { query: "MRI brain for new onset headache", accept: ["imaging-brain"] },
  { query: "CT paranasal sinuses for chronic sinusitis", accept: ["imaging-head-and-neck"] },
  { query: "MRI knee for suspected meniscal tear", accept: ["imaging-extremities"] },
  // --- genetics ----------------------------------------------------------
  { query: "BRCA1 and BRCA2 genetic testing with family history of breast cancer", accept: ["genetic-inherited-cancer-testing", "genetic-genetic-testing"] },
  { query: "prenatal cell-free DNA screening for aneuploidy", accept: ["genetic-prenatal-testing"] },
  { query: "pharmacogenomic testing before starting an antidepressant", accept: ["genetic-pharmacogenomic-testing"] },
  // --- sleep / oncology --------------------------------------------------
  { query: "home sleep apnea test for suspected obstructive sleep apnea", accept: ["ev-sleep-study-guidelines-2025", "sleep", "imaging-surgery-cardiac-sleep-proton-sleep"] },
  { query: "proton beam therapy for pediatric central nervous system tumor", accept: ["oncology-proton-beam-therapy", "ev-clinical-guideline-7001-proton-beam-radiation-2025", "imaging-surgery-cardiac-sleep-proton-proton-beam-radiation"] },
];

async function rank(query: string): Promise<{ id: string; title: string; score: number }[]> {
  const vec = await embedQuery(query);
  const { data, error } = await supabaseAdmin.rpc("search_commercial_guidelines", {
    q_text: query,
    q_embedding: Array.from(vec),
    q_cpt: [],
    q_icd10: [],
    q_domain: null,
    max_results: 5,
  });
  if (error) throw new Error(`RPC failed: ${error.message}`);
  return (data ?? []) as { id: string; title: string; score: number }[];
}

async function main() {
  let top1 = 0;
  let top3 = 0;
  const misses: string[] = [];

  for (const c of CASES) {
    const hits = await rank(c.query);
    const ids = hits.map((h) => h.id);
    const at1 = c.accept.includes(ids[0]);
    const at3 = ids.slice(0, 3).some((id) => c.accept.includes(id));
    if (at1) top1++;
    if (at3) top3++;
    if (!at1) {
      misses.push(
        [
          `  ✗ ${c.query}`,
          `      want: ${c.accept.join(" | ")}`,
          `      got:  ${ids.slice(0, 3).join(", ") || "(nothing)"}`,
        ].join("\n"),
      );
    }
  }

  const pct = (n: number) => ((n / CASES.length) * 100).toFixed(1);
  console.log(`\nRetrieval accuracy over ${CASES.length} known-item queries`);
  console.log(`  top-1: ${top1}/${CASES.length}  (${pct(top1)}%)`);
  console.log(`  top-3: ${top3}/${CASES.length}  (${pct(top3)}%)`);
  if (misses.length) {
    console.log(`\nMisses (not ranked first):`);
    console.log(misses.join("\n"));
  }
  console.log("");
  // Non-zero exit on a top-1 regression makes this usable as a gate.
  // Explicit exit: the Redis-backed embedding cache holds an open handle, so
  // the process would otherwise sit there after the report is printed.
  process.exit(top1 < CASES.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
