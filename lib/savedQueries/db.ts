import Dexie, { type Table } from 'dexie'
import { type Message } from 'ai'
import { parsePartialJson } from '@/lib/priorAuth/partialJson'
import {
  isPriorAuthArtifact,
  type PriorAuthArtifact,
  type Determination,
  type GuidelineBasis,
} from '@/lib/priorAuth/artifactSchema'

/**
 * Client-side, PER-USER library of saved prior-auth queries (query + response),
 * persisted in IndexedDB via Dexie. Every record carries the signed-in Supabase
 * user id and ALL reads/writes are scoped to it, so two users on the same
 * browser never see each other's saved queries.
 */

export type QueryOrigin = 'form' | 'chat'

export interface FormFieldsSnapshot {
  guidelines: string
  state: string
  treatment: string
  cptCodes: string
  diagnosis: string
  patientHistory: string
  relevantHistory: string
}

export interface SavedQuery {
  id: string
  /** Supabase session.user.id — the per-user scope key. */
  userId: string
  createdAt: number
  updatedAt: number
  title: string
  origin: QueryOrigin
  /** Snapshot of the 7 form fields (all empty strings for chat-origin saves). */
  formFields: FormFieldsSnapshot
  /** Full turn(s): the user query message(s) + the assistant artifact response. */
  chatMessages: Message[]
  // Denormalized display fields so the list renders without re-parsing JSON.
  determination?: Determination
  determinationLabel?: string
  guidelineBasis?: GuidelineBasis
  userPreview?: string
}

const DB_NAME = 'priorAuthSavedQueries'

class SavedQueriesDB extends Dexie {
  savedQueries!: Table<SavedQuery, string>

  constructor() {
    super(DB_NAME)
    // v1. The compound [userId+createdAt] index powers efficient per-user,
    // newest-first listing; `userId` alone backs clearAll(userId).
    //
    // Migration note: adding a new INDEXED field later requires a
    // `this.version(2).stores({...})` bump (+ optional .upgrade()). Adding a
    // non-indexed field needs no bump — keep new SavedQuery fields OPTIONAL so
    // existing records still read.
    this.version(1).stores({
      savedQueries: 'id, [userId+createdAt], userId',
    })
  }
}

// Lazily instantiated and client-only — IndexedDB does not exist on the server.
let _db: SavedQueriesDB | null = null
export function getDb(): SavedQueriesDB {
  if (typeof window === 'undefined') {
    throw new Error('SavedQueries DB is client-only')
  }
  if (!_db) _db = new SavedQueriesDB()
  return _db
}

/**
 * Derive list-display metadata (title, determination, guideline basis, preview)
 * from the saved turn — reuses the artifact parser so rows show real values.
 */
export function deriveDisplayMeta(
  chatMessages: Message[],
  formFields: FormFieldsSnapshot,
): Pick<
  SavedQuery,
  'title' | 'determination' | 'determinationLabel' | 'guidelineBasis' | 'userPreview'
> {
  const lastAssistant = [...chatMessages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content)
  const firstUser = chatMessages.find((m) => m.role === 'user')
  const artifact = lastAssistant
    ? parsePartialJson<PriorAuthArtifact>(lastAssistant.content)
    : null
  const isArtifact = isPriorAuthArtifact(artifact)

  const title =
    (isArtifact && artifact.title) ||
    formFields.treatment ||
    firstUser?.content?.slice(0, 60) ||
    'Untitled query'

  return {
    title,
    determination: isArtifact ? artifact.summary?.determination : undefined,
    determinationLabel: isArtifact ? artifact.summary?.determinationLabel : undefined,
    guidelineBasis: isArtifact ? artifact.guidelineBasis : undefined,
    userPreview: firstUser?.content?.slice(0, 120),
  }
}

export async function saveQuery(input: {
  userId: string
  origin: QueryOrigin
  formFields: FormFieldsSnapshot
  chatMessages: Message[]
  titleOverride?: string
}): Promise<SavedQuery> {
  const meta = deriveDisplayMeta(input.chatMessages, input.formFields)
  const now = Date.now()
  const record: SavedQuery = {
    id: crypto.randomUUID(),
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    origin: input.origin,
    formFields: input.formFields,
    // Plain-object clone so IndexedDB structured-clone never trips on
    // non-clonable fields the AI SDK may attach.
    chatMessages: JSON.parse(JSON.stringify(input.chatMessages)),
    ...meta,
    title: input.titleOverride?.trim() || meta.title,
  }
  await getDb().savedQueries.add(record)
  return record
}

/** Newest-first list for a single user. */
export function listQueries(userId: string): Promise<SavedQuery[]> {
  return getDb()
    .savedQueries.where('[userId+createdAt]')
    .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
    .reverse()
    .toArray()
}

export function getQuery(id: string): Promise<SavedQuery | undefined> {
  return getDb().savedQueries.get(id)
}

export function deleteQuery(id: string): Promise<void> {
  return getDb().savedQueries.delete(id)
}

export async function renameQuery(id: string, title: string): Promise<void> {
  await getDb().savedQueries.update(id, { title: title.trim(), updatedAt: Date.now() })
}

/** Clears ONLY the given user's saved queries — never a global wipe. */
export async function clearAll(userId: string): Promise<void> {
  await getDb().savedQueries.where('userId').equals(userId).delete()
}
