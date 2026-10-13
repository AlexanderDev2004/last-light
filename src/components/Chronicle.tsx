import type { NightState } from '../game/types'

/** Everything the night has said and done, newest last. */
export default function Chronicle({ state }: { state: NightState }) {
  const entries = state.log.slice(-40)
  return (
    <section aria-labelledby="h-chronicle">
      <h2 id="h-chronicle" className="ritual m-0 text-[1.7rem]">
        Chronicle
      </h2>
      <div className="scroll-thin mt-3 max-h-72 space-y-2 overflow-auto pr-1" aria-live="polite">
        {entries.length === 0 && (
          <p className="m-0 text-[0.92rem] text-[var(--text-muted)]">Nothing is written yet.</p>
        )}
        {entries.map((l) => (
          <p
            key={l.id}
            className="m-0 border-b border-[var(--line)] pb-2 text-[0.9rem] leading-6 text-[var(--text-secondary)]"
          >
            {l.text}
          </p>
        ))}
      </div>
    </section>
  )
}
