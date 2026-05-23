/*
 * Ingest the on-disk commercial guideline corpus into Supabase.
 *
 * Walks app/api/data/{cardio,imaging,oncology,muscle,sleep,...}, parses
 * front matter via gray-matter, extracts CPT/ICD-10 codes from the body,
 * embeds (title \n\n treatment \n\n body[0:8000]) with
 * text-embedding-3-small (batches of 100), and upserts each doc into
 * public.commercial_guidelines by `id`.
 *
 * Run:   yarn ts-node scripts/ingestCommercialGuidelines.ts
 *        (or `yarn ingest:commercial` once package.json is wired)
 *
 * Idempotent — re-running rewrites embeddings + body for every doc.
 */
// Load Next.js-style env files in priority order. The first one that
// exists wins; later imports are no-ops via dotenv's default behavior.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.development.local" });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import fs from "fs";
import path from "path";
import crypto from "crypto";
import matter from "gray-matter";

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { embedMany } from "../lib/embeddings";
import {
  extractCPTCodes,
  extractICD10Codes,
} from "../app/api/chat/agents/tools/utils/commercialGuidelineTypes";

const DATA_DIR = path.join(process.cwd(), "app", "api", "data");
const BATCH = 100;

interface ParsedDoc {
  id: string;
  title: string;
  domain: string | null;
  treatment: string | null;
  body: string;
  cptCodes: string[];
  icd10Codes: string[];
  specialty: string[];
  procedures: string[];
  aliases: string[];
  relatedConditions: string[];
  payerNotes: Record<string, string> | null;
  priority: string | null;
  sourcePath: string;
}

function slugFromPath(filePath: string): string {
  // Stable, human-readable slug. Falls back to a hash if the relative
  // path produces an empty/illegal slug.
  const rel = path.relative(DATA_DIR, filePath).replace(/\\/g, "/");
  const slug = rel
    .replace(/\.(md|txt)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    return crypto.createHash("md5").update(filePath).digest("hex").slice(0, 12);
  }
  return slug;
}

function asArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function inferTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.(md|txt)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function parseFile(filePath: string): ParsedDoc {
  const raw = fs.readFileSync(filePath, "utf8");
  const isMarkdown = /\.md$/i.test(filePath);
  const parsed = isMarkdown ? matter(raw) : { data: {}, content: raw };
  const fm = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content ?? raw;

  const folderName = path.basename(path.dirname(filePath));
  const fileName = path.basename(filePath);

  const fmCpt = asArray(fm.cpt_codes ?? fm.cptCodes);
  const fmIcd = asArray(fm.icd10_codes ?? fm.icd10Codes);
  const cptCodes = Array.from(new Set([...fmCpt, ...extractCPTCodes(body)]));
  const icd10Codes = Array.from(
    new Set([...fmIcd, ...extractICD10Codes(body)].map((c) => c.toUpperCase())),
  );

  const payerNotesRaw = fm.payerNotes ?? fm.payer_notes;
  const payerNotes =
    payerNotesRaw && typeof payerNotesRaw === "object" && !Array.isArray(payerNotesRaw)
      ? (payerNotesRaw as Record<string, string>)
      : null;

  return {
    id: slugFromPath(filePath),
    title: (fm.title as string) || inferTitleFromFilename(fileName),
    domain:
      (fm.domain as string) ||
      (folderName.startsWith("plaintext") ? folderName.replace("plaintext", "") : folderName),
    treatment: (fm.treatment as string) || null,
    body,
    cptCodes,
    icd10Codes,
    specialty: asArray(fm.specialty),
    procedures: asArray(fm.procedures),
    aliases: asArray(fm.aliases),
    relatedConditions: asArray(fm.relatedConditions ?? fm.related_conditions),
    payerNotes,
    priority: (fm.priority as string) || null,
    sourcePath: filePath,
  };
}

function embeddingText(d: ParsedDoc): string {
  // Title carries the most signal at retrieval time; treatment + body
  // give synonyms and context. Cap body to keep tokens reasonable.
  const head = [d.title, d.treatment ?? "", d.aliases.join(", ")]
    .filter(Boolean)
    .join("\n");
  return `${head}\n\n${d.body.slice(0, 8000)}`.trim();
}

async function main() {
  console.log(`[ingest] Scanning ${DATA_DIR}`);
  const files = walk(DATA_DIR);
  console.log(`[ingest] Found ${files.length} files`);

  const docs = files.map(parseFile);

  // Dedup by id (in case slug collisions ever occur)
  const seen = new Set<string>();
  const unique = docs.filter((d) => {
    if (seen.has(d.id)) {
      console.warn(`[ingest] Duplicate id "${d.id}" from ${d.sourcePath} — skipping`);
      return false;
    }
    seen.add(d.id);
    return true;
  });

  console.log(`[ingest] Embedding ${unique.length} docs (batch=${BATCH})`);
  const allVectors: number[][] = new Array(unique.length);
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const vectors = await embedMany(slice.map(embeddingText));
    for (let j = 0; j < slice.length; j++) {
      allVectors[i + j] = Array.from(vectors[j]);
    }
    console.log(`[ingest]   embedded ${Math.min(i + BATCH, unique.length)}/${unique.length}`);
  }

  // Upsert in chunks. pgvector accepts a string literal '[0.1,0.2,...]'
  // via supabase-js; the supabase client serializes number[] correctly as
  // long as the column is typed `vector(1536)`.
  const rows = unique.map((d, idx) => ({
    id: d.id,
    title: d.title,
    domain: d.domain,
    treatment: d.treatment,
    body: d.body,
    cpt_codes: d.cptCodes,
    icd10_codes: d.icd10Codes,
    specialty: d.specialty,
    procedures: d.procedures,
    aliases: d.aliases,
    related_conditions: d.relatedConditions,
    payer_notes: d.payerNotes,
    priority: d.priority,
    source_path: d.sourcePath,
    embedding: allVectors[idx],
  }));

  console.log(`[ingest] Upserting ${rows.length} rows`);
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabaseAdmin
      .from("commercial_guidelines")
      .upsert(chunk, { onConflict: "id" });
    if (error) {
      console.error(`[ingest] Upsert error at row ${i}:`, error);
      process.exitCode = 1;
      return;
    }
  }

  // Refresh planner stats so the new HNSW + GIN indexes get used immediately.
  const { error: analyzeErr } = await supabaseAdmin.rpc("exec_sql", {
    sql: "analyze public.commercial_guidelines;",
  });
  if (analyzeErr) {
    // Most projects don't expose exec_sql via RPC — non-fatal, just log.
    console.warn(`[ingest] Skipped ANALYZE (no exec_sql RPC): ${analyzeErr.message}`);
  }

  console.log(`[ingest] Done. ${rows.length} docs ingested.`);
}

main().catch((err) => {
  console.error("[ingest] Fatal:", err);
  process.exit(1);
});
