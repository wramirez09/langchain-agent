import {
  FRAME_SENTINEL,
  encodeFrame,
  latestPhase,
  stripControlFrames,
  toolStages,
  type StreamFrame,
} from '../streamFrames'
import { encodeCodePatch } from '../backfillCodes'
import { parseArtifactText } from '../extractArtifact'
import { ARTIFACT_JSON_EXAMPLE } from '../artifactSchema'

const tool = (name: string, status: 'running' | 'done'): StreamFrame => ({
  t: 'tool',
  name,
  status,
})

describe('stripControlFrames', () => {
  it('returns text untouched when there are no frames', () => {
    expect(stripControlFrames('{"a":1}')).toEqual({ body: '{"a":1}', frames: [] })
  })

  it('removes leading frames and recovers them', () => {
    const raw =
      encodeFrame({ t: 'phase', v: 'researching' }) +
      encodeFrame(tool('commercial_guidelines_search', 'running')) +
      '{"kind":"prior-auth-summary"}'

    const { body, frames } = stripControlFrames(raw)
    expect(body).toBe('{"kind":"prior-auth-summary"}')
    expect(frames).toHaveLength(2)
    expect(latestPhase(frames)).toBe('researching')
  })

  it('removes a frame sitting between body chunks', () => {
    const raw = `abc${encodeFrame({ t: 'phase', v: 'reviewing' })}def`
    expect(stripControlFrames(raw).body).toBe('abcdef')
  })

  // Eating real answer text is a worse failure than showing a stray character.
  it('leaves an unrecognized sentinel payload in place', () => {
    const raw = `{"a":1}\n${FRAME_SENTINEL}{"t":"nope","x":1}\n`
    const { body, frames } = stripControlFrames(raw)
    expect(frames).toEqual([])
    expect(body).toContain(FRAME_SENTINEL)
    expect(body).toContain('"t":"nope"')
  })

  it('leaves a half-written frame in place', () => {
    const raw = `{"a":1}\n${FRAME_SENTINEL}{"t":"pha`
    expect(stripControlFrames(raw).frames).toEqual([])
    expect(stripControlFrames(raw).body).toContain('{"t":"pha')
  })

  it('leaves a bare sentinel in prose alone', () => {
    const raw = `some text ${FRAME_SENTINEL} more text`
    expect(stripControlFrames(raw)).toEqual({ body: raw, frames: [] })
  })

  it('does not leave blank runs where frames were', () => {
    const raw = `{"kind":"x"}${encodeFrame({ t: 'phase', v: 'reviewing' })}`
    expect(stripControlFrames(raw).body).toBe('{"kind":"x"}')
  })
})

describe('frame readers', () => {
  it('reports the most recent phase', () => {
    expect(
      latestPhase([
        { t: 'phase', v: 'researching' },
        tool('x', 'done'),
        { t: 'phase', v: 'reviewing' },
      ]),
    ).toBe('reviewing')
  })

  it('collapses tool activity to one entry per tool', () => {
    expect(
      toolStages([tool('a', 'running'), tool('b', 'running'), tool('a', 'done')]),
    ).toEqual([
      { name: 'a', status: 'done' },
      { name: 'b', status: 'running' },
    ])
  })

  it('does not regress a finished tool to running on a second call', () => {
    expect(toolStages([tool('a', 'running'), tool('a', 'done'), tool('a', 'running')])).toEqual(
      [{ name: 'a', status: 'done' }],
    )
  })
})

describe('parseArtifactText — frames and back-compat', () => {
  const golden = ARTIFACT_JSON_EXAMPLE

  it('parses an artifact preceded by control frames', () => {
    const raw = encodeFrame({ t: 'phase', v: 'reviewing' }) + golden
    expect(parseArtifactText(raw)?.kind).toBe('prior-auth-summary')
  })

  // Every message persisted before the server started buffering may carry one
  // of these. Dropping support would silently corrupt history.
  it('still merges a legacy code-patch frame', () => {
    const stripped = JSON.parse(golden)
    stripped.relevantCodes = { cpt: [], icd10: [] }

    const raw =
      JSON.stringify(stripped) +
      encodeCodePatch({
        cpt: [{ code: '73721', label: 'MRI knee' }],
        icd10: [],
        sourceTitle: 'MRI of the Knee',
        sourceProcedures: ['MRI Knee'],
      })

    expect(parseArtifactText(raw)?.relevantCodes?.cpt?.[0]?.code).toBe('73721')
  })

  it('handles a control frame and a legacy patch together', () => {
    const stripped = JSON.parse(golden)
    stripped.relevantCodes = { cpt: [], icd10: [] }

    const raw =
      encodeFrame({ t: 'phase', v: 'researching' }) +
      JSON.stringify(stripped) +
      encodeCodePatch({
        cpt: [{ code: '73721', label: 'MRI knee' }],
        icd10: [],
        sourceTitle: 'MRI of the Knee',
        sourceProcedures: ['MRI Knee'],
      })

    const parsed = parseArtifactText(raw)
    expect(parsed?.kind).toBe('prior-auth-summary')
    expect(parsed?.relevantCodes?.cpt?.[0]?.code).toBe('73721')
  })

  it('still parses a truncated artifact mid-stream', () => {
    const raw = encodeFrame({ t: 'phase', v: 'researching' }) + golden.slice(0, 400)
    expect(parseArtifactText(raw)).not.toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseArtifactText('')).toBeNull()
    expect(parseArtifactText(null)).toBeNull()
  })
})

// Regression: looksLikeArtifact used to run against raw text. Since frames are
// emitted ahead of the answer, it saw `␞…` instead of `{` and reported every
// real report as plain markdown — silently breaking PDF export and saved
// queries, which both gate on it.
describe('looksLikeArtifact — behind control frames', () => {
  const { looksLikeArtifact, extractArtifact } = require('../extractArtifact')
  const framed =
    encodeFrame({ t: 'tool', name: 'commercial_guidelines_search', status: 'running' }) +
    encodeFrame({ t: 'tool', name: 'commercial_guidelines_search', status: 'done' }) +
    ARTIFACT_JSON_EXAMPLE

  it('recognises an artifact preceded by frames', () => {
    expect(looksLikeArtifact(framed)).toBe(true)
  })

  it('extracts it, so PDF export and saved queries still work', () => {
    const got = extractArtifact([{ id: 'm1', role: 'assistant', content: framed }])
    expect(got).not.toBeNull()
    expect(got.artifact.kind).toBe('prior-auth-summary')
  })

  it('still rejects plain prose that arrived behind frames', () => {
    expect(
      looksLikeArtifact(encodeFrame({ t: 'phase', v: 'reviewing' }) + 'Just some text.'),
    ).toBe(false)
  })

  it('rejects a message that is nothing but frames', () => {
    expect(looksLikeArtifact(encodeFrame({ t: 'tool', name: 'x', status: 'done' }))).toBe(
      false,
    )
  })
})
