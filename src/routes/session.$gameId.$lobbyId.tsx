import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import AudioRecorder from '../components/AudioRecorder'
import CandleBar from '../components/CandleBar'
import DiceRoller from '../components/DiceRoller'
import PlayerCards from '../components/PlayerCards'
import TruthsJournal from '../components/TruthsJournal'
import {
  addTruthX,
  backendStatus,
  endGameX,
  ensureSessionX,
  extinguishCandleX,
  fetchLobbyX,
  resetSessionX,
  savePlayerCardsX,
  subscribeSessionX,
  type BackendKind,
} from '../lib/game-backend'
import { getClientId } from '../lib/lobby-store'
import { p2pOnPeers } from '../lib/p2p'
import { validateTruth, type GameSession, type Lobby, type SessionPlayer } from '../lib/ten-candles'

export const Route = createFileRoute('/session/$gameId/$lobbyId')({
  component: SessionPage,
})

function SessionPage() {
  const { gameId, lobbyId } = Route.useParams()
  const nav = useNavigate()
  const [session, setSession] = useState<GameSession | null>(null)
  const [checked, setChecked] = useState(false)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [lightsOut, setLightsOut] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [backend, setBackend] = useState<BackendKind | 'checking'>('checking')
  const me = typeof window !== 'undefined' ? getClientId() : ''
  // Unknown until the lobby loads — and never assumed to be the keeper.
  const isGM = lobby ? lobby.gmId === me : false
  const myPlayer = session?.players.find((p) => p.clientId === me)
  const isVisitor = !!lobby && !isGM && !myPlayer
  const keeper = lobby?.players.find((p) => p.clientId === lobby?.gmId)
  const survivors = session?.players.filter((p) => !p.isGM) ?? []
  const linkWord =
    backend === 'effect'
      ? 'shared server'
      : backend === 'pocketbase'
        ? 'local server'
        : backend === 'p2p'
          ? 'direct link'
          : backend === 'lokal'
            ? 'this browser only'
            : 'checking link…'

  useEffect(() => {
    setChecked(false)
    setSession(null)
    backendStatus().then(setBackend)
    const offPeers = p2pOnPeers(lobbyId.toUpperCase(), () => {
      backendStatus().then(setBackend)
    })
    fetchLobbyX(lobbyId).then(setLobby)
    ensureSessionX(gameId, lobbyId)
      .then(setSession)
      .finally(() => setChecked(true))
    const off = subscribeSessionX(gameId, lobbyId, setSession)
    return () => {
      offPeers()
      off()
    }
  }, [gameId, lobbyId])

  if (!checked || !session) {
    if (!checked) {
      return (
        <div className="wrap px-0 pt-14 pb-20">
          <p className="label">Entering the dark</p>
          <p className="ritual-italic m-0 mt-3 max-w-[46ch] text-2xl leading-relaxed text-[var(--text-secondary)]">
            The candles are being lit…
          </p>
        </div>
      )
    }
    return (
      <div className="wrap px-0 pt-14 pb-20">
        <p className="label">Entering the dark</p>
        <h1 className="ritual m-0 mt-3 max-w-[20ch] text-4xl leading-tight sm:text-5xl">
          This night was never begun.
        </h1>
        <p className="mt-4 max-w-[60ch] leading-8 text-[var(--text-secondary)]">
          No session lives under this mark. Sessions are born when the keeper begins the story
          from the gathering — return there and begin it properly.
        </p>
        <button
          className="btn btn-primary mt-6"
          onClick={() => nav({ to: '/lobby/$lobbyId', params: { lobbyId: lobbyId.toUpperCase() } })}
        >
          Back to the gathering
        </button>
      </div>
    )
  }

  const gmPool = 10 - session.candlesLit

  async function savePlayer(next: SessionPlayer) {
    const updated = await savePlayerCardsX(gameId, lobbyId, next)
    if (updated) setSession(updated)
  }

  async function endGame() {
    const updated = await endGameX(gameId, lobbyId)
    if (updated) setSession(updated)
    setConfirmEnd(false)
    setLightsOut(true)
  }

  return (
    <div
      className="wrap px-0 pt-10 pb-20"
      style={lightsOut ? { background: '#000', minHeight: '100vh' } : undefined}
    >
      <p className="label">
        {lobby?.name ?? 'The story'} · {linkWord}
      </p>

      {isVisitor ? (
        <div className="panel mt-4">
          <p className="label">Unseated</p>
          <p className="m-0 mt-1 max-w-[60ch] leading-7 text-[var(--text-secondary)]">
            You are not seated at this table, so you may watch but not touch. Return to the
            gathering and take the empty chair to play.
          </p>
          <button
            className="btn btn-quiet mt-3"
            onClick={() => nav({ to: '/lobby/$lobbyId', params: { lobbyId: lobbyId.toUpperCase() } })}
          >
            Back to the gathering
          </button>
        </div>
      ) : isGM ? (
        <div className="panel mt-4">
          <p className="label">You keep the dark{keeper ? ` — ${keeper.name}` : ''}</p>
          <p className="m-0 mt-1 max-w-[62ch] leading-7 text-[var(--text-secondary)]">
            Frame the scene. Call for rolls only when something is at stake. Meet or beat their
            sixes to price each success. Lead the truths, and put out the last candle yourself.
          </p>
        </div>
      ) : (
        <div className="panel mt-4">
          <p className="label">You are {myPlayer?.name ?? 'a survivor'}</p>
          <p className="m-0 mt-1 max-w-[62ch] leading-7 text-[var(--text-secondary)]">
            Speak your truths. Burn cards to reroll. When you fall, narrate your own death —
            no one else may do it for you.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn btn-quiet" onClick={() => setLightsOut(!lightsOut)}>
          {lightsOut ? 'Bring back the light' : 'Lights out'}
        </button>
        {session.ended && (
          <span className="tag">These things are true. The world is dark.</span>
        )}
      </div>

      {isGM && !session.ended && (
        <div className="mt-4">
          <p className="label">Keeper controls</p>
          {!confirmEnd ? (
            <button className="btn btn-quiet mt-2" onClick={() => setConfirmEnd(true)}>
              End the story
            </button>
          ) : (
            <span className="mt-2 flex flex-wrap items-center gap-3" role="group" aria-label="Confirm ending">
              <span className="text-[0.9rem] font-semibold">
                Put out the last candle? This cannot be undone.
              </span>
              <button className="btn btn-primary" onClick={endGame}>
                Yes, end it
              </button>
              <button className="btn-text" onClick={() => setConfirmEnd(false)}>
                Stay a while
              </button>
            </span>
          )}
        </div>
      )}

      <hr className="rule my-8" />

      <CandleBar
        lit={session.candlesLit}
        canControl={isGM && !session.ended}
        onExtinguish={async () => {
          const n = await extinguishCandleX(gameId, lobbyId)
          if (n) setSession(n)
        }}
        onRelight={async () => {
          const n = await resetSessionX(gameId, lobbyId)
          if (n) setSession(n)
        }}
      />

      <hr className="rule my-10" />

      <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-12">
          <DiceRoller
            pool={session.candlesLit}
            gmPool={gmPool}
            isGM={isGM}
            canRoll={!isVisitor}
          />

          <hr className="rule" />

          <section aria-labelledby="h-cast">
            <h2 id="h-cast" className="ritual m-0 text-[1.7rem]">
              The cast
            </h2>
            {keeper && (
              <div className="panel mt-4 !py-4">
                <p className="label">Keeper of the dark</p>
                <p className="ritual m-0 mt-1 text-[1.5rem] leading-snug">{keeper.name}</p>
                <p className="m-0 mt-1 text-[0.88rem] text-[var(--text-muted)]">
                  Has no card. Cannot die.
                </p>
              </div>
            )}
            <div className="mt-4 space-y-4">
              {survivors.map((p) => (
                <PlayerCards
                  key={p.clientId}
                  player={p}
                  isMine={p.clientId === me && !isVisitor}
                  onUpdate={savePlayer}
                />
              ))}
              {survivors.length === 0 && (
                <p className="text-[0.95rem] text-[var(--text-muted)]">
                  No survivors yet. The night has not truly begun.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-12">
          <TruthsJournal
            truths={session.truths}
            candlesLit={session.candlesLit}
            userName={isGM ? (keeper?.name ?? 'Keeper') : (myPlayer?.name ?? 'Survivor')}
            canWrite={!isVisitor}
            onAdd={async (text) => {
              const v = validateTruth(text)
              if (v) return v
              try {
                const author = isGM ? (keeper?.name ?? 'Keeper') : (myPlayer?.name ?? 'Survivor')
                const n = await addTruthX(gameId, lobbyId, author, text)
                if (n) setSession(n)
                return null
              } catch (e: unknown) {
                return e instanceof Error ? e.message : String(e)
              }
            }}
          />

          <hr className="rule" />

          <section aria-labelledby="h-words">
            <h2 id="h-words" className="ritual m-0 text-[1.7rem]">
              Last words
            </h2>
            <p className="m-0 mt-1 max-w-[52ch] text-[0.95rem] leading-7 text-[var(--text-secondary)]">
              Record before the light fails. When no one is left, play them back in the dark.
            </p>
            <div className="mt-4 space-y-4">
              {survivors.map((p) => (
                <AudioRecorder
                  key={p.clientId}
                  audioKey={`${gameId}:${lobbyId}:${p.clientId}`}
                  name={p.name}
                  canRecord={p.clientId === me && !isVisitor}
                />
              ))}
            </div>
            {lightsOut && (
              <p className="notice mt-4">
                Play each recording above, one after another. Do not bring back the light.
              </p>
            )}
          </section>

          <hr className="rule" />

          <section aria-labelledby="h-chronicle">
            <h2 id="h-chronicle" className="ritual m-0 text-[1.7rem]">
              Chronicle
            </h2>
            <div className="scroll-thin mt-3 max-h-64 space-y-2 overflow-auto" aria-live="polite">
              {session.log.slice(-30).map((l, i) => (
                <p key={i} className="m-0 border-b border-[var(--line)] pb-2 text-[0.9rem] text-[var(--text-secondary)]">
                  {l}
                </p>
              ))}
            </div>
            {isGM && !confirmReset && (
              <button className="btn-text mt-4" onClick={() => setConfirmReset(true)}>
                Start the night over
              </button>
            )}
            {isGM && confirmReset && (
              <span className="mt-4 flex flex-wrap items-center gap-3" role="group" aria-label="Confirm reset">
                <span className="text-[0.9rem] font-semibold">Relight all ten and clear the end?</span>
                <button
                  className="btn btn-quiet"
                  onClick={async () => {
                    const n = await resetSessionX(gameId, lobbyId)
                    if (n) setSession(n)
                    setConfirmReset(false)
                  }}
                >
                  Yes, relight
                </button>
                <button className="btn-text" onClick={() => setConfirmReset(false)}>
                  Keep the dark
                </button>
              </span>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
