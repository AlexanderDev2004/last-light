/**
 * The night's sync layer: how one night state stays one night across the
 * table's browsers, without the engine ever knowing a network exists.
 *
 * The room's host is authoritative here exactly as it is in the lobby: every
 * player action is spoken to the host, the host applies it to the engine
 * reducer in arrival order, and the whole night is broadcast back as a
 * snapshot. The reducer itself is untouched — dice ride along in the action
 * as pre-rolled values consumed through the reducer's own `rng` seam, so the
 * throw happens on the device whose player threw it (animation included) and
 * the verdict is computed once, identically, everywhere.
 *
 * The brink is the one secret the wire may never carry before its reveal:
 * every night state that leaves a device has unrevealed brink texts sealed
 * (see SEALED_BRINK), and the text only travels inside the one reveal action
 * the rules allow. Recordings never travel at all — they live in each
 * owner's IndexedDB.
 */

import { reducer, emptySurvivor, initialNight, darkPoolSize, poolSize } from './engine'
import {
  mathRandom,
  type Action,
  type Card,
  type NightState,
  type Room,
  type Rng,
  type Survivor,
} from './types'

/** What an unrevealed brink reads on every device but its owner's. */
export const SEALED_BRINK = '· · ·'

/** The night a room's gathering seats: one survivor per member who is not the
 *  keeper, its id the member's token — so every device knows which seat is
 *  its own, and the brink stays a secret by construction. */
export function nightFromRoom(room: Room): NightState {
  const keeper = room.members.find((m) => m.id === room.gmMemberId)
  const survivors = room.members
    .filter((m) => m.id !== room.gmMemberId)
    .map((m): Survivor => {
      const s = emptySurvivorWith(m.id)
      s.name = m.name
      return s
    })
  return { ...initialNight(), gmName: keeper?.name ?? '', survivors }
}

function emptySurvivorWith(id: string): Survivor {
  const s = emptySurvivor()
  s.id = id
  return s
}

/**
 * An rng over a carried throw: the reducer draws its dice from this queue in
 * engine order (the light pool, then the dark's, then the hope die). If the
 * sender's view of the pool was stale and the queue runs dry, real dice fill
 * the rest — the host's verdict stays correct either way, and the next
 * snapshot corrects the thrower's screen.
 */
export function scriptedRng(light: number[], dark: number[] = [], hope: number | null = null): Rng {
  const queue = [...light, ...dark, ...(hope !== null ? [hope] : [])]
  return (sides) => {
    const next = queue.shift()
    return next !== undefined ? next : mathRandom(sides)
  }
}

/**
 * The dice a throw needs, rolled on the device whose player is throwing —
 * null for actions that carry no dice of their own.
 */
export function rollDiceFor(action: Action, night: NightState): {
  light: number[]
  dark: number[] | undefined
  hope: number | null
} | null {
  switch (action.type) {
    case 'conflict/roll': {
      const light = Array.from({ length: poolSize(night) }, () => mathRandom(6))
      const dark = Array.from({ length: darkPoolSize(night) }, () => mathRandom(6))
      return { light, dark, hope: action.useHope ? mathRandom(6) : null }
    }
    case 'conflict/rerollOnes': {
      const r = night.lastRoll
      const ones = r ? r.light.filter((d) => d === 1).length : 0
      return ones > 0 ? { light: Array.from({ length: ones }, () => mathRandom(6)), dark: undefined, hope: null } : null
    }
    case 'brink/reroll': {
      const r = night.lastRoll
      return r
        ? { light: Array.from({ length: r.light.length }, () => mathRandom(6)), dark: undefined, hope: null }
        : null
    }
    default:
      return null
  }
}

/** The night as the wire may carry it: unrevealed brinks sealed. */
export function sanitizeForWire(night: NightState): NightState {
  return {
    ...night,
    survivors: night.survivors.map((s) =>
      s.brinkRevealed || s.cards.brink.text === SEALED_BRINK
        ? s
        : { ...s, cards: { ...s.cards, brink: sealedBrink(s.cards.brink) } },
    ),
  }
}

function sealedBrink(card: Card): Card {
  return { ...card, text: SEALED_BRINK }
}

/**
 * A snapshot landing on a device, folded into what the device already knows.
 * Two things survive the fold:
 *  - this device's own unrevealed brink — the snapshot cannot carry it, so
 *    the local text outlives every snapshot until the reveal;
 *  - the last roll the device is already animating — the host's echo of a
 *    locally-applied action must not restart the throw, so a deep-equal roll
 *    keeps its reference.
 */
export function mergeSnapshot(local: NightState, incoming: NightState, myToken: string): NightState {
  const sameRoll = JSON.stringify(incoming.lastRoll ?? null) === JSON.stringify(local.lastRoll ?? null)
  let night: NightState = sameRoll ? { ...incoming, lastRoll: local.lastRoll } : incoming
  const mine = local.survivors.find((s) => s.id === myToken)
  if (mine && mine.cards.brink.text !== SEALED_BRINK) {
    night = {
      ...night,
      survivors: night.survivors.map((s) =>
        s.id === myToken && !s.brinkRevealed
          ? { ...s, cards: { ...s.cards, brink: { ...s.cards.brink, text: mine.cards.brink.text } } }
          : s,
      ),
    }
  }
  return night
}

/** Everything the night's reducer can be asked, engine actions included. */
export type SyncAction =
  | Action
  | { type: 'night/seed'; night: NightState }
  | { type: 'night/netState'; night: NightState; myToken: string }
  | { type: 'night/scripted'; action: Action; light: number[]; dark?: number[]; hope?: number | null }
  | { type: 'night/revealBrink'; actorId: string; brinkText: string; light: number[] }

/**
 * The engine reducer, wrapped — not changed. Everything the engine does not
 * know about (snapshots, carried dice, the reveal that stitches a brink text
 * back into the state just long enough to be spoken) is answered here.
 */
export function syncReducer(state: NightState, action: SyncAction): NightState {
  switch (action.type) {
    case 'night/seed':
      return action.night
    case 'night/netState':
      return mergeSnapshot(state, action.night, action.myToken)
    case 'night/scripted':
      return reducer(state, action.action, scriptedRng(action.light, action.dark, action.hope ?? null))
    case 'night/revealBrink': {
      // the rules let the brink be seen exactly once, here: stage the text,
      // let the engine speak it into the night's record, and burn the card
      const staged: NightState = {
        ...state,
        survivors: state.survivors.map((s) =>
          s.id === action.actorId
            ? { ...s, cards: { ...s.cards, brink: { ...s.cards.brink, text: action.brinkText } } }
            : s,
        ),
      }
      return reducer(staged, { type: 'brink/reroll', actorId: action.actorId }, scriptedRng(action.light))
    }
    default:
      return reducer(state, action)
  }
}
