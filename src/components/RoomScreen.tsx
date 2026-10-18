import { useRef, useState } from 'react'
import type { LobbyState } from '../lobby/lobby'
import { gatherBlocker, isAdmin, me } from '../lobby/lobby'
import { MAX_MEMBERS, MIN_SURVIVORS } from '../game/types'

function inviteUrl(code: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('join', code)
  return url.toString()
}

/**
 * A room as it stands before the night: who is seated, who keeps it, and the
 * code that lets others in. The admin removes members and hands out the
 * keeper's seat; anyone may raise their hand for it. The night begins only
 * when exactly one keeper sits, 3–5 survivors surround them, and every seat
 * is ready.
 */
export default function RoomScreen({
  state,
  onRename,
  onLeave,
  onGather,
  onKick,
  onAppointGm,
  onToggleGmInterest,
  onToggleReady,
}: {
  state: LobbyState
  onRename: (name: string) => void
  onLeave: () => void
  onGather: () => void
  onKick: (id: string) => void
  onAppointGm: (gmMemberId: string | null) => void
  onToggleGmInterest: () => void
  onToggleReady: () => void
}) {
  const room = state.room!
  const self = me(state)
  const admin = isAdmin(state)
  const blocker = gatherBlocker(room)
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  const copyLinkTimer = useRef<number | undefined>(undefined)
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
          {room.gmMemberId
            ? ` — ${room.members.length - 1} survivors + the keeper`
            : ` — ${room.members.length} survivors, no keeper yet`}
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
          <button type="button" className="btn btn-quiet !py-1.5" onClick={() => void copyLink()}>
            {copiedLink ? 'link copied' : 'copy invite link'}
          </button>
        </div>
        <p className="mt-3 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]">
          The invite link carries the code — whoever opens it lands on the join form with the room
          already filled in. Tabs must stay open — the room lives in the host's browser and dies when it closes.
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
                {/* the keeper's seat: the admin takes it, takes it back, or
                    hands it to a member who raised their hand for it */}
                {admin && self && m.id === self.id && !m.isGm && (
                  <button type="button" className="btn-text !text-[0.8rem]" onClick={() => onAppointGm(m.id)}>
                    take the keeper's seat
                  </button>
                )}
                {admin && self && m.id === self.id && m.isGm && (
                  <button type="button" className="btn-text !text-[0.8rem]" onClick={() => onAppointGm(null)}>
                    leave the seat
                  </button>
                )}
                {admin && self && m.id !== self.id && m.wantsGm && !m.isGm && (
                  <button type="button" className="btn-text !text-[0.8rem]" onClick={() => onAppointGm(m.id)}>
                    make keeper
                  </button>
                )}
                {admin && self && m.id !== self.id && m.isGm && (
                  <button type="button" className="btn-text !text-[0.8rem]" onClick={() => onAppointGm(null)}>
                    take the seat back
                  </button>
                )}
                {self && m.id === self.id && (
                  <button type="button" className="btn-text !text-[0.8rem]" onClick={onToggleGmInterest}>
                    {m.wantsGm ? 'withdraw my hand' : 'I want to keep the night'}
                  </button>
                )}
                {admin && self && m.id !== self.id && (
                  <button
                    type="button"
                    className="btn-text danger !text-[0.8rem]"
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name} from the room?`)) onKick(m.id)
                    }}
                  >
                    kick
                  </button>
                )}
                {m.ready && <span className="label m-0 text-[var(--flame)]">ready</span>}
                {m.role === 'admin' && <span className="label m-0 text-[var(--text-primary)]">admin</span>}
                {m.isGm && <span className="label m-0 text-[var(--flame)]">keeper</span>}
                {m.wantsGm && !m.isGm && <span className="label m-0">wants the seat</span>}
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
          The admin keeps the night or hands the seat to a member who wants it — raise your hand on your own row.
          The table holds {MAX_MEMBERS} seats — the keeper plus up to {MAX_MEMBERS - 1}{' '}
          survivors. A night needs at least {MIN_SURVIVORS} survivors beside the keeper.
        </p>
      </section>

      {room.nightStarted && (
        <p className="notice mt-10" role="status">
          The night is being told — the table has moved to the gathering. Ready is frozen until it ends.
        </p>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-4" style={{ maxWidth: '44rem' }}>
        <button
          type="button"
          className={`btn ${self?.ready ? 'btn-primary' : ''}`}
          disabled={room.nightStarted}
          title={room.nightStarted ? 'The night is being told — ready is frozen' : undefined}
          onClick={onToggleReady}
        >
          {self?.ready ? 'Unready' : 'Ready'}
        </button>
        {admin && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocker !== null}
            title={blocker ?? 'Gather the table and write the cards'}
            onClick={onGather}
          >
            Move to the gathering
          </button>
        )}
        <button type="button" className="btn-text danger" onClick={onLeave}>
          Leave the room
        </button>
      </div>
      {blocker && (
        <p className="mt-3 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]" role="status">
          {blocker}
        </p>
      )}
      <p className="mt-3 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]" style={{ maxWidth: '44rem' }}>
        {blocker
          ? 'Ready up, seat the keeper, and wait for every seat — then the admin moves the table to the gathering.'
          : admin
            ? '“Move to the gathering” opens the character stacks — the cards are written before the candles are lit.'
            : 'The admin moves the table to the gathering when everything above is met.'}
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl(room.code))
      setCopiedLink(true)
      window.clearTimeout(copyLinkTimer.current)
      copyLinkTimer.current = window.setTimeout(() => setCopiedLink(false), 1600)
    } catch {
      // clipboard unavailable (insecure context) — the code is on screen anyway
    }
  }
}
