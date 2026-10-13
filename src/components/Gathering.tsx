import { useState } from 'react'
import { beginBlocker } from '../game/engine'
import type { Action, CardKind, NightState } from '../game/types'
import Recorder from './Recorder'

const CARD_META: Record<CardKind, { label: string; hint: string; placeholder: string }> = {
  virtue: {
    label: 'Virtue',
    hint: 'Something they are proud of.',
    placeholder: 'A virtue…',
  },
  vice: {
    label: 'Vice',
    hint: 'Something they are ashamed of.',
    placeholder: 'A vice…',
  },
  moment: {
    label: 'Moment',
    hint: 'Something yet to be lived that could still bring hope. When it comes true, their hope die is lit.',
    placeholder: 'I will find hope when…',
  },
  brink: {
    label: 'Brink — written in secret',
    hint: 'What they become when terror and despair push them past their limit. The table looks away while it is written; it stays sealed until everything else has burned.',
    placeholder: 'When pushed past the brink, they…',
  },
}

export default function Gathering({
  state,
  dispatch,
  onRules,
}: {
  state: NightState
  dispatch: (a: Action) => void
  onRules: () => void
}) {
  const [newName, setNewName] = useState('')
  const blocker = beginBlocker(state)

  function addSurvivor() {
    const name = newName.trim()
    if (!name) return
    dispatch({ type: 'survivor/add', name })
    setNewName('')
  }

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(2rem, 6vh, 4rem)', paddingBottom: '6rem' }}>
      <p className="label">Before the dark closes in</p>
      <h1 className="ritual m-0 mt-3 max-w-[24ch] text-4xl leading-[1.08] sm:text-5xl">
        The gathering
      </h1>
      <p className="prose-measure mt-4 max-w-[68ch] leading-8 text-[var(--text-secondary)]">
        Sit close, dim the room, and set aside two or three hours. Name the keeper of the dark,
        then give every survivor their seat, their stack of cards, and — if they wish — a final
        message to leave behind. When the candles are lit, the writing is done.
      </p>

      <hr className="rule my-10" />

      {/* keeper */}
      <section aria-labelledby="h-keeper" className="max-w-md">
        <h2 id="h-keeper" className="ritual m-0 text-2xl">
          The keeper of the dark
        </h2>
        <p className="mt-1 max-w-[56ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
          One player describes the world, speaks for Them, and rolls the darkened candles. They
          hold no cards; They cannot die.
        </p>
        <input
          className="field mt-3 max-w-md"
          aria-label="Keeper name"
          placeholder="The keeper's name"
          value={state.gmName}
          onChange={(e) => dispatch({ type: 'gm/set-name', name: e.target.value })}
          autoComplete="off"
        />
      </section>

      <hr className="rule my-10" />

      {/* survivors */}
      <section aria-labelledby="h-survivors">
        <h2 id="h-survivors" className="ritual m-0 text-2xl">
          The survivors
        </h2>
        <p className="mt-1 max-w-[56ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
          Three to five is the game's shape. Seat order matters: it is the order the table speaks
          its truths in.
        </p>

        <div className="mt-4 space-y-2">
          {state.survivors.map((s, i) => (
            <div key={s.id} className="ledger-row">
              <span className="nums label shrink-0" style={{ minWidth: '3.5rem' }}>
                Seat {i + 1}
              </span>
              <input
                className="field !w-auto flex-1"
                style={{ minWidth: '10rem' }}
                aria-label={`Name for seat ${i + 1}`}
                value={s.name}
                onChange={(e) => dispatch({ type: 'survivor/rename', id: s.id, name: e.target.value })}
              />
              <span className="shrink-0 whitespace-nowrap">
                <button
                  type="button"
                  className="btn-text"
                  aria-label={`Move ${s.name || 'survivor'} up`}
                  disabled={i === 0}
                  onClick={() => dispatch({ type: 'survivor/move', id: s.id, dir: -1 })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-text"
                  aria-label={`Move ${s.name || 'survivor'} down`}
                  disabled={i === state.survivors.length - 1}
                  onClick={() => dispatch({ type: 'survivor/move', id: s.id, dir: 1 })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn-text danger"
                  aria-label={`Remove ${s.name || 'survivor'}`}
                  onClick={() => dispatch({ type: 'survivor/remove', id: s.id })}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex max-w-md gap-2.5">
          <input
            className="field"
            aria-label="New survivor name"
            placeholder="Who sits down?"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addSurvivor()
            }}
          />
          <button type="button" className="btn btn-quiet shrink-0" onClick={addSurvivor}>
            Take a seat
          </button>
        </div>
        {state.survivors.length > 0 && state.survivors.length < 3 && (
          <p className="notice mt-4">
            The game is shaped for three to five survivors. You may begin with fewer — but the
            dark does not care for courage.
          </p>
        )}
      </section>

      <hr className="rule my-10" />

      {/* stacks */}
      <section aria-labelledby="h-stacks">
        <h2 id="h-stacks" className="ritual m-0 text-2xl">
          The stacks
        </h2>
        <p className="mt-1 max-w-[62ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
          Every survivor is four cards, burned from the top as the night spends them: virtue,
          vice, moment, brink. Choose which trait sits on top — that one burns first.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {state.survivors.map((s) => (
            <article key={s.id} className="char-card" aria-label={`Stack for ${s.name || 'a survivor'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="ritual m-0 text-xl">{s.name.trim() || 'Unnamed'}</h3>
                <button
                  type="button"
                  className="btn-text shrink-0"
                  title="Which trait burns first"
                  onClick={() => dispatch({ type: 'survivor/toggleStack', id: s.id })}
                >
                  {s.viceOnTop ? 'Vice on top' : 'Virtue on top'}
                </button>
              </div>
              <div className="mt-3 space-y-2.5">
                {(s.viceOnTop ? (['vice', 'virtue'] as const) : (['virtue', 'vice'] as const)).map(
                  (kind) => (
                    <CardField
                      key={kind}
                      label={CARD_META[kind].label}
                      hint={CARD_META[kind].hint}
                      placeholder={CARD_META[kind].placeholder}
                      value={s.cards[kind].text}
                      onChange={(text) => dispatch({ type: 'survivor/setCard', id: s.id, kind, text })}
                    />
                  ),
                )}
                <CardField
                  label={CARD_META.moment.label}
                  hint={CARD_META.moment.hint}
                  placeholder={CARD_META.moment.placeholder}
                  value={s.cards.moment.text}
                  onChange={(text) => dispatch({ type: 'survivor/setCard', id: s.id, kind: 'moment', text })}
                />
                <CardField
                  label={CARD_META.brink.label}
                  hint={CARD_META.brink.hint}
                  placeholder={CARD_META.brink.placeholder}
                  value={s.cards.brink.text}
                  onChange={(text) => dispatch({ type: 'survivor/setCard', id: s.id, kind: 'brink', text })}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <hr className="rule my-10" />

      {/* final messages */}
      {state.survivors.length > 0 && (
        <section aria-labelledby="h-recordings">
          <h2 id="h-recordings" className="ritual m-0 text-2xl">
            The final messages
          </h2>
          <p className="mt-1 max-w-[62ch] text-[0.92rem] leading-7 text-[var(--text-secondary)]">
            In the quiet before the end, the recorder is passed around. Each survivor leaves one
            message for whoever finds it. They are played back only when every light is gone.
            This step is optional — a phone's voice app works just as well.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {state.survivors.map((s) => (
              <Recorder key={s.id} recKey={`night:${state.nightId}:rec:${s.id}`} name={s.name || 'Unnamed'} />
            ))}
          </div>
        </section>
      )}

      <hr className="rule my-10" />

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={blocker !== null}
          title={blocker ?? 'Light all ten'}
          onClick={() => dispatch({ type: 'night/begin' })}
        >
          Light the candles
        </button>
        <button type="button" className="btn-text" onClick={onRules}>
          Read the rules first
        </button>
      </div>
      {blocker && (
        <p className="mt-3 text-[0.9rem] text-[var(--text-muted)]" role="status">
          {blocker}
        </p>
      )}
    </div>
  )
}

function CardField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string
  hint: string
  placeholder: string
  value: string
  onChange: (text: string) => void
}) {
  return (
    <div className="panel-sunken">
      <p className="label m-0">{label}</p>
      <p className="m-0 mt-0.5 text-[0.8rem] leading-6 text-[var(--text-muted)]">{hint}</p>
      <input
        className="field mt-2"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
