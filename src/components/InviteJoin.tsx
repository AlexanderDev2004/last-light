import { useEffect, useState } from 'react'
import type { LobbyAction } from '../lobby/lobby'

/**
 * The screen an invite link lands on: the room code is already carried by
 * the URL, so all the invited player does is give their name and join.
 */
export default function InviteJoin({
  code,
  dispatch,
  onBack,
}: {
  code: string
  dispatch: (action: LobbyAction) => void
  onBack: () => void
}) {
  const [name, setName] = useState('')

  // the invite did its job once read; scrub it so a refresh doesn't drag
  // the old room back
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join')
      window.history.replaceState(null, '', url.toString())
    }
  }, [])

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(3rem, 10vh, 6rem)', paddingBottom: '5rem' }}>
      <div className="panel mx-auto max-w-[26rem] text-center">
        <p className="label m-0">You have been invited to a room</p>
        <span className="nums m-0 mt-3 block text-[clamp(1.8rem,4vw,2.6rem)] font-semibold tracking-[0.3em]">
          {code}
        </span>
        <form
          className="mt-6 space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault()
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
          <button type="submit" className="btn btn-primary w-full">
            Join the table
          </button>
        </form>
        <button type="button" className="btn-text mt-4 !text-[0.85rem]" onClick={onBack}>
          not now
        </button>
      </div>
    </div>
  )
}
