import { useEffect, useState } from 'react'
import type { LobbyAction, LobbyState } from '../lobby/lobby'

/** Reads an invite link's room code (`?join=CODE`) out of the URL, once. */
function inviteCodeFromUrl(): string {
  const code = new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? ''
  return /^[A-Z0-9]{1,6}$/.test(code) ? code : ''
}

function clearInviteFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('join')
  window.history.replaceState(null, '', url.toString())
}

/**
 * The lobby home: create a room, join one by code, or browse public rooms.
 * Public browsing and cross-device joining wait on the transport — the
 * buttons say so plainly instead of pretending.
 */
export default function LobbyHome({
  state,
  dispatch,
  onSingleScreen,
  onBack,
}: {
  state: LobbyState
  dispatch: (action: LobbyAction) => void
  onSingleScreen: () => void
  onBack: () => void
}) {
  const [roomName, setRoomName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [code, setCode] = useState(() => inviteCodeFromUrl())
  const [joinName, setJoinName] = useState('')
  // an invite link fills the code once; the URL is cleaned so a refresh
  // doesn't drag the old room back
  const cameFromInvite = code !== ''
  useEffect(() => {
    if (inviteCodeFromUrl()) clearInviteFromUrl()
  }, [])

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(2rem, 6vh, 4rem)', paddingBottom: '5rem' }}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="label m-0">The lobby</p>
        <button type="button" className="btn-text" onClick={onBack}>
          &larr; back to the title
        </button>
      </div>
      <h1 className="ritual m-0 mt-2 text-[clamp(1.6rem,4vw,2.5rem)]">Gather the table</h1>
      <p className="prose-measure mt-4 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        Make a room and share its code, or join one you were given. Three to five survivors
        plus a keeper sit down for a night.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="h-create" className="panel">
          <h2 id="h-create" className="ritual m-0 text-[1.25rem]">
            Create a room
          </h2>
          <p className="mt-1 mb-0 text-[0.85rem] leading-6 text-[var(--text-muted)]">
            You become the room's admin. You can keep the night yourself or hand the keeper's
            seat to someone who wants it.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="room-name">
                Room name
              </label>
              <input
                id="room-name"
                className="field mt-1.5"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="The generator hill"
                maxLength={40}
              />
            </div>
            <div>
              <label className="label" htmlFor="admin-name">
                Your name
              </label>
              <input
                id="admin-name"
                className="field mt-1.5"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Mara"
                maxLength={24}
              />
            </div>
            <div>
              <span className="label">Visibility</span>
              <div className="mt-1.5 flex gap-2">
                {(['private', 'public'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`btn flex-1 ${visibility === v ? 'btn-primary' : 'btn-quiet'}`}
                    aria-pressed={visibility === v}
                    onClick={() => setVisibility(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]">
                {visibility === 'private'
                  ? 'Only people with the room code can join.'
                  : 'Anyone browsing public rooms can join.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => dispatch({ type: 'lobby/create', roomName, adminName, visibility })}
          >
            Create the room
          </button>
        </section>

        <div className="space-y-8">
          <section aria-labelledby="h-join" className="panel">
            <h2 id="h-join" className="ritual m-0 text-[1.25rem]">
              Join with a code
            </h2>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                dispatch({ type: 'lobby/joinAttempt', code, name: joinName })
              }}
            >
              <div className="min-w-[10rem] flex-1">
                <label className="label" htmlFor="join-name">
                  Your name
                </label>
                <input
                  id="join-name"
                  className="field mt-1.5"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Bo"
                  maxLength={24}
                  autoComplete="off"
                  autoFocus={cameFromInvite}
                />
              </div>
              <div className="min-w-[12rem] flex-1">
                <label className="label" htmlFor="room-code">
                  Room code
                </label>
                <input
                  id="room-code"
                  className="field mt-1.5 nums uppercase"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="K7QP2M"
                  maxLength={6}
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="btn btn-quiet">
                Join
              </button>
            </form>
            {state.notice && (
              <p className="notice mt-4" role="status">
                {state.notice}
              </p>
            )}
          </section>

          <section aria-labelledby="h-public" className="panel">
            <h2 id="h-public" className="ritual m-0 text-[1.25rem]">
              Public rooms
            </h2>
            <p className="mt-1 mb-4 text-[0.85rem] leading-6 text-[var(--text-muted)]">
              Not lit yet — listing public rooms needs the room transport first.
            </p>
            <button type="button" className="btn" disabled title="Arrives with public room discovery">
              Browse public rooms
            </button>
          </section>
        </div>
      </div>

      <hr className="rule my-12" />

      <p className="m-0 text-[0.9rem] leading-7 text-[var(--text-secondary)]">
        Playing at one table?{' '}
        <button type="button" className="btn-text" onClick={onSingleScreen}>
          Keep this screen to yourselves
        </button>{' '}
        — candles, dice, and stacks on one display, the way the game is usually played.
      </p>
    </div>
  )
}
