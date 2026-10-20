import { comparePatchVersions, parsePatchVersion } from "@/lib/patch-impact";
import { isChampionsSectionChampionCard } from "@/lib/patch-impact/eligibility";
import type { PatchReportCard, PatchReportDetail } from "@/lib/patch-reports/api";
import { buildReportEntityNode, type ReportEntityNode } from "@/lib/patch-reports/report-structure";

/**
 * Patch history for one deck card (PHD1). Pure.
 *
 * The ONLY source is the Patch Hub's own archive: earlier published reports,
 * read exactly as the List View would show them. Nothing is inferred about
 * patches the archive does not hold, and the caller says which versions it
 * loaded so the UI can state the window it actually covers.
 */

export type HistoryEntry = {
  patchVersion: string;
  entity: ReportEntityNode;
  sectionTitle: string;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Same entity in an earlier report. A Summoner's Rift champion matches only a
 * Summoner's Rift champion card (an Arena card for the same champion is a
 * different story); otherwise the official section must match too. Catalog
 * refs are preferred when both sides carry one.
 */
export function matchesSubject(subject: PatchReportCard, candidate: PatchReportCard): boolean {
  if (subject.entity_type !== candidate.entity_type) return false;
  const srChampion = isChampionsSectionChampionCard(subject);
  if (srChampion !== isChampionsSectionChampionCard(candidate)) return false;
  if (!srChampion && norm(subject.section_title) !== norm(candidate.section_title)) return false;
  const subjectRef = norm(subject.mogzy_entity_ref);
  const candidateRef = norm(candidate.mogzy_entity_ref);
  if (subjectRef && candidateRef) return subjectRef === candidateRef;
  return norm(subject.entity_name) === norm(candidate.entity_name);
}

/** Earlier versions than `current` among `versions`, newest first. */
export function earlierVersions(versions: readonly string[], current: string): string[] {
  if (!parsePatchVersion(current)) return [];
  return versions
    .filter((v) => parsePatchVersion(v) && comparePatchVersions(v, current) < 0)
    .sort((a, b) => comparePatchVersions(b, a));
}

export function entityHistory(
  subject: PatchReportCard,
  reports: ReadonlyArray<Pick<PatchReportDetail, "patch_version" | "cards">>,
  current: string,
): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const report of reports) {
    if (!parsePatchVersion(report.patch_version)) continue;
    if (comparePatchVersions(report.patch_version, current) >= 0) continue;
    for (const card of report.cards ?? []) {
      if (!matchesSubject(subject, card)) continue;
      out.push({
        patchVersion: report.patch_version,
        entity: buildReportEntityNode(card),
        sectionTitle: card.section_title,
      });
    }
  }
  return out.sort((a, b) => comparePatchVersions(b.patchVersion, a.patchVersion));
}
