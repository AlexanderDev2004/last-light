import { useEffect, useRef } from 'react'
import { MAX_MEMBERS, newId } from '../game/types'
import { openRoomNet, type RoomNet } from '../lib/room-net'
import type { LobbyAction, LobbyState } from './lobby'
import { resolveHostAction } from './host-rules'

const JOIN_TIMEOUT_MS = 10_000
/** a guest ends the room after this much silence from the host */
const HOST_SILENCE_MS = 15_000
/** after the admin drops, guests wait this long for the new host's first hello */
const ADMIN_TAKEOVER_GRACE_MS = 8_000

/** wire ids are `<swarm>:<peerId>`; the peer id is shared across swarms */
function peerOf(wireId: string): string {
  return wireId.slice(wireId.indexOf(':') + 1)
}

/**
 * Wires the lobby reducer to the WebRTC transport.
 *
 * The host is authoritative: members' wire actions are applied to the host's
 * reducer, and every room change is broadcast as a snapshot. Guests apply
 * snapshots as-is and speak only through wire actions. A guest's member id
 * is its own token, so it recognizes itself in the snapshots.
 *
 * The room lives in the host's tab. The admin and the host are the same
 * member: the room's state lives in the admin's tab. When that tab closes,
 * the longest-tenured member still at the table takes over as the new admin
 * and host; everyone else waits briefly for the new host to speak before
 * giving the room up for lost.
 */
export function useRoomNet(lobby: LobbyState, dispatch: (a: LobbyAction) => void) {
  const netRef = useRef<RoomNet | null>(null)
  const roleRef = useRef<'host' | 'guest' | null>(null)
  // Guests identify themselves with this token; the host keeps its admin id.
  const tokenRef = useRef(newId())
  /** peerId → member token, learned from the join each peer carried */
  const wireTokensRef = useRef(new Map<string, string>())
  /** how many swarms each peer is currently present on */
  const peerSwarmsRef = useRef(new Map<string, number>())
  const lastBroadcastRef = useRef('')
  const heartbeatRef = useRef<number | undefined>(undefined)
  const lastHostSeenRef = useRef(0)
  /** admin whose loss we are waiting out the takeover grace for */
  const pendingAdminLossRef = useRef<string | null>(null)

  const lobbyRef = useRef(lobby)
  lobbyRef.current = lobby

  /** Ends the transport and resets every ref that belongs to it. */
  function teardown() {
    window.clearInterval(heartbeatRef.current)
    heartbeatRef.current = undefined
    netRef.current?.close()
    netRef.current = null
    roleRef.current = null
    wireTokensRef.current.clear()
    peerSwarmsRef.current.clear()
    lastBroadcastRef.current = ''
    lastHostSeenRef.current = 0
    pendingAdminLossRef.current = null
  }

  // open the transport for this stage (host on room-entry, guest while knocking)
  useEffect(() => {
    const isHost = lobby.stage === 'room' && lobby.room !== null && lobby.meId === lobby.room.adminId
    const isGuest = lobby.stage === 'joining' && lobby.pendingJoin !== null
    if ((!isHost && !isGuest) || netRef.current) return

    roleRef.current = isHost ? 'host' : 'guest'
    lastHostSeenRef.current = Date.now()
    let active = true

    void openRoomNet(lobby.pendingJoin?.code ?? lobby.room?.code ?? '').then((net) => {
      if (!active) {
        net?.close()
        return
      }
      if (!net) {
        if (roleRef.current === 'guest') {
          dispatch({
            type: 'lobby/joinFailed',
            notice: 'No signaling path opened — your network may be blocking the WebRTC relays.',
          })
        }
        // A host without a transport keeps a working local room instead.
        return
      }
      netRef.current = net

      /** The admin's connection dropped: the longest-tenured member takes over. */
      function handleAdminGone() {
        const room = lobbyRef.current.room
        if (!room) return
        const next = room.members.find((m) => m.connected && m.id !== room.adminId)
        if (!next) {
          dispatch({ type: 'lobby/hostLost' })
          teardown()
          return
        }
        if (next.id === tokenRef.current) {
          // the room is mine now — I am the longest-tenured member still seated
          pendingAdminLossRef.current = null
          dispatch({ type: 'lobby/adminChanged', newAdminId: tokenRef.current })
          roleRef.current = 'host'
          window.clearInterval(heartbeatRef.current)
          heartbeatRef.current = window.setInterval(() => {
            netRef.current?.sendAction({ kind: 'hello', token: tokenRef.current })
          }, 5000)
          netRef.current?.sendAction({ kind: 'hello', token: tokenRef.current })
        } else if (pendingAdminLossRef.current !== room.adminId) {
          // wait for the new host's first hello; the silence rule ends the
          // room if none comes within the grace window
          pendingAdminLossRef.current = room.adminId
          lastHostSeenRef.current = Date.now() - HOST_SILENCE_MS + ADMIN_TAKEOVER_GRACE_MS
        } else if (Date.now() - lastHostSeenRef.current > HOST_SILENCE_MS) {
          // the grace window passed and no new host spoke — the room is over
          dispatch({ type: 'lobby/hostLost' })
          teardown()
        }
      }

      net.onAction((action, fromWireId) => {
        if (roleRef.current === 'host') {
          const peer = peerOf(fromWireId)
          if (action.kind === 'join') {
            // a join binds this peer to the token it carries — from here on,
            // this peer may only ever act as that token. A token already
            // bound to a different live peer is refused: a snapshot tells
            // every peer every token, so a late joiner could otherwise claim
            // a seated member's identity. The member's own rejoin passes,
            // because their drop removed the old binding; the same guest's
            // second swarm passes, because the peer id is shared.
            const bound = wireTokensRef.current.get(peer)
            if (bound && bound !== action.token) return
            const owner = [...wireTokensRef.current.entries()].find(([p, t]) => t === action.token && p !== peer)
            if (owner) return
            wireTokensRef.current.set(peer, action.token)
            const joined = resolveHostAction(lobbyRef.current.room, undefined, action)
            if (joined) dispatch(joined)
            return
          }
          const senderToken = wireTokensRef.current.get(peer)
          const applied = resolveHostAction(lobbyRef.current.room, senderToken, action)
          if (applied) {
            if (applied.type === 'lobby/peerLeave' || applied.type === 'lobby/peerKick') {
              // forget the removed member's peer bindings
              for (const [p, t] of wireTokensRef.current) {
                if (t === applied.id) {
                  wireTokensRef.current.delete(p)
                  peerSwarmsRef.current.delete(p)
                }
              }
            }
            dispatch(applied)
          } else {
            console.debug('[room-net] action refused by the host rules:', action.kind)
          }
        } else if (action.kind === 'hello') {
          // guests learn which peer connection carries the host, and that it
          // was alive this instant
          wireTokensRef.current.set(peerOf(fromWireId), action.token)
          lastHostSeenRef.current = Date.now()
          if (pendingAdminLossRef.current && pendingAdminLossRef.current !== action.token) {
            pendingAdminLossRef.current = null // the new host is speaking
          }
        }
      })

      net.onState((state, fromWireId) => {
        if (roleRef.current !== 'guest') return
        // only the peer our hello records hold the admin's token may
        // broadcast room state — anyone else is ignored, host-aliveness
        // included
        if (wireTokensRef.current.get(peerOf(fromWireId)) !== state.adminToken) return
        lastHostSeenRef.current = Date.now()
        if (pendingAdminLossRef.current && pendingAdminLossRef.current !== state.room.adminId) {
          pendingAdminLossRef.current = null // the new host is broadcasting
        }
        const prev = lobbyRef.current
        const wasSeated = Boolean(prev.stage === 'room' && prev.room?.members.some((m) => m.id === tokenRef.current))
        const prevAdmin = prev.room?.adminId
        const seated = state.room.members.some((m) => m.id === tokenRef.current)
        if (seated) {
          dispatch({ type: 'lobby/netState', room: state.room, selfToken: tokenRef.current })
          if (prevAdmin !== undefined && state.room.adminId !== prevAdmin) {
            // the new host's first snapshot carries the new admin; surface it
            dispatch({ type: 'lobby/adminChanged', newAdminId: state.room.adminId })
            // the new host inherited no peer bindings — reannounce so it can
            // authenticate our later rename, leave, and GM-interest actions
            const self = state.room.members.find((m) => m.id === tokenRef.current)
            if (self) net.sendAction({ kind: 'join', token: tokenRef.current, name: self.name })
          }
        } else if (wasSeated) {
          // we sat at this table and the latest snapshot no longer lists us;
          // the room is over for this tab, so drop the transport too
          dispatch({ type: 'lobby/kicked' })
          teardown()
        } else if (state.room.members.length >= MAX_MEMBERS) {
          dispatch({ type: 'lobby/joinFailed', notice: 'The room is full — at most six can sit at the table.' })
        }
        // not seated, not full: a snapshot from before our join landed; wait
      })

      net.onPeerJoin((wireId) => {
        // the same physical peer arrives on both swarms; count them so a
        // single swarm's leave doesn't mark the member gone dark
        const peer = peerOf(wireId)
        peerSwarmsRef.current.set(peer, (peerSwarmsRef.current.get(peer) ?? 0) + 1)
        if (roleRef.current === 'host') {
          // greet the newcomer so guests know which peer connection is the
          // host's (they watch it to notice the room dying), and answer with
          // a snapshot even if nothing in the room changed to broadcast on
          net.sendAction({ kind: 'hello', token: lobbyRef.current.meId ?? '' })
          const room = lobbyRef.current.room
          if (room) net.sendState(room, lobbyRef.current.meId ?? '')
        } else if (roleRef.current === 'guest') {
          const pending = lobbyRef.current.pendingJoin
          if (pending) net.sendAction({ kind: 'join', token: tokenRef.current, name: pending.name })
        }
      })

      net.onPeerLeave((wireId) => {
        const peer = peerOf(wireId)
        const remaining = (peerSwarmsRef.current.get(peer) ?? 1) - 1
        if (remaining > 0) {
          peerSwarmsRef.current.set(peer, remaining)
          return // the peer is still present on its other swarm
        }
        peerSwarmsRef.current.delete(peer)
        const token = wireTokensRef.current.get(peer)
        if (!token) return
        wireTokensRef.current.delete(peer)
        if (roleRef.current === 'host') {
          dispatch({ type: 'lobby/peerLeave', id: token })
        } else if (token === lobbyRef.current.room?.adminId) {
          handleAdminGone()
        }
      })

      // The heartbeat: the host says hello every few seconds; a guest who
      // stops hearing it knows the room died with the host's tab — no
      // signaling timeout required.
      lastHostSeenRef.current = Date.now()
      if (roleRef.current === 'host') {
        heartbeatRef.current = window.setInterval(() => {
          net.sendAction({ kind: 'hello', token: lobbyRef.current.meId ?? '' })
        }, 5000)
      } else {
        heartbeatRef.current = window.setInterval(() => {
          const room = lobbyRef.current.room
          if (!room) {
            // the room is gone from state (host lost, leave) — stop watching
            teardown()
            return
          }
          if (Date.now() - lastHostSeenRef.current > HOST_SILENCE_MS) {
            // the host's silence means the admin's tab is gone: either a
            // member takes the room over, or it ends
            handleAdminGone()
          }
        }, 3000)
      }
    })

    return () => {
      // knocking → seated keeps the same connection; anything else (leaving,
      // a failed join, unmount) tears the transport down. `lobby.stage` in
      // this closure is the stage of the run that opened the transport;
      // lobbyRef holds the newest one.
      const keep = lobby.stage === 'joining' && lobbyRef.current.stage === 'room'
      if (keep) return
      active = false
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.stage])

  // knocking must give up when no room answers
  useEffect(() => {
    if (lobby.stage !== 'joining') return
    const t = window.setTimeout(() => {
      if (lobbyRef.current.stage !== 'joining') return
      dispatch({
        type: 'lobby/joinFailed',
        notice: `No room answers to ${lobbyRef.current.pendingJoin?.code ?? 'that code'} — check the code, or the host's tab may be closed.`,
      })
    }, JOIN_TIMEOUT_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.stage])

  // the host broadcasts every room change; guests never broadcast
  useEffect(() => {
    if (roleRef.current !== 'host' || !netRef.current || lobby.stage !== 'room' || !lobby.room) return
    const json = JSON.stringify(lobby.room)
    if (json === lastBroadcastRef.current) return
    lastBroadcastRef.current = json
    netRef.current.sendState(lobby.room, lobby.meId ?? '')
  }, [lobby.stage, lobby.room, lobby.meId])

  /** The local user renames themselves; guests carry it to the host. */
  function renameSelf(name: string) {
    const meId = lobby.meId
    if (!meId) return
    dispatch({ type: 'lobby/rename', id: meId, name })
    if (roleRef.current === 'guest') netRef.current?.sendAction({ kind: 'rename', token: meId, name })
  }

  /** The local user leaves; guests tell the host before dropping off. */
  function leaveRoom() {
    if (roleRef.current === 'guest' && lobby.meId) {
      netRef.current?.sendAction({ kind: 'leave', token: lobby.meId })
    }
    // the room is over for this tab: end the transport now, not on the next
    // effect pass, so nothing keeps knocking on a dead room afterwards
    dispatch({ type: 'lobby/leave' })
    teardown()
  }

  /** The admin removes a member from the room. */
  function kickMember(id: string) {
    const meId = lobby.meId
    if (!meId || !lobby.room || lobby.room.adminId !== meId) return
    dispatch({ type: 'lobby/peerKick', id })
  }

  /** The admin seats a member on the keeper's seat; null empties the seat. */
  function appointGm(gmMemberId: string | null) {
    const meId = lobby.meId
    if (!meId || !lobby.room || lobby.room.adminId !== meId) return
    dispatch({ type: 'lobby/peerAppointGm', gmMemberId })
  }

  /** Raise or lower your own hand for the keeper's seat. */
  function toggleGmInterest() {
    const meId = lobby.meId
    if (!meId) return
    dispatch({ type: 'lobby/toggleGmInterest' })
    if (roleRef.current === 'guest') netRef.current?.sendAction({ kind: 'toggleGmInterest', token: meId })
  }

  return { renameSelf, leaveRoom, kickMember, appointGm, toggleGmInterest }
}
