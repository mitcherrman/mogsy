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
 *  - the size ladder — `hero`, `standard`, `compact`;
 *  - the emphasis ladder — `ceremonial`, `standard`, `quiet` — which is the
 *    axis that decides how much light an instance is allowed;
 *  - earned vs baseline state, and the treatment that separates them;
 *  - the ambient halo, the rare glint and the sparks — as DOM slots only. The
 *    motion itself is entirely in `index.css` (`.lc-emblem*`), because a
 *    React timer loop for a highlight that fires once every eleven seconds is
 *    a re-render budget spent on nothing;
 *  - whether the glint may be alpha-masked to the art — see THE MASK, below;
 *  - the `data-tier` / `data-baseline` contract every existing test reads;
 *  - an error fallback, so a missing emblem never leaves a hole in the layout.
 *
 * TWO AXES, NOT ONE
 * ─────────────────
 * `variant` is how BIG the emblem is; `emphasis` is how much light it gets.
 * They were one axis until this pass, and collapsing them was the reason the
 * centre emblem could not be made ceremonial: "hero" meant both "96px" and
 * "allowed to glint", so there was no way to say "the lobby's Bronze is the
 * most important emblem on the sheet" without also saying "every hero-size
 * emblem everywhere is". Each `variant` still picks a sensible default
 * `emphasis`, so the common call stays one prop; the split only matters when
 * a site wants to disagree with the default.
 *
 * WHAT IT DOES NOT OWN — the RE1 boundary
 * ───────────────────────────────────────
 * It computes no tier, no rating and no threshold, and it decides nothing
 * about whether a tier has been earned: the caller passes `earned`, because
 * only the caller knows whether placements are done. This component cannot
 * award a rank.
 *
 * EARNED IS SEMANTICS, EMPHASIS IS PRESENTATION
 * ─────────────────────────────────────────────
 * These used to be the same thing: an unearned emblem was structurally denied
 * the glint and the sparks, on the reasoning that an unwon rank must not
 * celebrate. The DOM contract that carried it — `data-tier` means "won",
 * `data-baseline` means "the ladder's floor" — is untouched and is still the
 * thing every other surface reads.
 *
 * The PRESENTATION rule changed. The lobby's placement Bronze is the sheet's
 * single most important emblem: it is what a new account sees, it is what the
 * PLAY seal sits under, and drawing it as a dimmed placeholder made the top
 * of the page look broken rather than unearned. So light is governed by
 * `emphasis` alone now, and a baseline emblem at `ceremonial` gets the full
 * treatment. What still separates baseline from earned is its own tint and
 * its own halo tone (`[data-baseline]` in `index.css`) — the same metal in a
 * different light, at every emphasis. The state stays legible; it is no
 * longer legible by being drab.
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

/** How big. Art size only — see TWO AXES above. */
export type RankEmblemVariant = "hero" | "standard" | "compact";

/**
 * How much light. `ceremonial` is a page's focal emblem and there should be
 * at most one on a screen; `standard` is a lit emblem that is not the
 * subject; `quiet` is the halo and nothing that moves, for emblems small
 * enough that a travelling highlight would be noise rather than light.
 */
export type RankEmblemEmphasis = "ceremonial" | "standard" | "quiet";

/**
 * What a variant asks for when the caller does not say. Sensible, not
 * binding: the lobby centre takes `hero` and its `ceremonial` default, while
 * a future hero-size emblem in a gallery can drop to `standard` without
 * resizing.
 */
export const DEFAULT_EMPHASIS: Record<RankEmblemVariant, RankEmblemEmphasis> = {
  hero: "ceremonial",
  standard: "standard",
  compact: "quiet",
};

/**
 * How many sparks a tier is allowed AT CEREMONIAL. The whole effect set is
 * the same at every tier — only its intensity moves — and the count is the
 * one part of that intensity which cannot be expressed as a CSS custom
 * property, so it lives here and everything else (halo opacity, glint
 * strength, cadence) lives on `.lc-emblem[data-tier]` in `index.css`.
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

/**
 * Sparks per emphasis, as a cap on the tier's own count. Sparks are the
 * CEREMONIAL signature and nothing else has them, which is what gives the
 * three emphases a hierarchy you can name:
 *
 *     quiet       halo
 *     standard    halo + the rare glint
 *     ceremonial  halo + the rare glint + the tier's sparks
 *
 * `standard` was briefly allowed one spark. It was wrong at both ends: a 6px
 * spark on a 24px emblem is a quarter of the object, so it read as noise
 * rather than as struck light — and at Bronze, whose tier count is also one,
 * it left the ceremonial and the standard emblem carrying the identical
 * layer set, so the hierarchy was numbers in a stylesheet and nothing
 * structural. It is a cap and not a flag because the tier ladder still
 * decides how many a ceremonial emblem actually gets.
 */
const SPARK_CAP: Record<RankEmblemEmphasis, number> = {
  ceremonial: 3,
  standard: 0,
  quiet: 0,
};

export default function RankEmblem({
  tier,
  earned,
  variant = "standard",
  emphasis,
  animated = true,
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
   * the baseline tint and stamps `data-baseline`. It no longer decides how
   * much light the emblem gets — see EARNED IS SEMANTICS above.
   */
  earned: boolean;
  /** How big. Defaults to `standard`: the reusable case, not the lobby's. */
  variant?: RankEmblemVariant;
  /** How much light. Defaults from `variant` — see `DEFAULT_EMPHASIS`. */
  emphasis?: RankEmblemEmphasis;
  /**
   * An opt-out for surfaces that must hold still for a reason CSS cannot see
   * — a screenshot harness, a print sheet, a dense list where a dozen emblems
   * would glint at once. `prefers-reduced-motion` is handled in CSS and needs
   * nothing from the caller.
   */
  animated?: boolean;
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
  // Resolution order: the variant's own art, then the large art (the small set
  // is the incomplete one), then whatever legacy path the caller still has.
  const resolved =
    resolveRankedEmblemUrl(tier, variant === "hero" ? "large" : "small") ??
    resolveRankedEmblemUrl(tier, "large") ??
    fallbackSrc;

  const [src, setSrc] = useState<string | null>(resolved ?? null);

  const level = emphasis ?? DEFAULT_EMPHASIS[variant];

  // Emphasis alone gates the moving layers, and `quiet` has none. Both
  // exclusions are structural — the layers are not in the DOM at all, so
  // there is nothing for a stray CSS rule to switch back on.
  // `moving` and the spark count are independent on purpose: `standard`
  // moves — it keeps the glint — but takes no sparks, and that gap is the
  // hierarchy. See `SPARK_CAP`.
  const moving = animated && level !== "quiet";
  const sparks = moving ? SPARK_SITES.slice(0, Math.min(SPARK_COUNT[tier], SPARK_CAP[level])) : [];

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
      data-variant={variant}
      data-emphasis={level}
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
           tier", and that assertion belongs to the art. The baseline TINT
           that used to ride here as an inline `filter` moved into
           `index.css`, because an inline filter is unbeatable by a
           stylesheet and it was overwriting the ceremonial emblem's glow. */
        data-tier={earned ? tier : undefined}
        data-baseline={earned ? undefined : tier}
        className="lc-emblem__art"
        onError={() => {
          // One step down the ladder, then out. Never a retry loop.
          if (fallbackSrc && src !== fallbackSrc) setSrc(fallbackSrc);
          else setSrc(null);
        }}
      />
      {moving && <span aria-hidden="true" className="lc-emblem__glint" />}
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
