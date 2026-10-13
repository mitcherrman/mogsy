/**
 * UX1 — the Worlds experience's URL model: screens and stages in the path,
 * selection in the query, everything else carried; direction of travel.
 */
import { describe, expect, it } from "vitest";

import {
  READY_SCREENS,
  SCREENS,
  adjacentScreen,
  buildHref,
  navDirection,
  parseLocation,
  stageKeyFromSlug,
  stageLabel,
  stageSlug,
} from "./navigation";

const BASE = "/lol/dev/worlds-experience";
const KEYS = ["play_in", "swiss", "knockout"];

describe("screens", () => {
  it("carries five destinations, of which only Overview and Stages are built", () => {
    expect(SCREENS.map((s) => s.label)).toEqual(["Overview", "Stages", "Teams", "Schedule", "Discover"]);
    expect(READY_SCREENS.map((s) => s.key)).toEqual(["overview", "stages"]);
  });

  it("refuses to build a link to a screen that does not exist yet", () => {
    expect(() => buildHref(BASE, { screen: "teams" })).toThrow(/not available/);
  });
});

describe("parseLocation", () => {
  it("reads the landing path as the Overview", () => {
    expect(parseLocation(BASE, BASE, "")).toEqual({ screen: "overview", stageSlug: null, matchId: null, round: null, unresolved: false });
    expect(parseLocation(BASE, `${BASE}/`, "?scenario=snapshot").screen).toBe("overview");
  });

  it("reads a stage, a selected match and a round on the Stages screen", () => {
    const loc = parseLocation(BASE, `${BASE}/stages/swiss`, "?match=123&round=3&scenario=x");
    expect(loc).toEqual({ screen: "stages", stageSlug: "swiss", matchId: "123", round: 3, unresolved: false });
  });

  it("drops a stray selection on the Overview, and a nonsense round", () => {
    expect(parseLocation(BASE, BASE, "?match=123").matchId).toBeNull();
    expect(parseLocation(BASE, `${BASE}/stages`, "?round=zero").round).toBeNull();
  });

  it("marks a future or unknown screen as unresolved (the shell corrects it)", () => {
    expect(parseLocation(BASE, `${BASE}/teams`, "")).toMatchObject({ screen: "overview", unresolved: true });
    expect(parseLocation(BASE, `${BASE}/nope`, "")).toMatchObject({ screen: "overview", unresolved: true });
  });
});

describe("buildHref", () => {
  it("puts screen and stage in the path and keeps every key it does not own", () => {
    expect(buildHref(BASE, { screen: "stages", stageKey: "knockout" }, "?scenario=complete&now=2026-11-20T00:00:00Z&match=1")).toBe(
      `${BASE}/stages/knockouts?scenario=complete&now=2026-11-20T00%3A00%3A00Z`,
    );
    expect(buildHref(BASE, { screen: "stages", stageKey: "play_in", matchId: "42", round: 2 }, "?scenario=x")).toBe(
      `${BASE}/stages/play-in?scenario=x&match=42&round=2`,
    );
  });

  it("never writes a selection onto the Overview", () => {
    expect(buildHref(BASE, { screen: "overview", matchId: "42" }, "?round=3")).toBe(BASE);
  });

  it("round-trips through parseLocation", () => {
    const href = buildHref(BASE, { screen: "stages", stageKey: "swiss", matchId: "9", round: 4 });
    const [path, qs] = href.split("?");
    const loc = parseLocation(BASE, path, `?${qs}`);
    expect(stageKeyFromSlug(loc.stageSlug ?? undefined, KEYS)).toBe("swiss");
    expect(loc).toMatchObject({ matchId: "9", round: 4 });
  });
});

describe("stage naming", () => {
  it("uses reader-facing slugs and labels, and falls back to the registry", () => {
    expect(KEYS.map(stageSlug)).toEqual(["play-in", "swiss", "knockouts"]);
    expect(stageLabel({ key: "knockout", name: "Knockout Stage" })).toBe("Knockouts");
    expect(stageLabel({ key: "groups", name: "Group Stage" })).toBe("Group");
    expect(stageKeyFromSlug("KNOCKOUTS", KEYS)).toBe("knockout");
    expect(stageKeyFromSlug("groups", KEYS)).toBeNull();
  });
});

describe("direction of travel", () => {
  it("follows screen order, and reverses on the way back", () => {
    expect(navDirection({ screen: "overview", stageKey: null }, { screen: "stages", stageKey: "play_in" }, KEYS)).toEqual({ level: "screen", dir: 1 });
    expect(navDirection({ screen: "stages", stageKey: "swiss" }, { screen: "overview", stageKey: null }, KEYS)).toEqual({ level: "screen", dir: -1 });
  });

  it("follows stage order within the Stage Explorer", () => {
    expect(navDirection({ screen: "stages", stageKey: "play_in" }, { screen: "stages", stageKey: "knockout" }, KEYS)).toEqual({ level: "stage", dir: 1 });
    expect(navDirection({ screen: "stages", stageKey: "knockout" }, { screen: "stages", stageKey: "swiss" }, KEYS)).toEqual({ level: "stage", dir: -1 });
  });

  it("does not move for a first load or a selection change", () => {
    expect(navDirection(null, { screen: "stages", stageKey: "swiss" }, KEYS)).toEqual({ level: "none", dir: 0 });
    expect(navDirection({ screen: "stages", stageKey: "swiss" }, { screen: "stages", stageKey: "swiss" }, KEYS)).toEqual({ level: "none", dir: 0 });
  });

  it("swipes only between built screens", () => {
    expect(adjacentScreen("overview", 1)).toBe("stages");
    expect(adjacentScreen("stages", 1)).toBeNull();
    expect(adjacentScreen("overview", -1)).toBeNull();
  });
});
