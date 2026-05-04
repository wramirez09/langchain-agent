import { cache, TTL } from "@/lib/cache";
import { ExtractedPolicyDetails } from "./policyDetailTypes";

/**
 * Client for the CMS Coverage API (api.coverage.cms.gov).
 *
 * Verified live against the API:
 *   - License token: GET /v1/metadata/license-agreement → data[0].Token
 *     (no expiry field returned; assumed ~1h validity).
 *   - NCD detail:    /v1/data/ncd?ncdid={id}&ncdver={ver}        — no auth
 *   - LCD detail:    /v1/data/lcd?lcdid={id}&ver={ver}           — Bearer
 *   - Article:       /v1/data/article?articleid={id}&ver={ver}   — Bearer
 *
 * NCD responses are text-heavy and HTML-encoded (`&lt;p&gt;…`); they don't
 * carry structured code lists. LCD responses are richer (diagnoses_support,
 * doc_reqs, etc.). Article responses carry coverage text in `description`
 * and `cms_cov_policy` only — no separate code-list endpoint exists, so
 * codes are regex-extracted from the body text. The mapper produces the
 * shared ExtractedPolicyDetails wire shape regardless of source.
 */

const CMS_API_BASE = "https://api.coverage.cms.gov/v1";
const LICENSE_PATH = "/metadata/license-agreement";
const FETCH_TIMEOUT_MS = 30_000;
// Refresh ahead of stated expiry so an in-flight request never gets caught
// with a token that expires server-side mid-call.
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
// Default token lifetime: the API does not return an expiry; CMS
// documentation states ~1h. We refresh on 401 too, so this is a soft
// upper bound.
const TOKEN_DEFAULT_TTL_MS = 60 * 60 * 1000;

interface LicenseTokenState {
  token: string;
  expiresAt: number;
}

let cachedToken: LicenseTokenState | null = null;
// Dedupe concurrent token requests so a burst of cold requests doesn't
// stampede /metadata/license-agreement.
let inflightTokenPromise: Promise<string> | null = null;

function nowMs(): number {
  return Date.now();
}

function tokenStillValid(state: LicenseTokenState | null): state is LicenseTokenState {
  return !!state && state.expiresAt - TOKEN_EXPIRY_BUFFER_MS > nowMs();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestNewLicenseToken(): Promise<string> {
  const url = `${CMS_API_BASE}${LICENSE_PATH}`;
  console.log(`[CmsCoverageApiClient] Requesting new license token from ${url}`);
  const start = nowMs();
  const res = await fetchWithTimeout(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(
      `License-agreement fetch failed: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const body = await res.json();

  // Verified shape: { meta, data: [ { Token: "..." } ] }
  const token: string | undefined =
    body?.data?.[0]?.Token ?? body?.data?.Token ?? body?.token;
  if (!token || typeof token !== "string") {
    throw new Error(
      `License-agreement response missing Token field; data shape=${JSON.stringify(
        body?.data,
      ).slice(0, 120)}`,
    );
  }

  cachedToken = { token, expiresAt: nowMs() + TOKEN_DEFAULT_TTL_MS };
  console.log(
    `[CmsCoverageApiClient] License token cached, default TTL ${(
      TOKEN_DEFAULT_TTL_MS / 1000
    ).toFixed(0)}s, fetch took ${nowMs() - start}ms`,
  );
  return token;
}

async function getLicenseToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenStillValid(cachedToken)) {
    return cachedToken.token;
  }
  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }
  inflightTokenPromise = (async () => {
    try {
      return await requestNewLicenseToken();
    } finally {
      inflightTokenPromise = null;
    }
  })();
  return inflightTokenPromise;
}

/* ----------------------------------------------------------------------
 * Text helpers — CMS responses are HTML-entity-encoded (&lt;, &amp;, etc.)
 * --------------------------------------------------------------------*/

function decodeHtmlEntities(s: string): string {
  if (!s) return "";
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&sol;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(s: string): string {
  return decodeHtmlEntities(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParagraphs(s: string): string[] {
  if (!s) return [];
  // Split on </p>, sentences, or newlines; produce trimmed non-empty entries.
  return s
    .split(/<\/p>|\n|\r/i)
    .map((p) => stripHtml(p))
    .filter((p) => p.length > 20);
}

const ICD10_REGEX = /\b[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?\b/g;
const CPT_REGEX = /\b\d{5}\b|\b[A-Z]\d{4}\b/g;

interface CodeEntry {
  code: string;
  description: string;
  context: string;
}

function extractCodesFromText(text: string, context: string, regex: RegExp): CodeEntry[] {
  const seen = new Set<string>();
  const out: CodeEntry[] = [];
  const matches = text.match(regex) ?? [];
  for (const code of matches) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, description: "", context });
  }
  return out;
}

/* ----------------------------------------------------------------------
 * NCD mapper
 * --------------------------------------------------------------------*/

function mapNcd(payload: any): ExtractedPolicyDetails {
  const data = payload?.data?.[0] ?? payload?.data ?? payload;
  const indications = stripHtml(data?.indications_limitations ?? "");
  const itemDesc = stripHtml(data?.item_service_description ?? "");
  const denial = stripHtml(data?.reasons_for_denial ?? "");
  const otherText = stripHtml(data?.other_text ?? "");

  const criteriaPool = [
    ...splitParagraphs(data?.indications_limitations ?? ""),
    ...splitParagraphs(data?.item_service_description ?? ""),
  ];
  const limitations = [
    ...splitParagraphs(data?.reasons_for_denial ?? ""),
    ...splitParagraphs(data?.other_text ?? ""),
  ];

  const summary =
    [data?.title, itemDesc.slice(0, 400)].filter(Boolean).join(" — ") ||
    indications.slice(0, 400) ||
    "No summary available from CMS API.";

  const haystack = `${data?.title ?? ""} ${indications} ${itemDesc} ${denial}`;
  return {
    priorAuthRequired: detectPriorAuth(haystack),
    medicalNecessityCriteria: criteriaPool.slice(0, 30),
    icd10Codes: extractCodesFromText(haystack, "from NCD text", ICD10_REGEX),
    cptCodes: extractCodesFromText(haystack, "from NCD text", CPT_REGEX),
    requiredDocumentation: [],
    limitationsExclusions: limitations.slice(0, 30),
    summary,
  };
}

/* ----------------------------------------------------------------------
 * LCD mapper
 * --------------------------------------------------------------------*/

function mapLcd(payload: any): ExtractedPolicyDetails {
  const data = payload?.data?.[0] ?? payload?.data ?? payload;

  const indication = stripHtml(data?.indication ?? "");
  const supportText = stripHtml(data?.diagnoses_support ?? "");
  const dontSupportText = stripHtml(data?.diagnoses_dont_support ?? "");
  const codingGuidelines = stripHtml(data?.coding_guidelines ?? "");
  const docReqs = stripHtml(data?.doc_reqs ?? "");
  const utilGuide = stripHtml(data?.util_guide ?? "");
  const cmsCovPolicy = stripHtml(data?.cms_cov_policy ?? "");

  const criteria = [
    ...splitParagraphs(data?.indication ?? ""),
    ...splitParagraphs(data?.cms_cov_policy ?? ""),
  ];

  const documentation = [
    ...splitParagraphs(data?.doc_reqs ?? ""),
    ...splitParagraphs(data?.util_guide ?? ""),
  ];

  const limitations = splitParagraphs(data?.diagnoses_dont_support ?? "");

  const icd10 = [
    ...extractCodesFromText(supportText, "supports medical necessity", ICD10_REGEX),
    ...extractCodesFromText(
      dontSupportText,
      "does not support medical necessity",
      ICD10_REGEX,
    ),
  ];
  const cpt = extractCodesFromText(
    `${codingGuidelines} ${indication}`,
    "covered procedure code",
    CPT_REGEX,
  );

  const summary =
    [data?.title, indication.slice(0, 400)].filter(Boolean).join(" — ") ||
    cmsCovPolicy.slice(0, 400) ||
    "No summary available from CMS API.";

  return {
    priorAuthRequired: detectPriorAuth(
      `${indication} ${docReqs} ${cmsCovPolicy}`,
    ),
    medicalNecessityCriteria: criteria.slice(0, 30),
    icd10Codes: icd10,
    cptCodes: cpt,
    requiredDocumentation: documentation.slice(0, 30),
    limitationsExclusions: limitations.slice(0, 30),
    summary,
  };
}

/* ----------------------------------------------------------------------
 * Article mapper — Articles are billing/coding-focused; field names
 * mirror LCD where applicable but include cpt_hcpcs and icd10 sections.
 * --------------------------------------------------------------------*/

function mapArticle(payload: any): ExtractedPolicyDetails {
  const data = payload?.data?.[0] ?? payload?.data ?? payload;

  // Verified live against /v1/data/article: the response carries `description`,
  // `cms_cov_policy`, `add_icd10_info`, `other_comments`, `revenue_para` —
  // there is no `article_text`/`text`/`coding_information` field. The earlier
  // mapper read fields that don't exist and silently produced empty arrays.
  const description = stripHtml(data?.description ?? "");
  const covPolicy = stripHtml(data?.cms_cov_policy ?? "");
  const addIcd10 = stripHtml(data?.add_icd10_info ?? "");
  const otherComments = stripHtml(data?.other_comments ?? "");
  const revenue = stripHtml(data?.revenue_para ?? "");

  const criteria = [
    ...splitParagraphs(data?.description ?? ""),
    ...splitParagraphs(data?.cms_cov_policy ?? ""),
  ];
  const limitations = splitParagraphs(data?.other_comments ?? "");

  const haystack = `${description} ${covPolicy} ${addIcd10} ${otherComments} ${revenue}`;
  const icd10 = extractCodesFromText(haystack, "from article", ICD10_REGEX);
  const cpt = extractCodesFromText(haystack, "from article", CPT_REGEX);

  const summary =
    [data?.title, description.slice(0, 400)].filter(Boolean).join(" — ") ||
    covPolicy.slice(0, 400) ||
    "No summary available from CMS API.";

  return {
    priorAuthRequired: detectPriorAuth(haystack),
    medicalNecessityCriteria: criteria.slice(0, 30),
    icd10Codes: icd10,
    cptCodes: cpt,
    requiredDocumentation: [],
    limitationsExclusions: limitations.slice(0, 30),
    summary,
  };
}

function detectPriorAuth(
  text: string,
): ExtractedPolicyDetails["priorAuthRequired"] {
  const t = text.toLowerCase();
  const explicitNo =
    /\bno\s+prior\s+auth(?:orization)?\s+(?:is\s+)?required\b/.test(t);
  if (explicitNo) return "NO";
  const requires =
    /\b(prior\s*auth(?:orization)?|precertification|pre-?cert|pre-?approval)\b[^.]{0,80}\b(required|mandatory|must)\b/.test(
      t,
    );
  if (requires) return "YES";
  const conditional = /\b(may\s+require|in\s+some\s+cases|under\s+certain)\b/.test(t);
  if (conditional) return "CONDITIONAL";
  return "UNKNOWN";
}

/* ----------------------------------------------------------------------
 * Document fetchers
 * --------------------------------------------------------------------*/

type DocumentType = "ncd" | "lcd" | "article";

interface EndpointSpec {
  pathPrefix: string;
  idParam: string;
  versionParam: string;
  requiresAuth: boolean;
  mapper: (payload: any) => ExtractedPolicyDetails;
}

const ENDPOINTS: Record<DocumentType, EndpointSpec> = {
  ncd: {
    pathPrefix: "/data/ncd",
    idParam: "ncdid",
    versionParam: "ncdver",
    requiresAuth: false,
    mapper: mapNcd,
  },
  lcd: {
    pathPrefix: "/data/lcd",
    idParam: "lcdid",
    versionParam: "ver",
    requiresAuth: true,
    mapper: mapLcd,
  },
  article: {
    pathPrefix: "/data/article",
    idParam: "articleid",
    versionParam: "ver",
    requiresAuth: true,
    mapper: mapArticle,
  },
};

function detailCacheKey(
  type: DocumentType,
  id: string,
  version: number,
): string {
  return `cms-detail:${type}:${id}:${version}`;
}

async function fetchDetail(
  type: DocumentType,
  documentId: string,
  documentVersion: number,
): Promise<ExtractedPolicyDetails> {
  const spec = ENDPOINTS[type];
  const cacheKey = detailCacheKey(type, documentId, documentVersion);
  const cached = cache.get<ExtractedPolicyDetails>(cacheKey);
  if (cached) {
    console.log(`[CmsCoverageApiClient] Cache hit ${cacheKey}`);
    return cached;
  }

  const start = nowMs();
  const url = `${CMS_API_BASE}${spec.pathPrefix}?${spec.idParam}=${encodeURIComponent(
    documentId,
  )}&${spec.versionParam}=${encodeURIComponent(String(documentVersion))}`;

  const doRequest = async (token?: string): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetchWithTimeout(url, { method: "GET", headers });
  };

  let token: string | undefined;
  if (spec.requiresAuth) token = await getLicenseToken();

  let res = await doRequest(token);
  if (res.status === 401 && spec.requiresAuth) {
    console.warn(
      `[CmsCoverageApiClient] 401 on ${type} ${documentId}, refreshing token`,
    );
    token = await getLicenseToken(true);
    res = await doRequest(token);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  const payload = await res.json();
  if (
    payload?.meta?.status?.id &&
    payload.meta.status.id >= 400
  ) {
    throw new Error(
      `CMS API error ${payload.meta.status.id}: ${payload.meta.status.message}`,
    );
  }
  if (!Array.isArray(payload?.data) || payload.data.length === 0) {
    throw new Error(
      `CMS API returned no data for ${type} ${documentId} v${documentVersion}`,
    );
  }

  const mapped = spec.mapper(payload);
  console.log(
    `[CmsCoverageApiClient] Fetched ${type} ${documentId} v${documentVersion} in ${
      nowMs() - start
    }ms (icd10=${mapped.icd10Codes.length} cpt=${mapped.cptCodes.length} criteria=${mapped.medicalNecessityCriteria.length})`,
  );
  cache.set(cacheKey, mapped, TTL.LONG);
  return mapped;
}

export const cmsCoverageApiClient = {
  fetchNcd(documentId: string, documentVersion: number) {
    return fetchDetail("ncd", documentId, documentVersion);
  },
  fetchLcd(documentId: string, documentVersion: number) {
    return fetchDetail("lcd", documentId, documentVersion);
  },
  fetchArticle(documentId: string, documentVersion: number) {
    return fetchDetail("article", documentId, documentVersion);
  },
  // Exposed for tests only.
  _resetForTest() {
    cachedToken = null;
    inflightTokenPromise = null;
  },
};

export type { DocumentType };
