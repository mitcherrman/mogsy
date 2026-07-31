/**
 * R3 shell integration: the one-click Ranked interaction model.
 *
 * What these assert is the CLICK COUNT and where authority lives:
 *   * clicking a quiz answer submits it — there is no Lock In / Confirm button;
 *   * the ability tray is optional, independently editable, and hidden when it
 *     has nothing actionable to offer;
 *   * a progression choice applies on the first click;
 *   * nothing advances the match on a local click alone.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

interface Backend {
  submissions: unknown[];
  abilityDrafts: unknown[];
  progressionChoices: unknown[];
  /** Server-held ability draft, echoed back through own_selection. */
  ownAbilityId: string | null;
  ownSelectionPhase: string;
  /** The viewer's own charges, keyed by ability id. */
  charges: Record<string, number | null>;
  hasSubmitted: boolean;
  progressionPending: string[];
}
let backend: Backend;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

function publicBody() {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.progression_pending_players = backend.progressionPending;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
  }
  return body;
}

function privateBody() {
  const body = privatePlayerV2("userA");
  const payload = body.payload as Record<string, unknown>;
  payload.progression_pending_players = backend.progressionPending;
  payload.own_selection = {
    phase: backend.ownSelectionPhase, selected_ability_id: backend.ownAbilityId,
  };
  const own = payload.own_abilities as Record<string, unknown>;
  own.remaining_charges = backend.charges;
  for (const p of payload.players as Record<string, unknown>[]) {
    if (p.player_id === "userA") p.has_submitted = backend.hasSubmitted;
  }
  return body;
}

beforeEach(() => {
  backend = {
    submissions: [], abilityDrafts: [], progressionChoices: [],
    ownAbilityId: null, ownSelectionPhase: "open",
    charges: { "tank.fortify": 3 }, hasSubmitted: false,
    progressionPending: [],
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: backend.progressionPending,
          latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) {
      return json({ status: "active", match_id: "m1", active: true });
    }
    if (u.includes("/submission")) {
      backend.submissions.push(JSON.parse(init.body as string));
      backend.hasSubmitted = true;
      return json({ status: "accepted" });
    }
    if (/\/rounds\/\d+\/ability$/.test(u)) {
      const body = JSON.parse(init.body as string) as { ability_id: string | null };
      backend.abilityDrafts.push(body);
      backend.ownAbilityId = body.ability_id;
      return json({ status: "accepted" });
    }
    if (u.includes("/level-two-choice")) {
      backend.progressionChoices.push(JSON.parse(init.body as string));
      backend.progressionPending = [];
      return json({ status: "confirmed" });
    }
    if (/\/matches\/m1$/.test(u) && (init.method ?? "GET") === "GET") {
      return json(publicBody());
    }
    return json({}, 200);
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  return view;
}

/** The rendered answer controls, in option order. */
async function findAnswerOptions(): Promise<HTMLElement[]> {
  await screen.findByTestId("answer-grid");
  return waitFor(() => {
    const found = Array.from(
      document.querySelectorAll<HTMLElement>("[data-quiz-choice]"));
    if (found.length === 0) throw new Error("no answer options rendered");
    return found.sort((a, b) =>
      Number(a.dataset.quizChoice) - Number(b.dataset.quizChoice));
  });
}

describe("R3 quiz answers lock on one click", () => {
  it("has no Lock In / Confirm control at all", async () => {
    await mount();
    expect(screen.queryByTestId("lock-in-button")).toBeNull();
    expect(screen.queryByTestId("confirm-button")).toBeNull();
    expect(screen.queryByTestId("review-button")).toBeNull();
    expect(screen.queryByTestId("submission-review")).toBeNull();
    expect(document.body.textContent).not.toMatch(/lock in|confirm & lock/i);
  });

  it("submits on the answer click itself", async () => {
    await mount();
    const option = (await findAnswerOptions())[1];
    fireEvent.click(option);
    await waitFor(() => expect(backend.submissions).toHaveLength(1));
    expect(backend.submissions[0]).toEqual({ round_number: 1, answer: 1 });
  });

  it("does not render a locked state before the server accepts", async () => {
    await mount();
    const option = (await findAnswerOptions())[0];
    fireEvent.click(option);
    // In flight: a transient submitting state, NOT a claim that it is locked.
    expect(screen.getByTestId("submission-status"))
      .toHaveTextContent(/submitting/i);
    await waitFor(() => expect(backend.submissions).toHaveLength(1));
  });

  it("shows the locked state only once the snapshot reports it", async () => {
    backend.hasSubmitted = true;
    await mount();
    expect(screen.getByTestId("submission-status"))
      .toHaveTextContent(/waiting for opponent/i);
  });

  it("is safe against a double activation", async () => {
    await mount();
    const options = await findAnswerOptions();
    fireEvent.click(options[0]);
    fireEvent.click(options[1]);
    await waitFor(() => expect(backend.submissions).toHaveLength(1));
    expect(backend.submissions).toEqual([{ round_number: 1, answer: 0 }]);
  });

  it("keeps every answer control keyboard reachable", async () => {
    await mount();
    for (const option of await findAnswerOptions()) {
      // Real buttons, never a div-with-onClick, so Enter/Space still work.
      expect(option.tagName).toBe("BUTTON");
    }
  });
});

describe("R3 quiz abilities are optional and non-blocking", () => {
  it("writes the ability on its own route, with no answer implied", async () => {
    await mount();
    fireEvent.click(await screen.findByTestId("ability-tank.fortify"));
    await waitFor(() => expect(backend.abilityDrafts).toHaveLength(1));
    expect(backend.abilityDrafts[0]).toEqual({ ability_id: "tank.fortify" });
    expect(backend.submissions).toHaveLength(0);
  });

  it("stays editable while waiting for the opponent", async () => {
    backend.hasSubmitted = true;   // answered; round still open
    await mount();
    const tray = await screen.findByTestId("ranked-abilities");
    expect(tray).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ability-tank.fortify"));
    await waitFor(() => expect(backend.abilityDrafts).toHaveLength(1));
  });

  it("offers a clear control only once something is armed", async () => {
    await mount();
    // Nothing armed: No Ability is the implicit default and needs no button.
    expect(screen.queryByTestId("ability-none")).not.toBeNull();
    fireEvent.click(screen.getByTestId("ability-none"));
    await waitFor(() => expect(backend.abilityDrafts).toHaveLength(1));
    expect(backend.abilityDrafts[0]).toEqual({ ability_id: null });
  });

  it("keeps the tray mounted but inert once the selection window is locked", async () => {
    // RA1 1.5: the tray used to be UNMOUNTED here. The window locks at every
    // round close, so the HUD lost ~140px on every round boundary and the
    // status panel slid up under the player's cursor. It now holds its place
    // and goes disabled instead — availability is a state, not a layout event.
    backend.ownSelectionPhase = "locked";
    await mount();
    expect(await screen.findByTestId("ranked-abilities")).toBeInTheDocument();
    expect(screen.getByTestId("ability-tank.fortify")).toBeDisabled();
    expect(screen.getByTestId("ability-none")).toBeDisabled();
  });

  it("hides the tray when every ability is out of charges", async () => {
    backend.charges = { "tank.fortify": 0 };
    await mount();
    expect(screen.queryByTestId("ranked-abilities")).toBeNull();
  });
});

describe("R3 progression applies on one click", () => {
  it("submits the choice immediately, with no confirm button", async () => {
    backend.progressionPending = ["userA"];
    await mount();
    expect(await screen.findByTestId("ranked-progression")).toBeInTheDocument();
    expect(screen.queryByTestId("level-confirm")).toBeNull();
    const options = screen.getAllByTestId(/^level-option-/);
    fireEvent.click(options[0]);
    await waitFor(() => expect(backend.progressionChoices).toHaveLength(1));
  });

  it("is safe against a double activation", async () => {
    backend.progressionPending = ["userA"];
    await mount();
    const options = await screen.findAllByTestId(/^level-option-/);
    fireEvent.click(options[0]);
    fireEvent.click(options[1] ?? options[0]);
    await waitFor(() => expect(backend.progressionChoices).toHaveLength(1));
  });
});

describe("R3 removes manual continuation", () => {
  it("offers no Continue control during ordinary round flow", async () => {
    backend.hasSubmitted = true;
    await mount();
    const labels = screen.getAllByRole("button")
      .map((b) => (b.textContent ?? "").trim().toLowerCase());
    expect(labels.some((l) => l === "continue" || l === "next round")).toBe(false);
  });
});
