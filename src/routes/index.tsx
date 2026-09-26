import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  backendStatus,
  createLobbyX,
  joinLobbyX,
  type BackendKind,
} from '../lib/game-backend'
import { pbAvailable, pbEnabled, pbUrl, setPbEnabled, setPbUrl } from '../lib/pb'

export const Route = createFileRoute('/')({ component: Landing })

function TenTicks() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="inline-block h-4 w-px"
          style={{ background: i < 7 ? 'var(--accent)' : 'var(--line-strong)', opacity: 0.35 + i * 0.065 }}
        />
      ))}
    </div>
  )
}

function Landing() {
  const nav = useNavigate()
  const [roomName, setRoomName] = useState('')
  const [userName, setUserName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [backend, setBackend] = useState<BackendKind | 'checking'>('checking')
  const [pbUrlField, setPbUrlField] = useState(pbUrl())
  const [pbOn, setPbOn] = useState(pbEnabled())
  const [pbMsg, setPbMsg] = useState<string | null>(null)

  useEffect(() => {
    backendStatus().then(setBackend)
  }, [])

  async function refreshBackend() {
    setBackend(await backendStatus())
  }

  async function connectPb() {
    const url = pbUrlField.trim() || 'http://127.0.0.1:8090'
    setPbUrl(url)
    setPbEnabled(true)
    setPbOn(true)
    setPbMsg('Listening…')
    if (await pbAvailable()) {
      setPbMsg('The server answers. Rooms will travel by code and link.')
    } else {
      setPbMsg('No server answers there. Start PocketBase at that address, then connect again.')
    }
    await refreshBackend()
  }

  async function disconnectPb() {
    setPbEnabled(false)
    setPbOn(false)
    setPbMsg('Left the shared server. Rooms stay in this browser.')
    await refreshBackend()
  }

  async function doCreate() {
    try {
      setErr(null)
      setBusy('create')
      const lobby = await createLobbyX(roomName, userName, 5)
      nav({ to: '/lobby/$lobbyId', params: { lobbyId: lobby.id } })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function doJoin() {
    try {
      setErr(null)
      setBusy('join')
      const lobby = await joinLobbyX(joinCode, joinName)
      if (!lobby) {
        setErr('No room answers to that code. Check it and try again.')
        return
      }
      nav({ to: '/lobby/$lobbyId', params: { lobbyId: lobby.id } })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="wrap px-0 pt-14 pb-20 sm:pt-20">
      {/* Opening statement */}
      <p className="label">A companion for Ten Candles</p>
      <h1 className="ritual m-0 mt-4 max-w-[22ch] text-[2.6rem] leading-[1.06] sm:text-7xl">
        The world has been dark for ten days.
      </h1>
      <p className="ritual-italic mt-5 max-w-[52ch] text-xl leading-relaxed text-[var(--text-secondary)] sm:text-2xl">
        Every character dies. The story is what happens before the final flame goes out.
      </p>

      <div className="mt-8">
        <TenTicks />
      </div>

      <hr className="rule my-10" />

      {/* Actions */}
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <section aria-labelledby="h-create">
          <h2 id="h-create" className="ritual m-0 text-[1.7rem]">
            Create a room
          </h2>
          <p className="mt-2 max-w-[46ch] text-[0.98rem] leading-7 text-[var(--text-secondary)]">
            You begin as the keeper of the dark. Name the room, take your seat, and send the
            code to the people who will die with you.
          </p>
          <div className="mt-5 space-y-3">
            <div>
              <label className="label" htmlFor="room-name">
                Room name
              </label>
              <input
                id="room-name"
                className="field mt-1.5"
                placeholder="The service station"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label" htmlFor="gm-name">
                Your name
              </label>
              <input
                id="gm-name"
                className="field mt-1.5"
                placeholder="Keeper"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-primary" onClick={doCreate} disabled={busy !== null}>
              {busy === 'create' ? 'Lighting the room…' : 'Create a room'}
            </button>
          </div>
        </section>

        <section aria-labelledby="h-join">
          <h2 id="h-join" className="ritual m-0 text-[1.7rem]">
            Join a room
          </h2>
          <p className="mt-2 max-w-[46ch] text-[0.98rem] leading-7 text-[var(--text-secondary)]">
            Someone is already keeping the light. Enter the code they gave you and take the
            empty chair.
          </p>
          <div className="mt-5 space-y-3">
            <div>
              <label className="label" htmlFor="join-code">
                Room code
              </label>
              <input
                id="join-code"
                className="field nums mt-1.5 uppercase"
                placeholder="XC9K2Q"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="label" htmlFor="join-name">
                Your name
              </label>
              <input
                id="join-name"
                className="field mt-1.5"
                placeholder="Survivor"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-quiet" onClick={doJoin} disabled={busy !== null}>
              {busy === 'join' ? 'Entering…' : 'Join a room'}
            </button>
          </div>
        </section>
      </div>

      {err && (
        <p className="inline-error mt-6" role="alert">
          {err}
        </p>
      )}

      <p className="mt-6 text-[0.85rem] text-[var(--text-muted)]">
        Link:{' '}
        {backend === 'effect'
          ? 'live — shared server'
          : backend === 'pocketbase'
            ? 'live — local server'
            : backend === 'p2p'
              ? 'live — direct link between browsers'
              : backend === 'lokal'
                ? 'this browser only'
                : 'checking…'}
      </p>

      <p className="mt-6 text-[0.85rem] text-[var(--text-muted)]">
        No account, no server to run — rooms travel directly between open tabs. Keep the
        keeper’s tab open, or the room goes with it.
      </p>

      <details className="mt-3 max-w-[52ch]">
        <summary className="cursor-pointer text-[0.85rem] font-semibold text-[var(--text-secondary)] underline underline-offset-4">
          Use a shared PocketBase server
        </summary>
        <p className="mt-2 text-[0.85rem] leading-6 text-[var(--text-muted)]">
          Rooms stay in this browser unless every device reaches the same server. Point this
          page at a running PocketBase and rooms will travel by code and link.
        </p>
        <div className="mt-2 flex gap-2.5">
          <input
            className="field"
            aria-label="PocketBase server URL"
            placeholder="http://127.0.0.1:8090"
            value={pbUrlField}
            onChange={(e) => setPbUrlField(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {pbOn ? (
            <button className="btn btn-quiet shrink-0" onClick={disconnectPb}>
              Leave it
            </button>
          ) : (
            <button className="btn btn-quiet shrink-0" onClick={connectPb} disabled={busy !== null}>
              Connect
            </button>
          )}
        </div>
        {pbMsg && <p className="mt-2 text-[0.85rem] text-[var(--text-secondary)]">{pbMsg}</p>}
      </details>

      <hr className="rule my-12" />

      {/* The premise */}
      <section aria-labelledby="h-premise" className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-12">
        <p className="label m-0 pt-2">01 — Premise</p>
        <div className="prose-measure max-w-[68ch] space-y-4 leading-8 text-[var(--text-secondary)]">
          <p className="m-0">
            Ten days ago the world went dark and never came back. Generators fail, supplies thin,
            and something moves beyond the edge of the light. Anyone who leaves it does not
            return.
          </p>
          <p className="m-0">
            Ten Candles is a tragic horror game, not a survival game. There is no winning, no
            rescue, no morning. Ten candles mark ten scenes, and when the last one goes out, so
            does everyone at the table.
          </p>
        </div>
      </section>

      <hr className="rule my-12" />

      {/* How play works */}
      <section aria-labelledby="h-how" className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-12">
        <p className="label m-0 pt-2">02 — How play works</p>
        <div className="prose-measure max-w-[68ch] space-y-4 leading-8 text-[var(--text-secondary)]">
          <p className="m-0">
            Each player carries four cards: virtue, vice, a moment that could bring hope, and a
            secret brink written about them by someone else. Risky actions are decided by rolling
            as many dice as there are candles still burning. A six means success. Ones are lost
            to the dark.
          </p>
          <p className="m-0">
            Failure puts out a candle and ends the scene. Then everyone at the table speaks one
            new truth about the world. Cards can be burned to reroll — once burned, that part of
            the character is gone. When a single candle remains, failures become deaths, each one
            narrated by the dying.
          </p>
        </div>
      </section>

      <hr className="rule my-12" />

      {/* What the companion replaces */}
      <section aria-labelledby="h-replaces" className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-12">
        <p className="label m-0 pt-2">03 — What this replaces</p>
        <div className="prose-measure max-w-[68ch] space-y-4 leading-8 text-[var(--text-secondary)]">
          <p className="m-0">
            The ten physical candles, for rooms where open flame is unwelcome. The shared dice
            pool, counted automatically from the light that remains. The index cards, burned here
            with the same finality. The book of truths, kept in one hand. And the tape recorder
            for last words — recorded at the start, played back in darkness at the end.
          </p>
          <p className="m-0">
            It replaces nothing else. The fear, the bargaining, and the dying are still yours to
            do in person, in a dark room, together.
          </p>
        </div>
      </section>
    </div>
  )
}
