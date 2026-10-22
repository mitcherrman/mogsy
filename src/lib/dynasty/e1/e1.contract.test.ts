/**
 * UX-3 — the recorded fixture is genuine E1 snapshot output and keeps the
 * contract the UI relies on. If the backend schema moves, these fail first.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { E1_SNAPSHOT_SCHEMA, type E1Snapshot } from "./contracts";
import { BO5_FIXTURE } from "./fixtureServer";
import { FRAME_CODEC, decodeFrames } from "./frames";

function allPaths() {
  const out: { name: string; frames: E1Snapshot[] }[] = [];
  for (const g of BO5_FIXTURE.games) {
    for (const [lineup, p] of Object.entries(g.options)) {
      const base = decodeFrames(p.frames);
      if (!p.encounter) out.push({ name: `g${g.index}/${lineup}`, frames: base });
      else for (const [n, b] of Object.entries(p.encounter.branches)) out.push({ name: `g${g.index}/${lineup}/${n}`, frames: [...base, ...decodeFrames(b, base[base.length - 1])] });
    }
  }
  return out;
}
const PATHS = allPaths();
const FORBIDDEN = ["plan", "reservations", "pending_choice", "sums", "rank_key", "post_fallback", "rejections", "seed"];

describe("UX-3 fixture provenance", () => {
  it("is recorded E1 output under the documented schema and codec", () => {
    expect(BO5_FIXTURE.schema).toBe("mogzy.dynasty.ux3.bo5_fixture.v1");
    expect(BO5_FIXTURE.frame_codec).toBe(FRAME_CODEC);
    expect(BO5_FIXTURE.source.e1_commit).toBe("786dc81b");
    expect(BO5_FIXTURE.policy.policy_id).toBe("narrow_early_mid_combo");
    expect(BO5_FIXTURE.games).toHaveLength(5);
    expect(BO5_FIXTURE.lineups.map((l) => l.lineup_id)).toEqual(["early", "scaling", "balanced"]);
    for (const p of PATHS) for (const f of p.frames) {
      expect(f.schema).toBe(E1_SNAPSHOT_SCHEMA);
      expect(f.provenance).toBe("simulated_event");
      expect(f.pins.qualification_policy).toBe("narrow_early_mid_combo");
    }
  });

  it("serves exactly one transition per frame and settles once, at the end", () => {
    for (const { name, frames } of PATHS) {
      frames.forEach((f, i) => {
        expect(f.seq, name).toBe(i);
        expect(f.beats, name).toHaveLength(i);
        if (i) expect(f.beats.slice(0, -1), name).toEqual(frames[i - 1].beats);
      });
      const last = frames[frames.length - 1];
      expect(last.phase, name).toBe("settled");
      expect(last.settlement, name).not.toBeNull();
      // E1 publishes the settlement with the deciding tally; it never changes afterwards.
      const first = frames.findIndex((f) => f.settlement !== null);
      expect(frames[first].beats[frames[first].beats.length - 1].beat, name).toMatch(/^(stage_tally|objective_result)$/);
      expect(frames.slice(first).every((f) => JSON.stringify(f.settlement) === JSON.stringify(last.settlement)), name).toBe(true);
      expect(frames.slice(0, -1).every((f) => f.phase !== "settled"), name).toBe(true);
    }
  });

  it("scores seven points per stage: five 1-point role contests plus a 2-point composition contest", () => {
    for (const { name, frames } of PATHS) for (const t of frames[frames.length - 1].stages) {
      expect(t.you_points + t.opponent_points, name).toBe(7);
      const pos = t.contests.filter((c) => c.kind === "positional");
      const team = t.contests.filter((c) => c.kind === "team");
      expect(pos.map((c) => c.role).sort(), name).toEqual(["bot", "jng", "mid", "sup", "top"]);
      expect(pos.every((c) => c.points === 1), name).toBe(true);
      expect(team, name).toHaveLength(1);
      expect(team[0].points, name).toBe(2);
      const you = t.contests.filter((c) => c.winner === "you").reduce((a, c) => a + c.points, 0);
      expect(you, name).toBe(t.you_points);
      expect(t.outcome_label === null, name).toBe(t.stage === "late");
    }
  });

  it("keeps the approved bands and closeout rules", () => {
    const band = (n: number) => (n <= 1 ? "Losing" : n === 2 ? "Kinda losing" : n <= 4 ? "Even" : n === 5 ? "Kinda winning" : "Winning");
    for (const { name, frames } of PATHS) {
      const last = frames[frames.length - 1];
      for (const t of last.stages) if (t.stage !== "late") expect(t.outcome_label, name).toBe(band(t.you_points));
      const st = last.settlement!;
      const late = last.stages.find((t) => t.stage === "late");
      if (st.how === "late_decides") { expect(late, name).toBeDefined(); expect(st.winner, name).toBe(late!.winner); }
      else expect(late, name).toBeUndefined();
      if (st.how === "double_winning_closeout") {
        const [e, m] = last.stages;
        expect([e.outcome_label, m.outcome_label].every((l) => l === (st.winner === "you" ? "Winning" : "Losing")), name).toBe(true);
      }
      if (st.how === "objective_closeout") expect(last.events.find((x) => x.outcome.correct_count === 3)?.outcome.category, name).toBe("baron_ace_closeout");
    }
  });

  it("offers a three-question Baron only when the server qualifies it, never after every Mid", () => {
    const prompts = PATHS.flatMap((p) => p.frames.filter((f) => f.phase === "awaiting_objective"));
    const mids = PATHS.filter((p) => p.frames[p.frames.length - 1].stages.some((t) => t.stage === "mid"));
    expect(prompts.length).toBeGreaterThan(0);
    expect(new Set(prompts.map((f) => f.objective!.encounter_id)).size).toBeLessThan(mids.length);
    for (const f of prompts) {
      expect(f.objective!.encounter_kind).toBe("baron_three_question");
      expect(f.objective!.questions).toBeNull();
      expect(f.objective!.outcomes.map((o) => o.correct_count)).toEqual([3, 2, 1, 0]);
      expect(f.objective!.outcomes.filter((o) => o.ends_game).map((o) => o.correct_count)).toEqual([3]);
      expect(f.next).toEqual({ can_advance: false, needs: "objective_answer" });
    }
  });

  it("never sends hidden director state or a seed", () => {
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { expect(FORBIDDEN, `${path}.${k}`).not.toContain(k); walk(x, `${path}.${k}`); }
    };
    for (const p of PATHS) walk(p.frames[p.frames.length - 1], p.name);
  });

  it("has no Dragon, Elder or Soul question encounters (prototype-only until backend support)", () => {
    for (const p of PATHS) for (const e of p.frames[p.frames.length - 1].events) {
      if (/dragon|elder|soul/i.test(e.event_id)) expect(e.resolution).not.toBe("objective");
    }
  });
});

describe("UX-3 source guard", () => {
  it("no UI module imports the contract double's answer key", () => {
    const root = join(process.cwd(), "src", "pages", "dev", "dynasty-v2");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p); } };
    walk(root);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/__placeholderAnswerForTests|PLACEHOLDER_QUESTIONS/);
  });
});
