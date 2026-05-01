/**
 * @jest-environment node
 */

const withStructuredOutput = jest.fn()
jest.mock('@/lib/llm', () => ({
  llmSummarizer: jest.fn(() => ({
    withStructuredOutput,
  })),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('chat/structured_output POST', () => {
  it('returns 500 (or e.status) when withStructuredOutput throws', async () => {
    withStructuredOutput.mockImplementation(() => {
      throw Object.assign(new Error('rate'), { status: 429 })
    })
    const r = await POST(makeReq({ messages: [{ content: 'x' }] }))
    expect(r.status).toBe(429)
  })

  it('passes the configured zod schema with name=output_formatter', async () => {
    withStructuredOutput.mockImplementation(() => {
      throw new Error('stop')
    })
    await POST(makeReq({ messages: [{ content: 'x' }] }))
    expect(withStructuredOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'output_formatter' }),
    )
  })
})
