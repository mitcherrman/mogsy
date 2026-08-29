/**
 * Patch Brief projection — the icon-only Buffs / Nerfs / Adjustments grouping
 * over a Patch Reports detail payload.
 *
 * Direction authority pinned here: cards carrying the backend editorial
 * contract (editorial_direction + editorial_direction_source, authority order
 * riot_section > riot_patch_highlights > mogzy_inferred > null) group by that
 * contract; legacy payloads without the fields fall back to Mogzy's local
 * deterministic classifier over structured numeric fields. The legacy-shaped
 * fixtures below (no editorial fields) are that fallback's spec.
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

  it("aggregates across cards: a champion with one buff card and one nerf card lands once in Adjustments, never Buffs", () => {
    const d = detail([
      card("Ryze"), // first card is a buff…
      card("Ryze", { changes: [NERF] }), // …but a later card nerfs him
      card("Ahri"),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze", "Ahri"));
    expect(names(brief, "adjustment")).toEqual(["Ryze"]);
    expect(names(brief, "buff")).toEqual(["Ahri"]); // Ryze must not remain in Buffs
    const allNames = brief!.sections.flatMap((s) => s.entries.map((e) => e.accessibleName));
    expect(allNames.filter((n) => n === "Ryze")).toHaveLength(1);
  });

  it("aggregates across cards for items too: buff card + nerf card → once in Adjustments", () => {
    const d = detail([item("Long Sword"), item("Long Sword", { changes: [NERF] })]);
    const brief = projectPatchBrief(d, manifest());
    expect(brief!.sections.map((s) => s.title)).toEqual(["Adjustments"]);
    expect(names(brief, "adjustment")).toEqual(["Long Sword"]);
  });

  it("multiple same-direction cards stay one entry in that direction", () => {
    const buffs = projectPatchBrief(
      detail([card("Ryze"), card("Ryze", { changes: [BUFF, BUFF] })]),
      manifest("Ryze"),
    );
    expect(buffs!.sections.map((s) => s.title)).toEqual(["Buffs"]);
    expect(names(buffs, "buff")).toEqual(["Ryze"]);

    const nerfs = projectPatchBrief(
      detail([
        item("Long Sword", { changes: [NERF] }),
        item("Long Sword", { changes: [NERF] }),
      ]),
      manifest(),
    );
    expect(nerfs!.sections.map((s) => s.title)).toEqual(["Nerfs"]);
    expect(names(nerfs, "nerf")).toEqual(["Long Sword"]);
  });

  it("a decisive card plus a neutral mechanical card aggregates to Adjustments", () => {
    const d = detail([card("Ryze"), card("Ryze", { changes: [MECHANICAL] })]);
    const brief = projectPatchBrief(d, manifest("Ryze"));
    expect(brief!.sections.map((s) => s.title)).toEqual(["Adjustments"]);
    expect(names(brief, "adjustment")).toEqual(["Ryze"]);
  });

  it("entity order follows FIRST source appearance even when later cards complete the aggregate", () => {
    const d = detail([
      card("Ahri", { changes: [NERF] }),
      card("Ryze", { changes: [NERF] }),
      card("Ahri", { changes: [NERF] }), // extra Ahri card must not move her behind Ryze
    ]);
    const brief = projectPatchBrief(d, manifest("Ahri", "Ryze"));
    expect(names(brief, "nerf")).toEqual(["Ahri", "Ryze"]);
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

  it("prefers the backend editorial contract over local numeric inference", () => {
    // The numbers say buff; Riot's reviewed highlights say nerf. Riot wins.
    const d = detail([
      card("Jayce", {
        changes: [BUFF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_patch_highlights",
        numeric_direction: "positive",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Jayce"));
    expect(brief!.sections.map((s) => s.title)).toEqual(["Nerfs"]);
    expect(names(brief, "nerf")).toEqual(["Jayce"]);
  });

  it("resolves provenance precedence across an entity's cards: riot_section beats riot_patch_highlights beats mogzy_inferred", () => {
    const d = detail([
      card("Ahri", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "mogzy_inferred",
      }),
      card("Ahri", {
        changes: [BUFF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_patch_highlights",
      }),
      card("Yone", {
        changes: [BUFF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_patch_highlights",
      }),
      card("Yone", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_section",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ahri", "Yone"));
    expect(names(brief, "buff")).toEqual(["Ahri"]); // highlights beat inference
    expect(names(brief, "nerf")).toEqual(["Yone"]); // riot_section beats highlights
  });

  it("same-level conflicting claims resolve to Adjustments, never first-card-wins", () => {
    const d = detail([
      card("Corki", {
        changes: [BUFF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_section",
      }),
      card("Corki", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_section",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Corki"));
    expect(brief!.sections.map((s) => s.title)).toEqual(["Adjustments"]);
    expect(names(brief, "adjustment")).toEqual(["Corki"]);
  });

  it("riot_text_semantic outranks riot_patch_highlights for the same entity", () => {
    // Yasuo/Yone case: the semantic read of Riot's own change text says the
    // -10% → -5% crit-damage reduction is a BUFF (less reduction), while the
    // older Patch Highlights grouping still says nerf. Semantic wins, and it
    // also wins regardless of card order.
    const d = detail([
      card("Yasuo", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_patch_highlights",
      }),
      card("Yasuo", {
        changes: [NERF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_text_semantic",
      }),
      card("Yone", {
        changes: [NERF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_text_semantic",
      }),
      card("Yone", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_patch_highlights",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Yasuo", "Yone"));
    expect(brief!.sections.map((s) => s.title)).toEqual(["Buffs"]);
    expect(names(brief, "buff")).toEqual(["Yasuo", "Yone"]);
    expect(names(brief, "nerf")).toEqual([]);
  });

  it("riot_text_semantic still loses to riot_section, and beats mogzy_inferred", () => {
    const d = detail([
      card("Ahri", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "mogzy_inferred",
      }),
      card("Ahri", {
        changes: [BUFF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_text_semantic",
      }),
      card("Zed", {
        changes: [BUFF],
        editorial_direction: "buff",
        editorial_direction_source: "riot_text_semantic",
      }),
      card("Zed", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_section",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ahri", "Zed"));
    expect(names(brief, "buff")).toEqual(["Ahri"]); // semantic beats inference
    expect(names(brief, "nerf")).toEqual(["Zed"]); // riot_section beats semantic
  });

  it("a fix-only entity carrying an explicit null direction is still omitted", () => {
    const d = detail([
      card("Ryze"),
      card("Ziggs", {
        changes: [FIX],
        editorial_direction: null,
        editorial_direction_source: null,
        numeric_direction: "non_numeric",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze", "Ziggs"));
    expect(brief!.sections.map((s) => s.title)).toEqual(["Buffs"]);
    expect(names(brief, "buff")).toEqual(["Ryze"]);
  });

  it("a null-direction card plus a classified card uses the classified claim", () => {
    const d = detail([
      card("Ahri", {
        changes: [FIX],
        editorial_direction: null,
        editorial_direction_source: null,
      }),
      card("Ahri", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "mogzy_inferred",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ahri"));
    expect(names(brief, "nerf")).toEqual(["Ahri"]);
  });

  /* ------------------------------------------------------------------ */
  /* Rollout compatibility: the three payload states a live backend can  */
  /* serve during a partial migration. State B is the dangerous one —    */
  /* an upgraded schema whose rows have not been rebuilt yet serves the  */
  /* fields as explicit nulls, which must NOT empty the brief.           */
  /* ------------------------------------------------------------------ */

  it("State A — legacy backend (fields absent) uses the local classifier", () => {
    const d = detail([
      card("Ryze", { changes: [BUFF] }),
      card("Garen", { changes: [NERF] }),
      card("Azir", { changes: [MECHANICAL] }),
    ]);
    // No editorial_* keys at all on any card.
    for (const c of d.cards) {
      expect("editorial_direction" in c).toBe(false);
    }
    const brief = projectPatchBrief(d, manifest("Ryze", "Garen", "Azir"));
    expect(names(brief, "buff")).toEqual(["Ryze"]);
    expect(names(brief, "nerf")).toEqual(["Garen"]);
    expect(names(brief, "adjustment")).toEqual(["Azir"]);
  });

  it("State B — upgraded schema, unrebuilt rows (fields present but null) still classifies locally", () => {
    const nulled = {
      editorial_direction: null,
      editorial_direction_source: null,
      numeric_direction: null,
    } satisfies Partial<PatchReportCard>;
    const d = detail([
      card("Ryze", { changes: [BUFF], ...nulled }),
      card("Garen", { changes: [NERF], ...nulled }),
      card("Azir", { changes: [MECHANICAL], ...nulled }),
      item("Trinity Force", { changes: [NERF], ...nulled }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ryze", "Garen", "Azir"));
    // The whole point: nothing is silently dropped.
    expect(names(brief, "buff")).toEqual(["Ryze"]);
    expect(names(brief, "nerf")).toEqual(["Garen", "Trinity Force"]);
    expect(names(brief, "adjustment")).toEqual(["Azir"]);
  });

  it("State B — a partially rebuilt entity prefers its populated card over the null one", () => {
    const d = detail([
      card("Ahri", {
        changes: [BUFF],
        editorial_direction: null,
        editorial_direction_source: null,
        numeric_direction: null,
      }),
      card("Ahri", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_patch_highlights",
        numeric_direction: "negative",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Ahri"));
    expect(names(brief, "nerf")).toEqual(["Ahri"]);
    expect(brief!.sections.map((s) => s.title)).toEqual(["Nerfs"]);
  });

  it("State C — populated fields override what the local classifier would say", () => {
    const d = detail([
      // Numbers say buff; Riot's reviewed highlights say nerf. Backend wins.
      card("Senna", {
        changes: [BUFF],
        editorial_direction: "nerf",
        editorial_direction_source: "riot_patch_highlights",
        numeric_direction: "positive",
      }),
    ]);
    const brief = projectPatchBrief(d, manifest("Senna"));
    expect(names(brief, "nerf")).toEqual(["Senna"]);
    expect(brief!.sections.map((s) => s.title)).toEqual(["Nerfs"]);
  });

  it("patch 26.14 acceptance: reviewed Riot Patch Highlights grouping is reproduced exactly", () => {
    // Change sets shaped like the audited misclassifications (mixed or diluted
    // numerics); direction comes from the backend contract, provenance
    // riot_patch_highlights — nothing here is hardcoded in Broadcast logic.
    const highlights = (
      name: string,
      direction: "buff" | "nerf" | "adjustment",
      changes: PatchReportChange[],
    ) =>
      card(name, {
        changes,
        editorial_direction: direction,
        editorial_direction_source: "riot_patch_highlights",
      });
    const champions = [
      highlights("Corki", "buff", [NERF, BUFF]),
      highlights("Mordekaiser", "buff", [BUFF, MECHANICAL]),
      highlights("Nami", "buff", [BUFF, NERF]),
      highlights("Yunara", "buff", [BUFF]),
      highlights("Garen", "nerf", [NERF]),
      highlights("Jayce", "nerf", [NERF, BUFF]),
      highlights("Locke", "nerf", [MECHANICAL, NERF]),
      highlights("Senna", "nerf", [NERF]),
      highlights("Seraphine", "nerf", [NERF]),
      highlights("Azir", "adjustment", [BUFF, NERF]),
    ];
    const extras = [
      // Item classified only by backend numeric fallback — never riot provenance.
      item("Trinity Force", {
        changes: [NERF],
        editorial_direction: "nerf",
        editorial_direction_source: "mogzy_inferred",
      }),
      // Fix-only champion: authoritatively unclassified → omitted.
      card("Ziggs", {
        changes: [FIX],
        editorial_direction: null,
        editorial_direction_source: null,
      }),
    ];
    const allChampions = champions.map((c) => c.entity_name);
    const brief = projectPatchBrief(
      detail([...champions, ...extras]),
      manifest(...allChampions, "Ziggs"),
    );
    expect(names(brief, "buff")).toEqual(["Corki", "Mordekaiser", "Nami", "Yunara"]);
    expect(names(brief, "nerf")).toEqual([
      "Garen",
      "Jayce",
      "Locke",
      "Senna",
      "Seraphine",
      "Trinity Force",
    ]);
    expect(names(brief, "adjustment")).toEqual(["Azir"]);
    const shown = brief!.sections.flatMap((s) => s.entries.map((e) => e.accessibleName));
    expect(shown).not.toContain("Ziggs");
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
