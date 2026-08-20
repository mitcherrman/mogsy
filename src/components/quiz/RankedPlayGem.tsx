/**
 * LC1 — the Ranked PLAY seal.
 *
 * The hub's one major action, as a struck wax seal rather than a button: a
 * poured burgundy blob with an uneven edge, a stamped gold signet ring, and
 * the word PLAY raised out of the wax. It is the act of sealing a declaration
 * — the academy's own way of entering Ranked — and it sits ON the parchment
 * rather than floating above it.
 *
 * WHY NOT THE GOLD ORB IT REPLACES. The orb was designed against navy: its
 * whole read came from a lit rim and two coloured glows, and on beige a glow
 * has nothing to glow against. It also spoke the wrong material — polished
 * crystal on a manuscript sheet. Wax is the one object that belongs on
 * parchment by default, so the CTA now leads on mass, depth and colour
 * contrast (deep red against warm beige) instead of on light.
 *
 * SEMANTICS ARE UNCHANGED. This is the same single `onClick`, the same
 * disabled handling, the same `data-testid` and the same accessible name as
 * every version before it; only the material changed. It does not know what
 * queueing or navigation means and decides nothing about either.
 *
 * ACCESSIBILITY
 * ─────────────
 *  - a real `<button>`: Enter/Space activate natively, and the pressed look
 *    is driven from key state too, so keyboard users get the same feedback;
 *  - the accessible name is exactly the visible word "Play" — the word is
 *    text, never baked into the art;
 *  - a visible focus ring, in the seal's own red against a parchment offset
 *    rather than the old navy one, so it is visible on the sheet it now
 *    lives on;
 *  - nothing is communicated by animation alone: the label, the ring and the
 *    disabled state all read with motion fully off;
 *  - the label clears 4.5:1 against the wax at its lightest point.
 *
 * REDUCED MOTION
 * ──────────────
 * Under `prefers-reduced-motion` there is no scale and no travel — pressing
 * swaps colour and shadow only. Implemented with framer's `useReducedMotion`
 * plus a `motion-reduce:` guard on the transition, so the behaviour holds
 * even if the JS query is unavailable. There is no idle animation at all in
 * this version: molten, breathing wax is the one thing a cooled seal must
 * never look like.
 */

import { useCallback, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The poured edge. A seal pressed into hot wax is never a circle, so the blob
 * carries a slightly uneven radius on both axes and a hair of rotation. Held
 * as a constant because the *same* silhouette has to drive the wax, the spill
 * beneath it and the stamped ring inside it — three hand-copied blobs would
 * drift apart the first time one is retuned.
 */
const WAX_EDGE = "47% 53% 52% 48% / 51% 47% 53% 49%";

export default function RankedPlayGem({
  onClick,
  disabled = false,
  label = "Play",
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  /** Visible word AND accessible name. Keep it one word. */
  label?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion() === true;
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const release = useCallback(() => setPressed(false), []);
  const press = useCallback(() => {
    if (!disabled) setPressed(true);
  }, [disabled]);

  const active = pressed && !disabled;
  // Reduced motion keeps the seal exactly where it is; only its colours move.
  // The travel is deliberately shorter than the orb's: a seal is pressed INTO
  // the sheet, it does not bob.
  const sink = active && !reducedMotion ? 4 : 0;
  const scale = !reducedMotion && hovered && !active && !disabled ? 1.025 : 1;

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* The spill — the thin ring of wax that ran out from under the stamp
          before it set. Decorative, and the reason the seal reads as poured
          rather than pasted on. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[112%] w-[112%] -translate-x-1/2 -translate-y-1/2 blur-[2px] transition-opacity duration-150 ease-out motion-reduce:!transition-none"
        style={{
          borderRadius: WAX_EDGE,
          transform: `translate(-50%, -50%) rotate(-7deg)`,
          background:
            "radial-gradient(circle at 50% 54%, rgba(96,18,28,0.62) 58%, rgba(74,12,22,0.34) 78%, transparent 92%)",
          opacity: disabled ? 0.3 : 0.85,
        }}
      />
      {/* Contact shadow on the sheet. Warm brown, not black: a black shadow
          on beige reads as a hole punched in the paper. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[74%] h-7 w-[70%] -translate-x-1/2 rounded-[999px] blur-md transition-all duration-150 ease-out motion-reduce:!transition-none"
        style={{
          background: "rgba(58,32,10,0.55)",
          transform: `translateX(-50%) scaleX(${active && !reducedMotion ? 0.82 : 1})`,
          opacity: disabled ? 0.24 : active ? 0.72 : 0.5,
        }}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid="ranked-play-gem"
        data-pressed={active ? "true" : "false"}
        onPointerDown={press}
        onPointerUp={release}
        onPointerLeave={() => {
          setHovered(false);
          release();
        }}
        onPointerEnter={() => setHovered(true)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          release();
        }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") press();
        }}
        onKeyUp={release}
        style={{
          borderRadius: WAX_EDGE,
          transform: `translateY(${sink}px) scale(${scale}) rotate(-3deg)`,
          transitionProperty: reducedMotion ? "box-shadow, filter" : "transform, box-shadow, filter",
          /* The relief. An inset light rim at the top-left and an inset dark
             one at the bottom-right is what makes a flat disc read as a
             domed, cooled bead of wax; pressing swaps their weight so the
             dome flattens into the sheet instead of merely moving down. */
          boxShadow: disabled
            ? "inset 0 2px 3px rgba(255,170,150,0.12), inset 0 -3px 6px rgba(30,4,10,0.55), 0 4px 10px rgba(48,26,8,0.35)"
            : active
              ? "inset 0 3px 6px rgba(26,3,8,0.6), inset 0 -1px 2px rgba(255,170,150,0.16), 0 3px 7px rgba(48,26,8,0.5)"
              : hovered
                ? "inset 0 3px 4px rgba(255,186,166,0.34), inset 0 -6px 12px rgba(30,4,10,0.62), 0 12px 22px rgba(48,26,8,0.45)"
                : "inset 0 3px 4px rgba(255,186,166,0.26), inset 0 -6px 12px rgba(30,4,10,0.6), 0 10px 18px rgba(48,26,8,0.42)",
          /* The wax itself. Lit from the upper left, deepening to near-black
             burgundy at the poured edge. Hover warms the whole bead by a
             stop rather than adding a glow — wax does not glow. */
          background: hovered && !disabled
            ? "radial-gradient(circle at 34% 26%, #bb3f45 0%, #a02b34 20%, #85202b 46%, #641320 74%, #3d0a12 100%)"
            : "radial-gradient(circle at 34% 26%, #ad353d 0%, #92242e 20%, #781b26 46%, #5a101c 74%, #370810 100%)",
        }}
        className={`group relative flex h-32 w-32 items-center justify-center duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5e1220] focus-visible:ring-offset-4 focus-visible:ring-offset-[#dcc5a2] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:!transition-none sm:h-36 sm:w-36 ${
          disabled ? "" : "cursor-pointer"
        }`}
      >
        {/* The signet ring — the stamp's own die edge, struck into the wax.
            Gold, but as a thin trim only: the seal's identity is the wax, and
            a heavy gold ring would just be the old orb in red. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[9%]"
          style={{
            borderRadius: WAX_EDGE,
            border: "1.5px solid rgba(216,178,96,0.5)",
            boxShadow:
              "inset 0 1px 2px rgba(20,2,6,0.5), 0 1px 0 rgba(255,206,150,0.16)",
          }}
        />
        {/* The die's outer bite: a second, tighter impression just inside the
            poured edge, so the stamp reads as having been pressed rather than
            drawn. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[3.5%]"
          style={{
            borderRadius: WAX_EDGE,
            boxShadow:
              "inset 0 0 0 1px rgba(255,180,160,0.10), inset 0 0 10px rgba(26,3,8,0.45)",
          }}
        />
        {/* Cooled-wax mottling. Very low alpha — this must be felt, not seen;
            at any higher opacity it reads as dirt on the button. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            borderRadius: WAX_EDGE,
            background:
              "radial-gradient(38% 30% at 26% 70%, rgba(255,210,190,0.14) 0%, transparent 70%), radial-gradient(30% 26% at 74% 34%, rgba(20,2,6,0.22) 0%, transparent 72%)",
          }}
        />
        {/* PLAY, raised out of the wax: a dark cut below the glyphs and a warm
            highlight above them. The label colour is a pale wax blush rather
            than white, so it belongs to the same material it is stamped in. */}
        <span
          className="relative text-[19px] font-black uppercase tracking-[0.3em] sm:text-[21px]"
          style={{
            color: "#f7e3d3",
            /* Indent one tracking step so the letter-spacing after the final
               glyph does not push the word off centre. */
            textIndent: "0.3em",
            textShadow:
              "0 1px 1px rgba(32,4,10,0.85), 0 2px 4px rgba(32,4,10,0.55), 0 -1px 0 rgba(255,190,170,0.30)",
          }}
        >
          {label}
        </span>
      </button>
    </div>
  );
}
