import {
  resolvePatchReportAsset,
  type PatchReportCard,
  type PatchReportChange,
  type PatchReportDetail,
} from "./api";
import { getChampionIcon, type ChampionManifest } from "@/hooks/useChampionAssets";
import { championSlug } from "@/lib/league-docs/api";

/**
 * Patch Brief — a pure editorial projection of one Patch Reports detail
 * payload into the compact record the Academy Broadcast book can draw.
 *
 * Everything here is deterministic: same detail + same manifest → same brief.
 * No randomness, no dates, no invented importance. The report's own card
 * order is preserved as the editorial authority (it mirrors the official
 * patch notes); selection only filters, never re-ranks.
 *
 * The one product rule this module enforces at the data layer: a champion is
 * identified visibly by icon alone. `summary` strings are constructed from
 * structured fields and scrubbed of the entity's name so a champion name can
 * never leak into visible text; the name survives only in `accessibleName`,
 * which renderers may use exclusively for non-visible accessibility labels.
 */

export type PatchBriefDirection = "buff" | "nerf" | "adjustment" | "fix";

export type PatchBriefChange = {
  entityType: "champion" | "item";
  /** Stable internal identity (slug when known, else the entity name). */
  entityId: string;
  iconUrl: string;
  /** Champion/item name — for aria-labels and sr-only text ONLY, never visible. */
  accessibleName: string;
  direction: PatchBriefDirection;
  /** Short visible line, built from structured fields, entity-name-scrubbed. */
  summary: string;
  /** League Docs champion detail route, when the champion is in Mogzy's catalog. */
  docsHref?: string;
};

export type PatchBrief = {
  patchVersion: string;
  patchLabel: string;
  /** Champion entries, editorial order, 3–4 of them, one per champion. */
  changes: PatchBriefChange[];
  /** At most one item entry. */
  itemChange?: PatchBriefChange;
  /**
   * Honest, breakpoint-neutral selection descriptor ("Selected from 12
   * champion changes"). It names the eligible total but never a selected or
   * visible row count — narrow layouts may hide a row, so any "Showing N"
   * claim would go stale without viewport knowledge the projection must not
   * have.
   */
  descriptor: string;
  fullReportHref: string;
};

/** Selection bounds. Fewer than MIN eligible champions → no brief (fallback). */
export const MAX_CHAMPION_ENTRIES = 4;
export const MIN_CHAMPION_ENTRIES = 3;

/** Visible summaries longer than this fall back to a directional phrase. */
const MAX_SUMMARY_LENGTH = 40;

/**
 * Properties where a LOWER number is better for the champion. Explicit,
 * additive keyword list — anything unmatched is treated as higher-is-better
 * (damage, health, armor, speeds, ratios…).
 */
const LOWER_IS_BETTER = /\b(cooldown|cost|recharge)\b/i;

/** A change is a bugfix when its own structured labels say so. */
const FIX_PATTERN = /\bbug\s*fix(es)?\b|\bbugfix(es)?\b/i;

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Remove every visible trace of an entity's name (full name, individual name
 * words of 3+ characters, possessives) from a summary fragment. Raw report
 * text routinely embeds the champion's name; the book must never show it.
 */
export function stripEntityName(text: string, entityName: string): string {
  let out = text;
  const variants = [
    entityName,
    ...entityName.split(/[^A-Za-z0-9'’]+/).filter((w) => w.length >= 3),
  ];
  for (const variant of variants) {
    out = out.replace(new RegExp(`${escapeRegExp(variant)}(?:[’']s)?`, "gi"), "");
  }
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·.,;:&-]+|[\s·.,;:&-]+$/g, "")
    .trim();
}

/** First number in a raw value string, or null when there is none. */
function parseLeadingNumber(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/**
 * Compact display token for a raw value. Slash-scaling lists keep their first
 * and last rank ("60/70/80/90/100" → "60–100") so a row never overflows the
 * page; short values pass through untouched. Never cuts inside a number.
 */
export function compactValue(raw: string): string {
  const token = raw.trim().match(/-?\d+(?:\.\d+)?%?(?:\s*\/\s*-?\d+(?:\.\d+)?%?)*/)?.[0];
  if (!token) return raw.trim();
  const parts = token.split("/").map((p) => p.trim());
  if (parts.length > 2) return `${parts[0]}–${parts[parts.length - 1]}`;
  return token.replace(/\s*\/\s*/g, "/");
}

/** Word-boundary truncation — never mid-word, mid-number, or mid-name. */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:·-]+$/, "")}…`;
}

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

/** Direction of a single change record. */
export function classifyChange(change: PatchReportChange): PatchBriefDirection {
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
 * Direction of a whole entity card: unanimous numeric direction wins; mixed
 * directions read as an adjustment; a card of nothing but fixes is a fix.
 */
export function classifyCard(card: PatchReportCard): PatchBriefDirection {
  const directions = card.changes.map(classifyChange);
  const decisive = directions.filter((d) => d === "buff" || d === "nerf");
  if (decisive.length > 0 && decisive.every((d) => d === decisive[0])) {
    if (decisive.length === directions.filter((d) => d !== "fix").length || decisive.length === directions.length) {
      return decisive[0];
    }
    return "adjustment";
  }
  if (decisive.length > 0) return "adjustment";
  if (directions.length > 0 && directions.every((d) => d === "fix")) return "fix";
  return "adjustment";
}

/* -------------------------------------------------------------------------- */
/* Summaries                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The one change that represents a card in the book: the first numeric change
 * with parseable values (numbers read best in one line), else the first
 * change. Report order breaks all ties, so the pick is stable.
 */
export function representativeChange(card: PatchReportCard): PatchReportChange | null {
  return (
    card.changes.find(
      (c) =>
        c.change_kind === "numeric" &&
        parseLeadingNumber(c.before_raw) !== null &&
        parseLeadingNumber(c.after_raw) !== null,
    ) ??
    card.changes[0] ??
    null
  );
}

/** Short label for a change: "Q cooldown", "Base attack damage", … */
function changeLabel(change: PatchReportChange, entityName: string): string {
  const property = stripEntityName(change.property_name ?? "", entityName);
  const slot = change.ability_slot?.trim();
  let label: string;
  if (slot && property) {
    // "Q" + "Cooldown" → "Q cooldown", matching patch-note shorthand.
    label = `${slot} ${property.charAt(0).toLowerCase()}${property.slice(1)}`;
  } else {
    label = property || stripEntityName(change.group_title ?? "", entityName);
  }
  return label.trim();
}

/**
 * One concise, sanitized visible line for a change. Numeric changes render as
 * "label before → after"; when that would overflow the page it degrades to a
 * directional phrase instead of cutting numbers in half. Mechanical prose is
 * never rendered — only structured labels — so source text can't leak names.
 */
export function summarizeChange(change: PatchReportChange, entityName: string): string {
  const label = changeLabel(change, entityName);
  const direction = classifyChange(change);

  if (direction === "fix") {
    return label && !/^bug\s*fix/i.test(label) ? truncateAtWord(`${label} fixed`, MAX_SUMMARY_LENGTH) : "Bugfixes";
  }

  const before = parseLeadingNumber(change.before_raw);
  const after = parseLeadingNumber(change.after_raw);
  if (change.change_kind === "numeric" && before !== null && after !== null && change.before_raw && change.after_raw) {
    const line = `${label} ${compactValue(change.before_raw)} → ${compactValue(change.after_raw)}`.trim();
    if (line.length <= MAX_SUMMARY_LENGTH) return line;
    // Too wide for the page: drop the numbers, keep the movement. The label
    // shortens around a reserved budget so the direction word always survives.
    const word = after > before ? "increased" : "decreased";
    return `${truncateAtWord(label, MAX_SUMMARY_LENGTH - word.length - 1)} ${word}`.trim();
  }

  if (change.is_new) return truncateAtWord(label ? `New: ${label}` : "New effect", MAX_SUMMARY_LENGTH);
  return truncateAtWord(label ? `${label} updated` : "Gameplay update", MAX_SUMMARY_LENGTH);
}

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

function itemIconUrl(card: PatchReportCard): string | null {
  return resolvePatchReportAsset(card.mogzy_image_path) || card.official_image_url || null;
}

/**
 * Project a full patch report into a Patch Brief, or null when no honest
 * brief exists (missing icons, too few gameplay champion changes) — null
 * means "show the neutral broadcast fallback", never an error screen.
 *
 * Selection policy (all deterministic):
 *  - only main "Champions" / "Items" sections (Summoner's Rift gameplay);
 *  - champions first, report order preserved, one entry per champion;
 *  - a champion without a League Docs icon is omitted, never named;
 *  - at most 4 champions (min 3), at most 1 item.
 */
export function projectPatchBrief(
  detail: PatchReportDetail,
  manifest: ChampionManifest | null | undefined,
): PatchBrief | null {
  const championCards = detail.cards.filter(
    (c) => c.entity_type === "champion" && c.section_title === "Champions" && c.changes.length > 0,
  );

  const seen = new Set<string>();
  const changes: PatchBriefChange[] = [];
  for (const card of championCards) {
    if (changes.length >= MAX_CHAMPION_ENTRIES) break;
    if (seen.has(card.entity_name)) continue;
    const iconUrl = getChampionIcon(manifest, card.entity_name);
    if (!iconUrl) continue; // no icon → deterministic omission, never a visible name
    const rep = representativeChange(card);
    if (!rep) continue;
    seen.add(card.entity_name);
    changes.push({
      entityType: "champion",
      entityId: card.entity_slug ?? card.entity_name,
      iconUrl,
      accessibleName: card.entity_name,
      direction: classifyCard(card),
      summary: summarizeChange(rep, card.entity_name),
      docsHref: card.mogzy_entity_ref
        ? `/lol/docs/champions/${championSlug(card.entity_name)}`
        : undefined,
    });
  }

  if (changes.length < MIN_CHAMPION_ENTRIES) return null;

  let itemChange: PatchBriefChange | undefined;
  for (const card of detail.cards) {
    if (card.entity_type !== "item" || card.section_title !== "Items" || card.changes.length === 0) continue;
    const iconUrl = itemIconUrl(card);
    const rep = representativeChange(card);
    if (!iconUrl || !rep) continue;
    itemChange = {
      entityType: "item",
      entityId: card.entity_slug ?? card.entity_name,
      iconUrl,
      accessibleName: card.entity_name,
      direction: classifyCard(card),
      summary: summarizeChange(rep, card.entity_name),
    };
    break;
  }

  const totalChampions = new Set(championCards.map((c) => c.entity_name)).size;
  const descriptor = `Selected from ${totalChampions} champion changes`;

  return {
    patchVersion: detail.patch_version,
    patchLabel: `Patch ${detail.patch_version}`,
    changes,
    itemChange,
    descriptor,
    fullReportHref: `/lol/patch-reports?patch=${encodeURIComponent(detail.patch_version)}`,
  };
}
