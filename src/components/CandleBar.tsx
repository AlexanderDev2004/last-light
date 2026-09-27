export default function CandleBar({
  lit,
  total = 10,
  canControl,
  busy = false,
  error = null,
  onExtinguish,
  onRelight,
}: {
  lit: number
  total?: number
  canControl: boolean
  /** True saat request padam/nyalakan ulang sedang berjalan. */
  busy?: boolean
  /** Pesan error dari percobaan terakhir — ditampilkan agar klik gagal tidak diam. */
  error?: string | null
  onExtinguish: () => void | Promise<void>
  onRelight: () => void | Promise<void>
}) {
  const gmPool = total - lit
  // Aturan main: lilin terakhir tidak dipadamkan — kegagalan setelahnya
  // merenggut nyawa, bukan lilin. Kunci UI-nya agar klik tak terasa rusak.
  const lastStand = lit <= 1
  const gridDisabled = !canControl || busy || lastStand
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
        <div className="flex flex-wrap items-center gap-3">
          {canControl && !lastStand && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void onExtinguish()}
            >
              {busy ? 'Putting it out…' : 'Put out a candle'}
            </button>
          )}
          {canControl && (
            <button type="button" className="btn-text" disabled={busy} onClick={() => void onRelight()}>
              Relight all ten
            </button>
          )}
        </div>
      </div>

      {lastStand && (
        <p className="notice mt-4" role="status">
          <strong>The final stand.</strong> From here, failure does not put out the last candle —
          it takes a life, narrated by the dying.
        </p>
      )}

      {error && (
        <p className="inline-error mt-4" role="alert">
          Could not put out the candle: {error}
        </p>
      )}

      <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10" role="group" aria-label="The ten candles">
        {Array.from({ length: total }, (_, i) => {
          const isLit = i < lit
          const disabled = gridDisabled || !isLit
          const reason = lastStand
            ? 'The last candle cannot be put out — it takes a life instead.'
            : !canControl
              ? 'Only the keeper may put out a candle.'
              : busy
                ? 'Putting out a candle…'
                : isLit
                  ? 'Put out this candle'
                  : 'Out'
          return (
            <button
              key={i}
              type="button"
              className={`candle ${isLit ? 'lit' : ''}`}
              disabled={disabled}
              aria-pressed={!isLit}
              aria-label={isLit ? `Candle ${i + 1}, burning. ${reason}` : `Candle ${i + 1}, out`}
              title={reason}
              onClick={() => void onExtinguish()}
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
      {canControl && !lastStand && (
        <p className="mt-2 text-[0.85rem] leading-6 text-[var(--text-muted)]">
          Keeper: click any burning candle — or the button above — to put one out after a failed
          roll and its truths.
        </p>
      )}
    </section>
  )
}
