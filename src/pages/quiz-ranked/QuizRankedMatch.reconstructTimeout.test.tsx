/**
 * RECONSTRUCT-R3C — A TIMED-OUT PLAYER IS TAUGHT THE RECIPE, AFTER SETTLEMENT.
 *
 * The REAL `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` +
 * `reconstructModule` + `Reconstruct`, fed the bodies the backend served for
 * segment 3 of one admin `admin.reconstruct` bot match
 * (`reconstructServerCapture.json`, `test_reconstruct_wire_contract.py`): the
 * bot locked a wrong build, the viewer locked NOTHING, and the deadline settled
 * the final round as the viewer's timeout (0 points), ending the match.
 *
 * Before R3C the board stayed empty under a generic TIMED OUT stamp for the
 * whole 4 s hold. Now, once the server has settled the round, the board draws
 * the canonical recipe as the ANSWER (never as the viewer's picks), the
 * breakdown explains it, the verdict says TIMED OUT, and the hold, outro and
 * end screen follow exactly as for any final round.
 *
 * Secrecy: nothing reveal-only is on screen before the server says the round
 * is settled (the resolved round 404s until then), and the opponent's build
 * (its wrong parts) never reaches the viewer's board.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import capture from "@/lib/ranked-public/__fixtures__/reconstructServerCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER = C.meta.viewer_user_id as string;
const MID = C.queue_join.payload.match_id as string;
const OPEN = C.public_after_bot_lock;          // round 3, open, bot already locked
const DEADLINE = Date.parse(OPEN.payload.active_round.active_deadline);
const SETTLED = C.resolved_timeout;            // round 3's resolved projection
const REVEAL = SETTLED.payload.segment_reveal as {
  canonical_parts: { piece_id: string; quantity: number; value_display: string }[];
  target: { total_display: string; base_display: string };
  players: Record<string, { placement: string[] | null; segment_result: string }>;
};
const BOT = Object.keys(REVEAL.players).find((id) => id !== VIEWER)!;
/** The recipe, one socket per copy, in the server's order. */
const ANSWER = REVEAL.canonical_parts.flatMap((p) => Array(p.quantity).fill(p.piece_id) as string[]);
/** The bot's wrong parts: tokens it locked that the recipe does not use. */
const BOT_WRONG = (REVEAL.players[BOT].placement ?? []).filter((t) => !ANSWER.includes(t));
/** Every reveal-only string the server sent for this segment. */
const SECRETS = [
  ...REVEAL.canonical_parts.map((p) => p.value_display),
  REVEAL.target.total_display, REVEAL.target.base_display,
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let resolvedFetchedAt: number | null;

beforeEach(() => {
  vi.useFakeTimers();
  // Twenty seconds into the final round: ten left on the clock.
  vi.setSystemTime(new Date(DEADLINE - 10_000));
  resolvedFetchedAt = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    const expired = Date.now() >= DEADLINE;
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: MID,
        round_number: 3, server_time: new Date().toISOString(),
        payload: { match_status: "active", match_over: false, public: OPEN,
          private: C.private_after_bot_settled, latest_resolved_round: null, result: null },
      });
    }
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      // The backend refuses a resolved projection for an unsettled round.
      if (resolved[1] !== "3" || !expired) return json({}, 404);
      resolvedFetchedAt ??= Date.now();
      return json(SETTLED);
    }
    if (u.endsWith("/result")) return expired ? json(C.result) : json({}, 404);
    if (u.endsWith("/review")) return json(C.review);
    if (u.endsWith("/private")) {
      return json(expired ? C.resume_final.payload.private : C.private_after_bot_settled);
    }
    if (u.includes("/presence")) return json({ status: "active", match_id: MID, active: !expired });
    if (u.endsWith(`/matches/${MID}`)) {
      return json(expired ? C.resume_final.payload.public : OPEN);
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  document.documentElement.classList.remove("reduce-motion");
});

const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

interface Frame {
  t: number; phase: string | null; timedOut: boolean; stage: string | null;
  sockets: (string | null)[]; states: (string | null)[]; marks: (string | null)[];
  picks: number; verdict: string | null; evidence: boolean; notes: number;
  stamp: boolean; leaks: boolean; outro: boolean; end: boolean; progress: string | null;
}
function frame(): Frame {
  const sockets = [...document.querySelectorAll('[data-part="socket"]')] as HTMLElement[];
  const text = document.body.textContent ?? "";
  return {
    t: Date.now(),
    phase: document.querySelector('[data-testid="reconstruct-phase"]')?.getAttribute("data-phase") ?? null,
    timedOut: document.querySelector('[data-testid="mig-reconstruct"]')?.getAttribute("data-timed-out") === "true",
    stage: document.querySelector('[data-testid="mig-reconstruct"]')?.getAttribute("data-reveal-stage") ?? null,
    sockets: sockets.map((s) => s.getAttribute("data-token")),
    states: sockets.map((s) => s.getAttribute("data-state")),
    marks: sockets.map((s) => s.getAttribute("data-mark")),
    picks: document.querySelectorAll('[data-part="pick"][data-shown="true"]').length,
    verdict: document.querySelector('[data-testid="reconstruct-verdict-text"]')?.textContent ?? null,
    evidence: !!document.querySelector('[data-testid="reconstruct-evidence"]'),
    notes: document.querySelectorAll('[data-part="annotation"]').length,
    stamp: !!document.querySelector('[data-testid="result-stamp-viewer"]'),
    leaks: SECRETS.some((v) => text.includes(v)),
    outro: !!document.querySelector('[data-testid="ranked-match-outro"]'),
    end: !!document.querySelector('[data-testid="ranked-match-over"]'),
    progress: document.querySelector('[data-testid="reconstruct-opponent-progress"]')?.textContent ?? null,
  };
}

async function playToTheEnd(ms: number): Promise<Frame[]> {
  render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
  for (let i = 0; i < 40 && !document.querySelector('[data-testid="reconstruct-lock"]'); i += 1) await advance(100);
  const frames: Frame[] = [];
  for (let t = 0; t < ms; t += 50) { await advance(50); frames.push(frame()); }
  return frames;
}

describe("RECONSTRUCT-R3C — the timed-out player sees the recipe after settlement", () => {
  it("the capture is the shape under test: viewer timed out, bot locked a wrong build, final round", () => {
    expect(REVEAL.players[VIEWER]).toMatchObject({ placement: null, segment_result: "timeout" });
    expect(REVEAL.players[BOT].placement).not.toEqual(ANSWER);
    expect(BOT_WRONG.length).toBeGreaterThan(0);
    expect(SETTLED.payload.match_over).toBe(true);
    for (const body of [OPEN, C.private_after_bot_settled]) {
      const blob = JSON.stringify(body);
      expect(blob).not.toContain("canonical_parts");
      for (const s of SECRETS) expect(blob).not.toContain(s);
    }
  });

  it("nothing before settlement; then the answer, TIMED OUT, the breakdown, the hold, the outro, the end", async () => {
    const frames = await playToTheEnd(17_000);
    const before = frames.filter((f) => f.t < DEADLINE);
    expect(before.length).toBeGreaterThan(0);
    for (const f of before) {
      expect(f.phase).toBe("open");
      expect(f.timedOut).toBe(false);
      expect(f.leaks).toBe(false);
    }
    // No answer is on screen before the server has served the settled round.
    expect(resolvedFetchedAt).not.toBeNull();
    for (const f of frames.filter((x) => x.t < resolvedFetchedAt!)) expect(f.leaks).toBe(false);

    const revealed = frames.filter((f) => f.phase === "revealed");
    expect(revealed.length, JSON.stringify(frames.slice(-3))).toBeGreaterThan(0);
    for (const f of revealed) {
      expect(f.timedOut).toBe(true);
      expect(f.verdict).toMatch(/Timed out/i);
      // Never drawn as picks: no ✓/✗ marks, no "your pick" badges, no x/n counts.
      expect(f.marks.every((m) => m === null)).toBe(true);
      expect(f.picks).toBe(0);
      expect(f.notes).toBe(0);
      expect(f.stamp).toBe(false);
      // The opponent's build never reaches this board.
      for (const t of BOT_WRONG) expect(f.sockets).not.toContain(t);
      expect(f.progress).toBe("Time ran out before you locked in.");
    }
    const taught = revealed.find((f) => f.stage === "done")!;
    expect(taught).toBeTruthy();
    expect(taught.sockets).toEqual(ANSWER);
    expect(taught.states.every((s) => s === "answer")).toBe(true);
    expect(taught.evidence).toBe(true);
    expect(taught.leaks).toBe(true); // the recipe's figures, now legitimately on screen

    // The final hold (presentation_ms 5400 − 1400) keeps it readable, then the
    // outro covers it, then the end screen — in that order.
    const firstRevealed = revealed[0].t;
    const outroAt = frames.find((f) => f.outro)?.t ?? null;
    const endAt = frames.find((f) => f.end)?.t ?? null;
    expect(outroAt).not.toBeNull();
    expect(endAt).not.toBeNull();
    expect(outroAt! - firstRevealed).toBeGreaterThanOrEqual(3850);
    expect(outroAt! - taught.t).toBeGreaterThanOrEqual(2300);
    expect(endAt!).toBeGreaterThan(outroAt!);
  });

  it("REDUCED MOTION: the first revealed frame is the settled answer with its breakdown", async () => {
    document.documentElement.classList.add("reduce-motion");
    const frames = await playToTheEnd(14_000);
    const first = frames.find((f) => f.phase === "revealed")!;
    expect(first).toBeTruthy();
    expect(first.stage).toBe("done");
    expect(first.timedOut).toBe(true);
    expect(first.sockets).toEqual(ANSWER);
    expect(first.evidence).toBe(true);
    const outroAt = frames.find((f) => f.outro)?.t ?? null;
    expect(outroAt! - first.t).toBeGreaterThanOrEqual(3850);
  });
});
