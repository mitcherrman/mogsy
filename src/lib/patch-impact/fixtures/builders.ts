/** Hand-built report shapes for Patch Impact tests (not production code). */
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import type {
  PatchReconciliationStatus,
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "@/lib/patch-reports/api";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";

/** A Base Stats line as the backend ships it. */
export function statLine(
  mogzyProperty: string | null,
  label: string,
  before: string | null,
  after: string | null,
  o: Partial<PatchReportChange> = {},
): PatchReportChange {
  return mkChange({
    group_title: "Base Stats",
    property_name: label,
    mogzy_property: mogzyProperty,
    before_raw: before,
    after_raw: after,
    ...o,
  });
}

export function championCard(
  name: string,
  changes: PatchReportChange[],
  o: Partial<PatchReportCard> = {},
): PatchReportCard {
  return mkCard(name, { changes, ...o });
}

export function report(
  version: string,
  cards: PatchReportCard[],
  status?: PatchReconciliationStatus,
): PatchReportDetail {
  return {
    patch_version: version,
    source_url: `https://example.test/${version}`,
    built_at: "2026-10-01T00:00:00+00:00",
    section_titles: ["Champions"],
    skipped_sections: [],
    ...(status
      ? {
          reconciliation: {
            status,
            meaning: "",
            reconciliation_recorded: true,
            operation_id: null,
            changes_by_terminal_state: {},
            gameplay_data_may_be_stale: false,
          },
        }
      : {}),
    cards,
  };
}

/** A canonical `champion_stats` row; unspecified columns get neutral values. */
export function canonicalRow(name: string, o: Partial<ChampionBaseStats> = {}): ChampionBaseStats {
  return {
    champion_name: name,
    hp: 600,
    hp_per_level: 100,
    hp5: 5,
    mp: 300,
    mp_per_level: 40,
    ad: 60,
    ad_per_level: 3,
    attack_speed: 0.65,
    attack_speed_per_level: 2,
    armor: 30,
    armor_per_level: 4,
    magic_resist: 32,
    magic_resist_per_level: 1.25,
    move_speed: 340,
    attack_range: 550,
    ...o,
  };
}
