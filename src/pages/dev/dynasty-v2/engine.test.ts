import { describe, expect, it } from "vitest";
import { ORGS, ROLES, SEASON, STAGES } from "./fixtures";
import { OBJECTIVES, ladderFor, objectiveOutcome } from "./objectives";
import {
  applyPrep, applySmallEvents, autoPicks, baronQualified, beginGame, finishGame, finishSeries, labelFor,
  newRun, planStage, playGameScripted, previewSigning, readComposition, recruitOffers, resolveObjective,
  scoreStage, signPlayer, startSeries, type Run,
} from "./engine";

function freshRun(seed = "t1", nodeIdx = 0): Run {
  const org = ORGS[0];
  let r = newRun(seed, org, [org.starCandidates[0].id, org.starCandidates[1].id]);
  r.nodeIdx = nodeIdx;
  r = startSeries(r);
  return r;
}

describe("labels and objective outcomes", () => {
  it("maps seven-point scores to five states", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(labelFor)).toEqual(["Losing", "Losing", "Kinda losing", "Even", "Even", "Kinda winning", "Winning", "Winning"]);
  });
  it("Baron: 3 closes only when a closeout was offered; 0/1/2 never do", () => {
    expect(objectiveOutcome("baron", 3, { closeoutOffered: true }).closeout).toBe(true);
    expect(objectiveOutcome("baron", 3, { closeoutOffered: false }).closeout).toBe(false);
    for (const c of [0, 1, 2]) expect(objectiveOutcome("baron", c, { closeoutOffered: true }).closeout).toBe(false);
    const leads = [0, 1, 2, 3].map((c) => objectiveOutcome("baron", c, { closeoutOffered: false }).effects.find((e) => e.kind === "lead")?.amount);
    expect(leads).toEqual([-2, 1, 2, 3]);
    expect(objectiveOutcome("baron", 1).tone).toBe("mixed");
  });
  it("Elder and Dragon never close a game", () => {
    for (const c of [0, 1, 2, 3]) expect(objectiveOutcome("elder", c, { closeoutOffered: true }).closeout).toBe(false);
    for (const c of [0, 1]) expect(objectiveOutcome("dragon", c, { closeoutOffered: true }).closeout).toBe(false);
    expect(ladderFor("baron", true)).toHaveLength(4);
    expect(ladderFor("dragon", false)).toHaveLength(2);
    expect(OBJECTIVES.dragon.questions).toBe(1);
  });
});

describe("stage scoring", () => {
  it("every stage is exactly 7 points: 5 lanes + a 2-point team contest, never tied", () => {
    for (let i = 0; i < 40; i++) {
      const run = freshRun(`s${i}`);
      let g = beginGame(run, autoPicks(run));
      for (const st of STAGES) {
        const scored = scoreStage(run, g, st);
        g = { ...scored.game, over: false };
        const { result } = scored;
        expect(result.ours + result.theirs).toBe(7);
        expect(result.ours).not.toBe(result.theirs);
        expect(result.lanes.filter((l) => l.won).length + (result.team.won ? 2 : 0)).toBe(result.ours);
      }
    }
  });
  it("is reproducible for a seed and varies across seeds", () => {
    const a = playGameScripted(freshRun("same"), autoPicks(freshRun("same")), () => 2);
    const b = playGameScripted(freshRun("same"), autoPicks(freshRun("same")), () => 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const sigs = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(playGameScripted(freshRun(`v${i}`), autoPicks(freshRun(`v${i}`)), () => 2).ledger.map((l) => l.title))));
    expect(sigs.size).toBeGreaterThan(8);
  });
});

describe("game flow rules over many seeds", () => {
  const games = Array.from({ length: 300 }, (_, i) => {
    const run = freshRun(`g${i}`, i % 8);
    return { run, g: playGameScripted(run, autoPicks(run), () => i % 4) };
  });
  it("keeps event budgets in every reached stage", () => {
    for (const { g } of games) {
      for (const st of g.stages.map((s) => s.stage)) {
        const small = g.ledger.filter((l) => l.stage === st && l.kind === "small").length;
        const major = g.ledger.filter((l) => l.stage === st && l.kind === "major").length;
        expect(small).toBeGreaterThanOrEqual(1);
        expect(small).toBeLessThanOrEqual(2);
        if (st === "early") expect(major).toBe(1);
        if (st === "mid") expect(major).toBeLessThanOrEqual(1);
        if (st === "late") { expect(major).toBeGreaterThanOrEqual(1); expect(major).toBeLessThanOrEqual(2); }
      }
    }
  });
  it("generates no Late events and no Late stage after a Mid closeout", () => {
    const closed = games.filter(({ g }) => g.endedAt === "mid");
    expect(closed.length).toBeGreaterThan(0);
    for (const { g } of closed) {
      expect(g.stages.map((s) => s.stage)).toEqual(["early", "mid"]);
      expect(g.ledger.some((l) => l.stage === "late")).toBe(false);
      expect(g.plans.late).toBeUndefined();
    }
  });
  it("closes at Mid only on Winning+Winning (either side) or a legal Baron 3/3", () => {
    for (const { g } of games.filter(({ g }) => g.endedAt === "mid")) {
      const [e, m] = g.stages;
      const dbl = (e.label === "Winning" && m.label === "Winning") || (e.label === "Losing" && m.label === "Losing");
      const baron = g.ledger.some((l) => l.title.includes("Game won at Mid"));
      expect(dbl || baron).toBe(true);
    }
  });
  it("Late always decides with 4+ points and never ties", () => {
    const late = games.filter(({ g }) => g.endedAt === "late");
    expect(late.length).toBeGreaterThan(20);
    for (const { g } of late) {
      expect(g.stages).toHaveLength(3);
      expect(g.won).toBe(g.stages[2].ours >= 4);
    }
  });
  it("never closes at Mid after Kinda winning alone", () => {
    for (const { g } of games) {
      const [e, m] = g.stages;
      if (g.reason.startsWith("Closeout: Winning")) {
        expect(e.label).toBe("Winning");
        expect(m.label).toBe("Winning");
      }
    }
  });
  it("Elder is offered only when Late is tight and never ends the game", () => {
    for (const { g } of games.filter(({ g }) => g.plans.late)) {
      expect(["elder", "teamfight"]).toContain(g.plans.late!.major);
    }
    const elder = games.filter(({ g }) => g.ledger.some((l) => l.title.startsWith("Elder Dragon")));
    expect(elder.length).toBeGreaterThan(0);
    for (const { g } of elder) expect(g.endedAt).toBe("late");
  });
  it("win rate is plausible, not scripted", () => {
    const wins = games.filter(({ g }) => g.won).length / games.length;
    expect(wins).toBeGreaterThan(0.3);
    expect(wins).toBeLessThan(0.9);
  });
});

describe("rare champion event", () => {
  it("needs the rare champion on top AND an Early lead with a Top win", () => {
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      const run = freshRun(`r${i}`);
      const picks = { ...autoPicks(run), top: "SynChamp-02" };
      const g = playGameScripted(run, picks, () => 2);
      const rare = g.ledger.find((l) => l.rare);
      if (rare) {
        seen++;
        const early = g.stages[0];
        expect(["Kinda winning", "Winning"]).toContain(early.label);
        expect(early.lanes.find((l) => l.role === "top")!.won).toBe(true);
        expect(rare.effects.some((e) => e.kind === "trait")).toBe(true);
      }
      expect(playGameScripted(run, autoPicks(run), () => 2).ledger.some((l) => l.rare)).toBe(false);
    }
    expect(seen).toBeGreaterThan(3);
  });
});

describe("post-game, series, prep, recruitment", () => {
  it("changes players differently and the Overconfident trait expires after the next game", () => {
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      const run = freshRun(`o${i}`);
      const picks = { ...autoPicks(run), top: "SynChamp-02" };
      const g = playGameScripted(run, picks, () => 2);
      if (!g.ledger.some((l) => l.rare)) continue;
      found = true;
      const { run: after, summary } = finishGame(run, g);
      expect(after.starters.top.traits).toContain("Overconfident");
      expect(new Set(summary.deltas.map((d) => d.confAfter - d.confBefore)).size).toBeGreaterThan(1);
      const g2 = beginGame(after, autoPicks({ ...after, series: { ...after.series!, used: [] } } as Run));
      expect(g2.overconfidentAtStart).toContain(after.starters.top.id);
      const { run: after2 } = finishGame(after, { ...g2, stages: g.stages, won: true, endedAt: "late", reason: "x" });
      expect(after2.starters.top.traits).not.toContain("Overconfident");
    }
    expect(found).toBe(true);
  });
  it("clamps Confidence 1..5 and Fatigue 0..5 and Fearless removes used champions", () => {
    const run = freshRun("cl");
    for (const r of ROLES) { run.starters[r].conf = 5; run.starters[r].fatigue = 5; }
    const g = playGameScripted(run, autoPicks(run), () => 3);
    const out = finishGame(run, g);
    for (const r of ROLES) {
      expect(out.run.starters[r].conf).toBeLessThanOrEqual(5);
      expect(out.run.starters[r].fatigue).toBeLessThanOrEqual(5);
    }
    const next = autoPicks(out.run);
    for (const r of ROLES) expect(next[r]).not.toBe(g.picks[r]);
  });
  it("prep previews deltas, applies diminishing returns and scouting without mutating input", () => {
    const run = freshRun("p");
    const star = run.starters.mid;
    const a = applyPrep(run, [{ id: "solo", playerId: star.id }, { id: "vod" }]);
    expect(a.scoutDelta).toBe(1);
    expect(a.changes.find((c) => c.id === star.id)!.fatigueDelta).toBe(1);
    const b = applyPrep(a.run, [{ id: "solo", playerId: star.id }]);
    expect(b.notes.join(" ")).toMatch(/reduced/);
    expect(run.series!.scoutTier).toBe(1);
  });
  it("signing shows who is displaced and moves them to the bench", () => {
    const run = freshRun("sg");
    const offer = recruitOffers(run)[0];
    const prev = previewSigning(run, offer);
    const after = signPlayer(run, offer);
    expect(after.starters[offer.role].id).toBe(offer.id);
    expect(after.bench.map((b) => b.id)).toContain(prev.displaced.id);
    expect(after.starters[offer.role].traits).toContain("Honeymoon");
    expect(after.cohesion).toBeLessThanOrEqual(run.cohesion);
  });
  it("composition readout reports bounded strengths and warnings", () => {
    const run = freshRun("c");
    const ro = readComposition(Object.values(autoPicks(run)), ["Early tempo"]);
    expect(ro.strengths.length).toBeLessThanOrEqual(2);
    expect(ro.warnings.length).toBeLessThanOrEqual(2);
  });
  it("a BO5 ends at three wins and elimination applies only after the regular season", () => {
    let run = freshRun("se", 4);
    run.series!.wins = 3;
    expect(finishSeries(run).nodeIdx).toBe(5);
    run = freshRun("se2", 4);
    run.series!.losses = 3;
    expect(finishSeries(run).alive).toBe(false);
    run = freshRun("se3", 1);
    run.series!.losses = 3;
    expect(finishSeries(run).alive).toBe(true);
    expect(SEASON).toHaveLength(8);
  });
  it("Baron is not offered before Mid is scored, and a 3/3 closeout ends the game", () => {
    const run = freshRun("b");
    const g = beginGame(run, autoPicks(run));
    expect(baronQualified(g)).toBe(false);
    expect(applySmallEvents(g, "early", planStage(run, g, "early")).plans.early).toBeDefined();
    expect(resolveObjective(g, "mid", "baron", 3, true).game.over).toBe(true);
  });
});
