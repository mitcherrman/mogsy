/**
 * PH1 regression fence: Patch Hub contract helpers must leave the Academy
 * Patch Brief projection unchanged. This pins a complete brief for a mixed
 * fixture and proves running the Patch Hub structure over the same payload
 * alters neither the payload nor the brief derived from it.
 */
import { describe, expect, it } from "vitest";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchReportDetail } from "./api";
import { projectPatchBrief } from "./patch-brief";
import { buildPatchReportStructure } from "./report-structure";
import { mkCard, mkChange } from "./test-fixtures";

const manifest = { champions: {} } as unknown as ChampionManifest;
const icon = (n: string) => `https://cdn.example/${n}.png`;
const ITEMS = { entity_type: "item", section_id: "patch-items", section_title: "Items" } as const;

const detail = (): PatchReportDetail => ({
  patch_version: "26.19",
  source_url: "https://example.test/notes",
  built_at: "2026-10-01T00:00:00Z",
  section_titles: ["Champions", "Items", "Arena"],
  skipped_sections: [],
  cards: [
    mkCard("Boots", { ...ITEMS, official_image_url: icon("boots") }),
    mkCard("Sword", {
      ...ITEMS,
      official_image_url: icon("sword"),
      changes: [mkChange({ before_raw: "61", after_raw: "58" })],
    }),
    mkCard("Mage", {
      ...ITEMS,
      official_image_url: icon("mage"),
      editorial_direction: "nerf",
      editorial_direction_source: "riot_section",
    }),
    mkCard("Arena Guy", { section_id: "patch-arena", section_title: "Arena", official_image_url: icon("arena") }),
  ],
});

const entry = (id: string) => ({
  entityType: "item",
  entityId: id,
  iconUrl: icon(id.toLowerCase()),
  accessibleName: id,
  docsHref: undefined,
});

describe("Patch Brief is unchanged by Patch Hub helpers", () => {
  it("projects the pinned brief", () => {
    expect(projectPatchBrief(detail(), manifest)).toEqual({
      patchVersion: "26.19",
      patchLabel: "Patch 26.19",
      fullReportHref: "/lol/patch-reports?patch=26.19",
      sections: [
        { direction: "buff", title: "Buffs", entries: [entry("Boots")] },
        // Mage: backend riot_section nerf beats its local numeric buff.
        { direction: "nerf", title: "Nerfs", entries: [entry("Sword"), entry("Mage")] },
      ],
    });
  });

  it("is identical before and after the Patch Hub structure runs on the same payload", () => {
    const d = detail();
    const snapshot = structuredClone(d);
    const before = projectPatchBrief(d, manifest);
    buildPatchReportStructure(d);
    expect(projectPatchBrief(d, manifest)).toEqual(before);
    expect(d).toEqual(snapshot);
  });

  it("still omits mode sections, which Patch Hub shows but the brief never did", () => {
    const ids = projectPatchBrief(detail(), manifest)!.sections.flatMap((s) => s.entries.map((e) => e.entityId));
    expect(ids).not.toContain("Arena Guy");
  });
});
