import type { Room } from '../game/types'

/**
 * The room transport: WebRTC over Trystero, no server. Every room joins two
 * independent signaling swarms — BitTorrent trackers and Nostr relays — and
 * whichever connects first wins (merges are idempotent, so duplicates are
 * harmless; either swarm alone suffices). A room lives as long as the host's
 * tab stays open: no account, no deploy, nothing to run.
 *
 * Relay lists are ported from the pre-rewrite `p2p.ts` (branch
 * `backup/pre-rewrite-homebrew`) with their verification notes intact.
 */

const APP_ID = 'last-light-ten-candles-v1'

// Public WebSocket trackers used for peer discovery. Verified reachable
// 2026-09-27 (btorrent.xyz, files.fm, fastcast.nz, qu.ax were dead and are
// deliberately excluded so discovery never waits on them). Note: tracker
// domains are torrent infrastructure — some ad-blockers and office networks
// block them, which breaks discovery entirely.
const RELAY_URLS = ['wss://open.ftorrent.com', 'wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com']

// Nostr relays used as a second, independent signaling swarm. Verified
// reachable 2026-09-27 (relay.mostr.pub was dead and is excluded;
// yabu.me/v2 dropped 2026-09-27 after repeated connection failures,
// replaced by relay.damus.io — consistently top-ranked public relay).
// Nostr infrastructure is unrelated to torrent trackers, so ad-blockers
// and networks that filter one family usually still pass the other.
const NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://purplerelay.com',
  'wss://strfry.shock.network',
  'wss://relay.snort.social',
]

/** What members send the host; the host validates and spreads the new state. */
export type RoomWireAction =
  | { kind: 'join'; token: string; name: string }
  | { kind: 'rename'; token: string; name: string }
  | { kind: 'leave'; token: string }
  | { kind: 'hello'; token: string }

/** The host's authoritative room, broadcast on every change. */
export interface RoomWireState {
  kind: 'state'
  room: Room
}

export interface RoomNet {
  /** Anyone may speak; the host decides what counts. */
  sendAction(action: RoomWireAction): void
  /** The host's broadcast — guests apply it as-is. */
  sendState(room: Room): void
  onAction(cb: (action: RoomWireAction, fromWireId: string) => void): () => void
  onState(cb: (state: RoomWireState) => void): () => void
  /** Fires per swarm: one physical peer can appear on both swarms. */
  onPeerJoin(cb: (wireId: string) => void): () => void
  onPeerLeave(cb: (wireId: string) => void): () => void
  close(): void
}

interface Swarm {
  sendAction(data: RoomWireAction): void
  sendState(data: RoomWireState): void
  leave(): void
}

export async function openRoomNet(code: string): Promise<RoomNet | null> {
  if (typeof window === 'undefined') return null
  const topic = `${APP_ID}-${code.toUpperCase()}`

  const wires: Swarm[] = []
  const actionListeners = new Set<(a: RoomWireAction, from: string) => void>()
  const stateListeners = new Set<(s: RoomWireState) => void>()
  const joinListeners = new Set<(wireId: string) => void>()
  const leaveListeners = new Set<(wireId: string) => void>()
  let closed = false

  const emit = <T>(set: Set<(v: T) => void>, value: T) => {
    for (const cb of set) {
      try {
        cb(value)
      } catch {
        // a broken listener must not break the room
      }
    }
  }

  async function wireTorrent(): Promise<void> {
    const { joinRoom } = await import('@trystero-p2p/torrent')
    const room = joinRoom({ appId: APP_ID, relayConfig: { urls: RELAY_URLS, redundancy: RELAY_URLS.length } }, topic)
    wires.push(wire(room, 'torrent:'))
  }

  async function wireNostr(): Promise<void> {
    const { joinRoom } = await import('@trystero-p2p/nostr')
    const room = joinRoom({ appId: APP_ID, relayConfig: { urls: NOSTR_RELAYS, redundancy: NOSTR_RELAYS.length } }, topic)
    wires.push(wire(room, 'nostr:'))
  }

  function wire(rawRoom: unknown, prefix: string): Swarm {
    // One cast at this single boundary: our wire messages are plain JSON and
    // carry no index signatures, matching the pre-rewrite p2p.ts approach.
    const room = rawRoom as {
      makeAction: (namespace: string) => {
        send: (data: never) => Promise<unknown>
        onMessage: unknown
      }
      onPeerJoin: unknown
      onPeerLeave: unknown
      leave: () => Promise<unknown>
    }
    const actionAct = room.makeAction('room-action')
    const stateAct = room.makeAction('room-state')
    actionAct.onMessage = (data: unknown, peerId: unknown) => {
      const m = data as RoomWireAction
      if (closed || !m || typeof m.kind !== 'string') return
      // the sender's wire id — the swarm prefix plus Trystero's peer id — is
      // what onPeerJoin/onPeerLeave report, so the hook can tell who spoke
      const from = `${prefix}${String(peerId ?? '')}`
      for (const cb of actionListeners) {
        try {
          cb(m, from)
        } catch {
          // ignore
        }
      }
    }
    stateAct.onMessage = (data: unknown) => {
      const m = data as RoomWireState
      if (!closed && m?.kind === 'state' && m.room) emit(stateListeners, m)
    }
    room.onPeerJoin = (id: string) => {
      if (!closed) emit(joinListeners, `${prefix}${id}`)
    }
    room.onPeerLeave = (id: string) => {
      if (!closed) emit(leaveListeners, `${prefix}${id}`)
    }
    return {
      sendAction: (data) => void actionAct.send(data as never).catch(() => {}),
      sendState: (data) => void stateAct.send(data as never).catch(() => {}),
      leave: () => void room.leave().catch(() => {}),
    }
  }

  const settled = await Promise.allSettled([wireTorrent(), wireNostr()])
  if (wires.length === 0) {
    for (const s of settled) {
      if (s.status === 'rejected') console.debug('[room-net] swarm failed:', s.reason)
    }
    return null
  }

  return {
    sendAction(action) {
      for (const w of wires) w.sendAction(action)
    },
    sendState(room) {
      const state: RoomWireState = { kind: 'state', room }
      for (const w of wires) w.sendState(state)
    },
    onAction(cb) {
      actionListeners.add(cb)
      return () => actionListeners.delete(cb)
    },
    onState(cb) {
      stateListeners.add(cb)
      return () => stateListeners.delete(cb)
    },
    onPeerJoin(cb) {
      joinListeners.add(cb)
      return () => joinListeners.delete(cb)
    },
    onPeerLeave(cb) {
      leaveListeners.add(cb)
      return () => leaveListeners.delete(cb)
    },
    close() {
      closed = true
      actionListeners.clear()
      stateListeners.clear()
      joinListeners.clear()
      leaveListeners.clear()
      for (const w of wires) w.leave()
    },
  }
}
