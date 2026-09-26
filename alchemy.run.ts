import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Drizzle from 'alchemy/Drizzle'
import * as Neon from 'alchemy/Neon'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import Backend from './src/backend/api.ts'
import { Hyperdrive, NeonDatabase } from './src/backend/database.ts'

export class Website extends Cloudflare.Website.Vite<Website>()('Website', {
  // NOTE: no BACKEND service binding — the installed TanStack Start
  // file-route API has no `server.handlers` option for a same-origin /rpc
  // proxy. The backend is public (workers.dev URL + CORS) and the browser
  // calls it directly via VITE_BACKEND_URL (see src/rpc-client.ts).
}) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>

export default Alchemy.Stack(
  'TenCandles',
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      Drizzle.providers(),
      Neon.providers(),
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { branch } = yield* NeonDatabase
    const hd = yield* Hyperdrive
    const backend = yield* Backend
    const website = yield* Website

    return {
      websiteUrl: website.url.as<string>(),
      backendUrl: backend.url.as<string>(),
      branchId: branch.branchId,
      hyperdriveId: hd.hyperdriveId,
    }
  }),
)
