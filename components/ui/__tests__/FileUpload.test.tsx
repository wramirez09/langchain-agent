const onDropRef: { current: ((files: any[], rejections: any[]) => void) | null } = { current: null }
jest.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }: any) => {
    onDropRef.current = onDrop
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
    }
  },
}))
jest.mock('@/utils/use-toast', () => ({ toast: jest.fn() }))

import { render, screen, act } from '@testing-library/react'
import { FileUpload } from '../FileUpload'
import { toast } from '@/utils/use-toast'

describe('FileUpload', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the dropzone hint', () => {
    render(
      <FileUpload
        setDocument={jest.fn()}
        setIsLoading={jest.fn()}
        setModalOpen={jest.fn()}
      />,
    )
    expect(screen.getByText('Add Your Document')).toBeInTheDocument()
  })

  it('toasts a friendly message when file is too large', () => {
    render(
      <FileUpload
        setDocument={jest.fn()}
        setIsLoading={jest.fn()}
        setModalOpen={jest.fn()}
      />,
    )
    act(() => {
      onDropRef.current!([], [{ errors: [{ code: 'file-too-large' }] }])
    })
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringMatching(/10MB/),
      }),
    )
  })

  it('forwards an accepted file via setDocument', () => {
    const setDocument = jest.fn()
    render(
      <FileUpload
        setDocument={setDocument}
        setIsLoading={jest.fn()}
        setModalOpen={jest.fn()}
      />,
    )
    const file = new File(['hi'], 'a.pdf', { type: 'application/pdf' })
    act(() => {
      onDropRef.current!([file], [])
    })
    expect(setDocument).toHaveBeenLastCalledWith(file)
  })
})
