/**
 * The lobby: rooms, members, roles — as a pure state machine, separate from
 * the night's engine (rooms outlive nights and have their own lifecycle).
 *
 * The transport (see lib/room-net.ts) feeds this reducer: the host applies
 * members' wire actions locally and broadcasts snapshots; guests apply the
 * host's snapshots as-is. The host is the creator (admin); admin != GM —
 * the keeper is appointed separately.
 *
 * Rules (see the lobby issues):
 *  - the room creator is the admin; admin != GM — the keeper is appointed
 *  - rooms hold at most MAX_MEMBERS people so a night can always start
 *  - joining is a stage, not an instant: knocking, then the host answers
 */

import { MAX_MEMBERS, newId, type Member, type Room } from '../game/types'

export interface LobbyState {
  stage: 'home' | 'joining' | 'room'
  room: Room | null
  /** the local user's member id once they are in a room */
  meId: string | null
  /** while knocking: the code and name the join was attempted with */
  pendingJoin: { code: string; name: string } | null
  /** a one-line message under the join form — wrong code, room full, … */
  notice: string | null
}

export type LobbyAction =
  | { type: 'lobby/create'; roomName: string; adminName: string; visibility: 'private' | 'public' }
  | { type: 'lobby/joinAttempt'; code: string; name: string }
  | { type: 'lobby/joinFailed'; notice: string }
  | { type: 'lobby/netState'; room: Room; selfToken: string }
  | { type: 'lobby/peerJoin'; id: string; name: string }
  | { type: 'lobby/peerLeave'; id: string }
  | { type: 'lobby/rename'; id: string; name: string }
  | { type: 'lobby/peerToggleGmInterest'; id: string }
  | { type: 'lobby/peerKick'; id: string }
  | { type: 'lobby/peerAppointGm'; gmMemberId: string | null }
  | { type: 'lobby/hostLost' }
  | { type: 'lobby/kicked' }
  | { type: 'lobby/adminChanged'; newAdminId: string }
  | { type: 'lobby/toggleGmInterest' }
  | { type: 'lobby/gmChanged'; gmMemberId: string | null }
  | { type: 'lobby/leave' }
  | { type: 'lobby/mockJoin'; name?: string }
  | { type: 'lobby/mockLeave' }

export function initialLobby(): LobbyState {
  return { stage: 'home', room: null, meId: null, pendingJoin: null, notice: null }
}

/** Room codes: six characters, no I/L/O/0/1 — readable aloud and over chat. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]
  return code
}

function member(name: string, role: Member['role']): Member {
  return { id: newId(), name, role, isGm: false, wantsGm: false, ready: false, connected: true }
}

/** Names mock members arrive under until the transport exists. */
const MOCK_NAMES = ['Juno', 'Marek', 'Sable', 'Vera']

export function reducer(state: LobbyState, action: LobbyAction): LobbyState {
  switch (action.type) {
    case 'lobby/create': {
      const admin = member(action.adminName.trim() || 'The admin', 'admin')
      const room: Room = {
        code: generateCode(),
        name: action.roomName.trim() || 'A room without a name',
        visibility: action.visibility,
        adminId: admin.id,
        gmMemberId: null,
        members: [admin],
      }
      return { stage: 'room', room, meId: admin.id, pendingJoin: null, notice: null }
    }

    case 'lobby/joinAttempt': {
      const code = action.code.trim().toUpperCase()
      if (!code) return { ...state, notice: 'Enter a room code first.' }
      // The transport takes over from here: it knocks on the room and either
      // comes back with a snapshot (netState) or fails (joinFailed).
      return {
        ...state,
        stage: 'joining',
        pendingJoin: { code, name: action.name.trim() || 'A stranger' },
        notice: null,
      }
    }

    case 'lobby/joinFailed': {
      return { ...initialLobby(), notice: action.notice }
    }

    case 'lobby/netState': {
      const seated = action.room.members.some((m) => m.id === action.selfToken)
      if (!seated) return state // the hook turns this into a joinFailed
      return { stage: 'room', room: action.room, meId: action.selfToken, pendingJoin: null, notice: null }
    }

    case 'lobby/peerJoin': {
      if (!state.room) return state
      if (state.room.members.some((m) => m.id === action.id)) return state // duplicate swarm is the same guest
      if (state.room.members.length >= MAX_MEMBERS) return state
      const joined: Member = {
        id: action.id,
        name: action.name,
        role: 'member',
        isGm: false,
        wantsGm: false,
        ready: false,
        connected: true,
      }
      return { ...state, room: { ...state.room, members: [...state.room.members, joined] } }
    }

    case 'lobby/peerLeave': {
      if (!state.room) return state
      return {
        ...state,
        room: {
          ...state.room,
          members: state.room.members.map((m) => (m.id === action.id ? { ...m, connected: false } : m)),
        },
      }
    }

    case 'lobby/rename': {
      if (!state.room) return state
      const name = action.name.trim().slice(0, 24)
      if (!name) return state
      return {
        ...state,
        room: {
          ...state.room,
          members: state.room.members.map((m) => (m.id === action.id ? { ...m, name } : m)),
        },
      }
    }

    case 'lobby/peerToggleGmInterest': {
      if (!state.room) return state
      return {
        ...state,
        room: {
          ...state.room,
          members: state.room.members.map((m) => (m.id === action.id ? { ...m, wantsGm: !m.wantsGm } : m)),
        },
      }
    }

    case 'lobby/peerKick': {
      if (!state.room) return state
      // the keeper's seat empties with the member who held it
      return {
        ...state,
        room: {
          ...state.room,
          gmMemberId: state.room.gmMemberId === action.id ? null : state.room.gmMemberId,
          members: state.room.members.filter((m) => m.id !== action.id),
        },
      }
    }

    case 'lobby/peerAppointGm': {
      if (!state.room) return state
      const gmMemberId = state.room.members.some((m) => m.id === action.gmMemberId) ? action.gmMemberId : null
      return {
        ...state,
        room: {
          ...state.room,
          gmMemberId,
          members: state.room.members.map((m) => ({ ...m, isGm: m.id === gmMemberId })),
        },
      }
    }

    case 'lobby/hostLost': {
      return {
        ...initialLobby(),
        notice: 'The keeper left and no one remained to keep the room — it has ended.',
      }
    }

    case 'lobby/kicked': {
      return { ...initialLobby(), notice: 'You were removed from the room by the admin.' }
    }

    case 'lobby/adminChanged': {
      if (!state.room || !state.room.members.some((m) => m.id === action.newAdminId)) return state
      return {
        ...state,
        room: {
          ...state.room,
          adminId: action.newAdminId,
          members: state.room.members.map((m) => ({ ...m, role: m.id === action.newAdminId ? 'admin' : 'member' })),
        },
        notice: `${state.room.members.find((m) => m.id === action.newAdminId)?.name ?? 'A member'} now keeps the room.`,
      }
    }

    case 'lobby/toggleGmInterest': {
      if (!state.room || !state.meId) return state
      return {
        ...state,
        room: {
          ...state.room,
          members: state.room.members.map((m) =>
            m.id === state.meId ? { ...m, wantsGm: !m.wantsGm } : m,
          ),
        },
      }
    }

    case 'lobby/gmChanged': {
      if (!state.room) return state
      // exactly one keeper, or none — an id that is not seated clears the seat
      const gmMemberId = state.room.members.some((m) => m.id === action.gmMemberId) ? action.gmMemberId : null
      return {
        ...state,
        room: {
          ...state.room,
          gmMemberId,
          members: state.room.members.map((m) => ({ ...m, isGm: m.id === gmMemberId })),
        },
      }
    }

    case 'lobby/leave': {
      return initialLobby()
    }

    case 'lobby/mockJoin': {
      if (!state.room || state.room.members.length >= MAX_MEMBERS) return state
      const taken = new Set(state.room.members.map((m) => m.name))
      const name = action.name?.trim() || MOCK_NAMES.find((n) => !taken.has(n))
      if (!name || taken.has(name)) return state
      return { ...state, room: { ...state.room, members: [...state.room.members, member(name, 'member')] } }
    }

    case 'lobby/mockLeave': {
      if (!state.room) return state
      const gone = state.room.members.filter((m) => m.role !== 'admin')
      if (gone.length === 0) return state
      const leaving = gone[gone.length - 1]
      return {
        ...state,
        room: { ...state.room, members: state.room.members.filter((m) => m.id !== leaving.id) },
      }
    }
  }
}

/* ---------- view helpers ---------- */

export function me(state: LobbyState): Member | null {
  return state.room?.members.find((m) => m.id === state.meId) ?? null
}

export function isAdmin(state: LobbyState): boolean {
  return me(state)?.role === 'admin'
}
