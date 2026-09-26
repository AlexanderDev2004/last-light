import { nanoid } from 'nanoid'
import { CLIENT_KEY, LOBBY_KEY, type Lobby, type LobbyPlayer } from './ten-candles'

export function getClientId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = localStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = `c_${nanoid(8)}`
    localStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

export function readLobby(lobbyId: string): Lobby | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOBBY_KEY(lobbyId))
    return raw ? (JSON.parse(raw) as Lobby) : null
  } catch {
    return null
  }
}

export function writeLobby(lobby: Lobby) {
  localStorage.setItem(LOBBY_KEY(lobby.id), JSON.stringify(lobby))
}

export function createLobby(roomName: string, userName: string, maxPlayers = 5): Lobby {
  const id = nanoid(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
  const clientId = getClientId()
  const lobby: Lobby = {
    id,
    name: roomName.trim() || `Room ${id}`,
    gmId: clientId,
    maxPlayers: Math.min(Math.max(maxPlayers, 2), 6),
    status: 'waiting',
    gameId: null,
    createdAt: Date.now(),
    players: [
      { clientId, name: userName.trim() || 'GM', isGM: true, isReady: false },
    ],
  }
  writeLobby(lobby)
  return lobby
}

export function joinLobby(lobbyId: string, userName: string): Lobby | null {
  const code = lobbyId.trim().toUpperCase()
  const lobby = readLobby(code)
  if (!lobby) return null
  const clientId = getClientId()
  const exists = lobby.players.find((p) => p.clientId === clientId)
  if (!exists) {
    if (lobby.players.length >= lobby.maxPlayers) throw new Error('Lobby penuh.')
    lobby.players.push({
      clientId,
      name: userName.trim() || `Player ${lobby.players.length + 1}`,
      isGM: false,
      isReady: false,
    })
    writeLobby(lobby)
  }
  return readLobby(code)
}

export function toggleReady(lobbyId: string): Lobby | null {
  const lobby = readLobby(lobbyId)
  if (!lobby) return null
  const me = getClientId()
  lobby.players = lobby.players.map((p) =>
    p.clientId === me ? { ...p, isReady: !p.isReady } : p,
  )
  writeLobby(lobby)
  return readLobby(lobbyId)
}

export function transferGM(lobbyId: string, toClientId: string): Lobby | null {
  const lobby = readLobby(lobbyId)
  if (!lobby) return null
  if (lobby.gmId !== getClientId()) throw new Error('Hanya GM yang bisa transfer.')
  lobby.gmId = toClientId
  lobby.players = lobby.players.map((p) => ({
    ...p,
    isGM: p.clientId === toClientId,
  }))
  writeLobby(lobby)
  return readLobby(lobbyId)
}

export function allReady(lobby: Lobby) {
  return (
    lobby.players.length >= 2 &&
    lobby.players.length <= lobby.maxPlayers &&
    lobby.players.every((p) => p.isReady)
  )
}

export function startGame(lobbyId: string): Lobby | null {
  const lobby = readLobby(lobbyId)
  if (!lobby) return null
  if (lobby.gmId !== getClientId()) throw new Error('Hanya GM yang bisa start.')
  if (!allReady(lobby)) throw new Error('Belum semua Ready.')
  lobby.status = 'playing'
  lobby.gameId = `g_${nanoid(8)}`
  writeLobby(lobby)
  return readLobby(lobbyId)
}

export function leaveLobby(lobbyId: string) {
  const lobby = readLobby(lobbyId)
  if (!lobby) return
  const me = getClientId()
  lobby.players = lobby.players.filter((p) => p.clientId !== me)
  if (lobby.gmId === me && lobby.players.length > 0) {
    lobby.gmId = lobby.players[0].clientId
    lobby.players = lobby.players.map((p, i) => ({ ...p, isGM: i === 0 }))
  }
  writeLobby(lobby)
}

export function useLobbySync(lobbyId: string, onChange: (l: Lobby | null) => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === LOBBY_KEY(lobbyId.toUpperCase())) {
      onChange(readLobby(lobbyId.toUpperCase()))
    }
  }
  window.addEventListener('storage', handler)
  const iv = setInterval(() => onChange(readLobby(lobbyId.toUpperCase())), 1500)
  return () => {
    window.removeEventListener('storage', handler)
    clearInterval(iv)
  }
}

export type { LobbyPlayer }
