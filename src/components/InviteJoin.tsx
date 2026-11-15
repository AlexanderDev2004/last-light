import { useEffect, useState } from 'react'
import type { Room } from '../game/types'
import { joinBlocker, type LobbyAction } from '../lobby/lobby'
import RoomRoster from './RoomRoster'

/**
 * The screen an invite link lands on: the room code is already carried by
 * the URL, so all the invited player does is give their name and join.
 *
 * While they read it the room is watched over the wire — the host answers
 * every peer that asks — so who is already seated, and whether a seat is
 * left, is known before a name is typed. A full table, or one whose night
 * has begun, closes the door here rather than after the knock.
 */
export default function InviteJoin({
  code,
  room,
  dispatch,
  onBack,
}: {
  code: string
  /** the room as the wire reports it; null until the host answers */
  room: Room | null
  dispatch: (action: LobbyAction) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')
  const blocker = joinBlocker(room)

  // the invite did its job once read; scrub it so a refresh doesn't drag
  // the old room back
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join')
      window.history.replaceState(null, '', url.toString())
    }
  }, [])

  // watch the room while this screen is open, and stop watching when it closes
  useEffect(() => {
    dispatch({ type: 'lobby/peek', code })
    return () => dispatch({ type: 'lobby/peekEnd' })
  }, [code, dispatch])

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(3rem, 10vh, 6rem)', paddingBottom: '5rem' }}>
      <div className="panel mx-auto max-w-[26rem] text-center">
        <p className="label m-0">You have been invited to a room</p>
        <span className="nums m-0 mt-3 block text-[clamp(1.8rem,4vw,2.6rem)] font-semibold tracking-[0.3em]">
          {code}
        </span>

        <div className="mt-6 text-left">
          <RoomRoster room={room} />
        </div>

        <form
          className="mt-6 space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault()
            if (blocker) return
            dispatch({ type: 'lobby/joinAttempt', code, name })
          }}
        >
          <div>
            <label className="label" htmlFor="invite-name">
              Your name
            </label>
            <input
              id="invite-name"
              className="field mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bo"
              maxLength={24}
              autoComplete="off"
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={blocker !== null}>
            Join the table
          </button>
          {blocker && <p className="notice m-0">{blocker}</p>}
        </form>
        <button type="button" className="btn-text mt-4 !text-[0.85rem]" onClick={onBack}>
          not now
        </button>
      </div>
    </div>
  )
}
