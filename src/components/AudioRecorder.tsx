import { useEffect, useRef, useState } from 'react'

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

async function saveAudio(key: string, blob: Blob) {
  const db = await openDB()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

async function loadAudio(key: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((res) => {
    const tx = db.transaction(STORE, 'readonly')
    const rq = tx.objectStore(STORE).get(key)
    rq.onsuccess = () => res((rq.result as Blob) ?? null)
    rq.onerror = () => res(null)
  })
}

export default function AudioRecorder({
  audioKey,
  name,
  canRecord = true,
}: {
  audioKey: string
  name: string
  /** Unseated visitors may listen but not record. */
  canRecord?: boolean
}) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [has, setHas] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    loadAudio(audioKey).then(async (b) => {
      if (b) {
        setHas(true)
        setUrl(URL.createObjectURL(b))
      }
    })
  }, [audioKey])

  async function start() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = (e) => chunks.current.push(e.data)
      mr.onstop = async () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        await saveAudio(audioKey, blob)
        setHas(true)
        setUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      setRec(mr)
    } catch {
      setErr('The microphone refused. Check the browser’s permission and try again.')
    }
  }

  function stop() {
    rec?.stop()
    setRec(null)
  }

  return (
    <div className="char-card">
      <h3 className="ritual m-0 text-[1.25rem] leading-snug">Last words — {name}</h3>
      <p className="m-0 mt-1 text-[0.88rem] leading-6 text-[var(--text-secondary)]">
        Your name, and what you leave behind. It will be played when the room is dark.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canRecord ? (
          !rec ? (
            <button className="btn btn-quiet" onClick={start}>
              Record last words
            </button>
          ) : (
            <button className="btn btn-primary" onClick={stop} aria-live="polite">
              Stop and keep — recording
            </button>
          )
        ) : (
          <p className="m-0 text-[0.85rem] text-[var(--text-muted)]">
            Only seated players record.
          </p>
        )}
        {has && !rec && <span className="tag">Kept</span>}
      </div>
      {err && (
        <p className="inline-error mt-3" role="alert">
          {err}
        </p>
      )}
      {url && <audio className="mt-3" controls src={url} aria-label={`Last words of ${name}`} />}
    </div>
  )
}
