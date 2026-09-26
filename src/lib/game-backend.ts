import { api } from '../rpc-client'
import type {
  LobbyView,
  SessionView,
} from '../backend/rpc.ts'
import { getClientId } from './lobby-store'
import {
  joinLobby as localJoin,
  readLobby,
  startGame as localStart,
  toggleReady as localToggle,
  transferGM as localTransfer,
  useLobbySync,
  writeLobby,
} from './lobby-store'
import {
  createLobbyPb,
  fetchLobbyPb,
  joinLobbyPb,
  startGamePb,
  subscribeLobbyPb,
  toggleReadyPb,
  transferGMPb,
} from './lobby-store-pb'
import { pbAvailable } from './pb'
import {
  p2pHello,
  p2pOnHello,
  p2pOnLobby,
  p2pOnSession,
  p2pSendLobby,
  p2pSendSession,
  p2pTotalPeers,
  p2pWaitLobby,
  p2pWaitSession,
} from './p2p'
import { ensureSession as localEnsure, readSession, useSessionSync, writeSession } from './session-store'
import {
  addTruthPb,
  ensureSessionPb,
  extinguishCandlePb,
  subscribeSessionPb,
  updateSessionPb,
} from './session-store-pb'
import type {
  GameSession,
  Lobby,
  PlayerCards,
  SessionPlayer,
} from './ten-candles'

export type BackendKind = 'effect' | 'pocketbase' | 'p2p' | 'lokal'

export function fxBackendUrl(): string {
  if (typeof import.meta !== 'undefined') {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_BACKEND_URL
    if (v) return v.replace(/\/$/, '')
  }
  return ''
}

function timeout<T>(p: Promise<T>, ms = 6000): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Backend timeout.')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        res(v)
      },
      (e) => {
        clearTimeout(t)
        rej(e)
      },
    )
  })
}

let fxCache: { at: number; ok: boolean } | null = null

export async function fxAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const base = fxBackendUrl()
  if (!base) return false
  if (fxCache && Date.now() - fxCache.at < 30_000) return fxCache.ok
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(`${base}/`, { method: 'GET', signal: ctrl.signal })
    clearTimeout(t)
    // Any HTTP answer (even 404/405 from the RPC server) = reachable.
    fxCache = { at: Date.now(), ok: res.status < 500 }
    return fxCache.ok
  } catch {
    fxCache = { at: Date.now(), ok: false }
    return false
  }
}

export async function backendStatus(): Promise<BackendKind> {
  if (await fxAvailable()) return 'effect'
  if (await pbAvailable()) return 'pocketbase'
  if (p2pTotalPeers() > 0) return 'p2p'
  return 'lokal'
}

export function fxErr(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null) {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string') return o.message
    if (typeof o._tag === 'string') return o._tag
  }
  return String(e)
}

// ---------- converters (Effect RPC views -> local shapes) ----------

function toLobby(v: LobbyView): Lobby {
  return {
    id: v.id,
    name: v.name,
    gmId: v.gmId,
    maxPlayers: v.maxPlayers,
    status: (v.status === 'playing' ? 'playing' : 'waiting') as Lobby['status'],
    gameId: v.gameId,
    createdAt: Date.now(),
    players: v.players.map((p) => ({
      clientId: p.clientId,
      name: p.name,
      isGM: p.isGm,
      isReady: p.isReady,
    })),
  }
}

function toCards(p: SessionView['players'][number]): PlayerCards {
  const c = p.cards
  return {
    virtue: c.virtue,
    vice: c.vice,
    moment: c.moment,
    brink: c.brink,
    burned: {
      virtue: c.burnedVirtue,
      vice: c.burnedVice,
      moment: c.burnedMoment,
      brink: c.burnedBrink,
    },
    hopeDie: c.hopeDie,
    alive: c.alive,
  }
}

function toSession(v: SessionView): GameSession {
  return {
    gameId: v.gameId,
    lobbyId: v.lobbyId,
    candlesLit: v.candlesLit,
    ended: v.ended,
    players: v.players.map((p) => ({
      clientId: p.clientId,
      name: p.name,
      isGM: p.isGm,
      isReady: true,
      cards: toCards(p),
    })),
    truths: v.truths.map((t) => ({
      id: t.id,
      candleLeft: t.candleLeft,
      author: t.author,
      text: t.text,
      at: Date.now(),
    })),
    log: [...v.log],
  }
}

// ---------- peer-to-peer merge ----------
// Single-writer rules keep merges convergent without a server:
// - each player record: owner stamps rev, higher rev wins;
// - lobby scalars (gm, status, game): keeper-only writes, higher lobby rev wins;
// - session scalars (candles, ended): keeper-only writes, higher session rev wins;
// - truths: union by id; log: ordered union, exact-string dedup.

export function mergeLobby(local: Lobby | null, remote: Lobby): Lobby {
  if (!local) return remote
  const players = new Map(local.players.map((p) => [p.clientId, { ...p }]))
  for (const rp of remote.players) {
    const lp = players.get(rp.clientId)
    if (!lp || (rp.rev ?? 0) >= (lp.rev ?? 0)) players.set(rp.clientId, { ...rp })
  }
  const takeRemote = (remote.rev ?? 0) >= (local.rev ?? 0)
  const base = takeRemote ? remote : local
  const merged: Lobby = { ...base, players: [...players.values()] }
  merged.players.forEach((p) => {
    p.isGM = p.clientId === merged.gmId
  })
  return merged
}

export function mergeSession(local: GameSession | null, remote: GameSession): GameSession {
  if (!local) return remote
  const players = new Map(local.players.map((p) => [p.clientId, p]))
  for (const rp of remote.players) {
    const lp = players.get(rp.clientId)
    if (!lp || (rp.rev ?? 0) >= (lp.rev ?? 0)) players.set(rp.clientId, rp)
  }
  const truthIds = new Set(local.truths.map((t) => t.id))
  const truths = [...local.truths, ...remote.truths.filter((t) => !truthIds.has(t.id))]
  const log = [...local.log]
  for (const line of remote.log) {
    if (!log.includes(line)) log.push(line)
  }
  const takeRemote = (remote.rev ?? 0) >= (local.rev ?? 0)
  return {
    gameId: local.gameId,
    lobbyId: local.lobbyId,
    candlesLit: takeRemote ? remote.candlesLit : local.candlesLit,
    ended: takeRemote ? remote.ended : local.ended,
    rev: takeRemote ? (remote.rev ?? 0) : (local.rev ?? 0),
    players: [...players.values()],
    truths,
    log: log.slice(-200),
  }
}

function applyRemoteLobby(code: string, remote: Lobby): Lobby {
  const merged = mergeLobby(readLobby(code), remote)
  writeLobby(merged)
  return merged
}

function applyRemoteSession(gameId: string, code: string, remote: GameSession): GameSession {
  const merged = mergeSession(readSession(gameId, code), remote)
  writeSession(merged)
  return merged
}

async function broadcastLobby(code: string, lobby: Lobby, bumpScalars: boolean): Promise<Lobby> {
  const upper = code.toUpperCase()
  const me = getClientId()
  const now = Date.now()
  const out: Lobby = {
    ...lobby,
    rev: bumpScalars ? now : (lobby.rev ?? 0),
    players: lobby.players.map((p) => (p.clientId === me ? { ...p, rev: now } : p)),
  }
  writeLobby(out)
  await p2pSendLobby(upper, out.rev ?? 0, out)
  return out
}

async function broadcastSession(
  code: string,
  session: GameSession,
  bumpScalars: boolean,
): Promise<GameSession> {
  const upper = code.toUpperCase()
  const me = getClientId()
  const now = Date.now()
  const out: GameSession = {
    ...session,
    rev: bumpScalars ? now : (session.rev ?? 0),
    players: session.players.map((p) => (p.clientId === me ? { ...p, rev: now } : p)),
  }
  writeSession(out)
  await p2pSendSession(upper, out.rev ?? 0, out)
  return out
}

function requireKeeper(lobbyCode: string): void {
  const lobby = readLobby(lobbyCode.toUpperCase())
  if (!lobby || lobby.gmId !== getClientId()) {
    throw new Error('Only the keeper may do that.')
  }
}

// ---------- lobby ----------

export async function createLobbyX(
  roomName: string,
  userName: string,
  maxPlayers = 5,
): Promise<Lobby> {
  if (await fxAvailable()) {
    try {
      const v = await timeout(
        api.createLobby({ roomName, userName, clientId: getClientId(), maxPlayers }),
      )
      return toLobby(v)
    } catch (e) {
      throw new Error(fxErr(e))
    }
  }
  const out = await createLobbyPb(roomName, userName, maxPlayers)
  if (!(await pbAvailable())) {
    return broadcastLobby(out.id, out, true)
  }
  return out
}

export async function fetchLobbyX(code: string): Promise<Lobby | null> {
  const upper = code.trim().toUpperCase()
  if (await fxAvailable()) {
    try {
      return toLobby(await timeout(api.getLobby({ lobbyId: upper })))
    } catch {
      // fall through to PB/local
    }
  }
  if (await pbAvailable()) {
    return fetchLobbyPb(upper)
  }
  // Peer-to-peer: answer from local cache at once so solo play stays instant;
  // wait briefly for the network only when nothing is known locally.
  const local = readLobby(upper)
  void p2pHello(upper, getClientId(), null)
  if (local) return local
  const heard = await p2pWaitLobby(upper, 8000)
  return heard ? applyRemoteLobby(upper, heard.lobby) : null
}

export async function joinLobbyX(code: string, userName: string): Promise<Lobby | null> {
  const upper = code.trim().toUpperCase()
  if (await fxAvailable()) {
    try {
      const v = await timeout(
        api.joinLobby({ lobbyId: upper, userName, clientId: getClientId() }),
      )
      return toLobby(v)
    } catch (e) {
      const msg = fxErr(e)
      if (msg === 'LobbyNotFound') return joinLobbyPb(upper, userName)
      throw new Error(msg)
    }
  }
  if (await pbAvailable()) {
    return joinLobbyPb(upper, userName)
  }
  // Peer-to-peer: joining needs the current roster, so wait for it.
  void p2pHello(upper, getClientId(), null)
  const heard = await p2pWaitLobby(upper, 9000)
  const base = heard ? applyRemoteLobby(upper, heard.lobby) : readLobby(upper)
  if (!base) {
    throw new Error(
      'No one answers to that code. The keeper’s tab must be open for rooms to travel.',
    )
  }
  const out = localJoin(upper, userName)
  if (!out) throw new Error('This room is full.')
  return broadcastLobby(upper, out, false)
}

export async function toggleReadyX(code: string): Promise<Lobby | null> {
  const upper = code.trim().toUpperCase()
  if (await fxAvailable()) {
    try {
      return toLobby(
        await timeout(api.toggleReady({ lobbyId: upper, clientId: getClientId() })),
      )
    } catch {
      // fall through
    }
  }
  if (await pbAvailable()) {
    return toggleReadyPb(upper)
  }
  const out = localToggle(upper)
  if (out) return broadcastLobby(upper, out, false)
  return out
}

export async function transferGMX(code: string, toClientId: string): Promise<Lobby | null> {
  const upper = code.trim().toUpperCase()
  if (await fxAvailable()) {
    try {
      return toLobby(
        await timeout(
          api.transferGM({ lobbyId: upper, clientId: getClientId(), toClientId }),
        ),
      )
    } catch (e) {
      throw new Error(fxErr(e))
    }
  }
  if (await pbAvailable()) {
    return transferGMPb(upper, toClientId)
  }
  const out = localTransfer(upper, toClientId)
  if (out) return broadcastLobby(upper, out, true)
  return out
}

export async function startGameX(code: string): Promise<Lobby | null> {
  const upper = code.trim().toUpperCase()
  if (await fxAvailable()) {
    try {
      return toLobby(
        await timeout(api.startGame({ lobbyId: upper, clientId: getClientId() })),
      )
    } catch (e) {
      throw new Error(fxErr(e))
    }
  }
  if (await pbAvailable()) {
    return startGamePb(upper)
  }
  const out = localStart(upper)
  if (out?.gameId) {
    const s = localEnsure(out.gameId, upper)
    if (s) await broadcastSession(upper, { ...s, rev: Date.now() }, true)
    return broadcastLobby(upper, out, true)
  }
  return out
}

export function subscribeLobbyX(code: string, onChange: (l: Lobby | null) => void) {
  const upper = code.toUpperCase()
  let stop = false
  let cleanup: (() => void) | null = null
  const cleanups: Array<() => void> = []
  ;(async () => {
    if (await fxAvailable()) {
      if (stop) return
      const tick = async () => {
        if (stop) return
        try {
          onChange(toLobby(await api.getLobby({ lobbyId: upper })))
        } catch {
          onChange(readLobby(upper))
        }
      }
      await tick()
      const iv = setInterval(tick, 2500)
      cleanup = () => clearInterval(iv)
      return
    }
    if (await pbAvailable()) {
      if (stop) return
      cleanup = subscribeLobbyPb(upper, onChange)
    }
    if (stop) return
    // Peer-to-peer layer: merge arrivals, answer hellos, keep a heartbeat.
    cleanups.push(
      p2pOnLobby(upper, (m) => {
        if (stop) return
        onChange(applyRemoteLobby(upper, m.lobby))
      }),
      p2pOnHello(upper, () => {
        if (stop) return
        const l = readLobby(upper)
        if (l) void broadcastLobby(upper, l, false)
      }),
    )
    void p2pHello(upper, getClientId(), null)
    const beat = setInterval(() => {
      if (stop) {
        clearInterval(beat)
        return
      }
      void p2pHello(upper, getClientId(), null)
    }, 20000)
    cleanups.push(() => clearInterval(beat))
  })()
  const offLocal = useLobbySync(upper, () => {})
  return () => {
    stop = true
    if (cleanup) cleanup()
    cleanups.forEach((fn) => fn())
    offLocal()
  }
}

// ---------- session ----------

export async function ensureSessionX(
  gameId: string,
  lobbyCode: string,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  if (await fxAvailable()) {
    try {
      return toSession(await timeout(api.getSession({ gameId, lobbyId: upper })))
    } catch {
      return null
    }
  }
  if (await pbAvailable()) {
    return ensureSessionPb(gameId, lobbyCode)
  }
  const local = await ensureSessionPb(gameId, lobbyCode)
  void p2pHello(upper, getClientId(), gameId)
  const heard = await p2pWaitSession(upper, gameId, 7000)
  if (heard) return applyRemoteSession(gameId, upper, heard.session)
  return local
}

export async function savePlayerCardsX(
  gameId: string,
  lobbyCode: string,
  player: SessionPlayer,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  if (await fxAvailable()) {
    try {
      const c = player.cards
      const v = await timeout(
        api.updateCards({
          gameId,
          lobbyId: upper,
          clientId: player.clientId,
          cards: {
            virtue: c.virtue,
            vice: c.vice,
            moment: c.moment,
            brink: c.brink,
            burnedVirtue: c.burned.virtue,
            burnedVice: c.burned.vice,
            burnedMoment: c.burned.moment,
            burnedBrink: c.burned.brink,
            hopeDie: c.hopeDie,
            alive: c.alive,
          },
        }),
      )
      return toSession(v)
    } catch {
      // fall through
    }
  }
  if (await pbAvailable()) {
    return updateSessionPb(gameId, lobbyCode, (s) => ({
      ...s,
      players: s.players.map((p) => (p.clientId === player.clientId ? player : p)),
    }))
  }
  const out = await updateSessionPb(gameId, lobbyCode, (s) => ({
    ...s,
    players: s.players.map((p) => (p.clientId === player.clientId ? player : p)),
  }))
  if (out) return broadcastSession(upper, out, false)
  return out
}

export async function extinguishCandleX(
  gameId: string,
  lobbyCode: string,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  if (await fxAvailable()) {
    try {
      return toSession(
        await timeout(
          api.extinguishCandle({ gameId, lobbyId: upper, clientId: getClientId() }),
        ),
      )
    } catch {
      // fall through
    }
  }
  if (await pbAvailable()) {
    return extinguishCandlePb(gameId, lobbyCode)
  }
  requireKeeper(upper)
  const out = await extinguishCandlePb(gameId, lobbyCode)
  if (out) return broadcastSession(upper, out, true)
  return out
}

export async function addTruthX(
  gameId: string,
  lobbyCode: string,
  author: string,
  text: string,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  if (await fxAvailable()) {
    try {
      await timeout(api.addTruth({ gameId, lobbyId: upper, author, text }))
      return toSession(await api.getSession({ gameId, lobbyId: upper }))
    } catch (e) {
      throw new Error(fxErr(e))
    }
  }
  if (await pbAvailable()) {
    return addTruthPb(gameId, lobbyCode, author, text)
  }
  const out = await addTruthPb(gameId, lobbyCode, author, text)
  if (out) return broadcastSession(upper, out, false)
  return out
}

export async function endGameX(
  gameId: string,
  lobbyCode: string,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  if (await fxAvailable()) {
    try {
      return toSession(
        await timeout(api.endGame({ gameId, lobbyId: upper, clientId: getClientId() })),
      )
    } catch {
      // fall through
    }
  }
  if (await pbAvailable()) {
    return updateSessionPb(gameId, lobbyCode, (s) => ({
      ...s,
      candlesLit: 0,
      ended: true,
      log: [...s.log, 'These things are true. The world is dark.'],
    }))
  }
  requireKeeper(upper)
  const out = await updateSessionPb(gameId, lobbyCode, (s) => ({
    ...s,
    candlesLit: 0,
    ended: true,
    log: [...s.log, 'These things are true. The world is dark.'],
  }))
  if (out) return broadcastSession(upper, out, true)
  return out
}

export async function resetSessionX(
  gameId: string,
  lobbyCode: string,
): Promise<GameSession | null> {
  const upper = lobbyCode.toUpperCase()
  if (await fxAvailable()) {
    try {
      return toSession(
        await timeout(
          api.resetSession({ gameId, lobbyId: upper, clientId: getClientId() }),
        ),
      )
    } catch {
      // fall through
    }
  }
  if (await pbAvailable()) {
    return updateSessionPb(gameId, lobbyCode, (s) => ({
      ...s,
      candlesLit: 10,
      ended: false,
      log: [...s.log, 'Sesi di-reset GM. 10 lilin menyala kembali.'],
    }))
  }
  requireKeeper(upper)
  const out = await updateSessionPb(gameId, lobbyCode, (s) => ({
    ...s,
    candlesLit: 10,
    ended: false,
    log: [...s.log, 'The night begins over. Ten candles burn again.'],
  }))
  if (out) return broadcastSession(upper, out, true)
  return out
}

export function subscribeSessionX(
  gameId: string,
  lobbyCode: string,
  onChange: (s: GameSession | null) => void,
) {
  const upper = lobbyCode.toUpperCase()
  let stop = false
  let cleanup: (() => void) | null = null
  const cleanups: Array<() => void> = []
  ;(async () => {
    if (await fxAvailable()) {
      if (stop) return
      const tick = async () => {
        if (stop) return
        try {
          onChange(toSession(await api.getSession({ gameId, lobbyId: upper })))
        } catch {
          // keep last state
        }
      }
      await tick()
      const iv = setInterval(tick, 2500)
      cleanup = () => clearInterval(iv)
      return
    }
    if (await pbAvailable()) {
      if (stop) return
      cleanup = subscribeSessionPb(gameId, lobbyCode, onChange)
    }
    if (stop) return
    cleanups.push(
      p2pOnSession(upper, (m) => {
        if (stop || m.session?.gameId !== gameId) return
        onChange(applyRemoteSession(gameId, upper, m.session))
      }),
      p2pOnHello(upper, (m) => {
        if (stop) return
        if (m.wantGame && m.wantGame !== gameId) return
        const s = readSession(gameId, upper)
        if (s) void broadcastSession(upper, s, false)
      }),
    )
    void p2pHello(upper, getClientId(), gameId)
    const beat = setInterval(() => {
      if (stop) {
        clearInterval(beat)
        return
      }
      void p2pHello(upper, getClientId(), gameId)
    }, 20000)
    cleanups.push(() => clearInterval(beat))
  })()
  const offLocal = useSessionSync(gameId, lobbyCode, () => {})
  return () => {
    stop = true
    if (cleanup) cleanup()
    cleanups.forEach((fn) => fn())
    offLocal()
  }
}
