import { type Message } from 'ai'
import {
  extractArtifact,
  looksLikeArtifact,
  messageText,
} from '../extractArtifact'
import { ARTIFACT_JSON_EXAMPLE } from '../artifactSchema'

const assistant = (content: string, extra?: Partial<Message>): Message =>
  ({ id: 'a1', role: 'assistant', content, ...extra }) as Message

const user = (content: string): Message =>
  ({ id: 'u1', role: 'user', content }) as Message

describe('looksLikeArtifact', () => {
  it('is true for artifact JSON', () => {
    expect(looksLikeArtifact(ARTIFACT_JSON_EXAMPLE)).toBe(true)
  })

  it('is true for fenced artifact JSON', () => {
    expect(looksLikeArtifact('```json\n' + ARTIFACT_JSON_EXAMPLE + '\n```')).toBe(
      true
    )
  })

  it('is false for markdown', () => {
    expect(looksLikeArtifact('## Summary\n- bullet')).toBe(false)
  })

  it('is false for non-artifact JSON', () => {
    expect(looksLikeArtifact('{"action": "search", "input": "x"}')).toBe(false)
  })
})

describe('extractArtifact', () => {
  it('extracts a complete artifact from the last assistant message', () => {
    const res = extractArtifact([user('q'), assistant(ARTIFACT_JSON_EXAMPLE)])
    expect(res).not.toBeNull()
    expect(res!.complete).toBe(true)
    expect(res!.messageId).toBe('a1')
    expect(res!.artifact.kind).toBe('prior-auth-summary')
    expect(res!.artifact.title).toBe(
      'Prior Authorization Summary for MRI of the Knee'
    )
  })

  it('still extracts when a user message trails the artifact', () => {
    const res = extractArtifact([
      assistant(ARTIFACT_JSON_EXAMPLE),
      user('thanks'),
    ])
    expect(res).not.toBeNull()
    expect(res!.complete).toBe(true)
  })

  it('returns null for a markdown assistant message', () => {
    expect(extractArtifact([assistant('## Report\nAll good.')])).toBeNull()
  })

  it('returns null when the latest assistant message is markdown even if an older artifact exists', () => {
    const res = extractArtifact([
      assistant(ARTIFACT_JSON_EXAMPLE),
      user('and in plain words?'),
      assistant('Here is a plain-language summary.', { id: 'a2' }),
    ])
    expect(res).toBeNull()
  })

  it('extracts a truncated (streaming) artifact as incomplete', () => {
    const res = extractArtifact([
      assistant(ARTIFACT_JSON_EXAMPLE.slice(0, 800)),
    ])
    expect(res).not.toBeNull()
    expect(res!.complete).toBe(false)
    expect(res!.artifact.requestOverview?.treatment).toBe(
      'Magnetic Resonance Imaging (MRI) of the knee'
    )
  })

  it('extracts a code-fenced artifact', () => {
    const res = extractArtifact([
      assistant('```json\n' + ARTIFACT_JSON_EXAMPLE + '\n```'),
    ])
    expect(res).not.toBeNull()
    expect(res!.complete).toBe(true)
  })

  it('reads text from message.parts when content holds only the first chunk', () => {
    const res = extractArtifact([
      assistant('{', {
        parts: [{ type: 'text', text: ARTIFACT_JSON_EXAMPLE }],
      } as Partial<Message>),
    ])
    expect(res).not.toBeNull()
    expect(res!.complete).toBe(true)
  })

  it('returns null for an empty conversation', () => {
    expect(extractArtifact([])).toBeNull()
  })
})

describe('messageText', () => {
  it('takes the longer of content vs joined parts', () => {
    const m = assistant('short', {
      parts: [
        { type: 'text', text: 'a much longer ' },
        { type: 'text', text: 'streamed text' },
      ],
    } as Partial<Message>)
    expect(messageText(m)).toBe('a much longer \nstreamed text')
  })

  it('falls back to content when parts are absent', () => {
    expect(messageText(assistant('hello'))).toBe('hello')
  })
})
