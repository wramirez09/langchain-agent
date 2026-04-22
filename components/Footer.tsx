'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export function Footer() {
  const currentYear = new Date().getFullYear()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
    let active = false
    const timer = setTimeout(() => { active = true }, 400)
    let lastY = 0

    const handler = (e: Event) => {
      if (!active) return
      const target = e.target as Element
      const currentY = target.scrollTop ?? 0
      if (currentY > lastY) {
        setVisible(true)
      } else {
        setVisible(false)
      }
      lastY = currentY
    }

    window.addEventListener('scroll', handler, { capture: true, passive: true })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handler, { capture: true })
    }
  }, [])

  if (!mounted) return null

  return (
    <motion.footer
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 py-3 px-4"
      initial={{ y: '100%' }}
      animate={{ y: visible ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 250 }}
    >
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
    </motion.footer>
  )
}
