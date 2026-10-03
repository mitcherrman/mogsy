import { describe, expect, it } from "vitest";
import {
  JourneyLibraryParseError,
  journeyRoleLabel,
  journeyRoles,
  matchesJourneyFilter,
  readJourneyLibrary,
} from "./contracts";
import { CAPTURED_JOURNEYS, journeyLibraryList } from "./__fixtures__/journeyLibrary";

describe("readJourneyLibrary — the GET /api/journeys projection", () => {
  it("reads the captured backend list, keyed by (recipe_id, recipe_version)", () => {
    const view = readJourneyLibrary(journeyLibraryList());
    expect(view.journeys).toHaveLength(CAPTURED_JOURNEYS.length);
    const zed = view.journeys.find((j) => j.recipeId === "mid.zed_vs_ahri")!;
    expect(zed).toEqual({
      key: "mid.zed_vs_ahri@1",
      recipeId: "mid.zed_vs_ahri",
      recipeVersion: 1,
      title: "Zed vs Ahri",
      role: "mid",
      champions: [{ id: "zed", label: "Zed" }, { id: "ahri", label: "Ahri" }],
      questions: 5,
      available: true,
      unavailableCode: null,
    });
  });

  it("projects no source, plan, status or superseded history onto a card", () => {
    const view = readJourneyLibrary(journeyLibraryList({
      "mid.zed_vs_ahri": { recipe_version: 2, superseded: [{ source: "daily", recipe_version: 1 }] },
    }));
    const zed = view.journeys.find((j) => j.recipeId === "mid.zed_vs_ahri")!;
    expect(zed.recipeVersion).toBe(2);
    expect(Object.keys(zed).sort()).toEqual([
      "available", "champions", "key", "questions", "recipeId", "recipeVersion",
      "role", "title", "unavailableCode"]);
    // The superseded v1 is history: it is never offered as its own card.
    expect(view.journeys.filter((j) => j.recipeId === "mid.zed_vs_ahri")).toHaveLength(1);
  });

  it("keeps an unavailable active version, marked, and never swaps in another", () => {
    const view = readJourneyLibrary(journeyLibraryList({
      "top.olaf_vs_sett": { available: false, unavailable_code: "JOURNEY_UNAVAILABLE",
        superseded: [{ source: "daily", recipe_version: 0 }] },
    }));
    const olaf = view.journeys.find((j) => j.recipeId === "top.olaf_vs_sett")!;
    expect(olaf.available).toBe(false);
    expect(olaf.unavailableCode).toBe("JOURNEY_UNAVAILABLE");
    expect(olaf.recipeVersion).toBe(1);
  });

  it("drops a non-active entry and a duplicate key rather than showing them", () => {
    const [a, b] = CAPTURED_JOURNEYS;
    const view = readJourneyLibrary(journeyLibraryList({}, [a, { ...a }, { ...b, status: "superseded" }]));
    expect(view.journeys.map((j) => j.key)).toEqual([`${a.recipe_id}@1`]);
  });

  it("refuses an unknown schema or a malformed entry", () => {
    expect(() => readJourneyLibrary({ ...journeyLibraryList(), schema_version: "x" }))
      .toThrow(JourneyLibraryParseError);
    expect(() => readJourneyLibrary(journeyLibraryList({ "mid.zed_vs_ahri": { recipe_version: "2" } })))
      .toThrow(/recipe_version/);
  });
});

describe("roles and filters", () => {
  const { journeys } = readJourneyLibrary(journeyLibraryList());

  it("orders the lanes and labels the recipes' `bot` lane", () => {
    expect(journeyRoles(journeys)).toEqual(["top", "jungle", "mid", "bot", "support"]);
    expect(journeyRoleLabel("bot")).toBe("Bot");
    expect(journeyRoleLabel("mid")).toBe("Mid");
    expect(journeyRoleLabel("arena")).toBe("Arena");
  });

  it("filters by role", () => {
    const mid = journeys.filter((j) => matchesJourneyFilter(j, { role: "mid", champion: "" }));
    expect(mid.map((j) => j.recipeId)).toEqual([
      "mid.ahri_vs_syndra", "mid.akshan_vs_syndra", "mid.pantheon_vs_ahri", "mid.zed_vs_ahri"]);
  });

  it("filters by champion label or id, ignoring case and punctuation", () => {
    const leeSin = journeys.filter((j) => matchesJourneyFilter(j, { role: null, champion: "lee sin" }));
    expect(leeSin.map((j) => j.recipeId)).toEqual(["jungle.volibear_vs_leesin"]);
    const ahri = journeys.filter((j) => matchesJourneyFilter(j, { role: "mid", champion: "AHRI" }));
    expect(ahri).toHaveLength(3);
    expect(journeys.filter((j) => matchesJourneyFilter(j, { role: "top", champion: "ahri" }))).toHaveLength(0);
  });
});
