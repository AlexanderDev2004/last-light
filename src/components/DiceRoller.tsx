import { useState } from 'react'
import { countOnes, isSuccess, rollD6 } from '../lib/ten-candles'

export default function DiceRoller({ pool, gmPool }: { pool: number; gmPool: number }) {
  const [dice, setDice] = useState<number[]>([])
  const [gmDice, setGmDice] = useState<number[]>([])
  const [hope, setHope] = useState<number[]>([])
  const [hasHope, setHasHope] = useState(true)
  const [msg, setMsg] = useState('')

  function roll() {
    const d = rollD6(Math.max(pool, 0))
    const g = rollD6(Math.max(gmPool, 0))
    const h = hasHope ? rollD6(1) : []
    setDice(d)
    setGmDice(g)
    setHope(h)
    const success = isSuccess(d, h)
    const ones = countOnes(d)
    const gmSix = g.filter((x) => x === 6).length
    const pSix = d.filter((x) => x === 6).length + h.filter((x) => x >= 5).length
    if (!success) {
      setMsg(
        `Failure. No six. ${ones === 1 ? 'One die' : `${ones} dice`} lost to the dark — put out a candle and speak the truths.`,
      )
    } else if (gmSix >= pSix && gmPool > 0) {
      setMsg(
        `Success, at a price. ${pSix} against the dark’s ${gmSix} — the keeper narrates what it costs.`,
      )
    } else {
      setMsg(
        `Success. The light holds. The scene continues, and ${ones === 1 ? 'one die' : `${ones} dice`} showing one ${ones === 1 ? 'is' : 'are'} set aside.`,
      )
    }
  }

  function rerollOnes() {
    const ones = dice.filter((d) => d === 1).length
    if (ones === 0) {
      setMsg('There is nothing showing one to reroll. Burn only when ones lie on the table.')
      return
    }
    const kept = dice.filter((d) => d !== 1)
    const re = rollD6(ones)
    const nd = [...kept, ...re]
    setDice(nd)
    setMsg(
      isSuccess(nd, hope)
        ? `The burned trait turns the roll: ${re.join(', ')}. Failure becomes success, and the card is gone.`
        : `Even burned, it fails (${re.join(', ')}). The card is gone — put out a candle.`,
    )
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
        <button className="btn btn-primary" onClick={roll} disabled={pool <= 0}>
          Roll the pool
        </button>
        <button className="btn btn-quiet" onClick={rerollOnes} disabled={dice.length === 0}>
          Burn virtue or vice to reroll ones
        </button>
      </div>

      {dice.length > 0 && (
        <div className="mt-5" aria-live="polite">
          <div className="flex flex-wrap gap-2" aria-label="Light dice">
            {dice.map((d, i) => (
              <span key={i} className={`die nums ${d === 6 ? 'die-six' : d === 1 ? 'die-one' : ''}`}>
                {d}
              </span>
            ))}
            {hope.map((h, i) => (
              <span key={`h${i}`} className="die die-hope nums" title="Hope die">
                {h}
              </span>
            ))}
          </div>
          {gmDice.length > 0 && (
            <div className="mt-3">
              <p className="label">The dark’s dice</p>
              <div className="mt-1.5 flex flex-wrap gap-2" aria-label="Dark dice">
                {gmDice.map((g, i) => (
                  <span key={i} className="die die-dark nums">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="notice mt-4">{msg}</p>
          <p className="mt-2 text-[0.85rem] leading-6 text-[var(--text-muted)]">
            A brink rerolls the whole pool, not just the ones — only after a failure, and only
            if the fiction fits. If it holds, the brink survives.
          </p>
        </div>
      )}
    </section>
  )
}
