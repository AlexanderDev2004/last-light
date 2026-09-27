import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  backendStatus,
  fetchLobbyX,
  joinLobbyX,
  startGameX,
  subscribeLobbyX,
  toggleReadyX,
  transferGMX,
  type BackendKind,
} from '../lib/game-backend'
import { getClientId } from '../lib/lobby-store'
import { allReady } from '../lib/lobby-store'
import { p2pOnPeers } from '../lib/p2p'
import LinkDiagnosis from '../components/LinkDiagnosis'
import type { Lobby } from '../lib/ten-candles'

export const Route = createFileRoute('/lobby/$lobbyId')({
  component: LobbyPage,
})

function LobbyPage() {
  const { lobbyId } = Route.useParams()
  const code = lobbyId.toUpperCase()
  const nav = useNavigate()
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [checked, setChecked] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [joinName, setJoinName] = useState('')
  const [joinErr, setJoinErr] = useState<string | null>(null)
  const [backend, setBackend] = useState<BackendKind | 'checking'>('checking')
  const me = typeof window !== 'undefined' ? getClientId() : ''

  useEffect(() => {
    setChecked(false)
    setLobby(null)
    backendStatus().then(setBackend)
    const offPeers = p2pOnPeers(code, () => {
      backendStatus().then(setBackend)
    })
    fetchLobbyX(code)
      .then((l) => {
        if (typeof window !== 'undefined') {
          const keys: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k?.startsWith('tc:lobby:')) keys.push(k)
          }
          console.debug(`[lobby] looking for ${code}; local rooms:`, keys)
        }
        setLobby(l)
      })
      .finally(() => setChecked(true))
    const off = subscribeLobbyX(code, setLobby)
    return () => {
      offPeers()
      off()
    }
  }, [code])

  useEffect(() => {
    if (lobby?.status === 'playing' && lobby.gameId) {
      nav({
        to: '/session/$gameId/$lobbyId',
        params: { gameId: lobby.gameId, lobbyId: lobby.id },
      })
    }
  }, [lobby?.status, lobby?.gameId])

  const inLobby = lobby?.players.some((p) => p.clientId === me) ?? false

  async function doJoin() {
    if (!joinName.trim()) {
      setJoinErr('Give your name so the keeper knows who has arrived.')
      return
    }
    try {
      setJoinErr(null)
      setBusy(true)
      setLobby(await joinLobbyX(code, joinName))
    } catch (e: unknown) {
      setJoinErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyInvite() {
    const link = `${window.location.origin}/lobby/${code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setErr('Copying failed. Read the code aloud instead.')
    }
  }

  if (!checked) {
    return (
      <div className="wrap px-0 pt-14 pb-20">
        <p className="label">The gathering</p>
        <p className="ritual-italic m-0 mt-3 max-w-[46ch] text-2xl leading-relaxed text-[var(--text-secondary)]">
          Listening for {code}…
        </p>
      </div>
    )
  }

  if (!lobby) {
    return (
      <div className="wrap px-0 pt-14 pb-20">
        <p className="label">The gathering</p>
        <h1 className="ritual m-0 mt-3 max-w-[20ch] text-4xl leading-tight sm:text-5xl">
          {backend === 'p2p' ? `Still listening for ${code}…` : `No room answers to ${code}.`}
        </h1>
        <div className="mt-4 max-w-[62ch] space-y-3 leading-8 text-[var(--text-secondary)]">
          <p className="m-0">
            {backend === 'p2p'
              ? 'A direct link is open. Keep this page open — the room arrives as soon as the keeper’s tab answers. If every tab closes, the room is gone. If nothing ever arrives, an ad-blocker, VPN, or office network may be stopping the peer trackers.'
              : backend === 'effect' || backend === 'pocketbase'
                ? 'A shared server is reachable, so re-read the code for a mistaken letter.'
                : 'A room created in this browser lives in this browser only. If you followed this code from another device, another browser, or a private window, it cannot hear you here.'}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn btn-primary" onClick={() => nav({ to: '/' })}>
            Create a room
          </button>
          <button className="btn btn-quiet" onClick={() => window.location.reload()}>
            Listen again
          </button>
        </div>
        {(backend === 'p2p' || backend === 'lokal') && <LinkDiagnosis />}
      </div>
    )
  }

  const readyCount = lobby.players.filter((p) => p.isReady).length
  const readyAll = allReady(lobby)
  const isGM = lobby.gmId === me
  const amReady = lobby.players.find((p) => p.clientId === me)?.isReady ?? false

  return (
    <div className="wrap px-0 pt-12 pb-20 sm:pt-16">
      <p className="label">The gathering</p>
      <h1 className="ritual m-0 mt-3 text-4xl leading-tight sm:text-6xl">{lobby.name}</h1>
      <p className="nums mt-4 text-[1.6rem] font-semibold tracking-[0.3em] text-[var(--accent)]">
        {lobby.id}
      </p>
      <p className="mt-2 max-w-[60ch] leading-7 text-[var(--text-secondary)]">
        Speak this code to gather the others. When everyone is seated and ready, the keeper
        begins the story.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn btn-quiet" onClick={copyInvite} disabled={busy}>
          {copied ? 'Copied to hand' : 'Copy invite'}
        </button>
        <span className="tag">
          {readyCount} of {lobby.players.length} ready
        </span>
        <span className="tag">
          {backend === 'effect'
            ? 'shared server'
            : backend === 'pocketbase'
              ? 'local server'
              : backend === 'p2p'
                ? 'direct link'
                : backend === 'lokal'
                  ? 'this browser only'
                  : 'checking link…'}
        </span>
      </div>
      {err && (
        <p className="inline-error mt-4" role="alert">
          {err}
        </p>
      )}

      <hr className="rule my-10" />

      {!inLobby ? (
        <section aria-labelledby="h-arrive" className="max-w-[52ch]">
          <h2 id="h-arrive" className="ritual m-0 text-3xl">
            Take the empty chair
          </h2>
          <p className="mt-2 leading-7 text-[var(--text-secondary)]">
            You followed the code here but you are not yet seated. Give your name.
          </p>
          <label className="label mt-5 block" htmlFor="arrive-name">
            Your name
          </label>
          <input
            id="arrive-name"
            className="field mt-1.5"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            autoComplete="off"
          />
          {joinErr && (
            <p className="inline-error mt-3" role="alert">
              {joinErr}
            </p>
          )}
          <button className="btn btn-primary mt-4" onClick={doJoin} disabled={busy}>
            {busy ? 'Sitting…' : 'Sit down'}
          </button>
        </section>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
          <section aria-labelledby="h-seated">
            <h2 id="h-seated" className="ritual m-0 text-3xl">
              Those seated
            </h2>
            <div className="mt-2" role="list" aria-label="Players">
              {lobby.players.map((p) => (
                <div key={p.clientId} className="ledger-row" role="listitem">
                  <div>
                    <p className="ritual m-0 text-[1.35rem] leading-snug">
                      {p.name}
                      {p.clientId === me && (
                        <span className="ml-2 align-middle font-sans text-[0.78rem] font-semibold text-[var(--text-muted)]">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="m-0 mt-0.5 text-[0.85rem] text-[var(--text-muted)]">
                      {p.isGM ? 'Keeper of the dark' : 'Survivor'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[0.88rem] font-semibold text-[var(--text-secondary)]">
                      <span className={`ready-mark ${p.isReady ? 'on' : ''}`} aria-hidden="true" />
                      {p.isReady ? 'Ready' : 'Not ready'}
                    </span>
                    {isGM && !p.isGM && (
                      <button
                        className="btn-text"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            setBusy(true)
                            setErr(null)
                            setLobby(await transferGMX(lobby.id, p.clientId))
                          } catch (e: unknown) {
                            setErr(e instanceof Error ? e.message : String(e))
                          } finally {
                            setBusy(false)
                          }
                        }}
                      >
                        Pass the keeping
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside aria-label="Beginning">
            <div className="panel-sunken lg:sticky lg:top-24">
              <p className="label">The beginning</p>
              <p className="mt-2 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
                {isGM
                  ? 'You keep the dark. When everyone is ready, put out the lamps and read the first scene aloud.'
                  : amReady
                    ? 'You are ready. Wait for the others, then the keeper puts out the lamps.'
                    : 'When you are ready to face the dark, say so. The story cannot begin until everyone is ready.'}
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  className="btn btn-quiet w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setLobby(await toggleReadyX(lobby.id))
                    setBusy(false)
                  }}
                >
                  {amReady ? 'I am not ready' : 'I am ready'}
                </button>
                <button
                  className="btn btn-primary w-full"
                  disabled={!isGM || !readyAll || busy}
                  title={
                    !isGM
                      ? 'Only the keeper can begin'
                      : !readyAll
                        ? 'Everyone must be ready first'
                        : 'Put out the lamps'
                  }
                  onClick={async () => {
                    try {
                      setErr(null)
                      setBusy(true)
                      setLobby(await startGameX(lobby.id))
                    } catch (e: unknown) {
                      setErr(e instanceof Error ? e.message : String(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Begin the story
                </button>
                {!readyAll && (
                  <p className="m-0 text-[0.85rem] leading-6 text-[var(--text-muted)]">
                    {readyCount} of {lobby.players.length} ready. At least two seated souls are
                    needed.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
