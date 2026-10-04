/**
 * VISCONT1 — TEXT DENSITY: how much a question's text has to tighten to sit
 * inside the arena's fixed allocation.
 *
 * THE RULE THIS SERVES
 * ────────────────────
 * Content adapts to the arena; the arena does not adapt to content. The
 * Question Stage reserves one prompt box and one answer box per viewport, and
 * the art, the prompt and the answer grid sit at fixed coordinates. A round
 * whose text is longer than the ordinary corpus does not get a bigger box (that
 * would move everything below it, or re-centre the card): it gets a smaller,
 * tighter TYPE TIER, chosen here.
 *
 * WHY IT IS DECIDED FROM CHARACTER COUNT
 * ──────────────────────────────────────
 * It has to be known before layout, from public, question-safe text, and be
 * the same on every client — so no measurement, no ResizeObserver, no question
 * id, family or category. Character count is the content SHAPE, the same kind
 * of signal `wideTwoColumn` has always used (labels <= 56 characters).
 *
 * WHERE THE NUMBERS COME FROM
 * ───────────────────────────
 * Measured in Chromium through `/dev/ranked-shell-probe?q=shape`, which builds
 * prompts and labels of an exact length from real League vocabulary:
 *
 *   ANSWERS (longest option label, and whether the grid carries inline
 *   option media) — VISCONT1-F1. A tablet with option media draws a FIXED
 *   36px slot before its label (the 28px icon + 8px gap, `OptionMediaIcon`),
 *   at every width: 22% of the label line at 1280-1599, 30% at 1024, 15% from
 *   1600. Character count alone gave a 24-character item name with its icon
 *   the same tier as 24 characters of text, so it wrapped, the tablets grew
 *   42.4 -> 66.8px and the arena moved 14.2px at 1280 (Phase 1 final
 *   certification F1). Media is STRUCTURED state the grid already holds before
 *   layout, and it is all-or-nothing per question (every tablet holds the slot
 *   once any option has media), so it selects the bound table here.
 *
 *   Bound = the longest label that fits the answer reserve for EVERY sample of
 *   that length (item names, stat lists, champion/rune names; 14 offsets x 4
 *   tablets each), at the binding viewport, minus one character of margin:
 *
 *              text only                   with option media
 *     normal   <= 22 (1280-1499 hold 23)   <= 15 (1280-1499 hold 16)
 *     long     <= 36 (1024 holds 37)       <= 27 (1280-1499 hold 28)
 *     dense    beyond: 12px, 2-up — up to the bank's longest real label (76,
 *              id 171239) without media; with media 1024 holds 46, past any
 *              entity name that carries an icon (the longest is ~25).
 *
 *   No single per-icon "penalty" works: the slot costs ~7 characters on one
 *   line and ~15 once a second line compounds it, so the bounds are measured
 *   per table rather than derived from one constant. (The text-only bounds
 *   were 24 / 40; the same measurement showed both one to three characters
 *   generous, so they were corrected with it.)
 *
 *   PROMPT (characters) — measured in the PRODUCTION face. On the real
 *   Ranked and Daily routes (`/quiz/*`) the root wears `theme-lol`, and
 *   `.theme-lol h2` sets the prompt in Cinzel, which is far wider than the
 *   body face. VISCONT1's first bounds were measured on the dev probe without
 *   that class, i.e. in Inter, and the Phase 1 release certification found the
 *   result (B1: real `ssm.combined` prompts moved the arena up to 31px). Every
 *   bound below is the worst case over 72 sentence-shaped samples per length
 *   (`?lol=1` on the probe), and each holds with >= 2 characters to spare:
 *     <= 100 four 18px lines on the narrowest phone (360 wide: 102).
 *     <= 144 five 16px lines there (154), and the 19-21px desktop type at
 *            1024 (148) and 1500-1599 (146).
 *     <= 192 dense: the bank maximum (188) and the 192-character RA7 Combat
 *            Calculation fixture (360 phone 15px/1.15: 194; 1280: 194).
 *     >  192 extended: generated Mastery prompts past the bank — the old
 *            `ssm.combined` wording runs to 228 (Teleport + Ionian Boots of
 *            Lucidity). Held to 228 at every viewport (360 phone: 230).
 *   Content review (QWORD) keeps real prompts well inside these; this is the
 *   safety net for when it does not.
 *
 * The tiers are CLASSIFICATION only. What each tier does at each viewport is
 * the stylesheet's business (index.css, "VISCONT1 — TEXT DENSITY"): where the
 * reserve already seats the longest text at full size — every desktop prompt
 * — a tier changes nothing at all.
 */

export type TextDensity = "normal" | "long" | "dense";
/** A prompt can also be `extended`: past the bank, see the bounds above. */
export type PromptDensity = TextDensity | "extended";

/** Inclusive upper bounds, in characters, of the `normal` and `long` tiers. */
export const ANSWER_DENSITY_BOUNDS = { normal: 22, long: 36 } as const;
/** The same, for a grid whose tablets carry inline option media (VISCONT1-F1). */
export const MEDIA_ANSWER_DENSITY_BOUNDS = { normal: 15, long: 27 } as const;
export const PROMPT_DENSITY_BOUNDS = { normal: 100, long: 144, dense: 192 } as const;

function tier(length: number, bounds: { normal: number; long: number }): TextDensity {
  if (length <= bounds.normal) return "normal";
  return length <= bounds.long ? "long" : "dense";
}

/** What the answer grid knows about its options' shape before layout. */
export interface AnswerShape {
  /**
   * The grid draws the inline option-media slot on every tablet — true exactly
   * when any option carries `media` (it is all-or-nothing per question). A
   * structured input, never recovered from the DOM.
   */
  optionMedia?: boolean;
}

/** The answer grid's tier, from its LONGEST label (every tablet shares it). */
export function answerDensity(labels: readonly string[], shape: AnswerShape = {}): TextDensity {
  const longest = labels.reduce((n, l) => Math.max(n, l.trim().length), 0);
  return tier(longest, shape.optionMedia ? MEDIA_ANSWER_DENSITY_BOUNDS : ANSWER_DENSITY_BOUNDS);
}

/** The prompt's tier, from its character count. */
export function promptDensity(prompt: string): PromptDensity {
  const length = prompt.trim().length;
  return length > PROMPT_DENSITY_BOUNDS.dense ? "extended" : tier(length, PROMPT_DENSITY_BOUNDS);
}
