import { useEffect, useRef, useState } from 'react'
import { DICE_COLORS, dropDiceBox, ensureDiceBox, type Dice3DResult } from '../lib/dice3d'
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
  const trayRef = useRef<HTMLDivElement>(null)
  const diceRef = useRef<Dice3DResult[]>([])
  const [mode, setMode] = useState<'loading' | 'box' | 'flat'>('loading')
  const [rolling, setRolling] = useState(false)
  const [hasHope, setHasHope] = useState(true)
  const [poolVals, setPoolVals] = useState<number[]>([])
  const [hopeVals, setHopeVals] = useState<number[]>([])
  const [rolled, setRolled] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMode('flat')
      return
    }
    void ensureDiceBox('#dice-tray').then((box) => {
      if (cancelled) return
      setMode(box ? 'box' : 'flat')
    })
    return () => {
      cancelled = true
      dropDiceBox()
    }
  }, [])

  async function roll3D() {
    const box = await ensureDiceBox('#dice-tray')
    if (!box) {
      setMode('flat')
      rollFlat()
      return
    }
    setRolling(true)
    setMsg('The bones are cast…')
    try {
      const groups: Array<{ qty: number; sides: number; themeColor: string }> = [
        { qty: Math.max(pool, 0), sides: 6, themeColor: DICE_COLORS.light },
      ]
      if (gmPool > 0) groups.push({ qty: gmPool, sides: 6, themeColor: DICE_COLORS.dark })
      if (hasHope) groups.push({ qty: 1, sides: 6, themeColor: DICE_COLORS.hope })
      const res = await box.roll(groups)
      const byColor = new Map<string, number[]>()
      for (const g of res) {
        const key = (g.themeColor ?? '').toUpperCase()
        byColor.set(key, g.rolls.map((r) => r.value))
      }
      const d = byColor.get(DICE_COLORS.light) ?? []
      const g = byColor.get(DICE_COLORS.dark) ?? []
      const h = byColor.get(DICE_COLORS.hope) ?? []
      diceRef.current = res.flatMap((grp) => grp.rolls)
      setPoolVals(d)
      setHopeVals(h)
      setRolled(true)
      setMsg(verdict(d, g, h, gmPool))
    } catch {
      setMode('flat')
      rollFlat()
    } finally {
      setRolling(false)
    }
  }

  function rollFlat() {
    const d = rollD6(Math.max(pool, 0))
    const g = rollD6(Math.max(gmPool, 0))
    const h = hasHope ? rollD6(1) : []
    diceRef.current = []
    setPoolVals(d)
    setHopeVals(h)
    setRolled(true)
    setMsg(verdict(d, g, h, gmPool))
  }

  async function rerollOnes() {
    if (!rolled || rolling) return
    if (mode !== 'box') {
      const ones = poolVals.filter((v) => v === 1).length
      if (ones === 0) {
        setMsg('There is nothing showing one to reroll. Burn only when ones lie on the table.')
        return
      }
      const re = rollD6(ones)
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
      return
    }
    const lightOnes = diceRef.current.filter((r) => {
      // Light dice are always thrown first, so group 0 is theirs;
      // the theme echo confirms it when present.
      return r.value === 1 && (r.themeColor ? r.themeColor.toUpperCase() === DICE_COLORS.light : r.groupId === 0)
    })
    if (lightOnes.length === 0) {
      setMsg('There is nothing showing one to reroll. Burn only when ones lie on the table.')
      return
    }
    const box = await ensureDiceBox('#dice-tray')
    if (!box) {
      setMsg('The tray faltered. The burned card is still gone — put out a candle.')
      return
    }
    setRolling(true)
    try {
      const fresh = await box.reroll(lightOnes)
      const byId = new Map(fresh.map((r) => [r.rollId, r.value]))
      const nd = [...poolVals]
      let cursor = 0
      for (let i = 0; i < nd.length && cursor < lightOnes.length; i++) {
        if (nd[i] === 1) {
          const v = byId.get(lightOnes[cursor].rollId)
          if (v !== undefined) nd[i] = v
          cursor++
        }
      }
      diceRef.current = diceRef.current.map((r) =>
        byId.has(r.rollId) ? { ...r, value: byId.get(r.rollId) as number } : r,
      )
      setPoolVals(nd)
      setMsg(
        isSuccess(nd, hopeVals)
          ? 'The burned trait turns the roll. Failure becomes success, and the card is gone.'
          : 'Even burned, it fails. The card is gone — put out a candle.',
      )
    } catch {
      setMsg('The tray faltered. The burned card is still gone — put out a candle.')
    } finally {
      setRolling(false)
    }
  }

  return (
    <section aria-labelledby="h-dice">
      <h2 id="h-dice" className="ritual m-0 text-[1.7rem]">
        Dice
      </h2>
      <p className="m-0 mt-1 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        Roll as many light dice as candles burn ({pool}), against the dark’s {gmPool}. A six
        holds. Ones are lost. A hope die holds on five or six and is never lost.
      </p>

      {mode !== 'flat' && (
        <div
          id="dice-tray"
          ref={trayRef}
          aria-hidden="true"
          className="mt-4 h-[300px] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--sunken)] sm:h-[340px]"
        />
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

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="btn btn-primary"
          onClick={() => void (mode === 'box' ? roll3D() : rollFlat())}
          disabled={pool <= 0 || rolling || mode === 'loading'}
        >
          {rolling ? 'The bones are cast…' : mode === 'loading' ? 'Preparing the tray…' : 'Throw the bones'}
        </button>
        <button className="btn btn-quiet" onClick={() => void rerollOnes()} disabled={!rolled || rolling}>
          Burn virtue or vice to reroll ones
        </button>
      </div>

      {mode === 'flat' && rolled && (
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
        {mode === 'box'
          ? 'Bone for the living, ash for the dark, ember for hope. A brink rerolls the whole pool — only after a failure, and only if the fiction fits.'
          : 'The tray could not open, so the bones fall here instead. A brink rerolls the whole pool — only after a failure, and only if the fiction fits.'}
      </p>
    </section>
  )
}
