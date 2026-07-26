import leaguecraftStudies from "@/academy/leaguecraft-studies.png";
import metaReflex from "@/academy/meta-reflex.png";
import mogzyArchives from "@/academy/mogzy-archives.png";
import ranked from "@/academy/ranked.png";

import type { ViewportTier } from "./useViewportTier";

/**
 * The four Academy corner emblems for the Mogzy entrance.
 *
 * Each PNG is a finished emblem: ornamental ring, artwork, the gold serif
 * label, and the diamond divider are all baked into the image. We therefore
 * render the asset whole and do NOT draw a second HTML label underneath —
 * doing so would print every name twice.
 *
 * All four are colorType 2 (no alpha channel) with a black backdrop baked in,
 * exactly like the mascot. They are screen-blended against the near-black page
 * so the black drops out, with a soft radial mask to feather the edges. Do not
 * add a drop-shadow to these: on an opaque image it traces a rectangular halo.
 *
 * They are decorative only — never buttons or links. The single interactive
 * target on this screen is the central "Enter Mogzy" control.
 */

export interface AcademyEmblem {
  key: EmblemKey;
  /** Accessible name — matches the label baked into the artwork. */
  label: string;
  src: string;
  /** Higher = nearer the viewer = travels further with the pointer. */
  depth: number;
  /** Stagger so the four never breathe in lockstep. */
  idleDelay: number;
}

export type EmblemKey =
  | "leaguecraft-studies"
  | "meta-reflex"
  | "ranked"
  | "mogzy-archives";

export const ACADEMY_EMBLEMS: AcademyEmblem[] = [
  {
    key: "leaguecraft-studies",
    label: "Leaguecraft Studies",
    src: leaguecraftStudies,
    depth: 1,
    idleDelay: 0,
  },
  {
    key: "meta-reflex",
    label: "Meta Reflex",
    src: metaReflex,
    depth: 0.7,
    idleDelay: 1.7,
  },
  {
    key: "ranked",
    label: "Ranked",
    src: ranked,
    depth: 0.82,
    idleDelay: 2.6,
  },
  {
    key: "mogzy-archives",
    label: "Mogzy Archives",
    src: mogzyArchives,
    depth: 1.12,
    idleDelay: 0.9,
  },
];

export interface EmblemPlacement {
  /** Percentage placement of the emblem's centre within the viewport. */
  x: number;
  y: number;
  /** Rendered width in px; the ring diameter tracks width across all four. */
  width: number;
}

/**
 * Per-tier placement.
 *
 * The desktop four-corner arrangement is the accepted baseline and is left
 * exactly as approved. Narrower tiers are NOT the same layout scaled down —
 * at phone widths that clips every emblem off the edges and drops the bottom
 * pair on top of the CTA. Instead phones pull the emblems into two flanking
 * pairs, one band above the mascot and one below, leaving the centre column
 * clear.
 *
 * Widths stay large enough that the labels baked into the artwork remain
 * readable; where room is tight the emblems move rather than shrink further.
 */
export const EMBLEM_LAYOUT: Record<
  ViewportTier,
  Record<EmblemKey, EmblemPlacement>
> = {
  desktop: {
    "leaguecraft-studies": { x: 13.5, y: 27, width: 202 },
    "meta-reflex": { x: 86.5, y: 27, width: 194 },
    ranked: { x: 13.5, y: 73, width: 194 },
    "mogzy-archives": { x: 86.5, y: 73, width: 202 },
  },
  tablet: {
    "leaguecraft-studies": { x: 17, y: 26, width: 170 },
    "meta-reflex": { x: 83, y: 26, width: 163 },
    ranked: { x: 17, y: 75, width: 163 },
    "mogzy-archives": { x: 83, y: 75, width: 170 },
  },
  // Two flanking pairs; the centre column stays clear for mascot + CTA.
  phone: {
    "leaguecraft-studies": { x: 24, y: 27, width: 138 },
    "meta-reflex": { x: 76, y: 27, width: 132 },
    ranked: { x: 24, y: 84, width: 132 },
    "mogzy-archives": { x: 76, y: 84, width: 138 },
  },
  // Wide but short: push the emblems to the outer margins where there is
  // horizontal room to spare, keeping the short centre column uncluttered.
  "phone-landscape": {
    "leaguecraft-studies": { x: 11, y: 27, width: 118 },
    "meta-reflex": { x: 89, y: 27, width: 113 },
    ranked: { x: 11, y: 76, width: 113 },
    "mogzy-archives": { x: 89, y: 76, width: 118 },
  },
};

/** Pointer travel in px at depth 1. Small on purpose — a drift, not a swing. */
export const PARALLAX_RANGE: Record<ViewportTier, number> = {
  desktop: 15,
  tablet: 10,
  phone: 0,
  "phone-landscape": 0,
};
