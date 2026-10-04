import type {
  PatchEditorialDirection,
  PatchEditorialSource,
  PatchHistoricalContext,
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "./api";
import { classifyChangeSet } from "./patch-brief";
import {
  cardAnchors,
  reportEntityAnchors,
  sectionAnchor,
  sectionKey,
  type CardAnchors,
} from "./semantic-ids";

/**
 * Patch Hub report structure — pure grouping over one Patch Reports detail
 * payload: official sections → entities → ability/system groups → changes, each
 * with a stable semantic anchor, plus Buff / Nerf / Adjustment grouping under
 * backend editorial authority and once-per-section context hoisting.
 *
 * No UI, no I/O, no mutation of the payload. Same detail in → same structure
 * out. Old payloads that omit editorial/history/reconciliation fields degrade to
 * the local fallback or to "absent", never to an exception.
 */

export type EditorialGroup = PatchEditorialDirection | "ungrouped";

/** Where a card's grouping came from. Backend claims are never overridden. */
export type EditorialResolution =
  | {
      direction: PatchEditorialDirection;
      authority: "backend";
      source: PatchEditorialSource | null;
    }
  | {
      direction: PatchEditorialDirection;
      authority: "local_fallback";
      source: null;
    }
  | { direction: null; authority: "none"; source: null };

/** Higher wins; mirrors the backend order. Unknown future sources rank 0. */
const SOURCE_RANK: Record<PatchEditorialSource, number> = {
  riot_section: 4,
  riot_text_semantic: 3,
  riot_patch_highlights: 2,
  mogzy_inferred: 1,
};

const isKnownDirection = (d: unknown): d is PatchEditorialDirection =>
  d === "buff" || d === "nerf" || d === "adjustment";

type Claim = { direction: PatchEditorialDirection; source: PatchEditorialSource | null };

/** A card's non-null backend claim, or null when it carries none. */
function claimOf(card: PatchReportCard): Claim | null {
  if (!isKnownDirection(card.editorial_direction)) return null;
  return { direction: card.editorial_direction, source: card.editorial_direction_source ?? null };
}

/**
 * Collapse several backend claims (the cards of one entity) into one: only the
 * highest-precedence source counts, a unanimous direction there wins, any
 * same-level conflict is an Adjustment. Null for an empty list.
 */
export function resolveEditorialClaims(
  claims: ReadonlyArray<{ direction: PatchEditorialDirection; source: PatchEditorialSource | null }>,
): PatchEditorialDirection | null {
  if (claims.length === 0) return null;
  const rank = (c: Claim) => (c.source ? (SOURCE_RANK[c.source] ?? 0) : 0);
  const top = Math.max(...claims.map(rank));
  const winners = claims.filter((c) => rank(c) === top);
  return winners.every((c) => c.direction === winners[0].direction)
    ? winners[0].direction
    : "adjustment";
}

/**
 * Direction for one card. A NON-NULL backend claim always wins; the local
 * numeric classifier is consulted only when the card carries no claim (old
 * payload, or a row not yet rebuilt). `editorial_direction: null` is never
 * treated as authority to suppress grouping — same rule as the Patch Brief.
 * Fix-only cards resolve to `none` (they stay readable, just ungrouped).
 */
export function resolveCardEditorial(card: PatchReportCard): EditorialResolution {
  const claim = claimOf(card);
  if (claim) return { direction: claim.direction, authority: "backend", source: claim.source };
  const local = classifyChangeSet(card.changes ?? []);
  if (local) return { direction: local, authority: "local_fallback", source: null };
  return { direction: null, authority: "none", source: null };
}

/**
 * Buff/Nerf/Adjustment grouping applies only to canonical Summoner's Rift
 * champion and item sections — the same gate the Patch Brief uses. Mode
 * sections (Arena, Mayhem, Classic…), runes and systems are not regrouped.
 */
export function isDirectionGroupedCard(card: PatchReportCard): boolean {
  return (
    (card.entity_type === "champion" && card.section_title === "Champions") ||
    (card.entity_type === "item" && card.section_title === "Items")
  );
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
 * Riot's mode sections (Arena, Mayhem…) open with one intro that the backend
 * copies onto every exploded entity. A text is "section context" when ≥2 cards
 * of the section carry it AND those cards do not carry identical change lists.
 * Identical change lists mean Riot titled one block "A / B" and the backend
 * split it into twin cards: that prose is genuinely the pair's rationale, so it
 * stays on the entities (flagged `pairedWith`) instead of being hoisted.
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
  change: PatchReportChange;
};

export type ReportGroupNode = {
  anchor: string;
  /** Visible heading, may be empty for headless change lists. */
  title: string;
  abilitySlot: string | null;
  abilityIconUrl: string | null;
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
  direction: EditorialGroup;
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
   * Buffs → Nerfs → Adjustments → ungrouped, empty buckets omitted. Null for
   * sections that are not direction-grouped (modes, runes, systems), so a
   * renderer cannot accidentally regroup them.
   */
  directionBuckets: ReportDirectionBucket[] | null;
};

export type PatchReportStructure = {
  patchVersion: string;
  sections: ReportSectionNode[];
};

const BUCKET_ORDER: EditorialGroup[] = ["buff", "nerf", "adjustment", "ungrouped"];

/** Ability/system groups in first-appearance order, with parallel anchors. */
function buildGroups(card: PatchReportCard, anchors: CardAnchors): ReportGroupNode[] {
  const groups: ReportGroupNode[] = [];
  const byAnchor = new Map<string, ReportGroupNode>();
  (card.changes ?? []).forEach((change, i) => {
    const { group, change: changeId } = anchors.changes[i];
    let node = byAnchor.get(group);
    if (!node) {
      node = {
        anchor: group,
        title: change.group_title ?? "",
        abilitySlot: change.ability_slot ?? null,
        abilityIconUrl: change.ability_icon_url ?? null,
        changes: [],
      };
      byAnchor.set(group, node);
      groups.push(node);
    } else if (!node.abilityIconUrl && change.ability_icon_url) {
      node.abilityIconUrl = change.ability_icon_url;
    }
    node.changes.push({ anchor: changeId, change });
  });
  return groups;
}

/**
 * Structure an entire patch report. Sections keep the order of their first
 * card (which mirrors the official notes); entities keep card order inside
 * their section. Cards are never merged, dropped or reordered.
 */
export function buildPatchReportStructure(
  detail: Pick<PatchReportDetail, "patch_version" | "cards">,
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
      return {
        anchor: anchors[i],
        card,
        editorial: resolveCardEditorial(card),
        context: hoisted ? null : ownKey ? (card.context_text ?? "").trim() : null,
        pairedWith,
        groups: buildGroups(card, cardAnchors(card, anchors[i])),
      };
    });

    const grouped = sectionCards.length > 0 && sectionCards.every(isDirectionGroupedCard);
    const directionBuckets = grouped
      ? BUCKET_ORDER.map((direction) => ({
          direction,
          entities: entities.filter(
            (e) => (e.editorial.direction ?? "ungrouped") === direction,
          ),
        })).filter((bucket) => bucket.entities.length > 0)
      : null;

    out.push({
      anchor: sectionAnchor(sectionCards[0]),
      key,
      title: sectionCards[0].section_title,
      sharedContext: shared,
      entities,
      directionBuckets,
    });
  }

  return { patchVersion: detail.patch_version, sections: out };
}

/* -------------------------------------------------------------------------- */
/* Safe degradation                                                           */
/* -------------------------------------------------------------------------- */

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
