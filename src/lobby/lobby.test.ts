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
  it('moves to the joining stage and keeps the code and name', () => {
    let s = initialLobby()
    s = reducer(s, { type: 'lobby/joinAttempt', code: ' k7qp2m ', name: 'Bo' })
    expect(s.stage).toBe('joining')
    expect(s.pendingJoin).toEqual({ code: 'K7QP2M', name: 'Bo' })
    expect(s.notice).toBeNull()
  })

  it('falls back to a stranger name when none was given', () => {
    const s = reducer(initialLobby(), { type: 'lobby/joinAttempt', code: 'K7QP2M', name: '   ' })
    expect(s.pendingJoin?.name).toBe('A stranger')
  })

  it('asks for a code when none was entered', () => {
    const s = reducer(initialLobby(), { type: 'lobby/joinAttempt', code: '  ', name: 'Bo' })
    expect(s.stage).toBe('home')
    expect(s.notice).toContain('Enter a room code')
  })

  it('is seated when the host snapshot carries the self token', () => {
    let s = reducer(initialLobby(), { type: 'lobby/create', roomName: 'r', adminName: 'Mara', visibility: 'private' })
    const hosted = s.room!
    s = reducer(initialLobby(), { type: 'lobby/joinAttempt', code: hosted.code, name: 'Bo' })
    s = reducer(s, { type: 'lobby/netState', room: hosted, selfToken: hosted.adminId })
    expect(s.stage).toBe('room')
    expect(s.meId).toBe(hosted.adminId)
    expect(me(s)?.name).toBe('Mara')
  })

  it('waits while a snapshot does not seat the joiner and the room is not full', () => {
    let s = reducer(initialLobby(), { type: 'lobby/create', roomName: 'r', adminName: 'Mara', visibility: 'private' })
    const hosted = s.room!
    s = reducer(initialLobby(), { type: 'lobby/joinAttempt', code: hosted.code, name: 'Bo' })
    s = reducer(s, { type: 'lobby/netState', room: hosted, selfToken: 'bo-token' })
    expect(s.stage).toBe('joining')
  })

  it('gives up with a notice when the join fails', () => {
    let s = reducer(initialLobby(), { type: 'lobby/joinAttempt', code: 'K7QP2M', name: 'Bo' })
    s = reducer(s, { type: 'lobby/joinFailed', notice: 'No room answers to K7QP2M.' })
    expect(s.stage).toBe('home')
    expect(s.room).toBeNull()
    expect(s.notice).toContain('K7QP2M')
  })
})

describe('members arriving over the wire', () => {
  const created = () =>
    reducer(initialLobby(), { type: 'lobby/create', roomName: 'r', adminName: 'Mara', visibility: 'private' })

  it('join as themselves, once per token even if both swarms announce them', () => {
    let s = created()
    s = reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
    s = reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
    expect(s.room?.members.map((m) => m.id)).toEqual([s.meId, 'bo-token'])
    expect(s.room?.members[1]?.connected).toBe(true)
  })

  it('are refused when the room is already full', () => {
    let s = created()
    for (let i = 0; i < MAX_MEMBERS - 1; i++) {
      s = reducer(s, { type: 'lobby/peerJoin', id: `t${i}`, name: `Guest ${i}` })
    }
    s = reducer(s, { type: 'lobby/peerJoin', id: 'one-too-many', name: 'Latecomer' })
    expect(s.room?.members.some((m) => m.id === 'one-too-many')).toBe(false)
    expect(s.room?.members).toHaveLength(MAX_MEMBERS)
  })

  it('go dark on leave, without being struck from the ledger', () => {
    let s = created()
    s = reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
    s = reducer(s, { type: 'lobby/peerLeave', id: 'bo-token' })
    expect(s.room?.members[1]).toMatchObject({ id: 'bo-token', name: 'Bo', connected: false })
  })

  it('can rename themselves', () => {
    let s = created()
    s = reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
    s = reducer(s, { type: 'lobby/rename', id: 'bo-token', name: '  Bogdan  ' })
    expect(s.room?.members[1]?.name).toBe('Bogdan')
  })

  it('end with the host: hostLost clears the room and says so plainly', () => {
    let s = created()
    s = reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
    s = reducer(s, { type: 'lobby/hostLost' })
    expect(s.stage).toBe('home')
    expect(s.room).toBeNull()
    expect(s.notice).toContain('The keeper left and no one remained')
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

describe('admin powers', () => {
  const created = () =>
    reducer(initialLobby(), { type: 'lobby/create', roomName: 'r', adminName: 'Mara', visibility: 'private' })

  const withGuest = () => {
    const s = created()
    return reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
  }

  it('kick strikes the member from the room', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/peerKick', id: 'bo-token' })
    expect(s.room?.members.map((m) => m.id)).toEqual([state.meId])
  })

  it("kick empties the keeper's seat when the keeper was removed", () => {
    const state = withGuest()
    let s = reducer(state, { type: 'lobby/peerAppointGm', gmMemberId: 'bo-token' })
    s = reducer(s, { type: 'lobby/peerKick', id: 'bo-token' })
    expect(s.room?.gmMemberId).toBeNull()
    expect(s.room?.members.some((m) => m.isGm)).toBe(false)
  })

  it('kick of an unknown id strikes no one', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/peerKick', id: 'never-seated' })
    expect(s.room?.members.map((m) => m.id)).toEqual(state.room?.members.map((m) => m.id))
  })

  it('appoints a keeper and appointing null empties the seat', () => {
    const state = withGuest()
    let s = reducer(state, { type: 'lobby/peerAppointGm', gmMemberId: 'bo-token' })
    expect(s.room?.gmMemberId).toBe('bo-token')
    expect(s.room?.members.find((m) => m.id === 'bo-token')?.isGm).toBe(true)
    expect(s.room?.members.find((m) => m.id === state.meId)?.isGm).toBe(false)
    s = reducer(s, { type: 'lobby/peerAppointGm', gmMemberId: null })
    expect(s.room?.gmMemberId).toBeNull()
    expect(s.room?.members.some((m) => m.isGm)).toBe(false)
  })

  it('a keeper appointment clamps to a seated member — the seat empties instead', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/peerAppointGm', gmMemberId: 'never-seated' })
    expect(s.room?.gmMemberId).toBeNull()
    expect(s.room?.members.some((m) => m.isGm)).toBe(false)
  })

  it('a member raises their hand for the seat, and the admin sees the flag', () => {
    const state = withGuest()
    let s = reducer(state, { type: 'lobby/peerToggleGmInterest', id: 'bo-token' })
    expect(s.room?.members.find((m) => m.id === 'bo-token')?.wantsGm).toBe(true)
    s = reducer(s, { type: 'lobby/peerToggleGmInterest', id: 'bo-token' })
    expect(s.room?.members.find((m) => m.id === 'bo-token')?.wantsGm).toBe(false)
  })

  it('the local user raises their own hand with toggleGmInterest', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/toggleGmInterest' })
    expect(s.room?.members.find((m) => m.id === state.meId)?.wantsGm).toBe(true)
  })

  it('an admin change moves the role and says who keeps the room now', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/adminChanged', newAdminId: 'bo-token' })
    expect(s.room?.adminId).toBe('bo-token')
    expect(s.room?.members.find((m) => m.id === 'bo-token')?.role).toBe('admin')
    expect(s.room?.members.find((m) => m.id === state.meId)?.role).toBe('member')
    expect(s.notice).toContain('Bo now keeps the room')
  })

  it('an admin change to a member who is not seated changes nothing', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/adminChanged', newAdminId: 'ghost' })
    expect(s).toBe(state)
  })

  it('being kicked returns the guest home with a plain notice', () => {
    const state = withGuest()
    const s = reducer(state, { type: 'lobby/kicked' })
    expect(s.stage).toBe('home')
    expect(s.room).toBeNull()
    expect(s.notice).toContain('removed from the room')
  })
})
