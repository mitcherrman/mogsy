/**
 * MC-UX1 — the gallery's presentation contract: collections and card status.
 * Status is derived from the one launch decision (`resolveModeAction`) run on
 * the captured backend catalog and real Daily run fixtures.
 */
import { describe, expect, it } from "vitest";
import wire from "./__fixtures__/publicModeCatalog.json";
import { PUBLIC_MODE_IDS, readPublicModeCatalog, type PublicModeEntry } from "./contracts";
import { resolveModeAction, type DailyContext } from "./launch";
import {
  MODE_COLLECTIONS, cardStatus, collectionCellClass, collectionOfMode, countReady, groupModes, initialCollection,
  pickRandomPlayable, sharePause, stepCollection,
} from "./gallery";
import { FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, fixtureRun, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";

const catalog = () => readPublicModeCatalog(JSON.parse(JSON.stringify(wire)));
const entry = (id: string): PublicModeEntry => catalog().modes.find((m) => m.id === id)!;
const status = (id: string, daily: DailyContext) => cardStatus(entry(id), resolveModeAction(entry(id), daily));

const mainDone = (stageOverrides = {}, overrides = {}) => fixtureV5Run(V5_ELIGIBLE_DAY,
  { main_completed_at: "2026-10-16T10:00:00Z", main_score: 1234, current_stage_index: 1, ...overrides },
  { 0: { status: "completed", result: wireResult() }, ...stageOverrides });

describe("MC-UX1 — collections", () => {
  it("names every public mode exactly once", () => {
    const named = MODE_COLLECTIONS.flatMap((c) => c.modes);
    expect([...named].sort()).toEqual([...PUBLIC_MODE_IDS].sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it("groups the catalog into Daily Extras, Knowledge Arena and Precision & Recall, keeping server order", () => {
    const groups = groupModes(catalog().modes);
    expect(groups.map((g) => [g.title, g.modes.map((m) => m.id)])).toEqual([
      ["Daily Extras", ["time_trial", "survival"]],
      ["Knowledge Arena", ["roster_lock", "draft_memory", "chronoscope", "match_grid", "reconstruct", "order_forge"]],
      ["Precision & Recall", ["rangefinder", "glyph_press", "perfect_timing", "stat_drop", "combat_estimate"]],
    ]);
  });

  it("draws only what the catalog returned: an empty collection is left out", () => {
    const modes = catalog().modes.filter((m) => m.id !== "time_trial" && m.id !== "survival");
    expect(groupModes(modes).map((g) => g.id)).toEqual(["knowledge_arena", "precision_recall"]);
  });

  it("never drops a mode no collection names", () => {
    const stray = { ...entry("match_grid"), id: "future_mode" } as unknown as PublicModeEntry;
    const groups = groupModes([...catalog().modes, stray]);
    expect(groups.at(-1)).toMatchObject({ id: "more", title: "More games" });
    expect(groups.at(-1)!.modes.map((m) => m.id)).toEqual(["future_mode"]);
  });

  it("balances a collection's rows: two cards left over share a row at lg", () => {
    const five = [0, 1, 2, 3, 4].map((i) => collectionCellClass("precision_recall", i, 5));
    expect(five.slice(0, 3)).toEqual(["lg:col-span-2", "lg:col-span-2", "lg:col-span-2"]);
    expect(five[3]).toBe("lg:col-span-3");
    expect(five[4]).toBe("sm:col-span-2 lg:col-span-3");
    expect([0, 1, 2, 3, 4, 5].map((i) => collectionCellClass("knowledge_arena", i, 6)))
      .toEqual(Array(6).fill("lg:col-span-2"));
    expect(collectionCellClass("daily_extras", 1, 2)).toBe("");
  });
});

describe("MC-UX1 — card status follows the player's real eligibility", () => {
  it("a bonus game is playable now, with no badge to repeat it", () => {
    for (const id of ["match_grid", "rangefinder"]) {
      expect(status(id, { state: "ready", run: null })).toEqual({ state: "ready", badge: null, plate: null, note: null });
    }
  });

  it("no Daily yet: the Daily stages say the Daily comes first (not 'open')", () => {
    for (const daily of [{ state: "ready" as const, run: null }, { state: "error" as const }]) {
      expect(status("time_trial", daily)).toEqual({ state: "daily_first", badge: "Daily first", plate: null,
        note: "Unlocks after today's Daily Challenge." });
    }
  });

  it("main Daily unfinished: still the Daily first", () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { current_stage_index: 0 });
    expect(status("survival", { state: "ready", run }).state).toBe("daily_first");
  });

  it("the run's current bonus stage is up now; the next one waits for it", () => {
    expect(status("time_trial", { state: "ready", run: mainDone() }))
      .toEqual({ state: "ready", badge: "Up now", plate: null, note: null });
    expect(status("survival", { state: "ready", run: mainDone() })).toEqual({ state: "waiting", badge: null,
      plate: { label: "Up after Time Trial", detail: "Today's bonus stages play in order." }, note: null });
  });

  it("a finished stage is played today, with today's result", () => {
    const run = mainDone({ 1: { status: "completed", result: wireResult({ correct: 7 }) } }, { current_stage_index: 2 });
    expect(status("time_trial", { state: "ready", run }))
      .toEqual({ state: "played", badge: null, plate: { label: "Played today", detail: "7 correct" }, note: null });
  });

  it("a skipped stage is closed for today", () => {
    const run = mainDone({ 1: { status: "skipped" } }, { current_stage_index: 2 });
    expect(status("time_trial", { state: "ready", run }).state).toBe("closed");
  });

  it("a legacy run, a paused or an unavailable mode is never ready", () => {
    expect(status("time_trial", { state: "ready", run: fixtureRun(FOUR_STAGE_DAY, { plan_version: 4 }) }))
      .toMatchObject({ state: "unavailable", plate: { label: "Not in today's Daily" } });
    const paused = { ...entry("match_grid"), launch: null,
      availability: { status: "paused" as const, reasonCode: "BONUS_PAUSED", message: "Paused for now." } };
    expect(cardStatus(paused, resolveModeAction(paused, { state: "loading" })))
      .toEqual({ state: "paused", badge: null, plate: { label: "Paused", detail: "Paused for now." }, note: null });
    const off = { ...entry("rangefinder"), launch: null,
      availability: { status: "unavailable" as const, reasonCode: "BONUS_UNAVAILABLE", message: "Not now." } };
    expect(cardStatus(off, resolveModeAction(off, { state: "loading" })).state).toBe("unavailable");
  });

  it("while the Daily is read, its stages are checking; the count only counts ready cards", () => {
    expect(status("time_trial", { state: "loading" }).state).toBe("checking");
    const all = catalog().modes.map((m) => cardStatus(m, resolveModeAction(m, { state: "ready", run: null })));
    expect(countReady(all)).toBe(11);
    const live = catalog().modes.map((m) => cardStatus(m, resolveModeAction(m, { state: "ready", run: mainDone() })));
    expect(countReady(live)).toBe(12);
  });

  it("a whole collection paused for one reason says it once", () => {
    const paused = { state: "paused" as const, badge: null, plate: { label: "Paused", detail: "Back soon." }, note: null };
    const shared = sharePause([paused, paused, paused]);
    expect(shared.reason).toBe("Back soon.");
    expect(shared.statuses.every((s) => s.plate?.detail === null && s.plate?.label === "Paused")).toBe(true);
    const ready = { state: "ready" as const, badge: null, plate: null, note: null };
    expect(sharePause([paused, ready]).reason).toBeNull();
    expect(sharePause([paused, { ...paused, plate: { label: "Paused", detail: "Other." } }]).reason).toBeNull();
  });
});

describe("MC-UX2 — Random picks only what is playable right now", () => {
  const all = () => catalog().modes;
  const pick = (daily: DailyContext, r: number, modes = all()) => pickRandomPlayable(modes,
    (m) => cardStatus(m, resolveModeAction(m, daily)), (m) => resolveModeAction(m, daily), () => r)?.id ?? null;

  it("never a Daily stage that waits on the Daily", () => {
    const daily = { state: "ready" as const, run: null };
    const picks = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.999].map((r) => pick(daily, r)));
    expect(picks.has("time_trial")).toBe(false);
    expect(picks.has("survival")).toBe(false);
    expect(pick(daily, 0)).toBe("roster_lock");
    expect(pick(daily, 0.999)).toBe("combat_estimate");
  });

  it("the Daily stage that is up now is a candidate; the one waiting is not", () => {
    const daily = { state: "ready" as const, run: mainDone() };
    expect(pick(daily, 0)).toBe("time_trial");
    const picks = new Set(Array.from({ length: 50 }, (_, i) => pick(daily, i / 50)));
    expect(picks.has("survival")).toBe(false);
    expect(picks.size).toBe(12);
  });

  it("never a paused or unavailable mode, and null when nothing can be played", () => {
    const paused = all().map((m) => (m.launch?.kind === "daily_stage" ? m : {
      ...m, launch: null, availability: { status: "paused" as const, reasonCode: "BONUS_PAUSED", message: "x" } }));
    expect(pick({ state: "ready", run: null }, 0, paused)).toBeNull();
    expect(pick({ state: "loading" }, 0.5, paused)).toBeNull();
  });
});

describe("MC-UX2 — paging", () => {
  const groups = () => groupModes(catalog().modes);
  it("steps through the collections in order and wraps at both ends", () => {
    expect(stepCollection(groups(), "daily_extras", 1)).toBe("knowledge_arena");
    expect(stepCollection(groups(), "precision_recall", 1)).toBe("daily_extras");
    expect(stepCollection(groups(), "daily_extras", -1)).toBe("precision_recall");
  });

  it("opens the URL's collection, the Daily's for a Daily visitor, else the Knowledge Arena", () => {
    expect(initialCollection(groups(), "precision_recall", "direct")).toBe("precision_recall");
    expect(initialCollection(groups(), "nonsense", "daily")).toBe("daily_extras");
    expect(initialCollection(groups(), null, "leaguecraft")).toBe("knowledge_arena");
    expect(initialCollection([], null, "direct")).toBeNull();
  });

  it("names a mode's collection", () => {
    expect(collectionOfMode(groups(), "reconstruct")).toBe("knowledge_arena");
    expect(collectionOfMode(groups(), "stat_drop")).toBe("precision_recall");
  });
});
