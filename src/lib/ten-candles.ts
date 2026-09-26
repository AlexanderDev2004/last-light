export type CardKind = 'virtue' | 'vice' | 'moment' | 'brink'

export interface PlayerCards {
  virtue: string
  vice: string
  moment: string
  brink: string
  burned: Record<CardKind, boolean>
  hopeDie: boolean
  alive: boolean
}

export interface LobbyPlayer {
  clientId: string
  name: string
  isGM: boolean
  isReady: boolean
  /** Lamport-ish stamp for peer-to-peer merges (higher wins). */
  rev?: number
}

export interface Lobby {
  id: string
  name: string
  gmId: string
  maxPlayers: number
  status: 'waiting' | 'starting' | 'playing'
  players: LobbyPlayer[]
  gameId: string | null
  createdAt: number
  /** Lamport-ish stamp for peer-to-peer merges (higher wins). */
  rev?: number
}

export interface SessionPlayer extends LobbyPlayer {
  cards: PlayerCards
}

export interface TruthEntry {
  id: string
  candleLeft: number
  author: string
  text: string
  at: number
}

export interface GameSession {
  gameId: string
  lobbyId: string
  candlesLit: number
  truths: TruthEntry[]
  players: SessionPlayer[]
  log: string[]
  ended: boolean
  /** Lamport-ish stamp for peer-to-peer merges (higher wins). */
  rev?: number
}

export const LOBBY_KEY = (id: string) => `tc:lobby:${id}`
export const SESSION_KEY = (gameId: string, lobbyId: string) =>
  `tc:session:${lobbyId}:${gameId}`
export const CLIENT_KEY = `tc:clientId`

export function rollD6(n: number): number[] {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6))
}

export function isSuccess(dice: number[], hope: number[] = []) {
  return dice.includes(6) || hope.includes(5) || hope.includes(6)
}

export function countOnes(dice: number[]) {
  return dice.filter((d) => d === 1).length
}

const BANNED_TRUTH = ['takut cahaya', 'lemah', 'tidak berbahaya', 'tidak kuat', 'baik', 'jinak']

export function validateTruth(text: string): string | null {
  const t = text.trim()
  if (t.length < 4) return 'Truth terlalu pendek.'
  const low = t.toLowerCase()
  for (const b of BANNED_TRUTH) {
    if (low.includes(b)) return `Truth tidak boleh melemahkan Them (terdeteksi: "${b}").`
  }
  return null
}
