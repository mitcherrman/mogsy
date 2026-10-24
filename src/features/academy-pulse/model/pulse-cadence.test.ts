import { describe, expect, it } from "vitest";

import { fixturePulseCatalogue } from "../content/pulse-provider";
import { PULSE_FIXTURE_ITEMS } from "../content/pulse-fixtures";
import { DEFAULT_PULSE_CADENCE, buildPulseCycle, isRenderable, promotionPositions } from "./pulse-cadence";
import type { PulseCadence, PulseCatalogue, PulseItem, SponsorItem } from "./pulse-types";

const catalogue = fixturePulseCatalogue();
const ids = (items: PulseItem[]) => items.map((i) => i.id);
const sponsor = (id: string): SponsorItem => ({
  id, kind: "sponsor", category: "sponsor", provenance: "fixture", title: id,
  sponsorName: "S", campaignTitle: "C", tagline: "", artUrl: null, ctaLabel: "Go", href: null,
});

describe("the default cadence over the development fixtures", () => {
  it("plays the owner's twelve-step order, one scene per slot", () => {
    const cycle = buildPulseCycle(catalogue, DEFAULT_PULSE_CADENCE, 0);
    expect(cycle.map((i) => i.category)).toEqual([
      "player-activity", "mini-game", "sponsor", "leaderboard", "news", "premium",
      "player-activity", "personal-insight", "educational", "creator-spotlight", "community-challenge", "event",
    ]);
  });

  it("never shows the same item twice in a cycle (the two activity slots take different items)", () => {
    const cycle = buildPulseCycle(catalogue, DEFAULT_PULSE_CADENCE, 0);
    expect(new Set(ids(cycle)).size).toBe(cycle.length);
    const activities = cycle.filter((i) => i.category === "player-activity");
    expect(activities).toHaveLength(2);
    expect(activities[0].id).not.toBe(activities[1].id);
  });

  it("rotates the items inside a category from one cycle to the next", () => {
    const first = buildPulseCycle(catalogue, DEFAULT_PULSE_CADENCE, 0);
    const second = buildPulseCycle(catalogue, DEFAULT_PULSE_CADENCE, 1);
    const pick = (c: PulseItem[], cat: string) => c.filter((i) => i.category === cat).map((i) => i.id);
    expect(pick(first, "creator-spotlight")).not.toEqual(pick(second, "creator-spotlight"));
    expect(pick(first, "news")).not.toEqual(pick(second, "news"));
    expect(pick(first, "player-activity")).not.toEqual(pick(second, "player-activity"));
  });

  it("keeps promotions apart, inside the cycle and across its wrap", () => {
    for (let c = 0; c < 6; c++) {
      const cycle = buildPulseCycle(catalogue, DEFAULT_PULSE_CADENCE, c);
      const promos = promotionPositions(cycle);
      expect(promos.length).toBeLessThanOrEqual(DEFAULT_PULSE_CADENCE.maxPromotionsPerCycle);
      for (let i = 1; i < promos.length; i++) expect(promos[i] - promos[i - 1]).toBeGreaterThanOrEqual(DEFAULT_PULSE_CADENCE.minPromotionGap);
      if (promos.length > 1) expect(promos[0] + cycle.length - promos[promos.length - 1]).toBeGreaterThanOrEqual(DEFAULT_PULSE_CADENCE.minPromotionGap);
    }
  });

  it("never runs two scenes of the same kind back to back (also across the wrap)", () => {
    for (let c = 0; c < 6; c++) {
      const cycle = buildPulseCycle(catalogue, DEFAULT_PULSE_CADENCE, c);
      cycle.forEach((item, i) => expect(item.kind).not.toBe(cycle[(i + 1) % cycle.length].kind));
    }
  });
});

describe("guard rails", () => {
  it("skips a category with nothing to show instead of drawing an empty scene", () => {
    const { sponsor: _drop, ...noSponsor } = catalogue;
    const cycle = buildPulseCycle(noSponsor, DEFAULT_PULSE_CADENCE, 0);
    expect(cycle.some((i) => i.category === "sponsor")).toBe(false);
    expect(cycle.length).toBe(11);
  });

  it("skips broken payloads (a leaderboard with two rows, a question without its answer)", () => {
    const board = catalogue.leaderboard![0];
    const question = catalogue.educational![0];
    const broken: PulseCatalogue = {
      ...catalogue,
      leaderboard: [{ ...board, entries: board.kind === "leaderboard" ? board.entries.slice(0, 2) : [] } as PulseItem],
      educational: [{ ...question, correctId: "nobody" } as PulseItem],
    };
    const cycle = buildPulseCycle(broken, DEFAULT_PULSE_CADENCE, 0);
    expect(cycle.some((i) => i.category === "leaderboard" || i.category === "educational")).toBe(false);
  });

  it("drops a second promotion that would sit too close to the first", () => {
    const cadence: PulseCadence = { slots: ["sponsor", "news", "sponsor", "leaderboard", "event"], maxPromotionsPerCycle: 3, minPromotionGap: 3 };
    const cat: PulseCatalogue = { ...catalogue, sponsor: [sponsor("s1"), sponsor("s2")] };
    const cycle = buildPulseCycle(cat, cadence, 0);
    expect(cycle.filter((i) => i.category === "sponsor")).toHaveLength(1);
  });

  it("caps promotions per cycle", () => {
    const cadence: PulseCadence = {
      slots: ["sponsor", "news", "leaderboard", "event", "sponsor", "mini-game", "educational", "sponsor"],
      maxPromotionsPerCycle: 1,
      minPromotionGap: 2,
    };
    const cat: PulseCatalogue = { ...catalogue, sponsor: [sponsor("s1"), sponsor("s2"), sponsor("s3")] };
    expect(buildPulseCycle(cat, cadence, 0).filter((i) => i.category === "sponsor")).toHaveLength(1);
  });

  it("an empty catalogue yields an empty cycle, not an error", () => {
    expect(buildPulseCycle({}, DEFAULT_PULSE_CADENCE, 0)).toEqual([]);
  });
});

describe("the fixtures are honest development samples", () => {
  it("every fixture is renderable and marked as a fixture", () => {
    for (const item of PULSE_FIXTURE_ITEMS) {
      expect(item.provenance).toBe("fixture");
      if (item.kind !== "premium") expect(isRenderable(item)).toBe(true);
    }
  });

  it("no fixture links to a real profile, video, channel or sponsor", () => {
    for (const item of PULSE_FIXTURE_ITEMS) {
      const json = JSON.stringify(item);
      expect(json).not.toMatch(/https?:\/\//);
      if (item.kind === "sponsor") expect(item.href).toBeNull();
      if (item.kind === "creator") {
        expect(item.media.platform === "youtube" ? item.media.videoId : item.media.channel).toBeNull();
      }
      if (item.kind === "activity") expect(item.player.profileHref).toBeNull();
      if (item.kind === "leaderboard") for (const e of item.entries) expect(e.player.profileHref).toBeNull();
    }
  });

  it("links that are present point at real Mogzy routes", () => {
    const hrefs = PULSE_FIXTURE_ITEMS.flatMap((i) => {
      if (i.kind === "minigame") return [i.playHref];
      if (i.kind === "premium") return [i.ctaHref];
      if (i.kind === "question") return [i.practiceHref];
      if (i.kind === "news") return i.href ? [i.href] : [];
      return [];
    });
    expect(hrefs.sort()).toEqual(["/lol/patch-deck", "/lol/premium", "/quiz", "/quiz/more-challenges"]);
  });
});
