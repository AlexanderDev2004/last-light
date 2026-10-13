import { describe, expect, it } from 'vitest'
import { MAX_MEMBERS } from '../game/types'
import { generateCode, initialLobby, isAdmin, me, reducer } from './lobby'

describe('room codes', () => {
  it('uses six unambiguous characters', () => {
    const code = generateCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('is deterministic under a fixed rng', () => {
    const seeded = (seed: number) => {
      let x = seed
      return () => (x = (x * 9301 + 0.49297) % 1)
    }
    expect(generateCode(seeded(0.5))).toBe(generateCode(seeded(0.5)))
    expect(generateCode(seeded(0.5))).not.toBe(generateCode(seeded(0.75)))
  })
})

describe('creating a room', () => {
  it('makes the creator the admin, with no keeper appointed yet', () => {
    const s = reducer(initialLobby(), {
      type: 'lobby/create',
      roomName: 'The generator hill',
      adminName: 'Mara',
      visibility: 'private',
    })
    expect(s.stage).toBe('room')
    expect(s.room?.name).toBe('The generator hill')
    expect(s.room?.visibility).toBe('private')
    expect(s.room?.gmMemberId).toBeNull()
    expect(s.room?.members).toHaveLength(1)
    const admin = s.room?.members[0]
    expect(admin?.name).toBe('Mara')
    expect(admin?.role).toBe('admin')
    expect(s.meId).toBe(admin?.id)
    expect(isAdmin(s)).toBe(true)
  })

  it('falls back to placeholder names when fields are blank', () => {
    const s = reducer(initialLobby(), {
      type: 'lobby/create',
      roomName: '   ',
      adminName: '',
      visibility: 'public',
    })
    expect(s.room?.name).toBe('A room without a name')
    expect(s.room?.members[0]?.name).toBe('The admin')
    expect(s.room?.visibility).toBe('public')
  })
})

describe('joining by code', () => {
  it('reports honestly that no transport answers yet', () => {
    let s = initialLobby()
    s = reducer(s, { type: 'lobby/joinAttempt', code: ' k7qp2m ', name: 'Bo' })
    expect(s.stage).toBe('home')
    expect(s.notice).toContain('K7QP2M')
  })

  it('asks for a code when none was entered', () => {
    const s = reducer(initialLobby(), { type: 'lobby/joinAttempt', code: '  ', name: 'Bo' })
    expect(s.notice).toContain('Enter a room code')
  })
})

describe('mock members', () => {
  it('join under their own names until the transport replaces them', () => {
    let s = reducer(initialLobby(), {
      type: 'lobby/create',
      roomName: 'r',
      adminName: 'Mara',
      visibility: 'private',
    })
    s = reducer(s, { type: 'lobby/mockJoin' })
    expect(s.room?.members).toHaveLength(2)
    expect(s.room?.members[1]?.role).toBe('member')
    expect(me(s)?.name).toBe('Mara')
  })

  it('never exceed the room cap', () => {
    let s = reducer(initialLobby(), {
      type: 'lobby/create',
      roomName: 'r',
      adminName: 'Mara',
      visibility: 'private',
    })
    for (let i = 0; i < MAX_MEMBERS + 3; i++) {
      s = reducer(s, { type: 'lobby/mockJoin', name: `Guest ${i}` })
    }
    expect(s.room?.members).toHaveLength(MAX_MEMBERS)
  })

  it('leave again, but the admin stays', () => {
    let s = reducer(initialLobby(), {
      type: 'lobby/create',
      roomName: 'r',
      adminName: 'Mara',
      visibility: 'private',
    })
    s = reducer(s, { type: 'lobby/mockJoin' })
    s = reducer(s, { type: 'lobby/mockJoin' })
    s = reducer(s, { type: 'lobby/mockLeave' })
    expect(s.room?.members.map((m) => m.name)).toEqual(['Mara', 'Juno'])
    s = reducer(s, { type: 'lobby/mockLeave' })
    s = reducer(s, { type: 'lobby/mockLeave' }) // only the admin remains; no-op
    expect(s.room?.members.map((m) => m.name)).toEqual(['Mara'])
  })
})

describe('leaving a room', () => {
  it('returns to the home stage with nothing left behind', () => {
    let s = reducer(initialLobby(), {
      type: 'lobby/create',
      roomName: 'r',
      adminName: 'Mara',
      visibility: 'private',
    })
    s = reducer(s, { type: 'lobby/mockJoin' })
    s = reducer(s, { type: 'lobby/leave' })
    expect(s).toEqual(initialLobby())
  })
})
