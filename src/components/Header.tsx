import { Link } from '@tanstack/react-router'

export function FlameMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 3c3.8 4.6 7.6 8.3 7.6 13.3a7.6 7.6 0 0 1-15.2 0C8.4 11.3 12.2 7.6 16 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 13.5c1.5 1.8 2.9 3.2 2.9 5.1a2.9 2.9 0 0 1-5.8 0c0-1.9 1.4-3.3 2.9-5.1z" fill="currentColor" />
    </svg>
  )
}

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(20,18,16,0.92)] backdrop-blur">
      <nav aria-label="Primary" className="wrap flex items-center gap-6 py-3.5">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-[var(--text-primary)] no-underline"
          activeProps={{ className: 'inline-flex items-center gap-2.5 text-[var(--text-primary)] no-underline' }}
        >
          <span className="text-[var(--accent)]">
            <FlameMark />
          </span>
          <span className="ritual text-[1.35rem] leading-none">Last Light</span>
        </Link>

        <div className="flex items-center gap-5 text-[0.92rem] font-semibold">
          <Link
            to="/"
            className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]"
            activeProps={{ className: 'text-[var(--text-primary)] no-underline' }}
          >
            The ritual
          </Link>
          <Link
            to="/about"
            className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]"
            activeProps={{ className: 'text-[var(--text-primary)] no-underline' }}
          >
            How to play
          </Link>
        </div>

        <p className="label m-0 ml-auto hidden !text-[0.68rem] sm:block">Ten Candles companion</p>
      </nav>
    </header>
  )
}
