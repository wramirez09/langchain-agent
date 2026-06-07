const useChatMock = { chatMessages: [] as any[] }
const useDocChecksMock = {
  docChecks: {} as Record<string, Record<string, boolean>>,
  setDocCheck: jest.fn(),
}
jest.mock('@/components/providers/PriorAuthProvider', () => ({
  usePriorAuthChat: () => useChatMock,
  usePriorAuthDocChecks: () => useDocChecksMock,
}))

const renderToBuffer = jest.fn()
jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: (...a: any[]) => renderToBuffer(...a),
}))
// Dynamic imports (PdfDoc / ArtifactPdfPreview) resolve to a stub that
// surfaces its props, so tests can assert WHICH document the view routed to
// (artifact vs markdown transcript) and with what data.
jest.mock('next/dynamic', () => () => (props: any) => (
  <div
    data-testid="pdf-viewer"
    data-artifact={props.artifact ? JSON.stringify(props.artifact) : undefined}
    data-messages={
      props.messages
        ? JSON.stringify(props.messages.map((m: any) => m.content))
        : undefined
    }
  />
))
jest.mock('@/components/pdf/pdf-generator', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/pdf/ArtifactPdfDoc', () => ({
  __esModule: true,
  default: () => null,
}))

import { render, screen } from '@testing-library/react'
import { FileExportView } from '../FileExportView'
import { ARTIFACT_JSON_EXAMPLE } from '@/lib/priorAuth/artifactSchema'

const viewerArtifact = () => {
  const raw = screen.getByTestId('pdf-viewer').getAttribute('data-artifact')
  return raw ? JSON.parse(raw) : null
}
const viewerMessages = () => {
  const raw = screen.getByTestId('pdf-viewer').getAttribute('data-messages')
  return raw ? JSON.parse(raw) : null
}

describe('FileExportView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useChatMock.chatMessages = []
    useDocChecksMock.docChecks = {}
    URL.createObjectURL = jest.fn(() => 'blob:x')
    URL.revokeObjectURL = jest.fn()
  })

  it('shows empty state when there are no chat messages', () => {
    render(<FileExportView />)
    expect(screen.getByText(/No report generated yet/)).toBeInTheDocument()
    expect(screen.queryByTestId('pdf-viewer')).toBeNull()
  })

  it('renders PdfDoc viewer when messages exist', () => {
    useChatMock.chatMessages = [
      { id: '1', role: 'assistant', content: 'analysis' },
    ] as any
    render(<FileExportView />)
    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument()
    expect(viewerMessages()).toEqual(['analysis'])
    expect(viewerArtifact()).toBeNull()
  })

  it('filters tool-call messages out before rendering', () => {
    useChatMock.chatMessages = [
      {
        id: '1',
        role: 'assistant',
        content: '{"tool_calls": [{"id":"x"}]}',
      },
    ] as any
    render(<FileExportView />)
    expect(screen.getByText(/No report generated yet/)).toBeInTheDocument()
  })

  it('routes an artifact conversation to the artifact preview (not the empty state)', () => {
    // Regression: artifact JSON is dropped from the markdown message list, so
    // without the artifact branch this would fall through to the empty state.
    useChatMock.chatMessages = [
      { id: '1', role: 'user', content: 'knee MRI' },
      { id: '2', role: 'assistant', content: ARTIFACT_JSON_EXAMPLE },
    ] as any
    render(<FileExportView />)
    expect(screen.queryByText(/No report generated yet/)).toBeNull()
    expect(viewerArtifact()?.kind).toBe('prior-auth-summary')
    expect(viewerMessages()).toBeNull()
  })

  it('applies reviewer checkbox toggles to the previewed/exported artifact', () => {
    useChatMock.chatMessages = [
      { id: 'msg-1', role: 'assistant', content: ARTIFACT_JSON_EXAMPLE },
    ] as any
    // Reviewer ticked "Knee X-ray report, if performed" (Prior Imaging group)
    // in the Output tab; the artifact JSON itself has no `provided` flag.
    useDocChecksMock.docChecks = {
      'msg-1': { 'Prior Imaging::Knee X-ray report, if performed': true },
    }
    render(<FileExportView />)
    const imaging = viewerArtifact().requiredDocumentation.find(
      (g: any) => g.title === 'Prior Imaging'
    )
    expect(
      imaging.items.find((d: any) => d.item.startsWith('Knee X-ray')).provided
    ).toBe(true)
    // An untouched item keeps its original (absent) flag.
    expect(
      imaging.items.find((d: any) => d.item.startsWith('Explanation')).provided
    ).toBeUndefined()
  })

  it('ignores toggles recorded against a different (stale) artifact message', () => {
    useChatMock.chatMessages = [
      { id: 'msg-2', role: 'assistant', content: ARTIFACT_JSON_EXAMPLE },
    ] as any
    useDocChecksMock.docChecks = {
      'msg-1': { 'Prior Imaging::Knee X-ray report, if performed': true },
    }
    render(<FileExportView />)
    const imaging = viewerArtifact().requiredDocumentation.find(
      (g: any) => g.title === 'Prior Imaging'
    )
    expect(
      imaging.items.find((d: any) => d.item.startsWith('Knee X-ray')).provided
    ).toBeUndefined()
  })

  it('uses the markdown path when a newer markdown answer follows a stale artifact', () => {
    useChatMock.chatMessages = [
      { id: '1', role: 'assistant', content: ARTIFACT_JSON_EXAMPLE },
      { id: '2', role: 'user', content: 'explain in plain words' },
      { id: '3', role: 'assistant', content: 'Plain-language summary.' },
    ] as any
    render(<FileExportView />)
    expect(viewerArtifact()).toBeNull()
    // The stale artifact JSON must not leak into the markdown message list.
    expect(viewerMessages()).toEqual([
      'explain in plain words',
      'Plain-language summary.',
    ])
  })
})
