'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useCurrentUserId } from '@/lib/savedQueries/useCurrentUserId'
import { useSavedQueries } from '@/lib/savedQueries/useSavedQueries'
import { clearAll, deleteQuery, type SavedQuery } from '@/lib/savedQueries/db'
import { type Determination } from '@/lib/priorAuth/artifactSchema'

dayjs.extend(relativeTime)

const DETERMINATION_BADGE: Record<Determination, string> = {
  meets_criteria: 'bg-[#edfcf2] border-[#bbf0cb] text-[#15803d]',
  conditional: 'bg-[#fff8ec] border-[#f7e0b0] text-[#b45309]',
  more_info_needed: 'bg-[#fff8ec] border-[#f7e0b0] text-[#b45309]',
  likely_denial: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
  not_supported: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
}

interface SavedQueriesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReapply: (saved: SavedQuery) => void
}

export function SavedQueriesSheet({
  open,
  onOpenChange,
  onReapply,
}: SavedQueriesSheetProps) {
  const userId = useCurrentUserId()
  const { queries, isLoading } = useSavedQueries(userId)
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setBusyId(id)
    try {
      await deleteQuery(id)
    } catch (e) {
      toast.error('Could not delete', { description: (e as Error)?.message })
    } finally {
      setBusyId(null)
    }
  }

  const handleClearAll = async () => {
    if (!userId || queries.length === 0) return
    if (!window.confirm('Delete all saved queries? This cannot be undone.')) return
    try {
      await clearAll(userId)
      toast.success('Saved queries cleared')
    } catch (e) {
      toast.error('Could not clear', { description: (e as Error)?.message })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 border-b px-5 py-4">
          <SheetTitle className="text-base">Saved Queries</SheetTitle>
          {queries.length > 0 ? (
            <button
              onClick={handleClearAll}
              className="text-xs font-medium text-gray-500 transition-colors hover:text-red-600"
            >
              Clear all
            </button>
          ) : null}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2.5 px-5 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : queries.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                No saved queries yet. Generate a response and click{' '}
                <span className="font-medium text-gray-700">Save</span> to keep it
                here.
              </div>
            ) : (
              queries.map((q) => (
                <SavedRow
                  key={q.id}
                  q={q}
                  busy={busyId === q.id}
                  onReapply={() => onReapply(q)}
                  onDelete={() => handleDelete(q.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function SavedRow({
  q,
  busy,
  onReapply,
  onDelete,
}: {
  q: SavedQuery
  busy: boolean
  onReapply: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h4 className="line-clamp-2 text-sm font-semibold text-gray-900">
          {q.title}
        </h4>
        {q.determination ? (
          <span
            className={cn(
              'flex-none whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              DETERMINATION_BADGE[q.determination] ??
                'border-gray-200 bg-gray-50 text-gray-600',
            )}
          >
            {q.determinationLabel ?? q.determination}
          </span>
        ) : null}
      </div>

      <div className="mb-2.5 flex items-center gap-2 text-xs text-gray-500">
        <span
          className={cn(
            'rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
            q.origin === 'form'
              ? 'border-blue-100 bg-blue-50 text-blue-600'
              : 'border-gray-200 bg-gray-50 text-gray-500',
          )}
        >
          {q.origin}
        </span>
        <span>{dayjs(q.createdAt).fromNow()}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onReapply}
          className="h-8 flex-1 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Re-apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete saved query"
          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
