/**
 * LC1 — the Leaguecraft lobby's backing shell.
 *
 * The ONE panel surface the /quiz lobby is allowed to use, in two variants, so
 * the lobby's sections cannot drift into three different kinds of box:
 *
 *   `scroll`  The three hero columns. A parchment scroll that has unfurled into
 *             place — the academy library's own material, not a dashboard card.
 *   `plate`   The study panel beneath them. The original translucent navy wash.
 *             The lower half of the lobby is scheduled for its own redesign, so
 *             it deliberately keeps the treatment it shipped with rather than
 *             being half-converted here.
 *
 * THE SCROLL
 * ──────────
 * `/assets/ranked/parchment.png` is a 1086×1448 RGBA scroll with a transparent
 * outer background, an ornamental roll at the head and another at the foot. It
 * is NOT stretched to the panel: the shell renders it as three horizontal
 * slices — head roll, plain body, foot roll — each sized `100% auto`, so the
 * image's own aspect ratio drives every height and only the ornament-free
 * middle absorbs a column's extra length. The geometry, and why each number is
 * what it is, is documented over the `.lc-scroll` rules in `index.css`.
 *
 * There is no card on top of the parchment. The old navy wash, brass hairline,
 * backdrop blur and rectangular shadow are gone from this variant on purpose:
 * two frames would read as a card sitting inside a scroll. The parchment is
 * the panel. Its lift is a `drop-shadow` that follows the scroll's own alpha
 * silhouette, so the transparent corners never cast a rectangle.
 *
 * `emphasis` is reserved for the centre column, the page's one CTA, and stays
 * inside the same family: a brighter, warmer parchment, a deeper lift and a
 * few pixels of positional rise. Never a different shell.
 *
 * Presentation only — no data, no state, no layout decisions of its own.
 */
/**
 * The `plate` washes, named so the translucency rule is checkable rather than
 * promised: EVERY colour stop stays under full alpha, which is what keeps the
 * classroom art readable through the study panel. A stop at alpha 1 would turn
 * it into an opaque dashboard card — the exact thing this surface exists to
 * avoid — so the values live here and are asserted in the hero's tests.
 */
export const LOBBY_PANEL_WASH = {
  base: "linear-gradient(180deg, rgba(6,13,26,0.50) 0%, rgba(4,10,20,0.34) 60%, rgba(4,10,20,0.48) 100%)",
  emphasis:
    "linear-gradient(180deg, rgba(8,16,32,0.60) 0%, rgba(4,10,20,0.44) 56%, rgba(4,10,20,0.58) 100%)",
} as const;

/** Where a scroll sits in the three-column rack. Drives only the entrance
 *  stagger — the CTA opens first and the flanks follow it. */
export type LobbyScrollOrder = "left" | "centre" | "right";

export default function LobbyPanel({
  variant = "plate",
  order,
  emphasis = false,
  className = "",
  children,
}: {
  variant?: "scroll" | "plate";
  order?: LobbyScrollOrder;
  emphasis?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (variant === "scroll") {
    return (
      <div
        data-testid="hero-panel"
        data-variant="scroll"
        data-order={order}
        data-emphasis={emphasis ? "true" : undefined}
        className="lc-scroll"
      >
        {/* The shell. Inert and hidden from assistive tech: it is the material
            the column is printed on, not part of the column's meaning. */}
        <div className="lc-scroll__sheet" aria-hidden="true">
          <div className="lc-scroll__reveal">
            <div className="lc-scroll__cap lc-scroll__cap--top" />
            <div className="lc-scroll__body" />
            <div className="lc-scroll__foot-space" />
          </div>
          <div className="lc-scroll__cap lc-scroll__cap--foot" />
        </div>
        {/* The caller's classes land HERE, on the content column, not on the
            shell. `items-center text-center` has to align the centre column's
            children; on the outer box it would only align the parchment. */}
        <div className={`lc-scroll__content ${className}`}>{children}</div>
      </div>
    );
  }

  return (
    <div
      data-testid="hero-panel"
      data-variant="plate"
      data-emphasis={emphasis ? "true" : undefined}
      className={`relative flex flex-1 flex-col rounded-xl border px-3 py-3 backdrop-blur-[5px] sm:px-4 ${
        emphasis
          ? "border-[#c9a84c]/26 shadow-[0_26px_64px_-32px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(240,215,140,0.14)]"
          : "border-[#c9a84c]/14 shadow-[0_20px_52px_-32px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(240,215,140,0.07)]"
      } ${className}`}
      style={{ background: emphasis ? LOBBY_PANEL_WASH.emphasis : LOBBY_PANEL_WASH.base }}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${
          emphasis ? "via-[#e8cd85]/70" : "via-[#c9a84c]/38"
        }`}
      />
      {emphasis && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-[#7fd6ef]/35 to-transparent"
        />
      )}
      {children}
    </div>
  );
}
