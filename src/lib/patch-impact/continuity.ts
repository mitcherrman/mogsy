/**
 * Continuity proof: may a companion stat be read from Mogzy's CURRENT data and
 * held constant across patch P?
 *
 * The canonical row describes now, not P. A companion that no patch touched
 * since P is equal then and now; this module proves that (or says it cannot)
 * from Riot's own later patch lines:
 *
 * - Every later report from P to the latest must be present (no gap).
 * - Every Base Stats line on this champion, in P's card and in later reports, is
 *   classified by the controlled grammar. The block is scoped to a stat FAMILY:
 *   an uncertain health line blocks health projection only. A line the grammar
 *   cannot assign to any family blocks every canonical-dependent projection for
 *   the champion across the interval. No fuzzy wording, ever.
 * - Later lines that DID change the companion must chain: after[i] == before[i+1]
 *   and the last `after` equals live canonical.
 *
 * Projections whose four values all come from Riot lines of one card never reach
 * this module: they depend on no Mogzy state.
 */
import type {
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "@/lib/patch-reports/api";
import {
  classifyChange,
  isBaseStatsGroup,
  isChampionsSectionChampionCard,
  type EligibleLine,
} from "./eligibility";
import {
  CONTINUITY_PROPERTY_FAMILY,
  V1_PROPERTIES,
  classifyBaseStatLine,
  type ContinuityFamily,
  type V1Property,
} from "./families";
import { VALUE_EPSILON } from "./math";
import type { ImpactFamily, ImpactUnavailableReason } from "./types";

/* -------------------------------------------------------------------------- */
/* Patch versions                                                             */
/* -------------------------------------------------------------------------- */

/** `"26.19"` → `[26, 19]`; null for anything that is not dotted integers. */
export function parsePatchVersion(version: string | null | undefined): number[] | null {
  if (typeof version !== "string" || !/^\d+(\.\d+)*$/.test(version.trim())) return null;
  return version
    .trim()
    .split(".")
    .map((part) => Number(part));
}

/** Numeric segment-wise comparison; null when either version does not parse. */
export function comparePatchVersions(a: string, b: string): number | null {
  const pa = parsePatchVersion(a);
  const pb = parsePatchVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* Line lineage classification                                                */
/* -------------------------------------------------------------------------- */

export type LineageEntry =
  /** A fully understood, supported change. */
  | { kind: "eligible"; line: EligibleLine }
  /** Parsed cleanly and states no change. */
  | { kind: "no_change" }
  /** A stat in `family` may have changed in a way Impact cannot reconstruct. */
  | { kind: "family_uncertain"; family: ContinuityFamily }
  /** Provably touches no canonical stat. */
  | { kind: "no_canonical_column" }
  /** The grammar cannot say what this touched. */
  | { kind: "unclassified" };

/**
 * Classify one change for lineage purposes, or null when it is not a base-stat
 * line at all (so it cannot disturb a base-stat companion).
 *
 * A line is a base-stat line when it sits in the Base Stats group, or carries a
 * registered base-stat property wherever it sits.
 */
export function classifyLineageEntry(
  card: PatchReportCard,
  change: PatchReportChange,
): LineageEntry | null {
  const property = change.mogzy_property;
  const carriesBaseStatProperty =
    typeof property === "string" && Object.prototype.hasOwnProperty.call(CONTINUITY_PROPERTY_FAMILY, property);
  if (!isBaseStatsGroup(change) && !carriesBaseStatProperty) return null;

  const eligibility = classifyChange(card, change);
  if (eligibility.ok === true) {
    // An attack-speed line has a known family but is never a V1 companion.
    return { kind: "eligible", line: eligibility.line };
  }
  if (eligibility.reason === "no_parameter_change") return { kind: "no_change" };

  const cls = classifyBaseStatLine(change.mogzy_property, change.property_name);
  if (cls.kind === "family") return { kind: "family_uncertain", family: cls.family };
  if (cls.kind === "no_canonical_column") return { kind: "no_canonical_column" };
  return { kind: "unclassified" };
}

/* -------------------------------------------------------------------------- */
/* Entity identity across reports                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether a later card is the same champion as the analysed one: the same
 * canonical ref, or (when the later card has no ref) the exact same card name.
 */
export function isSameEntityCard(
  candidate: PatchReportCard,
  entityRef: string,
  entityName: string,
): boolean {
  if (!isChampionsSectionChampionCard(candidate)) return false;
  if (candidate.mogzy_entity_ref) return candidate.mogzy_entity_ref === entityRef;
  return candidate.entity_name === entityName;
}

/* -------------------------------------------------------------------------- */
/* Later-report coverage                                                      */
/* -------------------------------------------------------------------------- */

export type LaterHistory =
  | { ok: true; reports: PatchReportDetail[] }
  | { ok: false; reason: "history_incomplete" };

/**
 * Validate that the supplied later reports cover every expected version after
 * `patchVersion` exactly once, and return them oldest first. Reports at or
 * before P are ignored; extra later reports are kept (more evidence is safe).
 */
export function resolveLaterHistory(
  patchVersion: string,
  laterReports: readonly PatchReportDetail[] | null | undefined,
  expectedVersions: readonly string[] | null | undefined,
): LaterHistory {
  const fail: LaterHistory = { ok: false, reason: "history_incomplete" };
  if (!parsePatchVersion(patchVersion) || !laterReports || !expectedVersions) return fail;

  const later: PatchReportDetail[] = [];
  const seen = new Set<string>();
  for (const report of laterReports) {
    const cmp = comparePatchVersions(report.patch_version, patchVersion);
    if (cmp === null) return fail;
    if (cmp <= 0) continue;
    if (seen.has(report.patch_version)) return fail;
    seen.add(report.patch_version);
    later.push(report);
  }

  for (const expected of expectedVersions) {
    const cmp = comparePatchVersions(expected, patchVersion);
    if (cmp === null) return fail;
    if (cmp > 0 && !seen.has(expected)) return fail;
  }

  later.sort((a, b) => comparePatchVersions(a.patch_version, b.patch_version) ?? 0);
  return { ok: true, reports: later };
}

/* -------------------------------------------------------------------------- */
/* The proof                                                                  */
/* -------------------------------------------------------------------------- */

export type CompanionAnchor = {
  value: number;
  provenance: "canonical_current" | "riot_later_before";
  /** The later patch whose `before_raw` supplied the value. */
  patch?: string;
};

export type ContinuityResult =
  | { ok: true; anchor: CompanionAnchor; laterVersionsChecked: string[] }
  | { ok: false; reason: ImpactUnavailableReason };

type BlockCheck = ImpactUnavailableReason | null;

/** Does this lineage entry block a canonical companion in `family`? */
function blockOf(entry: LineageEntry, family: ImpactFamily): BlockCheck {
  if (entry.kind === "unclassified") return "unclassified_base_stat_change";
  if (entry.kind === "family_uncertain" && entry.family === family) {
    return "family_continuity_unproven";
  }
  return null;
}

/**
 * Prove (or refuse) that `companion` was constant across patch P and equal to
 * live canonical, or recover its value at P from the later Riot lines.
 *
 * `excluded` are the changes in P's own card already accounted for (the
 * analysed line). Every OTHER line in P's card is scanned too: a concurrent
 * unmapped line in the same patch is as dangerous as a later one.
 */
export function proveCompanionContinuity(args: {
  card: PatchReportCard;
  excluded: readonly PatchReportChange[];
  entityRef: string;
  family: ImpactFamily;
  companion: V1Property;
  canonicalValue: number;
  laterReports: readonly PatchReportDetail[];
}): ContinuityResult {
  const { card, excluded, entityRef, family, companion, canonicalValue, laterReports } = args;

  // A. Concurrent lines in P's own card.
  for (const change of card.changes) {
    if (excluded.includes(change)) continue;
    const entry = classifyLineageEntry(card, change);
    if (!entry) continue;
    const block = blockOf(entry, family);
    if (block) return { ok: false, reason: block };
  }

  // B. Later reports, oldest first.
  type Link = { patch: string; before: number; after: number };
  const links: Link[] = [];
  const companionHalf = V1_PROPERTIES[companion].half;

  for (const report of laterReports) {
    const reportLinks: Link[] = [];
    for (const later of report.cards) {
      if (!isSameEntityCard(later, entityRef, card.entity_name)) continue;
      for (const change of later.changes) {
        const entry = classifyLineageEntry(later, change);
        if (!entry) continue;
        const block = blockOf(entry, family);
        if (block) return { ok: false, reason: block };
        if (entry.kind !== "eligible" || entry.line.family !== family) continue;
        if (!entry.line.moved.includes(companionHalf)) continue;
        const stated = entry.line.stated[companionHalf];
        if (stated) {
          reportLinks.push({ patch: report.patch_version, before: stated.before, after: stated.after });
        }
      }
    }
    // Two changes to one stat in one patch have no knowable order.
    if (reportLinks.length > 1) return { ok: false, reason: "companion_chain_break" };
    links.push(...reportLinks);
  }

  const checked = laterReports.map((report) => report.patch_version);

  if (links.length === 0) {
    return {
      ok: true,
      anchor: { value: canonicalValue, provenance: "canonical_current" },
      laterVersionsChecked: checked,
    };
  }

  for (let i = 0; i + 1 < links.length; i++) {
    if (Math.abs(links[i].after - links[i + 1].before) > VALUE_EPSILON) {
      return { ok: false, reason: "companion_chain_break" };
    }
  }
  if (Math.abs(links[links.length - 1].after - canonicalValue) > VALUE_EPSILON) {
    return { ok: false, reason: "companion_chain_break" };
  }

  return {
    ok: true,
    anchor: { value: links[0].before, provenance: "riot_later_before", patch: links[0].patch },
    laterVersionsChecked: checked,
  };
}
