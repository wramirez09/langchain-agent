import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/logout-button'
import { createClient } from '@/utils/server'

export default async function ProtectedPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    redirect('/auth/login')
  }

  return (
    <div className="flex flex-col h-svh w-full items-center justify-center gap-2">
      <p className='text-black'>
        Hello! <span className='font-bold'>{data.claims.email}</span>
      </p>
      <LogoutButton />
    </div>
  )
}
