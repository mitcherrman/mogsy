import type {
  PatchEditorialDirection,
  PatchEditorialSource,
  PatchHistoricalContext,
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "./api";
import {
  cardAnchors,
  groupKey,
  reportEntityAnchors,
  sectionAnchor,
  sectionKey,
  slugifySegment,
  type CardAnchors,
} from "./semantic-ids";

/**
 * Patch Hub report structure — the single semantic authority for the Patch
 * Report. Pure grouping over one Patch Reports detail payload: official sections
 * → entities → ability/system groups → changes, each with a stable semantic
 * anchor, plus Buff / Nerf / Adjustment grouping under backend editorial
 * authority and once-per-section context hoisting.
 *
 * No UI, no I/O, no mutation of the payload. Same detail in → same structure
 * out. Old payloads that omit editorial/history/reconciliation fields degrade to
 * a flat, ungrouped report, never to an exception.
 *
 * Unlike the Academy Patch Brief, the report never manufactures a direction
 * from the numbers: only a non-null backend `editorial_direction` groups an
 * entry. A null claim is shown under "Other changes".
 */

export type EditorialGroup = PatchEditorialDirection | "ungrouped";

/** A card's backend editorial claim, or none. Never a local guess. */
export type EditorialResolution =
  | {
      direction: PatchEditorialDirection;
      source: PatchEditorialSource | null;
      /** True when the backend itself says the claim is Mogzy's inference. */
      inferred: boolean;
    }
  | { direction: null; source: null; inferred: false };

export const EDITORIAL_GROUP_LABELS: Record<EditorialGroup, string> = {
  buff: "Buffs",
  nerf: "Nerfs",
  adjustment: "Adjustments",
  ungrouped: "Other changes",
};

const isKnownDirection = (d: unknown): d is PatchEditorialDirection =>
  d === "buff" || d === "nerf" || d === "adjustment";

/**
 * Direction for one card: the backend's non-null claim, else none. A null,
 * absent or unknown claim is never replaced by local numeric inference.
 */
export function resolveCardEditorial(card: PatchReportCard): EditorialResolution {
  if (!isKnownDirection(card.editorial_direction)) {
    return { direction: null, source: null, inferred: false };
  }
  const source = card.editorial_direction_source ?? null;
  return { direction: card.editorial_direction, source, inferred: source === "mogzy_inferred" };
}

/**
 * Buff/Nerf/Adjustment grouping applies only to canonical Summoner's Rift
 * champion and item sections — the same gate the Patch Brief uses. Mode
 * sections (Arena, Mayhem, Classic…), runes and systems are not regrouped:
 * across 26.10–26.19 the backend only ever has `mogzy_inferred` or null
 * direction for runes, and mode directions are all `mogzy_inferred`.
 */
export function isDirectionGroupedCard(card: PatchReportCard): boolean {
  return (
    (card.entity_type === "champion" && card.section_title === "Champions") ||
    (card.entity_type === "item" && card.section_title === "Items")
  );
}

/* -------------------------------------------------------------------------- */
/* Ability groups and change values                                           */
/* -------------------------------------------------------------------------- */

const SLOT_PREFIX = /^(passive|p|q|w|e|r)\s*[-–—:]\s*(.+)$/i;

const SLOT_LABELS: Record<string, string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };

/** Normalised ability slot letter (P/Q/W/E/R), or the trimmed raw slot, or null. */
export function normalizeAbilitySlot(slot: string | null | undefined): string | null {
  const trimmed = (slot ?? "").trim();
  if (!trimmed) return null;
  if (/^passive$/i.test(trimmed)) return "P";
  const upper = trimmed.toUpperCase();
  return upper.length === 1 ? upper : trimmed;
}

/** Split Riot's "Q - Name" group title into slot and name. */
export function parseGroupTitle(title: string): { slot: string | null; name: string } {
  const match = SLOT_PREFIX.exec(title.trim());
  if (!match) return { slot: null, name: title.trim() };
  return { slot: normalizeAbilitySlot(match[1]), name: match[2].trim() };
}

/**
 * Whether a change reads as an exact `before → after` value change. Mechanical
 * changes stay prose even if their text looks numeric; a before/after pair is
 * never fabricated from them.
 */
export function hasExactValues(change: PatchReportChange): boolean {
  if (change.change_kind !== "numeric") return false;
  return Boolean(change.before_raw?.trim() || change.after_raw?.trim());
}

/**
 * A change's historical context when it is usable, else null. Absent field,
 * `null`, or any non-"analyzed" status (unavailable / unresolved / ineligible /
 * mismatch) all mean "show the Riot change, add nothing".
 */
export function usableHistoricalContext(
  change: Pick<PatchReportChange, "historical_context">,
): PatchHistoricalContext | null {
  const ctx = change.historical_context;
  return ctx && ctx.status === "analyzed" ? ctx : null;
}

/* -------------------------------------------------------------------------- */
/* Shared section context                                                     */
/* -------------------------------------------------------------------------- */

/** Whitespace/case-insensitive comparison key for context prose. */
const contextKey = (text: string | null | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const changeSignature = (change: PatchReportChange): string =>
  JSON.stringify([
    change.group_title,
    change.ability_slot,
    change.property_name,
    change.change_kind,
    change.before_raw,
    change.after_raw,
    change.detail_text,
  ]);

const cardSignature = (card: PatchReportCard): string =>
  JSON.stringify((card.changes ?? []).map(changeSignature));

/**
 * Pick the context that should render once at section level.
 *
 * Riot's mode sections (Arena, Mayhem, Classic…) open with one intro that the
 * backend copies onto every exploded entity (26.19 Arena: 26 cards). A text is
 * "section context" when ≥2 cards of the section carry it AND those cards do
 * not all carry identical change lists. Identical change lists mean Riot titled
 * one block "A / B" and the backend split it into twin cards (26.10 Items:
 * Gluttonous Greaves / Immortal Path): that prose is the pair's own rationale,
 * so it stays on the entities (flagged `pairedWith`) instead of being hoisted.
 *
 * Returns the hoisted text (first-seen original spelling) or null.
 */
function pickSharedContext(cards: readonly PatchReportCard[]): string | null {
  const groups = new Map<string, PatchReportCard[]>();
  for (const card of cards) {
    const key = contextKey(card.context_text);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(card);
    else groups.set(key, [card]);
  }
  // Most widely repeated first; first-seen breaks ties (Map keeps insertion order).
  let best: PatchReportCard[] | null = null;
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const signatures = new Set(bucket.map(cardSignature));
    if (signatures.size < 2) continue; // twin cards of one "A / B" block
    if (!best || bucket.length > best.length) best = bucket;
  }
  return best ? (best[0].context_text ?? "").trim() : null;
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

export type ReportChangeNode = {
  anchor: string;
  /** Index into `card.changes`. */
  index: number;
  change: PatchReportChange;
};

export type ReportGroupNode = {
  anchor: string;
  /** Full Riot group title, e.g. "Q - Edge of Ixtal". Empty for headless change lists. */
  title: string;
  /** Title without its slot prefix, e.g. "Edge of Ixtal". */
  name: string;
  /** Normalised slot letter (P/Q/W/E/R) when known, from the payload or the title. */
  slot: string | null;
  slotLabel: string | null;
  iconUrl: string | null;
  changes: ReportChangeNode[];
};

export type ReportEntityNode = {
  anchor: string;
  card: PatchReportCard;
  editorial: EditorialResolution;
  /**
   * The entity's own rationale, rendered once at the entity. Null when the card
   * has none, or when its text was hoisted to the section (then it is in
   * `ReportSectionNode.sharedContext`).
   */
  context: string | null;
  /** Names of twin entities that legitimately share this card's context. */
  pairedWith: string[];
  groups: ReportGroupNode[];
};

export type ReportDirectionBucket = {
  anchor: string;
  direction: EditorialGroup;
  label: string;
  entities: ReportEntityNode[];
};

export type ReportSectionNode = {
  anchor: string;
  /** Riot's own section id when the payload has one, else the title slug. */
  key: string;
  title: string;
  /** Shared intro copy, rendered once for the whole section. */
  sharedContext: string | null;
  /** Entities in official report order. */
  entities: ReportEntityNode[];
  /**
   * Buffs → Nerfs → Adjustments → Other changes, empty buckets omitted. Null for
   * sections that are not direction-grouped (modes, runes, systems) and for
   * sections where the backend classified nothing (older payloads without the
   * contract, or every claim null), so a renderer cannot accidentally regroup
   * them.
   */
  directionBuckets: ReportDirectionBucket[] | null;
};

export type PatchReportStructure = {
  patchVersion: string;
  sections: ReportSectionNode[];
};

const BUCKET_ORDER: EditorialGroup[] = ["buff", "nerf", "adjustment", "ungrouped"];

/** Ability/system groups by Riot group title, in first-appearance order. */
function buildGroups(card: PatchReportCard, anchors: CardAnchors): ReportGroupNode[] {
  const groups: ReportGroupNode[] = [];
  const byKey = new Map<string, ReportGroupNode>();
  (card.changes ?? []).forEach((change, index) => {
    const key = groupKey(change);
    let node = byKey.get(key);
    if (!node) {
      const parsed = parseGroupTitle(key);
      const slot = normalizeAbilitySlot(change.ability_slot) ?? parsed.slot;
      node = {
        anchor: anchors.changes[index].group,
        title: key,
        name: parsed.name,
        slot,
        slotLabel: slot ? (SLOT_LABELS[slot] ?? slot) : null,
        iconUrl: change.ability_icon_url || null,
        changes: [],
      };
      byKey.set(key, node);
      groups.push(node);
    } else if (!node.iconUrl && change.ability_icon_url) {
      node.iconUrl = change.ability_icon_url;
    }
    node.changes.push({ anchor: anchors.changes[index].change, index, change });
  });
  return groups;
}

/**
 * One entity node outside a report (a standalone entry). Inside a report use
 * {@link buildPatchReportStructure}, which also resolves anchor collisions and
 * section-level context.
 */
export function buildReportEntityNode(
  card: PatchReportCard,
  options: { anchor?: string; context?: string | null; pairedWith?: string[] } = {},
): ReportEntityNode {
  const anchors = cardAnchors(card, options.anchor);
  const own = (card.context_text ?? "").trim();
  return {
    anchor: anchors.entity,
    card,
    editorial: resolveCardEditorial(card),
    context: options.context !== undefined ? options.context : own || null,
    pairedWith: options.pairedWith ?? [],
    groups: buildGroups(card, anchors),
  };
}

/** Riot's published section order; sections it does not list keep payload order after it. */
function officialRank(titles: readonly string[] | undefined) {
  const order = (titles ?? []).map((t) => slugifySegment(t));
  return (title: string) => {
    const i = order.indexOf(slugifySegment(title));
    return i === -1 ? order.length : i;
  };
}

/**
 * Structure an entire patch report. Sections follow Riot's `section_titles`
 * order (then first appearance); entities keep card order inside their
 * section. Cards are never merged, dropped or reordered within a section.
 */
export function buildPatchReportStructure(
  detail: Pick<PatchReportDetail, "patch_version" | "cards"> &
    Partial<Pick<PatchReportDetail, "section_titles">>,
): PatchReportStructure {
  const cards = detail.cards ?? [];
  const entityAnchors = reportEntityAnchors(cards);

  const sections = new Map<string, { cards: PatchReportCard[]; anchors: string[] }>();
  cards.forEach((card, i) => {
    const key = sectionKey(card);
    const bucket = sections.get(key);
    if (bucket) {
      bucket.cards.push(card);
      bucket.anchors.push(entityAnchors[i]);
    } else {
      sections.set(key, { cards: [card], anchors: [entityAnchors[i]] });
    }
  });

  const out: ReportSectionNode[] = [];
  for (const [key, { cards: sectionCards, anchors }] of sections) {
    const shared = pickSharedContext(sectionCards);
    const sharedKey = contextKey(shared);
    const anchor = sectionAnchor(sectionCards[0]);

    const entities: ReportEntityNode[] = sectionCards.map((card, i) => {
      const ownKey = contextKey(card.context_text);
      const hoisted = sharedKey !== "" && ownKey === sharedKey;
      const pairedWith =
        ownKey && !hoisted
          ? sectionCards
              .filter(
                (other) =>
                  other !== card &&
                  contextKey(other.context_text) === ownKey &&
                  cardSignature(other) === cardSignature(card),
              )
              .map((other) => other.entity_name)
          : [];
      return buildReportEntityNode(card, {
        anchor: anchors[i],
        context: hoisted || !ownKey ? null : (card.context_text ?? "").trim(),
        pairedWith,
      });
    });

    // Grouped only when the backend actually classified something here: older
    // payloads (field absent) and all-null sections (26.10-26.13) stay flat.
    const grouped =
      sectionCards.every(isDirectionGroupedCard) &&
      sectionCards.some((card) => isKnownDirection(card.editorial_direction));
    const directionBuckets = grouped
      ? BUCKET_ORDER.map((direction) => ({
          anchor: `${anchor}__d-${direction}`,
          direction,
          label: EDITORIAL_GROUP_LABELS[direction],
          entities: entities.filter((e) => (e.editorial.direction ?? "ungrouped") === direction),
        })).filter((bucket) => bucket.entities.length > 0)
      : null;

    out.push({
      anchor,
      key,
      title: sectionCards[0].section_title,
      sharedContext: shared,
      entities,
      directionBuckets,
    });
  }

  const rank = officialRank(detail.section_titles);
  const ordered = out
    .map((section, i) => ({ section, i }))
    .sort((a, b) => rank(a.section.title) - rank(b.section.title) || a.i - b.i)
    .map(({ section }) => section);

  return { patchVersion: detail.patch_version, sections: ordered };
}

/**
 * Narrow a built structure to the cards a search/filter kept. Anchors,
 * section-level context and bucket membership are those of the whole report,
 * so filtering never re-promotes a hoisted intro onto the one entry left.
 * Empty buckets and sections are dropped.
 */
export function filterReportStructure(
  structure: PatchReportStructure,
  keep: ReadonlySet<PatchReportCard>,
): PatchReportStructure {
  const sections: ReportSectionNode[] = [];
  for (const section of structure.sections) {
    const entities = section.entities.filter((e) => keep.has(e.card));
    if (entities.length === 0) continue;
    sections.push({
      ...section,
      entities,
      directionBuckets: section.directionBuckets
        ? section.directionBuckets
            .map((b) => ({ ...b, entities: b.entities.filter((e) => keep.has(e.card)) }))
            .filter((b) => b.entities.length > 0)
        : null,
    });
  }
  return { ...structure, sections };
}
