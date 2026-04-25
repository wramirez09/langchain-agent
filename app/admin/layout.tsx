import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')

  // Only enforce auth on sub-routes, not the login page itself
  const isLoggedIn = session?.value === '1'

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {isLoggedIn && (
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-semibold text-gray-800">NoteDoctor Admin</span>
          </div>
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign out
            </button>
          </form>
        </header>
      )}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
