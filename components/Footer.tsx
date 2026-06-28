'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function Footer() {
  const pathname = usePathname()
  const currentYear = new Date().getFullYear()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || pathname.startsWith('/agents') || pathname.startsWith('/protected')) return null

  // Footer text + link styling ported from the imported legal-page design.
  const linkClass = 'text-[13px] text-[#238dd2] hover:underline'

  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 bg-white border-t border-[#eef0f3] px-10 py-4 max-[860px]:justify-center max-[860px]:px-4">
      <div className="text-[13px] text-[#7c8492]">
        © {currentYear} NoteDoctorAi. All rights reserved.
      </div>
      <nav className="flex gap-7">
        <Link href="/legal/terms-of-service" className={linkClass} prefetch={true}>
          Terms of Service
        </Link>
        <Link href="/legal/privacy-policy" className={linkClass} prefetch={true}>
          Privacy Policy
        </Link>
        <a href="mailto:sales@notedoctor.ai.com" className={linkClass}>
          Contact
        </a>
      </nav>
    </footer>
  )
}
