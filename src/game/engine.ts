import {
  CARD_KINDS,
  TOTAL_CANDLES,
  mathRandom,
  newId,
  type Action,
  type Card,
  type CardKind,
  type ConflictRoll,
  type NightState,
  type Rng,
  type Survivor,
} from './types'

// ---------------------------------------------------------------------------
// derived facts (pure, used by UI and engine alike)
// ---------------------------------------------------------------------------

/** The stack: traits on top (in the player's chosen order), moment, brink. */
export function stackOf(s: Survivor): Card[] {
  const traits: Card[] = s.viceOnTop ? [s.cards.vice, s.cards.virtue] : [s.cards.virtue, s.cards.vice]
  return [...traits, s.cards.moment, s.cards.brink]
}

/** The topmost unburned card — the only one that can burn right now. */
export function topCard(s: Survivor): Card | null {
  return stackOf(s).find((c) => !c.burned) ?? null
}

export function traitsBurned(s: Survivor): boolean {
  return s.cards.virtue.burned && s.cards.vice.burned
}

/** The moment may be lived once both traits have burned away. */
export function momentUnlocked(s: Survivor): boolean {
  return traitsBurned(s) && !s.cards.moment.burned
}

/** The brink unlocks once everything above it has burned. */
export function brinkUnlocked(s: Survivor): boolean {
  return traitsBurned(s) && s.cards.moment.burned
}

export function isCardWritten(c: Card): boolean {
  return c.text.trim().length > 0
}

export function isReady(s: Survivor): boolean {
  return s.name.trim().length > 0 && CARD_KINDS.every((k) => isCardWritten(s.cards[k]))
}

/** Dice available to the communal pool right now. */
export function poolSize(state: NightState): number {
  return Math.max(0, state.candlesLit - state.lostOnes)
}

/** The game master's pool: one die per darkened candle. */
export function darkPoolSize(state: NightState): number {
  return TOTAL_CANDLES - state.candlesLit
}

/** Reason the night cannot begin yet, or null when it can. */
export function beginBlocker(state: NightState): string | null {
  if (state.survivors.length === 0) return 'No one is seated at the table.'
  const unready = state.survivors.filter((s) => !isReady(s))
  if (unready.length > 0) {
    const names = unready.map((s) => s.name.trim() || 'Unnamed').join(', ')
    return `Not every card is written: ${names}.`
  }
  return null
}

/**
 * Who speaks the next truth, following the ritual: starting with whoever
 * darkened the last candle (the game master opens the night), moving around
 * the table — every player and the game master, one truth at a time.
 */
export function nextSpeaker(state: NightState): { gm: boolean; name: string } {
  const spoken = state.truths.filter((t) => t.scene === state.scene).length
  const names = state.survivors.map((s) => s.name.trim() || 'Unnamed')
  const startIndex =
    state.lastDarkener === null
      ? -1 // the game master opens the night
      : names.indexOf(state.lastDarkener)
  const cycleLength = names.length + 1
  const indexInCycle = (((startIndex + spoken) % cycleLength) + cycleLength) % cycleLength
  if (indexInCycle === names.length || names.length === 0) return { gm: true, name: state.gmName }
  return { gm: false, name: names[indexInCycle] }
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

function emptyCard(kind: CardKind): Card {
  return { kind, text: '', burned: false }
}

export function emptySurvivor(): Survivor {
  return {
    id: newId(),
    name: '',
    viceOnTop: false,
    hopeDie: false,
    brinkRevealed: false,
    alive: true,
    cards: {
      virtue: emptyCard('virtue'),
      vice: emptyCard('vice'),
      moment: emptyCard('moment'),
      brink: emptyCard('brink'),
    },
  }
}

export function initialNight(): NightState {
  return {
    phase: 'gathering',
    nightId: newId(),
    gmName: '',
    survivors: [],
    scene: 1,
    candlesLit: TOTAL_CANDLES,
    truths: [],
    truthsDue: 0,
    lastDarkener: null,
    lostOnes: 0,
    lastRoll: null,
    log: [],
    finalTruth: null,
  }
}

function log(state: NightState, text: string): NightState {
  return { ...state, log: [...state.log, { id: newId(), text }] }
}

function roll(n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => rng(6))
}

function sixes(dice: number[]): number {
  return dice.filter((d) => d === 6).length
}

function ones(dice: number[]): number {
  return dice.filter((d) => d === 1).length
}

/** A five or six on the hope die counts; its ones are never lost. */
function hopeSuccesses(hope: number | null): number {
  return hope !== null && hope >= 5 ? 1 : 0
}

function resolve(light: number[], dark: number[], hope: number | null): {
  playerSixes: number
  gmSixes: number
  outcome: ConflictRoll['outcome']
} {
  const playerSixes = sixes(light) + hopeSuccesses(hope)
  const gmSixes = sixes(dark)
  // Any six (or hope five/six) succeeds. They seize the narrative only by
  // rolling strictly more sixes.
  const outcome: ConflictRoll['outcome'] =
    playerSixes === 0 ? 'failure' : gmSixes > playerSixes ? 'success_them' : 'success'
  return { playerSixes, gmSixes, outcome }
}

function rollVerdictText(r: ConflictRoll): string {
  if (r.outcome === 'failure') {
    return `Failure — no six answered. ${r.onesSetAside > 0 ? `${r.onesSetAside} die ${r.onesSetAside === 1 ? 'is' : 'are'} lost to the dark. ` : ''}Darken a candle.`
  }
  if (r.outcome === 'success_them') {
    return `Success, at a price — ${r.playerSixes} against Their ${r.gmSixes}. They narrate what it costs.`
  }
  return `Success — ${r.playerSixes === 1 ? 'one six' : `${r.playerSixes} sixes`} against Their ${r.gmSixes}. The player describes what it wins.`
}

function findSurvivor(state: NightState, id: string): Survivor {
  const s = state.survivors.find((x) => x.id === id)
  if (!s) throw new Error(`Unknown survivor: ${id}`)
  return s
}

// ---------------------------------------------------------------------------
// reducer
// ---------------------------------------------------------------------------

export function reducer(
  state: NightState,
  action: Action,
  rng: Rng = mathRandom,
): NightState {
  switch (action.type) {
    case 'gm/set-name':
      return { ...state, gmName: action.name }

    case 'survivor/add': {
      if (state.phase !== 'gathering') return state
      const s = emptySurvivor()
      s.name = action.name
      return { ...state, survivors: [...state.survivors, s] }
    }

    case 'survivor/remove': {
      if (state.phase !== 'gathering') return state
      return { ...state, survivors: state.survivors.filter((s) => s.id !== action.id) }
    }

    case 'survivor/move': {
      if (state.phase !== 'gathering') return state
      const i = state.survivors.findIndex((s) => s.id === action.id)
      const j = i + action.dir
      if (i < 0 || j < 0 || j >= state.survivors.length) return state
      const survivors = [...state.survivors]
      ;[survivors[i], survivors[j]] = [survivors[j], survivors[i]]
      return { ...state, survivors }
    }

    case 'survivor/rename': {
      if (state.phase !== 'gathering') return state
      return {
        ...state,
        survivors: state.survivors.map((s) =>
          s.id === action.id ? { ...s, name: action.name } : s,
        ),
      }
    }

    case 'survivor/setCard': {
      if (state.phase !== 'gathering') return state
      return {
        ...state,
        survivors: state.survivors.map((s) =>
          s.id === action.id
            ? { ...s, cards: { ...s.cards, [action.kind]: { ...s.cards[action.kind], text: action.text } } }
            : s,
        ),
      }
    }

    case 'survivor/toggleStack': {
      if (state.phase !== 'gathering') return state
      return {
        ...state,
        survivors: state.survivors.map((s) =>
          s.id === action.id ? { ...s, viceOnTop: !s.viceOnTop } : s,
        ),
      }
    }

    case 'night/begin': {
      if (state.phase !== 'gathering') return state
      const next: NightState = {
        ...state,
        phase: 'truths',
        scene: 1,
        candlesLit: TOTAL_CANDLES,
        truthsDue: TOTAL_CANDLES,
      }
      return log(next, 'The candles are lit. The world has been dark for ten days.')
    }

    case 'truth/speak': {
      if (state.phase !== 'truths' || state.truthsDue <= 0) return state
      const text = action.text.trim()
      if (!text) return state
      return {
        ...state,
        truthsDue: state.truthsDue - 1,
        truths: [
          ...state.truths,
          { id: newId(), scene: state.scene, author: action.author.trim() || 'The table', text },
        ],
      }
    }

    case 'scene/begin': {
      if (state.phase !== 'truths' || state.truthsDue > 0) return state
      const next: NightState = { ...state, phase: 'scene', lostOnes: 0, lastRoll: null }
      return log(
        next,
        `Scene ${state.scene} begins. ${state.candlesLit} ${state.candlesLit === 1 ? 'die answers' : 'dice answer'} the light; the dark holds ${darkPoolSize(state)}.`,
      )
    }

    case 'conflict/roll': {
      if (state.phase !== 'scene') return state
      const actor = action.actorId ? findSurvivor(state, action.actorId) : null
      const useHope = action.useHope && actor !== null && actor.hopeDie
      const light = roll(poolSize(state), rng)
      const dark = roll(darkPoolSize(state), rng)
      const hope = useHope ? rng(6) : null
      const { playerSixes, gmSixes, outcome } = resolve(light, dark, hope)
      const onesSetAside = ones(light)
      const rollResult: ConflictRoll = {
        actorId: actor?.id ?? null,
        light,
        dark,
        hope,
        playerSixes,
        gmSixes,
        outcome,
        onesSetAside,
        burnedKind: null,
        brinkRerolled: false,
      }
      const next: NightState = {
        ...state,
        lastRoll: rollResult,
        lostOnes: state.lostOnes + onesSetAside,
      }
      return log(
        next,
        actor
          ? `${actor.name} rolls ${light.length} ${light.length === 1 ? 'die' : 'dice'} against the dark's ${dark.length}. ${rollVerdictText(rollResult)}`
          : `The table rolls ${light.length} ${light.length === 1 ? 'die' : 'dice'} against the dark's ${dark.length}. ${rollVerdictText(rollResult)}`,
      )
    }

    case 'conflict/rerollOnes': {
      const r = state.lastRoll
      if (!r || state.phase !== 'scene') return state
      const actor = findSurvivor(state, action.actorId)
      const top = topCard(actor)
      if (!top || (top.kind !== 'virtue' && top.kind !== 'vice')) return state
      if (!r.light.includes(1)) return state
      // Reroll every die showing one; whatever comes up stands — new sixes
      // count, new ones are set aside.
      const light = r.light.map((d) => (d === 1 ? rng(6) : d))
      const { playerSixes, gmSixes, outcome } = resolve(light, r.dark, r.hope)
      const freshOnes = ones(light)
      const rollResult: ConflictRoll = {
        ...r,
        light,
        playerSixes,
        gmSixes,
        outcome,
        onesSetAside: freshOnes,
        burnedKind: top.kind,
      }
      const next: NightState = {
        ...state,
        lastRoll: rollResult,
        lostOnes: state.lostOnes + freshOnes,
        survivors: state.survivors.map((s) =>
          s.id === actor.id
            ? { ...s, cards: { ...s.cards, [top.kind]: { ...s.cards[top.kind], burned: true } } }
            : s,
        ),
      }
      return log(
        next,
        `${actor.name} burns their ${top.kind} — “${top.text}” — and throws every one again. ${rollVerdictText(rollResult)}`,
      )
    }

    case 'moment/live': {
      if (state.phase !== 'scene') return state
      const actor = findSurvivor(state, action.actorId)
      if (!actor.alive || !momentUnlocked(actor)) return state
      const next: NightState = {
        ...state,
        survivors: state.survivors.map((s) =>
          s.id === actor.id
            ? {
                ...s,
                hopeDie: true,
                cards: { ...s.cards, moment: { ...s.cards.moment, burned: true } },
              }
            : s,
        ),
      }
      return log(
        next,
        `${actor.name} lives their Moment — “${actor.cards.moment.text}”. Their hope die is lit.`,
      )
    }

    case 'brink/reroll': {
      const r = state.lastRoll
      if (!r || state.phase !== 'scene') return state
      const actor = findSurvivor(state, action.actorId)
      if (r.actorId !== actor.id || !actor.alive || !brinkUnlocked(actor)) return state
      if (actor.brinkRevealed || r.outcome !== 'failure') return state
      // Pushed past the brink: the whole pool is thrown again.
      const light = r.light.map(() => rng(6))
      const { playerSixes, gmSixes, outcome } = resolve(light, r.dark, r.hope)
      const freshOnes = ones(light)
      const rollResult: ConflictRoll = {
        ...r,
        light,
        playerSixes,
        gmSixes,
        outcome,
        onesSetAside: freshOnes,
        brinkRerolled: true,
      }
      const next: NightState = {
        ...state,
        lastRoll: rollResult,
        lostOnes: state.lostOnes + freshOnes,
        survivors: state.survivors.map((s) =>
          s.id === actor.id ? { ...s, brinkRevealed: true } : s,
        ),
      }
      return log(
        next,
        `${actor.name} goes past their brink — “${actor.cards.brink.text}” — and the whole pool is thrown again. ${rollVerdictText(rollResult)}`,
      )
    }

    case 'scene/darken': {
      if (state.phase !== 'scene') return state
      const candlesLit = state.candlesLit - 1
      const next: NightState = {
        ...state,
        candlesLit,
        lostOnes: 0,
        lastRoll: null,
        lastDarkener: action.by.trim() || state.gmName,
      }
      if (candlesLit <= 0) {
        next.phase = 'laststand'
        return log(next, 'The last candle is out. There are no more dice. This is the Last Stand.')
      }
      next.phase = 'truths'
      next.scene = state.scene + 1
      next.truthsDue = candlesLit
      return log(next, `A candle goes out. ${candlesLit} remain. The scene turns.`)
    }

    case 'laststand/fall': {
      if (state.phase !== 'laststand') return state
      const actor = findSurvivor(state, action.actorId)
      if (!actor.alive) return state
      const survivors = state.survivors.map((s) =>
        s.id === actor.id ? { ...s, alive: false } : s,
      )
      let next: NightState = log(
        { ...state, survivors },
        `${actor.name.trim() || 'Someone'} falls. It only cost everything.`,
      )
      if (next.survivors.every((s) => !s.alive)) {
        next = log({ ...next, phase: 'epilogue' }, 'The last light goes out. What remains is what was true.')
      }
      return next
    }

    case 'night/finalTruth': {
      if (state.phase !== 'epilogue' || state.finalTruth) return state
      const text = action.text.trim()
      if (!text) return state
      return {
        ...state,
        finalTruth: { id: newId(), scene: state.scene, author: action.author.trim() || state.gmName, text },
      }
    }

    case 'night/reset':
      return initialNight()
  }
}
