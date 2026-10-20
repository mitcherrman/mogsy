import type { PatchReportCard, PatchReportChange, PatchReportDetail } from "@/lib/patch-reports/api";
import {
  buildPatchReportStructure,
  hasExactValues,
  type EditorialGroup,
  type PatchReportStructure,
  type ReportEntityNode,
  type ReportGroupNode,
  type ReportSectionNode,
} from "@/lib/patch-reports/report-structure";
import { isMainGameSection } from "@/lib/patch-reports/sr-navigation";
import { isImpactScopedLine } from "@/lib/patch-impact/eligibility";

/**
 * Patch Deck model (PHD1). Pure: one report detail in, one ordered deck out.
 *
 * The deck is the SAME report the List View shows, read sequentially. It is
 * built on top of the canonical report structure (sections → entities →
 * groups → changes, with Riot's editorial buckets), so every card id is a
 * report entity anchor the List View also knows, and nothing is merged,
 * dropped or re-ranked within a section.
 *
 * Chapter order: the opening card, then Riot's MAIN-GAME sections in Riot's
 * order (Champions, Items, Runes, Systems), then every other official section
 * (modes, one-off features) in Riot's order. Summoner's Rift leads; a mode
 * never opens the deck. Inside a direction-grouped section the cards follow
 * the buckets (Buffs → Nerfs → Adjustments → Other) so advancing through the
 * champions reads as a story; a section the backend did not classify keeps
 * payload order.
 */

export type DeckCardKind = "cover" | "champion" | "item" | "rune" | "system";

export type DeckEntityCard = {
  kind: Exclude<DeckCardKind, "cover">;
  id: string;
  entity: ReportEntityNode;
  section: ReportSectionNode;
  chapterId: string;
  /** Direction bucket this card sits under, when the section is grouped. */
  bucket: EditorialGroup | null;
  /** True for a champion/item inside a mode section (Arena, ARAM: Mayhem…). */
  mode: boolean;
};

export type DeckCoverCard = { kind: "cover"; id: "cover"; chapterId: "cover" };

export type DeckCard = DeckCoverCard | DeckEntityCard;

export type DeckBucketSpan = {
  direction: EditorialGroup;
  label: string;
  from: number;
  /** Exclusive. */
  to: number;
};

export type DeckChapter = {
  id: string;
  title: string;
  kind: "cover" | "main" | "mode";
  from: number;
  /** Exclusive. */
  to: number;
  buckets: DeckBucketSpan[];
};

export type DeckModel = {
  patchVersion: string;
  structure: PatchReportStructure;
  cards: DeckCard[];
  chapters: DeckChapter[];
  indexById: ReadonlyMap<string, number>;
};

const kindOf = (card: PatchReportCard): DeckEntityCard["kind"] => {
  switch (card.entity_type) {
    case "champion":
      return "champion";
    case "item":
      return "item";
    case "rune":
      return "rune";
    default:
      return "system";
  }
};

function sectionEntries(
  section: ReportSectionNode,
): Array<{ entity: ReportEntityNode; bucket: EditorialGroup | null }> {
  if (section.directionBuckets) {
    return section.directionBuckets.flatMap((bucket) =>
      bucket.entities.map((entity) => ({ entity, bucket: bucket.direction })),
    );
  }
  return section.entities.map((entity) => ({ entity, bucket: null }));
}

export function buildDeckModel(
  detail: Pick<PatchReportDetail, "patch_version" | "cards"> &
    Partial<Pick<PatchReportDetail, "section_titles">>,
): DeckModel {
  const structure = buildPatchReportStructure(detail);
  const main = structure.sections.filter(isMainGameSection);
  const rest = structure.sections.filter((s) => !isMainGameSection(s));

  const cards: DeckCard[] = [{ kind: "cover", id: "cover", chapterId: "cover" }];
  const chapters: DeckChapter[] = [
    { id: "cover", title: `Patch ${detail.patch_version}`, kind: "cover", from: 0, to: 1, buckets: [] },
  ];

  const push = (section: ReportSectionNode, kind: "main" | "mode") => {
    const from = cards.length;
    const buckets: DeckBucketSpan[] = [];
    let cursor = from;
    if (section.directionBuckets) {
      for (const bucket of section.directionBuckets) {
        const span: DeckBucketSpan = {
          direction: bucket.direction,
          label: bucket.label,
          from: cursor,
          to: cursor + bucket.entities.length,
        };
        cursor = span.to;
        buckets.push(span);
      }
    }
    for (const { entity, bucket } of sectionEntries(section)) {
      cards.push({
        kind: kindOf(entity.card),
        id: entity.anchor,
        entity,
        section,
        chapterId: section.anchor,
        bucket,
        mode: kind === "mode",
      });
    }
    if (cards.length > from) {
      chapters.push({ id: section.anchor, title: section.title, kind, from, to: cards.length, buckets });
    }
  };

  main.forEach((section) => push(section, "main"));
  rest.forEach((section) => push(section, "mode"));

  const indexById = new Map<string, number>();
  cards.forEach((card, i) => indexById.set(card.id, i));
  return { patchVersion: detail.patch_version, structure, cards, chapters, indexById };
}

export const isEntityCard = (card: DeckCard | undefined | null): card is DeckEntityCard =>
  Boolean(card && card.kind !== "cover");

export function chapterOf(model: DeckModel, index: number): DeckChapter {
  return model.chapters.find((c) => index >= c.from && index < c.to) ?? model.chapters[0];
}

export function bucketOf(model: DeckModel, index: number): DeckBucketSpan | null {
  const chapter = chapterOf(model, index);
  return chapter.buckets.find((b) => index >= b.from && index < b.to) ?? null;
}

/** Index of `id`, else the cover. */
export function indexOfCard(model: DeckModel, id: string | null | undefined): number {
  if (!id) return 0;
  return model.indexById.get(id) ?? 0;
}

export const clampIndex = (model: DeckModel, index: number): number =>
  Math.max(0, Math.min(model.cards.length - 1, index));

/* -------------------------------------------------------------------------- */
/* Per-entity reading helpers                                                 */
/* -------------------------------------------------------------------------- */

export type TouchedGroup = {
  group: ReportGroupNode;
  /** "P", "Q", … for abilities; "Stats" for Base Stats; "•" otherwise. */
  badge: string;
  count: number;
};

export const isBaseStatsTitle = (title: string): boolean => /^base stats$/i.test(title.trim());

/** The ability / system groups a card touches, in Riot's order. */
export function touchedGroups(entity: ReportEntityNode): TouchedGroup[] {
  return entity.groups.map((group) => ({
    group,
    badge: group.slot ?? (isBaseStatsTitle(group.title) ? "Stats" : "•"),
    count: group.changes.length,
  }));
}

export type HeadlineChange = {
  group: ReportGroupNode;
  change: PatchReportChange;
  anchor: string;
};

/**
 * The changes worth showing before the reader opens anything: exact
 * before → after values first (they are the fastest to read), then mechanical
 * prose, in Riot's order within each kind. Never re-ranked by importance:
 * Mogzy does not know which of Riot's lines matters most.
 */
export function headlineChanges(entity: ReportEntityNode, limit = 3): HeadlineChange[] {
  const all: HeadlineChange[] = entity.groups.flatMap((group) =>
    group.changes.map((node) => ({ group, change: node.change, anchor: node.anchor })),
  );
  const exact = all.filter((h) => hasExactValues(h.change));
  const prose = all.filter((h) => !hasExactValues(h.change));
  return [...exact, ...prose].slice(0, limit);
}

export const changeCount = (entity: ReportEntityNode): number =>
  entity.groups.reduce((n, g) => n + g.changes.length, 0);

export type ImpactLine = { group: ReportGroupNode; change: PatchReportChange; anchor: string };

/** Lines Mogzy Impact can say anything about (Champions › Base Stats). */
export function impactLines(entity: ReportEntityNode): ImpactLine[] {
  return entity.groups.flatMap((group) =>
    group.changes
      .filter((node) => isImpactScopedLine(entity.card, node.change))
      .map((node) => ({ group, change: node.change, anchor: node.anchor })),
  );
}

/** Other cards in the same deck about the same entity (a champion also changed in ARAM, say). */
export function relatedCards(model: DeckModel, card: DeckEntityCard): DeckEntityCard[] {
  const name = card.entity.card.entity_name.trim().toLowerCase();
  return model.cards.filter(
    (other): other is DeckEntityCard =>
      isEntityCard(other) &&
      other.id !== card.id &&
      other.entity.card.entity_name.trim().toLowerCase() === name,
  );
}

export type ChapterSummary = {
  chapter: DeckChapter;
  count: number;
  buckets: Array<{ direction: EditorialGroup; label: string; count: number }>;
};

/** Chapter summary for the cover: counts per section and per direction. */
export function chapterSummary(model: DeckModel): ChapterSummary[] {
  return model.chapters
    .filter((c) => c.kind !== "cover")
    .map((chapter) => ({
      chapter,
      count: chapter.to - chapter.from,
      buckets: chapter.buckets.map((b) => ({ direction: b.direction, label: b.label, count: b.to - b.from })),
    }));
}
