'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { toast } from 'sonner'
import { Loader2, Pin, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useCurrentUserId } from '@/lib/savedQueries/useCurrentUserId'
import { useSavedQueries } from '@/lib/savedQueries/useSavedQueries'
import {
  clearAll,
  deleteQuery,
  togglePin,
  MAX_SAVED_QUERIES,
  type SavedQuery,
} from '@/lib/savedQueries/db'
import { type Determination } from '@/lib/priorAuth/artifactSchema'
import { GUIDELINE_LABEL } from '@/lib/priorAuth/artifactPresentation'

dayjs.extend(relativeTime)

const DETERMINATION_BADGE: Record<Determination, string> = {
  meets_criteria: 'bg-[#edfcf2] border-[#bbf0cb] text-[#15803d]',
  conditional: 'bg-[#fff8ec] border-[#f7e0b0] text-[#b45309]',
  more_info_needed: 'bg-[#fff8ec] border-[#f7e0b0] text-[#b45309]',
  likely_denial: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
  not_supported: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
}

interface SavedQueriesPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReapply: (saved: SavedQuery) => void
  /** True when a save is blocked by the cap; shows the limit banner. */
  pendingSave?: boolean
  /** Completes the blocked save once a slot is free. */
  onSaveCurrent?: () => void
}

/**
 * Command-palette presentation of the saved-queries library: a centered cmdk
 * modal — type to filter, Enter (or click) re-applies, row icons handle
 * pin/delete.
 */
export function SavedQueriesPalette({
  open,
  onOpenChange,
  onReapply,
  pendingSave = false,
  onSaveCurrent,
}: SavedQueriesPaletteProps) {
  const userId = useCurrentUserId()
  const { queries, isLoading } = useSavedQueries(userId)
  const [busyId, setBusyId] = useState<string | null>(null)

  const atCapacity = queries.length >= MAX_SAVED_QUERIES

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

  const handlePin = async (q: SavedQuery) => {
    setBusyId(q.id)
    try {
      await togglePin(q.id, !q.pinned)
    } catch (e) {
      toast.error('Could not update pin', { description: (e as Error)?.message })
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] w-[calc(100%-2rem)] max-w-2xl translate-y-0 gap-0 overflow-hidden rounded-2xl border border-gray-200 p-0 sm:w-[calc(100%-3rem)]">
        <DialogTitle className="sr-only">Saved Queries</DialogTitle>

        {pendingSave ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-[#fff8ec] px-4 py-2.5">
            <p className="text-xs text-[#b45309]">
              {atCapacity
                ? 'Limit reached — delete a query to free a slot.'
                : 'A slot is free — save your current query.'}
            </p>
            <Button
              size="sm"
              onClick={onSaveCurrent}
              disabled={atCapacity}
              className="h-7 shrink-0 text-xs"
            >
              Save current query
            </Button>
          </div>
        ) : null}

        <Command className="rounded-2xl border-0 bg-white shadow-none">
          <CommandInput
            placeholder="Search saved queries…"
            className="pr-10 text-sm placeholder:text-gray-400"
          />
          <CommandList className="max-h-[420px]">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1} />
                Loading…
              </div>
            ) : queries.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">
                No saved queries yet. Generate a response and click{' '}
                <span className="font-medium text-gray-700">Save</span> to
                keep it here.
              </div>
            ) : (
              <>
                <CommandEmpty className="py-8 text-center text-sm text-gray-500">
                  No matches.
                </CommandEmpty>
                <div className="p-1.5">
                  {queries.map((q) => (
                    <PaletteRow
                      key={q.id}
                      q={q}
                      busy={busyId === q.id}
                      onReapply={() => onReapply(q)}
                      onPin={() => handlePin(q)}
                      onDelete={() => handleDelete(q.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </CommandList>

          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-400">
            <span className="tabular-nums">
              {queries.length}/{MAX_SAVED_QUERIES} saved
            </span>
            <div className="flex items-center gap-4">
              {queries.length > 0 ? (
                <button
                  onClick={handleClearAll}
                  className="font-medium text-gray-400 transition-colors hover:text-red-600"
                >
                  Clear all
                </button>
              ) : null}
              <span className="hidden sm:inline">
                ↵ re-apply · esc close
              </span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function PaletteRow({
  q,
  busy,
  onReapply,
  onPin,
  onDelete,
}: {
  q: SavedQuery
  busy: boolean
  onReapply: () => void
  onPin: () => void
  onDelete: () => void
}) {
  // Action buttons live inside the cmdk item; stop propagation so clicking
  // them never fires the row's onSelect (re-apply).
  const action =
    (fn: () => void) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      fn()
    }

  // One-line request summary under the title: treatment — diagnosis from the
  // form snapshot, falling back to the saved user message for chat saves.
  const detail =
    [q.formFields?.treatment, q.formFields?.diagnosis]
      .filter(Boolean)
      .join(' — ') ||
    q.userPreview ||
    ''

  // Compact meta facts; rendered dot-separated after the origin chip.
  const guidelines =
    (q.guidelineBasis && GUIDELINE_LABEL[q.guidelineBasis]) ||
    q.formFields?.guidelines ||
    ''
  const facts = [
    guidelines,
    q.formFields?.state,
    q.formFields?.cptCodes && `CPT ${q.formFields.cptCodes}`,
  ].filter(Boolean) as string[]

  return (
    <CommandItem
      // Title + key fields so typing filters across all of them; the id
      // guarantees uniqueness for cmdk.
      value={[
        q.title,
        q.formFields?.guidelines,
        q.formFields?.treatment,
        q.formFields?.diagnosis,
        q.formFields?.cptCodes,
        q.formFields?.state,
        q.userPreview,
        q.id,
      ]
        .filter(Boolean)
        .join(' ')}
      onSelect={onReapply}
      className="group cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2.5 data-[selected=true]:bg-[#f4f5f8]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {q.pinned ? (
            <Pin
              className="h-3.5 w-3.5 shrink-0 text-blue-600"
              strokeWidth={1}
              fill="currentColor"
            />
          ) : null}
          <span className="truncate text-sm font-semibold text-gray-900">
            {q.title}
          </span>
        </div>
        {q.determination ? (
          <span
            title={q.determinationLabel ?? q.determination}
            className={cn(
              'mt-1 inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold',
              DETERMINATION_BADGE[q.determination] ??
                'border-gray-200 bg-gray-50 text-gray-600',
            )}
          >
            {q.determinationLabel ?? q.determination}
          </span>
        ) : null}
        {detail ? (
          <p className="mt-1 truncate text-xs leading-snug text-gray-600">
            {detail}
          </p>
        ) : null}
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-gray-500">
          <span
            className={cn(
              'shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide',
              q.origin === 'form'
                ? 'border-blue-100 bg-blue-50 text-blue-600'
                : 'border-gray-200 bg-gray-50 text-gray-500',
            )}
          >
            {q.origin}
          </span>
          {facts.length > 0 ? (
            <span className="truncate text-gray-500">
              {facts.join(' · ')}
            </span>
          ) : null}
          <span className="shrink-0 text-gray-400">
            {dayjs(q.createdAt).fromNow()}
          </span>
        </div>
      </div>

      {/* Row actions — revealed on hover/keyboard selection. */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={action(onPin)}
          disabled={busy}
          aria-label={q.pinned ? 'Unpin saved query' : 'Pin saved query'}
          title={q.pinned ? 'Unpin' : 'Pin to top'}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-md transition-colors',
            q.pinned
              ? 'text-blue-600 hover:text-blue-700'
              : 'text-gray-400 hover:text-blue-600',
          )}
        >
          <Pin
            className="h-3.5 w-3.5"
            strokeWidth={1}
            fill={q.pinned ? 'currentColor' : 'none'}
          />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={action(onDelete)}
          disabled={busy}
          aria-label="Delete saved query"
          title="Delete"
          className="grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:text-red-600"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1} />
          ) : (
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1} />
          )}
        </button>
      </div>
    </CommandItem>
  )
}
