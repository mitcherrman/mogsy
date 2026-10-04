/**
 * Patch Hub report structure — grouping, editorial authority, shared-context
 * deduplication and safe degradation, plus characterization of the backend
 * payload semantics PH1 relies on (verified against the backend route
 * `routes/patch_reports.py` and `patch_report/builder.py`, and against the
 * production 26.10–26.19 payloads).
 */
import { describe, expect, it } from "vitest";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type {
  PatchEditorialDirection,
  PatchEditorialSource,
  PatchReportCard,
  PatchReportDetail,
} from "./api";
import { projectPatchBrief } from "./patch-brief";
import {
  buildPatchReportStructure,
  filterReportStructure,
  hasExactValues,
  isDirectionGroupedCard,
  normalizeAbilitySlot,
  parseGroupTitle,
  resolveCardEditorial,
  usableHistoricalContext,
} from "./report-structure";
import { mkCard, mkChange } from "./test-fixtures";

const NERF_CHANGE = mkChange({ before_raw: "61", after_raw: "58" });
const FIX_CHANGE = mkChange({
  group_title: "Bugfixes",
  property_name: "Bugfixes",
  change_kind: "mechanical",
});
const ARENA = { section_id: "patch-arena", section_title: "Arena" } as const;
const ITEMS = { entity_type: "item", section_id: "patch-items", section_title: "Items" } as const;

const claim = (
  direction: PatchEditorialDirection | null,
  source: PatchEditorialSource = "riot_patch_highlights",
): Partial<PatchReportCard> => ({
  editorial_direction: direction,
  editorial_direction_source: direction ? source : null,
});

const detailOf = (cards: PatchReportCard[], section_titles: string[] = []): PatchReportDetail => ({
  patch_version: "26.19",
  source_url: "https://example.test/notes",
  built_at: "2026-10-01T00:00:00Z",
  section_titles,
  skipped_sections: [],
  cards,
});

describe("payload characterization (what the backend really sends)", () => {
  it("one card per (section_id, entity_type, entity_name): the same champion may own several cards across sections", () => {
    const s = buildPatchReportStructure(detailOf([mkCard("Ahri"), mkCard("Ahri", { ...ARENA })]));
    expect(s.sections.map((x) => x.key)).toEqual(["patch-champions", "patch-arena"]);
    expect(s.sections.every((x) => x.entities.length === 1)).toBe(true);
    expect(s.sections[0].entities[0].anchor).not.toBe(s.sections[1].entities[0].anchor);
  });

  it("official card order is preserved: sections by first appearance, entities by card order", () => {
    const s = buildPatchReportStructure(
      detailOf([mkCard("Zed"), mkCard("Ahri", { ...ARENA }), mkCard("Annie"), mkCard("Bard", { ...ARENA })]),
    );
    expect(s.sections.map((x) => x.title)).toEqual(["Champions", "Arena"]);
    expect(s.sections[0].entities.map((e) => e.card.entity_name)).toEqual(["Zed", "Annie"]);
    expect(s.sections[1].entities.map((e) => e.card.entity_name)).toEqual(["Ahri", "Bard"]);
  });

  it("Riot's section_titles order wins over card order; unlisted sections follow", () => {
    const s = buildPatchReportStructure(
      detailOf(
        [
          mkCard("Luden", { ...ITEMS }),
          mkCard("Bard", { ...ARENA }),
          mkCard("Ahri"),
          mkCard("Mayhem", { section_id: "patch-aram:-mayhem", section_title: "ARAM: Mayhem" }),
        ],
        ["Champions", "Items", "ARAM: Mayhem"],
      ),
    );
    expect(s.sections.map((x) => x.title)).toEqual(["Champions", "Items", "ARAM: Mayhem", "Arena"]);
  });

  it("the payload carries NO per-change id and NO stable card id: change identity must be derived", () => {
    // Backend projection (routes/patch_reports.py) emits exactly these change keys.
    const backendChangeKeys = [
      "group_title", "ability_slot", "ability_icon_url", "property_name", "change_kind",
      "is_new", "before_raw", "after_raw", "detail_text", "mogzy_property",
      "mogzy_current_raw", "mogzy_status", "proposal_id", "proposal_status", "historical_context",
    ];
    expect(backendChangeKeys).not.toContain("id");
    expect(backendChangeKeys).not.toContain("change_id");
    // `card.id` is the SQLite row id of a rebuilt table; anchors must not use it.
    const a = buildPatchReportStructure(detailOf([mkCard("Ahri", { id: 1 })]));
    const b = buildPatchReportStructure(detailOf([mkCard("Ahri", { id: 4242 })]));
    expect(a.sections[0].entities[0].anchor).toBe(b.sections[0].entities[0].anchor);
  });

  it("changes group into ability/system groups by Riot group title, first appearance, keeping the icon", () => {
    const card = mkCard("Ahri", {
      changes: [
        mkChange({ group_title: "Base Stats", property_name: "Base health" }),
        mkChange({ group_title: "Q", ability_slot: "Q", property_name: "Damage" }),
        mkChange({ group_title: "Q", ability_slot: "Q", ability_icon_url: "https://i/q.png", property_name: "Cooldown" }),
        mkChange({ group_title: "Base Stats", property_name: "Base mana" }),
      ],
    });
    const [e] = buildPatchReportStructure(detailOf([card])).sections[0].entities;
    expect(e.groups.map((g) => [g.title, g.changes.length])).toEqual([["Base Stats", 2], ["Q", 2]]);
    expect(e.groups[1].iconUrl).toBe("https://i/q.png");
    expect(e.groups[0].changes.map((c) => c.index)).toEqual([0, 3]);
    const anchors = e.groups.flatMap((g) => g.changes.map((c) => c.anchor));
    expect(new Set(anchors).size).toBe(4);
  });

  it("keeps two Riot groups that share a slot apart (26.15 Riven R - Blade of the Exile / R - Wind Slash)", () => {
    const card = mkCard("Riven", {
      changes: [
        mkChange({ group_title: "R - Blade of the Exile", ability_slot: "R", property_name: "Bonus AD" }),
        mkChange({ group_title: "R - Wind Slash", ability_slot: "R", property_name: "Damage" }),
      ],
    });
    const [e] = buildPatchReportStructure(detailOf([card])).sections[0].entities;
    expect(e.groups.map((g) => [g.name, g.slot, g.anchor])).toEqual([
      ["Blade of the Exile", "R", "s-patch-champions__e-champion-riven__g-r"],
      ["Wind Slash", "R", "s-patch-champions__e-champion-riven__g-r-2"],
    ]);
    expect(e.groups[1].changes[0].anchor).toBe("s-patch-champions__e-champion-riven__g-r-2__c-damage");
  });
});

describe("ability group labels and change values", () => {
  it("parses Riot's slot prefix and normalises slot spellings", () => {
    expect(parseGroupTitle("Passive - Unseen Threat")).toEqual({ slot: "P", name: "Unseen Threat" });
    expect(parseGroupTitle("R — Between Worlds")).toEqual({ slot: "R", name: "Between Worlds" });
    expect(parseGroupTitle("Base Stats")).toEqual({ slot: null, name: "Base Stats" });
    expect(normalizeAbilitySlot("passive")).toBe("P");
    expect(normalizeAbilitySlot(" q ")).toBe("Q");
    expect(normalizeAbilitySlot("")).toBeNull();
    expect(normalizeAbilitySlot(null)).toBeNull();
  });

  it("derives a slot from the title when the backend omits it (26.13 Locke), never for Base Stats", () => {
    const card = mkCard("Locke", {
      changes: [
        mkChange({ group_title: "Q - Ritual Nails", ability_slot: null, property_name: "Damage" }),
        mkChange({ group_title: "Base Stats", property_name: "Armor" }),
      ],
    });
    const [e] = buildPatchReportStructure(detailOf([card])).sections[0].entities;
    expect(e.groups.map((g) => [g.slot, g.slotLabel, g.name])).toEqual([
      ["Q", "Q", "Ritual Nails"],
      [null, null, "Base Stats"],
    ]);
  });

  it("labels the passive slot", () => {
    const card = mkCard("Kha'Zix", {
      changes: [mkChange({ group_title: "Passive - Unseen Threat", ability_slot: "P" })],
    });
    const [e] = buildPatchReportStructure(detailOf([card])).sections[0].entities;
    expect(e.groups[0].slotLabel).toBe("Passive");
  });

  it("treats only numeric changes with a published value as exact values", () => {
    expect(hasExactValues(mkChange())).toBe(true);
    expect(hasExactValues(mkChange({ before_raw: null }))).toBe(true); // new value, after only
    expect(hasExactValues(mkChange({ before_raw: null, after_raw: null }))).toBe(false);
    expect(hasExactValues(mkChange({ change_kind: "mechanical", before_raw: "1", after_raw: "2" }))).toBe(false);
  });
});

describe("section grouping by direction", () => {
  it("groups the canonical champion section into Buffs → Nerfs → Adjustments → Other changes from backend claims", () => {
    const cards = [
      mkCard("Adj", claim("adjustment")),
      mkCard("Nerf", { ...claim("nerf"), changes: [mkChange({ before_raw: "58", after_raw: "61" })] }),
      mkCard("Buff", claim("buff")),
      mkCard("Fixed", { ...claim(null), changes: [FIX_CHANGE] }),
    ];
    const [section] = buildPatchReportStructure(detailOf(cards)).sections;
    expect(
      section.directionBuckets!.map((b) => [b.direction, b.label, b.entities.map((e) => e.card.entity_name)]),
    ).toEqual([
      ["buff", "Buffs", ["Buff"]],
      ["nerf", "Nerfs", ["Nerf"]],
      ["adjustment", "Adjustments", ["Adj"]],
      ["ungrouped", "Other changes", ["Fixed"]],
    ]);
    expect(section.directionBuckets!.map((b) => b.anchor)).toEqual([
      "s-patch-champions__d-buff",
      "s-patch-champions__d-nerf",
      "s-patch-champions__d-adjustment",
      "s-patch-champions__d-ungrouped",
    ]);
    // Flat order is still the official order.
    expect(section.entities.map((e) => e.card.entity_name)).toEqual(["Adj", "Nerf", "Buff", "Fixed"]);
  });

  it("omits empty buckets", () => {
    const [section] = buildPatchReportStructure(detailOf([mkCard("Buff", claim("buff"))])).sections;
    expect(section.directionBuckets!.map((b) => b.direction)).toEqual(["buff"]);
  });

  it("renders flat when the payload predates the editorial contract (field absent)", () => {
    const legacy = [mkCard("Ahri"), mkCard("Zed", { changes: [NERF_CHANGE] })];
    expect("editorial_direction" in legacy[0]).toBe(false);
    const [section] = buildPatchReportStructure(detailOf(legacy)).sections;
    expect(section.directionBuckets).toBeNull();
    expect(section.entities.map((e) => e.editorial.direction)).toEqual([null, null]);
  });

  it("stays flat when every backend claim in the section is null (26.10-26.13)", () => {
    const [section] = buildPatchReportStructure(
      detailOf([mkCard("Ahri", claim(null)), mkCard("Zed", claim(null))]),
    ).sections;
    expect(section.directionBuckets).toBeNull();
  });

  it("puts a null backend claim under Other changes once the contract is present", () => {
    const [section] = buildPatchReportStructure(
      detailOf([mkCard("Ahri", claim(null)), mkCard("Zed", claim("nerf"))]),
    ).sections;
    expect(
      section.directionBuckets!.map((b) => [b.direction, b.entities.map((e) => e.card.entity_name)]),
    ).toEqual([
      ["nerf", ["Zed"]],
      ["ungrouped", ["Ahri"]],
    ]);
  });

  it("does not regroup mode, rune or system sections, even when they carry claims", () => {
    const s = buildPatchReportStructure(
      detailOf([
        mkCard("Ahri", { ...ARENA, ...claim("buff", "mogzy_inferred") }),
        mkCard("Fleet Footwork", {
          entity_type: "rune",
          section_id: "patch-runes",
          section_title: "Runes",
          ...claim("adjustment", "mogzy_inferred"),
        }),
        mkCard("Systems", { entity_type: "system", section_id: "patch-systems", section_title: "Systems" }),
      ]),
    );
    expect(s.sections.every((x) => x.directionBuckets === null)).toBe(true);
    expect(isDirectionGroupedCard(mkCard("Ahri", { ...ARENA }))).toBe(false);
    expect(isDirectionGroupedCard(mkCard("Ahri"))).toBe(true);
    expect(isDirectionGroupedCard(mkCard("Luden", { ...ITEMS }))).toBe(true);
  });
});

describe("backend editorial authority", () => {
  it("a backend claim overrides the contrary local numeric reading", () => {
    // Numerically a buff (58 → 61) but Riot's own section says nerf.
    const card = mkCard("Ahri", claim("nerf", "riot_section"));
    expect(resolveCardEditorial(card)).toEqual({ direction: "nerf", source: "riot_section", inferred: false });
    const [section] = buildPatchReportStructure(detailOf([card])).sections;
    expect(section.directionBuckets!.map((b) => b.direction)).toEqual(["nerf"]);
  });

  it("a backend adjustment is not upgraded to buff by local inference", () => {
    expect(resolveCardEditorial(mkCard("Ahri", claim("adjustment"))).direction).toBe("adjustment");
  });

  it("never manufactures a direction from the numbers: null, absent or unknown claims stay unclassified", () => {
    const variants: Partial<PatchReportCard>[] = [
      {},
      { editorial_direction: null, editorial_direction_source: null },
      { editorial_direction: undefined },
      { editorial_direction: "banana" as never, editorial_direction_source: "riot_section" },
    ];
    for (const fields of variants) {
      expect(resolveCardEditorial(mkCard("Ahri", fields))).toEqual({
        direction: null,
        source: null,
        inferred: false,
      });
    }
  });

  it("flags a mogzy_inferred claim as inferred so the UI can label it", () => {
    expect(resolveCardEditorial(mkCard("Ahri", claim("buff", "mogzy_inferred")))).toEqual({
      direction: "buff",
      source: "mogzy_inferred",
      inferred: true,
    });
  });

  it("diverges from the Patch Brief on purpose: the brief may classify locally, the report does not", () => {
    const manifest = { champions: {} } as unknown as ChampionManifest;
    const item = (name: string, o: Partial<PatchReportCard> = {}): PatchReportCard =>
      mkCard(name, { ...ITEMS, official_image_url: "https://cdn.example/i.png", ...o });
    const cases = [
      item("Claimed", claim("nerf", "riot_section")),
      item("Null", { ...claim(null), changes: [NERF_CHANGE] }),
    ];
    const brief = projectPatchBrief(detailOf(cases), manifest)!;
    const briefDirection = new Map<string, string>();
    brief.sections.forEach((s) => s.entries.forEach((e) => briefDirection.set(e.entityId, s.direction)));
    expect(briefDirection.get("Claimed")).toBe("nerf");
    expect(briefDirection.get("Null")).toBe("nerf"); // the brief's local numeric fallback
    const [hub] = buildPatchReportStructure(detailOf(cases)).sections;
    expect(hub.entities.map((e) => e.editorial.direction)).toEqual(["nerf", null]);
    expect(hub.directionBuckets!.map((b) => b.direction)).toEqual(["nerf", "ungrouped"]);
  });
});

describe("shared section-context deduplication", () => {
  const INTRO = "Arena is a 2v2v2v2 mode where teams fight in rounds.";
  const arena = (name: string, o: Partial<PatchReportCard> = {}) =>
    mkCard(name, {
      ...ARENA,
      context_text: INTRO,
      changes: [mkChange({ property_name: `${name} stat` })],
      ...o,
    });

  it("hoists copy repeated across a section's entities to the section, once", () => {
    const [section] = buildPatchReportStructure(detailOf([arena("Ahri"), arena("Zed"), arena("Annie")])).sections;
    expect(section.sharedContext).toBe(INTRO);
    expect(section.entities.map((e) => e.context)).toEqual([null, null, null]);
    const rendered = [section.sharedContext, ...section.entities.map((e) => e.context)].filter(Boolean);
    expect(rendered).toEqual([INTRO]);
  });

  it("keeps an entity's own rationale on the entity (once per champion)", () => {
    const own = "Ahri's Q now reaches further.";
    const [section] = buildPatchReportStructure(
      detailOf([arena("Ahri", { context_text: own }), arena("Zed"), arena("Annie")]),
    ).sections;
    expect(section.sharedContext).toBe(INTRO);
    expect(section.entities.map((e) => e.context)).toEqual([own, null, null]);
  });

  it("matches repeated copy regardless of whitespace and case", () => {
    const [section] = buildPatchReportStructure(
      detailOf([
        arena("Ahri", { context_text: `  ${INTRO}\n` }),
        arena("Zed", { context_text: INTRO.toUpperCase().replace(/ /g, "  ") }),
      ]),
    ).sections;
    expect(section.sharedContext).toBe(INTRO);
    expect(section.entities.every((e) => e.context === null)).toBe(true);
  });

  it("never hoists a single card's context", () => {
    const [section] = buildPatchReportStructure(detailOf([arena("Ahri")])).sections;
    expect(section.sharedContext).toBeNull();
    expect(section.entities[0].context).toBe(INTRO);
  });

  it("never hoists distinct per-champion rationale", () => {
    const [section] = buildPatchReportStructure(
      detailOf([mkCard("A", { context_text: "Rationale A" }), mkCard("B", { context_text: "Rationale B" })]),
    ).sections;
    expect(section.sharedContext).toBeNull();
    expect(section.entities.map((e) => e.context)).toEqual(["Rationale A", "Rationale B"]);
  });

  it("does not hoist across different official sections", () => {
    const s = buildPatchReportStructure(
      detailOf([arena("Ahri"), arena("Zed", { section_id: "patch-classic", section_title: "Classic" })]),
    );
    expect(s.sections.map((x) => x.sharedContext)).toEqual([null, null]);
    expect(s.sections.map((x) => x.entities[0].context)).toEqual([INTRO, INTRO]);
  });

  it("keeps twin cards of one A / B block as entity rationale, flagged as paired (26.10 Items)", () => {
    const twinChanges = [mkChange({ group_title: "Stats", property_name: "Armor" })];
    const text = "The new omnivamp boots line is successfully filling a niche.";
    const [section] = buildPatchReportStructure(
      detailOf([
        mkCard("Gluttonous Greaves", { ...ITEMS, context_text: text, changes: twinChanges }),
        mkCard("Immortal Path", { ...ITEMS, context_text: text, changes: twinChanges }),
      ]),
    ).sections;
    expect(section.sharedContext).toBeNull();
    expect(section.entities.map((e) => e.context)).toEqual([text, text]);
    expect(section.entities[0].pairedWith).toEqual(["Immortal Path"]);
    expect(section.entities[1].pairedWith).toEqual(["Gluttonous Greaves"]);
  });

  it("hoists the intro and keeps a pair rationale in the same section", () => {
    const pairText = "Both get the same fix.";
    const twin = [mkChange({ group_title: "W", property_name: "Damage" })];
    const [section] = buildPatchReportStructure(
      detailOf([
        arena("Ahri"),
        arena("Zed"),
        arena("Xayah", { context_text: pairText, changes: twin }),
        arena("Rakan", { context_text: pairText, changes: twin }),
      ]),
    ).sections;
    expect(section.sharedContext).toBe(INTRO);
    expect(section.entities.map((e) => e.context)).toEqual([null, null, pairText, pairText]);
    expect(section.entities[2].pairedWith).toEqual(["Rakan"]);
  });

  it("treats empty/whitespace context as absent", () => {
    const [section] = buildPatchReportStructure(
      detailOf([arena("Ahri", { context_text: "   " }), arena("Zed", { context_text: null })]),
    ).sections;
    expect(section.sharedContext).toBeNull();
    expect(section.entities.map((e) => e.context)).toEqual([null, null]);
  });
});

describe("filtering a built structure", () => {
  it("keeps anchors, section intro and buckets of the whole report", () => {
    const INTRO = "Shared Arena intro.";
    const cards = [
      mkCard("Ahri", claim("buff")),
      mkCard("Zed", claim("nerf")),
      mkCard("Bard", { ...ARENA, context_text: INTRO }),
      mkCard("Elise", { ...ARENA, context_text: INTRO, changes: [mkChange({ property_name: "Other" })] }),
    ];
    const full = buildPatchReportStructure(detailOf(cards));
    const narrowed = filterReportStructure(full, new Set([cards[1], cards[3]]));
    expect(narrowed.sections.map((s) => s.title)).toEqual(["Champions", "Arena"]);
    expect(narrowed.sections[0].directionBuckets!.map((b) => b.direction)).toEqual(["nerf"]);
    // The one Arena entry left does not get the section intro back as its own rationale.
    expect(narrowed.sections[1].sharedContext).toBe(INTRO);
    expect(narrowed.sections[1].entities[0].context).toBeNull();
    expect(narrowed.sections[1].entities[0].anchor).toBe(full.sections[1].entities[1].anchor);
  });

  it("drops sections with nothing left", () => {
    const cards = [mkCard("Ahri"), mkCard("Bard", { ...ARENA })];
    const narrowed = filterReportStructure(buildPatchReportStructure(detailOf(cards)), new Set([cards[0]]));
    expect(narrowed.sections.map((s) => s.title)).toEqual(["Champions"]);
  });
});

describe("safe degradation on older payloads", () => {
  it("builds a flat structure when editorial, history and reconciliation fields are all absent", () => {
    const legacy = mkCard("Ahri");
    expect("editorial_direction" in legacy).toBe(false);
    const [section] = buildPatchReportStructure(detailOf([legacy])).sections;
    expect(section.directionBuckets).toBeNull();
    expect(section.entities[0].editorial.direction).toBeNull();
    expect(section.entities[0].groups[0].changes[0].change.historical_context).toBeUndefined();
  });

  it("tolerates missing section_id and a card with no changes", () => {
    const odd = { ...mkCard("Ahri", { section_id: "" }), changes: undefined as never };
    const s = buildPatchReportStructure(detailOf([odd]));
    expect(s.sections[0].key).toBe("champions");
    expect(s.sections[0].entities[0].groups).toEqual([]);
  });

  it("handles an empty report", () => {
    expect(buildPatchReportStructure(detailOf([])).sections).toEqual([]);
    expect(buildPatchReportStructure({ patch_version: "x", cards: undefined as never }).sections).toEqual([]);
  });

  it("only exposes analyzed historical context", () => {
    expect(usableHistoricalContext(mkChange())).toBeNull();
    expect(usableHistoricalContext(mkChange({ historical_context: null }))).toBeNull();
    for (const status of ["unavailable", "unresolved", "ineligible", "mismatch"]) {
      expect(usableHistoricalContext(mkChange({ historical_context: { status } }))).toBeNull();
    }
    const analyzed = { status: "analyzed", classification: "exact_revert" } as const;
    expect(usableHistoricalContext(mkChange({ historical_context: analyzed }))).toBe(analyzed);
  });
});

describe("purity", () => {
  it("never mutates the input payload and is deterministic", () => {
    const cards = [
      mkCard("Zed", { context_text: " x ", ...claim("nerf", "riot_section") }),
      mkCard("Ahri", { ...ARENA, context_text: "intro" }),
      mkCard("Annie", { ...ARENA, context_text: "intro", changes: [mkChange({ property_name: "Other" })] }),
    ];
    const detail = detailOf(cards);
    const snapshot = JSON.stringify(detail);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === "object") {
        Object.freeze(o);
        Object.values(o).forEach(deepFreeze);
      }
    };
    deepFreeze(detail);
    const first = buildPatchReportStructure(detail);
    expect(JSON.stringify(detail)).toBe(snapshot);
    expect(first).toEqual(buildPatchReportStructure(JSON.parse(snapshot)));
  });
});
