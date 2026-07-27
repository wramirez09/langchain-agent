import { parsePartialJson } from '../partialJson'

describe('parsePartialJson', () => {
  it('parses complete, well-formed JSON via the fast path', () => {
    expect(parsePartialJson('{"a":1,"b":"two"}')).toEqual({ a: 1, b: 'two' })
  })

  it('strips a ```json code fence before parsing', () => {
    expect(parsePartialJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parsePartialJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('slices leading prose down to the first object brace', () => {
    expect(parsePartialJson('Here you go: {"a":1}')).toEqual({ a: 1 })
  })

  it('recovers an object truncated mid-string value', () => {
    // The dangling string gets closed; the partial value is kept.
    expect(parsePartialJson('{"k":"hel')).toEqual({ k: 'hel' })
  })

  it('drops a trailing comma', () => {
    expect(parsePartialJson('{"a":1,"b":2,')).toEqual({ a: 1, b: 2 })
  })

  it('drops a dangling key with no value yet', () => {
    expect(parsePartialJson('{"a":1,"foo')).toEqual({ a: 1 })
    expect(parsePartialJson('{"foo')).toEqual({})
  })

  it('completes a key that has a colon but no value', () => {
    expect(parsePartialJson('{"a":1,"b":')).toEqual({ a: 1, b: null })
  })

  it('preserves escaped quotes inside a truncated string', () => {
    expect(parsePartialJson('{"s":"va\\"l')).toEqual({ s: 'va"l' })
  })

  it('closes truncated nested structures', () => {
    expect(parsePartialJson('{"arr":[{"a":1}')).toEqual({ arr: [{ a: 1 }] })
    expect(parsePartialJson('{"arr":[1,2,3')).toEqual({ arr: [1, 2, 3] })
  })

  it('drops a partial trailing array element after a comma', () => {
    expect(parsePartialJson('{"arr":[1,2,')).toEqual({ arr: [1, 2] })
  })

  it('returns null for empty or whitespace input', () => {
    expect(parsePartialJson('')).toBeNull()
    expect(parsePartialJson('   ')).toBeNull()
  })

  it('returns null when there is no JSON object at all', () => {
    expect(parsePartialJson('just some prose')).toBeNull()
  })
})
