import * as Cloudflare from 'alchemy/Cloudflare'
import * as Drizzle from 'alchemy/Drizzle/Postgres'
import { and, eq } from 'drizzle-orm'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc'
import { nanoid } from 'nanoid'
import { Hyperdrive } from './database.ts'
import {
  CardsView,
  GameRpcs,
  LobbyFull,
  LobbyNotFound,
  LobbyPlayerView,
  LobbyView,
  NotAllReady,
  NotGM,
  NotInLobby,
  SessionNotFound,
  SessionPlayerView,
  TruthView,
  WeakTruth,
  SessionView,
} from './rpc.ts'
import {
  GameSessions,
  Lobbies,
  LobbyPlayers,
  SessionLog,
  SessionPlayers,
  Truths,
  relations,
} from './schema.ts'

const BANNED_TRUTH = [
  'takut cahaya',
  'lemah',
  'tidak berbahaya',
  'tidak kuat',
  'baik',
  'jinak',
]

function roomCode() {
  return nanoid(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
}

export default class Backend extends Cloudflare.Workers.RpcWorker<Backend>()(
  'Backend',
  { main: import.meta.filename, workersDev: false, schema: GameRpcs },
  Effect.gen(function* () {
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive)
    const db = yield* Drizzle.Postgres(conn.connectionString, { relations })

    const loadLobby = (lobbyId: string) =>
      Effect.gen(function* () {
        const code = lobbyId.trim().toUpperCase()
        const rows = yield* db.select().from(Lobbies).where(eq(Lobbies.id, code))
        const row = rows[0]
        if (!row) {
          return yield* new LobbyNotFound({ message: `Room ${code} tidak ditemukan.` })
        }
        const players = yield* db
          .select()
          .from(LobbyPlayers)
          .where(eq(LobbyPlayers.lobbyId, code))
        return new LobbyView({
          id: row.id,
          name: row.name,
          gmId: row.gmId,
          maxPlayers: row.maxPlayers ?? 5,
          status: row.status ?? 'waiting',
          gameId: row.gameId,
          players: players.map(
            (p) =>
              new LobbyPlayerView({
                clientId: p.clientId,
                name: p.name,
                isGm: p.isGm ?? false,
                isReady: p.isReady ?? false,
              }),
          ),
        })
      }).pipe(Effect.orDie)

    const loadSession = (gameId: string) =>
      Effect.gen(function* () {
        const srows = yield* db
          .select()
          .from(GameSessions)
          .where(eq(GameSessions.gameId, gameId))
        const s = srows[0]
        if (!s) {
          return yield* new SessionNotFound({ message: 'Session tidak ditemukan.' })
        }
        const players = yield* db
          .select()
          .from(SessionPlayers)
          .where(eq(SessionPlayers.gameId, gameId))
        const truths = yield* db.select().from(Truths).where(eq(Truths.gameId, gameId))
        const logs = yield* db.select().from(SessionLog).where(eq(SessionLog.gameId, gameId))
        return new SessionView({
          gameId: s.gameId,
          lobbyId: s.lobbyId,
          candlesLit: s.candlesLit ?? 10,
          ended: s.ended ?? false,
          players: players.map(
            (p) =>
              new SessionPlayerView({
                clientId: p.clientId,
                name: p.name,
                isGm: p.isGm ?? false,
                cards: new CardsView({
                  virtue: p.virtue ?? '',
                  vice: p.vice ?? '',
                  moment: p.moment ?? '',
                  brink: p.brink ?? '',
                  burnedVirtue: p.burnedVirtue ?? false,
                  burnedVice: p.burnedVice ?? false,
                  burnedMoment: p.burnedMoment ?? false,
                  burnedBrink: p.burnedBrink ?? false,
                  hopeDie: p.hopeDie ?? false,
                  alive: p.alive ?? true,
                }),
              }),
          ),
          truths: truths.map(
            (t) =>
              new TruthView({
                id: t.id,
                author: t.author,
                text: t.text,
                candleLeft: t.candleLeft ?? 10,
              }),
          ),
          log: logs.map((l) => l.message),
        })
      }).pipe(Effect.orDie)

    const handlers = GameRpcs.toLayer({
      createLobby: ({ roomName, userName, clientId, maxPlayers }) =>
        Effect.gen(function* () {
          const id = roomCode()
          const clamped = Math.min(Math.max(Math.floor(maxPlayers), 2), 6)
          yield* db.insert(Lobbies).values({
            id,
            name: roomName.trim() || `Room ${id}`,
            gmId: clientId,
            maxPlayers: clamped,
            status: 'waiting',
          })
          yield* db.insert(LobbyPlayers).values({
            lobbyId: id,
            clientId,
            name: userName.trim() || 'GM',
            isGm: true,
            isReady: false,
          })
          return yield* loadLobby(id)
        }).pipe(Effect.orDie),

      joinLobby: ({ lobbyId, userName, clientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          const exists = lobby.players.some((p) => p.clientId === clientId)
          if (!exists) {
            if (lobby.players.length >= lobby.maxPlayers) {
              return yield* new LobbyFull({ message: 'Lobby penuh.' })
            }
            yield* db.insert(LobbyPlayers).values({
              lobbyId: lobby.id,
              clientId,
              name: userName.trim() || `Player ${lobby.players.length + 1}`,
              isGm: false,
              isReady: false,
            })
          }
          return yield* loadLobby(lobby.id)
        }).pipe(Effect.orDie),

      getLobby: ({ lobbyId }) => loadLobby(lobbyId),

      toggleReady: ({ lobbyId, clientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          const me = lobby.players.find((p) => p.clientId === clientId)
          if (!me) {
            return yield* new NotInLobby({ message: 'Kamu belum join room ini.' })
          }
          yield* db
            .update(LobbyPlayers)
            .set({ isReady: !me.isReady })
            .where(
              and(
                eq(LobbyPlayers.lobbyId, lobby.id),
                eq(LobbyPlayers.clientId, clientId),
              ),
            )
          return yield* loadLobby(lobby.id)
        }).pipe(Effect.orDie),

      transferGM: ({ lobbyId, clientId, toClientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          if (lobby.gmId !== clientId) {
            return yield* new NotGM({ message: 'Hanya GM yang bisa transfer.' })
          }
          yield* db
            .update(Lobbies)
            .set({ gmId: toClientId })
            .where(eq(Lobbies.id, lobby.id))
          for (const p of lobby.players) {
            yield* db
              .update(LobbyPlayers)
              .set({ isGm: p.clientId === toClientId })
              .where(
                and(
                  eq(LobbyPlayers.lobbyId, lobby.id),
                  eq(LobbyPlayers.clientId, p.clientId),
                ),
              )
          }
          return yield* loadLobby(lobby.id)
        }).pipe(Effect.orDie),

      startGame: ({ lobbyId, clientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          if (lobby.gmId !== clientId) {
            return yield* new NotGM({ message: 'Hanya GM yang bisa start.' })
          }
          if (
            lobby.players.length < 2 ||
            !lobby.players.every((p) => p.isReady)
          ) {
            return yield* new NotAllReady({ message: 'Belum semua Ready (min 2 player).' })
          }
          const gameId = `g_${nanoid(8)}`
          yield* db.insert(GameSessions).values({
            gameId,
            lobbyId: lobby.id,
            candlesLit: 10,
            ended: false,
          })
          for (const p of lobby.players) {
            yield* db.insert(SessionPlayers).values({
              gameId,
              clientId: p.clientId,
              name: p.name,
              isGm: p.isGm,
            })
          }
          yield* db.insert(SessionLog).values({
            gameId,
            message: 'Sesi dimulai. 10 lilin menyala. These things are true. The world is dark...',
          })
          yield* db
            .update(Lobbies)
            .set({ status: 'playing', gameId })
            .where(eq(Lobbies.id, lobby.id))
          return yield* loadLobby(lobby.id)
        }).pipe(Effect.orDie),

      getSession: ({ gameId }) => loadSession(gameId),

      extinguishCandle: ({ gameId, lobbyId, clientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          if (lobby.gmId !== clientId) {
            return yield* new NotGM({ message: 'Hanya GM yang bisa padamkan lilin.' })
          }
          const session = yield* loadSession(gameId)
          if (session.candlesLit <= 1 || session.ended) return session
          const left = session.candlesLit - 1
          yield* db
            .update(GameSessions)
            .set({ candlesLit: left })
            .where(eq(GameSessions.gameId, gameId))
          yield* db.insert(SessionLog).values({
            gameId,
            message: `Lilin dipadamkan. Sisa ${left}. Truths phase.`,
          })
          return yield* loadSession(gameId)
        }).pipe(Effect.orDie),

      addTruth: ({ gameId, author, text }) =>
        Effect.gen(function* () {
          const session = yield* loadSession(gameId)
          const t = text.trim()
          if (t.length < 4) {
            return yield* new WeakTruth({ message: 'Truth terlalu pendek.' })
          }
          const low = t.toLowerCase()
          for (const b of BANNED_TRUTH) {
            if (low.includes(b)) {
              return yield* new WeakTruth({
                message: `Truth tidak boleh melemahkan Them (terdeteksi: "${b}").`,
              })
            }
          }
          const id = `t_${nanoid(6)}`
          yield* db.insert(Truths).values({
            id,
            gameId,
            author,
            text: t,
            candleLeft: session.candlesLit,
          })
          yield* db.insert(SessionLog).values({
            gameId,
            message: `Truth oleh ${author}: ${t}`,
          })
          return new TruthView({
            id,
            author,
            text: t,
            candleLeft: session.candlesLit,
          })
        }).pipe(Effect.orDie),

      updateCards: ({ gameId, clientId, cards }) =>
        Effect.gen(function* () {
          yield* loadSession(gameId)
          yield* db
            .update(SessionPlayers)
            .set({
              virtue: cards.virtue,
              vice: cards.vice,
              moment: cards.moment,
              brink: cards.brink,
              burnedVirtue: cards.burnedVirtue,
              burnedVice: cards.burnedVice,
              burnedMoment: cards.burnedMoment,
              burnedBrink: cards.burnedBrink,
              hopeDie: cards.hopeDie,
              alive: cards.alive,
            })
            .where(
              and(
                eq(SessionPlayers.gameId, gameId),
                eq(SessionPlayers.clientId, clientId),
              ),
            )
          return yield* loadSession(gameId)
        }).pipe(Effect.orDie),

      endGame: ({ gameId, lobbyId, clientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          if (lobby.gmId !== clientId) {
            return yield* new NotGM({ message: 'Hanya GM yang bisa akhiri game.' })
          }
          yield* db
            .update(GameSessions)
            .set({ candlesLit: 0, ended: true })
            .where(eq(GameSessions.gameId, gameId))
          yield* db.insert(SessionLog).values({
            gameId,
            message: 'These things are true. The world is dark.',
          })
          return yield* loadSession(gameId)
        }).pipe(Effect.orDie),

      resetSession: ({ gameId, lobbyId, clientId }) =>
        Effect.gen(function* () {
          const lobby = yield* loadLobby(lobbyId)
          if (lobby.gmId !== clientId) {
            return yield* new NotGM({ message: 'Hanya GM yang bisa reset sesi.' })
          }
          yield* loadSession(gameId)
          yield* db
            .update(GameSessions)
            .set({ candlesLit: 10, ended: false })
            .where(eq(GameSessions.gameId, gameId))
          yield* db.insert(SessionLog).values({
            gameId,
            message: 'Sesi di-reset GM. 10 lilin menyala kembali.',
          })
          return yield* loadSession(gameId)
        }).pipe(Effect.orDie),
    })

    const rpcFetch = RpcServer.toHttpEffect(GameRpcs).pipe(
      Effect.provide(Layer.mergeAll(handlers, RpcSerialization.layerJson)),
    )

    // RpcWorker takes the HttpEffect itself (an Effect producing the
    // per-request handler). Public worker (workers.dev URL) + CORS so the
    // TanStack frontend can call it directly.
    return Effect.map(
      rpcFetch,
      (fetch) =>
        HttpServerRequest.HttpServerRequest.pipe(
          Effect.flatMap((req) =>
            req.method === 'OPTIONS'
              ? Effect.succeed(
                  HttpServerResponse.empty({ status: 204, headers: CORS }),
                )
              : Effect.map(fetch, (res) => HttpServerResponse.setHeaders(res, CORS)),
          ),
        ),
    )
  }).pipe(Effect.provide(Cloudflare.Hyperdrive.ConnectBinding)),
) {}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
