import { MAX_MEMBERS, type Room } from '../game/types'

/**
 * Who is already at the table, as the wire reports it. Both doors into a room
 * read from it — the invite screen and the lobby's join form — so a player is
 * told the same thing before knocking, whichever way they came.
 *
 * `room` null means the host has not answered yet: honest about the wait, not
 * a claim that the table is empty.
 */
export default function RoomRoster({ room }: { room: Room | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label m-0">At the table</p>
        <p className="label nums m-0">
          {room ? `${room.members.length} of ${MAX_MEMBERS} seated` : 'no answer yet'}
        </p>
      </div>
      {room === null ? (
        <p className="mt-2 mb-0 text-[0.85rem] leading-6 text-[var(--text-muted)]">
          Waiting for the room to answer. It lives in the host's browser — if their tab is
          closed, nothing answers.
        </p>
      ) : (
        <ul className="mt-1 list-none p-0">
          {room.members.map((m, i) => (
            <li key={m.id} className="ledger-row" style={{ gap: '0.75rem' }}>
              <span className="nums label m-0 shrink-0" style={{ minWidth: '3.5rem' }}>
                seat {i + 1}
              </span>
              <span className="m-0 flex-1">{m.name}</span>
              <span className="shrink-0">
                {m.isGm && <span className="label m-0 text-[var(--flame)]">keeper</span>}
                {!m.connected && <span className="label m-0">gone dark</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
