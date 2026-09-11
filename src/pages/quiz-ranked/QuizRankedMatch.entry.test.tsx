/**
 * RB3.2 — ENTERING a match is not RECOVERING one.
 *
 * The reported defect: pressing Match with Bot put the player on a screen
 * reading "Recovering match…" and left them there. Nothing was being
 * recovered. The bot join answers `matched` with the id of a match the server
 * created inside that same request, so the client arrives knowing exactly
 * which match it wants — and the arena nevertheless ran the recovery round
 * trip (`POST /resume`, which exists to rebuild a settlement, a reveal, a
 * transcript and a result that a one-second-old match does not have) and
 * announced itself with recovery language while it did.
 *
 * The rule these cases pin:
 *
 *     fresh, known match id   →  snapshot only, and it says so
 *     no id / discovered id   →  recovery, exactly as before
 *     "fresh" that is not     →  the SERVER's round count overrules the caller
 *
 * The last one is why `entry` is an optimism rather than an authority: a
 * back-navigation can hand this component a match that has moved on, and its
 * transcript must still come back.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

let urls: string[];
/** What the SERVER says about how far this match has got. */
let completedRounds: number;

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

function shape(payload: Record<string, unknown>) {
  payload.progression_enabled = false;
  payload.completed_rounds = completedRounds;
  for (const p of payload.players as Record<string, unknown>[]) p.role = null;
  payload.playtest = {
    question_bank_mode: "production", is_placeholder: false, is_bot_match: true,
  };
  return payload;
}
const publicBody = () => {
  const b = publicRoundV2(false); shape(b.payload as Record<string, unknown>); return b;
};
const privateBody = () => {
  const b = privatePlayerV2("userA"); shape(b.payload as Record<string, unknown>); return b;
};

beforeEach(() => {
  urls = [];
  completedRounds = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    urls.push(u);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-09-09T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null,
          result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const resumes = () => urls.filter((u) => u.endsWith("/resume")).length;
const snapshots = () => urls.filter((u) => /\/matches\/m1$/.test(u)).length;

describe("a freshly created match is ENTERED, not recovered", () => {
  it("never makes the recovery round trip", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(screen.queryByTestId("ranked-recovering")).toBeNull());
    expect(resumes()).toBe(0);
    // And it did paint: the snapshot is the one request that has to happen.
    expect(snapshots()).toBeGreaterThan(0);
  });

  it("does not say it is recovering anything", async () => {
    // Asserted on the FIRST frame, before any request resolves — the window
    // the player actually sat in front of.
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    const placeholder = screen.getByTestId("ranked-recovering");
    expect(placeholder.textContent).toContain("Entering the arena");
    expect(placeholder.textContent).not.toMatch(/recovering/i);
  });

  it("creates no second match — entry is reads only", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(snapshots()).toBeGreaterThan(0));
    // Nothing on the entry path may create, queue or pair anything: the match
    // it was handed is the match it plays.
    expect(urls.some((u) => /\/queue|\/bot|active-match/.test(u))).toBe(false);
  });
});

describe("a genuine recovery still recovers", () => {
  it("makes the recovery round trip when the entry is not fresh", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    await waitFor(() => expect(resumes()).toBe(1));
  });

  it("recovers by DEFAULT, for a caller that says nothing", async () => {
    // The conservative reading: a host that does not know how it got here is
    // treated as one that lost its place.
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    await waitFor(() => expect(resumes()).toBe(1));
  });

  it("says it is recovering while it does", () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="recovered" />);
    expect(screen.getByTestId("ranked-recovering").textContent)
      .toContain("Recovering match");
  });
});

describe("the server overrules a wrong claim of freshness", () => {
  it("recovers a 'fresh' match that has already played rounds", async () => {
    // A back-navigation into a live duel: the router state still carries the
    // id, but this match has a transcript, and it must come back.
    completedRounds = 4;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(resumes()).toBe(1));
  });

  it("recovers such a match exactly once, however long it polls", async () => {
    completedRounds = 4;
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" entry="fresh" />);
    await waitFor(() => expect(resumes()).toBe(1));
    await waitFor(() => expect(snapshots()).toBeGreaterThan(1), { timeout: 4000 });
    expect(resumes()).toBe(1);
  });
});
