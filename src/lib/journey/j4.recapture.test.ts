/**
 * JOURNEY-UI3 — the R1-RECONCILED catalog (backend JOURNEY4 `journey4/catalog-reconcile`
 * @ a273a216), recaptured with the same harness (`__fixtures__/j4/CAPTURE.md`).
 *
 * J4 changed the five launch recipes (ids, children, transitions, values) and
 * nothing in the public contract. These are the contract-level invariants the
 * J3 captures are held to, over every J4 snapshot: the production parser reads
 * it, no gold anywhere, the adapter builds a board, no reached child's answer
 * is a board value before its reveal, a beat is only ever the server's.
 * (The content-specific assertions stay on the J3 captures.)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { adaptJourneyJ3 } from "./adapter";
import type { CaptureSnapshot } from "./realFixtures";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j4");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const answers = (n: string): { correct_answer: unknown }[] =>
  JSON.parse(readFileSync(join(DIR, "answers", `${n}.answers.json`), "utf8"));
type Wire = Record<string, unknown>;
const hasKey = (node: unknown, key: string): boolean => {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((v) => hasKey(v, key));
  return Object.entries(node as Wire).some(([k, v]) => k === key || hasKey(v, key));
};

describe("J4 recapture: the reconciled launch recipes on the J3 contract", () => {
  it("covers the five R1 recipes in both plans, a strike-out and an exhaustion", () => {
    expect(FILES).toHaveLength(12);
    const ids = new Set<string>();
    for (const n of FILES) for (const s of load(n)) {
      const j = (((s.envelope.payload as Wire).segment_state as Wire | null)?.challenges as Wire | undefined)?.journey as Wire | undefined;
      if (j) ids.add(String(j.recipe_id));
    }
    expect([...ids].sort()).toEqual(["bot.lucian_vs_caitlyn", "jungle.volibear_vs_leesin", "mid.zed_vs_ahri",
      "support.pantheon_vs_leona", "top.olaf_vs_sett"]);
  });

  it.each(FILES)("%s: parses, carries no gold, adapts, and never shows an unrevealed answer", (name) => {
    const ans = answers(name);
    let boards = 0;
    for (const s of load(name)) {
      for (const key of ["cost", "price", "gold"]) expect(hasKey(s.envelope, key), `${s.label} ${key}`).toBe(false);
      const seg = readPublicRound(s.envelope).segmentState;
      if (!seg?.journey || seg.journey.children.length === 0) continue;
      const v = adaptJourneyJ3(seg.journey, {
        ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished,
      })!;
      boards += 1;
      expect(v.board.contract).toBe("journey_public_state.v1");
      // A beat is live only with the server's own open instant, and only while its child is unexposed.
      if (v.board.transition?.beat.until) {
        expect(v.pendingChildIndex).not.toBeNull();
        expect(v.board.transition.beat.until).toBe(seg.ownCardStartedAt);
      }
      const revealed = new Set(seg.ownChallengeReveals.map((r) => r.challengeIndex));
      const values = v.board.sides.flatMap((x) => x.stats.map((st) => st.value)).filter((x) => x !== null);
      for (const c of seg.journey.children) {
        if (revealed.has(c.index)) continue;
        const a = Number(ans[c.index].correct_answer);
        if (Number.isFinite(a)) expect(values, `${s.label} child ${c.index}`).not.toContain(a);
      }
    }
    expect(boards).toBeGreaterThan(0);
  });

  it("two transitions before ONE child (J4 J-A child 5: level + purchase) play as ONE beat of their summed length", () => {
    const s = load("voli.standard").find((x) => x.label === "child4-beat")!;
    const seg = readPublicRound(s.envelope).segmentState!;
    expect(seg.journey!.transitions.filter((t) => t.beforeChild === 4).map((t) => t.kind)).toEqual(["level", "purchase"]);
    const v = adaptJourneyJ3(seg.journey!, {
      ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished,
    })!;
    expect(v.pendingChildIndex).toBe(4);
    expect(v.board.transition!.beat).toEqual({ ms: 3500, until: seg.ownCardStartedAt });
    const kinds = v.board.transition!.events.map((e) => e.kind);
    expect(kinds).toContain("level");
    expect(kinds).toContain("purchase");
    expect(v.board.sides.map((x) => x.level)).toEqual([6, 6]);
  });
});
