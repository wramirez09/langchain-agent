import { applyDocChecks, docItemKey } from '../docChecks'
import type { PartialPriorAuthArtifact } from '../artifactSchema'

const artifact: PartialPriorAuthArtifact = {
  kind: 'prior-auth-summary',
  title: 'Test',
  requiredDocumentation: [
    {
      title: 'Clinical Evaluation',
      items: [
        { item: 'History and duration of knee pain' },
        { item: 'Physical exam', provided: true },
      ],
    },
    {
      title: 'Prior Imaging',
      items: [{ item: 'Knee X-ray report', provided: false }],
    },
  ],
}

describe('docItemKey', () => {
  it('combines group title and item text', () => {
    expect(docItemKey('Prior Imaging', 'Knee X-ray report')).toBe(
      'Prior Imaging::Knee X-ray report'
    )
  })

  it('tolerates missing parts', () => {
    expect(docItemKey(undefined, 'X')).toBe('::X')
  })
})

describe('applyDocChecks', () => {
  it('returns the same reference when there is nothing to apply', () => {
    expect(applyDocChecks(artifact, undefined)).toBe(artifact)
    expect(applyDocChecks(artifact, {})).toBe(artifact)
    expect(applyDocChecks({ kind: 'prior-auth-summary' }, { 'a::b': true })).toEqual(
      { kind: 'prior-auth-summary' }
    )
  })

  it('overrides provided for checked items and leaves others untouched', () => {
    const checks = {
      [docItemKey('Clinical Evaluation', 'History and duration of knee pain')]: true,
      [docItemKey('Prior Imaging', 'Knee X-ray report')]: true,
    }
    const out = applyDocChecks(artifact, checks)
    const groups = out.requiredDocumentation!
    expect(groups[0]!.items![0]!.provided).toBe(true)
    expect(groups[0]!.items![1]!.provided).toBe(true) // untouched, agent-supplied
    expect(groups[1]!.items![0]!.provided).toBe(true) // flipped false → true
  })

  it('can uncheck an agent-checked item', () => {
    const checks = {
      [docItemKey('Clinical Evaluation', 'Physical exam')]: false,
    }
    const out = applyDocChecks(artifact, checks)
    expect(out.requiredDocumentation![0]!.items![1]!.provided).toBe(false)
  })

  it('does not mutate the input artifact', () => {
    const checks = {
      [docItemKey('Prior Imaging', 'Knee X-ray report')]: true,
    }
    applyDocChecks(artifact, checks)
    expect(artifact.requiredDocumentation![1]!.items![0]!.provided).toBe(false)
  })
})
