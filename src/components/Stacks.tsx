import { brinkUnlocked, stackOf, topCard } from '../game/engine'
import type { Action, NightState } from '../game/types'
import { useState } from 'react'

/**
 * The survivors' stacks during play: what burns, what has burned, and the
 * buttons the fiction calls for — living a moment, going past a brink.
 */
export default function Stacks({
  state,
  dispatch,
}: {
  state: NightState
  dispatch: (a: Action) => void
}) {
  return (
    <section aria-labelledby="h-stacks">
      <h2 id="h-stacks" className="ritual m-0 text-[1.7rem]">
        The stacks
      </h2>
      <p className="m-0 mt-1 max-w-[56ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
        Cards burn from the top, one at a time, worked into the story. The brink stays sealed
        until everything above it has burned.
      </p>

      <div className="mt-4 space-y-4">
        {state.survivors.map((s) => (
          <SurvivorStack key={s.id} state={state} dispatch={dispatch} survivorId={s.id} />
        ))}
      </div>
    </section>
  )
}

function SurvivorStack({
  state,
  dispatch,
  survivorId,
}: {
  state: NightState
  dispatch: (a: Action) => void
  survivorId: string
}) {
  const s = state.survivors.find((x) => x.id === survivorId)!
  const [confirmMoment, setConfirmMoment] = useState(false)
  const top = topCard(s)
  const canLiveMoment = top?.kind === 'moment'
  const brinkReady = brinkUnlocked(s) && !s.brinkRevealed

  return (
    <article className="char-card" aria-label={`Stack for ${s.name || 'a survivor'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="ritual m-0 text-[1.3rem]">{s.name.trim() || 'Unnamed'}</h3>
        <p className="m-0 text-[0.8rem] font-semibold text-[var(--text-secondary)]">
          {s.hopeDie ? 'Hope die lit' : 'No hope die yet'}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {stackOf(s).map((c, i) => {
          const isTop = top !== null && c === top
          const sealed = c.kind === 'brink' && !s.brinkRevealed && !c.burned
          return (
            <div
              key={c.kind}
              className={`stack-card ${c.burned ? 'burned' : ''} ${isTop ? 'top' : ''}`}
              aria-label={`${c.kind}, ${c.burned ? 'burned' : isTop ? 'top of the stack' : 'waiting'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="label m-0">
                  {i + 1} · {c.kind}
                  {isTop && !c.burned && <span className="text-[var(--flame)]"> — burns next</span>}
                </p>
                {sealed && (
                  <button
                    type="button"
                    className="btn-text"
                    title="Hold to read it to yourself"
                    onClick={(e) => {
                      const el = e.currentTarget.nextElementSibling
                      if (el instanceof HTMLElement) {
                        el.hidden = false
                        window.setTimeout(() => {
                          el.hidden = true
                        }, 2500)
                      }
                    }}
                  >
                    Peek
                  </button>
                )}
              </div>
              {c.burned ? (
                <p className="stack-text m-0 mt-1">{c.text}</p>
              ) : sealed ? (
                <p className="stack-text m-0 mt-1 italic text-[var(--text-muted)]" hidden>
                  {c.text}
                </p>
              ) : (
                <p className="stack-text m-0 mt-1">{c.text}</p>
              )}
            </div>
          )
        })}
      </div>

      {canLiveMoment && (
        <div className="mt-3">
          {!confirmMoment ? (
            <button type="button" className="btn-text" onClick={() => setConfirmMoment(true)}>
              Live this moment…
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-3" role="group" aria-label="Confirm living the moment">
              <span className="text-[0.88rem] text-[var(--text-secondary)]">
                It comes true in the story? The card burns and the hope die is lit.
              </span>
              <button
                type="button"
                className="btn btn-quiet !py-1.5"
                onClick={() => {
                  dispatch({ type: 'moment/live', actorId: s.id })
                  setConfirmMoment(false)
                }}
              >
                It comes true
              </button>
              <button type="button" className="btn-text" onClick={() => setConfirmMoment(false)}>
                Not yet
              </button>
            </span>
          )}
        </div>
      )}

      {brinkReady && (
        <p className="m-0 mt-3 text-[0.85rem] leading-6 text-[var(--text-muted)]">
          The brink waits, sealed. When a conflict fails and the story pushes them past it, the
          whole pool can be thrown again — once.
        </p>
      )}
    </article>
  )
}
