/**
 * GM1-R1 — RECONSTRUCT IN THE REAL RANKED HOST, FROM REAL BACKEND BODIES.
 *
 * The REAL `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` +
 * `reconstructModule` + `Reconstruct`, fed the bodies the backend served for
 * segment 2 of one admin `admin.reconstruct` bot match
 * (`reconstructServerCapture.json`, from `test_reconstruct_wire_contract.py`).
 * In that segment the bot is driven inline, as deployed: it has already locked,
 * so the viewer's lock POST settles the segment and opens round 3 in one
 * transaction. The only copy of the viewer's reveal is the lock response's
 * inline `challenge_reveal`.
 *
 * Proves: open → placed → locked through the real shell, the request carries
 * `{placement}`, nothing reveal-only is on screen before the lock, the reveal
 * lands from the inline ack (marks, settled sockets, recipe, figures), the
 * module owns the result (no generic stamp), and a refused lock reopens.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
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
const RIGHT = C.meta.submitted_placement_segment_2 as string[];
const REVEAL = C.submit_accepted_bot_settled.challenge_reveal as {
  canonical_parts: { piece_id: string; label: string; value_display: string }[];
  target: { total_display: string; combine_display: string };
  slot_correct: boolean[];
};
/** Every reveal-only string the server sent for this segment. */
const SECRETS = [
  ...REVEAL.canonical_parts.map((p) => p.value_display),
  REVEAL.target.total_display, `${REVEAL.target.combine_display} to combine`,
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Backend { post: "accept" | "refuse"; locked: boolean; bodies: unknown[] }
let backend: Backend;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(C.public_before_bot_lock.server_time) + 1000));
  backend = { post: "accept", locked: false, bodies: [] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: MID,
        round_number: 2, server_time: C.public_before_bot_lock.server_time,
        payload: { match_status: "active", match_over: false, public: C.public_before_bot_lock,
          private: C.private_before_bot_lock, latest_resolved_round: null, result: null },
      });
    }
    if (/\/rounds\/2\/resolved$/.test(u)) return backend.locked ? json(C.resolved_correct) : json({}, 404);
    if (u.endsWith("/private")) return json(backend.locked ? C.private_after_bot_settled : C.private_before_bot_lock);
    if (u.includes("/presence")) return json({ status: "active", match_id: MID, active: true });
    if (/\/segments\/2\/challenges\/0$/.test(u) && method === "POST") {
      backend.bodies.push(JSON.parse(String(init.body)));
      if (backend.post === "refuse") {
        return json({ detail: { code: "RANKED_INVALID_CHOICE", message: "placement must fill all sockets" } }, 422);
      }
      backend.locked = true;
      return json(C.submit_accepted_bot_settled);
    }
    if (u.endsWith(`/matches/${MID}`) && method === "GET") {
      return json(backend.locked ? C.public_after_bot_lock : C.public_before_bot_lock);
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
  t: number; phase: string | null; stage: string | null; hold: string | null;
  sockets: (string | null)[]; marks: (string | null)[]; verdict: string | null;
  evidence: boolean; stamp: boolean; leaks: boolean;
}
function frame(t0: number): Frame {
  const sockets = [...document.querySelectorAll('[data-part="socket"]')] as HTMLElement[];
  const text = document.body.textContent ?? "";
  return {
    t: Date.now() - t0,
    phase: document.querySelector('[data-testid="reconstruct-phase"]')?.getAttribute("data-phase") ?? null,
    stage: document.querySelector('[data-testid="mig-reconstruct"]')?.getAttribute("data-reveal-stage") ?? null,
    hold: document.querySelector('[data-testid="ranked-match"]')?.getAttribute("data-reveal-hold") ?? null,
    sockets: sockets.map((s) => s.getAttribute("data-token")),
    marks: sockets.map((s) => s.getAttribute("data-mark")),
    verdict: document.querySelector('[data-testid="reconstruct-verdict"]')?.textContent ?? null,
    evidence: !!document.querySelector('[data-testid="reconstruct-evidence"]'),
    stamp: !!document.querySelector('[data-testid="result-stamp-viewer"]'),
    leaks: SECRETS.some((v) => text.includes(v)),
  };
}

async function mountOpen() {
  render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
  for (let i = 0; i < 40 && !document.querySelector('[data-testid="reconstruct-lock"]'); i += 1) await advance(100);
  expect(screen.getByTestId("reconstruct-phase")).toHaveAttribute("data-phase", "open");
}

function build(placement: string[]) {
  placement.forEach((token, slot) => {
    fireEvent.click(screen.getByTestId(`reconstruct-option-${token}`));
    fireEvent.click(screen.getByTestId(`reconstruct-socket-${slot}`));
  });
}

async function lockAndWatch(ms: number, before: Frame[] = []) {
  await mountOpen();
  build(RIGHT);
  for (let i = 0; i < 10; i += 1) { await advance(100); before.push(frame(Date.now())); }
  const t0 = Date.now();
  fireEvent.click(screen.getByTestId("reconstruct-lock"));
  const frames: Frame[] = [];
  for (let t = 0; t < ms; t += 20) { await advance(20); frames.push(frame(t0)); }
  return frames;
}

describe("GM1-R1 — Reconstruct in the real Ranked host, from real backend bodies", () => {
  it("the captured bodies are the bot-inline lifecycle and the pre-lock bodies carry no answer", () => {
    expect(C.submit_accepted_bot_settled.segment_resolved).toBe(true);
    expect(C.public_before_bot_lock.payload.segment_state.opponent_finished).toBe(true);
    expect(C.public_after_bot_lock.payload.active_round.round_number).toBe(3);
    for (const body of [C.public_before_bot_lock, C.private_before_bot_lock]) {
      const blob = JSON.stringify(body);
      expect(blob).not.toContain("canonical_parts");
      for (const s of SECRETS) expect(blob).not.toContain(s);
    }
  });

  it("open → placed → locked sends {placement}; the reveal teaches from the inline ack and owns the result", async () => {
    const before: Frame[] = [];
    const frames = await lockAndWatch(3000, before);
    expect(backend.bodies).toEqual([{ placement: RIGHT }]);
    for (const f of before) {
      expect(f.phase).toBe("open");
      expect(f.sockets).toEqual(RIGHT);
      expect(f.leaks).toBe(false);
      expect(f.marks.every((m) => m === null)).toBe(true);
    }
    const revealed = frames.filter((f) => f.phase === "revealed");
    expect(revealed.length, JSON.stringify(frames.slice(0, 5))).toBeGreaterThan(0);
    const first = revealed[0];
    expect(first.marks).toEqual(REVEAL.slot_correct.map((ok) => (ok ? "right" : "wrong")));
    expect(first.verdict).toBe("Every part right");
    const full = revealed.find((f) => f.evidence)!;
    expect(full).toBeTruthy();
    expect(full.leaks).toBe(true); // the recipe's figures, now legitimately on screen
    for (const f of revealed) expect(f.stamp).toBe(false); // the board is the result
  });

  it("reduced motion: the first revealed frame already carries the recipe", async () => {
    document.documentElement.classList.add("reduce-motion");
    const frames = await lockAndWatch(1500);
    const first = frames.find((f) => f.phase === "revealed")!;
    expect(first.evidence).toBe(true);
    expect(first.stage).toBe("done");
  });

  it("a refused lock installs no reveal and reopens the board as it was", async () => {
    backend.post = "refuse";
    const frames = await lockAndWatch(1500);
    for (const f of frames) { expect(f.phase).not.toBe("revealed"); expect(f.leaks).toBe(false); }
    const last = frames[frames.length - 1];
    expect(last.phase).toBe("open");
    expect(last.sockets).toEqual(RIGHT);
  });
});
