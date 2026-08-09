/**
 * Out-of-band frames on an in-band channel.
 *
 * The web client uses the AI SDK's `streamMode: "text"`, which has no data
 * protocol — every byte written to the response body lands verbatim in
 * `Message.content`. So progress cannot be sent as metadata; it has to travel
 * in the same stream as the answer and be stripped back out on parse.
 *
 * That was already true of the legacy code-patch frame. This generalizes the
 * mechanism to several frames, in a way that stays safe when a frame is
 * malformed or the stream is cut mid-frame: a sentinel run is only consumed
 * when its payload parses as JSON *and* carries a tag we recognize. Anything
 * else is left in the body untouched, because eating real answer text is a
 * far worse failure than showing a stray control character.
 */

export const FRAME_SENTINEL = '␞'

export type StreamFrame =
  | { t: 'tool'; name: string; status: 'running' | 'done' }
  | { t: 'phase'; v: 'researching' | 'reviewing' }

const FRAME_TAGS = new Set(['tool', 'phase'])

export function encodeFrame(frame: StreamFrame): string {
  return `\n${FRAME_SENTINEL}${JSON.stringify(frame)}\n`
}

function asFrame(payload: string): StreamFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const tag = (parsed as { t?: unknown }).t
  if (typeof tag !== 'string' || !FRAME_TAGS.has(tag)) return null
  return parsed as StreamFrame
}

/**
 * Split control frames out of a raw message body.
 *
 * Must run before `parsePartialJson`, whose `stripToJson` slices to the first
 * `{` — a progress frame emitted ahead of the artifact would otherwise be
 * parsed *as* the artifact. Must also run before `splitCodePatch`, which finds
 * the last sentinel and cannot cope with several.
 *
 * Legacy `{cpt,icd10,…}` patch payloads carry no `t` tag, so they fall through
 * here untouched and are still handled downstream.
 */
export function stripControlFrames(raw: string): {
  body: string
  frames: StreamFrame[]
} {
  if (typeof raw !== 'string' || !raw.includes(FRAME_SENTINEL)) {
    return { body: typeof raw === 'string' ? raw : '', frames: [] }
  }

  const frames: StreamFrame[] = []
  let body = ''
  let i = 0

  while (i < raw.length) {
    const start = raw.indexOf(FRAME_SENTINEL, i)
    if (start === -1) {
      body += raw.slice(i)
      break
    }

    // A frame runs to the next newline, or to the end of the text when the
    // stream was cut mid-frame.
    const nl = raw.indexOf('\n', start)
    const end = nl === -1 ? raw.length : nl
    const frame = asFrame(raw.slice(start + FRAME_SENTINEL.length, end))

    if (!frame) {
      // Not one of ours — a legacy patch payload, a half-written frame, or a
      // stray character in real text. Keep the sentinel and carry on looking
      // after it; eating answer text would be far worse than leaving it.
      body += raw.slice(i, start + FRAME_SENTINEL.length)
      i = start + FRAME_SENTINEL.length
      continue
    }

    frames.push(frame)
    // Drop the frame, the newline that terminated it, and the newline that
    // introduced it, so stripping never leaves blank runs inside the JSON.
    body += raw.slice(i, start).replace(/\n$/, '')
    i = end === raw.length ? raw.length : end + 1
  }

  return { body, frames }
}

/** The most recent phase reported, for a client that wants to label a spinner. */
export function latestPhase(frames: readonly StreamFrame[]): string | undefined {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]
    if (f.t === 'phase') return f.v
  }
  return undefined
}

/**
 * Human labels for the research steps.
 *
 * Deliberately generic. The agent prompt forbids the report from naming tools,
 * payers, or document titles for commercial guidance, and a progress list is
 * still something the user can screenshot — so these describe the *kind* of
 * lookup, never the source.
 */
const TOOL_LABELS: Record<string, string> = {
  commercial_guidelines_search: 'Searching payer guidelines',
  medicare_multi_search: 'Searching Medicare coverage',
  ncd_coverage_search: 'Checking national coverage determinations',
  local_lcd_search: 'Checking local coverage determinations',
  local_coverage_article_search: 'Checking local coverage articles',
  medicare_policy_detail: 'Reading coverage policy details',
  policy_content_extractor: 'Reading policy documents',
  search: 'Searching the web',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? 'Researching'
}

/** Tool activity in arrival order, collapsed to one entry per tool name. */
export function toolStages(
  frames: readonly StreamFrame[],
): { name: string; status: 'running' | 'done' }[] {
  const byName = new Map<string, 'running' | 'done'>()
  for (const f of frames) {
    if (f.t !== 'tool') continue
    // `done` is terminal — a later `running` for the same tool is a second
    // call, and the completed one should not regress in the UI.
    if (byName.get(f.name) === 'done' && f.status === 'running') continue
    byName.set(f.name, f.status)
  }
  return [...byName].map(([name, status]) => ({ name, status }))
}
