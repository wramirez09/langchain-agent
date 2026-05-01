// react-markdown is ESM; provide a tiny stub that exercises the `components`
// prop overrides so the LegalDocumentViewer's own behavior is what's tested.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children, components }: any) => {
    const md = String(children)
    const lines = md.split('\n')
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g
    const renderInline = (text: string, prefix: string) => {
      const out: any[] = []
      let last = 0
      let m: RegExpExecArray | null
      let idx = 0
      while ((m = linkRe.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const A = components?.a ?? 'a'
        out.push(
          <A key={`${prefix}-${idx++}`} href={m[2]}>
            {m[1]}
          </A>
        )
        last = m.index + m[0].length
      }
      if (last < text.length) out.push(text.slice(last))
      return out
    }
    return (
      <div>
        {lines.map((line: string, i: number) => {
          if (!line.trim()) return null
          const h1 = line.match(/^# (.+)$/)
          if (h1) {
            const C = components?.h1 ?? 'h1'
            return <C key={i}>{h1[1]}</C>
          }
          const P = components?.p ?? 'p'
          const parts = line.split(/\*\*(.*?)\*\*/g)
          return (
            <P key={i}>
              {parts.map((p: string, j: number) => {
                if (j % 2 === 1) {
                  const S = components?.strong ?? 'strong'
                  return <S key={j}>{p}</S>
                }
                return <span key={j}>{renderInline(p, `${i}-${j}`)}</span>
              })}
            </P>
          )
        })}
      </div>
    )
  },
}))

import { render, screen } from '@testing-library/react'
import { LegalDocumentViewer } from '../LegalDocumentViewer'

describe('LegalDocumentViewer', () => {
  it('renders markdown headings and paragraphs', () => {
    render(<LegalDocumentViewer content={'# Title\n\nSome **bold** text'} />)
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('renders email-like links as mailto links', () => {
    render(<LegalDocumentViewer content={'Contact: [a@b.com](a@b.com)'} />)
    const link = screen.getByRole('link', { name: /a@b.com/i })
    expect(link).toHaveAttribute('href', 'mailto:a@b.com')
  })

  it('renders normal links unchanged', () => {
    render(<LegalDocumentViewer content={'See [docs](https://example.com)'} />)
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('href', 'https://example.com')
  })

  it('merges custom className', () => {
    const { container } = render(
      <LegalDocumentViewer content={'hi'} className="my-extra" />
    )
    expect(container.firstChild).toHaveClass('my-extra')
  })
})
