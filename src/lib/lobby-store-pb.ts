import { nanoid } from 'nanoid'
import { getPb, pbAvailable } from './pb'
import {
  getClientId,
  readLobby,
  writeLobby,
  createLobby as localCreate,
  joinLobby as localJoin,
  toggleReady as localToggle,
  transferGM as localTransfer,
  startGame as localStart,
} from './lobby-store'
import type { Lobby } from './ten-candles'

interface LobbyRecord {
  id: string
  code: string
  name: string
  gmId: string
  maxPlayers: number
  status: 'waiting' | 'playing'
  gameId: string
  players: Lobby['players']
}

function toLobby(r: LobbyRecord): Lobby {
  return {
    id: r.code,
    name: r.name,
    gmId: r.gmId,
    maxPlayers: r.maxPlayers,
    status: r.status,
    gameId: r.gameId || null,
    createdAt: 0,
    players: r.players ?? [],
  }
}

async function findRecord(code: string): Promise<LobbyRecord | null> {
  const pb = getPb()
  if (!pb || !(await pbAvailable())) return null
  try {
    const rec = await pb
      .collection('lobbies')
      .getFirstListItem<LobbyRecord>(`code = "${code.toUpperCase()}"`)
    return rec
  } catch {
    return null
  }
}

export async function createLobbyPb(
  roomName: string,
  userName: string,
  maxPlayers = 5,
): Promise<Lobby> {
  const clientId = getClientId()
  const code = nanoid(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
  const lobby: Lobby = {
    id: code,
    name: roomName.trim() || `Room ${code}`,
    gmId: clientId,
    maxPlayers: Math.min(Math.max(maxPlayers, 2), 6),
    status: 'waiting',
    gameId: null,
    createdAt: Date.now(),
    players: [{ clientId, name: userName.trim() || 'GM', isGM: true, isReady: false }],
  }
  if (await pbAvailable()) {
    try {
      const pb = getPb()!
      await pb.collection('lobbies').create({
        code,
        name: lobby.name,
        gmId: lobby.gmId,
        maxPlayers: lobby.maxPlayers,
        status: 'waiting',
        gameId: '',
        players: lobby.players,
      })
      writeLobby(lobby)
      return lobby
    } catch {
      // fall through to local
    }
  }
  return localCreate(roomName, userName, maxPlayers)
}

export async function fetchLobbyPb(code: string): Promise<Lobby | null> {
  const rec = await findRecord(code)
  if (rec) {
    const lobby = toLobby(rec)
    writeLobby(lobby)
    return lobby
  }
  return readLobby(code.toUpperCase())
}

export async function joinLobbyPb(code: string, userName: string): Promise<Lobby | null> {
  const rec = await findRecord(code)
  if (!rec) return localJoin(code, userName)
  const pb = getPb()!
  const lobby = toLobby(rec)
  const clientId = getClientId()
  if (!lobby.players.find((p) => p.clientId === clientId)) {
    if (lobby.players.length >= lobby.maxPlayers) throw new Error('Lobby penuh.')
    lobby.players.push({
      clientId,
      name: userName.trim() || `Player ${lobby.players.length + 1}`,
      isGM: false,
      isReady: false,
    })
    await pb.collection('lobbies').update(rec.id, { players: lobby.players })
  }
  const fresh = await findRecord(code)
  const out = fresh ? toLobby(fresh) : lobby
  writeLobby(out)
  return out
}

export async function toggleReadyPb(code: string): Promise<Lobby | null> {
  const rec = await findRecord(code)
  if (!rec) return localToggle(code)
  const pb = getPb()!
  const me = getClientId()
  const players = toLobby(rec).players.map((p) =>
    p.clientId === me ? { ...p, isReady: !p.isReady } : p,
  )
  await pb.collection('lobbies').update(rec.id, { players })
  const fresh = await findRecord(code)
  const out = fresh ? toLobby(fresh) : null
  if (out) writeLobby(out)
  return out
}

export async function transferGMPb(code: string, toClientId: string): Promise<Lobby | null> {
  const rec = await findRecord(code)
  if (!rec) return localTransfer(code, toClientId)
  if (rec.gmId !== getClientId()) throw new Error('Hanya GM yang bisa transfer.')
  const pb = getPb()!
  const players = toLobby(rec).players.map((p) => ({ ...p, isGM: p.clientId === toClientId }))
  await pb.collection('lobbies').update(rec.id, { gmId: toClientId, players })
  const fresh = await findRecord(code)
  const out = fresh ? toLobby(fresh) : null
  if (out) writeLobby(out)
  return out
}

export async function startGamePb(code: string): Promise<Lobby | null> {
  const rec = await findRecord(code)
  if (!rec) return localStart(code)
  const lobby = toLobby(rec)
  if (lobby.gmId !== getClientId()) throw new Error('Hanya GM yang bisa start.')
  const readyAll =
    lobby.players.length >= 2 && lobby.players.every((p) => p.isReady)
  if (!readyAll) throw new Error('Belum semua Ready.')
  const pb = getPb()!
  const gameId = `g_${nanoid(8)}`
  await pb.collection('lobbies').update(rec.id, { status: 'playing', gameId })
  const fresh = await findRecord(code)
  const out = fresh ? toLobby(fresh) : { ...lobby, status: 'playing' as const, gameId }
  writeLobby(out)
  return out
}

/** Realtime subscribe via PB, fallback ke storage-event + polling. */
export function subscribeLobbyPb(code: string, onChange: (l: Lobby | null) => void) {
  let stop = false
  let unsubPb: (() => void) | null = null
  const upper = code.toUpperCase()

  ;(async () => {
    if (await pbAvailable()) {
      try {
        const pb = getPb()!
        const rec = await pb
          .collection('lobbies')
          .getFirstListItem<LobbyRecord>(`code = "${upper}"`)
        if (stop) return
        unsubPb = await pb.collection('lobbies').subscribe<LobbyRecord>(rec.id, (e) => {
          const lobby = toLobby(e.record)
          writeLobby(lobby)
          onChange(lobby)
        })
        return
      } catch {
        // fallback below
      }
    }
    if (stop) return
    const handler = (e: StorageEvent) => {
      if (e.key === `tc:lobby:${upper}`) onChange(readLobby(upper))
    }
    window.addEventListener('storage', handler)
    const iv = setInterval(() => {
      if (stop) {
        clearInterval(iv)
        window.removeEventListener('storage', handler)
        return
      }
      onChange(readLobby(upper))
    }, 2000)
    unsubPb = () => {
      clearInterval(iv)
      window.removeEventListener('storage', handler)
    }
  })()

  return () => {
    stop = true
    if (unsubPb) unsubPb()
  }
}
