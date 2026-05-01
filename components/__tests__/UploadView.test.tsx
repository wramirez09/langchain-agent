jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UploadView } from '../UploadView'
import { toast } from 'sonner'

function pdfFile(name = 'doc.pdf', size = 1024) {
  const f = new File(['x'.repeat(size)], name, { type: 'application/pdf' })
  return f
}

describe('UploadView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as any) = jest.fn()
  })

  it('rejects non-PDF files', async () => {
    render(<UploadView />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'a.txt', { type: 'text/plain' })],
      },
    })
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Only PDF files are supported'),
    )
  })

  it('rejects files over 10MB', async () => {
    render(<UploadView />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    const big = pdfFile('big.pdf', 11 * 1024 * 1024)
    fireEvent.change(input, { target: { files: [big] } })
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('File size exceeds 10MB limit'),
    )
  })

  it('calls onUploadComplete with generated query on success', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, generatedQuery: 'q1' }),
    })
    const onUploadComplete = jest.fn()
    render(<UploadView onUploadComplete={onUploadComplete} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [pdfFile()] } })
    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('q1'))
    expect(toast.success).toHaveBeenCalledWith('Document processed successfully!')
  })

  it('marks file as error on failure', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'boom' }),
    })
    render(<UploadView />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [pdfFile('x.pdf')] } })
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('boom'),
    )
    expect(screen.getByText('x.pdf')).toBeInTheDocument()
  })
})
