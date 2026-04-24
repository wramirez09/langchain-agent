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

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 py-3 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs sm:text-sm text-gray-600">
            © {currentYear} NoteDoctor.Ai. All rights reserved.
          </div>

          <div className="hidden sm:flex items-center gap-6 text-xs sm:text-sm">
            <Link
              href="/legal/terms-of-service"
              className="text-blue-600 underline hover:text-blue-900 transition-colors underline-offset-2"
              prefetch={true}
            >
              Terms of Service
            </Link>
            <Link
              href="/legal/privacy-policy"
              className="text-blue-600 underline hover:text-blue-900 transition-colors underline-offset-2"
              prefetch={true}
            >
              Privacy Policy
            </Link>
            <a
              href="mailto:sales@notedoctor.ai"
              className="text-blue-600 underline hover:text-blue-900 transition-colors underline-offset-2"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
