jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation((cfg: any) => ({ cfg })),
}))

import { llmAgent, llmSummarizer, llmExtractor } from '../llm'
import { ChatOpenAI } from '@langchain/openai'

const lastCfg = () =>
  (ChatOpenAI as unknown as jest.Mock).mock.calls.at(-1)![0] as Record<
    string,
    unknown
  >

describe('llm factory', () => {
  const origEnv = { ...process.env }
  beforeEach(() => (ChatOpenAI as unknown as jest.Mock).mockClear())
  afterEach(() => {
    process.env = { ...origEnv }
  })

  it('llmAgent defaults to gpt-5.5 with streaming', () => {
    delete process.env.AGENT_MODEL
    llmAgent()
    expect(lastCfg()).toEqual(
      expect.objectContaining({ model: 'gpt-5.5', streaming: true }),
    )
  })

  it('llmSummarizer defaults to gpt-5.5', () => {
    delete process.env.SUMMARIZER_MODEL
    llmSummarizer()
    expect(lastCfg()).toEqual(expect.objectContaining({ model: 'gpt-5.5' }))
  })

  // Regression guard: reasoning-family models (gpt-5.x, o-series) reject
  // `temperature` at the OpenAI API. The summarizer must send reasoningEffort
  // and NOT temperature when its model is a reasoning model.
  it('routes a reasoning-model summarizer through reasoningEffort, not temperature', () => {
    delete process.env.SUMMARIZER_MODEL
    llmSummarizer()
    const cfg = lastCfg()
    expect(cfg.reasoningEffort).toBe('medium')
    expect(cfg).not.toHaveProperty('temperature')
  })

  // And the inverse: a non-reasoning override keeps temperature, drops effort.
  it('routes a non-reasoning summarizer through temperature, not reasoningEffort', () => {
    process.env.SUMMARIZER_MODEL = 'gpt-4o'
    llmSummarizer()
    const cfg = lastCfg()
    expect(cfg).toEqual(
      expect.objectContaining({ model: 'gpt-4o', temperature: 0.2 }),
    )
    expect(cfg).not.toHaveProperty('reasoningEffort')
  })

  it('routes a non-reasoning agent override through temperature, not reasoningEffort', () => {
    process.env.AGENT_MODEL = 'gpt-4o-mini'
    llmAgent()
    const cfg = lastCfg()
    expect(cfg).toEqual(
      expect.objectContaining({ model: 'gpt-4o-mini', temperature: 0 }),
    )
    expect(cfg).not.toHaveProperty('reasoningEffort')
  })

  // The note-ingest path: cheapest model, zod-validated output, feeds a billed
  // screening run — so temperature 0 and a non-reasoning default.
  it('llmExtractor defaults to gpt-4o-mini at temperature 0', () => {
    delete process.env.EXTRACTOR_MODEL
    llmExtractor()
    const cfg = lastCfg()
    expect(cfg).toEqual(
      expect.objectContaining({ model: 'gpt-4o-mini', temperature: 0 }),
    )
    expect(cfg).not.toHaveProperty('reasoningEffort')
  })

  it('routes a reasoning-model extractor override through reasoningEffort', () => {
    process.env.EXTRACTOR_MODEL = 'gpt-5.5'
    llmExtractor()
    const cfg = lastCfg()
    expect(cfg.reasoningEffort).toBe('low')
    expect(cfg).not.toHaveProperty('temperature')
  })
})
