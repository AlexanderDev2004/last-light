import { useEffect, useRef } from 'react'
import { DiceTray, type TraySpec } from '../lib/dice-tray'

export type DdbOutcome = 'success' | 'success-price' | 'failure'

export interface DdbRollResult {
  pool: number[]
  dark: number[]
  hope: number[]
  verdict: string
  outcome: DdbOutcome
  ones: number
}

const OUTCOME_LABEL: Record<DdbOutcome, string> = {
  success: 'Success — cahaya bertahan',
  'success-price': 'Success at a price',
  failure: 'Failure — lilin padam',
}

function Chip({ n, kind, label }: { n: number; kind: 'light' | 'dark' | 'hope'; label: string }) {
  const cls =
    kind === 'hope'
      ? 'ddb-chip ddb-chip-hope'
      : kind === 'dark'
        ? 'ddb-chip ddb-chip-dark'
        : n === 6
          ? 'ddb-chip ddb-chip-six'
          : n === 1
            ? 'ddb-chip ddb-chip-one'
            : 'ddb-chip'
  return (
    <span className={cls} title={label}>
      {n}
    </span>
  )
}

export default function DdbDiceOverlay({
  open,
  rollKey,
  specs,
  result,
  revealed,
  rolling,
  sound,
  onSettled,
  onClose,
  onReroll,
}: {
  open: boolean
  /** Naik setiap lemparan baru — memicu animasi ulang. */
  rollKey: number
  specs: TraySpec[]
  /** Nilai sudah diacak sebelum animasi; banner baru dibuka saat animasi selesai. */
  result: DdbRollResult | null
  /** True setelah animasi tuntas (dipicu via onSettled). */
  revealed: boolean
  rolling: boolean
  sound: boolean
  onSettled: () => void
  onClose: () => void
  onReroll: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trayRef = useRef<DiceTray | null>(null)
  const runRef = useRef(0)
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled

  // ESC untuk tutup (hanya setelah hasil keluar, biar lemparan tak kepotong).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lifecycle tray fullscreen.
  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    let tray: DiceTray | null = null
    try {
      tray = new DiceTray(canvas)
      trayRef.current = tray
    } catch {
      // Canvas 2D tak tersedia — fallback: langsung umumkan hasil.
      settledRef.current()
      return
    }
    tray.setSound(sound)
    const onResize = () => tray?.resize()
    window.addEventListener('resize', onResize)
    // Pastikan ukuran benar setelah overlay bertransisi masuk.
    const t = window.setTimeout(() => tray?.resize(), 30)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', onResize)
      tray?.destroy()
      trayRef.current = null
    }
  }, [open, sound])

  useEffect(() => {
    trayRef.current?.setSound(sound)
  }, [sound])

  // Setiap rollKey baru → jalankan animasi, umumkan hasil saat selesai.
  useEffect(() => {
    if (!open || rollKey === 0) return
    const tray = trayRef.current
    if (!tray) {
      settledRef.current()
      return
    }
    const run = ++runRef.current
    let cancelled = false
    void (async () => {
      try {
        await tray.roll(specs)
      } catch {
        // Tray gagal di tengah jalan — nilai acak tetap sah.
      }
      if (cancelled || runRef.current !== run) return
      settledRef.current()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rollKey])

  if (!open) return null

  const totalDice = specs.length

  return (
    <div className="ddb-root" role="dialog" aria-modal="true" aria-label="Dice tray">
      <div
        className="ddb-backdrop"
        onClick={() => {
          if (revealed) onClose()
        }}
      />
      <canvas ref={canvasRef} className="ddb-canvas" aria-hidden="true" />

      {/* Banner hasil ala D&D Beyond: muncul di atas setelah dadu berhenti. */}
      <div className="ddb-top" aria-live="polite">
        {!revealed || !result ? (
          <div className="ddb-rolling-pill" role="status">
            <span className="ddb-spinner" aria-hidden="true" />
            {rolling ? `Melempar ${totalDice} dadu…` : 'Menyiapkan tray…'}
          </div>
        ) : (
          <div className={`ddb-card ddb-${result.outcome} ddb-pop`} role="status">
            <p className="ddb-kicker">
              {result.outcome === 'success'
                ? '✦ Success'
                : result.outcome === 'success-price'
                  ? '✦ Success at a price'
                  : '✧ Failure'}
            </p>
            <h3 className="ddb-title">{OUTCOME_LABEL[result.outcome]}</h3>
            <p className="ddb-verdict">{result.verdict}</p>
            <div className="ddb-groups">
              {result.pool.length > 0 && (
                <div className="ddb-group">
                  <span className="ddb-group-label">Light ({result.pool.length})</span>
                  <span className="ddb-chips">
                    {result.pool.map((n, i) => (
                      <Chip key={`l${i}`} n={n} kind="light" label={`Light die ${n}`} />
                    ))}
                  </span>
                </div>
              )}
              {result.dark.length > 0 && (
                <div className="ddb-group">
                  <span className="ddb-group-label">Dark ({result.dark.length})</span>
                  <span className="ddb-chips">
                    {result.dark.map((n, i) => (
                      <Chip key={`d${i}`} n={n} kind="dark" label={`Dark die ${n}`} />
                    ))}
                  </span>
                </div>
              )}
              {result.hope.length > 0 && (
                <div className="ddb-group">
                  <span className="ddb-group-label">Hope</span>
                  <span className="ddb-chips">
                    {result.hope.map((n, i) => (
                      <Chip key={`h${i}`} n={n} kind="hope" label={`Hope die ${n}`} />
                    ))}
                  </span>
                </div>
              )}
            </div>
            <div className="ddb-actions">
              <button type="button" className="btn btn-primary" onClick={onReroll}>
                Lempar lagi
              </button>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Tutup (ESC)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bilah bawah: tutup cepat tanpa ganggu lemparan. */}
      <div className="ddb-bottom">
        <span className="ddb-hint">Klik backdrop / ESC untuk menutup setelah hasil keluar</span>
        {revealed && (
          <button type="button" className="btn-text ddb-close" onClick={onClose}>
            Tutup tray
          </button>
        )}
      </div>
    </div>
  )
}
