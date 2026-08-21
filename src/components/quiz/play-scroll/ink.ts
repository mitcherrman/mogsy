/**
 * PLAY1 — the ink the match-entry scroll writes in.
 *
 * The same palette the lobby's parchment columns use (`INK` in
 * `RankedLobbyHero.tsx`), lifted into its own module because a SECOND surface
 * now prints on the same sheet and two hand-copied palettes is two places to
 * retune and one place to forget.
 *
 * Every value is derived against the parchment at its darkest point under
 * text — rgb(209,187,158), the inner edge where the sheet's own shading still
 * bites — which caps ink luminance at 0.0747 for 4.5:1. Do not lighten a
 * value here without re-deriving it against that background; a tone that
 * looks right on the sheet's mid-beige can fall to ~3:1 at the margin.
 */
export const PLAY_INK = {
  /** Headlines and figures: the darkest thing on the sheet. */
  strong: "#241708",
  /** Body copy and secondary lines. */
  body: "#3f2c14",
  /** Labels, captions, the quietest readable line. Stays LIGHTER than `body`. */
  faint: "#56412a",
  /** Section headings — between `strong` and `brass`. */
  heading: "#3a2708",
  /** Brass as a pigment rather than a glow, so it reads on beige. */
  brass: "#533808",
  /** The interactive accent: the lobby's cyan taken to parchment depth. */
  accent: "#08404f",
  /** Rubrication. The scribe's red, used for the one thing that is happening
   *  now — never for decoration and never as the only signal. */
  rubric: "#7a2820",
  /** Hairlines and tile borders, in the sheet's own brown. */
  rule: "rgba(96, 68, 28, 0.5)",
  /** A tile a shade deeper than the sheet, for grouped rows. */
  inset: "rgba(112, 82, 36, 0.16)",
  /** The letterpress: one hairline of parchment-coloured light above a glyph. */
  press: "0 1px 0 rgba(255, 249, 233, 0.5)",
} as const;
