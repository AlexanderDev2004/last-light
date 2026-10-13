/**
 * Knocking: the moment between entering a code and the host's room
 * answering. Honest about the wait — WebRTC discovery can take a while.
 */
export default function JoiningScreen({
  code,
  name,
  onCancel,
}: {
  code: string
  name: string
  onCancel: () => void
}) {
  return (
    <div className="wrap rise" style={{ paddingTop: 'clamp(2rem, 6vh, 4rem)', paddingBottom: '5rem' }}>
      <p className="label m-0">Knocking</p>
      <h1 className="ritual m-0 mt-2 text-[clamp(1.6rem,4vw,2.5rem)]">Looking for room {code}</h1>
      <p className="prose-measure mt-4 text-[0.95rem] leading-7 text-[var(--text-secondary)]">
        Joining as {name}. The room answers when the host's browser is awake — this can take a
        few seconds, sometimes more.
      </p>
      <p className="mt-2 mb-0 text-[0.8rem] leading-5 text-[var(--text-muted)]">
        Nothing answers? Check the code, or ask the host to confirm their tab is still open.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <span className="dot-pulse" aria-hidden="true" />
        <button type="button" className="btn-text" onClick={onCancel}>
          Never mind
        </button>
      </div>
    </div>
  )
}
