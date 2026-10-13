import { useRef, useState } from 'react'
import type { LobbyState } from '../lobby/lobby'
import { isAdmin, me } from '../lobby/lobby'
import { MAX_SURVIVORS, MIN_SURVIVORS } from '../game/types'

/**
 * A room as it stands before the night: who is seated, who keeps it, and the
 * code that lets others in. Ready-up and the start of the night arrive with
 * the ready gate; until then the admin can move everyone to the gathering.
 */
export default function RoomScreen({
  state,
  onRename,
  onLeave,
  onGather,
}: {
  state: LobbyState
  onRename: (name: string) => void
  onLeave: () => void
  onGather: () => void
}) {
  const room = state.room!
  const self = me(state)
  const admin = isAdmin(state)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')

  function commitRename() {
    const name = draftName.trim()
    if (name && self && name !== self.name) onRename(name)
    setRenaming(false)
  }

  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(2rem, 6vh, 4rem)', paddingBottom: '5rem' }}>
      <p className="label m-0">The room</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="ritual m-0 text-[clamp(1.6rem,4vw,2.5rem)]">{room.name}</h1>
        <span className="label m-0">
          {room.visibility} · {room.members.length} seated
        </span>
      </div>

      <div className="panel mt-8 max-w-[30rem]">
        <p className="label m-0">Room code — share it to let people in</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <span className="nums m-0 text-[clamp(1.8rem,4vw,2.6rem)] font-semibold tracking-[0.3em]">
            {room.code}
          </span>
          <button type="button" className="btn btn-quiet !py-1.5" onClick={() => void copyCode()}>
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <p className="mt-3 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]">
          Tabs must stay open — the room lives in the host's browser and dies when it closes.
        </p>
      </div>

      <section aria-labelledby="h-seats" className="mt-10">
        <h2 id="h-seats" className="ritual m-0 text-[1.25rem]">
          The table
        </h2>
        <ul className="mt-4 list-none p-0" style={{ maxWidth: '44rem' }}>
          {room.members.map((m) => (
            <li key={m.id} className="ledger-row" style={{ gap: '0.75rem' }}>
              <span className="nums label m-0" style={{ minWidth: '3.5rem' }}>
                seat {room.members.indexOf(m) + 1}
              </span>
              <span className="m-0 flex-1">
                {m.id === self?.id && renaming ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      commitRename()
                    }}
                  >
                    <input
                      autoFocus
                      className="field !py-1 !text-[0.95rem]"
                      style={{ maxWidth: '14rem' }}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={commitRename}
                      aria-label="Your name at the table"
                      maxLength={24}
                    />
                    <button type="submit" className="btn btn-quiet !py-1">
                      save
                    </button>
                  </form>
                ) : (
                  <>
                    {m.name}
                    {m.id === self?.id && (
                      <>
                        <span className="text-[var(--text-muted)]"> (you)</span>{' '}
                        <button
                          type="button"
                          className="btn-text !text-[0.8rem]"
                          onClick={() => {
                            setDraftName(m.name)
                            setRenaming(true)
                          }}
                        >
                          rename
                        </button>
                      </>
                    )}
                  </>
                )}
              </span>
              <span className="flex items-center gap-3">
                {m.role === 'admin' && <span className="label m-0 text-[var(--text-primary)]">admin</span>}
                {m.isGm && <span className="label m-0 text-[var(--flame)]">keeper</span>}
                {!m.connected && <span className="label m-0">gone dark</span>}
                <span
                  role="img"
                  aria-label={m.connected ? 'connected' : 'disconnected'}
                  style={{
                    width: '0.55rem',
                    height: '0.55rem',
                    borderRadius: '999px',
                    background: m.connected ? 'var(--flame)' : 'var(--line-strong)',
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 mb-0 text-[0.85rem] leading-6 text-[var(--text-muted)]" style={{ maxWidth: '44rem' }}>
          No keeper yet — the admin keeps the night or hands the seat to a member who wants it.
          A night needs {MIN_SURVIVORS}–{MAX_SURVIVORS} survivors plus the keeper.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-4" style={{ maxWidth: '44rem' }}>
        <button
          type="button"
          className="btn"
          disabled
          title="The ready gate arrives in a later update — everyone will ready up before the night begins"
        >
          {self?.ready ? 'Unready' : 'Ready'}
        </button>
        {admin && (
          <button type="button" className="btn btn-primary" onClick={onGather}>
            Move to the gathering
          </button>
        )}
        <button type="button" className="btn-text danger" onClick={onLeave}>
          Leave the room
        </button>
      </div>
      <p className="mt-3 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]" style={{ maxWidth: '44rem' }}>
        {admin
          ? '“Move to the gathering” opens the character stacks on this screen — it stands in until the ready gate takes over.'
          : 'Waiting for the admin to move the table to the gathering.'}
      </p>
    </div>
  )

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard unavailable (insecure context) — the code is on screen anyway
    }
  }
}
