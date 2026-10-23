import { describe, expect, it } from "vitest";
import { composeComparison } from "./compare";
import { contextKey, resolveEffectiveContext } from "./context";
import { EMPTY_WORKSPACE, SAMPLE_SNAPSHOTS } from "./fixtures";
import { resolveLens } from "./resolve";
import { EMPTY_VISUAL, reduceVisual, type VisualState } from "./visual";
import {
  abilitySubject,
  createHistory,
  exactMatchupSubject,
  reduceHistory,
  reduceWorkspace,
  type HistoryAction,
} from "./workspace";
import type { WorkspaceState } from "./types";

function run(actions: HistoryAction[], initial: WorkspaceState = EMPTY_WORKSPACE) {
  return actions.reduce(reduceHistory, createHistory(initial));
}

const ahriQ = abilitySubject("ahri", "Q");
const syndraQ = abilitySubject("syndra", "Q");

describe("ATL-P1-C step 1 — two current-value Leaguecraft Lenses", () => {
  it("adds Ahri Q and Syndra Q with current values and a comparable verdict", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "addLens", subject: syndraQ },
      { type: "compare", a: "lens-1", b: "lens-2" },
    ]);
    const [a, b] = h.present.lenses.map((l) => resolveLens(l, h.present.global));
    expect(a.coverage).toBe("full");
    expect(a.facets.find((f) => f.key === "baseDamage")?.value).toEqual([40, 65, 90, 115, 140]);
    expect(a.notices.some((n) => n.tone === "demo")).toBe(true);
    const cmp = composeComparison(h.present.comparisons[0], a, b);
    expect(cmp.verdict.kind).toBe("comparable");
    if (cmp.verdict.kind === "comparable") {
      expect(cmp.verdict.rows.find((r) => r.key === "baseDamage")?.delta).toEqual([30, 40, 50, 60, 70]);
    }
  });
});

describe("ATL-P1-C step 2 — global context, override, inheritance and divergence", () => {
  it("inherits the global Leaguecraft slot and diverges only through an override", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "addLens", subject: syndraQ },
      { type: "setGlobal", slot: "leaguecraft", context: { kind: "lc-patch", patch: "26.16" } },
      { type: "setOverride", id: "lens-2", context: { kind: "current" } },
    ]);
    const [ahri, syndra] = h.present.lenses;
    const ea = resolveEffectiveContext(ahri, h.present.global);
    const es = resolveEffectiveContext(syndra, h.present.global);
    expect(ea.origin).toBe("global");
    expect(ea.diverges).toBe(false);
    expect(contextKey(ea.context)).toBe("lc-patch:26.16");
    expect(es.origin).toBe("override");
    expect(es.diverges).toBe(true);
    expect(es.explanation).toContain("instead of the global Leaguecraft context");
  });

  it("never shows absolute values at a historical patch, only recorded change evidence", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "setGlobal", slot: "leaguecraft", context: { kind: "lc-patch", patch: "26.16" } },
    ]);
    const view = resolveLens(h.present.lenses[0], h.present.global);
    expect(view.coverage).toBe("unavailable");
    expect(view.source).toBe("lc.patch_archive");
    expect(view.facets.every((f) => f.value === null)).toBe(true);
    expect(view.evidence.map((e) => e.patch)).toEqual(["26.18"]);
    expect(view.notices.some((n) => n.tone === "blocked" && n.text.includes("not recorded"))).toBe(true);
  });

  it("flags provisional ordering for patches after 26.16", () => {
    const h = run([
      { type: "addLens", subject: syndraQ },
      { type: "setOverride", id: "lens-1", context: { kind: "lc-patch", patch: "26.18" } },
    ]);
    const view = resolveLens(h.present.lenses[0], h.present.global);
    expect(view.notices.some((n) => n.tone === "warn" && n.text.includes("after 26.16"))).toBe(true);
  });

  it("blocks a comparison when the two contexts differ", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "addLens", subject: syndraQ },
      { type: "setOverride", id: "lens-2", context: { kind: "lc-patch", patch: "26.16" } },
      { type: "compare", a: "lens-1", b: "lens-2" },
    ]);
    const [a, b] = h.present.lenses.map((l) => resolveLens(l, h.present.global));
    expect(composeComparison(h.present.comparisons[0], a, b).verdict.kind).toBe("blocked");
  });

  it("rejects a Pro selector on a Leaguecraft slot and a Leaguecraft override on a Pro Lens", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "setGlobal", slot: "leaguecraft", context: { kind: "pro-season", season: "2026" } },
      { type: "transformToProChampion", id: "lens-1" },
      { type: "setOverride", id: "lens-1", context: { kind: "lc-patch", patch: "26.16" } },
    ]);
    expect(h.present.global.leaguecraft).toEqual({ kind: "current" });
    expect(h.present.lenses[0].override).toBeNull();
  });

  it("hold freezes the effective context against later global changes", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "holdLens", id: "lens-1", held: true },
      { type: "setGlobal", slot: "leaguecraft", context: { kind: "lc-patch", patch: "26.10" } },
    ]);
    const e = resolveEffectiveContext(h.present.lenses[0], h.present.global);
    expect(e.origin).toBe("held");
    expect(e.context).toEqual({ kind: "current" });
    expect(e.diverges).toBe(true);
    const released = reduceHistory(h, { type: "holdLens", id: "lens-1", held: false });
    expect(resolveEffectiveContext(released.present.lenses[0], released.present.global).origin).toBe("global");
  });
});

describe("ATL-P1-C step 3 — transform to Pro Play at champion level, reversible", () => {
  it("drops the ability facet, records provenance, and reverts exactly", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "transformToProChampion", id: "lens-1" },
    ]);
    const lens = h.present.lenses[0];
    expect(lens.subject).toEqual({ kind: "champion", universe: "pro-play", champion: "ahri" });
    expect(lens.provenance).toHaveLength(1);
    expect(lens.provenance[0].droppedFacets[0]).toContain("ability Q");
    expect(lens.provenance[0].crosswalk.status).toBe("exact");
    const view = resolveLens(lens, h.present.global);
    expect(view.universe).toBe("pro-play");
    expect(view.facets.map((f) => f.key)).toEqual(["games", "winRate", "presence", "goldDiff15"]);
    expect(view.facets.some((f) => f.key.toLowerCase().includes("ability"))).toBe(false);

    const reverted = reduceHistory(h, { type: "revertTransform", id: "lens-1" });
    expect(reverted.present.lenses[0].subject).toEqual(ahriQ);
    expect(reverted.present.lenses[0].provenance).toHaveLength(0);

    const undone = reduceHistory(h, { type: "undo" });
    expect(undone.present.lenses[0].subject).toEqual(ahriQ);
  });

  it("no override survives the transform, and the record says one was cleared", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "setOverride", id: "lens-1", context: { kind: "current" } },
      { type: "transformToProChampion", id: "lens-1" },
    ]);
    expect(h.present.lenses[0].override).toBeNull();
    expect(h.present.lenses[0].provenance[0].clearedContext).toBe(true);
    expect(resolveEffectiveContext(h.present.lenses[0], h.present.global).slot).toBe("proPlay");
    const plain = run([{ type: "addLens", subject: syndraQ }, { type: "transformToProChampion", id: "lens-1" }]);
    expect(plain.present.lenses[0].provenance[0].clearedContext).toBe(false);
  });

  it("never equates a season scope with a calendar year", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "transformToProChampion", id: "lens-1" },
    ]);
    const season = resolveLens(h.present.lenses[0], h.present.global);
    const year = resolveLens(h.present.lenses[0], { ...h.present.global, proPlay: { kind: "calendar-year", year: 2026 } });
    expect(season.facets.find((f) => f.key === "games")?.value).toBe(184);
    expect(year.facets.find((f) => f.key === "games")?.value).toBe(203);
    expect(year.notices.some((n) => n.text.includes("never silently equated"))).toBe(true);
  });

  it("distinguishes not-covered from partial coverage", () => {
    const h = run([
      { type: "addLens", subject: syndraQ },
      { type: "transformToProChampion", id: "lens-1" },
    ]);
    const partial = resolveLens(h.present.lenses[0], h.present.global);
    expect(partial.coverage).toBe("partial");
    expect(partial.facets.find((f) => f.key === "goldDiff15")?.value).toBeNull();
    const missing = resolveLens(h.present.lenses[0], { ...h.present.global, proPlay: { kind: "pro-season", season: "2025" } });
    expect(missing.coverage).toBe("unavailable");
  });
});

describe("ATL-P1-C step 4 — 2×2 matrix and the gated exact matchup", () => {
  it("creates four independent player-on-champion Lenses in one group", () => {
    const h = run([{ type: "addMatrix", players: ["faker", "chovy"], champions: ["ahri", "syndra"] }]);
    expect(h.present.groups).toHaveLength(1);
    expect(h.present.lenses).toHaveLength(4);
    expect(h.present.lenses.every((l) => l.groupId === h.present.groups[0].id)).toBe(true);
    const views = h.present.lenses.map((l) => resolveLens(l, h.present.global));
    expect(views.every((v) => v.notices.some((n) => n.text.includes("Not head-to-head")))).toBe(true);
    const chovySyndra = views.find((v) => v.title === "Chovy on Syndra");
    expect(chovySyndra?.coverage).toBe("empty");
  });

  it("blocks differences between matrix cells because populations differ", () => {
    const h = run([
      { type: "addMatrix", players: ["faker", "chovy"], champions: ["ahri"] },
      { type: "compare", a: "lens-2", b: "lens-3" },
    ]);
    const [a, b] = h.present.lenses.map((l) => resolveLens(l, h.present.global));
    const cmp = composeComparison(h.present.comparisons[0], a, b);
    expect(cmp.verdict.kind).toBe("side-by-side");
    if (cmp.verdict.kind === "side-by-side") {
      expect(cmp.verdict.rows.every((r) => r.delta === null && r.deltaBlockedReason === "populations differ")).toBe(true);
    }
  });

  it("keeps the exact matchup sealed behind a mock owner gate", () => {
    const h = run([{ type: "addLens", subject: exactMatchupSubject({ player: "faker", champion: "ahri" }, { player: "chovy", champion: "syndra" }) }]);
    const view = resolveLens(h.present.lenses[0], h.present.global);
    expect(view.capability).toBe("gated");
    expect(view.coverage).toBe("denied");
    expect(view.fetch).toBe("idle");
    expect(view.gate).toEqual(expect.objectContaining({ route: "/api/pro-play/matchup/exact", requires: "owner", granted: false }));
    expect(view.facets).toHaveLength(0);
  });
});

describe("ATL-P1-C step 5 — pin, clone, clear, restore, undo", () => {
  it("clear keeps pinned Lenses and drops comparisons that lost a side", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "addLens", subject: syndraQ },
      { type: "pinLens", id: "lens-1", pinned: true },
      { type: "compare", a: "lens-1", b: "lens-2" },
      { type: "clearUnpinned" },
    ]);
    expect(h.present.lenses.map((l) => l.id)).toEqual(["lens-1"]);
    expect(h.present.comparisons).toHaveLength(0);
    const undone = reduceHistory(h, { type: "undo" });
    expect(undone.present.lenses).toHaveLength(2);
  });

  it("clone sits beside the original and carries provenance but not the pin", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "addLens", subject: syndraQ },
      { type: "pinLens", id: "lens-1", pinned: true },
      { type: "transformToProChampion", id: "lens-1" },
      { type: "cloneLens", id: "lens-1" },
    ]);
    expect(h.present.lenses.map((l) => l.id)).toEqual(["lens-1", "lens-4", "lens-2"]);
    const clone = h.present.lenses[1];
    expect(clone.clonedFrom).toBe("lens-1");
    expect(clone.pinned).toBe(false);
    expect(clone.provenance).toHaveLength(1);
  });

  it("restores every memory-only sample workspace and resolves each Lens", () => {
    for (const snap of SAMPLE_SNAPSHOTS) {
      const h = run([{ type: "restore", state: snap.state }]);
      expect(h.present).toBe(snap.state);
      for (const lens of h.present.lenses) {
        expect(() => resolveLens(lens, h.present.global)).not.toThrow();
      }
      expect(snap.order.sort()).toEqual(snap.state.lenses.map((l) => l.id).sort());
    }
  });

  it("undo and redo walk the semantic history; no-op actions do not push history", () => {
    const h = run([
      { type: "addLens", subject: ahriQ },
      { type: "pinLens", id: "lens-1", pinned: true },
      { type: "pinLens", id: "lens-1", pinned: true },
    ]);
    expect(h.past).toHaveLength(2);
    const undone = reduceHistory(h, { type: "undo" });
    expect(undone.present.lenses[0].pinned).toBe(false);
    const redone = reduceHistory(undone, { type: "redo" });
    expect(redone.present.lenses[0].pinned).toBe(true);
  });
});

describe("visual state never touches semantic state", () => {
  it("reorders, collapses, expands and focuses without a semantic reducer in sight", () => {
    let v: VisualState = reduceVisual(EMPTY_VISUAL, { type: "syncLenses", ids: ["lens-1", "lens-2", "lens-3"] });
    expect(v.focusId).toBe("lens-3");
    v = reduceVisual(v, { type: "moveBy", id: "lens-3", delta: -2 });
    expect(v.order).toEqual(["lens-3", "lens-1", "lens-2"]);
    v = reduceVisual(v, { type: "toggleExpand", id: "lens-1" });
    v = reduceVisual(v, { type: "toggleCollapse", id: "lens-1" });
    expect(v.expanded["lens-1"]).toBeUndefined();
    expect(v.collapsed["lens-1"]).toBe(true);
    v = reduceVisual(v, { type: "trayToggle", id: "lens-1" });
    v = reduceVisual(v, { type: "trayToggle", id: "lens-2" });
    v = reduceVisual(v, { type: "trayToggle", id: "lens-3" });
    expect(v.compareTray).toEqual(["lens-2", "lens-3"]);
    v = reduceVisual(v, { type: "syncLenses", ids: ["lens-1", "lens-2"] });
    expect(v.order).toEqual(["lens-1", "lens-2"]);
    expect(v.compareTray).toEqual(["lens-2"]);
  });

  it("a semantic state object is structurally untouched by any visual action", () => {
    const semantic = reduceWorkspace(EMPTY_WORKSPACE, { type: "addLens", subject: ahriQ });
    const frozen = JSON.stringify(semantic);
    let v = reduceVisual(EMPTY_VISUAL, { type: "syncLenses", ids: semantic.lenses.map((l) => l.id) });
    v = reduceVisual(v, { type: "focus", id: "lens-1" });
    v = reduceVisual(v, { type: "lift", id: "lens-1" });
    expect(JSON.stringify(semantic)).toBe(frozen);
  });
});
