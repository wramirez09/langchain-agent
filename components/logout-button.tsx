'use client'

import { createClient } from '@/utils/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      setIsLoggedIn(!!session)
    }

    checkAuth()

    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (!isLoggedIn) return null

  return (
    <Button
      onClick={logout}
      variant="outline"
<<<<<<< Updated upstream
      className="h-9"
=======
      className="h-9 bg-gradient border-none shadow-md hover:shadow-none transition duration-200 ease-in-out"
>>>>>>> Stashed changes
    >
      Logout
    </Button>
  )
}
