import { TOTAL_CANDLES } from '../game/types'

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

      <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="The ten candles">
        {Array.from({ length: TOTAL_CANDLES }, (_, i) => {
          const isLit = i < lit
          return (
            <div
              key={i}
              className={`candle ${isLit ? 'lit' : ''}`}
              aria-hidden="true"
            >
              <span
                className="candle-flame"
                style={{ animationDuration: `${1.8 + ((i * 0.37) % 1.1)}s` }}
              />
              <span className="candle-wick" />
              <span className="candle-wax" style={{ height: isLit ? `${24 + ((i * 7) % 16)}px` : '20px' }} />
              <span className="candle-state nums">{isLit ? `${TOTAL_CANDLES - i}` : 'Out'}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
