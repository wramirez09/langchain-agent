import { AGENT_SYSTEM_CONTENT, agentPrompt } from '../agentPrompt'

describe('AGENT_SYSTEM_CONTENT', () => {
  it('enforces HIPAA / PHI removal', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(/HIPAA Compliance/i)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/Patient names, initials/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/remove all patient identifying information/)
  })

  it('describes the conditional Medicare vs Commercial workflow', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(/commercial_guidelines_search/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/ncd_coverage_search/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/local_lcd_search/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/local_coverage_article_search/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/policy_content_extractor/)
  })

  it('keeps commercial source confidentiality rules', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(/Commercial Guidelines Confidentiality/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/Never mention tool names, URLs/)
  })

  it('mandates the structured output template', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(
      /# Prior Authorization Summary for \[Treatment\]/,
    )
    expect(AGENT_SYSTEM_CONTENT).toMatch(/\*\*Prior Authorization Required:\*\*/)
  })

  it('includes the legal disclaimer requirement', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(/Crucial Disclaimer/)
  })
})

describe('agentPrompt template', () => {
  it('exports a valid ChatPromptTemplate-like object', () => {
    expect(agentPrompt).toBeTruthy()
    expect(typeof (agentPrompt as any).formatMessages).toBe('function')
  })
})
