jest.mock('../AppSidebar', () => ({
  AppSidebar: ({ activeView, onViewChange }: any) => (
    <div data-testid="sidebar" data-view={activeView}>
      <button onClick={() => onViewChange('upload')}>go-upload</button>
      <button onClick={() => onViewChange('export')}>go-export</button>
    </div>
  ),
}))
jest.mock('../PriorAuthView', () => ({
  PriorAuthView: () => <div data-testid="auth-view">auth view</div>,
}))
jest.mock('../UploadView', () => ({
  UploadView: ({ onUploadComplete }: any) => (
    <div data-testid="upload-view">
      <button onClick={() => onUploadComplete('q')}>simulate-upload</button>
    </div>
  ),
}))
jest.mock('../FileExportView', () => ({
  FileExportView: () => <div data-testid="export-view">export view</div>,
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShellClient } from '../AppShellClient'

describe('AppShellClient', () => {
  it('renders all 3 main views (toggled via CSS) with auth as default', () => {
    render(<AppShellClient />)
    expect(screen.getByTestId('auth-view')).toBeInTheDocument()
    expect(screen.getByTestId('upload-view')).toBeInTheDocument()
    expect(screen.getByTestId('export-view')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar').dataset.view).toBe('auth')
  })

  it('passes upload view selection to sidebar state', async () => {
    const user = userEvent.setup()
    render(<AppShellClient />)
    await user.click(screen.getByText('go-upload'))
    expect(screen.getByTestId('sidebar').dataset.view).toBe('upload')
  })

  it('upload completion navigates back to auth view', async () => {
    const user = userEvent.setup()
    render(<AppShellClient />)
    await user.click(screen.getByText('go-upload'))
    await user.click(screen.getByText('simulate-upload'))
    expect(screen.getByTestId('sidebar').dataset.view).toBe('auth')
  })
})
