import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Action, NightState } from '../game/types'
import { loadRecording } from '../lib/storage'
import Chronicle from './Chronicle'
import Truths from './Truths'

/**
 * The epilogue: the last truth, the final recordings played back in the dark,
 * and everything that was true. Then the screen goes black.
 */
export default function Epilogue({
  state,
  dispatch,
  onNewNight,
}: {
  state: NightState
  dispatch: (a: Action) => void
  onNewNight: () => void
}) {
  const [text, setText] = useState('')
  const [screenOff, setScreenOff] = useState(false)

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(3rem, 9vh, 6rem)', paddingBottom: '5rem' }}>
      <p className="label">Every flame is gone</p>
      <h1 className="ritual m-0 mt-3 max-w-[24ch] text-4xl leading-[1.08] sm:text-6xl">
        The world is dark.
      </h1>

      {!state.finalTruth ? (
        <>
          <p className="prose-measure mt-5 max-w-[62ch] text-[1.05rem] leading-8 text-[var(--text-secondary)]">
            One truth remains to be spoken — the last one. The keeper speaks it, or asks someone
            else to. Make it count.
          </p>
          <div className="mt-6 flex max-w-2xl flex-wrap gap-2.5">
            <input
              className="field min-w-0 flex-1"
              style={{ minWidth: '14rem' }}
              aria-label="The last truth"
              placeholder="The last truth…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim()) {
                  dispatch({ type: 'night/finalTruth', author: state.gmName, text })
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary shrink-0"
              disabled={!text.trim()}
              onClick={() => dispatch({ type: 'night/finalTruth', author: state.gmName, text })}
            >
              Speak it
            </button>
          </div>
        </>
      ) : (
        <p className="ritual-italic mt-6 max-w-[56ch] text-2xl leading-relaxed text-[var(--flame)]">
          “{state.finalTruth.text}” <span className="text-[1rem] text-[var(--text-muted)]">— {state.finalTruth.author}</span>
        </p>
      )}

      <hr className="rule my-10" />

      <section aria-labelledby="h-final-recordings">
        <h2 id="h-final-recordings" className="ritual m-0 text-[1.7rem]">
          The final messages
        </h2>
        <p className="m-0 mt-1 max-w-[60ch] text-[0.95rem] leading-7 text-[var(--text-secondary)]">
          Turn off the lights. Play each recording, one after another, in the dark. Do not bring
          the light back until they have all played.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {state.survivors.map((s) => (
            <FinalRecording key={s.id} recKey={`night:${state.nightId}:rec:${s.id}`} name={s.name || 'Unnamed'} />
          ))}
        </div>
      </section>

      <hr className="rule my-10" />

      <div className="grid gap-10 lg:grid-cols-2">
        <Truths state={state} />
        <Chronicle state={state} />
      </div>

      <hr className="rule my-10" />

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="btn btn-quiet" onClick={() => setScreenOff(true)}>
          Turn the screen off
        </button>
        <button type="button" className="btn-text danger" onClick={onNewNight}>
          Begin a new night
        </button>
      </div>

      {screenOff &&
        createPortal(
          <div className="screen-off" role="status" aria-label="The screen is off. The world is dark.">
            <p className="ritual-italic text-lg text-[#2a2620]">The world is dark.</p>
            <button type="button" className="btn-text" onClick={() => setScreenOff(false)}>
              light, faintly
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

function FinalRecording({ recKey, name }: { recKey: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [found, setFound] = useState<boolean | null>(null)

  useEffect(() => {
    let revoke: string | null = null
    loadRecording(recKey).then((b) => {
      setFound(!!b)
      if (b) {
        revoke = URL.createObjectURL(b)
        setUrl(revoke)
      }
    })
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [recKey])

  if (found === null) return null
  return (
    <div className="panel-sunken">
      <p className="label m-0">{name}'s final message</p>
      {url ? (
        <audio className="mt-2" controls preload="none" src={url} />
      ) : (
        <p className="m-0 mt-2 text-[0.88rem] leading-6 text-[var(--text-muted)]">
          No recording was left behind. Their last words live only in memory.
        </p>
      )}
    </div>
  )
}
