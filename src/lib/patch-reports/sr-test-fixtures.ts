import type { PatchReportCard, PatchReportDetail } from "./api";
import { mkCard, mkChange } from "./test-fixtures";

/** PHSR3 test fixtures (not production code): a Summoner's Rift patch with every kind of section. */
export const srCard = (name: string, section: string, o: Partial<PatchReportCard> = {}) =>
  mkCard(name, {
    section_id: `patch-${section.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    section_title: section,
    ...o,
  });

/** An SR patch with direction-grouped champions plus every kind of other section. */
export const SR_CARDS: PatchReportCard[] = [
  srCard("Ahri", "Champions", { editorial_direction: "buff", editorial_direction_source: "riot_patch_highlights" }),
  srCard("Zed", "Champions", { editorial_direction: "nerf", editorial_direction_source: "riot_patch_highlights" }),
  srCard("Kayle", "Champions", { editorial_direction: "nerf", editorial_direction_source: "riot_patch_highlights" }),
  srCard("Vi", "Champions", { editorial_direction: "adjustment", editorial_direction_source: "riot_patch_highlights" }),
  srCard("Doran's Blade", "Items", { entity_type: "item" }),
  srCard("Conqueror", "Runes", { entity_type: "rune" }),
  srCard("Baron", "Systems", { entity_type: "system", changes: [mkChange({ property_name: "Spawn" })] }),
  srCard("Augment A", "Arena", { entity_type: "system" }),
  srCard("Anvil", "Arena", { entity_type: "system" }),
  srCard("Aatrox", "ARAM: Mayhem", { entity_type: "system" }),
];

export const srDetail = (cards: PatchReportCard[] = SR_CARDS): PatchReportDetail => ({
  patch_version: "26.19",
  source_url: "https://riot.example/26-19",
  built_at: "2026-10-01T00:00:00Z",
  section_titles: ["Champions", "Items", "Runes", "Systems", "Arena", "ARAM: Mayhem"],
  skipped_sections: [],
  cards,
});

