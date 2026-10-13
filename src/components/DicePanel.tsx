import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DiceTray, type TraySpec } from '../lib/dice-tray'
import { brinkUnlocked, darkPoolSize, poolSize, topCard } from '../game/engine'
import type { Action, ConflictRoll, NightState } from '../game/types'

type RollKind = 'roll' | 'rerollOnes' | 'brink'

function specsOf(r: ConflictRoll): TraySpec[] {
  return [
    ...r.light.map((value) => ({ scheme: 'light' as const, value })),
    ...r.dark.map((value) => ({ scheme: 'dark' as const, value })),
    ...(r.hope !== null ? [{ scheme: 'hope' as const, value: r.hope }] : []),
  ]
}

function verdictOf(r: ConflictRoll, actorName: string | null): { kicker: string; title: string; body: string } {
  if (r.outcome === 'failure') {
    return {
      kicker: 'Failure',
      title: 'The dark takes this one.',
      body:
        `${r.playerSixes === 0 && r.hope === null ? 'No six answered. ' : ''}` +
        (r.onesSetAside > 0
          ? `${r.onesSetAside} ${r.onesSetAside === 1 ? 'die goes' : 'dice go'} to the dark for the rest of the scene. `
          : '') +
        'A candle is darkened, and the table speaks the truths.',
    }
  }
  if (r.outcome === 'success_them') {
    return {
      kicker: 'Success, at a price',
      title: 'They rolled more sixes.',
      body: `${r.playerSixes} against Their ${r.gmSixes}. ${actorName ?? 'The table'} succeeds — but the keeper describes what the success looks like, and what it costs.`,
    }
  }
  return {
    kicker: 'Success',
    title: 'The light holds.',
    body: `${r.playerSixes} ${r.playerSixes === 1 ? 'six' : 'sixes'} against Their ${r.gmSixes}. ${actorName ?? 'The table'} describes what the success wins — and ${r.onesSetAside > 0 ? `${r.onesSetAside === 1 ? 'one die is' : `${r.onesSetAside} dice are`} set aside` : 'no dice are lost'}.`,
  }
}

export default function DicePanel({
  state,
  dispatch,
}: {
  state: NightState
  dispatch: (a: Action) => void
}) {
  const [actorId, setActorId] = useState<string>('__table')
  const [useHope, setUseHope] = useState(false)
  const [open, setOpen] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [darkenBy, setDarkenBy] = useState<string>('__gm')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const trayRef = useRef<DiceTray | null>(null)
  const prevRoll = useRef<ConflictRoll | null>(null)
  const pendingKind = useRef<RollKind | null>(null)

  const roll = state.lastRoll
  const actor = roll?.actorId ? state.survivors.find((s) => s.id === roll.actorId) ?? null : null
  const actorName = actor?.name.trim() || null
  const chosenActor = actorId === '__table' ? null : state.survivors.find((s) => s.id === actorId) ?? null
  const top = chosenActor ? topCard(chosenActor) : null
  const gmName = state.gmName.trim() || 'The keeper'

  // Own the tray canvas while the overlay lives.
  useEffect(() => {
    if (!open || !canvasRef.current) return
    const tray = new DiceTray(canvasRef.current)
    trayRef.current = tray
    const onResize = () => tray.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      tray.destroy()
      trayRef.current = null
    }
  }, [open])

  // Whenever the engine produces a new roll, stage it on the tray.
  useEffect(() => {
    const tray = trayRef.current
    if (!roll || roll === prevRoll.current) return
    const before = prevRoll.current
    prevRoll.current = roll
    const kind = pendingKind.current
    pendingKind.current = null
    if (!tray) return
    setRolling(true)
    let done: Promise<void>
    if (kind === 'rerollOnes' && before) {
      // retoss only the dice that showed one; values align by index
      const ids = tray.idsOfSettled('light', 1)
      const values = roll.light.filter((_, i) => before.light[i] === 1)
      done = ids.length > 0 ? tray.retoss(ids, values) : Promise.resolve()
    } else if (kind === 'brink' && before) {
      const ids = tray.idsOfScheme('light')
      done = ids.length > 0 ? tray.retoss(ids, roll.light) : Promise.resolve()
    } else {
      tray.clear()
      done = tray.roll(specsOf(roll))
    }
    void done.then(() => setRolling(false))
  }, [roll])

  function doRoll() {
    pendingKind.current = 'roll'
    setOpen(true)
    setUseHope(false)
    dispatch({ type: 'conflict/roll', actorId: chosenActor?.id ?? null, useHope })
  }

  function burnTrait() {
    if (!actor || !roll) return
    pendingKind.current = 'rerollOnes'
    dispatch({ type: 'conflict/rerollOnes', actorId: actor.id })
  }

  function revealBrink() {
    if (!actor || !roll) return
    pendingKind.current = 'brink'
    dispatch({ type: 'brink/reroll', actorId: actor.id })
  }

  function darken() {
    dispatch({ type: 'scene/darken', by: darkenBy === '__gm' ? gmName : darkenBy })
    setOpen(false)
  }

  const canBurn =
    !!roll && !!actor && top !== null && (top.kind === 'virtue' || top.kind === 'vice') && roll.light.includes(1)
  const canBrink =
    !!roll &&
    !!actor &&
    roll.outcome === 'failure' &&
    roll.actorId === actor.id &&
    brinkUnlocked(actor) &&
    !actor.brinkRevealed
  const verdict = roll ? verdictOf(roll, actorName) : null

  return (
    <section aria-labelledby="h-dice">
      <h2 id="h-dice" className="ritual m-0 text-[1.7rem]">
        Conflicts
      </h2>
      <p className="m-0 mt-1 max-w-[62ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
        The table rolls <strong className="nums text-[var(--text-primary)]">{poolSize(state)}</strong>{' '}
        {poolSize(state) === 1 ? 'die' : 'dice'}
        {state.lostOnes > 0 && (
          <>
            {' '}
            — <span className="nums">{state.lostOnes}</span> already{' '}
            {state.lostOnes === 1 ? 'lost' : 'lost'} to ones this scene
          </>
        )}
        . They answer with{' '}
        <strong className="nums text-[var(--text-primary)]">{darkPoolSize(state)}</strong>. A six
        succeeds; ones are set aside; no six darkens a candle.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-[minmax(11rem,13rem)_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="actor">
            Who acts
          </label>
          <select
            id="actor"
            className="field mt-1.5"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value)
              setUseHope(false)
            }}
          >
            <option value="__table">The table</option>
            {state.survivors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.trim() || 'Unnamed'}
              </option>
            ))}
          </select>
        </div>
        {chosenActor?.hopeDie && (
          <label className="flex items-center gap-2.5 text-[0.92rem] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={useHope}
              onChange={(e) => setUseHope(e.target.checked)}
              className="accent-[var(--flame)]"
              style={{ width: '1.1rem', height: '1.1rem' }}
            />
            Add {chosenActor.name.trim() || 'their'} hope die — a five or six counts, never lost
          </label>
        )}
        <button
          type="button"
          className="btn btn-primary sm:justify-self-end"
          onClick={doRoll}
        >
          Roll the dice
        </button>
      </div>

      {poolSize(state) === 0 && (
        <p className="notice mt-4">
          Every die this scene is lost to the dark. The next roll can only fail — spend what you
          have, then let the candle go.
        </p>
      )}

      {/* the roll overlay — portaled so ancestor transforms can't break `position: fixed` */}
      {open &&
        createPortal(
          <div className="ro-root">
          <button
            type="button"
            className="ro-backdrop"
            aria-label="Close the roll"
            disabled={rolling}
            onClick={() => setOpen(false)}
          />
          <canvas ref={canvasRef} className="ro-canvas" />
          <div className="ro-top">
            {rolling && (
              <span className="ro-pill">
                <span className="ro-spinner" aria-hidden="true" />
                The bones are cast…
              </span>
            )}
          </div>
          {!rolling && verdict && roll && (
            <div className="ro-bottom">
              <div
                className={`ro-card ro-pop ${
                  roll.outcome === 'failure' ? 'ro-failure' : roll.outcome === 'success_them' ? 'ro-price' : 'ro-success'
                }`}
                role="status"
              >
                <p className="ro-kicker">{verdict.kicker}</p>
                <p className="ro-title">{verdict.title}</p>
                <p className="ro-verdict">{verdict.body}</p>

                <div className="ro-groups">
                  <div className="ro-group">
                    <span className="ro-group-label">Light</span>
                    <span className="ro-chips">
                      {roll.light.map((v, i) => (
                        <span key={i} className={`ro-chip ${v === 6 ? 'ro-chip-six' : v === 1 ? 'ro-chip-one' : ''}`}>
                          {v}
                        </span>
                      ))}
                      {roll.light.length === 0 && <span className="text-[0.85rem] text-[var(--text-muted)]">no dice left</span>}
                    </span>
                  </div>
                  {roll.dark.length > 0 && (
                    <div className="ro-group">
                      <span className="ro-group-label">The dark</span>
                      <span className="ro-chips">
                        {roll.dark.map((v, i) => (
                          <span key={i} className={`ro-chip ro-chip-dark ${v === 6 ? 'ro-chip-six-dark' : ''}`}>
                            {v}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                  {roll.hope !== null && (
                    <div className="ro-group">
                      <span className="ro-group-label">Hope</span>
                      <span className="ro-chips">
                        <span className="ro-chip ro-chip-hope">{roll.hope}</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="ro-actions">
                  {canBurn && top && (
                    <button type="button" className="btn btn-quiet" onClick={burnTrait}>
                      Burn the {top.kind} — “{top.text}” — and reroll the ones
                    </button>
                  )}
                  {canBrink && (
                    <button type="button" className="btn btn-quiet" onClick={revealBrink}>
                      Go past the brink — throw the whole pool again
                    </button>
                  )}
                  {roll.outcome === 'failure' ? (
                    <span className="flex flex-wrap items-center justify-center gap-2.5">
                      <label className="sr-only" htmlFor="darken-by">
                        Who darkens the candle
                      </label>
                      <select
                        id="darken-by"
                        className="field !w-auto"
                        value={darkenBy}
                        onChange={(e) => setDarkenBy(e.target.value)}
                      >
                        <option value="__gm">{gmName} (keeper)</option>
                        {state.survivors.map((s) => (
                          <option key={s.id} value={s.name.trim() || 'Unnamed'}>
                            {s.name.trim() || 'Unnamed'}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-primary" onClick={darken}>
                        Darken a candle
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                      Back to the scene
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>,
          document.body,
        )}
    </section>
  )
}
