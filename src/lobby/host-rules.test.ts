import { describe, expect, it } from 'vitest'
import { initialLobby, reducer } from './lobby'
import { resolveHostAction } from './host-rules'
import type { Room } from '../game/types'

/** A host's room with the admin "Mara" and one guest "Bo". */
function fixture(): { room: Room; adminToken: string; guestToken: string } {
  let s = reducer(initialLobby(), { type: 'lobby/create', roomName: 'r', adminName: 'Mara', visibility: 'private' })
  const adminToken = s.meId!
  s = reducer(s, { type: 'lobby/peerJoin', id: 'bo-token', name: 'Bo' })
  return { room: s.room!, adminToken, guestToken: 'bo-token' }
}

describe('the host trust boundary', () => {
  it('a join is always accepted, even from a connection with no token yet', () => {
    const { room } = fixture()
    expect(resolveHostAction(room, undefined, { kind: 'join', token: 'new-token', name: 'Vera' })).toEqual({
      type: 'lobby/peerJoin',
      id: 'new-token',
      name: 'Vera',
    })
  })

  it('a join is refused once the night has begun — the door is closed', () => {
    const { room } = fixture()
    const begun: Room = { ...room, nightStarted: true }
    expect(resolveHostAction(begun, undefined, { kind: 'join', token: 'new-token', name: 'Vera' })).toBeNull()
    // the same join still seats while the candles are unlit
    expect(resolveHostAction(room, undefined, { kind: 'join', token: 'new-token', name: 'Vera' })).not.toBeNull()
  })

  it('a rename is refused when the connection carries someone else token', () => {
    const { room } = fixture()
    expect(resolveHostAction(room, 'bo-token', { kind: 'rename', token: 'other-token', name: 'Fake' })).toBeNull()
    expect(resolveHostAction(room, undefined, { kind: 'rename', token: 'bo-token', name: 'Bo 2' })).toBeNull()
  })

  it('a rename by the token own connection is applied', () => {
    const { room, guestToken } = fixture()
    expect(resolveHostAction(room, guestToken, { kind: 'rename', token: guestToken, name: 'Bogdan' })).toEqual({
      type: 'lobby/rename',
      id: guestToken,
      name: 'Bogdan',
    })
  })

  it('a leave is refused when the connection carries someone else token', () => {
    const { room } = fixture()
    expect(resolveHostAction(room, 'bo-token', { kind: 'leave', token: 'other-token' })).toBeNull()
  })

  it('a kick by a non-admin is refused, even with their own token', () => {
    const { room, guestToken } = fixture()
    expect(resolveHostAction(room, guestToken, { kind: 'kick', token: guestToken, target: 'anyone' })).toBeNull()
  })

  it('a kick by a connection whose token is unknown is refused', () => {
    const { room } = fixture()
    expect(resolveHostAction(room, undefined, { kind: 'kick', token: 'bo-token', target: 'x' })).toBeNull()
  })

  it('the admin cannot kick themselves', () => {
    const { room, adminToken } = fixture()
    expect(resolveHostAction(room, adminToken, { kind: 'kick', token: adminToken, target: adminToken })).toBeNull()
  })

  it("the admin kick of another member is applied", () => {
    const { room, adminToken } = fixture()
    expect(resolveHostAction(room, adminToken, { kind: 'kick', token: adminToken, target: 'bo-token' })).toEqual({
      type: 'lobby/peerKick',
      id: 'bo-token',
    })
  })

  it('a ready toggle from the member own connection is applied', () => {
    const { room, guestToken } = fixture()
    expect(resolveHostAction(room, guestToken, { kind: 'toggleReady', token: guestToken })).toEqual({
      type: 'lobby/peerToggleReady',
      id: 'bo-token',
    })
  })

  it('a ready toggle for someone else token is refused', () => {
    const { room } = fixture()
    expect(resolveHostAction(room, undefined, { kind: 'toggleReady', token: 'bo-token' })).toBeNull()
    expect(resolveHostAction(room, 'bo-token', { kind: 'toggleReady', token: 'other-token' })).toBeNull()
  })

  it('a ready toggle after the night has begun is refused', () => {
    const { room, guestToken } = fixture()
    const begun: Room = { ...room, nightStarted: true }
    expect(resolveHostAction(begun, guestToken, { kind: 'toggleReady', token: guestToken })).toBeNull()
  })

  it('a GM appointment by a non-admin is refused', () => {
    const { room, guestToken } = fixture()
    expect(resolveHostAction(room, guestToken, { kind: 'appointGm', token: guestToken, gmMemberId: null })).toBeNull()
  })

  it("the admin GM appointment is applied", () => {
    const { room, adminToken } = fixture()
    expect(resolveHostAction(room, adminToken, { kind: 'appointGm', token: adminToken, gmMemberId: 'bo-token' })).toEqual(
      { type: 'lobby/peerAppointGm', gmMemberId: 'bo-token' },
    )
  })

  it("a GM-interest toggle is refused for another member token", () => {
    const { room, adminToken } = fixture()
    expect(resolveHostAction(room, adminToken, { kind: 'toggleGmInterest', token: 'bo-token' })).toBeNull()
  })

  it('a GM-interest toggle by the token own connection is applied', () => {
    const { room, guestToken } = fixture()
    expect(resolveHostAction(room, guestToken, { kind: 'toggleGmInterest', token: guestToken })).toEqual({
      type: 'lobby/peerToggleGmInterest',
      id: guestToken,
    })
  })

  it('a hello does nothing', () => {
    const { room } = fixture()
    expect(resolveHostAction(room, undefined, { kind: 'hello', token: 'x' })).toBeNull()
  })

  it('any action but a join is refused when the room is already gone', () => {
    expect(resolveHostAction(null, 'bo-token', { kind: 'rename', token: 'bo-token', name: 'x' })).toBeNull()
    expect(resolveHostAction(null, undefined, { kind: 'join', token: 't', name: 'n' })).toEqual({
      type: 'lobby/peerJoin',
      id: 't',
      name: 'n',
    })
  })
})
