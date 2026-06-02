'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/client'

/**
 * Current signed-in Supabase user id (the per-user scope key for saved
 * queries), or null when signed out / still loading. Stays current via
 * onAuthStateChange so the saved-queries list swaps when the user changes.
 */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setUserId(session?.user?.id ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return userId
}
