/**
 * Shared primitives for the family scenario bands (RA7).
 *
 * These are the SAME visual language as CompactScenarioBand — gold hairlines
 * over a dark navy wash, uppercase micro-labels, no artwork behind the text —
 * and for the same reason it exists: everything inside a Broadcast scenario
 * card is sized in `cqmin`, which in the Ranked band is the HEIGHT, so at the
 * competitive density it collapses into a few illegible pixels. The family
 * bands are sized in absolute `rem` units instead, so they read identically at
 * every viewport and browser zoom.
 *
 * No animation lives here. A reduced-motion user therefore receives exactly the
 * same information as everyone else, with no equivalent-content branch to keep
 * in sync, and no ambient loop competing with a timed question.
 */

import { useState } from "react";

/**
 * One fixed-size entity tile. NEVER collapses: a missing or broken image falls
 * back to a monogram of the same box, so a failed request cannot reflow the
 * row it sits in.
 *
 * `alt` is empty by design — every tile is rendered next to its own visible
 * name, so alt text would make a screen reader announce the item twice.
 * Callers that need a spoken label put it on the surrounding element.
 */
export function EntityTile({
  icon,
  name,
  shape = "square",
  size = "md",
  faded = false,
  struck = false,
  accent = "gold",
}: {
  icon: string | null;
  name: string;
  shape?: "square" | "round";
  size?: "sm" | "md" | "lg";
  faded?: boolean;
  struck?: boolean;
  /**
   * Rim tint. `cool` distinguishes the other side of a two-sided premise;
   * `positive` is the restrained acquisition marker. Both only REINFORCE a
   * label that is always present as text — no tile relies on its rim to be
   * understood.
   */
  accent?: "gold" | "cool" | "positive";
}) {
  const [errored, setErrored] = useState(false);
  const box = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const radius = shape === "round" ? "rounded-full" : "rounded-md";
  const rim =
    accent === "cool"
      ? "border-[#7fb2d4]/70"
      : accent === "positive"
        ? "border-[#8fd0a0]/75"
        : "border-[#d4b35a]/55";
  return (
    <span
      aria-hidden
      data-testid="family-entity-tile"
      className={`relative flex ${box} shrink-0 items-center justify-center overflow-hidden border ${rim} bg-black/50 ${radius} ${
        faded ? "opacity-45 grayscale" : ""
      }`}
    >
      {icon && !errored ? (
        <img
          src={icon}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-black uppercase leading-none text-[#e8c97a]/80">
          {name.slice(0, 1)}
        </span>
      )}
      {struck && (
        // Absolutely positioned inside the tile so the strike cannot add a
        // pixel of height or width, whatever the icon does.
        <span
          data-testid="family-sold-strike"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="h-px w-[150%] rotate-45 bg-[#ff9b9b]/90" />
        </span>
      )}
    </span>
  );
}

/** Uppercase micro-label — the band's only heading level. */
export function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-[#e8c97a]/80">
      {children}
    </span>
  );
}

/**
 * One stated quantity, as a contained tablet. Deliberately looks nothing like
 * an answer option: no button affordance, no selection state, and it never
 * shares a row with the answer grid.
 */
export function FactTablet({
  label,
  value,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-baseline gap-1.5 rounded-md border border-[#d4b35a]/30 bg-white/[0.04] px-2 py-1"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
        {label}
      </span>
      <span className="text-sm font-black leading-none text-white">{value}</span>
    </span>
  );
}

/**
 * The band shell: the gold hairline frame CompactScenarioBand established,
 * without its fixed height (a family band's height is its content's, and is
 * identical before and after selection because none of its inputs change).
 *
 * ACCESSIBILITY MODEL. The visual arrangement IS the information here — an
 * arrow between two portraits, a column per transaction stage — and read
 * linearly it degrades into a bag of nouns ("Caitlyn Piltover Peacemaker Ahri
 * armor 60 100"). So the arrangement is marked `aria-hidden` and the same facts
 * are stated once, as a sentence, in a screen-reader-only summary. Nothing in
 * the band is focusable or interactive, which is the hazard that would
 * otherwise make hiding a subtree wrong; the answer options are a sibling and
 * are untouched.
 *
 * The summary is therefore load-bearing, not decoration: every fact the band
 * draws must appear in it, and tests assert exactly that per family.
 */
export function FamilyBandFrame({
  label,
  summary,
  children,
  testId,
}: {
  /** Spoken name of the whole band, e.g. "Combat scenario". */
  label: string;
  /**
   * One-sentence, screen-reader-only restatement of the premise the band
   * draws. It is what makes the relationship (who hits whom, what happened to
   * which item) available without the visual arrangement — never a second
   * source of facts, always a reading of the same ones.
   */
  summary: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      aria-label={label}
      data-testid={testId}
      className="relative w-full overflow-hidden rounded-xl border border-[#d4b35a]/30 bg-gradient-to-r from-black/55 via-black/35 to-black/55 px-3 py-2.5 sm:px-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-[#d4b35a]/15"
      />
      <p className="sr-only" data-testid="family-band-summary">
        {summary}
      </p>
      <div aria-hidden className="relative">
        {children}
      </div>
    </section>
  );
}
