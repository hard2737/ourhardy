// IndexedDB store for offline audio blobs.
// Each entry holds the raw Blob so playback never depends on the Cache API.

const DB_NAME = "aux-audio-db"
const DB_VERSION = 1
const STORE = "tracks"

interface StoredTrack {
  key: string
  blob: Blob
  size: number
  cachedAt: number
}

// Single shared connection
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "key" })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { dbPromise = null; reject(req.error) }
    })
  }
  return dbPromise
}

export async function getTrackBlob(key: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as StoredTrack | undefined)?.blob ?? null)
    req.onerror = () => reject(req.error)
  })
}

export interface CacheEntry { key: string; size: number }

export async function getAllCacheEntries(): Promise<CacheEntry[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll()
    req.onsuccess = () =>
      resolve((req.result as StoredTrack[]).map(r => ({ key: r.key, size: r.size })))
    req.onerror = () => reject(req.error)
  })
}

export async function deleteTrack(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * Fetch an audio file and persist it to IndexedDB.
 * Calls onProgress with a 0–1 fraction as chunks arrive.
 * Content-Length must be present for accurate progress; falls back to indeterminate (0).
 */
export async function downloadTrack(
  url: string,
  key: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const res = await fetch(url, { mode: "cors" })
  if (!res.ok || !res.body) throw new Error(`Fetch failed: ${res.status}`)

  const total = Number(res.headers.get("content-length") ?? 0)
  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (total > 0) onProgress?.(received / total)
  }

  const blob = new Blob(chunks, {
    type: res.headers.get("content-type") ?? "audio/mpeg",
  })

  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const entry: StoredTrack = { key, blob, size: blob.size, cachedAt: Date.now() }
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(entry)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
