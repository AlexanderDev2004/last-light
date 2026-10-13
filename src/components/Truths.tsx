import { nextSpeaker } from '../game/engine'
import type { NightState } from '../game/types'

/** The book of truths, kept in one hand — grouped by the scene they opened. */
export default function Truths({ state }: { state: NightState }) {
  const scenes = [...new Set(state.truths.map((t) => t.scene))].sort((a, b) => a - b)
  const upcoming = state.phase === 'truths' ? nextSpeaker(state) : null
  return (
    <section aria-labelledby="h-truths">
      <h2 id="h-truths" className="ritual m-0 text-[1.7rem]">
        That which is true
      </h2>
      <p className="m-0 mt-1 max-w-[56ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
        {upcoming
          ? `${upcoming.name} speaks the next truth when the table gathers.`
          : 'Every truth spoken this night. They may build on one another — never undo.'}
      </p>

      <div className="mt-4 space-y-6">
        {scenes.length === 0 && (
          <p className="m-0 text-[0.92rem] text-[var(--text-muted)]">Nothing is true yet.</p>
        )}
        {scenes.map((scene) => (
          <div key={scene}>
            <p className="label m-0">Scene {scene}</p>
            <div className="mt-2 space-y-3">
              {state.truths
                .filter((t) => t.scene === scene)
                .map((t) => (
                  <div key={t.id} className="truth">
                    <p className="m-0 text-[0.76rem] font-semibold tracking-wide text-[var(--text-muted)]">
                      {t.author}
                    </p>
                    <p className="m-0 mt-0.5 text-[0.98rem] leading-7 text-[var(--text-primary)]">{t.text}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
