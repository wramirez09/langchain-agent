jest.mock('../drawer', () => ({
  Drawer: ({ children }: any) => <div>{children}</div>,
  DrawerContent: ({ children }: any) => <div>{children}</div>,
  DrawerHeader: ({ children }: any) => <div>{children}</div>,
  DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: any) => <p>{children}</p>,
}))
jest.mock('../AutoCompleteSelect', () => ({
  StatusList: ({ options, onChange, setOpen }: any) => (
    <ul>
      {options.map((o: any) => (
        <li key={o.value}>
          <button
            onClick={() => {
              onChange(o.value)
              setOpen(false)
            }}
          >
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  ),
}))

import { render, screen, fireEvent } from '@testing-library/react'
import MobileDrawer from '../MobileDrawer'

describe('MobileDrawer', () => {
  it('renders the four expected actions', () => {
    render(
      <MobileDrawer
        open
        setOpen={jest.fn()}
        onChange={jest.fn()}
        messages={[]}
      />,
    )
    expect(screen.getByText('PreAuth Form')).toBeInTheDocument()
    expect(screen.getByText('File Upload')).toBeInTheDocument()
    expect(screen.getByText('PDF Export')).toBeInTheDocument()
    expect(screen.getByText('Clear Chat')).toBeInTheDocument()
  })

  it('passes selected option value to onChange', () => {
    const onChange = jest.fn()
    render(
      <MobileDrawer
        open
        setOpen={jest.fn()}
        onChange={onChange}
        messages={[]}
      />,
    )
    fireEvent.click(screen.getByText('PDF Export'))
    expect(onChange).toHaveBeenCalledWith('export')
  })
})
