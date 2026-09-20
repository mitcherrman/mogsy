/**
 * RFX1 Phase 2B2 — THE VISIBLE ENTRY INTRO, through the real controller and
 * the real arena.
 *
 * The one thing every test here is ultimately about: the card is free. It
 * occupies part of the server's Round-1 lead-in, it is gone before
 * `started_at`, and the whole configured answer window still follows that
 * instant. Nothing below asserts a look; they assert time and state.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { __resetPreparedImagesForTests } from "@/lib/ranked-core/media/prepareImage";
import { matchResultPointsV1, privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

const iso = (ms: number) => new Date(ms).toISOString();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let startedAt: number;
let roles: Record<string, string | null>;
let isBotMatch: boolean;
/** A completed match, the way the playtest host's terminal path serves one. */
let overMatch: boolean;
/** Held open until a test releases it, to observe the unresolved state. */
let snapshotGate: Promise<void>;
let openGate: () => void;

function shape<T extends { payload: Record<string, unknown> }>(env: T): T {
  const payload = env.payload;
  if (overMatch) {
    payload.match_status = "complete";
    payload.match_over = true;
    payload.active_round = null;
    payload.question = null;
    payload.winner_id = "userA";
    payload.completion_reason = "segments_complete";
  }
  payload.progression_enabled = false;
  payload.server_time = iso(Date.now());
  (env as unknown as Record<string, unknown>).server_time = iso(Date.now());
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = roles[p.player_id as string] ?? null;
    p.score = 0;
  }
  payload.playtest = {
    question_bank_mode: "shared_bank", is_placeholder: false,
    is_bot_match: isBotMatch, session_preset: null,
  };
  const ar = payload.active_round as Record<string, unknown> | null;
  if (ar) {
    ar.started_at = iso(startedAt);
    ar.active_deadline = iso(startedAt + 30_000);
  }
  payload.scoring = { model: "points", match_length: 10, module_number: 1, modules_completed: 0 };
  return env;
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  fetchPriority?: string;
  set src(_v: string) { setTimeout(() => this.onload?.(), 5); }
  decode() { return Promise.resolve(); }
}

beforeEach(() => {
  __resetPreparedImagesForTests();
  vi.stubGlobal("Image", FakeImage);
  roles = { userA: "jungle", userB: "mid" };
  isBotMatch = false;
  overMatch = false;
  startedAt = Date.now() + 2500;
  openGate = () => {};
  snapshotGate = Promise.resolve();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.endsWith("/private")) { await snapshotGate; return json(shape(privatePlayerV2("userA"))); }
    if (u.endsWith("/resume")) {
      await snapshotGate;
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: iso(Date.now()),
        payload: {
          match_status: overMatch ? "complete" : "active", match_over: overMatch,
          public: shape(publicRoundV2(overMatch)), private: shape(privatePlayerV2("userA")),
          progression_pending_players: [], latest_resolved_round: null,
          result: overMatch ? matchResultPointsV1({ userA: 18, userB: 12 }) : null,
        },
      });
    }
    if (u.endsWith("/result") && overMatch) {
      return json(matchResultPointsV1({ userA: 18, userB: 12 }));
    }
    if (/\/matches\/m1$/.test(u)) { await snapshotGate; return json(shape(publicRoundV2(overMatch))); }
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("reduce-motion");
});

const holdSnapshots = () => {
  snapshotGate = new Promise<void>((resolve) => { openGate = resolve; });
};
const intro = () => screen.queryByTestId("ranked-entry-intro");
const inputOpen = () =>
  screen.getByTestId("ranked-question").getAttribute("data-input-open") === "true";

describe("RFX1 2B2 — the intro stands in the entry preparation window", () => {
  it("is up from the first paint, before any request has resolved", () => {
    holdSnapshots();
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    expect(intro()).toHaveAttribute("data-entry-phase", "match-unresolved");
    // Nothing invented: no seat has a role or a name yet.
    expect(screen.getByTestId("entry-intro-role-player").textContent).toBe("Duelist");
    expect(screen.queryByTestId("entry-intro-mascot-player")).toBeNull();
    openGate();
  });

  it("names both duelists and draws their role mascots once the match resolves", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(screen.getByTestId("entry-intro-role-player").textContent)
      .toBe("Jungle"));
    expect(screen.getByTestId("entry-intro-role-opponent").textContent).toBe("Mid");
    expect(screen.getByTestId("entry-intro-name-opponent").textContent).toBe("Opponent");
    // The ARENA encode, which is also what Tier 1 warmed.
    const plate = within(screen.getByTestId("entry-intro-mascot-player"))
      .getByTestId("entry-intro-mascot-player-plate").querySelector("img")!;
    expect(plate.getAttribute("src")).toBe("/mascot/ranked/jgmogzy-384.webp");
    expect(intro()).toHaveAttribute("data-entry-phase");
  });

  it("calls a bot match an Academy Duel and its opponent Bot", async () => {
    isBotMatch = true;
    roles = { userA: "top", userB: null };
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(screen.getByTestId("entry-intro-name-opponent").textContent)
      .toBe("Bot"));
    expect(intro()).toHaveAttribute("data-bot-match", "true");
    expect(intro()!.textContent).toContain("Academy Duel");
    // A role-less seat draws the neutral crest rather than inventing a role.
    expect(screen.getByTestId("entry-intro-neutral-opponent")).toBeInTheDocument();
    expect(screen.getByTestId("entry-intro-role-opponent").textContent).toBe("Duelist");
  });
});

describe("RFX1 2B2 — the intro exits before the authoritative start", () => {
  it("reveals the arena a margin before started_at and opens input AT started_at", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 3500 });
    const revealedAt = Date.now();
    // Gone, and gone EARLY: the question is on screen, locked, before the
    // server's instant — with room for the reveal to settle.
    expect(intro()).toBeNull();
    expect(startedAt - revealedAt).toBeGreaterThan(300);
    expect(inputOpen()).toBe(false);
    let openedAt = 0;
    await waitFor(() => { expect(inputOpen()).toBe(true); openedAt = Date.now(); },
      { timeout: 2500, interval: 10 });
    // The full answer window still starts at the server's instant.
    expect(openedAt - startedAt).toBeGreaterThanOrEqual(0);
    expect(openedAt - startedAt).toBeLessThan(250);
  }, 15000);

  it("never puts the card up while input is open — sampled across the boundary", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    const samples: { t: number; intro: boolean; open: boolean }[] = [];
    const sampler = setInterval(() => {
      if (!screen.queryByTestId("ranked-question")) return;
      samples.push({ t: Date.now() - startedAt, intro: intro() !== null, open: inputOpen() });
    }, 10);
    await waitFor(() => expect(inputOpen()).toBe(true), { timeout: 4000, interval: 10 });
    await new Promise((r) => setTimeout(r, 300));
    clearInterval(sampler);
    expect(samples.length).toBeGreaterThan(5);
    expect(samples.filter((s) => s.intro && s.open)).toHaveLength(0);
    expect(samples.filter((s) => s.t >= 0 && s.intro)).toHaveLength(0);
  }, 15000);

  it("shows no card at all for a round that is already running (reload / resume)", async () => {
    startedAt = Date.now() - 5000;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 1500 });
    expect(intro()).toBeNull();
    expect(inputOpen()).toBe(true);
  });

  it("shows no card for a FRESH entry whose lead-in is already spent", async () => {
    // A staff/admin match is created with a zero lead-in. The card cannot
    // appear over a question the player may already answer.
    startedAt = Date.now() - 100;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 1500 });
    expect(intro()).toBeNull();
  });

  it("shows no card for a FRESH entry into a match that is already over", async () => {
    // The playtest host enters its own match fresh and can land straight on a
    // completed one. "No active round" reads exactly like "still resolving",
    // so without the liveness gate the card would sit over the result screen
    // for ever — there is no `started_at` left to exit on.
    overMatch = true;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(intro()).toBeNull(), { timeout: 3000 });
    expect(screen.queryByTestId("ranked-entry-intro")).toBeNull();
  }, 15000);

  it("does not come back when a later round is between snapshots", async () => {
    // The regression this phase could most easily have shipped: the window's
    // natural predicate reads `null` mid-match, so an underived card would
    // drop over the arena every time a round settled. The latch is what
    // stops it, and it is asserted through the controller.
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 3500 });
    expect(intro()).toBeNull();
    // Move the next round's start far into the future, the way a resolution
    // does, and let several polls land.
    startedAt = Date.now() + 5000;
    await new Promise((r) => setTimeout(r, 600));
    expect(intro()).toBeNull();
    expect(screen.queryByTestId("answer-grid")).not.toBeNull();
  }, 15000);
});

describe("RFX1 2B2 — decorative media never blocks entry", () => {
  it("reveals the arena on the server's schedule when no image ever loads", async () => {
    class DeadImage extends FakeImage { set src(_v: string) { /* never settles */ } }
    vi.stubGlobal("Image", DeadImage);
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await screen.findByTestId("answer-grid", undefined, { timeout: 3500 });
    const revealedAt = Date.now();
    expect(startedAt - revealedAt).toBeGreaterThan(300);
    let openedAt = 0;
    await waitFor(() => { expect(inputOpen()).toBe(true); openedAt = Date.now(); },
      { timeout: 2500, interval: 10 });
    expect(openedAt - startedAt).toBeLessThan(250);
  }, 15000);
});

describe("RFX1 2B2 — reduced motion keeps every word", () => {
  it("marks the card and still names both duelists and the status", async () => {
    document.documentElement.classList.add("reduce-motion");
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(screen.getByTestId("entry-intro-role-player").textContent)
      .toBe("Jungle"));
    expect(intro()).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByTestId("entry-intro-role-opponent").textContent).toBe("Mid");
    expect(screen.getByTestId("entry-intro-name-player")).toBeInTheDocument();
    expect(screen.getByTestId("entry-intro-status").textContent).toBeTruthy();
    expect(intro()!.textContent).toContain("Ranked Duel");
  });
});
