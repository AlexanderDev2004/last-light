/**
 * Persistence: the night lives in localStorage; recordings live in IndexedDB
 * (blobs do not fit localStorage). No server, no accounts — the table's own
 * browser is the only witness.
 */

const NIGHT_KEY = 'tc:night:v1'

export function loadNight<T>(): T | null {
  try {
    const raw = localStorage.getItem(NIGHT_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveNight(state: unknown): void {
  try {
    localStorage.setItem(NIGHT_KEY, JSON.stringify(state))
  } catch {
    // A full disk or private mode ends the record-keeping, not the night.
  }
}

export function clearNight(): void {
  try {
    localStorage.removeItem(NIGHT_KEY)
  } catch {
    // ignore
  }
}

// --- recordings (IndexedDB) -------------------------------------------------

const DB = 'tc-audio'
const STORE = 'msgs'

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function saveRecording(key: string, blob: Blob): Promise<void> {
  const db = await openDB()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

export async function loadRecording(key: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((res) => {
    const tx = db.transaction(STORE, 'readonly')
    const rq = tx.objectStore(STORE).get(key)
    rq.onsuccess = () => res((rq.result as Blob) ?? null)
    rq.onerror = () => res(null)
  })
}

export async function deleteRecording(key: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => res()
    tx.onerror = () => res()
  })
}
