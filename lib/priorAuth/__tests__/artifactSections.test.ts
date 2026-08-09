import {
  ARTIFACT_SECTIONS,
  has,
  presentSections,
  sectionIdForPath,
} from '../artifactSections'
import { ARTIFACT_JSON_EXAMPLE } from '../artifactSchema'
import type { PartialPriorAuthArtifact } from '../artifactSchema'

const golden = () => JSON.parse(ARTIFACT_JSON_EXAMPLE) as PartialPriorAuthArtifact

describe('has', () => {
  it('treats empty arrays and empty strings as absent', () => {
    expect(has([])).toBe(false)
    expect(has('')).toBe(false)
    expect(has(null)).toBe(false)
    expect(has(undefined)).toBe(false)
  })

  it('treats populated values as present', () => {
    expect(has([1])).toBe(true)
    expect(has('x')).toBe(true)
    expect(has({})).toBe(true)
    expect(has(0)).toBe(true)
    expect(has(false)).toBe(true)
  })
})

describe('presentSections', () => {
  it('renders every section for the golden artifact', () => {
    expect(presentSections(golden()).map((s) => s.id)).toEqual(
      ARTIFACT_SECTIONS.map((s) => s.id),
    )
  })

  it('preserves document order', () => {
    expect(ARTIFACT_SECTIONS.map((s) => s.id)).toEqual([
      'overview',
      'context',
      'authorization',
      'medicare',
      'criteria',
      'codes',
      'documentation',
      'limitations',
      'summary',
    ])
  })

  // The defect the review gate exists to catch: `[]` is schema-valid, so the
  // section silently disappears and every section after it renumbers.
  it('drops a section whose array is empty', () => {
    const d = golden()
    d.medicalNecessityCriteria = []
    const ids = presentSections(d).map((s) => s.id)
    expect(ids).not.toContain('criteria')
    // "codes" was 6th; with criteria gone it becomes 5th.
    expect(ids.indexOf('codes')).toBe(4)
  })

  it('keeps Clinical Context when only keyFindings survives', () => {
    const d = golden()
    d.requestOverview = { ...d.requestOverview, medicalHistory: '' }
    expect(presentSections(d).map((s) => s.id)).toContain('context')
  })

  it('drops Clinical Context when both of its fields are empty', () => {
    const d = golden()
    d.requestOverview = { ...d.requestOverview, medicalHistory: '', keyFindings: [] }
    const ids = presentSections(d).map((s) => s.id)
    expect(ids).not.toContain('context')
    expect(ids).toContain('overview')
  })
})

describe('sectionIdForPath', () => {
  it('maps a top-level path to its section', () => {
    expect(sectionIdForPath('limitations')).toBe('limitations')
    expect(sectionIdForPath('summary.determination')).toBe('summary')
  })

  it('ignores array indices', () => {
    expect(sectionIdForPath('relevantCodes.cpt[3].code')).toBe('codes')
    expect(sectionIdForPath('medicalNecessityCriteria[0].subCriteria[1].status')).toBe(
      'criteria',
    )
  })

  // requestOverview.keyFindings is displayed by Clinical Context, not by
  // Request Overview, even though the broader prefix also matches.
  it('resolves to the most specific owning section', () => {
    expect(sectionIdForPath('requestOverview.keyFindings[0]')).toBe('context')
    expect(sectionIdForPath('requestOverview.medicalHistory')).toBe('context')
    expect(sectionIdForPath('requestOverview.treatment')).toBe('overview')
    expect(sectionIdForPath('requestOverview')).toBe('overview')
  })

  it('returns undefined for paths no section displays', () => {
    expect(sectionIdForPath('disclaimer')).toBeUndefined()
    expect(sectionIdForPath('kind')).toBeUndefined()
  })
})
