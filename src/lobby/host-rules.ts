import type { Room } from '../game/types'
import type { LobbyAction } from './lobby'
import type { RoomWireAction } from '../lib/room-net'

/**
 * The host's trust boundary, as a pure function.
 *
 * Members speak through wire actions; the host decides what each one does.
 * `senderToken` is the member token bound to the wire connection that carried
 * the action (undefined when the connection never joined). A connection may
 * only ever act as the token it joined with, and kick / GM appointment are
 * the admin's alone — a non-admin's attempt is refused here, not just hidden
 * in the UI.
 */
export function resolveHostAction(room: Room | null, senderToken: string | undefined, action: RoomWireAction): LobbyAction | null {
  // once the room is gone, only a join can still be answered
  if (!room && action.kind !== 'join') return null
  switch (action.kind) {
    case 'join':
      return { type: 'lobby/peerJoin', id: action.token, name: action.name }

    case 'rename':
      if (!senderToken || senderToken !== action.token) return null
      return { type: 'lobby/rename', id: action.token, name: action.name }

    case 'leave':
      if (!senderToken || senderToken !== action.token) return null
      return { type: 'lobby/peerLeave', id: action.token }

    case 'toggleGmInterest':
      if (!senderToken || senderToken !== action.token) return null
      return { type: 'lobby/peerToggleGmInterest', id: action.token }

    case 'kick': {
      if (!senderToken || senderToken !== action.token) return null
      if (!room || room.adminId !== senderToken) return null // non-admin
      if (action.target === senderToken) return null // the admin cannot kick themselves
      return { type: 'lobby/peerKick', id: action.target }
    }

    case 'appointGm': {
      if (!senderToken || senderToken !== action.token) return null
      if (!room || room.adminId !== senderToken) return null // non-admin
      return { type: 'lobby/peerAppointGm', gmMemberId: action.gmMemberId }
    }

    case 'hello':
      return null
  }
}
