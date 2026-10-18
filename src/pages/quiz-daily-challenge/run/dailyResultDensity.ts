/**
 * MISC W3A (F05) — THE DAILY RESULT'S COMPACT DENSITY, in one place.
 *
 * A Daily result is a page the player passes through (score → what was earned
 * → Continue), and on a phone it used to cost 1.2–2.6 screens of scrolling to
 * reach Continue. The cost was in margins and type sizes, not in content, so
 * every rule here is DENSITY ONLY: it changes padding, gaps, type size, a
 * tile's column count and a decorative figure's size. It never hides, clips or
 * truncates a fact, a control or an accessible name, and it never changes DOM
 * order (focus order is unchanged).
 *
 * EVERY CLASS IS A LITERAL. Tailwind finds classes by scanning source text, so a
 * name assembled with a template (`${tier}:gap-2`) is never generated and the
 * rule silently does nothing. `dailyResultDensity.test.tsx` runs Tailwind over
 * THIS FILE and fails if any class written here produces no CSS.
 *
 * WHY CLASS STRINGS AND NOT PROPS
 * ───────────────────────────────
 * The hero (`ResultHero`), the snapshot grid (`ResultStatGrid`) and the
 * discovery panel (`DiscoveryReveal`) are shared with Ranked and every other
 * mode, and are owned elsewhere. A Daily result therefore tunes them from the
 * OUTSIDE, with Tailwind arbitrary variants keyed on their stable `data-testid`s
 * (`&_[data-testid=…]`), exactly as the Daily already keys on them in tests. A
 * descendant selector out-ranks the component's own single-class utility, so no
 * `!important` is needed; `src/index.css` and the shared components are
 * untouched.
 *
 * TWO DENSITY TIERS
 * ─────────────────
 *   phone   `max-sm:`  < 640px wide (every portrait phone)
 *   short   `[@media(max-height:540px)]:`  a landscape phone, whatever its width
 * Desktop and tablets (>= 640px wide and taller than 540px) get none of it.
 *
 * THE FRAME IS STILL ONE FRAME (DRS1). The same classes apply while a result is
 * pending and once it is settled, and the snapshot slot's floor is a function
 * of the stage KIND alone, so settling still fills a slot and creates no height.
 */

/** The result card's own gap between blocks. */
export const RESULT_FRAME_GAP = "gap-4 max-sm:gap-3 [@media(max-height:540px)]:gap-2";

/** The mode tag above the hero. The shell's chrome row already names the stage. */
export const RESULT_TAG_DENSITY = [
  "max-sm:[&_[data-testid=daily-stage-tag]]:px-2.5",
  "max-sm:[&_[data-testid=daily-stage-tag]]:text-xs",
  "max-sm:[&_[data-testid=daily-stage-tag]]:tracking-[0.18em]",
].join(" ");

/**
 * The hero: padding, the vertical rhythm between its rows, the headline and
 * score type, and Mogzy's plate. Mogzy stays (decorative, and the pose swap is
 * part of the score reveal); the plate is smaller, never removed.
 */
export const RESULT_HERO_DENSITY = [
  "max-sm:[&_[data-testid=result-hero]]:py-4",
  "max-sm:[&_[data-testid=result-hero]]:space-y-2",
  "max-sm:[&_[data-testid=result-mascot]]:h-14",
  "max-sm:[&_[data-testid=result-mascot]]:w-14",
  "max-sm:[&_[data-testid=result-headline]]:text-2xl",
  "max-sm:[&_[data-testid=result-hero]_.text-5xl]:text-4xl",
  "[@media(max-height:540px)]:[&_[data-testid=result-hero]]:py-3",
  "[@media(max-height:540px)]:[&_[data-testid=result-hero]]:space-y-1.5",
  "[@media(max-height:540px)]:[&_[data-testid=result-mascot]]:h-12",
  "[@media(max-height:540px)]:[&_[data-testid=result-mascot]]:w-12",
  "[@media(max-height:540px)]:[&_[data-testid=result-headline]]:text-2xl",
  "[@media(max-height:540px)]:[&_[data-testid=result-hero]_.text-5xl]:text-4xl",
].join(" ");

/**
 * The Performance snapshot on a phone: three columns instead of two, with the
 * tile padding and value size that three 90px-wide tiles at 320px need ("Out of
 * mistakes" wraps onto two lines and fits; no tile clips, in Inter or in a wider
 * fallback face — the first Linux CI run found 2px of spill in DejaVu). A grid of two tiles
 * keeps the same three columns, which only narrows them. Applies below `sm`
 * only: from `sm` the grid is the shared one (four columns).
 */
export const RESULT_SNAPSHOT_3COL = [
  "max-sm:[&_[data-testid=result-snapshot]>div]:grid-cols-3",
  "max-sm:[&_[data-testid=result-snapshot]>div]:gap-1.5",
  "max-sm:[&_[data-testid=result-snapshot]>div>div]:px-1.5",
  "max-sm:[&_[data-testid=result-snapshot]>div>div]:py-1.5",
  "max-sm:[&_[data-testid=result-snapshot]_.tabular-nums]:text-[0.9375rem]",
  // A face wider than Inter (an OS fallback) must wrap "mistakes" rather than
  // spill past a 90px tile: break the word, never overflow the box.
  "max-sm:[&_[data-testid=result-snapshot]_.tabular-nums]:[overflow-wrap:anywhere]",
].join(" ");

/**
 * The same tile compaction for a kind whose snapshot is two columns on a phone
 * (four tiles: two rows of two reads better than 3 + 1). Padding and type only.
 */
export const RESULT_SNAPSHOT_2COL = [
  "max-sm:[&_[data-testid=result-snapshot]>div]:gap-1.5",
  "max-sm:[&_[data-testid=result-snapshot]>div>div]:py-1.5",
  "max-sm:[&_[data-testid=result-snapshot]_.tabular-nums]:text-base",
].join(" ");

/**
 * The newly-earned-cards panel (`DiscoveryReveal`, rendered inside
 * `DailyDiscoveries`): tighter panel padding and rhythm, a smaller Mogzy plate.
 * Every card, the growth line and "Review New Discoveries" are untouched.
 */
export const DISCOVERY_PANEL_DENSITY = [
  "max-sm:[&_[data-testid=discovery-reveal]]:py-3",
  "max-sm:[&_[data-testid=discovery-reveal]]:space-y-2",
  "max-sm:[&_[data-testid=discovery-headline]]:text-base",
  "max-sm:[&_[data-testid=discovery-mascot]]:h-10",
  "max-sm:[&_[data-testid=discovery-mascot]]:w-10",
].join(" ");

/** A control that must stay a real touch target (>= 44px) wherever it draws. */
export const TOUCH_TARGET = "min-h-[44px]";

/**
 * The closed discovery slot cancels the card's flex gap (`RESULT_FRAME_GAP`) so
 * it adds no height until it opens. Same three tiers, same values, same order.
 */
export const RESULT_GAP_CANCEL = "-mt-4 max-sm:-mt-3 [@media(max-height:540px)]:-mt-2";

/**
 * The day's ladder under a stage result, on a phone: each section's label sits
 * on the same line as its stages when they fit (Today's Challenge is one line
 * instead of two), and the rows are a little closer. The ladder's marks, order
 * and accessible names are untouched.
 */
export const RESULT_LADDER_DENSITY = [
  "max-sm:[&_[data-testid=daily-section-ladder]]:gap-1.5",
  "max-sm:[&_[data-testid=daily-section-ladder]>section]:flex-row",
  "max-sm:[&_[data-testid=daily-section-ladder]>section]:flex-wrap",
  "max-sm:[&_[data-testid=daily-section-ladder]>section]:justify-center",
  "max-sm:[&_[data-testid=daily-section-ladder]>section]:gap-x-2",
].join(" ");

/**
 * KEYBOARD / ASSISTIVE FOCUS. The floating Community trigger sits in the
 * viewport's bottom-left 68px band. A control that is already (just) on screen
 * is not scrolled by `focus()`, so a compact page can leave a focused action
 * under it. A scroll margin makes the browser treat the bottom 5rem as part of
 * the control, so focusing it brings it clear of that band. The trigger is a
 * global overlay and is not touched.
 */
export const RESULT_FOCUS_CLEARANCE = [
  "max-sm:[&_[data-testid=discovery-cta]]:scroll-mb-20",
  "max-sm:[&_[data-testid=result-actions]_button]:scroll-mb-20",
].join(" ");

/** The final completion beat on a short (landscape) viewport: less padding. */
export const COMPLETION_SHORT_DENSITY = "[@media(max-height:540px)]:py-4";
