/**
 * Guards the commercial guideline corpus against silent staleness.
 *
 * The corpus the agent searches lives in Supabase, ingested from these files by
 * `yarn ingest:commercial`. Nothing at runtime notices when the two diverge:
 * the search RPC happily returns whatever was ingested last, so an edited or
 * added guideline simply never reaches an answer. That is exactly what happened
 * to `muscle/cervical-laminectomy.md` — added 2026-06-01, still absent from the
 * index ten weeks later, while cervical requests were answered from the lumbar
 * and fusion documents instead.
 *
 * This test fails when the working tree no longer matches the manifest written
 * by the last ingest. The fix is always the same: run `yarn ingest:commercial`
 * and commit the regenerated manifest.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "app", "api", "data");
const MANIFEST_PATH = path.join(DATA_DIR, "corpus-manifest.json");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

describe("commercial guideline corpus", () => {
  it("matches the manifest from the last ingest", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as {
      files: Record<string, string>;
    };

    const onDisk: Record<string, string> = {};
    for (const file of walk(DATA_DIR).sort()) {
      const rel = path.relative(DATA_DIR, file).replace(/\\/g, "/");
      onDisk[rel] = crypto
        .createHash("sha256")
        .update(fs.readFileSync(file))
        .digest("hex");
    }

    const added = Object.keys(onDisk).filter((f) => !(f in manifest.files));
    const removed = Object.keys(manifest.files).filter((f) => !(f in onDisk));
    const changed = Object.keys(onDisk).filter(
      (f) => f in manifest.files && manifest.files[f] !== onDisk[f],
    );

    const drift = [
      ...added.map((f) => `  added:   ${f}`),
      ...changed.map((f) => `  changed: ${f}`),
      ...removed.map((f) => `  removed: ${f}`),
    ];

    expect(
      drift.length === 0
        ? ""
        : [
            "Corpus files differ from the last ingest, so the search index is stale:",
            ...drift,
            "Run `yarn ingest:commercial` and commit app/api/data/corpus-manifest.json.",
          ].join("\n"),
    ).toBe("");
  });
});
