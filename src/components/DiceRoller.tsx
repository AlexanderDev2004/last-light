import { useCallback, useRef, useState } from 'react'
import DdbDiceOverlay, { type DdbOutcome, type DdbRollResult } from './DdbDiceOverlay'
import type { TraySpec } from '../lib/dice-tray'
import { countOnes, isSuccess, rollD6 } from '../lib/ten-candles'

/**
 * Versus flow (GM membalas), sesuai aturan Ten Candles versi aplikasi ini:
 *  1. Survivor melempar Light + Hope sebagai TANTANGAN.
 *  2. Keeper MEMBALAS dengan Dark.
 *  3. Sixes diadu: tanpa six = failure (padam 1 lilin + truths);
 *     dark sixes >= light sixes = success at a price; sisanya success.
 */

type Phase = 'idle' | 'challenged' | 'resolved'
type RollKind = 'challenge' | 'oppose' | 'quick'

interface Challenger {
  pool: number[]
  hope: number[]
}

function outcomeOf(pool: number[], dark: number[], hope: number[], gmPool: number): DdbOutcome {
  const success = isSuccess(pool, hope)
  if (!success) return 'failure'
  const gmSix = dark.filter((x) => x === 6).length
  const pSix = pool.filter((x) => x === 6).length + hope.filter((x) => x >= 5).length
  if (gmSix >= pSix && gmPool > 0) return 'success-price'
  return 'success'
}

function verdict(pool: number[], dark: number[], hope: number[], gmPool: number): string {
  const success = isSuccess(pool, hope)
  const ones = countOnes(pool)
  const gmSix = dark.filter((x) => x === 6).length
  const pSix = pool.filter((x) => x === 6).length + hope.filter((x) => x >= 5).length
  if (!success) {
    return `Failure. No six. ${ones === 1 ? 'One die' : `${ones} dice`} lost to the dark — put out a candle and speak the truths.`
  }
  if (gmSix >= pSix && gmPool > 0) {
    return `Success, at a price. ${pSix} against the dark’s ${gmSix} — the keeper narrates what it costs.`
  }
  return `Success. The light holds. The scene continues, and ${ones === 1 ? 'one die' : `${ones} dice`} showing one ${ones === 1 ? 'is' : 'are'} set aside.`
}

function buildResult(pool: number[], dark: number[], hope: number[], gmPool: number): DdbRollResult {
  return {
    pool,
    dark,
    hope,
    verdict: verdict(pool, dark, hope, gmPool),
    outcome: outcomeOf(pool, dark, hope, gmPool),
    ones: countOnes(pool),
  }
}

function challengeResult(pool: number[], hope: number[], gmPool: number): DdbRollResult {
  const sixes = pool.filter((x) => x === 6).length + hope.filter((x) => x >= 5).length
  const ones = countOnes(pool)
  const darkNoun = gmPool === 1 ? 'die' : 'dice'
  const verdictText =
    sixes > 0
      ? `Challenge thrown: ${sixes} ${sixes === 1 ? 'six' : 'sixes'} for the light. Keeper — answer with ${gmPool} dark ${darkNoun}.`
      : `Challenge thrown with no six${ones > 0 ? `, and ${ones} ${ones === 1 ? 'die' : 'dice'} already lost` : ''}. Keeper — roll ${gmPool} dark ${darkNoun} to seal it.`
  return { pool, dark: [], hope, verdict: verdictText, outcome: 'awaiting', ones }
}

function specsOf(r: DdbRollResult): TraySpec[] {
  return [
    ...r.pool.map((value) => ({ scheme: 'light' as const, value })),
    ...r.dark.map((value) => ({ scheme: 'dark' as const, value })),
    ...r.hope.map((value) => ({ scheme: 'hope' as const, value })),
  ]
}

export default function DiceRoller({
  pool,
  gmPool,
  isGM = false,
  canRoll = true,
  onFailureCandle,
  canQuickCandle = false,
}: {
  pool: number
  gmPool: number
  /** The keeper has no hope die and throws only to oppose. */
  isGM?: boolean
  /** Unseated visitors may watch but not touch. */
  canRoll?: boolean
  /** Keeper shortcut: padamkan 1 lilin saat versus berakhir failure. */
  onFailureCandle?: () => void | Promise<void>
  canQuickCandle?: boolean
}) {
  const [hasHope, setHasHope] = useState(true)
  const [sound, setSound] = useState(true)
  const [rolling, setRolling] = useState(false)

  // Nilai diacak SEBELUM animasi; banner overlay baru dibuka SETELAH
  // animasi selesai (via onSettled) — ala D&D Beyond.
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [rollKey, setRollKey] = useState(0)
  const [specs, setSpecs] = useState<TraySpec[]>([])
  const [pending, setPending] = useState<DdbRollResult | null>(null)
  const [revealed, setRevealed] = useState(false)
  const kindRef = useRef<RollKind>('challenge')

  const [phase, setPhase] = useState<Phase>('idle')
  const [challenger, setChallenger] = useState<Challenger | null>(null)
  const [final, setFinal] = useState<DdbRollResult | null>(null)
  const [history, setHistory] = useState<DdbRollResult[]>([])
  const [msg, setMsg] = useState('')
  const [candleActing, setCandleActing] = useState(false)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function pushHistory(r: DdbRollResult) {
    setHistory((h) => [r, ...h].slice(0, 5))
  }

  function openOverlay(res: DdbRollResult, kind: RollKind, casting: string) {
    kindRef.current = kind
    setSpecs(specsOf(res))
    setPending(res)
    setRevealed(false)
    setRolling(true)
    setOverlayOpen(true)
    setRollKey((k) => k + 1)
    setMsg(casting)
  }

  /** Langkah 1 — survivor melempar Light + Hope sebagai tantangan. */
  function throwChallenge() {
    if (rolling) return
    // The keeper holds no hope die, even if the box is checked.
    const useHope = hasHope && !isGM
    const d = rollD6(Math.max(pool, 0))
    const h = useHope ? rollD6(1) : []
    const ch: Challenger = { pool: d, hope: h }
    const res = challengeResult(d, h, gmPool)
    setChallenger(ch)
    if (reduced) {
      setPending(res)
      setRevealed(true)
      setPhase('challenged')
      setMsg(res.verdict)
      return
    }
    openOverlay(res, 'challenge', 'The challenge is thrown…')
  }

  /** Burn virtue/vice: reroll ones milik penantang SEBELUM the dark membalas. */
  function burnReroll() {
    if (phase !== 'challenged' || rolling || !challenger) return
    const ones = challenger.pool.filter((v) => v === 1).length
    if (ones === 0) {
      setMsg('There is nothing showing one to reroll. Burn only when ones lie on the table.')
      return
    }
    const re = rollD6(ones)
    const nd = [...challenger.pool]
    let c = 0
    for (let i = 0; i < nd.length && c < re.length; i++) {
      if (nd[i] === 1) nd[i] = re[c++]
    }
    const ch: Challenger = { pool: nd, hope: challenger.hope }
    const base = challengeResult(nd, ch.hope, gmPool)
    const res: DdbRollResult = {
      ...base,
      verdict: `The burned card feeds the tray. ${base.verdict}`,
    }
    setChallenger(ch)
    if (reduced) {
      setPending(res)
      setRevealed(true)
      setMsg(res.verdict)
      return
    }
    openOverlay(res, 'challenge', 'The burned card feeds the tray…')
  }

  /** Langkah 2 — keeper membalas tantangan dengan the Dark. */
  function throwDark() {
    if (rolling || !challenger) return
    const g = rollD6(Math.max(gmPool, 0))
    const res = buildResult(challenger.pool, g, challenger.hope, gmPool)
    if (reduced) {
      setFinal(res)
      setPending(res)
      setRevealed(true)
      setPhase('resolved')
      pushHistory(res)
      setMsg(res.verdict)
      return
    }
    openOverlay(res, 'oppose', 'The dark answers…')
  }

  /** Jalan pintas: lempar semuanya sekaligus seperti dulu. */
  function quickRoll() {
    if (rolling) return
    const useHope = hasHope && !isGM
    const d = rollD6(Math.max(pool, 0))
    const g = rollD6(Math.max(gmPool, 0))
    const h = useHope ? rollD6(1) : []
    const res = buildResult(d, g, h, gmPool)
    setChallenger(null)
    if (reduced) {
      setFinal(res)
      setPending(res)
      setRevealed(true)
      setPhase('resolved')
      pushHistory(res)
      setMsg(res.verdict)
      return
    }
    openOverlay(res, 'quick', 'The bones are cast…')
  }

  function cancelContest() {
    setOverlayOpen(false)
    setPhase('idle')
    setChallenger(null)
    setMsg('The challenge is called off. The dark waits.')
  }

  function rematch() {
    setPhase('idle')
    setChallenger(null)
    setFinal(null)
    setMsg('')
  }

  /** Tombol "Lempar lagi" di overlay mengulang sisi yang sama. */
  function repeatThrow() {
    if (rolling) return
    const k = kindRef.current
    if (k === 'oppose') void throwDark()
    else if (k === 'quick') void quickRoll()
    else void throwChallenge()
  }

  const handleSettled = useCallback(() => {
    // Animasi selesai → baru kasih tahu dapat berapa.
    const kind = kindRef.current
    setRevealed(true)
    setRolling(false)
    setPending((p) => {
      if (!p) return p
      if (kind === 'challenge') {
        setPhase('challenged')
        setMsg(p.verdict)
      } else {
        setPhase('resolved')
        setFinal(p)
        setMsg(p.verdict)
        setHistory((h) => [p, ...h].slice(0, 5))
      }
      return p
    })
  }, [])

  const challengeOnes = challenger?.pool.filter((v) => v === 1).length ?? 0
  const showQuickCandle =
    phase === 'resolved' && final?.outcome === 'failure' && canQuickCandle && onFailureCandle

  return (
    <section aria-labelledby="h-dice">
      <h2 id="h-dice" className="ritual m-0 text-[1.7rem]">
        Dice versus
      </h2>
      <p className="m-0 mt-1 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        The survivor throws {pool} light {pool === 1 ? 'die' : 'dice'}
        {isGM ? '' : ' plus a hope die (holds on five or six, never lost)'} as a challenge —
        then the keeper answers with the dark’s {gmPool}. Sixes are matched: no six is failure,
        dark sixes meeting light sixes is success at a price.
      </p>

      {!isGM && canRoll && (
        <label className="mt-3 flex items-center gap-2.5 text-[0.95rem] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={hasHope}
            onChange={(e) => setHasHope(e.target.checked)}
            className="h-4 w-4 accent-[#e08a3c]"
          />
          Roll my hope die with the challenge
        </label>
      )}

      {canRoll ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {phase === 'idle' && (
            <button
              className="btn btn-primary"
              onClick={() => void throwChallenge()}
              disabled={pool <= 0 || rolling}
            >
              {rolling ? 'The challenge is thrown…' : 'Challenge the dark'}
            </button>
          )}
          {phase === 'challenged' &&
            (isGM ? (
              <button
                className="btn btn-primary"
                onClick={() => void throwDark()}
                disabled={rolling}
              >
                {rolling ? 'The dark answers…' : `Answer with the dark (${gmPool})`}
              </button>
            ) : (
              <p className="m-0 text-[0.95rem] text-[var(--text-secondary)]" role="status">
                Challenge thrown — waiting for the keeper to answer with the dark.
              </p>
            ))}
          {phase === 'challenged' && (
            <button
              className="btn btn-quiet"
              onClick={() => void burnReroll()}
              disabled={rolling || challengeOnes === 0}
            >
              Burn virtue or vice to reroll ones
            </button>
          )}
          {phase === 'resolved' && (
            <button className="btn btn-primary" onClick={rematch} disabled={rolling}>
              Challenge again
            </button>
          )}
          {phase === 'challenged' && (
            <button className="btn-text" onClick={cancelContest} disabled={rolling}>
              Call off the challenge
            </button>
          )}
          {phase === 'idle' && (
            <button className="btn-text" onClick={() => void quickRoll()} disabled={pool <= 0 || rolling}>
              or quick-roll everything at once
            </button>
          )}
          {!reduced && (
            <button
              className="btn-text"
              onClick={() => setSound(!sound)}
              aria-pressed={sound}
            >
              {sound ? 'Silence the tray' : 'Sound the tray'}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[0.9rem] text-[var(--text-muted)]">
          Only seated players throw. Take the empty chair to take up dice.
        </p>
      )}

      {/* Tantangan yang menunggu balasan — tetap terbaca setelah overlay ditutup. */}
      {phase === 'challenged' && challenger && !overlayOpen && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Challenger dice awaiting the dark">
          {challenger.pool.map((d, i) => (
            <span key={i} className={`die nums ${d === 6 ? 'die-six' : d === 1 ? 'die-one' : ''}`}>
              {d}
            </span>
          ))}
          {challenger.hope.map((h, i) => (
            <span key={`h${i}`} className="die die-hope nums" title="Hope die">
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Hasil akhir versus — tetap terbaca setelah overlay ditutup. */}
      {phase === 'resolved' && final && !overlayOpen && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Versus result dice">
          {final.pool.map((d, i) => (
            <span key={i} className={`die nums ${d === 6 ? 'die-six' : d === 1 ? 'die-one' : ''}`}>
              {d}
            </span>
          ))}
          {final.dark.map((d, i) => (
            <span key={`d${i}`} className="die die-dark nums" title="Dark die">
              {d}
            </span>
          ))}
          {final.hope.map((h, i) => (
            <span key={`h${i}`} className="die die-hope nums" title="Hope die">
              {h}
            </span>
          ))}
        </div>
      )}

      {msg && (
        <p className="notice mt-4" aria-live="polite">
          {msg}
        </p>
      )}

      {showQuickCandle && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="btn btn-quiet"
            disabled={candleActing}
            onClick={() => {
              setCandleActing(true)
              void Promise.resolve(onFailureCandle!()).finally(() => setCandleActing(false))
            }}
          >
            {candleActing ? 'Putting it out…' : 'Put out a candle'}
          </button>
          <span className="text-[0.85rem] text-[var(--text-muted)]">
            Failure demands it — then speak the truths in the journal.
          </span>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-3 space-y-1.5" aria-label="Versus history">
          {history.slice(0, 4).map((h, i) => (
            <p key={`${i}-${h.verdict.slice(0, 12)}`} className="m-0 text-[0.85rem] text-[var(--text-muted)]">
              <span className="nums font-semibold text-[var(--text-secondary)]">
                {i === 0 ? 'Last' : `#${i + 1}`}
              </span>{' '}
              — {h.outcome === 'failure' ? 'Failure' : h.outcome === 'success-price' ? 'Success at a price' : 'Success'} · Light [{h.pool.join(', ') || '—'}]
              {h.dark.length > 0 && <> · Dark [{h.dark.join(', ')}]</>}
              {h.hope.length > 0 && <> · Hope [{h.hope.join(', ')}]</>}
            </p>
          ))}
        </div>
      )}

      <p className="mt-2 text-[0.85rem] leading-6 text-[var(--text-muted)]">
        Bone for the living, ash for the dark, ember for hope. A brink rerolls the whole pool —
        only after a failure, and only if the fiction fits. The versus plays out on this screen.
      </p>

      {!reduced && (
        <DdbDiceOverlay
          open={overlayOpen}
          rollKey={rollKey}
          specs={specs}
          result={pending}
          revealed={revealed}
          rolling={rolling}
          sound={sound}
          onSettled={handleSettled}
          onClose={() => setOverlayOpen(false)}
          onReroll={repeatThrow}
        />
      )}
    </section>
  )
}
