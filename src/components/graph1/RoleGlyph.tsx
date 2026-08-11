/**
 * Lane-position glyphs — inline SVG, no external assets.
 *
 * There are no player portraits: the identity database has no image column
 * and none of its ~20k players carries an image reference. So a player avatar
 * is deterministic initials, and this glyph is the only enhancement available
 * from data we actually hold (`esports_players.primary_role`).
 *
 * Drawn from the map's perspective, which is how the positions are read in
 * game: Top is the upper-left lane, Bot the lower-right, Mid the diagonal,
 * Jungle the area between them, Support the shielding partner.
 *
 * Paths are authored here rather than fetched, so they render identically in
 * the browser and in a Remotion frame with nothing to load or decode.
 *
 * The glyphs are stored as path DATA, not as JSX. Remotion's webpack config
 * compiles this file with the classic JSX runtime, so module-scope JSX would
 * emit a bare `React.createElement` call evaluated at import time and crash
 * the bundle with "React is not defined" — the app's Vite build uses the
 * automatic runtime and hides that. Keeping the constant to plain strings
 * means both toolchains agree, and there is no React import to forget.
 */
import type { Graph1PlayerRole } from "@/graph1/contract";

const PATHS: Record<Graph1PlayerRole, string[]> = {
  // upper-left corner block
  Top: ["M2 2h5v2H4v3H2V2z"],
  // clustered leaves between the lanes
  Jungle: [
    "M5 8.5c0-2 1.2-3.6 3-4.2-.4 2-.2 3.4.6 4.4-1.2.6-2.6.5-3.6-.2z",
    "M4.6 9.4c1.4.3 2.6 1.2 3.2 2.4-1.6.3-3-.4-3.6-1.6l.4-.8z",
  ],
  // the diagonal lane
  Mid: ["M2.4 7.6 7.6 2.4l1 1-5.2 5.2-1-1z"],
  // lower-right corner block
  Bot: ["M8 8v3H6v-1H4V8h4z"],
  // shield
  Support: ["M6 2 9.5 3.4v3C9.5 8.4 8 10 6 10.6 4 10 2.5 8.4 2.5 6.4v-3L6 2z"],
};

export interface RoleGlyphProps {
  role: Graph1PlayerRole;
  className?: string;
}

/**
 * Decorative by default: the role is already carried in the row's aria-label
 * via the entity name, and announcing "Mid" beside every initials avatar adds
 * noise without information.
 */
export default function RoleGlyph({ role, className }: RoleGlyphProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      focusable="false"
      data-role-glyph={role}
      className={className}
      fill="currentColor"
    >
      {PATHS[role].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
