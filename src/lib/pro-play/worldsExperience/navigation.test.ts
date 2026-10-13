/**
 * UX1/UX2: the Worlds experience's URL model. Screens and stages are in the
 * path, each screen's selections in its own query keys, everything else
 * carried, and the direction of travel follows screen order.
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
const EMPTY = { stageSlug: null, matchId: null, round: null, step: null, team: null, region: null, day: null, filter: null, unresolved: false };

describe("screens", () => {
  it("carries five destinations, of which four are built and Discover is not", () => {
    expect(SCREENS.map((s) => s.label)).toEqual(["Overview", "Stages", "Teams", "Schedule", "Discover"]);
    expect(READY_SCREENS.map((s) => s.key)).toEqual(["overview", "stages", "teams", "schedule"]);
  });

  it("refuses to build a link to Discover", () => {
    expect(() => buildHref(BASE, { screen: "discover" })).toThrow(/not available/);
  });
});

describe("parseLocation", () => {
  it("reads the landing path as the Overview", () => {
    expect(parseLocation(BASE, BASE, "")).toEqual({ screen: "overview", ...EMPTY });
    expect(parseLocation(BASE, `${BASE}/`, "?scenario=snapshot").screen).toBe("overview");
  });

  it("reads a stage, a selected match, a Swiss round and a phone Play-In round on Stages", () => {
    const loc = parseLocation(BASE, `${BASE}/stages/swiss`, "?match=123&round=3&step=upper_bracket_finals&scenario=x");
    expect(loc).toEqual({ screen: "stages", ...EMPTY, stageSlug: "swiss", matchId: "123", round: 3, step: "upper_bracket_finals" });
  });

  it("reads a team and a region on Teams", () => {
    expect(parseLocation(BASE, `${BASE}/teams`, "?team=tlaw&region=LCS")).toEqual({ screen: "teams", ...EMPTY, team: "TLAW", region: "LCS" });
  });

  it("reads a day, a stage filter and a match on Schedule", () => {
    expect(parseLocation(BASE, `${BASE}/schedule`, "?day=2026-10-23&stage=Swiss&match=9")).toEqual({
      screen: "schedule",
      ...EMPTY,
      day: "2026-10-23",
      filter: "swiss",
      matchId: "9",
    });
  });

  it("each screen reads only its own keys, and malformed values are dropped", () => {
    expect(parseLocation(BASE, BASE, "?match=123&team=KC&day=2026-10-15")).toMatchObject({ matchId: null, team: null, day: null });
    expect(parseLocation(BASE, `${BASE}/teams`, "?match=123&day=2026-10-15")).toMatchObject({ matchId: null, day: null });
    expect(parseLocation(BASE, `${BASE}/schedule`, "?day=15-10-2026&team=KC")).toMatchObject({ day: null, team: null });
    expect(parseLocation(BASE, `${BASE}/stages`, "?round=zero&match=<script>")).toMatchObject({ round: null, matchId: null });
    expect(parseLocation(BASE, `${BASE}/teams`, "?team=not a code")).toMatchObject({ team: null });
  });

  it("marks Discover or an unknown screen as unresolved (the shell corrects it)", () => {
    expect(parseLocation(BASE, `${BASE}/discover`, "")).toMatchObject({ screen: "overview", unresolved: true });
    expect(parseLocation(BASE, `${BASE}/nope`, "")).toMatchObject({ screen: "overview", unresolved: true });
  });
});

describe("buildHref", () => {
  it("puts screen and stage in the path and keeps every key it does not own", () => {
    expect(buildHref(BASE, { screen: "stages", stageKey: "knockout" }, "?scenario=complete&now=2026-11-20T00:00:00Z&match=1")).toBe(
      `${BASE}/stages/knockouts?scenario=complete&now=2026-11-20T00%3A00%3A00Z`,
    );
    expect(buildHref(BASE, { screen: "stages", stageKey: "play_in", matchId: "42", round: 2, step: "lower_bracket_finals" }, "?scenario=x")).toBe(
      `${BASE}/stages/play-in?scenario=x&match=42&round=2&step=lower_bracket_finals`,
    );
  });

  it("writes Teams and Schedule selections, the filter as a slug", () => {
    expect(buildHref(BASE, { screen: "teams", team: "KC", region: "LEC" }, "?scenario=x")).toBe(`${BASE}/teams?scenario=x&region=LEC&team=KC`);
    expect(buildHref(BASE, { screen: "schedule", day: "2026-11-03", filterKey: "knockout", matchId: "7" })).toBe(
      `${BASE}/schedule?day=2026-11-03&stage=knockouts&match=7`,
    );
  });

  it("drops the keys of the screen left behind: no orphaned selection", () => {
    const from = "?scenario=x&match=1&round=3&step=s&team=KC&region=LEC&day=2026-10-15&stage=swiss";
    expect(buildHref(BASE, { screen: "teams" }, from)).toBe(`${BASE}/teams?scenario=x`);
    expect(buildHref(BASE, { screen: "schedule" }, from)).toBe(`${BASE}/schedule?scenario=x`);
    expect(buildHref(BASE, { screen: "overview", matchId: "42" }, from)).toBe(`${BASE}?scenario=x`);
  });

  it("round-trips through parseLocation", () => {
    for (const target of [
      { screen: "stages" as const, stageKey: "swiss", matchId: "9", round: 4 },
      { screen: "teams" as const, team: "GEN", region: "LCK" },
      { screen: "schedule" as const, day: "2026-10-25", filterKey: "swiss", matchId: "5" },
    ]) {
      const href = buildHref(BASE, target);
      const [path, qs] = href.split("?");
      const loc = parseLocation(BASE, path, `?${qs ?? ""}`);
      expect(loc.screen).toBe(target.screen);
      if (target.screen === "stages") expect(stageKeyFromSlug(loc.stageSlug ?? undefined, KEYS)).toBe("swiss");
      if (target.screen === "teams") expect(loc).toMatchObject({ team: "GEN", region: "LCK" });
      if (target.screen === "schedule") expect(stageKeyFromSlug(loc.filter ?? undefined, KEYS)).toBe("swiss");
    }
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
  it("follows screen order across all four screens, and reverses on the way back", () => {
    const at = (screen: "overview" | "stages" | "teams" | "schedule") => ({ screen, stageKey: screen === "stages" ? "play_in" : null });
    expect(navDirection(at("overview"), at("teams"), KEYS)).toEqual({ level: "screen", dir: 1 });
    expect(navDirection(at("teams"), at("schedule"), KEYS)).toEqual({ level: "screen", dir: 1 });
    expect(navDirection(at("schedule"), at("stages"), KEYS)).toEqual({ level: "screen", dir: -1 });
    expect(navDirection(at("stages"), at("overview"), KEYS)).toEqual({ level: "screen", dir: -1 });
  });

  it("follows stage order within the Stage Explorer", () => {
    expect(navDirection({ screen: "stages", stageKey: "play_in" }, { screen: "stages", stageKey: "knockout" }, KEYS)).toEqual({ level: "stage", dir: 1 });
    expect(navDirection({ screen: "stages", stageKey: "knockout" }, { screen: "stages", stageKey: "swiss" }, KEYS)).toEqual({ level: "stage", dir: -1 });
  });

  it("does not move for a first load or a selection change", () => {
    expect(navDirection(null, { screen: "stages", stageKey: "swiss" }, KEYS)).toEqual({ level: "none", dir: 0 });
    expect(navDirection({ screen: "teams", stageKey: null }, { screen: "teams", stageKey: null }, KEYS)).toEqual({ level: "none", dir: 0 });
  });

  it("swipes only between built screens", () => {
    expect(adjacentScreen("overview", 1)).toBe("stages");
    expect(adjacentScreen("teams", 1)).toBe("schedule");
    expect(adjacentScreen("schedule", 1)).toBeNull();
    expect(adjacentScreen("overview", -1)).toBeNull();
  });
});
