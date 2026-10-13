import { useEffect, useRef } from 'react'
import { MAX_MEMBERS, newId } from '../game/types'
import { openRoomNet, type RoomNet } from '../lib/room-net'
import type { LobbyAction, LobbyState } from './lobby'

const JOIN_TIMEOUT_MS = 10_000
/** a guest ends the room after this much silence from the host */
const HOST_SILENCE_MS = 15_000

/**
 * Wires the lobby reducer to the WebRTC transport.
 *
 * The host is authoritative: members' wire actions are applied to the host's
 * reducer, and every room change is broadcast as a snapshot. Guests apply
 * snapshots as-is and speak only through wire actions. A guest's member id
 * is its own token, so it recognizes itself in the snapshots.
 *
 * The room lives in the host's tab: when it closes, guests see the host's
 * connection drop and the room ends (admin migration is a later issue).
 */
export function useRoomNet(lobby: LobbyState, dispatch: (a: LobbyAction) => void) {
  const netRef = useRef<RoomNet | null>(null)
  const roleRef = useRef<'host' | 'guest' | null>(null)
  // Guests identify themselves with this token; the host keeps its admin id.
  const tokenRef = useRef(newId())
  /** wireId → member token, learned from the wire actions themselves */
  const wireTokensRef = useRef(new Map<string, string>())
  const lastBroadcastRef = useRef('')
  const heartbeatRef = useRef<number | undefined>(undefined)
  const lastHostSeenRef = useRef(0)

  const lobbyRef = useRef(lobby)
  lobbyRef.current = lobby

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

      net.onAction((action, fromWireId) => {
        if (roleRef.current === 'host') {
          switch (action.kind) {
            case 'join':
            case 'rename':
              wireTokensRef.current.set(fromWireId, action.token)
              dispatch(
                action.kind === 'join'
                  ? { type: 'lobby/peerJoin', id: action.token, name: action.name }
                  : { type: 'lobby/rename', id: action.token, name: action.name },
              )
              break
            case 'leave':
              dispatch({ type: 'lobby/peerLeave', id: action.token })
              break
            case 'hello':
              break
          }
        } else if (action.kind === 'hello') {
          // guests learn which wire connection carries the host, and that it
          // was alive this instant
          wireTokensRef.current.set(fromWireId, action.token)
          lastHostSeenRef.current = Date.now()
        }
      })

      net.onState((state) => {
        if (roleRef.current !== 'guest') return
        const seated = state.room.members.some((m) => m.id === tokenRef.current)
        if (seated) {
          dispatch({ type: 'lobby/netState', room: state.room, selfToken: tokenRef.current })
        } else if (state.room.members.length >= MAX_MEMBERS) {
          dispatch({ type: 'lobby/joinFailed', notice: 'The room is full — at most six can sit at the table.' })
        }
        // not seated, not full: a snapshot from before our join landed; wait
      })

      net.onPeerJoin((wireId) => {
        if (roleRef.current === 'host') {
          // greet the newcomer so guests know which wire connection is the
          // host's (they watch it to notice the room dying), and answer with
          // a snapshot even if nothing in the room changed to broadcast on
          net.sendAction({ kind: 'hello', token: lobbyRef.current.meId ?? '' })
          const room = lobbyRef.current.room
          if (room) net.sendState(room)
        } else if (roleRef.current === 'guest') {
          const pending = lobbyRef.current.pendingJoin
          if (pending) net.sendAction({ kind: 'join', token: tokenRef.current, name: pending.name })
        }
        void wireId
      })

      net.onPeerLeave((wireId) => {
        const token = wireTokensRef.current.get(wireId)
        if (!token) return
        wireTokensRef.current.delete(wireId)
        if (roleRef.current === 'host') {
          dispatch({ type: 'lobby/peerLeave', id: token })
        } else if (token === lobbyRef.current.room?.adminId) {
          dispatch({ type: 'lobby/hostLost' })
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
          if (room && Date.now() - lastHostSeenRef.current > HOST_SILENCE_MS) {
            dispatch({ type: 'lobby/hostLost' })
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
      window.clearInterval(heartbeatRef.current)
      heartbeatRef.current = undefined
      netRef.current?.close()
      netRef.current = null
      roleRef.current = null
      wireTokensRef.current.clear()
      lastBroadcastRef.current = ''
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
    netRef.current.sendState(lobby.room)
  }, [lobby.stage, lobby.room])

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
    dispatch({ type: 'lobby/leave' })
  }

  return { renameSelf, leaveRoom }
}
