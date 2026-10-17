/**
 * PGM1 — the public catalog contract, the launch resolver, and the Rules /
 * Report contracts. The catalog fixture is the backend's own answer
 * (`public_game_modes.catalog.public_catalog` with every gate open), captured
 * verbatim, so this suite and the backend's test pin the same payload.
 */
import { describe, expect, it } from "vitest";
import wire from "./__fixtures__/publicModeCatalog.json";
import {
  PUBLIC_MODE_IDS,
  PUBLIC_MODE_TITLES,
  PublicModeCatalogParseError,
  readPublicModeCatalog,
  type PublicModeEntry,
} from "./contracts";
import {
  DAILY_CHALLENGE_ROUTE, readMoreChallengesSource, moreChallengesState, resolveModeAction, sessionModeRoute,
} from "./launch";
import { SCORING_NOT_PUBLISHED, buildModeRules } from "./rules";
import { PUBLIC_MODE_FEEDBACK_CATEGORY, modeSelectedMetadata, publicModeReportSnapshot } from "./report";
import { DAILY_CONTINUE_STATE, DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { FOUR_STAGE_DAY, V5_ELIGIBLE_DAY, fixtureRun, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { buildQuestionReportContext } from "@/lib/feedback/report-context";
import { FEEDBACK_CATEGORIES } from "@/lib/feedback/contract";

type Wire = typeof wire;
const clone = (): Wire => JSON.parse(JSON.stringify(wire));
const catalog = () => readPublicModeCatalog(clone());
const entry = (id: string): PublicModeEntry => catalog().modes.find((m) => m.id === id)!;

// ── the contract ─────────────────────────────────────────────────────────────

describe("PGM1 — the public catalog contract", () => {
  it("reads all thirteen approved modes, in the server's order, with stable ids", () => {
    const { modes } = catalog();
    expect(modes.map((m) => m.id)).toEqual([...PUBLIC_MODE_IDS]);
    for (const m of modes) {
      expect(m.title && m.theme && m.summary).toBeTruthy();
      expect(m.rulesId).toBe(m.id);
      expect(m.reportId).toBe(m.id);
      expect(m.scoring.affectsDailyScore).toBe(false);
      expect(m.scoring.affectsRankedRating).toBe(false);
    }
  });

  it("publishes a launch only where the backend built one, with its rules and scoring", () => {
    const launchable = catalog().modes.filter((m) => m.launch).map((m) => m.id);
    // The Daily stages plus every Ranked-backed / session mode opened so far.
    expect(launchable.slice(0, 2)).toEqual(["time_trial", "survival"]);
    expect(launchable).toContain("match_grid");
    expect(entry("time_trial").launch).toEqual({ kind: "daily_stage", stageKind: "time_trial", minPlanVersion: 5 });
    expect(entry("match_grid").launch).toEqual({ kind: "ranked_match", guestsAllowed: true });
    for (const m of catalog().modes.filter((x) => x.launch && x.launch.kind !== "daily_stage")) {
      expect(m.scoring.summary, m.id).toBeTruthy();
      expect(m.rules.length, m.id).toBeGreaterThan(0);
    }
    for (const m of catalog().modes.filter((x) => !x.launch)) {
      expect(m.availability.status).toBe("coming_soon");
      expect(m.scoring.summary).toBeNull();
      expect(m.rules).toEqual([]);
    }
  });

  it("names every mode exactly as the server catalog does", () => {
    for (const m of catalog().modes) expect(PUBLIC_MODE_TITLES[m.id]).toBe(m.title);
  });

  it("orders by `order`, not by array position", () => {
    const w = clone();
    w.modes.reverse();
    expect(readPublicModeCatalog(w).modes.map((m) => m.id)).toEqual([...PUBLIC_MODE_IDS]);
  });

  it("drops a mode id this client does not know instead of guessing its copy", () => {
    const w = clone();
    w.modes.push({ ...w.modes[0], id: "future_mode", order: 99 });
    expect(readPublicModeCatalog(w).modes.map((m) => m.id)).not.toContain("future_mode");
  });

  it.each<[string, (w: Wire) => void]>([
    ["wrong contract", (w) => { w.contract = "public_game_modes.catalog.v0"; }],
    ["duplicate id", (w) => { w.modes.push(w.modes[0]); }],
    ["unknown status", (w) => { w.modes[0].availability.status = "open"; }],
    ["unknown launch kind", (w) => { w.modes[0].launch!.kind = "teleport"; }],
    ["missing scoring flag", (w) => { Reflect.deleteProperty(w.modes[0].scoring, "affects_daily_score"); }],
    ["daily launch without a plan version", (w) => { Reflect.deleteProperty(w.modes[0].launch!, "min_plan_version"); }],
  ])("refuses the whole catalog on %s", (_name, mutate) => {
    const w = clone();
    mutate(w);
    expect(() => readPublicModeCatalog(w)).toThrow(PublicModeCatalogParseError);
  });
});

// ── the launch resolver ──────────────────────────────────────────────────────

const mainDone = (stageOverrides = {}, overrides = {}) => fixtureV5Run(V5_ELIGIBLE_DAY,
  { main_completed_at: "2026-10-16T10:00:00Z", main_score: 1234, current_stage_index: 1, ...overrides },
  { 0: { status: "completed", result: wireResult() }, ...stageOverrides });

describe("PGM1 — resolveModeAction", () => {
  it("never offers Play for a coming-soon mode, whatever the player's Daily", () => {
    for (const id of PUBLIC_MODE_IDS.filter((x) => !entry(x).launch)) {
      for (const daily of [{ state: "loading" as const }, { state: "error" as const },
        { state: "ready" as const, run: mainDone() }]) {
        expect(resolveModeAction(entry(id), daily)).toEqual({ kind: "coming_soon" });
      }
    }
  });

  it("waits for the player's Daily before deciding a Daily stage", () => {
    expect(resolveModeAction(entry("time_trial"), { state: "loading" })).toEqual({ kind: "checking" });
  });

  it("no run today (or no session): offers to start today's Daily, and says why", () => {
    for (const daily of [{ state: "ready" as const, run: null }, { state: "error" as const }]) {
      expect(resolveModeAction(entry("survival"), daily)).toEqual({
        kind: "play", label: "Start Today's Daily", to: DAILY_CHALLENGE_ROUTE, state: DAILY_START_STATE,
        note: "Unlocks after today's Daily Challenge.", gate: "daily_first",
      });
    }
  });

  it("a paused Daily with no run today is blocked with the server's message", () => {
    const e = entry("time_trial");
    const paused = { ...e, availability: { status: "paused" as const, reasonCode: "DAILY_PAUSED", message: "Paused for now." } };
    expect(resolveModeAction(paused, { state: "ready", run: null }))
      .toEqual({ kind: "blocked", label: "Paused", note: "Paused for now.", gate: "paused" });
    // …but a run already started still continues.
    expect(resolveModeAction(paused, { state: "ready", run: mainDone() }).kind).toBe("play");
  });

  it("main Daily not finished: continues today's Daily, never the bonus stage", () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { current_stage_index: 0 });
    expect(resolveModeAction(entry("time_trial"), { state: "ready", run })).toMatchObject({
      kind: "play", label: "Continue Today's Daily", state: DAILY_START_STATE, gate: "daily_first" });
  });

  it("the run's current bonus stage gets Play, with the continue intent", () => {
    expect(resolveModeAction(entry("time_trial"), { state: "ready", run: mainDone() })).toEqual({
      kind: "play", label: "Play", to: DAILY_CHALLENGE_ROUTE, state: DAILY_CONTINUE_STATE, note: null, gate: "ready" });
  });

  it("a live child is resumed, not restarted", () => {
    const run = mainDone({ 1: { status: "in_progress", child_match_id: "child-1" } });
    expect(resolveModeAction(entry("time_trial"), { state: "ready", run })).toMatchObject({ kind: "play", label: "Resume" });
  });

  it("a later bonus stage says what it waits for instead of offering Play", () => {
    expect(resolveModeAction(entry("survival"), { state: "ready", run: mainDone() })).toEqual({
      kind: "blocked", label: "Up after Time Trial", note: "Today's bonus stages play in order.", gate: "waiting" });
  });

  it("a finished stage reports today's result and offers nothing", () => {
    const run = mainDone({ 1: { status: "completed", result: wireResult({ correct: 7 }) } }, { current_stage_index: 2 });
    expect(resolveModeAction(entry("time_trial"), { state: "ready", run }))
      .toEqual({ kind: "done", label: "Played today", note: "7 correct", gate: "played" });
    expect(resolveModeAction(entry("survival"), { state: "ready", run }).kind).toBe("play");
  });

  it("a legacy (v1–v4) run has no bonus stage to continue", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { plan_version: 4 });
    expect(resolveModeAction(entry("time_trial"), { state: "ready", run }))
      .toEqual({ kind: "blocked", label: "Not in today's Daily", note: null, gate: "unavailable" });
  });

  it("an unavailable or paused mode is never drawn as Play", () => {
    const off = { ...entry("time_trial"), launch: null,
      availability: { status: "unavailable" as const, reasonCode: "DAILY_UNAVAILABLE", message: "Not today." } };
    expect(resolveModeAction(off, { state: "ready", run: null }))
      .toEqual({ kind: "blocked", label: "Unavailable right now", note: "Not today.", gate: "unavailable" });
    const paused = { ...entry("match_grid"), launch: null,
      availability: { status: "paused" as const, reasonCode: "BONUS_PAUSED", message: "Paused for now." } };
    expect(resolveModeAction(paused, { state: "ready", run: null }))
      .toEqual({ kind: "blocked", label: "Paused", note: "Paused for now.", gate: "paused" });
  });

  it("PGM2: a Ranked-backed bonus game starts from its card, whatever the Daily", () => {
    for (const daily of [{ state: "loading" as const }, { state: "error" as const },
      { state: "ready" as const, run: null }, { state: "ready" as const, run: mainDone() }]) {
      expect(resolveModeAction(entry("match_grid"), daily))
        .toEqual({ kind: "start", label: "Play", modeId: "match_grid", note: null });
    }
  });

  it("PGM2: a session mode plays on its own public page", () => {
    const session = { ...entry("rangefinder"), launch: { kind: "session" as const, guestsAllowed: true },
      availability: { status: "available" as const, reasonCode: null, message: null } };
    expect(resolveModeAction(session, { state: "loading" }))
      .toEqual({ kind: "play", label: "Play", to: sessionModeRoute("rangefinder"), state: null, note: null, gate: "ready" });
    expect(sessionModeRoute("rangefinder")).toBe("/quiz/more-challenges/rangefinder");
  });

  it("names where the catalog was opened from, for telemetry only", () => {
    expect(readMoreChallengesSource(moreChallengesState("daily"))).toBe("daily");
    expect(readMoreChallengesSource(moreChallengesState("leaguecraft"))).toBe("leaguecraft");
    expect(readMoreChallengesSource(null)).toBe("direct");
    expect(readMoreChallengesSource({ moreChallengesSource: "elsewhere" })).toBe("direct");
    expect(modeSelectedMetadata("time_trial", "play", "daily"))
      .toEqual({ game_mode_id: "time_trial", action: "play", source: "daily" });
  });
});

// ── Rules and Report ─────────────────────────────────────────────────────────

describe("PGM1 — Rules and Report contracts", () => {
  it("builds a mode's rules from the server's copy, and never guesses scoring", () => {
    const tt = buildModeRules(entry("time_trial"));
    expect(tt.rulesId).toBe("time_trial");
    expect(tt.title).toBe("Time Trial Rules");
    expect(tt.sections.map((s) => s.heading)).toEqual(["How to play", "Scoring", "Your standing"]);
    expect(tt.sections[1].body).toMatch(/correctly before the clock runs out/);
    expect(tt.sections[2].body).toBe("Never changes your Daily score. Never changes your Ranked rating.");
    // PGM2: an opened mode carries the server's own sections and scoring.
    const mg = buildModeRules(entry("match_grid"));
    expect(mg.sections.map((s) => s.heading)).toEqual(
      ["How to play", "The match", "Your answer", "The reveal", "Scoring", "Your standing"]);
    expect(mg.sections.find((s) => s.heading === "Scoring")!.body).toMatch(/^Each board scores 2 points/);
    // A mode not yet open says its scoring is unpublished, never a guess.
    const closed = catalog().modes.find((m) => !m.launch);
    if (closed) {
      const r = buildModeRules(closed, [{ heading: "Board", body: "Extra." }]);
      expect(r.sections.find((s) => s.heading === "Scoring")!.body).toBe(SCORING_NOT_PUBLISHED);
      expect(r.sections.map((s) => s.heading)).toEqual(["How to play", "Board", "Scoring", "Your standing"]);
    }
  });

  it("files reports under an existing feedback category, with the stable mode id", () => {
    expect(FEEDBACK_CATEGORIES).toContain(PUBLIC_MODE_FEEDBACK_CATEGORY);
    const snap = publicModeReportSnapshot(entry("reconstruct"), { prompt: "Build it", roundNumber: 2 },
      { revealed: false });
    expect(snap).toMatchObject({ category: "Leaguecraft", mode: "Reconstruct", gameModeId: "reconstruct",
      prompt: "Build it", roundNumber: 2, canonicalAnswer: null, answerEvidence: null });
  });

  it("carries the answer and its evidence only after the reveal", () => {
    const q = { prompt: "Which tree?", selectedAnswer: "Domination" };
    const hidden = publicModeReportSnapshot(entry("match_grid"), q,
      // A mode that forgets its own check still cannot leak: revealed=false wins.
      { revealed: false, canonicalAnswer: "Precision", evidence: "Rune tree: Precision" } as never);
    expect(hidden.canonicalAnswer).toBeNull();
    expect(hidden.answerEvidence).toBeNull();
    const shown = publicModeReportSnapshot(entry("match_grid"), q,
      { revealed: true, canonicalAnswer: "Precision", evidence: "Rune tree: Precision" });
    const ctx = buildQuestionReportContext({ snapshot: shown, reason: "incorrect_answer", route: "/quiz/x",
      now: new Date("2026-10-16T00:00:00Z") });
    expect(ctx).toMatchObject({ game_mode_id: "match_grid", canonical_answer: "Precision",
      answer_evidence: "Rune tree: Precision", mode: "Match Grid" });
  });

  it("an ordinary (non-mode) report gains no new keys", () => {
    const ctx = buildQuestionReportContext({ snapshot: { category: "Ranked", mode: "Ranked", prompt: "Q" },
      reason: "typo", route: "/quiz/ranked" });
    expect(ctx).not.toHaveProperty("game_mode_id");
    expect(ctx).not.toHaveProperty("answer_evidence");
  });
});
