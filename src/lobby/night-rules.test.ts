import { describe, expect, it } from 'vitest'
import { resolveNightHostAction } from './night-rules'
import type { NightWireAction } from '../lib/room-net'
import type { Room } from '../game/types'

const member = (id: string, name: string, connected = true) => ({
  id,
  name,
  role: 'member' as const,
  isGm: false,
  wantsGm: false,
  ready: true,
  connected,
})

function room(): Room {
  return {
    code: 'ABC234',
    name: 'A room',
    visibility: 'private',
    adminId: 'admin',
    gmMemberId: 'keeper',
    members: [member('admin', 'Ada'), member('keeper', 'Kai'), member('s1', 'Juno'), member('s2', 'Ezra', false)],
    nightStarted: true,
  }
}

const wire = (token: string, action: NightWireAction['action'], extra: Partial<NightWireAction> = {}): NightWireAction => ({
  kind: 'night/do',
  token,
  action,
  ...extra,
})

describe('who may speak at all', () => {
  it('refuses a token that is not seated', () => {
    expect(resolveNightHostAction(room(), 'stranger', wire('stranger', { type: 'scene/begin' }))).toBeNull()
  })

  it('refuses a seat that has gone dark', () => {
    expect(resolveNightHostAction(room(), 's2', wire('s2', { type: 'scene/begin' }))).toBeNull()
  })

  it('refuses everything when there is no room', () => {
    expect(resolveNightHostAction(null, 'admin', wire('admin', { type: 'scene/begin' }))).toBeNull()
  })
})

describe('cards and names belong to their seat', () => {
  it('accepts a survivor writing their own card', () => {
    const a = { type: 'survivor/setCard', id: 's1', kind: 'virtue', text: 'brave' } as const
    expect(resolveNightHostAction(room(), 's1', wire('s1', a))).toEqual(a)
  })

  it('refuses a survivor writing on another seat', () => {
    const a = { type: 'survivor/setCard', id: 's2', kind: 'virtue', text: 'brave' } as const
    expect(resolveNightHostAction(room(), 's1', wire('s1', a))).toBeNull()
  })

  it('accepts a survivor renaming their own seat, refuses another seat', () => {
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'survivor/rename', id: 's1', name: 'June' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'survivor/rename', id: 's2', name: 'No' }))).toBeNull()
  })

  it("the keeper's name is the keeper's to write", () => {
    expect(resolveNightHostAction(room(), 'keeper', wire('keeper', { type: 'gm/set-name', name: 'Mora' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'gm/set-name', name: 'No' }))).toBeNull()
  })

  it('seats are not handed out over the wire', () => {
    expect(resolveNightHostAction(room(), 'admin', wire('admin', { type: 'survivor/add', name: 'No one' }))).toBeNull()
    expect(
      resolveNightHostAction(room(), 'admin', wire('admin', { type: 'survivor/remove', id: 's1' })),
    ).toBeNull()
  })

  it('only the admin orders the seats', () => {
    expect(resolveNightHostAction(room(), 'admin', wire('admin', { type: 'survivor/move', id: 's1', dir: 1 }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'survivor/move', id: 's1', dir: 1 }))).toBeNull()
  })
})

describe("the night's door", () => {
  it('the admin and the keeper may begin the night', () => {
    expect(resolveNightHostAction(room(), 'admin', wire('admin', { type: 'night/begin' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 'keeper', wire('keeper', { type: 'night/begin' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'night/begin' }))).toBeNull()
  })

  it('the admin and the keeper may end it', () => {
    expect(resolveNightHostAction(room(), 'admin', wire('admin', { type: 'night/reset' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 'keeper', wire('keeper', { type: 'night/reset' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'night/reset' }))).toBeNull()
  })
})

describe("the brink reveal is the owner's alone, carrying its text", () => {
  it("accepts the owner's reveal with text and dice", () => {
    const applied = resolveNightHostAction(
      room(),
      's1',
      wire('s1', { type: 'brink/reroll', actorId: 's1' }, { light: [4, 4], brinkText: 'she becomes the thing' }),
    )
    expect(applied).toEqual({
      type: 'night/revealBrink',
      actorId: 's1',
      brinkText: 'she becomes the thing',
      light: [4, 4],
    })
  })

  it('refuses a reveal spoken from another seat', () => {
    expect(
      resolveNightHostAction(
        room(),
        's2',
        wire('s2', { type: 'brink/reroll', actorId: 's1' }, { light: [4], brinkText: 'no' }),
      ),
    ).toBeNull()
  })

  it('refuses a reveal without its text', () => {
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'brink/reroll', actorId: 's1' }, { light: [4] }))).toBeNull()
  })
})

describe('carried dice become scripted throws', () => {
  it('a roll with dice is applied through the rng seam', () => {
    const applied = resolveNightHostAction(
      room(),
      's1',
      wire('s1', { type: 'conflict/roll', actorId: null, useHope: true }, { light: [6, 2], dark: [3], hope: 5 }),
    )
    expect(applied).toEqual({
      type: 'night/scripted',
      action: { type: 'conflict/roll', actorId: null, useHope: true },
      light: [6, 2],
      dark: [3],
      hope: 5,
    })
  })

  it("a roll without dice falls to the host's own throw", () => {
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'conflict/roll', actorId: null, useHope: false }))).toEqual({
      type: 'conflict/roll',
      actorId: null,
      useHope: false,
    })
  })

  it('table talk passes through untouched', () => {
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'truth/speak', author: 'Juno', text: 'The road is gone.' }))).toEqual({
      type: 'truth/speak',
      author: 'Juno',
      text: 'The road is gone.',
    })
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'scene/darken', by: 'Juno' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'moment/live', actorId: 's1' }))).not.toBeNull()
    expect(resolveNightHostAction(room(), 's1', wire('s1', { type: 'laststand/fall', actorId: 's1' }))).not.toBeNull()
  })
})
