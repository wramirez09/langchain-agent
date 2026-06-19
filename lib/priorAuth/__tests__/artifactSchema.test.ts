import {
  ARTIFACT_JSON_EXAMPLE,
  ARTIFACT_KIND,
  ARTIFACT_SCHEMA_VERSION,
  isPriorAuthArtifact,
  priorAuthArtifactSchema,
} from '../artifactSchema'

describe('isPriorAuthArtifact', () => {
  it('accepts an object with the correct kind and schemaVersion', () => {
    expect(
      isPriorAuthArtifact({
        kind: ARTIFACT_KIND,
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
      }),
    ).toBe(true)
  })

  it('rejects a wrong kind', () => {
    expect(
      isPriorAuthArtifact({
        kind: 'something-else',
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
      }),
    ).toBe(false)
  })

  it('rejects a wrong / missing schemaVersion', () => {
    expect(isPriorAuthArtifact({ kind: ARTIFACT_KIND })).toBe(false)
    expect(
      isPriorAuthArtifact({ kind: ARTIFACT_KIND, schemaVersion: 99 }),
    ).toBe(false)
  })

  it('rejects null, primitives, and arrays', () => {
    expect(isPriorAuthArtifact(null)).toBe(false)
    expect(isPriorAuthArtifact(undefined)).toBe(false)
    expect(isPriorAuthArtifact('string')).toBe(false)
    expect(isPriorAuthArtifact(42)).toBe(false)
    expect(isPriorAuthArtifact([])).toBe(false)
  })
})

describe('priorAuthArtifactSchema', () => {
  it('validates the canonical ARTIFACT_JSON_EXAMPLE', () => {
    const parsed = priorAuthArtifactSchema.safeParse(
      JSON.parse(ARTIFACT_JSON_EXAMPLE),
    )
    expect(parsed.success).toBe(true)
  })

  it('rejects an object missing required fields', () => {
    const parsed = priorAuthArtifactSchema.safeParse({
      kind: ARTIFACT_KIND,
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      title: 'Incomplete',
      // missing requestOverview, summary, etc.
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an invalid enum value', () => {
    const valid = JSON.parse(ARTIFACT_JSON_EXAMPLE)
    const parsed = priorAuthArtifactSchema.safeParse({
      ...valid,
      priorAuthRequired: 'MAYBE',
    })
    expect(parsed.success).toBe(false)
  })
})
