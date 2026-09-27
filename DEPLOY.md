# Ten Candles Web 🕯️

Companion + tutorial web untuk TTRPG **Ten Candles** (tragic horror, no survivors).
Stack: **TanStack Start** (pnpm) + **Effect** backend + **Postgres (Neon)** via
**Hyperdrive**, deploy ke **Cloudflare** dengan **Alchemy**.

## Jalankan lokal (mode sekarang)

```powershell
pnpm install
pnpm dev            # frontend http://localhost:3000 (store lokal / PocketBase fallback)
```

## Arsitektur Cloudflare (baru)

```
Browser (React)
  │  src/rpc-client.ts (Effect RpcClient, JSON)      VITE_BACKEND_URL
  ▼
Backend Worker — Effect RPC + Drizzle + Hyperdrive ──► Neon Postgres
  src/backend/api.ts (RpcWorker, public + CORS)
  src/backend/schema.ts (lobbies, lobby_players, game_sessions, ...)
  src/backend/database.ts (Neon Project/Branch + Hyperdrive)
Website Worker — TanStack Start (SSR + static)
  alchemy.run.ts (Stack TenCandles)
```

Satu `GameRpcs` (`src/backend/rpc.ts`) jadi kontrak tunggal: dipakai backend
(RpcWorker) dan browser (RpcClient). Error typed (LobbyNotFound, NotGM, ...).

## Deploy ke Cloudflare

Butuh akun Cloudflare + Neon. Auth disimpan di profile Alchemy
(jangan export token manual):

```powershell
pnpm alchemy profile edit --add Cloudflare   # OAuth browser / API token
pnpm alchemy profile edit --add Neon         # NEON_API_KEY
pnpm deploy:dry                              # lihat plan dulu
pnpm deploy                                  # provision Neon + Hyperdrive + 2 Workers
```

Output `backendUrl` → set sebagai `VITE_BACKEND_URL` (env / CI) lalu deploy
sekali lagi agar frontend membundle URL backend:

```powershell
$env:VITE_BACKEND_URL = "https://ten-candles-backend.<akun>.workers.dev"
pnpm deploy
```

Dev cloud (frontend lokal + resource cloud asli):

```powershell
pnpm dev:cloud
```

## Status

- [x] Landing `/`, lobby `/lobby/[id]`, session `/session/[gameId]/[lobbyId]`
- [x] Backend Effect RPC + Drizzle schema + Neon/Hyperdrive stack (`tsc` + `vite build` hijau)
- [x] Direct link (WebRTC via Trystero, no server): rooms travel between open tabs
- [ ] Wire UI ke `src/rpc-client.ts` (saat ini UI masih pakai store lokal) + `RegistryProvider`
- [ ] `pnpm deploy` (butuh auth Cloudflare/Neon interaktif — belum dijalankan)

## Direct link (no server multiplayer)

Tanpa Effect backend dan tanpa PocketBase, room tetap bisa jalan antar device
lewat WebRTC (`@trystero-p2p/torrent`, `src/lib/p2p.ts`):

- Prioritas transport: Effect → PocketBase → direct link → browser ini saja.
- Setiap tab yang membuka `/lobby/[code]` bergabung ke swarm room itu dan
  bertukar state penuh; merge per-player (rev tertinggi menang), truth union
  per id, log union dedup. Hanya keeper yang boleh menulis gm/status/candles.
- Tab yang baru datang mengirim hello dan menunggu state sampai ~8 detik;
  selama menunggu terlihat status "Listening…".
- Room hidup selama minimal satu tab terbuka. Kalau semua tab tutup, room hilang
  — tidak ada yang menyimpannya.
- Penemuan peer memakai dua kawanan signaling independen: WebSocket tracker
  (daftar eksplisit di `src/lib/p2p.ts`) dan relay Nostr — kawanan mana pun
  yang tersambung lebih dulu yang menang. Keduanya diverifikasi 2026-09-27. Domain tracker adalah
  infrastruktur torrent — sebagian ad-blocker / jaringan kantor memblokirnya,
  dan kalau begitu direct link tidak bisa tersambung sama sekali.
