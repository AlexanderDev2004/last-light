import * as Schema from 'effect/Schema'
import { Rpc, RpcGroup } from 'effect/unstable/rpc'

// ---------- Views (server -> browser, same codec both ways) ----------

export class LobbyPlayerView extends Schema.Class<LobbyPlayerView>('LobbyPlayerView')({
  clientId: Schema.String,
  name: Schema.String,
  isGm: Schema.Boolean,
  isReady: Schema.Boolean,
}) {}

export class LobbyView extends Schema.Class<LobbyView>('LobbyView')({
  id: Schema.String,
  name: Schema.String,
  gmId: Schema.String,
  maxPlayers: Schema.Number,
  status: Schema.String,
  gameId: Schema.NullOr(Schema.String),
  players: Schema.Array(LobbyPlayerView),
}) {}

export class CardsView extends Schema.Class<CardsView>('CardsView')({
  virtue: Schema.String,
  vice: Schema.String,
  moment: Schema.String,
  brink: Schema.String,
  burnedVirtue: Schema.Boolean,
  burnedVice: Schema.Boolean,
  burnedMoment: Schema.Boolean,
  burnedBrink: Schema.Boolean,
  hopeDie: Schema.Boolean,
  alive: Schema.Boolean,
}) {}

export class SessionPlayerView extends Schema.Class<SessionPlayerView>(
  'SessionPlayerView',
)({
  clientId: Schema.String,
  name: Schema.String,
  isGm: Schema.Boolean,
  cards: CardsView,
}) {}

export class TruthView extends Schema.Class<TruthView>('TruthView')({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  candleLeft: Schema.Number,
}) {}

export class SessionView extends Schema.Class<SessionView>('SessionView')({
  gameId: Schema.String,
  lobbyId: Schema.String,
  candlesLit: Schema.Number,
  ended: Schema.Boolean,
  players: Schema.Array(SessionPlayerView),
  truths: Schema.Array(TruthView),
  log: Schema.Array(Schema.String),
}) {}

// ---------- Typed errors ----------

export class LobbyNotFound extends Schema.TaggedError<LobbyNotFound>()(
  'LobbyNotFound',
  { message: Schema.String },
) {}

export class LobbyFull extends Schema.TaggedError<LobbyFull>()('LobbyFull', {
  message: Schema.String,
}) {}

export class NotInLobby extends Schema.TaggedError<NotInLobby>()('NotInLobby', {
  message: Schema.String,
}) {}

export class NotGM extends Schema.TaggedError<NotGM>()('NotGM', {
  message: Schema.String,
}) {}

export class NotAllReady extends Schema.TaggedError<NotAllReady>()(
  'NotAllReady',
  { message: Schema.String },
) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()(
  'SessionNotFound',
  { message: Schema.String },
) {}

export class WeakTruth extends Schema.TaggedError<WeakTruth>()('WeakTruth', {
  message: Schema.String,
}) {}

// ---------- RPC group: single source of truth for client + server ----------

export class GameRpcs extends RpcGroup.make(
  Rpc.make('createLobby', {
    payload: {
      roomName: Schema.String,
      userName: Schema.String,
      clientId: Schema.String,
      maxPlayers: Schema.Number,
    },
    success: LobbyView,
  }),
  Rpc.make('joinLobby', {
    payload: {
      lobbyId: Schema.String,
      userName: Schema.String,
      clientId: Schema.String,
    },
    success: LobbyView,
    error: Schema.Union([LobbyNotFound, LobbyFull]),
  }),
  Rpc.make('getLobby', {
    payload: { lobbyId: Schema.String },
    success: LobbyView,
    error: LobbyNotFound,
  }),
  Rpc.make('toggleReady', {
    payload: { lobbyId: Schema.String, clientId: Schema.String },
    success: LobbyView,
    error: Schema.Union([LobbyNotFound, NotInLobby]),
  }),
  Rpc.make('transferGM', {
    payload: {
      lobbyId: Schema.String,
      clientId: Schema.String,
      toClientId: Schema.String,
    },
    success: LobbyView,
    error: Schema.Union([LobbyNotFound, NotGM]),
  }),
  Rpc.make('startGame', {
    payload: { lobbyId: Schema.String, clientId: Schema.String },
    success: LobbyView,
    error: Schema.Union([LobbyNotFound, NotGM, NotAllReady]),
  }),
  Rpc.make('getSession', {
    payload: { gameId: Schema.String, lobbyId: Schema.String },
    success: SessionView,
    error: SessionNotFound,
  }),
  Rpc.make('extinguishCandle', {
    payload: { gameId: Schema.String, lobbyId: Schema.String, clientId: Schema.String },
    success: SessionView,
    error: Schema.Union([SessionNotFound, NotGM]),
  }),
  Rpc.make('addTruth', {
    payload: {
      gameId: Schema.String,
      lobbyId: Schema.String,
      author: Schema.String,
      text: Schema.String,
    },
    success: TruthView,
    error: Schema.Union([SessionNotFound, WeakTruth]),
  }),
  Rpc.make('updateCards', {
    payload: {
      gameId: Schema.String,
      lobbyId: Schema.String,
      clientId: Schema.String,
      cards: CardsView,
    },
    success: SessionView,
    error: SessionNotFound,
  }),
  Rpc.make('endGame', {
    payload: { gameId: Schema.String, lobbyId: Schema.String, clientId: Schema.String },
    success: SessionView,
    error: Schema.Union([SessionNotFound, NotGM]),
  }),
  Rpc.make('resetSession', {
    payload: { gameId: Schema.String, lobbyId: Schema.String, clientId: Schema.String },
    success: SessionView,
    error: Schema.Union([SessionNotFound, NotGM]),
  }),
) {}
