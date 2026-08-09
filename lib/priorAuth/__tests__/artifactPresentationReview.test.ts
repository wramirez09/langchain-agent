import {
  REVIEW_SEVERITY_TONE,
  issueChipLabel,
  issuesForPath,
  issuesForSection,
  reviewBannerSummary,
  skipReasonLabel,
  unrunChecks,
} from '../artifactPresentation'
import type { ArtifactReview, ReviewIssue } from '../review/types'

function issue(over: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    code: 'code-not-in-evidence',
    severity: 'warning',
    checkId: 'code-grounding',
    path: 'relevantCodes.cpt[0].code',
    sectionId: 'codes',
    label: 'Relevant Codes → CPT / HCPCS',
    message: 'This code does not appear in any retrieved source.',
    ...over,
  }
}

function review(over: Partial<ArtifactReview> = {}): ArtifactReview {
  return { v: 1, issues: [], checks: [], repairs: [], ...over }
}

describe('reviewBannerSummary', () => {
  // An artifact written before the gate shipped has no review; claiming its
  // checks passed would be a lie.
  it('returns null for an un-reviewed artifact', () => {
    expect(reviewBannerSummary(undefined)).toBeNull()
  })

  it('reports a clean review as passed', () => {
    const s = reviewBannerSummary(
      review({ checks: [{ id: 'structural-completeness', status: 'ok', issueCount: 0 }] }),
    )!
    expect(s.clean).toBe(true)
    expect(s.tone).toBe('green')
  })

  // An empty review is what a failed gate looks like; it must not read as one
  // that ran and found nothing.
  it('does not treat a review with no checks as a pass', () => {
    const s = reviewBannerSummary(review())!
    expect(s.clean).toBe(false)
    expect(s.headline).toBe('Automated checks could not run')
  })

  it('counts only defects in the headline, not notes', () => {
    const s = reviewBannerSummary(
      review({ issues: [issue(), issue({ severity: 'info' })] }),
    )!
    expect(s.clean).toBe(false)
    expect(s.headline).toBe('1 item needs review')
    expect(s.counts).toEqual({ blocker: 0, warning: 1, info: 1 })
  })

  it('pluralizes and escalates tone', () => {
    const s = reviewBannerSummary(
      review({ issues: [issue(), issue({ severity: 'blocker' })] }),
    )!
    expect(s.headline).toBe('2 items need review')
    expect(s.tone).toBe('red')
  })

  // Info-only means nothing is wrong — a provenance note must not make a
  // correct report look defective.
  it('stays clean when only notes were raised', () => {
    const s = reviewBannerSummary(
      review({
        issues: [issue({ severity: 'info', code: 'repair-code-backfill' })],
        checks: [{ id: 'structural-completeness', status: 'ok', issueCount: 0 }],
      }),
    )!
    expect(s.clean).toBe(true)
  })
})

describe('issuesForPath', () => {
  const r = review({
    issues: [
      issue({ path: 'relevantCodes.cpt[0].code' }),
      issue({ path: 'relevantCodes.cpt[1].code' }),
      issue({ path: 'requestOverview.suggestedCpt[0].code' }),
    ],
  })

  it('matches a row and everything beneath it', () => {
    expect(issuesForPath(r, 'relevantCodes.cpt[0]')).toHaveLength(1)
    expect(issuesForPath(r, 'relevantCodes.cpt')).toHaveLength(2)
  })

  it('does not match a sibling index', () => {
    expect(issuesForPath(r, 'relevantCodes.cpt[2]')).toHaveLength(0)
  })

  // Guards against `relevantCodes.cpt` also matching `relevantCodes.cptNote`.
  it('does not match a path that merely shares a prefix string', () => {
    const withNote = review({ issues: [issue({ path: 'relevantCodes.cptNote' })] })
    expect(issuesForPath(withNote, 'relevantCodes.cpt')).toHaveLength(0)
  })

  it('returns nothing for an un-reviewed artifact', () => {
    expect(issuesForPath(undefined, 'relevantCodes.cpt')).toEqual([])
  })
})

describe('issuesForSection', () => {
  it('groups by the section that displays the field', () => {
    const r = review({
      issues: [issue({ sectionId: 'codes' }), issue({ sectionId: 'summary' })],
    })
    expect(issuesForSection(r, 'codes')).toHaveLength(1)
    expect(issuesForSection(r, 'criteria')).toHaveLength(0)
  })
})

describe('unrunChecks', () => {
  it('surfaces only checks that did not run cleanly', () => {
    const r = review({
      checks: [
        { id: 'structural-completeness', status: 'ok', issueCount: 0 },
        {
          id: 'code-grounding',
          status: 'skipped',
          reason: 'no-usable-evidence',
          issueCount: 0,
        },
      ],
    })
    expect(unrunChecks(r).map((c) => c.id)).toEqual(['code-grounding'])
  })
})

describe('chip labels and tones', () => {
  it('gives every severity a tone', () => {
    expect(REVIEW_SEVERITY_TONE).toEqual({
      blocker: 'red',
      warning: 'amber',
      info: 'blue',
    })
  })

  it('labels known codes and falls back for unknown ones', () => {
    expect(issueChipLabel(issue())).toBe('Not in sources')
    expect(issueChipLabel(issue({ code: 'code-source-out-of-scope' }))).toBe(
      'Out of scope',
    )
    expect(issueChipLabel(issue({ code: 'made-up' as never }))).toBe('Check')
  })
})

// The distinction the whole gate is built around: a check that was skipped or
// errored produces zero findings, which is not the same as finding nothing.
// Grounding skips itself whenever there is no usable evidence, so "no issues"
// is the expected output of a run that checked nothing at all.
describe('reviewBannerSummary — skipped is not passed', () => {
  const ok = { id: 'structural-completeness', status: 'ok' as const, issueCount: 0 }
  const skipped = {
    id: 'code-grounding',
    status: 'skipped' as const,
    reason: 'no-usable-evidence',
    issueCount: 0,
  }
  const errored = {
    id: 'code-grounding',
    status: 'error' as const,
    reason: 'boom',
    issueCount: 0,
  }

  it('does not claim a pass when a check was skipped', () => {
    const s = reviewBannerSummary(review({ checks: [ok, skipped] }))!
    expect(s.clean).toBe(false)
    expect(s.incomplete).toBe(1)
    expect(s.headline).toBe('Some automated checks could not run')
    expect(s.tone).not.toBe('green')
  })

  it('does not claim a pass when a check errored', () => {
    const s = reviewBannerSummary(review({ checks: [ok, errored] }))!
    expect(s.clean).toBe(false)
    expect(s.headline).toBe('Some automated checks could not run')
  })

  it('says so plainly when nothing ran at all', () => {
    const s = reviewBannerSummary(review({ checks: [skipped] }))!
    expect(s.headline).toBe('Automated checks could not run')
  })

  it('claims a pass only when every check actually ran', () => {
    const s = reviewBannerSummary(
      review({ checks: [ok, { ...ok, id: 'code-grounding' }] }),
    )!
    expect(s.clean).toBe(true)
    expect(s.incomplete).toBe(0)
    expect(s.headline).toBe('Automated checks passed')
  })

  it('still leads with defects when there are both', () => {
    const s = reviewBannerSummary(review({ issues: [issue()], checks: [skipped] }))!
    expect(s.headline).toBe('1 item needs review')
    expect(s.incomplete).toBe(1)
  })
})

describe('skipReasonLabel', () => {
  it('translates skip reasons into something a reader can act on', () => {
    expect(skipReasonLabel('no-usable-evidence')).toMatch(/no sources/)
    expect(skipReasonLabel('source-procedures-unavailable')).toMatch(/procedures/)
  })

  it('passes an unmapped reason through rather than hiding it', () => {
    expect(skipReasonLabel('something-new')).toBe('something-new')
  })
})
