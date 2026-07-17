import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DsaAction,
  DsaMachineState,
  INITIAL_STATE,
  dsaReducer,
} from "./dailyScoreAttackMachine";
import {
  activeRunFixture,
  resolutionFixture,
  resultsFixture,
  terminalRunFixture,
  todayFixture,
} from "./testFixtures";

function run(actions: DsaAction[], from: DsaMachineState = INITIAL_STATE): DsaMachineState {
  return actions.reduce(dsaReducer, from);
}

describe("dsaReducer", () => {
  it("routes enabled metadata to ready for verified sessions", () => {
    const state = run([
      { type: "SESSION_RESOLVED", session: "account" },
      { type: "METADATA_LOADED", meta: todayFixture },
    ]);
    expect(state.phase).toBe("ready");
  });

  it("routes signed-out sessions to the official gate", () => {
    const state = run([
      { type: "SESSION_RESOLVED", session: "none" },
      { type: "METADATA_LOADED", meta: todayFixture },
    ]);
    expect(state.phase).toBe("signed-out-entry");
  });

  it("routes disabled metadata to unavailable", () => {
    const state = run([
      { type: "SESSION_RESOLVED", session: "account" },
      { type: "METADATA_LOADED", meta: { ...todayFixture, enabled: false } },
    ]);
    expect(state.phase).toBe("unavailable");
  });

  it("counts down before the creation request fires", () => {
    let state = run([
      { type: "SESSION_RESOLVED", session: "account" },
      { type: "METADATA_LOADED", meta: todayFixture },
      { type: "START_REQUESTED", intent: "official" },
    ]);
    expect(state.phase).toBe("pre-run-countdown");
    expect(state.countdown).toBe(3);
    state = run([{ type: "COUNTDOWN_TICK" }, { type: "COUNTDOWN_TICK" }], state);
    expect(state.phase).toBe("pre-run-countdown");
    state = dsaReducer(state, { type: "COUNTDOWN_TICK" });
    expect(state.phase).toBe("starting"); // request happens only after countdown
  });

  it("enters active play on a fresh run and reconnecting on resume", () => {
    const base = run([
      { type: "SESSION_RESOLVED", session: "account" },
      { type: "METADATA_LOADED", meta: todayFixture },
    ]);
    const fresh = dsaReducer(base, { type: "RUN_STARTED", run: activeRunFixture() });
    expect(fresh.phase).toBe("active-question");
    const resumed = dsaReducer(base, {
      type: "RUN_STARTED",
      run: activeRunFixture({ resumed: true }),
    });
    expect(resumed.phase).toBe("reconnecting");
  });

  it("adopts terminal runs returned from start", () => {
    const state = dsaReducer(INITIAL_STATE, {
      type: "RUN_STARTED",
      run: terminalRunFixture(),
    });
    expect(state.phase).toBe("expired");
  });

  it("locks the answer, reveals, and advances via server projections", () => {
    let state = dsaReducer(INITIAL_STATE, { type: "RUN_STARTED", run: activeRunFixture() });
    state = dsaReducer(state, { type: "ANSWER_SELECTED", selectedIndex: 0 });
    expect(state.phase).toBe("submitting-answer");
    expect(state.selectedIndex).toBe(0);
    state = dsaReducer(state, { type: "RESOLUTION_RECEIVED", resolution: resolutionFixture() });
    expect(state.phase).toBe("reveal");
    expect(state.run?.total_score).toBe(200); // server value adopted
    expect(state.previousScore).toBe(0); // prior server value kept for animation
    state = dsaReducer(state, { type: "REVEAL_DONE" });
    expect(state.phase).toBe("transitioning");
    state = dsaReducer(state, { type: "TRANSITION_DONE" });
    expect(state.phase).toBe("active-question");
    expect(state.run?.sequence).toBe(2);
    expect(state.selectedIndex).toBeNull();
  });

  it("moves to terminal after a reveal whose projection is terminal", () => {
    let state = dsaReducer(INITIAL_STATE, { type: "RUN_STARTED", run: activeRunFixture() });
    state = dsaReducer(state, { type: "ANSWER_SELECTED", selectedIndex: 1 });
    state = dsaReducer(state, {
      type: "RESOLUTION_RECEIVED",
      resolution: resolutionFixture({ run: terminalRunFixture() }),
    });
    state = dsaReducer(state, { type: "REVEAL_DONE" });
    expect(state.phase).toBe("expired");
  });

  it("reconciles through RUN_SYNCED in both directions", () => {
    let state = dsaReducer(INITIAL_STATE, { type: "RUN_STARTED", run: activeRunFixture() });
    state = dsaReducer(state, { type: "RECONCILE_REQUESTED" });
    expect(state.phase).toBe("reconnecting");
    const active = dsaReducer(state, { type: "RUN_SYNCED", run: activeRunFixture({ sequence: 3, question: { ...activeRunFixture().question!, sequence: 3 } }) });
    expect(active.phase).toBe("active-question");
    const terminal = dsaReducer(state, { type: "RUN_SYNCED", run: terminalRunFixture() });
    expect(terminal.phase).toBe("expired");
  });

  it("loads official and practice results into distinct phases", () => {
    const official = dsaReducer(INITIAL_STATE, {
      type: "RESULTS_LOADED",
      results: resultsFixture(),
    });
    expect(official.phase).toBe("official-results");
    const practice = dsaReducer(INITIAL_STATE, {
      type: "RESULTS_LOADED",
      results: resultsFixture({ official: false }),
    });
    expect(practice.phase).toBe("practice-results");
  });

  it("keeps terminal-error immutable except for RETRY", () => {
    let state = dsaReducer(INITIAL_STATE, {
      type: "TERMINAL_ERROR",
      code: "INTEGRITY_ERROR",
      message: "bad",
    });
    expect(state.phase).toBe("terminal-error");
    const ignored = dsaReducer(state, { type: "RUN_STARTED", run: activeRunFixture() });
    expect(ignored.phase).toBe("terminal-error");
    state = dsaReducer(state, { type: "RETRY" });
    expect(state.phase).toBe("loading-metadata");
  });

  it("handles recoverable errors and NO_RUN", () => {
    const recoverable = dsaReducer(INITIAL_STATE, {
      type: "RECOVERABLE_ERROR",
      code: "NETWORK",
      message: "offline",
    });
    expect(recoverable.phase).toBe("recoverable-error");
    const ready = dsaReducer(recoverable, { type: "NO_RUN" });
    expect(ready.phase).toBe("ready");
  });
});

describe("integrity boundaries", () => {
  const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const sources = fs
    .readdirSync(dir)
    .filter((name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."))
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));

  it("never imports the Ranked two-player machine or settlement adapters", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/ranked-duel-prototype/);
      expect(text, name).not.toMatch(/duelMachine/);
      expect(text, name).not.toMatch(/adaptBackendSettlement/);
    }
  });

  it("implements no scoring formula in the frontend", () => {
    for (const { name, text } of sources) {
      // The scoring constants/formula live only in the backend engine.
      expect(text, name).not.toMatch(/12000|10000|combo\s*\*|speedBonus\s*=/);
      expect(text, name).not.toMatch(/round_half_up|multiplier_for_combo/);
    }
  });
});
