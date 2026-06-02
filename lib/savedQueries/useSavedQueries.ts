'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { listQueries, type SavedQuery } from './db'

/**
 * Reactive, per-user list of saved queries (newest first). Re-queries when
 * `userId` changes and returns an empty list when signed out. SSR-safe:
 * useLiveQuery registers its querier inside an effect, so getDb() (client-only)
 * never runs during server render.
 */
export function useSavedQueries(userId: string | null): {
  queries: SavedQuery[]
  isLoading: boolean
} {
  const queries = useLiveQuery(
    () => (userId ? listQueries(userId) : Promise.resolve([] as SavedQuery[])),
    [userId],
  )

  return { queries: queries ?? [], isLoading: queries === undefined }
}
