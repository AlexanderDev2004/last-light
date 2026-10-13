import { nextSpeaker } from '../game/engine'
import type { Action, NightState } from '../game/types'
import { useState } from 'react'

/**
 * "That which is true" — the opening of every scene. The table speaks as many
 * truths as there are candles still lit, starting with whoever darkened the
 * last candle (the keeper opens the night).
 */
export default function TruthPhase({
  state,
  dispatch,
}: {
  state: NightState
  dispatch: (a: Action) => void
}) {
  const speaker = nextSpeaker(state)
  const [author, setAuthor] = useState<string>('__suggested')
  const [text, setText] = useState('')

  const names = [...state.survivors.map((s) => s.name.trim() || 'Unnamed'), state.gmName.trim() || 'The keeper']
  const chosenAuthor = author === '__suggested' ? speaker.name : author
  const sceneTruths = state.truths.filter((t) => t.scene === state.scene)
  const firstScene = state.scene === 1

  function speak() {
    if (!text.trim()) return
    dispatch({ type: 'truth/speak', author: chosenAuthor, text })
    setText('')
  }

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(2rem, 6vh, 4rem)', paddingBottom: '5rem' }}>
      <p className="label">
        Scene {state.scene} of 10 · that which is true
      </p>
      <h1 className="ritual m-0 mt-3 max-w-[26ch] text-4xl leading-[1.08] sm:text-5xl">
        {state.truthsDue === 0
          ? 'The truth is settled.'
          : state.truthsDue === 1
            ? 'One truth remains.'
            : `${state.truthsDue} truths remain.`}
      </h1>
      {firstScene && sceneTruths.length === 0 && (
        <p className="ritual-italic mt-4 max-w-[56ch] text-xl leading-relaxed text-[var(--text-secondary)]">
          The keeper opens:{' '}
          <span className="text-[var(--text-primary)]">
            “These things are true: the world is dark, and you are alive.”
          </span>
        </p>
      )}
      <p className="prose-measure mt-4 max-w-[68ch] leading-8 text-[var(--text-secondary)]">
        {firstScene
          ? 'Each of you adds a truth to the world — a fact about what remains, what hunts, what still works. Build on each other; never undo. What is spoken becomes real.'
          : 'Another scene turns. The table speaks again: each truth advances the story, moves you along, and becomes real. Build; never undo. Then the scene begins.'}
      </p>

      {state.truthsDue > 0 && (
        <div className="panel mt-8 max-w-2xl">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="label m-0">Now speaking</p>
            <p className="nums m-0 text-[0.85rem] font-semibold text-[var(--text-muted)]">
              {sceneTruths.length} of {sceneTruths.length + state.truthsDue} spoken
            </p>
          </div>
          <p className="ritual m-0 mt-1 text-2xl text-[var(--flame)]">{speaker.name}</p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-[minmax(9rem,11rem)_1fr]">
            <label className="sr-only" htmlFor="truth-author">
              Who speaks
            </label>
            <select
              id="truth-author"
              className="field"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            >
              <option value="__suggested">{speaker.name} (next)</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              className="field"
              aria-label="The truth"
              placeholder={
                speaker.gm
                  ? 'A truth about what waits in the dark…'
                  : 'A truth about the world — it becomes real…'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') speak()
              }}
              autoFocus
            />
          </div>
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={!text.trim()}
            onClick={speak}
          >
            Make it true
          </button>
        </div>
      )}

      {sceneTruths.length > 0 && (
        <div className="mt-10 max-w-2xl space-y-4" aria-live="polite">
          {sceneTruths.map((t) => (
            <div key={t.id} className="truth">
              <p className="m-0 text-[0.78rem] font-semibold tracking-wide text-[var(--text-muted)]">
                {t.author}
              </p>
              <p className="m-0 mt-1 text-[1.02rem] leading-7 text-[var(--text-primary)]">{t.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10">
        <button
          type="button"
          className="btn btn-primary"
          disabled={state.truthsDue > 0}
          title={state.truthsDue > 0 ? 'The truth is not yet settled' : 'Step into the scene'}
          onClick={() => dispatch({ type: 'scene/begin' })}
        >
          {state.candlesLit === 10 ? 'Begin the story' : `Begin scene ${state.scene}`}
        </button>
      </div>
    </div>
  )
}
