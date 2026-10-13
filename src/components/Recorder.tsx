import { useEffect, useRef, useState } from 'react'
import { deleteRecording, loadRecording, saveRecording } from '../lib/storage'

/**
 * The final message: recorded before the night begins, played back only in
 * the epilogue's darkness. One recorder per survivor.
 */
export default function Recorder({ recKey, name }: { recKey: string; name: string }) {
  const [recording, setRecording] = useState(false)
  const [has, setHas] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    let revoke: string | null = null
    loadRecording(recKey).then((b) => {
      if (b) {
        revoke = URL.createObjectURL(b)
        setUrl(revoke)
        setHas(true)
      }
    })
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [recKey])

  async function start() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
      )
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' })
        try {
          await saveRecording(recKey, blob)
          setUrl(URL.createObjectURL(blob))
          setHas(true)
        } catch {
          setErr('The message could not be kept.')
        }
      }
      mr.start()
      rec.current = mr
      setRecording(true)
    } catch {
      setErr('No microphone answered. A phone on the table records just as well.')
    }
  }

  function stop() {
    rec.current?.stop()
    rec.current = null
    setRecording(false)
  }

  async function discard() {
    await deleteRecording(recKey)
    setHas(false)
    setUrl(null)
  }

  return (
    <div className="panel-sunken">
      <p className="label m-0">{name}'s final message</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!recording && (
          <button type="button" className="btn btn-quiet !py-1.5" onClick={() => void start()}>
            {has ? 'Record over it' : 'Record'}
          </button>
        )}
        {recording && (
          <>
            <span className="rec-dot" aria-hidden="true" />
            <span className="text-[0.88rem] font-semibold text-[var(--text-secondary)]">
              Recording — speak your last words to the world
            </span>
            <button type="button" className="btn btn-primary !py-1.5" onClick={stop}>
              Stop
            </button>
          </>
        )}
        {has && !recording && (
          <button type="button" className="btn-text danger" onClick={() => void discard()}>
            Discard
          </button>
        )}
      </div>
      {has && url && <audio className="mt-2" controls preload="none" src={url} />}
      {err && (
        <p className="inline-error mt-2" role="alert">
          {err}
        </p>
      )}
    </div>
  )
}
