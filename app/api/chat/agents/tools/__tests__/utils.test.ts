import { cleanRegex } from '../utils'

describe('cleanRegex', () => {
  it('matches an NCD STATEMENT…REFERENCES block', () => {
    const sample = `Some intro
STATEMENT
A. Coverage details
B. More info
5
REFERENCES
[1] foo`
    const cleaned = sample.replace(cleanRegex, '\nREMOVED')
    expect(cleaned).toContain('REMOVED')
    expect(cleaned).not.toContain('Coverage details')
  })

  it('does not match unrelated text', () => {
    const s = 'No statement here at all'
    expect(s.replace(cleanRegex, 'X')).toBe(s)
  })

  it('is global and matches multiple occurrences', () => {
    const s = `\nSTATEMENT
a
5
REFERENCES first
\nSTATEMENT
b
5
REFERENCES second`
    const matches = s.match(cleanRegex)
    expect(matches?.length).toBe(2)
  })
})
