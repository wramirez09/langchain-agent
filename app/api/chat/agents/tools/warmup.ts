import { cache, TTL } from "@/lib/cache";
import { embedMany } from "@/lib/embeddings";
import { resolveCmsStateId } from "./cmsStateIds";

// Fire-and-forget cold-start warmup for the Medicare hybrid index. Runs
// once per process at module init (idempotent via cache.has). Targets the
// fetch-then-embed pipeline that dominates a cold p95:
//   - NCD list (national, ~100-200 records)
//   - LCD + LCA list for a small set of top-traffic states
//
// Errors are swallowed so a CMS hiccup doesn't crash the agents route.

const CMS_NCD_API_URL =
  "https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/";
const CMS_LOCAL_LCDS_API_URL =
  "https://api.coverage.cms.gov/v1/reports/local-coverage-final-lcds/";
const CMS_LOCAL_ARTICLES_API_URL =
  "https://api.coverage.cms.gov/v1/reports/local-coverage-articles/";

const WARMUP_STATES = ["California", "Texas", "Florida", "New York"];

async function fetchAndCache(
  url: string,
  cacheKey: string,
): Promise<any[] | null> {
  if (cache.has(cacheKey)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[warmup] ${url} → ${res.status}`);
      return null;
    }
    const data = await res.json();
    cache.set(cacheKey, data, TTL.LONG);
    return Array.isArray(data?.data) ? data.data : null;
  } catch (err) {
    console.warn(`[warmup] fetch failed for ${url}:`, (err as Error).message);
    return null;
  }
}

async function warmEmbeddings(records: any[] | null) {
  if (!records || records.length === 0) return;
  try {
    const titles = records
      .map((r) => `${r.title ?? ""} ${r.document_display_id ?? ""}`.trim())
      .filter((t) => t.length > 0);
    if (titles.length === 0) return;
    await embedMany(titles);
  } catch (err) {
    console.warn(`[warmup] embedding failed:`, (err as Error).message);
  }
}

let warmupStarted = false;

export function startCmsWarmup(): void {
  if (warmupStarted) return;
  warmupStarted = true;

  // Don't block module init. Just kick off the work and let the cache
  // soak it up; first real request will see hits.
  (async () => {
    const t0 = Date.now();
    console.log(`[warmup] starting CMS preload (NCD + ${WARMUP_STATES.length} states)`);

    const ncdRecords = await fetchAndCache(CMS_NCD_API_URL, "cms-ncd-raw-data");
    await warmEmbeddings(ncdRecords);

    for (const stateName of WARMUP_STATES) {
      const stateId = resolveCmsStateId(stateName);
      if (!stateId) continue;
      const lcdRecords = await fetchAndCache(
        `${CMS_LOCAL_LCDS_API_URL}?state_id=${stateId}&status=A`,
        `cms-lcd-raw-data:${stateId}`,
      );
      const lcaRecords = await fetchAndCache(
        `${CMS_LOCAL_ARTICLES_API_URL}?state_id=${stateId}&status=A`,
        `cms-lca-raw-data:${stateId}`,
      );
      // Embeddings are the slow part; serialize per state to avoid a
      // thundering herd against the OpenAI embeddings endpoint at boot.
      await warmEmbeddings(lcdRecords);
      await warmEmbeddings(lcaRecords);
    }

    console.log(`[warmup] CMS preload done in ${Date.now() - t0}ms`);
  })().catch((err) => {
    console.warn(`[warmup] preload failed:`, err);
  });
}
