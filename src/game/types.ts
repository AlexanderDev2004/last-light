/**
 * Ten Candles — official rules, as a pure state machine.
 *
 * Source of truth: Cavalry Games' Ten Candles by Stephen Dewey
 * (https://cavalrygames.com/ten-candles-info and the designer's own
 * "How To Play: Ten Candles" overview). This companion implements:
 *
 *  - Ten candles as the game's countdown. Ten or fewer scenes; every scene
 *    ends when a candle is darkened (by a failed conflict, or by accident).
 *  - "That Which Is True" opens every scene: the table speaks as many truths
 *    as there are candles still lit, going around the table (players and the
 *    game master), starting with whoever darkened the last candle.
 *  - Conflicts: a communal pool of ten dice at the start of the night. Roll
 *    the whole pool: at least one six is success and the player describes it;
 *    every one is set aside and lost for the rest of the scene; no six is
 *    failure — a candle is darkened. The pool refills each scene up to the
 *    number of lit candles. The game master rolls a pool of darkened candles
 *    alongside; when They roll more sixes, They narrate even a successful
 *    outcome.
 *  - Character stacks: virtue, vice, moment, brink — burned in stack order.
 *    A burned trait rerolls every die showing one (the trait must be lived in
 *    the fiction). A lived moment lights that character's hope die (a five or
 *    six counts, never lost to ones). The brink, written in secret, unlocks
 *    once everything above it has burned: on a failed conflict its owner
 *    reveals it and throws the whole pool again.
 *  - The Last Stand: when the final candle goes out there are no more dice.
 *    Any conflict can only succeed in exchange for that character's life.
 *    When the last character falls, the last truth is spoken and the final
 *    recordings play.
 */

export const TOTAL_CANDLES = 10

export type CardKind = 'virtue' | 'vice' | 'moment' | 'brink'

export const CARD_KINDS: CardKind[] = ['virtue', 'vice', 'moment', 'brink']

export interface Card {
  kind: CardKind
  text: string
  burned: boolean
}

export interface Survivor {
  id: string
  name: string
  cards: Record<CardKind, Card>
  /** true when the vice sits above the virtue in the stack */
  viceOnTop: boolean
  /** lit by living the moment; counts a five or six, never lost to ones */
  hopeDie: boolean
  brinkRevealed: boolean
  alive: boolean
}

export interface Truth {
  id: string
  scene: number
  author: string
  text: string
}

export type Phase = 'gathering' | 'truths' | 'scene' | 'laststand' | 'epilogue'

export type RollOutcome = 'success' | 'success_them' | 'failure'

export interface ConflictRoll {
  actorId: string | null
  /** pool dice as they now lie (trait and brink rerolls applied in place) */
  light: number[]
  /** the game master's dice, rolled alongside */
  dark: number[]
  /** hope die face when it joined this conflict, else null */
  hope: number | null
  playerSixes: number
  gmSixes: number
  outcome: RollOutcome
  /** ones set aside by this roll (after any reroll), on top of earlier losses */
  onesSetAside: number
  burnedKind: CardKind | null
  brinkRerolled: boolean
}

export interface LogEntry {
  id: string
  text: string
}

export type Action =
  | { type: 'gm/set-name'; name: string }
  | { type: 'survivor/add'; name: string }
  | { type: 'survivor/remove'; id: string }
  | { type: 'survivor/move'; id: string; dir: -1 | 1 }
  | { type: 'survivor/rename'; id: string; name: string }
  | { type: 'survivor/setCard'; id: string; kind: CardKind; text: string }
  | { type: 'survivor/toggleStack'; id: string }
  | { type: 'night/begin' }
  | { type: 'truth/speak'; author: string; text: string }
  | { type: 'scene/begin' }
  | { type: 'conflict/roll'; actorId: string | null; useHope: boolean }
  | { type: 'conflict/rerollOnes'; actorId: string }
  | { type: 'moment/live'; actorId: string }
  | { type: 'brink/reroll'; actorId: string }
  | { type: 'scene/darken'; by: string }
  | { type: 'laststand/fall'; actorId: string }
  | { type: 'night/finalTruth'; author: string; text: string }
  | { type: 'night/reset' }

export interface NightState {
  phase: Phase
  nightId: string
  gmName: string
  /** seat order */
  survivors: Survivor[]
  /** 1-based scene number */
  scene: number
  /** 10 .. 0 */
  candlesLit: number
  truths: Truth[]
  /** truths still owed before this scene can begin */
  truthsDue: number
  /** who darkened the last candle — they open the next "That Which Is True" */
  lastDarkener: string | null
  /** communal dice set aside so far this scene */
  lostOnes: number
  lastRoll: ConflictRoll | null
  log: LogEntry[]
  finalTruth: Truth | null
}

/** Uniform die: returns 1..sides. */
export type Rng = (sides: number) => number

export const mathRandom: Rng = (sides) => 1 + Math.floor(Math.random() * sides)

let uid = 0
export const newId = () => `${Date.now().toString(36)}${(uid++).toString(36)}`

/* ---------- lobby room model (see the lobby issue: admin != GM) ---------- */

export type MemberRole = 'admin' | 'member'

export interface Member {
  id: string
  name: string
  /** room ownership — separate from the in-game keeper role */
  role: MemberRole
  /** the in-game keeper; at most one, appointed by the admin */
  isGm: boolean
  /** flagged by the member; the admin may hand the keeper's seat to any of these */
  wantsGm: boolean
  ready: boolean
  connected: boolean
}

export interface Room {
  code: string
  name: string
  visibility: 'private' | 'public'
  adminId: string
  /** null = no keeper appointed yet */
  gmMemberId: string | null
  members: Member[]
}

/** 3-5 survivors plus the keeper may sit down for a night. */
export const MIN_SURVIVORS = 3
export const MAX_SURVIVORS = 5
/** hard cap while seated in the room, so a night can always start */
export const MAX_MEMBERS = MAX_SURVIVORS + 1
