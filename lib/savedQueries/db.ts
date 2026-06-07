import Dexie, { type Table } from 'dexie'
import { type Message } from 'ai'
import { parsePartialJson } from '@/lib/priorAuth/partialJson'
import {
  isPriorAuthArtifact,
  priorAuthArtifactSchema,
  type PriorAuthArtifact,
  type Determination,
  type GuidelineBasis,
} from '@/lib/priorAuth/artifactSchema'
import { messageText, extractArtifact } from '@/lib/priorAuth/extractArtifact'

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
  /**
   * The saved response's JSON artifact, serialized — the authoritative copy.
   * Used on re-apply to rebuild the rendered artifact when the stored message
   * text is unusable (e.g. truncated by the AI SDK content/parts split).
   * Stored as a string (not the parsed object) so Dexie's UpdateSpec key-path
   * types never recurse into the artifact's self-referential criterion tree.
   * Optional + non-indexed, so pre-existing records read without a migration.
   */
  artifactJson?: string
  // Denormalized display fields so the list renders without re-parsing JSON.
  determination?: Determination
  determinationLabel?: string
  guidelineBasis?: GuidelineBasis
  userPreview?: string
  /** Pinned rows sort to the top; they still count toward MAX_SAVED_QUERIES. */
  pinned?: boolean
  /** Stable dedupe key derived from the saved turn (see signatureOf). */
  signature?: string
}

/** Max saved queries per user. Enforced in saveQuery (block-and-replace UX). */
export const MAX_SAVED_QUERIES = 5

/** Thrown by saveQuery when the user is already at MAX_SAVED_QUERIES. */
export class QueryLimitReachedError extends Error {
  constructor() {
    super(`You can save at most ${MAX_SAVED_QUERIES} queries.`)
    this.name = 'QueryLimitReachedError'
  }
}

/**
 * Stable, synchronous signature of a saved turn for duplicate detection. Same
 * conversation (role+content of every message) → same key; a re-query that
 * produces different content → a different key. djb2 over the joined turn.
 * Reads through `messageText` so the AI SDK's content/parts split never makes
 * the same turn hash differently before vs. after save-normalization.
 */
export function signatureOf(chatMessages: Message[]): string {
  const basis = chatMessages.map((m) => `${m.role}␟${messageText(m)}`).join('␞')
  let hash = 5381
  for (let i = 0; i < basis.length; i++) {
    hash = ((hash << 5) + hash) ^ basis.charCodeAt(i)
  }
  // >>> 0 → unsigned; base36 keeps it short.
  return (hash >>> 0).toString(36)
}

/**
 * Flatten the AI SDK's content/parts split into plain `content` so saved
 * records always hold the COMPLETE streamed text (the SDK often leaves only
 * the first chunk in `content` and the full stream in `parts`). Drops `parts`
 * — after normalization `content` is authoritative.
 */
export function normalizeForSave(messages: Message[]): Message[] {
  return messages.map((m) => {
    const { parts: _parts, ...rest } = m as Message & { parts?: unknown }
    return { ...rest, content: messageText(m) }
  })
}

/**
 * Parse the saved turn's response into a full PriorAuthArtifact, or undefined
 * for non-artifact (plain chat) responses. Stored alongside the messages so
 * re-apply can always rebuild the rendered artifact.
 */
export function savedArtifactOf(
  chatMessages: Message[],
): PriorAuthArtifact | undefined {
  const extracted = extractArtifact(chatMessages)
  if (!extracted || !isPriorAuthArtifact(extracted.artifact)) return undefined
  return extracted.artifact as PriorAuthArtifact
}

/**
 * The messages to restore when a saved query is re-applied. Returns the stored
 * turn, except that an unusable artifact response (truncated/corrupted text —
 * fails full schema validation) is rebuilt from the saved `artifactJson` so
 * the artifact always re-renders completely. Stored text that already parses
 * cleanly is kept verbatim, preserving the turn's `signature` for the
 * "already saved" indicator.
 */
export function restoredChatMessages(saved: SavedQuery): Message[] {
  const messages = saved.chatMessages.map((m) => ({ ...m }))
  if (!saved.artifactJson) return messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const parsed = parsePartialJson(m.content ?? '')
    if (!priorAuthArtifactSchema.safeParse(parsed).success) {
      messages[i] = { ...m, content: saved.artifactJson }
    }
    break
  }
  return messages
}

/**
 * Stable partition that floats pinned rows to the top while preserving the
 * incoming order (typically newest-first) within each group.
 */
export function sortPinnedFirst(list: SavedQuery[]): SavedQuery[] {
  const pinned = list.filter((q) => q.pinned)
  const rest = list.filter((q) => !q.pinned)
  return [...pinned, ...rest]
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
}): Promise<{ record: SavedQuery; duplicate: boolean }> {
  // Flatten content/parts BEFORE anything else so the stored text, display
  // meta, artifact, and signature all see the complete response.
  const chatMessages = normalizeForSave(input.chatMessages)
  const signature = signatureOf(chatMessages)

  // Duplicate guard: if this exact turn is already saved, bump its recency and
  // return it instead of creating a near-identical row.
  const existing = await getDb()
    .savedQueries.where('userId')
    .equals(input.userId)
    .filter((q) => q.signature === signature)
    .first()
  if (existing) {
    const now = Date.now()
    await getDb().savedQueries.update(existing.id, { updatedAt: now })
    return { record: { ...existing, updatedAt: now }, duplicate: true }
  }

  // Cap: enforced here so the caller can drive the block-and-replace UX.
  if ((await countQueries(input.userId)) >= MAX_SAVED_QUERIES) {
    throw new QueryLimitReachedError()
  }

  const meta = deriveDisplayMeta(chatMessages, input.formFields)
  const artifact = savedArtifactOf(chatMessages)
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
    chatMessages: JSON.parse(JSON.stringify(chatMessages)),
    artifactJson: artifact ? JSON.stringify(artifact) : undefined,
    ...meta,
    title: input.titleOverride?.trim() || meta.title,
    pinned: false,
    signature,
  }
  await getDb().savedQueries.add(record)
  return { record, duplicate: false }
}

/** Pinned-first, then newest-first list for a single user. */
export async function listQueries(userId: string): Promise<SavedQuery[]> {
  const rows = await getDb()
    .savedQueries.where('[userId+createdAt]')
    .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
    .reverse()
    .toArray()
  return sortPinnedFirst(rows)
}

/** Number of saved queries for a user (backs the MAX_SAVED_QUERIES cap). */
export function countQueries(userId: string): Promise<number> {
  return getDb().savedQueries.where('userId').equals(userId).count()
}

export function getQuery(id: string): Promise<SavedQuery | undefined> {
  return getDb().savedQueries.get(id)
}

export function deleteQuery(id: string): Promise<void> {
  return getDb().savedQueries.delete(id)
}

/**
 * Update the title and/or form-field snapshot of a saved query. Edited fields
 * flow back into the form when the query is re-applied (form-origin saves).
 */
export async function updateQuery(
  id: string,
  changes: { title?: string; formFields?: FormFieldsSnapshot },
): Promise<void> {
  const patch: Partial<SavedQuery> = { updatedAt: Date.now() }
  if (changes.title !== undefined) patch.title = changes.title.trim()
  if (changes.formFields) patch.formFields = { ...changes.formFields }
  await getDb().savedQueries.update(id, patch)
}

/** Pin/unpin a saved query (pinned rows float to the top of the list). */
export async function togglePin(id: string, pinned: boolean): Promise<void> {
  await getDb().savedQueries.update(id, { pinned, updatedAt: Date.now() })
}

/** Clears ONLY the given user's saved queries — never a global wipe. */
export async function clearAll(userId: string): Promise<void> {
  await getDb().savedQueries.where('userId').equals(userId).delete()
}
