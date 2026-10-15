import { describe, expect, it } from "vitest";
import capture from "./__fixtures__/rangeAuthorityCapture.json";
import {
  buildRangeAuthorityCapture, judgeRangeRecord, RANGEFINDER_MAX_UNITS, RANGEFINDER_MIN_UNITS, RANGEFINDER_STEP_UNITS,
  type RangeAuthorityCapture, type RangeAuthorityRecord,
} from "./eligibility";

const base: RangeAuthorityRecord = {
  champion: "Janna", slot: "W", ability: "Zephyr", targeting: "Unit", rank_count: 5,
  cast_range_by_rank: [550, 550, 550, 550, 550], cast_range_global: false,
  cast_range_note: "single value, all ranks",
  components: [{ type: "CAST_RANGE", value: "550" }],
  authority_source_url: "https://wiki.leagueoflegends.com/en-us/Template:Data_Janna/Zephyr",
  authority_revision_id: 3977082,
};

describe("judgeRangeRecord — the honest pool", () => {
  it("accepts a plain single-value cast range with clean targeting", () => {
    const v = judgeRangeRecord(base);
    expect(v).toEqual({ eligible: true, record: {
      champion: "Janna", slot: "W", ability: "Zephyr", targeting: "Unit", castRangeUnits: 550,
      sourceUrl: base.authority_source_url, revisionId: 3977082,
    } });
  });
  it("refuses a self-cast (no ladder)", () => {
    expect(judgeRangeRecord({ ...base, cast_range_by_rank: null, components: [] }))
      .toMatchObject({ eligible: false, reason: "no cast range ladder published" });
  });
  it("refuses a global cast range", () => {
    expect(judgeRangeRecord({ ...base, cast_range_by_rank: null, cast_range_global: true, components: [{ type: "CAST_RANGE", value: "Global", is_global: true }] }))
      .toMatchObject({ eligible: false, reason: "no cast range ladder published" });
    expect(judgeRangeRecord({ ...base, cast_range_global: true }))
      .toMatchObject({ eligible: false, reason: "cast range is global" });
  });
  it("refuses a per-rank ladder", () => {
    expect(judgeRangeRecord({ ...base, cast_range_by_rank: [700, 750, 800], components: [{ type: "CAST_RANGE", value: "700 / 750 / 800" }] }))
      .toMatchObject({ eligible: false, reason: "cast range varies by rank" });
  });
  it("refuses mixed-mode and non-spatial targeting", () => {
    for (const t of ["Location / Auto", "Unit / Direction", "Vector", "Proximity", "Auto", "", null]) {
      expect(judgeRangeRecord({ ...base, targeting: t })).toMatchObject({ eligible: false, reason: "mixed or non-spatial targeting" });
    }
    expect(judgeRangeRecord({ ...base, targeting: "unit" }).eligible).toBe(true);
    expect(judgeRangeRecord({ ...base, targeting: "Direction" }).eligible).toBe(true);
  });
  it("refuses a value off the 25-unit lattice rather than rounding it", () => {
    expect(judgeRangeRecord({ ...base, cast_range_by_rank: [740], components: [{ type: "CAST_RANGE", value: "740" }] }))
      .toMatchObject({ eligible: false, reason: "not on the 25-unit lattice" });
  });
  it("refuses a value the instrument cannot show", () => {
    expect(judgeRangeRecord({ ...base, cast_range_by_rank: [RANGEFINDER_MAX_UNITS + 25], components: [{ type: "CAST_RANGE", value: String(RANGEFINDER_MAX_UNITS + 25) }] }))
      .toMatchObject({ eligible: false, reason: "outside the instrument's reach" });
    expect(judgeRangeRecord({ ...base, cast_range_by_rank: [RANGEFINDER_MIN_UNITS - 25], components: [{ type: "CAST_RANGE", value: String(RANGEFINDER_MIN_UNITS - 25) }] }))
      .toMatchObject({ eligible: false, reason: "outside the instrument's reach" });
  });
  it("refuses a CAST_RANGE component that disagrees with the ladder, or is absent, or is doubled", () => {
    expect(judgeRangeRecord({ ...base, components: [{ type: "CAST_RANGE", value: "600" }] }))
      .toMatchObject({ eligible: false, reason: "cast range component is not a single plain number" });
    expect(judgeRangeRecord({ ...base, components: [] }))
      .toMatchObject({ eligible: false, reason: "cast range component is not a single plain number" });
    expect(judgeRangeRecord({ ...base, components: [{ type: "CAST_RANGE", value: "550" }, { type: "CAST_RANGE", value: "550" }] }))
      .toMatchObject({ eligible: false, reason: "cast range component is not a single plain number" });
  });
  it("refuses a number the authority itself qualifies", () => {
    for (const note of ["BUG: Displayed range, 765, is slightly larger than the real range", "See notes", "Total range is 1350, starting from 200 units behind Heimerdinger", "Maximum blink range (estimated), has no minimum blink range", "Shuriken range, based off of Akali's original location"]) {
      expect(judgeRangeRecord({ ...base, components: [{ type: "CAST_RANGE", value: "550", note }] }))
        .toMatchObject({ eligible: false, reason: "authority note qualifies the number" });
    }
    expect(judgeRangeRecord({ ...base, components: [{ type: "CAST_RANGE", value: "550", note: "Maximum dash distance" }] }).eligible).toBe(true);
  });
});

describe("the frozen capture", () => {
  const c = capture as unknown as RangeAuthorityCapture;
  it("covers the whole authority population and partitions it", () => {
    expect(c.population).toBe(692);
    expect(c.eligible.length + c.excluded.length).toBe(692);
    expect(c.source.authorityHost).toBe("wiki.leagueoflegends.com");
    expect(c.source.repoCommit).toMatch(/^[0-9a-f]{40}$/);
  });
  it("holds the R1 pool: 227 abilities across 132 champions, every one on the lattice with a revision", () => {
    expect(c.eligible).toHaveLength(227);
    expect(new Set(c.eligible.map((e) => e.champion)).size).toBe(132);
    for (const e of c.eligible) {
      expect(e.castRangeUnits % RANGEFINDER_STEP_UNITS).toBe(0);
      expect(e.castRangeUnits).toBeGreaterThanOrEqual(RANGEFINDER_MIN_UNITS);
      expect(e.castRangeUnits).toBeLessThanOrEqual(RANGEFINDER_MAX_UNITS);
      expect(["Unit", "Location", "Direction"]).toContain(e.targeting);
      expect(e.sourceUrl).toMatch(/^https:\/\/wiki\.leagueoflegends\.com\//);
      expect(Number.isInteger(e.revisionId)).toBe(true);
    }
  });
  it("names the brief's controls: Janna W 550 is in; Ahri E (travel range only) and the nine off-lattice values are out", () => {
    expect(c.eligible.find((e) => e.champion === "Janna" && e.slot === "W")?.castRangeUnits).toBe(550);
    expect(c.eligible.find((e) => e.champion === "Ezreal" && e.slot === "Q")?.castRangeUnits).toBe(1200);
    expect(c.eligible.find((e) => e.champion === "Ahri" && e.slot === "E")).toBeUndefined();
    expect(c.excluded.find((e) => e.champion === "Ahri" && e.slot === "E")?.reason).toBe("no cast range ladder published");
    const offLattice = c.excluded.filter((e) => e.reason === "not on the 25-unit lattice").map((e) => `${e.champion} ${e.slot}`).sort();
    expect(offLattice).toEqual(["Azir Q", "Evelynn E", "Jarvan IV E", "Jayce E", "Orianna E", "Samira Q", "Teemo Q", "Tryndamere E", "Warwick Q"]);
    expect(c.excluded.filter((e) => e.reason === "cast range is global")).toHaveLength(0); // globals have no ladder, so they fall under that reason
  });
  it("reproduces from the rules: re-judging the eligible records changes nothing", () => {
    const again = buildRangeAuthorityCapture(
      c.eligible.map((e) => ({
        champion: e.champion, slot: e.slot, ability: e.ability, targeting: e.targeting, rank_count: 5,
        cast_range_by_rank: [e.castRangeUnits], cast_range_global: false, cast_range_note: "single value, all ranks",
        components: [{ type: "CAST_RANGE", value: String(e.castRangeUnits) }],
        authority_source_url: e.sourceUrl, authority_revision_id: e.revisionId,
      })), c.source, c.capturedAt);
    expect(again.eligible).toEqual(c.eligible);
    expect(again.excluded).toHaveLength(0);
  });
});
