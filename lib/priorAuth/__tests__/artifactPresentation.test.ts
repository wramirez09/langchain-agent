import {
  DETERMINATION_TONE,
  GUIDELINE_LABEL,
  POLICY_GROUP_TITLE,
  paRequiredPresentation,
  policySourceUrl,
} from '../artifactPresentation'

describe('paRequiredPresentation', () => {
  it('maps YES to an amber "Required" pill', () => {
    expect(paRequiredPresentation('YES')).toEqual({
      tone: 'amber',
      label: 'Required',
    })
  })

  it('maps NO to a green "Not required" pill', () => {
    expect(paRequiredPresentation('NO')).toEqual({
      tone: 'green',
      label: 'Not required',
    })
  })

  it('maps CONDITIONAL to an amber "Conditional" pill', () => {
    expect(paRequiredPresentation('CONDITIONAL')).toEqual({
      tone: 'amber',
      label: 'Conditional',
    })
  })

  it('falls back to "Conditional" for undefined or unknown values', () => {
    expect(paRequiredPresentation()).toEqual({
      tone: 'amber',
      label: 'Conditional',
    })
    expect(paRequiredPresentation('maybe')).toEqual({
      tone: 'amber',
      label: 'Conditional',
    })
  })
})

describe('policySourceUrl', () => {
  it('prefers a valid agent-supplied http(s) URL', () => {
    expect(
      policySourceUrl('NCD', '220.2', 'https://example.com/policy'),
    ).toBe('https://example.com/policy')
    // trims surrounding whitespace
    expect(
      policySourceUrl('LCD', 'L00000', '  https://example.com/x  '),
    ).toBe('https://example.com/x')
  })

  it('ignores a non-http URL and falls back to building one from the id', () => {
    expect(policySourceUrl('NCD', '220.2', 'not-a-url')).toBe(
      'https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=220.2',
    )
  })

  it('builds an NCD url keeping the dotted id', () => {
    expect(policySourceUrl('NCD', '220.2')).toBe(
      'https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=220.2',
    )
  })

  it('builds an LCD url dropping the letter prefix', () => {
    expect(policySourceUrl('LCD', 'L34567')).toBe(
      'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=34567',
    )
  })

  it('builds an LCA url dropping the letter prefix', () => {
    expect(policySourceUrl('LCA', 'A56789')).toBe(
      'https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleid=56789',
    )
  })

  it('returns undefined when no id is supplied', () => {
    expect(policySourceUrl('NCD')).toBeUndefined()
    expect(policySourceUrl(undefined, undefined, undefined)).toBeUndefined()
  })

  it('returns undefined for an unknown policy type', () => {
    expect(policySourceUrl('OTHER', '123')).toBeUndefined()
  })
})

describe('presentation lookup maps', () => {
  it('maps determinations to tones', () => {
    expect(DETERMINATION_TONE.meets_criteria).toBe('green')
    expect(DETERMINATION_TONE.conditional).toBe('amber')
    expect(DETERMINATION_TONE.more_info_needed).toBe('amber')
    expect(DETERMINATION_TONE.likely_denial).toBe('red')
    expect(DETERMINATION_TONE.not_supported).toBe('red')
  })

  it('maps guideline basis to display labels', () => {
    expect(GUIDELINE_LABEL.medicare).toBe('Medicare')
    expect(GUIDELINE_LABEL.commercial).toBe('Commercial')
    expect(GUIDELINE_LABEL['commercial-fallback']).toBe('Commercial (fallback)')
  })

  it('maps policy types to section titles', () => {
    expect(POLICY_GROUP_TITLE.NCD).toContain('National Coverage')
    expect(POLICY_GROUP_TITLE.LCD).toContain('Local Coverage Determinations')
    expect(POLICY_GROUP_TITLE.LCA).toContain('Local Coverage Articles')
  })
})
