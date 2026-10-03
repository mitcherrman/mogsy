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
 *   ANSWERS (longest option label)
 *     <= 24  one line in every desktop answer column at the arena's own type
 *            (14-15px); 26 is where the 1280 and 1440 columns first wrap.
 *            Covers the servable corpus past p95 (17 characters).
 *     <= 40  two lines in the NARROWEST column (1024) at the long tier's 14px;
 *            44 is where that column first goes to three lines.
 *     >  40  dense: three lines at 12px up to the bank's longest real label
 *            (76 characters, id 171239).
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
export const ANSWER_DENSITY_BOUNDS = { normal: 24, long: 40 } as const;
export const PROMPT_DENSITY_BOUNDS = { normal: 100, long: 144, dense: 192 } as const;

function tier(length: number, bounds: { normal: number; long: number }): TextDensity {
  if (length <= bounds.normal) return "normal";
  return length <= bounds.long ? "long" : "dense";
}

/** The answer grid's tier, from its LONGEST label (every tablet shares it). */
export function answerDensity(labels: readonly string[]): TextDensity {
  const longest = labels.reduce((n, l) => Math.max(n, l.trim().length), 0);
  return tier(longest, ANSWER_DENSITY_BOUNDS);
}

/** The prompt's tier, from its character count. */
export function promptDensity(prompt: string): PromptDensity {
  const length = prompt.trim().length;
  return length > PROMPT_DENSITY_BOUNDS.dense ? "extended" : tier(length, PROMPT_DENSITY_BOUNDS);
}
