import type { GameSession, Lobby } from './ten-candles'

/**
 * Serverless transport over WebRTC (Trystero, BitTorrent trackers).
 * Rooms live as long as at least one browser tab keeps them open —
 * no account, no server, nothing to deploy.
 */

const APP_ID = 'last-light-ten-candles-v1'

// Public WebSocket trackers used for peer discovery. Verified reachable
// 2026-09-27 (btorrent.xyz, files.fm, fastcast.nz, qu.ax were dead and are
// deliberately excluded so discovery never waits on them). Note: tracker
// domains are torrent infrastructure — some ad-blockers and office networks
// block them, which breaks discovery entirely (see the lobby empty state).
const RELAY_URLS = [
  'wss://open.ftorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
]

export interface P2PLobbyMsg {
  kind: 'tc-lobby-v1'
  rev: number
  lobby: Lobby
}

export interface P2PSessionMsg {
  kind: 'tc-session-v1'
  rev: number
  session: GameSession
}

export interface P2PHelloMsg {
  kind: 'tc-hello-v1'
  from: string
  wantGame: string | null
}

interface RoomHandle {
  code: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendLobby: (data: any, target?: any) => Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendSession: (data: any, target?: any) => Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendHello: (data: any, target?: any) => Promise<unknown>
  lobbyListeners: Set<(m: P2PLobbyMsg) => void>
  sessionListeners: Set<(m: P2PSessionMsg) => void>
  helloListeners: Set<(m: P2PHelloMsg) => void>
  peerListeners: Set<(n: number) => void>
  peers: Set<string>
  leave: () => void
  closed: boolean
}

const rooms = new Map<string, Promise<RoomHandle | null>>()
const peerTotals = new Map<string, number>()

/** Total peers across all joined rooms (for link-status display). */
export function p2pTotalPeers(): number {
  let n = 0
  peerTotals.forEach((v) => {
    n += v
  })
  return n
}

async function ensureRoom(code: string): Promise<RoomHandle | null> {
  if (typeof window === 'undefined') return null
  const upper = code.toUpperCase()
  let pending = rooms.get(upper)
  if (!pending) {
    pending = (async (): Promise<RoomHandle | null> => {
      try {
        const { joinRoom } = await import('@trystero-p2p/torrent')
        const room = joinRoom(
          {
            appId: APP_ID,
            relayConfig: { urls: RELAY_URLS, redundancy: RELAY_URLS.length },
          },
          `room-${upper}`,
        )
        // Object-style actions (v0.25). Wire types are plain JSON; the
        // `as never` casts below sit at this single boundary because our
        // domain interfaces carry no index signatures.
        const lobbyAct = room.makeAction('tc-lobby')
        const sessionAct = room.makeAction('tc-session')
        const helloAct = room.makeAction('tc-hello')

        const handle: RoomHandle = {
          code: upper,
          sendLobby: (data) => lobbyAct.send(data as never),
          sendSession: (data) => sessionAct.send(data as never),
          sendHello: (data) => helloAct.send(data as never),
          lobbyListeners: new Set(),
          sessionListeners: new Set(),
          helloListeners: new Set(),
          peerListeners: new Set(),
          peers: new Set(),
          closed: false,
          leave: () => {
            handle.closed = true
            rooms.delete(upper)
            peerTotals.delete(upper)
            void room.leave().catch(() => {})
          },
        }

        const emitPeers = () => {
          const n = handle.peers.size
          peerTotals.set(upper, n)
          handle.peerListeners.forEach((cb) => {
            try {
              cb(n)
            } catch {
              // listener error must not break the room
            }
          })
        }

        // Register receivers. The wire payload is validated by kind, then
        // narrowed to our message shapes.
        lobbyAct.onMessage = (data) => {
          const m = data as unknown as P2PLobbyMsg
          if (handle.closed || m?.kind !== 'tc-lobby-v1') return
          handle.lobbyListeners.forEach((cb) => {
            try {
              cb(m)
            } catch {
              // ignore
            }
          })
        }
        sessionAct.onMessage = (data) => {
          const m = data as unknown as P2PSessionMsg
          if (handle.closed || m?.kind !== 'tc-session-v1') return
          handle.sessionListeners.forEach((cb) => {
            try {
              cb(m)
            } catch {
              // ignore
            }
          })
        }
        helloAct.onMessage = (data) => {
          const m = data as unknown as P2PHelloMsg
          if (handle.closed || m?.kind !== 'tc-hello-v1') return
          handle.helloListeners.forEach((cb) => {
            try {
              cb(m)
            } catch {
              // ignore
            }
          })
        }

        room.onPeerJoin = (peerId: string) => {
          if (handle.closed) return
          handle.peers.add(peerId)
          emitPeers()
        }
        room.onPeerLeave = (peerId: string) => {
          handle.peers.delete(peerId)
          emitPeers()
        }
        // Seed with currently connected peers (joined before handlers attached).
        try {
          Object.keys(room.getPeers()).forEach((id) => handle.peers.add(id))
        } catch {
          // ignore
        }
        return handle
      } catch {
        rooms.delete(upper)
        return null
      }
    })()
    rooms.set(upper, pending)
  }
  return pending
}

function sub<T>(set: Set<(m: T) => void>, cb: (m: T) => void): () => void {
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

export async function p2pSendLobby(code: string, rev: number, lobby: Lobby): Promise<void> {
  const h = await ensureRoom(code)
  if (!h) return
  try {
    await h.sendLobby({ kind: 'tc-lobby-v1', rev, lobby })
  } catch {
    // offline — local copy already saved by the caller
  }
}

export async function p2pSendSession(code: string, rev: number, session: GameSession): Promise<void> {
  const h = await ensureRoom(code)
  if (!h) return
  try {
    await h.sendSession({ kind: 'tc-session-v1', rev, session })
  } catch {
    // offline — local copy already saved by the caller
  }
}

export async function p2pHello(code: string, from: string, wantGame: string | null): Promise<void> {
  const h = await ensureRoom(code)
  if (!h) return
  try {
    await h.sendHello({ kind: 'tc-hello-v1', from, wantGame })
  } catch {
    // ignore
  }
}

export function p2pOnLobby(code: string, cb: (m: P2PLobbyMsg) => void): () => void {
  const upper = code.toUpperCase()
  let off: (() => void) | null = null
  let cancelled = false
  void ensureRoom(upper).then((h) => {
    if (cancelled || !h) return
    off = sub(h.lobbyListeners, cb)
  })
  return () => {
    cancelled = true
    if (off) off()
  }
}

export function p2pOnSession(code: string, cb: (m: P2PSessionMsg) => void): () => void {
  const upper = code.toUpperCase()
  let off: (() => void) | null = null
  let cancelled = false
  void ensureRoom(upper).then((h) => {
    if (cancelled || !h) return
    off = sub(h.sessionListeners, cb)
  })
  return () => {
    cancelled = true
    if (off) off()
  }
}

export function p2pOnHello(code: string, cb: (m: P2PHelloMsg) => void): () => void {
  const upper = code.toUpperCase()
  let off: (() => void) | null = null
  let cancelled = false
  void ensureRoom(upper).then((h) => {
    if (cancelled || !h) return
    off = sub(h.helloListeners, cb)
  })
  return () => {
    cancelled = true
    if (off) off()
  }
}

export function p2pOnPeers(code: string, cb: (n: number) => void): () => void {
  const upper = code.toUpperCase()
  let off: (() => void) | null = null
  let cancelled = false
  void ensureRoom(upper).then((h) => {
    if (cancelled || !h) return
    cb(h.peers.size)
    const wrapped = (n: number) => cb(n)
    h.peerListeners.add(wrapped)
    off = () => {
      h.peerListeners.delete(wrapped)
    }
  })
  return () => {
    cancelled = true
    if (off) off()
  }
}

export async function p2pPeerCount(code: string): Promise<number> {
  const h = await ensureRoom(code)
  return h ? h.peers.size : 0
}

/** Resolve with the first lobby state heard, or null on timeout. */
export function p2pWaitLobby(code: string, ms = 9000): Promise<P2PLobbyMsg | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: P2PLobbyMsg | null) => {
      if (done) return
      done = true
      clearTimeout(t)
      off()
      resolve(v)
    }
    const off = p2pOnLobby(code, (m) => finish(m))
    const t = setTimeout(() => finish(null), ms)
  })
}

/** Resolve with the first matching session heard, or null on timeout. */
export function p2pWaitSession(code: string, gameId: string, ms = 9000): Promise<P2PSessionMsg | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: P2PSessionMsg | null) => {
      if (done) return
      done = true
      clearTimeout(t)
      off()
      resolve(v)
    }
    const off = p2pOnSession(code, (m) => {
      if (m.session?.gameId === gameId) finish(m)
    })
    const t = setTimeout(() => finish(null), ms)
  })
}

export function p2pLeave(code: string) {
  const upper = code.toUpperCase()
  const pending = rooms.get(upper)
  if (!pending) return
  rooms.delete(upper)
  void pending.then((h) => h?.leave())
}
