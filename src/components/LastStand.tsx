import { useState } from 'react'
import type { Action, NightState } from '../game/types'

/**
 * The Last Stand: the final candle is out. No more dice, no more scenes —
 * only lives, spent one at a time, until the last character falls.
 */
export default function LastStand({
  state,
  dispatch,
}: {
  state: NightState
  dispatch: (a: Action) => void
}) {
  const [facing, setFacing] = useState<string | null>(null)
  const facingSurvivor = state.survivors.find((s) => s.id === facing) ?? null

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(3rem, 10vh, 6rem)', paddingBottom: '5rem' }}>
      <p className="label">The last candle is out</p>
      <h1 className="ritual m-0 mt-3 max-w-[24ch] text-4xl leading-[1.08] sm:text-6xl">
        The Last Stand
      </h1>
      <p className="prose-measure mt-5 max-w-[62ch] text-[1.05rem] leading-8 text-[var(--text-secondary)]">
        There are no more candles to darken and no more dice to roll. The only candle left is
        each character's life: any conflict can now succeed only in exchange for it. Tell the
        final scenes out loud — when a character's fight is over, they fall, and their player
        says how.
      </p>

      <div className="mt-10 space-y-3">
        {state.survivors.map((s) => (
          <div key={s.id} className={`char-card ${!s.alive ? 'burned' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className={`ritual m-0 text-[1.4rem] ${!s.alive ? 'fallen' : ''}`}>
                  {s.name.trim() || 'Unnamed'}
                </h3>
                <p className="m-0 mt-0.5 text-[0.85rem] text-[var(--text-muted)]">
                  {s.alive ? 'still in the dark' : 'fallen'}
                </p>
              </div>
              {s.alive && (
                <button type="button" className="btn btn-quiet" onClick={() => setFacing(s.id)}>
                  Face the dark
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {facingSurvivor && (
        <div className="modal-root" role="dialog" aria-modal="true" aria-label="A final conflict">
          <button type="button" className="modal-backdrop" aria-label="Cancel" onClick={() => setFacing(null)} />
          <div className="modal-card !max-w-lg text-center">
            <p className="label m-0">A final conflict</p>
            <p className="ritual m-0 mt-2 text-2xl leading-snug">
              {facingSurvivor.name.trim() || 'Unnamed'} can win this — for their life.
            </p>
            <p className="m-0 mt-3 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
              Narrate the last stand: what they attempt, what it costs, and how the dark finally
              takes them. When the story is told, they fall.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  dispatch({ type: 'laststand/fall', actorId: facingSurvivor.id })
                  setFacing(null)
                }}
              >
                They fall
              </button>
              <button type="button" className="btn-text" onClick={() => setFacing(null)}>
                Not yet — they fight on
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
