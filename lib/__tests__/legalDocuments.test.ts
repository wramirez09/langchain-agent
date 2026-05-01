import {
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  AI_SUBSCRIPTION_AGREEMENT,
} from '../legalDocuments'

describe('legalDocuments', () => {
  it('TERMS_OF_SERVICE has expected sections and HIPAA notice', () => {
    expect(TERMS_OF_SERVICE).toMatch(/# Terms of Service/)
    expect(TERMS_OF_SERVICE).toMatch(/HIPAA Compliance and Data Use/)
    expect(TERMS_OF_SERVICE).toMatch(/Limitation of Liability/i)
    expect(TERMS_OF_SERVICE).toMatch(/sales@notedoctor\.ai/)
  })

  it('PRIVACY_POLICY mentions PHI prohibition and GDPR rights', () => {
    expect(PRIVACY_POLICY).toMatch(/# Privacy Policy/)
    expect(PRIVACY_POLICY).toMatch(/PHI Prohibition/)
    expect(PRIVACY_POLICY).toMatch(/GDPR/)
  })

  it('AI_SUBSCRIPTION_AGREEMENT references NoteDoctor.AI LLC', () => {
    expect(AI_SUBSCRIPTION_AGREEMENT).toMatch(/NOTEDOCTOR\.AI LLC/)
    expect(AI_SUBSCRIPTION_AGREEMENT).toMatch(/Subscription Agreement/)
  })

  it('all docs are non-empty strings', () => {
    for (const d of [TERMS_OF_SERVICE, PRIVACY_POLICY, AI_SUBSCRIPTION_AGREEMENT]) {
      expect(typeof d).toBe('string')
      expect(d.length).toBeGreaterThan(100)
    }
  })
})
