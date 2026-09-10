/**
 * RB3 — the guided playtest through the REAL controller.
 *
 * The claim under test is architectural, and it is a negative one: a playtest
 * is canonical Ranked with pages between the segments, so there must be no
 * playtest renderer, no playtest question, no playtest result screen and no
 * playtest match endpoint. Every case here either watches the canonical
 * components appear, or watches the wire and finds nothing new on it.
 *
 * The timer cases are the ones that would be expensive to discover later.
 * Ranked advances LAZILY — the next round opens only when a participant's own
 * request drives it — so "no clock runs during a page" is really "the client
 * stops polling", and that is what is asserted: the number of snapshot reads
 * while a page is up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { PlaytestMatchHost } from "./PlaytestMatchHost";
import { matchResultV1, privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

let over: boolean;
let completedRounds: number;
let calls: string[];
let assignedUrls: string[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

/** The playtest match, as the server projects it. */
function apply(payload: Record<string, unknown>) {
  payload.progression_enabled = false;
  payload.completed_rounds = completedRounds;
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = p.player_id === "userA" ? "top" : null;
  }
  payload.playtest = {
    question_bank_mode: "production",
    is_placeholder: false,
    is_bot_match: true,
    session_preset: "playtest",
  };
  return payload;
}
const publicBody = () => {
  const b = publicRoundV2(over); apply(b.payload as Record<string, unknown>); return b;
};
const privateBody = () => {
  const b = privatePlayerV2("userA"); apply(b.payload as Record<string, unknown>); return b;
};

beforeEach(() => {
  over = false;
  completedRounds = 0;
  calls = [];
  assignedUrls = [];
  window.sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: (u: string) => { assignedUrls.push(u); } },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
    if (u.endsWith("/api/ranked/queue") && init?.method === "POST") {
      return json({
        schema_version: "ranked_duel.queue_status.v1",
        projection_type: "queue_status", match_id: null, round_number: null,
        server_time: "2026-09-09T12:00:00Z",
        payload: { status: "matched", match_id: "m1", queue_version: 1,
                   position: null, enqueued_at: null, role: "top" },
      });
    }
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-09-09T12:00:00+00:00",
        payload: {
          match_status: over ? "complete" : "active", match_over: over,
          progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null,
          result: over ? matchResultV1("combat") : null,
        },
      });
    }
    if (u.endsWith("/discoveries")) {
      return json({
        schema_version: "ranked_duel.match_discoveries.v1",
        projection_type: "match_discoveries", match_id: "m1",
        round_number: null, server_time: "2026-09-09T12:00:05Z",
        payload: { scope: "ranked_discoveries", includes_default_library: false,
                   match_id: "m1", new_discoveries: [], new_count: 0,
                   collection_total: 40, collection_total_before: 40,
                   truncated: false },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.endsWith("/result")) return json(matchResultV1("combat"));
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const mount = (initialMatchId: string | null = null) =>
  render(<PlaytestMatchHost viewerUserId="userA" initialMatchId={initialMatchId} />);

const snapshotReads = () =>
  calls.filter((c) => c === "GET /api/ranked/matches/m1").length;

// ══════════════════════════════════════════════ the sequence

describe("the guided sequence", () => {
  it("opens on the intro, with no match created yet", () => {
    mount();
    expect(screen.getByTestId("playtest-interstitial").getAttribute("data-page"))
      .toBe("intro");
    expect(calls.filter((c) => c.startsWith("POST /api/ranked/queue"))).toEqual([]);
  });

  it("Begin creates the match through the ORDINARY queue join, with a preset", async () => {
    mount();
    screen.getByTestId("playtest-advance").click();
    await waitFor(() => expect(
      calls.filter((c) => c === "POST /api/ranked/queue")).toHaveLength(1));
    // There is no playtest match endpoint, and none was invented.
    expect(calls.filter((c) => /playtest|preset/.test(c))).toEqual([]);
  });

  it("a double press on Begin creates ONE match", async () => {
    mount();
    const begin = screen.getByTestId("playtest-advance");
    begin.click();
    begin.click();
    await waitFor(() => expect(
      calls.filter((c) => c === "POST /api/ranked/queue").length).toBeGreaterThan(0));
    expect(calls.filter((c) => c === "POST /api/ranked/queue")).toHaveLength(1);
  });

  it("hands off to the CANONICAL arena, not a playtest one", async () => {
    mount("m1");
    // `ranked-match` is CanonicalArena's own testid, reached through the
    // untouched QuizRankedMatch. No playtest renderer exists to reach instead.
    expect(await screen.findByTestId("ranked-match")).toBeTruthy();
    expect(screen.getByTestId("ranked-header")).toBeTruthy();
    expect(screen.queryByTestId("playtest-interstitial")).toBeNull();
  });

  it("raises an interstitial at the boundary the server reports", async () => {
    completedRounds = 3;
    mount("m1");
    const page = await screen.findByTestId("playtest-interstitial");
    expect(page.getAttribute("data-page")).toBe("meta-reflex");
  });

  it("returns to the same arena after Continue", async () => {
    completedRounds = 3;
    mount("m1");
    (await screen.findByTestId("playtest-advance")).click();
    await waitFor(() =>
      expect(screen.queryByTestId("playtest-interstitial")).toBeNull());
    expect(screen.getByTestId("ranked-match")).toBeTruthy();
  });
});

// ══════════════════════════════════════════════ the timer

describe("an interstitial spends no answer time", () => {
  it("stops polling the match while a page is up", async () => {
    completedRounds = 3;
    mount("m1");
    await screen.findByTestId("playtest-interstitial");
    const atPause = snapshotReads();
    // Ranked advances lazily: while nobody reads, no round opens and no clock
    // starts. Three poll intervals' worth of real time, and the count holds.
    await new Promise((r) => setTimeout(r, 200));
    expect(snapshotReads()).toBe(atPause);
  });

  it("holds only the POLL — the presence heartbeat is a separate timer", async () => {
    // Structural, because the heartbeat's interval is far longer than a test
    // wants to wait for. What makes the hold safe is that the two live on
    // different timers and only one of them is held: `service.heartbeat` on
    // the backend deliberately does not call `_advance`, so a held match is
    // not an absent player and cannot be forfeited for one.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/quiz-ranked/useRankedMatch.ts"), "utf8");
    // The hold is on the poll's re-arm...
    expect(source).toContain("!stoppedRef.current && !pausedRef.current");
    // ...and the heartbeat is on its own interval, which nothing pauses.
    expect(source).toMatch(/hbRef\.current = window\.setInterval/);
    expect(source.split("hbRef.current = window.setInterval")[1])
      .not.toContain("pausedRef");
  });

  it("resumes polling once the page is pressed past", async () => {
    completedRounds = 3;
    mount("m1");
    (await screen.findByTestId("playtest-advance")).click();
    const atResume = snapshotReads();
    await waitFor(() => expect(snapshotReads()).toBeGreaterThan(atResume));
  });

  it("polls normally during gameplay", async () => {
    completedRounds = 1;
    mount("m1");
    await screen.findByTestId("ranked-match");
    await waitFor(() => expect(snapshotReads()).toBeGreaterThan(0));
  });
});

// ══════════════════════════════════════════════ the result

describe("the result is the canonical one", () => {
  it("ends on MatchOverFrame, not a playtest result screen", async () => {
    over = true;
    completedRounds = 7;
    mount("m1");
    expect(await screen.findByTestId("match-over-frame")).toBeTruthy();
    expect(screen.getByTestId("match-over-heading")).toBeTruthy();
    expect(screen.queryByTestId("playtest-interstitial")).toBeNull();
  });

  it("steps from the result INTO the outro", async () => {
    over = true;
    completedRounds = 7;
    mount("m1");
    const primary = await screen.findByTestId("match-over-primary");
    expect(primary.textContent).toContain("Continue");
    primary.click();
    const outro = await screen.findByTestId("playtest-interstitial");
    expect(outro.getAttribute("data-page")).toBe("outro");
  });

  it("keeps the exit available on the result screen", async () => {
    over = true;
    completedRounds = 7;
    mount("m1");
    expect((await screen.findByTestId("match-over-secondary")).textContent)
      .toContain("Back to Leaguecraft");
  });
});

// ══════════════════════════════════════════════ isolation

describe("nothing playtest-specific touches gameplay", () => {
  it("has no parallel question renderer registered", async () => {
    const { registeredModuleIds } = await import("@/lib/ranked-core/modules/registry");
    const ids = registeredModuleIds();
    expect(ids).not.toContain("playtest");
    expect(ids.some((i) => /playtest/i.test(i))).toBe(false);
  });

  it("adds no second match-creation call anywhere in the client", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const client = readFileSync(
      resolve(process.cwd(), "src/lib/ranked-public/client.ts"), "utf8");
    // The preset rides the ONE join. There is no playtest endpoint.
    expect(client).not.toMatch(/api\/ranked\/playtest/);
    expect(client).toContain("options?.preset");
  });
});
