import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DiceTray, type TraySpec } from '../lib/dice-tray'
import { brinkUnlocked, darkPoolSize, poolSize, topCard } from '../game/engine'
import { TOTAL_CANDLES } from '../game/types'
import type { Action, ConflictRoll, NightState } from '../game/types'

type RollKind = 'roll' | 'rerollOnes' | 'brink'

// standard d6 pips on a 3×3 grid; pool dice render blank by omitting the value
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}
const PIP_POS: Array<[number, number]> = [
  [26, 26], [50, 26], [74, 26],
  [26, 50], [50, 50], [74, 50],
  [26, 74], [50, 74], [74, 74],
]

const NUM_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
const word = (n: number) => NUM_WORDS[n] ?? String(n)
const said = (n: number) => (n === 0 ? 'none' : word(n).toLowerCase())

/**
 * A die in the DOM — the canvas tray's twin. The pools show blank dice; a
 * roll's dice carry their face: sixes land as embers, ones crack and bleed,
 * and the dark's dice are obsidian. `plain` drops the ember/crack dressing
 * (the hope token is just a lit pip).
 */
export function Die({
  value = 0,
  scheme = 'light',
  small = false,
  gone = false,
  plain = false,
}: {
  value?: number
  scheme?: 'light' | 'dark' | 'hope'
  small?: boolean
  gone?: boolean
  plain?: boolean
}) {
  const cls = [
    'die',
    scheme,
    small ? 'small' : '',
    !plain && value === 6 ? 'six' : '',
    !plain && value === 1 ? 'one' : '',
    gone ? 'gone' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} aria-hidden="true">
      {(value ? PIPS[value] ?? [] : []).map((cell) => {
        const [left, top] = PIP_POS[cell]
        return <span key={cell} className="pip" style={{ left: `${left}%`, top: `${top}%` }} />
      })}
    </span>
  )
}

/** The verdict reads the roll as one sentence, the way the keeper would. */
function TallyLine({ roll }: { roll: ConflictRoll }) {
  if (roll.outcome === 'failure') {
    return (
      <>
        The table found nothing. The dark found <span className="nums">{said(roll.gmSixes)}</span>
        {roll.onesSetAside > 0 ? (
          <>
            {' '}
            — {word(roll.onesSetAside).toLowerCase()} {roll.onesSetAside === 1 ? 'die cracks' : 'dice crack'} away.
          </>
        ) : (
          '.'
        )}
      </>
    )
  }
  if (roll.outcome === 'success_them') {
    return (
      <>
        <span className="nums">{word(roll.playerSixes)}</span> for the table.{' '}
        <span className="nums">{said(roll.gmSixes)}</span> for the dark.
      </>
    )
  }
  return (
    <>
      <span className="nums">{word(roll.playerSixes)}</span> {roll.playerSixes === 1 ? 'six' : 'sixes'} answered the
      table. The dark found <span className="nums">{said(roll.gmSixes)}</span>.
    </>
  )
}

/** Every die that landed, scattered dim behind the verdict's words. */
function VeilDice({ roll }: { roll: ConflictRoll }) {
  const dice: Array<{ value: number; scheme: 'light' | 'dark' | 'hope' }> = [
    ...roll.light.map((value) => ({ value, scheme: 'light' as const })),
    ...roll.dark.map((value) => ({ value, scheme: 'dark' as const })),
    ...(roll.hope !== null ? [{ value: roll.hope, scheme: 'hope' as const }] : []),
  ]
  return (
    <div className="ro-veil-dice" aria-hidden="true">
      {dice.map((d, i) => (
        <span
          key={i}
          className="ro-veil-die"
          style={{
            left: `${3 + ((i * 37) % 88)}%`,
            top: `${6 + ((i * 53) % 76)}%`,
            transform: `rotate(${((i * 47) % 64) - 32}deg)`,
          }}
        >
          <Die value={d.value} scheme={d.scheme} small />
        </span>
      ))}
    </div>
  )
}

/** The ten candles, miniature — the next to die wears a red mark. */
function MiniCandles({ lit }: { lit: number }) {
  return (
    <div className="ro-minis" aria-hidden="true">
      {Array.from({ length: TOTAL_CANDLES }, (_, i) => (
        <span key={i} className={`ro-mini ${i < lit ? '' : 'out'} ${i === lit - 1 ? 'next' : ''}`}>
          <span className="ro-mini-wax" />
          <span className="ro-mini-flame" />
        </span>
      ))}
    </div>
  )
}

function verdictOf(r: ConflictRoll, actorName: string | null): { kicker: string; title: string; sub: string } {
  if (r.outcome === 'failure') {
    return {
      kicker: 'Failure',
      title: 'No six answered.',
      sub:
        r.onesSetAside > 0
          ? `${r.onesSetAside} ${r.onesSetAside === 1 ? 'die cracks and slides' : 'dice crack and slide'} to the dark until the scene turns.`
          : 'No dice are lost — but a candle must take this.',
    }
  }
  if (r.outcome === 'success_them') {
    return {
      kicker: 'Success, at a price',
      title: 'They answered more.',
      sub: `${actorName ?? 'The table'} succeeds — but the keeper describes what the success looks like, and what it costs.`,
    }
  }
  return {
    kicker: 'Success',
    title: 'The light holds.',
    sub:
      (r.onesSetAside > 0
        ? `${r.onesSetAside} ${r.onesSetAside === 1 ? 'die cracks and slides' : 'dice crack and slide'} to the dark until the scene turns. `
        : '') + `${actorName ?? 'The table'} describes what the success wins.`,
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
  const light = poolSize(state)
  const dark = darkPoolSize(state)

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
        A six succeeds. Ones crack and slide to the dark for the rest of the scene. If no six answers, a candle goes
        out.
      </p>

      {/* the pools — the light's bones against the dark's obsidian, one die per candle */}
      <div className="pools mt-4">
        <div className="pool pool-light">
          <div className="pool-head">
            <span className="pool-name">The light</span>
            <span className="pool-count nums">
              {light} <small>of {state.candlesLit}</small>
            </span>
          </div>
          <div className="dice-row">
            {Array.from({ length: light }, (_, i) => (
              <Die key={i} />
            ))}
          </div>
          {state.lostOnes > 0 && (
            <div className="pool-lost">
              {state.lostOnes} {state.lostOnes === 1 ? 'die' : 'dice'} already lost to the dark this scene
              <div className="dice-row">
                {Array.from({ length: state.lostOnes }, (_, i) => (
                  <Die key={i} gone small />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pool-vs" aria-hidden="true">
          AGAINST
          <br />◆<br />
          THEIR
        </div>

        <div className="pool pool-theirs">
          <div className="pool-head">
            <span className="pool-name">The dark</span>
            <span className="pool-count nums">{dark}</span>
          </div>
          <div className="dice-row">
            {Array.from({ length: dark }, (_, i) => (
              <Die key={i} scheme="dark" />
            ))}
          </div>
          <p className="m-0 mt-2 text-[0.75rem] leading-5 text-[var(--text-muted)]">
            One die for every candle that died. They grow as the night does.
          </p>
        </div>
      </div>

      {light === 0 && (
        <p className="notice mt-4">
          Every die this scene is lost to the dark. The next roll can only fail — spend what you have, then let the
          candle go.
        </p>
      )}

      <div className="act-bar mt-5">
        <div className="act-who">
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
          <button
            type="button"
            className={`hope-token ${useHope ? 'on' : ''}`}
            aria-pressed={useHope}
            onClick={() => setUseHope(!useHope)}
          >
            <Die scheme="hope" value={1} plain small />
            Hope die · {chosenActor.name.trim() || 'their'} moment is lived
          </button>
        )}
        <button type="button" className="btn btn-primary act-throw" onClick={doRoll}>
          Throw the dice
        </button>
      </div>

      {/* the roll — the tray throws first, then the verdict speaks over it */}
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
              <div
                className={`ro-veil ro-pop ${
                  roll.outcome === 'failure' ? 'ro-failure' : roll.outcome === 'success_them' ? 'ro-price' : 'ro-success'
                }`}
                role="status"
              >
                <VeilDice roll={roll} />
                <div className="ro-veil-core">
                  <p className="ro-vkicker">{verdict.kicker}</p>
                  <p className="ro-vbig">{verdict.title}</p>
                  <p className="ro-vline">
                    <TallyLine roll={roll} />
                  </p>
                  <p className="ro-vsub">{verdict.sub}</p>

                  {(canBurn || canBrink) && (
                    <div className="ro-veil-actions">
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
                    </div>
                  )}
                  {roll.outcome === 'failure' ? (
                    <div className="ro-darken-flow">
                        <p className="label m-0">A candle is darkened by</p>
                        <div className="ro-who-row">
                          <button
                            type="button"
                            className={`ro-who-chip ${darkenBy === '__gm' ? 'active' : ''}`}
                            onClick={() => setDarkenBy('__gm')}
                          >
                            {gmName} (keeper)
                          </button>
                          {state.survivors.map((s) => {
                            const nm = s.name.trim() || 'Unnamed'
                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`ro-who-chip ${darkenBy === nm ? 'active' : ''}`}
                                onClick={() => setDarkenBy(nm)}
                              >
                                {nm}
                              </button>
                            )
                          })}
                        </div>
                        <MiniCandles lit={state.candlesLit} />
                        <div className="ro-veil-actions">
                          <button type="button" className="btn btn-primary" onClick={darken}>
                            Let it go out
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div className="ro-veil-actions">
                      <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                        Back to the scene
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </section>
  )
}

function specsOf(r: ConflictRoll): TraySpec[] {
  return [
    ...r.light.map((value) => ({ scheme: 'light' as const, value })),
    ...r.dark.map((value) => ({ scheme: 'dark' as const, value })),
    ...(r.hope !== null ? [{ scheme: 'hope' as const, value: r.hope }] : []),
  ]
}
