import { useEffect, useReducer, useState } from 'react'
import { initialNight, reducer } from './game/engine'
import { TOTAL_CANDLES, type Action, type NightState } from './game/types'
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
  // the accident-darken dialog sits at the App level so the candle row can
  // persist across the scene boundary — a candle that dies mid-scene is one
  // the table watches go out, not one that silently re-renders
  const [darkenOpen, setDarkenOpen] = useState(false)
  const { renameSelf, leaveRoom, kickMember, appointGm, toggleGmInterest, toggleReady } = useRoomNet(lobby, lobbyDispatch)

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
