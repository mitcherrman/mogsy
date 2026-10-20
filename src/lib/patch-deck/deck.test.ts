import { describe, expect, it } from "vitest";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import report2620 from "./fixtures/report-26.20.json";
import {
  buildDeckModel,
  bucketOf,
  chapterOf,
  chapterSummary,
  changeCount,
  headlineChanges,
  impactLines,
  indexOfCard,
  isEntityCard,
  relatedCards,
  touchedGroups,
} from "./deck";

const detail = report2620 as unknown as PatchReportDetail;
const model = buildDeckModel(detail);
const entityCards = model.cards.filter(isEntityCard);

describe("buildDeckModel on the real 26.20 report", () => {
  it("opens on the cover and keeps every report card exactly once", () => {
    expect(model.cards[0]).toEqual({ kind: "cover", id: "cover", chapterId: "cover" });
    expect(entityCards).toHaveLength(detail.cards.length);
    expect(new Set(entityCards.map((c) => c.entity.card.id)).size).toBe(detail.cards.length);
    expect(new Set(model.cards.map((c) => c.id)).size).toBe(model.cards.length);
  });

  it("leads with Summoner's Rift chapters even though Riot listed Private Replays first", () => {
    const titles = model.chapters.map((c) => c.title);
    expect(detail.section_titles[0]).toBe("Private Replays");
    expect(titles.slice(0, 3)).toEqual(["Patch 26.20", "Champions", "Items"]);
    expect(titles.slice(3)).toEqual(["Private Replays", "Classic", "ARAM: Mayhem", "ARAM", "Ranked 5s"]);
    expect(model.chapters.find((c) => c.title === "Champions")?.kind).toBe("main");
    expect(model.chapters.find((c) => c.title === "ARAM: Mayhem")?.kind).toBe("mode");
  });

  it("orders champions by Riot's editorial buckets (buffs first) without dropping any", () => {
    const champions = model.chapters.find((c) => c.title === "Champions")!;
    expect(champions.to - champions.from).toBe(16);
    expect(champions.buckets.map((b) => [b.label, b.to - b.from])).toEqual([
      ["Buffs", 3],
      ["Nerfs", 13],
    ]);
    const first = model.cards[champions.from];
    expect(isEntityCard(first) && first.entity.editorial.direction).toBe("buff");
    // K'Sante's published classification is kept as the backend states it (buff,
    // riot_text_semantic), even though it is known to await re-promotion.
    const ksante = entityCards.find((c) => c.entity.card.entity_name === "K'Sante" && c.kind === "champion")!;
    expect(ksante.entity.editorial).toEqual({ direction: "buff", source: "riot_text_semantic", inferred: false });
    expect(ksante.bucket).toBe("buff");
  });

  it("marks mode entities as mode cards and main-game entities as not", () => {
    const bard = entityCards.find((c) => c.entity.card.entity_name === "Bard")!;
    expect(bard.mode).toBe(true);
    expect(bard.kind).toBe("system");
    const diana = entityCards.find((c) => c.entity.card.entity_name === "Diana")!;
    expect(diana.mode).toBe(false);
    expect(diana.kind).toBe("champion");
  });

  it("resolves chapter, bucket and index lookups", () => {
    const swain = entityCards.find((c) => c.entity.card.entity_name === "Swain" && c.kind === "champion")!;
    const i = indexOfCard(model, swain.id);
    expect(model.cards[i]).toBe(swain);
    expect(chapterOf(model, i).title).toBe("Champions");
    expect(bucketOf(model, i)?.label).toBe("Nerfs");
    expect(indexOfCard(model, "nope")).toBe(0);
    expect(indexOfCard(model, null)).toBe(0);
  });

  it("summarises chapters for the cover", () => {
    const summary = chapterSummary(model);
    expect(summary[0].chapter.title).toBe("Champions");
    expect(summary[0].count).toBe(16);
    expect(summary[0].buckets).toEqual([
      { direction: "buff", label: "Buffs", count: 3 },
      { direction: "nerf", label: "Nerfs", count: 13 },
    ]);
  });
});

describe("entity reading helpers", () => {
  const swain = entityCards.find((c) => c.entity.card.entity_name === "Swain" && c.kind === "champion")!;

  it("lists touched groups in Riot's order with slot badges", () => {
    expect(touchedGroups(swain.entity).map((t) => [t.badge, t.group.name, t.count])).toEqual([
      ["Stats", "Base Stats", 2],
      ["W", "Vision of Empire", 2],
    ]);
    expect(changeCount(swain.entity)).toBe(4);
  });

  it("headlines exact values first and never beyond the limit", () => {
    const heads = headlineChanges(swain.entity, 3);
    expect(heads).toHaveLength(3);
    expect(heads.map((h) => h.change.property_name)).toEqual(["Base Magic Resistance", "Base Armor", "Damage"]);
    const hurricane = entityCards.find((c) => c.entity.card.entity_name === "Runaan's Hurricane")!;
    const hh = headlineChanges(hurricane.entity, 3);
    expect(hh[0].change.change_kind).toBe("numeric");
    expect(hh.slice(1).every((h) => h.change.change_kind === "mechanical")).toBe(true);
  });

  it("scopes Impact lines to Champions › Base Stats only", () => {
    expect(impactLines(swain.entity).map((l) => l.change.property_name)).toEqual(["Base Magic Resistance", "Base Armor"]);
    const lucian = entityCards.find((c) => c.entity.card.entity_name === "Lucian")!;
    expect(impactLines(lucian.entity)).toHaveLength(1);
    const diana = entityCards.find((c) => c.entity.card.entity_name === "Diana")!;
    expect(impactLines(diana.entity)).toEqual([]);
    const classic = entityCards.find((c) => c.entity.card.entity_name === "Classic — General")!;
    expect(impactLines(classic.entity)).toEqual([]);
  });

  it("finds the same entity's other cards in the deck", () => {
    const ksante = entityCards.find((c) => c.entity.card.entity_name === "K'Sante" && c.kind === "champion")!;
    const related = relatedCards(model, ksante);
    expect(related.map((c) => c.section.title)).toEqual(["ARAM: Mayhem"]);
    const diana = entityCards.find((c) => c.entity.card.entity_name === "Diana")!;
    expect(relatedCards(model, diana)).toEqual([]);
  });
});

describe("degraded payloads", () => {
  it("builds a flat deck from a report with no editorial contract", () => {
    const stripped: PatchReportDetail = {
      ...detail,
      cards: detail.cards.map((c) => {
        const { editorial_direction: _d, editorial_direction_source: _s, ...rest } = c;
        return rest as typeof c;
      }),
    };
    const flat = buildDeckModel(stripped);
    const champions = flat.chapters.find((c) => c.title === "Champions")!;
    expect(champions.buckets).toEqual([]);
    expect(flat.cards.filter(isEntityCard)).toHaveLength(detail.cards.length);
    expect(flat.cards.slice(champions.from, champions.to).map((c) => isEntityCard(c) && c.entity.card.entity_name)).toEqual(
      detail.cards.filter((c) => c.section_title === "Champions").map((c) => c.entity_name),
    );
  });

  it("handles an empty report", () => {
    const empty = buildDeckModel({ patch_version: "0.0", cards: [] });
    expect(empty.cards).toHaveLength(1);
    expect(empty.chapters).toHaveLength(1);
    expect(chapterSummary(empty)).toEqual([]);
  });
});
