import type { ReportSectionNode } from "./report-structure";
import { slugifySegment } from "./semantic-ids";

/**
 * PHSR3 — the main-game (Summoner's Rift) destinations of the condensed Patch
 * Report navigator. Pure: built from the same (filtered) report structure the
 * page renders, so every destination is an anchor that exists in the document.
 *
 * Only Riot's main-game sections qualify (Champions, Items, Runes, Systems /
 * Game Systems), in official order. Mode sections (Arena, Classic, ARAM…) and
 * one-off feature sections (Team Voice, Hall of Legends…) stay in the full
 * section navigator only.
 */

/** The masthead's anchor: "back to top" is an ordinary fragment link to it. */
export const PATCH_HUB_TOP_ANCHOR = "patch-hub";

const MAIN_GAME_SECTIONS = new Set(["champions", "items", "runes", "systems", "game-systems"]);

export type SrNavDestination = {
  /** Unique within the navigator: the section or bucket anchor. */
  anchor: string;
  label: string;
  /** Entries under this destination after filtering. */
  count: number;
  /** Champion direction buckets nest under their section. */
  kind: "section" | "bucket";
};

export type SrNavGroup = {
  section: SrNavDestination;
  /** Buffs / Nerfs / Adjustments (/ Other) — Champions only, in canonical order. */
  buckets: SrNavDestination[];
};

const BUCKET_LABELS: Record<string, string> = {
  buff: "Buffs",
  nerf: "Nerfs",
  adjustment: "Adjustments",
  ungrouped: "Other",
};

export function isMainGameSection(section: Pick<ReportSectionNode, "title">): boolean {
  return MAIN_GAME_SECTIONS.has(slugifySegment(section.title));
}

export function buildSrNavGroups(sections: readonly ReportSectionNode[]): SrNavGroup[] {
  return sections.filter(isMainGameSection).map((section) => ({
    section: {
      anchor: section.anchor,
      label: section.title,
      count: section.entities.length,
      kind: "section",
    },
    // Item buckets exist (26.19 Items: "Adjustments 1") but add width without
    // adding a useful jump; the champion list is the long one.
    buckets:
      slugifySegment(section.title) === "champions" && section.directionBuckets
        ? section.directionBuckets.map((bucket) => ({
            anchor: bucket.anchor,
            label: BUCKET_LABELS[bucket.direction] ?? bucket.label,
            count: bucket.entities.length,
            kind: "bucket",
          }))
        : [],
  }));
}

/** Every anchor the navigator links to, sections before their own buckets. */
export function srNavAnchors(groups: readonly SrNavGroup[]): string[] {
  return groups.flatMap((g) => [g.section.anchor, ...g.buckets.map((b) => b.anchor)]);
}

export type MeasuredBox = { anchor: string; top: number; bottom: number };

/**
 * The destination the reader is currently in: the deepest box (a bucket over
 * its section) that spans the probe line just below the navigator. Null while
 * the reader is anywhere else (Team Voice, Arena, the notice…), so a mode
 * section never lights up "Systems" just because it comes after it.
 */
export function activeSrAnchor(
  groups: readonly SrNavGroup[],
  boxes: ReadonlyMap<string, MeasuredBox>,
  probe: number,
): string | null {
  const spans = (anchor: string) => {
    const box = boxes.get(anchor);
    return Boolean(box && box.top <= probe && box.bottom > probe);
  };
  for (const group of groups) {
    if (!spans(group.section.anchor)) continue;
    return group.buckets.find((b) => spans(b.anchor))?.anchor ?? group.section.anchor;
  }
  return null;
}

/**
 * The condensed navigator takes over once the full section navigator has
 * scrolled up under it. Its zero-height sticky holder sits right after the
 * full navigator, next to a static sentinel: while the holder is in flow the
 * two share a top edge; once the holder sticks, the sentinel keeps scrolling
 * and falls above it. A sub-pixel difference is layout rounding, not sticking.
 */
export function isCondensedNavStuck(sentinelTop: number, holderTop: number): boolean {
  return holderTop - sentinelTop >= 1;
}
