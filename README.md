# Ten Candles — a table companion

A quiet web companion for the tabletop horror game **Ten Candles** by Stephen Dewey
(Cavalry Games). Ten virtual candles, communal dice, character stacks, the ritual of
truths, and last-words recordings — one screen at the center of the table, no server,
no accounts.

> The world has been dark for ten days. Every character dies. The story is what happens
> before the final flame goes out.

## How a night plays

The app follows the real rules of the game, phase by phase:

0. **The lobby** — create a room and share its code, join with a code, or keep one
   screen to yourselves. Rooms are local-only for now; cross-device sync and the
   ready-up gate land in the lobby issues (#1–#6).
1. **The gathering** — name the keeper of the dark, seat three to five survivors, and
   write each stack: **virtue, vice, moment**, and a **brink** written in secret. Choose
   which card sits on top; it burns first. Optionally record a final message per
   survivor — played back only when every light is gone.
2. **That which is true** — each scene opens with the ritual: one truth per lit candle,
   spoken around the table, building on each other, never undone. The keeper opens the
   night: *"These things are true: the world is dark, and you are alive."*
3. **The scene** — ten candles burn on screen. Conflicts roll the whole communal pool
   (one die per lit candle): any six succeeds and the players narrate; every one is set
   aside for the rest of the scene; no six at all fails, and the keeper darkens a candle
   to end the scene. The keeper rolls their own pool — one die per darkened candle — and
   wins only ties they beat, not matches.
4. **The stack burns** — burning the top card (virtue or vice) rerolls every die showing
   one. Living your moment lights a **hope die** (it succeeds on 5–6, and a one does not
   take it). Past the brink — revealed only once everything above it has burned — the
   whole pool is thrown again on a failure.
5. **The last stand** — when the final candle goes out there are no more dice. Any
   conflict can now succeed only in exchange for a character's life. When all have
   fallen, one last truth is spoken, the recordings play, and the screen goes dark.

State lives in `localStorage` and survives reloads; "New night" deliberately ends the
night for good.

## Run it

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # engine tests (vitest)
pnpm typecheck
pnpm build
```

No backend, no environment variables. Dim the room, light real candles if you can.

## Project layout

```
src/game/engine.ts     Pure reducer: the whole ruleset (types.ts alongside, tests too)
src/components/        One component per phase: gathering, truths, scene, last stand, epilogue
src/components/        DicePanel (roll overlay + dice physics), recorder (IndexedDB), rules
src/lib/dice-tray.ts   Dice physics canvas for the roll overlay
src/lib/storage.ts     localStorage persistence + IndexedDB recordings
src/styles.css         Design tokens + component styles — flat black, monospace, one flame accent
```

## License

MIT — see [LICENSE](./LICENSE). Ten Candles itself is a game by Stephen Dewey,
published by Cavalry Games; this is an unofficial companion. Buy the game — it comes
with real candles and real dice.
