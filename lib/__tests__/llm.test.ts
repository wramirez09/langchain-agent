jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation((cfg: any) => ({ cfg })),
}))

import { llmAgent, llmSummarizer } from '../llm'
import { ChatOpenAI } from '@langchain/openai'

describe('llm factory', () => {
  beforeEach(() => (ChatOpenAI as unknown as jest.Mock).mockClear())

  it('llmAgent uses gpt-5 with streaming', () => {
    llmAgent()
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-5', streaming: true })
    )
  })

  it('llmSummarizer uses gpt-4o without streaming', () => {
    llmSummarizer()
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o' })
    )
  })
})
