/**
 * LC1 — the Leaguecraft lobby's backing plate.
 *
 * The ONE panel surface the /quiz lobby is allowed to use — the three hero
 * columns and the study panel beneath them all render it, so they cannot drift
 * into three different kinds of box.
 *
 * The three hero columns used to sit straight on the classroom art, which read
 * as content floating on wallpaper rather than as sections of a game client.
 * This gives each column one plate to stand on and nothing more: a translucent
 * navy wash, a single brass hairline that fades at both ends, and a soft drop
 * shadow to lift it off the room. It is deliberately NOT an opaque card — the
 * classroom still reads through every panel, so the art behind the composition
 * is never covered, only quieted.
 *
 * `emphasis` is reserved for the centre column, the page's one CTA: a slightly
 * firmer wash, a brighter brass trim and a faint hextech line along the bottom,
 * so the two flanks stay quieter than the middle.
 *
 * Presentation only — no data, no state, no layout decisions of its own.
 */
/**
 * The panel washes, named so the translucency rule is checkable rather than
 * promised: EVERY colour stop stays under full alpha, which is what keeps the
 * classroom art readable through the composition. A stop at alpha 1 would turn
 * the lobby into opaque dashboard cards — the exact thing this pass exists to
 * avoid — so the values live here and are asserted in the hero's tests.
 */
export const LOBBY_PANEL_WASH = {
  base: "linear-gradient(180deg, rgba(6,13,26,0.50) 0%, rgba(4,10,20,0.34) 60%, rgba(4,10,20,0.48) 100%)",
  emphasis:
    "linear-gradient(180deg, rgba(8,16,32,0.60) 0%, rgba(4,10,20,0.44) 56%, rgba(4,10,20,0.58) 100%)",
} as const;

export default function LobbyPanel({
  emphasis = false,
  className = "",
  children,
}: {
  emphasis?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="hero-panel"
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
