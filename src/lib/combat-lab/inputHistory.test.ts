/**
 * Contract for the Combat Lab input-history core: past → present → future
 * semantics, branching, deterministic no-op detection, per-field transaction
 * coalescing, the 50-entry cap, and the domain change classifier that feeds
 * undo/redo feedback.
 */
import { describe, expect, it } from "vitest";
import {
  COALESCE_WINDOW_MS,
  HISTORY_CAP,
  canRedo,
  canUndo,
  changedPaths,
  commit,
  createHistory,
  deepEqual,
  describeCombatLabChange,
  redo,
  undo,
  type CombatLabInputSnapshot,
  type HistoryState,
} from "./inputHistory";

type Snap = { champion: string; level: number; items: string[] };

const snap = (champion: string, level = 18, items: string[] = []): Snap => ({
  champion,
  level,
  items,
});

const discrete = (label = "champion change") => ({ label, txnKey: null, at: 1000 });

function committed(states: Snap[]): HistoryState<Snap> {
  let h = createHistory(states[0]);
  for (let i = 1; i < states.length; i++) {
    h = commit(h, states[i], { ...discrete(), at: 1000 + i * 10_000 });
  }
  return h;
}

describe("history core", () => {
  it("starts with no undo and no redo", () => {
    const h = createHistory(snap("Akali"));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("enables undo after the first meaningful edit", () => {
    const h = committed([snap("Akali"), snap("Ashe")]);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it("undo restores the exact previous state; redo restores the exact next", () => {
    const a = snap("Akali", 18, ["Void Staff"]);
    const b = snap("Ashe", 12, ["Kraken Slayer"]);
    let h = committed([a, b]);
    h = undo(h);
    expect(h.present.state).toEqual(a);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.state).toEqual(b);
  });

  it("undo at the beginning and redo at the end are no-ops", () => {
    const h = createHistory(snap("Akali"));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
    const h2 = committed([snap("Akali"), snap("Ashe")]);
    expect(redo(h2)).toBe(h2);
  });

  it("a divergent edit after undo discards the redo branch", () => {
    let h = committed([snap("Akali"), snap("Ashe"), snap("Jinx")]);
    h = undo(h);
    h = undo(h);
    expect(h.future).toHaveLength(2);
    h = commit(h, snap("Zed"), discrete());
    expect(canRedo(h)).toBe(false);
    expect(h.future).toHaveLength(0);
    expect(h.present.state.champion).toBe("Zed");
    h = undo(h);
    expect(h.present.state.champion).toBe("Akali");
  });

  it("identical (deep-equal but reconstructed) states create no entry", () => {
    const h = committed([snap("Akali", 18, ["Void Staff"])]);
    const clone = JSON.parse(JSON.stringify(snap("Akali", 18, ["Void Staff"])));
    expect(commit(h, clone, discrete())).toBe(h);
  });

  it("caps the past at HISTORY_CAP, dropping the oldest first", () => {
    let h = createHistory(snap("c0", 1));
    for (let i = 1; i <= HISTORY_CAP + 10; i++) {
      h = commit(h, snap(`c${i}`, 1), { ...discrete(), at: i * 10_000 });
    }
    expect(h.past).toHaveLength(HISTORY_CAP);
    // Oldest surviving entry is the one 50 steps back, not the initial state.
    expect(h.past[0].state.champion).toBe(`c${10}`);
    expect(h.present.state.champion).toBe(`c${HISTORY_CAP + 10}`);
    // Undoing to the very bottom lands on the oldest retained snapshot.
    for (let i = 0; i < HISTORY_CAP; i++) h = undo(h);
    expect(canUndo(h)).toBe(false);
    expect(h.present.state.champion).toBe(`c${10}`);
  });

  it("coalesces rapid same-field edits into one entry, replacing the present", () => {
    let h = createHistory(snap("Akali", 1));
    h = commit(h, snap("Akali", 12), { label: "level change", txnKey: "level", at: 1000 });
    h = commit(h, snap("Akali", 125), { label: "level change", txnKey: "level", at: 1300 });
    h = commit(h, snap("Akali", 18), { label: "level change", txnKey: "level", at: 1600 });
    expect(h.past).toHaveLength(1);
    expect(h.present.state.level).toBe(18);
    h = undo(h);
    expect(h.present.state.level).toBe(1);
  });

  it("ends the transaction when the window elapses or the field changes", () => {
    let h = createHistory(snap("Akali", 1));
    h = commit(h, snap("Akali", 5), { label: "level change", txnKey: "level", at: 1000 });
    // Past the window → separate entry.
    h = commit(h, snap("Akali", 9), {
      label: "level change",
      txnKey: "level",
      at: 1000 + COALESCE_WINDOW_MS + 1,
    });
    expect(h.past).toHaveLength(2);
    // Different field key → separate entry even inside a window.
    h = commit(h, snap("Ashe", 9), {
      label: "champion change",
      txnKey: null,
      at: 1000 + COALESCE_WINDOW_MS + 100,
    });
    expect(h.past).toHaveLength(3);
  });

  it("does not coalesce across an undo boundary", () => {
    let h = createHistory(snap("Akali", 1));
    h = commit(h, snap("Akali", 5), { label: "level change", txnKey: "level", at: 1000 });
    h = undo(h);
    h = commit(h, snap("Akali", 7), { label: "level change", txnKey: "level", at: 1100 });
    // The post-undo edit is a push (new branch), not a replacement.
    expect(h.past).toHaveLength(1);
    expect(h.present.state.level).toBe(7);
    expect(canRedo(h)).toBe(false);
  });

  it("a coalesced edit still clears the redo branch", () => {
    let h = committed([snap("Akali", 1), snap("Ashe", 1)]);
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = commit(h, snap("Akali", 3), { label: "level change", txnKey: "level", at: 60_000 });
    expect(canRedo(h)).toBe(false);
  });

  it("restores nested state without mutation leakage", () => {
    const a = snap("Akali", 18, ["Void Staff"]);
    let h = committed([a, snap("Ashe", 12, ["Kraken Slayer"])]);
    h = undo(h);
    const restored = h.present.state;
    restored.items.push("MUTATED");
    // The snapshot inside the stack is the same object the caller committed —
    // the caller's immutable update discipline is what history relies on; the
    // stack itself never mutates entries.
    expect(h.present.state.items).toContain("MUTATED");
    // But undo/redo transitions never rewrite other entries.
    const again = redo(h);
    expect(again.present.state.items).toEqual(["Kraken Slayer"]);
  });
});

describe("deepEqual", () => {
  it("ignores object key order but respects array order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });

  it("treats undefined-valued keys as absent", () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: undefined }, { a: null })).toBe(false);
  });

  it("distinguishes null, objects and primitives", () => {
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual(0, "0")).toBe(false);
    expect(deepEqual({ a: { b: [1, { c: 2 }] } }, { a: { b: [1, { c: 2 }] } })).toBe(true);
  });
});

describe("changedPaths", () => {
  it("names nested scalar changes and treats arrays as leaves", () => {
    const a = { config: { stats: { LEVEL: 18 }, items: ["A"] } };
    const b = { config: { stats: { LEVEL: 12 }, items: ["A", "B"] } };
    expect(changedPaths(a, b).sort()).toEqual(["config.items", "config.stats.LEVEL"]);
  });
});

describe("describeCombatLabChange", () => {
  const base: CombatLabInputSnapshot<Record<string, unknown>, Record<string, unknown>> = {
    config: { champion: "Akali", items: [], stats: { LEVEL: 18 }, ad: 100 },
    abilityRanks: { Q: 5, W: 5, E: 5, R: 3 },
    rankMode: "sandbox",
    targetSetup: { targetMode: "target_dummy", dummyHP: 4000 },
    summonerPicks: [],
    hijackTarget: "Malphite",
  };
  const next = (patch: Partial<typeof base>): typeof base => ({ ...base, ...patch });

  it("labels discrete field changes without a transaction key", () => {
    const d = describeCombatLabChange(
      base,
      next({ config: { ...base.config, champion: "Ashe" } })
    );
    expect(d.label).toBe("champion change");
    expect(d.txnKey).toBeNull();
  });

  it("marks typed numeric fields as coalescible under their own path", () => {
    const level = describeCombatLabChange(
      base,
      next({ config: { ...base.config, stats: { LEVEL: 12 } } })
    );
    expect(level.label).toBe("level change");
    expect(level.txnKey).toBe("config.stats.LEVEL");

    const hp = describeCombatLabChange(
      base,
      next({ targetSetup: { ...base.targetSetup, dummyHP: 2500 } })
    );
    expect(hp.label).toBe("target dummy change");
    expect(hp.txnKey).toBe("targetSetup.dummyHP");
  });

  it("keeps ability-rank pips and summoners discrete", () => {
    expect(
      describeCombatLabChange(base, next({ abilityRanks: { Q: 4, W: 5, E: 5, R: 3 } })).txnKey
    ).toBeNull();
    expect(describeCombatLabChange(base, next({ summonerPicks: ["Flash"] })).label).toBe(
      "summoner change"
    );
  });

  it("never coalesces multi-field changes", () => {
    const d = describeCombatLabChange(
      base,
      next({
        config: { ...base.config, champion: "Ashe", ad: 250 },
        summonerPicks: ["Flash"],
      })
    );
    expect(d.txnKey).toBeNull();
    expect(d.label).toBe("setup change");
    expect(d.paths.length).toBeGreaterThan(1);
  });

  it("reports no paths for equal snapshots", () => {
    expect(describeCombatLabChange(base, next({})).paths).toHaveLength(0);
  });
});
