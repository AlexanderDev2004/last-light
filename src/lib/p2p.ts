import type { GameSession, Lobby } from './ten-candles'

/**
 * Serverless transport over WebRTC (Trystero). Each room joins two
 * independent signaling swarms — BitTorrent trackers and Nostr relays —
 * and whichever connects first wins. Rooms live as long as at least one
 * browser tab keeps them open: no account, no server, nothing to deploy.
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

export const TRACKER_URLS: string[] = [...RELAY_URLS]

// Nostr relays used as a second, independent signaling swarm. Verified
// reachable 2026-09-27 (relay.mostr.pub was dead and is excluded). Nostr
// infrastructure is unrelated to torrent trackers, so ad-blockers and
// networks that filter one family usually still pass the other.
const NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://purplerelay.com',
  'wss://strfry.shock.network',
  'wss://yabu.me/v2',
  'wss://relay.snort.social',
]

export const NOSTR_RELAY_URLS: string[] = [...NOSTR_RELAYS]

/** Every signaling endpoint the direct link depends on. */
export const SIGNAL_URLS: string[] = [...RELAY_URLS, ...NOSTR_RELAYS]

export interface RelayProbe {
  url: string
  open: boolean
  ms: number
}

/**
 * Test raw WebSocket reachability from THIS browser. This is the ground
 * truth for peer discovery: if none open here, no swarm can connect no
 * matter which library or tracker list is used.
 */
export function probeRelays(urls: string[] = SIGNAL_URLS, timeoutMs = 6000): Promise<RelayProbe[]> {
  if (typeof window === 'undefined') return Promise.resolve([])
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<RelayProbe>((resolve) => {
          const t0 = performance.now()
          let done = false
          const finish = (open: boolean) => {
            if (done) return
            done = true
            clearTimeout(timer)
            try {
              ws.close()
            } catch {
              // ignore
            }
            resolve({ url, open, ms: Math.round(performance.now() - t0) })
          }
          let ws: WebSocket
          try {
            ws = new WebSocket(url)
          } catch {
            finish(false)
            return
          }
          const timer = setTimeout(() => finish(false), timeoutMs)
          ws.onopen = () => finish(true)
          ws.onerror = () => finish(false)
        }),
    ),
  )
}

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
  joinListeners: Set<(peerId: string) => void>
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
      // Two independent signaling swarms run in parallel: BitTorrent
      // trackers and Nostr relays. Whichever connects first wins; merges are
      // idempotent so duplicates are harmless. Either swarm alone suffices.
      type Wire = {
        sendLobby: (data: P2PLobbyMsg) => Promise<unknown>
        sendSession: (data: P2PSessionMsg) => Promise<unknown>
        sendHello: (data: P2PHelloMsg) => Promise<unknown>
        leave: () => void
      }
      const wires: Wire[] = []

      const handle: RoomHandle = {
        code: upper,
        sendLobby: (data) => {
          return Promise.allSettled(wires.map((w) => w.sendLobby(data))).then(() => {})
        },
        sendSession: (data) => {
          return Promise.allSettled(wires.map((w) => w.sendSession(data))).then(() => {})
        },
        sendHello: (data) => {
          return Promise.allSettled(wires.map((w) => w.sendHello(data))).then(() => {})
        },
        lobbyListeners: new Set(),
        sessionListeners: new Set(),
        helloListeners: new Set(),
        peerListeners: new Set(),
        joinListeners: new Set(),
        peers: new Set(),
        closed: false,
        leave: () => {
          handle.closed = true
          rooms.delete(upper)
          peerTotals.delete(upper)
          wires.forEach((w) => {
            try {
              w.leave()
            } catch {
              // ignore
            }
          })
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

      const noteJoin = (peerId: string) => {
        if (handle.closed) return
        const first = !handle.peers.has(peerId)
        handle.peers.add(peerId)
        emitPeers()
        if (first) console.debug(`[p2p] peer joined ${upper}: ${peerId} (${handle.peers.size} total)`)
        handle.joinListeners.forEach((cb) => {
          try {
            cb(peerId)
          } catch {
            // ignore
          }
        })
      }

      const noteLeave = (peerId: string) => {
        handle.peers.delete(peerId)
        emitPeers()
      }

      const dispatch = <T>(set: Set<(m: T) => void>, m: T) => {
        set.forEach((cb) => {
          try {
            cb(m)
          } catch {
            // ignore
          }
        })
      }

      async function wireTorrent(): Promise<void> {
        const { joinRoom } = await import('@trystero-p2p/torrent')
        const room = joinRoom(
          {
            appId: APP_ID,
            relayConfig: { urls: RELAY_URLS, redundancy: RELAY_URLS.length },
          },
          `room-${upper}`,
        )
        // Object-style actions (v0.25). Wire types are plain JSON; the
        // `as never` casts sit at this single boundary because our domain
        // interfaces carry no index signatures.
        const lobbyAct = room.makeAction('tc-lobby')
        const sessionAct = room.makeAction('tc-session')
        const helloAct = room.makeAction('tc-hello')
        lobbyAct.onMessage = (data) => {
          const m = data as unknown as P2PLobbyMsg
          if (!handle.closed && m?.kind === 'tc-lobby-v1') dispatch(handle.lobbyListeners, m)
        }
        sessionAct.onMessage = (data) => {
          const m = data as unknown as P2PSessionMsg
          if (!handle.closed && m?.kind === 'tc-session-v1') dispatch(handle.sessionListeners, m)
        }
        helloAct.onMessage = (data) => {
          const m = data as unknown as P2PHelloMsg
          if (!handle.closed && m?.kind === 'tc-hello-v1') dispatch(handle.helloListeners, m)
        }
        room.onPeerJoin = (id: string) => noteJoin(`torrent:${id}`)
        room.onPeerLeave = (id: string) => noteLeave(`torrent:${id}`)
        try {
          Object.keys(room.getPeers()).forEach((id) => handle.peers.add(`torrent:${id}`))
        } catch {
          // ignore
        }
        wires.push({
          sendLobby: (data) => lobbyAct.send(data as never),
          sendSession: (data) => sessionAct.send(data as never),
          sendHello: (data) => helloAct.send(data as never),
          leave: () => void room.leave().catch(() => {}),
        })
      }

      async function wireNostr(): Promise<void> {
        const { joinRoom } = await import('@trystero-p2p/nostr')
        const room = joinRoom(
          {
            appId: APP_ID,
            relayConfig: { urls: NOSTR_RELAYS, redundancy: NOSTR_RELAYS.length },
          },
          `room-${upper}`,
        )
        const lobbyAct = room.makeAction('tc-lobby')
        const sessionAct = room.makeAction('tc-session')
        const helloAct = room.makeAction('tc-hello')
        lobbyAct.onMessage = (data) => {
          const m = data as unknown as P2PLobbyMsg
          if (!handle.closed && m?.kind === 'tc-lobby-v1') dispatch(handle.lobbyListeners, m)
        }
        sessionAct.onMessage = (data) => {
          const m = data as unknown as P2PSessionMsg
          if (!handle.closed && m?.kind === 'tc-session-v1') dispatch(handle.sessionListeners, m)
        }
        helloAct.onMessage = (data) => {
          const m = data as unknown as P2PHelloMsg
          if (!handle.closed && m?.kind === 'tc-hello-v1') dispatch(handle.helloListeners, m)
        }
        room.onPeerJoin = (id: string) => noteJoin(`nostr:${id}`)
        room.onPeerLeave = (id: string) => noteLeave(`nostr:${id}`)
        try {
          Object.keys(room.getPeers()).forEach((id) => handle.peers.add(`nostr:${id}`))
        } catch {
          // ignore
        }
        wires.push({
          sendLobby: (data) => lobbyAct.send(data as never),
          sendSession: (data) => sessionAct.send(data as never),
          sendHello: (data) => helloAct.send(data as never),
          leave: () => void room.leave().catch(() => {}),
        })
      }

      const settled = await Promise.allSettled([wireTorrent(), wireNostr()])
      if (wires.length === 0) {
        rooms.delete(upper)
        for (const s of settled) {
          if (s.status === 'rejected') console.debug('[p2p] swarm failed:', s.reason)
        }
        return null
      }
      console.debug(`[p2p] room ${upper}: ${wires.length}/2 swarms wired`)
      return handle
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

/**
 * Fires whenever a remote peer connects. This is the moment a handshake
 * must happen: state sent earlier lands nowhere, because at send time no
 * peer was attached yet.
 */
export function p2pOnPeerJoin(code: string, cb: (peerId: string) => void): () => void {
  const upper = code.toUpperCase()
  let off: (() => void) | null = null
  let cancelled = false
  void ensureRoom(upper).then((h) => {
    if (cancelled || !h) return
    for (const id of h.peers) {
      try {
        cb(id)
      } catch {
        // ignore
      }
    }
    off = sub(h.joinListeners, cb)
  })
  return () => {
    cancelled = true
    if (off) off()
  }
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
