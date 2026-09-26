import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: Guide,
})

function Guide() {
  return (
    <div className="wrap px-0 pt-12 pb-16 sm:pt-16">
      <p className="label">How to play</p>
      <h1 className="ritual m-0 mt-3 max-w-[20ch] text-4xl leading-[1.08] sm:text-6xl">
        Ten candles. Ten scenes. No survivors.
      </h1>
      <p className="prose-measure mt-6 max-w-[68ch] text-[1.05rem] leading-8 text-[var(--text-secondary)]">
        Ten Candles is a tragic horror tabletop game, not a survival game. Every character dies
        when the last candle goes out. The game is about what the living do with the hours they
        have left — what they protect, what they confess, and what they carry into the dark.
      </p>

      <hr className="rule my-10" />

      <section aria-labelledby="h-player">
        <p className="label">For players</p>
        <h2 id="h-player" className="ritual m-0 mt-2 text-3xl">
          Four cards
        </h2>
        <div className="prose-measure mt-4 max-w-[68ch] space-y-4 leading-8 text-[var(--text-secondary)]">
          <p className="m-0">
            <strong className="text-[var(--text-primary)]">Virtue</strong>, given by the player on
            your left, and <strong className="text-[var(--text-primary)]">vice</strong>, given by
            the player on your right. Together they describe who you were before the dark.
          </p>
          <p className="m-0">
            <strong className="text-[var(--text-primary)]">Moment</strong> is yours to write: a
            condition under which your character finds hope. Fulfilling it earns a hope die, which
            succeeds on a five or six and is never lost to the dark.
          </p>
          <p className="m-0">
            <strong className="text-[var(--text-primary)]">Brink</strong> is a secret written about
            you by someone else, beginning “I have seen you…”. When a roll fails and the fiction
            matches, it lets you reroll the whole pool.
          </p>
          <p className="m-0">
            Burning virtue or vice lets you reroll every die showing one. Burn cards in the order
            they were stacked. What is burned is gone for the rest of the night.
          </p>
        </div>
      </section>

      <hr className="rule my-10" />

      <section aria-labelledby="h-gm">
        <p className="label">For the game master</p>
        <h2 id="h-gm" className="ritual m-0 mt-2 text-3xl">
          Keeper of the dark
        </h2>
        <div className="prose-measure mt-4 max-w-[68ch] space-y-4 leading-8 text-[var(--text-secondary)]">
          <p className="m-0">
            Choose what waits in the dark. Give it habits and signs, but only one weakness: light.
            Frame each scene narrowly and press for action. Call for a roll only when something is
            at stake.
          </p>
          <p className="m-0">
            Every extinguished candle feeds your dark pool. When you meet or beat the players’
            sixes, their success still holds — but you narrate the price.
          </p>
          <p className="m-0">
            Lead the truths. Refuse any truth that weakens what hunts them. When one candle
            remains, stop extinguishing: failures become deaths, narrated by the dying. When all
            are gone, put out the last flame and play back their final messages in the dark.
          </p>
        </div>
      </section>

      <hr className="rule my-10" />

      <section aria-labelledby="h-safety">
        <p className="label">At the table</p>
        <h2 id="h-safety" className="ritual m-0 mt-2 text-3xl">
          Care before candles
        </h2>
        <p className="prose-measure mt-4 max-w-[68ch] leading-8 text-[var(--text-secondary)]">
          Agree on lines and veils before you begin, and keep a way to pause that everyone
          trusts. If open flame is not safe where you play, use the virtual candles in this
          companion instead. If you burn real cards, keep them over metal and clear of everything
          else.
        </p>
      </section>
    </div>
  )
}
