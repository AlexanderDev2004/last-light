import { nanoid } from 'nanoid'
import { getPb, pbAvailable } from './pb'
import { readLobby } from './lobby-store'
import { fetchLobbyPb } from './lobby-store-pb'
import {
  initSession,
  readSession,
  writeSession,
  ensureSession as localEnsure,
  updateSession as localUpdate,
} from './session-store'
import type { GameSession } from './ten-candles'

interface SessionRecord {
  id: string
  gameId: string
  lobbyCode: string
  candlesLit: number
  ended: boolean
  players: GameSession['players']
  truths: GameSession['truths']
  log: string[]
}

function toSession(r: SessionRecord): GameSession {
  return {
    gameId: r.gameId,
    lobbyId: r.lobbyCode,
    candlesLit: r.candlesLit,
    truths: r.truths ?? [],
    players: r.players ?? [],
    log: r.log ?? [],
    ended: !!r.ended,
  }
}

async function findRecord(gameId: string, lobbyCode: string): Promise<SessionRecord | null> {
  const pb = getPb()
  if (!pb || !(await pbAvailable())) return null
  try {
    const rec = await pb
      .collection('game_sessions')
      .getFirstListItem<SessionRecord>(
        `gameId = "${gameId}" && lobbyCode = "${lobbyCode.toUpperCase()}"`,
      )
    return rec
  } catch {
    return null
  }
}

export async function ensureSessionPb(
  gameId: string,
  lobbyCode: string,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  const rec = await findRecord(gameId, upper)
  if (rec) {
    const s = toSession(rec)
    writeSession(s)
    return s
  }
  if (await pbAvailable()) {
    try {
      const lobby = (await fetchLobbyPb(upper)) ?? readLobby(upper)
      if (!lobby) return localEnsure(gameId, lobbyCode)
      const s = initSession(gameId, { ...lobby, id: upper })
      const pb = getPb()!
      await pb.collection('game_sessions').create({
        gameId,
        lobbyCode: upper,
        candlesLit: s.candlesLit,
        ended: false,
        players: s.players,
        truths: [],
        log: s.log,
      })
      writeSession(s)
      return s
    } catch {
      // fallback
    }
  }
  return localEnsure(gameId, lobbyCode)
}

export async function pushSessionPb(s: GameSession): Promise<GameSession> {
  writeSession(s)
  if (await pbAvailable()) {
    try {
      const pb = getPb()!
      const rec = await findRecord(s.gameId, s.lobbyId)
      if (rec) {
        await pb.collection('game_sessions').update(rec.id, {
          candlesLit: s.candlesLit,
          ended: s.ended,
          players: s.players,
          truths: s.truths,
          log: s.log.slice(-200),
        })
      }
    } catch {
      // offline — local copy already saved
    }
  }
  return s
}

export async function updateSessionPb(
  gameId: string,
  lobbyCode: string,
  fn: (s: GameSession) => GameSession,
): Promise<GameSession | null> {
  // toSession() hanya untuk record PocketBase (punya `lobbyCode`).
  // Objek GameSession lokal sudah berbentuk jadi (punya `lobbyId`) dan
  // TIDAK boleh dilewatkan ke toSession — dulu itu membuat lobbyId jadi
  // undefined lalu crash di writeSession (s.lobbyId.toUpperCase()).
  const rec = await findRecord(gameId, lobbyCode)
  if (rec) return pushSessionPb(fn(toSession(rec)))
  const start = readSession(gameId, lobbyCode) ?? (await ensureSessionPb(gameId, lobbyCode))
  if (!start) return localUpdate(gameId, lobbyCode, fn)
  return pushSessionPb(fn(start))
}

export async function extinguishCandlePb(gameId: string, lobbyCode: string) {
  return updateSessionPb(gameId, lobbyCode, (s) => {
    if (s.candlesLit <= 1) return s
    return {
      ...s,
      candlesLit: s.candlesLit - 1,
      log: [...s.log, `Lilin dipadamkan. Sisa ${s.candlesLit - 1}. Truths phase.`],
    }
  })
}

export async function addTruthPb(gameId: string, lobbyCode: string, author: string, text: string) {
  const entry = {
    id: `t_${nanoid(6)}`,
    candleLeft: readSession(gameId, lobbyCode)?.candlesLit ?? 0,
    author,
    text,
    at: Date.now(),
  }
  return updateSessionPb(gameId, lobbyCode, (s) => ({
    ...s,
    truths: [...s.truths, entry],
    log: [...s.log, `Truth oleh ${author}: ${text}`],
  }))
}

export function subscribeSessionPb(
  gameId: string,
  lobbyCode: string,
  onChange: (s: GameSession | null) => void,
) {
  let stop = false
  let unsub: (() => void) | null = null
  const upper = lobbyCode.toUpperCase()

  ;(async () => {
    if (await pbAvailable()) {
      try {
        const pb = getPb()!
        const rec = await pb
          .collection('game_sessions')
          .getFirstListItem<SessionRecord>(
            `gameId = "${gameId}" && lobbyCode = "${upper}"`,
          )
        if (stop) return
        unsub = await pb.collection('game_sessions').subscribe<SessionRecord>(rec.id, (e) => {
          const s = toSession(e.record)
          writeSession(s)
          onChange(s)
        })
        return
      } catch {
        // record may not exist yet — fall through to polling which picks it up
      }
    }
    if (stop) return
    const key = `tc:session:${upper}:${gameId}`
    const handler = (e: StorageEvent) => {
      if (e.key === key) onChange(readSession(gameId, lobbyCode))
    }
    window.addEventListener('storage', handler)
    const iv = setInterval(async () => {
      if (stop) {
        clearInterval(iv)
        window.removeEventListener('storage', handler)
        return
      }
      const rec = await findRecord(gameId, upper)
      onChange(rec ? toSession(rec) : readSession(gameId, lobbyCode))
    }, 2000)
    unsub = () => {
      clearInterval(iv)
      window.removeEventListener('storage', handler)
    }
  })()

  return () => {
    stop = true
    if (unsub) unsub()
  }
}
