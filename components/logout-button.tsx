'use client'

import { createClient } from '@/utils/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import ManageBillingButton from './ui/ManageBillingButton'

export function LogoutButton() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      setIsLoggedIn(!!session)
    }

    checkAuth()

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Get auth user and then fetch their profile
  useEffect(() => {
    if (!isLoggedIn) return

    const load = async () => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      setUser(user ?? null)

      if (user?.id) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (!error) setProfile(data)
      }
    }

    load()
  }, [isLoggedIn])

  if (!isLoggedIn) return null

  return (
    <div className='flex items-center space-between gap-5'>
      <div className='flex-col'>
        <p className='text-black text-bold uppercase'>
          {profile?.full_name || ""}
        </p>
        <p className='text-black text-xs'>
          {profile?.email || ""}
        </p>

      </div>
      <div className='border-black text-black'>|</div>
      <ManageBillingButton />
      <div className='border-black text-black'>|</div>
      <Button
        onClick={logout}
        variant="link"
        className="border-none hover:shadow-none transition duration-200 ease-in-out text-white z-50 text-red-600"
      >
        Logout
      </Button>

    </div>
  )
}
