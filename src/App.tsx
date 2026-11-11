import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initialNight } from './game/engine'
import { type Action, type NightState, TOTAL_CANDLES } from './game/types'
import { syncReducer, nightFromRoom, type SyncAction } from './game/night-sync'
import { loadNight, saveNight } from './lib/storage'
import { initialLobby, reducer as lobbyReducer, type LobbyAction, type LobbyState } from './lobby/lobby'
import { useRoomNet } from './lobby/use-room-net'
import Gathering from './components/Gathering'
import LobbyHome from './components/LobbyHome'
import InviteJoin from './components/InviteJoin'
import JoinRefused from './components/JoinRefused'
import RoomScreen from './components/RoomScreen'
import JoiningScreen from './components/JoiningScreen'
import TruthPhase from './components/TruthPhase'
import ScenePhase from './components/ScenePhase'
import LastStand from './components/LastStand'
import Epilogue from './components/Epilogue'
import RulesModal from './components/RulesModal'
import TitleScreen from './components/TitleScreen'
import Candles from './components/Candles'
import { DarkenByDialog } from './components/ScenePhase'

type Screen = 'title' | 'lobby' | 'night'

function hydrate(): NightState {
  const saved = loadNight<NightState>()
  if (
    saved &&
    typeof saved === 'object' &&
    typeof saved.phase === 'string' &&
    Array.isArray(saved.survivors) &&
    typeof saved.candlesLit === 'number'
  ) {
    return saved
  }
  return initialNight()
}

export default function App() {
  // the night's reducer, wrapped — not changed: the wrapper answers the few
  // things a networked night needs that the engine must not know about
  const [state, nightDispatch] = useReducer(
    (current: NightState, action: SyncAction) => syncReducer(current, action),
    undefined,
    hydrate,
  )
  const [lobby, lobbyDispatch] = useReducer(
    (current: LobbyState, action: LobbyAction) => lobbyReducer(current, action),
    undefined,
    initialLobby,
  )
  // A saved night in progress resumes; otherwise the night starts at the lobby.
  // An invite link (?join=CODE) skips the title and lands on the invite
  // screen — the room is one name away from landing on it.
  const [inviteCode] = useState(() => {
    const c = new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? ''
    return /^[A-Z0-9]{1,6}$/.test(c) ? c : ''
  })
  const [screen, setScreen] = useState<Screen>(() => {
    if (state.phase !== 'gathering' || state.gmName !== '') return 'night'
    return new URLSearchParams(window.location.search).has('join') ? 'lobby' : 'title'
  })
  const [rulesOpen, setRulesOpen] = useState(false)
  // the accident-darken dialog sits at the App level so the candle row can
  // persist across the scene boundary — a candle that dies mid-scene is one
  // the table watches go out, not one that silently re-renders
  const [darkenOpen, setDarkenOpen] = useState(false)
  const { renameSelf, leaveRoom, kickMember, appointGm, toggleGmInterest, toggleReady, nightDo } = useRoomNet(
    lobby,
    lobbyDispatch,
    state,
    nightDispatch,
  )
  const dispatch = nightDo as (a: Action) => void

  // The room's own view of the night: seats whose member has gone dark have
  // fallen — the rules keep their rule (whoever leaves, falls) — and the
  // night's door is the admin's and the keeper's both.
  const room = lobby.stage === 'room' ? lobby.room : null
  const fallenIds = useMemo(() => {
    if (!room) return [] as string[]
    return room.members.filter((m) => !m.connected && m.id !== room.gmMemberId).map((m) => m.id)
  }, [room])
  const canOpenTheNight = !room || lobby.meId === room.adminId || lobby.meId === room.gmMemberId
  const nightStarted = room?.nightStarted === true

  // The night moves the whole table: when the room's snapshot says the
  // gathering has begun, every seat follows; when it ends, every seat is
  // back in the room with the night behind it. A member cast out of the
  // room (kicked, or the host lost) leaves the night with it.
  const wasRoomNight = useRef(false)
  useEffect(() => {
    if (nightStarted) wasRoomNight.current = true
    if (nightStarted && screen !== 'night') setScreen('night')
    if (!nightStarted && lobby.stage === 'room' && screen === 'night') {
      setScreen('lobby')
      nightDispatch({ type: 'night/reset' })
    }
    if (wasRoomNight.current && lobby.stage !== 'room') {
      wasRoomNight.current = false
      setScreen('lobby')
      nightDispatch({ type: 'night/reset' })
    }
  }, [nightStarted, lobby.stage, screen])

  // The candle is the UI: the whole page darkens with every candle that dies,
  // from the studio black of the gathering down to the Last Stand's floor.
  // Only the night drives this — the lobby and title keep the base black.
  useEffect(() => {
    const inNight = screen === 'night' && state.phase !== 'gathering'
    const darkness = inNight ? 1 - state.candlesLit / TOTAL_CANDLES : 0
    const r = Math.round(13 - 8 * darkness)
    const g = Math.round(12 - 8 * darkness)
    const b = Math.round(10 - 7 * darkness)
    document.body.style.background = `rgb(${r}, ${g}, ${b})`
    return () => {
      document.body.style.background = ''
    }
  }, [screen, state.phase, state.candlesLit])

  useEffect(() => {
    saveNight(state)
  }, [state])

  // Both restart paths — the top bar and the epilogue — end the night here.
  // In a room, the reset travels through the same door as every other night
  // action and the room reopens with ready reset; alone, the tab returns to
  // the title so the lobby flow runs again.
  function beginNewNight() {
    if (!window.confirm('Begin a new night? This night — its truths, its dead, its record — ends now.')) return
    dispatch({ type: 'night/reset' })
    if (!room) {
      lobbyDispatch({ type: 'lobby/nightEnded' })
      setScreen('title')
      return
    }
    // only the host's click reopens the room locally — a keeper who is a
    // guest lets the host's snapshot close it for everyone
    if (lobby.meId === room.adminId) lobbyDispatch({ type: 'lobby/nightEnded' })
  }

  return (
    <div className={state.phase === 'laststand' || state.phase === 'epilogue' ? 'night-dark' : undefined}>
      {screen === 'night' && state.phase !== 'gathering' && (
        <header className="topbar">
          <span className="topbar-mark ritual">Ten Candles</span>
          <span className="topbar-meta nums">
            {state.phase === 'truths' || state.phase === 'scene'
              ? `Scene ${state.scene} · ${state.candlesLit} ${state.candlesLit === 1 ? 'candle' : 'candles'} burning`
              : state.phase === 'laststand'
                ? 'The Last Stand'
                : 'The world is dark'}
          </span>
          <span className="topbar-actions">
            <button type="button" className="btn-text" onClick={() => setRulesOpen(true)}>
              The rules
            </button>
            {canOpenTheNight && (
              <button type="button" className="btn-text danger" onClick={beginNewNight}>
                New night
              </button>
            )}
          </span>
        </header>
      )}

      {/* the candle row is one persistent element across the night's phases —
          scene, truths, and the Last Stand — so a candle that dies is seen
          dying, and a new night sees the ten flame up together */}
      {screen === 'night' && (state.phase === 'scene' || state.phase === 'truths' || state.phase === 'laststand') && (
        <div className="wrap" style={{ paddingTop: 'clamp(1.5rem, 4vh, 3rem)' }}>
          <Candles
            lit={state.candlesLit}
            canDarken={state.phase === 'scene'}
            onDarken={() => setDarkenOpen(true)}
          />
          <hr className="rule mt-9" />
        </div>
      )}
      {darkenOpen && state.phase === 'scene' && (
        <DarkenByDialog
          state={state}
          onCancel={() => setDarkenOpen(false)}
          onConfirm={(by) => {
            setDarkenOpen(false)
            dispatch({ type: 'scene/darken', by })
          }}
          label="A candle gutters out — not by any failure, simply by accident. The scene ends here."
          confirm="Let it go out"
        />
      )}

      <main>
        {screen === 'title' ? (
          <TitleScreen
            onBegin={() => setScreen('lobby')}
            onRules={() => setRulesOpen(true)}
          />
        ) : screen === 'lobby' ? (
          lobby.stage === 'home' && lobby.failReason ? (
            <JoinRefused state={lobby} dispatch={lobbyDispatch} />
          ) : inviteCode && lobby.stage === 'home' ? (
            <InviteJoin code={inviteCode} dispatch={lobbyDispatch} onBack={() => setScreen('title')} />
          ) : lobby.stage === 'home' ? (
            <LobbyHome
              state={lobby}
              dispatch={lobbyDispatch}
              onSingleScreen={() => setScreen('night')}
              onBack={() => setScreen('title')}
            />
          ) : lobby.stage === 'joining' && lobby.pendingJoin ? (
            <JoiningScreen
              code={lobby.pendingJoin.code}
              name={lobby.pendingJoin.name}
              onCancel={leaveRoom}
            />
          ) : (
            <RoomScreen
              state={lobby}
              onRename={renameSelf}
              onLeave={leaveRoom}
              onGather={() => {
                // the host has convened the table — the door closes here, not
                // only when the candles are lit; no one joins mid-setup. The
                // seats are dealt from the room's members: one survivor per
                // member beside the keeper, each seat id its member's token.
                lobbyDispatch({ type: 'lobby/nightStarted' })
                if (lobby.room) nightDispatch({ type: 'night/seed', night: nightFromRoom(lobby.room) })
                setScreen('night')
              }}
              onKick={kickMember}
              onAppointGm={appointGm}
              onToggleGmInterest={toggleGmInterest}
              onToggleReady={toggleReady}
            />
          )
        ) : state.phase === 'gathering' ? (
          <Gathering
            state={state}
            dispatch={dispatch}
            onRules={() => setRulesOpen(true)}
            onNightBegun={() => lobbyDispatch({ type: 'lobby/nightStarted' })}
            room={room}
            myToken={lobby.meId}
            canBegin={canOpenTheNight}
            fallenIds={fallenIds}
          />
        ) : state.phase === 'truths' ? (
          <TruthPhase state={state} dispatch={dispatch} />
        ) : state.phase === 'scene' ? (
          <ScenePhase state={state} dispatch={dispatch} myToken={lobby.meId} fallenIds={fallenIds} />
        ) : state.phase === 'laststand' ? (
          <LastStand state={state} dispatch={dispatch} fallenIds={fallenIds} />
        ) : (
          <Epilogue state={state} dispatch={dispatch} onNewNight={beginNewNight} canBegin={canOpenTheNight} />
        )}
      </main>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
