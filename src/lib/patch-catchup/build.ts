/**
 * `buildCatchUpReport`: "what changed after patch X through patch Y?".
 *
 * Pure. No fetch, no React, no storage, no clock, no global "latest". The
 * caller supplies the loaded reports, the baseline, the explicit last patch and
 * (optionally) the patch index listing; the domain returns every Riot line in
 * range (layer 1) plus the proven continuity chains (layer 2, an overlay).
 *
 * Range: `since` is the baseline and is EXCLUDED; `through` is INCLUDED.
 */
import { VERIFIED_ALIASES } from "./aliases";
import { linkContinuity } from "./chains";
import { collectRiotLines, type ScopeResolver } from "./lines";
import { scopeOfCard } from "./keys";
import { analyzeCoverage, comparePatchVersions, validateRange } from "./patch-range";
import type {
  CatchUpContinuity,
  CatchUpEntity,
  CatchUpEntityAppearance,
  CatchUpInput,
  CatchUpReport,
  CatchUpResult,
  CatchUpRiotLine,
  CatchUpSection,
  ContinuityScope,
} from "./types";

/** Test seam only: lets the audit's "scope allowlist removed" ablation widen the scope. */
export type CatchUpInternals = { resolveScope?: ScopeResolver };

const isChainableScope = (scope: string | undefined): scope is ContinuityScope =>
  scope === "sr.champions" || scope === "sr.items";

function aggregateEntities(lines: readonly CatchUpRiotLine[]): CatchUpEntity[] {
  const entities = new Map<string, CatchUpEntity>();
  for (const line of lines) {
    let entity = entities.get(line.entityKey);
    if (!entity) {
      entity = {
        key: line.entityKey,
        scope: isChainableScope(line.key?.scope) ? line.key.scope : null,
        entityType: line.entityType,
        name: line.entityName,
        sectionKey: line.sectionKey,
        sectionTitle: line.sectionTitle,
        appearances: [],
        riotLines: [],
        chains: [],
      };
      entities.set(line.entityKey, entity);
    }
    entity.riotLines.push(line);
    const last: CatchUpEntityAppearance | undefined = entity.appearances.find(
      (a) => a.patch === line.patch && a.cardIndex === line.cardIndex,
    );
    if (last) last.lineCount += 1;
    else {
      entity.appearances.push({
        patch: line.patch,
        cardIndex: line.cardIndex,
        entityAnchor: line.target.entity,
        lineCount: 1,
      });
    }
  }
  return [...entities.values()];
}

function aggregateSections(lines: readonly CatchUpRiotLine[]): CatchUpSection[] {
  const sections = new Map<string, CatchUpSection>();
  for (const line of lines) {
    let section = sections.get(line.sectionKey);
    if (!section) {
      section = {
        key: line.sectionKey,
        title: line.sectionTitle,
        chainable: false,
        lineCount: 0,
        entityKeys: [],
        patches: [],
      };
      sections.set(line.sectionKey, section);
    }
    section.lineCount += 1;
    if (line.eligibility.status !== "out_of_scope") section.chainable = true;
    if (!section.entityKeys.includes(line.entityKey)) section.entityKeys.push(line.entityKey);
    if (!section.patches.includes(line.patch)) section.patches.push(line.patch);
  }
  return [...sections.values()];
}

export function buildCatchUpReportInternal(
  input: CatchUpInput,
  internals: CatchUpInternals = {},
): CatchUpResult {
  const { sincePatch, throughPatch } = input;
  const selection = validateRange(sincePatch, throughPatch);
  if (selection.ok === false) {
    return { ok: false, reason: "range_invalid", detail: selection.detail };
  }

  const analysis = analyzeCoverage({
    sincePatch,
    throughPatch,
    upToDate: selection.upToDate,
    loaded: input.reports.map((report) => report.patch_version),
    listed: input.listedVersions,
  });

  // One report per included patch. A duplicate is already flagged (and withholds
  // continuity); the first in input order supplies the lines.
  const reports = analysis.includedPatches.flatMap((patch) => {
    const found = input.reports.find((r) => comparePatchVersions(r.patch_version, patch) === 0);
    return found ? [found] : [];
  });

  const { lines, cardsWithoutChanges } = collectRiotLines({
    reports,
    resolveScope: internals.resolveScope ?? scopeOfCard,
  });

  const withheld = analysis.withheldReasons.length > 0;
  const outcome = withheld
    ? { chains: [], unclassified: [], refusals: [], aliases: [] }
    : linkContinuity({
        lines,
        includedPatches: analysis.includedPatches,
        adjacencyVerified: analysis.adjacencyVerified,
        aliases: input.aliases ?? VERIFIED_ALIASES,
      });

  const continuity: CatchUpContinuity = {
    status: withheld ? "withheld" : "available",
    withheldReasons: analysis.withheldReasons,
    ...outcome,
  };

  const entities = aggregateEntities(lines);
  const entityByKey = new Map(entities.map((e) => [e.key, e]));
  for (const chain of continuity.chains) entityByKey.get(chain.entityKey)?.chains.push(chain);

  const chainedLines = lines.filter((line) => line.chainId !== null).length;
  const report: CatchUpReport = {
    range: analysis.range,
    sincePatch,
    throughPatch,
    includedPatches: analysis.includedPatches,
    coverage: analysis.coverage,
    lines,
    cardsWithoutChanges,
    sections: aggregateSections(lines),
    entities,
    continuity,
    totals: {
      riotLines: lines.length,
      chainedLines,
      unchainedLines: lines.length - chainedLines,
      chains: continuity.chains.length,
      entities: entities.length,
    },
  };
  return { ok: true, report };
}

export function buildCatchUpReport(input: CatchUpInput): CatchUpResult {
  return buildCatchUpReportInternal(input);
}
