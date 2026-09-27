import { useEffect, useState } from 'react'
import { probeRelays, type RelayProbe } from '../lib/p2p'

/**
 * Self-test for the direct link: opens a raw WebSocket to every signaling
 * endpoint from this browser and reports what is actually reachable.
 * Runs once when the room cannot be found.
 */
export default function LinkDiagnosis() {
  const [probes, setProbes] = useState<RelayProbe[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void probeRelays().then((r) => {
      if (!cancelled) setProbes(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!probes) {
    return <p className="m-0 mt-3 text-[0.9rem] text-[var(--text-muted)]">Testing the link…</p>
  }

  const open = probes.filter((p) => p.open)
  return (
    <div className="mt-4 border-t border-[var(--line)] pt-4" aria-live="polite">
      <p className="label">Link diagnosis — this browser</p>
      {open.length === 0 ? (
        <p className="m-0 mt-2 max-w-[62ch] leading-7 text-[var(--text-secondary)]">
          None of the {probes.length} signaling endpoints answer here. Peer discovery is
          impossible from this browser until that changes — usually an ad-blocker, a VPN, an
          antivirus filtering browser traffic, or an office network. Try a window without
          extensions, another browser, or another network.
        </p>
      ) : (
        <p className="m-0 mt-2 max-w-[62ch] leading-7 text-[var(--text-secondary)]">
          {open.length} of {probes.length} endpoints answer. The link can work — keep this page
          and the keeper’s tab open. If it still never connects, the keeper’s side may be the
          blocked one.
        </p>
      )}
      <ul className="m-0 mt-3 list-none space-y-1 p-0 font-sans text-[0.82rem]">
        {probes.map((p) => (
          <li key={p.url} className="flex items-baseline gap-2">
            <span className={`ready-mark ${p.open ? 'on' : ''}`} aria-hidden="true" />
            <span className={p.open ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
              {p.open ? 'Open' : 'Blocked'} — {p.url.replace('wss://', '')}
              <span className="nums"> · {p.ms}ms</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
