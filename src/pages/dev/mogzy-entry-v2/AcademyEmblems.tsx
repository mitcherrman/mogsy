import leaguecraftStudies from "@/academy/leaguecraft-studies.png";
import metaReflex from "@/academy/meta-reflex.png";
import mogzyArchives from "@/academy/mogzy-archives.png";
import ranked from "@/academy/ranked.png";

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
 */

export interface AcademyEmblem {
  key: string;
  /** Accessible name — matches the label baked into the artwork. */
  label: string;
  src: string;
  /** Percentage placement of the emblem's centre within the viewport. */
  x: number;
  y: number;
  /** Higher = nearer the viewer = travels further with the pointer. */
  depth: number;
  /** Rendered width in px; the ring diameter tracks width across all four. */
  width: number;
  /** Stagger so the four never breathe in lockstep. */
  idleDelay: number;
}

export const ACADEMY_EMBLEMS: AcademyEmblem[] = [
  {
    key: "leaguecraft-studies",
    label: "Leaguecraft Studies",
    src: leaguecraftStudies,
    x: 13.5,
    y: 27,
    depth: 1,
    width: 202,
    idleDelay: 0,
  },
  {
    key: "meta-reflex",
    label: "Meta Reflex",
    src: metaReflex,
    x: 86.5,
    y: 27,
    depth: 0.7,
    width: 194,
    idleDelay: 1.7,
  },
  {
    key: "ranked",
    label: "Ranked",
    src: ranked,
    x: 13.5,
    y: 73,
    depth: 0.82,
    width: 194,
    idleDelay: 2.6,
  },
  {
    key: "mogzy-archives",
    label: "Mogzy Archives",
    src: mogzyArchives,
    x: 86.5,
    y: 73,
    depth: 1.12,
    width: 202,
    idleDelay: 0.9,
  },
];
