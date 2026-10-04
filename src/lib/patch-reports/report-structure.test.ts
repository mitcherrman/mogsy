/**
 * Patch Hub report structure — grouping, editorial authority, shared-context
 * deduplication and safe degradation, plus characterization of the backend
 * payload semantics PH1 relies on (verified against the backend route
 * `routes/patch_reports.py` and `patch_report/builder.py`).
 */
import { describe, expect, it } from "vitest";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchEditorialSource, PatchReportCard, PatchReportDetail } from "./api";
import { projectPatchBrief } from "./patch-brief";
import {
  buildPatchReportStructure,
  isDirectionGroupedCard,
  resolveCardEditorial,
  resolveEditorialClaims,
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

const detailOf = (cards: PatchReportCard[]): PatchReportDetail => ({
  patch_version: "26.19",
  source_url: "https://example.test/notes",
  built_at: "2026-10-01T00:00:00Z",
  section_titles: [],
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

  it("changes group into ability/system groups by first appearance, keeping the icon", () => {
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
    expect(e.groups[1].abilityIconUrl).toBe("https://i/q.png");
    const anchors = e.groups.flatMap((g) => g.changes.map((c) => c.anchor));
    expect(new Set(anchors).size).toBe(4);
  });
});

describe("section grouping by direction", () => {
  it("groups the canonical champion section into Buffs → Nerfs → Adjustments → ungrouped, omitting empties", () => {
    const cards = [
      mkCard("Adj", { changes: [mkChange({ change_kind: "mechanical", property_name: "Passive", detail_text: "x" })] }),
      mkCard("Nerf", { changes: [NERF_CHANGE] }),
      mkCard("Buff"),
      mkCard("Fixed", { changes: [FIX_CHANGE] }),
    ];
    const [section] = buildPatchReportStructure(detailOf(cards)).sections;
    expect(
      section.directionBuckets!.map((b) => [b.direction, b.entities.map((e) => e.card.entity_name)]),
    ).toEqual([
      ["buff", ["Buff"]],
      ["nerf", ["Nerf"]],
      ["adjustment", ["Adj"]],
      ["ungrouped", ["Fixed"]],
    ]);
    // Flat order is still the official order.
    expect(section.entities.map((e) => e.card.entity_name)).toEqual(["Adj", "Nerf", "Buff", "Fixed"]);
  });

  it("omits empty buckets", () => {
    const [section] = buildPatchReportStructure(detailOf([mkCard("Buff")])).sections;
    expect(section.directionBuckets!.map((b) => b.direction)).toEqual(["buff"]);
  });

  it("does not regroup mode, rune or system sections", () => {
    const s = buildPatchReportStructure(
      detailOf([
        mkCard("Ahri", { ...ARENA }),
        mkCard("Rune", { entity_type: "rune", section_id: "patch-runes", section_title: "Runes" }),
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
    const card = mkCard("Ahri", { editorial_direction: "nerf", editorial_direction_source: "riot_section" });
    expect(resolveCardEditorial(card)).toEqual({ direction: "nerf", authority: "backend", source: "riot_section" });
    const [section] = buildPatchReportStructure(detailOf([card])).sections;
    expect(section.directionBuckets!.map((b) => b.direction)).toEqual(["nerf"]);
  });

  it("a backend 'adjustment' is not upgraded to buff by local inference", () => {
    const card = mkCard("Ahri", {
      editorial_direction: "adjustment",
      editorial_direction_source: "riot_patch_highlights",
    });
    expect(resolveCardEditorial(card).direction).toBe("adjustment");
  });

  it("falls back to local inference only when there is no non-null claim", () => {
    const variants: Partial<PatchReportCard>[] = [
      {},
      { editorial_direction: null, editorial_direction_source: null },
      { editorial_direction: undefined },
    ];
    for (const fields of variants) {
      expect(resolveCardEditorial(mkCard("Ahri", fields))).toEqual({
        direction: "buff",
        authority: "local_fallback",
        source: null,
      });
    }
  });

  it("ignores unknown direction strings rather than trusting them", () => {
    const card = mkCard("Ahri", {
      editorial_direction: "banana" as never,
      editorial_direction_source: "riot_section",
    });
    expect(resolveCardEditorial(card).authority).toBe("local_fallback");
  });

  it("fix-only cards resolve to no direction (kept readable, ungrouped)", () => {
    const card = mkCard("Ahri", { changes: [FIX_CHANGE] });
    expect(resolveCardEditorial(card)).toEqual({ direction: null, authority: "none", source: null });
  });

  it("claims resolve by precedence riot_section > riot_text_semantic > riot_patch_highlights > mogzy_inferred", () => {
    const claim = (direction: "buff" | "nerf", source: PatchEditorialSource) => ({ direction, source });
    expect(
      resolveEditorialClaims([claim("buff", "mogzy_inferred"), claim("nerf", "riot_patch_highlights")]),
    ).toBe("nerf");
    expect(
      resolveEditorialClaims([claim("buff", "riot_patch_highlights"), claim("nerf", "riot_text_semantic")]),
    ).toBe("nerf");
    expect(
      resolveEditorialClaims([claim("buff", "riot_section"), claim("nerf", "riot_text_semantic")]),
    ).toBe("buff");
    expect(resolveEditorialClaims([])).toBeNull();
  });

  it("same-level conflicts resolve to adjustment", () => {
    expect(
      resolveEditorialClaims([
        { direction: "buff", source: "riot_section" },
        { direction: "nerf", source: "riot_section" },
      ]),
    ).toBe("adjustment");
  });

  it("an unknown future source ranks below every known one", () => {
    expect(
      resolveEditorialClaims([
        { direction: "buff", source: "future_source" as never },
        { direction: "nerf", source: "mogzy_inferred" },
      ]),
    ).toBe("nerf");
  });
});

describe("parity with the Patch Brief resolver", () => {
  const manifest = { champions: {} } as unknown as ChampionManifest;
  // Items resolve their icon from the payload, so no champion manifest is needed.
  const item = (name: string, o: Partial<PatchReportCard> = {}): PatchReportCard =>
    mkCard(name, { ...ITEMS, official_image_url: "https://cdn.example/i.png", ...o });

  it("groups every single-card case exactly as the brief does", () => {
    const cases: PatchReportCard[] = [
      item("A"),
      item("B", { changes: [NERF_CHANGE] }),
      item("C", { editorial_direction: "nerf", editorial_direction_source: "riot_section" }),
      item("D", { editorial_direction: "adjustment", editorial_direction_source: "mogzy_inferred" }),
      item("E", { editorial_direction: null, editorial_direction_source: null }),
      item("F", { changes: [mkChange(), NERF_CHANGE] }),
    ];
    const brief = projectPatchBrief(detailOf(cases), manifest)!;
    const briefDirection = new Map<string, string>();
    brief.sections.forEach((s) => s.entries.forEach((e) => briefDirection.set(e.entityId, s.direction)));
    const hub = buildPatchReportStructure(detailOf(cases)).sections[0].entities;
    expect(hub).toHaveLength(cases.length);
    for (const e of hub) expect(e.editorial.direction).toBe(briefDirection.get(e.card.entity_name));
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

  it("does not hoist across different official sections", () => {
    const s = buildPatchReportStructure(
      detailOf([arena("Ahri"), arena("Zed", { section_id: "patch-classic", section_title: "Classic" })]),
    );
    expect(s.sections.map((x) => x.sharedContext)).toEqual([null, null]);
    expect(s.sections.map((x) => x.entities[0].context)).toEqual([INTRO, INTRO]);
  });

  it("keeps twin cards of one 'A / B' block as entity rationale, flagged as paired", () => {
    const twinChanges = [mkChange({ group_title: "Stats", property_name: "Armor" })];
    const text = "Both items gain armor.";
    const [section] = buildPatchReportStructure(
      detailOf([
        mkCard("Ludens Echo", { ...ITEMS, context_text: text, changes: twinChanges }),
        mkCard("Void Staff", { ...ITEMS, context_text: text, changes: twinChanges }),
      ]),
    ).sections;
    expect(section.sharedContext).toBeNull();
    expect(section.entities.map((e) => e.context)).toEqual([text, text]);
    expect(section.entities[0].pairedWith).toEqual(["Void Staff"]);
    expect(section.entities[1].pairedWith).toEqual(["Ludens Echo"]);
  });

  it("treats empty/whitespace context as absent", () => {
    const [section] = buildPatchReportStructure(
      detailOf([arena("Ahri", { context_text: "   " }), arena("Zed", { context_text: null })]),
    ).sections;
    expect(section.sharedContext).toBeNull();
    expect(section.entities.map((e) => e.context)).toEqual([null, null]);
  });
});

describe("safe degradation on older payloads", () => {
  it("builds a structure when editorial, history and reconciliation fields are all absent", () => {
    const legacy = mkCard("Ahri");
    expect("editorial_direction" in legacy).toBe(false);
    const [e] = buildPatchReportStructure(detailOf([legacy])).sections[0].entities;
    expect(e.editorial.authority).toBe("local_fallback");
    expect(e.groups[0].changes[0].change.historical_context).toBeUndefined();
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
      mkCard("Zed", { context_text: " x ", editorial_direction: "nerf", editorial_direction_source: "riot_section" }),
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
