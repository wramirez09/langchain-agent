"use client";

/**
 * IndexedDB persistence for the API Playground's request history.
 *
 * Records are scoped by `${userId}:${orgId}` so histories never bleed across
 * accounts sharing a browser profile. The playground's bearer token itself is
 * ephemeral (minted per request, server-side), so the user+org pair is the
 * stable identity; each record still carries the token environment it ran as.
 *
 * Retention: entries older than 24h are pruned on read, newest-first, capped.
 * Everything degrades to a no-op where IndexedDB is unavailable (SSR, jsdom),
 * so callers can fire-and-forget.
 */

const DB_NAME = "nd-playground";
const DB_VERSION = 1;
const STORE = "requests";
const SCOPE_INDEX = "by-scope";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

export type StoredPlaygroundRequest = {
  id: string;
  scope: string;
  at: number;
  /** Environment of the token the request ran as (playground mints `test`). */
  environment: string;
  endpointKey: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  note: string;
  body: string;
  idempotencyKey: string;
  result: unknown;
};

export function historyScope(userId: string, orgId: string): string {
  return `${userId}:${orgId}`;
}

export function newHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex(SCOPE_INDEX, "scope");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run `fn` in a transaction; resolves when the transaction commits. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => T,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * All of the scope's entries, newest first — pruning anything older than 24h
 * or beyond the cap as a side effect.
 */
export async function listPlaygroundHistory(
  scope: string,
): Promise<StoredPlaygroundRequest[]> {
  if (!hasIdb()) return [];
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const all = await requestToPromise(
        store.index(SCOPE_INDEX).getAll(scope) as IDBRequest<StoredPlaygroundRequest[]>,
      );
      const cutoff = Date.now() - MAX_AGE_MS;
      const sorted = [...all].sort((a, b) => b.at - a.at);
      const keep = sorted.filter((r) => r.at >= cutoff).slice(0, MAX_ENTRIES);
      const keepIds = new Set(keep.map((r) => r.id));
      for (const r of sorted) {
        if (!keepIds.has(r.id)) store.delete(r.id);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return keep;
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function savePlaygroundRequest(
  record: StoredPlaygroundRequest,
): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (store) => {
      store.put(record);
    });
  } catch {
    /* history is best-effort */
  }
}

export async function deletePlaygroundRequest(scope: string, id: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (store) => {
      // Guard on scope so a stale id can never delete another account's row.
      const req = store.get(id) as IDBRequest<StoredPlaygroundRequest | undefined>;
      req.onsuccess = () => {
        if (req.result?.scope === scope) store.delete(id);
      };
    });
  } catch {
    /* history is best-effort */
  }
}

export async function clearPlaygroundHistory(scope: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    await withStore("readwrite", (store) => {
      const req = store.index(SCOPE_INDEX).getAllKeys(scope);
      req.onsuccess = () => {
        for (const key of req.result) store.delete(key);
      };
    });
  } catch {
    /* history is best-effort */
  }
}
