/**
 * Patch ordering, range selection and coverage for Catch-Up (PH3-A §12).
 *
 * Ordering is the repo's semantic comparator (`comparePatchVersions`: numeric,
 * segment-wise, `26.2` < `26.10`), never lexical, never build timestamps, never
 * the release-date catalog (it ends at 26.16). Anything that is not dotted
 * integers (`25.S1.1`, `26.12b`) cannot be placed, so it is reported and
 * continuity is withheld rather than guessed.
 *
 * Contiguity ("is 26.14 the very next patch after 26.13?") is only provable for
 * plain `YY.N` versions of the same year. Riot's real numbering changes form at
 * year boundaries (`14.24` → `25.S1.1`, `25.S1.3` → `25.04`, `25.24` → `26.1`),
 * so adjacency across such a boundary is UNVERIFIABLE and no link may cross it.
 */
import { comparePatchVersions, parsePatchVersion } from "@/lib/patch-impact/continuity";
import type {
  CatchUpCoverage,
  CatchUpRange,
  CoverageIssue,
  RangeInvalidDetail,
} from "./types";

export { comparePatchVersions, parsePatchVersion };

export type Adjacency = "adjacent" | "gap" | "unverifiable";

/**
 * `adjacent`: same-year plain `YY.N` → `YY.N+1`. `gap`: same-year plain with a
 * hole (a patch must be missing). `unverifiable`: any other form or a year
 * boundary.
 */
export function adjacency(earlier: string, later: string): Adjacency {
  const a = parsePatchVersion(earlier);
  const b = parsePatchVersion(later);
  if (!a || !b || a.length !== 2 || b.length !== 2 || a[0] !== b[0]) return "unverifiable";
  if (b[1] === a[1] + 1) return "adjacent";
  return b[1] > a[1] + 1 ? "gap" : "unverifiable";
}

/** Order versions oldest → newest; unparseable ones are returned separately. */
export function orderVersions(versions: readonly string[]): {
  ordered: string[];
  unorderable: string[];
} {
  const ordered: string[] = [];
  const unorderable: string[] = [];
  for (const version of versions) {
    if (parsePatchVersion(version)) ordered.push(version);
    else unorderable.push(version);
  }
  ordered.sort((a, b) => comparePatchVersions(a, b) ?? 0);
  return { ordered, unorderable };
}

export type RangeSelection =
  | { ok: false; detail: RangeInvalidDetail }
  | { ok: true; upToDate: boolean };

/** Validate `since < through` (or equal, meaning up to date). */
export function validateRange(sincePatch: string, throughPatch: string): RangeSelection {
  if (!parsePatchVersion(sincePatch)) return { ok: false, detail: "since_unparseable" };
  if (!parsePatchVersion(throughPatch)) return { ok: false, detail: "through_unparseable" };
  const cmp = comparePatchVersions(sincePatch, throughPatch);
  if (cmp === null) return { ok: false, detail: "since_unparseable" };
  if (cmp > 0) return { ok: false, detail: "since_after_through" };
  return { ok: true, upToDate: cmp === 0 };
}

/** `since < v ≤ through`. False for a version that cannot be ordered. */
export function isInRange(version: string, sincePatch: string, throughPatch: string): boolean {
  const afterSince = comparePatchVersions(version, sincePatch);
  const beforeThrough = comparePatchVersions(version, throughPatch);
  return afterSince !== null && beforeThrough !== null && afterSince > 0 && beforeThrough <= 0;
}

export type CoverageAnalysis = {
  range: CatchUpRange;
  coverage: CatchUpCoverage;
  /** Loaded versions inside the range, oldest first (deduplicated). */
  includedPatches: string[];
  /** `adjacencyVerified[i]`: `includedPatches[i]` → `includedPatches[i+1]` is provably consecutive. */
  adjacencyVerified: boolean[];
  /** Reasons that withhold every continuity claim. */
  withheldReasons: CoverageIssue["kind"][];
};

/**
 * Work out which patches the range covers and whether coverage is complete.
 *
 * `loaded` are the versions actually supplied (duplicates preserved so they can
 * be reported); `listed` is the patch index, if the caller has it.
 */
export function analyzeCoverage(args: {
  sincePatch: string;
  throughPatch: string;
  upToDate: boolean;
  loaded: readonly string[];
  listed: readonly string[] | undefined;
}): CoverageAnalysis {
  const { sincePatch, throughPatch, upToDate, loaded, listed } = args;
  const issues: CoverageIssue[] = [];

  /* Placement: what is in range, what cannot be placed. */
  const unorderable = new Set<string>();
  const loadedInRange: string[] = [];
  const duplicate = new Set<string>();
  const seenLoaded: string[] = [];
  for (const version of loaded) {
    if (!parsePatchVersion(version)) {
      unorderable.add(version);
      continue;
    }
    if (!isInRange(version, sincePatch, throughPatch)) continue;
    if (seenLoaded.some((v) => comparePatchVersions(v, version) === 0)) {
      duplicate.add(version);
      continue;
    }
    seenLoaded.push(version);
    loadedInRange.push(version);
  }
  const listedParseable: string[] = [];
  for (const version of listed ?? []) {
    if (parsePatchVersion(version)) listedParseable.push(version);
    else unorderable.add(version);
  }

  /* Coverage floor: the oldest listed patch, when the baseline predates it. */
  let coverageFloor: string | null = null;
  let clamped = false;
  if (listed !== undefined && listedParseable.length > 0) {
    const [floor] = orderVersions(listedParseable).ordered;
    coverageFloor = floor;
    clamped = (comparePatchVersions(sincePatch, floor) ?? 0) < 0;
  }

  const listedInRange = listedParseable.filter((v) => isInRange(v, sincePatch, throughPatch));
  const expectedRaw = upToDate
    ? []
    : [...listedInRange, ...loadedInRange, throughPatch];
  const expected: string[] = [];
  for (const version of orderVersions(expectedRaw).ordered) {
    if (!expected.some((v) => comparePatchVersions(v, version) === 0)) expected.push(version);
  }

  const included = orderVersions(loadedInRange).ordered;
  const missing = expected.filter(
    (v) => !included.some((l) => comparePatchVersions(l, v) === 0),
  );

  for (const version of [...unorderable].sort()) {
    issues.push({ kind: "unorderable_version", versions: [version], withholdsContinuity: true });
  }
  for (const version of orderVersions([...duplicate]).ordered) {
    issues.push({ kind: "duplicate_report", versions: [version], withholdsContinuity: true });
  }
  for (const version of missing) {
    issues.push({ kind: "missing_report", versions: [version], withholdsContinuity: true });
  }

  /* Ordinal adjacency over the expected sequence, anchored at the baseline
     (unless the baseline predates the coverage floor). */
  const sequence = upToDate
    ? []
    : clamped
      ? expected
      : [sincePatch, ...expected];
  for (let i = 0; i + 1 < sequence.length; i++) {
    const kind = adjacency(sequence[i], sequence[i + 1]);
    if (kind === "adjacent") continue;
    issues.push({
      kind: kind === "gap" ? "ordinal_gap" : "unverified_adjacency",
      versions: [sequence[i], sequence[i + 1]],
      withholdsContinuity: kind === "gap",
    });
  }

  /* Adjacency flags between consecutive INCLUDED patches, for link contiguity. */
  const adjacencyVerified = included.slice(0, -1).map(
    (version, i) => adjacency(version, included[i + 1]) === "adjacent",
  );

  const withheldReasons = [
    ...new Set(issues.filter((issue) => issue.withholdsContinuity).map((issue) => issue.kind)),
  ];

  return {
    range: {
      sincePatch,
      throughPatch,
      semantics: "since_exclusive_through_inclusive",
      status: upToDate ? "up_to_date" : "range",
      coverageFloor,
      clampedToCoverageFloor: clamped,
    },
    coverage: {
      complete: issues.length === 0,
      expectedPatches: expected,
      loadedPatches: included,
      missingPatches: missing,
      duplicatePatches: orderVersions([...duplicate]).ordered,
      unorderablePatches: [...unorderable].sort(),
      issues,
    },
    includedPatches: included,
    adjacencyVerified,
    withheldReasons,
  };
}
