/**
 * LC1 — the Ranked emblem, as one presentation component.
 *
 * Every Ranked surface used to hand-roll its own emblem: resolve a URL, wrap
 * it in a halo `div`, remember to stamp `data-tier`/`data-baseline`, remember
 * the baseline filter, remember an `onError`. The lobby alone did that twice,
 * and the two copies had already drifted once — the centre emblem carried a
 * halo and the right column's chip did not, and only one of them had a
 * fallback. This file is the single place a tier becomes a rendered emblem.
 *
 * WHAT IT OWNS
 * ────────────
 *  - tier → art resolution (through `resolveRankedEmblemUrl`, never a second
 *    art path of its own);
 *  - the size variants the lobby actually has: a `hero` emblem and a `chip`;
 *  - earned vs baseline state, and the ONE treatment that separates them;
 *  - the ambient halo, the rare glint and the sparks — as DOM slots only. The
 *    motion itself is entirely in `index.css` (`.lc-emblem*`), because a
 *    React timer loop for a highlight that fires once every eleven seconds is
 *    a re-render budget spent on nothing;
 *  - whether the glint may be alpha-masked to the art — see THE MASK, below;
 *  - the `data-tier` / `data-baseline` contract every existing test reads;
 *  - an error fallback, so a missing emblem never leaves a hole in the layout.
 *
 * WHAT IT DOES NOT OWN — the RE1 boundary
 * ───────────────────────────────────────
 * It computes no tier, no rating and no threshold, and it decides nothing
 * about whether a tier has been earned: the caller passes `earned`, because
 * only the caller knows whether placements are done. This component cannot
 * award a rank.
 *
 * THE MASK — a cross-origin limit, measured
 * ─────────────────────────────────────────
 * The seal's highlight is masked to its own alpha, so the light crosses the
 * wax and not a box. The emblem cannot always do the same: `mask-image` is
 * one of the CSS image loads that IS subject to CORS, and the Ranked emblems
 * are served by the combat backend on another origin with no
 * `Access-Control-Allow-Origin` header. Chrome does not fall back to "no
 * mask" there — it fails the load and the masked element renders as nothing,
 * which would silently delete the glint from every earned rank.
 *
 * So the mask is CONDITIONAL, and the condition is measurable: same-origin
 * art gets `data-mask="alpha"` and the sharp masked highlight; anything else
 * gets `data-mask="off"`, where the glint is a soft specular bloom inside a
 * round clip. The bloom is why the unmasked path is not a downgrade — a soft
 * ellipse reads as light on metal without needing a silhouette, whereas the
 * seal's hard-edged band would read as a rectangle. And the day the emblems
 * move to this origin, or the backend starts sending the header, every
 * emblem upgrades to the masked version with no code change.
 *
 * PRESTIGE, NOT ACTION
 * ────────────────────
 * The emblem and the PLAY seal share one light language — the same warm gold
 * glint tone, the same rare cadence, the same "glow is a property of the
 * object, not an animation" rule (see the LC1 light language block in
 * `index.css`). They are deliberately not equals: the emblem is a decoration
 * that catches the light, the seal is the thing you press. The emblem never
 * responds to a pointer, and its cadence is always the slower of the two.
 */

import { useState } from "react";
import { resolveRankedEmblemUrl } from "@/lib/progression/rankedArt";
import type { RankTier } from "@/lib/progression/tiers";

export type RankEmblemSize = "hero" | "chip";

/**
 * Baseline art, drawn as a slightly quieter emblem — the same metal, in lower
 * light, rather than a different piece of art.
 *
 * This has been retuned twice and both corrections went the same way. The
 * first pass drained it (`grayscale(0.42) brightness(0.9)`), which on an asset
 * that is ALREADY dark and low-chroma produced a muddy grey-violet crest —
 * broken art, not an unearned rank. The second softened that but still carried
 * enough grey that the hero emblem read visibly greyer than the identical
 * emblem in the chip beside it: one rank, two colours, on one sheet.
 *
 * So the desaturation is gone. What remains is a small light difference —
 * about 8% of transparency and a hair of extra warmth. Now that both sites
 * render through this component the two can no longer disagree, which is the
 * real fix; the constant just makes it structural.
 *
 * COHERENCE IS THE INVARIANT. Any future retune keeps chroma alone and spends
 * its budget on luminance.
 */
export const BASELINE_EMBLEM_FILTER =
  "sepia(0.12) saturate(1.06) brightness(1.03) opacity(0.92)";

/**
 * How many sparks a tier is allowed. The whole effect set is the same at
 * every tier — only its intensity moves — and the count is the one part of
 * that intensity which cannot be expressed as a CSS custom property, so it
 * lives here and everything else (halo opacity, glint strength, cadence)
 * lives on `.lc-emblem[data-tier]` in `index.css`.
 *
 * Three is the ceiling on purpose. Past that the emblem stops reading as
 * struck metal catching the light and starts reading as a loot drop.
 */
const SPARK_COUNT: Record<RankTier, number> = {
  bronze: 1,
  silver: 1,
  gold: 2,
  diamond: 2,
  challenger: 3,
};

/**
 * Fixed spark sites, in percentages of the emblem box. Deterministic rather
 * than random: a spark that lands somewhere new on every render is a spark
 * that flickers when React re-renders for an unrelated reason, and there is
 * no seed here worth carrying. The three sites are spread around the crest's
 * upper body — where a light source would actually catch it — and the delays
 * are staggered wide enough that two never fire together.
 */
const SPARK_SITES = [
  { top: "18%", left: "74%", delay: "0s" },
  { top: "62%", left: "16%", delay: "3.7s" },
  { top: "34%", left: "30%", delay: "7.1s" },
] as const;

export default function RankEmblem({
  tier,
  earned,
  size = "hero",
  alt,
  decorative = false,
  fallbackSrc = null,
  fallback = null,
  className = "",
}: {
  /** A canonical tier. Baseline state is `earned={false}`, not a sixth tier. */
  tier: RankTier;
  /**
   * Whether this tier has actually been won. The caller owns this: only it
   * knows whether placements are complete. `false` renders the same art in
   * the visibly held-back baseline state and stamps `data-baseline`.
   */
  earned: boolean;
  size?: RankEmblemSize;
  /** Alt text. Ignored when `decorative`, which is the honest chip case. */
  alt?: string;
  /** Chip-style usage where an adjacent label already names the tier. */
  decorative?: boolean;
  /** Last-resort art if the tier cannot resolve. Legacy paths only. */
  fallbackSrc?: string | null;
  /** Rendered when there is no art at all, or the art fails to load. */
  fallback?: React.ReactNode;
  className?: string;
}) {
  // Resolution order: the size's own art, then the large art (the small set is
  // the incomplete one), then whatever legacy path the caller still has.
  const resolved =
    resolveRankedEmblemUrl(tier, size === "hero" ? "large" : "small") ??
    resolveRankedEmblemUrl(tier, "large") ??
    fallbackSrc;

  const [src, setSrc] = useState<string | null>(resolved ?? null);

  // Effects are a HERO-size affordance. A 16px chip cannot carry a travelling
  // highlight or a spark — at that size they are single pixels of noise — and
  // the baseline is not an earned rank, so it gets the ambient halo and
  // nothing else. Both exclusions are structural: the layers are not in the
  // DOM at all, so there is nothing to accidentally re-enable in CSS.
  const animated = earned && size === "hero";
  const sparks = animated ? SPARK_SITES.slice(0, SPARK_COUNT[tier]) : [];

  if (!src) {
    return <>{fallback}</>;
  }

  // See THE MASK above. Measured, not assumed: a relative path, an absolute
  // path and a full URL all normalise through the same resolution the
  // browser's own image load will do.
  let sameOrigin = false;
  try {
    sameOrigin = new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    sameOrigin = false;
  }

  return (
    <span
      className={`lc-emblem ${className}`}
      data-size={size}
      data-tier={earned ? tier : undefined}
      data-baseline={earned ? undefined : tier}
      data-mask={sameOrigin ? "alpha" : "off"}
      style={
        // Passing the art down as a custom property is what lets the mask
        // itself stay in CSS, next to the layer it applies to.
        { ["--lc-emblem-art" as string]: `url("${src}")` } as React.CSSProperties
      }
    >
      <span aria-hidden="true" className="lc-emblem__halo" />
      <img
        src={src}
        alt={decorative ? "" : (alt ?? "")}
        aria-hidden={decorative ? "true" : undefined}
        draggable={false}
        /* The state attributes stay on the IMAGE, not only on the wrapper:
           they are the assertion "this pixel of art is/is not an awarded
           tier", and that assertion belongs to the art. */
        data-tier={earned ? tier : undefined}
        data-baseline={earned ? undefined : tier}
        style={earned ? undefined : { filter: BASELINE_EMBLEM_FILTER }}
        className="lc-emblem__art"
        onError={() => {
          // One step down the ladder, then out. Never a retry loop.
          if (fallbackSrc && src !== fallbackSrc) setSrc(fallbackSrc);
          else setSrc(null);
        }}
      />
      {animated && <span aria-hidden="true" className="lc-emblem__glint" />}
      {sparks.map((site, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="lc-emblem__spark"
          style={{ top: site.top, left: site.left, animationDelay: site.delay }}
        />
      ))}
    </span>
  );
}
