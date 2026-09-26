# Last Light — a Ten Candles companion

A quiet web companion for the tabletop horror game **Ten Candles** by Stephen Dewey
(Cavalry Games): ten virtual candles, shared dice, character cards, a truths journal,
and last-words recordings for the ending.

> The world has been dark for ten days. Every character dies. The story is what happens
> before the final flame goes out.

## What it does

- **Landing** — the premise, how play works, and room creation (`Create a room` /
  `Join a room` by code or link).
- **Lobby** — room code, keeper identity, muster roll with ready states, invite copy,
  and a deliberate `Begin the story` action.
- **Session companion** — ten extinguishable virtual candles as the central timeline,
  a dice panel (light pool vs. the dark's pool, hope die), burnable Virtue / Vice /
  Moment / Brink cards, a truths journal, last-words audio recorder, and a session
  chronicle. Two columns on desktop, stacked on mobile.

Rooms travel between browsers with no account and no server to run: tabs sync
directly over WebRTC (Trystero). A room lives as long as at least one tab keeps it
open.

## Stack

- [TanStack Start](https://tanstack.com/start) + React 19 + Tailwind CSS 4 (pnpm)
- [Effect](https://effect.website) `RpcWorker` backend + [Drizzle ORM](https://orm.drizzle.team) + Postgres (Neon) via Cloudflare Hyperdrive
- [Alchemy](https://alchemy.run) for Cloudflare deployment (`alchemy.run.ts`)
- PocketBase adapter included as an optional self-hosted tier

## Run it

```sh
pnpm install
pnpm dev        # http://localhost:3000
```

Backend priority is automatic: Effect (`VITE_BACKEND_URL`) → PocketBase
(`VITE_PB_URL` or the on-page switch) → direct browser-to-browser link → this
browser only. See [DEPLOY.md](./DEPLOY.md) for Cloudflare deployment.

## Project layout

```
alchemy.run.ts          Cloudflare stack: website + RPC backend + Neon + Hyperdrive
src/backend/            Effect RPC contract (rpc.ts), Drizzle schema, DB resources, API worker
src/routes/             Landing (/), lobby (/lobby/$lobbyId), session (/session/$gameId/$lobbyId)
src/components/        Candles, dice, character cards, truths, last-words recorder
src/lib/               Backend adapters (Effect → PocketBase → P2P → local), P2P transport
migrations/            Generated at deploy time by Drizzle.Schema (committed)
```

## License

MIT — see [LICENSE](./LICENSE). Ten Candles itself is a game by Stephen Dewey,
published by Cavalry Games; this is an unofficial companion.
