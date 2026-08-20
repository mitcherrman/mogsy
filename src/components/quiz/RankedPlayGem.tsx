/**
 * LC1 — the Ranked PLAY seal.
 *
 * The hub's one major action, as a struck wax seal rather than a button: a
 * poured burgundy blob with a stamped gold signet ring and the word PLAY
 * raised out of the wax. It is the act of sealing a declaration — the
 * academy's own way of entering Ranked — and it sits ON the parchment rather
 * than floating above it.
 *
 * THE MATERIAL IS NOW ART, NOT CSS
 * ────────────────────────────────
 * The previous version built the wax out of six stacked gradients and two
 * inset shadows. It was directionally right and materially wrong: gradients
 * describe light falling on a sphere, and wax is not a sphere — it is an
 * uneven poured bead with a tool-mark edge, and every attempt to say that in
 * `border-radius` made it read more synthetic, not less. `play-seal.png` is
 * the same object, painted. CSS keeps the two jobs it is actually good at:
 * seating the seal on the sheet, and making it answer a pointer.
 *
 * SEMANTICS ARE UNCHANGED. This is the same single `onClick`, the same
 * disabled handling, the same `data-testid`, the same `data-pressed` and the
 * same accessible name as every version before it; only the material changed.
 * It does not know what queueing or navigation means and decides nothing
 * about either.
 *
 * ACCESSIBILITY
 * ─────────────
 *  - a real `<button>`: Enter/Space activate natively, and the pressed look is
 *    driven from key state too, so keyboard users get the same feedback;
 *  - the accessible name is exactly "Play" — see THE BAKED WORD below;
 *  - a visible focus ring, in the seal's own red against a parchment offset
 *    rather than a browser blue, so it is visible on the sheet it lives on;
 *  - nothing is communicated by animation alone: the name, the ring and the
 *    disabled state all read with motion fully off.
 *
 * THE BAKED WORD — a stated asset limitation
 * ──────────────────────────────────────────
 * `play-seal.png` has PLAY baked into it: a large gold serif word, bevelled
 * and lit to match the wax, occupying the middle half of the disc. Live HTML
 * text is the preference everywhere else in this codebase and it is not
 * available here. Covering the baked word needs an opaque plate across the
 * centre of the seal, which destroys the stamped ring and the wax's own
 * lighting — and setting live text NEAR it produces the one outcome worth
 * avoiding more than either: the word twice.
 *
 * So the visible word is the art, and the accessible name is a visually
 * hidden `.lc-seal__label`. The `label` prop still drives that name, which
 * means it can no longer change what the reader SEES — a caller passing
 * anything other than "Play" would desynchronise the two. If a second verb is
 * ever needed the asset has to be re-cut without the word; that is an asset
 * change, not a code change, and this comment is the note that says so.
 *
 * INTERACTION AND REDUCED MOTION live entirely in `index.css` (`.lc-seal*`),
 * on `:hover`, `:focus-visible`, `:disabled` and `[data-pressed]`. React holds
 * exactly one piece of state — whether the seal is currently being pressed —
 * because that is the one thing a pointer and a keyboard report differently
 * and CSS `:active` cannot see both.
 */

import { useCallback, useState } from "react";

export default function RankedPlayGem({
  onClick,
  disabled = false,
  label = "Play",
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  /**
   * The accessible name. NOT the visible word — that is baked into the art;
   * see THE BAKED WORD above. Keep it one word, and keep it "Play".
   */
  label?: string;
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);

  const release = useCallback(() => setPressed(false), []);
  const press = useCallback(() => {
    if (!disabled) setPressed(true);
  }, [disabled]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="ranked-play-gem"
      data-pressed={pressed && !disabled ? "true" : "false"}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onBlur={release}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") press();
      }}
      onKeyUp={release}
      className={`lc-seal ${className}`}
    >
      {/* The wax itself. A decorative layer, not the button's background: the
          seal is a transparent-cornered silhouette, and a background on the
          control would put a rectangle of shadow and focus ring around it. */}
      <span aria-hidden="true" className="lc-seal__material" />
      {/* The glint — the one moving part. Masked to the seal's own alpha so
          the highlight crosses the wax and not a box around it. */}
      <span aria-hidden="true" className="lc-seal__glint" />
      {/* The accessible name. Visually hidden because the art already says
          the word; see THE BAKED WORD above. */}
      <span className="lc-seal__label sr-only">{label}</span>
    </button>
  );
}
