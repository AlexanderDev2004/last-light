import { describe, expect, it } from 'vitest'
import {
  mergeSnapshot,
  nightFromRoom,
  rollDiceFor,
  sanitizeForWire,
  scriptedRng,
  SEALED_BRINK,
  syncReducer,
  type SyncAction,
} from './night-sync'
import { emptySurvivor, initialNight } from './engine'
import { TOTAL_CANDLES, type NightState, type Room, type Survivor } from './types'

const member = (id: string, name: string) => ({ id, name, role: 'member' as const, isGm: false, wantsGm: false, ready: true, connected: true })

function room(): Room {
  return {
    code: 'ABC234',
    name: 'A room',
    visibility: 'private',
    adminId: 'admin',
    gmMemberId: 'keeper',
    members: [member('admin', 'Ada'), member('keeper', 'Kai'), member('s1', 'Juno'), member('s2', 'Ezra')],
    nightStarted: true,
  }
}

function nightWithSurvivors(): NightState {
  const s1 = emptySurvivor()
  s1.id = 's1'
  s1.name = 'Juno'
  s1.cards.brink.text = 'she becomes the thing she fled'
  const s2 = emptySurvivor()
  s2.id = 's2'
  s2.name = 'Ezra'
  return { ...initialNight(), survivors: [s1, s2] }
}

describe('nightFromRoom', () => {
  it('seats one survivor per member beside the keeper, each seat id its member token', () => {
    const n = nightFromRoom(room())
    expect(n.gmName).toBe('Kai')
    expect(n.survivors.map((s) => s.id)).toEqual(['admin', 's1', 's2'])
    expect(n.survivors.map((s) => s.name)).toEqual(['Ada', 'Juno', 'Ezra'])
    expect(n.phase).toBe('gathering')
  })

  it('leaves no keeper seat when none was appointed', () => {
    const r = { ...room(), gmMemberId: null }
    const n = nightFromRoom(r)
    expect(n.gmName).toBe('')
    expect(n.survivors).toHaveLength(4)
  })
})

describe('scriptedRng', () => {
  it('consumes the carried dice in order, then falls back to real dice', () => {
    const rng = scriptedRng([6, 2], [4], 5)
    expect(rng(6)).toBe(6)
    expect(rng(6)).toBe(2)
    expect(rng(6)).toBe(4)
    expect(rng(6)).toBe(5)
    const real = rng(6)
    expect(real).toBeGreaterThanOrEqual(1)
    expect(real).toBeLessThanOrEqual(6)
  })
})

describe('rollDiceFor', () => {
  it('rolls the whole conflict: the light pool, the dark pool, and the hope die', () => {
    const n = nightWithSurvivors()
    n.candlesLit = 8
    n.lostOnes = 1
    const dice = rollDiceFor({ type: 'conflict/roll', actorId: 's1', useHope: true }, n)
    expect(dice).not.toBeNull()
    expect(dice!.light).toHaveLength(7) // pool = 8 lit − 1 lost
    expect(dice!.dark).toHaveLength(TOTAL_CANDLES - 8)
    expect(dice!.hope).not.toBeNull()
    for (const d of [...dice!.light, ...dice!.dark!, dice!.hope!]) expect(d).toBeGreaterThanOrEqual(1)
  })

  it('rolls one die per one showing, for a trait reroll', () => {
    const n = nightWithSurvivors()
    n.lastRoll = {
      actorId: 's1',
      light: [1, 6, 1],
      dark: [2],
      hope: null,
      playerSixes: 1,
      gmSixes: 0,
      outcome: 'success',
      onesSetAside: 2,
      burnedKind: null,
      brinkRerolled: false,
    }
    const dice = rollDiceFor({ type: 'conflict/rerollOnes', actorId: 's1' }, n)
    expect(dice!.light).toHaveLength(2)
  })
})

describe('the brink never travels unsealed', () => {
  it('sanitizeForWire seals every unrevealed brink and leaves revealed ones alone', () => {
    const n = nightWithSurvivors()
    const s1 = n.survivors[0]
    s1.brinkRevealed = true
    const clean = sanitizeForWire(n)
    expect(clean.survivors[0].cards.brink.text).toBe('she becomes the thing she fled')
    expect(clean.survivors[1].cards.brink.text).toBe(SEALED_BRINK)
  })

  it('a written brink survives snapshots on its own device until the reveal', () => {
    const local = nightWithSurvivors()
    const incoming = sanitizeForWire(local)
    const merged = mergeSnapshot(local, incoming, 's1')
    expect(merged.survivors[0].cards.brink.text).toBe('she becomes the thing she fled')
    expect(merged.survivors[1].cards.brink.text).toBe(SEALED_BRINK)
  })

  it('once revealed, the spoken text arrives from the snapshot', () => {
    const local = nightWithSurvivors()
    const revealed = sanitizeForWire(local)
    revealed.survivors[0] = { ...revealed.survivors[0], brinkRevealed: true }
    const merged = mergeSnapshot(local, revealed, 's1')
    expect(merged.survivors[0].brinkRevealed).toBe(true)
  })
})

describe('syncReducer', () => {
  it('night/seed replaces the night', () => {
    const seeded = nightFromRoom(room())
    const state = syncReducer(initialNight(), { type: 'night/seed', night: seeded })
    expect(state).toBe(seeded)
  })

  it('a carried throw plays the same verdict the host will compute', () => {
    const n = nightWithSurvivors()
    n.candlesLit = 9
    n.lostOnes = 5
    n.phase = 'scene'
    const scripted: SyncAction = {
      type: 'night/scripted',
      action: { type: 'conflict/roll', actorId: 's1', useHope: false },
      light: [6, 2, 2, 4],
      dark: [1],
      hope: null,
    }
    const rolled = syncReducer(n, scripted)
    expect(rolled.lastRoll).not.toBeNull()
    expect(rolled.lastRoll!.light).toEqual([6, 2, 2, 4])
    expect(rolled.lastRoll!.dark).toEqual([1])
    expect(rolled.lastRoll!.outcome).toBe('success')
    expect(rolled.lastRoll!.playerSixes).toBe(1)
    expect(rolled.lastRoll!.gmSixes).toBe(0)
  })

  it('a carried reroll burns the top trait through the engine, unchanged', () => {
    const n = nightWithSurvivors()
    n.candlesLit = 4
    n.phase = 'scene'
    n.survivors[0].cards.virtue.text = 'brave'
    n.lastRoll = {
      actorId: 's1',
      light: [1, 3],
      dark: [2],
      hope: null,
      playerSixes: 0,
      gmSixes: 0,
      outcome: 'failure',
      onesSetAside: 1,
      burnedKind: null,
      brinkRerolled: false,
    }
    const rerolled = syncReducer(n, {
      type: 'night/scripted',
      action: { type: 'conflict/rerollOnes', actorId: 's1' },
      light: [6],
    })
    expect(rerolled.lastRoll!.light).toEqual([6, 3])
    expect(rerolled.lastRoll!.burnedKind).toBe('virtue')
    expect(rerolled.survivors[0].cards.virtue.burned).toBe(true)
  })

  it('the reveal stitches the brink text back in, speaks it, and burns the card', () => {
    const n = nightWithSurvivors()
    n.candlesLit = 2
    n.phase = 'scene'
    n.survivors[0].cards.moment.text = 'a joke at the end'
    n.survivors[0].cards.virtue.text = 'brave'
    n.survivors[0].cards.virtue.burned = true
    n.survivors[0].cards.vice.text = 'proud'
    n.survivors[0].cards.vice.burned = true
    n.survivors[0].cards.moment.burned = true
    n.lastRoll = {
      actorId: 's1',
      light: [2, 3],
      dark: [5],
      hope: null,
      playerSixes: 0,
      gmSixes: 1,
      outcome: 'failure',
      onesSetAside: 0,
      burnedKind: null,
      brinkRerolled: false,
    }
    const revealed = syncReducer(n, {
      type: 'night/revealBrink',
      actorId: 's1',
      brinkText: 'she becomes the thing she fled',
      light: [4, 4],
    })
    expect(revealed.lastRoll!.brinkRerolled).toBe(true)
    expect(revealed.lastRoll!.light).toEqual([4, 4])
    expect(revealed.survivors[0].brinkRevealed).toBe(true)
    expect(revealed.log.at(-1)!.text).toContain('she becomes the thing she fled')
  })

  it('an echo of the local roll keeps its reference, so the tray is not re-tossed', () => {
    const n = nightWithSurvivors()
    n.candlesLit = 4
    n.phase = 'scene'
    const rolled = syncReducer(n, {
      type: 'night/scripted',
      action: { type: 'conflict/roll', actorId: 's1', useHope: false },
      light: [6, 2, 2, 4],
      dark: [1],
      hope: null,
    })
    const echoed = mergeSnapshot(rolled, sanitizeForWire(rolled), 's1')
    expect(echoed.lastRoll).toBe(rolled.lastRoll)
  })

  it('engine actions pass straight through', () => {
    const n = initialNight()
    const spoken = syncReducer(n, { type: 'night/begin' })
    expect(spoken.phase).toBe('truths')
    expect(spoken.truthsDue).toBe(TOTAL_CANDLES)
  })
})

describe('survivor typing through the sync layer', () => {
  it('keeps seat ids intact through a seed and snapshot round trip', () => {
    const seeded = nightFromRoom(room())
    const state = syncReducer(initialNight(), { type: 'night/seed', night: seeded })
    const back = mergeSnapshot(state, sanitizeForWire(state), 's1')
    expect(back.survivors.map((s: Survivor) => s.id)).toEqual(['admin', 's1', 's2'])
  })
})
