/**
 * The lobby: rooms, members, roles — as a pure state machine, separate from
 * the night's engine (rooms outlive nights and have their own lifecycle).
 *
 * This module is local-only for now: members other than the admin arrive
 * through `mockJoin` so the screens can be exercised end to end. The WebRTC
 * transport replaces the mock as the source of these same actions later,
 * without touching this reducer or the components.
 *
 * Rules for now (see the lobby issues):
 *  - the room creator is the admin; admin != GM — the keeper is appointed
 *  - rooms hold at most MAX_MEMBERS people so a night can always start
 *  - joining by code waits for the transport; the attempt is recorded
 */

import { MAX_MEMBERS, newId, type Member, type Room } from '../game/types'

export interface LobbyState {
  stage: 'home' | 'room'
  room: Room | null
  /** the local user's member id once they are in a room */
  meId: string | null
  /** a one-line message under the join form — wrong code, room full, … */
  notice: string | null
}

export type LobbyAction =
  | { type: 'lobby/create'; roomName: string; adminName: string; visibility: 'private' | 'public' }
  | { type: 'lobby/joinAttempt'; code: string; name: string }
  | { type: 'lobby/leave' }
  | { type: 'lobby/mockJoin'; name?: string }
  | { type: 'lobby/mockLeave' }

export function initialLobby(): LobbyState {
  return { stage: 'home', room: null, meId: null, notice: null }
}

/** Room codes: six characters, no I/L/O/0/1 — readable aloud and over chat. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]
  return code
}

function member(name: string, role: Member['role']): Member {
  return { id: newId(), name, role, isGm: false, ready: false, connected: true }
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
      return { stage: 'room', room, meId: admin.id, notice: null }
    }

    case 'lobby/joinAttempt': {
      const code = action.code.trim().toUpperCase()
      if (!code) return { ...state, notice: 'Enter a room code first.' }
      // No transport yet: no room can answer. The attempt is reported honestly.
      return {
        ...state,
        notice: `No room answers to ${code} yet — rooms sync across devices in a later update.`,
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
