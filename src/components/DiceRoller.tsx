import { useCallback, useState } from 'react'
import DdbDiceOverlay, { type DdbOutcome, type DdbRollResult } from './DdbDiceOverlay'
import type { TraySpec } from '../lib/dice-tray'
import { countOnes, isSuccess, rollD6 } from '../lib/ten-candles'

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
}: {
  pool: number
  gmPool: number
  /** The keeper has no hope die and throws only to oppose. */
  isGM?: boolean
  /** Unseated visitors may watch but not touch. */
  canRoll?: boolean
}) {
  const [hasHope, setHasHope] = useState(true)
  const [sound, setSound] = useState(true)
  const [rolling, setRolling] = useState(false)

  // Hasil acak sudah ditentukan SEBELUM animasi; banner overlay baru
  // dibuka SETELAH animasi selesai (via onSettled) — ala D&D Beyond.
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [rollKey, setRollKey] = useState(0)
  const [specs, setSpecs] = useState<TraySpec[]>([])
  const [pending, setPending] = useState<DdbRollResult | null>(null)
  const [revealed, setRevealed] = useState(false)

  // Salinan inline agar hasil tetap terbaca setelah overlay ditutup,
  // sekaligus jadi fallback saat reduced-motion (tanpa animasi).
  const [last, setLast] = useState<DdbRollResult | null>(null)
  const [history, setHistory] = useState<DdbRollResult[]>([])
  const [msg, setMsg] = useState('')
  const [rolled, setRolled] = useState(false)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function pushHistory(r: DdbRollResult) {
    setHistory((h) => [r, ...h].slice(0, 5))
  }

  function roll() {
    // The keeper holds no hope die, even if the box is checked.
    const useHope = hasHope && !isGM
    const d = rollD6(Math.max(pool, 0))
    const g = rollD6(Math.max(gmPool, 0))
    const h = useHope ? rollD6(1) : []
    const res = buildResult(d, g, h, gmPool)
    setRolled(true)

    if (reduced) {
      // Tanpa animasi: langsung umumkan hasil acaknya.
      setLast(res)
      setMsg(res.verdict)
      pushHistory(res)
      return
    }

    setSpecs(specsOf(res))
    setPending(res)
    setRevealed(false)
    setRolling(true)
    setOverlayOpen(true)
    setRollKey((k) => k + 1)
    setMsg('The bones are cast…')
  }

  const handleSettled = useCallback(() => {
    // Animasi selesai → baru kasih tahu dapat berapa.
    setRevealed(true)
    setRolling(false)
    setPending((p) => {
      if (p) {
        setLast(p)
        setMsg(p.verdict)
        setHistory((h) => [p, ...h].slice(0, 5))
      }
      return p
    })
  }, [])

  function rerollOnes() {
    const base = pending && !revealed ? null : (last ?? pending)
    // Saat overlay terbuka dan belum reveal, pakai pending sebagai basis.
    const active = overlayOpen && pending ? pending : base
    if (!active || rolling) return
    const ones = active.pool.filter((v) => v === 1).length
    if (ones === 0) {
      setMsg('There is nothing showing one to reroll. Burn only when ones lie on the table.')
      return
    }
    const re = rollD6(ones)
    const nd = [...active.pool]
    let c = 0
    for (let i = 0; i < nd.length && c < re.length; i++) {
      if (nd[i] === 1) nd[i] = re[c++]
    }
    const burnedMsg = isSuccess(nd, active.hope)
      ? 'The burned trait turns the roll. Failure becomes success, and the card is gone.'
      : 'Even burned, it fails. The card is gone — put out a candle.'
    const burned: DdbRollResult = {
      pool: nd,
      dark: active.dark,
      hope: active.hope,
      verdict: burnedMsg,
      outcome: isSuccess(nd, active.hope) ? 'success' : 'failure',
      ones: countOnes(nd),
    }
    setRolled(true)
    if (reduced) {
      setLast(burned)
      setMsg(burnedMsg)
      pushHistory(burned)
      return
    }
    setSpecs(specsOf(burned))
    setPending(burned)
    setRevealed(false)
    setRolling(true)
    setOverlayOpen(true)
    setRollKey((k) => k + 1)
    setMsg('The burned card feeds the tray…')
  }

  const rollingLabel = rolling ? 'The bones are cast…' : 'Throw the bones'

  return (
    <section aria-labelledby="h-dice">
      <h2 id="h-dice" className="ritual m-0 text-[1.7rem]">
        Dice
      </h2>
      <p className="m-0 mt-1 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        Roll as many light dice as candles burn ({pool}), against the dark’s {gmPool}. A six
        holds. Ones are lost.{' '}
        {isGM
          ? 'You hold no hope die — yours is the other side of the tray.'
          : 'A hope die holds on five or six and is never lost.'}
      </p>

      {!isGM && canRoll && (
        <label className="mt-3 flex items-center gap-2.5 text-[0.95rem] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={hasHope}
            onChange={(e) => setHasHope(e.target.checked)}
            className="h-4 w-4 accent-[#e08a3c]"
          />
          Roll my hope die with the pool
        </label>
      )}

      {canRoll ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={() => void roll()}
            disabled={pool <= 0 || rolling}
          >
            {rollingLabel}
          </button>
          <button className="btn btn-quiet" onClick={() => void rerollOnes()} disabled={!rolled || rolling}>
            Burn virtue or vice to reroll ones
          </button>
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

      {/* Hasil terakhir tetap terlihat inline setelah overlay ditutup. */}
      {last && !overlayOpen && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Last rolled dice">
          {last.pool.map((d, i) => (
            <span key={i} className={`die nums ${d === 6 ? 'die-six' : d === 1 ? 'die-one' : ''}`}>
              {d}
            </span>
          ))}
          {last.dark.map((d, i) => (
            <span key={`d${i}`} className="die die-dark nums" title="Dark die">
              {d}
            </span>
          ))}
          {last.hope.map((h, i) => (
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

      {history.length > 0 && (
        <div className="mt-3 space-y-1.5" aria-label="Roll history">
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
        only after a failure, and only if the fiction fits.
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
          onReroll={() => void roll()}
        />
      )}
    </section>
  )
}
