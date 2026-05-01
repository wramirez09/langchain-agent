jest.mock('@/utils/use-media-query', () => ({
  useMediaQuery: jest.fn(() => true),
}))
jest.mock('react-select/creatable', () => ({
  __esModule: true,
  default: ({ placeholder, onChange, isDisabled }: any) => (
    <div>
      <span>{placeholder}</span>
      <button
        disabled={isDisabled}
        onClick={() => onChange({ value: 'foo', label: 'Foo' })}
      >
        pick
      </button>
    </div>
  ),
}))

import { render, screen, fireEvent } from '@testing-library/react'
import CreatableSelect from '../CreatableSelect'

describe('CreatableSelect', () => {
  it('renders placeholder and forwards selection value', () => {
    const onChange = jest.fn()
    render(
      <CreatableSelect
        options={[{ value: 'a', label: 'A' }] as any}
        onChange={onChange}
        placeholder="Pick one"
      />,
    )
    expect(screen.getByText('Pick one')).toBeInTheDocument()
    fireEvent.click(screen.getByText('pick'))
    expect(onChange).toHaveBeenCalledWith('foo')
  })

  it('respects isDisabled', () => {
    render(
      <CreatableSelect options={[]} onChange={jest.fn()} isDisabled />,
    )
    expect(screen.getByText('pick')).toBeDisabled()
  })
})
