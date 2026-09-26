export default function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--line)]">
      <div className="wrap flex flex-col gap-3 py-10 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="ritual-italic m-0 text-[1.1rem] text-[var(--text-secondary)]">
            These things are true. The world is dark — and we are alive.
          </p>
          <p className="m-0 mt-2 text-[0.85rem] text-[var(--text-muted)]">
            Last Light is an unofficial companion for Ten Candles by Stephen Dewey, published by
            Cavalry Games.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-5 text-[0.88rem] font-semibold">
          <a href="/" className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]">
            The ritual
          </a>
          <a href="/about" className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]">
            How to play
          </a>
        </nav>
      </div>
    </footer>
  )
}
