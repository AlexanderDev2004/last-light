import { nanoid } from 'nanoid'
import {
  SESSION_KEY,
  type GameSession,
  type Lobby,
  type SessionPlayer,
  type TruthEntry,
} from './ten-candles'
import { readLobby } from './lobby-store'

export function initSession(gameId: string, lobby: Lobby): GameSession {
  // The keeper plays no survivor, so only non-GM players get character cards.
  const players: SessionPlayer[] = lobby.players
    .filter((p) => !p.isGM)
    .map((p) => ({
      ...p,
      cards: {
      virtue: '',
      vice: '',
      moment: '',
      brink: '',
      burned: { virtue: false, vice: false, moment: false, brink: false },
      hopeDie: false,
      alive: true,
    },
  }))
  return {
    gameId,
    lobbyId: lobby.id,
    candlesLit: 10,
    truths: [],
    players,
    log: [`Sesi dimulai. 10 lilin menyala. These things are true. The world is dark...`],
    ended: false,
  }
}

export function readSession(gameId: string, lobbyId: string): GameSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY(gameId, lobbyId.toUpperCase()))
    return raw ? (JSON.parse(raw) as GameSession) : null
  } catch {
    return null
  }
}

export function writeSession(s: GameSession) {
  localStorage.setItem(SESSION_KEY(s.gameId, s.lobbyId.toUpperCase()), JSON.stringify(s))
}

export function ensureSession(gameId: string, lobbyId: string): GameSession | null {
  let s = readSession(gameId, lobbyId)
  if (s) return s
  const lobby = readLobby(lobbyId.toUpperCase())
  if (!lobby) return null
  s = initSession(gameId, lobby)
  writeSession(s)
  return s
}

export function updateSession(gameId: string, lobbyId: string, fn: (s: GameSession) => GameSession) {
  const cur = ensureSession(gameId, lobbyId)
  if (!cur) return null
  const next = fn(cur)
  writeSession(next)
  return next
}

export function extinguishCandle(gameId: string, lobbyId: string) {
  return updateSession(gameId, lobbyId, (s) => {
    if (s.candlesLit <= 1) return s
    return {
      ...s,
      candlesLit: s.candlesLit - 1,
      log: [...s.log, `Lilin dipadamkan. Sisa ${s.candlesLit - 1}. Truths phase.`],
    }
  })
}

export function addTruth(gameId: string, lobbyId: string, author: string, text: string) {
  const entry: TruthEntry = {
    id: `t_${nanoid(6)}`,
    candleLeft: readSession(gameId, lobbyId)?.candlesLit ?? 0,
    author,
    text,
    at: Date.now(),
  }
  return updateSession(gameId, lobbyId, (s) => ({
    ...s,
    truths: [...s.truths, entry],
    log: [...s.log, `Truth oleh ${author}: ${text}`],
  }))
}

export function useSessionSync(
  gameId: string,
  lobbyId: string,
  onChange: (s: GameSession | null) => void,
) {
  if (typeof window === 'undefined') return () => {}
  const key = SESSION_KEY(gameId, lobbyId.toUpperCase())
  const handler = (e: StorageEvent) => {
    if (e.key === key) onChange(readSession(gameId, lobbyId))
  }
  window.addEventListener('storage', handler)
  const iv = setInterval(() => onChange(readSession(gameId, lobbyId)), 1500)
  return () => {
    window.removeEventListener('storage', handler)
    clearInterval(iv)
  }
}
