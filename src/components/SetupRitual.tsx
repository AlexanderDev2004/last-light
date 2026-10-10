import {
  CARD_HINT,
  cardsComplete,
  circleOf,
  isCardSet,
  leftOf,
  rightOf,
  setupProgress,
} from '../lib/card-drafts'
import type { SessionPlayer } from '../lib/ten-candles'

export interface CardPatch {
  virtue?: string
  vice?: string
  moment?: string
  brink?: string
}

function Field({
  label,
  hint,
  value,
  placeholder,
  secret = false,
  onChange,
}: {
  label: string
  hint: string
  value: string
  placeholder: string
  secret?: boolean
  onChange: (val: string) => void
}) {
  return (
    <div className="char-card !p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label m-0 !text-[0.66rem]">{label}</p>
        {secret && (
          <p className="m-0 shrink-0 text-[0.75rem] font-semibold text-[var(--accent)]">
            Sealed — its owner cannot see this
          </p>
        )}
      </div>
      <p className="m-0 mt-0.5 text-[0.82rem] text-[var(--text-muted)]">{hint}</p>
      <input
        className="field mt-2 !text-[0.95rem]"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}

function Dot({ set, label }: { set: boolean; label: string }) {
  return (
    <span
      className="tag nums"
      title={`${label}: ${set ? 'written' : 'waiting'}`}
      style={set ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
    >
      <span className={`ready-mark ${set ? 'on' : ''}`} aria-hidden="true" />
      {label}
    </span>
  )
}

/**
 * The writing ritual: nobody authors their own character alone.
 * Seating order is the roster order below — left means next, wrapping.
 * The keeper facilitates and holds no cards.
 */
export default function SetupRitual({
  players,
  me,
  isGM,
  isVisitor,
  onWrite,
}: {
  players: SessionPlayer[]
  me: string
  isGM: boolean
  isVisitor: boolean
  onWrite: (player: SessionPlayer, patch: CardPatch) => void
}) {
  const circle = circleOf(players)
  const { done, total } = setupProgress(players)
  const viewer = circle.find((p) => p.clientId === me) ?? null
  const inCircle = !isGM && !isVisitor && viewer !== null
  const solo = circle.length === 1

  const left = viewer ? leftOf(circle, viewer.clientId) : null
  const right = viewer ? rightOf(circle, viewer.clientId) : null

  return (
    <section aria-labelledby="h-writing">
      <h2 id="h-writing" className="ritual m-0 text-[1.9rem] leading-tight">
        The writing
      </h2>
      <p className="m-0 mt-1 max-w-[64ch] text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        No one writes their own character alone. Your <strong>Virtue</strong> is written by the
        player to your left, your <strong>Vice</strong> by the player to your right, your{' '}
        <strong>Moment</strong> by yourself, and your <strong>Brink</strong> — a sealed witness
        statement beginning “I have seen you…” — by the player to your right. Seated order is
        the muster below: left means next, wrapping around
        {solo ? '. Only one survivor sits here, so the whole character is yours to write.' : '.'}
      </p>
      <p className="nums m-0 mt-2 text-[0.9rem] font-semibold text-[var(--text-secondary)]" aria-live="polite">
        {done} of {total} cards written
      </p>

      {circle.length === 0 && (
        <p className="notice mt-4">No survivors are seated yet. The writing waits for them.</p>
      )}

      {inCircle && viewer && left && right && (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="ritual m-0 text-[1.4rem]">Your hand</h3>
            <p className="m-0 mt-1 text-[0.88rem] leading-6 text-[var(--text-muted)]">
              What you write for others. The Brink stays sealed from its owner.
            </p>
            <div className="mt-3 space-y-2.5">
              <Field
                label={solo ? 'Your Virtue' : `Virtue for ${right.name}`}
                hint={solo ? CARD_HINT.virtue : `Who ${right.name} is in the light.`}
                value={solo ? viewer.cards.virtue : right.cards.virtue}
                placeholder="Write a virtue…"
                onChange={(v) => onWrite(solo ? viewer : right, { virtue: v })}
              />
              <Field
                label={solo ? 'Your Vice' : `Vice for ${left.name}`}
                hint={solo ? CARD_HINT.vice : `Who ${left.name} is in the dark.`}
                value={solo ? viewer.cards.vice : left.cards.vice}
                placeholder="Write a vice…"
                onChange={(v) => onWrite(solo ? viewer : left, { vice: v })}
              />
              <Field
                label={solo ? 'Your Brink' : `Brink for ${left.name}`}
                hint={`A secret, beginning “I have seen you…”.`}
                value={solo ? viewer.cards.brink : left.cards.brink}
                placeholder="I have seen you…"
                secret={!solo}
                onChange={(v) => onWrite(solo ? viewer : left, { brink: v })}
              />
              <Field
                label="Your Moment"
                hint={CARD_HINT.moment}
                value={viewer.cards.moment}
                placeholder="I will find hope when…"
                onChange={(v) => onWrite(viewer, { moment: v })}
              />
            </div>
          </div>

          {!solo && (
            <div>
              <h3 className="ritual m-0 text-[1.4rem]">Written for you</h3>
              <p className="m-0 mt-1 text-[0.88rem] leading-6 text-[var(--text-muted)]">
                Your character as the table sees you.
              </p>
              <div className="mt-3 space-y-2.5">
                <div className="char-card !p-3">
                  <p className="label m-0 !text-[0.66rem]">Virtue — from {left.name}</p>
                  <p className="m-0 mt-1.5 text-[0.98rem] leading-7">
                    {viewer.cards.virtue || <span className="text-[var(--text-muted)]">Waiting…</span>}
                  </p>
                </div>
                <div className="char-card !p-3">
                  <p className="label m-0 !text-[0.66rem]">Vice — from {right.name}</p>
                  <p className="m-0 mt-1.5 text-[0.98rem] leading-7">
                    {viewer.cards.vice || <span className="text-[var(--text-muted)]">Waiting…</span>}
                  </p>
                </div>
                <div className="char-card !p-3">
                  <p className="label m-0 !text-[0.66rem]">Brink — sealed by {right.name}</p>
                  <p className="m-0 mt-1.5 text-[0.98rem] leading-7 text-[var(--text-muted)]">
                    {viewer.cards.brink
                      ? 'Sealed. You will meet it when it matters.'
                      : 'Waiting…'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isVisitor && (
        <p className="mt-4 text-[0.9rem] text-[var(--text-muted)]">
          You are not seated, so you may watch the writing but not touch it.
        </p>
      )}

      <div className="mt-8">
        <h3 className="ritual m-0 text-[1.4rem]">{isGM ? 'The muster' : 'The table'}</h3>
        <div className="mt-2 space-y-3">
          {circle.map((p) => {
            const l = leftOf(circle, p.clientId)
            const r = rightOf(circle, p.clientId)
            const complete = cardsComplete(p.cards)
            return (
              <div key={p.clientId} className="char-card !p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="ritual m-0 text-[1.25rem] leading-snug">
                    {p.name}
                    {p.clientId === me && (
                      <span className="ml-2 align-middle font-sans text-[0.75rem] font-semibold text-[var(--text-muted)]">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="m-0 text-[0.8rem] font-semibold text-[var(--text-secondary)]">
                    {complete ? 'Written' : 'Writing…'}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Dot set={isCardSet(p.cards.virtue)} label={`Virtue · ${l?.name ?? '—'}`} />
                  <Dot set={isCardSet(p.cards.vice)} label={`Vice · ${r?.name ?? '—'}`} />
                  <Dot set={isCardSet(p.cards.moment)} label="Moment · self" />
                  <Dot set={isCardSet(p.cards.brink)} label={`Brink · ${r?.name ?? '—'}`} />
                </div>
                {isGM && (
                  <div className="mt-2 space-y-1 border-t border-[var(--line)] pt-2 text-[0.88rem] leading-6 text-[var(--text-secondary)]">
                    <p className="m-0">
                      <strong>Virtue</strong> ({l?.name ?? '—'}): {p.cards.virtue || '—'}
                    </p>
                    <p className="m-0">
                      <strong>Vice</strong> ({r?.name ?? '—'}): {p.cards.vice || '—'}
                    </p>
                    <p className="m-0">
                      <strong>Moment</strong> (self): {p.cards.moment || '—'}
                    </p>
                    <p className="m-0">
                      <strong>Brink</strong> ({r?.name ?? '—'}): {p.cards.brink || '—'}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {isGM && (
        <p className="notice mt-4">
          Keeper: when all {total} cards are written, light the candles for real and read the
          first scene aloud — play opens by itself. Dice, truths and last words wait below
          until then.
        </p>
      )}
    </section>
  )
}
