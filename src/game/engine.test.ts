import { describe, expect, it } from 'vitest'
import {
  beginBlocker,
  brinkUnlocked,
  initialNight,
  momentUnlocked,
  nextSpeaker,
  poolSize,
  reducer,
  topCard,
} from './engine'
import type { NightState, Rng } from './types'

/** Deterministic rng that yields a fixed queue of d6 faces. */
function rngFrom(...faces: number[]): Rng {
  const queue = [...faces]
  return () => {
    const face = queue.shift()
    if (face === undefined) throw new Error('rng queue exhausted')
    return face
  }
}

function gathering(n = 2): NightState {
  let s = initialNight()
  s.gmName = 'Keeper'
  for (const name of ['Ada', 'Bo', 'Cy'].slice(0, n)) s = reducer(s, { type: 'survivor/add', name })
  s.survivors.forEach((survivor, i) => {
    s = reducer(s, { type: 'survivor/setCard', id: survivor.id, kind: 'virtue', text: `virtue ${i}` })
    s = reducer(s, { type: 'survivor/setCard', id: survivor.id, kind: 'vice', text: `vice ${i}` })
    s = reducer(s, { type: 'survivor/setCard', id: survivor.id, kind: 'moment', text: `moment ${i}` })
    s = reducer(s, { type: 'survivor/setCard', id: survivor.id, kind: 'brink', text: `brink ${i}` })
  })
  return s
}

function beginNight(s: NightState): NightState {
  s = reducer(s, { type: 'night/begin' })
  expect(s.phase).toBe('truths')
  expect(s.truthsDue).toBe(10)
  return s
}

function speakAll(s: NightState, author = 'Keeper'): NightState {
  while (s.truthsDue > 0) s = reducer(s, { type: 'truth/speak', author, text: `truth ${s.truths.length}` })
  return s
}

function inScene(s: NightState, actorId: string): NightState {
  s = speakAll(s)
  s = reducer(s, { type: 'scene/begin' })
  expect(s.phase).toBe('scene')
  expect(poolSize(s)).toBe(s.candlesLit)
  void actorId
  return s
}

describe('gathering', () => {
  it('blocks the night until every stack is written', () => {
    let s = initialNight()
    expect(beginBlocker(s)).toMatchInlineSnapshot(`"No one is seated at the table."`)
    s = reducer(s, { type: 'survivor/add', name: 'Ada' })
    expect(beginBlocker(s)).toContain('Not every card is written')
    s = reducer(s, { type: 'survivor/setCard', id: s.survivors[0].id, kind: 'virtue', text: 'brave' })
    s = reducer(s, { type: 'survivor/setCard', id: s.survivors[0].id, kind: 'vice', text: 'proud' })
    s = reducer(s, { type: 'survivor/setCard', id: s.survivors[0].id, kind: 'moment', text: 'sunrise' })
    s = reducer(s, { type: 'survivor/setCard', id: s.survivors[0].id, kind: 'brink', text: 'ruin' })
    expect(beginBlocker(s)).toBeNull()
  })

  it('stacks virtue above vice by default and flips on demand', () => {
    const s = gathering(1)
    expect(topCard(s.survivors[0])?.kind).toBe('virtue')
    const flipped = reducer(s, { type: 'survivor/toggleStack', id: s.survivors[0].id })
    expect(topCard(flipped.survivors[0])?.kind).toBe('vice')
  })
})

describe('that which is true', () => {
  it('opens the night with ten truths, game master first, then seat order', () => {
    let s = beginNight(gathering(3))
    expect(nextSpeaker(s)).toEqual({ gm: true, name: 'Keeper' })
    // the rotation: keeper opens, then the seats, repeating — Ada, Bo, Cy, Keeper, …
    const cycle = ['Ada', 'Bo', 'Cy', 'Keeper']
    let spoken = 0
    while (s.truthsDue > 0) {
      s = reducer(s, { type: 'truth/speak', author: nextSpeaker(s).name, text: `t${spoken}` })
      spoken++
      if (s.truthsDue > 0) expect(nextSpeaker(s).name).toBe(cycle[(spoken - 1) % 4])
    }
    expect(s.truths).toHaveLength(10)
  })

  it('hands the opening truth to whoever darkened the last candle', () => {
    let s = inScene(beginNight(gathering(3)), 'a')
    const ada = s.survivors[0].id
    // a failed roll, then the keeper darkens a candle
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(2, 2, 2, 2, 2, 2, 2, 2, 2, 2))
    expect(s.lastRoll?.outcome).toBe('failure')
    s = reducer(s, { type: 'scene/darken', by: 'Keeper' })
    expect(s.phase).toBe('truths')
    expect(s.truthsDue).toBe(9)
    expect(nextSpeaker(s)).toEqual({ gm: true, name: 'Keeper' })
  })
})

describe('conflicts', () => {
  it('succeeds on any six and the player keeps the narrative on tied sixes', () => {
    let s = inScene(beginNight(gathering(3)), 'a')
    const ada = s.survivors[0].id
    // 10 light dice: one six; 0 dark dice (scene 1)
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(6, 2, 2, 2, 2, 2, 2, 2, 2, 2))
    expect(s.lastRoll?.outcome).toBe('success')
    expect(s.lastRoll?.playerSixes).toBe(1)
    expect(s.lastRoll?.gmSixes).toBe(0)
  })

  it('fails with no six and the pool shrinks by the ones set aside', () => {
    let s = inScene(beginNight(gathering(3)), 'a')
    const ada = s.survivors[0].id
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(1, 1, 2, 2, 2, 2, 2, 2, 2, 2))
    expect(s.lastRoll?.outcome).toBe('failure')
    expect(s.lastRoll?.onesSetAside).toBe(2)
    expect(s.lostOnes).toBe(2)
    expect(poolSize(s)).toBe(8)
  })

  it('gives Them the narrative only on strictly more sixes', () => {
    let s = beginNight(gathering(3))
    // burn to scene 3 so the dark holds two dice
    for (let i = 0; i < 2; i++) {
      s = speakAll(s)
      s = reducer(s, { type: 'scene/begin' })
      s = reducer(s, { type: 'conflict/roll', actorId: null, useHope: false }, rngFrom(...Array(10).fill(2)))
      s = reducer(s, { type: 'scene/darken', by: 'Keeper' })
    }
    s = speakAll(s)
    s = reducer(s, { type: 'scene/begin' })
    expect(s.candlesLit).toBe(8)
    expect(s.lastRoll).toBeNull()
    // players roll 8 dice: two sixes; dark rolls 2 dice: three-of-a-kind impossible —
    // give the dark two sixes for a tie (players keep it), then reroll for the strict case
    const tie = rngFrom(6, 6, 2, 2, 2, 2, 2, 2, 6, 6)
    s = reducer(s, { type: 'conflict/roll', actorId: null, useHope: false }, tie)
    expect(s.lastRoll?.outcome).toBe('success')
    expect(s.lastRoll?.gmSixes).toBe(2)

    // next conflict: dark beats three sixes with... they only have two dice, so instead
    // verify the strict rule at scene 5 where the dark holds four dice
    while (s.candlesLit > 6) {
      s = speakAll(s)
      s = reducer(s, { type: 'scene/begin' })
      s = reducer(s, { type: 'conflict/roll', actorId: null, useHope: false }, rngFrom(...Array(10).fill(2)))
      s = reducer(s, { type: 'scene/darken', by: 'Keeper' })
    }
    s = speakAll(s)
    s = reducer(s, { type: 'scene/begin' })
    // 6 light dice, 4 dark: players two sixes, dark three → They narrate
    const them = rngFrom(6, 6, 2, 2, 2, 2, 6, 6, 6, 2)
    s = reducer(s, { type: 'conflict/roll', actorId: null, useHope: false }, them)
    expect(s.lastRoll?.playerSixes).toBe(2)
    expect(s.lastRoll?.gmSixes).toBe(3)
    expect(s.lastRoll?.outcome).toBe('success_them')
  })

  it('refills the pool to the lit candles at each new scene', () => {
    let s = inScene(beginNight(gathering(3)), 'a')
    s = reducer(s, { type: 'conflict/roll', actorId: null, useHope: false }, rngFrom(...Array(10).fill(2)))
    s = reducer(s, { type: 'scene/darken', by: 'Keeper' })
    s = speakAll(s)
    s = reducer(s, { type: 'scene/begin' })
    expect(s.candlesLit).toBe(9)
    expect(s.lostOnes).toBe(0)
    expect(poolSize(s)).toBe(9)
  })
})

describe('the stack', () => {
  function sceneWithOnes(s: NightState, ada: string): NightState {
    s = inScene(s, ada)
    // two ones among the ten
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(1, 6, 1, 2, 2, 2, 2, 2, 2, 2))
    expect(s.lastRoll?.outcome).toBe('success')
    expect(s.lostOnes).toBe(2)
    return s
  }

  it('burns the top trait to reroll every one — new sixes count, new ones stay lost', () => {
    const base = beginNight(gathering(3))
    const ada = base.survivors[0].id
    let s = sceneWithOnes(base, ada)
    expect(topCard(s.survivors.find((x) => x.id === ada)!)?.kind).toBe('virtue')
    // reroll the two ones: a six and a two
    s = reducer(s, { type: 'conflict/rerollOnes', actorId: ada }, rngFrom(6, 1))
    expect(s.lastRoll?.light[0]).toBe(6)
    expect(s.lastRoll?.light[2]).toBe(1)
    expect(s.lastRoll?.playerSixes).toBe(2)
    expect(s.lastRoll?.outcome).toBe('success')
    expect(s.lostOnes).toBe(3)
    const adaCard = s.survivors.find((x) => x.id === ada)!.cards.virtue
    expect(adaCard.burned).toBe(true)
  })

  it('refuses to burn out of stack order and gates the moment behind both traits', () => {
    const s0 = gathering(3)
    const ada = s0.survivors[0].id
    let s = sceneWithOnes(beginNight(s0), ada)
    // burn virtue (top), then vice is on top
    s = reducer(s, { type: 'conflict/rerollOnes', actorId: ada }, rngFrom(2, 2))
    expect(s.survivors.find((x) => x.id === ada)!.cards.virtue.burned).toBe(true)
    // the moment cannot be lived yet — the vice still stands above it
    s = reducer(s, { type: 'moment/live', actorId: ada })
    const adaNow = s.survivors.find((x) => x.id === ada)!
    expect(adaNow.hopeDie).toBe(false)
    expect(momentUnlocked(adaNow)).toBe(false)
    // burn the vice via another roll's ones
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(1, 2, 2, 2, 2, 2, 2, 2, 2, 6))
    s = reducer(s, { type: 'conflict/rerollOnes', actorId: ada }, rngFrom(3))
    const adaFinally = s.survivors.find((x) => x.id === ada)!
    expect(adaFinally.cards.vice.burned).toBe(true)
    expect(momentUnlocked(adaFinally)).toBe(true)
    s = reducer(s, { type: 'moment/live', actorId: ada })
    const adaLit = s.survivors.find((x) => x.id === ada)!
    expect(adaLit.hopeDie).toBe(true)
    expect(brinkUnlocked(adaLit)).toBe(true)
  })
})

describe('hope die and brink', () => {
  /** Ada burns both traits across two scenes, lives her moment, hope die lit. */
  function litAda(): { s: NightState; ada: string } {
    const s0 = gathering(3)
    const ada = s0.survivors[0].id
    let s = beginNight(s0)
    // scene 1: two ones → burn the virtue to reroll them
    s = speakAll(s)
    s = reducer(s, { type: 'scene/begin' })
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(1, 1, 2, 2, 2, 2, 2, 2, 2, 2))
    s = reducer(s, { type: 'conflict/rerollOnes', actorId: ada }, rngFrom(2, 2))
    expect(s.survivors[0].cards.virtue.burned).toBe(true)
    // turn the scene: scene 2, nine dice against one dark die, pool fresh
    s = reducer(s, { type: 'scene/darken', by: 'Keeper' })
    s = speakAll(s)
    s = reducer(s, { type: 'scene/begin' })
    // one one among the nine → burn the vice to reroll it
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(1, 2, 2, 2, 2, 2, 2, 2, 2, 2))
    s = reducer(s, { type: 'conflict/rerollOnes', actorId: ada }, rngFrom(3))
    expect(s.survivors[0].cards.vice.burned).toBe(true)
    s = reducer(s, { type: 'moment/live', actorId: ada })
    expect(s.survivors[0].hopeDie).toBe(true)
    // pool: 9 − 1 = 8 dice left this scene
    return { s, ada }
  }

  it('counts a hope die five or six toward success and never loses it to ones', () => {
    let { s, ada } = litAda()
    // eight pool dice show no six — the hope die's five rescues the conflict
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: true }, rngFrom(2, 2, 2, 2, 2, 2, 2, 2, 2, 5))
    expect(s.lastRoll?.hope).toBe(5)
    expect(s.lastRoll?.playerSixes).toBe(1)
    expect(s.lastRoll?.outcome).toBe('success')
    // the pool loses nothing: the hope die is never lost to ones
    expect(s.lastRoll?.onesSetAside).toBe(0)
  })

  it('rerolls the whole pool through the brink, once, only on failure', () => {
    let { s, ada } = litAda()
    // a failed roll while the hope die sits out (eight pool dice, one dark die)
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(...Array(8).fill(2), 2))
    expect(s.lastRoll?.outcome).toBe('failure')
    // whole pool comes back as sixes
    s = reducer(s, { type: 'brink/reroll', actorId: ada }, rngFrom(...Array(8).fill(6)))
    expect(s.lastRoll?.brinkRerolled).toBe(true)
    expect(s.lastRoll?.outcome).toBe('success')
    expect(s.survivors.find((x) => x.id === ada)!.brinkRevealed).toBe(true)
    // it cannot fire twice
    s = reducer(s, { type: 'conflict/roll', actorId: ada, useHope: false }, rngFrom(...Array(8).fill(2), 2))
    expect(s.lastRoll?.outcome).toBe('failure')
    expect(reducer(s, { type: 'brink/reroll', actorId: ada }, rngFrom(6)).lastRoll?.outcome).toBe('failure')
  })
})

describe('the last stand and the end', () => {
  function toLastStand(): NightState {
    let s = beginNight(gathering(2))
    for (let i = 0; i < 10; i++) {
      if (s.phase === 'truths') {
        s = speakAll(s)
        s = reducer(s, { type: 'scene/begin' })
      }
      s = reducer(s, { type: 'conflict/roll', actorId: null, useHope: false }, rngFrom(...Array(10).fill(2)))
      s = reducer(s, { type: 'scene/darken', by: 'Keeper' })
    }
    return s
  }

  it('arrives at the last stand only when the final candle goes out', () => {
    const s = toLastStand()
    expect(s.candlesLit).toBe(0)
    expect(s.phase).toBe('laststand')
    expect(s.scene).toBe(10)
  })

  it('plays no dice there, takes lives, and ends with the last truth', () => {
    let s = toLastStand()
    const [ada, bo] = s.survivors
    // dice still roll in state but the rules refuse: no roll outside a scene
    s = reducer(s, { type: 'conflict/roll', actorId: ada.id, useHope: false }, rngFrom(6))
    expect(s.lastRoll).toBeNull()
    s = reducer(s, { type: 'laststand/fall', actorId: ada.id })
    expect(s.phase).toBe('laststand')
    s = reducer(s, { type: 'laststand/fall', actorId: bo.id })
    expect(s.phase).toBe('epilogue')
    expect(s.survivors.every((x) => !x.alive)).toBe(true)
    s = reducer(s, { type: 'night/finalTruth', author: 'Keeper', text: 'They were not afraid.' })
    expect(s.finalTruth?.text).toBe('They were not afraid.')
    expect(reducer(s, { type: 'night/finalTruth', author: 'Keeper', text: 'again' }).finalTruth?.text).toBe(
      'They were not afraid.',
    )
  })
})

describe('reducer purity', () => {
  it('logging an action twice from the same state (StrictMode double-invoke) keeps one entry', () => {
    const s = gathering(2)
    const first = reducer(s, { type: 'night/begin' })
    const second = reducer(s, { type: 'night/begin' })
    expect(first.log).toHaveLength(1)
    expect(second.log).toHaveLength(1)
    expect(s.log).toHaveLength(0)
    expect(first.log).not.toBe(second.log)
  })
})
