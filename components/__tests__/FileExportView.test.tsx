const useChatMock = { chatMessages: [] as any[] }
jest.mock('@/components/providers/PriorAuthProvider', () => ({
  usePriorAuthChat: () => useChatMock,
}))

const renderToBuffer = jest.fn()
jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: (...a: any[]) => renderToBuffer(...a),
}))
jest.mock('next/dynamic', () => () => () => <div data-testid="pdf-viewer" />)
jest.mock('@/components/pdf/pdf-generator', () => ({
  __esModule: true,
  default: () => null,
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileExportView } from '../FileExportView'

describe('FileExportView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useChatMock.chatMessages = []
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
})
