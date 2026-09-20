/**
 * RFX1 Phase 2B1 — media preparation through the REAL controller and arena:
 * Tier 3 starts under the reveal (before the swap), the swap gate is bounded
 * by the server's `started_at`, round 1's entry wait is bounded, and input
 * always opens at `started_at`. The harness is Phase 2A's.
 *
 * The server here behaves like `ranked_public`: resolving round N and opening
 * round N+1 happen in ONE snapshot, and N+1's `started_at` sits in the future
 * by the presentation lead-in. `server_time` tracks the real clock so the
 * controller's skew arithmetic is exercised rather than pinned.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { __resetPreparedImagesForTests } from "@/lib/ranked-core/media/prepareImage";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

const iso = (ms: number) => new Date(ms).toISOString();

interface Backend {
  activeRound: number;
  startedAt: number;
  hasSubmitted: boolean;
  submittedIndex: number | null;
  resolved: Record<number, unknown>;
  latestResolved: unknown | null;
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Round N's settlement: the viewer's verdict follows the submitted index;
 *  option 0 is the correct one; the opponent's verdict is a parameter. */
function resolvedPayload(round: number, opponent: "correct" | "incorrect" | "timeout") {
  const viewerCorrect = backend.submittedIndex === 0;
  const player = (id: string, outcome: string) => ({
    player_id: id, class_id: id === "userA" ? "tank" : "mage", outcome,
    submitted_at: outcome === "timeout" ? null : iso(Date.now()),
    answered_first: id === "userA", timed_out: outcome === "timeout", selected_ability_id: null,
    damage: { base_damage_dealt: 0, outgoing_bonus: 0, final_damage_dealt: 0,
      shield_absorbed: 0, incoming_reduction: 0, final_damage_received: 0 },
    hp_before: 170, hp_after: 170, reached_zero_hp: false, xp_gained: 0, total_xp_after: 0,
    level_before: 1, level_after: 1, level_up_events: [], charge_consumed: false,
    consumed_ability_id: null, remaining_charges: {},
    carryover: { effects_gained: [], effects_consumed: [], consecutive_correct: 0 },
    combat_lab_unlock_delta_seconds: 0,
  });
  return {
    match_id: "m1", round_number: round, question_id: `q${round}`, end_reason: "both_answered",
    started_at: iso(Date.now()), original_deadline: iso(Date.now()), final_deadline: iso(Date.now()),
    pressure_applied: false,
    players: [player("userA", viewerCorrect ? "correct" : "incorrect"), player("userB", opponent)],
    next_round_duration_seconds: 30, next_round_duration_delta: 0,
    match_over: false, winner_id: null, completion_reason: null,
    correct_option_index: 0, option_count: 4,
    module_points: {
      userA: { base_points: viewerCorrect ? 2 : 0, speed_bonus_points: 0,
        points_awarded: viewerCorrect ? 2 : 0, score_before: 0, score_after: viewerCorrect ? 2 : 0 },
      userB: { base_points: opponent === "correct" ? 2 : 0, speed_bonus_points: 0,
        points_awarded: opponent === "correct" ? 2 : 0, score_before: 0,
        score_after: opponent === "correct" ? 2 : 0 },
    },
  };
}

function publicBody() {
  const body = publicRoundV2() as Record<string, unknown>;
  body.server_time = iso(Date.now());
  const payload = body.payload as Record<string, unknown>;
  payload.completed_rounds = backend.activeRound - 1;
  const ar = payload.active_round as Record<string, unknown>;
  ar.round_number = backend.activeRound;
  ar.started_at = iso(backend.startedAt);
  ar.active_deadline = iso(backend.startedAt + 30_000);
  (payload.question as Record<string, unknown>).question_id = `q${backend.activeRound}`;
  (payload.question as Record<string, unknown>).prompt =
    `Round ${backend.activeRound} — which item grants Immolate?`;
  // A media-rich question: its subject icon names the round, so a request
  // for it proves WHICH round's media was being prepared.
  // A round with a MODULE NAME, so the header's intro face is real: the
  // presentation cutoff cannot be tested against a round that never plays one.
  (payload.question as Record<string, unknown>).topic = {
    category: "itemization", tier: null, icon_hint: null,
  };
  (payload.question as Record<string, unknown>).presentation = {
    assets: { subject: { type: "item", name: "Sunfire Aegis",
      icon: `assets/items/round-${backend.activeRound}.png` } },
    presentation: { scenario_type: "item", timing: "question", role: "context", spoiler: false },
  };
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
    p.score = 0;
  }
  // Live Ranked is a v2 POINTS match: ten modules, a result face in the centre.
  payload.scoring = { model: "points", match_length: 10,
    module_number: backend.activeRound, modules_completed: backend.activeRound - 1 };
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA") as Record<string, unknown>;
  body.server_time = iso(Date.now());
  const payload = body.payload as Record<string, unknown>;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
  }
  return body;
}

/** Every image request the page issues, with what the surface showed then. */
interface Req { src: string; at: number; surface: string | null; hold: boolean }
let requests: Req[];
let imageMode: "load" | "never";
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  fetchPriority?: string;
  set src(v: string) {
    requests.push({
      src: v, at: Date.now(),
      surface: document.querySelector('[data-testid="scenario-surface"]')?.textContent ?? null,
      hold: document.querySelector('[data-testid="ranked-match"]')
        ?.getAttribute("data-reveal-hold") === "true",
    });
    if (imageMode === "load") setTimeout(() => this.onload?.(), 20);
  }
  decode() { return Promise.resolve(); }
}
const firstRequest = (fragment: string) => requests.find((r) => r.src.includes(fragment)) ?? null;

beforeEach(() => {
  requests = [];
  imageMode = "load";
  __resetPreparedImagesForTests();
  vi.stubGlobal("Image", FakeImage);
  backend = {
    activeRound: 1, startedAt: Date.now() - 2000, hasSubmitted: false, submittedIndex: null,
    resolved: {}, latestResolved: null,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: backend.activeRound, server_time: iso(Date.now()),
        payload: {
          match_status: "active", match_over: false, public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: backend.latestResolved, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.includes("/submission")) {
      backend.hasSubmitted = true;
      backend.submittedIndex = (JSON.parse(init.body as string) as { answer: number }).answer;
      return json({ status: "accepted" });
    }
    const resolved = /\/rounds\/(\d+)\/resolved$/.exec(u);
    if (resolved) {
      const payload = backend.resolved[Number(resolved[1])];
      if (!payload) return json({ detail: "not ready" }, 404);
      return json({ schema_version: "ranked_duel.resolved_round.v2", projection_type: "resolved_round",
        match_id: "m1", round_number: Number(resolved[1]), server_time: iso(Date.now()), payload });
    }
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("reduce-motion");
});

/** The server resolves round N and opens N+1 `leadMs` in the future. */
function resolveRound(opponent: "correct" | "incorrect" | "timeout" = "correct", leadMs = 2900) {
  backend.resolved[backend.activeRound] = resolvedPayload(backend.activeRound, opponent);
  backend.activeRound += 1;
  backend.startedAt = Date.now() + leadMs;
  backend.hasSubmitted = false;
}

async function mountAndAnswer(index: number) {
  render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
  await screen.findByTestId("answer-grid");
  await waitFor(() => expect(screen.getByTestId("ranked-question"))
    .toHaveAttribute("data-input-open", "true"));
  fireEvent.click(document.querySelector(`[data-quiz-choice="${index}"]`)!);
  await waitFor(() => expect(backend.hasSubmitted).toBe(true));
}

const holdActive = () =>
  screen.getByTestId("ranked-match").getAttribute("data-reveal-hold") === "true";
const choice = (i: number) => document.querySelector(`[data-quiz-choice="${i}"]`)!;


const surfaceText = () => screen.queryByTestId("scenario-surface")?.textContent ?? "";

describe("RFX1 2B1 Tier 3 — next-round media is requested BEFORE the swap", () => {
  it("requests round 2's art while round 1's result is still on the card", async () => {
    await mountAndAnswer(2);
    resolveRound("correct");
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(firstRequest("round-2.png")).not.toBeNull(), { timeout: 1000 });
    const req = firstRequest("round-2.png")!;
    expect(req.hold).toBe(true);
    expect(req.surface).toContain("Round 1");
    // ...and the swap comes after it.
    let swappedAt = 0;
    await waitFor(() => { expect(surfaceText()).toContain("Round 2"); swappedAt = Date.now(); },
      { timeout: 4000, interval: 10 });
    expect(req.at).toBeLessThan(swappedAt);
  }, 15000);
});

describe("RFX1 2B1 — preparation never costs answer time", () => {
  it("bounds the swap gate by started_at and opens input AT started_at when media never loads", async () => {
    imageMode = "never";
    await mountAndAnswer(2);
    resolveRound("correct", 2900);
    const startedAt = backend.startedAt;
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    let swappedAt = 0;
    await waitFor(() => { expect(surfaceText()).toContain("Round 2"); swappedAt = Date.now(); },
      { timeout: 4000, interval: 10 });
    // The swap waited for the media only inside the server's budget: it
    // happened no later than `started_at − SWAP_MEDIA_MIN_LEAD_MS` (1000).
    expect(swappedAt).toBeLessThanOrEqual(startedAt - 1000 + 150);
    // ...and it DID wait: the nominal hold alone ends at `started_at − 1400`.
    expect(swappedAt).toBeGreaterThanOrEqual(startedAt - 1000 - 150);
    expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "false");
    let openedAt = 0;
    await waitFor(() => {
      expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "true");
      openedAt = Date.now();
    }, { timeout: 3000, interval: 10 });
    expect(openedAt - startedAt).toBeGreaterThanOrEqual(0);
    expect(openedAt - startedAt).toBeLessThan(250);
  }, 15000);
});

describe("RFX1 2B1 — the presentation cutoff: no intro survives started_at", () => {
  const stage = () => screen.getByTestId("timer-display").getAttribute("data-stage");
  const phase = () => screen.getByTestId("ranked-match").getAttribute("data-presentation-phase");

  it("ends the module title by started_at even when the swap waited for media", async () => {
    // The slow-phone case: media never loads, so the swap gate holds to
    // `started_at − 1000` and the title has only that window left.
    imageMode = "never";
    await mountAndAnswer(2);
    resolveRound("correct", 2900);
    const startedAt = backend.startedAt;
    await waitFor(() => expect(holdActive()).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(surfaceText()).toContain("Round 2"), { timeout: 4000, interval: 10 });
    // The title does play — the intro is not sacrificed...
    expect(stage()).toBe("module");
    expect(phase()).toBe("module-intro");
    // ...and every sample from `started_at` onwards is the live question.
    const samples: { t: number; stage: string | null; phase: string | null; open: string | null }[] = [];
    const sampler = setInterval(() => samples.push({
      t: Date.now() - startedAt, stage: stage(), phase: phase(),
      open: screen.getByTestId("ranked-question").getAttribute("data-input-open"),
    }), 10);
    await waitFor(() => {
      expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "true");
    }, { timeout: 3000, interval: 10 });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    clearInterval(sampler);
    // The intro ends BEFORE the server's instant, with the margin, not at it.
    const lastIntro = samples.filter((s) => s.phase === "module-intro").pop();
    expect(lastIntro, "the module intro should have been observed").toBeDefined();
    expect(lastIntro!.t).toBeLessThan(0);
    const after = samples.filter((s) => s.t >= 0);
    expect(after.length).toBeGreaterThan(5);
    for (const s of after) {
      expect(s.stage, `stage at started_at+${s.t}ms`).not.toBe("module");
      expect(s.phase, `phase at started_at+${s.t}ms`).not.toBe("module-intro");
    }
    // ...and nothing that was open ever coexisted with the intro.
    expect(samples.filter((s) => s.open === "true" && s.stage === "module")).toHaveLength(0);
  }, 15000);

  it("plays no title at all for a round that is already answerable", async () => {
    // A late discovery: the settlement is seen after `started_at` has passed.
    await mountAndAnswer(2);
    resolveRound("correct", 900);
    await waitFor(() => expect(surfaceText()).toContain("Round 2"), { timeout: 4000, interval: 10 });
    await waitFor(() => {
      expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "true");
    }, { timeout: 3000, interval: 10 });
    expect(stage()).not.toBe("module");
    expect(phase()).not.toBe("module-intro");
  }, 15000);
});

describe("RFX1 2B1 Tier 2 — round 1 inside the server entry lead-in", () => {
  it("prepares round 1's media behind the existing placeholder, bounded, then opens at started_at", async () => {
    imageMode = "never";
    backend.startedAt = Date.now() + 3000;
    const startedAt = backend.startedAt;
    const mountedAt = Date.now();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    // The first question is known and its media requested...
    await waitFor(() => expect(firstRequest("round-1.png")).not.toBeNull(), { timeout: 1000 });
    // ...while the arena still shows its placeholder, marked as preparing.
    expect(firstRequest("round-1.png")!.surface).toBeNull();
    expect(screen.getByTestId("ranked-recovering")).toHaveAttribute("data-entry-phase", "preparing");
    // The wait is bounded (ENTRY_PREP_CAP_MS = 1500) even though nothing loads.
    const grid = await screen.findByTestId("answer-grid", undefined, { timeout: 2500 });
    expect(Date.now() - mountedAt).toBeLessThan(1500 + 400);
    expect(grid).toBeInTheDocument();
    expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "false");
    let openedAt = 0;
    await waitFor(() => {
      expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "true");
      openedAt = Date.now();
    }, { timeout: 4000, interval: 10 });
    expect(openedAt - startedAt).toBeGreaterThanOrEqual(0);
    expect(openedAt - startedAt).toBeLessThan(250);
  }, 15000);

  it("does not wait at all when the round is already running (reload / resume)", async () => {
    imageMode = "never";
    backend.startedAt = Date.now() - 5000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 600 });
    expect(screen.getByTestId("ranked-question")).toHaveAttribute("data-input-open", "true");
  });

  it("ends the wait as soon as round 1's critical media is ready", async () => {
    backend.startedAt = Date.now() + 3000;
    const mountedAt = Date.now();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 1500 });
    expect(Date.now() - mountedAt).toBeLessThan(700);
  });
});
