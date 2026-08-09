import { reviewArtifact } from '../../reviewArtifact'
import { EMPTY_EVIDENCE } from '../evidence'
import { runChecks, type ArtifactCheck, type ReviewContext } from '../registry'
import { sortIssues, type ReviewIssue } from '../types'
import { goldenEvidence, makeArtifact } from '../../__fixtures__/artifact'

const ctx: ReviewContext = {
  artifact: makeArtifact(),
  evidence: EMPTY_EVIDENCE,
  repairs: [],
}

function issue(over: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    code: 'section-empty',
    severity: 'warning',
    checkId: 'x',
    path: 'limitations',
    label: 'Limitations',
    message: 'msg',
    ...over,
  }
}

const check = (
  id: string,
  run: ArtifactCheck['run'],
  skipReason?: ArtifactCheck['skipReason'],
): ArtifactCheck => ({ id, title: id, run, skipReason })

describe('runChecks — isolation', () => {
  it('keeps a throwing check from taking down the others', async () => {
    const { issues, runs } = await runChecks(ctx, [
      check('boom', () => {
        throw new Error('kaboom')
      }),
      check('fine', () => [issue()]),
    ])

    expect(runs.find((r) => r.id === 'boom')?.status).toBe('error')
    expect(runs.find((r) => r.id === 'boom')?.reason).toBe('kaboom')
    expect(runs.find((r) => r.id === 'fine')?.status).toBe('ok')
    expect(issues).toHaveLength(1)
  })

  it('drops findings from a check that throws, rather than keeping partials', async () => {
    const { issues } = await runChecks(ctx, [
      check('half', () => {
        throw new Error('failed midway')
      }),
    ])
    expect(issues).toEqual([])
  })

  it('times out a hanging check and still resolves', async () => {
    const { issues, runs } = await runChecks(
      ctx,
      [check('hang', () => new Promise<ReviewIssue[]>(() => {})), check('fine', () => [issue()])],
      { timeoutMs: 25 },
    )
    expect(runs.find((r) => r.id === 'hang')?.status).toBe('error')
    expect(runs.find((r) => r.id === 'hang')?.reason).toMatch(/timed out/)
    expect(issues).toHaveLength(1)
  })

  it('records a skip as its own outcome, with a reason', async () => {
    const { runs, issues } = await runChecks(ctx, [
      check(
        'skipme',
        () => [issue()],
        () => 'not-applicable',
      ),
    ])
    expect(runs[0]).toMatchObject({
      id: 'skipme',
      status: 'skipped',
      reason: 'not-applicable',
      issueCount: 0,
    })
    expect(issues).toEqual([])
  })

  it('treats a throwing skipReason as a skip, not a crash', async () => {
    const { runs } = await runChecks(ctx, [
      check(
        'badskip',
        () => [issue()],
        () => {
          throw new Error('nope')
        },
      ),
    ])
    expect(runs[0].status).toBe('skipped')
  })

  it('supports async checks', async () => {
    const { issues } = await runChecks(ctx, [
      check('async', async () => [issue({ path: 'summary' })]),
    ])
    expect(issues).toHaveLength(1)
  })
})

describe('sortIssues', () => {
  it('orders by severity then path, regardless of arrival order', () => {
    const sorted = sortIssues([
      issue({ severity: 'info', path: 'b' }),
      issue({ severity: 'warning', path: 'z' }),
      issue({ severity: 'warning', path: 'a' }),
    ])
    expect(sorted.map((i) => [i.severity, i.path])).toEqual([
      ['warning', 'a'],
      ['warning', 'z'],
      ['info', 'b'],
    ])
  })
})

describe('reviewArtifact', () => {
  const evidence = goldenEvidence()

  it('attaches the review only when mode is "on"', async () => {
    const on = await reviewArtifact(makeArtifact(), evidence, { mode: 'on' })
    expect(on.artifact.review?.v).toBe(1)

    const shadow = await reviewArtifact(makeArtifact(), evidence, { mode: 'shadow' })
    expect(shadow.artifact.review).toBeUndefined()
    // …but the caller still gets it, so flag rates are measurable.
    expect(shadow.review.checks.length).toBeGreaterThan(0)
  })

  it('is a no-op when mode is "off"', async () => {
    const artifact = makeArtifact()
    const out = await reviewArtifact(artifact, evidence, { mode: 'off' })
    expect(out.artifact).toBe(artifact)
    expect(out.review.issues).toEqual([])
    expect(out.review.checks).toEqual([])
  })

  it('raises no defects against a fully grounded artifact', async () => {
    const out = await reviewArtifact(makeArtifact(), evidence, { mode: 'on' })
    expect(out.review.issues.filter((i) => i.severity !== 'info')).toEqual([])
  })

  // The golden artifact leaves suggestedIcd10 empty, so the backfill fills it
  // from the matching guideline. That is a repair, not a defect — but the
  // reader is still told the list came from retrieval rather than the agent.
  it('records a deterministic repair as info-level provenance', async () => {
    const out = await reviewArtifact(makeArtifact(), evidence, { mode: 'on' })
    const repairs = out.review.issues.filter((i) => i.code === 'repair-code-backfill')
    expect(repairs.length).toBeGreaterThan(0)
    expect(repairs.every((r) => r.severity === 'info')).toBe(true)
    expect(out.review.repairs.map((r) => r.path)).toContain(
      'requestOverview.suggestedIcd10',
    )
    expect(out.filled).toContain('requestOverview.suggestedIcd10')
  })

  it('surfaces a dropped section', async () => {
    const out = await reviewArtifact(
      makeArtifact({ medicalNecessityCriteria: [] }),
      evidence,
      { mode: 'on' },
    )
    expect(out.review.issues.map((i) => i.code)).toContain('section-empty')
  })

  // `review` sits inside the envelope the model produces, so a hallucinated
  // one would render as a genuine verdict — including a green badge on an
  // answer nothing checked. It must never survive, in any mode.
  it('discards a review the model supplied', async () => {
    const forged = makeArtifact({
      review: { v: 1, issues: [], checks: [], repairs: [] },
    } as never)

    for (const mode of ['on', 'shadow', 'off'] as const) {
      const out = await reviewArtifact(forged, evidence, { mode })
      if (mode === 'on') {
        // Replaced by ours, which records the checks that actually ran.
        expect(out.artifact.review?.checks?.length).toBeGreaterThan(0)
      } else {
        expect(out.artifact.review).toBeUndefined()
      }
    }
  })

  it('never throws on adversarial input', async () => {
    for (const bad of [null, undefined, {}, { kind: 'x' }, [], 'string']) {
      await expect(
        reviewArtifact(bad as never, evidence, { mode: 'on' }),
      ).resolves.toBeDefined()
    }
  })

  it('survives tool output that is not JSON', async () => {
    const out = await reviewArtifact(
      makeArtifact(),
      [{ name: 'commercial_guidelines_search', content: '<<not json>>' }],
      { mode: 'on' },
    )
    expect(out.review.v).toBe(1)
  })

  it('caps the issue list and reports what it dropped', async () => {
    const noisy: ArtifactCheck = {
      id: 'noisy',
      title: 'noisy',
      run: () =>
        Array.from({ length: 60 }, (_, i) => issue({ path: `limitations[${i}]` })),
    }
    // No tool messages, so no backfill repair adds an issue of its own.
    const out = await reviewArtifact(makeArtifact(), [], {
      mode: 'on',
      checks: [noisy],
    })
    expect(out.review.issues).toHaveLength(50)
    expect(out.review.omittedCount).toBe(10)
  })

  it('truncates an over-long message rather than persisting it whole', async () => {
    const long: ArtifactCheck = {
      id: 'long',
      title: 'long',
      run: () => [issue({ message: 'x'.repeat(500) })],
    }
    const out = await reviewArtifact(makeArtifact(), evidence, {
      mode: 'on',
      checks: [long],
    })
    expect(out.review.issues[0].message.length).toBeLessThanOrEqual(200)
  })
})
