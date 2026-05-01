jest.mock('../sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
  SheetClose: ({ children }: any) => <>{children}</>,
}))
jest.mock('../scroll-area', () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}))
jest.mock('../forms/Form', () => ({
  __esModule: true,
  default: () => <div data-testid="form-inputs" />,
}))
jest.mock('@/utils/use-body-pointer-events', () => ({
  useBodyPointerEvents: jest.fn(),
}))

import { render, screen, fireEvent } from '@testing-library/react'
import FlyoutForm from '../FlyoutForm'

describe('FlyoutForm', () => {
  it('renders title and form inputs when open', () => {
    render(
      <FlyoutForm
        openSheet
        setOpenSheet={jest.fn()}
        submitAction={jest.fn()}
        onStateFormStateChange={jest.fn()}
        chatOnChange={jest.fn()}
      />,
    )
    expect(screen.getByText(/Prior Authorization Request/)).toBeInTheDocument()
    expect(screen.getByTestId('form-inputs')).toBeInTheDocument()
  })

  it('submits and closes on Submit click', () => {
    const submit = jest.fn()
    const setOpenSheet = jest.fn()
    render(
      <FlyoutForm
        openSheet
        setOpenSheet={setOpenSheet}
        submitAction={submit}
        onStateFormStateChange={jest.fn()}
        chatOnChange={jest.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(submit).toHaveBeenCalled()
    expect(setOpenSheet).toHaveBeenCalledWith(false)
  })
})
