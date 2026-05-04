jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}))

jest.mock('cross-fetch', () => jest.fn())

import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import fetch from 'cross-fetch'
import { FileUploadTool } from '../fileUploadTool'

const mockedReadFile = fs.readFile as jest.Mock
const mockedFetch = fetch as unknown as jest.Mock
const TMP_FILE = path.join(os.tmpdir(), 'file.pdf')

describe('FileUploadTool', () => {
  let tool: FileUploadTool

  beforeEach(() => {
    tool = new FileUploadTool()
    mockedReadFile.mockReset()
    mockedFetch.mockReset()
  })

  it('returns error if input is missing separator', async () => {
    const out = await tool._call({ input: 'just-a-path.pdf' })
    expect(out).toMatch(/file path and a query/)
  })

  it('returns no-info message when API returns empty docs', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('pdf-bytes'))
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    })
    const out = await tool._call({ input: `${TMP_FILE}::what is this` })
    expect(out).toMatch(/No relevant information found/)
  })

  it('returns error on non-ok fetch', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('pdf'))
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    })
    const out = await tool._call({ input: `${TMP_FILE}::q` })
    expect(out).toMatch(/Failed to process file/)
  })

  it('returns summary on happy path', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('pdf'))
    // Two fetches: ingest API + OpenAI
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{ pageContent: 'doc text 1' }, { pageContent: 'doc text 2' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '## Analysis Result' }] } }],
        }),
      })
    const out = await tool._call({ input: `${TMP_FILE}::what is this` })
    expect(out).toContain('## Analysis Result')
  })

  it('returns fallback message when LLM response shape is unexpected', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('pdf'))
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ docs: [{ pageContent: 'text' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
    const out = await tool._call({ input: `${TMP_FILE}::q` })
    expect(out).toContain('Failed to generate a summary')
  })

  it('handles LLM fetch error', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('pdf'))
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ docs: [{ pageContent: 'text' }] }),
      })
      .mockRejectedValueOnce(new Error('llm offline'))
    const out = await tool._call({ input: `${TMP_FILE}::q` })
    expect(out).toContain('error occurred during summarization')
  })

  it('returns error if read fails', async () => {
    mockedReadFile.mockRejectedValue(new Error('disk gone'))
    const out = await tool._call({ input: `${TMP_FILE}::q` })
    expect(out).toMatch(/Failed to process file/)
    expect(out).toMatch(/disk gone/)
  })
})
