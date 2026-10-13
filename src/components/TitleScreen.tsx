export default function TitleScreen({
  onBegin,
  onRules,
}: {
  onBegin: () => void
  onRules: () => void
}) {
  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(3rem, 12vh, 8rem)', paddingBottom: '5rem' }}>
      <h1 className="ritual m-0 text-[clamp(2rem,5vw,3.25rem)] leading-tight">Ten Candles</h1>
      <p className="label m-0 mt-2">
        Stephen Dewey · Cavalry Games · 3–5 players · one keeper · 2–3 hours
      </p>

      <p className="prose-measure mt-8 text-[1rem] leading-7 text-[var(--text-secondary)]">
        The world ended ten days ago. Everyone at this table dies before dawn — that part is
        not in question. What happened first is.
      </p>

      <div className="mt-6 max-w-[46ch] border-l-2 border-[var(--flame)] pl-4 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        <p className="m-0">You need: this screen, ten six-sided dice, and a dark room.</p>
        <p className="m-0">
          This screen is the candles. When one goes out, a scene ends. When the last one
          goes out, so does everyone.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button type="button" className="btn btn-primary" onClick={onBegin}>
          Begin the night
        </button>
        <button type="button" className="btn" onClick={onRules}>
          How it plays
        </button>
      </div>

      <hr className="rule my-12" />

      <dl className="m-0 max-w-[72ch] space-y-3 text-[0.9rem] leading-6">
        <div className="flex flex-wrap gap-x-3">
          <dt className="label shrink-0 pt-px">Candles</dt>
          <dd className="m-0 text-[var(--text-secondary)]">
            ten of them, lit at the start — every failed conflict puts one out
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-3">
          <dt className="label shrink-0 pt-px">Dice</dt>
          <dd className="m-0 text-[var(--text-secondary)]">
            the table rolls as many as there are lit candles; a six wins the scene, ones
            are lost to the dark
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-3">
          <dt className="label shrink-0 pt-px">Stacks</dt>
          <dd className="m-0 text-[var(--text-secondary)]">
            each survivor holds four cards — virtue, vice, moment, and a brink written in
            secret — burned from the top as the night spends them
          </dd>
        </div>
      </dl>

      <p className="mt-12 max-w-[68ch] text-[0.8rem] leading-6 text-[var(--text-muted)]">
        An unofficial companion. Play it by real candlelight if you can, and keep a light
        within reach for when the night is over.
      </p>
    </div>
  )
}
