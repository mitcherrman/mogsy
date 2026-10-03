/**
 * OF4-CONTINUITY — ONE PHYSICAL SCENE FROM THE OPEN BOARD TO THE NEXT ROUND.
 *
 * The real `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` +
 * `orderForgeModule` + `OrderForge`, fed the bodies the real backend served for
 * a wrong Order Forge lock against the inline bot (the OF4-FIX2 capture): the
 * lock POST settles segment 1 and carries the reveal inline, and the next poll
 * is already round 2, another Order Forge segment.
 *
 * jsdom has no layout, so this pins IDENTITY (what must not remount) and the
 * arena's result chrome; the measured geometry (rects every animation frame)
 * is `e2e/ranked-arena-fit.spec.ts` › "OF4-CONTINUITY", which replays the same
 * capture in a real browser through `?q=orderforge&forge=bot`.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { REVEAL_TIMING } from "@/components/interaction-grammar/OrderForge";
import capture from "@/lib/ranked-public/__fixtures__/orderForgeBotLockCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER = C.public_before_lock.payload.players[0].player_id as string;
const MID = C.public_before_lock.match_id as string;
const REVEAL = C.submit.challenge_reveal as { order: string[]; canonical_order: string[] };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let locked = false;
beforeEach(() => {
  locked = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(C.public_before_lock.server_time));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: MID,
        round_number: 1, server_time: C.public_before_lock.server_time,
        payload: { match_status: "active", match_over: false, public: C.public_before_lock,
          private: C.private_before, latest_resolved_round: null, result: null },
      });
    }
    if (/\/rounds\/1\/resolved$/.test(u)) return locked ? json(C.resolved) : json({}, 404);
    if (u.endsWith("/private")) return json(locked ? C.private_after : C.private_before);
    if (u.includes("/presence")) return json({ status: "active", match_id: MID, active: true });
    if (/\/segments\/1\/challenges\/0$/.test(u) && method === "POST") { locked = true; return json(C.submit); }
    if (u.endsWith(`/matches/${MID}`) && method === "GET") {
      // A live server clock (the fake clock starts at the capture's instant):
      // the captured bodies' frozen `server_time` would re-anchor the client's
      // server clock on every poll and round 2 could never open.
      const body = locked ? C.public_after_lock : C.public_before_lock;
      return json({ ...body, server_time: new Date(Date.now()).toISOString() });
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const rowOf = (t: string) => document.querySelector(
  `[data-testid="forge-card-${t}"], [data-testid="forge-locked-${t}"], [data-testid="forge-reveal-${t}"]`) as HTMLElement | null;

interface Nodes { row: Element; art: Element; img: Element | null; label: Element; trail: Element }
function nodes(): Record<string, Nodes> {
  return Object.fromEntries(REVEAL.order.map((t) => {
    const row = rowOf(t)!;
    const [art, label, trail] = [...row.children];
    return [t, { row, art, img: art.querySelector("img"), label, trail }];
  }));
}

interface Frame {
  t: number; hold: string | null; phase: string | null; step: string | null; prompt: string | null;
  overlay: boolean; loading: boolean; segment: string | null; viewport: Element | null; backdropImg: Element | null;
  stage: Element | null; forge: Element | null; notOpen: string | null; lock: boolean;
}
const frame = (t0: number): Frame => ({
  t: Date.now() - t0,
  hold: q("ranked-match")?.getAttribute("data-reveal-hold") ?? null,
  phase: q("order-forge-phase")?.getAttribute("data-phase") ?? null,
  step: q("forge-reveal")?.getAttribute("data-step") ?? null,
  prompt: q("forge-prompt")?.textContent ?? null,
  overlay: !!q("question-result-overlay"),
  loading: !!q("order-forge-loading"),
  segment: null,
  viewport: q("order-forge-viewport"),
  backdropImg: q("order-forge-backdrop")?.querySelector("img") ?? null,
  stage: q("ranked-question"),
  forge: q("mig-order-forge"),
  notOpen: q("order-forge-phase")?.getAttribute("data-not-open") ?? null,
  lock: !!q("forge-lock"),
});

/** Open the board and arrange the captured submitted order, as the real player did. */
async function openAndArrange(): Promise<void> {
  render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
  for (let i = 0; i < 30 && !q("forge-lock"); i += 1) await advance(100);
  for (const id of ["forge-up-e4", "forge-up-e4", "forge-down-e2"]) {
    fireEvent.click(screen.getByTestId(id));
    await advance(50);
  }
  const shown = [...q("forge-list")!.children].map((r) => (r as HTMLElement).dataset.testid!.slice(-2));
  expect(shown).toEqual(REVEAL.order);
}

describe("OF4-CONTINUITY — one scene through lock, reveal and the next Order Forge round", () => {
  it("open -> locked -> revealed keeps every row, art box, image and label node (no remount at the lock)", async () => {
    await openAndArrange();
    const open = nodes();
    const viewport = q("order-forge-viewport");
    const backdrop = q("order-forge-backdrop")!.querySelector("img");
    const forge = q("mig-order-forge");
    expect(Object.values(open).every((n) => n.img !== null)).toBe(true);

    const t0 = Date.now();
    fireEvent.click(screen.getByTestId("forge-lock"));
    const seen = new Set<string>();
    for (let t = 0; t < REVEAL_TIMING.settleAtMs + 300; t += 10) {
      await advance(10);
      const f = frame(t0);
      if (f.phase) seen.add(f.step ? `${f.phase}:${f.step}` : f.phase);
      if (f.phase === "open") continue;
      if (f.forge !== forge) break; // the next round (asserted in the next test)
      const now = nodes();
      for (const t of REVEAL.order) {
        for (const k of ["row", "art", "img", "label", "trail"] as const) {
          expect(now[t][k], `${t}.${k} remounted at ${f.t}ms (${f.phase}/${f.step})`).toBe(open[t][k]);
        }
      }
      expect(f.viewport).toBe(viewport);
      expect(f.backdropImg).toBe(backdrop);
    }
    // The whole teaching beat was watched on those same nodes.
    expect(seen.has("revealed:mine")).toBe(true);
    expect(seen.has("revealed:assembled")).toBe(true);
  });

  it("while the board teaches its own result, the arena lays no generic stamp, edge or wash over it", async () => {
    await openAndArrange();
    const t0 = Date.now();
    fireEvent.click(screen.getByTestId("forge-lock"));
    const frames: Frame[] = [];
    for (let t = 0; t < 2500; t += 10) { await advance(10); frames.push(frame(t0)); }
    const revealed = frames.filter((f) => f.phase === "revealed");
    expect(revealed.length).toBeGreaterThan(40);
    // The hold (settlement discovered, result feedback live) overlaps the reveal...
    expect(revealed.some((f) => f.hold === "true")).toBe(true);
    // ...and still no generic overlay: the board's values, marks and verdict are the result.
    for (const f of revealed) expect(f.overlay, `overlay over the reveal at ${f.t}ms`).toBe(false);
    expect(screen.queryByTestId("result-stamp-viewer")).toBeNull();
  });

  it("settled reveal -> next Order Forge round: same viewport, stage and scene image; no loading frame; opens on time", async () => {
    await openAndArrange();
    const viewport = q("order-forge-viewport");
    const stage = q("ranked-question");
    const backdrop = q("order-forge-backdrop")!.querySelector("img");
    const firstPrompt = q("forge-prompt")!.textContent;
    const t0 = Date.now();
    fireEvent.click(screen.getByTestId("forge-lock"));
    const frames: Frame[] = [];
    for (let t = 0; t < 4500; t += 10) { await advance(10); frames.push(frame(t0)); }

    const next = frames.findIndex((f) => f.prompt !== null && f.prompt !== firstPrompt);
    expect(next, "the next Order Forge round never replaced the reveal").toBeGreaterThan(0);
    const before = frames[next - 1];
    const swap = frames[next];
    // A hard, single-frame swap of the CONTENT: settled reveal, then round 2's board.
    expect(before.phase).toBe("revealed");
    expect(before.step).toBe("assembled");
    expect(swap.phase).toBe("open");
    // The persistent shell around it is the same physical scene.
    for (const f of frames) {
      expect(f.loading, `loading frame at ${f.t}ms`).toBe(false);
      expect(f.viewport).toBe(viewport);
      expect(f.stage).toBe(stage);
      expect(f.backdropImg).toBe(backdrop);
    }
    // The interaction content is a NEW primitive (a different round), never the
    // old rows travelling into the new round's slots.
    expect(swap.forge).not.toBe(before.forge);
    // Round 2 is inert until the server opens it, then usable, with no reveal leftovers.
    const opened = frames.find((f, i) => i > next && f.notOpen === null && f.lock);
    expect(opened, "round 2 never opened").toBeTruthy();
    const opensAt = Date.parse(C.public_after_lock.payload.segment_state.challenge_started_at)
      - Date.parse(C.public_before_lock.server_time);
    expect(opened!.t).toBeLessThanOrEqual(opensAt + 200);
    for (const f of frames.slice(next)) expect(f.step).toBeNull();
  });
});
