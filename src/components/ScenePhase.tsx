import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Action, NightState } from '../game/types'
import Candles from './Candles'
import Chronicle from './Chronicle'
import DicePanel from './DicePanel'
import Stacks from './Stacks'
import Truths from './Truths'

/** The heart of the night: the candles, the conflicts, the stacks, the truths. */
export default function ScenePhase({
  state,
  dispatch,
}: {
  state: NightState
  dispatch: (a: Action) => void
}) {
  const [darkenOpen, setDarkenOpen] = useState(false)

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(1.5rem, 4vh, 3rem)', paddingBottom: '5rem' }}>
      <Candles
        lit={state.candlesLit}
        canDarken
        onDarken={() => setDarkenOpen(true)}
      />

      {darkenOpen && (
        <DarkenByDialog
          state={state}
          onCancel={() => setDarkenOpen(false)}
          onConfirm={(by) => {
            setDarkenOpen(false)
            dispatch({ type: 'scene/darken', by })
          }}
          label="A candle gutters out — not by any failure, simply by accident. The scene ends here."
          confirm="Let it go out"
        />
      )}

      <hr className="rule my-9" />

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="space-y-10">
          <DicePanel state={state} dispatch={dispatch} />
          <hr className="rule" />
          <Chronicle state={state} />
        </div>
        <div className="space-y-10">
          <Truths state={state} />
          <hr className="rule" />
          <Stacks state={state} dispatch={dispatch} />
        </div>
      </div>
    </div>
  )
}

export function DarkenByDialog({
  state,
  onCancel,
  onConfirm,
  label,
  confirm,
}: {
  state: NightState
  onCancel: () => void
  onConfirm: (by: string) => void
  label: string
  confirm: string
}) {
  const gmName = state.gmName.trim() || 'The keeper'
  const [by, setBy] = useState(gmName)
  return createPortal(
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="Darken a candle">
      <button type="button" className="modal-backdrop" aria-label="Cancel" onClick={onCancel} />
      <div className="modal-card !max-w-md text-center">
        <p className="label m-0">Darken a candle</p>
        <p className="m-0 mt-2 text-[0.95rem] leading-7 text-[var(--text-secondary)]">{label}</p>
        <div className="mt-4">
          <label className="label" htmlFor="darken-by-2">
            Darkened by
          </label>
          <select
            id="darken-by-2"
            className="field mt-1.5"
            value={by}
            onChange={(e) => setBy(e.target.value)}
          >
            <option value={gmName}>{gmName} (keeper)</option>
            {state.survivors.map((s) => (
              <option key={s.id} value={s.name.trim() || 'Unnamed'}>
                {s.name.trim() || 'Unnamed'}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(by)}>
            {confirm}
          </button>
          <button type="button" className="btn-text" onClick={onCancel}>
            Not yet
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
