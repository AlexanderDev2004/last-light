import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Drizzle from 'alchemy/Drizzle'
import * as Neon from 'alchemy/Neon'
import * as Effect from 'effect/Effect'

export const NeonDatabase = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack

  const schema = yield* Drizzle.Schema('Schema', {
    schema: './src/backend/schema.ts',
    out: './migrations',
  })

  const project = stage.startsWith('pr-')
    ? yield* Neon.Project.ref('Database', { stage: `staging-${stage}` })
    : yield* Neon.Project('Database', { region: 'aws-us-east-1' })

  const branch = yield* Neon.Branch('Branch', {
    project,
    migrations: schema,
  })

  return { project, branch, schema }
})

export const Hyperdrive = Effect.gen(function* () {
  const { branch } = yield* NeonDatabase
  return yield* Cloudflare.Hyperdrive.Connection('Hyperdrive', {
    origin: branch.origin,
    dev: branch.pooledOrigin,
    caching: { disabled: true },
  })
})
