/**
 * Frozen real corpus: the Champions-section changes (plus every Base Stats-like
 * line on other cards) of production patch reports 26.10–26.19 and the matching
 * `champion_stats` rows, captured read-only on 2026-10-03.
 *
 * Trimmed to the fields Impact reads. Values are verbatim; nothing is edited.
 */
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import type {
  PatchReconciliationStatus,
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "@/lib/patch-reports/api";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";
import raw from "./real-corpus-26.10-26.19.json";

type RawChange = Pick<
  PatchReportChange,
  | "group_title"
  | "ability_slot"
  | "property_name"
  | "change_kind"
  | "mogzy_property"
  | "before_raw"
  | "after_raw"
>;
type RawCard = Pick<
  PatchReportCard,
  "entity_type" | "entity_name" | "section_title" | "mogzy_entity_ref"
> & { changes: RawChange[] };
type RawReport = { reconciliation_status: PatchReconciliationStatus | null; cards: RawCard[] };

const rawReports = raw.reports as unknown as Record<string, RawReport>;

/** Versions in `/api/patch-reports`, oldest first. */
export const CORPUS_VERSIONS: string[] = [...raw.versionsListed].reverse();

export const CORPUS_STATS = raw.championStats as unknown as ChampionBaseStats[];

export function corpusReport(version: string): PatchReportDetail {
  const source = rawReports[version];
  return {
    patch_version: version,
    source_url: `https://example.test/${version}`,
    built_at: "2026-09-23T00:00:00+00:00",
    section_titles: [],
    skipped_sections: [],
    ...(source.reconciliation_status
      ? {
          reconciliation: {
            status: source.reconciliation_status,
            meaning: "",
            reconciliation_recorded: true,
            operation_id: null,
            changes_by_terminal_state: {},
            gameplay_data_may_be_stale: true,
          },
        }
      : {}),
    cards: source.cards.map((card) =>
      mkCard(card.entity_name, {
        entity_type: card.entity_type,
        section_title: card.section_title,
        mogzy_entity_ref: card.mogzy_entity_ref,
        changes: card.changes.map((change) => mkChange({ ...change })),
      }),
    ),
  };
}

export const CORPUS_REPORTS: PatchReportDetail[] = CORPUS_VERSIONS.map(corpusReport);
