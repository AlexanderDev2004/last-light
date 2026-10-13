/**
 * The rules of the night, condensed from Cavalry Games' Ten Candles by
 * Stephen Dewey. Shown to the table whenever the question arises.
 */
import { createPortal } from 'react-dom'

export default function RulesModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="modal-root" role="dialog" aria-modal="true" aria-label="The rules of Ten Candles">
      <button type="button" className="modal-backdrop" aria-label="Close the rules" onClick={onClose} />
      <article className="modal-card scroll-thin">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label">How it plays</p>
            <h2 className="ritual m-0 mt-1 text-3xl">The rules of the night</h2>
          </div>
          <button type="button" className="btn btn-quiet shrink-0 !py-1.5" onClick={onClose}>
            Close
          </button>
        </div>

        <hr className="rule my-5" />

        <div className="prose-measure space-y-7 leading-8 text-[var(--text-secondary)]">
          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">The table</h3>
            <p className="m-0 mt-2">
              One game master — the keeper of the dark — and three to five players, in a
              pitch-black room, by the light of ten candles. Every character dies when the last
              candle goes out. The game is not about surviving; it is about what you do with the
              hours you have left.
            </p>
          </section>

          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">The stack of cards</h3>
            <p className="m-0 mt-2">
              Each survivor is a stack: a <strong className="text-[var(--text-primary)]">virtue</strong>{' '}
              (something they are proud of), a{' '}
              <strong className="text-[var(--text-primary)]">vice</strong> (something they are
              ashamed of), a <strong className="text-[var(--text-primary)]">moment</strong>{' '}
              (something yet to be lived that could still bring hope), and a{' '}
              <strong className="text-[var(--text-primary)]">brink</strong>, written in secret —
              what they become when terror and despair push them past their limit. Cards burn in
              stack order, and what burns is gone.
            </p>
          </section>

          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">That which is true</h3>
            <p className="m-0 mt-2">
              Every scene opens with the table speaking as many truths as there are candles still
              lit — going around the table, players and keeper alike, one truth at a time,
              starting with whoever darkened the last candle. Truths become reality. They may
              build on each other; they may never weaken what hunts you.
            </p>
          </section>

          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">Conflicts</h3>
            <p className="m-0 mt-2">
              When the outcome of an action is in doubt, roll the communal pool — ten dice at the
              night's start, refilled each scene up to the number of lit candles.
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-6">
              <li>At least one six: success. The player describes what it wins.</li>
              <li>Every one is set aside — those dice are lost for the rest of the scene.</li>
              <li>No six at all: failure. A candle is darkened and the scene ends.</li>
              <li>
                The keeper rolls alongside, one die per darkened candle. When They roll more
                sixes, They narrate the outcome — even a success, and what it costs.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">Burning cards</h3>
            <p className="m-0 mt-2">
              A survivor may burn their topmost card when it matters, working it into the story:
              burning a trait rerolls every die showing one — to chase a six after failure, or to
              lose fewer dice after success. When the moment comes true in the story, it is
              lived: the card burns and the survivor's{' '}
              <strong className="text-[var(--text-primary)]">hope die</strong> is lit — a five or
              six counts, and it is never lost to ones. When everything above the brink has
              burned, a failed conflict can be answered by revealing it: the whole pool is thrown
              again.
            </p>
          </section>

          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">The Last Stand</h3>
            <p className="m-0 mt-2">
              When the final candle goes out there are no more dice and no more scenes. The only
              candle left is each character's life: any conflict can now succeed only in exchange
              for it. When the last character falls, the last truth is spoken and the final
              recordings play.
            </p>
          </section>

          <section>
            <h3 className="ritual m-0 text-xl text-[var(--text-primary)]">Before you begin</h3>
            <p className="m-0 mt-2">
              Agree on lines and veils, and keep a real light within reach for when the night is
              over. If you burn real cards, burn them over a bowl of water.
            </p>
          </section>
        </div>

        <p className="mt-8 text-[0.82rem] leading-6 text-[var(--text-muted)]">
          Condensed from <em>Ten Candles</em> by Stephen Dewey (Cavalry Games) and the designer's
          own rules overview. This companion is unofficial; buy the game — it comes with real
          candles and real dice.
        </p>
      </article>
    </div>,
    document.body,
  )
}
