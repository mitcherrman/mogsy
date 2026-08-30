/**
 * RG1 — FORFEIT MATCH, from the arena.
 *
 * Ranked ends on exactly two things: the combat, or this. Every other way a
 * player can vanish — a closed tab, a reload, a route change, a dead network,
 * a sleeping laptop — is indistinguishable from the others at the server, so
 * none of them decides anything; they are an absence, and an absence gets the
 * 45-second reconnect window. This control is how a player says the thing the
 * transport cannot.
 *
 * What these pin: the confirmation is real, cancelling is inert, the command
 * is the BACKEND's (`POST /matches/{id}/forfeit`, empty body — no client-named
 * winner, no client-invented terminal state), one press sends one command, and
 * the control is reachable on a module-owned round too, where the HUD row that
 * normally carries it is not mounted.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  matchResultV1, metaReflexSegmentMeta, metaReflexState, privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

let forfeitCalls: { url: string; method: string; body: unknown }[];
let segment: boolean;
/**
 * Whether the fake backend has actually SETTLED the forfeit.
 *
 * The suite below this one deliberately leaves it false — that is the "the
 * client invents no terminal state" case. It is switched on by the forfeit
 * route itself in the settling suite, which is the case that was missing when
 * the real bug shipped: every test here sent the command and then asserted
 * against a backend that reported the match active forever, so nothing ever
 * exercised the transition the player actually waits for.
 */
let settled: boolean;
/** Whether the fake forfeit route settles the match, as the real one does. */
let settleOnForfeit: boolean;

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

function apply(payload: Record<string, unknown>) {
  payload.progression_enabled = false;
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = p.player_id === "userA" ? "top" : null;
  }
  if (segment) {
    payload.question = null;
    payload.segment = metaReflexSegmentMeta();
    payload.segment_state = metaReflexState(0);
  }
  return payload;
}
const publicBody = () => {
  const b = publicRoundV2(); apply(b.payload as Record<string, unknown>); return b;
};
const privateBody = () => {
  const b = privatePlayerV2("userA"); apply(b.payload as Record<string, unknown>); return b;
};

beforeEach(() => {
  forfeitCalls = [];
  segment = false;
  settled = false;
  settleOnForfeit = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/forfeit")) {
      forfeitCalls.push({ url: u, method: init.method ?? "GET", body: init.body });
      if (settleOnForfeit) settled = true;
      return json({ status: "complete", match_id: "m1",
        forfeited: true, already_complete: false });
    }
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-08-23T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.endsWith("/result")) {
      const body = matchResultV1("forfeit");
      // The viewer conceded, so the viewer is not the winner.
      (body.payload as Record<string, unknown>).winner_user_id = "userB";
      return json(body);
    }
    if (/\/matches\/m1$/.test(u)) {
      if (!settled) return json(publicBody());
      // What the backend reports once the match row is terminal.
      const b = publicRoundV2(true);
      apply(b.payload as Record<string, unknown>);
      return json(b);
    }
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

describe("the Forfeit Match control", () => {
  it("is present, and does nothing on its own", async () => {
    await mount();
    const control = await screen.findByTestId("ranked-forfeit");
    expect(control).toHaveTextContent("Forfeit Match");
    // The press opens a confirmation; it does NOT send anything.
    fireEvent.click(control);
    await screen.findByTestId("ranked-forfeit-confirm");
    expect(forfeitCalls).toHaveLength(0);
  });

  it("states the consequence rather than asking 'are you sure'", async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    const dialog = await screen.findByTestId("ranked-forfeit-confirm");
    expect(dialog).toHaveTextContent(/opponent wins/i);
    expect(dialog).toHaveTextContent(/counts/i);
    expect(dialog).toHaveAttribute("role", "alertdialog");
  });

  it("cancelling sends nothing and restores the quiet control", async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    fireEvent.click(await screen.findByTestId("ranked-forfeit-cancel"));
    expect(forfeitCalls).toHaveLength(0);
    expect(await screen.findByTestId("ranked-forfeit")).toBeInTheDocument();
    expect(screen.queryByTestId("ranked-forfeit-confirm")).toBeNull();
  });

  it("confirming sends the backend command, with no body to argue with", async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    fireEvent.click(await screen.findByTestId("ranked-forfeit-confirm-action"));
    await waitFor(() => expect(forfeitCalls).toHaveLength(1));
    expect(forfeitCalls[0].url).toMatch(/\/api\/ranked\/matches\/m1\/forfeit$/);
    expect(forfeitCalls[0].method).toBe("POST");
    // No winner, no outcome, no terminal state: the client concedes its own
    // match and cannot name anything about the settlement.
    expect(forfeitCalls[0].body ?? null).toBeNull();
  });

  it("sends exactly once however fast the confirm is pressed", async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    const confirm = await screen.findByTestId("ranked-forfeit-confirm-action");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(forfeitCalls.length).toBeGreaterThan(0));
    expect(forfeitCalls).toHaveLength(1);
  });

  it("invents no local terminal state — the server's settlement is the one", async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    fireEvent.click(await screen.findByTestId("ranked-forfeit-confirm-action"));
    await waitFor(() => expect(forfeitCalls).toHaveLength(1));
    // The fake backend still reports the match ACTIVE, and the arena believes
    // it. A client that painted its own defeat would disagree with the server
    // the moment a forfeit was refused or already settled some other way.
    expect(screen.queryByTestId("ranked-match-over")).toBeNull();
    expect(screen.getByTestId("ranked-match")).toBeInTheDocument();
  });

  it("is reachable on a Meta Reflex round, where the HUD row is not mounted", async () => {
    segment = true;
    await mount();
    // The row that normally carries it is genuinely absent...
    await waitFor(() => expect(screen.queryByTestId("submission-status")).toBeNull());
    // ...and the control is still there, so a player mid-block is never left
    // with only the 45-second absence path to leave by.
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    fireEvent.click(await screen.findByTestId("ranked-forfeit-confirm-action"));
    await waitFor(() => expect(forfeitCalls).toHaveLength(1));
  });

  it("is never mounted twice", async () => {
    await mount();
    expect(screen.getAllByTestId("ranked-forfeit")).toHaveLength(1);
  });
});


// ── the transition the player waits for ───────────────────────────────────
//
// THE GAP THIS CLOSES. Every test above sends the forfeit command against a
// fake backend that reports the match ACTIVE forever, so none of them ever
// asked what happens once it settles — and in production it did not settle
// visibly: the snapshot's `match_over` came from the combat ENGINE, which an
// explicit forfeit never completes, so the arena polled a match it had already
// lost and never reached its terminal frame. The backend now reports the match
// ROW's terminal, and these pin the client end of that.

describe("once the backend has settled the forfeit", () => {
  beforeEach(() => { settleOnForfeit = true; });

  const forfeit = async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ranked-forfeit"));
    fireEvent.click(await screen.findByTestId("ranked-forfeit-confirm-action"));
    await waitFor(() => expect(forfeitCalls).toHaveLength(1));
  };

  it("enters the ended state with no reload and no remount", async () => {
    await forfeit();
    // The SAME mounted component reaches the terminal frame off its own poll.
    await screen.findByTestId("ranked-match-over");
  });

  it("leaves the live arena rather than layering over it", async () => {
    await forfeit();
    await screen.findByTestId("ranked-match-over");
    expect(screen.queryByTestId("ranked-match")).toBeNull();
    // Gameplay controls are gone with it — including the one just pressed.
    expect(screen.queryByTestId("ranked-forfeit")).toBeNull();
  });

  it("names the outcome using the existing end-state UI", async () => {
    await forfeit();
    const frame = await screen.findByTestId("ranked-match-over");
    // The server said the opponent won, so this is a defeat by forfeit — the
    // client reads the reason and the winner, and asserts neither itself.
    expect(frame).toHaveTextContent(/You forfeited\./);
  });

  it("stops polling the match it has already lost", async () => {
    await forfeit();
    await screen.findByTestId("ranked-match-over");
    const seen = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.length).toBe(seen);
  });
});
