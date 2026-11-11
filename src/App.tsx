import { useEffect, useReducer, useState } from 'react'
import { initialNight, reducer } from './game/engine'
import type { Action, NightState } from './game/types'
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
  const [state, dispatch] = useReducer(
    (current: NightState, action: Action) => reducer(current, action),
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
  const { renameSelf, leaveRoom, kickMember, appointGm, toggleGmInterest, toggleReady } = useRoomNet(lobby, lobbyDispatch)

  useEffect(() => {
    saveNight(state)
  }, [state])

  // Both restart paths — the top bar and the epilogue — end the night here,
  // reopen the room with ready reset, and return to the title so the lobby
  // flow runs again.
  function beginNewNight() {
    if (!window.confirm('Begin a new night? This night — its truths, its dead, its record — ends now.')) return
    dispatch({ type: 'night/reset' })
    // the night is over: the room opens again with ready reset for every seat
    lobbyDispatch({ type: 'lobby/nightEnded' })
    setScreen('title')
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
            <button type="button" className="btn-text danger" onClick={beginNewNight}>
              New night
            </button>
          </span>
        </header>
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
                // only when the candles are lit; no one joins mid-setup
                lobbyDispatch({ type: 'lobby/nightStarted' })
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
          />
        ) : state.phase === 'truths' ? (
          <TruthPhase state={state} dispatch={dispatch} />
        ) : state.phase === 'scene' ? (
          <ScenePhase state={state} dispatch={dispatch} />
        ) : state.phase === 'laststand' ? (
          <LastStand state={state} dispatch={dispatch} />
        ) : (
          <Epilogue state={state} dispatch={dispatch} onNewNight={beginNewNight} />
        )}
      </main>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
