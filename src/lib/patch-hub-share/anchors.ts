import type { ReportChangeNode, ReportEntityNode, ReportGroupNode } from "@/lib/patch-reports/report-structure";
import { slugifySegment } from "@/lib/patch-reports/semantic-ids";

/**
 * Share eligibility and landing fallbacks for report anchors (PH4-A).
 *
 * Grammar reminder (semantic-ids.ts): `…__e-<entity>__g-<group>__c-<property>`.
 * An entity, a group and a *labelled, unique* change are derived from Riot's
 * structured keys only, so they survive a re-ingest. A change whose property is
 * unlabelled (`c-change`) or that repeats another line's group + property gets
 * its id from line ORDER (`c-x`, `c-x-2`), which a re-order can swap, so it is
 * never offered a per-line share.
 */

const SEP = "__";

/** The bare anchor of a change before duplicate suffixing. */
const bareChangeAnchor = (group: ReportGroupNode, node: ReportChangeNode): string =>
  `${group.anchor}${SEP}c-${slugifySegment(node.change.property_name) || "change"}`;

export type ShareEligibility = { ok: true } | { ok: false; reason: "unlabelled" | "duplicate" };

/**
 * Is a per-line share link stable for this change? Needs a Riot property label
 * and no sibling line in the same card sharing its group + property.
 */
export function changeShareEligibility(
  entity: Pick<ReportEntityNode, "groups">,
  group: ReportGroupNode,
  node: ReportChangeNode,
): ShareEligibility {
  if (!slugifySegment(node.change.property_name)) return { ok: false, reason: "unlabelled" };
  const bare = bareChangeAnchor(group, node);
  let sharing = 0;
  for (const g of entity.groups) {
    for (const n of g.changes) if (bareChangeAnchor(g, n) === bare) sharing += 1;
  }
  return sharing > 1 ? { ok: false, reason: "duplicate" } : { ok: true };
}

/**
 * Landing candidates, most specific first: exact id → its group → its entity.
 * Never climbs above the entity and never invents a sibling.
 */
export function anchorFallbacks(id: string): string[] {
  const out = [id];
  const parts = id.split(SEP);
  if (parts[parts.length - 1]?.startsWith("c-")) {
    parts.pop();
    out.push(parts.join(SEP));
  }
  if (parts[parts.length - 1]?.startsWith("g-")) {
    parts.pop();
    out.push(parts.join(SEP));
  }
  return out;
}

/**
 * First fallback that exists in the document. Landing only: it never rewrites a
 * shared URL, and returns null (no scroll) rather than guess an unrelated line.
 */
export function resolveLandingTarget<T>(id: string, lookup: (id: string) => T | null): T | null {
  for (const candidate of anchorFallbacks(id)) {
    const found = lookup(candidate);
    if (found) return found;
  }
  return null;
}
