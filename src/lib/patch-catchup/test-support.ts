/** Builders and fixture loaders for Catch-Up tests (not production code). */
import type {
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "@/lib/patch-reports/api";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";
import corpusJson from "./fixtures/real-corpus-26.10-26.19.json";
import ph3aFixtureJson from "./fixtures/ph3a-continuity-fixture.json";

/* -------------------------------------------------------------------------- */
/* Synthetic builders                                                         */
/* -------------------------------------------------------------------------- */

/** An ability line (`group` carries the slot prefix Riot uses, e.g. "Q - Chain Lash"). */
export function abilityLine(
  group: string,
  slot: string | null,
  property: string,
  before: string | null,
  after: string | null,
  o: Partial<PatchReportChange> = {},
): PatchReportChange {
  return mkChange({
    group_title: group,
    ability_slot: slot,
    property_name: property,
    before_raw: before,
    after_raw: after,
    ...o,
  });
}

/** A Base Stats-style line: no slot, group "Base Stats". */
export function statLine(
  property: string,
  before: string | null,
  after: string | null,
  o: Partial<PatchReportChange> = {},
): PatchReportChange {
  return abilityLine("Base Stats", null, property, before, after, o);
}

export function championCard(
  name: string,
  changes: PatchReportChange[],
  o: Partial<PatchReportCard> = {},
): PatchReportCard {
  return mkCard(name, { changes, ...o });
}

export function itemCard(
  name: string,
  changes: PatchReportChange[],
  o: Partial<PatchReportCard> = {},
): PatchReportCard {
  return mkCard(name, {
    entity_type: "item",
    section_id: "patch-items",
    section_title: "Items",
    mogzy_entity_ref: null,
    changes,
    ...o,
  });
}

/** A mode/system card (never chainable). */
export function systemCard(
  name: string,
  changes: PatchReportChange[],
  section: { id: string; title: string } = { id: "patch-arena", title: "Arena" },
  o: Partial<PatchReportCard> = {},
): PatchReportCard {
  return mkCard(name, {
    entity_type: "system",
    section_id: section.id,
    section_title: section.title,
    mogzy_entity_ref: null,
    changes,
    ...o,
  });
}

export function report(
  version: string,
  cards: PatchReportCard[],
  sectionTitles: string[] = ["Champions", "Items"],
): PatchReportDetail {
  return {
    patch_version: version,
    source_url: `https://example.test/${version}`,
    built_at: "2026-10-01T00:00:00+00:00",
    section_titles: sectionTitles,
    skipped_sections: [],
    cards,
  };
}

/** Recursively freeze, so a test proves the domain never mutates a payload. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Production corpus (PH3-A: 10 reports, 26.10–26.19, captured 2026-10-04)    */
/* -------------------------------------------------------------------------- */

type RawChange = Pick<
  PatchReportChange,
  | "group_title"
  | "ability_slot"
  | "property_name"
  | "change_kind"
  | "is_new"
  | "before_raw"
  | "after_raw"
  | "mogzy_property"
>;
type RawCard = Pick<
  PatchReportCard,
  | "entity_type"
  | "entity_name"
  | "entity_slug"
  | "section_id"
  | "section_title"
  | "mogzy_entity_ref"
> & { changes: RawChange[] };
type RawReport = { patch_version: string; section_titles: string[]; cards: RawCard[] };

export const CORPUS_RAW = corpusJson as unknown as {
  listedVersions: string[];
  fullBodySha256: Record<string, string>;
  reports: Record<string, RawReport>;
};

/** Versions in `/api/patch-reports`, oldest first. */
export const CORPUS_VERSIONS: string[] = [...CORPUS_RAW.listedVersions].reverse();

export function corpusReport(version: string): PatchReportDetail {
  const source = CORPUS_RAW.reports[version];
  return report(
    version,
    source.cards.map((card) =>
      mkCard(card.entity_name, {
        ...card,
        changes: card.changes.map((change) => mkChange({ ...change })),
      }),
    ),
    source.section_titles,
  );
}

export function corpusReports(): PatchReportDetail[] {
  return CORPUS_VERSIONS.map(corpusReport);
}

/* -------------------------------------------------------------------------- */
/* PH3-A fixture                                                              */
/* -------------------------------------------------------------------------- */

export type Ph3aLineRef = {
  patch: string;
  group: string;
  slot: string | null;
  property: string;
  before: string;
  after: string;
};

export type Ph3aExpectedLink = {
  tier: "A" | "B";
  reason: string;
  entity: string;
  scope: "sr.champions" | "sr.items";
  a: Ph3aLineRef;
  b: Ph3aLineRef;
};

export type Ph3aCandidate = {
  scope: string;
  entity: string;
  a_patch: string;
  b_patch: string;
  a_group: string;
  a_slot: string | null;
  b_group: string;
  b_slot: string | null;
  a_prop: string;
  b_prop: string;
  a_before: string | null;
  a_after: string | null;
  b_before: string | null;
  b_after: string | null;
  verdict: "proven" | "plausible_unsafe" | "unclassifiable" | "rejected";
  tier: "A" | "B" | null;
};

export type Ph3aExpectedChain = {
  entity: string;
  scope: string;
  steps: Array<{ patch: string; group: string; property: string; before: string; after: string }>;
  tiers: string[];
  classification: string;
};

export const PH3A = ph3aFixtureJson as unknown as {
  report_sha256: Record<string, string>;
  expected_links: Ph3aExpectedLink[];
  candidate_table: Ph3aCandidate[];
  expected_chains_by_range: Array<{ since: string; end: string; chains: Ph3aExpectedChain[] }>;
};
