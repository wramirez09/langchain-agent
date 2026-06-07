const mockQueries: any[] = []

jest.mock('@/lib/savedQueries/useCurrentUserId', () => ({
  useCurrentUserId: () => 'user-1',
}))
jest.mock('@/lib/savedQueries/useSavedQueries', () => ({
  useSavedQueries: () => ({ queries: mockQueries, isLoading: false }),
}))
jest.mock('@/lib/savedQueries/db', () => ({
  ...jest.requireActual('@/lib/savedQueries/db'),
  deleteQuery: jest.fn().mockResolvedValue(undefined),
  togglePin: jest.fn().mockResolvedValue(undefined),
  updateQuery: jest.fn().mockResolvedValue(undefined),
  clearAll: jest.fn().mockResolvedValue(undefined),
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SavedQueriesPalette } from '../SavedQueriesPalette'
import { deleteQuery, MAX_SAVED_QUERIES } from '@/lib/savedQueries/db'

// cmdk scrolls the selected item into view and observes the list's size;
// jsdom has neither scrollIntoView nor ResizeObserver.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

const fields = {
  guidelines: '',
  state: '',
  treatment: '',
  cptCodes: '',
  diagnosis: '',
  patientHistory: '',
  relevantHistory: '',
}

const fixtures = [
  {
    id: 'q1',
    userId: 'user-1',
    createdAt: Date.now() - 86_400_000,
    updatedAt: Date.now() - 86_400_000,
    title: 'ACDF c5-c6',
    origin: 'form' as const,
    formFields: {
      ...fields,
      treatment: 'ACDF',
      diagnosis: 'radiculopathy',
      state: 'Illinois',
      cptCodes: '22551',
    },
    chatMessages: [],
    determination: 'meets_criteria' as const,
    determinationLabel: 'Meets criteria',
    guidelineBasis: 'medicare' as const,
    pinned: true,
  },
  {
    id: 'q2',
    userId: 'user-1',
    createdAt: Date.now() - 3_600_000,
    updatedAt: Date.now() - 3_600_000,
    title: 'Knee arthroscopy',
    origin: 'chat' as const,
    formFields: { ...fields },
    chatMessages: [],
    userPreview: 'Does knee arthroscopy need prior auth?',
  },
]

describe('SavedQueriesPalette', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQueries.splice(0, mockQueries.length, ...fixtures)
  })

  it('renders saved rows with titles and determination badge', () => {
    render(
      <SavedQueriesPalette
        open
        onOpenChange={() => {}}
        onReapply={() => {}}
      />
    )
    expect(screen.getByText('ACDF c5-c6')).toBeInTheDocument()
    expect(screen.getByText('Knee arthroscopy')).toBeInTheDocument()
    expect(screen.getByText('Meets criteria')).toBeInTheDocument()
    expect(
      screen.getByText(`${fixtures.length}/${MAX_SAVED_QUERIES} saved`)
    ).toBeInTheDocument()
  })

  it('shows request details and meta facts on each row', () => {
    render(
      <SavedQueriesPalette
        open
        onOpenChange={() => {}}
        onReapply={() => {}}
      />
    )
    // Form save: treatment — diagnosis detail line + guidelines/state/CPT facts.
    expect(screen.getByText('ACDF — radiculopathy')).toBeInTheDocument()
    expect(
      screen.getByText('Medicare · Illinois · CPT 22551')
    ).toBeInTheDocument()
    // Chat save: falls back to the saved user message preview.
    expect(
      screen.getByText('Does knee arthroscopy need prior auth?')
    ).toBeInTheDocument()
  })

  it('clicking a row re-applies that query', async () => {
    const user = userEvent.setup()
    const onReapply = jest.fn()
    render(
      <SavedQueriesPalette
        open
        onOpenChange={() => {}}
        onReapply={onReapply}
      />
    )
    await user.click(screen.getByText('Knee arthroscopy'))
    expect(onReapply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q2' })
    )
  })

  it('delete button deletes without re-applying', async () => {
    const user = userEvent.setup()
    const onReapply = jest.fn()
    render(
      <SavedQueriesPalette
        open
        onOpenChange={() => {}}
        onReapply={onReapply}
      />
    )
    await user.click(screen.getAllByLabelText('Delete saved query')[0])
    await waitFor(() => expect(deleteQuery).toHaveBeenCalledWith('q1'))
    expect(onReapply).not.toHaveBeenCalled()
  })

  it('pendingSave shows the banner and Save current query fires onSaveCurrent', async () => {
    const user = userEvent.setup()
    const onSaveCurrent = jest.fn()
    render(
      <SavedQueriesPalette
        open
        onOpenChange={() => {}}
        onReapply={() => {}}
        pendingSave
        onSaveCurrent={onSaveCurrent}
      />
    )
    // 2/5 saved → a slot is free, button enabled.
    expect(
      screen.getByText(/A slot is free — save your current query\./)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save current query' }))
    expect(onSaveCurrent).toHaveBeenCalled()
  })

  it('shows the zero-state when there are no saved queries', () => {
    mockQueries.splice(0, mockQueries.length)
    render(
      <SavedQueriesPalette
        open
        onOpenChange={() => {}}
        onReapply={() => {}}
      />
    )
    expect(screen.getByText(/No saved queries yet/)).toBeInTheDocument()
  })
})
