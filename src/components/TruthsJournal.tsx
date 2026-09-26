import { useState } from 'react'
import { validateTruth, type TruthEntry } from '../lib/ten-candles'

export default function TruthsJournal({
  truths,
  candlesLit,
  userName,
  onAdd,
}: {
  truths: TruthEntry[]
  candlesLit: number
  userName: string
  onAdd: (text: string) => string | null | Promise<string | null>
}) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const v = validateTruth(text)
    if (v) {
      setErr(v)
      return
    }
    setBusy(true)
    try {
      const e = await onAdd(text.trim())
      if (e) setErr(e)
      else {
        setErr(null)
        setText('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="h-truths">
      <h2 id="h-truths" className="ritual m-0 text-[1.7rem]">
        Truths
      </h2>
      <p className="m-0 mt-1 max-w-[62ch] text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        Each fallen candle asks one truth of everyone at the table. The keeper speaks first:{' '}
        <span className="ritual-italic text-[var(--text-primary)]">
          “These things are true. The world is dark.”
        </span>{' '}
        A truth may build on another, never undo one — and never weaken what hunts you.
      </p>

      <div className="mt-4 flex gap-2.5">
        <input
          className="field"
          aria-label={`Add a truth as ${userName}`}
          placeholder="Water left standing carries whispers…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="btn btn-quiet shrink-0" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? 'Writing…' : 'Speak it'}
        </button>
      </div>
      {err && (
        <p className="inline-error mt-3" role="alert">
          {err}
        </p>
      )}

      <div className="mt-5 space-y-4" aria-live="polite" aria-label="Spoken truths">
        {truths.length === 0 && (
          <p className="text-[0.95rem] text-[var(--text-muted)]">
            Nothing is written yet. Put out a candle to begin.
          </p>
        )}
        {truths.map((t) => (
          <div key={t.id} className="truth">
            <p className="m-0 text-[0.78rem] font-semibold tracking-wide text-[var(--text-muted)]">
              {t.author} <span aria-hidden="true">·</span> {t.candleLeft} candles remaining
            </p>
            <p className="m-0 mt-1 text-[1.02rem] leading-7">{t.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[0.85rem] text-[var(--text-muted)]">
        {candlesLit} {candlesLit === 1 ? 'candle' : 'candles'} remaining.
      </p>
    </section>
  )
}
