/**
 * JOURNEY-UI2 → UI3 — the superseded J2 wire, ISOLATED.
 *
 * J2 (`journey2/core` @ 52e9d929) is no longer on any gameplay path: J3
 * replaced it, and the production parser now refuses a J2 block outright (see
 * `j3.adapter.test.ts`). The J2 reader and adapter are kept beside J3's as a
 * legacy reference, exercised here against ONE real J2 capture read DIRECTLY
 * (never through `readPublicRound`, which would — correctly — reject it).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { adaptJourneyJ2, type JourneyCursor } from "./adapter";
import { readJourneyJ2 } from "./j2";
import type { CaptureSnapshot } from "./realFixtures";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j2");
const all: CaptureSnapshot[] = JSON.parse(readFileSync(join(DIR, "olaf.standard.v2.json"), "utf8"));
const snap = (label: string) => {
  const s = all.find((x) => x.label === label);
  if (!s) throw new Error(`no ${label}`);
  return s;
};
type Wire = Record<string, unknown>;
const seg = (s: CaptureSnapshot) => (s.envelope.payload as Wire).segment_state as Wire;
const raw = (s: CaptureSnapshot) => (seg(s).challenges as Wire).journey as Wire;
const cursor = (s: CaptureSnapshot): JourneyCursor => ({
  ownNextChallengeIndex: seg(s).own_next_challenge_index as number,
  ownCardStartedAt: (seg(s).own_card_started_at as string | null) ?? null,
  ownFinished: seg(s).own_finished === true,
});
const view = (s: CaptureSnapshot) => adaptJourneyJ2(readJourneyJ2(raw(s)), cursor(s));

describe("the J2 wire is no longer a production contract", () => {
  it("the production parser refuses every J2 envelope that carries a Journey block", () => {
    for (const s of all.filter((x) => raw(x))) {
      expect(() => readPublicRound(s.envelope), s.label).toThrow(/journey_public_state\.v1|hidden field: cost/);
    }
  });

  it("J2's purchase narration carried gold (`cost`) — the defect J3 removed", () => {
    expect(JSON.stringify(raw(snap("child3-beat")))).toContain('"cost":1050');
  });
});

describe("the isolated J2 reader + adapter still read their own wire", () => {
  it("the beat board applies J2's lossless changes; the view model carries NO gold", () => {
    const s = snap("child3-beat");
    const v = view(s)!;
    expect(v.pendingChildIndex).toBe(3);
    expect(v.board.transition!.beat.until).toBe(seg(s).own_card_started_at);
    expect(v.board.transition!.events).toEqual([{
      kind: "purchase", side: "subject", group: "recall",
      items: [{ slot: 0, itemId: 3133, name: "Caulfield's Warhammer" }],
    }]);
    expect(JSON.stringify(v)).not.toMatch(/cost|1050/);
  });

  it("a Matchup child focuses both sides' ability", () => {
    const v = view(snap("child1-open"))!;
    expect(v.board.focus.refs).toEqual([
      { side: "subject", kind: "ability", key: "R" }, { side: "opponent", kind: "ability", key: "R" }]);
  });

  it("the J2 reader rejects a future child slipped into the prefix out of order", () => {
    const j = JSON.parse(JSON.stringify(raw(snap("child1-open")))) as Wire;
    (j.children as Wire[])[1].index = 4;
    expect(() => readJourneyJ2(j)).toThrow(/contiguous reached prefix/);
  });
});
