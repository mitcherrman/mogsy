/**
 * Patch Brief projection — the pure editorial selection over a Patch Reports
 * detail payload. Pinned here: deterministic output, editorial-order
 * champion-first selection with caps, gameplay-only filtering, numeric
 * preference, explicit direction classification, icon-gated omission, and the
 * champion-name scrub that keeps names out of every visible summary string.
 */
import { describe, expect, it } from "vitest";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type {
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "./api";
import {
  MAX_CHAMPION_ENTRIES,
  classifyCard,
  classifyChange,
  compactValue,
  projectPatchBrief,
  representativeChange,
  stripEntityName,
  summarizeChange,
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
  changes: [change()],
  ...overrides,
});

const detail = (cards: PatchReportCard[], version = "25.14"): PatchReportDetail => ({
  patch_version: version,
  source_url: "https://example.com/notes",
  built_at: "2026-07-30T00:00:00Z",
  section_titles: ["Champions", "Items"],
  skipped_sections: [],
  cards,
});

const asset = (name: string) => ({
  icon: `assets/champions/${name}/icon.png`,
  splash: `assets/champions/${name}/splash.jpg`,
  loading: `assets/champions/${name}/loading.jpg`,
  cutout: `assets/champions/${name}/cutout.png`,
});

const manifest = (...names: string[]): ChampionManifest => ({
  champions: Object.fromEntries(names.map((n) => [n, asset(n)])),
});

const FIVE = ["Ryze", "Ahri", "Corki", "Zed", "Kai'Sa"];

/* -------------------------------------------------------------------------- */
/* Direction classification                                                   */
/* -------------------------------------------------------------------------- */

describe("classifyChange — explicit, structured-field-only direction", () => {
  it("higher damage is a buff; lower damage is a nerf", () => {
    expect(classifyChange(change({ before_raw: "58", after_raw: "61" }))).toBe("buff");
    expect(classifyChange(change({ before_raw: "61", after_raw: "58" }))).toBe("nerf");
  });

  it("cooldown and cost invert: going up is a nerf, down is a buff", () => {
    const cd = change({ property_name: "Cooldown", before_raw: "8", after_raw: "10" });
    expect(classifyChange(cd)).toBe("nerf");
    const cost = change({ property_name: "Mana cost", before_raw: "80", after_raw: "60" });
    expect(classifyChange(cost)).toBe("buff");
  });

  it("unparseable or unchanged numbers and mechanical changes are adjustments", () => {
    expect(classifyChange(change({ before_raw: null, after_raw: "5" }))).toBe("adjustment");
    expect(classifyChange(change({ before_raw: "5", after_raw: "5" }))).toBe("adjustment");
    expect(
      classifyChange(change({ change_kind: "mechanical", detail_text: "Now scales." })),
    ).toBe("adjustment");
  });

  it("bugfix labels classify as fix", () => {
    expect(classifyChange(change({ group_title: "Bugfixes", change_kind: "mechanical" }))).toBe(
      "fix",
    );
  });
});

describe("classifyCard — unanimous wins, mixed reads Adjusted, fixes don't dilute", () => {
  it("all buffs → buff; buff + nerf → adjustment", () => {
    expect(classifyCard(card("Ryze", { changes: [change(), change()] }))).toBe("buff");
    expect(
      classifyCard(
        card("Ryze", {
          changes: [change(), change({ before_raw: "61", after_raw: "58" })],
        }),
      ),
    ).toBe("adjustment");
  });

  it("a buff plus a bugfix is still a buff; a card of only fixes is a fix", () => {
    expect(
      classifyCard(
        card("Ryze", {
          changes: [change(), change({ group_title: "Bugfixes", change_kind: "mechanical" })],
        }),
      ),
    ).toBe("buff");
    expect(
      classifyCard(
        card("Ryze", {
          changes: [change({ group_title: "Bugfixes", change_kind: "mechanical" })],
        }),
      ),
    ).toBe("fix");
  });
});

/* -------------------------------------------------------------------------- */
/* Summaries and sanitization                                                 */
/* -------------------------------------------------------------------------- */

describe("summaries — short, structured, and never naming the champion", () => {
  it("numeric changes render as label before → after", () => {
    const c = change({ ability_slot: "Q", group_title: "Q - Overload", property_name: "Cooldown", before_raw: "8", after_raw: "10" });
    expect(summarizeChange(c, "Ryze")).toBe("Q cooldown 8 → 10");
  });

  it("slash-scaling values compact to first–last so numbers are never cut", () => {
    expect(compactValue("60/70/80/90/100")).toBe("60–100");
    expect(compactValue("8/7/6")).toBe("8–6");
    expect(compactValue("58")).toBe("58");
  });

  it("overlong numeric lines degrade to a whole-word directional phrase", () => {
    const c = change({
      property_name: "Empowered bonus magic damage against monsters",
      before_raw: "300",
      after_raw: "360",
    });
    const summary = summarizeChange(c, "Ryze");
    expect(summary.length).toBeLessThanOrEqual(41);
    expect(summary).not.toMatch(/\d+\s*→/);
    expect(summary).toContain("increased");
  });

  it("mechanical prose (detail_text) is never rendered — labels only", () => {
    const c = change({
      change_kind: "mechanical",
      property_name: "Passive",
      detail_text: "Ryze now gains bonus shield based on mana.",
    });
    expect(summarizeChange(c, "Ryze")).toBe("Passive updated");
  });

  it("a champion name embedded in source fields never survives into the summary", () => {
    const c = change({
      group_title: "Ryze Q - Overload",
      property_name: "Ryze's Q damage",
      ability_slot: null,
      before_raw: "60",
      after_raw: "70",
    });
    expect(summarizeChange(c, "Ryze").toLowerCase()).not.toContain("ryze");
  });

  it("stripEntityName removes full names, name words, and possessives", () => {
    expect(stripEntityName("Nunu & Willump W speed", "Nunu & Willump")).toBe("W speed");
    expect(stripEntityName("Kai'Sa’s passive", "Kai'Sa")).toBe("passive");
  });
});

/* -------------------------------------------------------------------------- */
/* Representative change                                                      */
/* -------------------------------------------------------------------------- */

describe("representativeChange — numeric preferred, report order breaks ties", () => {
  it("skips leading mechanical changes when a parseable numeric change exists", () => {
    const mech = change({ change_kind: "mechanical", property_name: "Passive" });
    const num = change({ property_name: "Base armor", before_raw: "30", after_raw: "33" });
    expect(representativeChange(card("Ryze", { changes: [mech, num] }))).toBe(num);
  });

  it("falls back to the first change when nothing numeric parses", () => {
    const a = change({ change_kind: "mechanical", property_name: "Passive" });
    const b = change({ change_kind: "mechanical", property_name: "Ultimate" });
    expect(representativeChange(card("Ryze", { changes: [a, b] }))).toBe(a);
  });
});

/* -------------------------------------------------------------------------- */
/* Projection                                                                 */
/* -------------------------------------------------------------------------- */

describe("projectPatchBrief — deterministic editorial selection", () => {
  it("produces identical output for identical input (no randomness)", () => {
    const d = detail(FIVE.map((n) => card(n)));
    const m = manifest(...FIVE);
    expect(projectPatchBrief(d, m)).toEqual(projectPatchBrief(d, m));
  });

  it("caps champions at four, preserving report order, and reports honestly", () => {
    const brief = projectPatchBrief(detail(FIVE.map((n) => card(n))), manifest(...FIVE));
    expect(brief).not.toBeNull();
    expect(brief!.changes).toHaveLength(MAX_CHAMPION_ENTRIES);
    expect(brief!.changes.map((c) => c.accessibleName)).toEqual(FIVE.slice(0, 4));
    expect(brief!.descriptor).toBe("Showing 4 of 5 champion changes");
    expect(brief!.patchLabel).toBe("Patch 25.14");
    expect(brief!.fullReportHref).toBe("/lol/patch-reports?patch=25.14");
  });

  it("selects at most one entry per champion even with duplicate cards", () => {
    const cards = [card("Ryze"), card("Ryze"), card("Ahri"), card("Corki"), card("Zed")];
    const brief = projectPatchBrief(detail(cards), manifest("Ryze", "Ahri", "Corki", "Zed"));
    expect(brief!.changes.map((c) => c.accessibleName)).toEqual([
      "Ryze",
      "Ahri",
      "Corki",
      "Zed",
    ]);
  });

  it("keeps only main-section gameplay changes: no ARAM/rune/system entries", () => {
    const cards = [
      card("Ryze"),
      card("Ahri", { section_title: "ARAM: Mayhem" }),
      card("Corki"),
      card("Zed"),
      card("Kai'Sa"),
      card("Lethal Tempo", { entity_type: "rune", section_title: "Runes" }),
      card("Minions", { entity_type: "system", section_title: "Systems" }),
    ];
    const brief = projectPatchBrief(detail(cards), manifest(...FIVE, "Lethal Tempo", "Minions"));
    expect(brief!.changes.map((c) => c.accessibleName)).toEqual([
      "Ryze",
      "Corki",
      "Zed",
      "Kai'Sa",
    ]);
  });

  it("omits a champion whose icon cannot be resolved — never a visible-name fallback", () => {
    const cards = FIVE.map((n) => card(n));
    const m = manifest("Ryze", "Corki", "Zed", "Kai'Sa"); // no Ahri icon
    const brief = projectPatchBrief(detail(cards), m);
    expect(brief!.changes.map((c) => c.accessibleName)).toEqual([
      "Ryze",
      "Corki",
      "Zed",
      "Kai'Sa",
    ]);
    for (const entry of brief!.changes) {
      expect(entry.iconUrl).toContain(`${entry.accessibleName}/icon.png`);
      expect(entry.summary.toLowerCase()).not.toContain(entry.accessibleName.toLowerCase());
    }
  });

  it("returns null (neutral fallback) below three eligible champions", () => {
    expect(
      projectPatchBrief(detail([card("Ryze"), card("Ahri")]), manifest("Ryze", "Ahri")),
    ).toBeNull();
    expect(projectPatchBrief(detail([]), manifest(...FIVE))).toBeNull();
    // Icons unavailable entirely → same quiet outcome.
    expect(projectPatchBrief(detail(FIVE.map((n) => card(n))), null)).toBeNull();
  });

  it("includes at most one item, first eligible, with the patch-report icon chain", () => {
    const cards = [
      ...FIVE.slice(0, 3).map((n) => card(n)),
      card("Long Sword", {
        entity_type: "item",
        section_title: "Items",
        mogzy_image_path: null,
        official_image_url: "https://cdn.example/long-sword.png",
      }),
      card("Doran's Blade", {
        entity_type: "item",
        section_title: "Items",
        official_image_url: "https://cdn.example/dorans.png",
      }),
    ];
    const brief = projectPatchBrief(detail(cards), manifest(...FIVE));
    expect(brief!.itemChange?.accessibleName).toBe("Long Sword");
    expect(brief!.itemChange?.iconUrl).toBe("https://cdn.example/long-sword.png");
    expect(brief!.itemChange?.docsHref).toBeUndefined();
  });

  it("skips items with no resolvable icon and tolerates their absence", () => {
    const cards = [
      ...FIVE.slice(0, 3).map((n) => card(n)),
      card("Mystery Item", { entity_type: "item", section_title: "Items" }),
    ];
    const brief = projectPatchBrief(detail(cards), manifest(...FIVE));
    expect(brief!.itemChange).toBeUndefined();
    expect(brief!.descriptor).toBe("All champion changes this patch");
  });

  it("links docs only for catalogued champions, via the League Docs slug", () => {
    const cards = [
      card("Kai'Sa"),
      card("Ryze"),
      card("Ahri", { mogzy_entity_ref: null }),
    ];
    const brief = projectPatchBrief(detail(cards), manifest("Kai'Sa", "Ryze", "Ahri"));
    expect(brief!.changes[0].docsHref).toBe("/lol/docs/champions/kaisa");
    expect(brief!.changes[1].docsHref).toBe("/lol/docs/champions/ryze");
    expect(brief!.changes[2].docsHref).toBeUndefined();
  });

  it("tolerates incomplete source data without throwing or inventing content", () => {
    const cards = [
      card("Ryze", { changes: [] }), // no changes → skipped
      card("Ahri", {
        changes: [change({ before_raw: null, after_raw: null, change_kind: "mechanical", property_name: "" , group_title: ""})],
      }),
      card("Corki"),
      card("Zed"),
      card("Kai'Sa"),
    ];
    const brief = projectPatchBrief(detail(cards), manifest(...FIVE));
    expect(brief!.changes.map((c) => c.accessibleName)).toEqual([
      "Ahri",
      "Corki",
      "Zed",
      "Kai'Sa",
    ]);
    const ahri = brief!.changes[0];
    expect(ahri.summary).toBe("Gameplay update");
    expect(ahri.direction).toBe("adjustment");
  });
});
