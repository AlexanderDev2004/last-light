import { useState } from 'react'
import type { CardKind, SessionPlayer } from '../lib/ten-candles'

const ORDER: CardKind[] = ['virtue', 'vice', 'moment', 'brink']
const LABEL: Record<CardKind, string> = {
  virtue: 'Virtue',
  vice: 'Vice',
  moment: 'Moment',
  brink: 'Brink',
}
const HINT: Record<CardKind, string> = {
  virtue: 'Who you are in the light.',
  vice: 'Who you are in the dark.',
  moment: 'When you find hope. Fulfilling it earns a hope die.',
  brink: 'A secret, beginning “I have seen you…”.',
}

export default function PlayerCards({
  player,
  isMine,
  onUpdate,
}: {
  player: SessionPlayer
  isMine: boolean
  onUpdate: (p: SessionPlayer) => void
}) {
  const [arming, setArming] = useState<CardKind | null>(null)

  function setCard(kind: CardKind, val: string) {
    setArming(null)
    onUpdate({ ...player, cards: { ...player.cards, [kind]: val } })
  }

  function burn(kind: CardKind) {
    const cards = { ...player.cards, burned: { ...player.cards.burned, [kind]: true } }
    if (kind === 'moment') cards.hopeDie = true
    setArming(null)
    onUpdate({ ...player, cards })
  }

  function toggleAlive() {
    onUpdate({ ...player, cards: { ...player.cards, alive: !player.cards.alive } })
  }

  const dead = !player.cards.alive

  return (
    <article className="char-card" aria-label={`Character card for ${player.name}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="ritual m-0 text-[1.4rem] leading-snug">
          {player.name}
          {isMine && (
            <span className="ml-2 align-middle font-sans text-[0.75rem] font-semibold text-[var(--text-muted)]">
              (you)
            </span>
          )}
        </h3>
        <p className="m-0 shrink-0 text-[0.8rem] font-semibold text-[var(--text-secondary)]">
          {player.isGM ? 'Keeper' : 'Survivor'} · {player.cards.hopeDie ? 'Hope die' : 'No hope die'} ·{' '}
          {dead ? 'Dead' : 'Alive'}
        </p>
      </div>

      <div className="mt-3 space-y-2.5">
        {ORDER.map((k) => {
          const burned = player.cards.burned[k]
          const armed = arming === k
          return (
            <div key={k} className={`char-card ${burned ? 'burned' : ''} !p-3`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="label m-0 !text-[0.66rem]">{LABEL[k]}</p>
                  <p className="m-0 mt-0.5 text-[0.82rem] text-[var(--text-muted)]">{HINT[k]}</p>
                </div>
                {isMine && !burned && !armed && (
                  <button className="btn-text shrink-0" onClick={() => setArming(k)}>
                    Burn
                  </button>
                )}
                {isMine && !burned && armed && (
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[0.8rem] font-semibold">Burn forever?</span>
                    <button className="btn-text" onClick={() => burn(k)}>
                      Yes, burn
                    </button>
                    <button className="btn-text" onClick={() => setArming(null)}>
                      Keep
                    </button>
                  </span>
                )}
                {burned && <p className="m-0 shrink-0 text-[0.8rem] font-semibold text-[var(--text-muted)]">Burned</p>}
              </div>
              {isMine && !burned ? (
                <input
                  className="field mt-2 !text-[0.95rem]"
                  aria-label={`${LABEL[k]} for ${player.name}`}
                  placeholder={
                    k === 'brink'
                      ? 'I have seen you…'
                      : k === 'moment'
                        ? 'I find hope when…'
                        : `Write ${LABEL[k].toLowerCase()}…`
                  }
                  value={player.cards[k]}
                  onChange={(e) => setCard(k, e.target.value)}
                />
              ) : (
                <p className="char-text m-0 mt-1.5 text-[0.98rem] leading-7">
                  {player.cards[k] || <span className="text-[var(--text-muted)]">Unwritten.</span>}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {isMine && (
        <button className="btn-text mt-3" onClick={toggleAlive}>
          {dead ? 'Mark alive again' : 'Record this death'}
        </button>
      )}
    </article>
  )
}
