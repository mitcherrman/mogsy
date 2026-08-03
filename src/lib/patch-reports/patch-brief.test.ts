/**
 * Patch Brief projection — the icon-only Buffs / Nerfs / Adjustments grouping
 * over a Patch Reports detail payload.
 *
 * Direction authority pinned here: the Patch Reports contract carries NO
 * Riot-authored or normalized direction metadata (audited: section/group/
 * property structure only), so grouping uses Mogzy's deterministic classifier
 * over structured numeric fields. These tests are that classifier's spec.
 */
import { describe, expect, it } from "vitest";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type {
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "./api";
import {
  classifyCardDirection,
  classifyChange,
  projectPatchBrief,
} from "./patch-brief";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const change = (overrides: Partial<PatchReportChange> = {}): PatchReportChange => ({
  group_title: "Base Stats",
  ability_slot: null,
  ability_icon_url: null,
  property_name: "Base attack damage",
  change_kind: "numeric",
  is_new: false,
  before_raw: "58",
  after_raw: "61",
  detail_text: null,
  mogzy_property: null,
  mogzy_current_raw: null,
  mogzy_status: "matches",
  proposal_id: null,
  proposal_status: null,
  ...overrides,
});

const BUFF = change(); // 58 → 61
const NERF = change({ before_raw: "61", after_raw: "58" });
const MECHANICAL = change({
  change_kind: "mechanical",
  property_name: "Passive",
  detail_text: "Now scales with bonus mana.",
});
const FIX = change({
  group_title: "Bugfixes",
  property_name: "Bugfixes",
  change_kind: "mechanical",
});

let nextCardId = 1;
const card = (
  name: string,
  overrides: Partial<PatchReportCard> = {},
): PatchReportCard => ({
  id: nextCardId++,
  entity_type: "champion",
  entity_name: name,
  entity_slug: null,
  section_id: "champions",
  section_title: "Champions",
  official_image_url: null,
  mogzy_image_path: null,
  mogzy_entity_ref: name,
  context_text: null,
  aggregate_status: "matches",
  changes: [BUFF],
  ...overrides,
});

const item = (name: string, overrides: Partial<PatchReportCard> = {}): PatchReportCard =>
  card(name, {
    entity_type: "item",
    section_id: "items",
    section_title: "Items",
    official_image_url: `https://cdn.example/${name.replace(/\s+/g, "-")}.png`,
    ...overrides,
  });

const detail = (cards: PatchReportCard[], version = "26.14"): PatchReportDetail => ({
  patch_version: version,
  source_url: "https://example.com/notes",
  built_at: "2026-07-30T00:00:00Z",
  section_titles: ["Champions", "Items"],
  skipped_sections: [],
  cards,
});

const manifest = (...names: string[]): ChampionManifest => ({
  champions: Object.fromEntries(
    names.map((n) => [
      n,
      {
        icon: `assets/champions/${n}/icon.png`,
        splash: `assets/champions/${n}/splash.jpg`,
        loading: `assets/champions/${n}/loading.jpg`,
        cutout: `assets/champions/${n}/cutout.png`,
      },
    ]),
  ),
});

const names = (brief: ReturnType<typeof projectPatchBrief>, direction: string) =>
  brief!.sections.find((s) => s.direction === direction)?.entries.map((e) => e.accessibleName);

/* -------------------------------------------------------------------------- */
/* Deterministic fallback classification (no authoritative metadata exists)   */
/* -------------------------------------------------------------------------- */

describe("classifyChange — deterministic, structured-field-only", () => {
  it("numeric movement decides: up = buff, down = nerf for normal stats", () => {
    expect(classifyChange(BUFF)).toBe("buff");
    expect(classifyChange(NERF)).toBe("nerf");
  });

  it("cooldown/cost/recharge invert the direction", () => {
    expect(
      classifyChange(change({ property_name: "Cooldown", before_raw: "8", after_raw: "10" })),
    ).toBe("nerf");
    expect(
      classifyChange(change({ property_name: "Mana cost", before_raw: "80", after_raw: "60" })),
    ).toBe("buff");
  });

  it("mechanical, unparseable, or unchanged values are adjustments; bugfix labels are fixes", () => {
    expect(classifyChange(MECHANICAL)).toBe("adjustment");
    expect(classifyChange(change({ before_raw: null }))).toBe("adjustment");
    expect(classifyChange(change({ after_raw: "58" }))).toBe("adjustment");
    expect(classifyChange(FIX)).toBe("fix");
  });
});

describe("classifyCardDirection — one section per entity", () => {
  it("unanimous numeric direction wins; bugfix lines never dilute it", () => {
    expect(classifyCardDirection(card("Ryze", { changes: [BUFF, BUFF] }))).toBe("buff");
    expect(classifyCardDirection(card("Ryze", { changes: [NERF, FIX] }))).toBe("nerf");
  });

  it("mixed buff/nerf becomes an adjustment", () => {
    expect(classifyCardDirection(card("Ryze", { changes: [BUFF, NERF] }))).toBe("adjustment");
  });

  it("decisive changes mixed with neutral mechanical work become an adjustment", () => {
    expect(classifyCardDirection(card("Ryze", { changes: [BUFF, MECHANICAL] }))).toBe(
      "adjustment",
    );
  });

  it("neutral mechanical reworks are adjustments", () => {
    expect(classifyCardDirection(card("Ryze", { changes: [MECHANICAL] }))).toBe("adjustment");
  });

  it("a fixes-only card has no reliable home and returns null", () => {
    expect(classifyCardDirection(card("Ryze", { changes: [FIX, FIX] }))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

describe("projectPatchBrief — icon-only grouped projection", () => {
  it("is deterministic: identical input → identical output", () => {
    const d = detail([card("Ryze"), card("Ahri", { changes: [NERF] }), item("Long Sword")]);
    const m = manifest("Ryze", "Ahri");
    expect(projectPatchBrief(d, m)).toEqual(projectPatchBrief(d, m));
  });

  it("groups champions AND items into Buffs/Nerfs/Adjustments, preserving report order", () => {
    const d = detail([
      card("Ryze"), // buff
      card("Ahri", { changes: [NERF] }),
      card("Corki", { changes: [BUFF, NERF] }), // mixed → adjustment
      card("Zed"), // buff
      item("Long Sword", { changes: [NERF] }),
      item("Doran's Blade", { changes: [BUFF] }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze", "Ahri", "Corki", "Zed"));
    expect(brief!.sections.map((s) => s.title)).toEqual(["Buffs", "Nerfs", "Adjustments"]);
    expect(names(brief, "buff")).toEqual(["Ryze", "Zed", "Doran's Blade"]);
    expect(names(brief, "nerf")).toEqual(["Ahri", "Long Sword"]);
    expect(names(brief, "adjustment")).toEqual(["Corki"]);
    expect(brief!.patchLabel).toBe("Patch 26.14");
    expect(brief!.fullReportHref).toBe("/lol/patch-reports?patch=26.14");
  });

  it("has no entity caps: all ten champions of a big patch appear once each", () => {
    const ten = ["A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8", "I9", "J10"];
    const brief = projectPatchBrief(detail(ten.map((n) => card(n))), manifest(...ten));
    expect(names(brief, "buff")).toEqual(ten);
    expect(brief!.sections).toHaveLength(1);
  });

  it("deduplicates by entity: duplicate cards yield one icon, first card wins", () => {
    const d = detail([
      card("Ryze"),
      card("Ryze", { changes: [NERF] }), // later duplicate ignored entirely
      item("Long Sword"),
      item("Long Sword", { changes: [NERF] }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze"));
    expect(names(brief, "buff")).toEqual(["Ryze", "Long Sword"]);
    expect(brief!.sections).toHaveLength(1);
  });

  it("hides every empty section — adjustments, buffs, or nerfs alike", () => {
    const onlyNerfs = projectPatchBrief(
      detail([card("Ryze", { changes: [NERF] })]),
      manifest("Ryze"),
    );
    expect(onlyNerfs!.sections.map((s) => s.title)).toEqual(["Nerfs"]);

    const noAdjustments = projectPatchBrief(
      detail([card("Ryze"), card("Ahri", { changes: [NERF] })]),
      manifest("Ryze", "Ahri"),
    );
    expect(noAdjustments!.sections.map((s) => s.title)).toEqual(["Buffs", "Nerfs"]);
  });

  it("omits fix-only entities instead of inventing a Fixes section", () => {
    const brief = projectPatchBrief(
      detail([card("Ryze"), card("Kai'Sa", { changes: [FIX] })]),
      manifest("Ryze", "Kai'Sa"),
    );
    expect(brief!.sections.map((s) => s.title)).toEqual(["Buffs"]);
    expect(names(brief, "buff")).toEqual(["Ryze"]);
  });

  it("keeps only main-section gameplay entities: no ARAM/rune/system entries", () => {
    const d = detail([
      card("Ryze"),
      card("Ahri", { section_title: "ARAM: Mayhem" }),
      card("Lethal Tempo", { entity_type: "rune", section_title: "Runes" }),
      card("Minions", { entity_type: "system", section_title: "Systems" }),
      item("Long Sword", { section_title: "Arena" }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze", "Ahri", "Lethal Tempo", "Minions"));
    expect(names(brief, "buff")).toEqual(["Ryze"]);
    expect(brief!.sections).toHaveLength(1);
  });

  it("omits entities whose icon cannot be resolved — never a visible-name fallback", () => {
    const d = detail([
      card("Ryze"),
      card("Ahri"), // not in manifest → omitted
      item("Mystery Item", { official_image_url: null }), // no icon chain → omitted
      item("Long Sword"),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze"));
    expect(names(brief, "buff")).toEqual(["Ryze", "Long Sword"]);
  });

  it("items use the patch-report icon chain and never link (no item route exists)", () => {
    const d = detail([
      item("Immortal Path", { mogzy_image_path: "assets/items/immortal-path.png" }),
      item("Long Sword"),
    ]);
    const brief = projectPatchBrief(d, null);
    const entries = brief!.sections[0].entries;
    expect(entries[0].iconUrl).toContain("assets/items/immortal-path.png");
    expect(entries[1].iconUrl).toBe("https://cdn.example/Long-Sword.png");
    expect(entries.every((e) => e.docsHref === undefined)).toBe(true);
  });

  it("links catalogued champions via the League Docs slug; uncatalogued get no link", () => {
    const d = detail([card("Kai'Sa"), card("Ahri", { mogzy_entity_ref: null })]);
    const brief = projectPatchBrief(d, manifest("Kai'Sa", "Ahri"));
    const [kaisa, ahri] = brief!.sections[0].entries;
    expect(kaisa.docsHref).toBe("/lol/docs/champions/kaisa");
    expect(ahri.docsHref).toBeUndefined();
  });

  it("returns null (neutral fallback) when nothing qualifies", () => {
    expect(projectPatchBrief(detail([]), manifest())).toBeNull();
    // All icons unresolvable:
    expect(projectPatchBrief(detail([card("Ryze")]), null)).toBeNull();
    // Only fix-only and empty cards:
    expect(
      projectPatchBrief(
        detail([card("Ryze", { changes: [FIX] }), card("Ahri", { changes: [] })]),
        manifest("Ryze", "Ahri"),
      ),
    ).toBeNull();
  });
});
