// Builds a `code → label` map by scanning the commercial guideline corpus once
// at first use and caching it. Labels are the payer/guideline's own descriptor
// text (see codeLabelExtractor), so they're license-clean and match how each
// guideline cites the code. Used to enrich tool output with human-readable
// code labels that get relayed to the client.

import {
  loadMetadataIndex,
  loadDocumentContent,
} from './commercialGuidelineMetadataIndex'
import {
  extractCodeLabels,
  mergeCodeLabels,
  normalizeCode,
} from './codeLabelExtractor'

let cache: Map<string, string> | null = null

function build(): Map<string, string> {
  const perDoc: Map<string, string>[] = []
  try {
    for (const meta of loadMetadataIndex()) {
      const content = loadDocumentContent(meta.path)
      if (content) perDoc.push(extractCodeLabels(content))
    }
  } catch (err) {
    console.error('[codeLabels] Failed to build label map:', err)
  }
  const merged = mergeCodeLabels(perDoc)
  console.log(`[codeLabels] Indexed ${merged.size} code labels from corpus`)
  return merged
}

/** Lazily build + cache the corpus-wide code-label map. */
export function getCodeLabelMap(): Map<string, string> {
  if (!cache) cache = build()
  return cache
}

/** Look up the descriptor for a single code (normalized). */
export function getCodeLabel(code: string): string | undefined {
  return getCodeLabelMap().get(normalizeCode(code))
}

/**
 * Render a code with its label as "CODE — label", or just the code when no
 * label is known. This is the exact form the client-facing summary uses.
 */
export function labelCode(code: string): string {
  const label = getCodeLabel(code)
  return label ? `${code} — ${label}` : code
}

/** Reset cache (for tests). */
export function resetCodeLabelCache() {
  cache = null
}
