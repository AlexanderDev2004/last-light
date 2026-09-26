import { useEffect, useRef, useState } from 'react'
import { DiceTray } from '../lib/dice-tray'
import { countOnes, isSuccess, rollD6 } from '../lib/ten-candles'

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

export default function DiceRoller({ pool, gmPool }: { pool: number; gmPool: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trayRef = useRef<DiceTray | null>(null)
  const [engine, setEngine] = useState<'loading' | 'tray' | 'flat'>('loading')
  const [rolling, setRolling] = useState(false)
  const [hasHope, setHasHope] = useState(true)
  const [sound, setSound] = useState(true)
  const [poolVals, setPoolVals] = useState<number[]>([])
  const [hopeVals, setHopeVals] = useState<number[]>([])
  const [rolled, setRolled] = useState(false)
  const [msg, setMsg] = useState('')
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) {
      setEngine('flat')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      setEngine('flat')
      return
    }
    let tray: DiceTray | null = null
    try {
      tray = new DiceTray(canvas)
      trayRef.current = tray
      setEngine('tray')
    } catch {
      trayRef.current = null
      setEngine('flat')
    }
    const onResize = () => tray?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      tray?.destroy()
      trayRef.current = null
    }
  }, [reduced])

  useEffect(() => {
    trayRef.current?.setSound(sound)
  }, [sound])

  async function roll() {
    const d = rollD6(Math.max(pool, 0))
    const g = rollD6(Math.max(gmPool, 0))
    const h = hasHope ? rollD6(1) : []
    setPoolVals(d)
    setHopeVals(h)
    setRolled(true)
    const tray = trayRef.current
    if (engine !== 'tray' || !tray) {
      setMsg(verdict(d, g, h, gmPool))
      return
    }
    setRolling(true)
    setMsg('The bones are cast…')
    try {
      await tray.roll([
        ...d.map((value) => ({ scheme: 'light' as const, value })),
        ...g.map((value) => ({ scheme: 'dark' as const, value })),
        ...h.map((value) => ({ scheme: 'hope' as const, value })),
      ])
    } catch {
      // the tray faltered mid-throw; the values below still stand
    } finally {
      setRolling(false)
    }
    setMsg(verdict(d, g, h, gmPool))
  }

  async function rerollOnes() {
    if (!rolled || rolling) return
    const ones = poolVals.filter((v) => v === 1).length
    if (ones === 0) {
      setMsg('There is nothing showing one to reroll. Burn only when ones lie on the table.')
      return
    }
    const re = rollD6(ones)
    const tray = engine === 'tray' ? trayRef.current : null
    if (tray) {
      setRolling(true)
      try {
        const ids = tray.idsOfSettled('light', 1).slice(0, ones)
        await tray.retoss(ids, re)
      } finally {
        setRolling(false)
      }
    }
    const nd = [...poolVals]
    let c = 0
    for (let i = 0; i < nd.length && c < re.length; i++) {
      if (nd[i] === 1) nd[i] = re[c++]
    }
    setPoolVals(nd)
    setMsg(
      isSuccess(nd, hopeVals)
        ? 'The burned trait turns the roll. Failure becomes success, and the card is gone.'
        : 'Even burned, it fails. The card is gone — put out a candle.',
    )
  }

  const rollingLabel = rolling ? 'The bones are cast…' : 'Throw the bones'

  return (
    <section aria-labelledby="h-dice">
      <h2 id="h-dice" className="ritual m-0 text-[1.7rem]">
        Dice
      </h2>
      <p className="m-0 mt-1 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        Roll as many light dice as candles burn ({pool}), against the dark’s {gmPool}. A six
        holds. Ones are lost. A hope die holds on five or six and is never lost.
      </p>

      {!reduced && (
        <div className="mt-4 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--sunken)]">
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="block h-[300px] w-full sm:h-[340px]"
          />
        </div>
      )}

      <label className="mt-3 flex items-center gap-2.5 text-[0.95rem] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={hasHope}
          onChange={(e) => setHasHope(e.target.checked)}
          className="h-4 w-4 accent-[#e08a3c]"
        />
        Roll my hope die with the pool
      </label>

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

      {engine === 'flat' && rolled && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Rolled dice">
          {poolVals.map((d, i) => (
            <span key={i} className={`die nums ${d === 6 ? 'die-six' : d === 1 ? 'die-one' : ''}`}>
              {d}
            </span>
          ))}
          {hopeVals.map((h, i) => (
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
      <p className="mt-2 text-[0.85rem] leading-6 text-[var(--text-muted)]">
        Bone for the living, ash for the dark, ember for hope. A brink rerolls the whole pool —
        only after a failure, and only if the fiction fits.
      </p>
    </section>
  )
}
