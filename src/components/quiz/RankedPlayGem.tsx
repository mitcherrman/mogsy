/**
 * LC1 — the Ranked PLAY gem.
 *
 * The hub's one major action, as a large circular crystal rather than a
 * rectangular button: a faceted core, a rim light, and a shadow the press
 * compresses. Idle it breathes, hover it brightens, pointer-down it sinks
 * into its socket, release springs it back.
 *
 * SEMANTICS ARE UNCHANGED. This is the same single `onClick` the old
 * rectangular CTA fired, with the same disabled handling; it does not know
 * what queueing or navigation means and decides nothing about either.
 *
 * ACCESSIBILITY
 * ─────────────
 *  - a real `<button>`: Enter/Space activate natively, and the pressed look
 *    is driven from key state too, so keyboard users get the same feedback;
 *  - the accessible name is exactly the visible word "Play" — the word is
 *    text, never baked into the art;
 *  - a visible focus ring that does not depend on the glow;
 *  - nothing is communicated by animation alone: the label, the ring and the
 *    disabled state all read with motion fully off.
 *
 * REDUCED MOTION
 * ──────────────
 * Under `prefers-reduced-motion` there is no idle shimmer, no scale, and no
 * travel — pressing swaps colour and glow only. Implemented with framer's
 * `useReducedMotion` plus a `motion-reduce:` guard on the transition, so the
 * behaviour holds even if the JS query is unavailable.
 */

import { useCallback, useState } from "react";
import { useReducedMotion } from "framer-motion";

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
  // Reduced motion keeps the gem exactly where it is; only its colours move.
  const sink = active && !reducedMotion ? 6 : 0;
  const scale = !reducedMotion && hovered && !active && !disabled ? 1.03 : 1;

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* Socket — the shadow the gem compresses into. Decorative. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[76%] h-6 w-[62%] -translate-x-1/2 rounded-[999px] blur-md transition-all duration-150 ease-out motion-reduce:!transition-none"
        style={{
          background: "rgba(0,0,0,0.72)",
          transform: `translateX(-50%) scaleX(${active && !reducedMotion ? 0.78 : 1})`,
          opacity: disabled ? 0.35 : active ? 0.9 : 0.65,
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
          transform: `translateY(${sink}px) scale(${scale})`,
          transitionProperty: reducedMotion ? "box-shadow, filter" : "transform, box-shadow, filter",
          boxShadow: disabled
            ? "0 0 0 1px rgba(201,168,76,0.22) inset, 0 6px 14px rgba(0,0,0,0.5)"
            : active
              ? "0 0 0 1px rgba(240,215,140,0.75) inset, 0 0 26px rgba(201,168,76,0.55), 0 4px 10px rgba(0,0,0,0.7)"
              : hovered
                ? "0 0 0 1px rgba(240,215,140,0.7) inset, 0 0 58px rgba(201,168,76,0.6), 0 0 34px rgba(110,200,240,0.4), 0 16px 30px rgba(0,0,0,0.7)"
                : "0 0 0 1px rgba(240,215,140,0.5) inset, 0 0 38px rgba(201,168,76,0.4), 0 0 22px rgba(110,200,240,0.24), 0 16px 30px rgba(0,0,0,0.7)",
          background:
            "radial-gradient(circle at 34% 26%, rgba(255,247,220,0.95) 0%, rgba(240,215,140,0.85) 16%, rgba(201,168,76,0.9) 42%, rgba(120,92,28,0.95) 72%, rgba(42,30,8,0.98) 100%)",
        }}
        className={`group relative flex h-36 w-36 items-center justify-center rounded-full duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-4 focus-visible:ring-offset-[#04101c] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:!transition-none sm:h-40 sm:w-40 ${
          disabled ? "" : "cursor-pointer"
        }`}
      >
        {/* Facets — two crossing highlights give the ball a cut-crystal read. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 210deg at 50% 50%, rgba(255,255,255,0.20) 0deg, transparent 55deg, rgba(110,200,240,0.22) 130deg, transparent 200deg, rgba(255,255,255,0.16) 285deg, transparent 340deg)",
            mixBlendMode: "screen",
          }}
        />
        {/* Specular cap. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[20%] top-[13%] h-[26%] w-[38%] rounded-[999px] blur-[3px]"
          style={{ background: "rgba(255,252,238,0.75)" }}
        />
        {/* Idle shimmer — suppressed entirely under reduced motion. */}
        {!reducedMotion && !disabled && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[7%] rounded-full opacity-70 motion-safe:animate-pulse"
            style={{
              background:
                "radial-gradient(circle at 50% 62%, rgba(255,240,190,0.42) 0%, transparent 62%)",
            }}
          />
        )}
        <span className="relative text-[19px] font-black uppercase tracking-[0.26em] text-[#241a04] drop-shadow-[0_1px_0_rgba(255,246,214,0.55)] sm:text-[21px]">
          {label}
        </span>
      </button>
    </div>
  );
}
