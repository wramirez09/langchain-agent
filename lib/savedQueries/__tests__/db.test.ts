import { type Message } from 'ai'
import {
  signatureOf,
  sortPinnedFirst,
  normalizeForSave,
  savedArtifactOf,
  restoredChatMessages,
  MAX_SAVED_QUERIES,
  QueryLimitReachedError,
  type SavedQuery,
} from '../db'
import { ARTIFACT_JSON_EXAMPLE } from '@/lib/priorAuth/artifactSchema'

const msg = (role: Message['role'], content: string): Message =>
  ({ id: `${role}-${content}`, role, content }) as Message

describe('signatureOf', () => {
  it('is stable for the same turn (role + content)', () => {
    const turn = [msg('user', 'MRI lumbar'), msg('assistant', '{"x":1}')]
    expect(signatureOf(turn)).toBe(signatureOf(turn.map((m) => ({ ...m }))))
  })

  it('differs when content changes (a re-query)', () => {
    const a = [msg('user', 'MRI lumbar'), msg('assistant', '{"x":1}')]
    const b = [msg('user', 'MRI lumbar'), msg('assistant', '{"x":2}')]
    expect(signatureOf(a)).not.toBe(signatureOf(b))
  })

  it('differs when role order changes', () => {
    const a = [msg('user', 'a'), msg('assistant', 'b')]
    const b = [msg('assistant', 'a'), msg('user', 'b')]
    expect(signatureOf(a)).not.toBe(signatureOf(b))
  })

  it('tolerates empty/missing content', () => {
    expect(() => signatureOf([{ id: '1', role: 'user' } as Message])).not.toThrow()
  })

  it('hashes the same whether the text lives in content or parts (AI SDK split)', () => {
    const full = [msg('user', 'q'), msg('assistant', ARTIFACT_JSON_EXAMPLE)]
    const split = [
      msg('user', 'q'),
      {
        id: 'assistant-1',
        role: 'assistant',
        content: ARTIFACT_JSON_EXAMPLE.slice(0, 10), // first chunk only
        parts: [{ type: 'text', text: ARTIFACT_JSON_EXAMPLE }],
      } as unknown as Message,
    ]
    expect(signatureOf(split)).toBe(signatureOf(full))
  })
})

describe('normalizeForSave', () => {
  it('flattens parts into content and drops parts', () => {
    const out = normalizeForSave([
      {
        id: 'a1',
        role: 'assistant',
        content: '{',
        parts: [{ type: 'text', text: ARTIFACT_JSON_EXAMPLE }],
      } as unknown as Message,
    ])
    expect(out[0].content).toBe(ARTIFACT_JSON_EXAMPLE)
    expect('parts' in out[0]).toBe(false)
  })

  it('leaves plain messages untouched', () => {
    const out = normalizeForSave([msg('user', 'hello')])
    expect(out[0].content).toBe('hello')
  })
})

describe('savedArtifactOf', () => {
  it('parses the artifact from the saved turn', () => {
    const artifact = savedArtifactOf([
      msg('user', 'q'),
      msg('assistant', ARTIFACT_JSON_EXAMPLE),
    ])
    expect(artifact?.kind).toBe('prior-auth-summary')
    expect(artifact?.title).toContain('MRI of the Knee')
  })

  it('is undefined for plain chat responses', () => {
    expect(
      savedArtifactOf([msg('user', 'q'), msg('assistant', 'plain answer')])
    ).toBeUndefined()
  })
})

describe('restoredChatMessages', () => {
  const artifactJson = ARTIFACT_JSON_EXAMPLE

  it('keeps stored text verbatim when it parses cleanly (signature preserved)', () => {
    const saved = {
      chatMessages: [msg('user', 'q'), msg('assistant', ARTIFACT_JSON_EXAMPLE)],
      artifactJson,
    } as SavedQuery
    const out = restoredChatMessages(saved)
    expect(out[1].content).toBe(ARTIFACT_JSON_EXAMPLE)
    expect(signatureOf(out)).toBe(signatureOf(saved.chatMessages))
  })

  it('rebuilds a truncated artifact message from the saved JSON', () => {
    const saved = {
      chatMessages: [
        msg('user', 'q'),
        msg('assistant', ARTIFACT_JSON_EXAMPLE.slice(0, 200)),
      ],
      artifactJson,
    } as SavedQuery
    const out = restoredChatMessages(saved)
    expect(JSON.parse(out[1].content)).toEqual(JSON.parse(ARTIFACT_JSON_EXAMPLE))
  })

  it('returns stored messages as-is for records without a saved artifact (pre-existing rows)', () => {
    const saved = {
      chatMessages: [msg('user', 'q'), msg('assistant', 'plain answer')],
    } as SavedQuery
    expect(restoredChatMessages(saved).map((m) => m.content)).toEqual([
      'q',
      'plain answer',
    ])
  })

  it('does not mutate the saved record', () => {
    const saved = {
      chatMessages: [msg('assistant', ARTIFACT_JSON_EXAMPLE.slice(0, 200))],
      artifactJson,
    } as SavedQuery
    restoredChatMessages(saved)
    expect(saved.chatMessages[0].content).toBe(
      ARTIFACT_JSON_EXAMPLE.slice(0, 200)
    )
  })
})

describe('sortPinnedFirst', () => {
  const row = (id: string, pinned?: boolean): SavedQuery =>
    ({ id, pinned }) as SavedQuery

  it('floats pinned rows to the top, preserving order within each group', () => {
    const input = [row('a'), row('b', true), row('c'), row('d', true)]
    expect(sortPinnedFirst(input).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('is a no-op when nothing is pinned', () => {
    const input = [row('a'), row('b'), row('c')]
    expect(sortPinnedFirst(input).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [row('a', true), row('b')]
    const copy = [...input]
    sortPinnedFirst(input)
    expect(input).toEqual(copy)
  })
})

describe('cap constants', () => {
  it('caps at 5', () => {
    expect(MAX_SAVED_QUERIES).toBe(5)
  })

  it('QueryLimitReachedError is identifiable via instanceof', () => {
    const err = new QueryLimitReachedError()
    expect(err).toBeInstanceOf(QueryLimitReachedError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('QueryLimitReachedError')
  })
})
