import {
  resolvePatchReportAsset,
  type PatchReportCard,
  type PatchReportChange,
  type PatchReportDetail,
} from "./api";
import { getChampionIcon, type ChampionManifest } from "@/hooks/useChampionAssets";
import { championSlug } from "@/lib/league-docs/api";

/**
 * Patch Brief — a pure icon-only projection of one Patch Reports detail
 * payload for the Academy Broadcast book: every qualifying changed champion
 * and item in the latest patch, grouped under Buffs / Nerfs / Adjustments.
 *
 * Everything here is deterministic: same detail + same manifest → same brief.
 * Report card order (which mirrors the official patch notes) is preserved
 * within each section; grouping only sorts entities into the three buckets,
 * it never re-ranks them.
 *
 * DIRECTION AUTHORITY — audited 2026-08-02: neither Riot's patch notes nor
 * Mogzy's ingestion (knowledge_engine/patch_report/schema.py) carries any
 * buff/nerf/adjustment metadata; the only structure is section / group /
 * property names plus numeric before/after values. The words "buff"/"nerf"
 * exist solely in prose (context_text), which is not authoritative. So the
 * grouping below uses Mogzy's deterministic classifier over structured
 * fields: numeric movement per property, with an explicit lower-is-better
 * keyword list. If the upstream contract ever grows real direction metadata,
 * it should replace `classifyChange`/`classifyCardDirection` wholesale.
 *
 * The one product rule this module enforces at the data layer: an entity is
 * identified visibly by icon alone. Names survive only in `accessibleName`,
 * which renderers may use exclusively for non-visible accessibility labels.
 */

export type PatchBriefDirection = "buff" | "nerf" | "adjustment";

export type PatchBriefEntry = {
  entityType: "champion" | "item";
  /** Stable internal identity (slug when known, else the entity name). */
  entityId: string;
  iconUrl: string;
  /** Champion/item name — for aria-labels and sr-only text ONLY, never visible. */
  accessibleName: string;
  /** League Docs champion detail route, when the champion is in Mogzy's catalog. */
  docsHref?: string;
};

export type PatchBriefSection = {
  direction: PatchBriefDirection;
  /** The literal visible heading. */
  title: "Buffs" | "Nerfs" | "Adjustments";
  entries: PatchBriefEntry[];
};

export type PatchBrief = {
  patchVersion: string;
  patchLabel: string;
  /**
   * Only non-empty sections, always in Buffs → Nerfs → Adjustments order.
   * An empty section is absent, never rendered as an empty heading.
   */
  sections: PatchBriefSection[];
  fullReportHref: string;
};

/**
 * Properties where a LOWER number is better for the entity. Explicit,
 * additive keyword list — anything unmatched is treated as higher-is-better
 * (damage, health, armor, speeds, ratios…).
 */
const LOWER_IS_BETTER = /\b(cooldown|cost|recharge)\b/i;

/** A change is a bugfix when its own structured labels say so. */
const FIX_PATTERN = /\bbug\s*fix(es)?\b|\bbugfix(es)?\b/i;

/** First number in a raw value string, or null when there is none. */
function parseLeadingNumber(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/**
 * Direction of a single change record. "fix" is internal-only — the book has
 * no Fixes section, so fix-only entities are omitted rather than regrouped.
 */
export function classifyChange(
  change: PatchReportChange,
): PatchBriefDirection | "fix" {
  if (FIX_PATTERN.test(change.group_title) || FIX_PATTERN.test(change.property_name)) {
    return "fix";
  }
  if (change.change_kind !== "numeric") return "adjustment";
  const before = parseLeadingNumber(change.before_raw);
  const after = parseLeadingNumber(change.after_raw);
  if (before === null || after === null || before === after) return "adjustment";
  const lowerIsBetter = LOWER_IS_BETTER.test(change.property_name);
  const improved = after > before ? !lowerIsBetter : lowerIsBetter;
  return improved ? "buff" : "nerf";
}

/**
 * Section for an entity's COMPLETE change set — every change from every
 * qualifying card the entity has in the report — or null when the entity has
 * no reliable home (nothing but bugfixes — those are omitted rather than
 * inventing a visible Fixes group).
 *
 *  - unanimous buff/nerf among decisive changes, with no neutral mechanical
 *    leftovers diluting it → that section (bugfix lines don't dilute);
 *  - conflicting directions, or decisive changes mixed with neutral
 *    mechanical work → Adjustments;
 *  - only neutral/mechanical changes → Adjustments;
 *  - only bugfixes → null (omitted).
 */
export function classifyChangeSet(
  changes: readonly PatchReportChange[],
): PatchBriefDirection | null {
  const directions = changes.map(classifyChange);
  const decisive = directions.filter((d) => d === "buff" || d === "nerf");
  const nonFix = directions.filter((d) => d !== "fix");
  if (decisive.length > 0) {
    const unanimous = decisive.every((d) => d === decisive[0]);
    if (unanimous && decisive.length === nonFix.length) return decisive[0];
    return "adjustment";
  }
  if (nonFix.length > 0) return "adjustment";
  return null; // fixes only
}

/** Single-card convenience over {@link classifyChangeSet}. */
export function classifyCardDirection(
  card: PatchReportCard,
): PatchBriefDirection | null {
  return classifyChangeSet(card.changes);
}

const SECTION_TITLES: Record<PatchBriefDirection, PatchBriefSection["title"]> = {
  buff: "Buffs",
  nerf: "Nerfs",
  adjustment: "Adjustments",
};

/**
 * Project a full patch report into an icon-only Patch Brief, or null when no
 * qualifying entity remains — null means "show the neutral broadcast
 * fallback", never an error screen.
 *
 * Selection policy (all deterministic):
 *  - only main "Champions" / "Items" sections (Summoner's Rift gameplay);
 *  - every qualifying changed champion and item, no caps;
 *  - one entry per entity: ALL of an entity's qualifying cards are collected
 *    first and its section comes from the aggregate change set (a buff card
 *    plus a nerf card is one Adjustments entry, never a Buffs one);
 *  - entities keep the report order of their FIRST appearance;
 *  - an entity without a resolvable icon is omitted (after classification),
 *    never named;
 *  - fix-only entities are omitted (no visible Fixes section exists).
 */
export function projectPatchBrief(
  detail: PatchReportDetail,
  manifest: ChampionManifest | null | undefined,
): PatchBrief | null {
  // Pass 1 — aggregate: group every qualifying card by entity, in first-
  // appearance order, pooling all changes. Identity/icon fields merge as
  // first-non-null so a later card can fill a gap but never reorder.
  type Aggregate = {
    entityType: "champion" | "item";
    entityName: string;
    entitySlug: string | null;
    mogzyEntityRef: string | null;
    mogzyImagePath: string | null;
    officialImageUrl: string | null;
    changes: PatchReportChange[];
  };
  const aggregates = new Map<string, Aggregate>();

  for (const card of detail.cards) {
    const qualifying =
      (card.entity_type === "champion" && card.section_title === "Champions") ||
      (card.entity_type === "item" && card.section_title === "Items");
    if (!qualifying || card.changes.length === 0) continue;

    const key = `${card.entity_type}:${card.entity_name}`;
    const existing = aggregates.get(key);
    if (existing) {
      existing.changes.push(...card.changes);
      existing.entitySlug ??= card.entity_slug;
      existing.mogzyEntityRef ??= card.mogzy_entity_ref;
      existing.mogzyImagePath ??= card.mogzy_image_path;
      existing.officialImageUrl ??= card.official_image_url;
    } else {
      aggregates.set(key, {
        entityType: card.entity_type,
        entityName: card.entity_name,
        entitySlug: card.entity_slug,
        mogzyEntityRef: card.mogzy_entity_ref,
        mogzyImagePath: card.mogzy_image_path,
        officialImageUrl: card.official_image_url,
        changes: [...card.changes],
      });
    }
  }

  // Pass 2 — classify each entity's whole change set, then resolve its icon.
  const buckets: Record<PatchBriefDirection, PatchBriefEntry[]> = {
    buff: [],
    nerf: [],
    adjustment: [],
  };

  for (const entity of aggregates.values()) {
    const direction = classifyChangeSet(entity.changes);
    if (!direction) continue; // fixes only → omitted

    const iconUrl =
      entity.entityType === "champion"
        ? getChampionIcon(manifest, entity.entityName)
        : resolvePatchReportAsset(entity.mogzyImagePath) || entity.officialImageUrl || null;
    if (!iconUrl) continue; // no icon → deterministic omission, never a visible name

    buckets[direction].push({
      entityType: entity.entityType,
      entityId: entity.entitySlug ?? entity.entityName,
      iconUrl,
      accessibleName: entity.entityName,
      // Items have no product detail route today; only catalogued champions link.
      docsHref:
        entity.entityType === "champion" && entity.mogzyEntityRef
          ? `/lol/docs/champions/${championSlug(entity.entityName)}`
          : undefined,
    });
  }

  const sections = (["buff", "nerf", "adjustment"] as const)
    .filter((d) => buckets[d].length > 0)
    .map((d) => ({ direction: d, title: SECTION_TITLES[d], entries: buckets[d] }));

  if (sections.length === 0) return null;

  return {
    patchVersion: detail.patch_version,
    patchLabel: `Patch ${detail.patch_version}`,
    sections,
    fullReportHref: `/lol/patch-reports?patch=${encodeURIComponent(detail.patch_version)}`,
  };
}
