import type { Room } from '../game/types'
import type { SyncAction } from '../game/night-sync'
import type { NightWireAction } from '../lib/room-net'

/**
 * The host's trust boundary for the night, as a pure function — the same
 * shape as the lobby's `resolveHostAction`, and used on both sides: the host
 * applies what it accepts, a guest pre-applies only what the host would
 * accept, so an optimistic screen never drifts from a refused action.
 *
 * `senderToken` is the member token bound to the connection that carried the
 * action. A token must belong to a connected member; a dropped player's seat
 * has gone dark and no longer speaks. Cards, name, and stack are each
 * survivor's own; the keeper's name is the keeper's; the door into (and out
 * of) the night is the admin's and keeper's both; and the brink reveal must
 * come from its owner, because the text exists only on their device.
 */
export function resolveNightHostAction(
  room: Room | null,
  senderToken: string,
  wire: NightWireAction,
): SyncAction | null {
  if (!room) return null
  const member = room.members.find((m) => m.id === senderToken)
  if (!member || !member.connected) return null
  const a = wire.action
  const isAdmin = room.adminId === senderToken
  const isKeeper = room.gmMemberId === senderToken
  switch (a.type) {
    case 'survivor/setCard':
    case 'survivor/rename':
    case 'survivor/toggleStack':
      return a.id === senderToken ? a : null

    case 'gm/set-name':
      return isKeeper ? a : null

    case 'survivor/move':
      return isAdmin ? a : null

    case 'survivor/add':
    case 'survivor/remove':
      // seats come from the room's members; they are not handed out here
      return null

    case 'night/begin':
    case 'night/reset':
      return isAdmin || isKeeper ? a : null

    case 'brink/reroll': {
      // a reveal must be spoken from the brink's own device, carrying its
      // text and the re-throw it buys — anything else is refused
      if (a.actorId !== senderToken || !wire.light || !wire.brinkText) return null
      return { type: 'night/revealBrink', actorId: a.actorId, brinkText: wire.brinkText, light: wire.light }
    }

    case 'conflict/roll': {
      if (!wire.light) return a // no dice carried: the host throws
      return { type: 'night/scripted', action: a, light: wire.light, dark: wire.dark, hope: wire.hope ?? null }
    }

    case 'conflict/rerollOnes': {
      if (!wire.light) return a
      return { type: 'night/scripted', action: a, light: wire.light }
    }

    default:
      return a
  }
}
