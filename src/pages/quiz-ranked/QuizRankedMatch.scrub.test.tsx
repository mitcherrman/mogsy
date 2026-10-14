/**
 * SCRUB-S2 — THE CHRONOSCOPE IN THE REAL RANKED HOST, FROM REAL BACKEND BODIES.
 *
 * The REAL `QuizRankedMatch` + `useRankedMatch` + `CanonicalArena` +
 * `scrubModule` + `Chronoscope` (S1, unchanged), fed the bodies the backend
 * served for one admin `admin.scrub` bot match (`scrubServerCapture.json`,
 * from `test_scrub_wire_contract.py`). The bot is driven inline, as deployed:
 * it has already locked, so the viewer's lock POST settles the segment and
 * opens the next one in one transaction, and the only copy of the viewer's
 * reveal is the lock response's inline `challenge_reveal`.
 *
 * Proves, through the production shell:
 *   * open → scrub (keyboard on the rail slider) → Lock sends `{checkpoint}`
 *     and nothing else;
 *   * before the lock nothing answer-bearing exists in the DOM: no canonical
 *     marker shown or positioned, no proof, no breakpoint note, no verdict,
 *     every detent drawn alike;
 *   * the wrong lock's reveal: chosen marker kept → the reticle traverses
 *     every checkpoint toward the canonical one → the canonical marker settles
 *     → the before → after proof; the module owns the result (no stamp);
 *   * an exact lock confirms in place without travel;
 *   * reduced motion: the first revealed frame is the settled proof with both
 *     markers;
 *   * a refused lock installs no reveal and reopens the rail.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import capture from "@/lib/ranked-public/__fixtures__/scrubServerCapture.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER = C.meta.viewer_user_id as string;
const MID = C.meta.match_id as string;

type Tag = "correct" | "wrong";
const SEGMENT: Record<Tag, number> = { correct: 1, wrong: 2 };

interface Backend { tag: Tag; post: "accept" | "refuse"; locked: boolean; bodies: unknown[] }
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubBackend(tag: Tag) {
  backend = { tag, post: "accept", locked: false, bodies: [] };
  const rn = SEGMENT[tag];
  vi.setSystemTime(new Date(Date.parse(C[`public_before_bot_lock_${tag}`].server_time) + 500));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    const pre = (k: string) => C[`${k}_before_bot_lock_${tag}`];
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume", match_id: MID,
        round_number: rn, server_time: pre("public").server_time,
        payload: { match_status: "active", match_over: false, public: pre("public"),
          private: pre("private"), latest_resolved_round: null, result: null },
      });
    }
    if (new RegExp(`/rounds/${rn}/resolved$`).test(u)) {
      return backend.locked ? json(C[`resolved_${tag}`]) : json({}, 404);
    }
    if (/\/rounds\/\d+\/resolved$/.test(u)) return json(C.resolved_correct);
    if (u.endsWith("/private")) {
      return json(backend.locked ? C[`private_after_bot_settled_${tag}`] : pre("private"));
    }
    if (u.includes("/presence")) return json({ status: "active", match_id: MID, active: true });
    if (new RegExp(`/segments/${rn}/challenges/0$`).test(u) && method === "POST") {
      backend.bodies.push(JSON.parse(String(init.body)));
      if (backend.post === "refuse") {
        return json({ detail: { code: "RANKED_INVALID_CHOICE", message: "checkpoint must be one of the segment's frozen checkpoints" } }, 422);
      }
      backend.locked = true;
      return json(C[`submit_accepted_bot_settled_${tag}`]);
    }
    if (u.endsWith(`/matches/${MID}`) && method === "GET") {
      return json(backend.locked ? C[`public_after_bot_lock_${tag}`] : pre("public"));
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date",
      "performance", "requestAnimationFrame", "cancelAnimationFrame"],
  });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  document.documentElement.classList.remove("reduce-motion");
});

const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const frac = (el: HTMLElement | null) => (el ? Number(el.style.getPropertyValue("--f")) : NaN);

/** Every reveal-only string the server sent for a segment. */
function secrets(tag: Tag): string[] {
  const r = C[`submit_accepted_bot_settled_${tag}`].challenge_reveal;
  return [r.proof.after.breakpoint_note, r.proof.before?.breakpoint_note, r.granularity_caveat]
    .filter((s: unknown): s is string => typeof s === "string" && s.length > 0);
}

interface Frame {
  t: number; phase: string | null; stage: string | null;
  lockShown: string | null; lockF: number; canonShown: string | null; canonF: number;
  reticleF: number; proof: string | null; verdict: string | null; stamp: boolean; leaks: boolean;
  segment: string | null;
}
function frame(t0: number, tag: Tag): Frame {
  const text = document.body.textContent ?? "";
  return {
    t: Date.now() - t0,
    phase: q("scrub-phase")?.getAttribute("data-phase") ?? null,
    stage: q("mig-chronoscope")?.getAttribute("data-reveal-stage") ?? null,
    lockShown: q("chronoscope-lock-mark")?.getAttribute("data-shown") ?? null,
    lockF: frac(q("chronoscope-lock-mark")),
    canonShown: q("chronoscope-canon-mark")?.getAttribute("data-shown") ?? null,
    canonF: frac(q("chronoscope-canon-mark")),
    reticleF: frac(q("chronoscope-reticle")),
    proof: q("chronoscope-proof")?.getAttribute("data-shown") ?? null,
    verdict: q("chronoscope-verdict-text")?.textContent ?? null,
    stamp: !!q("result-stamp-viewer"),
    leaks: secrets(tag).some((s) => text.includes(s)),
    segment: q("chronoscope-prompt")?.textContent ?? null,
  };
}

async function mountOpen(tag: Tag) {
  stubBackend(tag);
  render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
  for (let i = 0; i < 60 && !q("chronoscope-lock"); i += 1) await advance(100);
  expect(screen.getByTestId("scrub-phase")).toHaveAttribute("data-phase", "open");
}

/** Keyboard scrub on the rail slider to the token's detent. */
function scrubTo(token: string) {
  const rail = screen.getByTestId("chronoscope-rail");
  rail.focus();
  fireEvent.keyDown(rail, { key: "Home" });
  const n = Number(token.slice(1)) - 1;
  for (let i = 0; i < n; i += 1) fireEvent.keyDown(rail, { key: "ArrowRight" });
}

async function lockAndWatch(tag: Tag, ms: number, before: Frame[] = []) {
  await mountOpen(tag);
  scrubTo(C.meta.submitted[String(SEGMENT[tag])]);
  for (let i = 0; i < 5; i += 1) { await advance(50); before.push(frame(Date.now(), tag)); }
  const t0 = Date.now();
  fireEvent.click(screen.getByTestId("chronoscope-lock"));
  const frames: Frame[] = [];
  for (let t = 0; t < ms; t += 16) { await advance(16); frames.push(frame(t0, tag)); }
  return frames;
}

const detent = (token: string) => (Number(token.slice(1)) - 1) / 14;

describe("SCRUB-S2 — the Chronoscope in the real Ranked host, from real backend bodies", () => {
  it("the captured bodies are the bot-inline lifecycle and the pre-lock bodies carry no answer", () => {
    for (const tag of ["correct", "wrong"] as const) {
      expect(C[`submit_accepted_bot_settled_${tag}`].segment_resolved).toBe(true);
      expect(C[`public_before_bot_lock_${tag}`].payload.segment_state.opponent_finished).toBe(true);
      for (const body of [C[`public_before_bot_lock_${tag}`], C[`private_before_bot_lock_${tag}`]]) {
        const blob = JSON.stringify(body);
        for (const k of ["canonical_checkpoint", "proof", "traverse_path", "satisfied_checkpoints", "breakpoint_note"]) {
          expect(blob).not.toContain(`"${k}"`);
        }
        for (const s of secrets(tag)) expect(blob).not.toContain(s);
      }
    }
  });

  it("before the lock, the DOM holds no answer: no shown or positioned canonical marker, no proof, no verdict", async () => {
    await mountOpen("wrong");
    scrubTo("w9");
    await advance(100);
    expect(q("chronoscope-canon-mark")).toHaveAttribute("data-shown", "false");
    expect(frac(q("chronoscope-canon-mark"))).toBe(0); // parked, never placed on the answer
    expect(q("chronoscope-proof")).toBeNull();
    expect(q("chronoscope-verdict")).toBeNull();
    expect(q("chronoscope-trace")).toBeNull();
    expect(q("mig-chronoscope")).not.toHaveAttribute("data-reveal-stage");
    const detents = [...document.querySelectorAll('[data-part="detent"]')];
    expect(detents).toHaveLength(15);
    for (const d of detents) expect(d.hasAttribute("data-passed")).toBe(false);
    const text = document.body.textContent ?? "";
    for (const s of secrets("wrong")) expect(text).not.toContain(s);
    expect(text).not.toMatch(/Exact checkpoint|Not the first checkpoint|was first/);
  });

  it("wrong lock: {checkpoint} only; chosen kept → traverse through every checkpoint → canonical settles → proof", async () => {
    const before: Frame[] = [];
    const frames = await lockAndWatch("wrong", 2400, before);
    const chosen: string = C.meta.submitted["2"];
    const canonical: string = C.meta.canonical["2"];
    expect(backend.bodies).toEqual([{ checkpoint: chosen }]);
    for (const f of before) { expect(f.phase).toBe("open"); expect(f.leaks).toBe(false); }

    const revealed = frames.filter((f) => f.phase === "revealed");
    expect(revealed.length, JSON.stringify(frames.slice(0, 4))).toBeGreaterThan(0);
    // The chosen marker holds its detent for the whole reveal.
    for (const f of revealed) {
      expect(f.lockShown).toBe("true");
      expect(f.lockF).toBeCloseTo(detent(chosen), 5);
      expect(f.stamp).toBe(false); // the instrument is the result
    }
    // The reticle travels monotonically from the chosen detent to the canonical one.
    const stages = [...new Set(revealed.map((f) => f.stage))];
    expect(stages).toEqual(expect.arrayContaining(["traverse", "settle", "proof", "done"]));
    expect(stages.indexOf("traverse")).toBeLessThan(stages.indexOf("settle"));
    const path = revealed.map((f) => f.reticleF);
    const dir = Math.sign(detent(canonical) - detent(chosen));
    for (let i = 1; i < path.length; i += 1) expect((path[i] - path[i - 1]) * dir).toBeGreaterThanOrEqual(-1e-9);
    expect(path[0]).toBeCloseTo(detent(chosen), 5);
    // Every intermediate checkpoint is passed (the reticle sampled near each detent).
    const step = 1 / 14;
    const passed = new Set(path.map((p) => Math.round(p / step)));
    for (let i = Math.round(detent(canonical) / step); i !== Math.round(detent(chosen) / step); i -= dir) {
      expect(passed.has(i), `detent ${i} was never reached`).toBe(true);
    }
    // Canonical settles under its marker; the proof and the verdict land.
    const done = revealed[revealed.length - 1];
    expect(done.stage).toBe("done");
    expect(done.reticleF).toBeCloseTo(detent(canonical), 5);
    expect(done.canonShown).toBe("true");
    expect(done.canonF).toBeCloseTo(detent(canonical), 5);
    expect(done.proof).toBe("true");
    expect(done.verdict).toBe("Not the first checkpoint");
    expect(revealed.find((f) => f.canonShown === "true")!.stage).not.toBe("traverse");
    const reveal = C.submit_accepted_bot_settled_wrong.challenge_reveal;
    expect(screen.getByTestId("chronoscope-proof-after").textContent).toContain(reveal.proof.after.cumulative_xp);
    if (reveal.proof.before) {
      expect(screen.getByTestId("chronoscope-proof-before").textContent).toContain(reveal.proof.before.cumulative_xp);
    }
  });

  it("exact lock: confirms in place, no traverse, both markers on one detent", async () => {
    const frames = await lockAndWatch("correct", 1800);
    const canonical: string = C.meta.canonical["1"];
    expect(backend.bodies).toEqual([{ checkpoint: canonical }]);
    const revealed = frames.filter((f) => f.phase === "revealed");
    expect(revealed.length).toBeGreaterThan(0);
    expect(revealed.some((f) => f.stage === "traverse")).toBe(false);
    for (const f of revealed) expect(f.reticleF).toBeCloseTo(detent(canonical), 5);
    const done = revealed[revealed.length - 1];
    expect(done.stage).toBe("done");
    expect(done.lockF).toBeCloseTo(done.canonF, 5);
    expect(done.verdict).toBe("Exact checkpoint");
  });

  it("reduced motion: the first revealed frame is the settled proof with both markers", async () => {
    document.documentElement.classList.add("reduce-motion");
    const frames = await lockAndWatch("wrong", 800);
    const first = frames.find((f) => f.phase === "revealed")!;
    expect(first.stage).toBe("done");
    expect(first.proof).toBe("true");
    expect(first.lockShown).toBe("true");
    expect(first.canonShown).toBe("true");
    expect(first.lockF).toBeCloseTo(detent(C.meta.submitted["2"]), 5);
    expect(first.reticleF).toBeCloseTo(detent(C.meta.canonical["2"]), 5);
  });

  it("a refused lock installs no reveal and reopens the rail as it was", async () => {
    stubBackend("wrong");
    backend.post = "refuse";
    render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
    for (let i = 0; i < 60 && !q("chronoscope-lock"); i += 1) await advance(100);
    scrubTo("w9");
    fireEvent.click(screen.getByTestId("chronoscope-lock"));
    const frames: Frame[] = [];
    for (let t = 0; t < 1200; t += 50) { await advance(50); frames.push(frame(0, "wrong")); }
    for (const f of frames) { expect(f.phase).not.toBe("revealed"); expect(f.leaks).toBe(false); }
    expect(frames[frames.length - 1].phase).toBe("open");
    expect(screen.getByTestId("chronoscope-rail")).toHaveAttribute("aria-valuenow", "8");
    expect(backend.bodies).toEqual([{ checkpoint: "w9" }]);
  });

  it("resume: a reload after the lock (bot not yet locked) re-projects the same reveal, no re-lock", async () => {
    // Segment 3 of the capture: the viewer locked WRONG, the bot was held, so
    // the segment is unsettled and the reveal lives only in the snapshot.
    const reveal = C.private_locked.payload.segment_state.own_challenge_reveals[0];
    vi.setSystemTime(new Date(Date.parse(C.private_locked.server_time) + 500));
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      if (u.endsWith("/resume")) return json(C.resume_locked);
      if (u.endsWith("/private")) return json(C.private_locked);
      if (u.includes("/presence")) return json({ status: "active", match_id: MID, active: true });
      if ((init.method ?? "GET") === "POST") { posts.push(u); return json({}, 409); }
      if (/\/rounds\/\d+\/resolved$/.test(u)) return json({}, 404);
      if (u.endsWith(`/matches/${MID}`)) return json(C.public_locked);
      return json({}, 200);
    }) as unknown as typeof fetch);
    render(<QuizRankedMatch matchId={MID} viewerUserId={VIEWER} />);
    for (let i = 0; i < 60 && q("scrub-phase")?.getAttribute("data-phase") !== "revealed"; i += 1) await advance(100);
    expect(q("scrub-phase")).toHaveAttribute("data-phase", "revealed");
    await advance(2400);
    expect(q("mig-chronoscope")).toHaveAttribute("data-reveal-stage", "done");
    expect(frac(q("chronoscope-lock-mark"))).toBeCloseTo(detent(reveal.checkpoint), 5);
    expect(frac(q("chronoscope-canon-mark"))).toBeCloseTo(detent(reveal.canonical_checkpoint), 5);
    expect(q("chronoscope-verdict-text")?.textContent).toBe("Not the first checkpoint");
    expect(q("chronoscope-lock")).toBeNull();
    expect(posts.filter((u) => String(u).includes("/challenges/"))).toEqual([]);
  });
});
