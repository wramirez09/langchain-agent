import { AGENT_SYSTEM_CONTENT, CHAT_SYSTEM_CONTENT, agentPrompt } from '../agentPrompt'

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

  it('mandates the structured JSON artifact output', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(/PriorAuthArtifact schema/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/single JSON object/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/Prior Authorization Summary for \[Treatment\]/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/`priorAuthRequired`/)
  })

  it('includes the legal disclaimer requirement', () => {
    expect(AGENT_SYSTEM_CONTENT).toMatch(/`disclaimer`/)
    expect(AGENT_SYSTEM_CONTENT).toMatch(/does not guarantee approval/)
  })
})

// /chat and /agents do identical research and differ only in rendering. If the
// research half ever diverges, /chat quietly becomes the less grounded surface
// — which is exactly the failure these tests exist to prevent.
describe('CHAT_SYSTEM_CONTENT', () => {
  const researchRules = [
    /HIPAA Compliance/i,
    /remove all patient identifying information/,
    /commercial_guidelines_search/,
    /ncd_coverage_search/,
    /medicare_multi_search/,
    /Commercial Guidelines Confidentiality/,
    /Reproduce the guideline's criteria in FULL/,
    /Reconcile to the MOST SPECIFIC criteria/,
    /Scope codes to the requested procedure/,
    /Scoping NEVER empties the code lists/,
  ]

  it.each(researchRules)('carries the same research rule as /agents: %s', (rule) => {
    expect(CHAT_SYSTEM_CONTENT).toMatch(rule)
    expect(AGENT_SYSTEM_CONTENT).toMatch(rule)
  })

  it('asks for markdown, not the JSON artifact', () => {
    expect(CHAT_SYSTEM_CONTENT).toMatch(/Present Comprehensive Findings/)
    expect(CHAT_SYSTEM_CONTENT).toMatch(/Return markdown only/)
    expect(CHAT_SYSTEM_CONTENT).not.toMatch(/PriorAuthArtifact schema/)
    expect(CHAT_SYSTEM_CONTENT).not.toMatch(/prior-auth-summary/)
  })

  it('shares one research section with the agent prompt, byte for byte', () => {
    const research = (prompt: string) => prompt.slice(0, prompt.indexOf('**4. '))
    expect(research(CHAT_SYSTEM_CONTENT)).toBe(research(AGENT_SYSTEM_CONTENT))
    expect(research(CHAT_SYSTEM_CONTENT).length).toBeGreaterThan(1000)
  })
})

describe('agentPrompt template', () => {
  it('exports a valid ChatPromptTemplate-like object', () => {
    expect(agentPrompt).toBeTruthy()
    expect(typeof (agentPrompt as any).formatMessages).toBe('function')
  })
})
