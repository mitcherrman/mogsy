/**
 * MALT — the Leaguecraft palettes, in ONE module.
 *
 * Leaguecraft prints on two materials and they need different ink:
 *
 *   PARCHMENT  the three lobby scrolls and the match-entry record. Dark ink on
 *              an aged beige sheet — the app's dark palette INVERTED.
 *   LEDGER     everything below the category rail: the study workspace, its
 *              section headings, and the classroom the whole page floats on.
 *              The app's own dark surface, lit with brass.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The parchment palette was written out by hand twice — a private `INK` in
 * `RankedLobbyHero.tsx` and `PLAY_INK` in `play-scroll/ink.ts` — which is two
 * places to retune and one to forget. The MALT history workspace would have
 * made it three, and would have hand-copied the DARK brass values out of
 * `LeaguecraftHub.tsx` on top of that. Both palettes are stated once here
 * instead; the two older modules now read from this one.
 *
 * This is a consolidation, not a design-token system. Nothing else in the app
 * changes colour because of it.
 */

/**
 * THE PARCHMENT INK.
 *
 * Every value clears 4.5:1 against the parchment AT ITS DARKEST POINT UNDER
 * TEXT — rgb(209,187,158), the inner edge of a flanking scroll where the
 * sheet's own shading still bites — which caps ink luminance at 0.0747. That
 * is the binding case, not the sheet's mid-tone.
 *
 * These values moved once already. The ageing pass darkened the sheet, and a
 * darker background does not merely shift dark ink's contrast, it REDUCES it:
 * twelve runs that cleared 4.5:1 on the bright parchment fell as low as 3.03.
 * Do not lighten a value here without re-deriving it against the composited
 * background.
 */
export const LEAGUECRAFT_INK = {
  /** Headlines and figures: the darkest thing on the sheet. */
  strong: "#241708",
  /** Body copy and secondary lines. */
  body: "#3f2c14",
  /** Labels, captions, the quietest readable line. Stays LIGHTER than `body`,
   *  which the first retune inverted. */
  faint: "#56412a",
  /** Section headings. Between `strong` and `brass`: dark enough to hold the
   *  top of the hierarchy on the sheet, warm enough to still read as a
   *  manuscript header rather than as body copy in caps. */
  heading: "#3a2708",
  /** Brass, dropped from a glow to a pigment so it reads on beige. */
  brass: "#533808",
  /** The interactive accent. The lobby's cyan, taken to a depth that holds
   *  against parchment instead of vanishing into it. */
  accent: "#08404f",
  /** Rubrication. The scribe's red, for the one thing happening NOW — never
   *  for decoration and never as the only signal. */
  rubric: "#7a2820",
  /** Hairlines and tile borders, in the sheet's own brown. */
  rule: "rgba(96, 68, 28, 0.5)",
  /** A tile a shade deeper than the sheet, for grouped rows. */
  inset: "rgba(112, 82, 36, 0.16)",
  /** The letterpress: one hairline of parchment-coloured light above each
   *  glyph, which is what separates ink printed ONTO the sheet from text
   *  merely sitting over it. One sub-pixel offset; any more reads as a glow. */
  press: "0 1px 0 rgba(255, 249, 233, 0.5)",
} as const;

/**
 * THE LEDGER INK — the dark half of Leaguecraft.
 *
 * Not a second parchment palette taken to a dark surface: these are the exact
 * values the lobby's lower half already shipped with, collected so the study
 * workspace could print in them instead of writing a third set of hexes.
 *
 * NO CURRENT CONSUMER, AND KEPT ON PURPOSE. MALT B1 re-materialled the
 * Leaguecraft Record onto vellum, so the record and everything in it now
 * prints in `LEAGUECRAFT_INK` above — the surface's crop and wash guarantee a
 * sheet no darker under text than the one that palette was derived against
 * (see `.lc-vellum` in `index.css`). These values remain the record of what
 * the dark plate printed in, and the palette any FUTURE dark-surface
 * Leaguecraft panel should reach for rather than re-deriving brass by hand,
 * which is the mistake this module exists to prevent.
 *
 * `brass` is the study surface's heading ink — the same `#e2c877` the hub's
 * section headings and the category rail's labels use — and the rules are the
 * same brass at low alpha, so a ledger's hairlines belong to the room rather
 * than being borrowed from a form control. Nothing here is a NEW colour.
 */
export const LEDGER_INK = {
  /** Headings, active tabs, figures that carry the record. */
  brass: "#e2c877",
  /** Icons, inactive tabs, the quieter brass. */
  brassDim: "#c9a84c",
  /** The hairline that closes a ledger row. Brass, not a border token, so the
   *  rows read as ruled rather than as a table with borders. */
  rule: "rgba(201, 168, 76, 0.16)",
  /** The same rule where it has to carry a section edge. */
  ruleStrong: "rgba(201, 168, 76, 0.32)",
  /** A row a shade deeper than the plate it sits on. */
  inset: "rgba(4, 16, 28, 0.5)",
  /** The classroom's cyan, at full strength — this surface is dark. */
  accent: "#7fd6ef",
} as const;

export type LeaguecraftInk = typeof LEAGUECRAFT_INK;
export type LedgerInk = typeof LEDGER_INK;
