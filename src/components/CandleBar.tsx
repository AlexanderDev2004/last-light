export default function CandleBar({
  lit,
  total = 10,
  canControl,
  onExtinguish,
  onRelight,
}: {
  lit: number
  total?: number
  canControl: boolean
  onExtinguish: () => void
  onRelight: () => void
}) {
  const gmPool = total - lit
  return (
    <section aria-labelledby="h-candles">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="h-candles" className="ritual m-0 text-[1.9rem] leading-tight">
            <span className="nums">{lit}</span> of {total} still burning
          </h2>
          <p className="m-0 mt-1 text-[0.92rem] text-[var(--text-secondary)]">
            The dark holds <span className="nums font-semibold text-[var(--text-primary)]">{gmPool}</span>{' '}
            dice against you.
            {!canControl && ' Only the keeper may put out a candle.'}
          </p>
        </div>
        {canControl && (
          <button className="btn-text" onClick={onRelight}>
            Relight all ten
          </button>
        )}
      </div>

      {lit === 1 && (
        <p className="notice mt-4" role="status">
          <strong>The final stand.</strong> From here, failure does not put out the last candle —
          it takes a life, narrated by the dying.
        </p>
      )}

      <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="The ten candles">
        {Array.from({ length: total }, (_, i) => {
          const isLit = i < lit
          return (
            <button
              key={i}
              type="button"
              className={`candle ${isLit ? 'lit' : ''}`}
              disabled={!canControl || !isLit}
              aria-pressed={!isLit}
              aria-label={isLit ? `Candle ${i + 1}, burning. Put it out.` : `Candle ${i + 1}, out`}
              title={isLit ? (canControl ? 'Put out this candle' : 'Burning') : 'Out'}
              onClick={onExtinguish}
            >
              <span
                className="candle-flame"
                aria-hidden="true"
                style={{ animationDuration: `${1.8 + ((i * 0.37) % 1.1)}s` }}
              />
              <span className="candle-wick" aria-hidden="true" />
              <span
                className="candle-wax"
                aria-hidden="true"
                style={{ height: isLit ? `${24 + ((i * 7) % 16)}px` : '20px' }}
              />
              <span className="candle-state nums">{isLit ? `${total - i}` : 'Out'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
