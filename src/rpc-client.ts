import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc'
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError'
import { GameRpcs } from './backend/rpc.ts'

function backendUrl() {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
          ?.VITE_BACKEND_URL
      : undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // Same-origin fallback (works if a /rpc proxy is added later).
  return ''
}

class GameRpc extends Context.Service<
  GameRpc,
  RpcClient.FromGroup<typeof GameRpcs, RpcClientError>
>()('ten-candles/GameRpc') {}

const GameRpcLive = Layer.effect(GameRpc, RpcClient.make(GameRpcs)).pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({ url: `${backendUrl()}/` }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(RpcSerialization.layerJson),
    ),
  ),
)

const runtime = ManagedRuntime.make(GameRpcLive)

type Client = RpcClient.FromGroup<typeof GameRpcs, RpcClientError>

/** Run one typed RPC call. Errors are typed values (e.g. LobbyNotFound). */
export function rpc<A, E>(fn: (client: Client) => Effect.Effect<A, E>): Promise<A> {
  return runtime.runPromise(GameRpc.pipe(Effect.flatMap(fn)))
}

/** Convenience wrappers mirroring GameRpcs procedures. */
export const api = {
  createLobby: (payload: {
    roomName: string
    userName: string
    clientId: string
    maxPlayers: number
  }) => rpc((c) => c.createLobby(payload)),
  joinLobby: (payload: { lobbyId: string; userName: string; clientId: string }) =>
    rpc((c) => c.joinLobby(payload)),
  getLobby: (payload: { lobbyId: string }) => rpc((c) => c.getLobby(payload)),
  toggleReady: (payload: { lobbyId: string; clientId: string }) =>
    rpc((c) => c.toggleReady(payload)),
  transferGM: (payload: { lobbyId: string; clientId: string; toClientId: string }) =>
    rpc((c) => c.transferGM(payload)),
  startGame: (payload: { lobbyId: string; clientId: string }) =>
    rpc((c) => c.startGame(payload)),
  getSession: (payload: { gameId: string; lobbyId: string }) =>
    rpc((c) => c.getSession(payload)),
  extinguishCandle: (payload: { gameId: string; lobbyId: string; clientId: string }) =>
    rpc((c) => c.extinguishCandle(payload)),
  addTruth: (payload: {
    gameId: string
    lobbyId: string
    author: string
    text: string
  }) => rpc((c) => c.addTruth(payload)),
  updateCards: (payload: {
    gameId: string
    lobbyId: string
    clientId: string
    cards: {
      virtue: string
      vice: string
      moment: string
      brink: string
      burnedVirtue: boolean
      burnedVice: boolean
      burnedMoment: boolean
      burnedBrink: boolean
      hopeDie: boolean
      alive: boolean
    }
  }) => rpc((c) => c.updateCards(payload)),
  endGame: (payload: { gameId: string; lobbyId: string; clientId: string }) =>
    rpc((c) => c.endGame(payload)),
  resetSession: (payload: { gameId: string; lobbyId: string; clientId: string }) =>
    rpc((c) => c.resetSession(payload)),
}
