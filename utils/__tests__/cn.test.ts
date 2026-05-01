import { cn } from '../cn'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
  })

  it('merges conflicting tailwind classes (later wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('handles arrays and objects', () => {
    expect(cn(['a', { b: true, c: false }, 'd'])).toBe('a b d')
  })
})
