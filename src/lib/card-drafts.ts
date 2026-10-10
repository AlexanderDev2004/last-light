import type { CardKind, PlayerCards, SessionPlayer } from './ten-candles'

/**
 * The writing ritual (Ten Candles setup).
 *
 * No one writes their own character alone. Seating order is the lobby
 * roster order; the circle holds survivors only (the keeper facilitates
 * and holds no cards):
 *  - your Virtue is written by the player to your LEFT,
 *  - your Vice is written by the player to your RIGHT,
 *  - your Moment you write yourself ("I will find hope…"),
 *  - your Brink is written by the player to your RIGHT, as a sealed
 *    witness statement ("I've seen you…").
 *
 * Authorship is positional, so no author fields need storing: given the
 * circle, who wrote what is derivable on every client. Writes go through
 * the existing card-save path, which permits cross-player writes on all
 * backend tiers (cooperative table trust).
 */

export const CARD_ORDER: CardKind[] = ['virtue', 'vice', 'moment', 'brink']

export const CARD_LABEL: Record<CardKind, string> = {
  virtue: 'Virtue',
  vice: 'Vice',
  moment: 'Moment',
  brink: 'Brink',
}

export const CARD_HINT: Record<CardKind, string> = {
  virtue: 'Who they are in the light.',
  vice: 'Who they are in the dark.',
  moment: 'When they find hope. Fulfilling it earns a hope die.',
  brink: 'A secret, beginning “I have seen you…”.',
}

/** Minimum trimmed characters for a card to count as written. */
export const CARD_MIN = 2

export function isCardSet(text: string): boolean {
  return text.trim().length >= CARD_MIN
}

export function cardsComplete(cards: Pick<PlayerCards, 'virtue' | 'vice' | 'moment' | 'brink'>): boolean {
  return CARD_ORDER.every((k) => isCardSet(cards[k]))
}

/** Survivors in roster order — the writing circle. */
export function circleOf(players: SessionPlayer[]): SessionPlayer[] {
  return players.filter((p) => !p.isGM)
}

/** Next in the circle, wrapping. Alone in the circle means yourself. */
export function leftOf(circle: SessionPlayer[], clientId: string): SessionPlayer | null {
  if (circle.length === 0) return null
  const i = circle.findIndex((p) => p.clientId === clientId)
  if (i < 0) return null
  return circle[(i + 1) % circle.length]
}

/** Previous in the circle, wrapping. Alone in the circle means yourself. */
export function rightOf(circle: SessionPlayer[], clientId: string): SessionPlayer | null {
  if (circle.length === 0) return null
  const i = circle.findIndex((p) => p.clientId === clientId)
  if (i < 0) return null
  return circle[(i - 1 + circle.length) % circle.length]
}

export function isSetupComplete(players: SessionPlayer[]): boolean {
  const circle = circleOf(players)
  return circle.length > 0 && circle.every((p) => cardsComplete(p.cards))
}

export function setupProgress(players: SessionPlayer[]): { done: number; total: number } {
  const circle = circleOf(players)
  let done = 0
  for (const p of circle) {
    for (const k of CARD_ORDER) {
      if (isCardSet(p.cards[k])) done++
    }
  }
  return { done, total: circle.length * CARD_ORDER.length }
}
