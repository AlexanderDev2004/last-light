import * as cf from 'cloudflare:workers'
import type { WebsiteEnv } from '../alchemy.run.ts'

// In TanStack Start dev, `import { env } from "cloudflare:workers"` at the
// top level breaks (modules evaluate outside the Worker request context).
// The Proxy defers property access until a handler actually runs.
export const env = new Proxy({} as WebsiteEnv, {
  get(_, prop) {
    return (cf.env as unknown as Record<string | symbol, unknown>)[prop]
  },
})
