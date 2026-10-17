import type { LobbyAction, LobbyState } from '../lobby/lobby'

const REFUSALS: Record<NonNullable<LobbyState['failReason']>, { title: string; why: string }> = {
  full: {
    title: 'The table is full',
    why: 'Every seat is taken — the table holds five, the keeper included. Ask the keeper for the next one, or start a room of your own.',
  },
  'night-started': {
    title: 'The night has already begun',
    why: 'The candles are lit and the story is being told. A room holds one night only — ask the keeper to open a fresh one when this tale is done.',
  },
}

/** The door refused us: why, plainly, and the way back to the lobby. */
export default function JoinRefused({ state, dispatch }: { state: LobbyState; dispatch: (a: LobbyAction) => void }) {
  const refusal = REFUSALS[state.failReason ?? 'full']
  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(3rem, 10vh, 6rem)', paddingBottom: '5rem' }}>
      <div className="panel mx-auto max-w-[30rem] text-center">
        <p className="label m-0">The door stays closed</p>
        <h1 className="ritual m-0 mt-3 text-[clamp(1.5rem,4vw,2.2rem)]">{refusal.title}</h1>
        <p className="prose-measure mx-auto mt-4 mb-0 text-[0.92rem] leading-7 text-[var(--text-secondary)]">
          {refusal.why}
        </p>
        <button
          type="button"
          className="btn btn-primary mt-6"
          onClick={() => dispatch({ type: 'lobby/dismissFailure' })}
        >
          Back to the lobby
        </button>
      </div>
    </div>
  )
}
