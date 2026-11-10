import type { CSSProperties } from 'react'
import { TOTAL_CANDLES } from '../game/types'

/**
 * One candle glyph — the design port's living element. Layers: glow behind,
 * flame over the wick, wax with drips below, and a thread of smoke once out.
 * `seed` staggers each flame's clock so ten never move as one. All internal
 * offsets hang off the `--wax-h` custom property, so a short candle keeps its
 * wick, flame, and smoke in the right places.
 */
export function CandleGlyph({ lit, seed = 0 }: { lit: boolean; seed?: number }) {
  const waxH = lit ? `${24 + ((seed * 7) % 16)}px` : '20px'
  return (
    <span className={`candle ${lit ? 'lit' : 'out'}`} aria-hidden="true" style={{ '--wax-h': waxH } as CSSProperties}>
      {/* flame and glow always render — the .out class snuffs them, which lets
          their fade transitions run both on darkening and on relight */}
      <span className="candle-glow" style={{ animationDelay: `${(seed * 0.53) % 1.4}s` }} />
      <span className="candle-flame" style={{ animationDelay: `${(seed * 0.37) % 1.1}s` }} />
      <span className="candle-wick" />
      <span className="candle-smoke" />
      <span className="candle-wax" style={{ height: waxH }} />
    </span>
  )
}

/**
 * The ten candles — the game's countdown, given the center of the screen.
 * The keeper darkens one when a conflict fails or one gutters by accident.
 */
export default function Candles({
  lit,
  onDarken,
  canDarken,
}: {
  lit: number
  canDarken: boolean
  onDarken: () => void
}) {
  return (
    <section aria-labelledby="h-candles" data-testid="candles">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="h-candles" className="ritual m-0 text-[1.7rem] leading-tight">
            <span className="nums">{lit}</span> of {TOTAL_CANDLES} still burning
          </h2>
          <p className="m-0 mt-1 text-[0.9rem] text-[var(--text-secondary)]">
            {lit === TOTAL_CANDLES
              ? 'The story is young. The dark holds no dice yet.'
              : lit === 1
                ? 'One candle left. When it dies, the Last Stand begins.'
                : `The dark holds ${TOTAL_CANDLES - lit} ${TOTAL_CANDLES - lit === 1 ? 'die' : 'dice'} against the table's ${lit}.`}
          </p>
        </div>
        {canDarken && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-quiet" onClick={onDarken}>
              A candle is darkened
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 sm:gap-3.5" role="group" aria-label="The ten candles">
        {Array.from({ length: TOTAL_CANDLES }, (_, i) => (
          <CandleGlyph key={i} lit={i < lit} seed={i} />
        ))}
      </div>
    </section>
  )
}
